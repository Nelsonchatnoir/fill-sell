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

const MOTS_VIDES = new Set([
  "de", "des", "du", "le", "la", "les", "l", "d", "et", "ou", "a", "au", "aux",
  "en", "par", "sur", "avec", "autre", "autres", "divers",
]);

const jetons = (s: unknown) =>
  comparable(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .map((t) => t.replace(/(?<=\p{L}{3})[sx]$/u, ""))
    .filter((t) => t && !MOTS_VIDES.has(t))
    .sort().join(" ");

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
}

const FEUILLES: FeuilleOpla[] = [];
const PAR_CODE = new Map<string, FeuilleOpla>();
(function indexer() {
  const vus = new Set<string>();
  const descendre = (code: string, chemin: string[]) => {
    for (const n of oplaEnfants(code)) {
      if (vus.has(n.code)) continue;
      vus.add(n.code);
      const sous = [...chemin, n.titre];
      if (n.feuille) {
        const jt = jetons(n.titre);
        const f: FeuilleOpla = {
          code: n.code,
          titre: n.titre,
          chemin: sous,
          jetons: jt ? jt.split(" ") : [],
          jetonsChemin: [...new Set(sous.flatMap((t) => (jetons(t) ? jetons(t).split(" ") : [])))],
        };
        FEUILLES.push(f);
        PAR_CODE.set(n.code, f);
      } else {
        descendre(n.code, sous);
      }
    }
  };
  descendre("", []);
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
// Jumelle de opla.js:427-452, plafond compris. On s'arrête à la PREMIÈRE passe
// qui rend quelque chose : une passe plus large n'ajouterait que du bruit à un
// résultat déjà trouvé.
//   1. ÉGALITÉ       : les jetons du libellé SONT ceux du mot ;
//   2. LIBELLÉ ⊆ MOT : le mot nomme le libellé et le précise
//                      (« maillot de football » ⊃ « Maillots ») ;
//   3. MOT ⊆ LIBELLÉ : le mot est une partie du libellé — la plus large.
// ⛔ PLAFOND : au-delà, la passe ne « trouve » rien d'utile, c'est une liste à
//    cocher illisible. On la jette.
export const OPLA_CANDIDATS_MAX = 12;

export function feuillesParMot(mots: unknown[], ancre: string | null = null): FeuilleOpla[] {
  const listeMots = (Array.isArray(mots) ? mots : [mots]).map((m) => jetons(m)).filter(Boolean);
  if (!listeMots.length) return [];
  const perimetre = perimetreDe(ancre);
  const dedans = FEUILLES.filter((f) => f.jetons.length && (!perimetre || perimetre.has(f.code)));
  const passes: Array<(jt: string[], jm: string[]) => boolean> = [
    (jt, jm) => jt.join(" ") === jm.join(" "),
    (jt, jm) => jt.every((t) => jm.includes(t)),
    (jt, jm) => jm.every((t) => jt.includes(t)),
  ];
  for (const passe of passes) {
    for (const mot of listeMots) {
      const jm = mot.split(" ");
      const out = dedans.filter((f) => passe(f.jetons, jm));
      if (out.length && out.length <= OPLA_CANDIDATS_MAX) return out;
    }
  }
  return [];
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
// ⛔ LE GENRE ÉCARTE, IL NE CHOISIT PAS : un candidat dont la racine contredit
//    le genre connu de l'article est retiré ; si le filtre vide la liste, on
//    garde la liste d'origine (fail-open sur le filtre, jamais sur la décision).
const RACINE_PAR_GENRE: Record<string, RegExp> = {
  femme: /^femme/i,
  homme: /^homme/i,
  fille: /^(fille|enfant)/i,
  garcon: /^(gar[cç]on|enfant)/i,
};

export function trancherCandidats(
  candidats: FeuilleOpla[],
  { mots = [], genre = null }: { mots?: unknown[]; genre?: string | null } = {},
): { feuille: FeuilleOpla | null; restants: FeuilleOpla[]; motif: string } {
  if (!candidats.length) return { feuille: null, restants: [], motif: "aucun candidat" };
  if (candidats.length === 1) return { feuille: candidats[0], restants: candidats, motif: "candidat unique" };

  let liste = candidats;
  const g = comparable(genre).replace(/[^a-z]/g, "");
  const re = RACINE_PAR_GENRE[g];
  if (re) {
    const gardes = liste.filter((f) => re.test(f.chemin[0] ?? ""));
    if (gardes.length) liste = gardes;
    if (liste.length === 1) return { feuille: liste[0], restants: liste, motif: `genre « ${genre} » écarte les autres racines` };
  }

  // ⛔ ON NE TIRE JAMAIS AU SORT UN GENRE. Si les candidats restants ne sont
  //    pas d'accord sur leur RACINE (Hommes / Femmes / Enfants…) et que rien ne
  //    dit le genre de l'article, aucun critère de chemin ne peut trancher
  //    honnêtement : « maillot de football » désigne MEN_JERSEYS et WOM_JERSEYS
  //    exactement pareil. Le score les départagerait quand même — par la
  //    profondeur, c'est-à-dire par hasard — et publierait un maillot homme
  //    dans le rayon femme sans que personne ne le voie. On rend la main.
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
  { mots = [], depart = null, genre = null }:
  { mots?: unknown[]; depart?: string | null; genre?: string | null } = {},
): { code: string | null; candidats: FeuilleOpla[]; etapes: string[] } {
  const etapes: string[] = [];
  let code = String(depart ?? "").trim();
  if (code && !oplaNoeud(code)) { etapes.push(`ancre « ${code} » inconnue — ignorée`); code = ""; }
  if (code && oplaNoeud(code)?.feuille) return { code, candidats: [], etapes: ["ancre déjà une feuille"] };

  for (let garde = 0; garde < 12; garde++) {
    if (code && oplaNoeud(code)?.feuille) break;
    const parMot = feuillesParMot(mots, code || null);
    if (parMot.length === 1) {
      etapes.push(`mot → ${parMot[0].code} (feuille unique ${code ? `sous ${code}` : "dans tout l'arbre"})`);
      code = parMot[0].code;
      continue;
    }
    if (parMot.length > 1) {
      const { feuille, restants, motif } = trancherCandidats(parMot, { mots, genre });
      if (feuille) {
        etapes.push(`mot → ${parMot.length} feuilles, tranché sur ${feuille.code} : ${motif}`);
        code = feuille.code;
        continue;
      }
      etapes.push(`mot → ${parMot.length} feuilles, non tranchable (${motif}) — question au niveau des feuilles`);
      return { code: code || null, candidats: restants, etapes };
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
    const global = resoudreCategorieOpla({ mots, genre });
    return { code: global.code, candidats: global.candidats, etapes: [...etapes, ...global.etapes] };
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
  const t = tailleDansGrille(brut, grille);
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
