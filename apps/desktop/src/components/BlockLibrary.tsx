import { memo, useMemo, useState } from "react";
import type { BlockCategory, BlockDefinition } from "@pixestudio/blocks";

const ALL_CATEGORIES = "Tous";

function categoryOf(definition: BlockDefinition): BlockCategory {
  return definition.category ?? "Autres";
}

type BlockLibraryProps = {
  definitions: readonly BlockDefinition[];
  onAdd: (type: string) => void;
};

export const BlockLibrary = memo(function BlockLibrary({ definitions, onAdd }: BlockLibraryProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);

  const categories = useMemo(() => [
    ALL_CATEGORIES,
    ...Array.from(new Set(definitions.map(categoryOf)))
  ], [definitions]);

  const filteredDefinitions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return definitions.filter((definition) => {
      const matchesCategory = category === ALL_CATEGORIES || categoryOf(definition) === category;
      const searchableText = `${definition.label} ${definition.description ?? ""}`.toLocaleLowerCase();
      return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [category, definitions, query]);

  return <div className="inspector-section block-library-section">
    <div className="panel-heading library-panel-heading">
      <span>Bibliothèque</span>
      <div className="library-heading-actions">
        <span className="count-badge">{definitions.length}</span>
        <button
          type="button"
          className="library-toggle"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Réduire la bibliothèque" : "Développer la bibliothèque"}
          title={isExpanded ? "Réduire la bibliothèque" : "Développer la bibliothèque"}
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >{isExpanded ? "⌃" : "⌄"}</button>
      </div>
    </div>
    {isExpanded && <div className="block-library">
      <label className="library-search">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Rechercher un bloc"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un bloc…"
        />
      </label>
      <div className="library-categories" role="group" aria-label="Catégories de blocs">
        {categories.map((item) => <button
          key={item}
          type="button"
          aria-pressed={category === item}
          className={category === item ? "active" : ""}
          onClick={() => setCategory(item)}
        >{item}</button>)}
      </div>
      <div className="library-items">
        {filteredDefinitions.map((definition) => <button
          key={definition.type}
          type="button"
          className="library-item"
          onClick={() => onAdd(definition.type)}
        >
          <span className="library-icon">{definition.icon}</span>
          <span>
            <strong>{definition.label}</strong>
            <small>{definition.description ?? "Bloc pédagogique"}</small>
          </span>
          <span className="library-add" aria-hidden="true">＋</span>
        </button>)}
        {!filteredDefinitions.length && <p className="library-empty">Aucun bloc ne correspond à votre recherche.</p>}
      </div>
    </div>}
  </div>;
});
