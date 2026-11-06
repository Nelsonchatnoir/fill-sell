// ═══════════════════════════════════════════════════════════════════════════
// LES CARACTÉRISTIQUES eBAY QUE LA PERSONNE ÉCRIT DÉJÀ (04/11, point 3 — thecloset72000, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Marc publie ses jeans avec FillSell : sa description dit « Coupe : Décontractée », « Made in USA », son titre
// « Vintage Lee Taille 22W », « W40 L30 » — et l'annonce partait avec 7 caractéristiques sur 34, « Vintage », « Type de
// taille », « Coupe », « Pays d'origine », « Tour de taille »… vides. Ces annonces (API Inventory) ne se modifient pas
// sur eBay : ce qui n'est pas rempli à la publication reste vide.
// Règle (Nico, 04/11 — élargit la règle du 30/10 « valeur CONNUE » au texte de la personne) : une caractéristique que
// la catégorie eBay propose et que FillSell n'a pas remplie est lue dans le TITRE et la DESCRIPTION de la personne,
// par des règles sûres seulement :
//   · une ligne « Libellé : valeur » de la description dont le libellé nomme la caractéristique ;
//   · quelques mots sans ambiguïté : « vintage », « made in … » / « fabriqué en … », « W40 L30 », « 22W » / « grande
//     taille », « 5 poches », « skinny », « bootcut », « jambe droite », « jean » / « denim » ;
// et la valeur est TOUJOURS recalée sur la liste eBay (une liste fermée sans correspondance = rien). Seule une ligne
// « Libellé : valeur » au nom EXACT d'une caractéristique en saisie libre sans liste correspondante part telle quelle
// (« Modèle : Rugged Wear »). Jamais l'IA, jamais un défaut, jamais par-dessus une valeur de la fiche ou de la personne,
// jamais une taille (elles ont leur propre règle, tailleAssemblee).
import { texteComparable, valeurDeListeCorrespondante } from "./texte-comparable.ts";
// (06/11, Nico, point 9) La même règle que l'encart eBay du web : mesure nommée, option écrite en toutes lettres.
import { aspectDuTexte } from "./aspect-du-texte.js";

export interface AspectDuCatalogue { name: string; mode?: string | null; allowedValues?: string[]; required?: boolean }
export interface AspectLu { valeur: string; preuve: string }

const LONGUEUR_MAX = 65; // eBay : 65 caractères par valeur d'aspect
// Les tailles (« Taille », « Taille de bonnet », « Pointure »…) ont leur propre règle ; une MESURE (« Tour de taille »,
// « Longueur d'entre-jambe ») se lit ici.
const estTaille = (nom: string) => /^(taille|pointure)\b/i.test(nom.trim());

// Les libellés courants qui nomment une caractéristique sous un autre mot.
const ALIAS_LIBELLE: Record<string, string[]> = {
  "composition": ["Matière"], "matiere": ["Matière"], "matieres": ["Matière"],
  "origine": ["Pays d'origine", "Pays/Région de fabrication"], "pays": ["Pays d'origine", "Pays/Région de fabrication"],
  "fabrication": ["Pays d'origine", "Pays/Région de fabrication"], "made in": ["Pays d'origine", "Pays/Région de fabrication"],
  "pays de fabrication": ["Pays d'origine", "Pays/Région de fabrication"], "fabrique en": ["Pays d'origine", "Pays/Région de fabrication"],
  "modele": ["Modèle"], "coupe": ["Coupe"], "fermeture": ["Fermeture"], "style": ["Style"],
};
// Les pays écrits en anglais (étiquettes « Made in … ») → leur nom dans les listes eBay France.
const PAYS: Record<string, string> = {
  "usa": "États-Unis", "u s a": "États-Unis", "us": "États-Unis", "united states": "États-Unis", "america": "États-Unis",
  "uk": "Royaume-Uni", "united kingdom": "Royaume-Uni", "england": "Royaume-Uni", "great britain": "Royaume-Uni",
  "italy": "Italie", "spain": "Espagne", "germany": "Allemagne", "china": "Chine", "india": "Inde", "turkey": "Turquie",
  "morocco": "Maroc", "tunisia": "Tunisie", "portugal": "Portugal", "mexico": "Mexique", "japan": "Japon",
  "vietnam": "Viêt Nam", "viet nam": "Viêt Nam", "bangladesh": "Bangladesh", "pakistan": "Pakistan", "indonesia": "Indonésie",
  "cambodia": "Cambodge", "thailand": "Thaïlande", "korea": "Corée du Sud", "south korea": "Corée du Sud",
  "romania": "Roumanie", "bulgaria": "Bulgarie", "poland": "Pologne", "egypt": "Égypte", "nicaragua": "Nicaragua",
  "honduras": "Honduras", "guatemala": "Guatemala", "sri lanka": "Sri Lanka", "canada": "Canada", "france": "France",
  "belgium": "Belgique", "netherlands": "Pays-Bas", "switzerland": "Suisse", "taiwan": "Taïwan", "hong kong": "Hong Kong",
};

