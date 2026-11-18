# Sécurité et limites de confiance

## Principes

- Les fichiers `.pixe`, leur JSON et leurs médias sont traités comme des entrées non fiables.
- L’application reste hors ligne : le CSP interdit les images distantes et les blocs image acceptent seulement des assets empaquetés ou des images intégrées PNG/JPEG/GIF/WebP.
- Les archives ZIP sont limitées à 50 Mo compressés, 512 entrées, 50 Mo par entrée et 100 Mo décompressés. Les chemins absolus, `..`, doublons et entrées chiffrées sont refusés avant décompression.
- Les commandes Rust vérifient l’extension `.pixe`, la taille, le type de fichier et écrivent avec un fichier temporaire créé exclusivement pour l’opération.
- Le document et les blocs sont validés par des schémas stricts avant sauvegarde et après ouverture.

## Frontières modulaires

`packages/core` ne connaît ni React ni Tauri. `packages/project-format` ne fait que valider et sérialiser le conteneur. `packages/blocks` possède ses propres types, renderers, définitions et registre. `apps/desktop` orchestre l’interface et `src-tauri` limite l’accès natif aux opérations de fichiers nécessaires.

Cette séparation permet de tester les contrôles de sécurité sans lancer WebView2 et d’ajouter un bloc sans modifier le cœur ou les commandes Rust.

## À maintenir lors des évolutions

Toute nouvelle source externe doit être explicitement ajoutée au modèle de menace et au CSP. Toute nouvelle commande Tauri doit avoir une validation de chemin et de taille côté Rust. Tout nouveau bloc doit fournir sa validation, sa migration, ses renderers et ses tests.
