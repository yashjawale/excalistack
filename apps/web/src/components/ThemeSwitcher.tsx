import type { ReactElement } from "react";
import { useTheme } from "../theme";
import type { ThemePreference } from "../theme";

/**
 * Monitor icon representing the "auto" (follow OS) preference.
 */
function MonitorIcon(): ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </svg>
  );
}

/**
 * Sun icon representing the forced-light preference.
 */
function SunIcon(): ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/**
 * Moon icon representing the forced-dark preference.
 */
function MoonIcon(): ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

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
