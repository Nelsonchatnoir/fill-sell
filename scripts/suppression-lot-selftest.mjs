// ═══════════════════════════════════════════════════════════════════════════
// STOCK : SUPPRIMER PLUSIEURS ARTICLES — SELFTEST « VERROU » (16/11/2026, point 8 — Marc, thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// Aucun article supprimé par erreur (rouge sur le code d'avant : modules absents, aucun geste « Supprimer ») :
//   1. la sélection n'est qu'un CHOIX : la barre ouvre la confirmation, elle ne supprime rien ;
//   2. la confirmation dit tout avant le geste : nombre d'articles, annonces en ligne et plateformes, ventes gardées,
//      articles laissés de côté (vente à confirmer, vérification impossible) ;
//   3. « Annuler » ne touche à rien ; rien ne part avant le second geste ;
//   4. chaque article suit le chemin d'UN article : executerSuppression (retraits dans la file, ventes GARDÉES :
//      alsoDeleteSale false), ou la RPC « laisser les annonces en ligne » — seulement pour un article qui en a ;
//   5. un échec n'arrête pas le lot et se dit ; le verrou de suppression couvre tout le lot ; une relecture à la fin ;
//   6. la suppression d'UN article ne change pas (même corps, même message, même relecture).
import fs from "node:fs";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

let L = null;
try { L = await import("../src/stock/reglesSuppressionLot.js"); } catch (e) { ok(false, "src/stock/reglesSuppressionLot.js existe", String(e?.message ?? e).slice(0, 100)); }

const art = (id, titre) => ({ id, title: titre });
const enLigne = (...pfs) => ({ online: pfs.map((platform) => ({ platform, listing_url: `https://x/${platform}` })), aAnnuler: [] });

if (L) {
  console.log("\n1. Le résumé avant le geste");
  const entrees = [
    { item: art(1, "Jean 501"), plan: enLigne("vinted", "leboncoin") },
    { item: art(2, "Pull Zara"), plan: enLigne("vinted") },
    { item: art(3, "Robe"), plan: enLigne(), aDesVentes: true },
    { item: art(4, "Veste vendue à confirmer"), plan: enLigne("vinted"), venteAConfirmer: true },
    { item: art(5, "Lecture impossible"), plan: null, erreur: "réseau" },
    { item: art(6, "Sac Opla"), plan: enLigne("opla", "beebs") },
  ];
  const r = L.resumeSuppressionLot(entrees);
  ok(r.nArticles === 4, "4 articles à supprimer (sur 6 sélectionnés)", String(r.nArticles));
  ok(r.nAnnonces === 4 && r.parPlateforme.vinted === 2 && r.parPlateforme.leboncoin === 1 && r.parPlateforme.beebs === 1, "4 annonces en ligne : Vinted 2, Leboncoin 1, Beebs 1", JSON.stringify(r.parPlateforme));
  ok(!("opla" in r.parPlateforme), "Opla jamais comptée (FillSell n'y touche plus, règle du 22/10)");
  ok(r.nAvecVentes === 1, "1 article avec des ventes : elles restent au tableau de bord");
  ok(r.exclus.length === 2 && r.exclus.some((x) => x.id === 4 && x.motif === "vente_a_confirmer") && r.exclus.some((x) => x.id === 5 && x.motif === "plan_illisible"),
    "laissés de côté : la vente à confirmer, la vérification impossible", JSON.stringify(r.exclus));
  ok(!r.aSupprimer.some((e) => e.item.id === 4 || e.item.id === 5), "jamais supprimés : ni la vente à confirmer, ni l'illisible");
  ok(L.plateformesEnClair(r.parPlateforme) === "Vinted 2, Leboncoin 1, Beebs 1", "« Vinted 2, Leboncoin 1, Beebs 1 »", L.plateformesEnClair(r.parPlateforme));

  console.log("\n2. Les choix, comme pour un article");
  ok(JSON.stringify(L.choixSuppressionLot(r)) === JSON.stringify(["avec_retrait", "fiche_seule"]), "annonces en ligne : « retirer aussi » d'abord, puis « laisser en ligne »");
  ok(JSON.stringify(L.choixSuppressionLot(L.resumeSuppressionLot([{ item: art(9, "x"), plan: enLigne() }]))) === JSON.stringify(["simple"]), "rien en ligne : « Supprimer »");
  ok(L.choixSuppressionLot(L.resumeSuppressionLot([])).length === 0 && L.choixSuppressionLot(L.resumeSuppressionLot([entrees[3]])).length === 0, "rien à supprimer : aucun bouton");
  ok(L.modeDuChoix("fiche_seule") === "fiche_seule" && L.modeDuChoix("avec_retrait") === "avec_retrait" && L.modeDuChoix("simple") === "avec_retrait", "« Supprimer » sans annonce = le chemin d'un article");

  console.log("\n3. La boucle : le chemin d'UN article, ventes gardées, échecs dits");
  const appels = [];
  const gestes = {
    supprimerAvecPlan: async (item, plan) => { appels.push(["avec", item.id]); if (item.id === 2) throw new Error("FK"); return { armes: plan.online.length, boutiqueEtrangere: item.id === 6 }; },
    supprimerFicheSeule: async (item) => { appels.push(["seule", item.id]); return { ok: true, annonces_laissees: 2 }; },
  };
  const progression = [];
  const b1 = await L.executerSuppressionLot(r.aSupprimer, "avec_retrait", { ...gestes, onProgression: (f, t) => progression.push(`${f}/${t}`) });
  ok(JSON.stringify(appels.map((a) => a[1])) === JSON.stringify([1, 2, 3, 6]) && appels.every((a) => a[0] === "avec"), "avec retrait : chaque article par le chemin d'un article, dans l'ordre", JSON.stringify(appels));
  ok(b1.faits === 3 && b1.echecs.length === 1 && b1.echecs[0].titre === "Pull Zara", "un échec n'arrête pas le lot et il est nommé", JSON.stringify(b1));
  ok(b1.annonces === 4 && b1.boutiques === 1, "retraits comptés (ceux réellement armés), boutique d'un autre compte comptée");
  ok(progression.join(",") === "1/4,2/4,3/4,4/4", "l'avancement article par article");
  appels.length = 0;
  const b2 = await L.executerSuppressionLot(r.aSupprimer, "fiche_seule", gestes);
  ok(JSON.stringify(appels) === JSON.stringify([["seule", 1], ["seule", 2], ["avec", 3], ["seule", 6]]), "laisser en ligne : la RPC pour ceux qui ONT des annonces, le chemin d'un article pour les autres", JSON.stringify(appels));
  ok(b2.laissees === 6 && b2.faits === 4, "annonces laissées en ligne comptées (2 par article ici)");
  ok(/2 articles supprimés|3 articles supprimés/.test(L.phraseBilanSuppressionLot(b1)) && /non supprimé/.test(L.phraseBilanSuppressionLot(b1)) && /une à la fois/.test(L.phraseBilanSuppressionLot(b1)), "le bilan le dit (supprimés, retraits en file une à la fois, échecs)", L.phraseBilanSuppressionLot(b1));
  ok(/déjà en cours/.test(L.phraseBilanSuppressionLot({ occupe: true })), "une suppression déjà en cours : on le dit, rien ne part");
}

