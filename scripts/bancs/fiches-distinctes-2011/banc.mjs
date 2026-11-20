// BANC de la migration 20261120120000_fiches_distinctes_jamais_bloquees — jouée dans un vrai Postgres JETABLE
// (PGlite, en mémoire), jamais sur la prod (décision de Nico du 03/11).
//
//   npm i --no-save @electric-sql/pglite@0.3.16     (une fois ; rien n'entre dans package.json)
//   node scripts/bancs/fiches-distinctes-2011/banc.mjs
//
// Ce qu'il prouve, sur le cas de thecloset72000 (20/11, deux jeans Wrangler #409C14 / #407C15) :
//   · AVANT (définition de prod, l'INVERSE) : une question « Est-ce le même article ? » ouverte vers une AUTRE fiche
//     en ligne fait refuser la publication (already_published + meme_objet), aucun job créé ;
//   · APRÈS (la migration) : la même publication passe (allowed: true), le job est créé, et la question voyage en
//     avertissement (avertissement_meme_objet) ;
//   · les vrais refus restent : la MÊME fiche déjà en file → already_published, aucun job de plus ;
//   · la garde md5 de la migration refuse de rejouer sur une définition qui a changé ;
//   · l'INVERSE remet le comportement d'avant.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { referencesVendeur, referencesDifferentes } from '../../../supabase/functions/_shared/rapprochement/texte.js';

let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); } catch {
  console.error('PGlite absent : npm i --no-save @electric-sql/pglite@0.3.16'); process.exit(2);
}
const lire = (rel) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');
const MIGRATION = lire('supabase/migrations/20261120120000_fiches_distinctes_jamais_bloquees.sql');
const INVERSE = lire('supabase/rollbacks/20261120120000_fiches_distinctes_jamais_bloquees_INVERSE.sql');

let ko = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) ko++; };
const db = new PGlite();
const q = async (sql, p) => (await db.query(sql, p)).rows;
const U = '8ac5bbda-0947-4612-82fd-effdaa3ca84a';

// ── Bouchons : seulement ce que les chemins joués lisent ──────────────────────
await db.exec(`
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TABLE profiles (id uuid PRIMARY KEY, ebay_voie_api boolean, extension_last_seen_at timestamptz, lang text,
                         is_business boolean, is_pro boolean, is_premium boolean, is_comped boolean);
  CREATE TABLE ebay_accounts (user_id uuid, revoked_at timestamptz, fulfillment_policy_id text, payment_policy_id text,
                              return_policy_id text, seller_state jsonb);
  CREATE TABLE platform_health (platform text, paused boolean, message_fr text, message_en text);
  CREATE TABLE coin_config (key text PRIMARY KEY, value integer);
  INSERT INTO coin_config VALUES ('price_original', 0), ('price_per_platform', 0);
  CREATE TABLE coin_wallets (user_id uuid PRIMARY KEY, included_balance int DEFAULT 0, purchased_balance int DEFAULT 0,
                             reserved_balance int DEFAULT 0, next_grant_at timestamptz, updated_at timestamptz);
  CREATE TABLE coin_reservations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, amount int, unit_price int,
                                  from_included int, from_purchased int, job_count int, photo_option text);
  CREATE TABLE coin_ledger (user_id uuid, delta int, included_after int, purchased_after int, kind text, metadata jsonb);
  CREATE TABLE usage_logs (user_id uuid, feature text, metadata jsonb, created_at timestamptz DEFAULT now());
  CREATE TABLE inventaire (id bigint PRIMARY KEY, user_id uuid, titre text, statut text DEFAULT 'stock', quantite int DEFAULT 1,
                           fusionne_dans bigint, a_verifier timestamptz, photos jsonb);
  CREATE TABLE cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
                                status text, action text DEFAULT 'publish', photo_option text, title text, description text,
                                price numeric, photos jsonb, platform_fields jsonb, reservation_id uuid,
                                platform_listing_id text, listing_url text, published_at timestamptz,
                                created_at timestamptz DEFAULT now());
  CREATE TABLE inventaire_doublons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, garde bigint, absorbe bigint,
                                    statut text, motif text, created_at timestamptz DEFAULT now());
  CREATE TABLE fiches_liees_comptes (fiche_a bigint, fiche_b bigint, user_a uuid, user_b uuid);
  CREATE FUNCTION jumelle_occupe_plateformes(uuid, bigint) RETURNS TABLE(platform text) LANGUAGE sql AS $$ SELECT NULL::text WHERE false $$;
  CREATE FUNCTION lbc_adresse_hors_france(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION annonce_id_de_job(text, text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
  CREATE FUNCTION jauges_actives() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  -- doublon_attribut_distinctif : couleurs et nombres neutres ici (seule la référence est jouée).
  CREATE FUNCTION doublon_couleurs(text, text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT '{"multi": false, "base": [], "nuance": []}'::jsonb $$;
  CREATE FUNCTION doublon_nombres(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT '{}'::text[] $$;
  -- publication_fiche_en_ligne réduite aux jobs (le chemin joué ici) ; publication_meme_objet_en_ligne : celle de PROD.
  CREATE FUNCTION publication_fiche_en_ligne(p_user uuid, p_fiche bigint, p_platform text) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.inventaire_id = p_fiche AND c.user_id = p_user AND c.platform = p_platform
                     AND c.status IN ('pending','processing','needs_user','published')) $$;
  CREATE FUNCTION publication_meme_objet_en_ligne(p_user uuid, p_fiche bigint, p_platform text) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object('question', q.id, 'fiche', y.id::text, 'titre', y.titre, 'platform', p_platform, 'motif', q.motif,
                              'a_verifier', (x.a_verifier IS NOT NULL OR y.a_verifier IS NOT NULL))
      FROM inventaire x
      JOIN inventaire_doublons q ON q.user_id = p_user AND q.statut = 'proposee' AND q.motif = 'photo_identique'
                                AND (q.garde = x.id OR q.absorbe = x.id)
      JOIN inventaire y ON y.id = CASE WHEN q.garde = x.id THEN q.absorbe ELSE q.garde END
     WHERE x.id = p_fiche AND x.user_id = p_user AND x.fusionne_dans IS NULL AND x.statut = 'stock' AND COALESCE(x.quantite, 1) <= 1
       AND p_platform IS NOT NULL
       AND y.user_id = p_user AND y.id <> x.id AND y.fusionne_dans IS NULL AND y.statut = 'stock' AND COALESCE(y.quantite, 1) <= 1
       AND publication_fiche_en_ligne(p_user, y.id, p_platform)
       AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['vinted', 'leboncoin', 'ebay', 'beebs', 'depop', 'opla']) AS pf
                        WHERE publication_fiche_en_ligne(p_user, x.id, pf) AND publication_fiche_en_ligne(p_user, y.id, pf))
     ORDER BY q.created_at, q.id LIMIT 1 $$;
`);
await db.query(`INSERT INTO profiles (id, lang, is_business) VALUES ($1, 'fr', true)`, [U]);
await db.query(`INSERT INTO inventaire (id, user_id, titre) VALUES
  (1795156645552, $1, 'Wrangler Taille W42 L30 FR 42 Homme Jean Bleu Coupe Droite #409C14'),
  (1795101900457, $1, 'Jean Wrangler Hero Vintage 90s Y2K Coupe Droite Bleu W42 L30 (FR 52) 100% Coton #407C15')`, [U]);
