// Harnais de vérification du solveur two-phase.
// Usage : npm run verify   (équivalent : node scripts/verify-solver.mjs)
// Sortie en français ; code de sortie non nul en cas d'échec.

import {
  SOLVED,
  MOVES,
  applyMove,
  applyMoves,
  randomScramble,
} from '../src/cube/facelets.js';
import {
  faceletsToCubie,
  cubieToFacelets,
  multiplyCubie,
  identityCubie,
  MOVE_DELTAS,
} from '../src/solver/cubie.js';
import { initTables, solve } from '../src/solver/twophase.js';

// Générateur pseudo-aléatoire déterministe (reproductibilité du harnais).
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let failures = 0;
function check(ok, label) {
  if (ok) {
    console.log(`  OK    ${label}`);
  } else {
    failures++;
    console.error(`  ECHEC ${label}`);
  }
}

function sameCubie(a, b) {
  return (
    a.cp.join() === b.cp.join() &&
    a.co.join() === b.co.join() &&
    a.ep.join() === b.ep.join() &&
    a.eo.join() === b.eo.join()
  );
}

function expectError(fn, label) {
  try {
    fn();
    check(false, `${label} (aucune erreur levée)`);
  } catch (err) {
    check(err instanceof Error && err.message.length > 0, `${label} — « ${err.message} »`);
  }
}

const stats = (arr) => ({
  moyenne: arr.reduce((s, v) => s + v, 0) / arr.length,
  max: Math.max(...arr),
});

console.log('=== Vérification du solveur two-phase ===');
const rng = mulberry32(20261121);

// ---------------------------------------------------------------- Test 1 --
console.log('\n[1/4] Cohérence du modèle cubie');
{
  let ok = true;
  let detail = '';
  for (let i = 0; i < 50; i++) {
    const state = applyMoves(SOLVED, randomScramble(25, rng));
    if (cubieToFacelets(faceletsToCubie(state)) !== state) {
      ok = false;
      detail = ` (échec sur l'état n° ${i + 1})`;
      break;
    }
  }
  check(ok, `aller-retour facelets <-> cubie sur 50 états mélangés${detail}`);

  let okMoves = true;
  let detailMoves = '';
  boucle: for (let i = 0; i < 20; i++) {
    const state = applyMoves(SOLVED, randomScramble(20, rng));
    const cubie = faceletsToCubie(state);
    for (const mv of MOVES) {
      const parFacelets = faceletsToCubie(applyMove(state, mv));
      const parCubie = multiplyCubie(cubie, MOVE_DELTAS[mv]);
      if (!sameCubie(parFacelets, parCubie)) {
        okMoves = false;
        detailMoves = ` (échec sur le coup ${mv})`;
        break boucle;
      }
    }
  }
  check(okMoves, `équivalence des 18 mouvements entre modèles facelets et cubie${detailMoves}`);
}

// ---------------------------------------------------------------- Test 2 --
console.log('\n[2/4] 200 mélanges aléatoires (budget 250 ms)');
{
  const t0 = performance.now();
  initTables();
  const tBuild = performance.now() - t0;
  console.log(`  Construction des tables : ${tBuild.toFixed(0)} ms`);
  check(tBuild <= 4000, 'construction des tables en moins de 4 s');

  const longueurs = [];
  const temps = [];
  let tousResolus = true;
  let toutesCourtes = true;
  for (let i = 0; i < 200; i++) {
    const state = applyMoves(SOLVED, randomScramble(25, rng));
    const t = performance.now();
    const sol = solve(state, { timeoutMs: 250 });
    temps.push(performance.now() - t);
    longueurs.push(sol.length);
    if (applyMoves(state, sol) !== SOLVED) tousResolus = false;
    if (sol.length > 25) toutesCourtes = false;
  }
  const L = stats(longueurs);
  const T = stats(temps);
  console.log(
    `  Longueur : moyenne ${L.moyenne.toFixed(2)}, max ${L.max} — ` +
      `temps : moyen ${T.moyenne.toFixed(0)} ms, max ${T.max.toFixed(0)} ms`,
  );
  check(tousResolus, 'les 200 solutions ramènent bien à SOLVED');
  check(toutesCourtes, 'toutes les solutions font au plus 25 coups');
}

// ---------------------------------------------------------------- Test 3 --
console.log('\n[3/4] 20 mélanges au budget par défaut (1200 ms)');
{
  const longueurs = [];
  const temps = [];
  let tousResolus = true;
  for (let i = 0; i < 20; i++) {
    const state = applyMoves(SOLVED, randomScramble(25, rng));
    const t = performance.now();
    const sol = solve(state);
    temps.push(performance.now() - t);
    longueurs.push(sol.length);
    if (applyMoves(state, sol) !== SOLVED) tousResolus = false;
  }
  const L = stats(longueurs);
  const T = stats(temps);
  console.log(
    `  Longueur : moyenne ${L.moyenne.toFixed(2)}, max ${L.max} — ` +
      `temps : moyen ${T.moyenne.toFixed(0)} ms, max ${T.max.toFixed(0)} ms`,
  );
  check(tousResolus, 'les 20 solutions ramènent bien à SOLVED');
  check(L.max <= 24, `longueur max <= 24 (obtenu : ${L.max})`);
  check(L.moyenne <= 23, `longueur moyenne <= 23 (obtenu : ${L.moyenne.toFixed(2)})`);
}

// ---------------------------------------------------------------- Test 4 --
console.log('\n[4/4] Cas limites et états invalides');
{
  const solRes = solve(SOLVED);
  check(Array.isArray(solRes) && solRes.length === 0, 'solve(SOLVED) renvoie []');

  const coinVrille = identityCubie();
  coinVrille.co[0] = 1;
  expectError(() => solve(cubieToFacelets(coinVrille)), 'coin vrillé seul rejeté');

  const areteRetournee = identityCubie();
  areteRetournee.eo[0] = 1;
  expectError(() => solve(cubieToFacelets(areteRetournee)), 'arête retournée seule rejetée');

  const coinsEchanges = identityCubie();
  coinsEchanges.cp[0] = 1;
  coinsEchanges.cp[1] = 0;
  expectError(() => solve(cubieToFacelets(coinsEchanges)), 'deux coins échangés rejetés (parité)');
}

// ----------------------------------------------------------------- Bilan --
console.log(
  failures === 0
    ? '\nBilan : tous les tests sont au vert.'
    : `\nBilan : ${failures} vérification(s) en échec.`,
);
process.exit(failures === 0 ? 0 : 1);
