import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type ContextMenuPosition = { x: number; y: number };

type ContextMenuProps = {
  position: ContextMenuPosition;
  onClose: () => void;
  label: string;
  children: ReactNode;
};

type ContextMenuActionProps = {
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function ContextMenu({ position, onClose, label, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [safePosition, setSafePosition] = useState(position);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 8;
    const bounds = menu.getBoundingClientRect();
    setSafePosition({
      x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - bounds.width - margin)),
      y: Math.min(Math.max(margin, position.y), Math.max(margin, window.innerHeight - bounds.height - margin))
    });
  }, [position]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    menuRef.current?.focus();
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [onClose]);

  return <div
    ref={menuRef}
    className="context-menu"
    role="menu"
    aria-label={label}
    tabIndex={-1}
    style={{ left: safePosition.x, top: safePosition.y }}
    onContextMenu={(event) => event.preventDefault()}
  >{children}</div>;
}

export function ContextMenuHeading({ children }: { children: ReactNode }) {
  return <div className="context-menu-heading">{children}</div>;
}

export function ContextMenuSection({ children }: { children: ReactNode }) {
  return <div className="context-menu-section">{children}</div>;
}

export function ContextMenuAction({ label, icon, shortcut, danger, disabled, onSelect }: ContextMenuActionProps) {
  return <button
    type="button"
    className={`context-menu-action ${danger ? "danger" : ""}`}
    role="menuitem"
    disabled={disabled}
    onClick={onSelect}
  >
    {icon && <span className="context-menu-icon" aria-hidden="true">{icon}</span>}
    <span className="context-menu-label">{label}</span>
    {shortcut && <kbd>{shortcut}</kbd>}
  </button>;
}

export function ContextMenuDivider() {
  return <div className="context-menu-divider" role="separator" />;
}