await db.query(`INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status) VALUES
  ($1, 1795101900457, 'vinted', 'published'), ($1, 1795101900457, 'leboncoin', 'published')`, [U]);
await db.query(`INSERT INTO inventaire_doublons (user_id, garde, absorbe, statut, motif) VALUES ($1, 1795156645552, 1795101900457, 'proposee', 'photo_identique')`, [U]);
await db.exec(`SET request.jwt.claim.sub = '${U}'`);

const JOBS = JSON.stringify(['vinted', 'leboncoin'].map((p) => ({ platform: p, inventaire_id: '1795156645552', title: 'Wrangler #409C14', price: '20', photos: [] })));
const publier = async () => (await q(`SELECT spend_coins_and_publish('original', $1::jsonb) r`, [JOBS]))[0].r;
const nJobs = async () => Number((await q(`SELECT count(*) n FROM cross_post_jobs WHERE inventaire_id = 1795156645552`))[0].n);

console.log('\n1. AVANT (définition de prod)');
await db.exec(INVERSE);
const md5Prod = (await q(`SELECT md5(pg_get_functiondef('public.spend_coins_and_publish(text, jsonb)'::regprocedure)) m`))[0].m;
let r = await publier();
ok(r.allowed === false && r.reason === 'already_published' && r.meme_objet && Object.keys(r.meme_objet).length === 2,
  `la question vers l'autre fiche refuse les 2 plateformes (${r.reason})`);
ok(await nJobs() === 0, 'aucun job créé');
const A = 'Wrangler Taille W42 L30 FR 42 Homme Jean Bleu Coupe Droite #409C14';
const B = 'Jean Wrangler Hero Vintage 90s Y2K Coupe Droite Bleu W42 L30 (FR 52) 100% Coton #407C15';
const distinctif = async (a, b) => (await q(`SELECT doublon_attribut_distinctif($1, $2) r`, [a, b]))[0].r;
ok(await distinctif(A, B) === null, 'avant : #409C14 / #407C15 ne sont pas écartés par la base');

console.log('\n2. LA MIGRATION');
// La garde md5 compare au md5 de PROD : la définition rechargée ici depuis l'INVERSE doit avoir le même md5.
ok(md5Prod === '5e5a9084a5c7e8c58259c054acc8bf85', `l'INVERSE redonne la définition de prod à l'octet (md5 ${md5Prod})`);
await db.exec(MIGRATION);
r = await publier();
ok(r.allowed === true, 'la publication passe (allowed: true)');
ok(r.avertissement_meme_objet && r.avertissement_meme_objet.vinted?.fiche === '1795101900457', 'la question voyage en avertissement, non bloquant');
ok(await nJobs() === 2, '2 jobs créés (Vinted, Leboncoin)');
ok(await distinctif(A, B) === 'reference', 'la base écarte #409C14 / #407C15 (reference)');
ok(await distinctif(A, A.replace('Homme ', '')) === null, 'même référence : pas écartés');
ok(await distinctif('Robe #Y2K', 'Robe #90s') === null && await distinctif('Jean #409C14', 'Jean') === null,
  'hashtag / une seule référence : pas écartés');
