// Autotest — LE CADENCEUR À ÉCHÉANCES DU REMPLISSAGE VINTED (05/10, point 9)
// `npm run selftest:vinted-cadenceur`
//
// Carla et Ciddjy, sur Mac : remplissage Vinted médiane 205-254 s (p90 ~280 s)
// contre ~50 s sur Windows ; 23 % des remplissages Mac au-delà de 150 s. macOS
// bride le processus de rendu de l'onglet caché : chaque réveil de minuteur
// arrive en retard, et le remplissage attend plus de cent fois.
//
// Ce que ce test garantit, sur la VRAIE fonction creerCadenceur (extraite de
// vinted.js), avec une horloge simulée :
//   1. réveils en retard ×3 → les pauses humaines durent ≈ le plan (pas ×3) ;
//      plan complet (attentes fonctionnelles comprises, jamais rattrapées) :
//      ×3 ramené sous ×1,5 ;
//   2. JAMAIS plus rapide que le plan : chaque geste arrive au plus tôt à
//      l'heure où il serait arrivé avec des réveils à l'heure ;
//   3. régime normal (Windows : 1 à 16 ms de retard) → aucune pause effective
//      plus courte que prévu, aucune dette, rien ne change ;
//   4. une attente fonctionnelle (sleep) n'est jamais raccourcie, et son
//      retard n'est pas compté en dette (sondage, délai d'une course) ;
//   5. la dette est bornée (un réveil très en retard ne déclenche pas de
//      rafale) et oubliée au remplissage suivant ;
//   6. le câblage : humanPause et la frappe passent par le cadenceur, les
//      attentes (waitFor, waitForStableElement, waitForElement(Gone)), la
//      reprise des photos et le battement du port sont tenus par le Worker.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8").split("\r\n").join("\n");

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const creerCadenceur = new Function(`${extraireFonctionJs(src, "creerCadenceur")}; return creerCadenceur;`)();

// ── Horloge simulée ─────────────────────────────────────────────────────────
// minuterie(ms) avance l'horloge de la durée RÉELLE du réveil (ms × facteur +
// gigue) ; ceder() rend la main sans faire avancer l'horloge (aucun minuteur).
function banc({ facteur = 1, gigue = () => 0 } = {}) {
  let t = 0;
  const cad = creerCadenceur({
    maintenant: () => t,
    minuterie: async (ms) => { t += ms * facteur + gigue(ms); },
    ceder: async () => {},
  });
  return { cad, maintenant: () => t, travailler: (ms) => { t += ms; } };
}

// Un plan de remplissage RÉALISTE, tiré une fois (graine fixe) : frappe du
// titre (60 caractères, 80-250 ms), pauses humaines entre les gestes
// (300-900 ms), attentes fonctionnelles (laisser la page réagir : 350, 400,
// 800, 1000 ms), un peu de travail entre deux attentes.
function aleatoire(graine) {
  let x = graine >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}
const r = aleatoire(20261005);
const tirer = (min, max) => Math.round(min + r() * (max - min));
const PLAN = [];
for (let i = 0; i < 60; i++) PLAN.push({ type: "pause", ms: tirer(80, 250), travail: 2 });           // titre
for (let k = 0; k < 12; k++) {                                                                       // champs
  PLAN.push({ type: "pause", ms: tirer(300, 900), travail: 15 });
  PLAN.push({ type: "attendre", ms: [350, 400, 800, 1000][k % 4], travail: 5 });
  PLAN.push({ type: "pause", ms: tirer(300, 900), travail: 10 });
  PLAN.push({ type: "pause", ms: tirer(300, 900), travail: 10 });
}
for (let i = 0; i < 25; i++) PLAN.push({ type: "pause", ms: tirer(80, 250), travail: 2 });           // recherche de marque
for (let k = 0; k < 6; k++) PLAN.push({ type: "pause", ms: tirer(300, 900), travail: 20 });         // derniers gestes
// Les seules pauses HUMAINES du même plan (ce que le cadenceur rattrape).
const PLAN_HUMAIN = PLAN.filter((e) => e.type === "pause");

