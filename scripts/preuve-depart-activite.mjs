// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261104200000_depart_activite_anonyme (04/11, point 8) : au départ
// d'un compte, `enregistrer_depart` garde ce que FillSell a fait, en chiffres ANONYMES, par plateforme.
//
//   PREUVE_PG=embarque node scripts/preuve-depart-activite.mjs   (Postgres 17 jetable sur le PC ; embedded-postgres et pg
//   déjà dans node_modules — sinon : npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3)
//
// Jamais la prod (refus si l'URL est celle de Supabase). La fonction réécrite part de la définition EN PROD (relue le
// 04/11, identique à 20261006090000, appliquée ici d'abord) ; le reste (palier_de, auth.users) est un bouchon.
import pg from 'pg';
import { readFileSync } from 'node:fs';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-depart-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55441, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55441/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $f$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, username text, extension_last_seen_at timestamptz,
  extension_version text, extension_sessions jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.ebay_accounts (user_id uuid, revoked_at timestamptz);
CREATE TABLE public.inventaire (id bigserial PRIMARY KEY, user_id uuid, fusionne_dans bigint);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, platform text, status text,
  action text, title text, platform_listing_id text, listing_url text, error text, voie text,
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz, platform_fields jsonb DEFAULT '{}'::jsonb);
CREATE OR REPLACE FUNCTION public.palier_de(u uuid) RETURNS text LANGUAGE sql STABLE AS $f$ SELECT 'free'::text $f$;
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let ko = 0, n = 0;
const ok = (cond, msg, detail) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`); } };
const sous = async (uid, fn) => {
  await c.query('BEGIN');
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await c.query('SET LOCAL ROLE authenticated');
  try { const r = await fn(); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK'); throw e; }
};

try {
  await c.query(DECOR);
  await c.query(lire('../supabase/migrations/20261006090000_departs_compte.sql'));
  await c.query(lire('../supabase/migrations/20261104200000_depart_activite_anonyme.sql'));
  await c.query('GRANT USAGE ON SCHEMA public, auth TO authenticated');

  const U = '11111111-1111-1111-1111-111111111111';
  await c.query(`INSERT INTO auth.users (id, created_at) VALUES ($1, now() - interval '3 hours')`, [U]);
  await c.query(`INSERT INTO profiles (id, email, username, extension_version, extension_sessions)
                 VALUES ($1, 'marine.dupont@exemple.fr', 'marinedu75', '0.6.169', '{"vinted":"true"}')`, [U]);
  await c.query(`INSERT INTO inventaire (user_id) SELECT $1 FROM generate_series(1, 4)`, [U]);
  const job = (o) => c.query(`INSERT INTO cross_post_jobs (user_id, platform, status, action, title, platform_listing_id, listing_url, error, voie,
                                created_at, published_at, platform_fields)
                              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12::jsonb)`,
    [U, o.platform, o.status, o.action, o.title ?? null, o.id ?? null, o.url ?? null, o.error ?? null, o.voie ?? null,
      o.created, o.published ?? null, JSON.stringify(o.pf ?? {})]);
  // Vinted : 2 publications faites, 1 republication faite, 1 retrait, 1 annulée, 1 en échec (adresse, titre, e-mail dans le texte).
  await job({ platform: 'vinted', status: 'published', action: 'publish', title: 'Basket Asics Gel-Lethal', id: '7012345678',
    url: 'https://www.vinted.fr/items/7012345678-basket', created: '2026-11-03T13:00:00Z', published: '2026-11-03T13:02:30Z' });
  await job({ platform: 'vinted', status: 'published', action: 'publish', title: 'Pyjama 36 mois', id: '7012345699',
    created: '2026-11-03T13:05:00Z', published: '2026-11-03T13:07:00Z' });
  await job({ platform: 'vinted', status: 'published', action: 'republish', title: 'Pyjama 36 mois', id: '7012349999',
    created: '2026-11-03T14:00:00Z', published: '2026-11-03T14:03:00Z',
    pf: { erreurs_archivees: [
      { erreur: 'En file : ta republication passera à son tour, une à la fois.', le: '2026-11-03T13:59:00Z', statut: 'pending' },
      { erreur: "En attente : ton annonce « Pyjama 36 mois » a été retirée et n'est pas encore revenue en ligne.", le: '2026-11-03T13:59:30Z', statut: 'pending' },
      { erreur: "L'onglet de dépôt n'a pas répondu sur ton ordinateur (Pyjama 36 mois, 45 s) : nouvel essai tout seul.", le: '2026-11-03T14:01:00Z', statut: 'processing' },
    ] } });
  await job({ platform: 'vinted', status: 'deleted', action: 'delete', title: 'Robe Tjin', id: '7012340000', created: '2026-11-03T15:00:00Z' });
  await job({ platform: 'vinted', status: 'cancelled', action: 'publish', title: 'Jean Lee', created: '2026-11-03T15:10:00Z' });
  await job({ platform: 'vinted', status: 'failed', action: 'publish', title: 'Veste Adidas Originals', voie: 'cloud',
    error: 'Adresse "Via CANALE 24 C 16035 RAPALLO" refusée par Vinted pour veste adidas originals ; écris à marine.dupont@exemple.fr ou vois https://www.vinted.fr/help/123',
    created: '2026-11-03T15:20:00Z',
    pf: { last_diagnostic: { quoi: 'refus_adresse', detail: 'POST /api/v2/item_upload/items 400 marinedu75', at: '2026-11-03T15:21:10Z' } } });
  // eBay par l'API : une publication en attente d'un geste, diagnostic en texte.
  await job({ platform: 'ebay', status: 'needs_user', action: 'publish', title: 'Montre Casio', voie: 'api',
    error: "eBay demande tes conditions de vente « Montre Casio » avant d'accepter l'annonce",
    created: '2026-11-03T16:00:00Z', pf: { last_diagnostic: 'compte_pas_pret — conditions (ebay.fr/bp/manage) item 1234567' } });

  console.log('1. erreur_anonyme : rien de la personne ni de l\'annonce');
  const anon = async (t, mots) => (await c.query('SELECT erreur_anonyme($1, $2) r', [t, mots])).rows[0].r;
  ok(await anon('Titre « Sac Kevin » refusé', []) === 'Titre «…» refusé', 'une citation « … » disparaît');
  ok(await anon('Adresse "Via CANALE 24 C 16035 RAPALLO', []) === 'Adresse "…"', 'une citation coupée avant le guillemet fermant disparaît aussi');
  ok(await anon('Vu sur https://x.fr/a?b=1 par a.b@c.fr', []) === 'Vu sur <lien> par <e-mail>', 'liens et e-mails effacés');
  ok(await anon('annonce 7012345678 à 999 €', []) === 'annonce # à # €', 'tous les chiffres effacés');
  ok(await anon('Erreur sur BASKET asics pour marinedu75', ['Basket Asics', 'marinedu75']) === 'Erreur sur … pour …', 'titre et pseudo effacés mot pour mot, casse ignorée');
  ok((await anon('x'.repeat(400), [])).length === 160, '160 caractères au plus');
  ok(await anon(null, null) === null && await anon('   ', []) === null, 'rien → rien');

  console.log('2. enregistrer_depart sous le compte qui part');
  const r = await sous(U, () => c.query(`SELECT enregistrer_depart('autre', 'mon compte Vinted vient d''être supprimé', 'android', '2.9.160') ok`));
  ok(r.rows[0].ok === true, 'la réponse est enregistrée');
  const ligne = (await c.query('SELECT * FROM departs_compte ORDER BY id DESC LIMIT 1')).rows[0];
  const a = ligne.activite;
  ok(a && a.version === 1 && a.plateformes, 'la colonne activite est remplie', JSON.stringify(a));
  const v = a.plateformes.vinted;
  ok(v.publications === 2 && v.republications === 1 && v.retraits === 1 && v.taches === 6 && v.annulees === 1 && v.en_file === 0,
    'Vinted : 2 publications, 1 republication, 1 retrait, 6 tâches, 1 annulée', JSON.stringify(v));
  ok(v.voies.extension === 5 && v.voies.cloud === 1, 'Vinted : tâches par voie', JSON.stringify(v.voies));
  ok(v.premiere_action === '2026-11-03 14:00' && v.premiere_mise_en_ligne === '2026-11-03 14:02' && v.derniere_mise_en_ligne === '2026-11-03 15:03',
    'dates à la minute, heure de Paris', JSON.stringify(v));
  ok(v.derniere_action === '2026-11-03 16:21', 'la dernière action compte la dernière erreur', v.derniere_action);
  ok(v.erreurs === 2, 'Vinted : 2 erreurs (les messages « En file » / « En attente » ne comptent pas)', v.erreurs);
  ok(v.dernieres_erreurs.length === 2 && v.dernieres_erreurs[0].statut === 'failed' && v.dernieres_erreurs[0].le === '2026-11-03 16:21',
    'les dernières erreurs, la plus récente d\'abord', JSON.stringify(v.dernieres_erreurs));
  ok(v.dernieres_erreurs[0].diagnostic === 'refus_adresse — POST /api/v#/item_upload/items # …', 'le diagnostic technique est gardé, anonyme', v.dernieres_erreurs[0].diagnostic);
  const e = a.plateformes.ebay;
  ok(e.publications === 0 && e.erreurs === 1 && e.voies.api === 1 && /compte_pas_pret/.test(e.dernieres_erreurs[0].diagnostic),
    'eBay par l\'API : l\'attente d\'un geste et son diagnostic', JSON.stringify(e));
  const texte = JSON.stringify(a);
  const interdits = ['Basket', 'Asics', 'Pyjama', 'Robe', 'Tjin', 'Jean Lee', 'Veste', 'adidas', 'Montre', 'Casio', 'CANALE', 'RAPALLO',
    'marine', 'dupont', 'exemple.fr', 'marinedu75', 'vinted.fr', '7012', '16035', '1234567', U];
  const fuites = interdits.filter((m) => texte.toLowerCase().includes(m.toLowerCase()));
  ok(fuites.length === 0, 'aucun titre, numéro, lien, adresse, e-mail ni pseudo dans le résumé', fuites.join(', ') + ' — ' + texte);
  ok(Object.keys(ligne).every((k) => !/user|mail|email|uid/.test(k)), 'aucune colonne qui désigne la personne');

  console.log('3. Les portes');
  const refuse = async (sql) => { try { await sous(U, () => c.query(sql)); return false; } catch { return true; } };
  ok(await refuse(`SELECT activite_anonyme_depart('${U}')`), 'activite_anonyme_depart : jamais appelable par authenticated');
  ok(await refuse(`SELECT erreur_anonyme('x', '{}')`), 'erreur_anonyme : jamais appelable par authenticated');
  ok(await refuse('SELECT * FROM departs_compte'), 'departs_compte : aucune lecture client');
  const r2 = await sous(U, () => c.query(`SELECT enregistrer_depart('autre', null, 'web', null) ok`));
  ok(r2.rows[0].ok === false && Number((await c.query('SELECT count(*) n FROM departs_compte')).rows[0].n) === 1, 'une seule réponse par compte (garde inchangée)');

  console.log('4. Un résumé qui casse ne bloque rien');
  const U2 = '22222222-2222-2222-2222-222222222222';
  await c.query(`INSERT INTO auth.users (id) VALUES ($1)`, [U2]);
  await c.query(`INSERT INTO profiles (id, email) VALUES ($1, 'x@y.z')`, [U2]);
  await c.query('ALTER TABLE cross_post_jobs RENAME TO cross_post_jobs_cache');
  const r3 = await sous(U2, () => c.query(`SELECT enregistrer_depart('trop_cher', null, 'ios', '2.9.160') ok`));
  await c.query('ALTER TABLE cross_post_jobs_cache RENAME TO cross_post_jobs');
  const l3 = (await c.query('SELECT * FROM departs_compte ORDER BY id DESC LIMIT 1')).rows[0];
  ok(r3.rows[0].ok === true && l3.motif === 'trop_cher' && l3.activite === null, 'table illisible : la réponse est gardée, activite vide');
  const U3 = '33333333-3333-3333-3333-333333333333';
  await c.query(`INSERT INTO auth.users (id) VALUES ($1)`, [U3]);
  await sous(U3, () => c.query(`SELECT enregistrer_depart(null, null, null, null)`));
  const l4 = (await c.query('SELECT activite FROM departs_compte ORDER BY id DESC LIMIT 1')).rows[0];
  ok(JSON.stringify(l4.activite) === '{"version":1,"plateformes":{}}', 'compte sans tâche ni profil : résumé vide, pas d\'erreur', JSON.stringify(l4.activite));
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); try { embarque.rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* */ } }
}
console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n}`);
process.exit(ko ? 1 : 0);
