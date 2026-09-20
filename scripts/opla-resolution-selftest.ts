// Selftest du module de résolution de catégorie Opla.
//   deno run --allow-read scripts/opla-resolution-selftest.ts
// Verrouille les cas MESURÉS le 18/09 — les trois défauts nommés par Nico :
//   1. ambiguïté « robe » tranchée dans les DEUX sens ;
//   2. options de question = des FEUILLES, jamais un nœud ;
//   3. taille « L / 40 / 12 » normalisée vers la grille de la feuille.
// Plus les deux refus qui protègent : aucun mot ⇒ on ne devine pas, et deux
// rayons possibles sans genre connu ⇒ on ne tire pas au sort.
//
// AJOUT DU 19/09 — la série Zombicide du compte Amiral, relevée en base, et la
// CLÉ de mémorisation d'une question (`cleFourche`). Les cinq cas 5/6 sont les
// mots-objets RÉELS de ses cinq jobs Opla de l'après-midi : c'est la preuve que
// le mot varie d'un article à l'autre là où la fourche, elle, ne bouge pas.

import { resoudreCategorieOpla, feuillesParMot, trancherCandidats, optionsFeuilles, normaliserTailleOpla, cheminLisible, cleFourche } from "../supabase/functions/_shared/opla-resolution.ts";
import { oplaNoeud } from "../supabase/functions/_shared/opla-catalogue.ts";
const l = (t: string) => console.log(t);
let ko = 0;
const ok = (nom: string, cond: boolean, detail = "") => { l(`${cond ? "  ok  " : "  ⚠ KO"} ${nom}${detail ? " — " + detail : ""}`); if (!cond) ko++; };

// ⛔ ON TESTE PAR LA PORTE D'ENTRÉE (2026-09-20). Ces deux cas passaient par
//    `feuillesParMot` + `trancherCandidats` à la main — un montage qui n'existe
//    nulle part en prod. Le jour où `feuillesParMot` a changé de contrat (elle
//    rend désormais TOUTES les feuilles, les trois passes réunies, et c'est
//    `resoudreCategorieOpla` qui choisit l'étage), le test a rougi alors que le
//    comportement réel était intact. Un selftest qui teste un assemblage
//    imaginaire ne protège rien : on appelle la fonction que le serveur appelle.
l("=== 1. AMBIGUITE, les deux sens ===");
// ⚠️ « robe » AVEC LE GENRE (2026-09-20). Le cas d'origine n'en portait pas et
//    attendait quand même « Femmes › Autres robes » — ce qui revenait à
//    supposer le rayon. Depuis que le mot ramène aussi le RAYON qu'il nomme
//    (« Robes »), un « robe » sans genre voit treize feuilles réparties entre
//    Femmes et Enfants et rend la main : c'est la règle « on ne tire jamais au
//    sort un genre », appliquée pour de bon. Avec le genre — ce que porte tout
//    job réel du parc — le départage rend le même résultat qu'avant.
const t1 = resoudreCategorieOpla({ mots: ["robe"], genre: "Femme" });
ok("« robe » (genre Femme) → Autres robes", t1.code === "WOM_DRE_OTHER", `${cheminLisible(t1.code ?? "")} [${t1.etapes.at(-1)}]`);
const t1s = resoudreCategorieOpla({ mots: ["robe"] });
ok("« robe » SANS genre → on ne choisit pas le rayon, on demande",
  t1s.code === null && t1s.candidats.length > 2, `${t1s.candidats.length} feuilles`);
const t1b = resoudreCategorieOpla({ mots: ["robe de sport"], genre: "Femme" });
ok("« robe de sport » → branche sport", /sport/i.test(cheminLisible(t1b.code ?? "")), `${cheminLisible(t1b.code ?? "")} [${t1b.etapes.at(-1)}]`);

l("=== 2. MAILLOT — avec et sans genre ===");
const r2 = resoudreCategorieOpla({ mots: ["maillot de football", "maillot"], genre: "Homme" });
ok("avec genre → MEN_JERSEYS feuille", r2.code === "MEN_JERSEYS" && !!oplaNoeud(r2.code!)?.feuille, cheminLisible(r2.code ?? ""));
const r2b = resoudreCategorieOpla({ mots: ["maillot de football", "maillot"] });
ok("sans genre → on NE tranche PAS le rayon", r2b.code === null, `${r2b.code} | ${r2b.etapes.join(" ; ")}`);

l("=== 2b. OPTIONS : QUE DES FEUILLES, ET JAMAIS TRONQUEES ===");
const rOpts = resoudreCategorieOpla({ mots: ["jean"] });   // 13 feuilles, aucune ne tranche
const opts = optionsFeuilles(rOpts.candidats);
ok("options = candidats, 0 noeud", opts.length === rOpts.candidats.length && opts.length > 1 && opts.every(o => oplaNoeud(o.code)?.feuille === true), `${opts.length} options`);

