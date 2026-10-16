import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getMcpStatus } from "../api";

/** Poll interval for MCP availability and recent request activity. */
const POLL_INTERVAL_MS = 1500;
const RECENT_ACTIVITY_MS = 10_000;

/** Small status indicator shared by the dashboard and editor. */
export function McpIndicator(): ReactElement | null {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getMcpStatus>>>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<void> => {
      const fresh = await getMcpStatus();
      if (!cancelled) {
        setStatus(fresh);
        setChecked(true);
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!checked || !status?.enabled) return null;

  const active = status.activeRequests > 0 || (
    status.lastRequestAt !== null && Date.now() - status.lastRequestAt < RECENT_ACTIVITY_MS
  );
  const label = active ? "MCP active" : "MCP ready";

  return (
    <span
      className={`mcp-indicator${active ? " mcp-indicator-active" : ""}`}
      title={active ? "MCP has an active or recent request" : "MCP endpoint is enabled and ready"}
      aria-label={label}
      role="status"
    >
      {label}
    </span>
  );
}