// Une valeur recalée sur la liste : exacte, sinon au masculin / singulier près (« Décontractée » → « Décontracté »),
// sinon un pays connu. Une seule correspondance, jamais un choix.
export function valeurDansLaListe(brut: string, liste: string[]): string | null {
  if (!brut || !Array.isArray(liste) || !liste.length) return null;
  const exact = valeurDeListeCorrespondante(brut, liste);
  if (exact) return exact;
  // Les « e » et « s » finaux tombent (« décontractée » / « décontracté » → « decontract ») : une seule entrée doit répondre.
  const racine = (s: string) => texteComparable(s).replace(/[es]+$/, "");
  const r = racine(brut);
  if (r.length >= 4) {
    const hits = liste.filter((v) => racine(v) === r);
    if (hits.length === 1) return hits[0];
  }
  const pays = PAYS[texteComparable(brut).replace(/[.]/g, " ").replace(/\s+/g, " ").trim()];
  return pays ? valeurDeListeCorrespondante(pays, liste) : null;
}

function aspectNomme(catalogue: AspectDuCatalogue[], libelle: string): { aspect: AspectDuCatalogue; exact: boolean } | null {
  const l = texteComparable(libelle);
  const exact = catalogue.find((a) => texteComparable(a.name) === l);
  if (exact) return { aspect: exact, exact: true };
  for (const nom of ALIAS_LIBELLE[l] ?? []) {
    const a = catalogue.find((c) => c.name === nom);
    if (a) return { aspect: a, exact: false };
  }
  return null;
}

/**
 * Les caractéristiques lues dans le texte de la personne : { nom de l'aspect : { valeur, preuve } }. Seulement des
 * aspects du catalogue de la catégorie, jamais une taille ; la première preuve trouvée gagne (les lignes « Libellé :
 * valeur » d'abord).
 */
