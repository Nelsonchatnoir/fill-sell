// ═══════════════════════════════════════════════════════════════════════════
// VERROU — 21/11/2026, décision de Nico : la retouche photo IA est DÉCOCHÉE par défaut, partout
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant : depuis le 02/09 (2.6.0, d77c37b), l'écran de publication à l'unité s'ouvrait avec « Retouche IA » choisie
// pour tout compte Premium ou Pro (donc tout compte Cloud), et reprenait le choix gardé dans le brouillon de l'article :
// 45 publications retouchées en 3 jours chez 12 comptes (usage_logs / cross_post_jobs.photo_option), jamais en lot.
// Ce qu'il prouve, sur le code de l'écran exécuté tel quel (le même composant sur iPhone, Android et web) :
//   1. à l'ouverture : « original », quel que soit le palier (gratuit, Premium, Pro, Cloud) ;
//   2. un choix gardé d'une publication précédente (brouillon SANS rédaction faite) n'est jamais repris ;
//   3. seule reprise : la même publication dont la rédaction a déjà été faite avec la retouche (photos déjà retouchées) ;
//   4. la retouche ne se choisit que par un geste (le bouton « Retouche IA ») ; le lot part toujours « telles quelles ».
//   node scripts/retouche-decochee-2111-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => readFileSync(join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

const ecran = lire("src/components/ListingPreviewScreen.jsx");
const debut = ecran.indexOf("const [photoOption, setPhotoOption] = useState(() => {");
const corpsDebut = ecran.indexOf("{", ecran.indexOf("useState(() =>", debut)) + 1;
const corpsFin = ecran.indexOf("\n  });", corpsDebut);
const corps = debut > 0 && corpsFin > corpsDebut ? ecran.slice(corpsDebut, corpsFin) : "";
// eslint-disable-next-line no-new-func
const initial = new Function("draft", "isPremium", "isPro", "annoncesDuScan", "alreadyRetouched", corps);
const ouvre = (o = {}) => initial(o.draft ?? null, o.isPremium ?? false, o.isPro ?? false, o.annoncesDuScan ?? false, o.alreadyRetouched ?? false);

console.log("1. À l'ouverture : « Telles quelles », quel que soit le palier");
ok(corps.length > 0, "le code d'initialisation est lu dans l'écran");
ok(ouvre({}) === "original", "compte gratuit → original");
ok(ouvre({ isPremium: true }) === "original", "Premium → original (avant : Retouche IA)");
ok(ouvre({ isPro: true }) === "original", "Pro → original (avant : Retouche IA)");
ok(ouvre({ isPremium: true, isPro: true }) === "original", "Cloud (Premium + Pro) → original");
ok(!/isPremium \|\| isPro \? "ia_light"/.test(ecran), "plus aucun défaut « ia_light » selon le palier");

console.log("2. Jamais un choix d'une publication précédente");
ok(ouvre({ isPremium: true, draft: { photoOption: "ia_light" } }) === "original", "brouillon sans rédaction faite, retouche gardée → original");
ok(ouvre({ draft: { photoOption: "ia_advanced" } }) === "original", "ancien choix « avancée » → original");

console.log("3. La même publication reprise, rédaction déjà faite avec la retouche");
ok(ouvre({ draft: { photoOption: "ia_light", platformListings: { platforms: {} } } }) === "ia_light", "photos déjà retouchées : le choix fait pour CETTE publication reste");
ok(ouvre({ draft: { photoOption: "ia_advanced", platformListings: { platforms: {} } } }) === "ia_light", "« avancée » ramenée sur la retouche légère, comme avant");
ok(ouvre({ isPremium: true, draft: { photoOption: "original", platformListings: { platforms: {} } } }) === "original", "rédaction faite sans retouche → original");

console.log("4. La retouche ne se choisit que par un geste ; le lot part telles quelles");
const ouPublier = lire("src/publication/EcranOuPublier.jsx");
ok(/onClick=\{m\.retouchesEpuisees \? undefined : \(\) => m\.setPhotoOption\("ia_light"\)\}/.test(ouPublier), "« Retouche IA » : seulement au clic");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/if \(m\.photoOption !== "original" && typeof m\.setPhotoOption === "function"\)/.test(lot) && /m\.setPhotoOption\("original"\)/.test(lot), "le lot remet « original »");
const serveur = lire("supabase/functions/generate-listing/index.ts");
ok(/const photo_option = rawPhotoOption === "ia_advanced" \|\| rawPhotoOption === "ia_light" \? "ia_light" : "original";/.test(serveur), "le serveur : sans demande explicite, original");

console.log(`\n${verts} vertes, ${rouges} rouges — retouche IA décochée par défaut (21/11).`);
if (rouges) { console.log("ROUGE"); process.exit(1); }
