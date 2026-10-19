import { useCallback, useEffect, useState } from "react";

/**
 * User-selectable theme preference. `"auto"` follows the operating
 * system's colour-scheme preference live.
 */
export type ThemePreference = "light" | "dark" | "auto";

/** Concrete theme actually applied to the UI. */
export type ResolvedTheme = "light" | "dark";

/** localStorage key persisting the user's theme preference. */
const STORAGE_KEY = "excalistack-theme";
const THEME_CHANGE_EVENT = "excalistack-theme-change";

/** Browser media query tracking the OS colour scheme. */
const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

/**
 * Reads the persisted theme preference, falling back to `"auto"`.
 * Legacy values (`"light"`/`"dark"`) remain valid.
 *
 * @returns The stored preference.
 */
function resolveStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
}

/**
 * Maps a preference to the concrete theme to apply.
 *
 * @param preference - User preference.
 * @returns The resolved theme.
 */
function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "auto") {
    return colorSchemeQuery.matches ? "dark" : "light";
  }
  return preference;
}

/**
 * Provides the theme preference, its concrete resolution, and a setter.
 *
 * The preference persists to localStorage; the resolved theme is mirrored
 * onto `<html data-theme="…">` so global stylesheet variables react to
 * it, and is what callers pass to the embedded `<Excalidraw theme>` prop.
 * While the preference is `"auto"`, OS colour-scheme changes re-resolve
 * the theme live.
 *
 * @returns A `[preference, resolved, setPreference]` triple.
 */
export function useTheme(): [
  ThemePreference,
  ResolvedTheme,
  (preference: ThemePreference) => void,
] {
  const [preference, setPreference] = useState<ThemePreference>(resolveStoredPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference));

  // Each hook instance must observe theme changes made by other components
  // (for example, the editor header switcher and the mounted canvas).
  useEffect(() => {
    const handleThemeChange = (event: Event): void => {
      const next = (event as CustomEvent<ThemePreference>).detail;
      if (next === "light" || next === "dark" || next === "auto") {
        setPreference(next);
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  // Persist the preference whenever it changes.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  // Re-resolve when the preference changes.
  useEffect(() => {
    setResolved(resolveTheme(preference));
  }, [preference]);

  // While on auto, follow live OS colour-scheme changes.
  useEffect(() => {
    if (preference !== "auto") return;

    /**
     * Re-resolves the theme when the OS colour scheme flips.
     *
     * @param event - Media query change event.
     */
    const handleChange = (event: MediaQueryListEvent): void => {
      setResolved(event.matches ? "dark" : "light");
    };
    colorSchemeQuery.addEventListener("change", handleChange);
    return () => colorSchemeQuery.removeEventListener("change", handleChange);
  }, [preference]);

  // Reflect the resolved theme on the document for global CSS.
  useEffect(() => {
    document.documentElement.dataset["theme"] = resolved;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", resolved === "dark" ? "#121212" : "#fbfbfc");
  }, [resolved]);

  const update = useCallback((next: ThemePreference): void => {
    setPreference(next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }));
  }, []);

  return [preference, resolved, update];
}
