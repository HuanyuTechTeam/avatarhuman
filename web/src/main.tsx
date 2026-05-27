import type {ReactElement} from "react";
import React from "react";
import ReactDOM from "react-dom/client";

export function renderApplication(element: ReactElement) {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
        <React.StrictMode>{element}</React.StrictMode>,
    );
}
