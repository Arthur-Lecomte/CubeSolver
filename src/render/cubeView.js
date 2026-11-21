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
    remiseIdentite();
    for (let i = 0; i < 54; i++) {
      materiauxStickers[i].color.set(COULEURS[etat[i]] ?? COULEUR_PLASTIQUE);
    }
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
  function boucle() {
    rafId = requestAnimationFrame(boucle);
    controls.update();
    renderer.render(scene, camera);
  }
  boucle();

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
    setFacelets,
    dispose,
  };
  return vue;
}