async function derouler(b, plan = PLAN) {
  const gestes = []; // heure de chaque geste (après chaque attente)
  const pauses = []; // durée effective de chaque pause / attente
  for (const etape of plan) {
    b.travailler(etape.travail);
    const avant = b.maintenant();
    if (etape.type === "pause") await b.cad.pause(etape.ms); else await b.cad.attendre(etape.ms);
    pauses.push({ ...etape, effectif: b.maintenant() - avant });
    gestes.push(b.maintenant());
  }
  return { total: b.maintenant(), gestes, pauses };
}

console.log("\n1. RÉVEILS EN RETARD ×3 (Mac, onglet caché) : DURÉE ≈ PLAN HUMAIN");
{
  // Les pauses humaines seules (frappe + pauses entre gestes) : ce que le
  // cadenceur rattrape.
  const planH = await derouler(banc({ facteur: 1 }), PLAN_HUMAIN);
  const sansH = PLAN_HUMAIN.reduce((s, e) => s + e.travail + e.ms * 3, 0);
  const b = banc({ facteur: 3 });
  const macH = await derouler(b, PLAN_HUMAIN);
  const ratioH = macH.total / planH.total;
  console.log(`      pauses humaines : plan ${Math.round(planH.total)} ms · réveils ×3 sans cadenceur ${Math.round(sansH)} ms · avec ${Math.round(macH.total)} ms (×${ratioH.toFixed(2)})`);
  ok(sansH / planH.total > 2.8, "sans cadenceur, les mêmes pauses dureraient ~×3 (le symptôme Mac)", `×${(sansH / planH.total).toFixed(2)}`);
  ok(ratioH <= 1.1, "avec le cadenceur, durée ≈ plan humain (≤ ×1,1)", `×${ratioH.toFixed(2)}`);
  ok(b.cad.etat.rattrapees > 50, "des pauses entièrement couvertes par le retard subi (aucun minuteur réarmé)", String(b.cad.etat.rattrapees));
  ok(b.cad.etat.reveils < PLAN_HUMAIN.length * 0.7, "nettement moins de réveils que de pauses", `${b.cad.etat.reveils} / ${PLAN_HUMAIN.length}`);
}
// Le plan COMPLET, attentes fonctionnelles comprises : celles-ci ne sont ni
// raccourcies ni rattrapées (leur retard est mesuré, pas compté en dette).
const plan = await derouler(banc({ facteur: 1 }));
const sansCadenceur = PLAN.reduce((s, e) => s + e.travail + e.ms * 3, 0);
const bMac = banc({ facteur: 3 });
const mac = await derouler(bMac);
const ratio = mac.total / plan.total;
console.log(`      plan complet : plan ${Math.round(plan.total)} ms · sans cadenceur ${Math.round(sansCadenceur)} ms · avec ${Math.round(mac.total)} ms (×${ratio.toFixed(2)})`);
ok(ratio < 1.5 && sansCadenceur / plan.total > 2.8, "plan complet : ×3 ramené sous ×1,5 (le reste = attentes fonctionnelles, jamais rattrapées)", `×${ratio.toFixed(2)}`);
ok(mac.pauses.filter((e) => e.type === "attendre").every((e) => e.effectif >= e.ms * 3), "chaque attente fonctionnelle a duré son temps réel entier");

console.log("\n2. JAMAIS PLUS RAPIDE QUE LE PLAN HUMAIN");
const enAvance = mac.gestes.findIndex((t, k) => t + 1e-9 < plan.gestes[k]);
ok(enAvance === -1, "chaque geste arrive au plus tôt à son heure du plan (réveils à l'heure)",
  enAvance >= 0 ? `geste ${enAvance} : ${mac.gestes[enAvance]} < ${plan.gestes[enAvance]}` : "");
ok(mac.total >= plan.total, "la durée totale n'est jamais sous le plan");
{
  // Même propriété, retards IRRÉGULIERS (0 à 2,5 s par réveil, comme App Nap).
  const ra = aleatoire(42);
  const bIrr = banc({ facteur: 1, gigue: () => ra() * 2500 });
  const irr = await derouler(bIrr);
  const k = irr.gestes.findIndex((t, i) => t + 1e-9 < plan.gestes[i]);
  ok(k === -1, "retards irréguliers (0-2,5 s) : aucun geste avant son heure du plan");
  console.log(`      retards irréguliers : plan ${Math.round(plan.total)} ms · retard subi ${Math.round(bIrr.cad.etat.retardMs)} ms · rattrapé ${Math.round(bIrr.cad.etat.rattrapeMs)} ms · total ${Math.round(irr.total)} ms`);
  ok(bIrr.cad.etat.rattrapeMs > 0 && Math.abs(irr.total - (plan.total + bIrr.cad.etat.retardMs - bIrr.cad.etat.rattrapeMs)) < 1,
    "le retard subi est rattrapé : total = plan + retard − rattrapé");
}

