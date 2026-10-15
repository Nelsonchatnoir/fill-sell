// selftest:tete-de-file — seule la tâche que l'extension commencera en premier
// compte un « service sans démarrage » (15/10, P4 — Ciddjy, 68 dépôts Beebs mis
// de côté à tort ; migration 20261015020000).
//
//   npm run selftest:tete-de-file
//
//   1. ordreExtension (_shared/tete-de-file.js) rend EXACTEMENT l'ordre de
//      l'extension (code de background.js exécuté tel qu'écrit, 2 000 files
//      tirées au hasard) ;
//   2. la file de Ciddjy rejouée : 79 dépôts Beebs, l'extension en traite un à
//      la fois — aucune tâche n'atteint 12 services sans démarrer en attendant
//      son tour ; une tâche de tête qui ne démarre jamais, si ;
//   3. la migration ne compte que la tête (les autres repartent à 1), garde le
//      comportement d'avant sans p_tete, et get-pending-jobs passe p_tete.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const { ordreExtension, teteDeFile, DELETED_HANG_DEMOTE } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/tete-de-file.js')).href);
const { tacheAMettreDeCote } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/tache-sans-demarrage.js')).href);

let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `   ← ${d}` : ''}`); };

// 1. L'ordre de l'extension, exécuté tel qu'écrit dans background.js
{
  const bg = lire('chrome-extension/background.js');
  const i = bg.indexOf('const DELETED_HANG_DEMOTE = 3;');
  const j = bg.indexOf('.map(([j]) => j);', i);
  const code = bg.slice(i, j + '.map(([j]) => j);'.length);
  ok(i > 0 && j > i && DELETED_HANG_DEMOTE === 3, '1a. le tri de l\'extension est trouvé (DELETED_HANG_DEMOTE = 3 des deux côtés)');
  // eslint-disable-next-line no-new-func
  const trierExtension = new Function('jobs', `${code.replace(/^\s*jobs = jobs/m, 'return jobs')}`);
  let ecarts = 0;
  let graine = 7;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  for (let n = 0; n < 2000; n++) {
    const file = Array.from({ length: 1 + Math.floor(hasard() * 12) }, (_, k) => {
      const action = ['publish', 'delete', 'republish', 'republish'][Math.floor(hasard() * 4)];
      const pf = {};
      if (action === 'republish' && hasard() < 0.5) {
        pf.republish_step = 'deleted';
        if (hasard() < 0.4) pf.deleted_hang_count = Math.floor(hasard() * 5);
        if (hasard() < 0.8) pf.deleted_at = new Date(Date.UTC(2026, 9, 14, 8, Math.floor(hasard() * 50))).toISOString();
      }
      return { id: `j${n}-${k}`, action, platform_fields: pf };
    });
    const a = trierExtension([...file]).map((x) => x.id).join(',');
    const b = ordreExtension(file).map((x) => x.id).join(',');
    if (a !== b) ecarts++;
  }
  ok(ecarts === 0, '1b. 2 000 files au hasard : même ordre que l\'extension', `${ecarts} écarts`);
}

// 2. La file de Ciddjy rejouée (règle de la réservation en mémoire)
{
  const SERVI_MAX = 12;
  const deux_h = 2 * 3600_000;
  const simuler = (compterTout, teteBloquee) => {
    const t0 = Date.parse('2026-10-14T07:29:42Z');
    const file = Array.from({ length: 79 }, (_, k) => ({ id: `b${k}`, action: 'publish', platform: 'beebs', status: 'pending', platform_fields: {} }));
    const resa = new Map();
    let mises = 0, maintenant = t0;
    // Un passage toutes les 5 min (le service worker repart) ; l'extension
    // commence la tête et la finit avant le passage suivant — sauf si elle est bloquée.
    for (let poll = 0; poll < 96 && file.length; poll++, maintenant += 5 * 60_000) {
      const tete = teteDeFile(file);
      for (const j of file) {
        const r = resa.get(j.id);
        const compte = compterTout || j.id === tete;
        if (!r) resa.set(j.id, { servi_n: 1, premier_service: new Date(maintenant).toISOString() });
        else if (compte) r.servi_n++;
        else { r.servi_n = 1; r.premier_service = new Date(maintenant).toISOString(); }
      }
      for (const j of [...file]) {
        if (tacheAMettreDeCote(j, resa.get(j.id), maintenant) && maintenant - Date.parse(resa.get(j.id).premier_service) >= deux_h && resa.get(j.id).servi_n >= SERVI_MAX) {
          mises++; file.splice(file.indexOf(j), 1);
        }
      }
      const t = file.find((x) => x.id === teteDeFile(file));
      if (t && !(teteBloquee && t.id === 'b0')) file.splice(file.indexOf(t), 1); // la tête démarre et finit
    }
    return mises;
  };
  const avant = simuler(true, false);
  const apres = simuler(false, false);
  ok(avant > 0, `2a. AVANT : des tâches qui attendaient leur tour sont mises de côté (${avant} sur 79)`);
  ok(apres === 0, '2b. APRÈS : aucune tâche mise de côté en attendant son tour', String(apres));
  ok(simuler(false, true) === 1, '2c. une tête qui ne démarre JAMAIS est toujours mise de côté (cas du 03/10)');
}

// 3. Migration et appel
{
  const MIG = lire('supabase/migrations/20261015020000_reservation_tete_de_file.sql');
  ok(/v_compte := p_tete IS NULL OR v_id = p_tete;/.test(MIG), '3a. sans p_tete : comportement d\'avant (tout compte)');
  ok(/UPDATE jobs_reservations_extension SET servi_n=1, premier_service=now\(\) WHERE job_id=v_id;/.test(MIG)
    && /servi_n=CASE WHEN v_compte AND jobs_reservations_extension\.poste=EXCLUDED\.poste AND NOT jobs_reservations_extension\.commence/.test(MIG),
    '3b. derrière la tête, le compteur repart (1, maintenant)');
  ok(/REVOKE ALL ON FUNCTION public\.reserver_jobs_extension\(uuid, text, uuid\[\], uuid\) FROM PUBLIC, anon, authenticated;/.test(MIG)
    && /GRANT EXECUTE ON FUNCTION public\.reserver_jobs_extension\(uuid, text, uuid\[\], uuid\) TO service_role;/.test(MIG), '3c. mêmes droits qu\'avant (service seul)');
  const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
  ok(/p_jobs: servis\.map\(j => j\.id\),\s*\n\s*p_tete: teteDeFile\(servis\),/.test(GPJ), '3d. get-pending-jobs passe la tête de la file servie');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
