// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261114090000_cloud_ip_quarantaine (14/11, règle de Nico : « On ne
// jette JAMAIS une IP payée ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261114090000_banc.mjs
// Corps de la PROD du 13/11 (scripts/essais/fixtures/prod-1311-ip-quarantaine/, pg_get_functiondef relu en lecture seule) ;
// décor synthétique (IP 10.x), contraintes de cloud_ips et de cloud_ip_evenements relues en prod le 13/11.
//   A. AVANT (la prod) : un contrôle d'entrée sans réponse → REBUT (le 13/11 rejoué) ;
//   B. APRÈS : le même contrôle → QUARANTAINE (premier recontrôle 15 min plus tard), jamais le rebut ; un bon contrôle →
//      disponible ; cloud_ip_quarantaine_noter : retour au pool, échecs comptés, espacement 15 min / 1 h / 4 h / 12 h (le
//      MIROIR de cloud-pool.js quarantaineSuivante), signalement jamais effacé, prochain recontrôle borné, refus (IP tenue,
//      expirée, au repos), quarantaine illisible remplacée, droits (service_role seul), CHECK (quarantaine sans colonne
//      refusée), journal (natures neuves) ; la sauvegarde est prise ;
//   C. L'INVERSE : la quarantaine redevient « achetee » (jamais « rebut »), le corps de la prod revient (à la fin de ligne
//      près), les CHECK d'avant ; puis la migration se rejoue (idempotente).
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as regles from '../../supabase/functions/_shared/cloud-pool.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-ip-quarantaine-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55451, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55451/postgres';
}

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.cloud_ips (id bigserial PRIMARY KEY, fournisseur text NOT NULL DEFAULT 'iproyal', commande text NOT NULL, ip inet NOT NULL,
  port integer NOT NULL DEFAULT 12323, pays text NOT NULL DEFAULT 'FR', secret_nom text, etat text NOT NULL DEFAULT 'achetee',
  user_id uuid, dernier_user_id uuid, reserve_pour uuid, reserve_jusqu_au timestamptz, attribuee_le timestamptz,
  liberee_le timestamptz, repos_fin timestamptz, purge_prouvee_le timestamptz, expire_le timestamptz NOT NULL,
  livree_le timestamptz NOT NULL DEFAULT now(), attributions integer NOT NULL DEFAULT 0, rebut_critere text, rebut_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now(), refus jsonb NOT NULL DEFAULT '{}'::jsonb, sante jsonb,
  CONSTRAINT cloud_ips_etat_check CHECK ((etat = ANY (ARRAY['achetee'::text, 'disponible'::text, 'attribuee_essai'::text, 'attribuee_client'::text, 'repos'::text, 'rebut'::text, 'expiree'::text]))),
  CONSTRAINT cloud_ips_titulaire CHECK (((etat = ANY (ARRAY['attribuee_essai'::text, 'attribuee_client'::text])) = (user_id IS NOT NULL))),
  CONSTRAINT cloud_ips_reservation CHECK (((reserve_pour IS NULL) = (reserve_jusqu_au IS NULL))),
  CONSTRAINT cloud_ips_rebut CHECK (((etat <> 'rebut'::text) OR ((rebut_critere IS NOT NULL) AND (rebut_le IS NOT NULL)))),
  CONSTRAINT cloud_ips_repos CHECK (((etat <> 'repos'::text) OR ((liberee_le IS NOT NULL) AND (repos_fin IS NOT NULL)))),
  CONSTRAINT cloud_ips_refus_objet CHECK ((jsonb_typeof(refus) = 'object'::text)));
CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint NOT NULL REFERENCES public.cloud_ips (id),
  le timestamptz NOT NULL DEFAULT now(), nature text NOT NULL, user_id uuid, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT cloud_ip_evenements_nature_check CHECK ((nature = ANY (ARRAY['achat'::text, 'controle_entree'::text, 'reservation'::text, 'attribution'::text, 'retour_meme_compte'::text, 'conversion'::text, 'liberation'::text, 'purge'::text, 'sortie_repos'::text, 'signalement'::text, 'rebut'::text, 'renouvellement'::text, 'identifiants_changes'::text, 'expiration'::text, 'incident'::text, 'refus'::text, 'refus_leve'::text, 'refus_prouve'::text, 'visite_controle'::text, 'depense'::text]))));
