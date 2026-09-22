// ══════════════════════════════════════════════════════════════════════════════
// LE MOT DU TITRE NE GAGNE PAS CONTRE L'ARTICLE (2026-09-22)
// ══════════════════════════════════════════════════════════════════════════════
// Cas fondateur — lesmillesetunepepite, inscrite le 22/09 à 19:56, première
// publication : « Nike Blazer Mid 77 Jumbo Blanc Noir DD3111-100 ». Le mot
// « blazer » lu au titre a rangé la paire de baskets en
//   Vinted    → Hommes > Vêtements > Costumes et blazers > Blazers
//   Beebs     → (Vestes et blazers homme) — écarté, job annulé « pas de rayon »
// et Vinted a refusé la taille « EU 10 », qui n'existe pas dans un rayon de
// vêtements (XS → 8XL). Le job rebouclait toutes les 5 minutes sur le même mur.
//
// Or l'article DISAIT ce qu'il était, trois fois :
//   · attributs.attributs_visibles.pointure = « EU 10 » (relevé par Lens) ;
//   · « Nike » + « Blazer » = un modèle de baskets, pas un vêtement ;
//   · la description : « Paire de Nike Blazer Mid 77 […] semelle […] cuir ».
// Beaucoup de modèles de baskets portent un nom de vêtement — Blazer, Samba,
// Gazelle, Campus, Chelsea… — et le mot-clé du titre gagnait contre tout le
// reste de la fiche.
//
// ⛔ CE MODULE NE DEVINE RIEN. Il ne travaille que sur des PREUVES :
//    1. une POINTURE relevée dans les attributs de la fiche (structurée) ;
//    2. un couple MARQUE + MODÈLE d'une table FERMÉE, relevée ici ;
//    3. le mot « pointure » écrit noir sur blanc dans le texte du vendeur.
//    Aucune preuve → il rend null, et il ne se passe strictement rien.
//
// ⛔ ET IL NE S'APPLIQUE QU'À LA CRÉATION D'UN JOB. Il ne reclasse rien de ce
//    qui est déjà en ligne.

import { texteComparable } from "./texteComparable";

// ── Table FERMÉE : marque → modèles de chaussures qui portent un nom d'autre
// chose. Rien n'entre ici sans être un modèle de chaussure réel et connu.
// La marque doit être présente elle aussi : « blazer » seul reste un vêtement,
// « samba » seul reste une danse, « chelsea » seul reste un club.
const MODELES_PAR_MARQUE = {
  nike: ["blazer", "air force", "air max", "dunk", "cortez", "huarache", "pegasus", "vomero", "waffle", "jordan", "air jordan", "tn", "vapormax", "presto", "killshot"],
  adidas: ["samba", "gazelle", "campus", "stan smith", "superstar", "forum", "spezial", "handball spezial", "ozweego", "nmd", "yeezy", "continental", "busenitz"],
  puma: ["suede", "palermo", "speedcat", "clyde", "cali", "rs-x"],
  reebok: ["classic", "club c", "pump", "workout", "nano"],
  converse: ["chuck taylor", "chuck 70", "all star", "one star", "jack purcell"],
  vans: ["old skool", "authentic", "sk8-hi", "era", "slip-on", "knu skool"],
  "new balance": ["574", "550", "990", "991", "992", "993", "327", "530", "2002r", "9060"],
  asics: ["gel-lyte", "gel lyte", "gel-kayano", "gel kayano", "gel-nimbus", "onitsuka"],
  salomon: ["xt-6", "xt 6", "speedcross", "acs pro"],
  veja: ["campo", "esplar", "v-10", "v-12", "rio branco"],
  "dr martens": ["1460", "1461", "jadon", "chelsea"],
  timberland: ["6 inch", "premium boot"],
  birkenstock: ["arizona", "boston", "gizeh", "madrid"],
  crocs: ["classic clog", "clog"],
  hoka: ["clifton", "bondi", "speedgoat"],
  lacoste: ["carnaby", "powercourt"],
  fila: ["disruptor"],
  saucony: ["shadow", "jazz"],
  "on running": ["cloud", "cloudmonster"],
};

