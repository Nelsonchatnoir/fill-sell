// `npm run selftest:depop-app` — DEPOP DANS L'APP : POUR LE SEUL COMPTE AUTORISÉ
// (09/10/2026). Exécute la logique pure de l'app (copie, champs du job,
// visibilité, vente, rayon choisi, lot) et lit le câblage d'App.jsx.
//
// Ce qu'il tient :
//   A. la copie Depop : pas de titre envoyé, description ≤ 1 000 caractères
//      coupée au mot, 5 hashtags au plus (les premiers restent) ;
//   B. les champs du job : rayon par IDENTIFIANTS (icône + genre), état jamais
//      embelli, beauté d'occasion = état VRAI (le connecteur refuse), genre
//      enfant, taille enfant de la colonne Depop, absence de marque, port ;
//   C. COMPTE NON AUTORISÉ = RIEN NE CHANGE : plateformesDuCompte sans
//      'depop' ouverte rend exactement les plateformes d'avant, la vente ne
//      propose pas Depop, le lot non plus ; App.jsx ne l'ouvre QUE sur la
//      réponse true de rpc depop_autorise (fail-closed) ;
//   D. COMPTE AUTORISÉ : Depop proposée, JAMAIS cochée d'office ; le rayon
//      choisi à la main part en identifiants ;
//   E. la liste des feuilles du choix à la main suit le relevé (générée).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const dit = (nom, c, detail) => { if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

const dp = await import("../src/utils/depopPublication.js");
const sf = await import("../src/utils/stockFiltres.js");
const vm = await import("../src/utils/venteModale.js");
const rp = await import("../src/utils/rayonPublication.js");
const lot = await import("../src/publication/lot/regles.js");
const res = await import("../src/utils/resolutionPublication.js");

// ── A. LA COPIE ──────────────────────────────────────────────────────────────
console.log("\nA. LA COPIE DEPOP : SANS TITRE, 1 000 CARACTÈRES, 5 HASHTAGS");
{
  const longue = ("Robe en lin, très peu portée, aucun défaut visible. ").repeat(30);
  const t = dp.texteDepop(longue);
  dit("1 000 caractères au plus", t.texte.length <= 1000, t.texte.length);
  dit("coupée au mot entier (jamais au milieu d'un mot)", /\S$/.test(t.texte) && longue.startsWith(t.texte) && /\s/.test(longue[t.texte.length] ?? " "));
  dit("la coupe est dite", t.notes.some((n) => n.champ === "description"));
  const h = dp.texteDepop("Jolie robe #lin #ete #robe #vintage #boheme #mode #été");
  dit("7 hashtags → les 5 premiers restent", dp.compterHashtagsDepop(h.texte) === 5 && h.texte.includes("#boheme") && !h.texte.includes("#mode"), h.texte);
  dit("un hashtag accentué compte (#été)", dp.compterHashtagsDepop("#été #lin") === 2);
  dit("5 hashtags : rien ne change", dp.texteDepop("a #b #c #d #e #f").texte === "a #b #c #d #e #f");
  const copie = dp.deriverCopieDepop({ title: "Robe lin", description: "Desc #a #b #c #d #e #f", price: 20, platform_fields: { etat: "Très bon état", taille: "M", marque: "Zara", couleur: "Bleu", matiere: "Lin" } }, { prixGeneral: 35 });
  dit("la copie : description conforme, prix général, champs gardés", copie.description === "Desc #a #b #c #d #e" && copie.price === 35 && copie.platform_fields.marque === "Zara" && copie.platform_fields.matiere === undefined, JSON.stringify(copie));
  dit("le titre ne sert qu'à nommer le job (aucun champ titre chez Depop)", copie.title === "Robe lin");
}

