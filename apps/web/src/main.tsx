import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
// UI font, self-hosted via Fontsource (no CDN).
import "@fontsource/assistant/400.css";
import "@fontsource/assistant/500.css";
import "@fontsource/assistant/600.css";
import "./styles.css";
import "./styles/sidebar.css";
import "./styles/dashboard.css";
import "./styles/editor.css";

/**
 * Base URL under which Excalidraw's runtime assets (canvas fonts) are
 * served. The files are vendored into `public/excalidraw-assets` at this
 * path so nothing is fetched from a third-party CDN. The CJK font
 * (Xiaolai) is intentionally not vendored due to its size; it falls back
 * to the upstream CDN when needed.
 */
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

/**
 * Application bootstrap: mounts the SPA inside the root element.
 */
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
