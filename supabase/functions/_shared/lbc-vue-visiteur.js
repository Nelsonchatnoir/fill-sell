// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LA VUE ACHETEUR D'UNE ANNONCE À RETIRER EST UN MUR DE CONNEXION (26/10, Ritthik 2003)
// ═══════════════════════════════════════════════════════════════════════════
// Lecteur DVD LG 3264507731 (vendu ailleurs) : trois essais « Contrôle « Supprimer l'annonce » introuvable », annonce
// en ligne. Le diagnostic de l'extension disait tout : actions relevées ["RiseFit", …, "Acheter", "Faire une offre",
// "Contacter"], « Gérer » absent — la VUE VISITEUR (relevé du 14/09 : le propriétaire voit « Modifier / Supprimer /
// Mettre en pause »). L'ordinateur n'était pas connecté au compte Leboncoin qui a publié l'annonce (aucun relevé
// Leboncoin de ce compte depuis le 18/09). Ce n'est pas un contrôle manquant : c'est une attente de connexion,
// sans tentative consommée, avec la phrase vraie. Lu sur le diagnostic des extensions d'avant la 0.6.147 ; la
// 0.6.147 le dit elle-même (« Connexion Leboncoin requise »). Pur.

const ACTIONS_ACHETEUR = /^(?:acheter|faire une offre|contacter)$/i;
const ACTIONS_PROPRIETAIRE = /modifier|supprimer|g[ée]rer|mettre en pause/i;

/** { vendeur, actions } quand le diagnostic d'un retrait Leboncoin montre la vue acheteur ; sinon null. */
export function vueVisiteurLbc(diagnostic) {
  const d = String(diagnostic ?? "");
  if (!/contr[ôo]le Supprimer introuvable sur la page de l'annonce|^vue acheteur sur la page de l'annonce/i.test(d)) return null;
  const m = d.match(/actions relevées: (\[[^\]]*\])/);
  let actions = [];
  try { actions = JSON.parse(m?.[1] ?? "[]"); } catch { actions = []; }
  if (!Array.isArray(actions)) return null;
  actions = actions.map((x) => String(x ?? "").trim()).filter(Boolean);
  const acheteur = actions.some((x) => ACTIONS_ACHETEUR.test(x)) && !actions.some((x) => ACTIONS_PROPRIETAIRE.test(x));
  if (!acheteur || /« Gérer » présent/.test(d)) return null;
  const vendeur = actions.find((x) => !ACTIONS_ACHETEUR.test(x) && !/^réactif$/i.test(x) && !/^\d/.test(x) && !/annonces?$/i.test(x)) ?? null;
  return { vendeur: vendeur ? vendeur.slice(0, 40) : null, actions };
}

/**
 * La phrase vraie. Préfixe « En attente de ta connexion à » : ANCRE lue par handler-watch et get-pending-jobs.
 * @param {string | null} [vendeur]
 */
export function messageVueVisiteurLbc(vendeur = null) {
  return "En attente de ta connexion à Leboncoin dans ton navigateur : ton article est vendu mais son annonce est encore "
    + "en ligne sur Leboncoin (risque de double vente). Leboncoin te la montre comme à un acheteur"
    + (vendeur ? ` (vendeur affiché « ${vendeur} »)` : "")
    + " : connecte-toi au compte Leboncoin qui l'a publiée, le retrait repartira tout seul.";
}

/** Délai avant la prochaine sonde, par observation — l'échelle de l'extension (delaiAttenteSessionMin, background.js). */
export function delaiVueVisiteurMin(observations) {
  const n = Number(observations) || 0;
  if (n <= 1) return 3;
  if (n === 2) return 6;
  if (n === 3) return 10;
  return n >= 10 ? 360 : n >= 7 ? 180 : 60;
}
