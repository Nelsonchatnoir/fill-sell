// ═══════════════════════════════════════════════════════════════════════════
// BEEBS — RE-ÉCRIRE LA VALEUR DU JOB DANS L'ORTHOGRAPHE DU CATALOGUE,
// ET L'ENVOYER SUR LE CHAMP QUI LA RÉCLAME (2026-09-08)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE ÇA FAIT, ET SURTOUT CE QUE ÇA NE FAIT PAS.
//
// Ça ne CHOISIT jamais une valeur. Ça la RE-ÉPELLE, et ça la ROUTE :
//   · re-épeler : « 85 G » devient « 85G », « VILA » devient « Vila » —
//     la même valeur, écrite comme Beebs l'écrit. La comparaison ignore la
//     casse, les accents, les espaces et la ponctuation, et RIEN D'AUTRE ;
//   · router : une catégorie peut porter DEUX champs du même libellé — on
//     adresse alors CHACUN par sa clé positionnelle (« Taille [#1] »,
//     « Taille [#2] ») et on coupe le canal dédié, qui frappait les deux
//     (relevé live le 08/09 : « Pyjamas (femme) » a « Taille » = XXXS/30 … et
//     « Taille [#2] » = 75A … 95L ; « Chemises (homme) » a la taille et le col
//     — le cas fondateur de Joséphine). Quand la valeur n'appartient qu'au
//     SECOND, on la pose sur le second, via platform_fields.beebsAspects
//     — le canal générique que l'extension 0.6.20 lit DÉJÀ en production
//     (content-scripts/beebs.js, boucle `fields.beebsAspects`, dont la garde
//     `handledLabels` ne saute que les libellés NUS : une clé à discriminant
//     passe, et resoudreChamps() l'envoie sur le bon champ).
//
// ⛔ EXACT OU RIEN. Aucune valeur voisine, aucun « au plus proche », aucun
//    repli « Autre », aucune valeur absente d'allowed_values. Sans
//    correspondance sûre, on ne pose RIEN et le job continue de demander à
//    l'utilisateur : poser une valeur voisine, c'est refaire le bug avec un
//    autre habillage.
// ⛔ POURQUOI C'EST SÛR MALGRÉ UN CATALOGUE QUI PEUT ÊTRE PÉRIMÉ : on ne pose
//    jamais qu'une réécriture de ce que le job PORTE DÉJÀ. Si le libellé a
//    changé chez Beebs depuis le relevé, la cascade de l'extension ne matchera
//    pas — exactement comme aujourd'hui. On ne peut donc pas introduire une
//    valeur que le vendeur n'a jamais voulue.
// ⛔ UNE LISTE TRONQUÉE NE PROUVE RIEN. « Marque » est stockée à 60 valeurs
//    (l'extension coupe son relevé DOM à 60) alors que Beebs en propose ~1 400 :
//    l'ABSENCE d'une marque du catalogue ne dit rien. C'est sans conséquence
//    ici, puisqu'on n'agit que sur une correspondance POSITIVE — une troncature
//    ne peut produire qu'un faux négatif, jamais un faux positif.
// ⛔ AMBIGUÏTÉ = RIEN. Si deux valeurs d'un même champ se ramènent à la même
//    forme comparable, on ne tranche pas.
// ⛔ allowed_values vide ou nul : on ne tente rien, on ne devine pas.
// ⛔ Une valeur déjà présente dans beebsAspects (réponse de l'utilisateur,
//    saisie du mini-éditeur) n'est JAMAIS écrasée.
// ═══════════════════════════════════════════════════════════════════════════

import { texteComparable } from "./texte-comparable.ts";

export interface AspectRow {
  category_key: string;
  field_key: string;
  field_label?: string | null;
  required?: boolean | null;
  allowed_values?: unknown;
}

/** Miroir EXACT de BEEBS_DEDICATED_TARGETS (content-scripts/beebs.js) : le
 *  libellé NU d'un champ ↔ la clé racine de platform_fields que l'extension
 *  lit pour le remplir. Les deux doivent dire la même chose, sinon on
 *  écrirait dans une clé que personne ne lit. */
export const BEEBS_CHAMPS_DEDIES: Record<string, string> = {
  "Couleur": "couleur",
  "Marque": "marque",
  "Pointure": "taille",
  "Taille": "taille",
  "État": "etat",
  "Matière": "matiere",
  "Âge": "age",
  "Format du colis": "format_colis",
};