// ── B. LES CHAMPS DU JOB ─────────────────────────────────────────────────────
console.log("\nB. LES CHAMPS DU JOB, PAR IDENTIFIANT");
{
  const c = (icon, genre, pf) => dp.champsDepop({ icon, genre, pf });
  const tshirtF = c("👕", "Femme", { etat: "Très bon état", taille: "M", marque: "Zara", couleur: "Rouge et Blanc", depopPort: "4,90" });
  dit("👕 Femme → womenswear/tops/tshirts", tshirtF.champs.depopCategoryPath?.join("/") === "womenswear/tops/tshirts", JSON.stringify(tshirtF.champs.depopCategoryPath));
  dit("Très bon état → used_excellent", tshirtF.champs.depopEtat === "used_excellent");
  dit("couleurs : red + white", tshirtF.champs.depopCouleurs?.join() === "red,white");
  dit("taille adulte : la valeur de la fiche (le connecteur la traduit dans SA grille)", tshirtF.champs.depopTaille === "M");
  dit("port « 4,90 » → 4.9", tshirtF.champs.depopPort === 4.9);
  dit("rien ne manque", tshirtF.manques.length === 0, tshirtF.manques.join());
  const mixte = c("👕", "Mixte", { etat: "Bon état" });
  dit("Mixte : AUCUN rayon (Depop n'a pas de département unisexe) → question", !mixte.champs.depopCategoryPath && mixte.manques.includes("rayon"));
  const bebe = c("👕", "Bébé", { etat: "Bon état", taille: "6 mois" });
  dit("Bébé : Enfants, genre à DEMANDER (jamais « unisex » choisi à sa place)", bebe.champs.depopCategoryPath?.[0] === "kidswear" && !bebe.champs.depopGenre && bebe.manques.includes("genre_enfant"));
  dit("taille enfant : 6 mois → 3-6 months (colonne Depop)", bebe.champs.depopTaille === "3-6 months", bebe.champs.depopTaille);
  const fille = c("👕", "Fille", { etat: "Bon état", taille: "Prématuré" });
  dit("Fille → female", fille.champs.depopGenre === "female");
  dit("Prématuré : pas d'équivalent → la canonique part, le connecteur DEMANDE", fille.champs.depopTaille === "Prématuré");
  dit("Comme neuf → used_excellent (le palier « très bon », jamais au-dessus)", c("👕", "Femme", { etat: "Comme neuf" }).champs.depopEtat === "used_excellent");
  dit("état illisible → rien posé, question", !c("👕", "Femme", { etat: "" }).champs.depopEtat && c("👕", "Femme", { etat: "" }).manques.includes("etat"));
  dit("marque absente → « Sans marque » (« Other » chez Depop)", c("👕", "Femme", { marque: "" }).champs.depopMarque === "Sans marque" && c("👕", "Femme", { marque: "Sans marque / Générique" }).champs.depopMarque === "Sans marque");
  dit("vraie marque : telle quelle", c("👕", "Femme", { marque: " Nike " }).champs.depopMarque === "Nike");
  dit("port vide → question ; 100 € → question", c("👕", "Femme", {}).manques.includes("port") && c("👕", "Femme", { depopPort: "100" }).manques.includes("port"));
  dit("port 0 € (envoi offert) : posé", c("👕", "Femme", { depopPort: "0" }).champs.depopPort === 0);
  const hors = c("📱", "Femme", { etat: "Bon état" });
  dit("📱 (Depop n'a pas de rayon téléphonie) → aucun rayon inventé", !hors.champs.depopCategoryPath && hors.manques.includes("rayon"));
  dit("sansRayon('depop') sans chemin = vrai ; avec trois identifiants = faux",
    res.sansRayon("depop", {}) === true && res.sansRayon("depop", { depopCategoryPath: ["womenswear", "tops", "tshirts"] }) === false
    && res.sansRayon("depop", { depopCategoryPath: ["Femme", "Hauts"] }) === true);
  dit("Depop pose la question du rayon comme les autres", res.PLATEFORMES_RAYON_A_DEMANDER.includes("depop"));
}

// ── C. COMPTE NON AUTORISÉ : RIEN NE CHANGE ─────────────────────────────────
console.log("\nC. COMPTE NON AUTORISÉ (depop_autorise = false) : RIEN NE CHANGE");
{
  const avant = ["vinted", "leboncoin", "beebs", "ebay", "opla"];
  dit("plateformesDuCompte(['opla']) : exactement les plateformes d'avant", JSON.stringify(sf.plateformesDuCompte(["opla"])) === JSON.stringify(avant), JSON.stringify(sf.plateformesDuCompte(["opla"])));
  dit("plateformesDuCompte([]) (après la sortie d'Opla) : les quatre", JSON.stringify(sf.plateformesDuCompte([])) === JSON.stringify(["vinted", "leboncoin", "beebs", "ebay"]));
  dit("plateformesDeLArticle sans job Depop : aucune Depop", !sf.plateformesDeLArticle([{ platform: "vinted", status: "published", action: "publish" }], ["opla"]).includes("depop"));
  const v = vm.choixPlateformesVente({ enLigne: [] });
  dit("fenêtre de vente : Depop absente (défaut depopVisible = false)", !v.autres.includes("depop") && !v.principales.some((x) => x.code === "depop"));
  dit("lot : Depop absente des plateformes libres", !lot.plateformesLibres({ id: 1 }, [], sf.plateformesDuCompte(["opla"])).includes("depop"));
  const app = lire("src/App.jsx");
  dit("App.jsx : Depop fermée par défaut", /const \[depopOuverte,setDepopOuverte\]=useState\(false\);/.test(app));
  dit("App.jsx : ouverte SEULEMENT sur rpc depop_autorise === true (erreur → fermée)",
    app.includes(`supabase.rpc('depop_autorise',{p_user:uid})`) && app.includes(`setDepopOuverte(!error&&data===true)`) && app.includes(`()=>setDepopOuverte(false)`));
  dit("App.jsx : visible et ouverte seulement si depopOuverte",
    app.includes(`return depopOuverte?[...sansDepop,'depop']:sansDepop;`) && app.includes(`...(depopOuverte?['depop']:[])`));
  dit("App.jsx : plateformes_visibles seul n'ouvre jamais Depop", app.includes(`const sansDepop=base.filter(p=>p!=='depop');`));
  dit("App.jsx : la vente ne propose Depop qu'avec depopOuverte", app.includes(`depopVisible={depopOuverte}`));
  const reglages = lire("src/reglages/ReglagesPage.jsx");
  dit("Réglages : les plateformes viennent de plateformesDeReleve(plateformesOuvertes) (aucune liste recopiée)", reglages.includes("plateformesDeReleve(plateformesOuvertes, oplaRelie)"));
}