l("=== 3. TAILLE ===");
const chemise = feuillesParMot(["chemise"])[0];
ok("« L / 40 / 12 » → L", normaliserTailleOpla(chemise.code, "L / 40 / 12") === "L");
ok("« 90C » refuse sur une chemise", normaliserTailleOpla(chemise.code, "90C") === null);
ok("valeur inconnue → null", normaliserTailleOpla(chemise.code, "n'importe quoi") === null);
ok("categorie sans grille → null", normaliserTailleOpla("BOOKS", "L") === null);

// ── LES TAILLES ENFANT — déjà réparées ici le 18/09, on les VERROUILLE ──────
// Elles sont la raison d'être du vocabulaire partagé. Aucun contrôle ne les
// tenait : « 5 ans » contre une grille qui écrit « 5Y » pouvait re-casser sans
// qu'une seule ligne rougisse.
ok("« 5 ans » → 5Y", normaliserTailleOpla("LEGGINGS_GIRLS_NEW", "5 ans") === "5Y");
ok("« 12 ans » → 12Y (le jogging Zara d'Ornella)", normaliserTailleOpla("JOGGINGS_GIRLS_NEW", "12 ans") === "12Y");
ok("« 24 mois » → 24M", normaliserTailleOpla("SWEATERS_GIRLS_NEW", "24 mois") === "24M");
ok("« 23 mois » n'existe pas : REFUSÉ, jamais rapproché de 24M",
  normaliserTailleOpla("SWEATERS_GIRLS_NEW", "23 mois") === null);

// ── LA TABLE FEMME NOMBRE → LETTRE (2026-09-20) ────────────────────────────
// Relevée chez Vinted (/api/v2/size_groups groupe 4, « M / 38 / 10 »), parce
// qu'Opla ne publie AUCUNE équivalence numérique sur sa grille de lettres.
// ⛔ Elle ne doit sortir QUE sous Femmes, et QUE sur une grille de lettres.
l("=== 3 bis. TABLE FEMME — relevée chez Vinted, bornée aux femmes ===");
ok("robe femme « 38 » → M", normaliserTailleOpla("WOM_DRE_OTHER", "38") === "M");
ok("robe femme « 40 » → L", normaliserTailleOpla("WOM_DRE_OTHER", "40") === "L");
ok("« 46 » hors table → null, on ne devine pas", normaliserTailleOpla("WOM_DRE_OTHER", "46") === null);
ok("HOMMES « 36 » de pantalon n'est pas un S", normaliserTailleOpla("MEN_TRO_OTHER", "36") === null);
ok("HOMMES « 38 » de t-shirt reste refusé", normaliserTailleOpla("MEN_TOP_T_SHIRTS", "38") === null);
ok("ENFANTS « 38 » reste refusé (table FEMME)", normaliserTailleOpla("TOPS_GIRLS_NEW", "38") === null);
ok("SOUTIENS-GORGE « 38 » est un tour de dos, refusé", normaliserTailleOpla("BRAS", "38") === null);
ok("CHAUSSURES femme « 38 » reste la pointure 38", normaliserTailleOpla("WOMEN_TRAINERS", "38") === "38");
ok("demi-pointure « 44.5 » : limite d'Opla, refusée", normaliserTailleOpla("MEN_SNEAKERS", "44.5") === null);
ok("ce qui passait passe toujours : « M » → M", normaliserTailleOpla("SUMMER_DRESSES", "M") === "M");
ok("ce qui passait passe toujours : « 75A » → 75A", normaliserTailleOpla("BRAS", "75A") === "75A");