/** Clé racine de platform_fields → libellés de champ Beebs qu'elle alimente.
 *  « taille » en nourrit DEUX (Pointure pour les chaussures, Taille ailleurs) :
 *  jamais les deux à la fois dans une catégorie, l'absent est ignoré. */
const LIBELLES_PAR_CLE: Record<string, string[]> = {
  taille: ["Taille", "Pointure"],
  marque: ["Marque"],
  etat: ["État"],
  couleur: ["Couleur"],
  matiere: ["Matière"],
  age: ["Âge"],
  format_colis: ["Format du colis"],
};

/** Libellé NU d'une clé de champ : « Taille [#2] » → « Taille ». Copie de
 *  libelleHumainDeCle (beebs.js). */
export const libelleDeCle = (cle: string): string =>
  String(cle ?? "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();

/** Un champ HOMONYME porte un discriminant ; le premier du libellé garde le
 *  libellé nu pour clé. Copie de cleADiscriminant (beebs.js). */
export const cleADiscriminant = (cle: string): boolean =>
  /\[[^\]]+\]\s*$/.test(String(cle ?? ""));

/** Clé POSITIONNELLE (« Taille [#2] ») : née d'un relevé où le pont MAIN
 *  était muet. L'extension REFUSE d'écrire sur une telle clé depuis le 08/09
 *  (décision Nico : jamais d'écriture à l'aveugle sur un homonyme) — le
 *  serveur ne doit donc ni en fabriquer ni en servir (chantier Beebs du
 *  11/09 : c'est cette contradiction qui faisait boucler la « Taille » des
 *  soutiens-gorge de Marie-Pierre, 4 jobs). Copie de la règle de
 *  resoudreChamps (beebs.js). */
