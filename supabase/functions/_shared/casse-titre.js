// ═══════════════════════════════════════════════════════════════════════════
// TITRE REFUSÉ POUR « TROP DE MAJUSCULES » : FILLSELL REMET LA CASSE NORMALE SEUL
// (PROPOSÉ le 25/10 — décision de Nico à valider ; destination : supabase/functions/_shared/casse-titre.js)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (25/10) : « un titre refusé par une plateforme pour "trop de majuscules" est corrigé
// automatiquement par l'app : casse normale, marques et sigles conservés, rien d'autre de modifié dans le
// texte. Règle pour tous et pour chaque plateforme qui a ce refus. Puis son job repart seul. »
// Cas réel : Thierry Dubois, job Vinted fde2a207 (needs_user depuis le 23/10 12:32), titre venu de son
// annonce eBay « Monnaie Romaine , Maximin II DAIA, Follis Ou Nummus Spl », refusé en 400 :
//   {"field":"title","value":"Le titre contient trop de lettres majuscules. Essaie d'utiliser des minuscules."}
//
// CE QUE VINTED REFUSE — LA LIMITE EXACTE (mesurée le 25/10, lecture seule, 90 jours) :
//   7 CAPITALES LATINES À LA SUITE. Les espaces et la ponctuation entre elles ne coupent pas la suite ;
//   un CHIFFRE ou une MINUSCULE la coupe. 6 passe.
//   · les 3 refus des 90 jours ont tous une suite de 7, et aucun autre point commun :
//       « voyage BOURSIC 319 »  B-O-U-R-S-I-C            (08/09, 23 % de capitales)
//       « Cardigan KILIBBI rayé » K-I-L-I-B-B-I           (19/09, 26 %)
//       « Maximin II DAIA, Follis » I-I-D-A-I-A-F         (23/10, 29,5 %)
//     (et « Robe JANE WOOD marron », 15/08, src/utils/vintedTitle.js : J-A-N-E-W-O-O-D, 8) ;
//   · 104 048 titres ACCEPTÉS (publications et républications FillSell, relevés, dressings créés depuis
//     septembre) : 809 ont une suite de 6, AUCUN n'a de suite de 7 tel qu'envoyé (les 3 titres de job qui
//     en portent une sont partis tempérés ou réécrits) ;
//   · un chiffre coupe : si on l'ignorait, 1 385 titres acceptés seraient « au-dessus » (« PS2 PAL FR
//     Complet ») ; la virgule ne coupe pas (« II DAIA, F » a été refusé) ;
//   · la part de capitales NE décide PAS : 143 titres envoyés par FillSell et acceptés (60 jours) dépassent
//     30 % (« Sniper Elite III Afrika Special Edition Xbox One - PEGI 16 », 31 %), alors que BOURSIC était
//     refusé à 23 %. Les trois règles préventives d'avant mesurent une part (app 30 %, serveur 35 %,
//     extension 60 %) : Thierry (29,5 %) passait sous les trois.
//   · une capitale cyrillique ne compte pas (« Heron Preston СТИЛЬ - XL Homme » accepté).
//   Leboncoin, Beebs, eBay, Depop : AUCUN refus « majuscules » en 90 jours (ni dans le code, ni en base) :
//   pas de limite connue, donc rien de préventif ; la correction au refus vaut pour toute plateforme.
//
// LA RÈGLE (casseTitre) — seule la CASSE change, jamais un caractère, une espace, une ponctuation :
//   · un mot écrit entièrement en capitales (2 lettres ou plus) reprend la casse normale :
//     « BOURSIC » → « Boursic », « DAIA » → « Daia » (Capitalisé : un mot inconnu en capitales est le plus
//     souvent un nom propre, il ne perd jamais sa majuscule) ; les petits mots de liaison (de, et, avec,
//     with…) passent en minuscules ; le premier mot du titre garde sa capitale ;
//   · mode « phrase » (Vinted, Leboncoin, Beebs, Depop : l'usage des sites français) : un mot passe aussi en
//     minuscules quand le vendeur l'écrit lui-même en minuscules dans SA description (« LOT DE 3 LIVRES HARRY
//     POTTER » → « Lot de 3 livres Harry Potter ») ; mode « titre » (eBay) : Capitalisé (« Lot de 3 Livres
//     Harry Potter ») ;
//   · un titre ENTIÈREMENT en capitales : la marque s'y écrit comme la fiche l'écrit (« ZARA » → « Zara »),
//     le premier mot à la française (« T-SHIRT » → « T-shirt ») ;
//   · CONSERVÉS tels quels : la marque (fiche, copie, annonce capturée — reconnue aux accents, à la casse,
//     aux espaces et à la ponctuation près), les sigles (liste + tout mot de 2-3 lettres qui n'est pas un mot
//     courant : BMW, VW, LED, PAL, XXL…), les références et modèles (tout mot qui porte un chiffre :
//     11B941005B, PS4, F30, ID.4, W34), les chiffres romains (II, XVIII ; « XIXe » a une minuscule), et tout
//     mot qui mêle déjà majuscules et minuscules (iPhone, McRae, Dri-FIT) ;
//   · si la plateforme a une limite connue (Vinted : 7) et que des mots CONSERVÉS la dépassent encore
//     (« Cardigan KILIBBI rayé », la marque fait 7 à elle seule), le mot conservé qui porte le plus de
//     capitales dans la suite passe en casse normale (la marque garde ses lettres : « Kilibbi »), un à la
//     fois, jusqu'à passer ; jamais une référence à chiffre. Impossible → `encoreAuDessus` → la question.
// Idempotent. Un titre que rien ne vise ressort À L'IDENTIQUE.
//
// OÙ ELLE S'APPLIQUE (serveur d'abord : vaut tout de suite pour tout le parc, sans extension) :
//   1. pas-de-rouge (update-job-status), au refus « majuscules » : UNE reprise automatique avec le titre
//      corrigé, rangé comme une réponse (titre_refuse + titre_saisi : get-pending-jobs l'écrit sur le job et
//      archive l'ancien dans titre_refuse_remplace) — repriseTitreMajuscules ; marqueur titre_casse_corrigee ;
//      un deuxième refus → la question « Titre », comme avant ;
//   2. questions-tranchees (handler-watch), règle 8 : les questions « Titre » DÉJÀ posées pour ce motif
//      (Thierry) sont tranchées de la même façon, une fois — titreMajusculesATrancher ;
//   3. get-pending-jobs, au service : un titre Vinted qui atteint la limite part corrigé (préventif,
//      depasseSeuilMajuscules) — mesuré : ne change AUCUN des 104 048 titres acceptés ;
//   4. l'app, à la création (src/publication/moteur/regles.js, à côté de normalizeVintedTitle).
// Pur (Deno + Node) — ES module, un seul import pur.

