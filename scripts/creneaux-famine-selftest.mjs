// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST « FAMINE : PART ÉQUITABLE + TOUR DE RÔLE » (2026-09-24)
//   node scripts/creneaux-famine-selftest.mjs
//
// republish_planifiee_sweep changeait l'ordre (Vinted toujours en tête, un job
// par passage) et la capacité (capacite_partagee réservait tout à la première
// plateforme → Beebs/Opla gelés à prevues 0). Corrigé : ordre « moins servi
// d'abord » + part ÉGALE du créneau entre plateformes actives+éligibles.
//
// Ce test fige, en JS, la LOGIQUE des deux changements sur les cas RÉELS :
//   · Joséphine (créneau 4 h, N=3, params du 23/09 : vinted 366 s/38 élig,
//     beebs 900 s/14, lbc 900 s/7) : Beebs passe de 0 à 5, Vinted reste à 13
//     (pas affamé), Leboncoin 5 ;
//   · GARDE-FOU mono-plateforme : un compte à une seule plateforme active
//     (N=1) garde sa part PLEINE — capacité identique à avant ;
//   · l'ordre : la plateforme la moins servie aujourd'hui passe la première.
// Le calcul de capacite() est le MIROIR fidèle de republish_planifiee_capacite
// (pause_apres=50, pause_duree=120 min, relevés en coin_config).
// ═══════════════════════════════════════════════════════════════════════════
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond || !detail ? "" : `   ← ${detail}`}`); };

// Miroir de public.republish_planifiee_capacite(duree_sec, espacement_sec)
const PAUSE_APRES = 50, PAUSE_MIN = 120;
function capacite(duree, esp) {
  if (!duree || duree <= 0 || !esp || esp <= 0) return 0;
  if (!PAUSE_APRES || !PAUSE_MIN) return Math.floor(duree / esp);
  const cycle = PAUSE_APRES * esp + PAUSE_MIN * 60;
  const pleins = Math.floor(duree / cycle);
  const reste = duree - pleins * cycle;
  return pleins * PAUSE_APRES + Math.min(PAUSE_APRES, Math.floor(reste / esp));
}
// Part égale : capacite(restant / N, espacement) ; N = actives+éligibles (≥ 1).
const partEgale = (restant, N, esp) => capacite(Math.max(60, Math.floor(restant / Math.max(1, N))), esp);
// L'ordre : la plateforme la moins servie aujourd'hui d'abord, puis l'ordre fixe.
const ORDRE_FIXE = ["vinted", "leboncoin", "beebs", "opla"];
function ordrePassage(faitsAujourdhui) {
  return [...ORDRE_FIXE].sort((a, b) =>
    (faitsAujourdhui[a] ?? 0) - (faitsAujourdhui[b] ?? 0)
    || ORDRE_FIXE.indexOf(a) - ORDRE_FIXE.indexOf(b));
}

const CRENEAU = 4 * 3600; // 14 400 s

console.log("\n[1] Joséphine : Beebs n'est plus gelé, Vinted pas affamé (N=3)");
{
  const N = 3; // vinted + beebs + leboncoin actives+éligibles le soir
  const plats = {
    vinted:    { esp: 366, elig: 38, plafond: 20 },
    beebs:     { esp: 900, elig: 14, plafond: 20 },
    leboncoin: { esp: 900, elig: 7,  plafond: 20 },
  };
  const prevues = Object.fromEntries(Object.entries(plats).map(([pf, p]) =>
    [pf, Math.min(partEgale(CRENEAU, N, p.esp), p.elig, p.plafond)]));
  ok("Beebs : prévues 5 (était 0 — gelé)", prevues.beebs === 5, String(prevues.beebs));
  ok("Vinted : prévues 13 — pas affamé (faisait 9-16)", prevues.vinted === 13, String(prevues.vinted));
  ok("Leboncoin : prévues 5 (était ~1)", prevues.leboncoin === 5, String(prevues.leboncoin));
  ok("chaque plateforme éligible a SA part (> 0)", Object.values(prevues).every((v) => v > 0), JSON.stringify(prevues));
  const total = Object.values(prevues).reduce((s, v) => s + v, 0);
  ok("la somme des prévues (23) tient dans le débit d'un seul Chrome (~30 en 4 h)", total <= 30, String(total));
}

console.log("\n[2] GARDE-FOU : un compte MONO-plateforme est INCHANGÉ (N=1 = part pleine)");
{
  // Avant, capacite_partagee sans autre créneau en cours = capacite(restant, esp).
  // Après, N=1 → capacite(restant/1, esp) = MÊME valeur.
  for (const esp of [366, 354, 900, 1200]) {
    ok(`espacement ${esp} s : part N=1 == capacité pleine (aucun changement)`,
      partEgale(CRENEAU, 1, esp) === capacite(CRENEAU, esp), `${partEgale(CRENEAU, 1, esp)} vs ${capacite(CRENEAU, esp)}`);
  }
}

console.log("\n[3] L'ordre : la plateforme la moins servie passe la première");
{
  ok("rien fait encore → l'ordre fixe (vinted d'abord)",
    JSON.stringify(ordrePassage({})) === JSON.stringify(ORDRE_FIXE));
  ok("Vinted a déjà 10, Beebs 0 → Beebs (et les autres à 0) passent avant Vinted",
    ordrePassage({ vinted: 10, leboncoin: 0, beebs: 0, opla: 0 })[0] !== "vinted"
    && ordrePassage({ vinted: 10, leboncoin: 2, beebs: 0, opla: 1 })[0] === "beebs",
    JSON.stringify(ordrePassage({ vinted: 10, leboncoin: 2, beebs: 0, opla: 1 })));
  ok("Vinted rattrapé (tous à 5) → on retombe sur l'ordre fixe",
    ordrePassage({ vinted: 5, leboncoin: 5, beebs: 5, opla: 5 })[0] === "vinted");
  // Sur le fil : Vinted, qui a le plus petit espacement, ne monopolise plus —
  // à égalité de « servies », l'ordre fixe départage, mais dès qu'il a pris de
  // l'avance il repasse derrière.
  ok("Beebs servie 3, Vinted 7 → Beebs repasse devant",
    ordrePassage({ vinted: 7, beebs: 3, leboncoin: 4, opla: 9 })[0] === "beebs");
}

console.log("\n[4] GARDE-FOU : on ne touche NI espacement NI plafond NI quota");
{
  // La part change le TEMPS attribué, jamais l'espacement (esp reste propre à la
  // plateforme) ni le plafond (prevues = LEAST(capacité, éligibles, plafond…)).
  const p = { esp: 366, elig: 3, plafond: 20 };
  ok("le plafond/éligibles bornent toujours par le bas (3 éligibles → 3, pas 13)",
    Math.min(partEgale(CRENEAU, 3, p.esp), p.elig, p.plafond) === 3);
  ok("l'espacement reste celui de la plateforme (900 s → moins de créneaux que 366 s)",
    partEgale(CRENEAU, 3, 900) < partEgale(CRENEAU, 3, 366));
}

console.log(ko === 0 ? "\n[selftest:creneaux-famine] OK\n" : `\n[selftest:creneaux-famine] ÉCHEC — ${ko} vérification(s).\n`);
process.exit(ko === 0 ? 0 : 1);
