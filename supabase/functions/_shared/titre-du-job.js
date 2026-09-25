// ═══════════════════════════════════════════════════════════════════════════
// AUCUN DÉPÔT SANS TITRE (2026-09-25, patrick giry)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ. Un t-shirt Carhartt passé par Lens : cinq copies
// rédigées, cinq titres — mais deux formulations (« Carhartt T-shirt… » pour
// Vinted/Opla/Beebs, « T-shirt Carhartt… » pour eBay/Leboncoin). Le titre
// GÉNÉRAL de l'écran (bloc du 21/09) ne se sème qu'à l'unanimité : il est donc
// resté VIDE. Sa fiche en base le prouve : les cinq cartes à "", aucune
// dissociée, titre général "" — le seul chemin du code qui produit cet état
// est `appliquerGenerale` recevant le champ général VIDÉ (touché puis effacé),
// qui écrivait cette chaîne vide sur toutes les cartes. Rien ne regardait le titre avant
// l'insert (la question « title » est déclarée « toujours présente ») : trois
// jobs sont partis à `title = ""` (Opla b51d9704, Vinted 88fe1e3f à 16:25,
// eBay 891a7039 à 18:29). Opla a refusé trois fois « Opla exige un titre »,
// Vinted a répondu 400 « Le champ Titre doit être renseigné ».
//
// LA RÈGLE, UNE SEULE, lue par le serveur (get-pending-jobs) ET par l'écran
// (construireJobs) :
//   · un job a un titre → il part tel quel, on n'y touche pas ;
//   · titre vide → la réponse de la personne à la question « Titre », s'il y
//     en a une ; sinon le titre de la FICHE (inventaire.titre) ;
//   · rien de tout ça → PAS de titre inventé : la question « Titre » est posée
//     avant tout essai, jamais un dépôt sans titre.
// Le texte repris est coupé au dernier mot entier au plafond de la plateforme
// (mêmes chiffres que BORNES_TEXTE, src/utils/texteConforme.js) — jamais
// reformulé.
//
// ⛔ CE MODULE NE FAIT RIEN À UN JOB QUI A UN TITRE. Mesuré le 25/09 sur
//    120 jours : un seul job de publication du parc est à titre vide (le
//    891a7039) ; tout le reste passe par la première ligne, à l'identique.
// ═══════════════════════════════════════════════════════════════════════════

/** Plafond de titre par plateforme — mêmes chiffres que BORNES_TEXTE. */
export const TITRE_MAX = Object.freeze({
  vinted: 100,
  opla: 100,
  beebs: 100,
  leboncoin: 200,
  ebay: 80,
});

/** Clé de platform_fields où la question « Titre » range la réponse. */
export const CLE_TITRE_SAISI = "titre_saisi";

/** Un titre absent, vide ou fait d'espaces. */
export const titreVide = (t) => !String(t ?? "").trim();

/** Coupe au dernier mot entier (même corps que couperAuMot / clampToWord). */
export function couperTitre(titre, platform) {
  const v = String(titre ?? "").replace(/\s+/g, " ").trim();
  const max = TITRE_MAX[platform] ?? 100;
  if (v.length <= max) return v;
  const coupe = v.slice(0, max);
  const dernierEspace = coupe.lastIndexOf(" ");
  return (dernierEspace > max * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trimEnd();
}

/**
 * Le titre avec lequel un job doit partir.
 *
 * @param {{ platform: string, titreJob?: unknown, titreSaisi?: unknown, titreFiche?: unknown }} p
 * @returns {{ titre: string, source: "job" | "saisi" | "fiche" } | null}
 *   `null` = aucun titre connu : la question « Titre » doit être posée.
 */
export function titrePourJob({ platform, titreJob = "", titreSaisi = "", titreFiche = "" }) {
  if (!titreVide(titreJob)) return { titre: String(titreJob), source: "job" };
  if (!titreVide(titreSaisi)) return { titre: couperTitre(titreSaisi, platform), source: "saisi" };
  if (!titreVide(titreFiche)) return { titre: couperTitre(titreFiche, platform), source: "fiche" };
  return null;
}
