// Selftest du module de résolution de catégorie Opla.
//   deno run --allow-read scripts/opla-resolution-selftest.ts
// Verrouille les cas MESURÉS le 18/09 — les trois défauts nommés par Nico :
//   1. ambiguïté « robe » tranchée dans les DEUX sens ;
//   2. options de question = des FEUILLES, jamais un nœud ;
//   3. taille « L / 40 / 12 » normalisée vers la grille de la feuille.
// Plus les deux refus qui protègent : aucun mot ⇒ on ne devine pas, et deux
// rayons possibles sans genre connu ⇒ on ne tire pas au sort.

import { resoudreCategorieOpla, feuillesParMot, trancherCandidats, optionsFeuilles, normaliserTailleOpla, cheminLisible } from "../supabase/functions/_shared/opla-resolution.ts";
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

l("=== 4. SANS MOT : on ne devine pas ===");
const r4 = resoudreCategorieOpla({ mots: [], genre: "Femme" });
ok("aucun mot → aucun code, aucun candidat", r4.code === null && !r4.candidats.length);

l(ko ? `\n⚠ ${ko} CAS EN ECHEC` : "\n✓ TOUS LES CAS PASSENT");
