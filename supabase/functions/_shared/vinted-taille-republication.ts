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
//   passe à l'étape suivante. Levée PAR CLIENT quand le build déclare la
//   capacité « taille_par_id » (opts.euCoupe = false) : ce build ne coupe plus.
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
/** Un nombre NU tel que la capture ou l'article l'écrit : « 42 », « 38,5 ». */
export const NOMBRE_NU_RE = /^\d{1,3}(?:[.,]\d)?$/;

// ══════════════════════════════════════════════════════════════════════════
// « N » ≡ « EU N » — LA MÊME TAILLE, DEUX ORTHOGRAPHES DE VINTED (2026-09-23)
// ══════════════════════════════════════════════════════════════════════════
// Vestes de costume de Joséphine (Hommes > Vêtements > Costumes et blazers >
// Autres, catalog 1866) : la capture rend « 42 » (size_id 1592, groupe 75 du
// référentiel, qui écrit « 22…30, 42…78, 90…118 » nus) ; le formulaire de
// dépôt, lui, range la même taille sous l'onglet EU et l'écrit « EU 42 ».
// Mesuré le 23/09 : depuis la 0.6.25 (10/09), qui a cessé de couper « EU »
// sur le chemin de pose, un nombre nu ne peut plus rejoindre « EU N » ;
// les costumes homme de fin août (v0.6.11) passaient, les deux du 23/09 non.
// RÈGLE : quand la grille relevée pour la catégorie n'écrit PAS « N » nu mais
// écrit « EU N », on sert « EU N » — le libellé EXACT de la grille, jamais un
// équivalent (« FR N », « UK N » désignent d'AUTRES tailles : jamais).
// ⛔ EN DERNIER RECOURS SEULEMENT : après les étapes qui servaient déjà (la
//    table femme à la publication, les étapes 1-2-3 à la republication).
//    Tout ce qui était servi hier l'est aujourd'hui, à l'identique.
// ⛔ JAMAIS pour un client qui coupe encore « EU » (builds < 0.6.25) : il
//    perdrait le préfixe et rebuterait — on ne sert rien, comme avant.
/** L'option « EU N » d'une grille qui n'écrit pas « N » nu, sinon null. */
export function optionEuPourNombreNu(nt: string, grille: Array<{ brut: string; norm: string }>): { brut: string; norm: string } | null {
  if (!NOMBRE_NU_RE.test(nt) || !grille.length) return null;
  const nu = nt.replace(",", ".");
  if (grille.some((o) => o.norm.replace(",", ".") === nu)) return null; // le nu est là : l'exact fait foi
  const cands = grille.filter((o) => o.norm.replace(",", ".") === `EU ${nu}`);
  return cands.length === 1 ? cands[0] : null;
}

