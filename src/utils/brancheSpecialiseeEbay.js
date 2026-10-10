// ═══════════════════════════════════════════════════════════════════════════
// eBay — UN VÊTEMENT DE MODE NE PART PAS EN SPORT SANS QUE LE TEXTE LE DISE
// (10/10/2026, cas Manon et décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : « Gilet GAP | Couleur noir | Taille M », importé de Vinted,
// mot-objet « gilet » → l'arbre eBay n'a qu'UNE feuille exacte « Gilets » :
// « Sports, vacances › Cyclisme, vélos › Equipement du cycliste › Gilets »
// (177856) — prise avec certitude, un cardigan rangé en équipement de
// cycliste. Même mécanique, mesurée sur l'arbre relevé (3 906 feuilles) :
//   · EXACT (aucune IA, aucun recours) : « gilet » → Cyclisme › Gilets,
//     « veste » → Cyclisme › Vestes, « sac » → Golf › Sacs, « lunettes » →
//     Auto, moto › Lunettes, « survêtement » → Fitness › Survêtements ;
//   · CANDIDATES soumises à l'IA : polo, short, pantalon, chaussures, gants,
//     maillot, casquette, sweat, polaire… majoritairement hors de la mode.
// Vu en prod sur 120 jours : « Sac MNG camel » publié en Golf › Sacs, « Polo
// NAF NAF col volant » publié en Golf › Polos, « Baskets Autry enfant » en
// Fitness › Chaussures, le gilet de Manon en Cyclisme › Gilets.
//
// LA RÈGLE (Nico, 10/10) : une feuille d'une branche SPÉCIALISÉE — sport (hors
// « Vacances » : bagagerie, voyage), auto-moto, équipement de protection
// (Bricolage), animalerie, objets de collection — dont la feuille (ou son
// parent : « Maillots › Clubs anglais ») nomme un VÊTEMENT ou un ACCESSOIRE
// de mode (gilet, veste, sac, polo, chaussures…) n'est retenue que si le titre,
// la description ou l'objet identifié DISENT la spécialité : « gilet cycliste »,
// « veste de vélo », « maillot de football », « gants de travail », « manteau
// pour chien ». Sinon elle est écartée : jamais posée avec certitude, jamais
// retenue parmi les choix de l'IA, jamais gardée en dernier recours — eBay
// prend alors le chemin de son icône (« Gilets » → « Pulls, cardigans »).
// ⛔ Un texte qui nomme un SPORT (« maillot de foot », « gants de ski ») décrit
//    un article de sport, pas de mode : sous « Sports, vacances », la règle ne
//    s'applique pas — le rayon de sport choisi reste, comme avant.
// ⛔ eBay SEULEMENT : Vinted, Leboncoin, Beebs et Depop ne bougent pas. La
//    question posée à l'IA est commune à toutes les plateformes : elle n'est
//    PAS modifiée (on écarte après sa réponse, jamais avant), et le chemin de
//    repli d'eBay n'entre pas dans la vérification commune.
// ⛔ Une feuille de sport qui ne nomme pas un vêtement (raquette, haltères,
//    éclairage de vélo, casque) n'est pas concernée ; un cuissard (« Shorts,
//    cuissards ») l'est, et « vélo » dans son titre le garde en cyclisme.
// ⛔ Le choix de la personne n'est jamais touché (il est reposé après la
//    résolution). Rien de ce qui est déjà en ligne ne change : la règle ne
//    s'applique qu'à la création d'un job.
// Selftest : scripts/branche-specialisee-ebay-selftest.mjs.
import { jetons } from "./categorieParMot";

// Les racines spécialisées, et ce qui n'en fait pas partie.
const RACINES = {
  "Sports, vacances": { sauf: new Set(["Vacances"]) },
  "Auto, moto - pièces, accessoires": { sauf: new Set() },
  "Bricolage": { sauf: new Set() },
  "Animalerie": { sauf: new Set() },
  // (10/10) « Baskets Nike Air Max enfant », mot « basket » → EXACT sur
  // « Collections › Pins › Sports › Basket » : une paire de chaussures rangée en pin's.
  "Collections": { sauf: new Set() },
};