// ── Les mots de VÊTEMENT qu'une pointure contredit. Liste fermée : c'est le
// vocabulaire que detectObjectKeywordDetail peut rendre pour un haut/bas/
// manteau. Un mot hors de cette liste ne déclenche pas la règle par la seule
// pointure — on ne corrige que ce qu'on sait être une contradiction.
const MOTS_VETEMENT = [
  "blazer", "tailleur", "veste", "blouson", "manteau", "doudoune", "parka", "imperméable",
  "costume", "chemise", "chemisier", "blouse", "polo", "t-shirt", "tee-shirt", "débardeur",
  "pull", "gilet", "cardigan", "sweat", "hoodie", "robe", "jupe", "pantalon", "jean",
  "short", "bermuda", "legging", "combinaison", "salopette", "jogging", "survêtement",
  "tunique", "kimono", "top", "body", "bustier",
];

// ── Les objets que le vendeur peut NOMMER et qui ne sont pas des chaussures.
// Sert UNIQUEMENT de veto contre la table marque+modèle : quand ce mot est au
// titre et qu'il n'est pas le nom du modèle, la table se tait.
// ⚠️ Cette liste a le droit d'être large : son seul effet est de NE PAS
//    corriger — c'est-à-dire de laisser le comportement d'avant. Un veto de
//    trop ne casse rien ; une bascule de trop met une paire de baskets au
//    rayon des costumes. Les quatre derniers blocs sont les faux positifs
//    relevés sur le parc le 22/09 (sac Converse, maillot Reebok Classic,
//    tee Nike Cortez, haut de training PSG x Jordan).
const MOTS_OBJET_NOMME = [
  ...MOTS_VETEMENT,
  "sac", "sacoche", "cartable", "pochette", "portefeuille", "porte-monnaie", "trousse",
  "maillot", "jersey", "tee", "haut", "brassière", "bandeau", "snood",
  "casquette", "bonnet", "chapeau", "bob", "écharpe", "foulard", "gant", "gants",
  "chaussette", "chaussettes", "boxer", "slip", "caleçon", "ceinture", "cravate",
  "boîte", "boite", "coque", "étui", "porte-clés", "montre", "lunettes", "parfum",
  "serviette", "drap", "housse", "couverture", "peluche", "doudou", "affiche", "poster",
];

// ── Les mots qui DISENT DÉJÀ une chaussure : rien à corriger, on sort.
const MOTS_CHAUSSURE = [
  "chaussure", "chaussures", "basket", "baskets", "sneaker", "sneakers", "botte", "bottes",
  "bottine", "bottines", "sandale", "sandales", "escarpin", "escarpins", "mocassin", "mocassins",
  "espadrille", "espadrilles", "ballerine", "ballerines", "derby", "derbies", "chausson",
  "chaussons", "mule", "mules", "sabot", "sabots", "tong", "tongs", "claquette", "claquettes",
  "pointure", "crampon", "crampons", "runnings", "running", "boots",
];

const norm = (s) => texteComparable(s ?? "");
const contient = (texte, mot) => {
  const t = norm(texte), m = norm(mot);
  if (!t || !m) return false;
  // Frontières de mot sur le texte NORMALISÉ (sans accents, minuscules) :
  // « airmax » ne doit pas matcher dans « fairmaxi ».
  const i = t.indexOf(m);
  if (i < 0) return false;
  const avant = i === 0 ? " " : t[i - 1];
  const apres = i + m.length >= t.length ? " " : t[i + m.length];
  return !/[a-z0-9]/.test(avant) && !/[a-z0-9]/.test(apres);
};

// La pointure telle que la fiche la porte — Lens l'écrit dans
// attributs.attributs_visibles.v.pointure (relevé réel, article 1790100111987).
function pointureDesAttributs(attributs) {
  if (!attributs || typeof attributs !== "object") return null;
  const visibles = attributs.attributs_visibles?.v;
  const candidats = [
    visibles && typeof visibles === "object" ? visibles.pointure : null,
    attributs.pointure?.v ?? attributs.pointure,
  ];
  for (const c of candidats) {
    const v = String(c ?? "").trim();
    if (v && !/^(non |inconnu|n\/a|-)$/i.test(v)) return v;
  }
  return null;
}

/**
 * L'article est-il une chaussure, malgré le mot lu au titre ?
 *
 * @param {object} arg
 * @param {string} [arg.mot]        le mot retenu pour la catégorie (IA ou titre)
 * @param {string} [arg.titre]      titre de publication
 * @param {string} [arg.description]
 * @param {string} [arg.marque]
 * @param {object} [arg.attributs]  attributs de la fiche (inventaire.attributs)
 * @returns {{mot: string, icone: string, regle: string, preuves: string[], motif: string}|null}
 */
