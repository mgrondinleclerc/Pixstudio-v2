# Architecture

## Frontières

```text
apps/desktop/                 Interface React/Vite
packages/core/                Types, validation, commandes, historique, migrations, runtime
packages/blocks/              Registre et renderers des blocs
packages/project-format/      Archive .pixe et validation du conteneur
src-tauri/                    Fenêtre Windows et accès fichier natif
tests/                        Parcours Playwright
```

`packages/core` ne dépend ni de React, ni du DOM, ni de Tauri. Il reçoit des documents et retourne des documents. L’interface utilise Zustand comme adaptateur d’état, mais toutes les modifications passent par des commandes explicites du cœur.

## Flux d’un document

```text
CourseDocument
  → migration et validation
  → commandes / historique
  → compilation vers RuntimeDocument
  → aperçu actuel
  → export HTML / SCORM (à venir)
```

Le modèle utilise des UUID générés par `crypto.randomUUID()`. Aucun identifiant n’est dérivé de `Math.random()`.

Le package `blocks` sépare désormais les types, les renderers, les définitions de blocs et le registre. Un nouveau type de bloc peut donc être ajouté dans `packages/blocks/src/definitions/` avec ses schémas, migrations et tests, sans toucher au cœur métier ni au shell Rust.

## Fenêtre et hors ligne

Tauri ouvre une fenêtre native Windows et utilise WebView2. En production, Vite ne sert aucun contenu : les assets compilés sont chargés directement par Tauri. Le développement utilise le serveur Vite uniquement comme outil de développement, pas comme une dépendance runtime.

Les commandes Rust `save_project` et `load_project` sont volontairement petites. La sélection de fichier est fournie par le plugin de dialogue Tauri ; la validation du contenu reste en TypeScript pour être partagée par l’éditeur et les tests.

## État et récupération

`HistoryManager` conserve une pile de commandes avec leurs opérations `execute` et `undo`, ainsi qu’une pile redo. L’interface conserve aussi une copie locale de récupération dans `localStorage` après une courte temporisation. La prochaine étape pourra proposer une restauration explicite sur l’écran d’accueil.
