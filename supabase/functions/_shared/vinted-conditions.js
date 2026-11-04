// ═══════════════════════════════════════════════════════════════════════════
// VINTED DEMANDE D'ACCEPTER SES CONDITIONS D'UTILISATION (04/11, smaillachkar)
// ═══════════════════════════════════════════════════════════════════════════
// Compte Vinted neuf (inscrit le 03/11) : /items/new redirigeait vers /terms_and_conditions?ref_url=%2Fitems%2Fnew
// environ 3 s après son chargement. La navigation fermait le canal du remplissage (« A listener indicated an
// asynchronous response by returning true, but the message channel closed… ») ou la garde de page répondait « refus
// passager » : 5 erreurs archivées sur la même annonce, aucun mot sur la vraie cause. Seul compte en 60 jours.
// Règle : c'est un geste de la personne, une fois — attente nommée « vinted_conditions_a_accepter » (Relancer),
// jamais une reprise. L'extension le nomme (content-scripts/vinted.js, background.js : conditionsVintedAAccepter) ;
// update-job-status le nomme aussi pour les postes d'avant, d'après l'adresse relevée par l'essai.
// Pur (Deno + Node), sans import.

export const CGU_VINTED_RE = /^https:\/\/(?:www\.)?vinted\.[a-z.]+\/terms_and_conditions(?:[/?#]|$)/i;
// Le relevé doit être celui de l'essai qui rend son verdict : quelques minutes, et jamais d'avant une relance à la main
// (la personne vient peut-être d'accepter les conditions).
export const FRAICHEUR_RELEVE_MS = 5 * 60_000;

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const frais = (quand, maintenant, relanceLe = NaN) => {
  const t = Date.parse(String(quand ?? ""));
  if (Number.isFinite(relanceLe) && Number.isFinite(t) && t <= relanceLe) return false;
  return Number.isFinite(t) && maintenant - t < FRAICHEUR_RELEVE_MS && t - maintenant < 60_000;
};

/**
 * L'adresse des conditions d'utilisation Vinted relevée par l'essai qui rend son verdict (moins de 5 min, après la
 * dernière relance à la main), ou null. Témoins DATÉS seulement : la fenêtre de travail en fin d'essai
 * (work_window_state.at_end.tab_url), la coupure du canal (canal_coupe_diag.url / url_en_chargement), le diagnostic de
 * la garde de page quand il porte son heure (last_diagnostic.url — celui de la 0.6.169 n'en a pas : il reste sur le job
 * d'un essai à l'autre, il ne prouve rien seul).
 */
export function urlConditionsVintedRelevee(pf, maintenant = Date.now()) {
  const p = objet(pf) ?? {};
  const d = objet(p.last_diagnostic);
  const fin = objet(objet(p.work_window_state)?.at_end);
  const cc = objet(p.canal_coupe_diag);
  const relance = Date.parse(String(p.derniere_relance_manuelle ?? ""));
  const candidats = [
    d && frais(d.at, maintenant, relance) ? d.url : null,
    fin && frais(fin.at, maintenant, relance) ? fin.tab_url : null,
    cc && frais(cc.le, maintenant, relance) ? cc.url : null,
    cc && frais(cc.le, maintenant, relance) ? cc.url_en_chargement : null,
  ];
  return candidats.map((u) => String(u ?? "")).find((u) => CGU_VINTED_RE.test(u)) ?? null;
}

/** Le message (le domaine de la boutique, lu dans l'adresse relevée ; vinted.fr par défaut). */
export function messageConditionsVinted(url) {
  let domaine = "vinted.fr";
  try { domaine = new URL(String(url)).host.replace(/^www\./, "") || domaine; } catch { /* vinted.fr */ }
  return `Vinted te demande d'accepter ses conditions d'utilisation avant de pouvoir déposer une annonce. Ta connexion n'est pas en cause : ouvre ${domaine} sur ton ordinateur, accepte les conditions affichées, puis relance. Rien n'a été publié ni retiré.`;
}
