// ═══════════════════════════════════════════════════════════════════════════
// SELFTEST — LES CATÉGORIES QUE DEPOP INTERDIT (09/10/2026 soir)
// ═══════════════════════════════════════════════════════════════════════════
// npm run selftest:depop-interdits
//   1. la table : chaque interdit a sa règle et sa citation officielle ; aucune
//      catégorie de MODE n'y est ; toutes ses icônes existent dans l'app ;
//   2. l'app : la case Depop est « prohibited » (grisée) pour ces catégories,
//      jamais pour la mode, les appareils photo, les montres classiques ;
//   3. 🎮 : console et manette refusées, jeu (disque, cartouche) laissé passer
//      (texte de Depop muet — « à vérifier ») ;
//   4. de vrais titres, de bout en bout (detectObjectIcon → verdict) ;
//   5. le filet serveur (get-pending-jobs) et le lot (carte « exclus »).
import { readFileSync } from "node:fs";
import { DEPOP_INTERDITS_PAR_ICONE, DEPOP_REGLES, DEPOP_SOURCES, verdictDepopInterdit, messageDepopInterdit }
  from "../supabase/functions/_shared/depop-interdits.js";
import { getPlatformSupport, depopInterdit } from "../src/utils/platformCompat.js";
import { detectObjectIcon, ALL_OBJECT_ICONS } from "../src/utils/shared.js";
import { _internes } from "../src/utils/depopCategories.js";

let ok = 0; let ko = 0;
const dit = (nom, cond) => { if (cond) ok++; else { ko++; console.log(`✗ ${nom}`); } };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── 1. La table ─────────────────────────────────────────────────────────────
const icones = Object.keys(DEPOP_INTERDITS_PAR_ICONE);
dit("au moins 30 catégories interdites", icones.length >= 30);
dit("chaque interdit a une règle connue et une citation", icones.every((i) => DEPOP_REGLES[DEPOP_INTERDITS_PAR_ICONE[i].regle] && DEPOP_INTERDITS_PAR_ICONE[i].citation.length > 5));
dit("chaque règle a sa source officielle (zendesk) et sa phrase fr/en", Object.values(DEPOP_REGLES).every((r) => /depophelp\.zendesk\.com/.test(DEPOP_SOURCES[r.source]?.url ?? "") && r.fr && r.en));
dit("toutes les icônes interdites existent dans l'app (ALL_OBJECT_ICONS)", icones.every((i) => ALL_OBJECT_ICONS.includes(i)));
// ⏱️ (montres connectées) vit dans la table MODE de Depop (rayon montres),
// mais Depop la NOMME interdite (« Smartwatches ») : seule exception, écrite.
const MODE = Object.keys(_internes.MODE).filter((i) => i !== "⏱️");
dit("AUCUNE catégorie de mode n'est interdite (hors montres connectées, nommées par Depop)", MODE.every((i) => !DEPOP_INTERDITS_PAR_ICONE[i]));
dit("⏱️ montres connectées : interdites, ⌚ montres classiques : autorisées", Boolean(verdictDepopInterdit("⏱️")) && !verdictDepopInterdit("⌚"));
for (const i of ["👗", "👕", "👖", "🧥", "👟", "👜", "⌚", "📷", "💍", "🕶️", "🧢", "🌸", "💄", "🧸", "📚", "💿", "🎸"]) {
  dit(`${i} n'est pas interdit`, !verdictDepopInterdit(i));
}

// ── 2. L'app : la case Depop ────────────────────────────────────────────────
dit("📱 : case Depop « prohibited »", getPlatformSupport("📱").depop === "prohibited");
dit("📱 : Vinted, Leboncoin, eBay inchangés", getPlatformSupport("📱").vinted !== "prohibited" && getPlatformSupport("📱").ebay !== "prohibited");
dit("💇 (sèche-cheveux) : prohibited", getPlatformSupport("💇").depop === "prohibited");
dit("👶 (poussette) : prohibited", getPlatformSupport("👶").depop === "prohibited");
dit("📷 (appareil photo, autorisé par Depop) : pas prohibited", getPlatformSupport("📷").depop !== "prohibited");
dit("⌚ (montre classique, autorisée) : pas prohibited", getPlatformSupport("⌚").depop !== "prohibited");
dit("👗 : pas prohibited", getPlatformSupport("👗").depop !== "prohibited");
dit("message électrique", messageDepopInterdit(verdictDepopInterdit("📱")) === "Depop n'accepte pas les objets électriques ou électroniques.");
dit("message puériculture", /puériculture/.test(messageDepopInterdit(verdictDepopInterdit("💺"))));

