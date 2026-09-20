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

l("=== 1. AMBIGUITE, les deux sens ===");
const c1 = feuillesParMot(["robe"]);
const t1 = trancherCandidats(c1, { mots: ["robe"] });
ok("« robe » → Autres robes", t1.feuille?.code === "WOM_DRE_OTHER", `${t1.feuille?.chemin.join(" > ")} [${t1.motif}]`);
const t1b = trancherCandidats(c1, { mots: ["robe de sport"] });
ok("« robe de sport » → branche sport", /sport/i.test(t1b.feuille?.chemin.join(" ") ?? ""), `${t1b.feuille?.chemin.join(" > ")} [${t1b.motif}]`);

l("=== 2. MAILLOT — avec et sans genre ===");
const r2 = resoudreCategorieOpla({ mots: ["maillot de football", "maillot"], genre: "Homme" });
ok("avec genre → MEN_JERSEYS feuille", r2.code === "MEN_JERSEYS" && !!oplaNoeud(r2.code!)?.feuille, cheminLisible(r2.code ?? ""));
const r2b = resoudreCategorieOpla({ mots: ["maillot de football", "maillot"] });
ok("sans genre → on NE tranche PAS le rayon", r2b.code === null, `${r2b.code} | ${r2b.etapes.join(" ; ")}`);

l("=== 2b. OPTIONS : QUE DES FEUILLES, ET JAMAIS TRONQUEES ===");
const opts = optionsFeuilles(c1);
ok("options = candidats, 0 noeud", opts.length === c1.length && opts.every(o => oplaNoeud(o.code)?.feuille === true), opts.map(o=>o.title).join(" | "));

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
const robes = optionsFeuilles(feuillesParMot(["robe"]));
ok("la clé est faite des codes, pas des libellés", robes.length === 2 && cleFourche(robes) === robes.map((o) => o.code).sort().join("|"), cleFourche(robes));
ok("aucune option ⇒ clé vide (rien à mémoriser)", cleFourche([]) === "");

l(ko ? `\n⚠ ${ko} CAS EN ECHEC` : "\n✓ TOUS LES CAS PASSENT");