l("=== 4. SANS MOT : on ne devine pas ===");
const r4 = resoudreCategorieOpla({ mots: [], genre: "Femme" });
ok("aucun mot → aucun code, aucun candidat", r4.code === null && !r4.candidats.length);

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA SÉRIE ZOMBICIDE (compte Amiral, 19/09) — LE MOT BOUGE, PAS LA FOURCHE
// ═══════════════════════════════════════════════════════════════════════════
// Les cinq mots-objets sont ceux des cinq jobs Opla relevés en base, avec le
// titre réel de l'article en second mot (le serveur l'ajoute en dernier
// recours). Trois se résolvent seuls, deux posent LA MÊME question.
l("=== 5. SÉRIE ZOMBICIDE : le mot varie, la fourche non ===");
const fourcheDe = (mots: string[]) => {
  const r = resoudreCategorieOpla({ mots });
  return { code: r.code, cle: cleFourche(optionsFeuilles(r.candidats)), options: optionsFeuilles(r.candidats) };
};
const vert = fourcheDe(["rangement pour jeu de société", "Insert / Rangement Vert Zombicide 2ᵉ Édition"]);
const rose = fourcheDe(["rangement pour jeu de société", "Insert / Rangement Rose Zombicide: Black Plague"]);
const FOURCHE_AMIRAL = "BOARD_GAMES|HC_STORAGE_OTHER";
ok("18:07 « vert » → question, 2 feuilles", vert.code === null && vert.cle === FOURCHE_AMIRAL, vert.cle);
ok("18:10 « rose » → MÊME clé malgré un titre différent", rose.cle === vert.cle, rose.cle);
ok("les 2 options sont bien des feuilles", vert.options.length === 2 && vert.options.every((o) => oplaNoeud(o.code)?.feuille === true), vert.options.map((o) => o.title).join(" | "));
for (const [nom, mots] of [
  ["17:26 « insert de rangement »", ["insert de rangement", "Insert Rangement Rouge Zombicide: Black Plague"]],
  ["18:01 « bac de rangement »", ["bac de rangement", "Rangement Bleu et Noir pour pots & couvercles"]],
  ["17:21 « rangement pour pots de yaourt »", ["rangement pour pots de yaourt", "Rangement Blanc 12 pots & 12 couvercles Multidélices"]],
] as Array<[string, string[]]>) {
  const f = fourcheDe(mots);
  ok(`${nom} → résolu sans question`, f.code === "HC_STORAGE_OTHER" && !f.cle, f.code ?? "(null)");
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LA CLÉ D'UNE QUESTION — ce qu'elle confond, ce qu'elle sépare
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ C'est la seule chose qui autorise à rejouer une réponse sans la
//    redemander : si elle confondait deux questions, on publierait dans un
//    rayon que l'utilisateur n'a jamais choisi.
l("=== 6. cleFourche : identité d'une question ===");
const A = { code: "BOARD_GAMES", title: "Jeux et jouets › Jeux de société" };
const B = { code: "HC_STORAGE_OTHER", title: "Culture et Loisirs › Rangement de collection › Autres rangements" };
const C = { code: "PUZZLES", title: "Jeux et jouets › Puzzles" };
ok("l'ordre des options ne change pas la clé", cleFourche([A, B]) === cleFourche([B, A]), cleFourche([A, B]));
ok("un doublon ne change pas la clé", cleFourche([A, B, A]) === cleFourche([A, B]));
ok("une feuille de PLUS ⇒ autre clé (on redemande)", cleFourche([A, B, C]) !== cleFourche([A, B]), `${cleFourche([A, B, C])} ≠ ${cleFourche([A, B])}`);
ok("une feuille de MOINS ⇒ autre clé", cleFourche([A]) !== cleFourche([A, B]));
// Deux branches portent le même LIBELLÉ (« Robes ») : une clé de libellés les
// confondrait. On vérifie que la clé est bien faite des CODES.
const robes = optionsFeuilles(resoudreCategorieOpla({ mots: ["robe"], genre: "Fille" }).candidats);
ok("la clé est faite des codes, pas des libellés",
  robes.length === 2 && robes.every((o) => /Robes/.test(o.title)) && cleFourche(robes) === robes.map((o) => o.code).sort().join("|"),
  cleFourche(robes));
ok("aucune option ⇒ clé vide (rien à mémoriser)", cleFourche([]) === "");

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA CASCADE DU 20/09 — les six défauts nommés, chacun sur son job réel
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ CHAQUE CAS EXÉCUTE `resoudreCategorieOpla`, la fonction que get-pending-jobs
//    appelle. Aucun montage intermédiaire : c'est la leçon des selftests verts
//    sur de vrais bugs.
l("=== 7. LA CASCADE DU 20/09 ===");
const cas7 = (mots: string[], genre: string | null = null) => resoudreCategorieOpla({ mots, genre });

// (a) jobs 2e96a21f / 840b67ec — la passe 1 ne doit plus court-circuiter les autres.
const jean = cas7(["jean"]);
const codesJean = jean.candidats.map((f) => f.code);
ok("« jean » sans genre : les jeans ADULTES sont dans la liste",
  jean.code === null && codesJean.includes("MEN_STRAIGHTFIT_JEANS") && codesJean.includes("W_SKINNY_JEANS")
  && codesJean.includes("JEANS_GIRLS_NEW") && codesJean.includes("JEANS_BOYS_NEW"),
  `${codesJean.length} feuilles`);
const jeanH = cas7(["jean"], "Homme");
ok("« jean » genre Homme : QUE le rayon homme, jamais les deux feuilles enfant",
  jeanH.candidats.length > 1 && jeanH.candidats.every((f) => f.chemin[0] === "Hommes"),
  jeanH.candidats.map((f) => f.titre).join(", "));

// (b) job 76fa3371 — une correspondance précise reste une réponse, pas une question.
ok("« jean skinny noir femme » → Jeans skinny, sans question",
  cas7(["jean skinny noir femme", "jean"], "Femme").code === "W_SKINNY_JEANS");

// (c) job 40ebdf2c — le genre écarte POUR DE BON (fail-closed).
const robeBebe = cas7(["robe enfant", "robe"], "Fille");
ok("robe de bébé, genre Fille : plus AUCUNE robe femme",
  robeBebe.code === null && robeBebe.candidats.length > 0
  && robeBebe.candidats.every((f) => f.chemin[0] === "Enfants"),
  robeBebe.candidats.map((f) => f.chemin.join(" › ")).join(" | "));

// (d) job 8de4f86a — « Garçon » n'entre pas au rayon des filles.
ok("« pull enfant » genre Garçon → rayon garçons",
  cas7(["pull enfant", "pull"], "Garçon").code === "SWEATERS_BOYS_NEW");

// (e) jobs c7dae6b5 / 2daa420c / e7502c18 — le mot nomme un RAYON.
const livre = cas7(["livre"]);
const codesLivre = livre.candidats.map((f) => f.code);
ok("« livre » → tout le rayon Livres, pas seulement les livres sonores",
  livre.code === null && codesLivre.includes("ROMANS_POUR_ADULTES") && codesLivre.includes("MANGAS")
  && codesLivre.includes("BANDES_DESSINEES"),
  `${codesLivre.length} feuilles`);

// (f) job 64170d6f — « pour » est un mot-outil, pas un critère de départage.
ok("« La Méthode Delavier de Musculation pour la Femme » ne part pas en livres pour bébé",
  cas7(["livre", "musculation", "La Méthode Delavier de Musculation pour la Femme"]).code !== "LIVRES_POUR_BEBE");

// (g) job 9e6d4eb6 — une passe 3 seule propose le rayon, elle ne tranche pas.
const pantalonG = cas7(["pantalon velours enfant", "pantalon"], "Garçon");
ok("« pantalon velours enfant » garçon : le rayon entier, « Autres » compris",
  pantalonG.code === null && pantalonG.candidats.some((f) => f.code === "BOYS_OTH_PANTS"),
  `${pantalonG.candidats.length} feuilles`);

// (h) job eba8a512 — un genre connu désigne un rayon : le maillot ne part ni au
//     rayon des ballons, ni au rayon des maillots de bain.
ok("« maillot de football » genre Homme → MEN_JERSEYS",
  cas7(["maillot de football", "maillot"], "Homme").code === "MEN_JERSEYS");

// (i) G0 — ce qui marchait marche encore, sur les mots-objets les plus fréquents
//     du parc (relevé des 147 jobs Opla de 30 jours).
for (const [mots, genre, attendu] of [
  [["pull", "pull"], "Femme", "PULLS_SWEATERS_VESTS"],
  [["t-shirt", "t-shirt"], "Homme", "MEN_TOP_T_SHIRTS"],
  [["t-shirt", "t-shirt"], "Femme", "WOM_TOP_T_SHIRTS"],
  [["blouse volants pois", "blouse"], "Femme", "BLOUSES"],
  [["blazer", "blazer"], "Femme", "WOM_BLA_BLAZERS"],
  [["sandale", "sandale"], "Femme", "WOMEN_SANDALS"],
  [["basket", "basket"], "Femme", "WOMEN_TRAINERS"],
  [["baskets"], "Homme", "MEN_SNEAKERS"],
  [["cardigan", "cardigan"], "Femme", "CARDIGANS"],
  [["peluche", "peluche"], null, "STUFFED_ANIMALS_NEW"],
  [["jogging", "jogging"], "Femme", "JOGGINGS"],
  [["brassière de sport", "brassiere"], "Femme", "SPORTS_BRA"],
] as Array<[string[], string | null, string]>) {
  const r = cas7(mots, genre);
  ok(`G0 ${JSON.stringify(mots[0])}${genre ? " " + genre : ""} → ${attendu}`, r.code === attendu, r.code ?? `question ${r.candidats.length}`);
}
// « casque audio » ne se résout PAS et ne s'est jamais résolu : un casque de
// vélo, d'équitation ou de ski porte le même mot. La question à six feuilles
// est la bonne réponse — c'est la personne qui sait. On verrouille le fait que
// « Casques et écouteurs » y figure (job 37b9bd31, réponse donnée par Nadège).
const casque = cas7(["casque audio", "casque"]);
ok("« casque audio » : question honnête, avec Casques et écouteurs dedans",
  casque.code === null && casque.candidats.some((f) => f.code === "HIGHTECH_AUDIO_CASQUES"),
  `${casque.candidats.length} feuilles`);

l(ko ? `\n⚠ ${ko} CAS EN ECHEC` : "\n✓ TOUS LES CAS PASSENT");
