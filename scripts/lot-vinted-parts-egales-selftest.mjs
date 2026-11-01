// selftest:lot-vinted-parts-egales — UN LOT VINTED DÉCOUPÉ : CHAQUE ARTICLE A SA PART DU PRIX DU LOT, MÊME SANS PRIX DE
// BASE (01/11 ; migration 20261101100000, réparation scripts/reparations/20261101_lots_vinted_parts_egales.sql).
//
//   npm run selftest:lot-vinted-parts-egales            contrôles du dépôt (hors ligne)
//   npm run selftest:lot-vinted-parts-egales -- --prod  + la base, en LECTURE seule (après application)
//
//   A. la migration réécrit vinted_lot_parts DEPUIS la prod (garde md5) ; seul le cas « base manquante » s'ajoute ;
//      l'inverse rend la prod à l'octet ;
//   B. la règle : parts égales en centimes, reste au premier article, somme = reste du lot ; Vinted, prorata, saisie,
//      total inconnu inchangés ;
//   C. la réparation : 34 lots, 123 articles, prix des lignes « Lot » d'avant, contrôles avant écriture, CA vérifié,
//      sauvegardes, aucune vente créée ni supprimée, aucun mail ; l'inverse ;
//   D. l'essai à blanc embarque tout et s'annule.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261101100000_lot_vinted_parts_egales.sql');
const INV = lire('supabase/rollbacks/20261101100000_lot_vinted_parts_egales_INVERSE.sql');
const REP = lire('scripts/reparations/20261101_lots_vinted_parts_egales.sql');
const REP_INV = lire('scripts/reparations/20261101_lots_vinted_parts_egales_INVERSE.sql');
const ESSAI = lire('scripts/essais/20261101100000_essai.sql');

let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
const fonction = (txt, nom) => {
  const i = txt.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (i < 0) return '';
  const j = txt.indexOf('$function$', txt.indexOf('$function$', i) + 10);
  return j < 0 ? '' : txt.slice(i, j + 10) + '\n';
};
const MD5_PROD = 'a79190d317b946eff0bd82b9b43cb14d';