import { archiverErreur } from "./erreurs-archivees.js";

/** Limite connue, par plateforme : nombre de capitales latines à la suite qui fait refuser le titre. */
export const SEUIL_SUITE_MAJUSCULES = Object.freeze({ vinted: 7 });

/** Casse d'un titre entièrement en capitales, selon l'usage du site. */
export const MODE_PAR_PLATEFORME = Object.freeze({
  vinted: "phrase", leboncoin: "phrase", beebs: "phrase", depop: "phrase", opla: "phrase", ebay: "titre",
});

/** Le motif du refus, dans les langues des plateformes. Seule la forme française est OBSERVÉE (3 refus Vinted,
 *  90 jours) ; les autres suivent les traductions courantes (vinted.it/.es/.de/.nl/.pl/.cz/.lt/.pt…). */
export const MOTIF_MAJUSCULES_RE = new RegExp([
  "majuscul", "maiuscol", "may[uú]scul", "mai[uú]scul", "gro(?:ß|ss)buchstab", "hoofdletter",
  "wielk(?:ich|ie|imi)\\s+liter", "velk[ýy]ch\\s+p[ií]smen", "ve[lľ]k[ýy]ch\\s+p[ií]smen", "did[žz]i[ųu]j[ųu]",
  "nagybet", "capital\\s+letter", "upper\\s*-?\\s*case", "κεφαλαί", "stora\\s+bokst", "store\\s+bokst",
  "store\\s+bogst", "isoja\\s+kirjaim", "litere\\s+mari", "velik(?:ih|a)\\s+slov",
].join("|"), "i");

// ── La mesure de la limite ──────────────────────────────────────────────────
const MAJ_LATINE_RE = /^(?=\p{Lu})\p{Script=Latin}$/u;
const COUPE_RE = /^[\p{L}\p{N}]$/u;

