import { useMemo } from "react";
import type { BlockDefinition } from "@pixestudio/blocks";
import type { BlockInstance } from "@pixestudio/core";
import {
  ContextMenu,
  ContextMenuAction,
  ContextMenuDivider,
  ContextMenuHeading,
  ContextMenuSection,
  type ContextMenuPosition
} from "./ContextMenu";

type AddBlockContextMenuProps = {
  position: ContextMenuPosition;
  definitions: readonly BlockDefinition[];
  onAdd: (type: string) => void;
  onClose: () => void;
};

function groupDefinitions(definitions: readonly BlockDefinition[]) {
  const groups = new Map<string, BlockDefinition[]>();
  definitions.forEach((definition) => {
    const category = definition.category ?? "Autres";
    const group = groups.get(category) ?? [];
    group.push(definition);
    groups.set(category, group);
  });
  return Array.from(groups);
}

export function AddBlockContextMenu({ position, definitions, onAdd, onClose }: AddBlockContextMenuProps) {
  const groups = useMemo(() => groupDefinitions(definitions), [definitions]);
  return <ContextMenu position={position} onClose={onClose} label="Ajouter un bloc">
    <ContextMenuHeading>Ajouter un bloc</ContextMenuHeading>
    {groups.map(([category, items], index) => <ContextMenuSection key={category}>
      {index > 0 && <ContextMenuDivider />}
      <div className="context-menu-category">{category}</div>
      {items.map((definition) => <ContextMenuAction
        key={definition.type}
        icon={definition.icon}
        label={definition.label}
        onSelect={() => { onClose(); onAdd(definition.type); }}
      />)}
    </ContextMenuSection>)}
  </ContextMenu>;
}

type BlockContextMenuProps = {
  position: ContextMenuPosition;
  block: BlockInstance;
  definitions: readonly BlockDefinition[];
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function BlockContextMenu({ position, block, definitions, onDuplicate, onDelete, onClose }: BlockContextMenuProps) {
  const definition = definitions.find((candidate) => candidate.type === block.type);
  return <ContextMenu position={position} onClose={onClose} label={`Actions pour ${definition?.label ?? "le bloc"}`}>
    <ContextMenuHeading>{definition?.label ?? "Bloc"}</ContextMenuHeading>
    <ContextMenuSection>
      <ContextMenuAction icon="⧉" label="Dupliquer le bloc" shortcut="Ctrl+D" onSelect={() => { onClose(); onDuplicate(); }} />
      <ContextMenuDivider />
      <ContextMenuAction icon="×" label="Supprimer le bloc" shortcut="Suppr" danger onSelect={() => { onClose(); onDelete(); }} />
    </ContextMenuSection>
  </ContextMenu>;
}
