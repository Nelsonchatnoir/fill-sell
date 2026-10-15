// ═══════════════════════════════════════════════════════════════════════════
// APERÇU DE LA REPUBLICATION AUTOMATIQUE (15/10, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Un compte qui n'a pas le droit d'activer (palier sous Pro) entre dans
// l'écran et règle ses créneaux « pour comprendre ce que c'est ». Le serveur
// refuse toute écriture à ce compte (`auto_reserve_pro`) : le brouillon vit
// donc SUR L'APPAREIL, par plateforme. S'il passe Pro, l'écran repart de ce
// brouillon et l'activation l'envoie entier. Commodité seulement : une lecture
// impossible (navigation privée, stockage bloqué) rend `null`, jamais une erreur.
const CLE = (pf) => `fs_repub_apercu_${String(pf || 'vinted')}`;
const CHAMPS = ['creneau', 'de', 'a', 'jours', 'plafond_jour', 'age_jours', 'ordre'];

export function lireBrouillonApercu(pf) {
  try {
    const brut = globalThis.localStorage?.getItem(CLE(pf));
    if (!brut) return null;
    const o = JSON.parse(brut);
    if (!o || typeof o !== 'object') return null;
    const propre = {};
    for (const k of CHAMPS) if (o[k] != null) propre[k] = o[k];
    if (propre.jours && (!Array.isArray(propre.jours) || propre.jours.length === 0)) delete propre.jours;
    return Object.keys(propre).length ? propre : null;
  } catch {
    return null;
  }
}

export function garderBrouillonApercu(pf, brouillon) {
  try {
    const propre = {};
    for (const k of CHAMPS) if (brouillon?.[k] != null) propre[k] = brouillon[k];
    globalThis.localStorage?.setItem(CLE(pf), JSON.stringify(propre));
  } catch { /* stockage indisponible : l'aperçu marche quand même */ }
}
