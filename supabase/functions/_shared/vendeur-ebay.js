// ══════════════════════════════════════════════════════════════════════════
// eBay (EXTENSION) : LE COMPTE N'EST PAS ENCORE OUVERT À LA VENTE — UN MUR PAR
// COMPTE, UN SEUL ÉCLAIREUR (25/10, R3)
// ══════════════════════════════════════════════════════════════════════════
// Fleur de Lotus (22-23/10, extension 0.6.128) : quatre publications eBay par
// l'extension (c64e5596, 93012c53, 7f97e131, 00f81af0) ; trois finissent sur
// onboardweb.ebay.fr/onboard-revamped, l'inscription vendeur d'eBay — chacune
// après avoir rempli tout le formulaire, cliqué trois fois et soumis le
// brouillon. update-job-status reconnaît ce mur sur CHAQUE job depuis le 21/09
// (compte_vendeur_inactif, page d'inscription en fin de travail) ; rien ne
// retenait les AUTRES : chaque publication servie retapait le même mur. C'est
// UN geste sur le COMPTE, pas un par article — patron de _shared/vendeur-depop.js.
//
// LA RÈGLE (une seule source, lue par get-pending-jobs et update-job-status) :
//   · le mur VU : un job eBay dont compte_vendeur_inactif porte la page
//     d'inscription (tab_url) et sa date (derniere), depuis moins de 30 jours ;
//     jamais une retenue (retenue_le), jamais la mise à niveau /fpa/upgrade
//     (mur: "mise_a_niveau" — son pré-vol l'arrête déjà AVANT tout formulaire) ;
//   · une publication eBay (toute voie) faite APRÈS le dernier mur VU prouve que
//     le compte vend : plus rien n'est retenu, et les tâches en attente repartent
//     (espacées de 45 s) ;
//   · tant que le mur tient, get-pending-jobs ne sert AUCUNE publication ni
//     republication eBay par l'extension du compte, sauf UN éclaireur : la tâche
//     relancée par la personne il y a moins de 30 min, sinon la plus ancienne
//     quand l'écart du barème est passé depuis le dernier mur ou éclaireur ; les
//     autres passent en attente du même geste (needs_user
//     `ebay_compte_vendeur_inactif`, compte_vendeur_inactif.retenue_le), avec le
//     message vrai ;
//   · ni les retraits, ni la voie API (son propre circuit, ebay-api-worker) ne
//     sont jamais retenus.
// L'annonce n'est jamais touchée : une publication retenue n'a encore rien créé.
// Pur (Deno + Node + Vite), sans import.

export const SOURCE_VENDEUR_EBAY = "ebay_compte_vendeur_inactif"; // = SOURCE_EBAY_COMPTE_VENDEUR_INACTIF (textes-jobs.ts)
export const FENETRE_MUR_EBAY_MS = 30 * 86_400_000;
// Écart entre deux éclaireurs automatiques (minutes), selon le nombre déjà lancés pour le compte.
export const DELAIS_ECLAIREUR_EBAY_MIN = Object.freeze([60, 180, 360, 720, 1440]);
export const ECLAIREUR_FRAIS_MS = 30 * 60_000;
// (05/11 17:25, décision de Nico) Plus aucun espacement après la levée d'une pause : rythme normal (était 45 s par tâche).
export const ESPACEMENT_REPRISE_MS = 0;
export const RETENUES_PAR_PASSAGE = 40;

export const MESSAGE_VENDEUR_EBAY =
  "Ton compte eBay doit d'abord être ouvert à la vente (inscription vendeur eBay) : eBay a renvoyé une de tes publications " +
  "vers son inscription vendeur. Termine-la une seule fois sur ebay.fr, sur ton ordinateur : tes publications eBay repartiront " +
  "ensuite toutes seules (ou relance celle-ci quand c'est fait). Rien n'a été publié.";

