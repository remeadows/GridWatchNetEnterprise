"""Alert evaluation service for NPM."""

import asyncio
from datetime import datetime, timezone
from typing import Any

from ..core.config import settings
from ..core.logging import get_logger, configure_logging
from ..db import init_db, close_db, get_db, AlertRepository, AlertRuleRepository, DeviceRepository
from ..models.alert import AlertCreate, AlertStatus, AlertSeverity, ConditionType, AlertRule
from .metrics import MetricsService

logger = get_logger(__name__)


class AlertEvaluator:
    """Service for evaluating alert rules against current metrics."""

    def __init__(self) -> None:
        self.metrics_service = MetricsService()
        self._running = False
        self._eval_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the alert evaluation loop."""
        self._running = True
        logger.info("alert_evaluator_starting")
        self._eval_task = asyncio.create_task(self._evaluation_loop())

    async def stop(self) -> None:
        """Stop the alert evaluation loop."""
        self._running = False
        if self._eval_task:
            self._eval_task.cancel()
            try:
                await self._eval_task
            except asyncio.CancelledError:
                pass
        await self.metrics_service.close()
        logger.info("alert_evaluator_stopped")

    async def _evaluation_loop(self) -> None:
        """Main evaluation loop."""
        while self._running:
            try:
                await self._evaluate_all_rules()
            except Exception as e:
                logger.error("evaluation_loop_error", error=str(e))

            # Wait for next evaluation interval
            await asyncio.sleep(settings.alert_evaluation_interval)

    async def _evaluate_all_rules(self) -> None:
        """Evaluate all active alert rules."""
        async with get_db() as conn:
            rule_repo = AlertRuleRepository(conn)
            rules = await rule_repo.find_all(is_active=True)

        logger.debug("evaluating_rules", count=len(rules))

        for rule in rules:
            try:
                await self._evaluate_rule(rule)
            except Exception as e:
                logger.error("rule_evaluation_failed", rule_id=rule.id, error=str(e))

    async def _evaluate_rule(self, rule: AlertRule) -> None:
        """Evaluate a single alert rule."""
        # Query current metric values from VictoriaMetrics
        metric_query = self._build_metric_query(rule.metric_type)
        results = await self.metrics_service.query_instant(metric_query)

        for result in results:
            metric = result.get("metric", {})
            value_tuple = result.get("value", [0, 0])
            current_value = float(value_tuple[1]) if len(value_tuple) > 1 else 0

            device_id = metric.get("device_id")
            interface_id = metric.get("interface_id")

            # Check if condition is met
            condition_met = self._check_condition(
                current_value, rule.condition, rule.threshold
            )

            if condition_met:
                await self._create_or_update_alert(
                    rule=rule,
                    device_id=device_id,
                    interface_id=interface_id,
                    current_value=current_value,
                )
            else:
                # Check if there's an existing alert to resolve
                await self._maybe_resolve_alert(
                    rule=rule,
                    device_id=device_id,
                    interface_id=interface_id,
                )

    def _build_metric_query(self, metric_type: str) -> str:
        """Build VictoriaMetrics query for a metric type."""
        metric_queries = {
            "cpu_utilization": "npm_device_cpu_utilization",
            "memory_utilization": "npm_device_memory_utilization",
            "interface_utilization": "max(npm_interface_in_utilization, npm_interface_out_utilization)",
            "interface_errors": "npm_interface_in_errors + npm_interface_out_errors",
            "availability": "npm_device_uptime_seconds > 0",
        }
        return metric_queries.get(metric_type, metric_type)

    def _check_condition(
        self,
        value: float,
        condition: ConditionType,
        threshold: float,
    ) -> bool:
        """Check if a condition is met."""
        if condition == ConditionType.GREATER_THAN:
            return value > threshold
        elif condition == ConditionType.LESS_THAN:
            return value < threshold
        elif condition == ConditionType.EQUAL:
            return value == threshold
        elif condition == ConditionType.NOT_EQUAL:
            return value != threshold
        elif condition == ConditionType.GREATER_EQUAL:
            return value >= threshold
        elif condition == ConditionType.LESS_EQUAL:
            return value <= threshold
        return False

    async def _create_or_update_alert(
        self,
        rule: AlertRule,
        device_id: str | None,
        interface_id: str | None,
        current_value: float,
    ) -> None:
        """Create a new alert or update existing one."""
        async with get_db() as conn:
            alert_repo = AlertRepository(conn)

            # Check if alert already exists for this rule+device+interface
            existing_alerts, _ = await alert_repo.find_all(
                page=1,
                limit=1,
                status=AlertStatus.ACTIVE,
                device_id=device_id,
            )

            # Filter to matching rule
            matching = [a for a in existing_alerts if a.rule_id == rule.id]

            if not matching:
                # Create new alert
                message = self._build_alert_message(rule, current_value)

                alert_data = AlertCreate(
                    rule_id=rule.id,
                    device_id=device_id,
                    interface_id=interface_id,
                    message=message,
                    severity=rule.severity,
                    details={
                        "metric_type": rule.metric_type,
                        "condition": rule.condition.value,
                        "threshold": rule.threshold,
                        "current_value": current_value,
                    },
                )

                await alert_repo.create(alert_data)
                logger.info(
                    "alert_created",
                    rule_id=rule.id,
                    device_id=device_id,
                    severity=rule.severity.value,
                )

    async def _maybe_resolve_alert(
        self,
        rule: AlertRule,
        device_id: str | None,
        interface_id: str | None,
    ) -> None:
        """Resolve alert if condition is no longer met."""
        async with get_db() as conn:
            alert_repo = AlertRepository(conn)

            # Find active alerts for this rule+device
            existing_alerts, _ = await alert_repo.find_all(
                page=1,
                limit=100,
                status=AlertStatus.ACTIVE,
                device_id=device_id,
            )

            for alert in existing_alerts:
                if alert.rule_id == rule.id:
                    await alert_repo.update_status(alert.id, AlertStatus.RESOLVED)
                    logger.info("alert_auto_resolved", alert_id=alert.id, rule_id=rule.id)

    def _build_alert_message(self, rule: AlertRule, current_value: float) -> str:
        """Build a human-readable alert message."""
        condition_text = {
            ConditionType.GREATER_THAN: "exceeded",
            ConditionType.LESS_THAN: "fell below",
            ConditionType.EQUAL: "equals",
            ConditionType.NOT_EQUAL: "is not equal to",
            ConditionType.GREATER_EQUAL: "is at or above",
            ConditionType.LESS_EQUAL: "is at or below",
        }

        return (
            f"{rule.name}: {rule.metric_type} {condition_text.get(rule.condition, 'is')} "
            f"threshold ({current_value:.2f} vs {rule.threshold})"
        )


async def main() -> None:
    """Main entry point for running the alert service as a standalone."""
    configure_logging()
    logger.info("starting_alert_service")

    await init_db()

    evaluator = AlertEvaluator()
    await evaluator.start()

    try:
        # Keep running until interrupted
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("shutting_down_alert_service")
    finally:
        await evaluator.stop()
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
