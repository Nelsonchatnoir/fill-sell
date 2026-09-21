// ═══════════════════════════════════════════════════════════════════════════
// OPLA — RÉSOUDRE LA CATÉGORIE CÔTÉ SERVEUR
// ═══════════════════════════════════════════════════════════════════════════
// (2026-09-18) Mesure de Nico en base, sur les jobs Opla du jour :
//   · chemise H&M  → genre Femme, taille L/40/12, couleur Blanc, marque H&M,
//     trace « get-pending-jobs (fiche de l'article + branche de catégorie) » ;
//   · robe Maje    → genre, taille, couleur, matière TOUS vides, aucune trace.
// La différence n'est pas l'article : c'est que la chemise a une catégorie Opla
// RÉSOLUE et la robe non. Le genre se déduit de la BRANCHE de la catégorie
// (get-pending-jobs, genreDeLaBranche) ; pas de catégorie ⇒ pas de branche ⇒
// pas de genre, et la taille suit.
//
// ⛔ IL N'Y A DONC QU'UN DÉFAUT, ET IL EST ICI : la résolution de catégorie.
// Tout ce qui manquait en aval en découle. Ce module la fait côté SERVEUR, où
// l'arbre complet est déjà présent (_shared/opla-catalogue.ts, 1014 nœuds,
// 886 feuilles) et où on voit la fiche de l'article — ce que l'extension n'a
// pas.
//
// ── POURQUOI LE SERVEUR, ALORS QUE LE CODE FAUTIF EST DANS L'EXTENSION ──────
// L'extension 0.6.42 DÉJÀ DÉPLOYÉE consomme ce que le serveur pose, vérifié
// ligne à ligne :
//   · opla.js:701  lit `pf.oplaCategoryCode` dans les platform_fields du job ;
//   · opla.js:479  `if (code && feuilles.has(code)) break;` — une FEUILLE posée
//     par le serveur arrête la descente net, et le pré-vol passe.
// Poser la feuille ici corrige donc le parc SANS paquet Chrome Web Store, et
// atomiquement — une correction dans opla.js resterait inerte tant que le CWS
// n'a pas propagé.
//
// ⛔ CE MODULE NE DEVINE RIEN. Il ne rend une feuille que lorsqu'une seule est
// plausible ; sinon il rend les CANDIDATS, et c'est l'appelant qui décide de
// poser la question. Une catégorie fausse est pire qu'une catégorie absente :
// elle publie l'annonce au mauvais endroit, et personne ne le voit.
//
// ⛔ LE CATALOGUE EST GÉNÉRÉ (`node scripts/gen-opla-catalogue.mjs`) : on ne
// l'édite pas. Ce module se construit sur ses primitives exportées.
// ═══════════════════════════════════════════════════════════════════════════
import { oplaChemin, oplaEnfants, oplaNoeud, oplaTaillesDe } from "./opla-catalogue.ts";
import { tailleDansGrille } from "./tailles.js";

// ── LE VOCABULAIRE, CALQUÉ SUR L'EXTENSION ─────────────────────────────────
// ⚠️ Ces trois fonctions sont le JUMEAU EXACT de opla.js:389-392. Si elles
//    divergent, le serveur et l'extension ne trancheront pas la même chose sur
//    le même article, et on aura deux vérités — le pire des cas, parce que
//    personne ne saura laquelle regarder. Toute retouche ici se reporte là-bas,
//    et réciproquement.
const comparable = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// ⚠️ « pour » ajouté le 2026-09-20 : il manquait, et il a coûté un livre. Job
//    64170d6f (« La Méthode Delavier de Musculation POUR la Femme ») : le
//    départage entre feuilles sœurs compte les mots de l'article retrouvés
//    dans le chemin ; « pour » était compté comme un mot de sens, il ne se
//    trouvait que dans « Livres POUR bébé », et le livre de musculation
//    partait au rayon des livres pour bébé. Un mot-outil n'est pas un critère.
const MOTS_VIDES = new Set([
  "de", "des", "du", "le", "la", "les", "l", "d", "et", "ou", "a", "au", "aux",
  "en", "par", "pour", "sur", "avec", "autre", "autres", "divers",
]);

