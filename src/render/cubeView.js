// Vue 3D du Rubik's Cube (three.js) : scène, stickers pilotés par l'état
// logique de 54 facettes (src/cube/facelets.js = vérité terrain).
//
// createCubeView(container, callbacks) -> vue
//   callbacks : { onUserMove, onMoveStart, onMoveCommitted, onQueueEmpty }
//   vue : enqueue, setPaused, stepOnce, clearQueue, setSpeed,
//         setFacelets, setDragEnabled, dispose

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACES, faceletPosition, faceletNormal } from '../cube/facelets.js';

// Couleurs fixées par le contrat du projet.
const COULEURS = {
  U: '#f5f5f5', // blanc
  D: '#ffd500', // jaune
  F: '#009e60', // vert
  B: '#0051ba', // bleu
  R: '#c41e3a', // rouge
  L: '#ff5800', // orange
};
const COULEUR_PLASTIQUE = '#111111';
const FOND_SCENE = '#12151d';

// Ordre des matériaux d'une BoxGeometry : +x, -x, +y, -y, +z, -z.
const INDEX_MATERIAU_PAR_NORMALE = new Map([
  ['1,0,0', 0],
  ['-1,0,0', 1],
  ['0,1,0', 2],
  ['0,-1,0', 3],
  ['0,0,1', 4],
  ['0,0,-1', 5],
]);

// Normale sortante de chaque face, dérivée de la vérité terrain.
const NORMALE_FACE = Object.fromEntries(
  FACES.map((face, i) => [face, faceletNormal(9 * i)]),
);

// Lettre de face pour une normale sortante donnée ('axe,signe' -> 'U'…).
const FACE_PAR_NORMALE = new Map(
  FACES.map((face) => [NORMALE_FACE[face].join(','), face]),
);