/** La plus longue suite de capitales latines : espaces, ponctuation, symboles et accents combinés ne la
 *  coupent pas ; un chiffre ou toute autre lettre (minuscule, autre écriture) la coupe. */
export function suiteMajusculesMax(titre) {
  let n = 0;
  let max = 0;
  for (const c of String(titre ?? "")) {
    if (MAJ_LATINE_RE.test(c)) { n++; if (n > max) max = n; }
    else if (COUPE_RE.test(c)) n = 0;
  }
  return max;
}

/** Le titre atteint-il la limite CONNUE de la plateforme ? (false si aucune limite n'est connue) */
export function depasseSeuilMajuscules(titre, plateforme) {
  const seuil = SEUIL_SUITE_MAJUSCULES[String(plateforme ?? "")];
  return Boolean(seuil) && suiteMajusculesMax(titre) >= seuil;
}

// ── Les listes ──────────────────────────────────────────────────────────────
/** Sigles et écritures officielles en capitales (comparés en capitales). Un mot de 2-3 lettres qui n'est pas
 *  un mot courant est déjà un sigle : cette liste sert surtout aux mots de 4 lettres et plus. */
export const SIGLES = new Set([
  "XXS", "XS", "XL", "XXL", "XXXL", "XXXXL", "TU",
  "HDMI", "OLED", "QLED", "AMOLED", "WIFI", "HIFI", "SDRAM", "NTSC", "SNES", "VOST", "VOSTFR", "BNWT", "NWOT",
  "FIFA", "PEGI", "UEFA", "NASA", "IKEA", "LEGO", "ASOS", "DKNY", "IKKS", "MSGM", "ASUS", "ABBA", "ACDC", "AC/DC",
  "LOSC", "ASSE", "OGCN", "USB-C", "USBC", "FNAC", "SNCF", "RATP", "CCCP", "URSS", "BTS",
]);
/** Mots courants (minuscules, sans accents) : jamais pris pour un sigle ; les MOTS_LIAISON passent en
 *  minuscules en mode « phrase ». */
const MOTS_LIAISON = new Set([
  "de", "du", "des", "le", "la", "les", "un", "une", "et", "ou", "en", "au", "aux", "a", "avec", "sans", "pour",
  "par", "sur", "sous", "dans", "chez", "tres", "ce", "cet", "cette", "ces", "son", "sa", "ses", "mon", "ma", "mes",
  "the", "and", "with", "for", "of", "in", "on", "to", "by", "from", "or", "an",
  "di", "da", "il", "lo", "gli", "per", "con", "el", "los", "las", "por", "sin", "y", "e", "der", "die", "das", "und", "mit",
]);
const MOTS_COURANTS_COURTS = new Set([
  ...MOTS_LIAISON,
  "lot", "sac", "top", "bob", "kit", "set", "box", "jeu", "bon", "ete", "new", "old", "big", "red", "men", "kid",
  "boy", "all", "one", "two", "six", "ten", "hat", "cap", "bag", "mix", "art", "pop", "toy", "car", "tee", "pin", "zip",
  "col", "mi", "nu", "oui", "non", "pas", "est", "vie", "bas", "duo", "uno", "due", "tre", "vos", "nos", "air", "max",
  "pro", "run", "fit", "sun", "sky", "day", "way", "cat", "dog", "fun", "hot", "ice", "joy", "key", "lady", "low",
  "mer", "mon", "roi", "sol", "tour", "eau", "feu", "fer", "or", "ou", "vin", "the", "you", "her", "his", "our",
]);
const ROMAIN_RE = /^(?=[IVX]{2,}$)X{0,3}(?:IX|IV|V?I{0,3})$/;
const GENERIQUES_MARQUE = new Set([
  "sans marque", "sans", "autre", "autres", "other", "others", "divers", "aucune", "aucun", "no brand", "unbranded",
  "generique", "non applicable", "n/a", "na", "inconnue", "inconnu", "fait main", "handmade", "artisanal", "marque",
]);

const sansAccent = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "");
const lettresDe = (s) => (String(s ?? "").match(/\p{L}/gu) ?? []).join("");

