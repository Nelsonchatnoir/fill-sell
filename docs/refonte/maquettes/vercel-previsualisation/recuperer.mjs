// Build Vercel (prévisualisation des maquettes, 16/10/2026) : récupère les deux fichiers
// de docs/refonte/maquettes/ au commit épinglé du dépôt et refuse toute empreinte différente.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const COMMIT = '77277b0756b91c6f9f4adfa435768101c6bd8478';
const BASE = `https://raw.githubusercontent.com/Nelsonchatnoir/fill-sell/${COMMIT}/docs/refonte/maquettes/`;
const FICHIERS = {
  'index.html': 'd49a8fe3ea80bb5fc2d66efbb7bc174d4bbe5975',
  'maquettes.js': '65ff1244577152c7f9985403c815849a89bce3ed',
};
mkdirSync('dist', { recursive: true });
for (const [nom, attendu] of Object.entries(FICHIERS)) {
  const r = await fetch(BASE + nom);
  if (!r.ok) { console.error(`${nom} : HTTP ${r.status}`); process.exit(1); }
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha1').update(buf).digest('hex');
  if (sha !== attendu) { console.error(`${nom} : empreinte ${sha} differente de ${attendu}`); process.exit(1); }
  writeFileSync(`dist/${nom}`, buf);
  console.log(`${nom} : ${buf.length} octets, empreinte verifiee`);
}
