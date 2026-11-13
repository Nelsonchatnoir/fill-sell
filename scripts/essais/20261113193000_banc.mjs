// LE BANC de la migration 20261113193000_bordereau_marquer_non_imprime (13/11/2026, lot NU — décision de Nico, I3 :
// « oui, ajoute « Marquer non imprimé » ») — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261113193000_banc.mjs
// Décor : celui du banc de 20261113153000 (bordereaux_copies telle qu'en prod le 13/11, RLS « lecture de ses lignes »,
// aucune politique d'écriture, auth.uid() comme Supabase, rôles anon / authenticated / service_role).
// Étapes : A. ORDRE — sans 20261113153000, la migration refuse et ne laisse rien ; B. 20261113153000 puis CETTE migration —
// retirer (propriétaire seul, copie effacée ignorée, aucune ligne inchangée réécrite), « Annuler » (la date revient à
// l'identique), remarquée après un retrait (rien n'est annulé, la trace reste), refus (sans session, anon, 61), RLS ;
// C. INVERSE — RPC et colonnes retirées, imprime_le et le marquage intacts ; D. rejouée — B de nouveau.
import { pathToFileURL } from 'node:url';
import { demarrer, commeClient, lire, MIGRATION as MIGRATION_IMPRIME } from './20261113153000_banc.mjs';

const MIGRATION = 'supabase/migrations/20261113193000_bordereau_marquer_non_imprime.sql';
const INVERSE = 'supabase/rollbacks/20261113193000_bordereau_marquer_non_imprime_INVERSE.sql';
const U1 = '447d920c-0000-4000-8000-000000000001';
const U2 = 'faf5021a-0000-4000-8000-000000000002';
const C1 = '0c962910-0000-4000-8000-0000000000c1'; // U1, la copie du 10/11
const C2 = '125a231f-0000-4000-8000-0000000000c2'; // U2
const C3 = 'd345bf74-0000-4000-8000-0000000000c3'; // U1, effacée
const C4 = '54838759-0000-4000-8000-0000000000c4'; // U1, jamais imprimée

