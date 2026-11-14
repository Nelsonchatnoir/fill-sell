// ═══════════════════════════════════════════════════════════════════════════
// FERMER N'EST PAS ABANDONNER (14/11/2026 soir, point A de Nico) — `npm run selftest:lecture-origine-gardee`
//   node --import ./scripts/loader-ext.mjs scripts/lecture-origine-gardee-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel (13e274de, fiche 1794681831450000, Android, lecteur « poste » = copie Cloud) : « Publier » 20:05:56.999,
// lecture_fond OK 20:06:02.392 (description lue), écran fermé 20:06:02.493, aucune publication. 30 jours : 60 fermetures,
// 33 lectures réussies autour, 31 sans publication. Ce test prouve :
//   1. la fermeture pendant une lecture en cours GARDE la publication ; sans lecteur, en saisie, après un échec ou une
//      conclusion, c'est un abandon (comme avant) ;
//   2. la reprise : stepper dès que la description est RÉELLEMENT en base (jamais sans), écran des choix si lue sans
//      texte, attente si un autre écran de publication est ouvert, fin bornée à 5 min (« non aboutie ») ;
//   3. le câblage (écran, Stock) ; 4. le cas normal inchangé (lecture tout de suite, puis toutes les 6 s).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, detail = "") => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${detail ? `  ← ${detail}` : ""}`); } };
const essai = (f) => { try { return f(); } catch (e) { return `exception : ${e.message}`; } };

const R = await import("../src/publication/attenteLectureRegles.js");
const fermeture = typeof R.issueFermeture === "function" ? R.issueFermeture : () => { throw new Error("issueFermeture absente"); };
const reprise = typeof R.decisionReprise === "function" ? R.decisionReprise : () => { throw new Error("decisionReprise absente"); };

console.log("1. Fermer : gardée ou abandon");
ok(essai(() => fermeture({ mode: "attente", sansLecteur: false, conclusion: null, etat: "envoyee" })) === "gardee",
  "13e274de, 20:06:02.493 : attente, lecteur « poste », demande envoyée → la publication est GARDÉE");
ok(essai(() => fermeture({ mode: "attente", sansLecteur: false, conclusion: null, etat: "prise" })) === "gardee", "lecture prise par le lecteur → gardée");
ok(essai(() => fermeture({ mode: "choix", sansLecteur: true })) === "abandon", "sans lecteur (les trois choix) → abandon, comme avant");
ok(essai(() => fermeture({ mode: "attente", sansLecteur: true })) === "abandon", "« Attendre mon ordinateur » sans lecteur → abandon");
ok(essai(() => fermeture({ mode: "ecrire" })) === "abandon", "pendant la saisie de la description → abandon");
ok(essai(() => fermeture({ mode: "attente", conclusion: "sans_texte" })) === "abandon", "annonce lue sans texte (conclusion) → abandon");
ok(essai(() => fermeture({ mode: "attente", etat: "echec" })) === "abandon", "après un échec de lecture → abandon (« Réessayer » décide)");

console.log("\n2. La reprise");
ok(essai(() => reprise({ attente: null, descriptionLue: true, ecouleMs: 0, occupe: false })) === "ouvrir",
  "13e274de : description déjà en base au premier tour (lue 100 ms avant la fermeture) → le stepper s'ouvre");
ok(essai(() => reprise({ attente: { manque: ["description"] }, descriptionLue: false, ecouleMs: 3_000 })) === "attendre", "pas encore lue → on attend");
ok(essai(() => reprise({ attente: null, descriptionLue: false, ecouleMs: 9_000 })) === "attendre",
  "la règle ne retient plus mais AUCUNE description en base (lecture illisible) → on n'ouvre JAMAIS sans description");
