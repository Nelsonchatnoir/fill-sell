// ═══════════════════════════════════════════════════════════════════════════
// UNE RÉPONSE DONNÉE UNE FOIS EST RETENUE SUR L'ARTICLE (16/11/2026, lot du matin, point 2.3 — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Une réponse donnée une fois par l'utilisateur est retenue sur l'article et n'est plus jamais redemandée. »
// VÉRIFIÉ le 16/11 : c'était vrai pour la taille, la couleur, la matière, la marque (attributs « manuel »), le
// classement d'un jeu (classement_age) et le format de colis Vinted (colis_vinted) — PAS pour les champs d'une
// plateforme : l'« Âge » Beebs, la « Plateforme » d'un jeu (Vinted, eBay), le « Modèle » eBay… Répondus au lot, ils
// n'existaient que sur la tâche : une nouvelle publication de l'article les redemandait.
// LA RÈGLE : un CHOIX dans la liste d'un champ requis, fait par la personne, et parti tel quel avec la publication, se
// range sur la fiche (attributs.reponses_plateformes, source « manuel », clé « plateforme|champ »). La fois suivante,
// la ligne de ce champ le reprend (valeur encore dans la liste du rayon), avant toute valeur probable — jamais
// par-dessus une valeur certaine (fiche, texte, option nommée), jamais une frappe en cours, jamais une déduction.
// Pur (Node + Vite) : scripts/reponses-article-selftest.mjs.
import { texteComparable } from "../../utils/texteComparable.js";

/** La clé de la fiche qui porte les réponses. */
export const CLE_REPONSES_ARTICLE = "reponses_plateformes";
// Les champs qui ont déjà LEUR place sur la fiche (ou leur question commune) : jamais rangés ici.
const DEJA_SUR_LA_FICHE = /^(taille|pointure|couleur|colors?|color|matiere|material|marque|brand|etat|condition|title|titre|description|photos?|prix|price|isbn|package_size|format_colis|video_game_ratings)$/i;

const norm = (s) => texteComparable(String(s ?? "")).replace(/\s+/g, " ").trim();
const cle = (plateforme, champ) => `${String(plateforme ?? "").trim()}|${String(champ ?? "").trim()}`;

/** Ce champ peut-il être retenu sur l'article ? */
export function champRetenable(plateforme, champ) {
  const c = String(champ ?? "").trim();
  return Boolean(String(plateforme ?? "").trim() && c && !DEJA_SUR_LA_FICHE.test(c) && !/^(marque|taille|couleur|mati[eè]re|[ée]tat)$/i.test(c));
}

/** Les réponses rangées sur la fiche ({ "beebs|Âge": "16 ans et +", … }). */
export function reponsesDeLaFiche(attributs) {
  const a = attributs && typeof attributs === "object" ? attributs[CLE_REPONSES_ARTICLE] : null;
  const v = a && typeof a === "object" && "v" in a ? a.v : a;
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/**
 * La réponse déjà donnée pour CE champ de CETTE plateforme, écrite comme la liste ACTUELLE du rayon l'écrit — ou null
 * (aucune, ou sortie de la liste : la question revient).
 */
export function reponseDeLArticle(attributs, plateforme, champ, allowedValues = []) {
  if (!champRetenable(plateforme, champ)) return null;
  const v = String(reponsesDeLaFiche(attributs)[cle(plateforme, champ)] ?? "").trim();
  if (!v) return null;
  const liste = Array.isArray(allowedValues) ? allowedValues.map(String) : [];
  if (!liste.length) return null;
  return liste.find((x) => x === v) ?? liste.find((x) => norm(x) === norm(v)) ?? null;
}

/**
 * Ce qui se range sur la fiche après une publication : les réponses de la personne (un choix dans la liste) que la
 * copie PARTIE porte encore — fusionnées avec celles déjà rangées. null = rien à écrire (jamais une ligne inchangée).
 * @param {{ attributs: object|null, reponses: Record<string,{plateforme:string,champ:string,valeur:string,liste?:string[]}>,
 *           envoyees: string[], valeurFinale: (plateforme:string, champ:string) => unknown }} p
 */
export function reponsesArticleAEcrire({ attributs, reponses, envoyees, valeurFinale }) {
  const avant = reponsesDeLaFiche(attributs);
  const apres = { ...avant };
  for (const r of Object.values(reponses ?? {})) {
    if (!r || !champRetenable(r.plateforme, r.champ) || !(envoyees ?? []).includes(r.plateforme)) continue;
    const v = String(r.valeur ?? "").trim();
    if (!v) continue;
    const liste = Array.isArray(r.liste) ? r.liste.map(String) : [];
    if (!liste.length || !liste.includes(v)) continue; // un CHOIX dans la liste, jamais une frappe
    if (String(valeurFinale(r.plateforme, r.champ) ?? "").trim() !== v) continue; // partie telle quelle
    apres[cle(r.plateforme, r.champ)] = v;
  }
  const change = Object.keys(apres).some((k) => apres[k] !== avant[k]);
  return change ? apres : null;
}