// ══════════════════════════════════════════════════════════════════════════
// LA TAILLE SERVIE À LA **PUBLICATION** (2026-09-15) — MÊME FICHIER, MÊME
// TABLE, MÊMES OUTILS DE COMPARAISON QUE LA REPUBLICATION CI-DESSUS
// ══════════════════════════════════════════════════════════════════════════
// LA CAUSE, mesurée le 15/09 (blazer « 36 » d'Ornella, job 6aefaa2b) : la
// conversion nombre → lettre existait, mais DANS L'EXTENSION seulement
// (content-scripts/vinted.js, étape « 1ter » de findOptionCascade, livrée en
// 0.6.24), et derrière une condition qu'AUCUNE grille Vinted réelle ne
// satisfait :
//
//     if (!options.some((o) => /\d/.test(o.norm)))   // « grille purement lettrée »
//
// Toute grille lettrée Vinted finit par 4XL, 5XL … 9XL — qui contiennent un
// CHIFFRE. La condition est donc toujours fausse, et la conversion n'a jamais
// tourné une seule fois en production. Preuve : la jupe « 42 » d'Ornella a
// échoué DEUX FOIS (jobs 55d99d75 le 11/09, dab128c6 le 13/09) sur une
// extension 0.6.36, donc bien après la 0.6.24 censée l'avoir corrigée. Même
// condition morte dans le message « la catégorie est probablement fausse » de
// vinted.js : lui non plus n'est jamais sorti.
//
// D'où la reprise ICI, côté serveur : ça atteint TOUS les builds (Ornella est
// en 0.6.36) sans attendre un examen du Chrome Web Store, et ça met la table
// au même endroit que le reste des règles de taille Vinted.
//
// ⛔ CE QUI N'EST **JAMAIS** CONVERTI (règle du 10/09 : jamais une taille
//    approchée — mieux vaut le champ vide et un needs_user qu'une valeur
//    fausse sur l'annonce de quelqu'un) :
//   · une branche autre que FEMMES. La table est la grille FEMME de Vinted
//     (relevée dans /api/v2/size_groups, « XL / 42 / 14 »). Un « 36 » d'homme
//     n'est pas un S, un « 36 » d'enfant n'est pas une taille de vêtement, un
//     « 36 » de chaussure est une pointure — aucun ne passe par ici ;
//   · un nombre absent de la table (46, 48, 50…) : hors grille femme, on ne
//     devine pas ;
//   · une grille NON relevée : on n'invente pas un libellé qu'on n'a pas vu ;
//   · une grille qui contient DÉJÀ le nombre nu en option : l'extension le
//     matche par l'exact, on ne touche pas à ce qui marche ;
//   · une lettre cible absente de la grille relevée.
// Rien n'est réécrit en base : ce module calcule la valeur à SERVIR.

/** Grille FEMME de Vinted, relevée dans /api/v2/size_groups (« XL / 42 / 14 »).
 *  C'est la SEULE table de correspondance nombre → lettre du projet : la copie
 *  qui vivait dans content-scripts/vinted.js (TAILLE_LETTREE_PAR_NUMERIQUE,
 *  0.6.24) n'a jamais pu s'exécuter, et devient un filet pour les vieux builds.
 *
 *  ⛔ ELLE A DÉMÉNAGÉ LE 20/09 dans _shared/tailles.js, sans une virgule de
 *  changement, parce qu'Opla en a besoin AUSSI (sa grille G1 n'écrit que des
 *  lettres) et que le générateur `gen-tailles-content-script.mjs` porte ce
 *  module-là jusque dans l'extension. Deux copies d'une table, c'est la
 *  garantie qu'une des deux dérivera : il n'y en a toujours qu'une, et ce
 *  fichier la re-exporte pour que ses appelants ne bougent pas. */
export { TAILLE_FEMME_LETTRE_PAR_NOMBRE } from "./tailles.js";
import { TAILLE_FEMME_LETTRE_PAR_NOMBRE } from "./tailles.js";

/** Racines de la branche Femmes, dans les deux langues où les chemins sont
 *  relevés en base (category_key « Femmes > … » et « Women > … »). */
const RACINES_FEMMES = new Set(["FEMMES", "WOMEN"]);

/** La taille à servir dans platform_fields.taille d'un job vinted PUBLISH,
 *  ou le motif du hors-périmètre. Mêmes outils de comparaison que
 *  tailleAServir (normaliserTaille, options neutres) — une seule définition
 *  de « même libellé » pour les deux chemins.
 *  @param taille          platform_fields.taille du job (la taille de l'article)
 *  @param cheminCategorie categoryPath du job, joint par « > »
 *  @param options         allowed_values (libellés BRUTS) de la grille relevée
 *                         pour cette catégorie ; null/vide si non relevée
 */
