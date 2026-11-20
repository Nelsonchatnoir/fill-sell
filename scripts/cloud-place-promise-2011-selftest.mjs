// Verrou « l'essai Cloud démarre TOUT DE SUITE quand une IP est en route — jamais la liste d'attente » (20/11/2026 soir,
// BLOC D DE NICO).
//
// Avant : stock d'IP saines vide mais un achat IPRoyal standard en route → la vente disait « ip_en_preparation », la
// préparation inscrivait à la liste d'attente et le paiement refusait (409 preparation_requise). Voulu : l'essai démarre, l'IP
// est attribuée dès sa livraison et son contrôle, la personne lit « Ton FillSell Cloud se prépare… » ; un achat raté est
// réessayé (5 min, au plus 3 par heure) et dit en rouge dans l'ops-digest.
//
// Ce test échoue si :
//   1. la migration 20261120230000 perd ses gardes md5 (5 fonctions relues en prod), sa colonne, la règle « promesse au lieu
//      de la liste d'attente » ou la capacité tenue (cloud_places_libres compte les promesses) ; si l'inverse ne restaure plus
//      les corps de prod (fins de ligne normalisées) ;
//   2. le banc jetable (PGlite) n'est pas vert ;
//   3. l'app ne continue plus vers le paiement sur une place promise, propose la liste d'attente dans ce cas, ou ne dit pas la
//      phrase neutre ; ou si les cas d'avant (complet, rien qui puisse venir) changent ;
//   4. l'ops-digest perd ses deux lignes rouges (achat d'IP en échec 24 h, Cloud sans IP > 30 min), leur compte ou l'objet.
//     npm run selftest:cloud-place-promise-2011
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { achatsIpEnEchec, essaisCloudSansIp } from '../supabase/functions/ops-digest/veilleIpCloud.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log('1. La migration et son inverse');
const MIG = lire('supabase/migrations/20261120230000_cloud_essai_place_promise.sql');
const INV = lire('supabase/rollbacks/20261120230000_cloud_essai_place_promise_INVERSE.sql');
const GARDES = {
  'cloud_essai_preparer_moi(text)': '51608897cd01a66ab79faaa4894b9c23', 'cloud_essai_permis(uuid)': '36c9fd88af13f4f109a5a6a806b45ab3',
  'cloud_places_libres()': 'b172962fee75ef0ce0865aacc83cde01', 'cloud_vente_etat(uuid)': '6af6915c41c3a72174a32c5f70a68974',
  'cloud_attente_places_a_offrir()': 'aa323d97786cc80872611a70d65c2383',
};
ok(Object.entries(GARDES).every(([sig, h]) => MIG.includes(`'public.${sig}'::regprocedure))) IS DISTINCT FROM '${h}'`))
  && MIG.indexOf('DO $garde$') < MIG.indexOf('ALTER TABLE'), 'les 5 gardes md5 (prod du 20/11) passent AVANT toute écriture');
ok(/ADD COLUMN IF NOT EXISTS place_promise_jusqu_au timestamptz/.test(MIG), 'la colonne cloud_essai_demandes.place_promise_jusqu_au');
const prep = MIG.slice(MIG.indexOf('FUNCTION public.cloud_essai_preparer_moi'));
ok(/pg_advisory_xact_lock\(hashtextextended\('cloud_essai_preparer', 0\)\)/.test(prep) && prep.indexOf('pg_advisory_xact_lock') < prep.indexOf('cloud_vente_etat(v_user)'),
  'une préparation à la fois, la vente lue APRÈS le verrou');
const branche = prep.slice(prep.indexOf("IF NOT v_rotation THEN"), prep.indexOf('DELETE FROM public.cloud_attente WHERE user_id = v_user;'));
ok(/v_promesse := now\(\) \+ make_interval\(mins => public\.cloud_param\('reservation_min', 30\)\)/.test(branche)
  && branche.indexOf('v_promesse := now()') < branche.indexOf('INSERT INTO public.cloud_attente'),
  'une IP en route : la place est PROMISE (30 min) — l’inscription à la liste d’attente n’est que dans l’autre branche');
ok(/'place', 'en_preparation'/.test(prep) && /place_promise_jusqu_au = EXCLUDED\.place_promise_jusqu_au/.test(prep), 'la préparation répond « en_preparation » et pose (ou efface) la promesse');
ok(/OR COALESCE\(d\.place_promise_jusqu_au > now\(\), false\)/.test(MIG), 'le paiement accepte une promesse qui court (cloud_essai_permis.fraiche, jamais NULL)');
ok(/- public\.cloud_promesses_en_cours\(NULL\), 0\);/.test(MIG), 'la capacité reste tenue : cloud_places_libres compte les promesses');
ok(/v_ips := v_ips - v_promesses;/.test(MIG) && /v_ips := v_ips - public\.cloud_promesses_en_cours\(NULL\);/.test(MIG),
  'les IP libres vont d’abord aux promesses (vente, places à offrir)');
