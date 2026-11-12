// ═══════════════════════════════════════════════════════════════════════════
// UN MAIL MARKETING PORTE TOUJOURS UN LIEN DE DÉSINSCRIPTION VISIBLE (12/11/2026, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Constat (mail d'annonce des formules avec Cloud) : envoi-ponctuel posait l'en-tête List-Unsubscribe One-Click (la
// porte envoyerEmail, _shared/desinscription.ts) mais aucun lien dans le corps ; et la page /desinscription exige le
// jeton de la personne (?t=) — sans lui, elle répond « invalide ». Une variable écrite à la main ne suffit donc pas.
//
// RÈGLE (envoi-ponctuel, catégorie 'marketing', envoi réel) : pour CHAQUE destinataire, le lien personnel
// lienDesinscription(email, user_id) remplace {{lien_desinscription}} dans le HTML ; si le HTML n'affiche toujours pas ce
// lien (gabarit sans la variable), un pied « Se désinscrire » visible est ajouté (avant </body>, sinon à la fin). Le
// lien ne peut pas être calculé → la personne n'est PAS servie (jamais un mail marketing sans désinscription).
// 'support' : inchangé. Simulation : aucun jeton créé (lien d'exemple, LIEN_SIMULATION).
// Pur (Node + Deno) : scripts/lien-desinscription-visible-selftest.mjs.

export const VARIABLE_LIEN_DESINSCRIPTION = "{{lien_desinscription}}";
export const LIEN_SIMULATION = "https://fillsell.app/desinscription?t=SIMULATION";

const echapperAttribut = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Le pied visible ajouté quand le gabarit n'affiche pas déjà le lien. */
export function piedDesinscription(lien) {
  const href = echapperAttribut(lien);
  return `<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#6b7280;text-align:center">`
    + `Tu ne veux plus recevoir nos nouvelles ? <a href="${href}" style="color:#6b7280;text-decoration:underline">Se désinscrire</a></p>`;
}

/**
 * Le HTML tel qu'il part : {{lien_desinscription}} remplacé par le lien de la personne ; si ce lien n'y figure toujours
 * pas, le pied visible ajouté. Ne fait rien d'autre (aucun autre caractère du gabarit ne change).
 * @param {string} html
 * @param {string} lien
 * @returns {string}
 */
export function avecLienDesinscription(html, lien) {
  const l = String(lien ?? "").trim();
  if (!l) throw new Error("avecLienDesinscription : lien vide");
  const h = String(html ?? "").split(VARIABLE_LIEN_DESINSCRIPTION).join(echapperAttribut(l));
  if (h.includes(echapperAttribut(l)) || h.includes(l)) return h;
  const pied = piedDesinscription(l);
  const i = h.search(/<\/body\s*>/i);
  return i >= 0 ? h.slice(0, i) + pied + h.slice(i) : h + pied;
}
