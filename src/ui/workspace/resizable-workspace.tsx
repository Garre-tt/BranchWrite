"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";

export const MIN_DRAFT_SHARE = 58;
export const MAX_DRAFT_SHARE = 78;
export const DEFAULT_DRAFT_SHARE = 64;

export function clampDraftShare(value: number): number {
  return Math.min(MAX_DRAFT_SHARE, Math.max(MIN_DRAFT_SHARE, value));
}

export function draftShareFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
): number {
  if (containerWidth <= 0) {
    return DEFAULT_DRAFT_SHARE;
  }

  return clampDraftShare(
    Math.round(((clientX - containerLeft) / containerWidth) * 100),
  );
}

export function draftShareFromKey(current: number, key: string): number | null {
  switch (key) {
    case "ArrowLeft":
      return clampDraftShare(current - 2);
    case "ArrowRight":
      return clampDraftShare(current + 2);
    case "PageDown":
      return clampDraftShare(current - 10);
    case "PageUp":
      return clampDraftShare(current + 10);
    case "Home":
      return MIN_DRAFT_SHARE;
    case "End":
      return MAX_DRAFT_SHARE;
    default:
      return null;
  }
}

type ResizableWorkspaceProps = {
  primary: ReactNode;
  secondary: ReactNode;
};

export function ResizableWorkspace({
  primary,
  secondary,
}: ResizableWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draftShare, setDraftShare] = useState(DEFAULT_DRAFT_SHARE);
  const [dragging, setDragging] = useState(false);

  function updateFromPointer(clientX: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setDraftShare(draftShareFromPointer(clientX, bounds.left, bounds.width));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateFromPointer(event.clientX);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    updateFromPointer(event.clientX);
  }

  function finishPointerDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nextShare = draftShareFromKey(draftShare, event.key);
    if (nextShare === null) {
      return;
    }

    event.preventDefault();
    setDraftShare(nextShare);
  }

  return (
    <div
      ref={containerRef}
      className={dragging ? "workspace-grid resizing" : "workspace-grid"}
      style={
        {
          "--draft-share": `${draftShare}%`,
        } as CSSProperties
      }
    >
      {primary}
      <div
        className="workspace-divider"
        role="separator"
        aria-label="Resize My Draft and Proposal Workspace"
        aria-orientation="vertical"
        aria-valuemin={MIN_DRAFT_SHARE}
        aria-valuemax={MAX_DRAFT_SHARE}
        aria-valuenow={draftShare}
        aria-valuetext={`My Draft ${draftShare} percent`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onKeyDown={handleKeyDown}
      >
        <span aria-hidden="true" />
      </div>
      {secondary}
    </div>
  );
}