export function aspectsLusDansLeTexte(catalogue: AspectDuCatalogue[], titre: unknown, description: unknown): Record<string, AspectLu> {
  const cat = (Array.isArray(catalogue) ? catalogue : []).filter((a) => a && a.name && !estTaille(a.name));
  const t = String(titre ?? "");
  const d = String(description ?? "");
  const tout = `${t}\n${d}`;
  const lus: Record<string, AspectLu> = {};
  const poser = (a: AspectDuCatalogue | undefined, brut: string, preuve: string, libreSiExact = false) => {
    if (!a || lus[a.name]) return;
    const liste = Array.isArray(a.allowedValues) ? a.allowedValues : [];
    const v = valeurDansLaListe(brut.trim(), liste);
    if (v) { lus[a.name] = { valeur: v, preuve }; return; }
    if (libreSiExact && a.mode !== "SELECTION_ONLY" && brut.trim().length >= 2 && brut.trim().length <= LONGUEUR_MAX) {
      lus[a.name] = { valeur: brut.trim(), preuve };
    }
  };
  const parNom = (...noms: string[]) => noms.map((n) => cat.find((a) => a.name === n)).find(Boolean);

  // 1. Les lignes « Libellé : valeur » de la description.
  for (const ligne of d.split(/\r?\n/)) {
    const m = /^\s*[-•*·]?\s*([A-Za-zÀ-ÿ'’ /]{2,40}?)\s*[:：]\s*(.{1,120}?)\s*$/.exec(ligne);
    if (!m) continue;
    const vise = aspectNomme(cat, m[1]);
    if (!vise) continue;
    const valeur = m[2].replace(/[.;]+$/, "").trim();
    poser(vise.aspect, valeur, `« ${m[1].trim()} : ${valeur} »`, vise.exact);
  }
  // 2. Les mots sûrs du titre et de la description.
  if (/\bvintage\b/i.test(tout)) poser(parNom("Vintage"), "Oui", "« vintage »");
  const fab = /\b(?:made\s+in|fabriqu[ée]e?s?\s+(?:en|au|aux))\s+(?:the\s+)?([A-Za-zÀ-ÿ.' -]{2,25}?)(?=[\s,.;:)!]|$)/i.exec(tout);
  if (fab) poser(parNom("Pays d'origine", "Pays/Région de fabrication"), fab[1], `« ${fab[0].trim()} »`);
  const wl = /\bW\s?(\d{2})\s*[/x× -]?\s*L\s?(\d{2})\b/i.exec(tout);
  if (wl) {
    poser(parNom("Tour de taille"), `${wl[1]} in`, `« ${wl[0]} »`);
    poser(parNom("Longueur d'entre-jambe"), `${wl[2]} in`, `« ${wl[0]} »`);
  }
  if (/\b\d{2}\s?W\b/.test(tout) || /\bgrandes?\s+tailles?\b|\bplus\s+size\b/i.test(tout)) {
    const a = parNom("Type de taille");
    if (a && !lus[a.name]) {
      const v = valeurDansLaListe("Grande taille", a.allowedValues ?? []) ?? valeurDansLaListe("Plus", a.allowedValues ?? []);
      if (v) lus[a.name] = { valeur: v, preuve: `« ${(/\b\d{2}\s?W\b/.exec(tout) ?? /\bgrandes?\s+tailles?\b|\bplus\s+size\b/i.exec(tout))?.[0] ?? ""} »` };
    }
  }
  if (/\b5\s+poches\b|\bfive[- ]pocket\b/i.test(tout)) poser(parNom("Type de poche"), "Design à 5 poches", "« 5 poches »");
  const jambe = /\b(skinny|bootcut|boot\s?cut|flare[d]?|wide[- ]leg|jambes?\s+droites?|coupe\s+droite|straight\s+leg)\b/i.exec(tout);
  if (jambe) {
    const mot = jambe[1].toLowerCase();
    const v = /skinny/.test(mot) ? "Skinny" : /boot/.test(mot) ? "Bootcut" : /flare/.test(mot) ? "Flared" : /wide/.test(mot) ? "Wide-Leg" : "Droit";
    poser(parNom("Style de jambe"), v, `« ${jambe[1]} »`);
  }
  if (/\b(jeans?|denim)\b/i.test(t)) poser(parNom("Textile"), "Jean", `« ${(/\b(jeans?|denim)\b/i.exec(t) ?? [""])[0]} »`);
  // 3. (06/11, Nico, point 9 — ayadi007) Tout aspect à liste encore vide que le texte DIT : une mesure nommée
  //    (« Longueur : 60 cm », « L x l x H : 60 x 40 x 70 cm ») recalée sur l'option exacte, ou une option écrite en toutes
  //    lettres (« Imprimante 3D ») — _shared/aspect-du-texte.js, la règle du web. Rien de sûr → rien (la question).
  for (const a of cat) {
    if (lus[a.name] || !Array.isArray(a.allowedValues) || !a.allowedValues.length) continue;
    const r = aspectDuTexte({ name: a.name, allowedValues: a.allowedValues, textes: [t, d] }) as { valeur?: string; preuve?: string } | null;
    if (r?.valeur) lus[a.name] = { valeur: r.valeur, preuve: r.preuve ?? "texte" };
  }
  return lus;
}

/**
 * Complète un assemblage d'aspects avec ce que le texte dit, pour les seules caractéristiques encore ABSENTES (une
 * valeur de la fiche, de la personne ou de l'IA n'est jamais remplacée) ; un aspect obligatoire ainsi rempli sort des
 * manquants.
 */
export function completerAvecLeTexte<T extends { aspects: Record<string, string[]>; manquants: string[]; sources: Record<string, string> }>(
  r: T, lus: Record<string, AspectLu>,
): T & { lus_dans_le_texte: Record<string, string> } {
  const aspects = { ...r.aspects };
  const sources = { ...r.sources };
  const ajoutes: Record<string, string> = {};
  for (const [nom, l] of Object.entries(lus)) {
    if (aspects[nom]?.length) continue;
    aspects[nom] = [l.valeur];
    sources[nom] = "texte";
    ajoutes[nom] = `${l.valeur} ← ${l.preuve}`;
  }
  return { ...r, aspects, sources, manquants: r.manquants.filter((m) => !aspects[m]?.length), lus_dans_le_texte: ajoutes };
}
