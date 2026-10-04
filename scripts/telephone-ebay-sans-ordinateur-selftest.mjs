// Autotest — sur téléphone, eBay part sans ordinateur, et l'écran le dit (04/10, point 6)
//   npm run selftest:telephone-ebay-sans-ordinateur
//
// 145 inscrits en 7 jours : la moitié demande le lien de l'extension, 15 à
// 25 % l'installent. Sur téléphone, le seul geste possible tout de suite est
// eBay par la connexion officielle (OAuth) : l'accroche « extension » le dit,
// sans rien promettre d'autre.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const pitch = lire("src/components/ExtensionPitchScreen.jsx");
const bloc = pitch.slice(pitch.indexOf("SANS ORDINATEUR, TOUT DE SUITE : eBAY"), pitch.indexOf("{onContinue && ("));
ok(/ebaySansOrdinateur = null,/.test(pitch), "facultative : les six autres hôtes ne changent pas");
ok(/\{ebaySansOrdinateur && !onComputer && \(/.test(bloc), "sur téléphone seulement");
ok(/tu ne donnes aucun mot de passe à FillSell/.test(bloc), "connexion officielle, aucun identifiant demandé");
ok(/Vinted, Leboncoin et Beebs demandent l'extension sur un ordinateur\./.test(bloc) && !/attendront|Cloud|bientôt/i.test(bloc), "rien de promis pour les autres plateformes");
ok(/\{!ebaySansOrdinateur\.relie && \(/.test(bloc) && /garde seulement eBay/.test(bloc), "relié : garder eBay seul ; pas relié : le bouton");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/ebaySansOrdinateur=\{\{ relie: ebayVoieApiReelle, onRelier: \(\) => \{ setShowExtGate\(false\); setEbayPanneauOuvert\(true\); \} \}\}/.test(lps),
  "le stepper ouvre « Réglages › Compte eBay » par-dessus, brouillon gardé");
ok(/if \(extensionBlocked && !exemptionEbayApi\) \{\s*setShowExtGate\(true\);/.test(lps), "eBay seul et relié : la publication passe sans extension (exemption existante)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ sur téléphone, l'accroche dit qu'eBay part sans ordinateur");