export const clePositionnelle = (cle: string): boolean =>
  /\[#\d+\]\s*$/.test(String(cle ?? ""));

/** Forme COMPARABLE d'un libellé pour CE rapprochement : la forme comparable
 *  canonique du parc (texteComparable — accents, apostrophes, tirets,
 *  guillemets, invisibles, casse) DÉBARRASSÉE en plus de tout ce qui n'est ni
 *  lettre ni chiffre.
 *
 *  Ce dernier tour de vis est ce que la cascade de l'extension ne fait pas, et
 *  c'est exactement le trou mesuré : « 85 G » ne matchait pas « 85G » (job
 *  500c04c6), « Neuf sans étiquette » ne matchait pas « Neuf, sans étiquette ».
 *  Il reste RÉVERSIBLE au sens qui compte : il ne rapproche que des écritures
 *  d'une MÊME valeur, jamais deux valeurs différentes — « Unique » ne devient
 *  pas « Taille unique », « Gris chiné » ne devient pas « Gris ». */
export function comparable(v: unknown): string {
  return texteComparable(v).replace(/[^a-z0-9]+/g, "");
}

/** Les valeurs autorisées d'une ligne de catalogue, en texte, ou [] . */
function valeursDe(row: AspectRow): string[] {
  const v = row.allowed_values;
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

/** L'unique valeur de `row` dont la forme comparable vaut `cible`.
 *  null si aucune, ET null si plusieurs (ambiguïté ⇒ on ne tranche pas). */
function valeurComparableUnique(row: AspectRow, cible: string): string | null {
  if (!cible) return null;
  const trouvees = valeursDe(row).filter((o) => comparable(o) === cible);
  return trouvees.length === 1 ? trouvees[0] : null;
}

export interface ValeurPosee {
  /** Clé racine de platform_fields d'où vient la valeur (« taille »…). */
  cle_source: string;
  /** Champ Beebs visé, clé du catalogue (« Taille », « Taille [#2] »…). */
  champ: string;
  valeur_source: string;
  valeur_posee: string;
  /** exacte_autre_champ | normalisee | normalisee_autre_champ */
  methode: string;
}

export interface ResultatRapprochement {
  /** Clés racine de platform_fields à réécrire (re-épellation seule). */
  racines: Record<string, string>;
  /** Clés à AJOUTER dans platform_fields.beebsAspects. */
  aspects: Record<string, string>;
  /** Trace, une ligne par valeur posée. */
  posees: ValeurPosee[];
}

/**
 * Rapproche les valeurs d'un job Beebs du catalogue relevé pour SA catégorie.
 *
 * @param pf      platform_fields du job (lu, jamais muté).
 * @param aspects lignes de platform_category_aspects de CETTE catégorie.
 *
 * Ordre de résolution, dans cet ordre exact :
 *   a. correspondance EXACTE sur le champ principal → rien à faire, la valeur
 *      part déjà telle quelle (aucune trace : rien n'a été touché) ;
 *   b. correspondance EXACTE sur un AUTRE champ du même libellé → on route
 *      vers ce champ (beebsAspects) ;
 *   c. correspondance à la forme comparable sur le champ principal → on
 *      ré-épelle la clé racine ;
 *   d. correspondance à la forme comparable sur un homonyme → on route ET on
 *      ré-épelle.
 */
export function rapprocherValeursBeebs(
  pf: Record<string, unknown>,
  aspects: AspectRow[],
): ResultatRapprochement {
  const res: ResultatRapprochement = { racines: {}, aspects: {}, posees: [] };
  if (!aspects.length) return res;

  const dejaSaisi = (pf["beebsAspects"] ?? {}) as Record<string, unknown>;

  for (const [cleRacine, libelles] of Object.entries(LIBELLES_PAR_CLE)) {
    // « couleur » : l'app pose parfois colors[] et rien d'autre — même source
    // que celle que lit l'extension (fields.colors?.[0] || fields.couleur).
    const brut = cleRacine === "couleur"
      ? (pf["couleur"] ?? (Array.isArray(pf["colors"]) ? (pf["colors"] as unknown[])[0] : null))
      : pf[cleRacine];
    const valeur = String(brut ?? "").trim();
    if (!valeur) continue;
    const cible = comparable(valeur);
    if (!cible) continue;

    // Champs de la catégorie portant l'un de ces libellés, principal d'abord.
    const champs = aspects
      .filter((a) => libelles.includes(libelleDeCle(a.field_key)) && valeursDe(a).length && !clePositionnelle(a.field_key))
      .sort((a, b) => Number(cleADiscriminant(a.field_key)) - Number(cleADiscriminant(b.field_key)));
    if (!champs.length) continue;

    // ── LIBELLÉ DUPLIQUÉ : LE CANAL DÉDIÉ DOIT SE TAIRE ────────────────────
    // `platform_fields.taille` fait poser la MÊME valeur sur TOUS les champs
    // « Taille » de la page (selectDropdownValue → resoudreChamps sur le
    // libellé nu). Sur une catégorie qui en porte deux, l'un des deux la
    // refuse forcément — et son refus l'inscrit dans `unfilledRequired`, que
    // rien ne retire ensuite, même quand une passe ultérieure le remplit
    // (relevé 08/09 sur le job 500c04c6 : « Taille [#2] » rempli à 85G et
    // pourtant redemandé). C'est CE défaut qui rendait la catégorie
    // structurellement impubliable, et qui aurait rejoué la boucle de
    // Joséphine à la première réponse de la vendeuse.
    //
    // On coupe donc le canal dédié pour ce libellé et on adresse CHAQUE champ
    // par une clé à discriminant POSITIONNEL — « Taille [#1] », « Taille [#2] » :
    //   · resoudreChamps() de la 0.6.20 les résout par position (`^#(\d+)$`) ;
    //   · aucune n'est dans `handledLabels`, donc la boucle beebsAspects les
    //     sert toutes les deux ;
    //   · plus aucune passe ne peut échouer sur un champ qui n'est pas le sien.
    // Un champ dont on n'a pas la valeur reste VIDE et ressort de l'énumération
    // — needsUser honnête, sur LE champ qui manque, avec SA liste.
    const parLibelle = new Map<string, AspectRow[]>();
    for (const a of champs) {
      const l = libelleDeCle(a.field_key);
      parLibelle.set(l, [...(parLibelle.get(l) ?? []), a]);
    }
    const duplique = parLibelle.size === 1 && [...parLibelle.values()][0].length > 1
      ? [...parLibelle.entries()][0]
      : null;
    if (duplique) {
      // ── Libellé DUPLIQUÉ (2026-09-11, chantier Beebs) ─────────────────────
      // Le 1er champ garde le libellé NU : c'est le canal DÉDIÉ de l'extension
      // (platform_fields.taille → selectDropdownValue("Taille") sur chaque
      // champ « Taille », chacun contre SA liste) qui le sert. On ne lui
      // fabrique plus de clé positionnelle « Taille [#1] » : l'extension la
      // refusait, la valeur n'était jamais posée, et le canal dédié était
      // coupé (« canal_dedie_coupe ») — la réponse de l'utilisatrice, écrite
      // dans platform_fields.taille par le mini-éditeur, était effacée à
      // chaque passage (boucle « valeur_inchangee », 0432fc43/500c04c6 et
      // leurs copies du 11/09). Les homonymes SUIVANTS ne sont servis que par
      // une clé NOMINATIVE (« Taille [attributes.women_bras] ») que
      // resoudreChamps sait retrouver ; les lignes positionnelles du catalogue
      // sont écartées en amont (clePositionnelle).
      const [label, rangs] = duplique;
      const premier = rangs.find((a) => !cleADiscriminant(a.field_key)) ?? null;
      const suivants = rangs.filter((a) => a !== premier);
      const dansPremier = premier
        ? (valeursDe(premier).includes(valeur) ? valeur : valeurComparableUnique(premier, cible))
        : null;
      if (dansPremier) {
        // La valeur appartient au 1er champ : le canal dédié la pose (ré-épelée
        // si besoin). Rien à router ailleurs.
        if (dansPremier !== valeur) {
          res.racines[cleRacine] = dansPremier;
          res.posees.push({
            cle_source: cleRacine, champ: premier!.field_key,
            valeur_source: valeur, valeur_posee: dansPremier, methode: "normalisee",
          });
        }
        continue;
      }
      let route = 0;
      for (const a of suivants) {
        if (String(dejaSaisi[a.field_key] ?? "").trim()) { route++; continue; }
        const exacte = valeursDe(a).includes(valeur) ? valeur : valeurComparableUnique(a, cible);
        if (!exacte) continue;
        res.aspects[a.field_key] = exacte;
        res.posees.push({
          cle_source: cleRacine, champ: a.field_key,
          valeur_source: valeur, valeur_posee: exacte, methode: "homonyme_champ_n",
        });
        route++;
      }
      // Routée vers un homonyme NOMINATIF et absente de la liste du 1er champ :
      // la racine est vidée pour que le canal dédié n'aille pas la refrapper
      // sur le 1er champ (elle n'y existe pas) — le 1er champ, resté vide,
      // sera DEMANDÉ, et la réponse (platform_fields.<racine>) sera posée par
      // le canal dédié au passage suivant, sans jamais être effacée ici : elle
      // appartient alors à la liste du 1er champ, branche dansPremier.
      if (route) {
        res.racines[cleRacine] = "";
        res.posees.push({
          cle_source: cleRacine, champ: label,
          valeur_source: valeur, valeur_posee: "", methode: "canal_dedie_route_homonyme",
        });
      }
      continue;
    }

    // a. EXACT sur le champ principal : la valeur part déjà bien, on ne
    //    touche à rien. C'est le cas de la quasi-totalité du parc.
    if (champs.some((a) => !cleADiscriminant(a.field_key) && valeursDe(a).includes(valeur))) continue;

    // b. EXACT sur un homonyme → routage, valeur inchangée.
    const exactHomonyme = champs.find((a) => cleADiscriminant(a.field_key) && valeursDe(a).includes(valeur));
    if (exactHomonyme) {
      if (String(dejaSaisi[exactHomonyme.field_key] ?? "").trim()) continue;
      res.aspects[exactHomonyme.field_key] = valeur;
      res.posees.push({
        cle_source: cleRacine, champ: exactHomonyme.field_key,
        valeur_source: valeur, valeur_posee: valeur, methode: "exacte_autre_champ",
      });
      continue;
    }

    // c/d. Forme comparable — champ principal d'abord (le tri l'a mis devant).
    let traite = false;
    for (const a of champs) {
      const exacte = valeurComparableUnique(a, cible);
      if (!exacte) continue;
      const homonyme = cleADiscriminant(a.field_key);
      const racine = homonyme ? null : BEEBS_CHAMPS_DEDIES[libelleDeCle(a.field_key)];
      if (racine) {
        // Ré-épellation de la clé racine. La valeur reste LA MÊME (formes
        // comparables égales par construction) : on ne remplace jamais un
        // pré-rempli par autre chose que lui-même mieux écrit.
        if (exacte !== valeur) {
          res.racines[racine] = exacte;
          res.posees.push({
            cle_source: cleRacine, champ: a.field_key,
            valeur_source: valeur, valeur_posee: exacte, methode: "normalisee",
          });
        }
      } else {
        if (String(dejaSaisi[a.field_key] ?? "").trim()) { traite = true; break; }
        res.aspects[a.field_key] = exacte;
        res.posees.push({
          cle_source: cleRacine, champ: a.field_key,
          valeur_source: valeur, valeur_posee: exacte, methode: "normalisee_autre_champ",
        });
      }
      traite = true;
      break;
    }
    if (!traite) continue; // rien de sûr : on ne pose RIEN, le job demandera.
  }

  // ── Marque que Beebs a lui-même déclarée introuvable (cf. plus haut) ──────
  // Après la ré-épellation : si celle-ci a trouvé la marque dans le catalogue,
  // le warning est périmé et on ne touche à rien.
  if (!String(res.racines["marque"] ?? "").trim()) {
    const marqueKo = marqueIntrouvableBeebs(pf, aspects);
    if (marqueKo && !(marqueKo.aspect && res.aspects[marqueKo.aspect])) {
      if (marqueKo.aspect) {
        res.aspects[marqueKo.aspect] = marqueKo.valeur;
        res.racines["marque"] = ""; // routée vers l'homonyme nominatif : la passe « Marque » ne refrappe pas la marque refusée
      } else {
        res.racines["marque"] = marqueKo.valeur; // champ nu : le canal dédié pose « Autre » en exact
      }
      res.posees.push({
        cle_source: "marque", champ: marqueKo.aspect ?? "Marque",
        valeur_source: marqueKo.valeur_source, valeur_posee: marqueKo.valeur,
        methode: "marque_introuvable_bac_autre",
      });
    }
  }

  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE (d) — CE QUE L'IA A LE DROIT DE TRANCHER, ET SUR QUOI
// ═══════════════════════════════════════════════════════════════════════════
// Le déterministe ci-dessus ne sait que ré-épeler. Quand il ne tombe sur rien,
// il reste deux situations que Beebs refuse également : la fiche porte une
// valeur que la liste n'a pas sous cette forme (« Unique » face à « Taille
// unique »), et la fiche ne porte RIEN alors que le champ est obligatoire.
// L'IA tranche alors DANS la liste, avec droit explicite de répondre « aucune »
// (resolve-categorie, mode `listes`, SYSTEM_LISTES — « JAMAIS au plus proche »).
//
// ⛔ LISTES FERMÉES SEULEMENT, ET ON SAIT LESQUELLES LE SONT.
//    L'extension coupe son relevé DOM à 60 valeurs : une liste stockée à 60
//    est donc SUSPECTE DE TRONCATURE, et arbitrer dans une liste tronquée,
//    c'est choisir dans un catalogue dont on ne voit qu'un bout. Plafond
//    strict : 1 ≤ n < 60.
// ⛔ « Marque » est exclue NOMMÉMENT en plus du plafond : Beebs en propose
//    ~1 400, le catalogue en garde 60. Aucune de ses listes n'est fermée.
// ⛔ Champs OBLIGATOIRES seulement : un champ facultatif vide ne bloque
//    personne, et le faire remplir par une machine n'apporte rien.
// ⛔ Jamais un champ que le déterministe vient de servir, jamais un champ
//    portant déjà une réponse de l'utilisateur, jamais un champ déjà tranché
//    (y compris quand la réponse fut « aucune » : on ne repose pas la question).
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// MARQUE INTROUVABLE CHEZ BEEBS — CE QUE LE SERVEUR PEUT, ET SUR QUELLE PREUVE
// ═══════════════════════════════════════════════════════════════════════════
// beebs.js ne bascule sur le bac générique « Autre » que si la recherche rend
// ZÉRO option (`if (!options.length && !sizeField)`). Mesuré sur 30 jours :
// 114 jobs passent par ce repli et publient. Mais quand Beebs rend des marques
// qui CONTIENNENT le texte cherché sans être la bonne, la liste n'est pas vide
// et le repli ne se déclenche jamais — le champ reste vide et le job boucle.
// Les 2 seuls cas du parc en 30 jours, relevés dans les warnings des jobs :
//   « VILA » → ["Vilac"]        (job 8885d178, failed)
//   « alo »  → ["Kaloo","Kimbaloo","Lunaloop","Palomino","Salomon"] (e5f68f81)
//
// ⛔ LE CATALOGUE NE PEUT PAS SERVIR DE PREUVE : « Marque » y est stockée à 60
//    valeurs pour ~1 400 chez Beebs. L'absence d'une marque n'y prouve RIEN.
//    La seule preuve acceptée est celle rendue par BEEBS LUI-MÊME, sur CET
//    article, dans CE champ : le warning du job, écrit à partir de la liste
//    réellement affichée. Sans ce warning, on ne pose rien.
// ⛔ ET ON NE POSE PAS UNE AUTRE MARQUE : « Autre » est un BAC, pas une marque
//    voisine. C'est exactement la valeur que l'extension choisit déjà elle-même
//    dans les 114 autres cas — on n'invente aucune politique, on étend la
//    sienne au cas qu'elle ne sait pas voir. « Sans marque » serait un mensonge
//    (l'article EN a une).
// Écriture : `Marque [#1]` (clé positionnelle, hors handledLabels) ET le canal
// dédié coupé — sinon la passe `Marque` refrapperait le champ avec la marque
// refusée et l'inscrirait à tort dans unfilledRequired.
// ═══════════════════════════════════════════════════════════════════════════

const MARQUE_REFUS = /^Marque\b[^:]*:\s*"(.*?)"\s+sans correspondance/;
const MARQUE_OPTIONS = /Options affichées\s*:\s*(\[[\s\S]*\])\s*$/;

/** Le texte d'un warning, qu'il soit une chaîne ou un objet {message}. */
function messageWarning(w: unknown): string {
  if (typeof w === "string") return w;
  if (w && typeof w === "object") return String((w as Record<string, unknown>).message ?? "");
  return "";
}

/**
 * Beebs a-t-il DÉJÀ dit, sur ce job, qu'il ne connaît pas cette marque tout en
 * rendant des options ? Retourne la pose à faire, ou null.
 */
export function marqueIntrouvableBeebs(
  pf: Record<string, unknown>,
  aspects: AspectRow[],
): { aspect: string | null; valeur: string; valeur_source: string } | null {
  const marque = String(pf["marque"] ?? "").trim();
  if (!marque) return null;
  const dejaSaisi = (pf["beebsAspects"] ?? {}) as Record<string, unknown>;

  const brut = pf["warnings"];
  if (!Array.isArray(brut)) return null;
  let prouve = false;
  for (const w of brut) {
    const m = MARQUE_REFUS.exec(messageWarning(w));
    if (!m) continue;
    // Le warning doit porter sur LA valeur que le job envoie encore : un
    // relevé qui parle d'une autre marque est périmé.
    if (comparable(m[1]) !== comparable(marque)) continue;
    const o = MARQUE_OPTIONS.exec(messageWarning(w));
    let options: unknown = null;
    try { options = o ? JSON.parse(o[1]) : null; } catch { options = null; }
    // Liste VIDE : l'extension bascule déjà seule sur « Autre », rien à faire.
    if (!Array.isArray(options) || options.length === 0) continue;
    prouve = true;
    break;
  }
  if (!prouve) return null;

  const champsMarque = aspects.filter((a) => libelleDeCle(a.field_key) === "Marque");
  if (!champsMarque.length) return null;
  // Champ « Marque » nu → la racine platform_fields.marque reçoit « Autre »
  // (le canal dédié la pose en exact) ; jamais plus de clé positionnelle
  // « Marque [#1] », refusée par l'extension (chaussettes Alo, 11/09).
  const nominatif = champsMarque.find((a) => cleADiscriminant(a.field_key) && !clePositionnelle(a.field_key));
  const cle = nominatif ? nominatif.field_key : null;
  if (cle && String(dejaSaisi[cle] ?? "").trim()) return null;
  if (String(dejaSaisi["Marque"] ?? "").trim()) return null;
  return { aspect: cle, valeur: "Autre", valeur_source: marque };
}

/** Plafond de fermeture d'une liste : l'extension tronque son relevé à 60. */
export const BEEBS_LISTE_FERMEE_MAX = 60;

export interface ChampArbitrable {
  field_key: string;
  label: string;
  options: string[];
  /** Ce que la fiche porte pour ce champ, "" si elle ne porte rien. */
  valeur_source: string;
  /** Où écrire la réponse pour que l'extension 0.6.20 la pose. */
  cible: { racine: string | null; aspect: string | null };
}

/**
 * Les champs de cette catégorie qu'on a le droit de soumettre à l'IA, une fois
 * le rapprochement déterministe passé.
 *
 * @param pf       platform_fields du job
 * @param aspects  lignes de catalogue de la catégorie
 * @param deja     résultat du rapprochement déterministe (ses poses comptent
 *                 comme servies)
 * @param tranches clés de champ déjà tranchées par l'IA (valeur retenue OU
 *                 « aucune ») — on ne repose jamais la même question
 */
export function champsArbitrablesBeebs(
  pf: Record<string, unknown>,
  aspects: AspectRow[],
  deja: ResultatRapprochement,
  tranches: Record<string, unknown> = {},
): ChampArbitrable[] {
  const dejaSaisi = (pf["beebsAspects"] ?? {}) as Record<string, unknown>;
  const out: ChampArbitrable[] = [];

  // Combien de champs partagent chaque libellé : décide de la cible d'écriture.
  const parLibelle = new Map<string, AspectRow[]>();
  for (const a of aspects) {
    const l = libelleDeCle(a.field_key);
    parLibelle.set(l, [...(parLibelle.get(l) ?? []), a]);
  }

  for (const a of aspects) {
    if (a.required !== true) continue;
    const label = libelleDeCle(a.field_key);
    if (label === "Marque") continue;                       // liste jamais fermée
    const options = valeursDe(a);
    if (!options.length || options.length >= BEEBS_LISTE_FERMEE_MAX) continue;

    if (clePositionnelle(a.field_key)) continue;            // relevé sans nom : jamais servi
    // 1er champ d'un libellé (clé nue) → racine dédiée, comme l'extension ;
    // homonymes suivants → leur clé NOMINATIVE du catalogue. Plus de « [#1] ».
    const clePosee = a.field_key;
    const racine = cleADiscriminant(a.field_key) ? null : (BEEBS_CHAMPS_DEDIES[label] ?? null);

    // Déjà servi ? (réponse de l'utilisateur, pose déterministe, ré-épellation)
    if (String(dejaSaisi[a.field_key] ?? "").trim()) continue;
    if (String(dejaSaisi[clePosee] ?? "").trim()) continue;
    if (deja.aspects[a.field_key] || deja.aspects[clePosee]) continue;
    if (racine && deja.racines[racine]) continue;

    // La fiche porte-t-elle déjà une valeur que CE champ accepte ? Alors le
    // déterministe l'a laissée passer telle quelle : rien à arbitrer.
    const brut = racine === "couleur"
      ? (pf["couleur"] ?? (Array.isArray(pf["colors"]) ? (pf["colors"] as unknown[])[0] : null))
      : (racine ? pf[racine] : null);
    const valeurSource = String(brut ?? "").trim();
    if (valeurSource && options.includes(valeurSource)) continue;
    if (valeurSource && valeurComparableUnique(a, comparable(valeurSource))) continue;
    // ⚠️ Le canal dédié coupé (racines[x] === "") est une pose, pas un vide :
    // la valeur est partie sur une clé positionnelle, on n'arbitre pas.
    if (racine && deja.racines[racine] === "") continue;

    // Déjà tranché une fois pour CETTE valeur source ? On ne repose pas.
    const t = tranches[a.field_key] as Record<string, unknown> | undefined;
    if (t && String(t.valeur_source ?? "") === valeurSource) continue;

    out.push({
      field_key: a.field_key, label, options, valeur_source: valeurSource,
      cible: { racine, aspect: racine ? null : clePosee },
    });
  }
  return out;
}

/** Chemin de catégorie d'un job Beebs → clé du catalogue, ou null. */
export function categorieDuJob(pf: Record<string, unknown>): string | null {
  const chemin = pf["beebsCategoryPath"];
  if (!Array.isArray(chemin) || !chemin.length) return null;
  const cle = chemin.map((c) => String(c ?? "").trim()).filter(Boolean).join(" > ");
  return cle || null;
}
