// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261107160000_remise_apres_annulation_question (07/11, Ornella — pull
// rayé 1792342856185 → 1793203726300000) : après une vente annulée, l'article remis en ligne sous une fiche NEUVE fait
// poser la QUESTION « Est-ce le même article ? », JAMAIS une fusion.
//   1. départ = prod du 07/11 + la migration B (20261107150000) ; md5 des dépendances = ceux lus en prod ;
//   2. la garde refuse une base sans B, ou dont rapprochement_v3_appliquer a changé ; la migration passe deux fois ;
//   3. chaque ligne de prod est gardée, dans l'ordre (remise_possible : insertion seule ; fusionner_pour : une ligne
//      changée ; tick : la ligne du bilan) ; les 5 appelants de vinted_remise_en_ligne et appliquer : md5 inchangés ;
//   4. vente annulée prouvée + photos identiques + jamais en ligne ensemble → la QUESTION (sold ET closed), aucune fusion ;
//      deux exemplaires apparus la même minute, en ligne ensemble, vente NON annulée (vraie vente), commande vivante,
//      jumelle vendue, une seule photo, « Non » déjà dit, autre compte → rien ;
//   5. le moteur (rapprochement_v3_appliquer « remise_en_ligne » ET « remise_en_ligne_a_verifier ») sur la paire : la
//      question, jamais la fusion ; fusion automatique (moteur, IA) : refusée comme avant ;
//   6. hors vente annulée : rapprochement_v3_remise_possible et inventaire_fusionner_pour rendent EXACTEMENT ce qu'ils
//      rendaient (matrice de paires, avant / après) ;
//   7. le « Oui » de la personne (inventaire_doublon_decider_corps) : la fusion, l'identité Vinted vivante passe à la
//      fiche gardée ; le « Non » : rien ;
//   8. second passage : rien de plus ; l'inverse rend les définitions (md5) et retire les quatre fonctions nouvelles.
//
//   PREUVE_PG=embarque node scripts/preuve-remise-apres-annulation-question.mjs   (Postgres jetable, port libre ≥ 55482)
//
// Jamais la prod. Le banc : celui de scripts/preuve-ventes-annulees-fermeture.mjs (définitions de prod, deux bouchons
// nommés) + scripts/preuve-remise-apres-annulation-question.prod.sql (définitions de PROD du 07/11, md5 vérifiés) + trois
// bouchons nommés (rapprochement_texte_norm, rapprochement_description_cle, rapprochement_description_lot : jamais
// atteints ici, la republication prouvée ne concerne que Leboncoin, Beebs, eBay, Opla, Depop).
import pg from 'pg';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

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
  const port = await portLibre(55482);
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-remise-annulation-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = `postgres://postgres:preuve@127.0.0.1:${port}/postgres`;
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIG_B = lire('../supabase/migrations/20261107150000_ventes_annulees_fermeture.sql');
const INV_B = lire('../supabase/rollbacks/20261107150000_ventes_annulees_fermeture_INVERSE.sql');
const MIGRATION = lire('../supabase/migrations/20261107160000_remise_apres_annulation_question.sql');
const INVERSE = lire('../supabase/rollbacks/20261107160000_remise_apres_annulation_question_INVERSE.sql');
const PROD = lire('./preuve-remise-apres-annulation-question.prod.sql');
const preuveB = lire('./preuve-ventes-annulees-fermeture.mjs');
const BANC_B = preuveB.slice(preuveB.indexOf('const BANC = String.raw`') + 'const BANC = String.raw`'.length, preuveB.indexOf('\n`;', preuveB.indexOf('const BANC = String.raw`')));

// md5 lus en PROD le 07/11 (pg_get_functiondef sans \r)
const MD5_PROD = {
  rapprochement_v3_remise_possible: 'aee9bcf5f16349c99b5349b60cddffcd', inventaire_fusionner_pour: '92db4aba57e4960365206c4758ffb12b',
  vinted_remise_en_ligne: 'a7effd416b30065f0215c9d623f61fdf', releve_poser_question: '89d0f7dcdba5d6cd0f954ed8fb092a68',
  rapprochement_v3_remise_maillon: '3d707dcebc269f7c7400b8084f43eb23', rapprochement_v3_appliquer: '803a52270730966e7e641a03c6c9164b',
  inventaire_doublon_decider_corps: '8a297536214ebbd9a3e86cb8b193dec5', inventaire_doublon_decider_ia: 'ed8e3cf208b18c883d56a0a977a30be7',
};
const MD5_B = { remises_en_vente_tick: 'f457e0714933c5b52d57d4dae3ce3d57', fiche_jumelle_prouvee: 'b67a137418277ed32764c35764ca9803' };