// Les listes sont écrites en clair, puis ramenées aux JETONS de l'arbre
// (jetons() : sans accents, singulier — « animaux » → « animau », « cross » →
// « cros ») : un mot comparé à un libellé passe toujours par la même découpe.
const unJeton = (m) => jetons(m)[0] ?? "";
const normaliser = (mots) => new Set(mots.map(unJeton).filter(Boolean));

// Les mots d'un vêtement ou d'un accessoire de MODE. Un niveau de chemin qui
// en porte un est un rayon « vêtement » de la branche.
const MOTS_MODE = normaliser([
  "gilet", "veste", "blouson", "manteau", "parka", "doudoune", "polaire", "sweat", "pull", "shirt", "tshirt",
  "maillot", "debardeur", "short", "pantalon", "jogging", "legging", "collant", "jupe", "robe", "chemise", "polo",
  "top", "chaussette", "chaussure", "basket", "botte", "bottine", "sandale", "tong", "bonnet", "casquette",
  "chapeau", "bob", "gant", "echarpe", "sac", "lunette", "montre", "ceinture", "combinaison", "impermeable",
  "kway", "survetement", "brassiere", "vetement", "cagoule", "blazer", "cardigan", "tenue", "ensemble",
  // Bijoux portés : « collier » tombait EXACT sur « Animalerie › Chiens › Colliers » (2 dépôts, 12/09 et 05/10).
  "collier", "bracelet", "bijou",
]);

// Ce qu'un niveau de chemin dit de GÉNÉRIQUE : jamais une preuve de spécialité.
const GENERIQUES = new Set([
  ...MOTS_MODE, ...normaliser([ "sport", "vacance", "piece", "accessoire", "equipement", "materiel", "autre", "divers",
  "homme", "femme", "enfant", "adulte", "fille", "garcon", "junior", "bebe", "mixte", "unisexe", "loisir",
  "outil", "matiere", "taille", "neuf", "pour", "protection", "individuel", "club", "clubs",
])]);

