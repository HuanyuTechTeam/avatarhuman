import React from "react";
import ReactDOM from "react-dom/client";
import type { ReactElement } from "react";

export function renderApplication(element: ReactElement) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{element}</React.StrictMode>,
  );
}
