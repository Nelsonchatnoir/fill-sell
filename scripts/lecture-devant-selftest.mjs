// ═══════════════════════════════════════════════════════════════════════════
// LA PERSONNE QUI ATTEND PASSE DEVANT LE LOT (14/11, 13e274de — Cloud, téléphone seul) — `npm run selftest:lecture-devant`
//   node --import ./scripts/loader-ext.mjs scripts/lecture-devant-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Le 14/11 entre 02:47 et 04:17, 5 écrans « Récupération de ta description » fermés (lecture_origine_abandonnee, ou=poste :
// le poste, c'est la copie Cloud de l'extension). La lecture passait bien par le Cloud — mais derrière le LOT : son lot de
// 207 articles avait demandé la lecture de 54 fiches à 02:51, 76 à 03:30, 68 à 03:57 (lectures_origine_demandees), et le
// lecteur lit la demande la PLUS RÉCENTE d'abord, une page toutes les 8 à 20 s (anti-robot). Son « Publier » sur une fiche
// déjà demandée par le lot moins de 15 min avant ne rafraîchissait pas la demande (demander_lecture_origine ne la relance
// qu'après 15 min ou sur « Réessayer ») : 1794615789690013 cliquée à 02:59:47, demandée à 02:51:47 → lue à 03:05:00 ;
// 1794615789690003 cliquée à 04:04:46 (trois fois en 1 min) → lue à 04:13:39, 14 s après le clic qui, lui, a rafraîchi.
// Règle (pour tous les comptes) : un « Publier » — une personne devant l'écran — met SA demande en tête de file, sans
// relire plus de pages (une demande = une lecture) ; jamais quand un échec est en cours (son repos et « Réessayer »
// décident) ni sur une lecture close ou conclue ; Vinted seulement (ailleurs, « relancer » reposerait un relevé).
// Ce test prouve : 1. la règle pure (attenteLectureRegles.lecturePasseDevant) sur les cas réels et leurs voisins ;
// 2. l'ordre de la file (même tri que l'extension) : la fiche cliquée passe première ; 3. le câblage dans StockTab.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, detail = "") => {
  if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${detail ? `  ← ${detail}` : ""}`); }
};

const R = await import("../src/publication/attenteLectureRegles.js");
const passe = typeof R.lecturePasseDevant === "function" ? R.lecturePasseDevant : () => { throw new Error("lecturePasseDevant absente"); };
const essai = (f) => { try { return f(); } catch (e) { return `exception : ${e.message}`; } };
const T = (iso) => Date.parse(iso);

console.log("1. La règle pure — cas réels du 14/11 (13e274de) et voisins");
// La ligne telle que l'écran la lit (lectureOrigine.attenteLectureOrigine → demande), au clic.
const att = (demande, extra = {}) => ({ plateforme: "vinted", manque: ["description"], demande, ...extra });
ok(essai(() => passe(att({ demandee_le: "2026-11-14T01:51:47.207Z", prise_le: null, essai_le: null, motif: null, faite_le: null }), T("2026-11-14T01:59:47.290Z"))) === true,
  "1794615789690013 : demandée par le lot à 02:51:47, « Publier » à 02:59:47 → passe devant");
ok(essai(() => passe(att({ demandee_le: "2026-11-14T02:57:30.000Z", prise_le: null, essai_le: null, motif: null, faite_le: null }), T("2026-11-14T03:04:45.961Z"))) === true,
  "1794615789690003 : demandée par le lot vers 03:57, « Publier » à 04:04:46 → passe devant");
ok(essai(() => passe(att(null), T("2026-11-14T01:47:35.991Z"))) === false,
  "aucune demande encore (1794615789690011 à 02:47:36) : la nouvelle demande est déjà la plus récente");
ok(essai(() => passe(att({ demandee_le: "2026-11-14T01:47:36.237Z", faite_le: null }), T("2026-11-14T01:47:50.000Z"))) === false,
  "demande de moins de 30 s (un double appui) : rien à déplacer");
ok(essai(() => passe(att({ demandee_le: "2026-11-14T01:30:00.000Z", essai_le: "2026-11-14T01:31:00.000Z", motif: "onglet_indisponible", faite_le: null }), T("2026-11-14T01:40:00.000Z"))) === false,
  "un échec en cours : son repos et « Réessayer » décident, jamais un « Publier »");
ok(essai(() => passe(att({ demandee_le: "2026-11-14T01:30:00.000Z", essai_le: "2026-11-14T01:31:00.000Z", motif: null, prise_le: "2026-11-14T01:35:00.000Z", faite_le: null }), T("2026-11-14T01:40:00.000Z"))) === false,
  "un échec puis une reprise (essai_le posé) : rien ne bouge");
ok(essai(() => passe(att({ demandee_le: "2026-11-14T01:30:00.000Z", faite_le: "2026-11-14T01:31:00.000Z", motif: "ok" }), T("2026-11-14T01:40:00.000Z"))) === false,
  "lecture close : rien à relancer");
ok(essai(() => passe(att({ demandee_le: "2026-11-14T01:30:00.000Z", faite_le: "2026-11-14T01:31:00.000Z", motif: "introuvable" }, { conclusion: "introuvable" }), T("2026-11-14T01:40:00.000Z"))) === false,
  "lecture conclue (introuvable) : jamais relancée par un « Publier »");
ok(essai(() => passe({ plateforme: "leboncoin", manque: ["description"], demande: { demandee_le: "2026-11-14T01:30:00.000Z", faite_le: null } }, T("2026-11-14T01:40:00.000Z"))) === false,
  "Leboncoin : « relancer » reposerait un relevé — jamais");
ok(essai(() => passe(null)) === false && essai(() => passe(att({ demandee_le: "illisible" }), T("2026-11-14T01:40:00.000Z"))) === false,
  "rien de lisible : rien ne bouge");

console.log("\n2. La file du lecteur (même tri que l'extension : demande la plus récente d'abord)");
// chrome-extension/background.js, ordreLecturesOrigine : tri par `depuis` (= demandee_le) décroissant.
const ordre = (liste) => [...liste].sort((a, b) => Date.parse(b.depuis) - Date.parse(a.depuis));
const lot = Array.from({ length: 54 }, (_, i) => ({ inventaire_id: `lot-${i}`, depuis: new Date(T("2026-11-14T01:51:00.000Z") + i * 1000).toISOString() }));
const cliquee = { inventaire_id: "1794615789690013", depuis: "2026-11-14T01:51:47.207Z" };
const avant = ordre([...lot, cliquee]).findIndex((l) => l.inventaire_id === cliquee.inventaire_id);
ok(avant > 0, `avant : la fiche cliquée attend derrière ${avant} demandes plus récentes du lot (réel : demandée 02:51:47, cliquée 02:59:47, lue 03:05:00)`);
// Après : « Publier » relance (p_relancer) → demandee_le = now() → elle passe en tête (une seule lecture, la sienne).
const clic = T("2026-11-14T01:59:47.290Z");
const apres = essai(() => passe(att({ demandee_le: cliquee.depuis, faite_le: null }), clic)) === true
  ? ordre([...lot, { ...cliquee, depuis: new Date(clic).toISOString() }]).findIndex((l) => l.inventaire_id === cliquee.inventaire_id) : -1;
ok(apres === 0, "après : la fiche cliquée est la PREMIÈRE lue", `rang ${apres}`);

console.log("\n3. Le câblage — StockTab, aux deux chemins du clic « Publier »");
const st = lire("src/tabs/StockTab.jsx");
ok(/import\s*\{[^}]*lecturePasseDevant[^}]*\}\s*from\s*['"]\.\.\/publication\/attenteLectureRegles['"]/.test(st), "StockTab importe la règle (attenteLectureRegles.lecturePasseDevant)");
ok(/demanderLectureOrigine\(supabase, item\.id, \{ relancer: lecturePasseDevant\(attenteVite\) \}\)/.test(st), "chemin rapide (écran au clic) : la demande passe devant");
ok(/demanderLectureOrigine\(supabase, item\.id, \{ relancer: lecturePasseDevant\(attenteOrigine\) \}\)/.test(st), "chemin lent (après lecture d'ici) : la demande passe devant");
ok(!/demanderLectureOrigine\(supabase, item\.id\);/.test(st), "plus aucun « Publier » qui demande sans passer devant");
// Le lot garde sa demande simple (il demande en masse : jamais « devant » de lui-même).
const lotSrc = lire("src/publication/lot/LotPublication.jsx");
ok(/if \(attenteOrigine\) demanderLectureOrigine\(supabase, d\.item\?\.id \?\? suivant\);/.test(lotSrc), "le lot, lui, ne se met jamais devant (demande simple)");

console.log(`\n${rouges ? "✗" : "✓"} lecture-devant : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
