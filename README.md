# PixeStudio

PixeStudio est un éditeur Windows hors ligne de contenus pédagogiques interactifs. Cette première base utilise TypeScript, React, Vite et Tauri 2. Le projet est organisé pour séparer le cœur métier, les blocs, le format de projet et l’interface desktop.

## Prérequis

- Node.js 20 ou plus récent et npm ;
- Rust stable et Cargo ;
- WebView2 Runtime sur Windows (fourni habituellement par Windows 10/11).

Sur la machine de création, Node.js et npm sont présents. Rust/Cargo n’étaient pas installés au moment de la génération ; ils sont nécessaires pour lancer ou compiler la fenêtre native Tauri.

## Installation et commandes

Depuis le dossier `pixestudio-next` :

```bash
npm install
npm run dev
npm test
npm run test:functional
npm run build
npm run tauri:dev
npm run tauri:build
```

`npm run dev` lance l’interface Vite pour un développement rapide. `npm run tauri:dev` ouvre la vraie fenêtre Windows Tauri. Le build de production Tauri embarque les fichiers statiques dans la fenêtre WebView2 et ne démarre pas de serveur HTTP.

Le test fonctionnel réutilise Chrome installé sur Windows. Si aucun navigateur Chromium compatible n’est disponible, installez-le avec `npx playwright install chromium`.

## Fonctionnel dans ce premier incrément

- écran d’accueil et création d’un cours ;
- pages multiples, ajout/suppression et titre de page ;
- bibliothèque et registre extensible des blocs titre, texte et image ;
- sélection, déplacement, modification du contenu et des dimensions ;
- undo/redo par commandes métier ;
- état modifié, récupération locale et sauvegarde `.pixe` ;
- ouverture `.pixe` avec validation, migration et erreurs lisibles ;
- aperçu apprenant utilisant les mêmes définitions de blocs ;
- tests unitaires du cœur, des blocs et du format ;
- test Playwright du parcours principal.

## À construire ensuite

Les médias binaires sont déjà prévus dans l’archive mais l’interface d’import d’assets reste à faire. L’audio, la vidéo, les quiz, la narration, l’impression avancée et l’export HTML/SCORM sont des extensions prévues, pas des fonctionnalités promises par ce premier incrément. L’association `.pixe` à l’installateur Windows nécessitera également une configuration de bundle dédiée.

## Architecture

Voir [docs/architecture.md](docs/architecture.md), [docs/project-format.md](docs/project-format.md), [docs/block-system.md](docs/block-system.md) et [docs/decisions/0001-stack.md](docs/decisions/0001-stack.md).

Les contrôles de sécurité et les limites de confiance sont détaillés dans [docs/security.md](docs/security.md).