console.log("\n3. RÉGIME NORMAL (Windows) : RIEN NE CHANGE");
{
  const rg = aleatoire(7);
  const bWin = banc({ facteur: 1, gigue: () => 1 + rg() * 15 });
  const win = await derouler(bWin);
  const raccourcie = win.pauses.find((p) => p.effectif < p.ms);
  ok(!raccourcie, "aucune pause effective plus courte que prévu", raccourcie ? `${raccourcie.type} ${raccourcie.ms} ms → ${raccourcie.effectif} ms` : "");
  ok(bWin.cad.etat.dette === 0 && bWin.cad.etat.rattrapees === 0 && bWin.cad.etat.rattrapeMs === 0, "aucune dette, aucune pause rattrapée");
  ok(bWin.cad.etat.reveils === PLAN.length, "un réveil par attente, comme avant");
}
{
  // Une gigue juste sous la tolérance (40 ms) reste du bruit.
  const b = banc({ facteur: 1, gigue: () => 40 });
  const res = await derouler(b);
  ok(!res.pauses.find((p) => p.effectif < p.ms) && b.cad.etat.rattrapees === 0, "40 ms de retard par réveil : sous la tolérance, aucune pause raccourcie");
}

console.log("\n4. UNE ATTENTE FONCTIONNELLE N'EST JAMAIS RACCOURCIE");
{
  const b = banc({ facteur: 3 });
  await b.cad.pause(800); // réveil à 2 400 ms : dette de 1 600 ms
  ok(b.cad.etat.dette === 1600, "dette = retard subi (1 600 ms)", String(b.cad.etat.dette));
  const t0 = b.maintenant();
  await b.cad.attendre(400);
  ok(b.maintenant() - t0 >= 400, "sleep(400) dure au moins 400 ms malgré la dette (la page ne réagit pas plus vite)");
  ok(b.cad.etat.dette === 1600, "le retard de ce sleep (800 ms) n'est PAS compté en dette (sondage, délai d'une course : rien ne prouve un temps perdu)", String(b.cad.etat.dette));
  const t1 = b.maintenant();
  await b.cad.pause(500);
  ok(b.maintenant() - t1 === 0, "la pause humaine suivante, couverte par la dette, ne réarme aucun minuteur");
}

console.log("\n5. DETTE BORNÉE, OUBLIÉE AU REMPLISSAGE SUIVANT");
{
  let t = 0;
  let tard = 30_000;
  const cad = creerCadenceur({
    maintenant: () => t,
    minuterie: async (ms) => { t += ms + tard; tard = 0; },
    ceder: async () => {},
  });
  await cad.pause(500); // un réveil 30 s en retard
  ok(cad.etat.dette === 4000, "un réveil 30 s en retard ne crée que 4 s de dette (pas de rafale)", String(cad.etat.dette));
  let couvertes = 0;
  for (let i = 0; i < 30; i++) {
    const avant = cad.etat.rattrapees;
    await cad.pause(600);
    if (cad.etat.rattrapees > avant) couvertes++;
  }
  ok(couvertes <= 7, "au plus ~4 s de pauses rattrapées d'affilée", String(couvertes));
  t = 0; tard = 5000;
  await cad.pause(300);
  ok(cad.etat.dette > 0, "dette reconstituée");
  cad.oublierDette();
  ok(cad.etat.dette === 0, "oublierDette (début d'un remplissage) remet à zéro");
}

console.log("\n6. CÂBLAGE DANS vinted.js");
const corps = (nom) => extraireFonctionJs(src, nom);
ok(/const humanPause = \(min = HUMAN_ACTION_MIN, max = HUMAN_ACTION_MAX\) => cadenceur\.pause\(randInt\(min, max\)\);/.test(src),
  "humanPause passe par le cadenceur (mêmes bornes 300-900 ms)");