const retirer = (c, uid, ids, role) => commeClient(c, uid, 'SELECT public.bordereau_marquer_non_imprime($1::uuid[]) r', [ids], role);
const retablir = (c, uid, ids) => commeClient(c, uid, 'SELECT public.bordereau_marquer_non_imprime($1::uuid[], true) r', [ids]);
const marquer = (c, uid, ids) => commeClient(c, uid, 'SELECT public.bordereau_marquer_imprime($1::uuid[]) r', [ids]);
const iso = (v) => (v == null ? null : (v.toISOString?.() ?? String(v)));
const etat = async (c) => {
  const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bordereaux_copies' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
  const plus = cols.includes('non_imprime_le') ? ', non_imprime_le, imprime_avant' : '';
  const im = cols.includes('imprime_le') ? ', imprime_le' : '';
  const lignes = (await c.query(`SELECT id::text, user_id::text, efface_le${im}${plus}, xmin::text x FROM public.bordereaux_copies ORDER BY id`)).rows;
  const fn = (await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'bordereau_marquer_non_imprime'`)).rows[0].n;
  return { cols, lignes, fn, l: (id) => lignes.find((x) => x.id === id) };
};
const defMarquage = async (c) => (await c.query(`SELECT pg_get_functiondef('public.bordereau_marquer_imprime(uuid[])'::regprocedure) d`)).rows[0].d;

async function tour(c, ok, p) {
  const e0 = await etat(c);
  ok(e0.fn === 1 && e0.cols.includes('non_imprime_le') && e0.cols.includes('imprime_avant'), `${p} : RPC et colonnes non_imprime_le, imprime_avant présentes`, e0.cols);
  ok(e0.lignes.every((x) => x.non_imprime_le === null && x.imprime_avant === null), `${p} : aucune ligne existante touchée (colonnes nulles partout)`);
  // Décor : C1 imprimée par U1, C2 par U2 ; C3 (effacée) porte une date posée avant son effacement.
  await marquer(c, U1, [C1]); await marquer(c, U2, [C2]);
  await c.query(`UPDATE public.bordereaux_copies SET imprime_le = '2026-11-11 09:00:00+00' WHERE id = $1`, [C3]);
  const e1 = await etat(c);
  const t1 = iso(e1.l(C1).imprime_le), x4 = e1.l(C4).x;
  ok(t1 && e1.l(C2).imprime_le && !e1.l(C4).imprime_le, `${p} : décor — C1 (U1) et C2 (U2) imprimées, C4 jamais`);

  const r1 = await retirer(c, U1, [C1, C2, C3, C4, null, C1]);
  const v1 = r1.ok ? r1.rows[0].r : null;
  const e2 = await etat(c);
  ok(r1.ok && v1.changees === 1 && v1.retablir === false && v1.copies.map((x) => x.id).sort().join() === [C1, C4].sort().join(),
    `${p} : U1 retire [sa copie imprimée, celle de U2, sa copie effacée, la jamais imprimée, null, doublon] → 1 changée, seules ses copies vivantes rendues`, r1);
  ok(e2.l(C1).imprime_le === null && iso(e2.l(C1).imprime_avant) === t1 && e2.l(C1).non_imprime_le, `${p} : C1 — « Imprimé le » vidé, la date gardée dans imprime_avant, l'heure du geste dans non_imprime_le`, e2.l(C1));
  ok(e2.l(C2).imprime_le && e2.l(C3).imprime_le && e2.l(C2).non_imprime_le === null && e2.l(C3).non_imprime_le === null, `${p} : la copie de U2 et la copie effacée : intactes`);
  ok(e2.l(C4).x === x4, `${p} : C4 (jamais imprimée) PAS réécrite (xmin identique)`);
  const x1 = e2.l(C1).x;
  const r2 = await retirer(c, U1, [C1]);
  ok(r2.ok && r2.rows[0].r.changees === 0 && (await etat(c)).l(C1).x === x1, `${p} : retirer deux fois — 0 changée, ligne PAS réécrite`, r2);

  const r3 = await retablir(c, U1, [C1]);
  const e3 = await etat(c);
  ok(r3.ok && r3.rows[0].r.changees === 1 && iso(e3.l(C1).imprime_le) === t1 && e3.l(C1).imprime_avant === null && e3.l(C1).non_imprime_le === null,
    `${p} : « Annuler » — la date revient À L'IDENTIQUE (${t1}), la trace est remise à nul`, { r3, l: e3.l(C1) });
  const x1b = e3.l(C1).x;
  const r4 = await retablir(c, U1, [C1, C4]);
  ok(r4.ok && r4.rows[0].r.changees === 0 && (await etat(c)).l(C1).x === x1b, `${p} : « Annuler » sans retrait à annuler — 0 changée, rien réécrit`, r4);

  await retirer(c, U1, [C1]);
  await new Promise((r) => setTimeout(r, 20));
  await marquer(c, U1, [C1]);
  const e4 = await etat(c);
  const t2 = iso(e4.l(C1).imprime_le);
  const r5 = await retablir(c, U1, [C1]);
  const e5 = await etat(c);
  ok(t2 && t2 !== t1 && r5.ok && r5.rows[0].r.changees === 0 && iso(e5.l(C1).imprime_le) === t2 && iso(e5.l(C1).imprime_avant) === t1 && e5.l(C1).non_imprime_le,
    `${p} : retirée puis REMARQUÉE (nouvelle impression) — « Annuler » ne touche rien, la nouvelle date reste, la trace (retirée le…, était imprimée le…) reste sur la ligne`, e5.l(C1));

  const r6 = await retirer(c, U2, [C1]);
  ok(r6.ok && r6.rows[0].r.changees === 0 && r6.rows[0].r.copies.length === 0 && (await etat(c)).l(C1).imprime_le, `${p} : U2 ne voit ni ne retire la copie de U1`, r6);
  const r7 = await retirer(c, null, [C1]);
  ok(!r7.ok && /session requise/.test(r7.erreur), `${p} : sans session → refus`, r7);
  const r8 = await retirer(c, U1, [C1], 'anon');
  ok(!r8.ok && /permission denied/.test(r8.erreur), `${p} : anon → refus (droit d'exécution)`, r8);
  const beaucoup = Array.from({ length: 61 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const r9 = await retirer(c, U1, beaucoup);
  ok(!r9.ok && /60 au plus/.test(r9.erreur), `${p} : 61 copies → refus`, r9);
  const r10 = await retirer(c, U1, []);
  ok(r10.ok && r10.rows[0].r.changees === 0, `${p} : liste vide → rien`, r10);
  const r11 = await commeClient(c, U1, `UPDATE public.bordereaux_copies SET imprime_le = NULL, imprime_avant = NULL WHERE id = $1`, [C1]);
  ok(r11.ok && r11.rowCount === 0 && (await etat(c)).l(C1).imprime_le, `${p} : écriture DIRECTE du client toujours fermée par la RLS (0 ligne)`, r11);
  const r12 = await commeClient(c, U1, `SELECT id::text, non_imprime_le, imprime_avant FROM public.bordereaux_copies ORDER BY id`);
  ok(r12.ok && r12.rows.length === 3 && r12.rows.every((x) => [C1, C3, C4].includes(x.id)), `${p} : U1 lit la trace de SES copies seulement (RLS de lecture inchangée)`, r12);
  const dr = (await c.query(`SELECT proacl::text a, prosecdef s FROM pg_proc WHERE proname = 'bordereau_marquer_non_imprime'`)).rows[0];
  ok(dr.s === true && /authenticated=X/.test(dr.a) && !/anon=X/.test(dr.a) && !/(^|[{,])=X/.test(dr.a), `${p} : SECURITY DEFINER ; EXECUTE à authenticated, jamais anon ni PUBLIC`, dr);
  // Remise du décor pour un tour suivant.
  await c.query(`UPDATE public.bordereaux_copies SET imprime_le = NULL, non_imprime_le = NULL, imprime_avant = NULL`);
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  const { c, arreter } = await demarrer(58000 + Math.floor(Math.random() * 2000));
  try {
    console.log('A. ORDRE — sans 20261113153000');
    let refus = null;
    try { await c.query(lire(MIGRATION)); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    const A = await etat(c);
    ok(/appliquer d'abord 20261113153000/.test(refus ?? '') && A.fn === 0 && !A.cols.includes('non_imprime_le') && !A.cols.includes('imprime_avant'),
      'A : la migration refuse (colonne imprime_le absente) et ne laisse rien', { refus, cols: A.cols, fn: A.fn });

    console.log('B. 20261113153000 PUIS CETTE MIGRATION');
    await c.query(lire(MIGRATION_IMPRIME));
    const defAvant = await defMarquage(c);
    await c.query(lire(MIGRATION));
    ok((await defMarquage(c)) === defAvant, 'B : bordereau_marquer_imprime INCHANGÉE (même définition)');
    await tour(c, ok, 'B');

    console.log('C. INVERSE');
    await marquer(c, U1, [C1]);
    const avantInverse = (await etat(c)).l(C1).imprime_le;
    await c.query(lire(INVERSE));
    const C = await etat(c);
    ok(C.fn === 0 && !C.cols.includes('non_imprime_le') && !C.cols.includes('imprime_avant') && C.cols.includes('imprime_le'), 'C : RPC et colonnes retirées, imprime_le gardée', C.cols);
    ok(iso(C.l(C1).imprime_le) === iso(avantInverse) && (await defMarquage(c)) === defAvant, 'C : les dates d\'impression et le marquage intacts');
    await c.query(`UPDATE public.bordereaux_copies SET imprime_le = NULL`);

    console.log('D. MIGRATION rejouée');
    await c.query(lire(MIGRATION));
    await tour(c, ok, 'D');
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
