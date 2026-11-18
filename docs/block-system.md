# Système de blocs

Chaque bloc enregistré dans `packages/blocks` fournit :

- un identifiant et une version ;
- une factory de valeurs par défaut ;
- une validation de contenu ;
- une migration ;
- un renderer éditeur ;
- un renderer apprenant.

Le registre initial contient `title`, `text` et `image`. L’éditeur enveloppe le renderer avec la sélection, le déplacement et les métadonnées de l’inspecteur. L’aperçu appelle le renderer apprenant du même registre : il n’existe donc pas de copie parallèle de la logique visuelle.

Pour ajouter un bloc, il faut créer une définition dans le registre et ses tests. Les types métiers ne changent pas ; `BlockInstance.content` reste une structure versionnée validée par la définition du bloc.

Les contextes prévus sont `editor`, `preview`, `learner` et `print`. Le contexte `print` est réservé à une prochaine étape.
