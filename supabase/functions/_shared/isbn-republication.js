// ═══════════════════════════════════════════════════════════════════════════
// LA QUESTION D'UNE REPUBLICATION VINTED NE DIT QUE CE QUI A ÉTÉ LU (07/11, famille 6b — efec755b)
// ═══════════════════════════════════════════════════════════════════════════
// 7d6e2c34, « Livre vie de merde neuf » (efec755b) : republication Vinted arrêtée le 26/10 à l'étape « captured » (rien
// retiré) : « Vinted réclame « ISBN » et on ne l'a trouvé ni sur ton annonce ni dans sa description ». Or :
//   · la garde de get-pending-jobs (requis de la catégorie de DESTINATION) écrivait « ni dans sa description » pour
//     TOUT champ manquant — la couleur, la marque… dont la description n'est jamais lue — et pour l'ISBN même quand
//     aucune description n'était là (ou qu'une réponse déjà posée avait fait sauter la recherche) ;
//   · les PHOTOS du livre n'étaient jamais lues pour une republication (handler-watch ne lisait que action=publish),
//     alors que la 4e de couverture photographiée porte l'ISBN en clair (978-2-253-08512-6, photo 2 de la fiche).
// LA RÈGLE :
//   1. avant de poser la question, l'ISBN se cherche dans les textes (resoudreIsbn, _shared/isbn.js : la capture, la
//      description de l'annonce d'origine puis celle de la copie, les titres) — jamais par-dessus une réponse de la
//      personne ;
//   2. le message ne dit « ni dans sa description » que si une description a été LUE pour ce champ (l'ISBN seulement),
//      « ni sur tes photos » que si les photos ont été lues (handler-watch, isbn_photos_lu) ; sinon « on ne l'a pas
//      trouvé sur ton annonce ». Le texte d'avant reste mot pour mot dans le cas où il était vrai.
// Pur (Deno + Node) : scripts/isbn-republication-selftest.mjs.
import { resoudreIsbn, normalizeIsbn } from "./isbn.js";

const texte = (v) => String(v ?? "").trim();

/**
 * L'ISBN cherché AVANT la question, pour une republication Vinted dont l'ISBN manque.
 * @param {{ va?: object|null, snap?: object|null, job?: object|null }} p
 *   va : vintedAspects de la tâche ; snap : la copie (republish_snapshot, ou la copie lue dans la capture) ; job : la tâche.
 * @returns {{ trouve: null | { isbn13: string, source: string, trouve: string }, descriptionLue: boolean }}
 */
export function isbnAvantQuestion({ va = null, snap = null, job = null } = {}) {
  // Une réponse de la personne (même « Ce livre n'a pas d'ISBN ») n'est jamais remplacée : rien n'est cherché à sa place.
  if (texte(va?.isbn)) return { trouve: null, descriptionLue: false };
  const descriptions = [snap?.description, job?.description].filter((d) => texte(d));
  const r = resoudreIsbn({ capture: snap?.isbn, description: descriptions, titre: [snap?.titre, job?.title] });
  return { trouve: r && normalizeIsbn(r.isbn13).ok ? r : null, descriptionLue: descriptions.length > 0 };
}

/**
 * Le message de la garde (republication Vinted à l'étape « captured », un requis de la catégorie de destination manque).
 * @param {{ libelles: string, onRedemande: boolean, descriptionLue?: boolean, photosLues?: boolean }} p
 *   descriptionLue / photosLues : vrais seulement si TOUS les champs manquants ont été cherchés là (l'ISBN seul).
 */
export function messageRequisRepublication({ libelles, onRedemande, descriptionLue = false, photosLues = false }) {
  if (!onRedemande) {
    return `Ton annonce est TOUJOURS EN LIGNE et elle y reste. On ne sait pas la republier sans ` +
      `« ${libelles} », que Vinted exige pour cette catégorie — on ne te le redemande plus. ` +
      `Rien n'a été retiré, rien n'est perdu.`;
  }
  const ou = descriptionLue && photosLues ? "on ne l'a trouvé ni sur ton annonce, ni dans sa description, ni sur tes photos"
    : descriptionLue ? "on ne l'a trouvé ni sur ton annonce ni dans sa description"
      : photosLues ? "on ne l'a trouvé ni sur ton annonce ni sur tes photos"
        : "on ne l'a pas trouvé sur ton annonce";
  return `Ton annonce est TOUJOURS EN LIGNE : on ne l'a pas retirée. ` +
    `Pour la republier, Vinted réclame « ${libelles} » et ${ou}. Complète ce champ et la republication repartira toute seule — ` +
    `tant que ce n'est pas fait, rien n'est touché.`;
}

/** Une republication Vinted que le lecteur d'ISBN des photos (handler-watch) peut prendre : arrêtée AVANT tout retrait. */
export function republicationIsbnALire(job) {
  if (!job || job.platform !== "vinted" || job.action !== "republish" || job.status !== "needs_user") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  return String(pf.republish_step ?? "") === "captured" && String(pf.needsUserField?.field_key ?? "") === "isbn";
}
