import { useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatsCard,
  Badge,
  BarChart,
  PieChart,
} from "@gridwatch/shared-ui";
import { useSTIGStore } from "../../../stores/stig";

export function STIGCompliancePage() {
  const { targets, fetchTargets, fetchComplianceSummary } = useSTIGStore();

  useEffect(() => {
    fetchTargets();
    fetchComplianceSummary();
  }, [fetchTargets, fetchComplianceSummary]);

  // Sample compliance data
  const complianceByPlatform = [
    { platform: "Linux", passed: 245, failed: 32 },
    { platform: "Windows", passed: 189, failed: 45 },
    { platform: "Cisco IOS", passed: 78, failed: 12 },
    { platform: "Network", passed: 56, failed: 8 },
  ];

  const severityBreakdown = [
    { name: "High", value: 15, color: "#ef4444" },
    { name: "Medium", value: 42, color: "#f59e0b" },
    { name: "Low", value: 28, color: "#3b82f6" },
  ];

  const totalPassed = complianceByPlatform.reduce(
    (acc, p) => acc + p.passed,
    0,
  );
  const totalFailed = complianceByPlatform.reduce(
    (acc, p) => acc + p.failed,
    0,
  );
  const complianceScore = Math.round(
    (totalPassed / (totalPassed + totalFailed)) * 100,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Compliance Overview
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          STIG compliance status across all assets
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Overall Compliance"
          value={`${complianceScore}%`}
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Checks Passed"
          value={totalPassed}
          trend={{ value: 3, isPositive: true }}
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          }
        />
        <StatsCard
          title="Checks Failed"
          value={totalFailed}
          trend={{ value: 8, isPositive: false }}
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          }
        />
        <StatsCard
          title="Assets Audited"
          value={targets.length || 15}
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
              />
            </svg>
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compliance by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={complianceByPlatform}
              series={[
                {
                  dataKey: "passed",
                  name: "Passed",
                  color: "#22c55e",
                  stackId: "a",
                },
                {
                  dataKey: "failed",
                  name: "Failed",
                  color: "#ef4444",
                  stackId: "a",
                },
              ]}
              xAxisKey="platform"
              height={300}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failed Checks by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChart
              data={severityBreakdown}
              height={300}
              innerRadius={60}
              outerRadius={90}
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Critical Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                id: "V-12345",
                title: "SSH Protocol Version Must Be Set to 2",
                severity: "high",
                affectedAssets: 3,
              },
              {
                id: "V-23456",
                title: "Password Minimum Length Must Be 14 Characters",
                severity: "high",
                affectedAssets: 5,
              },
              {
                id: "V-34567",
                title: "Audit Log Must Be Enabled",
                severity: "medium",
                affectedAssets: 2,
              },
              {
                id: "V-45678",
                title: "SNMP Community String Must Not Be Default",
                severity: "high",
                affectedAssets: 4,
              },
            ].map((finding) => (
              <div
                key={finding.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
              >
                <div className="flex items-center gap-4">
                  <Badge
                    variant={finding.severity === "high" ? "error" : "warning"}
                  >
                    {finding.severity.toUpperCase()}
                  </Badge>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {finding.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {finding.id}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {finding.affectedAssets}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    affected assets
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
