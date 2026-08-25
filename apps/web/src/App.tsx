import { Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { EditorPage } from "./pages/EditorPage";

/**
 * Top-level application routing.
 *
 * - `/` — drawing dashboard
 * - `/d/:id` — full-screen Excalidraw editor for one drawing
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/d/:id" element={<EditorPage />} />
      <Route path="*" element={<Dashboard />} />
    </Routes>
  );
}
