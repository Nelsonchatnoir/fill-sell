// ═══════════════════════════════════════════════════════════════════════════
// REJEU DU MOTEUR COMMUN — AVANT / APRÈS LES CORRECTIFS DEPOP (09/10)
//   node scripts/moteur-depop-rejeu.mjs              compare <rev> (défaut HEAD) ↔ copie de travail
//   node scripts/moteur-depop-rejeu.mjs --ancien <rev>
// ═══════════════════════════════════════════════════════════════════════════
// Rejoue, sur les VALEURS RÉELLES de la prod (fixture
// scripts/fixtures/moteur-tailles-etats-prod-0910.json : valeurs distinctes,
// tailles et états seulement, aucune donnée personnelle), les deux modules
// partagés que les correctifs touchent :
//   · _shared/tailles.js — « EUR » lu comme « EU » (faiblesse n° 1) :
//       memeTaille sur TOUTES les paires de tailles réelles (fiches + jobs
//       des 120 derniers jours), et tailleDansGrille de chaque taille réelle
//       contre la grille formée des autres ;
//   · _shared/etat-plateformes.js — « Comme neuf » (faiblesse n° 2) :
//       tierEtat, etatAffirmeParLeTexte et etatPourPlateforme pour les cinq
//       plateformes, sur chaque état réel (fiches, jobs, relevés).
// Rend la liste EXACTE de ce qui change, et échoue si quelque chose change
// hors de ce que le correctif vise (un « EUR » pour les tailles, un
// « comme neuf » pour les états).
// ═══════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rev = args.includes("--ancien") ? args[args.indexOf("--ancien") + 1] : "HEAD";
const fixture = JSON.parse(readFileSync(join(ROOT, "scripts/fixtures/moteur-tailles-etats-prod-0910.json"), "utf8"));

