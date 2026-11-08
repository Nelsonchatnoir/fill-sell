// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261108200000_poste_noter_erreur_effacee (08/11 soir, point 4 de
// l'urgence Leboncoin : « CDP : connexion fermée » restait sur le poste du client après son retour « actif ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261108200000_banc.mjs
// Corps de la PROD relus le 08/11 à 20:2x (scripts/essais/fixtures/prod-0811-poste-noter/) ; table cloud_postes à
// l'identique (colonnes, défauts, contrainte d'état ; la clé étrangère vers auth.users est hors sujet).
//   A. AVANT (corps de la prod) : erreur puis actif → derniere_erreur et details.erreur RESTENT (le défaut) ;
//   B. APRÈS (migration) : actif efface derniere_erreur, details.erreur et details.raison ; garde le reste des détails
//      (profil, ouvert_sur, conteneur…) ; « erreur » écrit toujours l'erreur ; « eteint » garde sa raison ; « demarrage »
//      n'efface rien ; un poste neuf (INSERT) inchangé ;
//   C. l'INVERSE rend la fonction de la prod (le défaut revient) ; le corps de l'inverse = celui de la prod, mot pour mot.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-poste-noter-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55451, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }) };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55451/postgres';
}

const DECOR = `
CREATE TABLE public.cloud_postes (
  user_id uuid NOT NULL PRIMARY KEY, serveur text, conteneur text,
  etat text NOT NULL DEFAULT 'eteint'::text CHECK (etat = ANY (ARRAY['eteint'::text, 'demarrage'::text, 'actif'::text, 'arret'::text, 'erreur'::text])),
  session_fillsell_id uuid, demarre_le timestamptz, arrete_le timestamptz, derniere_activite timestamptz, prochain_reveil timestamptz,
  derniere_erreur text, details jsonb NOT NULL DEFAULT '{}'::jsonb, maj_le timestamptz NOT NULL DEFAULT now(), serveur_origine text);
`;
const FIX = 'scripts/essais/fixtures/prod-0811-poste-noter';
const U = '8b457627-1f7d-4481-8155-7b2e4a92b482';
const V = '00000000-0000-4000-8000-000000000002';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const normal = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
try {
  await client.query(DECOR);
  await client.query(lire(`${FIX}/cloud_ts.sql`));
  await client.query(lire(`${FIX}/cloud_poste_noter.sql`));
  const noter = (u, etat, d) => client.query('SELECT public.cloud_poste_noter($1, $2, $3::jsonb)', [u, etat, JSON.stringify(d)]);
  const poste = async (u) => (await client.query('SELECT etat, derniere_erreur, details FROM public.cloud_postes WHERE user_id = $1', [u])).rows[0];
  // Le parcours du client du 08/11 : actif, erreur « CDP », puis actif de nouveau (19:26), puis éteint (compte inactif).
  const parcours = async (u) => {
    await noter(u, 'demarrage', { serveur: 'cloud-2', profil: 'p-x', motif: 'connexion' });
    await noter(u, 'erreur', { erreur: 'CDP : connexion fermée' });
    await noter(u, 'eteint', { raison: 'arret_orchestrateur' });
    await noter(u, 'demarrage', { serveur: 'cloud-2', profil: 'p-x', motif: 'continu' });
    await noter(u, 'actif', { serveur: 'cloud-2', conteneur: 'fs-nav-x', profil: 'p-x', motif: 'continu', ouvert_sur: { ip_id: 1 } });
  };

  // A. AVANT
  await parcours(U);
  let p = await poste(U);
  ok(p.etat === 'actif' && p.derniere_erreur === 'CDP : connexion fermée' && p.details.erreur === 'CDP : connexion fermée' && p.details.raison === 'arret_orchestrateur',
    'AVANT (prod) : revenu « actif », le poste garde « CDP : connexion fermée » et la raison d’arrêt (le défaut)');

  // B. APRÈS
  await client.query(lire('supabase/migrations/20261108200000_poste_noter_erreur_effacee.sql'));
  await parcours(V);
  p = await poste(V);
  ok(p.etat === 'actif' && p.derniere_erreur === null, 'APRÈS : revenu « actif », plus de derniere_erreur');
  ok(!('erreur' in p.details) && !('raison' in p.details), 'APRÈS : details sans « erreur » ni « raison »');
  ok(p.details.profil === 'p-x' && p.details.conteneur === 'fs-nav-x' && p.details.ouvert_sur?.ip_id === 1 && p.details.motif === 'continu', 'APRÈS : le reste des détails gardé');
  await noter(V, 'erreur', { erreur: 'autre panne' });
  p = await poste(V);
  ok(p.etat === 'erreur' && p.derniere_erreur === 'autre panne' && p.details.erreur === 'autre panne', 'APRÈS : une nouvelle erreur s’écrit toujours');
  await noter(V, 'demarrage', { motif: 'connexion' });
  p = await poste(V);
  ok(p.derniere_erreur === 'autre panne', 'APRÈS : « demarrage » n’efface rien (l’erreur reste tant que le poste n’est pas actif)');
  await noter(V, 'eteint', { raison: 'compte_inactif' });
  p = await poste(V);
  ok(p.details.raison === 'compte_inactif' && p.derniere_erreur === 'autre panne', 'APRÈS : « eteint » garde sa raison');
  // Le poste du client tel qu'en prod (erreur restée) : le prochain « actif » le nettoie.
  await noter(U, 'actif', { serveur: 'cloud-2' });
  p = await poste(U);
  ok(p.derniere_erreur === null && !('erreur' in p.details), 'APRÈS : un poste resté en erreur en prod est nettoyé à son prochain « actif »');
  const W = '00000000-0000-4000-8000-000000000003';
  await noter(W, 'actif', { serveur: 'cloud-2', erreur: null });
  p = await poste(W);
  ok(p.etat === 'actif' && p.derniere_erreur === null, 'APRÈS : un poste NEUF (insertion) inchangé');

  // C. INVERSE
  const inverse = lire('supabase/rollbacks/20261108200000_poste_noter_erreur_effacee_INVERSE.sql');
  const corpsInverse = inverse.slice(inverse.indexOf('CREATE OR REPLACE FUNCTION'));
  ok(normal(corpsInverse) === normal(lire(`${FIX}/cloud_poste_noter.sql`)), 'INVERSE : son corps = celui de la prod, mot pour mot');
  await client.query(inverse);
  const X = '00000000-0000-4000-8000-000000000004';
  await parcours(X);
  p = await poste(X);
  ok(p.derniere_erreur === 'CDP : connexion fermée', 'INVERSE : la règle d’avant revient (le défaut aussi)');
  console.log(`\nBanc vert — ${n} contrôles (Postgres jetable${embarque ? ' embarqué' : ''}).`);
} finally {
  await client.end().catch(() => {});
  if (embarque) await embarque.pg.stop().catch(() => {});
}