ok(/await cadenceur\.pause\(randInt\(HUMAN_CHAR_MIN, HUMAN_CHAR_MAX\)\);/.test(corps("typeHuman")), "la frappe lettre par lettre passe par le cadenceur (80-250 ms)");
ok(/const HUMAN_CHAR_MIN = 80, HUMAN_CHAR_MAX = 250;/.test(src) && /const HUMAN_ACTION_MIN = 300, HUMAN_ACTION_MAX = 900;/.test(src), "pauses minimales inchangées");
ok(/function sleep\(ms\) \{\s*return cadenceur\.attendre\(ms\);\s*\}/.test(src), "sleep = attente réelle mesurée (jamais raccourcie)");
ok(!/sleep\(/.test(corps("waitFor")) && /MutationObserver/.test(corps("waitFor")) && /planifierSurWorker/.test(corps("waitFor")), "waitFor : MutationObserver + échéance du Worker, plus de boucle sleep");
ok(!/sleep\(/.test(corps("waitForStableElement")) && /MutationObserver/.test(corps("waitForStableElement")) && /planifierSurWorker/.test(corps("waitForStableElement")), "waitForStableElement : idem");
ok(!/setTimeout\(/.test(corps("waitForElement")) && /planifierSurWorker/.test(corps("waitForElement")), "waitForElement : délai d'abandon sur le Worker");
ok(!/setTimeout\(/.test(corps("waitForElementGone")) && /planifierSurWorker/.test(corps("waitForElementGone")), "waitForElementGone : délai d'abandon sur le Worker");
ok(!/setTimeout\(/.test(corps("urlToFile")) && /await sleep\(DELAIS_MS\[essai - 1\]\)/.test(corps("urlToFile")), "reprise des photos sur le Worker");
const port = src.slice(src.indexOf("chrome.runtime.onConnect.addListener((port) => {"), src.indexOf("// ── FIN PORT DE REMPLISSAGE CONTENT-SCRIPT"));
ok(port.length > 0 && !/setInterval\(|clearInterval\(/.test(port) && /repeterSurWorker\(20_000,/.test(port), "battement du port (20 s) sur le Worker");
ok(/function cederLaMain\(\)/.test(src) && /new MessageChannel\(\)/.test(src), "une pause couverte rend la main par MessageChannel (aucun minuteur)");
const pf = corps("planifierSurWorker");
ok(/__timerWorker\.postMessage\(\{ id, ms \}\)/.test(pf) && /filet = setTimeout\(declencher, ms\)/.test(pf), "planifierSurWorker : Worker d'abord, setTimeout de la page en filet");

console.log("\n6 bis. LES ATTENTES, SUR UN FAUX DOM (observateur + échéance du Worker)");
{
  // Faux DOM minimal : un sélecteur → un nœud ; muter() prévient les
  // observateurs comme le ferait le navigateur. Le Worker est simulé par de
  // vrais setTimeout courts (le banc ne mesure que la logique).
  const noeuds = new Map();
  const observateurs = new Set();
  const document = {
    body: {}, documentElement: {},
    querySelector: (s) => noeuds.get(s) ?? null,
  };
  class MutationObserver {
    constructor(cb) { this.cb = cb; }
    observe() { observateurs.add(this); }
    disconnect() { observateurs.delete(this); }
  }
  const muter = (s, n) => { if (n) noeuds.set(s, n); else noeuds.delete(s); for (const o of [...observateurs]) o.cb([]); };
  const planifierSurWorker = (ms, rappel) => { const h = setTimeout(rappel, Math.min(ms, 60)); return () => clearTimeout(h); };
  const repeterSurWorker = (ms, rappel) => { const h = setInterval(rappel, 10); return () => clearInterval(h); };
  const fab = new Function("document", "MutationObserver", "planifierSurWorker", "repeterSurWorker",
    `${corps("waitFor")}\n${corps("waitForElement")}\n${corps("waitForStableElement")}\n${corps("waitForElementGone")}\n` +
    "return { waitFor, waitForElement, waitForStableElement, waitForElementGone };");
  const W = fab(document, MutationObserver, planifierSurWorker, repeterSurWorker);

  let p = W.waitFor(() => document.querySelector("#a"), 5000);
  setTimeout(() => muter("#a", { id: "a" }), 5);
  ok((await p)?.id === "a", "waitFor : rendu dès la mutation qui rend la condition vraie");
  let drapeau = false;
  p = W.waitFor(() => drapeau && "pris", 5000);
  setTimeout(() => { drapeau = true; }, 15); // propriété, aucune mutation
  ok((await p) === "pris", "waitFor : une condition sans mutation (propriété) est relue par le filet");
  ok((await W.waitFor(() => null, 30)) === null, "waitFor : null à l'échéance");
  await W.waitFor(() => { throw new Error("sonde cassée"); }, 30).then(() => ok(false, "waitFor : une exception remonte"), (e) => ok(/sonde cassée/.test(e.message), "waitFor : une exception de la condition remonte"));
  ok(observateurs.size === 0, "aucun observateur laissé derrière");

  muter("#b", { id: "b1" });
  ok((await W.waitForStableElement("#b", 5000, 20))?.id === "b1", "waitForStableElement : nœud resté le même → rendu");
  p = W.waitForStableElement("#c", 5000, 30);
  setTimeout(() => muter("#c", { id: "c1" }), 2);
  setTimeout(() => muter("#c", { id: "c2" }), 12); // React remplace le nœud pendant la période de calme
  ok((await p)?.id === "c2", "waitForStableElement : nœud remplacé → le NOUVEAU, après sa propre période de calme");
  await W.waitForStableElement("#absent", 40, 10).then(() => ok(false, "absent → rejet"), (e) => ok(/introuvable/.test(e.message), "waitForStableElement : absent à l'échéance → « Élément introuvable »"));
  noeuds.set("#d", { id: "d" }); // posé SANS mutation : vu à l'échéance
  ok((await W.waitForElement(() => document.querySelector("#d"), 40))?.id === "d", "waitForElement : dernière lecture à l'échéance");
  await W.waitForElement(() => document.querySelector("#jamais"), 30, "jamais").then(() => ok(false, "jamais → rejet"), (e) => ok(/Élément introuvable: jamais/.test(e.message), "waitForElement : même message d'abandon qu'avant"));
  noeuds.set("#e", { id: "e", offsetParent: {} });
  p = W.waitForElementGone("#e", 5000);
  setTimeout(() => muter("#e", null), 5);
  ok((await p) === true, "waitForElementGone : vrai dès la disparition");
  noeuds.set("#f", { id: "f", offsetParent: {} });
  ok((await W.waitForElementGone("#f", 30)) === false, "waitForElementGone : faux à l'échéance si toujours là");
  ok(observateurs.size === 0, "aucun observateur laissé derrière (bis)");
}

console.log("\n7. MESURES DANS LE RÉSULTAT");
const fill = corps("fillListingForm");
ok(/remplissage_mesures: fin\.mesures/.test(fill) && /err\.remplissage_mesures = fin\.mesures/.test(fill), "fillListingForm rend remplissage_mesures (résultat ET erreur)");
ok(/remplissage_mesures: err\.remplissage_mesures/.test(corps("resultatDepuisErreurRemplissage")), "le canal du port relaie les mesures d'une erreur");
ok(/\.catch\(\(err\) => sendResponse\(\{[\s\S]{0,400}remplissage_mesures: err\.remplissage_mesures/.test(src), "le canal FILL_LISTING relaie les mesures d'une erreur");
// (05/10, point 9) Les champs vivent dans instantaneMesures, partagé par la fin
// de mesure et par l'instantané envoyé avant le clic « Publier ».
ok(/return instantaneMesures\(m\)/.test(corps("terminerMesuresRemplissage")), "terminerMesuresRemplissage rend l'instantané");
const fin = corps("instantaneMesures");
for (const cle of ["total_ms", "etapes", "reveils", "retard_ms", "visibilite"]) ok(new RegExp(`${cle}:`).test(fin), `remplissage_mesures.${cle}`);
ok(/jalonRemplissage\(libelle, debutEtape\)/.test(src) && /jalonRemplissage\(`phase:\$\{phase\}`\)/.test(corps("marquerPhase")), "chaque etape() et chaque phase sont horodatées");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ cadenceur : le retard subi sur Mac est rattrapé, jamais plus vite que le plan humain ; Windows inchangé");
