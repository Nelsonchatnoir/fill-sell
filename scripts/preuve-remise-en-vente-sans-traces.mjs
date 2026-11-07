// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261107193300_remise_en_vente_sans_traces_heritees (07/11 soir,
// rouges famille 3/4 — 7e7f0769) : la copie d'une remise en vente ne reprend plus les traces du cycle de l'annonce
// vendue (retrait, recréation, « dépôt parti vers le profil », canal coupé, réconciliation, numéro créé).
//   1. départ = les définitions de PROD du 07/11 soir (portées par l'inverse + le banc), md5 identiques à ceux lus en prod ;
//   2. la garde refuse une prod qui a changé, ou un second appelant ; la migration passe, deux fois de suite ;
//   3. chaque ligne de prod de remise_en_vente_champs est gardée, dans l'ordre (seule la ligne qui portait le « ; » final
//      change) ; remises_en_vente_tick et republication_sans_traces : md5 inchangés ;
//   4. ZÉRO RÉGRESSION sur les clés RÉELLES de la prod (PREUVE_ECHANTILLON : les ensembles de clés — clés seules, aucune
//      valeur — des jobs vendus des remises et des jobs vendus des 120 derniers jours, lus le 07/11 soir) : pour chaque
//      ensemble, sortie nouvelle = sortie d'avant MOINS les seules clés des familles visées ; aucune autre clé ne bouge ;
//      les valeurs passent telles quelles ; sans échantillon : le jeu synthétique seul ;
//   5. le cas 7e7f0769 (clés du job vendu f5cc2af6) : plus aucune trace, le contenu reste ; entrées dégénérées (NULL,
//      tableau, texte, objet vide) → '{}' comme avant ;
//   6. l'inverse rend la définition de prod (md5).
//
//   PREUVE_PG=embarque [PREUVE_ECHANTILLON=<fichier .json>] node scripts/preuve-remise-en-vente-sans-traces.mjs
//   (Postgres jetable sur le PC, port libre ≥ 55460)
//
// Jamais la prod. Aucun bouchon : remises_en_vente_tick est posée telle qu'en prod (plpgsql : son corps n'est pas résolu
// à la création), seulement pour la garde « un seul appelant » et le md5.
import pg from 'pg';
import net from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MD5_PROD = {
  remise_en_vente_champs: 'ed9916db204d2d867d7c9aa13fad6c0f',
  republication_sans_traces: '7b19179a18e09dd4e616fa7271e79f22',
  remises_en_vente_tick: '665ac9d366efaca0126d42db6ab400ba',
};

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
const portLibre = async (depuis) => {
  for (let p = depuis; p < depuis + 40; p++) {
    const libre = await new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(p, '127.0.0.1'); });
    if (libre) return p;
  }
  throw new Error('aucun port libre');
};
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const port = await portLibre(55460);
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-remise-sans-traces-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = `postgres://postgres:preuve@127.0.0.1:${port}/postgres`;
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../supabase/migrations/20261107193300_remise_en_vente_sans_traces_heritees.sql');
const INVERSE = lire('../supabase/rollbacks/20261107193300_remise_en_vente_sans_traces_heritees_INVERSE.sql');
// La définition de PROD de remises_en_vente_tick (07/11 soir) : celle que 20261107160000 a posée (relue en prod, md5 ci-dessus).
const MIG_160 = lire('../supabase/migrations/20261107160000_remise_apres_annulation_question.sql');
const debTick = MIG_160.indexOf('CREATE OR REPLACE FUNCTION public.remises_en_vente_tick(');
const TICK_PROD = MIG_160.slice(debTick, MIG_160.indexOf('$function$;', debTick) + '$function$;'.length);

const BANC = String.raw`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
-- Définition de PROD du 07/11 soir (pg_get_functiondef).
CREATE OR REPLACE FUNCTION public.republication_sans_traces(p_pf jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(p_pf) = 'object' THEN p_pf ELSE '{}'::jsonb END) e
   WHERE e.key !~ '^(republish_(suppression|retrait|reprise|etat)|republished_|suppression_|preuve_retrait|retrait|retenue_|deleted_|recreat|old_|new_listing|orphan_|delete_|deja_absente|beebs_404_|error_technique)'
$function$;
`;

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
let ok = 0, ko = 0;
const verifier = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg); } };
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const md5 = (s) => createHash('md5').update(s.replace(/\r/g, '')).digest('hex');
const NOMS = Object.keys(MD5_PROD);
const defs = async () => Object.fromEntries((await q(`SELECT p.proname, pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = ANY($1)`, [NOMS])).map((r) => [r.proname, r.d]));

