#!/usr/bin/env node
// VERROU (19/11/2026 soir, décision de Nico : « plus jamais d'intervention humaine sur les IP ») — aucun mail « texte à coller
// au support » pour une IP défectueuse. Une IP suspecte / grillée hébergeur-proxy-pays ou refusée au contrôle d'entrée reste
// hors du pool (ni attribuée, ni comptée, ni rachetée pour la remplacer) et le journal la note UNE fois par défaut ; rien
// n'est demandé à Nico.
//   node scripts/ip-sans-intervention-humaine-selftest.mjs            → l'arbre de travail (doit être VERT)
//   node scripts/ip-sans-intervention-humaine-selftest.mjs --ref <c>  → les fichiers du commit <c> (avant : ROUGE)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const i = process.argv.indexOf('--ref');
const REF = i > 0 ? process.argv[i + 1] : null;
const lire = (p) => (REF ? execFileSync('git', ['show', `${REF}:${p}`], { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26 })
  : readFileSync(join(RACINE, p), 'utf8')).replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m, x = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${x ? ` — ${x}` : ''}`); } };
if (REF) console.log(`(--ref ${REF})`);

// Les modules purs, lus depuis l'arbre ou depuis le commit (copie temporaire : alertes-nico.js n'importe rien).
const dir = mkdtempSync(join(tmpdir(), 'ip-sans-humain-'));
let N = null;
try {
  writeFileSync(join(dir, 'alertes-nico.mjs'), lire('supabase/functions/_shared/alertes-nico.js'));
  N = await import(pathToFileURL(join(dir, 'alertes-nico.mjs')).href);
} catch (e) { ok(false, 'alertes-nico.js lisible', e.message); }
finally { rmSync(dir, { recursive: true, force: true }); }

console.log('1. Aucun mail « IP à remplacer » au catalogue des alertes de Nico');
ok(N && N.ALERTES?.['orchestrateur.ip_a_remplacer'] === undefined, 'pas d\'alerte orchestrateur.ip_a_remplacer');
ok(N && !Object.keys(N.CATEGORIES ?? {}).includes('ip_a_remplacer'), 'pas de catégorie « IP à faire remplacer »');

console.log('2. Aucun texte « à coller au support » dans les règles du pool');
const pool = lire('supabase/functions/_shared/cloud-pool.js');
ok(!/export function texteDemandeRemplacement/.test(pool), 'texteDemandeRemplacement n\'existe plus');
ok(!/Hello IPRoyal support/.test(pool), 'aucun message au support IPRoyal écrit par le code');
ok(/export function remplacementADemander/.test(pool), 'le constat « IP défectueuse » reste (remplacementADemander, pur)');

console.log('3. L\'orchestrateur note l\'IP défectueuse au journal, sans mail, une fois par défaut');
const ent = lire('serveur-cloud/src/entretien.js');
const corps = ent.slice(ent.indexOf('async function noterIpDefectueuse'), ent.indexOf('async function visitesCoupees'));
ok(corps.length > 50, 'noterIpDefectueuse existe');
ok(!/alertes\?*\.signaler/.test(corps) && !/texte_support|ip_a_remplacer/.test(ent), 'aucun signaler / texte support / ip_a_remplacer');
ok(/journal\.alerte\('ip_defectueuse'/.test(corps) && /defautsNotes\.has\(d\.cle\)/.test(corps), 'journal « ip_defectueuse », une fois par adresse et par défaut');
ok(/await noterIpDefectueuse\(\{ \.\.\.ip, sante: nouvelle \}\)/.test(ent)
  && /await noterIpDefectueuse\(\{ \.\.\.i, etat: 'quarantaine', quarantaine: q \}\)/.test(ent), 'la santé et le contrôle d\'entrée passent par ce seul chemin');

console.log('4. Nulle part ailleurs');
for (const p of ['serveur-cloud/src/approvisionnement.js', 'serveur-cloud/src/index.js', 'serveur-cloud/src/fournisseurIp.js', 'supabase/functions/_shared/alertes-nico.js']) {
  ok(!/ip_a_remplacer|texteDemandeRemplacement/.test(lire(p)), `${p} : aucun reste du chemin supprimé`);
}

console.log(ko ? `✗ ip-sans-intervention-humaine : ${ko} échec(s) sur ${n}` : `✓ ip-sans-intervention-humaine : ${n}/${n}`);
process.exit(ko ? 1 : 0);
