// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261107193100_lien_refuse_jamais_echec (07/11 soir, rouges famille 3/4 :
// 7e7f0769 d71db658, 187d5102 af37fa49) : un dépôt qui a LU son numéro (lien refusé par cross_post_jobs_lien_jamais_croise
// parce qu'une autre fiche le porte) n'est plus clos « jamais réussi à récupérer son lien ».
//   1. départ = les définitions de PROD du 07/11 soir (l'inverse + scripts/preuve-lien-refuse-jamais-echec.prod.sql), md5
//      identiques à ceux lus en prod ;
//   2. la garde refuse une prod qui a changé ; la migration passe, deux fois de suite ;
//   3. chaque ligne de prod de fail_publish_without_listing_url est gardée, dans l'ordre (seule change la ligne du bilan) ;
//   4. le refus du lien est produit par le VRAI déclencheur (UPDATE du lien comme l'extension) ; puis, sur le MÊME état,
//      la fonction de prod et la nouvelle, chacune dans une transaction annulée : les deux sorties sont IDENTIQUES pour
//      tous les dépôts (plain, Leboncoin 48 h et 72 h, Beebs, article en ligne ailleurs, lien retrouvé au relevé, trop
//      récent, avant le repère, « Non » de la personne, porteuse disparue, autre compte), SAUF les dépôts au numéro lu
//      porté par une fiche (remise après annulation 7e7f0769, annonce vendue 187d5102, après le « Oui », Leboncoin) :
//      la prod les met « failed » avec le faux message, la nouvelle ne les touche pas (rien d'écrit, rien de rendu) ;
//   5. second passage de la nouvelle : rien de plus ; l'inverse rend la définition de prod (md5) et retire l'aide.
//
//   PREUVE_PG=embarque node scripts/preuve-lien-refuse-jamais-echec.mjs   (Postgres jetable sur le PC, port libre ≥ 55540)
//
// Jamais la prod. Bouchons dits comme tels : refund_publish_unconfirmed (rend « sans_reservation », comme pour les trois
// cas réels ; appelée aux mêmes endroits par les deux versions), jumelle_occupe_plateformes (jamais atteinte : aucun
// compte relié dans le banc).
import pg from 'pg';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MD5_PROD = {
  fail_publish_without_listing_url: 'c1b3e41d036c71cefc983b69a45015a6',
  cross_post_jobs_lien_jamais_croise: '504c016ab32df97242fd9fe5ec464e07',
  article_en_ligne_ailleurs: 'cb0d559a1e4550bc4814c4308cf20397',
  listing_designe: '20dfe9e911566f45bbcb469530a65c61',
  annonce_id_job: 'ec47b783579ea3e02c83b2cfa4ae8626',
  annonce_id_depuis_url: 'a421cfe3046c080678ab0654c069d7cb',
  annonce_prise_par_une_vente: '2dd699396aff1a3d9f5990d20ea01b4d',
  leboncoin_transaction_lue: 'cb85655a9a6025047536c00e1a9a60fe',
  _ts_ou_null: '1730a1261d395edf9efe7e9dbf87f069',
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
  const port = await portLibre(55540);
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-lien-refuse-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = `postgres://postgres:preuve@127.0.0.1:${port}/postgres`;
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../supabase/migrations/20261107193100_lien_refuse_jamais_echec.sql');
const INVERSE = lire('../supabase/rollbacks/20261107193100_lien_refuse_jamais_echec_INVERSE.sql');
const PROD = lire('./preuve-lien-refuse-jamais-echec.prod.sql');

// Le banc : les colonnes lues par ces fonctions.
const BANC = String.raw`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE TABLE inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, statut text DEFAULT 'stock', quantite integer DEFAULT 1,
  fusionne_dans bigint, vinted_item_id text, vinted_account_id text, vinted_status text, origine text, created_at timestamptz DEFAULT now());
CREATE TABLE cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  status text, action text, platform_listing_id text, listing_url text, platform_fields jsonb, published_at timestamptz,
  created_at timestamptz DEFAULT now(), error text, vu_en_ligne_le timestamptz, reservation_id uuid);
CREATE TABLE annonces_plateforme (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, listing_id text,
  inventaire_id bigint, job_id uuid, statut_plateforme text, url text, disparu_le timestamptz, retiree_le timestamptz,
  ignoree_le timestamptz, vu_le timestamptz DEFAULT now(), transaction_plateforme text, capture jsonb);
CREATE TABLE inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint,
  statut text, decide_par text, motif text);
CREATE TABLE inventaire_fusions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint, defait_le timestamptz);
CREATE TABLE fiches_liees_comptes (fiche_a bigint, fiche_b bigint);
CREATE TABLE ventes_operations (user_id uuid, cle text, resultat jsonb, PRIMARY KEY (user_id, cle));
-- bouchons (dits comme tels)
CREATE OR REPLACE FUNCTION public.refund_publish_unconfirmed(p_job uuid) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('rembourse', 0, 'raison', 'sans_reservation') $f$;
CREATE OR REPLACE FUNCTION public.jumelle_occupe_plateformes(p_user uuid, p_fiche bigint)
  RETURNS TABLE (platform text, statut text, listing_id text, compte uuid) LANGUAGE sql AS $f$ SELECT NULL::text, NULL::text, NULL::text, NULL::uuid WHERE false $f$;
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
const ins = async (table, o) => {
  const k = Object.keys(o);
  return (await q(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(o)))[0];
};
const heures = (n) => new Date(Date.now() + n * 3600_000).toISOString();
const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
const REPERE = '2026-08-10T17:40:00Z';
const ITEM = (n) => `https://www.vinted.fr/items/${n}-article`;

// Un dépôt sans lien (publié, ni lien ni numéro) ; l'extension propose ensuite un lien : le VRAI déclencheur tranche.
async function depot({ id, user = U, fiche, platform = 'vinted', il = -5, pf = {}, propose = null }) {
  const j = await ins('cross_post_jobs', { id, user_id: user, inventaire_id: fiche, platform, status: 'published', action: 'publish',
    platform_fields: JSON.stringify(pf), published_at: heures(il), created_at: heures(il - 0.01) });
  if (propose) await q('UPDATE cross_post_jobs SET listing_url = $2 WHERE id = $1', [id, propose]);
  return j;
}
// Une fiche née de la synchro, avec son job de suivi publié sur le numéro.
async function porteuse({ fiche, user = U, n, statut = 'stock', platform = 'vinted', jobStatut = 'published' }) {
  await ins('inventaire', { id: fiche, user_id: user, titre: 'Article ' + fiche, statut, vinted_item_id: platform === 'vinted' ? n : null,
    vinted_status: platform === 'vinted' ? 'active' : null, origine: platform === 'vinted' ? 'vinted_sync' : 'releve_' + platform });
  const url = platform === 'vinted' ? ITEM(n) : platform === 'leboncoin' ? `https://www.leboncoin.fr/ad/divers/${n}` : null;
  await ins('cross_post_jobs', { user_id: user, inventaire_id: fiche, platform, status: jobStatut, action: 'publish', platform_listing_id: n,
    listing_url: url, platform_fields: JSON.stringify({ source: 'releve' }), published_at: heures(-6), created_at: heures(-6) });
}
const fiche = async (id, o = {}) => ins('inventaire', { id, user_id: U, titre: 'Article ' + id, statut: 'stock', ...o });
const J = (k) => `00000000-0000-0000-0000-${String(k).padStart(12, '0')}`;

try {
  await client.query(BANC);
  await client.query(PROD);
  await client.query(`CREATE TRIGGER cross_post_jobs_lien_jamais_croise BEFORE UPDATE OF listing_url, platform_listing_id ON public.cross_post_jobs
    FOR EACH ROW EXECUTE FUNCTION cross_post_jobs_lien_jamais_croise()`);
  console.log('1. Départ = les définitions de PROD du 07/11 soir');
  await client.query(INVERSE);   // son DROP IF EXISTS ne trouve rien
  const avant = await defs();
  const ecarts = NOMS.filter((n) => md5(avant[n] ?? '') !== MD5_PROD[n]);
  verifier(ecarts.length === 0, `md5 identiques à la prod (${NOMS.length} fonctions${ecarts.length ? ' — écarts : ' + ecarts.join(', ') : ''})`);

  console.log('2. La garde, puis la migration');
  await client.query(avant.fail_publish_without_listing_url.replace('BEGIN\n  FOR j IN', 'BEGIN\n  -- retouche faite en prod\n  FOR j IN'));
  let refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/a changé en prod depuis le 07\/11 soir/.test(refus ?? ''), 'une prod qui a changé depuis la lecture : la migration refuse, rien n\'est appliqué');
  verifier((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'lien_refuse_fiche_porteuse'`))[0].n === 0, '… et l\'aide n\'est pas posée');
  await client.query(avant.fail_publish_without_listing_url);
  await client.query(MIGRATION);
  await client.query(MIGRATION); // rejouable (la garde reconnaît sa propre version)
  verifier(true, 'la migration s\'applique, deux fois de suite');
  const apres = await defs();
  const lp = avant.fail_publish_without_listing_url.split('\n'), ln = apres.fail_publish_without_listing_url.split('\n');
  let k = 0; const manquantes = [];
  for (const l of lp) { const at = ln.indexOf(l, k); if (at < 0) manquantes.push(l.trim()); else k = at + 1; }
  verifier(manquantes.length === 1 && /^RETURN jsonb_build_object\('jobs_echoues'/.test(manquantes[0]),
    `chaque ligne de prod de fail_publish_without_listing_url est gardée, dans l'ordre (seule change la ligne du bilan : ${manquantes.length})`);
  verifier(NOMS.filter((n) => n !== 'fail_publish_without_listing_url').every((n) => md5(apres[n]) === MD5_PROD[n]),
    'le déclencheur et les aides lues : md5 de prod inchangés');
  const [{ acl }] = await q(`SELECT proacl::text acl FROM pg_proc WHERE proname = 'lien_refuse_fiche_porteuse'`);
  verifier(!/(^|[{,])=X|anon=|authenticated=|service_role=/.test(acl ?? ''), `l'aide n'est exécutable par aucun client (${acl})`);
  // La fonction de PROD, à côté, sous un autre nom (pour comparer sur le même état).
  await client.query(avant.fail_publish_without_listing_url.replace('FUNCTION public.fail_publish_without_listing_url(', 'FUNCTION public.fail_publish_prod('));

  console.log('3. Le banc : le refus du lien par le VRAI déclencheur, puis les deux versions sur le même état');
  // A — 7e7f0769 : remise après vente annulée ; la synchro a fait une fiche neuve (porteuse, en stock) ; l'extension propose son numéro.
  await fiche(101, { vinted_item_id: '10631712126', vinted_status: 'closed', origine: 'vinted_sync' });
  await porteuse({ fiche: 102, n: '10667288621' });
  await depot({ id: J(1), fiche: 101, pf: { remise_en_vente: { apres_annulation: true }, republier: { nouvel_item: { id: '10667288621', source: 'geste_du_vendeur' } } }, propose: ITEM('10667288621') });
  // B — 187d5102 : même chaîne, l'annonce de la fiche neuve VENDUE ensuite (job « sold », fiche « vendu »).
  await fiche(111, { vinted_item_id: '10281020199', vinted_status: 'sold' });
  await porteuse({ fiche: 112, n: '10677685596' });
  await depot({ id: J(2), fiche: 111, propose: ITEM('10677685596') });
  await q(`UPDATE cross_post_jobs SET status = 'sold' WHERE inventaire_id = 112`);
  await q(`UPDATE inventaire SET statut = 'vendu', quantite = 0, vinted_status = 'sold' WHERE id = 112`);
  // C — après le « Oui » : la fiche neuve fondue dans celle du dépôt, son job et l'identité Vinted passés à la gardée.
  await fiche(121);
  await porteuse({ fiche: 122, n: '10700000001' });
  await depot({ id: J(3), fiche: 121, propose: ITEM('10700000001') });
  await q(`UPDATE cross_post_jobs SET inventaire_id = 121 WHERE inventaire_id = 122`);
  await q(`UPDATE inventaire SET fusionne_dans = 121 WHERE id = 122`);
  await q(`UPDATE inventaire SET vinted_item_id = '10700000001', vinted_status = 'active' WHERE id = 121`);
  // D — Leboncoin : l'annonce relevée rattachée à une autre fiche (motif annonce_rattachee_a_un_autre_article).
  await fiche(131);
  await ins('inventaire', { id: 132, user_id: U, titre: 'Article 132', statut: 'stock', origine: 'releve_leboncoin' });
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3300000001', inventaire_id: 132, statut_plateforme: 'en_ligne', url: 'https://www.leboncoin.fr/ad/divers/3300000001' });
  await depot({ id: J(4), fiche: 131, platform: 'leboncoin', il: -60, propose: 'https://www.leboncoin.fr/ad/divers/3300000001' });
  // — Ce qui ne change PAS —
  // E — la personne a dit « Non » sur la paire (le numéro lu n'était pas cet article) : la ligne d'avant.
  await fiche(141);
  await porteuse({ fiche: 142, n: '10700000002' });
  await depot({ id: J(5), fiche: 141, propose: ITEM('10700000002') });
  await ins('inventaire_doublons', { user_id: U, garde: 141, absorbe: 142, statut: 'refusee', decide_par: 'utilisateur', motif: 'releve' });
  // F — fusion défaite par la personne : la ligne d'avant.
  await fiche(151);
  await porteuse({ fiche: 152, n: '10700000003' });
  await depot({ id: J(6), fiche: 151, propose: ITEM('10700000003') });
  await ins('inventaire_fusions', { user_id: U, garde: 151, absorbe: 152, defait_le: heures(-1) });
  // G — plus aucune fiche ne porte le numéro (job de suivi clos, numéro effacé de la fiche) : la ligne d'avant.
  await fiche(161);
  await porteuse({ fiche: 162, n: '10700000004' });
  await depot({ id: J(7), fiche: 161, propose: ITEM('10700000004') });
  await q(`UPDATE cross_post_jobs SET status = 'cancelled' WHERE inventaire_id = 162`);
  await q(`UPDATE inventaire SET vinted_item_id = NULL WHERE id = 162`);
  // H — un AUTRE compte porte ce numéro (marque posée à la main : le déclencheur ne regarde que le compte) : la ligne d'avant.
  await fiche(171);
  await porteuse({ fiche: 172, user: V, n: '10700000005' });
  await depot({ id: J(8), fiche: 171, pf: { lien_refuse: { le: heures(-4), id_propose: '10700000005', motif: 'annonce_portee_par_un_autre_article' } } });
  // I — marque « identifiant_certain_different » (jamais lue par la règle) : la ligne d'avant.
  await fiche(181);
  await porteuse({ fiche: 182, n: '10700000006' });
  await depot({ id: J(9), fiche: 181, pf: { lien_refuse: { le: heures(-4), id_propose: '10700000006', motif: 'identifiant_certain_different' } } });
  // J — dépôts ordinaires sans lien : Vinted (2 h passées), Leboncoin 48 h, trop récent, avant le repère, Beebs.
  await fiche(191); await depot({ id: J(10), fiche: 191 });
  await fiche(192); await depot({ id: J(11), fiche: 192, platform: 'leboncoin', il: -50 });
  await fiche(193); await depot({ id: J(12), fiche: 193, il: -1 });
  await fiche(194); await q(`INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, status, action, platform_fields, published_at, created_at)
    VALUES ($1, $2, 194, 'vinted', 'published', 'publish', '{}', '2026-08-01T10:00:00Z', '2026-08-01T10:00:00Z')`, [J(13), U]);
  await fiche(195); await depot({ id: J(14), fiche: 195, platform: 'beebs', il: -200, pf: { lien_refuse: { le: heures(-4), id_propose: '34094515', motif: 'annonce_rattachee_a_un_autre_article' } } });
  // K — l'article en ligne sous une autre annonce de SA fiche (Leboncoin) : « cancelled » d'avant.
  await fiche(196);
  await ins('annonces_plateforme', { user_id: U, platform: 'leboncoin', listing_id: '3300000009', inventaire_id: 196, statut_plateforme: 'en_ligne' });
  await depot({ id: J(15), fiche: 196, platform: 'leboncoin', il: -60 });
  // L — le lien dormait dans le relevé du compte (annonces_plateforme.job_id) : lien posé, comme avant.
  await fiche(197); await depot({ id: J(16), fiche: 197, il: -3 });
  await ins('annonces_plateforme', { user_id: U, platform: 'vinted', listing_id: '10700000010', inventaire_id: 197, job_id: J(16), statut_plateforme: 'en_ligne', url: ITEM('10700000010') });
  // M — Leboncoin 72 h (boucle 2 : numéro rendu, sonde 3 fois bredouille) : « failed » d'avant.
  await fiche(198);
  await q(`INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, status, action, platform_listing_id, platform_fields, published_at, created_at)
    VALUES ($1, $2, 198, 'leboncoin', 'published', 'publish', '3300000011', $3, $4, $4)`,
    [J(17), U, JSON.stringify({ moderation_probe: { misses: 3, last_miss_at: heures(-70) } }), heures(-80)]);

  const marques = await q(`SELECT id, listing_url, platform_listing_id, platform_fields -> 'lien_refuse' lr FROM cross_post_jobs WHERE id = ANY($1) ORDER BY id`,
    [[J(1), J(2), J(3), J(4), J(5), J(6), J(7)]]);
  verifier(marques.length === 7 && marques.every((m) => m.listing_url === null && m.platform_listing_id === null && m.lr?.motif && m.lr?.id_propose),
    `le VRAI déclencheur a refusé les 7 liens proposés (marque lien_refuse ; motifs : ${[...new Set(marques.map((m) => m.lr?.motif))].join(', ')})`);

  // Même état, deux versions, deux transactions annulées. now() (instant de la transaction) est neutralisé dans l'instantané.
  const instantane = async () => q(`SELECT id, status, error, listing_url, platform_listing_id,
      replace(platform_fields::text, to_jsonb(now())::text, '"NOW"') pf FROM cross_post_jobs ORDER BY id`);
  const passer = async (fn) => {
    await client.query('BEGIN');
    try {
      const [{ r }] = await q(`SELECT public.${fn}($1::timestamptz) r`, [REPERE]);
      const etat = await instantane();
      let r2 = null, etat2 = null;
      if (fn === 'fail_publish_without_listing_url') { r2 = (await q(`SELECT public.${fn}($1::timestamptz) r`, [REPERE]))[0].r; etat2 = await instantane(); }
      return { r, etat, r2, etat2 };
    } finally { await client.query('ROLLBACK'); }
  };
  const avantEtat = await instantane();
  const P = await passer('fail_publish_prod');
  const N = await passer('fail_publish_without_listing_url');
  verifier(JSON.stringify(await instantane()) === JSON.stringify(avantEtat), 'les deux passages sont annulés : le banc est intact entre eux');
  const parId = (e) => new Map(e.map((x) => [x.id, x]));
  const p = parId(P.etat), n = parId(N.etat), a = parId(avantEtat);
  const CIBLES = [J(1), J(2), J(3), J(4)];
  const autres = P.etat.map((x) => x.id).filter((id) => !CIBLES.includes(id));
  const differents = autres.filter((id) => JSON.stringify(p.get(id)) !== JSON.stringify(n.get(id)));
  verifier(differents.length === 0, `hors des dépôts au numéro lu : ${autres.length} jobs, sorties IDENTIQUES entre la prod et la nouvelle${differents.length ? ' — écarts : ' + differents.join(', ') : ''}`);
  console.log(`     prod     : ${JSON.stringify(P.r)}`);
  console.log(`     nouvelle : ${JSON.stringify(N.r)}`);
  verifier(CIBLES.every((id) => p.get(id).status === 'failed' && /jamais réussi à récupérer son lien/.test(p.get(id).error ?? '')),
    'la PROD met les 4 dépôts au numéro lu « failed » : « on n\'a jamais réussi à récupérer son lien » (le faux message des rouges)');
  verifier(CIBLES.every((id) => JSON.stringify(n.get(id)) === JSON.stringify(a.get(id))),
    'la NOUVELLE ne les touche pas : statut « published », marque lien_refuse, aucun champ écrit (la règle du dépôt retrouvé décide)');
  verifier(N.r.numero_lu_porte_ailleurs === 4 && N.r.jobs_echoues === P.r.jobs_echoues - 4
    && N.r.en_ligne_ailleurs === P.r.en_ligne_ailleurs && N.r.liens_retrouves === P.r.liens_retrouves && N.r.quotas_rendus === P.r.quotas_rendus,
    'bilan : 4 « numero_lu_porte_ailleurs », 4 échecs de moins, le reste identique');
  const attendu = { [J(5)]: 'failed', [J(6)]: 'failed', [J(7)]: 'failed', [J(8)]: 'failed', [J(9)]: 'failed', [J(10)]: 'failed', [J(11)]: 'failed',
    [J(12)]: 'published', [J(13)]: 'published', [J(14)]: 'published', [J(15)]: 'cancelled', [J(16)]: 'published', [J(17)]: 'failed' };
  const faux = Object.entries(attendu).filter(([id, s]) => n.get(id)?.status !== s);
  verifier(faux.length === 0, `les lignes d'avant, telles quelles : « Non », fusion défaite, porteuse disparue, autre compte, autre motif, ordinaires, Leboncoin 48 h et 72 h → failed ; trop récent, avant le repère, Beebs → intacts ; article en ligne ailleurs → cancelled ; lien du relevé → posé${faux.length ? ' — écarts : ' + JSON.stringify(faux) : ''}`);
  verifier(n.get(J(16)).listing_url === ITEM('10700000010'), '… le lien retrouvé au relevé est posé (comme avant)');
  verifier(JSON.stringify(N.etat2) === JSON.stringify(N.etat) && N.r2.numero_lu_porte_ailleurs === 4 && N.r2.jobs_echoues === 0,
    'second passage de la nouvelle : rien de plus (les 4 restent intacts, aucun échec de plus)');

  console.log('4. L\'aide seule (le numéro, jamais un titre)');
  const aide = async (id) => (await q('SELECT public.lien_refuse_fiche_porteuse($1::uuid) f', [id]))[0].f;
  verifier(String(await aide(J(1))) === '102' && String(await aide(J(2))) === '112' && String(await aide(J(3))) === '121' && String(await aide(J(4))) === '132',
    'porteuses : la fiche neuve (en stock), la fiche vendue, la fiche du dépôt après le « Oui », la fiche Leboncoin rattachée');
  verifier((await aide(J(5))) === null && (await aide(J(6))) === null
    && (await aide(J(7))) === null && (await aide(J(8))) === null && (await aide(J(9))) === null && (await aide(J(10))) === null,
    'NULL : « Non » de la personne, fusion défaite, porteuse disparue, autre compte, motif identifiant_certain_different, pas de marque');
  await fiche(201, { titre: 'Pull zippé chaud bleu 12 ans' });
  await ins('inventaire', { id: 202, user_id: U, titre: 'Pull zippé chaud bleu 12 ans', statut: 'stock', vinted_item_id: '10799999999', origine: 'vinted_sync' });
  await depot({ id: J(20), fiche: 201, pf: { lien_refuse: { le: heures(-4), id_propose: '123', motif: 'annonce_portee_par_un_autre_article' } } });
  verifier((await aide(J(20))) === null, 'même titre, numéro trop court ou différent : NULL (jamais un titre)');

  console.log('5. L\'inverse');
  await client.query(INVERSE);
  const rendu = await defs();
  verifier(md5(rendu.fail_publish_without_listing_url) === MD5_PROD.fail_publish_without_listing_url, 'fail_publish_without_listing_url revient à l\'identique (md5 de la prod)');
  verifier((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'lien_refuse_fiche_porteuse'`))[0].n === 0, 'l\'aide est retirée');
} catch (e) {
  ko++; console.error('ERREUR', e.message);
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(`\n${ok} vérifiés, ${ko} en échec`);
process.exit(ko ? 1 : 0);
