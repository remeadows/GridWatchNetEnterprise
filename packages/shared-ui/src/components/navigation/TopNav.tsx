import * as React from "react";
import { cn } from "../../utils/cn";
import { type ModuleType, moduleColors } from "../../theme";

export interface ModuleTab {
  id: ModuleType;
  label: string;
  href: string;
  icon?: React.ReactNode;
}

export interface TopNavProps {
  modules: ModuleTab[];
  activeModule: ModuleType;
  onModuleChange: (module: ModuleType) => void;
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onLogout?: () => void;
  logo?: React.ReactNode;
  /** Optional slot for additional controls (e.g., density toggle) */
  extraControls?: React.ReactNode;
}

export function TopNav({
  modules,
  activeModule,
  onModuleChange,
  user,
  onLogout,
  logo,
  extraControls,
}: TopNavProps) {
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  return (
    <header className="flex h-16 items-center justify-between border-b border-dark-700 bg-dark-900/80 backdrop-blur-sm px-4">
      <div className="flex items-center gap-8">
        {logo && <div className="flex items-center">{logo}</div>}

        <nav className="flex items-center gap-1">
          {modules.map((mod) => {
            const isActive = activeModule === mod.id;
            const colors = moduleColors[mod.id];

            return (
              <button
                key={mod.id}
                onClick={() => onModuleChange(mod.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-white shadow-[0_0_10px_rgba(0,212,255,0.3)]"
                    : "text-silver-400 hover:bg-dark-800 hover:text-primary-400",
                )}
                style={
                  isActive ? { backgroundColor: colors.primary } : undefined
                }
              >
                {mod.icon && <span className="h-4 w-4">{mod.icon}</span>}
                {mod.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Extra controls slot (e.g., density toggle) */}
        {extraControls}

        {user && (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-md p-2 hover:bg-dark-800"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-medium text-white shadow-[0_0_8px_rgba(0,212,255,0.4)]">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="hidden text-sm font-medium text-silver-300 md:block">
                {user.name}
              </span>
              <svg
                className="h-4 w-4 text-silver-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-dark-600 bg-dark-800 py-1 shadow-lg">
                <div className="border-b border-dark-600 px-4 py-2">
                  <p className="text-sm font-medium text-silver-100">
                    {user.name}
                  </p>
                  <p className="text-xs text-silver-400">{user.email}</p>
                </div>
                {onLogout && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-silver-300 hover:bg-dark-700 hover:text-error-400"
                  >
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
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Sign out
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