// ── La casse, caractère par caractère (jamais un caractère de plus ou de moins) ─
function versMin(c) { const m = c.toLowerCase(); return [...m].length === 1 ? m : c; }
function versMaj(c) { const m = c.toUpperCase(); return [...m].length === 1 ? m : c; }
/** Chaque suite de lettres : première en capitale, les autres en minuscules (« GORE-TEX » → « Gore-Tex »). */
function capitaliser(mot) {
  let debut = true;
  return [...mot].map((c) => {
    if (/\p{L}/u.test(c)) { const r = debut ? versMaj(c) : versMin(c); debut = false; return r; }
    if (!/\p{M}/u.test(c)) debut = true;
    return c;
  }).join("");
}
const minuscules = (mot) => [...mot].map(versMin).join("");

// ── Les marques : où sont-elles dans le titre ? ─────────────────────────────
const VARIANTES = { a: "aàáâãäåā", c: "cçćč", e: "eèéêëēė", i: "iìíîïī", n: "nñń", o: "oòóôõöøō", u: "uùúûüū", y: "yýÿ", s: "sśš", z: "zźżž", l: "lł", g: "gğ" };
function classeCaractere(c) {
  if (/\p{N}/u.test(c)) return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const base = sansAccent(c).toLowerCase();
  const v = VARIANTES[base] ?? base;
  const tout = [...new Set([...v, ...v.toUpperCase(), c, c.toLowerCase(), c.toUpperCase()])].join("");
  return `[${tout.replace(/[\]\\^-]/g, "\\$&")}]`;
}
/** Les plages [debut, fin) du titre occupées par une marque (accents, casse, espaces et ponctuation près). */
function plagesMarques(titre, marques) {
  const plages = [];
  for (const brute of marques) {
    const m = String(brute ?? "").trim();
    const cle = sansAccent(m).toLowerCase().replace(/\s+/g, " ").trim();
    if (!m || GENERIQUES_MARQUE.has(cle)) continue;
    const alnum = [...m].filter((c) => /[\p{L}\p{N}]/u.test(c));
    if (alnum.length < 2) continue;
    const corps = alnum.map(classeCaractere).join("[^\\p{L}\\p{N}]*");
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${corps}(?![\\p{L}\\p{N}])`, "gu");
    for (const x of titre.matchAll(re)) plages.push({ debut: x.index, fin: x.index + x[0].length, ecriture: m });
  }
  return plages;
}

// ── Les mots du titre ───────────────────────────────────────────────────────
// Un « jeton » = une suite sans espace ; son « cœur » = le jeton sans la ponctuation qui l'entoure
// (« DAIA, » → « DAIA », « (PES » → « PES »).
function decouper(titre) {
  const jetons = [];
  for (const x of titre.matchAll(/\S+/gu)) {
    const brut = x[0];
    const avant = brut.match(/^[^\p{L}\p{N}]*/u)[0].length;
    const apres = brut.match(/[^\p{L}\p{N}]*$/u)[0].length;
    const coeur = brut.slice(avant, brut.length - apres);
    jetons.push({ debut: x.index + avant, fin: x.index + brut.length - apres, coeur });
  }
  return jetons.filter((j) => j.coeur.length);
}

function classer(jeton, plages, sigles) {
  const c = jeton.coeur;
  const lettres = lettresDe(c);
  if (plages.some((p) => jeton.debut < p.fin && jeton.fin > p.debut)) return "marque";
  if (/\p{N}/u.test(c)) return "reference";
  if (!/\p{Script=Latin}/u.test(c)) return "autre_ecriture";
  if (lettres.length < 2) return "court";
  if (/\p{Ll}/u.test(c)) return "melange";
  if (lettres !== lettres.toUpperCase() || lettres === lettres.toLowerCase()) return "court";
  const haut = c.toUpperCase();
  if (sigles.has(haut) || SIGLES.has(haut)) return "sigle";
  if (ROMAIN_RE.test(lettres)) return "romain";
  const sousMots = c.split(/[^\p{L}]+/u).filter(Boolean);
  if (sousMots.length > 1 && sousMots.every((s) => s.length < 2 || sigles.has(s) || SIGLES.has(s) || ROMAIN_RE.test(s))) return "sigle";
  if (lettres.length <= 3 && !MOTS_COURANTS_COURTS.has(sansAccent(lettres).toLowerCase())) return "sigle";
  return "capitales";
}

/** Les mots que le texte de référence (la description du vendeur) écrit en minuscules, le plus souvent. */
function casseDeReference(reference) {
  const compte = new Map();
  for (const m of String(reference ?? "").match(/\p{L}+/gu) ?? []) {
    if (m.length < 2) continue;
    const cle = sansAccent(m).toLowerCase();
    const c = compte.get(cle) ?? { min: 0, autre: 0 };
    if (m === m.toLowerCase()) c.min++; else c.autre++;
    compte.set(cle, c);
  }
  return new Set([...compte].filter(([, c]) => c.min > 0 && c.min >= c.autre).map(([k]) => k));
}

/**
 * Le titre en casse normale, et ce qui a changé.
 * @param {unknown} titre
 * @param {{ marques?: unknown, sigles?: Iterable<string>, mode?: "phrase"|"titre"|null, plateforme?: string|null,
 *           reference?: string|null }} [o]  reference : la description du vendeur (casse de ses propres mots)
 * @returns {{ titre: string, change: boolean, changements: Array<{ de: string, vers: string, raison: string }>,
 *             encoreAuDessus: boolean, suiteAvant: number, suiteApres: number, mode: string }}
 */
export function casseTitreDetail(titre, { marques = [], sigles = [], mode = null, plateforme = null, reference = null } = {}) {
  const original = String(titre ?? "");
  const listeMarques = (Array.isArray(marques) ? marques : [marques]).filter((m) => typeof m === "string" && m.trim());
  const ensembleSigles = new Set([...(sigles ?? [])].map((s) => String(s).toUpperCase()));
  const modeEffectif = mode ?? MODE_PAR_PLATEFORME[String(plateforme ?? "")] ?? "titre";
  const seuil = SEUIL_SUITE_MAJUSCULES[String(plateforme ?? "")] ?? null;
  const plages = plagesMarques(original, listeMarques);
  const jetons = decouper(original).map((j) => ({ ...j, classe: classer(j, plages, ensembleSigles) }));
  // Les positions sont des index d'unités UTF-16 (matchAll) ; la casse ne change jamais une longueur
  // (versMin / versMaj gardent le caractère d'origine sinon) : les positions restent justes.
  let texte = original;
  const changements = [];
  const remplacer = (j, vers, raison) => {
    const de = texte.slice(j.debut, j.fin);
    if (vers === de || vers.length !== de.length || vers.toLowerCase() !== de.toLowerCase()) return;
    texte = texte.slice(0, j.debut) + vers + texte.slice(j.fin);
    changements.push({ de, vers, raison });
  };
  // La marque écrite comme la fiche l'écrit — seulement si ce sont les mêmes caractères à la casse près, et
  // que cette écriture passe la limite de la plateforme.
  const ecrireMarqueCommeLaFiche = (p, raison) => {
    const actuel = texte.slice(p.debut, p.fin);
    if (p.ecriture.length !== actuel.length || p.ecriture.toLowerCase() !== actuel.toLowerCase()) return false;
    if (seuil && suiteMajusculesMax(p.ecriture) >= seuil) return false;
    remplacer(p, p.ecriture, raison);
    return true;
  };
  // Un titre entièrement en capitales : aucune minuscule latine ailleurs que dans les références.
  const crie = !/\p{Ll}/u.test(jetons.filter((j) => j.classe !== "reference").map((j) => j.coeur).join(" "))
    && jetons.filter((j) => j.classe === "capitales").length >= 2;
  const premierAvecLettres = jetons.find((j) => /\p{L}/u.test(j.coeur));
  const ecritEnMinuscules = casseDeReference(reference);
  for (const j of jetons) {
    if (j.classe !== "capitales") continue;
    const cle = sansAccent(lettresDe(j.coeur)).toLowerCase();
    const premier = j === premierAvecLettres;
    let vers;
    // Début de phrase d'un titre crié : seule la toute première lettre reste en capitale (« T-SHIRT » → « T-shirt »).
    if (premier && crie && modeEffectif === "phrase") vers = capitaliser(j.coeur).replace(/(?<=[^\p{L}])\p{Lu}/gu, (c) => versMin(c));
    else if (premier) vers = capitaliser(j.coeur);
    // Les petits mots de liaison (de, et, avec, with…) : en minuscules, quel que soit le mode.
    else if (MOTS_LIAISON.has(cle)) vers = minuscules(j.coeur);
    // Mode « phrase » : en minuscules seulement un mot que le vendeur lui-même écrit en minuscules (sa
    // description) ; sinon Capitalisé — un nom propre ne perd jamais sa majuscule.
    else if (modeEffectif === "phrase" && ecritEnMinuscules.has(cle)) vers = minuscules(j.coeur);
    else vers = capitaliser(j.coeur);
    remplacer(j, vers, "capitales");
  }
  // Un titre crié ne dit rien de la casse de la marque : elle s'écrit comme la fiche l'écrit (mêmes lettres).
  if (crie) for (const p of plages) ecrireMarqueCommeLaFiche(p, "marque_ecriture_fiche");
  // La limite connue de la plateforme : on relâche, un mot conservé à la fois, celui qui porte le plus de
  // capitales dans la suite fautive (jamais une référence à chiffre, jamais un mot d'une autre écriture).
  const suiteAvant = suiteMajusculesMax(original);
  let encoreAuDessus = false;
  if (seuil) {
    const relachables = new Set(["marque", "sigle", "romain", "melange"]);
    for (let garde = 0; garde < 40 && suiteMajusculesMax(texte) >= seuil; garde++) {
      const suite = suiteFautive(texte, seuil);
      // Candidat : un mot conservé, dans la suite fautive, que la casse normale change vraiment.
      const candidats = jetons
        .filter((j) => relachables.has(j.classe) && j.debut < suite.fin && j.fin > suite.debut)
        .filter((j) => capitaliser(texte.slice(j.debut, j.fin)) !== texte.slice(j.debut, j.fin))
        .map((j) => ({ j, n: [...texte.slice(Math.max(j.debut, suite.debut), Math.min(j.fin, suite.fin))].filter((c) => MAJ_LATINE_RE.test(c)).length }))
        .sort((a, b) => (b.n - a.n) || (RANG[a.j.classe] - RANG[b.j.classe]) || (b.j.debut - a.j.debut));
      if (!candidats.length) break;
      const { j } = candidats[0];
      const raison = `limite_${plateforme}`;
      if (j.classe === "marque") {
        // Une marque se relâche EN ENTIER (« JANE WOOD » → « Jane Wood ») : comme la fiche l'écrit si ce sont
        // les mêmes lettres et que cette écriture passe, sinon chaque mot en casse normale.
        const p = plages.find((x) => j.debut < x.fin && j.fin > x.debut);
        const mots = jetons.filter((t) => t.classe === "marque" && t.debut < p.fin && t.fin > p.debut);
        if (!ecrireMarqueCommeLaFiche(p, raison) || suiteMajusculesMax(texte.slice(p.debut, p.fin)) >= seuil) {
          for (const t of mots) remplacer(t, capitaliser(texte.slice(t.debut, t.fin)), raison);
        }
        for (const t of mots) t.classe = "relache";
        continue;
      }
      j.classe = "relache";
      remplacer(j, capitaliser(texte.slice(j.debut, j.fin)), raison);
    }
    encoreAuDessus = suiteMajusculesMax(texte) >= seuil;
  }
  return {
    titre: texte, change: texte !== original, changements, encoreAuDessus,
    suiteAvant, suiteApres: suiteMajusculesMax(texte), mode: modeEffectif,
  };
}
const RANG = { sigle: 0, romain: 1, marque: 2, melange: 3 };

/** La première suite de capitales qui atteint la limite : plage [debut, fin) dans le texte. */
function suiteFautive(texte, seuil) {
  let n = 0;
  let debut = -1;
  let i = 0;
  for (const c of texte) {
    if (MAJ_LATINE_RE.test(c)) { if (n === 0) debut = i; n++; }
    else if (COUPE_RE.test(c)) { if (n >= seuil) return { debut, fin: i }; n = 0; }
    i += c.length;
  }
  return n >= seuil ? { debut, fin: i } : { debut: 0, fin: 0 };
}

/** Le titre en casse normale (voir casseTitreDetail). */
export function casseTitre(titre, options = {}) {
  return casseTitreDetail(titre, options).titre;
}

// ── Les branchements serveur (purs) ─────────────────────────────────────────
const CLE_TITRE_SAISI = "titre_saisi";
/** Les marques connues d'un job : la copie, l'annonce capturée (republication). */
export function marquesDuJob(pf) {
  const p = pf && typeof pf === "object" ? pf : {};
  return [p.marque, p.brand, p.republish_snapshot?.marque, p.marque_choisie]
    .filter((m) => typeof m === "string" && m.trim());
}
/** Le titre que la plateforme a réellement reçu : la réponse rangée, sinon le titre capturé d'une
 *  republication, sinon le titre du job. */
export function titreEnvoye({ title, action, platform_fields } = {}) {
  const pf = platform_fields && typeof platform_fields === "object" ? platform_fields : {};
  if (typeof pf[CLE_TITRE_SAISI] === "string" && pf[CLE_TITRE_SAISI].trim()) return pf[CLE_TITRE_SAISI];
  if (action === "republish" && typeof pf.republish_snapshot?.titre === "string" && pf.republish_snapshot.titre.trim()) return pf.republish_snapshot.titre;
  return String(title ?? "");
}

/**
 * pas-de-rouge (refus au dépôt, champ « title ») : la reprise « casse normale », ou null (la question
 * « Titre » part alors, comme avant). Une fois par job (pf.titre_casse_corrigee).
 * @returns {null | { avant: string, apres: string, pf: Record<string, unknown> }}
 */
export function repriseTitreMajuscules({ titre, action = "publish", plateforme = "vinted", pf = {}, motifRefus,
  reference = null, maintenant = new Date().toISOString(), par = "update-job-status (pas-de-rouge)" } = {}) {
  if (!MOTIF_MAJUSCULES_RE.test(String(motifRefus ?? ""))) return null;
  if (pf && pf.titre_casse_corrigee) return null;
  const avant = titreEnvoye({ title: titre, action, platform_fields: pf });
  const d = casseTitreDetail(avant, { marques: marquesDuJob(pf), plateforme, reference });
  if (!d.change || d.encoreAuDessus || !d.titre.trim()) return null;
  return {
    avant, apres: d.titre,
    pf: {
      titre_refuse: { motif: String(motifRefus), le: maintenant },
      [CLE_TITRE_SAISI]: d.titre,
      titre_casse_corrigee: { le: maintenant, avant: avant.slice(0, 200), apres: d.titre, par, changements: d.changements.slice(0, 8) },
    },
  };
}

const TICKS = ["needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];

/**
 * questions-tranchees (handler-watch), règle 8 : une question « Titre » posée pour le motif « majuscules »
 * est tranchée par le titre en casse normale — la publication (ou la republication) repart, comme après une
 * réponse de la personne. Une seule passe par job ; titre_refuse est GARDÉ (c'est lui qui fait écrire
 * titre_saisi sur le job par get-pending-jobs, l'ancien titre archivé dans titre_refuse_remplace).
 * @returns {null | { avant: string, apres: string, platform_fields: Record<string, unknown> }}
 */
export function titreMajusculesATrancher(job, maintenant = new Date().toISOString()) {
  if (!job || job.status !== "needs_user") return null;
  if (job.action !== "publish" && job.action !== "republish") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : null;
  if (!pf || pf.needs_user_source !== "champ_a_choisir") return null;
  if (pf.needsUserField?.target?.key !== CLE_TITRE_SAISI) return null;
  if (!MOTIF_MAJUSCULES_RE.test(String(pf.titre_refuse?.motif ?? ""))) return null;
  if (pf.titre_casse_corrigee) return null;
  // La question n'a pas encore de réponse : le titre refusé est celui du job (ou le capturé d'une republication).
  const avant = titreEnvoye({ title: job.title, action: job.action, platform_fields: { ...pf, [CLE_TITRE_SAISI]: undefined } });
  const d = casseTitreDetail(avant, { marques: marquesDuJob(pf), plateforme: job.platform, reference: job.description ?? null });
  if (!d.change || d.encoreAuDessus || !d.titre.trim()) return null;
  const np = { ...pf };
  for (const k of ["needs_user_source", "needsUserField", "needsUserFields", ...TICKS]) delete np[k];
  np.needsUserAttempts = 0;
  np[CLE_TITRE_SAISI] = d.titre;
  np.needsUserResolved = { ...(pf.needsUserResolved ?? {}), [CLE_TITRE_SAISI]: d.titre };
  np.titre_casse_corrigee = { le: maintenant, avant: avant.slice(0, 200), apres: d.titre,
    par: "handler-watch (questions tranchées, règle 8)", changements: d.changements.slice(0, 8) };
  np.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error ?? null, "needs_user",
    "handler-watch (titre : casse normale remise)");
  return { avant, apres: d.titre, platform_fields: np };
}
