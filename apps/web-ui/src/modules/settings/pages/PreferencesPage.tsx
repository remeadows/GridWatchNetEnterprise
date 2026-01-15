import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Select,
} from "@netnynja/shared-ui";
import { useThemeStore, type DisplayDensity } from "../../../stores/theme";

const densityOptions = [
  {
    value: "condensed",
    label: "Condensed - Maximum data density, minimal spacing",
  },
  { value: "compact", label: "Compact - More content, smaller text/spacing" },
  { value: "default", label: "Default - Balanced view" },
  { value: "comfortable", label: "Comfortable - Larger text, more spacing" },
];

export function PreferencesPage() {
  const { displayDensity, setDisplayDensity } = useThemeStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Preferences</h1>
        <p className="text-silver-400">
          Customize your display and interface settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Display Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-md">
            <Select
              label="Display Density"
              options={densityOptions}
              value={displayDensity}
              onChange={(e) =>
                setDisplayDensity(e.target.value as DisplayDensity)
              }
            />
            <p className="mt-2 text-xs text-silver-500">
              Controls the amount of information displayed on screen. Condensed
              provides maximum data density for power users. Compact shows more
              data with smaller fonts. Comfortable provides larger text and more
              breathing room between elements.
            </p>
          </div>

          <div className="rounded-lg border border-dark-600 bg-dark-800/50 p-4">
            <h4 className="mb-3 text-sm font-medium text-silver-300">
              Preview
            </h4>
            <div className="flex gap-4">
              <div
                className={`flex-1 rounded border border-dark-600 bg-dark-900 ${
                  displayDensity === "condensed"
                    ? "p-1 text-[10px]"
                    : displayDensity === "compact"
                      ? "p-2 text-xs"
                      : displayDensity === "comfortable"
                        ? "p-5 text-base"
                        : "p-3 text-sm"
                }`}
              >
                <div className="font-medium text-white">Sample Card Title</div>
                <div className="mt-1 text-silver-400">
                  This is sample content showing the current density setting.
                </div>
              </div>
              <div
                className={`flex-1 rounded border border-dark-600 bg-dark-900 ${
                  displayDensity === "condensed"
                    ? "p-1 text-[10px]"
                    : displayDensity === "compact"
                      ? "p-2 text-xs"
                      : displayDensity === "comfortable"
                        ? "p-5 text-base"
                        : "p-3 text-sm"
                }`}
              >
                <div className="font-medium text-white">Another Card</div>
                <div className="mt-1 text-silver-400">
                  Notice how spacing and text size change.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-silver-400">
            You can also quickly cycle through density settings using the toggle
            button in the top navigation bar. Click the density icon next to
            your profile to cycle between Condensed, Compact, Default, and
            Comfortable views.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
