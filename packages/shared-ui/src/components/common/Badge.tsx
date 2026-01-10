import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary-900/50 text-primary-300 border border-primary-700/50",
        secondary: "bg-dark-700 text-silver-300 border border-dark-600",
        success:
          "bg-success-900/50 text-success-300 border border-success-700/50",
        warning:
          "bg-warning-900/50 text-warning-300 border border-warning-700/50",
        error: "bg-error-900/50 text-error-300 border border-error-700/50",
        outline: "border border-current bg-transparent",
        accent: "bg-accent-900/50 text-accent-300 border border-accent-700/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
