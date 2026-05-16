import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./styles/globals.css";

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