// ── 3. 🎮 ───────────────────────────────────────────────────────────────────
dit("🎮 console : interdite", Boolean(depopInterdit("🎮", { titre: "Console PS5 Slim 1 To", description: "" })));
dit("🎮 manette : interdite", Boolean(depopInterdit("🎮", { titre: "Manette DualSense PS5 blanche", description: "" })));
dit("🎮 jeu : laissé passer (à vérifier)", depopInterdit("🎮", { titre: "EA Sports FC 25 – PS5", description: "" }) === null);
dit("🎮 jeu : case Depop pas prohibited", getPlatformSupport("🎮", { titre: "Mario Kart 8 Deluxe Nintendo Switch", description: "" }).depop !== "prohibited");

// ── 4. De vrais titres, de bout en bout ─────────────────────────────────────
const refuse = (titre, description = "", type = null) => {
  const icone = detectObjectIcon(titre, description, type);
  return { icone, v: depopInterdit(icone, { titre, description }) };
};
for (const [titre, attendu] of [
  ["iPhone 13 128 Go bleu", true], ["Sèche-cheveux Dyson Supersonic", true], ["Apple Watch Series 8", true],
  ["Casque Sony WH-1000XM4", true], ["Aspirateur Dyson V11", true], ["Machine à café Nespresso", true],
  ["Poussette Babyzen Yoyo", true], ["Siège auto Cybex", true], ["Lampe de chevet vintage", true],
  ["Console Nintendo Switch OLED", true], ["Chargeur iPhone 20W", true], ["Liseuse Kindle Paperwhite", true],
  ["Robe Zara fleurie taille M", false], ["Jean Levi's 501", false], ["Montre Casio vintage", false],
  ["Appareil photo Canon AE-1", false], ["Pull Ralph Lauren", false], ["Baskets Nike Air Max", false],
  ["Sac Longchamp Pliage", false], ["Peluche Doudou lapin", false], ["Vinyle Pink Floyd", false],
]) {
  const r = refuse(titre);
  dit(`« ${titre} » (${r.icone}) → ${attendu ? "refusé" : "autorisé"}`, Boolean(r.v) === attendu);
}

// ── 5. Le filet serveur et le lot ───────────────────────────────────────────
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
dit("get-pending-jobs : filet sur publication ET republication Depop", /j\.platform === "depop" && \(j\.action === "publish" \|\| j\.action === "republish"\)/.test(gpj) && gpj.includes("verdictDepopInterdit(icone"));
dit("get-pending-jobs : même détection que l'écran (titre, description, type)", gpj.includes("detectObjectIcon(titre, description, art.type ?? null)"));
dit("get-pending-jobs : le filet passe AVANT la pose du port", gpj.indexOf("LES CATÉGORIES QUE DEPOP INTERDIT") < gpj.indexOf("LES FRAIS DE PORT PAR DÉFAUT"));
dit("get-pending-jobs : jamais d'écriture hors pending", /status: "needs_user",\s*error: `\$\{messageDepopInterdit\(verdict, "fr"\)\}[\s\S]{0,300}\.eq\("id", j\.id\)\.eq\("status", "pending"\)/.test(gpj));
const lot = lire("src/publication/lot/LotPublication.jsx");
dit("lot : les exclus de Depop sont comptés et dits avant l'envoi", lot.includes("<ExclusDepop en={en} exclus={exclusDepop} />") && lot.includes("?.depopInterdit"));
dit("moteur : m.depopInterdit tendu au lot", lire("src/components/ListingPreviewScreen.jsx").includes("depopInterdit: depopInterditArticle ?"));
dit("écran : la phrase de la règle sous la case grisée", lire("src/components/ListingPreviewScreen.jsx").includes('p === "depop" && support === "prohibited" && depopInterditArticle'));

console.log(`${ko ? "✗" : "✓"} depop-interdits : ${ok} vert(s), ${ko} rouge(s)`);
process.exit(ko ? 1 : 0);