async function charger(source) {
  const dir = mkdtempSync(join(tmpdir(), "moteur-depop-rejeu-"));
  const ecrire = (nom, contenu) => { const p = join(dir, nom); writeFileSync(p, contenu); return pathToFileURL(p).href; };
  const tailles = await import(ecrire("tailles.js", source("supabase/functions/_shared/tailles.js")));
  const etats = await import(ecrire("etat-plateformes.js", source("supabase/functions/_shared/etat-plateformes.js")));
  return { tailles, etats };
}
const lireGit = (chemin) => execFileSync("git", ["show", `${rev}:${chemin}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const lireDisque = (chemin) => readFileSync(join(ROOT, chemin), "utf8");

const avant = await charger(lireGit);
const apres = await charger(lireDisque);

let echecs = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) echecs += 1; };

// ── TAILLES ─────────────────────────────────────────────────────────────────
const tailles = [...new Set([...(fixture.tailles ?? []), ...(fixture.tailles_jobs ?? [])].map((s) => String(s).trim()).filter(Boolean))];
console.log(`\n[tailles] ${tailles.length} tailles réelles distinctes (fiches + jobs)`);
let paires = 0;
const diffPaires = [];
for (const a of tailles) for (const b of tailles) {
  paires += 1;
  const x = avant.tailles.memeTaille(a, b), y = apres.tailles.memeTaille(a, b);
  if (x !== y) diffPaires.push([a, b, x, y]);
}
const diffGrille = [];
for (const t of tailles) {
  const grille = tailles.filter((g) => g !== t);
  const x = avant.tailles.tailleDansGrille(t, grille)?.valeur ?? null;
  const y = apres.tailles.tailleDansGrille(t, grille)?.valeur ?? null;
  if (x !== y) diffGrille.push([t, x, y]);
}
console.log(`  memeTaille : ${paires} paires, ${diffPaires.length} différentes`);
console.log(`  tailleDansGrille : ${tailles.length} tailles contre la grille des autres, ${diffGrille.length} différentes`);
const eur = /(^|[^a-z])eur([^a-z]|$)/i;
ok(diffPaires.every(([a, b]) => eur.test(a) || eur.test(b)), "toute différence de paire porte un « EUR » (aucune autre)");
ok(diffGrille.every(([t, , y]) => eur.test(t) || eur.test(String(y ?? ""))), "toute différence de grille porte un « EUR » (aucune autre)");
ok(diffPaires.length === 0 && diffGrille.length === 0, "aucune taille réelle n'écrit « EUR » : sorties IDENTIQUES sur la prod");
// Ce que le correctif vise (grilles Depop) — contrôle du sens voulu :
const grilleDepop = ["EUR 36", "EUR 37", "EUR 38", "EUR 39", "EUR 40", "EUR 41", "EUR 42"];
ok(avant.tailles.tailleDansGrille("EU 38", grilleDepop) === null, "AVANT : « EU 38 » refusé sur la grille Depop (« EUR 38 »)");
ok(apres.tailles.tailleDansGrille("EU 38", grilleDepop)?.valeur === "EUR 38", "APRÈS : « EU 38 » → « EUR 38 »");
ok(apres.tailles.tailleDansGrille("38", grilleDepop)?.valeur === "EUR 38", "APRÈS : « 38 » nu → « EUR 38 » (dernier recours, la grille n'écrit que l'EU)");
ok(apres.tailles.tailleDansGrille("38,5", grilleDepop) === null, "APRÈS : « 38,5 » refusé (jamais arrondi)");
ok(apres.tailles.tailleDansGrille("FR 38", grilleDepop) === null, "APRÈS : « FR 38 » refusé (le pays se garde)");
ok(!apres.tailles.memeTaille("EUR 38", "38") && apres.tailles.memeTaille("EUR 38", "EU 38"), "APRÈS : « EUR 38 » ≡ « EU 38 », ≢ « 38 »");

// ── ÉTATS ───────────────────────────────────────────────────────────────────
const etats = [...new Set([...(fixture.etats ?? []), ...(fixture.etats_jobs ?? []), ...(fixture.etats_captures ?? [])].map((s) => String(s)).filter((s) => s.trim()))];
const PF = ["vinted", "leboncoin", "ebay", "beebs", "opla"];
console.log(`\n[états] ${etats.length} états réels distincts (fiches, jobs, relevés)`);
const diffs = [];
for (const v of etats) {
  const t0 = avant.etats.tierEtat(v), t1 = apres.etats.tierEtat(v);
  const a0 = avant.etats.etatAffirmeParLeTexte(v), a1 = apres.etats.etatAffirmeParLeTexte(v);
  const p0 = PF.map((p) => avant.etats.etatPourPlateforme(v, p)?.valeur ?? null);
  const p1 = PF.map((p) => apres.etats.etatPourPlateforme(v, p)?.valeur ?? null);
  if (t0 !== t1 || a0 !== a1 || JSON.stringify(p0) !== JSON.stringify(p1)) diffs.push({ v, t0, t1, a0, a1, p0, p1 });
}
for (const d of diffs) {
  console.log(`  ≠ « ${d.v.slice(0, 70)}${d.v.length > 70 ? "…" : ""} » : tierEtat ${d.t0} → ${d.t1} ; texte ${d.a0} → ${d.a1}`);
  PF.forEach((p, i) => { if (d.p0[i] !== d.p1[i]) console.log(`      ${p} : « ${d.p0[i]} » → « ${d.p1[i]} »`); });
}
const commeNeuf = /comme\s+neuf/i;
ok(diffs.every((d) => commeNeuf.test(d.v)), "toute différence d'état porte « comme neuf » (aucune autre)");
ok(diffs.every((d) => d.a0 === d.a1), "etatAffirmeParLeTexte : AUCUNE différence (le texte lisait déjà « très bon »)");
ok(diffs.every((d) => d.t1 === "tres_bon" && d.t0 === "neuf_sans"), "« comme neuf » : neuf sans étiquette → très bon état, partout (jamais embelli)");
ok(diffs.length >= 1, `les états « comme neuf » réels changent bien (${diffs.length})`);
// Les deux lectures disent désormais la même chose sur « Comme neuf » :
ok(apres.etats.tierEtat("Comme neuf") === apres.etats.etatAffirmeParLeTexte("comme neuf"), "« Comme neuf » : tierEtat ≡ etatAffirmeParLeTexte (une seule lecture)");

console.log(echecs ? `\n❌ ${echecs} contrôle(s) en échec` : "\n✅ rejeu du moteur commun : seules les entrées visées changent");
process.exit(echecs ? 1 : 0);
