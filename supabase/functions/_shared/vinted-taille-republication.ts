// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE SERVIE À LA REPUBLICATION VINTED — « EU 38 » DEVIENT « M »
// (2026-09-10, jobs f1f37218 / b1ad790c / 75875cb5 / ff234934 et 7 « FR NN »)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI SE PASSE (mesuré en base, 45 jours) : pour les size_id 1943→1965, le
// référentiel /api/v2/size_groups lu par l'extension à la capture rend une
// forme PRÉFIXÉE — « EU 36 », « EU 38 », « FR 34 »… « FR 52 » — alors que la
// garde-robe Vinted (inventaire.attributs.taille, source vinted_liste) affiche
// le MÊME article « S / 36 / 8 », « M / 38 / 10 », « XL / 42 / 14 ». Les deux
// sont de Vinted ; personne n'a « perdu » la lettre, deux orthographes du
// même id. Le formulaire de recréation, lui, refuse la forme préfixée :
// l'extension (vinted.js) retire le préfixe « EU » (→ « 38 », que la garde
// anti-nombre-nu refuse ensuite de matcher par contenance dans « EU 38 »), et
// les « FR NN » échouent aussi sans que la cause soit relevée sur un
// formulaire réel. 11 jobs en needs_user sur 45 jours, annonces INTACTES
// (garde-fou « pause AVANT toute suppression »).
//
// LE CORRECTIF D'EXTENSION (ne plus retirer « EU », relever le cas FR) part
// dans le prochain zip. ICI, le chemin SERVEUR disponible tout de suite : la
// LETTRE de la garde-robe est servie dans `republish_user_fields.taille`, le
// canal que l'extension fusionne DÉJÀ dans la capture (background.js, liste
// blanche taille/marque/etat/isbn, valeurs fournies > libellés capturés). À
// la (re)capture, libelles.taille devient « M » et le formulaire le trouve en
// exact sur la grille lettrée. Décision Nico (10/09) : le size_id posé ne sera
// plus 1944 — l'affichage garde-robe est identique, c'est assumé.
//
// ⛔ GARDE-FOUS (ils comptent plus que le correctif) :
//   · PÉRIMÈTRE = la capture de l'article rend une forme préfixée EU/FR/UK.
//     Un article dont la capture rend « M / 38 / 10 » (1 429 captures sur
//     45 j, la voie qui ABOUTIT) n'est jamais touché : 535 republications
//     abouties sur 7 jours, ce chiffre ne doit pas bouger.
//   · SOURCE STRICTE : attributs.taille.source = 'vinted_liste' SEULEMENT.
//     Jamais 'capture' — relevé : id 1959 « FR 40 » avec un inventaire
//     « XL / 42 / 14 » ×3 sous cette source, servir ça poserait une taille
//     FAUSSE. Sans source sûre, on ne sert RIEN et le job reste en needs_user
//     comme aujourd'hui. Un blocage vaut mieux qu'une taille fausse.
//   · COHÉRENCE capture ↔ garde-robe, relevée sur 37 captures (jamais
//     déduite) : « EU N » ↔ « X / N / Y » (13 cas), « FR N » ↔ « X / N-2 / Y »
//     (37 cas : FR 38 ↔ S/36, FR 40 ↔ M/38, FR 44 ↔ XL/42), « UK N » ↔ le
//     3ᵉ segment. Un couple qui ne colle pas = garde-robe périmée ou autre
//     article : rien n'est servi.
//   · Pas de lettre exploitable dans la valeur garde-robe → rien.
//   · Grille cible RELEVÉE (platform_category_aspects vinted/size) : si elle
//     est EN CHIFFRES, on sert le chiffre (et seulement s'il y figure) ; sinon
//     la lettre (et seulement si elle y figure). Grille NON relevée → la
//     lettre, cas majoritaire.
//   · Une taille déjà présente dans republish_user_fields (saisie de
//     l'utilisateur) n'est JAMAIS écrasée — c'est l'appelant qui le garantit.
// Rien n'est réécrit en base par ce module : il ne fait que calculer la valeur
// à SERVIR. inventaire.attributs et vinted_republish_captures restent intacts.