// Les familles visées (la règle, écrite une fois pour la comparaison) : republication_sans_traces + les quatre ajoutées.
const VISEE = /^(republish_(suppression|retrait|reprise|etat)|republished_|suppression_|preuve_retrait|retrait|retenue_|deleted_|recreat|old_|new_listing|orphan_|delete_|deja_absente|beebs_404_|error_technique)|^(depot_parti|canal_coupe|reconciliation$|new_vinted_item_id$)/;

// Les clés EXACTES du job vendu f5cc2af6 (la republication vendue dont 7e7f0769 a hérité), lues en prod le 07/11 soir
// (depot_parti_vers_profil, deleted_at et new_vinted_item_id 10631712126 identiques sur les deux jobs).
const CLES_F5CC = ['canal_coupe_diag', 'capture_id', 'colis_bilan', 'deleted_at', 'deleted_at_client',
  'deleted_at_serveur', 'depot_parti_vers_profil', 'detected_price', 'gardes', 'horloge_client_ecart_s',
  'navigateur_poste', 'new_vinted_item_id', 'old_vinted_item_id', 'pepites_debitees', 'prix_recreation',
  'processing_since', 'reconciliation', 'recreated_at', 'recreation_envois', 'recreation_tentee',
  'remplissage_mesures', 'republish_copie_servie', 'republish_snapshot', 'republish_source', 'republish_step',
  'republish_taille_ids_retires', 'sale_evidence', 'sale_signal', 'suppression_verdict', 'unavailable_since',
  'vente_annulee', 'vente_annulee_remise', 'vente_operation_cle', 'vinted_account_id', 'vinted_account_proof',
  'vinted_item_id'];
const SYNTHETIQUE = [
  { cles: CLES_F5CC, n: 1 },
  { cles: ['adresse', 'etat', 'marque', 'taille', 'lbcCategoryPath', 'lbcAspects', 'photos_lbc', 'format_colis', 'deleted_at', 'old_listing_url', 'old_platform_listing_id', 'recreation_depot_parti', 'retenue_republication', 'retenue_levee_le'], n: 1 },
  { cles: ['canal_coupe', 'canal_coupe_rejoue', 'reconciliation_x', 'new_vinted_item_id_x', 'depot_partiel', 'old', 'oldies_', 'deleted', 'recreatif'], n: 1 },
  { cles: [], n: 1 },
];
let echantillon = SYNTHETIQUE, source = 'jeu synthétique seul';
const chemin = process.env.PREUVE_ECHANTILLON;
if (chemin && existsSync(chemin)) {
  const lu = JSON.parse(readFileSync(chemin, 'utf8'));
  if (Array.isArray(lu) && lu.length) { echantillon = [...lu, ...SYNTHETIQUE]; source = `${lu.length} ensembles de clés RÉELS (${lu.reduce((a, r) => a + Number(r.n || 0), 0)} jobs) + jeu synthétique`; }
}
// Une valeur par clé, distincte et typée (texte, nombre, objet, tableau, booléen, null) : la valeur doit passer intacte.
const valeur = (k, i) => [`v:${k}`, i, { k, i }, [k, i], i % 2 === 0, null][i % 6];
const objet = (cles) => Object.fromEntries(cles.map((k, i) => [k, valeur(k, i)]));