// ── D. COMPTE AUTORISÉ ───────────────────────────────────────────────────────
console.log("\nD. COMPTE AUTORISÉ : PROPOSÉE, JAMAIS COCHÉE D'OFFICE");
{
  dit("plateformesDuCompte(['opla','depop']) : Depop en dernier", JSON.stringify(sf.plateformesDuCompte(["opla", "depop"])) === JSON.stringify(["vinted", "leboncoin", "beebs", "ebay", "opla", "depop"]));
  dit("Depop n'est jamais cochée d'office", sf.PLATEFORMES_JAMAIS_PRECOCHEES.includes("depop"));
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  dit("le stepper l'exclut de la présélection", lps.includes("plateformesOuvertes.includes(p) && !PLATEFORMES_JAMAIS_PRECOCHEES.includes(p)"));
  dit("le stepper ne montre AUCUN champ titre pour Depop", lps.includes(`{p !== "depop" && <div style={{ marginBottom:10, paddingTop:12 }}>`));
  dit("generate-listing ne reçoit jamais Depop", lps.includes(`const sansDepop = platformsAvantDepop.filter(p => p !== "depop");`));
  dit("la copie Depop ne naît que pour qui VOIT Depop", lps.includes(`if (!plateformesVisibles.includes("depop")) return;`));
  dit("vente : Depop proposée avec depopVisible", vm.choixPlateformesVente({ enLigne: [], depopVisible: true }).autres.includes("depop"));
  dit("lot : Depop libre pour le compte autorisé", lot.plateformesLibres({ id: 1 }, [], sf.plateformesDuCompte(["depop"])).includes("depop"));
  const choix = { chemin: ["Femme", "Hauts", "T-shirts"], id: "womenswear/tops/tshirts" };
  const pf = rp.appliquerRayonChoisi({}, "depop", choix);
  dit("rayon choisi à la main : il part en IDENTIFIANTS", JSON.stringify(pf.depopCategoryPath) === JSON.stringify(["womenswear", "tops", "tshirts"]) && pf.depopCategoryId === "womenswear/tops/tshirts");
  dit("et s'affiche en libellés", JSON.stringify(pf.depopCategoryLibelles) === JSON.stringify(choix.chemin));
  dit("un identifiant illisible ne part pas", !rp.appliquerRayonChoisi({ depopCategoryPath: ["x", "y", "z"] }, "depop", { chemin: ["A"], id: "Femme > Hauts" }).depopCategoryPath);
  dit("les autres plateformes : le choix inchangé à l'octet (Vinted)", JSON.stringify(rp.appliquerRayonChoisi({ a: 1 }, "vinted", { chemin: ["A", "B"], id: null })) === JSON.stringify({ a: 1, categoryPath: ["A", "B"], categorie_source: "choix_humain", categorie_choisie: { chemin: ["A", "B"], id: null, le: null } }));
}

// ── E. LES FEUILLES DU CHOIX À LA MAIN ──────────────────────────────────────
console.log("\nE. LES FEUILLES DU CHOIX À LA MAIN SUIVENT LE RELEVÉ");
{
  let vert = true;
  try { execFileSync("node", [path.join(RACINE, "scripts/gen-depop-feuilles-app.mjs"), "--verifier"], { stdio: "pipe" }); } catch { vert = false; }
  dit("src/utils/arbres/depopFeuilles.js = arbre.json (régénéré à l'identique)", vert);
  const { FEUILLES } = await import("../src/utils/arbres/depopFeuilles.js");
  dit("322 feuilles proposées par le formulaire, toutes à 3 identifiants", FEUILLES.length === 322 && FEUILLES.every((f) => f.id.split("/").length === 3 && f.chemin.length === 3));
  dit("les libellés en double sont précisés (T-shirts (Shirts))", FEUILLES.some((f) => f.chemin[2] === "T-shirts (Shirts)"));
  const cpm = lire("src/utils/categorieParMot.js");
  dit("et JAMAIS dans la résolution automatique par le mot", /case "depop": return \[\];/.test(cpm));
}

if (ko) { console.error(`\n[selftest:depop-app] ÉCHEC — ${ko} contrôle(s).`); process.exit(1); }
console.log("\n[selftest:depop-app] OK — Depop n'existe dans l'app que pour le compte autorisé ; sa copie et ses champs suivent les règles de Depop.");