export function tailleAServirPublication(args: {
  taille: unknown;
  cheminCategorie: unknown;
  options: string[] | null | undefined;
}, opts: { euCoupe?: boolean } = {}): TailleServie | TailleRefusee {
  const ordre = "femme:nombre→lettre";
  const refus = (motif: string): TailleRefusee => ({ valeur: null, etape: null, ordre, motif });
  const nt = normaliserTaille(args.taille);
  const grille = (Array.isArray(args.options) ? args.options : [])
    .map((o) => ({ brut: String(o), norm: normaliserTaille(o) }))
    .filter((o) => o.norm);

  // ── La règle d'HIER, intacte : branche Femmes, nombre → lettre ────────────
  const femmeNombreVersLettre = (): TailleServie | TailleRefusee => {
    if (!NOMBRE_RE.test(nt)) return refus("taille non numérique (hors périmètre)");

    const chemin = normaliserTaille(args.cheminCategorie);
    const racine = chemin.split(">")[0]?.trim() ?? "";
    if (!RACINES_FEMMES.has(racine)) return refus(`branche « ${racine || "inconnue"} » ≠ Femmes (table femme seulement)`);

    const lettre = TAILLE_FEMME_LETTRE_PAR_NOMBRE[nt];
    if (!lettre) return refus(`« ${nt} » absent de la grille femme (30→44)`);

    if (!grille.length) return refus("grille non relevée");

    // La grille propose déjà le nombre nu : l'extension le matche par l'exact.
    if (grille.some((o) => o.norm === nt)) return refus(`« ${nt} » est déjà une option de la grille`);

    const cible = grille.find((o) => o.norm === lettre);
    if (!cible) return refus(`lettre « ${lettre} » absente de la grille relevée`);

    return {
      valeur: cible.brut,
      etape: 3,
      ordre,
      detail: `« ${nt} » → « ${cible.brut} » (grille femme Vinted, lettre présente dans la grille relevée)`,
    };
  };
  const r = femmeNombreVersLettre();
  if (r.valeur !== null) return r;

  // ── DERNIER RECOURS (2026-09-23) : « N » → « EU N » de la grille relevée ──
  // Seulement là où hier on ne servait rien, et seulement si le client garde
  // le préfixe (euCoupe = false, capacité « taille_par_id »).
  if ((opts.euCoupe ?? true) === false) {
    const eu = optionEuPourNombreNu(nt, grille);
    if (eu) {
      return {
        valeur: eu.brut, etape: 1, ordre: "nu→EU N",
        detail: `« ${nt} » → « ${eu.brut} » (la grille relevée écrit « EU ${nt} », pas « ${nt} » nu — même taille, orthographe du formulaire)`,
      };
    }
  }
  return r;
}
/** Options présentes dans TOUTES les grilles : elles ne disent rien de sa forme. */
const OPTIONS_NEUTRES = new Set(["AUTRE", "TAILLE UNIQUE"]);
/** Le préfixe que vinted.js coupe : un libellé qui commence ainsi ne doit jamais être servi. */
const EU_COUPE_RE = /^EU /;

/** Ordre des étapes selon la forme de la capture (v3). */
export const ORDRE_CAPTURE_PREFIXEE: ReadonlyArray<Etape> = [3, 1, 2];
export const ORDRE_CAPTURE_NON_PREFIXEE: ReadonlyArray<Etape> = [1, 2, 3];
/** Ordre pour un client qui DÉCLARE la capacité « taille_par_id » (build qui pose
 *  la taille par id et par onglet, sans retirer « EU ») : le libellé exact
 *  redevient premier, la lettre n’est plus qu’un filet. C’est le retour à
 *  1 → 2 → 3 voulu par Nico « dans le même zip » — obtenu PAR CLIENT, au
 *  moment où il tourne ce code, sans commit à synchroniser. */
