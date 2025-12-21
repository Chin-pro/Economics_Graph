import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppView from "./app/AppView";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppView />
  </StrictMode>
);
