import * as React from "react";
import { cn } from "../../utils/cn";

export type StatusType = "success" | "warning" | "error" | "info" | "neutral";

export interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  pulse?: boolean;
  size?: "sm" | "md" | "lg";
}

const statusColors: Record<StatusType, string> = {
  success: "bg-success-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]",
  warning: "bg-warning-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]",
  error: "bg-error-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
  info: "bg-primary-500 shadow-[0_0_8px_rgba(0,212,255,0.5)]",
  neutral: "bg-silver-500",
};

const statusTextColors: Record<StatusType, string> = {
  success: "text-success-400",
  warning: "text-warning-400",
  error: "text-error-400",
  info: "text-primary-400",
  neutral: "text-silver-300",
};

const sizeClasses = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-4 w-4",
};

export function StatusIndicator({
  status,
  label,
  pulse = false,
  size = "md",
}: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              statusColors[status],
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            sizeClasses[size],
            statusColors[status],
          )}
        />
      </span>
      {label && (
        <span className={cn("text-sm font-medium", statusTextColors[status])}>
          {label}
        </span>
      )}
    </div>
  );
}
