// Autotest — Opla : un prix au-dessus du plafond est arrêté avant l'envoi, et dit (04/10, Lebonzeze)
//   npm run selftest:opla-prix-plafond
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/opla-prix.js")).href);
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA RÈGLE");
ok(M.OPLA_PRIX_MAX === 1000, "plafond d'Opla : 1 000 €");
ok(M.prixOplaTropHaut({ platform: "opla", action: "publish", price: 1100 }), "sac de Lebonzeze à 1 100 € : arrêté");
ok(M.prixOplaTropHaut({ platform: "opla", action: "republish", price: "1000.01" }), "republication à 1 000,01 € : arrêtée");
ok(!M.prixOplaTropHaut({ platform: "opla", action: "publish", price: 1000 }), "1 000 € pile : accepté");
ok(!M.prixOplaTropHaut({ platform: "opla", action: "delete", price: 5000 }), "un retrait n'est jamais arrêté pour son prix");
ok(!M.prixOplaTropHaut({ platform: "vinted", action: "publish", price: 5000 }), "les autres plateformes ne sont pas concernées");
ok(!M.prixOplaTropHaut({ platform: "opla", action: "publish", price: null }), "prix inconnu : rien n'est conclu");

console.log("\n2. LE TEXTE");
const t = M.messagePrixOplaTropHaut(1100);
ok(/au-dessus de 1000 €/.test(t) && /celle-ci est à 1100 €/.test(t) && /rien n'a été envoyé/.test(t), "la cause, le prix, rien d'envoyé", t);
ok(/Baisse le prix de la fiche sous 1000 € puis relance, ou ne publie pas cet article sur Opla\./.test(t), "les deux issues");
ok(!/\bjobs?\b|price_too_high|HTTP/i.test(t), "aucun mot de développeur");

console.log("\n3. CÂBLAGE");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/const tropChers = out\.filter\(\(j\) => prixOplaTropHaut\(j\)\);/.test(gpj) && /error: messagePrixOplaTropHaut\(/.test(gpj), "get-pending-jobs : arrêt avant tout envoi, même texte");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/\.gt\("price", OPLA_PRIX_MAX\)/.test(hw) && /\.is\("platform_fields->garde_prix_opla", null\)/.test(hw) && /error: messagePrixOplaTropHaut\(j\.price\)/.test(hw),
  "handler-watch : les tâches déjà arrêtées reçoivent le vrai motif, une seule fois");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ un prix Opla trop haut est arrêté avant l'envoi et dit tel quel");
