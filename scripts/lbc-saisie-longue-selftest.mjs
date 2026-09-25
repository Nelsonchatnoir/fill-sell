// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — UN TEXTE LONG NE PEUT PLUS FAIRE EXPIRER LE REMPLISSAGE (0.6.68)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : Les Petites Fioles, job fb358c75 (25/09) — description de
// 2 365 caractères, trois recréations mortes à l'étape « description » sur
// « Timeout: pas de réponse du content script ». Ce contrôle lit le code LIVRÉ
// (content-scripts/leboncoin.js) et vérifie :
//   1. la découpe par blocs ne coupe JAMAIS un caractère (emoji = 2 unités) et
//      recompose le texte exact, sur la description réelle du calendrier ;
//   2. un texte long ne retombe plus dans la frappe caractère par caractère :
//      pose unique, bornée, jamais par execCommand hors du champ qui a le focus ;
//   3. le diagnostic de la saisie part dans les warnings du job.
//
//   node scripts/lbc-saisie-longue-selftest.mjs

import { readFileSync } from "node:fs";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const src = readFileSync(new URL("../chrome-extension/content-scripts/leboncoin.js", import.meta.url), "utf8");
const fn = /function decouperSansCasserLesCaracteres\(str, max\) \{[\s\S]*?\n\}/.exec(src);
if (!fn) { console.log("✗ decouperSansCasserLesCaracteres introuvable"); process.exit(1); }
const decouper = new Function(`${fn[0]}; return decouperSansCasserLesCaracteres;`)();

console.log("1. La découpe ne coupe jamais un caractère");
{
  // Le début réel de la description du calendrier (emoji serrés) + remplissage
  // pour obtenir la longueur du cas réel.
  const reel = "🎄✨ Calendrier de l’Avent chaussettes à paillettes personnalisé ✨🎄\n\n" +
    "💖 Offrez un Noël magique ! 🎁 24 chaussettes à paillettes 🧦 à remplir 💌 → prénom brodé 📝 ☐ 🤍🤎🧡💛💚💙💜🖤🩷\n";
  const texte = (reel + "Chaussettes pailletées 😂😇😈😌😏 — € œ … ").repeat(30).slice(0, 2365);
  const blocs = decouper(texte, 40);
  const haut = /[\uD800-\uDBFF]$/, bas = /^[\uDC00-\uDFFF]/;
  ok(blocs.join("") === texte, "les blocs recomposent le texte exact");
  ok(blocs.every((b) => b.length <= 40), "aucun bloc au-delà de 40 unités");
  ok(!blocs.some((b) => haut.test(b)) && !blocs.some((b) => bas.test(b)), "aucune moitié d'emoji en bord de bloc");
  const aveugle = texte.match(/[\s\S]{1,40}/g);
  ok(aveugle.some((b) => haut.test(b)), "(témoin) l'ancienne découpe coupait bien des emoji sur ce texte");
}

console.log("2. Un texte long est posé en une fois, borné, dans le bon champ");
{
  const corps = /async function typeInto\(input, text\) \{[\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  ok(/const long = str\.length > HUMAN_TYPE_MAX_CHARS;/.test(corps), "texte long reconnu au seuil existant (120)");
  ok(/document\.activeElement !== input \|\| Date\.now\(\) - debut > TEXTE_LONG_BUDGET_MS/.test(corps), "frappe par blocs arrêtée si le focus part ou au-delà du budget");
  ok(/if \(long && \(!ok \|\| input\.value !== str\)\) \{[\s\S]*?return;\n  \}/.test(corps), "texte long : pose unique puis retour, jamais la frappe caractère par caractère");
  ok(/if \(document\.activeElement === input\) \{[\s\S]*?execCommand\("insertText", false, str\)[\s\S]*?if \(!pose\) setNativeValue\(input, str\);/.test(corps),
    "execCommand seulement si le focus est sur le champ, sinon setter natif sur l'élément");
  const budget = /const TEXTE_LONG_BUDGET_MS = ([\d_]+);/.exec(src);
  ok(budget && Number(budget[1].replace(/_/g, "")) <= 120_000, "budget de frappe par blocs ≤ 2 min (le remplissage entier en a 5)");
}

console.log("3. Le diagnostic part dans les warnings du job");
ok(/for \(const d of DIAGNOSTICS_SAISIE\.splice\(0\)\) warnings\.push\(`description — \$\{d\}`\);/.test(src), "DIAGNOSTICS_SAISIE versé dans les warnings à la description");

console.log("4. Une republication rejoue l'annonce d'origine, « Autre » compris");
ok(/REJOUE_ANNONCE_D_ORIGINE = fields\.republish_recreation === true \|\| fields\.republish_step != null;/.test(src), "drapeau posé à l'entrée du remplissage");
ok(/estValeurGenerique\(rawValue\) && !estValeurGenerique\(prefilled\) && !REJOUE_ANNONCE_D_ORIGINE\)/.test(src), "la règle du repli générique cède sur une republication");

console.log("5. La description est relue juste avant le dépôt, sans jamais bloquer");
{
  const i = src.indexOf("LA DESCRIPTION, RELUE JUSTE AVANT LE DÉPÔT");
  const j = src.indexOf("🚀 LIVE — Continuer final");
  ok(i > 0 && j > i, "relecture placée avant le Continuer final");
  const bloc = src.slice(i, j);
  ok(/typeInto\(zone, job\.description\)/.test(bloc) && !/return \{/.test(bloc), "reposée si elle a changé, jamais un échec");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