console.log("\n4. Le câblage (lecture du code)");
{
  const barre = lire("src/stock/BarreModifierLot.jsx");
  ok(/onClick=\{\(\) => onSupprimer\(choisis\.map\(\(i\) => i\.id\)\)\}/.test(barre), "la barre « Supprimer » ouvre la confirmation avec les seuls articles cochés");
  ok(!/from\("inventaire"\)\.delete|\.delete\(\)/.test(barre), "la barre ne supprime jamais elle-même");
  ok(/\.\.\.\(onSupprimer \? \[\["supprimer"/.test(barre), "sans le geste fourni, la barre est celle d'avant (prix, quantité)");
  const sl = lire("src/stock/SuppressionLot.jsx");
  ok(/const lancer = async \(choix\) => \{\s*if \(phase !== 'confirmer' \|\| !resume\?\.nArticles\) return;/.test(sl), "rien ne part avant le résumé affiché et le second geste");
  ok(/data-annuler-suppression="" onClick=\{\(\) => onFermer\?\.\(\)\}/.test(sl) && (sl.match(/supprimer\(/g) ?? []).length === 1, "« Annuler » ferme, et la suppression n'est appelée qu'à un seul endroit");
  ok(/const fermable = phase !== 'en_cours';/.test(sl), "pendant la suppression, la feuille ne se ferme pas par erreur");
  const app = lire("src/App.jsx");
  ok(/supprimerAvecPlan:\(item,plan\)=>executerSuppression\(item,plan,\{alsoDeleteSale:false,lot\}\)/.test(app), "le lot passe par executerSuppression, ventes GARDÉES (alsoDeleteSale false)");
  ok(/supprimerFicheSeule:async\(item\)=>\{\s*const\{data,error\}=await supabase\.rpc\('inventaire_supprimer_sans_retrait'/.test(app), "« laisser en ligne » : la même RPC que pour un article");
  ok(/async function supprimerArticlesEnLot\(entrees,mode,onProgression\)\{\s*if\(suppressionRef\.current\)return\{occupe:true\};\s*suppressionRef\.current=true;/.test(app), "le verrou de suppression couvre tout le lot");
  ok(/if\(lot\)return\{armes:armes\.length/.test(app) && /async function executerSuppression\(item,plan,\{alsoDeleteSale=false,lot=null\}=\{\}\)/.test(app), "un article seul garde son message et sa relecture (lot null par défaut)");
  ok(/plan:await buildDeletePlan\(item\.id\)/.test(app) && /venteAConfirmer:aConfirmer\.has/.test(app), "le plan de chaque article est CELUI d'un article ; les ventes à confirmer sont repérées");
  const st = lire("src/tabs/StockTab.jsx");
  ok(/onSupprimer=\{planifierSuppressionLot&&supprimerArticlesEnLot\?\(ids\)=>\{if\(ids\?\.length\)setSuppressionLotIds\(ids\);\}:null\}/.test(st), "le Stock branche « Supprimer » sur la confirmation");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) process.exit(1);
