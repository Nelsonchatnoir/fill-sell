// ═══════════════════════════════════════════════════════════════════════════
// BEEBS — LA TAILLE / POINTURE D'UNE REPUBLICATION, PRISE SUR LA FICHE
// QUAND LE RELEVÉ NE LA PORTE PAS (2026-10-01)
// ═══════════════════════════════════════════════════════════════════════════
// get-pending-jobs comble déjà une republication Beebs depuis le RELEVÉ Beebs
// (rayon, état, marque, taille, description). Les Bottines LPB de misscat801
// (2586c549, 29/09) : le relevé n'avait pas la pointure, la fiche portait
// « 40 » (titre « Taille 40 ») — la copie est partie sans, et Beebs a exigé
// « Pointure » APRÈS le retrait (extension 0.6.77, sans pré-vol complet).
// LA RÈGLE (on ne comble que le vide, jamais une valeur approchée) :
//   · seulement si le job n'a AUCUNE taille après le relevé ;
//   · la valeur de la fiche (inventaire.attributs.taille.v) doit figurer
//     TELLE QUELLE (casse, accents, espaces près) dans la liste Beebs relevée
//     pour CE rayon (« Pointure » ou « Taille ») — sinon rien : la question
//     reste posée avec la liste de Beebs ;
//   · c'est l'entrée de la liste qui est servie, jamais la forme de la fiche.
// ES module SANS import (Deno + Node).

const comparable = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ").trim().toLowerCase();

// listes : [{ field_key, allowed_values }] relevées pour le rayon du job.
export function tailleBeebsDeLaFiche(valeurFiche, listes) {
  const cible = comparable(valeurFiche);
  if (!cible || !Array.isArray(listes)) return null;
  for (const l of listes) {
    if (!/^(taille|pointure)$/i.test(String(l?.field_key ?? ""))) continue;
    const hit = (Array.isArray(l.allowed_values) ? l.allowed_values : [])
      .find((v) => typeof v === "string" && comparable(v) === cible);
    if (hit) return { valeur: hit, champ: String(l.field_key) };
  }
  return null;
}