// (06/11, Nico, point 7 — ayadi007) Le même mur sur l'onboarding des PAIEMENTS eBay (compte_vendeur_inactif.mur =
// « paiements », _shared/ebay-page-vendeur.ts) : les tâches retenues derrière lui disent CE geste-là. Même texte que
// paiementsVendeurEbay("publish") de textes-jobs.ts (ce module reste sans import).
export const MESSAGE_PAIEMENTS_EBAY =
  "eBay bloque la mise en vente : la configuration des paiements de ton compte vendeur eBay est à terminer (eBay a " +
  "affiché sa page d'état du compte de paiement au moment de publier). Connecte-toi à eBay sur ton ordinateur, ouvre " +
  "Mon eBay → Paiements et fais ce qu'eBay demande (identité, coordonnées bancaires) ; si eBay affiche une erreur, " +
  "contacte le service client eBay. Rien n'a été publié ; la publication repartira ensuite.";

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const civ = (job) => { const c = pfDe(job).compte_vendeur_inactif; return c && typeof c === "object" ? c : {}; };

/** Une publication ou republication eBay par l'EXTENSION (jamais un retrait, jamais la voie API). */
export function estDepotEbayExtension(job) {
  return !!job && job.platform === "ebay" && ["publish", "republish"].includes(String(job.action ?? "publish"))
    && String(job.voie ?? "extension") !== "api";
}

// La date (ms) du mur VU sur ce job, sans fenêtre : NaN sinon.
function murVu(job) {
  if (!job || job.platform !== "ebay") return NaN;
  const c = civ(job);
  if (c.mur === "mise_a_niveau" || !String(c.tab_url ?? "").trim()) return NaN;
  return ms(c.derniere ?? c.depuis);
}

/** La date (ms) du mur « inscription vendeur » VU sur ce job depuis moins de 30 jours, NaN sinon. */
export function murVendeurEbayVuLe(job, maintenant = Date.now()) {
  const t = murVu(job);
  return Number.isFinite(t) && maintenant - t < FENETRE_MUR_EBAY_MS ? t : NaN;
}

/** Le message des tâches retenues : celui du DERNIER mur vu du compte (paiements ou inscription vendeur). */
export function messageRetenueVendeurEbay(jobs, maintenant = Date.now()) {
  let dernier = null; let t = -Infinity;
  for (const j of Array.isArray(jobs) ? jobs : []) { const v = murVendeurEbayVuLe(j, maintenant); if (Number.isFinite(v) && v > t) { t = v; dernier = j; } }
  return dernier && civ(dernier).mur === "paiements" ? MESSAGE_PAIEMENTS_EBAY : MESSAGE_VENDEUR_EBAY;
}

/** Le dernier mur VU parmi ces jobs (ms), -Infinity sinon. */
export function dernierMurVendeurEbay(jobs, maintenant = Date.now()) {
  const t = (Array.isArray(jobs) ? jobs : []).map((j) => murVendeurEbayVuLe(j, maintenant)).filter(Number.isFinite);
  return t.length ? Math.max(...t) : -Infinity;
}

/** Une publication eBay (toute voie) faite après `depuisMs` : le compte vend. Un relevé ne prouve rien. */
export function compteEbayVendDepuis(jobs, depuisMs) {
  return (Array.isArray(jobs) ? jobs : []).some((j) => j && j.platform === "ebay"
    && ["publish", "republish"].includes(String(j.action ?? "publish"))
    && ["published", "sold"].includes(String(j.status ?? ""))
    && String(j.handler_build ?? "") !== "releve-annonces"
    && ms(j.published_at) > depuisMs);
}

/** Cette tâche attend-elle l'ouverture du compte à la vente (mur vu, ou publication retenue) ? */
export function attendVendeurEbay(job) {
  if (!job || job.status !== "needs_user" || !estDepotEbayExtension(job)) return false;
  const pf = pfDe(job);
  if (pf.needsUserField || pf.needsUserFields) return false; // une vraie question de champ garde sa ligne
  if (String(pf.needs_user_source ?? "") !== SOURCE_VENDEUR_EBAY) return false;
  const c = civ(job);
  if (c.mur === "mise_a_niveau") return false; // l'autre mur : son pré-vol, son message
  const pose = Math.max(ms(c.retenue_le) || -Infinity, murVu(job) || -Infinity);
  if (!Number.isFinite(pose)) return false;
  const v = pf.vendeur_ebay && typeof pf.vendeur_ebay === "object" ? pf.vendeur_ebay : {};
  return !((ms(v.reprise_le) || -Infinity) > pose); // relâchée APRÈS : plus ce mur
}

