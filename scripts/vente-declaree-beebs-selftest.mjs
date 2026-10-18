// ── AUTOTEST : UNE VENTE DÉCLARÉE SUR UNE CARTE BEEBS EST RANGÉE « BEEBS » (18/10/2026) ──
// Décision de Nico (chantier « zéro friction », point B), pour tout le parc :
// « une vente déclarée sur une carte Beebs est rangée vendu Beebs, jamais
// Ailleurs ». Migration 20261018150000 (réécrite depuis la définition de PROD,
// md5 cf93c3b6…) : UNE ligne change dans enregistrer_vente_atomique — v_pf.
// Ce fichier vérifie : la seule différence avec le corps d'avant est cette
// ligne ; v_proof (même cession, revue en ligne) est intact ; les autres
// plateformes sans preuve restent « ailleurs » ; l'inverse est complet ;
// l'essai à blanc embarque la migration et l'inverse octet pour octet.
//   node scripts/vente-declaree-beebs-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(R, p), "utf8");
let echecs = 0;
const ok = (t, c, d = "") => { if (c) console.log(`  ✓ ${t}`); else { echecs++; console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); } };
const MIG = lire("supabase/migrations/20261018150000_vente_declaree_beebs_rangee_beebs.sql");
const INV = lire("supabase/rollbacks/20261018150000_vente_declaree_beebs_rangee_beebs_INVERSE.sql");
const corps = (s) => s.slice(s.indexOf("CREATE OR REPLACE FUNCTION"));

console.log("\n── VENTE DÉCLARÉE SUR UNE CARTE BEEBS ─────────────────────────");
const NOUVELLE = "v_pf:=CASE WHEN coalesce(v_proof,false) OR j.platform='beebs' THEN j.platform ELSE 'ailleurs' END;";
const ANCIENNE = "v_pf:=CASE WHEN coalesce(v_proof,false) THEN j.platform ELSE 'ailleurs' END;";
ok("la règle : un job Beebs sans preuve garde sa plateforme", MIG.split(NOUVELLE).length === 2);
ok("l'ancienne ligne n'existe plus dans la migration", !MIG.includes(ANCIENNE));
ok("l'inverse rend l'ancienne ligne", INV.includes(ANCIENNE) && !INV.includes("OR j.platform='beebs'"));
{
  // Seule différence : la ligne v_pf (et ses trois lignes de commentaire).
  const a = corps(INV).split(/\r?\n/);
  const b = corps(MIG).split(/\r?\n/).filter((l) => !/^\s*-- \(18\/10, zéro friction|^\s*-- Beebs ne donne jamais|^\s*-- Beebs dit où l'article/.test(l));
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter((x) => x !== null);
  ok("le corps est celui de prod, à cette ligne près", a.length === b.length && diff.length === 1 && a[diff[0]].includes(ANCIENNE), `${a.length}/${b.length}, ${diff.length} ligne(s)`);
}
ok("v_proof est intact (preuve = sale_signal sold, ou instantané Vinted vendu)", /v_proof/.test(MIG) && (MIG.match(/v_proof/g) ?? []).length === (INV.match(/v_proof/g) ?? []).length + 1);
ok("la même cession exige toujours une PREUVE (pas la plateforme)", /IF p_job IS NOT NULL AND coalesce\(v_proof,false\) AND \(i\.statut='vendu'/.test(MIG));
ok("la migration est datée et pointe son inverse", /20261018150000_vente_declaree_beebs_rangee_beebs_INVERSE\.sql/.test(MIG) && /md5 cf93c3b660dd64b6517b1573963ab95f/.test(MIG));
{
  const ESSAI = lire("scripts/essais/20261018150000_essai.sql");
  ok("l'essai à blanc embarque la migration et l'inverse, octet pour octet", ESSAI.includes(MIG) && ESSAI.includes(INV) && /ROLLBACK;\s*$/.test(ESSAI));
  ok("l'essai contrôle Beebs → beebs, Leboncoin et eBay → ailleurs, zéro mail", /C1 Beebs déclarée/.test(ESSAI) && /C2 /.test(ESSAI) && /C4 aucun mail/.test(ESSAI));
}
console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ vente déclarée Beebs — tout est vert");
process.exit(echecs ? 1 : 0);