ok(/WHERE c\.nature = 'achat' AND c\.statut IN \('demandee', 'en_cours'\)/.test(MIG) && /i\.etat IN \('achetee', 'quarantaine'\)/.test(MIG)
  && /cloud_param\('ip_achats_auto', 0\) = 1 AND public\.cloud_param\('ip_solde_cents', -1\) >= x\.cents/.test(MIG),
  'ce qui peut venir : achat en route, IP livrée au contrôle ou en quarantaine, rachat automatique payable — rien d’autre');
ok(!/cloud_ip_marge|stock_min|capacite\s*=|UPDATE public\.cloud_serveurs|coin_config/.test(MIG.replace(/--[^\n]*/g, '')),
  'ni la règle du stock ni la capacité ne sont touchées');
ok(/REVOKE ALL ON FUNCTION public\.cloud_promesses_en_cours\(uuid\) FROM PUBLIC, anon, authenticated/.test(MIG)
  && /REVOKE ALL ON FUNCTION public\.cloud_ip_a_venir\(\) FROM PUBLIC, anon, authenticated/.test(MIG), 'les deux nouvelles fonctions restent au serveur');
ok((INV.match(/EXECUTE replace\(\$corps\$CREATE OR REPLACE FUNCTION/g) ?? []).length === 4 && /chr\(10\), chr\(13\) \|\| chr\(10\)\);/.test(INV)
  && /DROP COLUMN IF EXISTS place_promise_jusqu_au/.test(INV), 'l’inverse : 5 corps de prod, fins de ligne normalisées (cloud_essai_permis en CRLF), colonne retirée');

console.log('2. Le banc jetable (PGlite)');
let pglite = true;
try { await import('@electric-sql/pglite'); } catch { pglite = false; }
if (pglite) {
  const r = spawnSync(process.execPath, ['scripts/bancs/place-promise-2011/banc.mjs'], { cwd: racine, encoding: 'utf8', timeout: 240_000 });
  const fin = String(r.stdout ?? '').trim().split('\n').pop();
  ok(r.status === 0 && /✓ banc place-promise : (\d+)\/\1/.test(fin), `banc : ${fin}`);
} else console.log('  · PGlite absent : banc non joué');