// ⚠️ « body » / « Bodies » (2026-09-20) : le retrait du pluriel rendait
//    « bodie » d'un côté et « body » de l'autre, et le body — le vêtement de
//    bébé le plus vendu — ne trouvait AUCUNE feuille alors qu'Opla en a trois
//    (« Bodies », sous Femmes, bébé filles et bébé garçons). Le « y » final
//    rejoint donc « ie », des DEUX côtés : c'est une normalisation
//    symétrique, pas une équivalence inventée.
const jetons = (s: unknown) =>
  comparable(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .map((t) => t.replace(/(?<=\p{L}{3})[sx]$/u, "").replace(/(?<=\p{L}{3})y$/u, "ie"))
    .filter((t) => t && !MOTS_VIDES.has(t))
    .sort().join(" ");

// ── LE FOURRE-TOUT D'UN RAYON ──────────────────────────────────────────────
// « Autres pantalons », « Autres robes », « Autres bijoux » : la feuille où
// Opla range ce que les étiquettes nommées du rayon ne couvrent pas. On le lit
// sur le libellé BRUT, avant `jetons` — qui retire justement « autres » comme
// mot-outil, et efface donc la distinction qu'on cherche ici.
// ⛔ Le mot doit OUVRIR le libellé. « Pantalons autres matières » (s'il
//    existait) nomme une matière, pas un fourre-tout.
const estFourreTout = (f: { titre: string }) =>
  /^autres?\b/.test(comparable(f.titre));

// ── « ET LE RESTE » : L'AUTRE FAÇON DONT OPLA L'ÉCRIT ──────────────────────
// Une étiquette réduite au seul mot « Accessoires » ne nomme aucun objet : elle
// nomme la place de ce qui n'en a pas dans son rayon. « Jeux et jouets ›
// Figurines et accessoires › Accessoires » a pour sœur « Figurines » — c'est le
// même rôle qu'« Autres… », écrit autrement.
// Relevé sur le catalogue (886 feuilles) : quatre feuilles répondent à cette
// lecture — « Accessoires » sous Jeux et jouets, et les trois « Autres
// accessoires » (Femmes, filles, garçons), que « Autres » attrapait déjà.
// ⛔ CE N'EST PAS UN REMPLAÇANT DE `estFourreTout`, et le départage entre
//    sœurs continue de lire « Autres… » SEUL. Élargir là-bas ferait gagner
//    « Figurines » contre « Accessoires » sur le mot « accessoire de figurine »,
//    ce que personne n'a mesuré. Cette lecture-ci sert à UNE question, et une
//    seule : cet étage a-t-il nommé quelque chose ?
const neNommeAucunObjet = (f: FeuilleOpla) =>
  estFourreTout(f) || (f.jetons.length === 1 && f.jetons[0] === "accessoire");

// ── L'INDEX DES FEUILLES, construit UNE fois au chargement du module ────────
// 886 feuilles : un parcours en profondeur depuis les 8 racines, et plus
// personne ne repaie. `oplaEnfants("")` rend les racines (cf. catalogue).
export interface FeuilleOpla {
  code: string;
  titre: string;
  chemin: string[];
  jetons: string[];
  /** Les jetons de TOUT le chemin, feuille comprise — sert au départage. */
  jetonsChemin: string[];
  /** Le CODE de la racine (WOMEN_ROOT, MENS, CHILDREN_NEW…), pas son libellé. */
  racine: string;
  /** Le CODE du 2e niveau (GIRLS_NEW, BOYS_NEW…), "" si la feuille est à la racine. */
  rayon: string;
}

const FEUILLES: FeuilleOpla[] = [];
const PAR_CODE = new Map<string, FeuilleOpla>();
(function indexer() {
  const vus = new Set<string>();
  // ⚠️ racine et rayon sont portés en CODES, pas en libellés : le filtre de
  //    genre s'appuie dessus, et un filtre qui compare des libellés casse au
  //    premier renommage côté Opla (« Femmes » → « Femme » suffirait).
  const descendre = (code: string, chemin: string[], racine: string, rayon: string) => {
    for (const n of oplaEnfants(code)) {
      if (vus.has(n.code)) continue;
      vus.add(n.code);
      const sous = [...chemin, n.titre];
      const maRacine = racine || n.code;
      const monRayon = racine ? (rayon || n.code) : "";
      if (n.feuille) {
        const jt = jetons(n.titre);
        const f: FeuilleOpla = {
          code: n.code,
          titre: n.titre,
          chemin: sous,
          jetons: jt ? jt.split(" ") : [],
          jetonsChemin: [...new Set(sous.flatMap((t) => (jetons(t) ? jetons(t).split(" ") : [])))],
          racine: maRacine,
          rayon: monRayon,
        };
        FEUILLES.push(f);
        PAR_CODE.set(n.code, f);
      } else {
        descendre(n.code, sous, maRacine, monRayon);
      }
    }
  };
  descendre("", [], "", "");
})();

/** Le sous-arbre d'un code, en codes de FEUILLES. null = tout l'arbre. */
function perimetreDe(ancre: string | null): Set<string> | null {
  const c = String(ancre ?? "").trim();
  if (!c || !oplaNoeud(c)) return null;
  const dedans = new Set<string>();
  const descend = (k: string) => {
    for (const e of oplaEnfants(k)) {
      if (e.feuille) dedans.add(e.code);
      else descend(e.code);
    }
  };
  descend(c);
  return dedans;
}

// ── LA RECHERCHE PAR LE MOT, EN TROIS PASSES ───────────────────────────────
//   1. ÉGALITÉ       : les jetons du libellé SONT ceux du mot ;
//   2. LIBELLÉ ⊆ MOT : le mot nomme le libellé et le précise
//                      (« maillot de football » ⊃ « Maillots ») ;
//   3. MOT ⊆ LIBELLÉ : le mot est une partie du libellé
//                      (« jean » ⊂ « Jeans coupe droite ») — la plus large.
//
// ⛔ CE QUI ÉTAIT FAUX DANS CETTE LECTURE DU CATALOGUE (corrigé le 2026-09-20)
// La boucle sortait au PREMIER `return` : dès qu'une passe rendait quelque
// chose, les suivantes ne tournaient jamais. Les trois passes étaient rangées
// « de la plus sûre à la plus large » — mais cette sûreté se mesurait sur le
// LIBELLÉ, pas sur l'ARTICLE. Or le même libellé vit à des PROFONDEURS
// différentes selon la branche : « Jeans » est une FEUILLE chez les enfants et
// un NŒUD chez les adultes. L'égalité exacte trouvait donc les deux feuilles
// enfant et s'arrêtait là, pendant que les 11 feuilles de jean adulte —
// « Jeans droits », « Jeans skinny »… — attendaient dans la passe 3 qui ne
// tournait jamais. Mesuré sur les jobs 2e96a21f et 840b67ec (Thomas, 20/09) :
// « Jean Bootcut Levi's 544 » ne se voyait offrir que « Enfants › filles ›
// Jeans » et « Enfants › garçons › Jeans ». Aucune réponse n'était juste, la
// personne n'a pas répondu, les deux jobs dorment encore.
//
// Une correspondance exacte dans un rayon que l'article contredit n'est pas
// plus sûre qu'une correspondance partielle dans le bon rayon : elle est
// simplement fausse. Donc les trois passes CONTRIBUENT toutes, dans l'ordre
// (la plus précise d'abord, c'est l'ordre de la liste proposée), et c'est
// l'article — son genre, son rayon — qui élague ensuite.
//
// ⛔ MAIS « toutes les passes contribuent » N'EST PAS « toutes se valent ».
//    Une correspondance de passe 2 (« maillot de football » ⊃ « Maillots »)
//    dit plus qu'une correspondance de passe 3 (« maillot » ⊂ « Maillots de
//    bain »). Mesuré en essayant sans : le maillot du job eba8a512 partait en
//    « Hommes › Vêtements › Maillots de bain », parce que le score de chemin
//    préfère le chemin le plus court et que personne ne lui disait que la
//    correspondance était plus faible. Les candidates sont donc rangées en
//    ÉTAGES (mot d'abord, passe ensuite) et SEUL LE MEILLEUR ÉTAGE NON VIDE
//    concourt. C'est aussi ce qui garde le titre à sa place de dernier
//    recours : il est le dernier mot de la liste, donc le dernier étage.
//
// ⛔ PLAFOND : il ne s'applique PLUS à la recherche. Il ne dit rien sur la
//    qualité d'une correspondance, il dit qu'une liste de cases à cocher trop
//    longue est illisible (leçon Blaf69 du 16/09). C'est une garde sur la
//    QUESTION, posée une fois l'élagage fait.
export const OPLA_CANDIDATS_MAX = 12;
// La borne de la QUESTION. Plus haute que celle du repli, et pour une raison
// mesurée : « jean » désigne 13 feuilles (7 femme, 4 homme, 2 enfant) et la
// bonne y est toujours. Une liste HOMOGÈNE — tous des jeans, chacun avec son
// chemin entier — se lit ; c'est une liste hétéroclite qui ne se lit pas.
// Refuser la 13ᵉ, c'était reposer la question des deux jeans enfant à un
// adulte (jobs 2e96a21f et 840b67ec, Thomas, 20/09).
export const OPLA_QUESTION_MAX = 15;

const PASSES: Array<(jt: string[], jm: string[]) => boolean> = [
  (jt, jm) => jt.join(" ") === jm.join(" "),
  (jt, jm) => jt.every((t) => jm.includes(t)),
  (jt, jm) => jm.every((t) => jt.includes(t)),
];

function perimetreFeuilles(ancre: string | null): FeuilleOpla[] {
  const perimetre = perimetreDe(ancre);
  return FEUILLES.filter((f) => f.jetons.length && (!perimetre || perimetre.has(f.code)));
}

/**
 * Les feuilles que ces mots désignent, rangées en ÉTAGES : un étage par
 * couple (mot, passe), dans l'ordre mot 0 → mot n, puis passe 1 → passe 3.
 * Rien n'est jeté ici : c'est l'appelant qui prend le meilleur étage non vide,
 * APRÈS avoir élagué au genre (un étage vidé par le genre doit laisser sa
 * place au suivant — c'est ce qui sauve le jean d'homme).
 */
export interface EtageOpla { feuilles: FeuilleOpla[]; passe: number; mot: string }

export function feuillesParMotEtages(mots: unknown[], ancre: string | null = null): EtageOpla[] {
  const listeMots = (Array.isArray(mots) ? mots : [mots]).map((m) => jetons(m)).filter(Boolean);
  if (!listeMots.length) return [];
  const dedans = perimetreFeuilles(ancre);
  const etages: EtageOpla[] = [];
  const vus = new Set<string>();
  for (const mot of listeMots) {
    const jm = mot.split(" ");
    for (let p = 0; p < PASSES.length; p++) {
      const feuilles = dedans.filter((f) => !vus.has(f.code) && PASSES[p](f.jetons, jm));
      for (const f of feuilles) vus.add(f.code);
      if (feuilles.length) etages.push({ feuilles, passe: p + 1, mot });
    }
  }
  return etages;
}

/**
 * TOUTES les feuilles que ces mots désignent, les trois passes réunies, sans
 * plafond — les étages aplatis. Sert aux relevés et aux selftests.
 */
export function feuillesParMot(mots: unknown[], ancre: string | null = null): FeuilleOpla[] {
  return feuillesParMotEtages(mots, ancre).flatMap((e) => e.feuilles);
}

/** Les feuilles sœurs d'une feuille, elle comprise. */
export function feuillesSoeurs(code: string): FeuilleOpla[] {
  const p = oplaNoeud(code)?.parent ?? null;
  if (!p) return [];
  return FEUILLES.filter((f) => (oplaNoeud(f.code)?.parent ?? null) === p);
}

/**
 * L'ANCIENNE recherche, mot pour mot : la première passe qui rend entre 1 et
 * OPLA_CANDIDATS_MAX feuilles gagne, les suivantes ne tournent pas.
 * ⛔ Elle n'est plus le chemin normal — elle est le REPLI, et elle existe pour
 *    une seule raison : quand la recherche large rend une liste trop longue
 *    pour être posée en question, on doit retomber EXACTEMENT sur ce que le
 *    code d'hier aurait fait, sinon on casserait des résolutions qui marchent.
 */
export function feuillesParMotEtroit(mots: unknown[], ancre: string | null = null): FeuilleOpla[] {
  const listeMots = (Array.isArray(mots) ? mots : [mots]).map((m) => jetons(m)).filter(Boolean);
  if (!listeMots.length) return [];
  const dedans = perimetreFeuilles(ancre);
  for (const passe of PASSES) {
    for (const mot of listeMots) {
      const jm = mot.split(" ");
      const out = dedans.filter((f) => passe(f.jetons, jm));
      if (out.length && out.length <= OPLA_CANDIDATS_MAX) return out;
    }
  }
  return [];
}

// ── LE MOT PEUT NOMMER UN RAYON, PAS SEULEMENT UNE FEUILLE ────────────────
// Jumelle de opla.js (feuillesDuNoeudNomme, 2026-09-20), portée ici le même
// jour : le serveur en avait autant besoin que l'extension, et c'est LUI qui
// décide pour le parc. Défaut mesuré sur trois jobs réels (c7dae6b5, 2daa420c,
// e7502c18) : « livre » ne désigne que deux feuilles — « Livres sonores » et
// « Livres pour bébé » — parce que les autres s'appellent « Romans pour
// adultes », « Mangas », « Manuels scolaires ». Les trois romans sont donc
// partis au rayon des livres sonores, en silence. « Livres » est un NŒUD :
// quand le mot nomme un rayon, les candidates sont les feuilles DE CE RAYON.
export function feuillesDuNoeudNomme(mots: unknown[], ancre: string | null = null): FeuilleOpla[] {
  const listeMots = (Array.isArray(mots) ? mots : [mots]).map((m) => jetons(m)).filter(Boolean);
  if (!listeMots.length) return [];
  const perimetre = perimetreDe(ancre);
  const out: FeuilleOpla[] = [];
  for (const f of FEUILLES) {
    if (perimetre && !perimetre.has(f.code)) continue;
    // Un ancêtre NON-feuille dont le libellé est exactement l'un des mots.
    let p: string | null = oplaNoeud(f.code)?.parent ?? null;
    for (let g = 0; p && g < 12; p = oplaNoeud(p)?.parent ?? null, g++) {
      if (listeMots.includes(jetons(oplaNoeud(p)?.titre))) { out.push(f); break; }
    }
  }
  return out;
}

// ── LE GENRE ÉCARTE LES RAYONS QUI LE CONTREDISENT ────────────────────────
// ⛔ CE QUI ÉTAIT FAUX (corrigé le 2026-09-20) : le filtre était en FAIL-OPEN —
//    « si filtrer vide la liste, on garde la liste d'origine ». Mesuré sur le
//    job 40ebdf2c : « Robe 12-18 mois rose motif floral », genre Fille. Les
//    seules feuilles trouvées étaient des robes FEMME ; le filtre les écartait
//    toutes, se ravisait, et la robe de bébé est partie au rayon
//    « Femmes › Vêtements › Robes › Autres robes ». Un filtre qui rend
//    exactement ce qu'il vient de juger faux ne filtre pas : il valide.
//    Désormais il écarte pour de bon, et une liste vide veut dire ce qu'elle
//    dit — ce mot ne désigne rien dans le rayon de cette personne, on cherche
//    ailleurs (nœud nommé, puis descente) au lieu de publier à côté.
// ⛔ ET UN GENRE CONNU DÉSIGNE UN RAYON. Quand au moins une candidate vit dans
//    le rayon du genre, c'est LUI la réponse : les autres sortent, genrées ou
//    non. Mesuré sur le job eba8a512 (« Maillot Muangthong United », genre
//    Homme) — laisser concourir « Sport › Sports d'équipe › Football » le
//    faisait gagner au score et rangeait un maillot au rayon des ballons.
//    Ce n'est QUE lorsque aucune candidate n'est dans le rayon du genre qu'on
//    garde les racines non genrées (Maison, Sport, Culture et Loisirs, Jeux et
//    jouets, Fait main) : elles ne contredisent aucun genre — un ballon de
//    foot vendu par un homme reste un ballon de foot.
const RACINES_GENREES = new Set(["WOMEN_ROOT", "MENS", "CHILDREN_NEW"]);
const GENRE_RACINE: Record<string, string> = {
  femme: "WOMEN_ROOT", homme: "MENS",
  fille: "CHILDREN_NEW", garcon: "CHILDREN_NEW", enfant: "CHILDREN_NEW", bebe: "CHILDREN_NEW",
};
const GENRE_RAYON: Record<string, string> = { fille: "GIRLS_NEW", garcon: "BOYS_NEW" };
const RAYONS_GENRES = new Set(["GIRLS_NEW", "BOYS_NEW"]);

/** « Hommes », « Garçon », « bébé » → la clé du genre, ou null si rien de genré. */
export function cleGenre(genre: unknown): string | null {
  const g = comparable(genre).replace(/[^a-z]/g, "");
  const sansPluriel = g.replace(/s$/, "");
  return GENRE_RACINE[g] ? g : (GENRE_RACINE[sansPluriel] ? sansPluriel : null);
}

export function ecarterGenreIncompatible(candidats: FeuilleOpla[], genre: unknown): FeuilleOpla[] {
  const g = cleGenre(genre);
  if (!g || !candidats.length) return candidats;
  const racine = GENRE_RACINE[g];
  const rayon = GENRE_RAYON[g] ?? null;
  const dansLeRayon = candidats.filter((f) => {
    if (f.racine !== racine) return false;
    // « Garçon » n'a rien à faire dans « Vêtements pour filles » — mesuré sur
    // le job 8de4f86a (« Pull 24M », genre Garçon → SWEATERS_GIRLS_NEW).
    return !(rayon && RAYONS_GENRES.has(f.rayon) && f.rayon !== rayon);
  });
  if (dansLeRayon.length) return dansLeRayon;
  return candidats.filter((f) => !RACINES_GENREES.has(f.racine));
}

// ── LE DÉPARTAGE — « pourquoi ne tranche-t-on pas quand une seule des feuilles
//    est plausible ? » (question de Nico, 18/09) ───────────────────────────
// L'extension n'a QU'UN critère : le cardinal. `if (parMot.length > 1)` ⇒
// question. Résultat mesuré : « robe » rend DEUX feuilles dans tout l'arbre —
// « Robes › Autres robes » et « Vêtements de sport › Robes » — et on abandonne,
// alors qu'une robe de soirée Maje n'est évidemment pas du sport.
//
// LA RÈGLE, et elle ne nomme AUCUNE branche en dur : on compte, pour chaque
// candidat, les jetons de son CHEMIN que les mots de l'article ne justifient
// pas. La branche généraliste n'ajoute rien ; la branche spécialisée ajoute un
// qualificatif (« sport ») que personne n'a demandé. Le plus petit score gagne.
//   « robe »            → Autres robes = 2 · Vêtements de sport/Robes = 3 → généraliste
//   « robe de sport »   → l'ordre s'inverse tout seul, sans une ligne de plus.
//
// ⛔ IL FAUT UN VAINQUEUR STRICT. À égalité, on ne tranche pas : on rend les
//    candidats et l'appelant pose la question. Deviner ici publierait l'annonce
//    au mauvais endroit, en silence.
// ⛔ LE GENRE ÉCARTE, IL NE CHOISIT PAS : un candidat dont le rayon contredit
//    le genre connu de l'article est retiré, définitivement
//    (`ecarterGenreIncompatible` ci-dessus — fail-closed depuis le 20/09).
export function trancherCandidats(
  candidats: FeuilleOpla[],
  { mots = [], genre = null }: { mots?: unknown[]; genre?: string | null } = {},
): { feuille: FeuilleOpla | null; restants: FeuilleOpla[]; motif: string } {
  if (!candidats.length) return { feuille: null, restants: [], motif: "aucun candidat" };
  if (candidats.length === 1) return { feuille: candidats[0], restants: candidats, motif: "candidat unique" };

  const liste = ecarterGenreIncompatible(candidats, genre);
  if (!liste.length) return { feuille: null, restants: [], motif: `genre « ${genre} » : aucun candidat dans ce rayon` };
  if (liste.length === 1) return { feuille: liste[0], restants: liste, motif: `genre « ${genre} » écarte les autres rayons` };

  // ⛔ ON NE TIRE JAMAIS AU SORT UN GENRE. Si les candidats restants ne sont
  //    pas d'accord sur leur RACINE (Hommes / Femmes / Enfants…) et que rien ne
  //    dit le genre de l'article, aucun critère de chemin ne peut trancher
  //    honnêtement : « maillot de football » désigne MEN_JERSEYS et WOM_JERSEYS
  //    exactement pareil. Le score les départagerait quand même — par la
  //    profondeur, c'est-à-dire par hasard — et publierait un maillot homme
  //    dans le rayon femme sans que personne ne le voie. On rend la main.
  // ⚠️ TOUTES les racines, pas seulement les genrées : essayé en ne comptant
  //    que Femmes/Hommes/Enfants, ça faisait trancher « Insert / Rangement
  //    pour jeu de société » entre « Jeux de société » et « Autres rangements »
  //    sur la longueur du chemin — alors que le compte Amiral a répondu les
  //    DEUX selon les articles (7 jobs relevés). Deux rayons sans rien pour
  //    les départager, c'est une question, pas un score.
  const racines = new Set(liste.map((f) => f.chemin[0] ?? ""));
  if (racines.size > 1) {
    return { feuille: null, restants: liste, motif: `${racines.size} rayons possibles (${[...racines].join(", ")}) et aucun genre connu` };
  }

  const jetonsMots = new Set(
    (Array.isArray(mots) ? mots : [mots]).flatMap((m) => (jetons(m) ? jetons(m).split(" ") : [])),
  );
  // Deux critères, dans cet ordre, et le second existe pour un cas réel :
  //  1. le moins de qualificatifs NON demandés — « robe » préfère
  //     « Robes › Autres robes » à « Vêtements de sport › Robes » ;
  //  2. à égalité, le PLUS de mots de l'article effectivement retrouvés dans le
  //     chemin — « robe de sport » repasse alors du bon côté. Sans ce second
  //     critère les deux branches sortaient à 2 partout et on reposait la
  //     question alors que l'article disait « sport » noir sur blanc.
  const nonDemandes = (f: FeuilleOpla) => f.jetonsChemin.filter((t) => !jetonsMots.has(t)).length;
  const retrouves = (f: FeuilleOpla) => f.jetonsChemin.filter((t) => jetonsMots.has(t)).length;

  // ── ENTRE FRÈRES, LE CHEMIN LE PLUS COURT NE VEUT PLUS RIEN DIRE ─────────
  // Le critère 1 compare des BRANCHES : « Robes › Autres robes » n'ajoute
  // aucun qualificatif, « Vêtements de sport › Robes » en ajoute un. Entre
  // FRÈRES — même parent, même chemin à une étiquette près — il ne mesure plus
  // que la longueur de l'étiquette, et il tranche alors par hasard. Mesuré sur
  // le job 64170d6f (« La Méthode Delavier de Musculation ») : les onze
  // feuilles du rayon Livres se départageaient sur ce critère et le livre
  // partait en « Livres pour bébé ». Entre frères, SEUL le critère 2 parle :
  // un mot de l'article retrouvé dans l'étiquette (« jean SKINNY »). Rien à
  // retrouver ⇒ on ne tranche pas, on demande.
  const parents = new Set(liste.map((f) => oplaNoeud(f.code)?.parent ?? ""));
  if (parents.size === 1) {
    const scoresF = liste.map((f) => ({ f, r: retrouves(f) }));
    const max = Math.max(...scoresF.map((x) => x.r));
    const mieux = scoresF.filter((x) => x.r === max);
    if (mieux.length === 1) {
      return { feuille: mieux[0].f, restants: liste, motif: `étiquette qui reprend le plus de mots de l'article (${max})` };
    }
    // ── « AUTRES X » EST LE FOURRE-TOUT DU RAYON, PAS SON NOM ──────────────
    // Mesuré sur le job 27fb9fb1 (meminiandmove, 20/09, « Pantalon cigarette
    // Sandro », mot-objet « pantalon ») : sous « Femmes › Vêtements ›
    // Pantalons et leggings » il reste « Pantalons » et « Autres pantalons ».
    // Les deux marquent le MÊME score — « autres » est un mot-outil, il est
    // retiré des jetons des deux côtés — donc on posait la question entre une
    // étiquette qui nomme exactement l'objet et le fourre-tout d'à côté.
    //
    // ⛔ CE N'EST PAS UN SCORE DE PLUS, C'EST UNE LECTURE DU CATALOGUE : dans
    //    un rayon Opla, « Autres ‹ objet › » est la feuille où l'on range ce
    //    que les étiquettes nommées ne couvrent pas. Quand l'une d'elles nomme
    //    l'objet, le fourre-tout ne peut pas être une meilleure réponse.
    // ⛔ ET SEULEMENT S'IL EN RESTE UNE SEULE. « Robes courtes » contre
    //    « Robes longues » plus « Autres robes » : retirer le fourre-tout en
    //    laisse deux, on ne tranche pas — la question repart entière.
    // ⚠️ Cette branche ne rendait QUE `feuille: null` : elle ne peut donc que
    //    transformer une question en réponse, jamais changer une réponse déjà
    //    rendue. Vérifié sur les 172 jobs Opla des 30 derniers jours.
    const nommees = mieux.filter((x) => !estFourreTout(x.f));
    if (nommees.length === 1 && nommees.length < mieux.length) {
      return {
        feuille: nommees[0].f, restants: liste,
        motif: `étiquette qui nomme l'objet, contre ${mieux.length - 1} fourre-tout « Autres… » du même rayon`,
      };
    }
    return { feuille: null, restants: liste, motif: `${liste.length} feuilles du même rayon, aucun mot ne les départage` };
  }

  const scores = liste.map((f) => ({ f, s: nonDemandes(f), r: retrouves(f) }));
  const min = Math.min(...scores.map((x) => x.s));
  let gagnants = scores.filter((x) => x.s === min);
  if (gagnants.length > 1) {
    const max = Math.max(...gagnants.map((x) => x.r));
    const mieux = gagnants.filter((x) => x.r === max);
    if (mieux.length === 1) {
      return { feuille: mieux[0].f, restants: liste, motif: `chemin qui reprend le plus de mots de l'article (${max})` };
    }
    gagnants = mieux;
  }
  if (gagnants.length === 1) {
    return { feuille: gagnants[0].f, restants: liste, motif: `chemin le plus direct (${min} qualificatif${min > 1 ? "s" : ""} non demandé${min > 1 ? "s" : ""})` };
  }
  return { feuille: null, restants: liste, motif: `${gagnants.length} branches également plausibles` };
}

// ── LA DESCENTE ────────────────────────────────────────────────────────────
// Jumelle de opla.js:474-499, PLUS le départage ci-dessus. Rend soit une
// feuille, soit les candidats à proposer.
export function resoudreCategorieOpla(
  { mots = [], titre = null, depart = null, genre = null }:
  { mots?: unknown[]; titre?: string | null; depart?: string | null; genre?: string | null } = {},
): { code: string | null; candidats: FeuilleOpla[]; etapes: string[] } {
  const etapes: string[] = [];
  let code = String(depart ?? "").trim();
  if (code && !oplaNoeud(code)) { etapes.push(`ancre « ${code} » inconnue — ignorée`); code = ""; }
  if (code && oplaNoeud(code)?.feuille) return { code, candidats: [], etapes: ["ancre déjà une feuille"] };

  // ── LE TITRE EST UN DERNIER RECOURS, ET IL DOIT LE RESTER ────────────────
  // Il a été ajouté le 18/09 pour les jobs créés depuis le Stock, qui n'ont
  // aucun mot-objet. Mais il était versé dans le MÊME sac que les mots-objets,
  // donc il jouait à égalité avec eux — et un titre est bavard. Mesuré sur le
  // job 9cb681ba : « Lego friends l'aire de jeux des bébés chiens », mot-objet
  // « briques de construction ». Le mot-objet ne trouvait rien ; le titre, lui,
  // contenait « chiens », et le Lego est parti dans « Maison › Animaux ›
  // Chiens ». On l'essaie donc SEULEMENT quand les mots-objets n'ont rien
  // donné, ce que « dernier recours » voulait déjà dire.
  const motsObjet = (Array.isArray(mots) ? mots : [mots]).map((m) => String(m ?? "").trim()).filter(Boolean);
  const titreNet = String(titre ?? "").trim();

  const tousLesMots = [...motsObjet, ...(titreNet ? [titreNet] : [])];

  /**
   * Les candidates d'un niveau, PAR ÉTAGE : un étage par couple (mot, passe),
   * du plus précis au plus large, chacun élagué au genre et complété du rayon
   * que SON mot nomme.
   *
   * ⛔ ELLE REND LA LISTE ENTIÈRE, PLUS LE SEUL PREMIER ÉTAGE (2026-09-21).
   *    Job e288edef (louis@ttfamily.fr, 21/09 19:50, « Rangement Blanc et Bleu
   *    Ciel pour 12 pots et 12 couvercles pour yaourtière Multidélices ») : le
   *    mot-objet de l'IA disait « accessoire de yaourtière ». « Accessoire » ne
   *    nomme aucun objet — il désigne quatre fourre-tout dans trois rayons
   *    (Jeux et jouets, Femmes, Enfants) — donc cet étage ne tranchait pas, et
   *    comme il était le premier NON VIDE, il emportait la décision : on posait
   *    une question dont AUCUNE des quatre réponses n'était juste. L'étage
   *    suivant, le titre, désignait « Culture et Loisirs › Rangement de
   *    collection › Autres rangements » tout seul — la feuille où ses cinq
   *    jumeaux du même soir sont partis.
   *    Un étage qui ne DÉSIGNE rien ne doit pas bloquer le suivant, exactement
   *    comme un étage vidé par le genre lui laisse déjà sa place. Il reste la
   *    question de repli si aucun autre étage ne désigne quoi que ce soit.
   */
  const etagesSous = (ancre: string | null): Array<{ liste: FeuilleOpla[]; via: string }> => {
    const out: Array<{ liste: FeuilleOpla[]; via: string }> = [];
    // Le rayon nommé est de la même force qu'une égalité de libellé : le mot
    // EST le nom d'un rayon. ⛔ MAIS IL DOIT VENIR DU MÊME MOT QUE L'ÉTAGE
    //    RETENU. Sinon un mot large dilue la réponse d'un mot précis : mesuré
    //    sur le job 76fa3371 (« Jean skinny noir femme ») — l'étage rendait
    //    « Jeans skinny » tout seul, et le rayon « Jeans » nommé par le mot
    //    plus court « jean » y rajoutait ses six frères, transformant une
    //    réponse en question.
    const etages = feuillesParMotEtages(tousLesMots, ancre);
    for (const etage of etages) {
      let garde = ecarterGenreIncompatible(etage.feuilles, genre);
      if (!garde.length) continue;  // le genre a vidé cet étage : au suivant
      // ── UNE PASSE 3 SEULE NE TRANCHE PAS, ELLE PROPOSE ──────────────────
      // Passe 3 = « le mot n'est QU'UNE PARTIE du libellé ». Le reste du
      // libellé, personne ne l'a demandé. Quand elle ne rend qu'une feuille,
      // ce n'est pas une réponse : c'est la seule étiquette du rayon qui
      // contient ce mot. Mesuré sur le job 9e6d4eb6 (« Pantalon velours noir
      // enfant », garçon) : le rayon des pantalons garçon n'a AUCUNE feuille
      // « Pantalons » — la bonne réponse s'appelle « Autres » — et la seule
      // dont l'étiquette contient « pantalon » est « Pantalons pattes
      // d'éléphant ». On propose donc le rayon entier, où « Autres » figure.
      if (etage.passe === 3 && garde.length === 1) {
        const soeurs = ecarterGenreIncompatible(feuillesSoeurs(garde[0].code), genre);
        if (soeurs.length > 1 && soeurs.length <= OPLA_QUESTION_MAX) garde = soeurs;
      }
      // ⛔ LE RAYON DU MÊME MOT ENTRE TOUJOURS DANS LA COURSE. Quand un mot
      //    nomme À LA FOIS une feuille et un rayon, la feuille n'a aucune
      //    priorité : mesuré sur « jupe », dont la seule feuille exactement
      //    nommée « Jupes » sous Femmes est celle du rayon SPORT — une jupe
      //    quelconque partait donc en vêtement de sport, alors que
      //    « Femmes › Vêtements › Jupes » existe juste à côté. C'est le même
      //    défaut que « Jeans », une profondeur plus loin. On fusionne, et
      //    c'est le départage qui tranche ensuite (pour « robe », « Autres
      //    robes » gagne toujours : son chemin n'ajoute aucun qualificatif).
      let liste = garde;
      const parNoeud = ecarterGenreIncompatible(feuillesDuNoeudNomme([etage.mot], ancre), genre);
      if (parNoeud.length && parNoeud.length <= OPLA_QUESTION_MAX) {
        const vus = new Set(garde.map((f) => f.code));
        const fusion = [...garde, ...parNoeud.filter((f) => !vus.has(f.code))];
        if (fusion.length <= OPLA_QUESTION_MAX) liste = fusion;
      }
      out.push({ liste, via: `mot « ${etage.mot} » passe ${etage.passe}` });
    }
    // Aucun étage : le mot ne nomme peut-être QUE un rayon.
    if (!out.length) {
      for (const m of tousLesMots) {
        const parNoeud = ecarterGenreIncompatible(feuillesDuNoeudNomme([m], ancre), genre);
        if (parNoeud.length && parNoeud.length <= OPLA_QUESTION_MAX) { out.push({ liste: parNoeud, via: "rayon nommé" }); break; }
      }
    }
    return out;
  };

  for (let garde = 0; garde < 12; garde++) {
    if (code && oplaNoeud(code)?.feuille) break;
    const etages = etagesSous(code || null);
    // ── LE PREMIER ÉTAGE QUI DÉSIGNE QUELQUE CHOSE GAGNE ────────────────────
    // « Désigner », c'est rendre UNE feuille : seule, ou tranchée par le
    // départage. Un étage qui ne sait pas trancher ne décide de rien — il
    // devient seulement la QUESTION de repli, et laisse le suivant parler.
    let designe: { feuille: FeuilleOpla; via: string; motif: string } | null = null;
    let aDemander: { total: number; restants: FeuilleOpla[]; motif: string; via: string } | null = null;
    for (const etage of etages) {
      if (etage.liste.length === 1) {
        designe = {
          feuille: etage.liste[0], via: etage.via,
          motif: `feuille unique ${code ? `sous ${code}` : "dans tout l'arbre"}`,
        };
        break;
      }
      const { feuille, restants, motif } = trancherCandidats(etage.liste, { mots: [...motsObjet, titreNet], genre });
      if (feuille) {
        designe = { feuille, via: etage.via, motif: `${etage.liste.length} feuilles, tranché : ${motif}` };
        break;
      }
      // ⛔ LA QUESTION RESTE CELLE DU PREMIER ÉTAGE, pas du dernier : c'est le
      //    mot le plus précis, donc la liste la plus juste à montrer. Seule une
      //    DÉSIGNATION plus loin peut la remplacer — jamais une autre question.
      if (!aDemander) aDemander = { total: etage.liste.length, restants, motif, via: etage.via };
      // ── QUAND UN ÉTAGE CÈDE LA PLACE AU SUIVANT, ET SEULEMENT ALORS ───────
      // Quand il n'a trouvé QUE des fourre-tout. Le mot est alors tombé sur la
      // case « et le reste » de plusieurs rayons, jamais sur un objet : la
      // question qu'on poserait n'est pas une question entre des objets, et sa
      // bonne réponse peut très bien ne pas y être. C'était le cas du job
      // e288edef, dont les quatre options étaient toutes fausses.
      // ⛔ IL FAUT QU'ELLES LE SOIENT TOUTES. Mesuré sur 27 964 articles des 30
      //    derniers jours : dès qu'UNE candidate nomme l'objet, la question est
      //    juste et la bonne réponse est dedans. Céder alors ferait parler
      //    l'étage suivant, plus large, qui se trompe — « Manteau long noir
      //    Primark 38 » partait en manteau de GROSSESSE, « Chemise Esprit
      //    denim » en chemise de NUIT pour fille, et « Jean Bootcut Levi's »
      //    n'aurait plus eu sa liste de jeans.
      // ⛔ ET L'ÉTAGE RESTE LA QUESTION DE REPLI (`aDemander`, posé juste
      //    au-dessus) : si aucun étage suivant ne désigne rien, on repose
      //    exactement la question d'avant. Céder ne peut donc rien perdre.
      if (!etage.liste.every(neNommeAucunObjet)) break;
    }
    if (designe) {
      etapes.push(`${designe.via} → ${designe.feuille.code} (${designe.motif})`);
      code = designe.feuille.code;
      continue;
    }
    if (aDemander) {
      const { total: parMotN, restants, motif, via } = aDemander;
      // ⛔ UNE QUESTION QUI NE TIENT PAS SUR UN ÉCRAN N'EST PAS UNE QUESTION.
      //    Au-delà du plafond on ne peut pas la poser ; on retombe alors sur
      //    EXACTEMENT ce que faisait le code d'hier (la passe la plus sûre,
      //    plafonnée), pour ne rien casser de ce qui marchait.
      if (restants.length && restants.length <= OPLA_QUESTION_MAX) {
        etapes.push(`${via} → ${parMotN} feuilles, non tranchable (${motif}) — question au niveau des feuilles`);
        return { code: code || null, candidats: restants, etapes };
      }
      const repli = ecarterGenreIncompatible(
        feuillesParMotEtroit([...motsObjet, ...(titreNet ? [titreNet] : [])], code || null),
        genre,
      );
      if (repli.length) {
        etapes.push(`${restants.length} feuilles, trop pour une question — repli sur la passe la plus sûre (${repli.length})`);
        const r = trancherCandidats(repli, { mots: [...motsObjet, titreNet], genre });
        if (r.feuille) { code = r.feuille.code; continue; }
        if (r.restants.length > 1) return { code: code || null, candidats: r.restants, etapes };
      } else {
        etapes.push(`${restants.length} feuilles, trop pour une question et rien au repli — on continue la descente`);
      }
    }
    const enf = oplaEnfants(code || "");
    if (enf.length === 1) { etapes.push(`un seul enfant → ${enf[0].code}`); code = enf[0].code; continue; }
    etapes.push(`ambiguïté réelle sous « ${code || "(racines)"} » : ${enf.length} enfants, aucun mot ne tranche`);
    break;
  }
  const n = code ? oplaNoeud(code) : null;
  if (n?.feuille) return { code, candidats: [], etapes };

  // ── L'ANCRE PEUT ÊTRE UNE IMPASSE, ET C'EST UN CAS RÉEL ──────────────────
  // Job eba8a512 (« Maillot Muangthong United ») : il porte déjà
  // oplaCategoryCode = MEN_TOPS_T_SHIRTS, un NŒUD choisi par l'utilisateur dans
  // une liste qui n'aurait jamais dû le proposer. Or la bonne feuille —
  // MEN_JERSEYS — vit sous SPORTSWEAR, PAS sous ce nœud : chercher dessous rend
  // toujours [], et la descente n'en sort jamais. On reprend donc depuis la
  // racine plutôt que de tourner en rond dans la branche où on nous a égarés.
  if (depart) {
    etapes.push(`ancre « ${depart} » sans issue — reprise depuis les racines`);
    const global = resoudreCategorieOpla({ mots, titre, genre });
    if (global.code || global.candidats.length) {
      return { code: global.code, candidats: global.candidats, etapes: [...etapes, ...global.etapes] };
    }
    // ── ET SI MÊME LA REPRISE NE TROUVE RIEN, L'ANCRE RESTE LE BON RAYON ────
    // DÉFAUT MESURÉ, job 01e066f1 (nadegemarcelin78, 19/09 23:55) : « Station
    // d'accueil Articona ». Le mot ne désigne AUCUNE feuille de l'arbre Opla —
    // le rayon s'appelle « Housses d'ordinateur portable », « Autres »… — et
    // l'ancre posée était ORDINATEURS_ACCESSOIRES, un NŒUD. On a donc rendu
    // « rien », et le job est mort sur « ORDINATEURS_ACCESSOIRES est un nœud
    // intermédiaire, seules les feuilles sont déposables » : un diagnostic
    // juste, et aucune issue.
    // Or ce nœud EST le bon rayon. Ses feuilles font une question courte,
    // fermée, et la bonne réponse y est forcément. On la pose.
    // ⛔ APRÈS la reprise globale, jamais avant : le job eba8a512 avait une
    //    ancre MEN_TOPS_T_SHIRTS et sa bonne feuille (MEN_JERSEYS) vit
    //    AILLEURS. Proposer d'abord les feuilles de l'ancre l'aurait enfermé
    //    dans la branche où on l'avait égaré.
    const sousAncre = ecarterGenreIncompatible(
      FEUILLES.filter((f) => (perimetreDe(depart) ?? new Set<string>()).has(f.code)), genre,
    );
    if (sousAncre.length > 1 && sousAncre.length <= OPLA_QUESTION_MAX) {
      etapes.push(`aucun mot ne désigne de feuille — on propose les ${sousAncre.length} feuilles du rayon « ${oplaNoeud(depart)?.titre ?? depart} »`);
      return { code: null, candidats: sousAncre, etapes };
    }
    return { code: null, candidats: [], etapes: [...etapes, ...global.etapes] };
  }
  return { code: null, candidats: [], etapes };
}

// ── LES OPTIONS D'UNE QUESTION : DES FEUILLES, ET RIEN D'AUTRE ─────────────
// ⛔ LA RÈGLE DE NICO, ET ELLE NE SOUFFRE PAS D'EXCEPTION : « on ne doit jamais
//    proposer un choix qu'on va refuser. Si seules les feuilles sont
//    déposables, seules les feuilles apparaissent dans la liste. »
// Le défaut mesuré : l'app proposait « Hauts et t-shirts » (MEN_TOPS_T_SHIRTS,
// un NŒUD), l'utilisateur le choisissait, et le pré-vol répondait que ce n'est
// pas une feuille. Trois paliers brûlés — MENS, MEN_CLOTHING,
// MEN_TOPS_T_SHIRTS — pour une question qui ne pouvait pas aboutir. Et pire :
// sur un maillot, la bonne feuille (MEN_JERSEYS) est sous SPORTSWEAR, donc ce
// choix-là était une IMPASSE, pas seulement un détour.
//
// Le titre porte le CHEMIN ENTIER : sans lui, deux feuilles homonymes
// (« Robes » sous Robes et sous Vêtements de sport) sont indiscernables dans la
// liste. C'est aussi la forme que l'extension sait relire (opla.js:706-712,
// `oplaCategoryAsk` en priorité absolue, puis `feuilleParChemin`).
// ⛔ ET ON NE POSE PAS DE QUESTION QU'ON NE SAIT PAS POSER. `optionsFeuilles`
//    ne prend QUE des candidats — jamais « toutes les feuilles sous l'ancre ».
//    Mesuré : sous MEN_CLOTHING il y a plus de cent feuilles ; en servir
//    vingt-cinq au hasard est PIRE que les treize nœuds d'aujourd'hui, parce
//    que la bonne peut ne pas être dans la tranche. Sans candidats, on ne pose
//    rien et on laisse le chemin d'avant faire son travail.
export const SEPARATEUR_CHEMIN = " › ";

export function optionsFeuilles(candidats: FeuilleOpla[]): Array<{ code: string; title: string }> {
  return candidats.map((f) => ({ code: f.code, title: f.chemin.join(SEPARATEUR_CHEMIN) }));
}

// ── L'IDENTITÉ D'UNE QUESTION (2026-09-19) ────────────────────────────────
// Une question Opla, c'est SA LISTE D'OPTIONS et rien d'autre : deux articles
// qui produisent le même ensemble de feuilles voient la même modale, au mot
// près. Cette clé sert à ne poser cette question-là qu'UNE fois par compte
// (get-pending-jobs, profiles.platform_settings.opla.categories).
//
// ⛔ LES CODES, PAS LES LIBELLÉS : deux branches portent le même libellé
//    (« Robes » sous Robes et sous Vêtements de sport) — une clé de libellés
//    confondrait deux questions différentes et rejouerait une réponse dans le
//    mauvais rayon, en 200, sans un mot.
// ⛔ TRIÉE ET DÉDUPLIQUÉE : l'ordre des candidats suit celui de l'index des
//    feuilles ; si demain il change, la même question doit garder la même clé,
//    sinon toutes les réponses déjà données seraient reposées en silence.
// ⛔ UNE FEUILLE DE PLUS OU DE MOINS ⇒ AUTRE CLÉ ⇒ ON REDEMANDE. C'est la
//    garde qui empêche de rejouer une réponse pour une question qu'il n'a
//    jamais vue.
export function cleFourche(options: Array<{ code?: unknown }>): string {
  return [...new Set(options.map((o) => String(o?.code ?? "").trim()).filter(Boolean))].sort().join("|");
}

// ── LA TAILLE : ON NORMALISE AVANT DE REFUSER ──────────────────────────────
// Défaut mesuré : chemise H&M, taille « L / 40 / 12 » (format composé Vinted)
// refusée par la grille Opla qui attend « L ». La valeur est JUSTE, c'est le
// format qui ne l'est pas — et le pré-vol compare en égalité stricte
// (opla-prevol.js:229, `grille.indexOf(taille) === -1`).
//
// On ne réinvente rien : même doctrine que `resoudreTailleEbay`
// (chrome-extension/content-scripts/ebay.js:2531, étage « taille-segment ») —
// découper sur « / », prendre le PREMIER segment qui tombe exactement dans la
// grille. Rien ne correspond ⇒ null, JAMAIS la taille la plus proche.
//
// ⛔ CONTRE LA GRILLE DE LA FEUILLE, jamais contre l'union des 150 entrées :
//    TAILLE_UNIQUE et XS…XXL vivent en G1 ET en G4 (soutiens-gorge), et
//    « 90C » passerait sur un t-shirt (bandeau d'opla-catalogue.ts).
const sansPrefixePays = (s: string) => s.replace(/^(eu|fr|uk|us|it|de)\s*/i, "").trim();

export function normaliserTailleOpla(codeFeuille: string, taille: unknown): string | null {
  const brut = String(taille ?? "").trim();
  if (!brut) return null;
  const grille = oplaTaillesDe(codeFeuille).map((t) => t.code);
  if (!grille.length) return null; // catégorie sans champ Taille : aucune valeur n'est valide

  // ── LE VOCABULAIRE PARTAGÉ D'ABORD (2026-09-18) ──────────────────────────
  // Cette fonction ne savait traduire qu'un format composé (« L / 40 / 12 » →
  // « L ») et le pliage de casse. Elle ne savait PAS lire un âge : « 12 ans »
  // contre une grille qui écrit « 12Y » — la même taille — était refusé, et
  // le jogging Zara d'Ornella est resté indéposable (18/09, 18:20).
  // `tailleDansGrille` couvre l'exact, l'orthographe, les âges, les demi-
  // pointures, la taille unique et les étiquettes composites des DEUX côtés,
  // sans jamais convertir un système en un autre.
  // ── « 38 » SUR LA GRILLE DE LETTRES : LA TABLE FEMME (2026-09-20) ────────
  // Opla ne publie AUCUNE équivalence numérique — relevé du 20/09 sur
  // WOM_DRE_OTHER : les 14 titres sont « Taille unique », « XXS »… « 8XL »,
  // rien d'autre. Vinted, lui, publie l'égalité dans /api/v2/size_groups
  // (groupe 4 : « M / 38 / 10 »), et cette table est dans le projet depuis le
  // 10/09. On lit SA table ; on n'en fabrique pas une.
  // ⛔ BORNÉE À LA BRANCHE FEMMES, parce que le MÊME « 38 » est une pointure
  //    dans les groupes 7 et 38 du même référentiel et qu'un « 36 » d'homme
  //    est un tour de taille. `tailleDansGrille` pose en plus sa propre garde :
  //    la grille cible ne doit écrire QUE des lettres (ce qui écarte les
  //    soutiens-gorge, dont la grille mêle XS…XXL à 75A…115E).
  // ⚠️ ICI ET PAS SEULEMENT DANS L'EXTENSION : la correction du pré-vol ne
  //    partira qu'après un examen du Chrome Web Store, quand celle-ci atteint
  //    TOUS les builds au prochain get-pending-jobs. Même raison qu'au 10/09
  //    pour la reprise Vinted côté serveur.
  const femmes = oplaChemin(codeFeuille)[0] === "Femmes";
  const t = tailleDansGrille(brut, grille, { tableFemme: femmes });
  if (t) return t.valeur;

  // ── LE DÉ-PRÉFIXAGE PAYS EN DERNIER, ET PLUS EN PREMIER ──────────────────
  // ⚠️ `sansPrefixePays` est le seul étage qui puisse se TROMPER de système :
  // « UK 12 » et « FR 12 » ne sont pas la même taille, et retirer le préfixe
  // les rend identiques. Il était en tête ; il passe en dernier recours, donc
  // il ne peut plus court-circuiter une correspondance sûre. Conservé tel quel
  // (comportement en prod), pas étendu.
  for (const e of [brut, ...brut.split("/").map((s) => s.trim())].filter(Boolean)) {
    const sansPays = sansPrefixePays(e);
    if (sansPays === e) continue; // rien à retirer : déjà jugé ci-dessus
    const c = grille.find((g) => comparable(g) === comparable(sansPays));
    if (c) return c;
  }
  return null;
}

/** Le chemin lisible d'un code, pour les traces et les messages. */
export function cheminLisible(code: string): string {
  const c = oplaChemin(code);
  return c.length ? c.join(SEPARATEUR_CHEMIN) : String(code ?? "");
}
