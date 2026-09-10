// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE SERVIE À LA REPUBLICATION VINTED — LE LIBELLÉ EXACT DE LA GRILLE
// (2026-09-10 ; v1 = 95048ab « lettre seule », v2 = c312e7f 4 étapes,
//  v3 = la LETTRE passe devant l'exact quand la capture est préfixée)
// ══════════════════════════════════════════════════════════════════════════
// CE QUI SE PASSE (mesuré en base) : pour les size_id 1943→1965, le
// référentiel /api/v2/size_groups lu par l'extension à la capture rend une
// forme PRÉFIXÉE — « EU 36 », « EU 38 », « FR 34 »… « FR 52 » — alors que la
// garde-robe Vinted (inventaire.attributs.taille, source vinted_liste) affiche
// le MÊME article « S / 36 / 8 », « M / 38 / 10 », « XL / 42 / 14 ». Les deux
// sont de Vinted. Le formulaire de recréation, lui, refuse la forme préfixée :
// l'extension (vinted.js) retire « EU » (→ « 38 », que la garde anti-nombre-nu
// refuse ensuite de matcher par contenance), et les « FR NN » échouent aussi.
//
// VINTED A UNE GRILLE PAR CATÉGORIE, et le libellé de l'option n'est presque
// jamais la valeur nue (relevé platform_category_aspects vinted/size, 26
// grilles relevées le 10/09 = 14,7 % des articles capturés) :
//   · Femmes > Hauts > T-shirts ............ « M / 38 / 10 » (17 options combinées)
//   · Femmes > Jupes / Robes / Sweats ...... « M » + « EU 38 » + « UK 12 » + « FR 40 » (60 séparées)
//   · Hommes > Pantalons > Autres pantalons  « W30 | FR 40 » … « W48 | FR 58 » (36)
//   · Hommes > T-shirts / Sweats / Doudounes « XS » … « 8XL » (lettres seules)
//   · Femmes > Chaussures > Baskets ........ « 38 », « 38.5 » (chiffres nus)
// Donc : quand le serveur connaît la grille cible ET la taille capturée, il
// sert le LIBELLÉ EXACT de l'option — jamais une valeur à faire deviner.
//
// LES ÉTAPES :
//   1. le libellé exact s'il existe tel quel dans la grille relevée ;
//   2. l'option de la grille qui CONTIENT la taille capturée comme JETON
//      COMPLET (« FR 52 » → « W42 | FR 52 ») — « FR 4 » ne matche jamais
//      « FR 46 », « 38 » jamais « 38.5 » ni « 138 » ; une seule candidate ;
//   3. la lettre déduite de inventaire.attributs.taille (règle de 95048ab :
//      source vinted_liste STRICTE, cohérence obligatoire, grille relevée en
//      chiffres → le chiffre s'il y figure, lettre présente dans la grille si
//      elle est relevée) ;
//   puis rien : le job reste en needs_user.
//   ⚠️ EXCEPTION OBLIGATOIRE : jamais un libellé qui commence par « EU  » —
//   vinted.js coupe ce préfixe (replace(/^EU\s*/i, "")), « EU 38 » servi
//   arriverait en « 38 » et ne matcherait rien → le candidat est ignoré, on
//   passe à l'étape suivante. À retirer quand la coupure aura disparu.
//
// L'ORDRE (Nico, 10/09, v3) :
//   · capture PRÉFIXÉE (EU/FR/UK + nombre) : 3 → 1 → 2 → rien. Motif : sur
//     f095c37f (Doudounes, « FR 40 »), l'étape 1 aurait servi la valeur
//     EXACTE avec laquelle l'extension avait DÉJÀ échoué le 09/09 — on ne
//     rejoue pas un échec mesuré. La voie lettre est prouvée en prod le 10/09
//     au matin : 3 republications abouties (f1f37218 → M, ff234934 → S,
//     75875cb5 → M).
//   · capture NON préfixée : 1 → 2 → 3 → rien, inchangé. Cet ordre n'est
//     atteignable que si le PÉRIMÈTRE ci-dessous est un jour élargi : tant
//     qu'il tient, une capture non préfixée sort avant toute résolution.
//
// ⛔ GARDE-FOUS :
//   · PÉRIMÈTRE = la capture de l'article rend une forme préfixée EU/FR/UK.
//     Mesuré le 10/09 : 0 des 590 republications abouties sur 7 jours. Le
//     déclencheur « forme absente de la grille » a été REFUSÉ : il toucherait
//     8 abouties sur 7 j (27 sur 45 j — « M / 38 / 10 » sur les grilles
//     séparées, « M » sur la grille combinée, que la cascade de l'extension
//     résout déjà). Une taille qui passe aujourd'hui, on n'y touche pas.
//   · SOURCE STRICTE pour la lettre : attributs.taille.source = 'vinted_liste'.
//     Jamais 'capture' (id 1959 « FR 40 » avec un inventaire « XL / 42 / 14 »
//     ×3 sous cette source : ce serait une taille FAUSSE).
//   · COHÉRENCE capture ↔ garde-robe avant toute lettre, relevée sur 37
//     captures : « EU N » ↔ N, « FR N » ↔ N-2 (FR 40 ↔ M/38/10), « UK N » ↔
//     3ᵉ segment. Couple incohérent → pas de lettre. Témoin de non-régression :
//     job e0c2cb04 (« FR 40 » contre « XL / 42 / 14 », source capture, grille
//     non relevée) DOIT rester bloqué.
//   · Grille NON relevée → la lettre ou rien : on n'invente pas de libellé.
//   · Comparaison en normalisant les espaces (insécables compris — la grille
//     relevée écrit « EU 38 » avec U+00A0) et la casse, rien d'autre.
//   · Une taille déjà saisie dans republish_user_fields n'est jamais écrasée
//     (garanti par l'appelant).
// Rien n'est réécrit en base par ce module : il ne fait que calculer la valeur
// à SERVIR. inventaire.attributs et vinted_republish_captures restent intacts.