console.log('3. L’app');
const vite = await createServer({
  root: racine, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const A = await vite.ssrLoadModule('/src/cloud/achatCloud.js');
  const Tx = await vite.ssrLoadModule('/src/cloud/textesConnexion.js');
  const p = A.lirePreparation({ ok: true, essai: true, raison: null, place: 'en_preparation', place_jusqu_au: '2026-11-20T21:30:00Z' });
  ok(p.continuer === true && p.essai === true && p.enPreparation === true && p.attente === undefined, 'place promise : on continue vers le paiement, aucune liste d’attente');
  ok(A.lirePreparation({ ok: true, essai: true, raison: null }).enPreparation === undefined, 'place réservée : inchangé');
  for (const raison of ['complet', 'ip_en_preparation']) {
    const x = A.lirePreparation({ ok: false, raison, inscrit: false });
    ok(x.continuer === false && x.attente === true, `${raison} (rien qui puisse venir, ou serveur plein) : la liste d’attente, comme avant`);
  }
  ok(Tx.textesConnexion('fr').cloudSePrepare === 'Ton FillSell Cloud se prépare…' && Tx.textesConnexion('en').cloudSePrepare === 'Your FillSell Cloud is getting ready…',
    'la phrase neutre, en français et en anglais');
  const dits = [], appels = { rpc: [], stripe: 0, confirmer: 0 };
  const supabase = {
    rpc: async (nom) => { appels.rpc.push(nom); return nom === 'cloud_essai_preparer_moi'
      ? { data: { ok: true, essai: true, raison: null, place: 'en_preparation', place_jusqu_au: '2026-11-20T21:30:00Z' } } : { data: null }; },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  };
  const vieuxFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { if (String(url).includes('create-checkout-session')) appels.stripe++; return { json: async () => ({}) }; };
  try {
    const achat = A.creerAchatCloud({ supabase, supabaseUrl: 'https://x', supabaseAnonKey: 'k', user: { id: 'u', email: 'e' }, lang: 'fr', platform: 'web',
      purchasePremium: async () => ({}), ouvrirLien: async () => {}, confirmer: async () => { appels.confirmer++; return true; }, notifier: (m) => dits.push(m),
      paiementsAndroidCoupes: async () => false, demanderConditions: async () => true });
    await achat.acheter('selftest');
  } finally { globalThis.fetch = vieuxFetch; }
  ok(appels.stripe === 1 && appels.confirmer === 0 && !appels.rpc.includes('cloud_attente_inscrire_moi'),
    'web, place promise : la page de paiement est demandée, aucune question de liste d’attente, aucune inscription');
  ok(dits.includes('Ton FillSell Cloud se prépare…') && !dits.some((d) => /liste|prévenu|inscri/i.test(d)), `l’écran dit « Ton FillSell Cloud se prépare… » (${JSON.stringify(dits)})`);
} finally { await vite.close(); }

console.log('4. L’ops-digest');
const T = Date.parse('2026-11-20T21:00:00Z');
const echecs = achatsIpEnEchec({ maintenant: T, commandes: [
  { id: 52, nature: 'achat', statut: 'echec', quantite: 1, commande: '89079055', demandee_le: '2026-11-20T16:43:00Z', details: { erreur: 'commande non livrée par IPRoyal (remboursée)' } },
  { id: 40, nature: 'achat', statut: 'echec', quantite: 1, demandee_le: '2026-11-18T10:00:00Z', details: { erreur: 'vieux' } },
  { id: 60, nature: 'achat', statut: 'demandee', quantite: 1, commande: null, demandee_le: '2026-11-20T20:40:00Z', details: { erreur: 'HTTP 502' } },
  { id: 61, nature: 'achat', statut: 'demandee', quantite: 1, commande: null, demandee_le: '2026-11-20T20:58:00Z', details: {} },
  { id: 57, nature: 'achat', statut: 'livree', quantite: 1, commande: '89090351', demandee_le: '2026-11-20T20:09:00Z', details: {} },
] });
ok(echecs.length === 2 && /^Achat n° 52 \(1 IP, 20\/11 17:43\) en échec : commande non livrée par IPRoyal \(remboursée\) — commande IPRoyal 89079055\.$/.test(echecs[0])
  && /^Achat n° 60 .*issue INCONNUE depuis 20 min/.test(echecs[1]), `achats d'IP en échec : 24 h, et les issues inconnues de plus de 10 min (heure de Paris) — ${JSON.stringify(echecs)}`);
const sansIp = essaisCloudSansIp({ maintenant: T,
  profils: [
    { id: 'aaaaaaaa-1', cloud_essai_debut: '2026-11-20T20:00:00Z', cloud_essai_fin: '2026-11-27T20:00:00Z' },
    { id: 'bbbbbbbb-2', cloud_essai_debut: '2026-11-20T20:45:00Z', cloud_essai_fin: '2026-11-27T20:45:00Z' },
    { id: 'cccccccc-3', cloud_essai_debut: '2026-11-19T20:00:00Z', cloud_essai_fin: '2026-11-26T20:00:00Z' },
    { id: 'dddddddd-4', is_cloud: true, cloud_essai_debut: '2026-10-01T20:00:00Z', cloud_essai_fin: '2026-10-08T20:00:00Z' },
    { id: 'eeeeeeee-5', cloud_essai_debut: '2026-11-20T19:00:00Z', cloud_essai_fin: '2026-11-27T19:00:00Z', cloud_essai_arrete: true },
  ],
  titulaires: ['cccccccc-3'],
  evenements: [{ user_id: 'dddddddd-4', le: '2026-11-20T20:50:00Z' }] });
ok(sansIp.length === 1 && /^aaaaaaaa \(essai Cloud\) sans IP depuis 20\/11 21:00 \(60 min\)/.test(sansIp[0]),
  `Cloud sans IP > 30 min : l'essai de 60 min oui ; 15 min, avec IP, perte d'IP il y a 10 min, essai arrêté : non — ${JSON.stringify(sansIp)}`);
ok(essaisCloudSansIp({ maintenant: T, rotation: true, profils: [{ id: 'aaaaaaaa-1', is_cloud: true }] }).length === 0, 'rotation : jamais');
const od = lire('supabase/functions/ops-digest/index.ts');
ok(/import \{ achatsIpEnEchec, essaisCloudSansIp \} from "\.\/veilleIpCloud\.js";/.test(od)
  && /achats_ip_en_echec: achatsIpEchecs\.length,/.test(od) && /cloud_sans_ip_30min: cloudSansIp\.length,/.test(od),
  'ops-digest : les deux lignes comptent comme anomalies (le digest part)');
ok(/🔴 Achat d'IP en échec \(24 h\) : \$\{achatsIpEchecs\.length\}/.test(od) && /🔴 Essai Cloud sans IP depuis plus de 30 min : \$\{cloudSansIp\.length\}/.test(od)
  && /\$\{cloudSansIp\.length \? `🔴 Cloud sans IP > 30 min : \$\{cloudSansIp\.length\} — ` : ""\}\$\{achatsIpEchecs\.length \? `🔴 Achat d'IP en échec : \$\{achatsIpEchecs\.length\} — ` : ""\}/.test(od),
  'ops-digest : les deux sections rouges et l’objet du mail');

console.log(ko ? `✗ ${ko} échec(s) sur ${n}` : `✓ cloud-place-promise-2011 : ${n}/${n}`);
process.exitCode = ko ? 1 : 0;
