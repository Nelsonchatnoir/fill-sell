// ═══════════════════════════════════════════════════════════════════════════
// RETRAIT BEEBS D'UNE ANNONCE EN VÉRIFICATION = ATTENTE, PAS UN ESSAI (03/10)
// ═══════════════════════════════════════════════════════════════════════════
// Test réel chez Nico : « Le Meilleur des mondes » publié sur Beebs (34101135),
// retiré quatre minutes plus tard. L'annonce était « En cours de vérification »
// (page publique 404, aucun bouton « Supprimer l'annonce ») : l'extension a
// compté une tentative sur 5, et se serait arrêtée en ~25 min en disant de la
// retirer à la main — impossible pendant la vérification.
// La règle (update-job-status) : quand le dernier relevé Beebs voit l'annonce
// en vérification, ce refus devient une attente d'une heure, sans tentative
// consommée. Ce test garde le LIEN entre le texte de l'extension et la règle
// du serveur : si l'un change sans l'autre, la règle ne s'armerait plus.
import { readFileSync } from "node:fs";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const beebs = lire("chrome-extension/content-scripts/beebs.js");
const ujs = lire("supabase/functions/update-job-status/index.ts");

console.log("1. LE TEXTE DE L'EXTENSION");
const texte = beebs.match(/error: "(L'annonce est toujours dans « Mes annonces » mais sa page n'a pas montré le bouton de suppression[^"]*)"/)?.[1] ?? null;
ok(Boolean(texte), "beebs.js porte le refus « toujours dans Mes annonces, page sans bouton »");

console.log("2. LA RÈGLE DU SERVEUR LE RECONNAÎT");
const source = ujs.match(/const RETRAIT_VERIF_BEEBS_RE = \/(.+)\/i;/)?.[1] ?? null;
ok(Boolean(source), "update-job-status déclare RETRAIT_VERIF_BEEBS_RE");
const re = source ? new RegExp(source, "i") : null;
ok(Boolean(re && texte && re.test(texte)), "le texte de l'extension arme la règle", texte ?? "");
const rearme = texte ? `${texte}. Reprise automatique dans ~5 min (tentative 1/5).` : "";
ok(Boolean(re && re.test(rearme)), "y compris ré-armé (« Reprise automatique… tentative 1/5 »)");
const final = texte ? `${texte}. Plusieurs essais automatiques n'ont pas abouti : le retrait est arrêté.` : "";
ok(Boolean(re && re.test(final)), "y compris au dernier essai (« le retrait est arrêté »)");
ok(Boolean(re && !re.test("Page de l'annonce sans bouton « Supprimer l'annonce », et « Mes annonces » illisible en entier")),
  "jamais sur « Mes annonces » illisible (aucune preuve que l'annonce y est)");

console.log("3. LA PREUVE EST LE RELEVÉ, JAMAIS LE TEXTE SEUL");
const bloc = ujs.slice(ujs.indexOf("const RETRAIT_VERIF_BEEBS_RE"), ujs.indexOf("const RETRAIT_VERIF_BEEBS_RE") + 4000);
ok(/\.from\("annonces_plateforme"\)/.test(bloc) && /=== "en_verification"/.test(bloc), "seul le relevé « en_verification » du même numéro arme l'attente");
ok(/jrow\?\.action === "delete" && jrow\.platform === "beebs"/.test(bloc), "seulement un retrait Beebs");
ok(/needsUserAttempts: Number\(pfBase\.needsUserAttempts \?\? 0\) \|\| 0/.test(bloc), "aucune tentative consommée (compteur de la base)");
ok(/RETRAIT_VERIF_MIN \* 60_000/.test(bloc), "retenté toutes les heures (même délai que Vinted)");
ok(/Beebs vérifie encore cette annonce/.test(bloc), "le message dit la vraie cause");

if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
console.log("\nTout est vert.");