const BANC_C = String.raw`
SET check_function_bodies = off;
ALTER TABLE inventaire ADD COLUMN prix_achat numeric, ADD COLUMN prix_achat_inconnu boolean, ADD COLUMN prix_vente_change_par text,
  ADD COLUMN poids_change_par text, ADD COLUMN attributs jsonb, ADD COLUMN marque text, ADD COLUMN vinted_catalog_id text,
  ADD COLUMN vinted_view_count integer, ADD COLUMN vinted_favourite_count integer, ADD COLUMN listed_at_guess timestamptz,
  ADD COLUMN fusionne_le timestamptz, ADD COLUMN a_verifier jsonb;
CREATE UNIQUE INDEX inventaire_vinted_unique ON inventaire (user_id, vinted_item_id);
ALTER TABLE cross_post_jobs ADD COLUMN error text;
ALTER TABLE annonces_plateforme ADD COLUMN source_rapprochement text, ADD COLUMN proposition jsonb, ADD COLUMN updated_at timestamptz,
  ADD COLUMN prix numeric, ADD COLUMN titre text, ADD COLUMN quantite integer;
ALTER TABLE ventes_supprimees ADD COLUMN source text, ADD COLUMN motif text, ADD COLUMN supprimee_le timestamptz, ADD COLUMN commande_ref text;
ALTER TABLE plateforme_commandes ADD COLUMN annonce_ref text, ADD COLUMN vendue_le timestamptz;
ALTER TABLE vinted_sync_runs ADD COLUMN vinted_user_id text;
CREATE TABLE ventes (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint, annonce_id text);
CREATE TABLE fiches_annonce (id bigserial PRIMARY KEY, user_id uuid, inventaire_id bigint);
CREATE TABLE push_ventes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint);
CREATE TABLE vinted_republish_captures (id bigserial PRIMARY KEY, inventaire_id bigint);
CREATE TABLE rapprochements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, annonce_id uuid, inventaire_id bigint, decision text,
  par text, score numeric, detail jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE inventaire_fusions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint, deplacements jsonb,
  champs_repris jsonb, par text, defait_le timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint, niveau text,
  statut text, motif text, preuves jsonb, source text, decide_le timestamptz, decide_par text, fusion_id uuid, created_at timestamptz DEFAULT now());
-- l'index de prod : une question par paire, à jamais
CREATE UNIQUE INDEX inventaire_doublons_paire ON inventaire_doublons (user_id, LEAST(garde, absorbe), GREATEST(garde, absorbe))
  WHERE motif IS DISTINCT FROM 'copie_non_prouvee';
CREATE TABLE boutiques_plateforme (platform text, compte_ref text, user_id uuid);
-- bouchons (dits comme tels) : jamais atteints sur deux fiches Vinted
CREATE FUNCTION public.rapprochement_texte_norm(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT lower(btrim(coalesce(p, ''))) $f$;
CREATE FUNCTION public.rapprochement_description_cle(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT NULL::text $f$;
CREATE FUNCTION public.rapprochement_description_lot(p text, t text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$ SELECT false $f$;
`;

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
let ok = 0, ko = 0;
const verifier = (cond, msg) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg); } };
const q = async (sql, args = []) => (await client.query(sql, args)).rows;
const md5 = (s) => createHash('md5').update(s.replace(/\r/g, '')).digest('hex');
const def = async (nom) => (await q(`SELECT pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = $1`, [nom]))[0]?.d ?? '';
const NOUVELLES = ['vente_annulee_prouvee', 'vinted_remise_apres_annulation', 'remise_annulee_question_poser', 'remise_annulee_questions'];
const ins = async (table, o) => {
  const k = Object.keys(o);
  return (await q(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(o)))[0];
};
const jours = (n) => new Date(Date.now() + n * 86400_000).toISOString();
const dhash = (graine) => [...createHash('md5').update('photo:' + graine).digest().subarray(0, 8)].map((o) => o.toString(2).padStart(8, '0')).join('');
const voisin = (d, k) => d.split('').map((c, i) => (i < k ? (c === '0' ? '1' : '0') : c)).join('');
const photo = async (url, d) => { await ins('photo_empreintes', { url, dhash: d }); return url; };
// les lignes de « avant » gardées dans l'ordre dans « après » ; rend les lignes manquantes
const lignesPerdues = (avant, apres) => {
  const A = apres.split('\n'); let k = 0; const manq = [];
  for (const l of avant.split('\n')) { const at = A.indexOf(l, k); if (at < 0) manq.push(l.trim()); else k = at + 1; }
  return manq;
};

const U = '11111111-1111-1111-1111-111111111111', V = '22222222-2222-2222-2222-222222222222';
const BOUTIQUE = '257364012';
const S = jours(-20);   // la vente (annulée ensuite)

