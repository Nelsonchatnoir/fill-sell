// Verrou « deux fiches distinctes ne sont JAMAIS bloquées comme déjà publié » (20/11, point 2 de Nico — thecloset72000).
//
// Le 20/11 (07:44, 07:49, 07:53), la fiche 1795156645552 « Wrangler … #409C14 » (Très bon état) a été refusée sur ses
// 5 plateformes en already_published : une question « Est-ce le même article ? » (photo_identique, rapprochement_v3,
// 07:40 — 8 photos proches, titre à 0,27) la liait à 1795101900457 « Jean Wrangler Hero … #407C15 » (Bon état), en
// ligne. Deux articles différents ; le client a abandonné.
//
// Ce test échoue si :
//   1. une référence/SKU différente n'écarte plus la paire (texte.js referencesDifferentes → attributDistinctif
//      'reference'), ou si une référence commune, un hashtag (« #Y2K ») ou une seule référence l'écartent ;
//   2. le moteur réel (passe) pose encore la question — ou fusionne — deux fiches aux mêmes photos dont les
//      références diffèrent ; ou ne les juge plus quand la référence est la même ;
//   3. la migration 20261120120000 retourne encore un refus sur v_meme_objet, perd l'avertissement, ou sa garde md5 ;
//   4. l'inverse n'est plus la définition de prod (md5 5e5a9084…) ;
//   5. avec PGlite installé : le banc (base jetable) n'est pas vert.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { passe } from '../supabase/functions/_shared/rapprochement/passe.js';
import * as T from '../supabase/functions/_shared/rapprochement/texte.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const A = 'Wrangler Taille W42 L30 FR 42 Homme Jean Bleu Coupe Droite #409C14';
const B = 'Jean Wrangler Hero Vintage 90s Y2K Coupe Droite Bleu W42 L30 (FR 52) 100% Coton #407C15';

console.log('1. La référence du vendeur');
ok(T.attributDistinctif(A, B) === 'reference', 'compte 8ac5bbda : #409C14 / #407C15 → deux articles');
ok(T.attributDistinctif('Pull réf. 12345 bleu', 'Pull bleu ref 12345') !== 'reference', 'même référence (réf. / ref) : pas un écart');
ok(T.attributDistinctif('Sac SKU: AB-123', 'Sac sku ab123') !== 'reference', 'même SKU écrit autrement (tiret, casse) : pas un écart');
ok(T.attributDistinctif('Robe #Y2K vintage', 'Robe vintage #90s') !== 'reference', 'un hashtag (moins de 2 chiffres) n\'est pas une référence');
ok(T.attributDistinctif('Jean #409C14', 'Jean sans référence') !== 'reference', 'une seule des deux fiches porte une référence : on ne juge pas');
ok(T.attributDistinctif('Pull réf 501', 'Pull référence 505') === 'reference', 'réf 501 / référence 505 → deux articles');

console.log('2. Le moteur réel (passe) : mêmes photos, références différentes');
const bitsDe = (graine, flips = 0) => {
  let x = 0x9e3779b9 ^ graine; const out = [];
  for (let i = 0; i < 64; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out.push((x >>> 16) & 1); }
  for (let i = 0; i < flips; i++) out[(i * 7) % 64] ^= 1;
  return out.join('');
};
const E = new Map();
const photo = (nom, graine) => {
  const url = `https://cdn.test/${nom}.jpg`;
  E.set(url, { url, dhash: bitsDe(graine), phash: bitsDe(graine + 1000),
    variantes: Object.fromEntries(['c70', 'p85', 'g45', 'g60', 'g35'].map((k, i) => [k, [bitsDe(graine + 10 * (i + 1)), bitsDe(graine + 10 * (i + 1) + 1000)]])) });
  return url;
};
const P = (nom, g) => [photo(`${nom}1`, g), photo(`${nom}2`, g + 1), photo(`${nom}3`, g + 2)];
const main = (id, titre, photos) => ({ id: String(id), titre, prix: 20, statut: 'stock', origine: null, marque: null, taille: null,
  photos, a_verifier: false, a_verifier_auto: false, created_at: '2026-11-20T06:37:00Z', quantite: 1, vinted_item_id: null });
