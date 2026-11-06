// PREUVE, SUR UN POSTGRES JETABLE, des scripts de l'essai AX42 (06/11/2026, décisions 2 et 5 de Nico) :
//   scripts/reparations/20261106_cloud_essai_ax42_bascule_nico.sql (+ _INVERSE) — Nico de cloud-2 vers cloud-3 et retour ;
//   scripts/reparations/20261106_cloud_essai_ax42_retrait_cloud3.sql (+ _INVERSE) — cloud-3 « retire » et retour.
//
//   PREUVE_PG=embarque node scripts/cloud/preuve-bascule-ax42.mjs   (Postgres 17 jetable sur le PC, comme
//   scripts/cloud/preuve-voie-place-attente.mjs ; embedded-postgres et pg sont dans node_modules)
//
// Jamais la prod (refus si l'URL est celle de Supabase). cloud_serveur_battre et cloud_serveur_choisir sont ceux de la
// PROD (scripts/cloud/fixtures/prod-0611-cloud-flotte.sql, pg_get_functiondef du 06/11) ; le reste est un décor réduit
// aux colonnes que les scripts lisent ou écrivent.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-ax42-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55438, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55438/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const RELECTURE = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY CHECK (nom ~ '^[a-z0-9][a-z0-9-]{0,40}$'), domaine text, ipv4 inet,
  capacite integer NOT NULL DEFAULT 0 CHECK (capacite >= 0), ouverts integer NOT NULL DEFAULT 0 CHECK (ouverts >= 0),
  comptes integer NOT NULL DEFAULT 0 CHECK (comptes >= 0),
  etat text NOT NULL DEFAULT 'actif' CHECK (etat = ANY (ARRAY['actif','en_creation','retire'])), vu_le timestamptz, details jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, serveur text, conteneur text,
  etat text CHECK (etat = ANY (ARRAY['eteint','demarrage','actif','arret','erreur'])), session_fillsell_id uuid, derniere_erreur text,
  details jsonb DEFAULT '{}'::jsonb, maj_le timestamptz);
CREATE TABLE public.cloud_coffre (user_id uuid, plateforme text, chiffre text, iv text, cle_version int, connecte boolean, maj_le timestamptz,
  PRIMARY KEY (user_id, plateforme));
CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, etat text, user_id uuid);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text);
-- Bouchons : les comptes à servir (Nico + relecture), les places libres (un nombre, rien d'autre).
CREATE FUNCTION public.cloud_comptes_a_servir() RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE AS
  $f$ SELECT unnest(ARRAY['${NICO}'::uuid, '${RELECTURE}'::uuid]) $f$;
CREATE FUNCTION public.cloud_places_libres() RETURNS integer LANGUAGE sql STABLE AS
  $f$ SELECT COALESCE(sum(capacite - comptes) FILTER (WHERE etat = 'actif'), 0)::int FROM public.cloud_serveurs $f$;
`;
// L'état du 06/11 vers 14:05 (relu en prod) : Nico actif sur cloud-2, IP 42, coffre de 5 lignes ; cloud-1 vivant sans compte.
const ETAT = String.raw`
INSERT INTO auth.users VALUES ('${NICO}', 'nico@exemple'), ('${RELECTURE}', 'test@fillsell.app');
INSERT INTO public.cloud_serveurs (nom, domaine, capacite, comptes, ouverts, etat, vu_le) VALUES
  ('cloud-1', 'cloud.fillsell.app', 7, 0, 0, 'actif', now()), ('cloud-2', 'cloud-2.fillsell.app', 30, 2, 2, 'actif', now());
INSERT INTO public.cloud_postes (user_id, serveur, conteneur, etat, details, maj_le) VALUES
  ('${NICO}', 'cloud-2', 'fs-nav-${NICO}', 'actif',
   '{"serveur":"cloud-2","profil":"p-f44b5917-1443a482c05b","ouvert_sur":{"serveur":"cloud-2","ip_id":42,"mode":"dediee"},"erreur":"vieille"}', now()),
  ('${RELECTURE}', 'cloud-2', NULL, 'actif', '{"serveur":"cloud-2","profil":"p-d6a9e726-aaaaaaaaaaaa"}', now());
INSERT INTO public.cloud_coffre VALUES
  ('${NICO}','vinted','c1','i1',2,true,now()), ('${NICO}','leboncoin','c2','i2',2,true,now()), ('${NICO}','depop','c3','i3',2,true,now()),
  ('${NICO}','beebs','c4','i4',2,true,now()), ('${NICO}','fillsell','c5','i5',2,true,now());
INSERT INTO public.cloud_ips VALUES (42, 'attribuee_client', '${NICO}'), (39, 'disponible', NULL);
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
async function script(f) {
  try { const r = await c.query(lire(`../reparations/${f}`)); return { ok: true, r }; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, erreur: e.message }; }
}
const un = async (q, p) => (await c.query(q, p)).rows[0];
const poste = () => un(`SELECT serveur, etat, conteneur, details FROM public.cloud_postes WHERE user_id = $1`, [NICO]);
const coffre = async () => (await c.query(`SELECT plateforme, chiffre FROM public.cloud_coffre WHERE user_id = $1 ORDER BY plateforme`, [NICO])).rows.map((l) => `${l.plateforme}:${l.chiffre}`).join(',');
const battre = (nom, dom) => c.query(`SELECT public.cloud_serveur_battre($1, $2, NULL, 4, 0, '{}'::jsonb)`, [nom, dom]);
const choisir = async () => (await un(`SELECT public.cloud_serveur_choisir($1) AS s`, [NICO])).s;