// Le vocabulaire d'une spécialité tel qu'un vendeur l'écrit, ramené aux mots
// des libellés eBay. Clé = jeton du TEXTE ; valeur = jetons de CHEMIN prouvés.
// ⛔ Jamais « basket » (une basket est une chaussure) ni « jogging » (un
//    pantalon) : ce sont des mots de MODE en français.
const SYNONYMES_BRUTS = {
  velo: ["velo", "cyclisme", "cycliste"], vtt: ["velo", "cyclisme", "cycliste"], bmx: ["velo", "cyclisme", "cycliste"],
  cycliste: ["velo", "cyclisme", "cycliste"], cyclisme: ["velo", "cyclisme", "cycliste"], bike: ["velo", "cyclisme", "cycliste"],
  gravel: ["velo", "cyclisme", "cycliste"], triathlon: ["velo", "cyclisme", "cycliste", "fitness", "athletisme"],
  foot: ["football"], football: ["football"], soccer: ["football"], futsal: ["football"],
  basketball: ["basketball"], nba: ["basketball"],
  sport: ["fitness", "athletisme"], sportif: ["fitness", "athletisme"], sportive: ["fitness", "athletisme"],
  fitness: ["fitness"], gym: ["fitness"], musculation: ["fitness", "musculation"], yoga: ["yoga", "fitness"],
  pilate: ["fitness", "yoga"], crossfit: ["fitness"], powerlifting: ["fitness", "musculation"],
  running: ["fitness", "athletisme", "running"], athletisme: ["athletisme", "fitness"], training: ["fitness"],
  entrainement: ["fitness", "entrainement"], cardio: ["fitness"],
  randonnee: ["randonnee"], rando: ["randonnee"], trek: ["randonnee"], trekking: ["randonnee"], hiking: ["randonnee"],
  outdoor: ["randonnee", "camping"], montagne: ["randonnee", "alpinisme"], camping: ["camping"], bivouac: ["camping"],
  golf: ["golf"], tennis: ["tennis", "raquette"], padel: ["raquette", "tennis"], badminton: ["raquette"], squash: ["raquette"],
  peche: ["peche"], pecheur: ["peche"], carpe: ["peche"], surfcasting: ["peche"],
  moto: ["moto"], motard: ["moto"], motarde: ["moto"], biker: ["moto"], scooter: ["moto"], motocross: ["moto", "cross"],
  enduro: ["moto", "cross"], quad: ["moto", "quad"], cross: ["cross"], mx: ["moto", "cross"], auto: ["auto"], karting: ["auto"],
  rallye: ["auto"], mecanicien: ["mecanicien"], mecanique: ["mecanicien"], garage: ["mecanicien", "garage"],
  equitation: ["equitation"], cheval: ["equitation"], cavalier: ["equitation"], cavaliere: ["equitation"],
  equestre: ["equitation"], poney: ["equitation"],
  ski: ["ski", "hiver"], snowboard: ["ski", "hiver"], skieur: ["ski", "hiver"],
  natation: ["natation"], piscine: ["natation"], nage: ["natation"], aquagym: ["natation", "aquagym"],
  hockey: ["hockey"], nhl: ["hockey"], patinage: ["patinage"],
  judo: ["art", "martiaux", "combat"], karate: ["art", "martiaux", "combat"], boxe: ["combat"], mma: ["combat"],
  danse: ["danse"], ballet: ["danse"], skate: ["skate"], roller: ["roller", "skate"], trottinette: ["trottinette"],
  escalade: ["escalade", "alpinisme"], alpinisme: ["alpinisme"],
  chien: ["chien"], chiot: ["chien"], chat: ["chat"], chaton: ["chat"], animal: ["animalerie"], animaux: ["animalerie"],
  bricolage: ["bricolage"], travail: ["bricolage", "protection", "atelier"], chantier: ["bricolage", "protection"],
  securite: ["securite", "bricolage"], epi: ["bricolage"], atelier: ["atelier", "bricolage"], protection: ["bricolage"],
  // Titres en anglais (relevés eBay, vendeurs étrangers) : « LS2 Integral Motorcycle Helmet ».
  bicycle: ["velo", "cyclisme", "cycliste"], cycling: ["velo", "cyclisme", "cycliste"], cyclist: ["velo", "cyclisme", "cycliste"],
  motorcycle: ["moto"], motorbike: ["moto"], fishing: ["peche"], riding: ["equitation"],
  equestrian: ["equitation"], horse: ["equitation"], dog: ["chien"], puppy: ["chien"], cat: ["chat"], work: ["bricolage"],
  safety: ["bricolage", "securite"], swimming: ["natation"], climbing: ["escalade"], skiing: ["ski", "hiver"],
};
const SYNONYMES = Object.fromEntries(Object.entries(SYNONYMES_BRUTS).map(([k, v]) => [unJeton(k), [...normaliser(v)]]));

// Les sports de l'arbre eBay relevé (niveau 2 de « Sports, vacances », hors
// « Vacances ») : un texte qui en nomme un décrit un article de SPORT.
const SPORTS = normaliser([
  "alpinisme", "escalade", "martiaux", "combat", "aviation", "basketball", "camping", "randonnee", "cyclisme",
  "velo", "cycliste", "danse", "golf", "fitness", "athletisme", "yoga", "musculation", "football", "natation",
  "aquagym", "patinage", "hockey", "petanque", "peche", "skate", "roller", "trottinette", "raquette", "speleologie",
  "tennis", "hiver", "ski", "equitation", "running",
]);

