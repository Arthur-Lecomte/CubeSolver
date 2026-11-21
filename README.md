# Rubik's Cube 3D — démo pour arthurlecomte.fr

Un Rubik's Cube 3×3 interactif en 3D : on orbite autour du cube, on
tourne les tranches à la souris ou au doigt, on le mélange, et on le
laisse se résoudre tout seul — chaque coup est animé, du mélange à la
solution.

Démo destinée à être hébergée sur
[arthurlecomte.fr](https://arthurlecomte.fr) sous `/demos/<slug>/`.

## Fonctionnalités

- **Cube 3D** rendu avec three.js (embarqué au build, aucune requête
  externe) : orbite libre, éclairage doux, rendu net jusqu'à 2× DPR.
- **Rotation des tranches au glisser** : on attrape une facette et la
  tranche suit le doigt, puis se recale au quart de tour le plus
  proche. Glisser le fond (ou une tranche du milieu) fait orbiter la
  caméra.
- **Boutons de notation** (U, U', D, … B') et clavier
  (`u d l r f b`, Maj = sens inverse).
- **Mélange aléatoire animé** (25 coups, sans redondances).
- **Résolution automatique** par l'algorithme two-phase de Kociemba,
  implémenté from scratch (modèle cubie, coordonnées, tables de
  pruning, IDA*) dans un Web Worker : solutions d'environ 20 coups en
  quelques dizaines de millisecondes.
- **Lecture pas-à-pas de la solution** : notation affichée, coup
  courant surligné, lecture/pause et navigation coup par coup.
- **Vitesse d'animation réglable** et **état persisté** dans
  `localStorage` (clés préfixées `cube-solver:`).

## Développer

```sh
npm ci
npm run dev       # serveur de développement
npm run build     # fichiers finaux dans dist/
npm run verify    # harnais de vérification du solveur (Node)
```

`npm run verify` reconstruit les tables et résout 200 mélanges
aléatoires en contrôlant chaque solution (longueur, retour à l'état
résolu, rejet des états insolubles).

## Architecture

```
src/
  cube/facelets.js    état logique : 54 facettes (convention Kociemba),
                      permutations des 18 coups générées depuis la géométrie
  solver/             two-phase : cubie.js, coords.js, prune.js, search.js,
                      twophase.js + worker.js / client.js (Web Worker)
  render/cubeView.js  scène three.js : cubies, file d'animation, drag
  main.js             état, interface, lecture de la solution, persistance
scripts/verify-solver.mjs   harnais exécuté par `npm run verify`
```

## Règles du portfolio (respectées, vérifiées au build)

- Aucune requête vers un autre domaine : three.js est bundlé, polices
  système, aucun asset distant. Aucun asset externe utilisé (tout est
  généré par le code).
- Pas de cookies, pas de service worker, pas de formulaire.
- `localStorage` préfixé `cube-solver:`, chemins relatifs
  (`base: './'`), lien « Retour à la fiche du projet » conservé.

## Intégrer au portfolio

Projet terminé → ouvrir Claude Code dans le repo du portfolio et lancer
`/nouveau-projet <chemin de ce projet>`. La fiche est créée en
brouillon ; la publication reste une décision manuelle.