// Une fiche dont la vente Vinted a été ANNULÉE (preuve complète : vente retirée « commande_failed », job marqué), avec sa
// proposition « Remettre en vente » (B la fermera si la jumelle est prouvée).
async function ficheAnnulee(id, { user = U, photos = 3, graine = id, statutVinted = 'sold', boutique = BOUTIQUE, motif = 'commande_failed',
  preuve = true, venteEcrite = false, titre = 'Article ' + id, origine = null } = {}) {
  const urls = [];
  for (let k = 0; k < photos; k++) urls.push(await photo(`https://stockage/fiche-${id}-${k}.jpg`, dhash(graine * 10 + k)));
  const vid = String(9_000_000_000 + id);
  await ins('inventaire', { id, user_id: user, titre, statut: 'stock', quantite: 1, photos: JSON.stringify(urls.map((url) => ({ url }))),
    vinted_item_id: vid, vinted_account_id: boutique, vinted_status: statutVinted, created_at: jours(-60), first_seen_at: jours(-60),
    last_synced_at: jours(-0.01), origine });
  const j = await ins('cross_post_jobs', { user_id: user, inventaire_id: id, platform: 'vinted', status: 'cancelled', action: 'publish',
    platform_listing_id: vid, sold_at: S, title: titre, price: 10, photos: JSON.stringify(urls),
    platform_fields: JSON.stringify(preuve ? { sale_signal: 'sold', vente_annulee_remise: { commande: String(5_000_000 + id), le: jours(-12), vente: 1000 + id, statut: 'failed' } } : { sale_signal: 'sold' }) });
  if (preuve) await ins('ventes_supprimees', { user_id: user, vente_id: 1000 + id, vendu_le: S, plateforme_code: 'vinted', annonce_id: vid,
    source: 'releve_vinted', motif, supprimee_le: jours(-12) });
  if (venteEcrite) await ins('ventes', { user_id: user, inventaire_id: id, annonce_id: vid });
  if (preuve) await ins('remises_en_vente', { user_id: user, inventaire_id: id, platform: 'vinted', job_vendu: j.id, statut: 'proposee', cree_le: jours(-12) });
  await ins('vinted_listing_snapshots', { user_id: user, vinted_item_id: vid, inventaire_id: id, captured_at: jours(-21), status: 'active' });
  await ins('vinted_listing_snapshots', { user_id: user, vinted_item_id: vid, inventaire_id: id, captured_at: jours(-1), status: statutVinted });
  return { id, urls, graine, vid };
}
// La fiche que la synchro a faite pour l'annonce remise en ligne par la personne (mêmes photos, nouveau numéro).
async function jumelle(id, f, { user = U, statut = 'stock', apparue = jours(-8), communes = 3, photos = null, boutique = BOUTIQUE, enLigne = true } = {}) {
  const n = photos ?? f.urls.length;
  const urls = [];
  for (let k = 0; k < n; k++) urls.push(await photo(`https://images1.vinted.net/t/${id}-${k}.jpeg`, k < communes ? voisin(dhash(f.graine * 10 + k), 2) : voisin(dhash(f.graine * 10 + k), 24)));
  const vid = String(9_500_000_000 + id);
  await ins('inventaire', { id, user_id: user, titre: 'Article ' + f.id + ' (remis en ligne)', statut, quantite: statut === 'vendu' ? 0 : 1,
    photos: JSON.stringify(urls), vinted_item_id: vid, vinted_account_id: boutique,
    vinted_status: statut === 'vendu' ? 'sold' : enLigne ? 'active' : 'closed', disparu_le: null,
    created_at: apparue, first_seen_at: apparue, last_synced_at: jours(-0.01), origine: 'vinted_sync' });
  await ins('cross_post_jobs', { user_id: user, inventaire_id: id, platform: 'vinted', status: 'published', action: 'publish', platform_listing_id: vid,
    platform_fields: JSON.stringify({ source: 'releve' }) });
  return id;
}
const questionsDe = async (fiche) => q(`SELECT id, garde, absorbe, statut, motif, decide_par, preuves FROM inventaire_doublons
  WHERE garde = $1 OR absorbe = $1 ORDER BY created_at`, [fiche]);
const fusions = async () => (await q('SELECT count(*)::int n FROM inventaire_fusions'))[0].n;
const fondues = async () => (await q('SELECT count(*)::int n FROM inventaire WHERE fusionne_dans IS NOT NULL'))[0].n;
const remisePossible = async (a, b, u = U) => (await q('SELECT rapprochement_v3_remise_possible($1, $2, $3) r', [u, a, b]))[0].r;
// inventaire_fusionner_pour essayé puis ANNULÉ (rien ne reste) : sa sortie seulement
const essaiFusion = async (g, a, par, u = U) => {
  await q('BEGIN');
  try { const r = (await q('SELECT inventaire_fusionner_pour($1, $2, $3, $4) r', [u, g, a, par]))[0].r; return { ok: r.ok, reason: r.reason ?? null, echange: !!r.champs_repris?.vinted_identite?.echange }; }
  catch (e) { return { erreur: e.message }; }
  finally { await q('ROLLBACK'); }
};