/** Forme préfixée rendue par le référentiel pour les ids 1943→1965. */
export const TAILLE_PREFIXEE_RE = /^(EU|FR|UK)\s*(\d{1,3})$/i;
/** Les lettres de la grille Femme/Homme Vinted : XXXS…S, M, L…XXXL, 4XL…9XL. */
const LETTRE_RE = /^(?:X{0,3}S|X{0,3}L|M|\dXL)$/i;
const NOMBRE_RE = /^\d{1,3}$/;
/** Options présentes dans TOUTES les grilles : elles ne disent rien de sa forme. */
const OPTIONS_NEUTRES = new Set(["AUTRE", "TAILLE UNIQUE"]);

/** Forme comparable d'un libellé de taille : sans accent, espaces (insécables
 *  compris — la grille relevée écrit « EU 38 » avec U+00A0) réduits à un
 *  simple, majuscules. */
export function normaliserTaille(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** « M / 38 / 10 » → { lettre: "M", eu: 38, uk: 10 }. Segments absents → null. */
export function decomposerTailleVinted(v: unknown): { lettre: string | null; eu: number | null; uk: number | null } {
  const segs = normaliserTaille(v).split("/").map((s) => s.trim()).filter(Boolean);
  const lettre = segs.find((s) => LETTRE_RE.test(s)) ?? null;
  const nombres = segs.filter((s) => NOMBRE_RE.test(s)).map(Number);
  return { lettre, eu: nombres[0] ?? null, uk: nombres[1] ?? null };
}

/** Vrai si TOUTES les options utiles (hors Autre / Taille unique) sont des nombres. */
export function grilleEnChiffres(options: string[]): boolean {
  const utiles = options.map(normaliserTaille).filter((o) => o && !OPTIONS_NEUTRES.has(o));
  return utiles.length > 0 && utiles.every((o) => /^\d+(?:[.,]\d+)?$/.test(o));
}

export type TailleServie = { valeur: string; methode: "lettre" | "chiffre"; motif?: undefined };
export type TailleRefusee = { valeur: null; motif: string };

/**
 * La valeur à servir dans republish_user_fields.taille, ou le motif du refus.
 * @param captureTaille   libelles.taille de la DERNIÈRE capture de l'article
 * @param inventaireTaille inventaire.attributs.taille ({ v, source })
 * @param options         allowed_values de la grille relevée pour la catégorie
 *                        de la capture, ou null si la catégorie n'est pas relevée
 */
export function tailleAServir(args: {
  captureTaille: unknown;
  inventaireTaille: { v?: unknown; source?: unknown } | null | undefined;
  options: string[] | null | undefined;
}): TailleServie | TailleRefusee {
  const m = TAILLE_PREFIXEE_RE.exec(normaliserTaille(args.captureTaille));
  if (!m) return { valeur: null, motif: "capture non préfixée (hors périmètre)" };
  const prefixe = m[1].toUpperCase();
  const n = Number(m[2]);

  const source = String(args.inventaireTaille?.source ?? "").trim();
  if (source !== "vinted_liste") {
    return { valeur: null, motif: `source inventaire « ${source || "absente"} » ≠ vinted_liste` };
  }
  const { lettre, eu, uk } = decomposerTailleVinted(args.inventaireTaille?.v);
  if (!lettre) return { valeur: null, motif: "aucune lettre exploitable dans la taille garde-robe" };

  const coherent =
    (prefixe === "EU" && eu != null && eu === n) ||
    (prefixe === "FR" && eu != null && eu + 2 === n) ||
    (prefixe === "UK" && uk != null && uk === n);
  if (!coherent) {
    return { valeur: null, motif: `incohérence capture « ${prefixe} ${n} » ↔ garde-robe « ${normaliserTaille(args.inventaireTaille?.v)} »` };
  }

  const options = Array.isArray(args.options) ? args.options.map(normaliserTaille).filter(Boolean) : [];
  if (!options.length) return { valeur: lettre, methode: "lettre" }; // grille non relevée : la lettre
  const relevees = new Set(options);
  if (grilleEnChiffres(options)) {
    if (eu != null && relevees.has(String(eu))) return { valeur: String(eu), methode: "chiffre" };
    return { valeur: null, motif: `grille en chiffres sans « ${eu ?? "?"} »` };
  }
  if (relevees.has(lettre)) return { valeur: lettre, methode: "lettre" };
  return { valeur: null, motif: `lettre « ${lettre} » absente de la grille relevée` };
}
