import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
// Registered app-wide so Excalidraw's fonts (Assistant, Excalifont) are
// available to our own chrome as well as the canvas component.
import "@excalidraw/excalidraw/index.css";
import "./styles.css";

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