// ── A. Depuis la prod ────────────────────────────────────────────────────────
const prod = fonction(INV, 'vinted_lot_parts');
const neuf = fonction(MIG, 'vinted_lot_parts');
ok(md5(prod) === MD5_PROD, 'A1. l\'inverse rend vinted_lot_parts telle que relue en prod le 01/11 (md5 a79190d3…)');
ok(MIG.includes(`'${MD5_PROD}'`) && /raise exception 'définition de vinted_lot_parts changée en prod/.test(MIG), 'A2. garde md5');
const ajout = neuf.slice(neuf.indexOf('        ELSE\n          -- (01/11, Nico)'), neuf.indexOf("            v_src[v_k] := 'parts_egales';\n          END LOOP;\n") + "            v_src[v_k] := 'parts_egales';\n          END LOOP;\n".length);
ok(ajout.length > 100 && neuf.replace(ajout, '') === prod, 'A3. la migration = la prod + le seul bloc « base manquante » (ELSE du prorata)');

// ── B. La règle ──────────────────────────────────────────────────────────────
ok(/v_reste_c := round\(v_reste \* 100\);/.test(ajout) && /v_prix\[v_k\] := v_reste_c \/ cardinality\(v_restants\);/.test(ajout)
  && /v_alloue := \(v_reste_c \/ cardinality\(v_restants\)\) \* cardinality\(v_restants\);/.test(ajout)
  && /FOR v_k IN 1\.\.\(v_reste_c - v_alloue\) LOOP\n\s+v_prix\[v_restants\[v_k\]\] := v_prix\[v_restants\[v_k\]\] \+ 1;/.test(ajout),
  'B1. parts égales en centimes, un centime de plus aux premiers articles (ordre de la commande), somme = reste');
// Simulation de la règle : la somme retombe toujours sur le total, l'écart entre deux parts est d'un centime au plus.
let simuleOk = true;
for (const totalC of [1, 99, 600, 1000, 1280, 3150, 3500, 5000, 39790]) for (let n = 2; n <= 12; n++) {
  const base = Math.trunc(totalC / n), reste = totalC - base * n;
  const parts = Array.from({ length: n }, (_, i) => base + (i < reste ? 1 : 0));
  if (parts.reduce((a, b) => a + b, 0) !== totalC || Math.max(...parts) - Math.min(...parts) > 1 || parts[0] < parts[n - 1]) simuleOk = false;
}
ok(simuleOk, 'B2. simulation : somme = total, écart d\'un centime au plus, le premier article jamais en dessous');
ok(/IF NOT EXISTS \(SELECT 1 FROM unnest\(v_pv\) x WHERE x IS NULL OR x <= 0\) THEN/.test(neuf) && /v_src\[v_k\] := 'prorata';/.test(neuf)
  && /v_reste := NULL;\s+-- une saisie sans prix : le reste est inconnu/.test(neuf) && /v_total IS NOT NULL AND v_total > 0/.test(neuf),
  'B3. inchangés : montant Vinted, prorata, saisie sans prix (reste inconnu), total inconnu ou nul → NULL');

// ── C. La réparation ─────────────────────────────────────────────────────────
ok(/r\.lots <> 34 OR r\.l1 <> 27 OR r\.p1 <> 397\.90 OR r\.p2 <> 91\.30/.test(REP) && /<> 123/.test(REP),
  'C1. périmètre : 34 lots (27 the_closet72, 7 PILOU), 397,90 € et 91,30 €, 123 articles — sinon rien n\'est écrit');
ok(REP.includes("(u.metadata -> 'avant' ->> 'prix_vente')::numeric AS prix_lot") && REP.includes("u.feature = 'vente_lot_eclatee'"),
  'C2. le prix de chaque lot = celui de sa ligne « Lot » d\'avant le découpage (trace vente_lot_eclatee)');
ok(/ORDER BY c\.position, c\.item_id/.test(REP) && /round\(\(\(lot_c \/ n\) \+ CASE WHEN rang <= lot_c - \(lot_c \/ n\) \* n THEN 1 ELSE 0 END\) \/ 100\.0, 2\)/.test(REP),
  'C3. même découpage que la règle : parts égales, centime au premier article dans l\'ordre de la commande');
ok(/une ligne « Lot » existe encore/.test(REP) && /un article porte une autre vente/.test(REP) && /une somme de parts diffère du prix de son lot/.test(REP),
  'C4. avant écriture : plus de ligne « Lot », aucun article vendu deux fois, somme des parts = prix du lot');
ok(/r\.ca_apres <> r\.ca_avant \+ r\.lots OR r\.n_apres <> r\.n_avant/.test(REP), 'C5. après : CA = avant + prix des lots, nombre de ventes inchangé');
ok(!/\b(DELETE FROM|INSERT INTO)\s+(public\.)?(ventes|push_ventes|email_logs|usage_logs)\b/i.test(REP + REP_INV) && !/net\.http_post|envoyer_mail/i.test(REP + REP_INV)
  && /UPDATE ventes v SET prix_vente = p\.part/.test(REP), 'C6. seul le prix des ventes d\'article change : aucune vente créée ni supprimée, aucun mail');
ok(/_backup_0111_lots_parts_egales_ventes/.test(REP) && /_backup_0111_lots_parts_egales_compositions/.test(REP)
  && /DROP TABLE public\._backup_0111_lots_parts_egales_ventes;/.test(REP_INV) && /_gardees/.test(REP_INV),
  'C7. sauvegardes ; l\'inverse rend chaque prix (une saisie faite depuis est gardée) puis les retire');

// ── D. L'essai à blanc ───────────────────────────────────────────────────────
const sansTx = (t) => t.split('\n').filter((l) => !/^(BEGIN|COMMIT|begin|commit);$/.test(l)).join('\n');
ok(ESSAI.includes(sansTx(MIG)) && ESSAI.includes(sansTx(INV)) && ESSAI.includes(sansTx(REP)) && ESSAI.includes(sansTx(REP_INV)),
  'D1. l\'essai embarque la migration, la réparation et les deux inverses');
ok(/^begin;$/m.test(ESSAI) && ESSAI.trimEnd().endsWith('rollback;') && !/^commit;$/im.test(ESSAI), 'D2. une seule transaction annulée');

// ── --prod (LECTURE seule) ───────────────────────────────────────────────────
if (process.argv.includes('--prod')) {
  const sql = `select jsonb_build_object(
    'regle', md5(pg_get_functiondef('public.vinted_lot_parts(uuid,text)'::regprocedure)) = '${md5(neuf)}',
    'sauvegarde', (select count(*) from public._backup_0111_lots_parts_egales_ventes),
    'ca_closet', (select sum(prix_vente) from public.ventes where user_id = '8ac5bbda-0947-4612-82fd-effdaa3ca84a'),
    'ca_pilou', (select sum(prix_vente) from public.ventes where user_id = 'cae7a20d-56c8-46a6-868c-ae1f885faa70'),
    'lots_ok', (select count(*) from (select c.commande_ref from public._backup_0111_lots_parts_egales_compositions c
        join public.ventes v on v.id = c.vente_id group by c.user_id, c.commande_ref having sum(v.prix_vente) = max(c.total)) z)) as r;`;
  const fichier = path.join(os.tmpdir(), `lot-parts-egales-prod-${process.pid}.sql`);
  writeFileSync(fichier, sql, 'utf8');
  const res = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', `"${fichier}"`], { cwd: RACINE, encoding: 'utf8', shell: true });
  try { unlinkSync(fichier); } catch { /* fichier temporaire */ }
  const txt = String(res.stdout ?? '');
  let r = null;
  try { r = JSON.parse(txt.slice(txt.indexOf('{'))).rows?.[0]?.r; } catch { r = null; }
  ok(r && r.regle && r.sauvegarde === 123 && r.lots_ok === 34 && Number(r.ca_closet) >= 5824.69 && Number(r.ca_pilou) >= 16719.27,
    `PROD. règle en place, 34 lots retombés sur leur prix : ${JSON.stringify(r)}`);
}

console.log(echecs ? `\n✗ ${echecs} échec(s) sur ${total}` : `\n✓ ${total} vérifications vertes`);
process.exit(echecs ? 1 : 0);
