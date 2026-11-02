// Lecture SEULE de photo_empreintes (toutes les lignes), par pages (keyset sur url),
// via `npx supabase db query --linked --read-only`. Une page = UNE ligne SQL (json_agg)
// pour ne jamais buter sur la coupe à 1 000 lignes de la CLI.
// Sortie : donnees/empreintes-A.ndjson, une ligne JSON par empreinte :
//   [url, dhashHex, phashHex, couleur, variantesHex(10)|null, largeur, hauteur, source, calculee_le]
// (hexa = même calcul que rapprochement_v3_empreinte_hexa, la forme que lit le moteur en prod)
// Usage : node lire-empreintes.mjs [taillePage]   (DEPUIS=<url> pour reprendre, MAXPAGES=n pour essayer)
import fs from 'node:fs';
import path from 'node:path';
import { requete, W } from './sql-lecture.mjs';

const PAGE = Number(process.argv[2] || 8000);
const sortie = path.join(W, 'donnees', 'empreintes-A.ndjson');

// même calcul que public.rapprochement_v3_empreinte_hexa (le rôle en lecture ne peut pas l'appeler) : 64 bits → 16 hexa
const hexa = (x) => "(CASE WHEN (" + x + ") IS NULL OR jsonb_typeof(" + x + ") = 'null' THEN NULL WHEN jsonb_typeof(" + x
  + ") = 'string' AND ((" + x + ") #>> '{}') ~ '^[01]{64}$' THEN to_jsonb(lpad(to_hex(((" + x
  + ") #>> '{}')::bit(64)::bigint), 16, '0')) ELSE jsonb_build_object('brut', " + x + ") END)";
const VAR = ['c70', 'p85', 'g45', 'g60', 'g35'];
const varExpr = "CASE WHEN jsonb_typeof(e.variantes) = 'object' THEN jsonb_build_array("
  + VAR.flatMap((k) => [0, 1].map((i) => hexa("e.variantes -> '" + k + "' -> " + i))).join(', ')
  + ") WHEN e.variantes IS NULL THEN NULL ELSE jsonb_build_object('brut', e.variantes) END";

let dernier = process.env.DEPUIS ?? '';
if (!process.env.DEPUIS) fs.writeFileSync(sortie, '');
let total = 0;
const t0 = Date.now();
for (;;) {
  const sql = "select json_agg(r order by u) j, max(u) m, count(*) n from (\n"
    + "  select e.url u, json_build_array(e.url, " + hexa('to_jsonb(e.dhash)') + ", " + hexa('to_jsonb(e.phash)') + ", e.couleur, "
    + varExpr + ", e.largeur, e.hauteur, e.source, e.calculee_le) r\n"
    + "    from public.photo_empreintes e where e.url > $k$" + dernier + "$k$ order by e.url limit " + PAGE + ") z;";
  const rows = requete(sql, '_page.sql');
  const r = rows[0];
  if (!r || !Number(r.n)) break;
  fs.appendFileSync(sortie, r.j.map((x) => JSON.stringify(x)).join('\n') + '\n');
  total += Number(r.n);
  dernier = r.m;
  console.log(total + ' lignes (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s) — dernière : ' + dernier.slice(0, 90));
  if (Number(r.n) < PAGE) break;
  if (process.env.MAXPAGES && total >= PAGE * Number(process.env.MAXPAGES)) break;
}
console.log('FIN', total);
