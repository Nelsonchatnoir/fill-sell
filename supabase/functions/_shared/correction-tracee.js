// ══════════════════════════════════════════════════════════════════════════
// UNE CORRECTION TRACÉE DE LA COPIE PASSE DEVANT LA VALEUR QUE L'ANNONCE AFFICHE ENCORE (26/10 nuit, point 12)
// ══════════════════════════════════════════════════════════════════════════
// Cas : chaouidz, Beebs 34229052 — pointure « 16 » (réponse fausse à une question du 24/10) au lieu de 31. La copie
// stockée a été corrigée par script (scripts/reparations/20261026_copies_valeurs_fausses.sql), avec sa trace
// `platform_fields.correction_tracee` { cle, avant, apres, source, motif, annonce, le, par }. Mais une republication
// Beebs remet l'annonce « telle qu'elle est » : la taille que l'annonce AFFICHE l'emporte sur la copie (règle du 03/10,
// nivake03 — get-pending-jobs, et beebs.js sur la page) — elle aurait remis « 16 ».
// Règle : la correction tracée tient tant que l'annonce affiche encore l'ANCIENNE valeur (`avant`) et que la copie
// porte encore la nouvelle (`apres`). Si la personne a changé la valeur sur la plateforme depuis, l'annonce l'emporte
// de nouveau (jamais par-dessus un geste de la personne). ES module pur (Deno + Node + Vite), sans dépendance.

const plier = (v) => String(v ?? "").normalize("NFC").trim().toLowerCase();

/**
 * @param {object|null} pf          platform_fields de la copie
 * @param {string} cle              « taille », « age »…
 * @param {unknown} valeurAffichee  la valeur que l'annonce en ligne affiche (relevé ou page)
 * @returns {boolean} true = garder la valeur de la copie
 */
export function correctionTient(pf, cle, valeurAffichee) {
  const c = pf && typeof pf === "object" ? pf.correction_tracee : null;
  if (!c || typeof c !== "object" || c.cle !== cle) return false;
  const apres = plier(c.apres);
  if (!apres || plier(pf[cle]) !== apres) return false;
  return plier(valeurAffichee) === plier(c.avant);
}
