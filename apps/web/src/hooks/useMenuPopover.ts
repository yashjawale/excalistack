import { useEffect, useLayoutEffect, useRef, useState } from "react";

const POPOVER_GAP_PX = 6;
const VIEWPORT_PADDING_PX = 8;

export type MenuView = "actions" | "move";

/** Shared positioning and dismissal behavior for fixed-position action menus. */
export function useMenuPopover(openRequest?: number) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("actions");
  const [popoverStyle, setPopoverStyle] = useState<{
    top: number;
    left: number;
    visibility: "hidden" | "visible";
  }>({ top: 0, left: 0, visibility: "hidden" });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setView("actions");
  }, [open]);

  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const popover = popoverRef.current?.getBoundingClientRect();
    if (!trigger || !popover) return;
    const belowTop = trigger.bottom + POPOVER_GAP_PX;
    const fitsBelow = belowTop + popover.height <= window.innerHeight - VIEWPORT_PADDING_PX;
    const top = fitsBelow ? belowTop : trigger.top - popover.height - POPOVER_GAP_PX;
    const left = Math.max(
      VIEWPORT_PADDING_PX,
      Math.min(trigger.right - popover.width, window.innerWidth - popover.width - VIEWPORT_PADDING_PX),
    );
    setPopoverStyle({ top, left, visibility: "visible" });
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const handleScroll = (): void => setOpen(false);
    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return { open, setOpen, view, setView, popoverStyle, rootRef, triggerRef, popoverRef };
}
