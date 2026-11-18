import {
  ContextMenu,
  ContextMenuAction,
  ContextMenuHeading,
  ContextMenuSection,
  type ContextMenuPosition
} from "./ContextMenu";

type PageContextMenuProps = {
  position: ContextMenuPosition;
  pageTitle: string;
  canDelete: boolean;
  onDelete: () => void;
  onClose: () => void;
};

export function PageContextMenu({ position, pageTitle, canDelete, onDelete, onClose }: PageContextMenuProps) {
  return <ContextMenu position={position} onClose={onClose} label={`Actions pour ${pageTitle}`}>
    <ContextMenuHeading>{pageTitle}</ContextMenuHeading>
    <ContextMenuSection>
      <ContextMenuAction
        icon="×"
        label="Supprimer la page"
        danger
        disabled={!canDelete}
        onSelect={() => {
          if (!canDelete) return;
          onClose();
          onDelete();
        }}
      />
    </ContextMenuSection>
  </ContextMenu>;
}