ok(essai(() => reprise({ attente: null, descriptionLue: true, ecouleMs: 12_000, occupe: true })) === "attendre", "un stepper déjà ouvert → la reprise attend qu'il se ferme");
ok(essai(() => reprise({ attente: { manque: ["description"], conclusion: "sans_texte" }, ecouleMs: 20_000 })) === "conclue", "lue sans texte → l'écran revient avec ses choix");
ok(essai(() => reprise({ attente: { manque: ["description"] }, ecouleMs: 5 * 60_000 + 1 })) === "expiree", "rien au bout de 5 min → « non aboutie », jamais une attente sans fin");
ok(essai(() => reprise({ attente: null, descriptionLue: true, ecouleMs: 5 * 60_000 + 1, occupe: true })) === "expiree", "occupé au-delà de 5 min → fin dite, pas d'ouverture tardive");
ok(R.REPRISE_PUBLICATION_MAX_MS === 5 * 60_000 && R.RELECTURE_REPRISE_MS === 3_000, "bornes : 5 min, une relecture toutes les 3 s (relecture bornée)");

console.log("\n3. Le câblage");
const e = lire("src/publication/AttenteLectureOrigine.jsx");
const iG = e.indexOf('issueFermeture({ mode, sansLecteur, conclusion: attente?.conclusion ?? null, etat: etat.etat }) === "gardee"');
const iA = e.indexOf('motif: "lecture_origine_abandonnee"');
ok(iG > 0 && iA > iG && /mesurer\("gardee"\);\s*fini\.current = true;\s*onFermer\?\.\(\{ garder: true, item: dernierItem\.current \}\);\s*return;/.test(e),
  "écran : fermer pendant la lecture → trace « gardee » et onFermer({ garder }) AVANT tout signal d'abandon");
ok(iA > 0, "écran : le vrai abandon reste signalé (lecture_origine_abandonnee)");
const s = lire("src/tabs/StockTab.jsx");
ok(/if \(gardee\) setPublicationGardee\(\{ item: gardee, depuis: Date\.now\(\) \}\);/.test(s), "Stock : une fermeture gardée pose la publication gardée");
ok(/demarrerRelecture\(async \(\) => \{[\s\S]{0,200}attenteLectureOrigine\(supabase, user\.id, item\.id\)/.test(s) && /intervalleMs: RELECTURE_REPRISE_MS, maxMs: 30_000, immediat: true/.test(s),
  "Stock : relecture BORNÉE (jamais setInterval), premier tour immédiat");
ok(/if \(data && texteSuffisant\(data\.description\)\) \{ relu = \{ \.\.\.item, description: data\.description \}; descriptionLue = true; \}/.test(s),
  "Stock : la description relue en base avant d'ouvrir le stepper");
ok(/if \(d === 'ouvrir'\) \{[\s\S]{0,400}ouvrirStepperRef\.current\?\.\(relu\);/.test(s) && /setAttenteStepper\(\{ item, attente: a \}\);/.test(s) && /motif: 'lecture_origine_non_aboutie'/.test(s),
  "Stock : ouvrir le stepper / rouvrir l'écran / dire « non aboutie »");
ok(/occupeRepriseRef\.current = Boolean\(publishItem \|\| attenteStepper\);/.test(s), "Stock : « occupé » = un stepper ou un écran d'attente ouvert");
ok(/setPublicationGardee\(\(g\) => \(g && g\.item\?\.id === item\?\.id \? null : g\)\);/.test(s), "Stock : « Publier » de nouveau sur la fiche → la reprise automatique s'efface");

console.log("\n4. Le cas normal, inchangé");
const r = lire("src/publication/attenteLectureRegles.js");
ok(/RELECTURE_ATTENTE_MS = 6_000/.test(r) && /intervalleMs: sansLecteurAuDepart \? RELECTURE_SANS_LECTEUR_MS : RELECTURE_ATTENTE_MS/.test(e) && /if \(!a\) \{ await pret\(\); return true; \}/.test(e),
  "l'écran lit tout de suite, puis toutes les 6 s, et ouvre le stepper dès que c'est lu (rien de changé)");
ok(/motif: 'lecture_origine_en_attente'/.test(s) && /motif: 'lecture_origine_sans_lecteur'/.test(s), "les signaux « en attente » et « sans lecteur » au clic : inchangés");

console.log(`\n${verts}/${verts + rouges} vérifications`);
if (rouges) { console.log(`ÉCHEC : ${rouges}`); process.exit(1); }