const vin = (id, titre, photos) => ({ id: String(id), titre, prix: 20, statut: 'stock', origine: 'vinted_sync', marque: null, taille: null,
  photos, a_verifier: false, a_verifier_auto: false, created_at: '2026-11-19T15:00:00Z', quantite: 1, vinted_item_id: String(900000 + Number(id)) });
const d = (fiches, o = {}) => ({ fiches, annonces: [], fusions: [], doublons: [], dette_beebs: false, import_ouvert: true, geste_recent: true,
  fiches_main_actif: true, fiches_main_a_juger: o.mainAJuger ?? [], vinted_a_juger: o.vintedAJuger ?? [] });
const regle = (ds) => ds.filter((x) => x.type === 'fusionner_fiche' || x.type === 'fiche_a_verifier');
{
  const H = main(1, A, P('wr', 300));
  const V = vin(2, B, P('wr', 300));
  const ds = passe(d([H, V], { mainAJuger: ['1'] }), E, { mode: 'normal', fichesMain: 'nouvelles' }).decisions;
  ok(regle(ds).length === 0, 'mêmes photos, #409C14 / #407C15 : ni fusion, ni question');
  const V2 = vin(3, B.replace('#407C15', '#409C14'), P('wr', 300));
  const ds2 = passe(d([H, V2], { mainAJuger: ['1'] }), E, { mode: 'normal', fichesMain: 'nouvelles' }).decisions;
  ok(regle(ds2).length === 1, 'mêmes photos, même référence : le moteur juge toujours la paire (fusion ou question)');
}

console.log('3. La migration');
const MIG = lire('supabase/migrations/20261120120000_fiches_distinctes_jamais_bloquees.sql');
const bloc = MIG.slice(MIG.indexOf('SELECT jsonb_object_agg(j->>\'platform\', x.m) INTO v_meme_objet'), MIG.indexOf('-- 20/11⟧'));
ok(bloc.length > 100 && !/RETURN/.test(bloc.replace(/--[^\n]*/g, '')) && !/IF v_meme_objet IS NOT NULL THEN\s*RETURN/.test(MIG),
  'v_meme_objet ne retourne plus aucun refus');
ok(/\) \|\| CASE WHEN v_meme_objet IS NOT NULL THEN jsonb_build_object\('avertissement_meme_objet', v_meme_objet\) ELSE '\{\}'::jsonb END;\nEND;/.test(MIG),
  'la question voyage en avertissement dans la réponse « allowed: true »');
ok(/IF v_conflicts IS NOT NULL THEN\s*RETURN jsonb_build_object\(\s*'allowed', false, 'reason', 'already_published'/.test(MIG)
  && /IF v_conflits_relie IS NOT NULL THEN/.test(MIG), 'les vrais refus restent (même fiche ; fiche jumelle d\'un compte relié)');
ok(/<> '5e5a9084a5c7e8c58259c054acc8bf85' THEN\s*RAISE EXCEPTION/.test(MIG), 'garde md5 de la définition de prod lue le 20/11');

console.log("4. L'inverse");
const INV = lire('supabase/rollbacks/20261120120000_fiches_distinctes_jamais_bloquees_INVERSE.sql');
ok(/IF v_meme_objet IS NOT NULL THEN\s*RETURN jsonb_build_object\(\s*'allowed', false, 'reason', 'already_published'/.test(INV), "l'inverse est la définition d'avant");

console.log('5. Le banc (base jetable)');
let pglite = true;
try { await import('@electric-sql/pglite'); } catch { pglite = false; }
if (!pglite) console.log('  · PGlite absent (npm i --no-save @electric-sql/pglite@0.3.16) : banc non joué');
else {
  const r = spawnSync(process.execPath, [path.join(racine, 'scripts/bancs/fiches-distinctes-2011/banc.mjs')], { encoding: 'utf8' });
  ok(r.status === 0, `banc vert${r.status === 0 ? '' : ' :\n' + (r.stdout || '') + (r.stderr || '')}`);
}

if (ko) { console.log(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log('\n✓ deux fiches distinctes ne sont jamais bloquées ; une référence différente = un article différent');