export const ORDRE_EXACT_D_ABORD: ReadonlyArray<Etape> = [1, 2, 3];

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
}, opts: { ordrePrefixe?: ReadonlyArray<Etape>; euCoupe?: boolean } = {}): TailleServie | TailleRefusee {
  const nt = normaliserTaille(args.captureTaille);
  const m = TAILLE_PREFIXEE_RE.exec(nt);
  // euCoupe = le client retire encore le préfixe « EU » (builds sans la
  // capacité « taille_par_id ») : un libellé « EU … » servi serait perdu.
  const euCoupe = opts.euCoupe ?? true;
  // ── PÉRIMÈTRE : capture préfixée (cf. bandeau) — ou NOMBRE NU (23/09) ─────
  // Un nombre nu n'entre que par la porte « EU N » ci-dessus : la grille
  // relevée l'écrit préfixé et pas nu, le client garde le préfixe. Sinon,
  // même refus qu'hier, mot pour mot.
  if (!m) {
    if (!euCoupe) {
      const grilleNue = (Array.isArray(args.options) ? args.options : [])
        .map((o) => ({ brut: String(o), norm: normaliserTaille(o) }))
        .filter((o) => o.norm);
      const eu = optionEuPourNombreNu(nt, grilleNue);
      if (eu) {
        return {
          valeur: eu.brut, etape: 1, ordre: "nu→EU N",
          detail: `« ${nt} » → « ${eu.brut} » (la grille relevée écrit « EU ${nt} », pas « ${nt} » nu — même taille, orthographe du formulaire)`,
        };
      }
    }
    return { valeur: null, etape: null, ordre: ORDRE_CAPTURE_NON_PREFIXEE.join("→"), motif: "capture non préfixée (hors périmètre)" };
  }
  const ordre = opts.ordrePrefixe ?? ORDRE_CAPTURE_PREFIXEE;
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
    if (euCoupe && EU_COUPE_RE.test(exact.norm)) { motifs.push(`1 : exact « ${exact.brut} » commence par EU (préfixe coupé par l'extension)`); return null; }
    return servi(exact.brut, 1, "libellé exact de la grille");
  };

  // ── 2. l'option qui contient la taille capturée comme jeton complet ───────
  const etape2 = (): TailleServie | null => {
    if (!relevee) { motifs.push("2 : grille non relevée"); return null; }
    const cands = grille.filter((o) => o.norm !== nt && contientJeton(o.norm, nt));
    if (cands.length === 0) { motifs.push("2 : aucune option par jeton"); return null; }
    if (cands.length > 1) { motifs.push(`2 : jeton ambigu (${cands.length} options : ${cands.slice(0, 4).map((c) => c.brut).join(" · ")})`); return null; }
    if (euCoupe && EU_COUPE_RE.test(cands[0].norm)) { motifs.push(`2 : jeton « ${cands[0].brut} » commence par EU (préfixe coupé par l'extension)`); return null; }
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

// ── LA GRILLE VUE AU DERNIER ÉCHEC DE CE JOB (2026-09-24) ─────────────────
// Quand le catalogue n'a pas de grille pour la catégorie (« Hommes > Vêtements
// > Costumes et blazers > Autres », catalog 1866 : aucune ligne size), la seule
// grille RÉELLE qu'on connaisse est celle que l'extension a relevée sur le
// formulaire au dernier échec de taille de ce même job — last_diagnostic :
//   « taille demandée « 48 » — candidats essayés : « 48 » — onglets vus :
//     S/M/L [XXS, XS, …] ; DE [DE 21, …, … +20] ; EU [EU 42, EU 44, …] »
// Rendue SEULEMENT si ce relevé porte sur la même taille que la capture : un
// relevé d'une autre taille ou d'un autre article ne sert jamais. Liste
// tronquée (20 par onglet) : ce qu'elle ne montre pas n'est pas servi.
export function grilleDuDernierEchecTaille(diagnostic: unknown, captureTaille: unknown): string[] | null {
  const d = String(diagnostic ?? "");
  const demandee = d.match(/taille demandée « ([^»]+) »/)?.[1];
  if (!demandee || normaliserTaille(demandee) !== normaliserTaille(captureTaille)) return null;
  const i = d.indexOf("onglets vus :");
  if (i < 0) return null;
  const options: string[] = [];
  for (const m of d.slice(i).matchAll(/\[([^\]]*)\]/g)) {
    for (const o of m[1].split(", ")) {
      const t = o.trim();
      if (t && !t.startsWith("…") && !options.includes(t)) options.push(t);
    }
  }
  return options.length ? options : null;
}
