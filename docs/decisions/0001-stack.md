# ADR 0001 — TypeScript, React, Vite et Tauri 2

## Décision

PixeStudio utilise TypeScript pour le cœur et l’interface, React pour l’éditeur, Vite comme outil de compilation et Tauri 2 comme shell Windows natif. Rust reste limité aux fonctions natives, ici la lecture et l’écriture atomique de fichiers.

## Raisons

- Tauri ouvre une vraie fenêtre Windows et WebView2 sans lancer Chrome ou Edge comme application séparée.
- Le runtime de production ne nécessite pas de serveur HTTP local et ne scanne aucun port.
- Un cœur TypeScript sans dépendance UI peut être testé et réutilisé pour l’éditeur, l’aperçu, l’impression et les futurs exports.
- Un format `.pixe` versionné rend les projets portables et permet des migrations contrôlées.

## Alternatives écartées

- **Electron** : non retenu car il embarque un runtime navigateur complet plus lourd et ne répond pas au choix Tauri demandé.
- **Serveur HTTP local** : non retenu car il ajoute un processus, un port et un point de défaillance inutiles au logiciel hors ligne.
- **Architecture monolithique** : non retenue car elle mélangerait logique métier, DOM et accès système, ce qui compliquerait les tests et les évolutions.
- **Projet non versionné** : non retenu car l’ouverture d’un ancien document ne pourrait pas être validée ou migrée de façon déterministe.
- **Renderers différents pour éditeur et lecteur** : non retenus pour éviter que l’aperçu diverge de ce que l’auteur construit. Les contextes sont distincts, mais les définitions de blocs sont partagées.