try {
  await client.query(BANC);
  console.log('1. Départ = les définitions de PROD du 07/11 soir');
  // (le corps du tick lit des tables absentes du banc : posé sans validation du corps, jamais exécuté ici)
  await client.query('SET check_function_bodies = off');
  await client.query(TICK_PROD);
  await client.query('RESET check_function_bodies');
  await client.query(INVERSE);
  const avant = await defs();
  verifier(NOMS.every((n) => md5(avant[n] ?? '') === MD5_PROD[n]), `md5 identiques à la prod (${NOMS.map((n) => `${n} ${md5(avant[n] ?? '').slice(0, 8)}`).join(', ')})`);

  console.log('2. La garde, puis la migration');
  await client.query(avant.remise_en_vente_champs.replace("SELECT COALESCE(jsonb_object_agg", "-- retouche faite en prod\n  SELECT COALESCE(jsonb_object_agg"));
  let refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/a changé en prod depuis le 07\/11 soir/.test(refus ?? ''), 'une prod qui a changé depuis la lecture : la migration refuse, rien n\'est appliqué');
  verifier(!/republication_sans_traces/.test((await defs()).remise_en_vente_champs), '… et la fonction n\'est pas réécrite');
  await client.query(avant.remise_en_vente_champs);
  await client.query(`CREATE FUNCTION public.autre_copie(p jsonb) RETURNS jsonb LANGUAGE sql AS $f$ SELECT remise_en_vente_champs(p) $f$`);
  refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/2 appelant\(s\)/.test(refus ?? ''), 'un SECOND appelant de remise_en_vente_champs : la migration refuse (la règle n\'est prouvée que pour le tick)');
  await client.query('DROP FUNCTION public.autre_copie(jsonb)');
  await client.query(MIGRATION);
  await client.query(MIGRATION); // rejouable (la garde reconnaît sa propre version)
  verifier(true, 'la migration s\'applique, deux fois de suite');
  const apres = await defs();
  const lignesProd = avant.remise_en_vente_champs.split('\n'), lignesNeuves = apres.remise_en_vente_champs.split('\n');
  let k = 0; const manquantes = [];
  for (const l of lignesProd) { const at = lignesNeuves.indexOf(l, k); if (at < 0) manquantes.push(l.trim()); else k = at + 1; }
  verifier(manquantes.length === 1 && /livraison_au_service\)'\);$/.test(manquantes[0]),
    `chaque ligne de prod de remise_en_vente_champs est gardée, dans l'ordre (seule change la ligne du « ; » final : ${manquantes.length})`);
  verifier(md5(apres.remises_en_vente_tick) === MD5_PROD.remises_en_vente_tick && md5(apres.republication_sans_traces) === MD5_PROD.republication_sans_traces,
    'remises_en_vente_tick et republication_sans_traces : md5 de prod inchangés (rien d\'autre ne bouge)');

  console.log(`3. Zéro régression : ${source}`);
  // Les deux versions côte à côte : l'ancienne (prod) sous un autre nom, la nouvelle en place.
  await client.query(avant.remise_en_vente_champs.replace('FUNCTION public.remise_en_vente_champs(', 'FUNCTION public.remise_en_vente_champs_prod('));
  let ensembles = 0, jobs = 0, ecarts = [], retireesVues = new Map(), valeursKo = 0;
  for (const e of echantillon) {
    const pf = objet(e.cles);
    const [{ a, b }] = await q('SELECT public.remise_en_vente_champs_prod($1::jsonb) a, public.remise_en_vente_champs($1::jsonb) b', [JSON.stringify(pf)]);
    const ka = Object.keys(a), kb = new Set(Object.keys(b));
    const retirees = ka.filter((x) => !kb.has(x));
    const ajoutees = [...kb].filter((x) => !(x in a));
    const attendues = ka.filter((x) => VISEE.test(x));
    if (ajoutees.length || retirees.length !== attendues.length || retirees.some((x) => !VISEE.test(x))) ecarts.push({ cles: e.cles.slice(0, 8), retirees, attendues, ajoutees });
    for (const x of kb) if (JSON.stringify(b[x]) !== JSON.stringify(a[x])) valeursKo++;
    for (const x of retirees) retireesVues.set(x, (retireesVues.get(x) ?? 0) + Number(e.n || 1));
    ensembles++; jobs += Number(e.n || 1);
  }
  verifier(ecarts.length === 0, `${ensembles} ensembles (${jobs} jobs) : sortie nouvelle = sortie d'avant moins les SEULES clés visées${ecarts.length ? ' — écarts : ' + JSON.stringify(ecarts.slice(0, 3)) : ''}`);
  verifier(valeursKo === 0, 'toute clé gardée garde sa valeur à l\'identique (texte, nombre, objet, tableau, booléen, null)');
  const top = [...retireesVues.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([x, n]) => `${x} ${n}`).join(' · ');
  console.log(`     clés retirées (jobs) : ${top}`);
  const gardees = ['vinted_account_id', 'marque', 'couleur', 'colors', 'vinted_ids', 'capture_id', 'colis_bilan', 'adresse', 'lbcCategoryPath',
    'lbcAspects', 'photos_lbc', 'format_colis', 'etat', 'taille', 'canal', 'reconciliation_x', 'new_vinted_item_id_x', 'depot_partiel', 'old', 'deleted', 'recreatif'];
  const familles = ['depot_partiel', 'recreatif'];
  const [{ g }] = await q('SELECT public.remise_en_vente_champs($1::jsonb) g', [JSON.stringify(objet(gardees))]);
  const manquent = gardees.filter((x) => !familles.includes(x) && !(x in g));
  verifier(manquent.length === 0,
    'le contenu passe : boutique, marque, couleur, identifiants Vinted, capture, colis, adresse, catégories et aspects Leboncoin, état, taille ; « old », « deleted », « reconciliation_x », « new_vinted_item_id_x » (préfixes ou noms exacts seulement)' + (manquent.length ? ' — manquent : ' + manquent.join(', ') : ''));
  verifier(familles.every((x) => !(x in g)), '« depot_parti* » est une famille (depot_partiel compris), comme « recreat* » (recreatif compris) l\'était déjà dans republication_sans_traces');

  console.log('4. Le cas 7e7f0769 (clés du job vendu f5cc2af6)');
  const [{ c7 }] = await q('SELECT public.remise_en_vente_champs($1::jsonb) c7', [JSON.stringify(objet(CLES_F5CC))]);
  const traces = ['depot_parti_vers_profil', 'deleted_at', 'deleted_at_client', 'deleted_at_serveur', 'recreated_at', 'recreation_envois',
    'recreation_tentee', 'new_vinted_item_id', 'old_vinted_item_id', 'canal_coupe_diag', 'reconciliation', 'suppression_verdict'];
  verifier(traces.every((x) => !(x in c7)), `plus aucune trace : ${traces.join(', ')}`);
  verifier(['vinted_account_id', 'capture_id', 'gardes', 'colis_bilan', 'prix_recreation', 'pepites_debitees'].every((x) => x in c7),
    'ce que la règle ne vise pas reste (boutique, capture, gardes, colis ; prix_recreation et pepites_debitees : hors du périmètre demandé)');
  verifier(['vinted_item_id', 'sale_signal', 'sale_evidence', 'vente_operation_cle', 'vente_annulee_remise', 'republish_step', 'vinted_account_proof', 'unavailable_since', 'processing_since'].every((x) => !(x in c7)),
    'ce que la règle d\'avant retirait reste retiré (numéro, signal de vente, vente, étape de republication, preuve de boutique)');
  const deg = await q(`SELECT public.remise_en_vente_champs(NULL) a, public.remise_en_vente_champs('[1,2]'::jsonb) b,
    public.remise_en_vente_champs('"x"'::jsonb) c, public.remise_en_vente_champs('{}'::jsonb) d,
    public.remise_en_vente_champs_prod(NULL) a0, public.remise_en_vente_champs_prod('[1,2]'::jsonb) b0`);
  verifier(['a', 'b', 'c', 'd', 'a0', 'b0'].every((x) => JSON.stringify(deg[0][x]) === '{}'), 'entrées dégénérées (NULL, tableau, texte, objet vide) → {} comme avant');
  const [{ vol }] = await q(`SELECT provolatile vol FROM pg_proc WHERE proname = 'remise_en_vente_champs'`);
  verifier(vol === 'i', 'toujours IMMUTABLE');

  console.log('5. L\'inverse');
  await client.query(INVERSE);
  const rendu = await defs();
  verifier(NOMS.every((n) => md5(rendu[n]) === MD5_PROD[n]), 'les définitions de prod reviennent à l\'identique (md5 de la prod)');
} catch (e) {
  ko++; console.error('ERREUR', e.message);
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(`\n${ok} vérifiés, ${ko} en échec`);
process.exit(ko ? 1 : 0);
