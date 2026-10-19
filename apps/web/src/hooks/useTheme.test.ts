import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
    }
    meta.content = "#fbfbfc";
  });

  it("updates the browser theme color with the resolved theme", () => {
    const { result } = renderHook(() => useTheme());
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    act(() => result.current[2]("dark"));
    expect(meta?.content).toBe("#121212");

    act(() => result.current[2]("light"));
    expect(meta?.content).toBe("#fbfbfc");
  });
});
