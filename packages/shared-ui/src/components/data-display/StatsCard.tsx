import * as React from "react";
import { cn } from "../../utils/cn";

export interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  loading?: boolean;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  loading = false,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dark-700 bg-dark-800/80 p-6 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-silver-400">{title}</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-dark-700" />
          ) : (
            <p className="mt-2 text-3xl font-semibold text-silver-100">
              {value}
            </p>
          )}
          {subtitle && (
            <p className="mt-1 text-sm text-silver-400">{subtitle}</p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              <span
                className={cn(
                  "flex items-center text-sm font-medium",
                  trend.isPositive ? "text-success-400" : "text-error-400",
                )}
              >
                {trend.isPositive ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                )}
                {Math.abs(trend.value)}%
              </span>
              <span className="text-sm text-silver-500">from last period</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary-900/50 text-primary-400 shadow-[0_0_10px_rgba(0,212,255,0.2)]">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