/**
 * Le chemin eBay est-il un rayon « vêtement / accessoire » d'une branche
 * spécialisée ? Rend les jetons qui prouvent la spécialité, ou null.
 * @param {string[]} chemin
 * @returns {{ racine: string, rayon: string, preuves: string[] } | null}
 */
export function brancheSpecialiseeEbay(chemin) {
  const c = Array.isArray(chemin) ? chemin.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  if (c.length < 2) return null;
  const racine = RACINES[c[0]];
  if (!racine || racine.sauf.has(c[1])) return null;
  // La FEUILLE (ou son parent : « Maillots › Clubs anglais ») nomme-t-elle un
  // vêtement ou un accessoire de mode ? Un niveau plus haut ne suffit pas :
  // « Casques, vêtements › Casques, accessoires › Casques » est un rayon de
  // CASQUES, pas de vêtements.
  const estMode = (niveau) => jetons(niveau).some((t) => MOTS_MODE.has(t));
  const n = c.length;
  const i = estMode(c[n - 1]) ? n - 1 : (n >= 3 && estMode(c[n - 2]) ? n - 2 : -1);
  if (i < 1) return null;
  // La spécialité, c'est ce qui est écrit AU-DESSUS du rayon vêtement : la
  // racine et les niveaux qui y mènent (« Cyclisme, vélos › Equipement du
  // cycliste », « Football », « Chiens »). Ce qui est en dessous (« Clubs
  // anglais », « Femmes ») ne prouve rien.
  const preuves = [...new Set(c.slice(0, i).flatMap((niveau) => jetons(niveau)).filter((t) => !GENERIQUES.has(t) && t.length > 1))];
  return { racine: c[0], rayon: c[i], preuves };
}

/**
 * Le texte de l'article DIT-il la spécialité de ce chemin ?
 * @param {string[]} preuves  jetons de chemin qui prouvent (brancheSpecialiseeEbay)
 * @param {string[]} textes   titre, description, objet identifié
 */
export function texteDitLaSpecialite(preuves, textes) {
  const attendus = new Set(preuves);
  for (const texte of textes ?? []) {
    for (const t of jetons(String(texte ?? ""))) {
      if (attendus.has(t)) return true;
      for (const p of SYNONYMES[t] ?? []) if (attendus.has(p)) return true;
    }
  }
  return false;
}

/**
 * Le veto : null = rien à dire (pas eBay, pas une branche spécialisée, ou le
 * texte dit la spécialité) ; sinon le motif, pour la trace du job.
 * @param {{ plateforme: string, chemin: string[], titre?: string, description?: string, mot?: string }} p
 */
export function vetoBrancheSpecialisee({ plateforme, chemin, titre = "", description = "", mot = "" }) {
  if (plateforme !== "ebay") return null;
  const b = brancheSpecialiseeEbay(chemin);
  if (!b) return null;
  const textes = [titre, description, mot];
  if (texteDitLaSpecialite(b.preuves, textes)) return null;
  // Un article dont le texte nomme un SPORT n'est pas un vêtement de mode : la
  // règle ne le concerne pas, même si le rayon de sport choisi n'est pas le
  // sien (« Maillot de foot PSG » rangé en Fitness reste où il était).
  if (b.racine === "Sports, vacances" && texteDitLaSpecialite([...SPORTS], textes)) return null;
  return {
    regle: "mode_hors_branche_specialisee_1010",
    chemin_ecarte: chemin,
    racine: b.racine,
    rayon: b.rayon,
    preuves_attendues: b.preuves,
    motif: `« ${chemin[chemin.length - 1]} » est un rayon de « ${b.racine} › ${chemin[1]} » : ni le titre, ni la description, ni l'objet ne le disent — un vêtement de mode n'y part pas`,
  };
}

export const _internes = { RACINES, MOTS_MODE, GENERIQUES, SYNONYMES };
