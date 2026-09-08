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
//   · router : une catégorie peut porter DEUX champs du même libellé
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
      .filter((a) => libelles.includes(libelleDeCle(a.field_key)) && valeursDe(a).length)
      .sort((a, b) => Number(cleADiscriminant(a.field_key)) - Number(cleADiscriminant(b.field_key)));
    if (!champs.length) continue;

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

  return res;
}

/** Chemin de catégorie d'un job Beebs → clé du catalogue, ou null. */
export function categorieDuJob(pf: Record<string, unknown>): string | null {
  const chemin = pf["beebsCategoryPath"];
  if (!Array.isArray(chemin) || !chemin.length) return null;
  const cle = chemin.map((c) => String(c ?? "").trim()).filter(Boolean).join(" > ");
  return cle || null;
}
