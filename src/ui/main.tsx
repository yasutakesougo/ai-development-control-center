import React from "react";
import ReactDOM from "react-dom/client";
import {
  StatusOverlayRuntimeContainer,
  createStatusOverlayApiLoader,
} from "./StatusOverlayRuntimeContainer";
import "./styles.css";

/**
 * Overlay runtime is enabled by default against the read-only worker endpoint.
 * Set VITE_STATUS_OVERLAY_RUNTIME=false to keep legacy App-only behavior.
 */
const overlayEnabled = import.meta.env.VITE_STATUS_OVERLAY_RUNTIME !== "false";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StatusOverlayRuntimeContainer
      enabled={overlayEnabled}
      loadDocument={overlayEnabled ? createStatusOverlayApiLoader() : undefined}
    />
  </React.StrictMode>,
);