export function chaussureMalgreLeMot({ mot = "", titre = "", description = "", marque = "", attributs = null } = {}) {
  const m = norm(mot);
  // Déjà une chaussure : il n'y a rien à corriger.
  if (m && MOTS_CHAUSSURE.some((c) => norm(c) === m)) return null;

  const texte = `${titre} ${description}`;
  const preuves = [];

  // ── PREUVE 1 : marque + modèle, tous deux présents, d'une table fermée ────
  let modeleTrouve = null;
  for (const [marqueTable, modeles] of Object.entries(MODELES_PAR_MARQUE)) {
    const marquePresente = contient(titre, marqueTable) || norm(marque) === norm(marqueTable)
      || (norm(marque) && contient(marqueTable, marque));
    if (!marquePresente) continue;
    const trouve = modeles.find((mod) => contient(titre, mod));
    if (trouve) { modeleTrouve = { marque: marqueTable, modele: trouve }; break; }
  }
  if (modeleTrouve) preuves.push(`« ${modeleTrouve.marque} ${modeleTrouve.modele} » est un modèle de chaussures`);

  // ── PREUVE 2 : une pointure relevée dans les attributs de la fiche ────────
  const pointure = pointureDesAttributs(attributs);
  if (pointure) preuves.push(`la fiche porte une pointure relevée (« ${pointure} »)`);

  // ── PREUVE 3 : le vendeur écrit « pointure » ──────────────────────────────
  const motPointure = /\bpointures?\b/i.test(texte);
  if (motPointure) preuves.push("le texte du vendeur parle de pointure");

  // ══ LE TEXTE DU VENDEUR FAIT FOI — Y COMPRIS CONTRE NOTRE TABLE ═══════════
  // Mesuré le 22/09 sur 900 articles du parc portant un nom de modèle : les
  // marques IMPRIMENT leurs modèles sur des vêtements, et la seule table
  // marque+modèle rangeait en chaussures
  //   « Veste vintage tracktop noire Reebok Classic T:M 38 »
  //   « Pantalon Jogging nike Jordan 12/13 »
  //   « Nike femme short Air Force coupe courte noir taille M »
  //   « T-shirt Nike et air Jordan »
  // Quand le vendeur NOMME un vêtement, et que ce mot n'est pas le nom du
  // modèle lui-même, c'est lui qui dit l'objet : notre table se tait.
  // ⛔ SAUF pointure : une pointure relevée tranche contre tout le reste.
  // ⚠️ La comparaison « le mot de vêtement EST le modèle » est ce qui garde le
  //    cas fondateur : dans « Nike Blazer Mid 77 », le vêtement lu et le modèle
  //    sont le MÊME mot — le vendeur n'a pas nommé un vêtement en plus, et rien
  //    ne contredit « Nike + Blazer ».
  const vetementNomme = MOTS_OBJET_NOMME.find((v) =>
    contient(titre, v) && (!modeleTrouve || norm(v) !== norm(modeleTrouve.modele)));
  if (vetementNomme && !pointure) {
    if (modeleTrouve) {
      // Trace utile en console : c'est le cas qui aurait basculé à tort.
      preuves.push(`mais le vendeur écrit « ${vetementNomme} » : la table marque+modèle se tait`);
    }
  }

  const estVetement = m && MOTS_VETEMENT.some((v) => norm(v) === m);
  // Le couple marque+modèle NOMME l'objet — sauf si le vendeur a nommé un
  // vêtement distinct du modèle, et qu'aucune pointure ne le contredit.
  const parLeModele = modeleTrouve && (!vetementNomme || !!pointure);
  // Une pointure (ou le mot « pointure ») ne suffit que si le mot retenu est un
  // mot de vêtement — c'est là, et seulement là, qu'il y a contradiction.
  const parLaPointure = estVetement && (pointure || motPointure);
  if (!parLeModele && !parLaPointure) return null;
  const modeleTrouveEffectif = parLeModele ? modeleTrouve : null;

  return {
    mot: "baskets",
    icone: "👟",
    regle: modeleTrouveEffectif ? "modele_chaussure_connu" : "pointure_contre_mot_vetement",
    preuves,
    motif:
      (m ? `le mot « ${mot} » ` : "le classement ") +
      `est écarté : ${preuves.join(" ; ")}. L'article est rangé en chaussures.`,
  };
}

export const _internes = { MODELES_PAR_MARQUE, MOTS_VETEMENT, MOTS_OBJET_NOMME, MOTS_CHAUSSURE, pointureDesAttributs, contient };