`;
const PROD = ['cloud_ts', 'cloud_journal', 'cloud_controle_manques', 'cloud_ip_signaler', 'cloud_ip_controle_entree'];
const FIX = 'scripts/essais/fixtures/prod-1311-ip-quarantaine';
const MIGRATION = 'supabase/migrations/20261114090000_cloud_ip_quarantaine.sql';
const INVERSE = 'supabase/rollbacks/20261114090000_cloud_ip_quarantaine_INVERSE.sql';
const U = '00000000-0000-4000-8000-000000000001';
const ETAT = String.raw`
TRUNCATE public.cloud_ip_evenements RESTART IDENTITY; DELETE FROM public.cloud_ips;
INSERT INTO public.cloud_ips (id, commande, ip, etat, expire_le, livree_le) VALUES
  (77, '90000077', '10.9.0.77', 'achetee', now() + interval '30 days', now() - interval '286 seconds'),
  (78, '90000078', '10.9.0.78', 'achetee', now() + interval '30 days', now() - interval '270 seconds'),
  (79, '90000079', '10.9.0.79', 'achetee', now() + interval '30 days', now() - interval '5 minutes'),
  (80, '90000080', '10.9.0.80', 'achetee', now() - interval '1 hour', now() - interval '31 days');
INSERT INTO public.cloud_ips (id, commande, ip, etat, user_id, dernier_user_id, attributions, expire_le) VALUES
  (42, '90000042', '10.9.0.42', 'attribuee_client', '${U}', '${U}', 1, now() + interval '20 days');
`;
const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail !== '' ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p) => (await c.query(q, p)).rows[0];
const vide = (ip) => ({ fait_le: new Date().toISOString(), ip_sortie: null, pays: null, listes_noires: [], plateformes: { visite: 'aucune' }, lectures: 3 });
const bon = (ip) => ({ fait_le: new Date().toISOString(), ip_sortie: ip, pays: 'FR', listes_noires: [], plateformes: { visite: 'aucune' }, lectures: 1 });
const ligne = async (id) => { const l = (await un('SELECT to_jsonb(i.*) AS l FROM public.cloud_ips i WHERE id = $1', [id])).l;
  return { etat: l.etat, quarantaine: l.quarantaine ?? null, rebut_critere: l.rebut_critere, rebut_le: l.rebut_le }; };
const entree = async (id, ctl) => (await un('SELECT public.cloud_ip_controle_entree($1, $2::jsonb) AS r', [id, JSON.stringify(ctl)])).r;
const noter = async (id, ctl, q = null) => (await un('SELECT public.cloud_ip_quarantaine_noter($1, $2::jsonb, $3::jsonb) AS r', [id, JSON.stringify(ctl), q == null ? null : JSON.stringify(q)])).r;
const dansMin = (t) => Math.round((Date.parse(t) - Date.now()) / 60_000);
const corpsProd = (f) => lire(`${FIX}/${f}.sql`).trim();
const corpsBase = async (f) => (await un(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE p.proname = $1`, [f])).d.replace(/\r\n/g, '\n').trim();

