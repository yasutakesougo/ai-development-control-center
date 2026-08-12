/**
 * Thin STATUS-OVERLAY runtime container.
 *
 * Loads a StatusOverlayDocument through an injectable read-only loader and
 * passes it into App. Observer/network logic stays outside StatusOverlayPanel.
 */

import { useEffect, useState, type ReactNode } from "react";
import type { StatusOverlayDocument } from "../domain/statusOverlayContract";
import type { StatusOverlayRuntimePhase } from "../runtime/statusOverlayRuntime";
import { App } from "./App";

export interface StatusOverlayRuntimeContainerProps {
  /** When false/undefined, App runs without overlay (existing behavior). */
  enabled?: boolean;
  /**
   * Injectable loader (tests / production fetch of /api/status-overlay).
   * Must not perform GitHub mutation.
   */
  loadDocument?: () => Promise<StatusOverlayDocument>;
  /** Optional App children override for tests. */
  renderApp?: (props: {
    statusOverlay: StatusOverlayDocument | null;
    statusOverlayPhase: StatusOverlayRuntimePhase;
    statusOverlayUnavailableReason: string | null;
  }) => ReactNode;
}

export function StatusOverlayRuntimeContainer({
  enabled = false,
  loadDocument,
  renderApp,
}: StatusOverlayRuntimeContainerProps) {
  const [phase, setPhase] = useState<StatusOverlayRuntimePhase>(
    enabled ? "loading" : "disabled",
  );
  const [document, setDocument] = useState<StatusOverlayDocument | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPhase("disabled");
      setDocument(null);
      setReason(null);
      return;
    }
    if (!loadDocument) {
      setPhase("unavailable");
      setDocument(null);
      setReason("STATUS-OVERLAY runtime enabled but no loadDocument was configured");
      return;
    }

    let cancelled = false;
    setPhase("loading");
    setReason(null);

    void (async () => {
      try {
        const next = await loadDocument();
        if (cancelled) return;
        setDocument(next);
        setPhase("ready");
        setReason(null);
      } catch (error) {
        if (cancelled) return;
        setDocument(null);
        setPhase("unavailable");
        setReason(
          error instanceof Error
            ? error.message
            : "STATUS-OVERLAY runtime load failed",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, loadDocument]);

  if (renderApp) {
    return (
      <>
        {renderApp({
          statusOverlay: document,
          statusOverlayPhase: phase,
          statusOverlayUnavailableReason: reason,
        })}
      </>
    );
  }

  return (
    <App
      statusOverlay={document}
      statusOverlayPhase={phase}
      statusOverlayUnavailableReason={reason}
    />
  );
}

/** Browser loader for the read-only worker endpoint. */
export function createStatusOverlayApiLoader(
  endpoint = "/api/status-overlay",
): () => Promise<StatusOverlayDocument> {
  return async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.status === 404) {
      throw new Error("STATUS-OVERLAY runtime endpoint unavailable");
    }
    if (!response.ok) {
      throw new Error(`STATUS-OVERLAY runtime request failed: ${response.status}`);
    }
    return (await response.json()) as StatusOverlayDocument;
  };
}