/** Les tâches d'un compte qui attendent ce geste, la plus ancienne d'abord. */
export function attentesVendeurEbay(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter(attendVendeurEbay)
    .sort((a, b) => (ms(a.created_at) || 0) - (ms(b.created_at) || 0));
}

/** Relancée par la personne (ou éclaireur posé) il y a moins de 30 min : elle reste servie malgré le mur. */
export function estEclaireurEbayFrais(job, maintenant = Date.now()) {
  if (!estDepotEbayExtension(job)) return false;
  const pf = pfDe(job);
  const t = Math.max(ms(pf.vendeur_ebay?.eclaireur_le) || -Infinity, ms(pf.derniere_relance_manuelle) || -Infinity);
  return Number.isFinite(t) && maintenant - t < ECLAIREUR_FRAIS_MS;
}

/**
 * La décision de get-pending-jobs pour les dépôts eBay (extension) servis à ce
 * poll : { servir: job|null, retenir: job[], eclaireurAuto: boolean }.
 * `servis` = les dépôts eBay de la file ; `compte` = les jobs eBay du compte
 * lus pour le mur (murs, éclaireurs, publications récentes).
 */
export function decisionVendeurEbay(servis, compte, maintenant = Date.now()) {
  const depots = (Array.isArray(servis) ? servis : []).filter(estDepotEbayExtension);
  const tous = Array.isArray(compte) ? compte : [];
  const mur = dernierMurVendeurEbay(tous, maintenant);
  if (!depots.length || !Number.isFinite(mur) || compteEbayVendDepuis(tous, mur)) return { servir: null, retenir: [], eclaireurAuto: false };
  const frais = depots.find((j) => estEclaireurEbayFrais(j, maintenant)) ?? null;
  if (frais) return { servir: frais, retenir: depots.filter((j) => j !== frais), eclaireurAuto: false };
  const lances = tous.concat(depots).map((j) => ms(pfDe(j).vendeur_ebay?.eclaireur_le)).filter(Number.isFinite);
  const n = Math.max(0, ...tous.concat(depots).map((j) => Number(pfDe(j).vendeur_ebay?.n) || 0));
  const dernier = Math.max(mur, ...lances);
  const ecart = DELAIS_ECLAIREUR_EBAY_MIN[Math.min(n, DELAIS_ECLAIREUR_EBAY_MIN.length - 1)] * 60_000;
  if (maintenant - dernier >= ecart) {
    const plusAncien = [...depots].sort((a, b) => (ms(a.created_at) || 0) - (ms(b.created_at) || 0))[0];
    return { servir: plusAncien, retenir: depots.filter((j) => j !== plusAncien), eclaireurAuto: true };
  }
  return { servir: null, retenir: depots, eclaireurAuto: false };
}

const CLES_ATTENTE = ["needs_user_source", "needs_user_sans_motif", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le",
  "needs_user_vu_erreur", "next_action_after", "processing_since"];

/** Les platform_fields d'une publication RETENUE (jamais un mur VU : tab_url et derniere ne sont pas touchés). */
export function champsRetenueVendeurEbay(pf, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["next_action_after", "processing_since"]) delete out[k];
  out.needs_user_source = SOURCE_VENDEUR_EBAY;
  out.compte_vendeur_inactif = { ...(out.compte_vendeur_inactif && typeof out.compte_vendeur_inactif === "object" ? out.compte_vendeur_inactif : {}), retenue_le: maintenantIso };
  return out;
}

