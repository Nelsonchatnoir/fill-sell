// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT BEEBS « SUPPRIMÉ » PORTE LA LISTE DU PROPRIÉTAIRE (03/10)
// ═══════════════════════════════════════════════════════════════════════════
// Bouilloire de Nico (Beebs 34097677, retrait 451c9bc4, 03/10 10:12) : premier
// essai sur une page sans bouton propriétaire, second essai qui confirme, puis
// « supprimé » sans que rien n'ait été relu — et la fiche du job gardait le
// diagnostic du premier essai (« bouton ABSENT »). Beebs supprime de façon
// asynchrone, et sa page publique en 404 est AUSSI celle d'une annonce en
// vérification : depuis le 01/09, 83 retraits Beebs clos sur un clic et 5 sur
// la page publique, aucun relu.
// LA RÈGLE (« un retrait n'est jamais clos sans preuve ») :
//   · l'extension ≥ BUILD_BEEBS_PREUVE_RETRAIT relit « Mes annonces » (les deux
//     onglets, en entier) après la confirmation et rend preuve_retrait
//     { source: 'mes_annonces', absente: true, numero } — sans elle, le
//     « supprimé » est refusé et le job revient en vérification ;
//   · un poste plus ancien ne sait pas prouver : son « supprimé » est accepté
//     (le refuser bloquerait tout le parc) mais MARQUÉ
//     retrait_sans_preuve_proprietaire, et les relevés Beebs complets
//     tranchent ensuite (jugerRetraitBeebsParReleves) : revue en ligne après
//     le retrait → le retrait repart ; absente de deux relevés complets →
//     preuve écrite.
// Pur, sans import réseau (Deno + Node).

import { releveComplet } from "./retrait-introuvable.js";

// Horodatage du correctif de l'extension (0.6.90) : tout build postérieur le porte.
export const BUILD_BEEBS_PREUVE_RETRAIT = "2026-10-03T11:00:00Z";

