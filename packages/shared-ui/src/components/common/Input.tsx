import * as React from "react";
import { cn } from "../../utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, label, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-silver-300"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          className={cn(
            "flex h-10 w-full rounded-md border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-silver-100 placeholder:text-silver-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-900 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-shadow focus:shadow-[0_0_10px_rgba(0,212,255,0.3)]",
            error &&
              "border-error-500 focus:ring-error-500 focus:shadow-[0_0_10px_rgba(239,68,68,0.3)]",
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-error-400">{error}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
