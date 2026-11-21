// ═══════════════════════════════════════════════════════════════════════════
// L'ASPECT eBAY QUE LE SERVEUR REMPLIT AU DÉPÔT N'EST JAMAIS UNE QUESTION (21/11/2026, lot du 21/11, point 2 — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico (21/11) : « pré-remplir AVANT d'afficher, ne jamais montrer un champ que le moteur va remplir ».
// Cas : eBay « Style » / « Type » posés en question à l'écran (vetis.shop 21/11 03:13 — eBay décoché 3 s après ;
// alisonbertincourt 20/11 23:54 — « publié sans eBay » sur « Style, Type », alors que l'IA de l'écran les avait
// obtenus UNE seconde plus tôt). Or, par la voie API, le serveur remplit au dépôt tout aspect exigé encore vide
// (_shared/ebay-publication.ts remplirAspects : lecture du texte, IA sous la liste d'eBay, puis la valeur DEVINÉE
// dans la liste — _shared/aspect-devine.ts, règle du 19/11 « tout ce qui se devine est rempli »). Il ne pose une
// question, sur la fiche, qu'en dernier recours.
// Donc, à l'écran, voie API seulement : un aspect exigé encore vide QUE LE SERVEUR DEVINE (une liste d'au moins deux
// vraies options, jamais l'identité, une taille, une mesure, un état, un format — MÊMES motifs que aspectDevinable,
// recopiés ici et tenus égaux par scripts/lot-2111-ebay-au-depot-selftest.mjs) ne retient pas eBay et ne s'affiche
// pas : il part au dépôt. Ce qui ne se devine pas (Marque, Modèle, Taille, Pointure, mesures…) reste une question.
// Voie extension : rien ne change (l'extension ne devine pas).
// Pur (Node + navigateur).
import { estFourreTout } from "../../../supabase/functions/_shared/option-du-texte.js";
import { listeDePublics } from "./valeursProbables.js";

// ⛔ Recopies EXACTES de _shared/aspect-devine.ts (JAMAIS_DEVINE_RE) et _shared/ebay-aspects-ia.ts (ASPECT_TAILLE_RE,
// ASPECT_MESURE_RE) — le verrou compare les textes.
export const MOTS_JAMAIS_DEVINES = [
  "marques?\\b", "mod[eè]les?\\b", "gamme", "ligne de produits", "s[ée]rie", "collection", "jeux?\\b", "nom\\b", "personnage",
  "franchise", "licence", "[ée]quipe", "club\\b", "joueur", "athl[eè]te", "ligue", "championnat", "titre\\b", "auteur",
  "artiste", "interpr[eè]te", "r[ée]alisateur", "acteur", "[ée]diteur", "maison d'[ée]dition", "label\\b", "[ée]dition",
  "version\\b", "ann[ée]e", "date\\b", "d[ée]cennie", "p[ée]riode", "[ée]poque", "vintage", "fait main", "num[ée]ro", "ean\\b",
  "isbn", "upc\\b", "gtin", "mpn", "r[ée]f[ée]rence", "code\\b", "pays\\b", "r[ée]gion\\b", "lieu\\b", "sign[ée]", "autographe",
  "certifi", "garantie", "personnalis", "[âa]ges?\\b", "tranche d'[âa]ge", "[ée]tat\\b", "condition", "type de taille",
  "taille", "pointure", "tour de", "poids", "capacit", "puissance", "tension", "voltage", "r[ée]solution",
  "m[ée]moire", "stockage", "processeur", "connectivit", "syst[eè]me d'exploitation", "plateforme", "console",
  "format", "langue", "teinte", "nombre", "quantit", "classification", "pegi", "parfum", "volume", "contenance",
];
const JAMAIS_DEVINE_RE = new RegExp("^(?:" + MOTS_JAMAIS_DEVINES.join("|") + ")", "i");
export const ASPECT_TAILLE_RE = /^(?:Taille|Pointure(?: EU| UK| US| AU)?)$/;
export const ASPECT_MESURE_RE = /^(?:hauteur|largeur|longueur|profondeur|diam[eè]tre|[ée]paisseur|dimensions?|volume|contenance|tour de (?:taille|poitrine|hanches?|cou|t[êe]te))(?:\s*\([^)]*\))?$/i;

const plier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Le serveur devinera-t-il cet aspect eBay au dépôt ? (pur) — mêmes motifs que aspectDevinable (_shared/aspect-devine.ts),
 * sans la clé de plateforme (eBay n'en a pas) ; les défauts fixes sont posés plus tôt par l'écran (defautAspectEbay).
 * @param {{name:string, allowedValues?:string[], sharedKey?:string|null}} a
 * @returns {{ok:true}|{ok:false, motif:string}}
 */
export function aspectDevineAuDepot(a) {
  const nom = String(a?.name ?? "").trim();
  if (!nom) return { ok: false, motif: "sans nom" };
  // Les quatre champs partagés (marque, taille, couleur, matière) ont leur propre question, commune aux plateformes.
  if (a?.sharedKey) return { ok: false, motif: "champ partagé" };
  const vraies = [...new Set((a?.allowedValues ?? []).map((v) => String(v ?? "").trim()).filter((v) => v && !estFourreTout(v)))];
  if (vraies.length < 2) return { ok: false, motif: "liste sans deux vraies options" };
  // Un PUBLIC (Département : Femme / Homme / Enfant…) ne se devine pas (règle de l'app, valeursProbables.js) : la question reste.
  if (listeDePublics(vraies)) return { ok: false, motif: "public : ne se devine pas" };
  if (ASPECT_TAILLE_RE.test(nom) || /\b(taille|pointure|size)\b/i.test(nom)) return { ok: false, motif: "taille : se lit" };
  if (ASPECT_MESURE_RE.test(nom)) return { ok: false, motif: "mesure : se lit" };
  if (JAMAIS_DEVINE_RE.test(nom) || JAMAIS_DEVINE_RE.test(plier(nom))) return { ok: false, motif: "identité ou caractéristique : se lit" };
  if (vraies.filter((v) => /\d/.test(v)).length * 2 >= vraies.length) return { ok: false, motif: "liste de mesures : se lit" };
  return { ok: true };
}

/**
 * La ligne « missing » d'un aspect eBay, telle que l'écran la garde (pur) : voie API et aspect deviné au dépôt →
 * non bloquante, marquée `auDepot` (ni question, ni eBay retenu) ; sinon inchangée.
 */
export function ligneEbayAuDepot(manquant, { voieApi = false } = {}) {
  if (!voieApi || !manquant || manquant.state !== "missing") return manquant;
  return aspectDevineAuDepot(manquant).ok ? { ...manquant, blocking: false, auDepot: true } : manquant;
}