/** Forme préfixée rendue par le référentiel pour les ids 1943→1965 (après normalisation). */
export const TAILLE_PREFIXEE_RE = /^(EU|FR|UK) ?(\d{1,3})$/i;
/** Les lettres de la grille Femme/Homme Vinted : XXXS…S, M, L…XXXL, 4XL…9XL. */
const LETTRE_RE = /^(?:X{0,3}S|X{0,3}L|M|\dXL)$/i;
const NOMBRE_RE = /^\d{1,3}$/;
/** Options présentes dans TOUTES les grilles : elles ne disent rien de sa forme. */
const OPTIONS_NEUTRES = new Set(["AUTRE", "TAILLE UNIQUE"]);
/** Le préfixe que vinted.js coupe : un libellé qui commence ainsi ne doit jamais être servi. */
const EU_COUPE_RE = /^EU /;

/** Ordre des étapes selon la forme de la capture (v3). */
export const ORDRE_CAPTURE_PREFIXEE: ReadonlyArray<Etape> = [3, 1, 2];
export const ORDRE_CAPTURE_NON_PREFIXEE: ReadonlyArray<Etape> = [1, 2, 3];

/** Forme comparable d'un libellé : espaces (U+00A0, U+202F… compris) réduits
 *  à un simple, bornes retirées, majuscules. Rien d'autre. */
