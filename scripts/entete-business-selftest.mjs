// Autotest — l'en-tête ne montre JAMAIS les offres à un compte Business
// (03/10, point 18) — npm run selftest:entete-business
//
// Business est la formule du haut : il n'y a rien à lui proposer. Le compteur
// « N annonces restantes » de l'en-tête ouvrait pourtant la modale des offres
// (openUpgradeModal 'entete') — trois comptes Business en prod (louis,
// ornellaracano, recrutementgroupezk704), quota de 300 annonces, compteur
// toujours affiché.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(join(ROOT, "src/App.jsx"), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const i = app.indexOf('<div className={quotas?.annonces?.plafond!=null?"topbar topbar--solde":"topbar"}>');
const entete = app.slice(i, app.indexOf("</div>\n      </div>", i) + 20);
ok(i > 0 && entete.length > 500, "l'en-tête est trouvé");
ok(/onClick=\{isBusiness\?undefined:\(\)=>openUpgradeModal\(null,'entete'\)\}/.test(entete) && /disabled=\{isBusiness\}/.test(entete),
  "le compteur d'annonces n'ouvre plus les offres pour Business (il reste affiché : il informe)");
ok(/\{!isPremium&&!isBusiness&&!isNative\?\(\s+<PremiumBanner/.test(entete) && /\):!isPremium&&!isBusiness&&isNative\?\(/.test(entete),
  "« Voir les offres » (web et app) : jamais pour Business, même si ses autres drapeaux manquaient");
ok(/\):\(isPremium\|\|isBusiness\)\?\(/.test(entete) && /<PlanBadge isPremium=\{isPremium\} isPro=\{isPro\} isBusiness=\{isBusiness\}/.test(entete),
  "Business voit sa pastille de formule à la place");
const appels = entete.match(/openUpgradeModal\(/g) ?? [];
ok(appels.length === 3, "trois portes vers les offres dans l'en-tête, toutes gardées", String(appels.length));

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ en-tête : aucune offre montrée à un compte Business");
