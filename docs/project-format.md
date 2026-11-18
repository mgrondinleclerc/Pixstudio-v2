# Format de projet `.pixe`

Un fichier `.pixe` est une archive ZIP autonome :

```text
mon-cours.pixe
  manifest.json
  course.json
  assets/
  previews/
```

`manifest.json` contient le nom de l’application, la version du format, l’identifiant du document, son titre et les fichiers attendus. `course.json` contient le `CourseDocument` versionné. Les médias appartiennent au projet sous `assets/`, jamais à un répertoire global partagé.

## Compatibilité

Le chargeur vérifie le conteneur, le manifeste, la cohérence de l’identifiant et le schéma strict du document. Les documents plus anciens passent par des migrations explicites. Une version future inconnue est refusée avec un message clair au lieu d’être modifiée silencieusement.

## Écriture atomique

Le shell Tauri écrit d’abord dans un fichier temporaire placé à côté de la destination, puis le renomme vers le chemin cible. Le format de paquet et la logique d’écriture sont séparés afin que les tests puissent vérifier la transaction sans dépendre de Windows.
