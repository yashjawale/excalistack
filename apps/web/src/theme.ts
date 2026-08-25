import { useCallback, useEffect, useState } from "react";

/** Available UI themes, mirroring the Excalidraw editor's `theme` values. */
export type Theme = "light" | "dark";

/** localStorage key persisting the user's theme choice. */
const STORAGE_KEY = "excalistack-theme";

/**
 * Resolves the initial theme from the persisted preference, falling back
 * to the operating system's colour-scheme setting.
 *
 * @returns The theme to start with.
 */
function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Provides the active UI theme and a toggle. The choice persists to
 * localStorage and is mirrored onto `<html data-theme="…">` so global
 * stylesheet variables react to it. The same value is passed to the
 * embedded `<Excalidraw theme>` prop, keeping dashboard and canvas in
 * lockstep.
 *
 * @returns A `[theme, toggle]` pair.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback((): void => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return [theme, toggle];
}