try {
  await client.query(BANC_B);
  await client.query(BANC_C);
  await client.query(PROD);
  await client.query('SET check_function_bodies = on');
  console.log('1. Départ = la prod du 07/11, puis la migration B');
  await client.query(INV_B);   // les définitions de prod de B (tick, écran)
  await client.query(MIG_B);
  await client.query(INVERSE); // les définitions de prod de C (remise_possible, fusionner_pour) et le tick de B ; DROP sans objet
  const avant = {};
  for (const n of [...Object.keys(MD5_PROD), ...Object.keys(MD5_B)]) avant[n] = await def(n);
  const ecarts = Object.entries(MD5_PROD).filter(([n, m]) => md5(avant[n]) !== m).map(([n]) => n);
  verifier(ecarts.length === 0, `md5 des ${Object.keys(MD5_PROD).length} définitions de prod identiques à la prod (${ecarts.join(', ') || 'aucun écart'})`);
  verifier(md5(avant.remises_en_vente_tick) === MD5_B.remises_en_vente_tick && md5(avant.fiche_jumelle_prouvee) === MD5_B.fiche_jumelle_prouvee,
    'remises_en_vente_tick et fiche_jumelle_prouvee = celles que pose B (md5 de la garde)');

  console.log('2. La garde, puis la migration');
  await client.query(INV_B.replace(/DROP FUNCTION[\s\S]*$/, ''));   // B « pas appliquée » : le tick de prod
  let refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/appliquer B d'abord/.test(refus ?? ''), `sans B : la migration refuse (${(refus ?? '').slice(0, 70)})`);
  await client.query(avant.remises_en_vente_tick);
  await client.query(avant.rapprochement_v3_appliquer.replace("v_par text := 'auto:photo_rapprochement_v3 (photo_identique)';", "v_par text := 'auto:photo_rapprochement_v3 (photo_identique)'; -- retouche"));
  refus = null;
  try { await client.query(MIGRATION); } catch (e) { refus = e.message; }
  verifier(/rapprochement_v3_appliquer a changé/.test(refus ?? ''), 'rapprochement_v3_appliquer retouché en prod : la migration refuse');
  verifier((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = ANY($1)`, [NOUVELLES]))[0].n === 0, '… et aucune fonction nouvelle n\'est posée');
  await client.query(avant.rapprochement_v3_appliquer);

  // La matrice « avant » (B appliquée, C pas encore) : des paires HORS vente annulée prouvée
  await ins('profiles', { id: U, extension_last_seen_at: jours(0) });
  await ins('profiles', { id: V, extension_last_seen_at: jours(0) });
  // M1 : remise en ligne ordinaire (ancienne « closed », disparue ; nouvelle après) → la fusion d'avant (NULL)
  await ins('inventaire', { id: 501, user_id: U, titre: 'Ordinaire', statut: 'stock', quantite: 1, vinted_item_id: '501', vinted_account_id: BOUTIQUE,
    vinted_status: 'closed', disparu_le: jours(-9), created_at: jours(-40), first_seen_at: jours(-40), last_synced_at: jours(-9), photos: '[]' });
  await ins('inventaire', { id: 502, user_id: U, titre: 'Ordinaire', statut: 'stock', quantite: 1, vinted_item_id: '502', vinted_account_id: BOUTIQUE,
    vinted_status: 'active', created_at: jours(-8), first_seen_at: jours(-8), last_synced_at: jours(-0.01), origine: 'vinted_sync', photos: '[]' });
  // M2 : une VRAIE vente (ancienne « sold », vente écrite, aucune vente retirée) + une fiche neuve en ligne → « ancienne_vendue »
  const FV1 = await ficheAnnulee(510, { preuve: false, venteEcrite: true });
  await jumelle(511, FV1);
  // M3 : « sold » sans aucune preuve d'annulation → « ancienne_vendue »
  const FV2 = await ficheAnnulee(520, { preuve: false });
  await jumelle(521, FV2);
  // M4 : deux annonces en ligne ensemble (deux exemplaires) → « pas_une_remise_en_ligne »
  await ins('inventaire', { id: 530, user_id: U, titre: 'Deux', statut: 'stock', quantite: 1, vinted_item_id: '530', vinted_account_id: BOUTIQUE,
    vinted_status: 'active', created_at: jours(-40), first_seen_at: jours(-40), last_synced_at: jours(-0.01), photos: '[]' });
  await ins('inventaire', { id: 531, user_id: U, titre: 'Deux', statut: 'stock', quantite: 1, vinted_item_id: '531', vinted_account_id: BOUTIQUE,
    vinted_status: 'active', created_at: jours(-8), first_seen_at: jours(-8), last_synced_at: jours(-0.01), origine: 'vinted_sync', photos: '[]' });
  // M5 : autre boutique ; M6 : vendue des deux côtés
  await ins('inventaire', { id: 540, user_id: U, titre: 'Autre', statut: 'stock', quantite: 1, vinted_item_id: '540', vinted_account_id: '999',
    vinted_status: 'active', created_at: jours(-8), first_seen_at: jours(-8), last_synced_at: jours(-0.01), photos: '[]' });
  await ins('inventaire', { id: 550, user_id: U, titre: 'Vendue', statut: 'vendu', quantite: 0, vinted_item_id: '550', vinted_account_id: BOUTIQUE,
    vinted_status: 'sold', created_at: jours(-40), first_seen_at: jours(-40), last_synced_at: jours(-0.01), photos: '[]' });
  const MATRICE = [501, 502, 510, 511, 520, 521, 530, 531, 540, 550];
  const PARS = ['utilisateur', 'utilisateur (doublon proposé)', 'auto:photo_rapprochement_v3_remise (photo_identique)', 'ia (doublon proposé)', 'manuel'];
  const lireMatrice = async () => {
    const out = {};
    for (const a of MATRICE) for (const b of MATRICE) if (a !== b) {
      out[`rp ${a}>${b}`] = await remisePossible(a, b);
      for (const p of PARS) out[`fp ${a}>${b} ${p}`] = JSON.stringify(await essaiFusion(a, b, p));
    }
    return out;
  };
  const matriceAvant = await lireMatrice();

  await client.query(MIGRATION);
  await client.query(MIGRATION); // rejouable (la garde reconnaît sa propre version)
  verifier(true, 'la migration s\'applique, deux fois de suite');

  console.log('3. Les définitions : chaque ligne de prod gardée ; ce qui ne change pas');
  const apres = {};
  for (const n of [...Object.keys(MD5_PROD), ...Object.keys(MD5_B)]) apres[n] = await def(n);
  const pRP = lignesPerdues(avant.rapprochement_v3_remise_possible, apres.rapprochement_v3_remise_possible);
  verifier(pRP.length === 0, `rapprochement_v3_remise_possible : toutes les lignes de prod gardées, dans l'ordre (une branche insérée) — ${pRP.length} perdue(s)`);
  const pFP = lignesPerdues(avant.inventaire_fusionner_pour, apres.inventaire_fusionner_pour);
  verifier(pFP.length === 1 && /^AND \(vinted_remise_en_ligne\(g\.id, a\.id\) OR vinted_retraits_successifs\(g\.id, a\.id\)\) THEN$/.test(pFP[0]),
    `inventaire_fusionner_pour : une seule ligne de prod changée (l'échange d'identité : « OR v_remise_annulee ») — ${pFP.length}`);
  const pTB = lignesPerdues(avant.remises_en_vente_tick, apres.remises_en_vente_tick);
  verifier(pTB.length === 1 && /'hors_stock', v_hors_stock, 'jumelles', v_jumelles\);/.test(pTB[0]), `remises_en_vente_tick (de B) : seule la ligne du bilan change — ${pTB.length}`);
  const inchangees = ['vinted_remise_en_ligne', 'releve_poser_question', 'rapprochement_v3_remise_maillon', 'rapprochement_v3_appliquer', 'inventaire_doublon_decider_corps', 'inventaire_doublon_decider_ia', 'fiche_jumelle_prouvee'];
  verifier(inchangees.every((n) => md5(apres[n]) === md5(avant[n])), `inchangées (md5) : ${inchangees.join(', ')}`);
  verifier(!/CREATE OR REPLACE FUNCTION public\.(vinted_remise_en_ligne|inventaire_doublon_evaluer|inventaire_doublons_pour|doublons_fiches_a_examiner|rapprochement_v3_appliquer)\b/.test(MIGRATION),
    'les 5 appelants de vinted_remise_en_ligne (hors inventaire_fusionner_pour) et rapprochement_v3_appliquer ne sont pas réécrits');
  verifier(/v_remise_annulee := v_geste AND /.test(apres.inventaire_fusionner_pour), 'la variante ne vaut que sur le geste de la personne (v_geste)');

  console.log('4. Hors vente annulée prouvée : les mêmes sorties qu\'avant');
  const matriceApres = await lireMatrice();
  const diff = Object.keys(matriceAvant).filter((k) => matriceAvant[k] !== matriceApres[k]);
  verifier(diff.length === 0, `${Object.keys(matriceAvant).length} sorties (remise_possible, fusionner_pour × 5 signatures) identiques avant / après — ${diff.length} écart(s) ${diff.slice(0, 3).join(' ; ')}`);
  verifier(matriceApres['rp 501>502'] === null && matriceApres['rp 510>511'] === 'ancienne_vendue' && matriceApres['rp 520>521'] === 'ancienne_vendue',
    `repères : remise ordinaire = ${matriceApres['rp 501>502']} (la fusion d'avant), vraie vente = ${matriceApres['rp 510>511']}, sans preuve = ${matriceApres['rp 520>521']}`);

  console.log('5. Le passage : vente annulée prouvée + photos identiques + jamais en ligne ensemble → la QUESTION');
  // Q1 : le pull rayé (fiche 2 photos, jumelle 3, les 2 photos de la fiche dans la jumelle), annonce « sold »
  const Q1 = await ficheAnnulee(1, { photos: 2 }); await jumelle(101, Q1, { photos: 3, communes: 2 });
  // Q2 : la base a gardé l'annonce « closed » (commande annulée, règle du 17/10) — le cycliste d'Ornella
  const Q2 = await ficheAnnulee(2, { statutVinted: 'closed', motif: 'commande_annulee' }); await jumelle(102, Q2);
  // Q3 : DEUX exemplaires remis en ligne la même minute (mêmes photos) → rien
  const Q3 = await ficheAnnulee(3); await jumelle(103, Q3, { apparue: jours(-7) }); await jumelle(1030, Q3, { apparue: jours(-7) });
  // Q4 : l'ancienne revue EN LIGNE après l'apparition de la nouvelle (en ligne ensemble) → rien
  const Q4 = await ficheAnnulee(4); await jumelle(104, Q4);
  await ins('vinted_listing_snapshots', { user_id: U, vinted_item_id: Q4.vid, inventaire_id: 4, captured_at: jours(-2), status: 'active' });
  // Q5 : une commande VIVANTE sur la nouvelle fiche (vendue depuis, en cours d'expédition) → rien
  const Q5 = await ficheAnnulee(5); await jumelle(105, Q5);
  await ins('plateforme_commandes', { user_id: U, platform: 'vinted', commande_ref: '777', etat: 'a_expedier', inventaire_id: 105 });
  // Q6 : la jumelle est VENDUE → la remise se ferme (B), aucune question
  const Q6 = await ficheAnnulee(6); await jumelle(106, Q6, { statut: 'vendu' });
  // Q7 : une seule photo de chaque côté (preuve faible) → rien
  const Q7 = await ficheAnnulee(7, { photos: 1 }); await jumelle(107, Q7, { photos: 1, communes: 1 });
  // Q8 : la personne a DÉJÀ répondu « Non, deux exemplaires » sur cette paire → jamais reposée
  const Q8 = await ficheAnnulee(8); await jumelle(108, Q8);
  await ins('inventaire_doublons', { user_id: U, garde: 8, absorbe: 108, statut: 'refusee', motif: 'remise_en_ligne_photo_multi', decide_par: 'utilisateur', source: 'releve' });
  // Q9 : autre compte V, même schéma → sa question, sur SON compte seulement
  const Q9 = await ficheAnnulee(9, { user: V, boutique: '777' }); await jumelle(109, Q9, { user: V, boutique: '777' });
  // Q10 : jumelle hors ligne (fermée) → rien
  const Q10 = await ficheAnnulee(10); await jumelle(110, Q10, { enLigne: false });
  const fusionsAvant = await fusions();
  const bilan = (await q('SELECT remises_en_vente_tick(20) b'))[0].b;
  console.log('   bilan du passage :', JSON.stringify(bilan));
  const q1 = await questionsDe(1), q2 = await questionsDe(2);
  verifier(q1.length === 1 && Number(q1[0].garde) === 1 && Number(q1[0].absorbe) === 101 && q1[0].statut === 'proposee' && q1[0].motif === 'remise_en_ligne_vente_annulee'
    && q1[0].preuves.refus_fusion === 'vente_annulee_question' && q1[0].preuves.photos_communes === 2,
    'Q1 pull rayé (« sold ») : la question « Est-ce le même article ? » (gardée = l\'ancienne), motif remise_en_ligne_vente_annulee');
  verifier(q2.length === 1 && Number(q2[0].absorbe) === 102 && q2[0].statut === 'proposee', 'Q2 annonce gardée « closed » (commande annulée) : la question');
  verifier((await questionsDe(3)).length === 0, 'Q3 deux exemplaires apparus la même minute : rien');
  verifier((await questionsDe(4)).length === 0, 'Q4 en ligne ensemble : rien');
  verifier((await questionsDe(5)).length === 0, 'Q5 commande vivante sur la nouvelle fiche : rien');
  verifier((await questionsDe(6)).length === 0, 'Q6 jumelle vendue : aucune question (la remise en vente se ferme, B)');
  verifier((await questionsDe(7)).length === 0, 'Q7 une seule photo de chaque côté : rien');
  const q8 = await questionsDe(8);
  verifier(q8.length === 1 && q8[0].statut === 'refusee', 'Q8 « Non » déjà dit par la personne : jamais reposée');
  const q9 = await questionsDe(9);
  verifier(q9.length === 1 && (await q('SELECT user_id FROM inventaire_doublons WHERE garde = 9'))[0].user_id === V, 'Q9 autre compte : sa question, sur son compte');
  verifier((await questionsDe(10)).length === 0, 'Q10 jumelle hors ligne : rien');
  verifier(bilan.questions === 3, `le bilan compte 3 questions (${bilan.questions})`);
  verifier(await fusions() === fusionsAvant && await fondues() === 0, 'AUCUNE fusion, aucune fiche fondue');
  const fiches = await q(`SELECT id, statut, vinted_item_id, vinted_status, a_verifier FROM inventaire WHERE id IN (1, 101, 2, 102) ORDER BY id`);
  verifier(fiches.every((f) => f.statut === 'stock' && f.a_verifier === null), 'les deux fiches restent au stock, rien de caché ni marqué');
  const traces = await q(`SELECT metadata FROM usage_logs WHERE feature = 'remise_annulee_question_posee'`);
  verifier(traces.length === 3, `une trace par question posée (${traces.length})`);
  const rem = await q(`SELECT inventaire_id, statut, motif FROM remises_en_vente WHERE inventaire_id IN (1, 2, 6) ORDER BY inventaire_id`);
  verifier(rem.find((r) => r.inventaire_id == 1)?.motif === 'deja_en_vente_autre_fiche' && rem.find((r) => r.inventaire_id == 6)?.motif === 'vendu_sous_autre_fiche',
    'B ferme les propositions comme avant (Q1 « deja_en_vente_autre_fiche », Q6 « vendu_sous_autre_fiche »)');

  console.log('6. Le moteur sur la paire : la question, jamais la fusion');
  await q(`DELETE FROM inventaire_doublons WHERE garde = 1`);   // la paire « neuve » pour le moteur
  const m1 = (await q(`SELECT rapprochement_v3_appliquer($1, $2::jsonb, 'normal', false) r`,
    [U, JSON.stringify([{ type: 'remise_en_ligne', garde: '1', absorbe: '101', chaine: [], motif: 'photo_identique', preuve: { photo: 0 } }])]))[0].r;
  const qm = await questionsDe(1);
  verifier(m1.ok && m1.faits?.remise_en_ligne_a_verifier === 1 && !m1.faits?.remise_en_ligne && qm.length === 1 && qm[0].statut === 'proposee'
    && qm[0].preuves.refus_fusion === 'vente_annulee_question',
    `appliquer « remise_en_ligne » (la décision de FUSION) : la question, refus_fusion = vente_annulee_question (${JSON.stringify(m1.faits)})`);
  await q(`DELETE FROM inventaire_doublons WHERE garde = 2`);
  const m2 = (await q(`SELECT rapprochement_v3_appliquer($1, $2::jsonb, 'reparation', true) r`,
    [U, JSON.stringify([{ type: 'remise_en_ligne_a_verifier', garde: '2', absorbe: '102', motif: 'remise_en_ligne_vente_annulee', preuves: {} }])]))[0].r;
  verifier(m2.faits?.remise_en_ligne_a_verifier === 1 && (await questionsDe(2)).length === 1, 'appliquer « remise_en_ligne_a_verifier » (réparation, geste) : la question');
  verifier(await fusions() === fusionsAvant && await fondues() === 0, 'toujours AUCUNE fusion');
  const auto = await essaiFusion(1, 101, 'auto:photo_rapprochement_v3_remise (photo_identique)');
  const ia = await essaiFusion(1, 101, 'ia (doublon proposé)');
  verifier(auto.ok === false && auto.reason === 'deux_annonces_meme_plateforme' && ia.ok === false && ia.reason === 'deux_annonces_meme_plateforme',
    `fusion automatique (moteur, IA) sur la paire : refusée comme avant (${auto.reason}, ${ia.reason})`);
  const iaOui = (await q(`SELECT inventaire_doublon_decider_ia($1, 'oui', 'preuve') r`, [qm[0].id]))[0].r;
  verifier(iaOui.ok === false && (await questionsDe(1))[0].statut === 'proposee', `l'IA qui dit « oui » : refus (${iaOui.reason}), la question reste à la personne`);
  // un compte qui n'a jamais dit « Non » (V) : l'IA est arrêtée par sa garde « deux fiches Vinted »
  const iaV = (await q(`SELECT inventaire_doublon_decider_ia($1, 'oui', 'preuve') r`, [(await questionsDe(9))[0].id]))[0].r;
  verifier(iaV.ok === false && iaV.reason === 'deux_annonces_meme_plateforme' && (await questionsDe(9))[0].statut === 'proposee'
    && (await q('SELECT fusionne_dans FROM inventaire WHERE id IN (9, 109)')).every((r) => r.fusionne_dans === null),
    `compte V : l'IA qui dit « oui » est refusée (${iaV.reason}), rien n'est fondu`);

  console.log('7. Le « Oui » de la personne : la fusion ; le « Non » : rien');
  const oui = (await q(`SELECT inventaire_doublon_decider_corps($1, $2, 'oui', NULL) r`, [U, qm[0].id]))[0].r;
  const g1 = (await q('SELECT vinted_item_id, vinted_status, fusionne_dans FROM inventaire WHERE id = 1'))[0];
  const a1 = (await q('SELECT vinted_item_id, vinted_status, fusionne_dans FROM inventaire WHERE id = 101'))[0];
  verifier(oui.ok === true && oui.champs_repris?.vinted_identite?.echange === true && g1.vinted_item_id === String(9_500_000_101) && g1.vinted_status === 'active'
    && g1.fusionne_dans === null && Number(a1.fusionne_dans) === 1 && a1.vinted_item_id === Q1.vid && a1.vinted_status === 'sold',
    'Q1 « Oui » : fusion (gardée = l\'ancienne fiche), l\'annonce Vinted VIVANTE passe à la gardée, l\'ancienne reste sur la fondue');
  verifier((await questionsDe(1))[0].statut === 'fusionnee' && (await q(`SELECT par FROM inventaire_fusions WHERE garde = 1`))[0]?.par === 'utilisateur (doublon proposé)',
    'la question est « fusionnee », la fusion signée par le geste de la personne');
  const q2id = (await questionsDe(2))[0].id;
  const non = (await q(`SELECT inventaire_doublon_decider_corps($1, $2, 'non', NULL) r`, [U, q2id]))[0].r;
  verifier(non.ok && (await questionsDe(2))[0].statut === 'refusee' && (await q('SELECT fusionne_dans FROM inventaire WHERE id IN (2, 102)')).every((r) => r.fusionne_dans === null),
    'Q2 « Non » : deux exemplaires, rien n\'est regroupé');

  console.log('8. Idempotence, puis l\'inverse');
  const etat = async () => JSON.stringify(await q('SELECT id, garde, absorbe, statut, decide_par FROM inventaire_doublons ORDER BY garde, absorbe'))
    + JSON.stringify(await q('SELECT id, statut, motif, traite_le FROM remises_en_vente ORDER BY id'));
  const etatAvant = await etat(); const logsAvant = (await q('SELECT count(*)::int n FROM usage_logs'))[0].n;
  const b2 = (await q('SELECT remises_en_vente_tick(20) b'))[0].b;
  verifier(await etat() === etatAvant && (await q('SELECT count(*)::int n FROM usage_logs'))[0].n === logsAvant && b2.questions === 0,
    'second passage : rien de plus (aucune question reposée, aucune ligne réécrite)');
  // une question encore ouverte (Q9) et deux répondues (Q1 « Oui », Q2 « Non ») avant l'inverse
  await client.query(INVERSE);
  const rendu = {};
  for (const n of ['rapprochement_v3_remise_possible', 'inventaire_fusionner_pour', 'remises_en_vente_tick']) rendu[n] = md5(await def(n));
  verifier(rendu.rapprochement_v3_remise_possible === MD5_PROD.rapprochement_v3_remise_possible && rendu.inventaire_fusionner_pour === MD5_PROD.inventaire_fusionner_pour
    && rendu.remises_en_vente_tick === MD5_B.remises_en_vente_tick, 'l\'inverse rend les définitions de prod (et le tick de B) à l\'identique (md5)');
  verifier((await q(`SELECT count(*)::int n FROM pg_proc WHERE proname = ANY($1)`, [NOUVELLES]))[0].n === 0, 'les quatre fonctions nouvelles sont retirées');
  verifier((await questionsDe(9)).length === 0 && (await questionsDe(1))[0]?.statut === 'fusionnee' && (await questionsDe(2))[0]?.statut === 'refusee',
    'la question encore ouverte est retirée ; les réponses de la personne restent');
  const b3 = (await q('SELECT remises_en_vente_tick(20) b'))[0].b;
  verifier(b3.questions === undefined && b3.issue === 'tour', 'après l\'inverse, le tick de B tourne comme avant');
} catch (e) {
  ko++; console.error('ERREUR', e.message);
} finally {
  await client.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(`\n${ok} vérifiés, ${ko} en échec`);
process.exit(ko ? 1 : 0);
