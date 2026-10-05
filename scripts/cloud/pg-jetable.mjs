// Un Postgres 17 JETABLE (embedded-postgres), le temps d'une preuve : démarre
// sur le port 55432, lance le script donné avec PREUVE_PG, puis s'arrête et
// efface ses données. Jamais la prod.
//
//   npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3
//   node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-reservation-concurrente.mjs
//   node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-pool-concurrent.mjs
import EmbeddedPostgres from 'embedded-postgres';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = process.argv[2];
if (!script) { console.error('usage : node scripts/cloud/pg-jetable.mjs <script>'); process.exit(2); }
const dossier = mkdtempSync(path.join(tmpdir(), 'pg-preuve-'));
const pgsrv = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55432, persistent: false,
  onLog: () => {}, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
await pgsrv.initialise();
await pgsrv.start();
let code = 1;
try {
  code = spawnSync(process.execPath, [script], { stdio: 'inherit', env: { ...process.env, PREUVE_PG: 'postgres://postgres:preuve@127.0.0.1:55432/postgres' } }).status ?? 1;
} finally {
  await pgsrv.stop();
  rmSync(dossier, { recursive: true, force: true });
}
process.exit(code);
