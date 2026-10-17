import type { ReactElement } from "react";
import { useTheme } from "../hooks/useTheme";
import type { ThemePreference } from "../hooks/useTheme";
import { MonitorIcon, MoonIcon, SunIcon } from "./Icons";

/** Segmented-control options in display order. */
const OPTIONS: { value: ThemePreference; label: string; icon: ReactElement }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "auto", label: "Auto (system)", icon: <MonitorIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

/**
 * Three-way segmented control for the UI theme: light, auto (follows the
 * OS preference live), and dark.
 */
export function ThemeSwitcher(): ReactElement {
  const [preference, , setPreference] = useTheme();

  return (
    <div className="theme-switch" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          aria-label={option.label}
          title={option.label}
          className={`theme-seg${preference === option.value ? " active" : ""}`}
          onClick={() => setPreference(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
