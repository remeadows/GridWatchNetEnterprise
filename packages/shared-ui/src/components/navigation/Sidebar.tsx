import * as React from "react";
import { cn } from "../../utils/cn";
import { type ModuleType, moduleColors } from "../../theme";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string | number;
  children?: NavItem[];
}

export interface SidebarProps {
  module: ModuleType;
  items: NavItem[];
  currentPath: string;
  onNavigate: (href: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Optional background image URL for the sidebar */
  backgroundImage?: string;
}

export function Sidebar({
  module,
  items,
  currentPath,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  header,
  footer,
  className,
  backgroundImage,
}: SidebarProps) {
  const colors = moduleColors[module];

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-dark-700 bg-dark-900/80 backdrop-blur-sm transition-all overflow-hidden",
        collapsed ? "w-16" : "w-64",
        className,
      )}
    >
      {/* Optional faded background image */}
      {backgroundImage && (
        <>
          <div
            className="absolute inset-0 bg-contain bg-center bg-no-repeat opacity-[0.04]"
            style={{ backgroundImage: `url(${backgroundImage})` }}
          />
        </>
      )}
      {(header || onToggleCollapse) && (
        <div className="relative z-10 flex h-16 items-center justify-between border-b border-dark-700 px-4">
          {header}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className={cn(
                "rounded-md p-1.5 text-silver-400 hover:bg-dark-800 hover:text-primary-400",
                collapsed && "mx-auto"
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                className={cn(
                  "h-5 w-5 transition-transform",
                  collapsed && "rotate-180",
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      <nav className="relative z-10 flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {items.map((item) => {
          const isActive =
            currentPath === item.href ||
            currentPath.startsWith(item.href + "/");

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-white shadow-[0_0_10px_rgba(0,212,255,0.3)]"
                  : "text-silver-300 hover:bg-dark-800 hover:text-primary-400",
              )}
              style={isActive ? { backgroundColor: colors.primary } : undefined}
            >
              {item.icon && (
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  {item.icon}
                </span>
              )}
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-dark-700 text-silver-300",
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {footer && (
        <div className="relative z-10 border-t border-dark-700 p-4">
          {footer}
        </div>
      )}
    </aside>
  );
}