/** Les platform_fields de l'éclaireur automatique servi (le barème compte les éclaireurs du compte). */
export function champsEclaireurVendeurEbay(pf, maintenantIso) {
  const out = { ...(pf ?? {}) };
  const v = out.vendeur_ebay && typeof out.vendeur_ebay === "object" ? out.vendeur_ebay : {};
  out.vendeur_ebay = { ...v, eclaireur_le: maintenantIso, n: (Number(v.n) || 0) + 1 };
  return out;
}

/** Les platform_fields d'une tâche relâchée (rang k : 45 s × k). */
export function champsRepriseVendeurEbay(pf, k, maintenantMs, par) {
  const out = { ...(pf ?? {}) };
  for (const c of CLES_ATTENTE) delete out[c];
  out.needsUserAttempts = 0;
  out.next_action_after = new Date(maintenantMs + k * ESPACEMENT_REPRISE_MS).toISOString();
  const { n: _n, ...reste } = out.vendeur_ebay && typeof out.vendeur_ebay === "object" ? out.vendeur_ebay : {};
  out.vendeur_ebay = { ...reste, reprise_le: new Date(maintenantMs).toISOString(), par };
  return out;
}

// ── (06/11, Nico, point 5 — ayadi007) L'ÉCLAIREUR PRIS DANS LES TÂCHES EN ATTENTE ─────────────────────────────────────
// decisionVendeurEbay (get-pending-jobs) ne choisit l'éclaireur que parmi les dépôts eBay EN FILE : quand toutes les
// publications du compte attendent déjà le geste (needs_user), il n'y en a plus aucun — rien ne repartait jamais, même
// le compte prêt (mesuré le 06/11 : 4 comptes, 25 tâches, dont certaines depuis le 28/10). handler-watch (patron de
// _shared/vendeur-depop.js) : la preuve (une publication eBay après le dernier mur) relâche tout ; sinon la plus
// ancienne repart seule, au barème (DELAIS_ECLAIREUR_EBAY_MIN depuis le dernier mur ou éclaireur), jamais deux à la
// fois, jamais quand un dépôt eBay du compte est déjà en file (get-pending-jobs s'en charge).

/**
 * @param {any[]} jobs les tâches eBay du compte en attente (needs_user)
 * @param {number} maintenant
 * @param {any[]} autres les autres jobs eBay récents du compte (en file, en cours, publiés)
 * @returns {any|null} la tâche à relancer comme éclaireur, ou null
 */
export function eclaireurVendeurEbayEnAttente(jobs, maintenant = Date.now(), autres = []) {
  const l = attentesVendeurEbay(jobs);
  if (!l.length) return null;
  const aut = Array.isArray(autres) ? autres : [];
  if (aut.some((j) => estDepotEbayExtension(j) && ["pending", "processing"].includes(String(j.status ?? "")))) return null;
  const tous = [...l, ...aut];
  const mur = dernierMurVendeurEbay(tous, maintenant);
  if (!Number.isFinite(mur) || compteEbayVendDepuis(tous, mur)) return null;
  const n = Math.max(0, ...tous.map((j) => Number(pfDe(j).vendeur_ebay?.n) || 0));
  const lances = tous.map((j) => ms(pfDe(j).vendeur_ebay?.eclaireur_le)).filter(Number.isFinite);
  const dernier = Math.max(mur, ...lances);
  const ecart = DELAIS_ECLAIREUR_EBAY_MIN[Math.min(n, DELAIS_ECLAIREUR_EBAY_MIN.length - 1)] * 60_000;
  return maintenant - dernier >= ecart ? l[0] : null;
}

/** Les platform_fields de l'éclaireur relancé depuis l'attente (pending ; get-pending-jobs le sert : estEclaireurEbayFrais). */
export function champsEclaireurEnAttenteVendeurEbay(pf, maintenantIso, par) {
  const out = { ...(pf ?? {}) };
  for (const c of CLES_ATTENTE) delete out[c];
  out.needsUserAttempts = 0;
  const v = out.vendeur_ebay && typeof out.vendeur_ebay === "object" ? out.vendeur_ebay : {};
  out.vendeur_ebay = { ...v, eclaireur_le: maintenantIso, n: (Number(v.n) || 0) + 1, par };
  return out;
}