// Parité JS ↔ SQL sur le corpus des fixtures (titres et descriptions réels)
const chaines = new Set();
const rec = (v) => {
  if (typeof v === 'string') { if (v.length >= 3 && v.length <= 400) chaines.add(v); }
  else if (Array.isArray(v)) v.forEach(rec);
  else if (v && typeof v === 'object') Object.values(v).forEach(rec);
};
const parcourir = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (e.name.endsWith('.json') && statSync(p).size < 5e6) { try { rec(JSON.parse(readFileSync(p, 'utf8'))); } catch { /* fichier illisible : ignoré */ } }
  }
};
parcourir(fileURLToPath(new URL('../../fixtures', import.meta.url)));
for (const x of ['Pull réf. 12345', 'Sac SKU: AB-123', 'Réf N° 4521', 'REFERENCE 501', 'Jean #40-7C15', 'Carte #025 Pikachu', 'risku 123', 'Lot #1 #2',
  'Wrangler W42 #409C14', 'Jean Hero #407C15 coton', 'Pokémon #025/165 holo', 'ref:ABC-12 bleu', 'Référence: 12-AB', 'Ref.N°123', '#A1 #12 #9X9',
  'SKU 9X', 'Robe #Y2K #90s', 'Basket RÉF 4410 noir', 'Montre réf.116610LN', 'Lot #12-34 et #56', 'préférence 123', 'Sweat #ab12cd34ef56gh78']) chaines.add(x);
const C = [...chaines];
const sqlRefs = new Map((await q(`SELECT t, doublon_references(t) r FROM unnest($1::text[]) t`, [C])).map((x) => [x.t, x.r]));
const cle = (arr) => JSON.stringify([...arr].sort());
const ecarts = C.filter((t) => cle(referencesVendeur(t)) !== cle(sqlRefs.get(t) ?? []));
ok(ecarts.length === 0, `références : JS et SQL d'accord sur ${C.length} textes`
  + (ecarts.length ? ' — écarts : ' + ecarts.slice(0, 5).map((t) => `${JSON.stringify(t)} JS=${[...referencesVendeur(t)]} SQL=${sqlRefs.get(t)}`).join(' | ') : ''));
const avecRef = C.filter((t) => referencesVendeur(t).size > 0);
ok(avecRef.length > 0, `corpus : ${avecRef.length} textes portent une référence`);
let paires = 0, desaccords = 0;
for (let i = 0; i < avecRef.length && paires < 400; i++) {
  const a = avecRef[i], b = avecRef[(i * 7 + 3) % avecRef.length];
  paires++;
  if ((await distinctif(a, b) === 'reference') !== referencesDifferentes(a, b)) desaccords++;
}
ok(desaccords === 0, `verdict « reference » identique JS / SQL sur ${paires} paires`);
r = await publier();
ok(r.allowed === false && r.reason === 'already_published' && !r.meme_objet, 'la MÊME fiche en file : toujours refusée (already_published, sans meme_objet)');
ok(await nJobs() === 2, 'aucun job de plus');
const rejoue = await db.exec(MIGRATION).then(() => null, (e) => String(e.message));
ok(/a changé en prod/.test(rejoue ?? ''), 'la garde md5 refuse de rejouer la migration sur une définition changée');
await db.query(`DELETE FROM cross_post_jobs WHERE inventaire_id = 1795156645552`);
const sansQuestion = JSON.stringify([{ platform: 'ebay', inventaire_id: '1795101900457', title: 'x', price: '1', photos: [] }]);
r = (await q(`SELECT spend_coins_and_publish('original', $1::jsonb) r`, [sansQuestion]))[0].r;
ok(r.allowed === true && !('avertissement_meme_objet' in r), 'sans question : réponse identique à avant (aucune clé ajoutée)');

console.log("\n3. L'INVERSE");
await db.exec(INVERSE);
await db.query(`DELETE FROM cross_post_jobs WHERE inventaire_id IN (1795156645552) OR (inventaire_id = 1795101900457 AND platform = 'ebay')`);
r = await publier();
ok(r.allowed === false && r.reason === 'already_published' && r.meme_objet, "l'inverse remet le refus d'avant");
ok(await distinctif(A, B) === null && Number((await q(`SELECT count(*) n FROM pg_proc WHERE proname = 'doublon_references'`))[0].n) === 0,
  "l'inverse remet doublon_attribut_distinctif d'avant et retire doublon_references");

console.log(ko ? `\n✗ ${ko} échec(s)` : '\n✓ banc vert');
process.exit(ko ? 1 : 0);