const buildMs = (hb) => {
  const m = String(hb ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
  return m ? Date.parse(m[1]) : NaN;
};
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/**
 * La preuve écrite par l'extension :
 *   · la liste du propriétaire, relue, sans l'annonce (source « mes_annonces ») ;
 *   · (24/10, extension 0.6.133) la fiche produit du numéro EXACT qui dit VENDUE (source « page_produit »,
 *     disponibilité schema.org « SoldOut ») : nos retraits choisissent « Vendu via une autre plateforme », Beebs passe
 *     alors l'annonce « Vendu » — plus achetable — et la garde dans « Mes annonces » ; la preuve d'absence n'arrivait
 *     jamais (retraits « en retard » depuis le 14/10, annonces pourtant « Vendu » sur Beebs).
 */
export function preuveRetraitBeebsValide(pf) {
  const p = pf && typeof pf === "object" ? pf.preuve_retrait : null;
  if (!p || typeof p !== "object" || !/^\d{6,}$/.test(String(p.numero ?? ""))) return false;
  // (25/10) Une preuve par l'annonce elle-même « deux constats 404 » se vérifie ici aussi : deux constats au
  // moins, le dernier 6 h au moins après le premier (jamais crue sur parole).
  if (p.source === "mes_annonces" && p.absente === true) {
    return p.annonce?.regle === REGLE_DEUX_CONSTATS_404 ? deuxConstats404Prouvent(p.annonce?.constats_404) : true;
  }
  return p.source === "page_produit" && p.vendue === true && p.disponibilite === "SoldOut";
}

// ═══════════════════════════════════════════════════════════════════════════
// (25/10, boncoin59300) UNE PAGE 404 CONSTATÉE DEUX FOIS À 6 H D'ÉCART PROUVE LE RETRAIT
// ═══════════════════════════════════════════════════════════════════════════
// Retrait d87c8614 (annonce 33747519, compte de 1 103+ annonces) : « en ligne » ne rend que 60 annonces, « en
// vérification » lue en entier ne la porte pas, sa page rend « 404 - Oups, page perdue ! » sans fiche ni bouton
// (relevé le 25/10 au matin) — mais l'index public la porte encore (relevé du 25/10 00:37) : 20 essais depuis le
// 24/10 21:45, jamais conclus, et le message disait « elle reste en vente sur Beebs » (faux : rien d'achetable).
// LA RÈGLE (extension, beebs.js jugerConstats404Beebs ; retrait seulement) : page 404 sans fiche + absente de
// « en vérification » lue en entier = un CONSTAT, gardé sur le job (platform_fields.beebs_404_constats) ; deux
// constats espacés d'au moins 6 h PROUVENT l'absence, même si l'index la porte encore (il est en retard : il ne
// voit ni les ventes ni les retraits). Ici : la preuve se revérifie, et l'attente du second constat est une
// ATTENTE (pas un essai), avec un message vrai et daté.
export const REGLE_DEUX_CONSTATS_404 = "deux_constats_404";
export const BEEBS_404_ECART_MIN_MS = 6 * 3600_000;

/** Les dates (ISO) de deux constats ou plus, dont le dernier à 6 h au moins du premier ? */
export function deuxConstats404Prouvent(dates) {
  const t = (Array.isArray(dates) ? dates : []).map(ms).filter(Number.isFinite).sort((a, b) => a - b);
  return t.length >= 2 && t[t.length - 1] - t[0] >= BEEBS_404_ECART_MIN_MS;
}

/** Les constats « page 404 » valides d'un job (platform_fields.beebs_404_constats), du plus ancien au plus récent. */
export function constats404Beebs(pf) {
  const brut = pf && typeof pf === "object" ? pf.beebs_404_constats : null;
  return (Array.isArray(brut) ? brut : [])
    .filter((c) => c && c.page_http === 404 && c.produit === false && c.en_verification === "complete" && Number.isFinite(ms(c.le)))
    .sort((a, b) => ms(a.le) - ms(b.le));
}

/** L'attente du second constat : { premier, prochain } (ISO) — au plus tôt 6 h (et 2 min) après le premier, jamais dans moins de 30 min. */
export function attente404Beebs(constats, maintenant = Date.now()) {
  const premier = ms(constats?.[0]?.le);
  const p = Number.isFinite(premier) ? premier : maintenant;
  const prochain = Math.max(maintenant + 30 * 60_000, p + BEEBS_404_ECART_MIN_MS + 2 * 60_000);
  return { premier: new Date(p).toISOString(), prochain: new Date(prochain).toISOString() };
}

const quandFr = (t) => {
  const d = new Date(t);
  return `le ${d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })} à `
    + d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", "h");
};

/** Le message vrai d'un retrait dont la page est un 404 constaté, en attente du second constat. */
export function messageRetraitBeebs404(constats, maintenant = Date.now()) {
  const { premier, prochain } = attente404Beebs(constats, maintenant);
  const n = Array.isArray(constats) ? constats.length : 0;
  return `Beebs ne montre plus cette annonce : sa page est introuvable depuis ${quandFr(premier)} (404, constaté ${n > 1 ? `${n} fois` : "une fois"}) `
    + "et elle n'est pas dans tes annonces en vérification — elle n'est plus achetable ; seul l'index public de Beebs, en retard, la porte encore. "
    + `FillSell la relit à partir du ${quandFr(prochain).replace(/^le /, "")} et clôt alors le retrait — rien à faire.`;
}

/**
 * Que faire d'un « supprimé » Beebs ?
 *   'ok'      — la preuve est là ;
 *   'refuser' — le poste sait prouver et n'a pas prouvé : le job revient en vérification ;
 *   'marquer' — poste ancien : accepté, marqué, vérifié ensuite par les relevés.
 */
export function verdictClotureRetraitBeebs(pf, handlerBuild) {
  if (preuveRetraitBeebsValide(pf)) return "ok";
  const b = buildMs(handlerBuild);
  if (Number.isFinite(b) && b >= Date.parse(BUILD_BEEBS_PREUVE_RETRAIT)) return "refuser";
  return "marquer";
}

export const MESSAGE_RETRAIT_BEEBS_EN_VERIFICATION =
  "Retrait Beebs envoyé, en vérification : FillSell relit « Mes annonces » sur ton ordinateur avant de le dire retiré. Rien à faire de ton côté.";

/** Le numéro Beebs d'un retrait (identifiant, ou lien /p/<n>). */
export function numeroRetraitBeebs(job) {
  const brut = String(job?.platform_listing_id ?? "").trim();
  if (/^\d{6,}$/.test(brut)) return brut;
  const m = String(job?.listing_url ?? "").match(/\/p\/(\d{6,})(?:[-/?#]|$)/);
  return m ? m[1] : null;
}

/**
 * Un retrait Beebs clos SANS preuve (poste ancien) face aux relevés complets.
 * @param {any} job  action='delete', status='deleted', platform_fields.retrait_sans_preuve_proprietaire.le
 * @param {{ releves?: Array<any>, annonces?: Array<any> }} ctx
 *   releves : relevés Beebs (kind 'annonces') — status, started_at, items_vus, total_entries, erreur ;
 *   annonces : lignes annonces_plateforme Beebs du compte pour ce numéro — listing_id, vu_le, disparu_le, retiree_le, statut_plateforme.
 * @returns {null | { verdict: 'rouvrir'|'prouve', numero: string, releves: string[] }}
 */
export function jugerRetraitBeebsParReleves(job, { releves = [], annonces = [] } = {}) {
  if (!job || job.platform !== "beebs" || job.action !== "delete") return null;
  const pf = job.platform_fields ?? {};
  const t0 = ms(pf.retrait_sans_preuve_proprietaire?.le);
  const numero = numeroRetraitBeebs(job);
  if (!numero || !Number.isFinite(t0) || preuveRetraitBeebsValide(pf)) return null;
  // Marge de 2 min : la propagation Beebs n'est pas instantanée.
  const complets = (Array.isArray(releves) ? releves : [])
    .filter((r) => releveComplet(r) && ms(r.started_at) > t0 + 2 * 60_000)
    .sort((a, b) => ms(b.started_at) - ms(a.started_at));
  if (!complets.length) return null;
  const plusAncien = ms(complets[Math.min(complets.length, 2) - 1].started_at);
  const dates = complets.slice(0, 2).map((r) => String(r.started_at));
  const revue = (Array.isArray(annonces) ? annonces : []).some((a) =>
    String(a?.listing_id ?? "").trim() === numero && ms(a.vu_le) >= plusAncien - 60_000
    && !a.disparu_le && !a.retiree_le && !/^(vendue|retiree|retirée)$/i.test(String(a.statut_plateforme ?? "")));
  if (revue) return { verdict: "rouvrir", numero, releves: dates };
  if (complets.length >= 2) return { verdict: "prouve", numero, releves: dates };
  return null;
}
