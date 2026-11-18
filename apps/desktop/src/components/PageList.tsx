import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { CourseDocument } from "@pixestudio/core";

type Page = CourseDocument["pages"][number];

type PageListProps = {
  pages: readonly Page[];
  currentPageId: string | null;
  onSelect: (pageId: string) => void;
  onRename: (pageId: string, title: string) => void;
  onMove: (pageId: string, targetIndex: number) => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, pageId: string) => void;
};

type PageDragState = {
  pageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  targetPageId: string | null;
};

export function PageList({ pages, currentPageId, onSelect, onRename, onMove, onContextMenu }: PageListProps) {
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dragOverPageId, setDragOverPageId] = useState<string | null>(null);
  const dragStateRef = useRef<PageDragState | null>(null);
  const suppressClickRef = useRef(false);

  const beginRename = (page: Page) => {
    setEditingPageId(page.id);
    setDraftTitle(page.title);
  };

  const commitRename = (page: Page) => {
    const nextTitle = draftTitle.trim();
    if (nextTitle && nextTitle !== page.title) onRename(page.id, nextTitle);
    setEditingPageId(null);
  };

  const cancelRename = () => setEditingPageId(null);

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>, page: Page) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(page);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  const findPageAtPoint = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    return element?.closest<HTMLElement>("[data-page-id]")?.dataset.pageId ?? null;
  };

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resetDrag = (event: PointerEvent<HTMLDivElement>) => {
    releasePointer(event);
    dragStateRef.current = null;
    setDraggedPageId(null);
    setDragOverPageId(null);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, pageId: string, isEditing: boolean) => {
    if (isEditing || event.button !== 0 || (event.target as HTMLElement).closest(".page-edit-button,input")) return;
    dragStateRef.current = {
      pageId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      targetPageId: pageId,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.active && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 6) return;

    if (!state.active) event.currentTarget.setPointerCapture(event.pointerId);
    const targetPageId = findPageAtPoint(event.clientX, event.clientY) ?? state.targetPageId;
    dragStateRef.current = { ...state, active: true, targetPageId };
    setDraggedPageId(state.pageId);
    setDragOverPageId(targetPageId);
    event.preventDefault();
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    if (state.active) {
      event.preventDefault();
      const targetPageId = findPageAtPoint(event.clientX, event.clientY) ?? state.targetPageId;
      const targetIndex = targetPageId ? pages.findIndex((page) => page.id === targetPageId) : -1;
      if (targetIndex >= 0 && targetPageId !== state.pageId) onMove(state.pageId, targetIndex);
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }

    resetDrag(event);
  };

  const handlePageClick = (event: MouseEvent<HTMLButtonElement>, pageId: string) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      return;
    }
    onSelect(pageId);
  };

  return <div className={`page-list ${draggedPageId ? "is-dragging" : ""}`}>
    {pages.map((page, index) => {
      const isEditing = editingPageId === page.id;
      const isSelected = page.id === currentPageId;
      return <div
        key={page.id}
        data-page-id={page.id}
        className={`page-row ${isSelected ? "selected" : ""} ${draggedPageId === page.id ? "dragging" : ""} ${dragOverPageId === page.id ? "drag-over" : ""}`}
        onPointerDown={(event) => handlePointerDown(event, page.id, isEditing)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={resetDrag}
        onContextMenu={(event) => onContextMenu(event, page.id)}
      >
        {isEditing ? <input
          className="page-name-input"
          aria-label="Nom de la page"
          value={draftTitle}
          autoFocus
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => commitRename(page)}
          onKeyDown={(event) => handleRenameKeyDown(event, page)}
        /> : <button
          type="button"
          className="page-item"
          aria-current={isSelected ? "page" : undefined}
          onClick={(event) => handlePageClick(event, page.id)}
          onDoubleClick={() => beginRename(page)}
          title="Double-cliquez pour renommer"
        >
          <span className="page-number">{String(index + 1).padStart(2, "0")}</span>
          <span className="page-label">{page.title}</span>
          <span className="page-block-count">{page.blocks.length}</span>
        </button>}
        <div className="page-row-actions">
          <button type="button" className="page-edit-button" aria-label={`Renommer ${page.title}`} title="Renommer" onClick={() => beginRename(page)}>✎</button>
        </div>
      </div>;
    })}
  </div>;
}
