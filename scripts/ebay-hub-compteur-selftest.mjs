// ═══════════════════════════════════════════════════════════════════════════
// Selftest « LE HUB VENDEUR N'A PAS RENDU SON COMPTEUR » (2026-09-23)
//   node scripts/ebay-hub-compteur-selftest.mjs
//
// Le relevé eBay lisait UN titre (« Gérer les annonces en cours(N) »), par une
// seule expression, pendant 5 s, jamais relu, sans second essai — et un échec
// clôturait le run en rouge, muet, jamais rejoué (cassoudesalle ×6, m0nc3f,
// pironneau, pereiramaia, Louis — tous avec des relevés réussis avant ou
// après, sur le même build).
//
// Ce test relit À LA SOURCE (chrome-extension/background.js) :
//   1. les expressions du compteur (COMPTEUR_EBAY_SRC) : titre FR, ligne
//      « Résultats », formes anglaises — rejouées sur des textes de page
//      RÉELS (Hub de Nico, 23/09) et sur ce qui ne doit PAS compter ;
//   2. le budget d'attente eBay (15 s) et la relecture après défilement ;
//   3. le rechargement unique d'une page muette ;
//   4. la reprise technique du run : le motif est dans la liste fermée et
//      lancerRelevePlateforme remet le run en file avant de le clore ;
//   5. côté app, la signature reconnue par etatReleve (arrêt technique nommé).
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").split("\r\n").join("\n");
const app = fs.readFileSync(join(ROOT, "src/annonces/etatReleve.js"), "utf8").split("\r\n").join("\n");
const carte = fs.readFileSync(join(ROOT, "src/annonces/CarteAnnoncesEnLigne.jsx"), "utf8").split("\r\n").join("\n");
let ko = 0;
const check = (nom, ok, extra = "") => { if (ok) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom} ${extra}`); } };

// ── 1. Les expressions du compteur, relues à la source ─────────────────────
const bloc = src.slice(src.indexOf("const COMPTEUR_EBAY_SRC = ["));
const COMPTEUR_EBAY_SRC = new Function(`${bloc.slice(0, bloc.indexOf("];") + 2)}; return COMPTEUR_EBAY_SRC;`)();
// Le MÊME parcours que la fonction injectée : première expression qui rend un entier.
const lire = (txt) => { for (const s of COMPTEUR_EBAY_SRC) { const m = txt.match(new RegExp(s, "i")); if (m) { const n = parseInt(m[1], 10); if (Number.isFinite(n)) return n; } } return null; };

console.log("\n1. Le compteur, sur des textes de page réels");
const HUB_NICO = "Hub vendeur\nnicsvob_0 (0)\nMessages (18)\nGérer les annonces en cours(6)\nCommentaires\nCréer une annonce\nNouveau : zéro frais, zéro effort\nRésultats: 1-6/6 | Total: 121,00 € | Qté: 6\nModifier";
check("titre « Gérer les annonces en cours(6) » → 6", lire(HUB_NICO) === 6, `→ ${lire(HUB_NICO)}`);
check("titre seul, avec espace « en cours (173) » → 173", lire("Gérer les annonces en cours (173)") === 173);
check("ligne « Résultats: 1-6/6 » seule (titre pas encore peint) → 6", lire("Résultats: 1-6/6 | Total: 121,00 €") === 6);
check("ligne « Résultats : 1-50 sur 173 » → 173", lire("Résultats : 1-50 sur 173") === 173);
check("anglais « Manage active listings (27) » → 27", lire("Manage active listings (27)") === 27);
check("anglais « Results: 1-50 of 173 » → 173", lire("Results: 1-50 of 173") === 173);
check("liste vide « Vous n'avez aucune annonce en cours. » → null (c'est la phrase de vide qui parle)", lire("Vous n'avez aucune annonce en cours.") === null);
check("page de connexion → null", lire("Connectez-vous à votre compte eBay\nAdresse e-mail ou pseudo\nMot de passe") === null);
check("« Qté: 6 » seul ne compte pas (ce n'est pas un nombre d'annonces)", lire("Total: 121,00 € | Qté: 6") === null);
check("la ligne « Résultats » ne prend pas la borne basse : « 1-50/173 » → 173, pas 50", lire("Résultats: 1-50/173") === 173);

// ── 2. Le budget et la relecture ───────────────────────────────────────────
console.log("\n2. Attente et relecture");
check("budget eBay 15 s (COMPTEUR_EBAY_ATTENTE_MS)", /const COMPTEUR_EBAY_ATTENTE_MS = 15_000;/.test(src));
check("budget Leboncoin inchangé à 5 s", /const COMPTEUR_LBC_ATTENTE_MS = 5_000;/.test(src));
check("le budget voyage dans executeScript (args)", /platform === "ebay" \? COMPTEUR_EBAY_ATTENTE_MS : COMPTEUR_LBC_ATTENTE_MS/.test(src));
check("le compteur est RELU après le défilement", /if \(totalEnLigne === null && plateforme === "ebay"\) totalEnLigne = lireTotal\(\);/.test(src));
check("un formulaire de connexion rendu sur place interrompt l'attente", /if \(formulaireConnexion\(\)\) break;/.test(src));

// ── 3. Le rechargement unique ──────────────────────────────────────────────
console.log("\n3. Une page muette se recharge une fois");
check("rechargement conditionné à : 0 annonce, pas de phrase de vide, pas de compteur",
  /platform === "ebay" && dernierTabId != null && annonces\.size === 0 && !pageDitVide && !Number\.isFinite\(ebayTotalEnCours\)/.test(src));
check("chrome.tabs.reload est appelé sur l'onglet du relevé", /await chrome\.tabs\.reload\(dernierTabId\);/.test(src));
check("le run dit « même après rechargement » et décrit la page ([page] …)",
  /même après rechargement/.test(src) && /function decrirePageHub/.test(src) && /\[page\] \$\{page\.etat/.test(src));

// ── 4. La reprise technique ────────────────────────────────────────────────
console.log("\n4. Un échec persistant repasse en file");
const blocTech = src.slice(src.indexOf("const SYNC_ERREUR_TECHNIQUE_RE = new RegExp(["));
const SYNC_ERREUR_TECHNIQUE_RE = new Function(`${blocTech.slice(0, blocTech.indexOf('].join("|"), "i");') + '].join("|"), "i");'.length)}; return SYNC_ERREUR_TECHNIQUE_RE;`)();
check("le motif du Hub est dans la liste fermée des pannes techniques",
  SYNC_ERREUR_TECHNIQUE_RE.test("[incomplet] le Hub vendeur n'a pas rendu son compteur « annonces en cours » — couverture inconnue"));
check("une cause utilisateur n'y est pas (page de connexion)", !SYNC_ERREUR_TECHNIQUE_RE.test("session ebay : page de connexion [mur:reauth]"));
check("lancerRelevePlateforme passe par remettreEnFileReprise AVANT de clore un run eBay muet",
  /async function remettreEnFileReprise\(/.test(src) && /HUB_EBAY_NON_RENDU_RE\.test\(String\(erreur \?\? ""\)\)/.test(src));
check("le compteur de tentatives est borné (RELEVE_REPRISE_TECHNIQUE_MAX = 2)", /const RELEVE_REPRISE_TECHNIQUE_MAX = 2;/.test(src));

// ── 5. L'app nomme l'arrêt technique ───────────────────────────────────────
console.log("\n5. Côté app : plus jamais muet");
const blocApp = app.slice(app.indexOf("const ARRET_TECHNIQUE_RE = "));
const ARRET_TECHNIQUE_RE = new Function(`${blocApp.slice(0, blocApp.indexOf(";") + 1)}; return ARRET_TECHNIQUE_RE;`)();
check("etatReleve reconnaît la signature du Hub muet", ARRET_TECHNIQUE_RE.test("[incomplet] le Hub vendeur n'a pas rendu son compteur « annonces en cours » — couverture inconnue"));
check("… et la reprise technique en cours", ARRET_TECHNIQUE_RE.test("[reprise-technique] tentative 1/2 au prochain passage — [hub] le Hub vendeur n'a pas rendu son compteur"));
check("… mais pas un mur de connexion", !ARRET_TECHNIQUE_RE.test("session ebay : page de connexion [mur:reauth]"));
check("la carte affiche signalTechnique pour cet échec", /signalTechnique\(/.test(carte) && /arretTechniqueReleve\(/.test(carte));

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