export function normaliserTaille(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
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

/** L'option (normalisée) contient la valeur (normalisée) comme JETON COMPLET :
 *  bornée par un caractère qui n'est ni lettre, ni chiffre, ni point — ou par
 *  un bord. « FR 52 » ⊂ « W42 | FR 52 » ; « 38 » ⊄ « 38.5 », ⊄ « 138 » ;
 *  « FR 4 » ⊄ « FR 46 ». */
export function contientJeton(optionNorm: string, valeurNorm: string): boolean {
  if (!valeurNorm) return false;
  const esc = valeurNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9.])${esc}([^A-Z0-9.]|$)`).test(optionNorm);
}

export type Etape = 1 | 2 | 3;
export type TailleServie = { valeur: string; etape: Etape; ordre: string; detail: string; motif?: undefined };
export type TailleRefusee = { valeur: null; etape: null; ordre: string; motif: string };

/**
 * La valeur à servir dans republish_user_fields.taille, ou le motif du refus.
 * @param captureTaille    libelles.taille de la DERNIÈRE capture de l'article
 * @param inventaireTaille inventaire.attributs.taille ({ v, source })
 * @param options          allowed_values (libellés BRUTS) de la grille relevée
 *                         pour la catégorie de la capture ; null/vide si la
 *                         catégorie n'est pas relevée
 */
export function tailleAServir(args: {
  captureTaille: unknown;
  inventaireTaille: { v?: unknown; source?: unknown } | null | undefined;
  options: string[] | null | undefined;
}): TailleServie | TailleRefusee {
  const nt = normaliserTaille(args.captureTaille);
  const m = TAILLE_PREFIXEE_RE.exec(nt);
  // ── PÉRIMÈTRE : capture préfixée seulement (cf. bandeau) ──────────────────
  if (!m) return { valeur: null, etape: null, ordre: ORDRE_CAPTURE_NON_PREFIXEE.join("→"), motif: "capture non préfixée (hors périmètre)" };
  const ordre = ORDRE_CAPTURE_PREFIXEE;
  const ordreTexte = ordre.join("→");
  const prefixe = m[1].toUpperCase();
  const n = Number(m[2]);

  const grille = (Array.isArray(args.options) ? args.options : [])
    .map((o) => ({ brut: String(o), norm: normaliserTaille(o) }))
    .filter((o) => o.norm);
  const relevee = grille.length > 0;
  const motifs: string[] = [];
  const servi = (valeur: string, etape: Etape, detail: string): TailleServie => ({ valeur, etape, ordre: ordreTexte, detail });

  // ── 1. le libellé exact ───────────────────────────────────────────────────
  const etape1 = (): TailleServie | null => {
    if (!relevee) { motifs.push("1 : grille non relevée"); return null; }
    const exact = grille.find((o) => o.norm === nt);
    if (!exact) { motifs.push("1 : aucune option exacte"); return null; }
    if (EU_COUPE_RE.test(exact.norm)) { motifs.push(`1 : exact « ${exact.brut} » commence par EU (préfixe coupé par l'extension)`); return null; }
    return servi(exact.brut, 1, "libellé exact de la grille");
  };

  // ── 2. l'option qui contient la taille capturée comme jeton complet ───────
  const etape2 = (): TailleServie | null => {
    if (!relevee) { motifs.push("2 : grille non relevée"); return null; }
    const cands = grille.filter((o) => o.norm !== nt && contientJeton(o.norm, nt));
    if (cands.length === 0) { motifs.push("2 : aucune option par jeton"); return null; }
    if (cands.length > 1) { motifs.push(`2 : jeton ambigu (${cands.length} options : ${cands.slice(0, 4).map((c) => c.brut).join(" · ")})`); return null; }
    if (EU_COUPE_RE.test(cands[0].norm)) { motifs.push(`2 : jeton « ${cands[0].brut} » commence par EU (préfixe coupé par l'extension)`); return null; }
    return servi(cands[0].brut, 2, `option contenant « ${nt} » en jeton complet`);
  };

  // ── 3. la lettre de la garde-robe (règle de 95048ab, inchangée) ───────────
  const etape3 = (): TailleServie | null => {
    const source = String(args.inventaireTaille?.source ?? "").trim();
    if (source !== "vinted_liste") { motifs.push(`3 : source inventaire « ${source || "absente"} » ≠ vinted_liste`); return null; }
    const gardeRobe = normaliserTaille(args.inventaireTaille?.v);
    const { lettre, eu, uk } = decomposerTailleVinted(gardeRobe);
    if (!lettre) { motifs.push(`3 : aucune lettre exploitable dans « ${gardeRobe} »`); return null; }
    const coherent =
      (prefixe === "EU" && eu != null && eu === n) ||
      (prefixe === "FR" && eu != null && eu + 2 === n) ||
      (prefixe === "UK" && uk != null && uk === n);
    if (!coherent) { motifs.push(`3 : incohérence capture « ${prefixe} ${n} » ↔ garde-robe « ${gardeRobe} »`); return null; }
    if (!relevee) return servi(lettre, 3, "lettre de la garde-robe (grille non relevée)");
    if (grilleEnChiffres(grille.map((o) => o.norm))) {
      const opt = eu != null ? grille.find((o) => o.norm === String(eu)) : undefined;
      if (opt) return servi(opt.brut, 3, "chiffre de la garde-robe (grille en chiffres)");
      motifs.push(`3 : grille en chiffres sans « ${eu ?? "?"} »`);
      return null;
    }
    const optLettre = grille.find((o) => o.norm === lettre);
    if (optLettre) return servi(optLettre.brut, 3, "lettre de la garde-robe, présente dans la grille relevée");
    motifs.push(`3 : lettre « ${lettre} » absente de la grille relevée`);
    return null;
  };

  const etapes: Record<Etape, () => TailleServie | null> = { 1: etape1, 2: etape2, 3: etape3 };
  for (const e of ordre) {
    const r = etapes[e]();
    if (r) return r;
  }
  return { valeur: null, etape: null, ordre: ordreTexte, motif: motifs.join(" ; ") };
}
