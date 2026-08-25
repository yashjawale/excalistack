import { Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { EditorPage } from "./pages/EditorPage";
import { useTheme } from "./theme";

/**
 * Top-level application routing.
 *
 * - `/` — drawing dashboard
 * - `/d/:id` — full-screen Excalidraw editor for one drawing
 *
 * Also activates the shared light/dark theme so stylesheet variables are
 * applied on every page.
 */
export function App() {
  useTheme();
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/d/:id" element={<EditorPage />} />
      <Route path="*" element={<Dashboard />} />
    </Routes>
  );
}