try {
  await c.query(DECOR);
  await c.query(lire('./fixtures/prod-0611-cloud-flotte.sql'));
  await c.query(ETAT);
  const coffreAvant = await coffre();

  // ── (b) : les gardes ────────────────────────────────────────────────────────────────────────────────────────────
  let r = await script('20261106_cloud_essai_ax42_bascule_nico.sql');
  verifier('(b) refusée tant que cloud-3 ne bat pas', !r.ok && /cloud-3 ne bat pas/.test(r.erreur), r.erreur);
  await battre('cloud-3', 'cloud-3.fillsell.app');
  verifier('le premier battement de cloud-3 ne lui donne aucun compte', (await choisir()) === 'cloud-2');
  r = await script('20261106_cloud_essai_ax42_bascule_nico.sql');
  verifier('(b) refusée tant que cloud-2 sert Nico (poste actif)', !r.ok && /pas éteint sur cloud-2/.test(r.erreur), r.erreur);
  await c.query(`UPDATE public.cloud_postes SET etat = 'eteint', conteneur = NULL WHERE user_id = $1`, [NICO]);   // cloud-2 lâche
  await c.query(`INSERT INTO public.cross_post_jobs (user_id, status) VALUES ($1, 'processing')`, [NICO]);
  r = await script('20261106_cloud_essai_ax42_bascule_nico.sql');
  verifier('(b) refusée tant qu\'une tâche de Nico est « processing »', !r.ok && /processing/.test(r.erreur), r.erreur);
  await c.query(`UPDATE public.cross_post_jobs SET status = 'published' WHERE user_id = $1`, [NICO]);
  verifier('rien n\'a été écrit par les refus (aucune sauvegarde)', (await un(`SELECT to_regclass('public._backup_0611_essai_ax42_nico') AS t`)).t === null);

  // ── (b) : la bascule ────────────────────────────────────────────────────────────────────────────────────────────
  r = await script('20261106_cloud_essai_ax42_bascule_nico.sql');
  verifier('(b) passe une fois les gardes levées', r.ok, r.erreur);
  let p = await poste();
  verifier('poste de Nico : cloud-3, éteint, sans conteneur', p.serveur === 'cloud-3' && p.etat === 'eteint' && p.conteneur === null, JSON.stringify(p));
  verifier('profil NEUF de la forme p-f44b5917-<12 hex>', /^p-f44b5917-[0-9a-f]{12}$/.test(p.details.profil) && p.details.profil !== 'p-f44b5917-1443a482c05b', p.details.profil);
  verifier('profil de cloud-2 noté pour le retour', p.details.essai_ax42?.profil_cloud_2 === 'p-f44b5917-1443a482c05b');
  verifier('« ouvert_sur » gardé (cloud-3 voit le changement de machine), « erreur » retirée', p.details.ouvert_sur?.serveur === 'cloud-2' && !('erreur' in p.details));
  verifier('coffre INCHANGÉ (5 lignes, mêmes chiffrés)', (await coffre()) === coffreAvant);
  verifier('IP 42 toujours à Nico, 39 intacte', (await un(`SELECT string_agg(id || ':' || etat || ':' || coalesce(left(user_id::text, 8), '-'), ' ' ORDER BY id) AS s FROM public.cloud_ips`)).s === '39:disponible:- 42:attribuee_client:f44b5917');
  verifier('la base garde Nico sur cloud-3 (cloud_serveur_choisir de la prod)', (await choisir()) === 'cloud-3');
  verifier('le compte de relecture reste sur cloud-2', (await un(`SELECT serveur FROM public.cloud_postes WHERE user_id = $1`, [RELECTURE])).serveur === 'cloud-2');
  r = await script('20261106_cloud_essai_ax42_bascule_nico.sql');
  verifier('(b) rejouée : refusée (sauvegarde présente)', !r.ok && /existe déjà/.test(r.erreur), r.erreur);

  // ── (c) refusé tant que Nico est sur cloud-3 ────────────────────────────────────────────────────────────────────
  r = await script('20261106_cloud_essai_ax42_retrait_cloud3.sql');
  verifier('(c) refusé tant qu\'un compte est attribué à cloud-3', !r.ok && /encore attribué à cloud-3/.test(r.erreur), r.erreur);

  // ── INVERSE de (b) ──────────────────────────────────────────────────────────────────────────────────────────────
  await c.query(`UPDATE public.cloud_postes SET etat = 'actif', conteneur = 'fs-nav-x',
                   details = details || '{"ouvert_sur":{"serveur":"cloud-3","ip_id":42,"mode":"dediee"}}' WHERE user_id = $1`, [NICO]);
  r = await script('20261106_cloud_essai_ax42_bascule_nico_INVERSE.sql');
  verifier('INVERSE (b) refusé tant que cloud-3 sert Nico', !r.ok && /pas éteint sur cloud-3/.test(r.erreur), r.erreur);
  await c.query(`UPDATE public.cloud_postes SET etat = 'eteint', conteneur = NULL WHERE user_id = $1`, [NICO]);   // cloud-3 lâche
  r = await script('20261106_cloud_essai_ax42_bascule_nico_INVERSE.sql');
  verifier('INVERSE (b) passe', r.ok, r.erreur);
  p = await poste();
  verifier('Nico revenu sur cloud-2, son profil d\'avant', p.serveur === 'cloud-2' && p.etat === 'eteint' && p.details.profil === 'p-f44b5917-1443a482c05b', JSON.stringify(p));
  verifier('dernière ouverture (cloud-3) gardée : cloud-2 repart sans les pauses de cloud-3', p.details.ouvert_sur?.serveur === 'cloud-3');
  verifier('retour noté (profil de cloud-3, heure)', /^p-f44b5917-/.test(p.details.essai_ax42?.profil_cloud_3 ?? '') && Boolean(p.details.essai_ax42?.retour_le));
  verifier('coffre toujours inchangé', (await coffre()) === coffreAvant);
  verifier('la base garde Nico sur cloud-2', (await choisir()) === 'cloud-2');

  // ── (c) et son INVERSE ──────────────────────────────────────────────────────────────────────────────────────────
  r = await script('20261106_cloud_essai_ax42_retrait_cloud3.sql');
  verifier('(c) passe une fois cloud-3 vide', r.ok, r.erreur);
  verifier('cloud-3 « retire »', (await un(`SELECT etat FROM public.cloud_serveurs WHERE nom = 'cloud-3'`)).etat === 'retire');
  await battre('cloud-3', 'cloud-3.fillsell.app');
  verifier('un battement de cloud-3 le laisse « retire »', (await un(`SELECT etat FROM public.cloud_serveurs WHERE nom = 'cloud-3'`)).etat === 'retire');
  await c.query(`DELETE FROM public.cloud_postes WHERE user_id = $1`, [NICO]);
  await c.query(`UPDATE public.cloud_serveurs SET capacite = 0 WHERE nom IN ('cloud-1', 'cloud-2')`);
  verifier('un compte sans poste n\'est jamais donné à cloud-3 retiré', (await choisir()) === null);
  r = await script('20261106_cloud_essai_ax42_retrait_cloud3.sql');
  verifier('(c) rejoué : refusé', !r.ok && /existe déjà/.test(r.erreur), r.erreur);
  r = await script('20261106_cloud_essai_ax42_retrait_cloud3_INVERSE.sql');
  verifier('INVERSE (c) passe : cloud-3 « actif »', r.ok && (await un(`SELECT etat FROM public.cloud_serveurs WHERE nom = 'cloud-3'`)).etat === 'actif', r.erreur);
  r = await script('20261106_cloud_essai_ax42_retrait_cloud3_INVERSE.sql');
  verifier('INVERSE (c) rejoué : refusé (rien à défaire)', !r.ok && /pas « retire »/.test(r.erreur), r.erreur);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); embarque.rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `\n${echecs} ÉCHEC(S)` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
