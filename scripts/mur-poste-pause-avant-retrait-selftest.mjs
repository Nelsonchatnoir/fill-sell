// ═══════════════════════════════════════════════════════════════════════════
// LE MUR DU POSTE VOIT AUSSI LA « PAUSE AVANT TOUTE SUPPRESSION » (26/10 nuit, point 15)
// `npm run selftest:mur-poste-pause-avant-retrait`
// ═══════════════════════════════════════════════════════════════════════════
// Vincent A. (25/10, 0.6.144) : deux postes ; le second (sans session Vinted) prenait l'étape qui retire l'annonce et
// retombait 6 s après sur /member/register/select_type. L'extension (chemin A5, 0.6.134+) rapporte « Republication en
// pause avant toute suppression … accident de parcours (Connexion Vinted requise …) » : le motif est DANS la phrase,
// l'adresse dans reprise_avant_retrait / last_diagnostic — jamais dans work_window_state. update-job-status ne
// reconnaissait que « Connexion … requise » en TÊTE du message, ou l'adresse de fin : le mur du poste (Louis, 27/09)
// ne partait jamais. Vérifié : le motif et l'adresse du rapport A5 entrent dans la détection, rien d'autre ne change.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

const UJS = lire("supabase/functions/update-job-status/index.ts");
const m = UJS.match(/const SESSION_REQUISE_RE = (\/.+\/[a-z]*);/);
ok(Boolean(m), "SESSION_REQUISE_RE est lisible");
// eslint-disable-next-line no-eval
const SESSION_REQUISE_RE = m ? eval(m[1]) : /x^/;
const A5 = "Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Un accident de parcours sur ton ordinateur (Connexion Vinted requise : se connecter sur vinted.fr dans Chrome) : nouvel essai tout seul, rien à faire.";
ok(!SESSION_REQUISE_RE.test(A5), "le message A5 seul ne déclenche rien (le motif est dans la phrase) — c'était le trou");
ok(SESSION_REQUISE_RE.test("Connexion Vinted requise : se connecter sur vinted.fr dans Chrome"), "son motif (reprise_avant_retrait.motif), lui, est reconnu");
ok(!SESSION_REQUISE_RE.test("Timeout : le formulaire n'a pas été rendu"), "un autre accident (formulaire pas rendu) ne fait jamais un mur");

console.log("\nBranchement dans update-job-status");
ok(/const motifRepriseS = \/\^Republication en pause avant toute suppression\/i\.test\(brutVerdict\)\s*\? String\(repriseAvantRetrait\?\.motif \?\? ""\) : "";/.test(UJS),
  "le motif ne compte que pour un rapport A5 (« Republication en pause avant toute suppression »)");
ok(/\|\| SESSION_REQUISE_RE\.test\(motifRepriseS\)\);/.test(UJS), "… et entre dans « parLeTexte »");
ok(/const urlRepriseS = motifRepriseS\s*\? \(String\(repriseAvantRetrait\?\.url \?\? ""\)\.trim\(\) \|\| String\(\(\(pfBodyS\?\.last_diagnostic \?\? \{\}\) as Record<string, unknown>\)\.url \?\? ""\)\.trim\(\)\)/.test(UJS),
  "l'adresse : celle du rapport, puis celle du diagnostic");
ok(/const finBodyS = finBodyS0\?\.tab_url \? finBodyS0 : \(urlRepriseS \? \{ \.\.\.\(finBodyS0 \?\? \{\}\), tab_url: urlRepriseS \} : finBodyS0\);/.test(UJS),
  "une vraie adresse de fin passe toujours devant");
ok(/const SESSION_REQUISE_RE = \/\^\(\?:Connexion\|Reconnexion\)\\s\+\\S\+\\s\+requise\/i;/.test(UJS), "la règle du texte en tête est inchangée");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
