// VERROU (13/11/2026, lot « zéro problème », point 5a de Nico) : L'ÉMOJI EN TÊTE DE TITRE, PAR PLATEFORME.
//
//     npm run selftest:titre-emoji-plateformes
//
// Compte de63ca45 : ses consignes de titre demandent « Commencer par un seul emoji adapté : 🎮 jeu… ». 52 republications
// Vinted en 12 jours avaient un titre de tâche en « 🎮 … » ; AUCUN titre en ligne sur Vinted ne l'a (Destiny : tâche
// « 🎮 Destiny La Collection PS4 » → en ligne « Destiny La Collection PS4 ») — l'extension retire tous les émojis du
// titre (background.js sanitizeJob → stripEmoji, 12/07, « plusieurs plateformes refusent ») ; eBay passe par l'API et le
// garde (7 annonces eBay en ligne avec 🎮 en tête depuis le 01/11).
// Décision de Nico (12/11) : « émoji en tête de titre : essai plus tard sur mon compte à 999 € ». La capacité existe
// dans la table PAR PLATEFORME (_shared/capacites-texte.js : titre.emojis, titre.emojisVerifie) et ce verrou FIGE le
// comportement d'aujourd'hui tant que l'essai réel n'a pas été fait : le jour de l'essai, la ligne de la plateforme passe
// à emojis: true, emojisVerifie: true, ce verrou est mis à jour, et l'extension lit la table (0.6.188 ou suivante).
// FILLSELL_RACINE=<dossier> : le code mis à l'épreuve est celui de ce dossier (mesure « rouge avant »).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = process.env.FILLSELL_RACINE ? path.resolve(process.env.FILLSELL_RACINE) : path.resolve(ICI, "..");
const imp = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch { return null; } };
const lire = (p) => { try { return fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n"); } catch { return ""; } };
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

const K = await imp("supabase/functions/_shared/capacites-texte.js");

console.log("1. La capacité existe, par plateforme (et par site)");
ok(K && typeof K.capacitesTexte === "function", "_shared/capacites-texte.js : capacitesTexte(plateforme, site)");
for (const p of ["vinted", "leboncoin", "beebs", "depop", "opla"]) {
  const t = K?.capacitesTexte?.(p)?.titre;
  ok(t && t.emojis === false && t.emojisVerifie === false, `${p} : pas d'émoji en titre — jamais essayé (comportement d'aujourd'hui figé)`, t);
}
{
  const t = K?.capacitesTexte?.("ebay")?.titre;
  ok(t && t.emojis === true && t.emojisVerifie === true, "ebay : l'émoji de tête part (API, vérifié en ligne)", t);
  ok(K && JSON.stringify(K.capacitesTexte("vinted", "it")) === JSON.stringify(K.capacitesTexte("vinted")), "un site sans ligne propre (Vinted Italie) = la ligne « * » de la plateforme");
}

console.log("2. Le comportement d'aujourd'hui, figé");
{
  const bg = lire("chrome-extension/background.js");
  const san = /function sanitizeJob\(job\) \{[\s\S]*?\n\}/.exec(bg)?.[0] ?? "";
  ok(/let title = stripEmoji\(titreVisible\);/.test(san), "extension : sanitizeJob retire les émojis du titre (Vinted, Leboncoin, Beebs, Depop, Opla)");
  ok(/\\p\{Extended_Pictographic\}/.test(/function stripEmoji\(text\) \{[\s\S]*?\n\}/.exec(bg)?.[0] ?? ""), "stripEmoji couvre tous les pictogrammes");
  const eb = lire("supabase/functions/_shared/ebay-publication.ts");
  const titreEbay = /export function titreEbay\(titre: string\): string \{[\s\S]*?\n\}/.exec(eb)?.[0] ?? "";
  ok(titreEbay && !/Pictographic|stripEmoji/.test(titreEbay), "eBay (API) : le titre garde son émoji");
  const red = lire("supabase/functions/_shared/redaction-plateformes.ts");
  ok(/import \{ capacitesTexte \} from "\.\/capacites-texte\.js";/.test(red), "la rédaction lit la même table (plafonds, hashtags)");
}

console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ""}`);
if (ko) process.exit(1);