export function createCubeView(container, callbacks = {}) {
  // --- Rendu, caméra, lumières -------------------------------------------

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOND_SCENE);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(5.2, 4.4, 6.6);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const lumiereCle = new THREE.DirectionalLight(0xffffff, 1.3);
  lumiereCle.position.set(6, 9, 7);
  scene.add(lumiereCle);
  const lumiereAppoint = new THREE.DirectionalLight(0xffffff, 0.45);
  lumiereAppoint.position.set(-6, -4, -7);
  scene.add(lumiereAppoint);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5.5;
  controls.maxDistance = 16;

  // --- Les 26 cubies et la table sticker <-> (cubie, matériau) ------------

  const groupeCube = new THREE.Group();
  scene.add(groupeCube);

  // Taille 0.96 : laisse un joint sombre entre les cubies.
  const geometrieCubie = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, 0.06);
  const materiauPlastique = new THREE.MeshStandardMaterial({
    color: COULEUR_PLASTIQUE,
    roughness: 0.55,
    metalness: 0.05,
  });

  const cubies = [];
  const cubieParGrille = new Map(); // 'x,y,z' -> mesh
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue; // cœur invisible
        const cubie = new THREE.Mesh(
          geometrieCubie,
          new Array(6).fill(materiauPlastique),
        );
        cubie.position.set(x, y, z);
        cubie.userData.home = [x, y, z]; // position d'origine (identité)
        cubie.userData.grid = [x, y, z]; // position entière courante
        groupeCube.add(cubie);
        cubies.push(cubie);
        cubieParGrille.set(`${x},${y},${z}`, cubie);
      }
    }
  }

  // Pour chaque facette 0..53 : un matériau dédié sur le bon cubie, dérivé
  // de faceletPosition/faceletNormal (jamais de table écrite à la main).
  const materiauxStickers = [];
  for (let i = 0; i < 54; i++) {
    const cubie = cubieParGrille.get(faceletPosition(i).join(','));
    const indexMateriau = INDEX_MATERIAU_PAR_NORMALE.get(
      faceletNormal(i).join(','),
    );
    const materiau = new THREE.MeshStandardMaterial({
      color: COULEURS[FACES[Math.floor(i / 9)]],
      roughness: 0.35,
      metalness: 0.04,
    });
    cubie.material[indexMateriau] = materiau;
    materiauxStickers.push(materiau);
  }

  // Remet chaque cubie à sa position/orientation d'identité.
  function remiseIdentite() {
    for (const cubie of cubies) {
      if (cubie.parent !== groupeCube) groupeCube.add(cubie);
      const [x, y, z] = cubie.userData.home;
      cubie.position.set(x, y, z);
      cubie.quaternion.identity();
      cubie.userData.grid = [x, y, z];
    }
  }

  // Recolorie les stickers d'après un état de 54 facettes, géométrie remise
  // à l'identité (aucun déplacement de cubie n'est nécessaire).
  function setFacelets(etat) {
    // Abandonne sans rappel un éventuel coup en cours : la géométrie va de
    // toute façon être remise à l'identité.
    if (coupCourant) {
      groupeCube.remove(coupCourant.pivot);
      coupCourant = null;
    }
    remiseIdentite();
    for (let i = 0; i < 54; i++) {
      materiauxStickers[i].color.set(COULEURS[etat[i]] ?? COULEUR_PLASTIQUE);
    }
  }

  // --- Moteur d'animation : file de coups ----------------------------------

  const AXES_MONDE = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];

  let vitesseMs = 220; // durée d'un quart de tour
  let enPause = false;
  let pasDemande = false; // stepOnce : jouer exactement le prochain coup
  const file = []; // { move, meta, index }
  let coupCourant = null; // { move, meta, index, pivot, axe, angleCible, … }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Décompose un jeton ('R', "U'", 'F2'…) : axe monde (0=x, 1=y, 2=z),
  // couche (coordonnée ±1 sur cet axe) et angle signé autour de +axe.
  // Jeton nu = -90° autour de la normale SORTANTE (horaire vu de
  // l'extérieur de la face), cohérent avec applyMove de facelets.js.
  function decomposerJeton(move) {
    const normale = NORMALE_FACE[move[0]];
    if (!normale) throw new Error(`Mouvement inconnu : ${move}`);
    const axe = normale.findIndex((c) => c !== 0);
    const couche = normale[axe];
    const suffixe = move.slice(1);
    const angleSortant =
      suffixe === "'" ? Math.PI / 2 : suffixe === '2' ? -Math.PI : -Math.PI / 2;
    return {
      axe,
      couche,
      angle: angleSortant * couche, // reporté sur l'axe monde positif
      demiTour: suffixe === '2',
    };
  }

  function cubiesDeCouche(axe, couche) {
    return cubies.filter((c) => c.userData.grid[axe] === couche);
  }

  function creerPivot(listeCubies) {
    const pivot = new THREE.Group();
    groupeCube.add(pivot);
    for (const cubie of listeCubies) pivot.attach(cubie);
    return pivot;
  }

  // Figeage : réintègre les cubies dans le groupe racine, positions
  // arrondies à la grille entière, orientation recalée sur l'alignement
  // d'axes le plus proche — aucune dérive de flottants entre deux coups.
  const matriceTmp = new THREE.Matrix4();
  function figerCubie(cubie) {
    cubie.position.set(
      Math.round(cubie.position.x),
      Math.round(cubie.position.y),
      Math.round(cubie.position.z),
    );
    matriceTmp.makeRotationFromQuaternion(cubie.quaternion);
    const e = matriceTmp.elements;
    for (let i = 0; i < 16; i++) e[i] = Math.round(e[i]);
    cubie.quaternion.setFromRotationMatrix(matriceTmp);
    cubie.userData.grid = [cubie.position.x, cubie.position.y, cubie.position.z];
  }

  function figerPivot(pivot) {
    for (const cubie of [...pivot.children]) {
      groupeCube.attach(cubie);
      figerCubie(cubie);
    }
    groupeCube.remove(pivot);
  }

  function demarrerCoup(maintenant) {
    const { move, meta, index } = file.shift();
    const { axe, couche, angle, demiTour } = decomposerJeton(move);
    const pivot = creerPivot(cubiesDeCouche(axe, couche));
    coupCourant = {
      move,
      meta,
      index,
      pivot,
      axe: AXES_MONDE[axe],
      angleCible: angle,
      debut: maintenant,
      duree: Math.max(1, vitesseMs * (demiTour ? 1.6 : 1)),
    };
    callbacks.onMoveStart?.(move, meta, index);
  }

  function terminerCoup() {
    const { pivot, axe, angleCible, move, meta, index } = coupCourant;
    pivot.quaternion.setFromAxisAngle(axe, angleCible);
    figerPivot(pivot);
    coupCourant = null;
    callbacks.onMoveCommitted?.(move, meta, index);
    // onMoveCommitted a pu ré-alimenter la file : ne signale le vide
    // qu'une fois la file réellement épuisée.
    if (!coupCourant && file.length === 0) callbacks.onQueueEmpty?.();
  }

  function tickAnimation(maintenant) {
    if (coupCourant) {
      const t = Math.min(
        1,
        (maintenant - coupCourant.debut) / coupCourant.duree,
      );
      coupCourant.pivot.quaternion.setFromAxisAngle(
        coupCourant.axe,
        coupCourant.angleCible * easeInOutCubic(t),
      );
      if (t >= 1) terminerCoup();
    }
    if (!coupCourant && file.length > 0 && (!enPause || pasDemande)) {
      pasDemande = false;
      demarrerCoup(maintenant);
    }
  }

  // Ajoute un lot de coups ; `meta` et l'index du coup dans son lot sont
  // rendus tels quels à onMoveStart / onMoveCommitted.
  function enqueue(moves, meta) {
    moves.forEach((move, index) => file.push({ move, meta, index }));
  }

  function setPaused(pause) {
    enPause = Boolean(pause);
    if (!enPause) pasDemande = false;
  }

  // Joue exactement un coup quand la file est en pause.
  function stepOnce() {
    if (enPause && !coupCourant && file.length > 0) pasDemande = true;
  }

  // Vide la file en terminant proprement le coup en cours.
  function clearQueue() {
    const avaitTravail = Boolean(coupCourant) || file.length > 0;
    file.length = 0;
    pasDemande = false;
    if (coupCourant) terminerCoup();
    else if (avaitTravail) callbacks.onQueueEmpty?.();
  }

  function setSpeed(msParQuartDeTour) {
    const ms = Number(msParQuartDeTour);
    if (Number.isFinite(ms)) vitesseMs = Math.min(2000, Math.max(40, ms));
  }

  // --- Redimensionnement ---------------------------------------------------

  function redimensionner() {
    const largeur = Math.max(1, container.clientWidth);
    const hauteur = Math.max(1, container.clientHeight);
    camera.aspect = largeur / hauteur;
    camera.updateProjectionMatrix();
    renderer.setSize(largeur, hauteur, false);
  }
  const observateur = new ResizeObserver(redimensionner);
  observateur.observe(container);
  redimensionner();

  // --- Boucle de rendu -----------------------------------------------------

  let rafId = 0;
  function boucle(temps) {
    rafId = requestAnimationFrame(boucle);
    tickAnimation(temps ?? performance.now());
    controls.update();
    renderer.render(scene, camera);
  }
  boucle(performance.now());

  // --- API publique --------------------------------------------------------

  function dispose() {
    cancelAnimationFrame(rafId);
    observateur.disconnect();
    controls.dispose();
    geometrieCubie.dispose();
    materiauPlastique.dispose();
    for (const materiau of materiauxStickers) materiau.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  const vue = {
    enqueue,
    setPaused,
    stepOnce,
    clearQueue,
    setSpeed,
    setFacelets,
    dispose,
  };
  return vue;
}
