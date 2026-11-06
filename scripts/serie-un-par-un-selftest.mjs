// Selftest SÉRIE UN PAR UN (06/11 soir, décision de Nico — Louis, Amiral) — npm run selftest:serie-un-par-un
// Sur les règles RÉELLES (importées) : _shared/serie-un-par-un.js, et le branchement dans get-pending-jobs ; la règle A
// (remise retenue tant que l'annonce vendue est visible) est RETIRÉE et ne doit pas revenir.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { decisionSerie, serieDuJob, CLE_SERIE, RELEVE_APRES_MIN, versionAvant } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/serie-un-par-un.js')).href);
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');

let ko = 0;
const ok = (cond, nom, detail = '') => {
  if (!cond) ko++;
  console.log(`  ${cond ? 'ok  ' : 'KO  '} ${nom}${cond ? '' : `   ← ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

const DEBUT = '2026-11-06T20:00:00Z';
const T = (min) => Date.parse(DEBUT) + min * 60_000;
const iso = (min) => new Date(T(min)).toISOString();
const tache = (rang, status = 'pending', extra = {}) => ({
  id: `job-${rang}`, status, published_at: null, vu_en_ligne_le: null,
  platform_fields: { [CLE_SERIE]: { serie: 'louis', rang, intervalle_min: 60, le: DEBUT }, ...(extra.pf ?? {}) }, ...extra,
});

console.log('1. Le marqueur');
ok(serieDuJob(tache(3))?.rang === 3 && serieDuJob(tache(3))?.intervalle_min === 60, 'lu : série, rang, intervalle');
ok(serieDuJob({ platform_fields: {} }) === null && serieDuJob({ platform_fields: { [CLE_SERIE]: { serie: 'x', rang: 0 } } }) === null, 'absent ou rang invalide → hors série');
ok(decisionSerie({ platform_fields: {} }, []).servir === true, 'une tâche hors série part comme avant (aucune retenue)');

console.log('2. Un par un, chacun vu en ligne avant le suivant');
{
  const m = [tache(1), tache(2), tache(3)];
  ok(decisionSerie(m[0], m, { maintenant: T(1) }).servir, 'rang 1 : part');
  ok(!decisionSerie(m[1], m, { maintenant: T(1) }).servir, 'rang 2 : attend que le rang 1 soit parti');
  const p1 = [tache(1, 'published', { published_at: iso(5) }), tache(2), tache(3)];
  const d = decisionSerie(p1[1], p1, { maintenant: T(20) });
  ok(!d.servir && /pas_encore_vu_en_ligne/.test(d.motif) && !d.demanderReleve, 'rang 1 parti, pas encore vu : rang 2 attend, pas de relevé avant 45 min', d);
  const d2 = decisionSerie(p1[1], p1, { maintenant: T(5 + RELEVE_APRES_MIN) });
  ok(!d2.servir && d2.demanderReleve === true, `45 min après le dépôt, aucun relevé depuis : UN relevé demandé`, d2);
  ok(!decisionSerie(p1[1], p1, { maintenant: T(60), releveEnFile: true }).demanderReleve, 'un relevé déjà en file : rien de plus');
  const vu = [tache(1, 'published', { published_at: iso(5), vu_en_ligne_le: iso(25) }), tache(2), tache(3)];
  ok(!decisionSerie(vu[1], vu, { maintenant: T(30) }).servir && decisionSerie(vu[1], vu, { maintenant: T(30) }).motif === 'intervalle', 'vu en ligne (veille) mais moins de 60 min : attend l\'intervalle');
  ok(decisionSerie(vu[1], vu, { maintenant: T(66) }).servir, 'vu en ligne et 60 min passées : rang 2 part');
  ok(!decisionSerie(vu[2], vu, { maintenant: T(66) }).servir, 'rang 3 : attend le rang 2 (jamais deux à la fois)');
  const parReleve = [tache(1, 'published', { published_at: iso(5) }), tache(2)];
  ok(decisionSerie(parReleve[1], parReleve, { maintenant: T(70), vuesParReleve: new Set(['job-1']) }).servir, 'vu par un relevé commencé après le dépôt : compte comme vu');
  const vieux = [tache(1, 'published', { published_at: iso(5), vu_en_ligne_le: iso(1) }), tache(2)];
  ok(!decisionSerie(vieux[1], vieux, { maintenant: T(70) }).servir, 'une lecture de veille ANTÉRIEURE au dépôt ne prouve rien');
}

console.log('3. Arrêt au premier refus');
{
  const refus = [tache(1, 'published', { published_at: iso(5), vu_en_ligne_le: iso(25) }), tache(2, 'failed'), tache(3)];
  ok(!decisionSerie(refus[2], refus, { maintenant: T(300) }).servir && /serie_arretee/.test(decisionSerie(refus[2], refus, { maintenant: T(300) }).motif), 'une tâche « failed » : plus rien ne part');
  const q = [tache(1, 'needs_user'), tache(2)];
  ok(!decisionSerie(q[1], q, { maintenant: T(300) }).servir, 'une tâche « needs_user » : plus rien ne part');
  const b = [tache(1, 'pending', { pf: { depots_refuses_lbc: [{ at: iso(10), numero: '1' }] } }), tache(2)];
  ok(!decisionSerie(b[0], b, { maintenant: T(300) }).servir, 'un dépôt refusé noté APRÈS le début de la série (règle B) : arrêt, même pour elle');
  const avant = [tache(1, 'pending', { pf: { depots_refuses_lbc: [{ at: '2026-11-06T11:28:59Z', numero: '3303252818' }] } }), tache(2)];
  ok(decisionSerie(avant[0], avant, { maintenant: T(1) }).servir, 'les refus du matin (avant la série) ne l\'arrêtent pas');
  const annulee = [tache(1, 'cancelled'), tache(2)];
  ok(decisionSerie(annulee[1], annulee, { maintenant: T(1) }).servir, 'une tâche annulée sort de la série (ni refus, ni étape)');
}

console.log("3b. Une tâche de la série qui attend un correctif de l'extension (06/11 soir, Louis « SEB »)");
{
  const exige = (rang, extra = {}) => ({ ...tache(rang, extra.status ?? 'pending', extra), platform_fields: { [CLE_SERIE]: { serie: 'louis', rang, intervalle_min: 60, le: DEBUT, exige_version: '0.6.176' } } });
  ok(versionAvant('0.6.175', '0.6.176') && !versionAvant('0.6.176', '0.6.176') && !versionAvant('0.7.0', '0.6.176') && versionAvant('', '0.6.176'), 'versions comparées nombre par nombre ; illisible = avant');
  const m = [exige(1)];
  ok(!decisionSerie(m[0], m, { maintenant: T(1), version: '0.6.175' }).servir && /attend_extension/.test(decisionSerie(m[0], m, { maintenant: T(1), version: '0.6.175' }).motif), 'poste en 0.6.175 : la tâche attend la 0.6.176 (sans arrêter la série)');
  ok(decisionSerie(m[0], m, { maintenant: T(1), version: '0.6.176' }).servir, 'poste en 0.6.176 : elle part');
  ok(decisionSerie(tache(1), [tache(1)], { maintenant: T(1), version: '0.6.100' }).servir, 'sans exige_version : aucune retenue par version (abandonnée le 06/11)');
}

console.log('4. Branchement : get-pending-jobs, règle A retirée');
{
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/from "\.\.\/_shared\/serie-un-par-un\.js"/.test(g) && /decisionSerie\(/.test(g), 'get-pending-jobs décide par decisionSerie');
  ok(/serveur:verif_redepot/.test(g.slice(g.indexOf('decisionSerie('))), 'le relevé demandé est un relevé serveur de vérification (lecture seule)');
  ok(!/remise-en-vente-attente/.test(g) && !/remiseAAttendre|annonceVendueEncoreEnLigne/.test(g), 'règle A retirée : plus aucune retenue « annonce vendue encore en ligne »');
  ok(!existsSync(path.join(RACINE, 'supabase/functions/_shared/remise-en-vente-attente.js')), 'son module est retiré');
  ok(/depot-lbc-jamais-en-ligne/.test(lire('supabase/functions/handler-watch/index.ts')), 'règle B gardée (handler-watch juge toujours les dépôts jamais en ligne)');
  ok(g.slice(g.indexOf('decisionSerie(') - 4000, g.indexOf('decisionSerie(')).includes('.order("queued_at", { ascending: false, nullsFirst: false }).limit(40)'),
    'relevés lus du plus récent, les vieux relevés sans queued_at jamais en tête (06/11 : un relevé demandé à chaque passage)');
  ok(/version,\n\s*\}\) as \{ servir: boolean/.test(g), 'la version du poste est passée à la décision');
}

console.log(ko ? `\n${ko} KO` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
