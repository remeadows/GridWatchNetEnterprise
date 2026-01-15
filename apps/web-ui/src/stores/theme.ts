import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ModuleType } from "@netnynja/shared-ui";

export type DisplayDensity =
  | "condensed"
  | "compact"
  | "default"
  | "comfortable";

interface ThemeState {
  isDark: boolean;
  activeModule: ModuleType;
  sidebarCollapsed: boolean;
  displayDensity: DisplayDensity;
  toggleTheme: () => void;
  setActiveModule: (module: ModuleType) => void;
  toggleSidebar: () => void;
  setDisplayDensity: (density: DisplayDensity) => void;
  cycleDensity: () => void;
}

const densityOrder: DisplayDensity[] = [
  "condensed",
  "compact",
  "default",
  "comfortable",
];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: false,
      activeModule: "ipam",
      sidebarCollapsed: false,
      displayDensity: "default",

      toggleTheme: () => {
        set((state) => ({ isDark: !state.isDark }));
      },

      setActiveModule: (module: ModuleType) => {
        set({ activeModule: module });
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setDisplayDensity: (density: DisplayDensity) => {
        set({ displayDensity: density });
      },

      cycleDensity: () => {
        set((state) => {
          const currentIndex = densityOrder.indexOf(state.displayDensity);
          const nextIndex = (currentIndex + 1) % densityOrder.length;
          return { displayDensity: densityOrder[nextIndex] };
        });
      },
    }),
    {
      name: "netnynja-theme",
    },
  ),
);