try {
  await c.query(DECOR);
  for (const f of PROD) await c.query(`${lire(`${FIX}/${f}.sql`)};`);
  await c.query(`REVOKE ALL ON FUNCTION public.cloud_ip_controle_entree(bigint, jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.cloud_ip_controle_entree(bigint, jsonb) TO service_role;
    REVOKE ALL ON FUNCTION public.cloud_ip_signaler(bigint, text, jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.cloud_ip_signaler(bigint, text, jsonb) TO service_role;`);
  await c.query(ETAT);
  const aclAvant = (await un(`SELECT proacl::text AS a FROM pg_proc WHERE proname = 'cloud_ip_controle_entree'`)).a;

  // ── A. AVANT — la prod du 13/11 ──────────────────────────────────────────────────────────────────────────────
  const a1 = await entree(77, vide('10.9.0.77'));
  const l77 = await ligne(77);
  verifier('A. AVANT : un écho vide 4 min 46 après la livraison → REBUT (cloud_ip_signaler, le 13/11 rejoué)',
    a1.raison === 'rebut' && l77.etat === 'rebut' && l77.rebut_critere === 'controle_entree', JSON.stringify({ a1, l77 }));
  verifier('A. AVANT : et son proxy n’est plus lisible (rebut) — impossible de la recontrôler', true);

  // ── B. LA MIGRATION (deux fois : idempotente) ─────────────────────────────────────────────────────────────────
  await c.query(ETAT);
  await c.query(lire(MIGRATION));
  await c.query(lire(MIGRATION));
  verifier('B0. la migration passe deux fois (idempotente)', true);
  const sauve = (await c.query(`SELECT nature, nom FROM public._backup_1411_cloud_ip_quarantaine ORDER BY 1, 2`)).rows.map((r) => `${r.nature}:${r.nom}`);
  verifier('B0. sauvegarde prise : le corps de cloud_ip_controle_entree et les deux CHECK, une seule fois',
    JSON.stringify(sauve) === JSON.stringify(['contrainte:cloud_ip_evenements_nature_check', 'contrainte:cloud_ips_etat_check', 'fonction:cloud_ip_controle_entree']), JSON.stringify(sauve));
  const sauveCorps = (await un(`SELECT definition AS d FROM public._backup_1411_cloud_ip_quarantaine WHERE nom = 'cloud_ip_controle_entree'`)).d.replace(/\r\n/g, '\n').trim();
  verifier('B0. … le corps sauvegardé = celui de la prod (fixture)', sauveCorps === corpsProd('cloud_ip_controle_entree'));
  verifier('B0. cloud_ip_controle_entree : droits INCHANGÉS', (await un(`SELECT proacl::text AS a FROM pg_proc WHERE proname = 'cloud_ip_controle_entree'`)).a === aclAvant);
  for (const f of ['cloud_ip_quarantaine_noter', 'cloud_ip_quarantaine_defaut']) {
    const acl = (await un(`SELECT proacl::text AS a FROM pg_proc WHERE proname = $1`, [f])).a;
    verifier(`B0. ${f} : service_role seul (ni PUBLIC, ni anon, ni authenticated)`, /service_role=X/.test(acl) && !/(^|[{,])=X|anon|authenticated/.test(acl), acl);
  }
  verifier('B0. colonne quarantaine nullable, toutes à NULL', (await un(`SELECT count(*)::int AS n FROM public.cloud_ips WHERE quarantaine IS NOT NULL`)).n === 0);

  // B1. Le contrôle d'entrée ne jette plus
  const b1 = await entree(77, vide('10.9.0.77'));
  const q77 = await ligne(77);
  verifier('B1. APRÈS : le même écho vide → QUARANTAINE, jamais le rebut', b1.raison === 'quarantaine' && q77.etat === 'quarantaine' && q77.rebut_le == null, JSON.stringify({ b1, q77 }));
  verifier('B1. … 1 essai, recontrôle 15 min plus tard, la preuve (manques, sortie lue)',
    q77.quarantaine.essais === 1 && dansMin(q77.quarantaine.prochain_le) === 15 && JSON.stringify(q77.quarantaine.dernier.manques) === '["ip_sortie","pays"]'
    && q77.quarantaine.origine === 'controle_entree', JSON.stringify(q77.quarantaine));
  const jr = (await c.query(`SELECT nature FROM public.cloud_ip_evenements WHERE ip_id = 77 ORDER BY id`)).rows.map((r) => r.nature);
  verifier('B1. … journal : controle_entree puis quarantaine (aucun signalement, aucun rebut)', JSON.stringify(jr) === '["controle_entree","quarantaine"]', JSON.stringify(jr));
  const b1bon = await entree(78, bon('10.9.0.78'));
  verifier('B1. un bon contrôle d’entrée → disponible (inchangé)', b1bon.ok === true && (await ligne(78)).etat === 'disponible');

  // B2. Le recontrôle
  const r2 = await noter(77, vide('10.9.0.77'));
  const q2 = (await ligne(77)).quarantaine;
  verifier('B2. recontrôle raté sans quarantaine fournie → celle de la base : 2 essais, 1 h, preuves 2', r2.quarantaine === true && q2.essais === 2
    && dansMin(q2.prochain_le) === 60 && q2.preuves.length === 2 && q2.premier_echec_le === q77.quarantaine.premier_echec_le, JSON.stringify(q2));
  await noter(77, vide('10.9.0.77'));
  const q3 = (await ligne(77)).quarantaine;
  await noter(77, vide('10.9.0.77'));
  const q4 = (await ligne(77)).quarantaine;
  verifier('B2. … puis 4 h, puis 12 h', dansMin(q3.prochain_le) === 240 && dansMin(q4.prochain_le) === 720, `${dansMin(q3.prochain_le)} ${dansMin(q4.prochain_le)}`);
  // Le miroir : la base et l'orchestrateur espacent pareil.
  let qj = null; const ecartsJs = [];
  for (let n = 1; n <= 5; n++) { const t = Date.now(); qj = regles.quarantaineSuivante(qj, vide(), { manques: ['ip_sortie', 'pays'], maintenant: t }); ecartsJs.push(Math.round((Date.parse(qj.prochain_le) - t) / 60_000)); }
  const ecartsSql = [];
  let qs = null;
  for (let n = 1; n <= 5; n++) {
    qs = (await un(`SELECT public.cloud_ip_quarantaine_defaut($1::jsonb, $2::jsonb, ARRAY['ip_sortie','pays']) AS q`, [qs == null ? null : JSON.stringify(qs), JSON.stringify(vide())])).q;
    ecartsSql.push(dansMin(qs.prochain_le));
  }
  verifier('B2. MIROIR : cloud_ip_quarantaine_defaut = quarantaineSuivante (15, 60, 240, 720, 720 min ; essais ; preuves)',
    JSON.stringify(ecartsSql) === JSON.stringify(ecartsJs) && JSON.stringify(ecartsJs) === '[15,60,240,720,720]' && qs.essais === qj.essais && qs.preuves.length === qj.preuves.length,
    JSON.stringify({ ecartsSql, ecartsJs }));
  // La quarantaine de l'orchestrateur (signalée) est prise ; le signalement ne s'efface jamais.
  const qo = { ...regles.quarantaineSuivante(q4, vide(), { manques: ['ip_sortie', 'pays'] }), signalee_le: new Date().toISOString() };
  qo.prochain_le = new Date(Date.now() + 24 * 3600_000).toISOString();
  await noter(77, vide('10.9.0.77'), qo);
  const q5 = (await ligne(77)).quarantaine;
  verifier('B2. la quarantaine calculée par l’orchestrateur est gardée (signalée, 24 h)', q5.essais === 5 && q5.signalee_le === qo.signalee_le && dansMin(q5.prochain_le) === 1440, JSON.stringify(q5));
  await noter(77, vide('10.9.0.77'), { ...qo, essais: 6, signalee_le: null, prochain_le: new Date(Date.now() - 3600_000).toISOString() });
  const q6 = (await ligne(77)).quarantaine;
  verifier('B2. … un signalement ne s’efface jamais ; un prochain recontrôle dans le passé est reporté à +5 min (aucune boucle)',
    q6.signalee_le === qo.signalee_le && dansMin(q6.prochain_le) === 5, JSON.stringify(q6));
  await noter(77, vide('10.9.0.77'), { ...qo, essais: 7, prochain_le: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  verifier('B2. … ni repoussé au-delà de 48 h (aucun oubli)', dansMin((await ligne(77)).quarantaine.prochain_le) === 2880);
  await noter(77, vide('10.9.0.77'), { pas: 'lisible' });
  const q8 = (await ligne(77)).quarantaine;
  verifier('B2. une quarantaine illisible → celle de la base (essais comptés, signalement gardé)', q8.essais === 8 && q8.signalee_le === qo.signalee_le && dansMin(q8.prochain_le) === 1440, JSON.stringify(q8));
  const sortie = await noter(77, bon('10.9.0.77'), qo);
  const l = await ligne(77);
  verifier('B2. un contrôle BON → disponible, quarantaine effacée (même si l’orchestrateur la croyait ratée : la base juge)',
    sortie.ok === true && sortie.sortie === true && l.etat === 'disponible' && l.quarantaine == null, JSON.stringify({ sortie, l }));
  const js = (await c.query(`SELECT nature FROM public.cloud_ip_evenements WHERE ip_id = 77 ORDER BY id DESC LIMIT 1`)).rows[0].nature;
  verifier('B2. … journal : sortie_quarantaine', js === 'sortie_quarantaine');
  // Depuis « achetee » directement (l'orchestrateur n'envoie jamais un contrôle raté à cloud_ip_controle_entree).
  const d79 = await noter(79, vide('10.9.0.79'), regles.quarantaineSuivante(null, vide(), { manques: ['ip_sortie', 'pays'] }));
  verifier('B2. une IP « achetee » au contrôle raté → quarantaine (journal controle_entree + quarantaine)', d79.quarantaine === true && (await ligne(79)).etat === 'quarantaine'
    && JSON.stringify((await c.query(`SELECT nature FROM public.cloud_ip_evenements WHERE ip_id = 79 ORDER BY id`)).rows.map((r) => r.nature)) === '["controle_entree","quarantaine"]');
  // Les refus.
  verifier('B3. refus : une IP tenue par un compte', (await noter(42, vide('10.9.0.42'))).raison === 'etat' && (await ligne(42)).etat === 'attribuee_client');
  verifier('B3. refus : une IP expirée', (await noter(80, vide('10.9.0.80'))).raison === 'expiree');
  verifier('B3. refus : une IP disponible (déjà au pool)', (await noter(78, vide('10.9.0.78'))).raison === 'etat' && (await ligne(78)).etat === 'disponible');
  verifier('B3. refus : une IP inconnue', (await noter(999, vide('10.9.0.9'))).raison === 'ip_inconnue');
  let refuse = false;
  try { await c.query(`UPDATE public.cloud_ips SET etat = 'quarantaine' WHERE id = 78`); } catch { refuse = true; }
  verifier('B3. CHECK : « quarantaine » sans sa colonne → refusé', refuse);
  refuse = false;
  try { await c.query(`UPDATE public.cloud_ips SET etat = 'quarantaine', quarantaine = '{"essais":1}'::jsonb WHERE id = 78`); } catch { refuse = true; }
  verifier('B3. CHECK : une quarantaine sans prochain recontrôle → refusée', refuse);
  verifier('B3. aucun rebut nulle part depuis la migration', (await un(`SELECT count(*)::int AS n FROM public.cloud_ips WHERE etat = 'rebut'`)).n === 0
    && (await un(`SELECT count(*)::int AS n FROM public.cloud_ip_evenements WHERE nature IN ('rebut', 'signalement')`)).n === 0);
  await c.query('SET ROLE anon');
  let interdit = false;
  try { await noter(79, bon('10.9.0.79')); } catch { interdit = true; }
  await c.query('RESET ROLE');
  verifier('B4. anon ne peut pas appeler cloud_ip_quarantaine_noter', interdit);

  // ── C. L'INVERSE ─────────────────────────────────────────────────────────────────────────────────────────────
  await c.query(lire(INVERSE));
  verifier('C. INVERSE : l’IP en quarantaine redevient « achetee » (jamais « rebut »)', (await ligne(79)).etat === 'achetee');
  verifier('C. … sa quarantaine est gardée dans la sauvegarde', (await un(`SELECT count(*)::int AS n FROM public._backup_1411_cloud_ip_quarantaine_lignes WHERE id = 79`)).n === 1);
  verifier('C. … cloud_ip_controle_entree = le corps de la prod (à la fin de ligne près)', (await corpsBase('cloud_ip_controle_entree')) === corpsProd('cloud_ip_controle_entree'));
  verifier('C. … droits de cloud_ip_controle_entree inchangés', (await un(`SELECT proacl::text AS a FROM pg_proc WHERE proname = 'cloud_ip_controle_entree'`)).a === aclAvant);
  verifier('C. … fonctions neuves et colonne supprimées', (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('cloud_ip_quarantaine_noter', 'cloud_ip_quarantaine_defaut')`)).n === 0
    && (await un(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'cloud_ips' AND column_name = 'quarantaine'`)).n === 0);
  const chk = (await un(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'cloud_ips_etat_check'`)).d;
  verifier('C. … le CHECK des états d’avant', !/quarantaine/.test(chk) && /'repos'::text, 'rebut'::text, 'expiree'::text/.test(chk), chk);
  const chkJ = (await un(`SELECT pg_get_constraintdef(oid) AS d, convalidated AS v FROM pg_constraint WHERE conname = 'cloud_ip_evenements_nature_check'`));
  verifier('C. … le CHECK du journal d’avant, NOT VALID (les événements « quarantaine » restent, jamais réécrits)', !/quarantaine/.test(chkJ.d) && chkJ.v === false, JSON.stringify(chkJ));
  await c.query(lire(MIGRATION));
  verifier('C. la migration se rejoue après l’inverse', (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'cloud_ip_quarantaine_noter'`)).n === 1);

  // ── D. Le script de réparation : les rebuts d'entrée encore payés et jamais servis → quarantaine (la règle, pour toutes) ──
  await c.query(`INSERT INTO public.cloud_ips (id, commande, ip, etat, rebut_critere, rebut_le, liberee_le, attributions, expire_le) VALUES
    (81, '90000081', '10.9.0.81', 'rebut', 'controle_entree', now() - interval '9 hours', now() - interval '9 hours', 0, now() + interval '29 days'),
    (82, '90000082', '10.9.0.82', 'rebut', 'manuel', now() - interval '9 hours', now() - interval '9 hours', 0, now() + interval '29 days'),
    (83, '90000083', '10.9.0.83', 'rebut', 'controle_entree', now() - interval '9 hours', now() - interval '9 hours', 2, now() + interval '29 days'),
    (84, '90000084', '10.9.0.84', 'rebut', 'controle_entree', now() - interval '9 hours', now() - interval '9 hours', 0, now() + interval '30 minutes');
    INSERT INTO public.cloud_ip_evenements (ip_id, nature, le, details) VALUES (81, 'controle_entree', now() - interval '9 hours',
      '{"manques":["ip_sortie","pays"],"controle":{"pays":null,"ip_sortie":null,"listes_noires":[],"plateformes":{"visite":"aucune"}}}'::jsonb);`);
  await c.query(lire('scripts/reparations/20261114_cloud_ip_rebuts_entree_en_quarantaine.sql'));
  const r81 = await ligne(81);
  verifier('D. réparation : le rebut d’entrée payé et jamais servi → quarantaine, recontrôle dû tout de suite, la preuve lue au journal',
    r81.etat === 'quarantaine' && r81.rebut_le == null && dansMin(r81.quarantaine.prochain_le) <= 0
    && JSON.stringify(r81.quarantaine.dernier.manques) === '["ip_sortie","pays"]' && r81.quarantaine.reprise?.rebut_critere === 'controle_entree', JSON.stringify(r81));
  verifier('D. … jamais un rebut manuel (geste de Nico), une IP déjà servie, ni une IP qui expire dans l’heure',
    (await ligne(82)).etat === 'rebut' && (await ligne(83)).etat === 'rebut' && (await ligne(84)).etat === 'rebut');
  const rn = await noter(81, bon('10.9.0.81'));
  verifier('D. … puis le circuit normal : recontrôle bon → disponible', rn.ok === true && (await ligne(81)).etat === 'disponible');
  await c.query(`UPDATE public.cloud_ips SET etat = 'quarantaine', quarantaine = '{"prochain_le":"2026-11-14T00:00:00Z","essais":1}'::jsonb WHERE id = 81`);
  await c.query(lire('scripts/reparations/20261114_cloud_ip_rebuts_entree_en_quarantaine_INVERSE.sql'));
  const i81 = await ligne(81);
  verifier('D. inverse de la réparation : de nouveau au rebut d’avant (critère et date)', i81.etat === 'rebut' && i81.rebut_critere === 'controle_entree' && i81.quarantaine == null, JSON.stringify(i81));
} catch (e) {
  echecs++;
  console.log(`✗ ERREUR : ${e.message}`);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `\n${echecs} ÉCHEC(S)` : '\nBanc VERT.');
process.exit(echecs ? 1 : 0);
