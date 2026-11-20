// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE CLOUD PROPOSE LES PLATEFORMES COCHÉES ∪ CELLES OÙ L'ON A DE L'ACTIVITÉ, MOINS LES ÉCARTÉES ; UNE TÂCHE
// QUI ATTEND UNE PLATEFORME JAMAIS CONNECTÉE AU CLOUD LE DIT (16/11/2026 nuit, point 2 de Nico)
//                                        npm run selftest:cloud-plateformes-actives
// ═══════════════════════════════════════════════════════════════════════════
// Constat (compte a962a59e, Pro + Cloud en essai depuis le 16/11 15:39) : Vinted seule cochée à l'inscription
// (09/11 12:56 → platform_settings.plateformes_vendeur = ["vinted"]) ; Leboncoin (22:02) et Beebs (22:15) publiés le soir
// même depuis l'extension de son PC, qui ne lit pas cette liste — rien ne la mettait à jour. Au Cloud, « Me connecter »
// ne lui proposait que Vinted (cloud_connexion_carte_vue : total 1), ouvert 15 fois de 15:43 à 18:34 sans pouvoir
// connecter Leboncoin ni Beebs ; ses publications Leboncoin/Beebs attendaient SANS AUCUN MESSAGE (error null), quand
// 13e274de et c7c382b7 (plateforme « à reconnecter ») lisaient « En attente de ta connexion à Beebs dans FillSell Cloud… ».
//
// Ce que ce verrou fait tomber :
//   1. un compte qui a coché Vinted seul et qui publie sur Leboncoin ne voit pas Leboncoin dans le panneau Cloud ;
//   2. une plateforme écartée (« je ne vends pas sur X ») proposée quand même — sauf quand un RETRAIT y attend (la doctrine
//      des écartées : un retrait part toujours ; 13e274de et af37fa49, 16/11) ; eBay ou Opla proposés au Cloud ;
//      une liste vide ([], c7c382b7) ou absente (null, f0acd3af) qui ne propose pas TOUTES les plateformes du Cloud ;
//   3. une lecture d'activité qui écrit, qui lit plus d'une ligne par table, ou qui affirme sur une lecture en échec ;
//   4. une tâche d'une plateforme du Cloud JAMAIS connectée (aucune ligne au coffre) servie à personne sans message.
// Racine relisible (VERROU_RACINE) : le même verrou se rejoue sur une copie de l'ancien code (rouge avant, vert après).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = process.env.VERROU_RACINE ? path.resolve(process.env.VERROU_RACINE) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => (fs.existsSync(path.join(RACINE, p)) ? fs.readFileSync(path.join(RACINE, p), 'utf8').replace(/\r\n/g, '\n') : '');
let rouges = 0, verts = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 600)}` : ''}`); }
};
const importer = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e).slice(0, 200) }; } };
const fn = (m, n) => (typeof m?.[n] === 'function' ? m[n] : () => { throw new Error(`${n} absente${m?.__erreur ? ` (${m.__erreur})` : ''}`); });
const essai = (f) => { try { return f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };
const essaiA = async (f) => { try { return await f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };
const ids = (l) => (Array.isArray(l) ? l.map((p) => p.id ?? p).join(',') : JSON.stringify(l));

const CX = await importer('src/cloud/connexionsCloud.js');
const AC = await importer('src/cloud/activitePlateformes.js');
const V = await importer('supabase/functions/_shared/cloud-voie.js');
const A = await importer('supabase/functions/_shared/attente-session.js');
const choisies = fn(CX, 'plateformesCloudChoisies');
const aLire = fn(CX, 'plateformesActiviteALire');
const avancement = fn(CX, 'avancementConnexions');
const lireActives = fn(AC, 'lirePlateformesActives');
const lireRetraits = fn(AC, 'lireRetraitsEnAttente');
const retraitsALire = fn(CX, 'plateformesRetraitsALire');
const foi = fn(V, 'sessionsQuiFontFoi');
const attente = fn(A, 'attenteSessionServeur');

// Un faux client Supabase : des lignes par table, toute écriture comptée, chaque lecture notée.
function fauxClient(lignes, { echec = [] } = {}) {
  const journal = [];
  let ecritures = 0;
  return {
    journal, get ecritures() { return ecritures; },
    from(table) {
      const filtres = {}; let limite = null; let enEchec = echec.includes(table);
      const q = {
        select() { return q; },
        eq(c, v) { filtres[c] = v; return q; },
        in(c, v) { filtres[`${c}∈`] = v; return q; },
        limit(n) { limite = n; return q; },
        insert() { ecritures++; return q; }, update() { ecritures++; return q; }, upsert() { ecritures++; return q; }, delete() { ecritures++; return q; },
        then(res, rej) {
          journal.push({ table, filtres: { ...filtres }, limite });
          if (enEchec) return Promise.resolve({ data: null, error: { message: 'réseau' } }).then(res, rej);
          const data = (lignes[table] ?? []).filter((l) => Object.entries(filtres).every(([c, v]) => (c.endsWith('∈') ? v.includes(l[c.slice(0, -1)]) : l[c] === v)));
          return Promise.resolve({ data: data.slice(0, limite ?? data.length), error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

// ── 1. Le cas réel : Vinted seule cochée, Leboncoin et Beebs publiés depuis le PC ───────────────────────────────────
console.log('1. Vinted cochée seule, Leboncoin et Beebs publiés depuis l\'extension du PC (a962a59e, 16/11)');
const U = 'u-a962a59e';
const PS_A962 = { plateformes_vendeur: ['vinted'] };
const BASE_A962 = {
  annonces_plateforme: [{ id: 'a1', user_id: U, platform: 'vinted' }],
  cross_post_jobs: [
    { id: 'j1', user_id: U, platform: 'leboncoin', status: 'published' },   // 09/11 22:02, depuis le PC
    { id: 'j2', user_id: U, platform: 'beebs', status: 'published' },       // 09/11 22:15, depuis le PC
  ],
  vinted_sync_runs: [],
};
const candidats = essai(() => aLire(PS_A962, []));
ok(ids(candidats) === 'leboncoin,beebs,depop', 'à lire : les plateformes du Cloud ni cochées ni écartées (jamais eBay ni Opla)', ids(candidats));
const client = fauxClient(BASE_A962);
const actives = await essaiA(() => lireActives(client, U, candidats, []));
ok(ids(actives) === 'leboncoin,beebs', 'actives : Leboncoin et Beebs (leurs tâches), pas Depop', ids(actives));
const pf = essai(() => choisies(PS_A962, [], actives));
ok(ids(pf) === 'vinted,leboncoin,beebs', '« Me connecter » propose Vinted, Leboncoin ET Beebs (avant : Vinted seule, total 1)', ids(pf));
const av = essai(() => avancement({ plateformes: pf, etats: { vinted: { connecte: true } }, isoles: [] }));
ok(av?.total === 3 && ids(av?.aConnecter) === 'leboncoin,beebs', 'la carte et le total : « 1 sur 3 connectée », Leboncoin et Beebs à connecter', JSON.stringify(av));
ok(client.ecritures === 0, 'la lecture d\'activité n\'écrit RIEN (plateformes_vendeur jamais réécrite)');
ok(client.journal.length > 0 && client.journal.every((l) => l.limite === 1 && l.filtres.user_id === U && typeof l.filtres.platform === 'string'),
  'une ligne au plus par lecture, du seul compte, d\'une seule plateforme', JSON.stringify(client.journal));
ok(client.journal.filter((l) => l.filtres.platform === 'leboncoin').map((l) => l.table).join() === 'annonces_plateforme,cross_post_jobs',
  'la première table qui répond arrête les suivantes (Leboncoin : annonce absente, tâche trouvée → aucun relevé lu)', JSON.stringify(client.journal.filter((l) => l.filtres.platform === 'leboncoin')));
const dep = client.journal.filter((l) => l.filtres.platform === 'depop');
ok(dep.map((l) => l.table).join() === 'annonces_plateforme,cross_post_jobs,vinted_sync_runs' && JSON.stringify(dep[2]?.filtres?.['status∈']) === '["done","incomplete"]',
  'Depop sans rien : les 3 lectures, le relevé seulement s\'il est RÉUSSI (done, incomplete)', JSON.stringify(dep));
const rel = await essaiA(() => lireActives(fauxClient({ vinted_sync_runs: [{ id: 'r', user_id: U, platform: 'depop', status: 'done' }, { id: 'r2', user_id: U, platform: 'beebs', status: 'absente' }] }), U, ['depop', 'beebs'], []));
ok(ids(rel) === 'depop', 'un relevé réussi suffit (Depop) ; un relevé « absente » ne prouve rien (Beebs)', ids(rel));
const ann = await essaiA(() => lireActives(fauxClient({ annonces_plateforme: [{ id: 'x', user_id: U, platform: 'beebs' }] }), U, ['beebs'], []));
ok(ids(ann) === 'beebs', 'une annonce relevée et reliée suffit (Beebs)', ids(ann));
const enEchec = await essaiA(() => lireActives(fauxClient(BASE_A962, { echec: ['annonces_plateforme', 'cross_post_jobs', 'vinted_sync_runs'] }), U, candidats, ['beebs']));
ok(ids(enEchec) === 'beebs', 'lecture en échec : rien n\'est affirmé (seules restent celles déjà vues actives), jamais d\'exception', ids(enEchec));
const autre = await essaiA(() => lireActives(fauxClient(BASE_A962), 'u-autre', candidats, []));
ok(Array.isArray(autre) && autre.length === 0, 'l\'activité d\'un AUTRE compte ne compte jamais', ids(autre));

// ── 2. Les écartées, eBay / Opla, les listes vides ou absentes ─────────────────────────────────────────────────────
console.log('\n2. Les écartées, eBay et Opla, les listes vides ou absentes');
ok(ids(essai(() => choisies({ plateformes_vendeur: ['vinted'], plateformes_ecartees: ['leboncoin'] }, [], ['leboncoin', 'beebs']))) === 'vinted,beebs',
  'une plateforme écartée (« je ne vends pas sur Leboncoin ») n\'est JAMAIS proposée, même active');
ok(ids(essai(() => aLire({ plateformes_vendeur: ['vinted'], plateformes_ecartees: ['beebs'] }, ['leboncoin']))) === 'depop',
  'à lire : ni les écartées, ni les fermées au pays');
ok(ids(essai(() => choisies({ plateformes_vendeur: ['vinted', 'ebay'] }, [], ['ebay', 'opla']))) === 'vinted', 'eBay (l\'API) et Opla : jamais au Cloud, même actives');
ok(ids(essai(() => choisies({ plateformes_vendeur: [] }, [], []))) === 'vinted,leboncoin,beebs,depop', 'liste VIDE ([], c7c382b7) : toutes les plateformes du Cloud');
ok(ids(essai(() => choisies({ plateformes_vendeur: null }, [], []))) === 'vinted,leboncoin,beebs,depop' && ids(essai(() => choisies(null, [], []))) === 'vinted,leboncoin,beebs,depop',
  'liste ABSENTE (null, f0acd3af ; ou réglages absents) : toutes les plateformes du Cloud');
ok(ids(essai(() => choisies({ plateformes_vendeur: [], plateformes_ecartees: ['depop'] }, [], []))) === 'vinted,leboncoin,beebs', 'liste vide : toutes, MOINS les écartées');
ok(ids(essai(() => aLire({ plateformes_vendeur: [] }, []))) === '' && ids(essai(() => aLire(null, []))) === '', 'liste vide ou absente : aucune activité à lire (déjà toutes proposées)');
ok(ids(essai(() => choisies({ plateformes_vendeur: ['vinted', 'leboncoin'] }, ['leboncoin'], ['beebs']))) === 'vinted,beebs', 'une plateforme fermée au pays sort, même cochée');
ok(ids(essai(() => choisies({ plateformes_vendeur: ['leboncoin', 'vinted', 'ebay'] }))) === 'vinted,leboncoin', 'sans activité lue : les cochées ∩ Cloud, dans l\'ordre du Cloud (comme avant)');
// 13e274de (16/11) : Beebs cochée ET écartée, 7 retraits Beebs « Reconnecte Beebs dans l'app » ; af37fa49 : 2 retraits.
const PS_13E2 = { plateformes_vendeur: ['vinted', 'ebay', 'beebs', 'leboncoin'], plateformes_ecartees: ['depop', 'beebs'] };
ok(ids(essai(() => retraitsALire(PS_13E2, []))) === 'beebs,depop', 'les retraits ne se lisent que pour les écartées du Cloud', ids(essai(() => retraitsALire(PS_13E2, []))));
const cR = fauxClient({ cross_post_jobs: [
  { id: 'd1', user_id: 'u-13e274de', platform: 'beebs', action: 'delete', status: 'pending' },
  { id: 'd2', user_id: 'u-13e274de', platform: 'depop', action: 'delete', status: 'deleted' },
  { id: 'p1', user_id: 'u-13e274de', platform: 'depop', action: 'publish', status: 'pending' },
] });
const retR = await essaiA(() => lireRetraits(cR, 'u-13e274de', ['beebs', 'depop']));
ok(ids(retR) === 'beebs', 'un retrait EN ATTENTE (Beebs) compte ; un retrait fini ou une publication en attente (Depop), non', ids(retR));
ok(cR.ecritures === 0 && cR.journal.length === 2 && cR.journal.every((l) => l.limite === 1 && l.filtres.action === 'delete'), 'une ligne au plus, les seuls retraits, aucune écriture', JSON.stringify(cR.journal));
ok(ids(essai(() => choisies(PS_13E2, [], [], retR))) === 'vinted,leboncoin,beebs',
  'une écartée dont un RETRAIT attend reste proposée (« un retrait part toujours » : sinon la vente d\'ailleurs resterait en ligne)', ids(essai(() => choisies(PS_13E2, [], [], retR))));
ok(ids(essai(() => choisies(PS_13E2, [], [], []))) === 'vinted,leboncoin', 'sans retrait en attente : l\'écartée sort', ids(essai(() => choisies(PS_13E2, [], [], []))));
ok(ids(essai(() => choisies({ plateformes_vendeur: [], plateformes_ecartees: ['beebs'] }, [], [], ['beebs']))) === 'vinted,leboncoin,beebs,depop', 'liste vide : toutes, l\'écartée revenue par son retrait comprise');

// ── 3. Les écrans lisent la règle ──────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Le hook, la carte et le panneau « Me connecter »');
const hook = lire('src/cloud/useConnexionsCloud.js');
ok(/plateformesActiviteALire\(ps, listeFermees\)/.test(hook) && /lirePlateformesActives\(supabase, userId, aLire, a\.actives\)/.test(hook)
  && /plateformesCloudChoisies\(ps, listeFermees, activite\.current\.actives, retraits\)/.test(hook),
  'useConnexionsCloud : cochées ∪ actives (lues pour les seules plateformes ni cochées ni écartées)');
ok(/RELECTURE_ACTIVITE_MS/.test(hook) && Number(AC.RELECTURE_ACTIVITE_MS) >= 10 * 60_000 && !/setInterval/.test(hook.replace(/\/\/.*$/gm, '')),
  'l\'activité est relue au plus toutes les 10 min, jamais par un setInterval');
const panneau = lire('src/cloud/MeConnecterCloud.jsx');
ok(/const plateformesEcran = CLOUD_PLATEFORMES_CONNEXION\.filter\(\(p\) => !plateformesFermees\.includes\(p\.id\) && \(!Array\.isArray\(choisies\) \|\| !choisies\.length \|\| choisies\.includes\(p\.id\)\)\);/.test(panneau),
  '« Me connecter » : la liste reçue (cochées ∪ actives − écartées) ; ouvert depuis les Réglages (sans liste) : toutes, inchangé');
ok(/plateformesRetraitsALire\(ps, listeFermees\)/.test(hook) && /lireRetraitsEnAttente\(supabase, userId, ecarteesALire\)/.test(hook),
  'useConnexionsCloud : les retraits en attente des écartées sont lus et passés à la règle');
const app = lire('src/App.jsx');
ok(/choisies=\{cxOrigine&&cxOrigine!=='refus_compte'&&cxCloud\.lu\?cxCloud\.plateformes\.map\(\(p\)=>p\.id\):null\}/.test(app) && /carteConnexionVisible\(\{clientCloud,lu:cxCloud\.lu,avancement:cxCloud\.avancement\}\)/.test(app),
  'le panneau, la carte et le total (cloud_connexion_auto, cloud_connexion_carte_vue) lisent la même liste (cxCloud)');

// ── 4. Une tâche qui attend une plateforme jamais connectée au Cloud le dit ─────────────────────────────────────────
console.log('\n4. Plus jamais une attente muette (serveur : _shared/cloud-voie.js, _shared/attente-session.js, get-pending-jobs)');
const COFFRE_A962 = [{ plateforme: 'vinted', connecte: true, maj_le: '2026-11-16T14:50:00.000Z' }, { plateforme: 'fillsell', connecte: true, maj_le: '2026-11-16T14:40:00.000Z' }];
const F = essai(() => foi(null, { cloudVoie: true, coffre: COFFRE_A962, platformSettings: PS_A962 }));
ok(F?.jamais instanceof Set && [...F.jamais].join() === 'leboncoin,beebs,depop', 'coffre de a962a59e (Vinted seul) : Leboncoin, Beebs et Depop jamais connectées', JSON.stringify(F?.jamais ? [...F.jamais] : F));
ok(F?.sessions?.leboncoin === null && F?.sessions?.vinted === true, '`sessions` ne change pas : une plateforme absente du coffre reste inconnue (jamais « morte »)', JSON.stringify(F?.sessions));
const Fi = essai(() => foi(null, { cloudVoie: true, coffre: [], platformSettings: { beebs: { cloud_isole: { connecte: true } } } }));
ok(Fi?.jamais instanceof Set && !Fi.jamais.has('beebs') && Fi.jamais.has('vinted'), 'une connexion isolée (navigateur réservé) compte comme connectée', JSON.stringify(Fi?.jamais ? [...Fi.jamais] : Fi));
const Fn = essai(() => foi(null, { cloudVoie: true, coffre: null }));
const Fp = essai(() => foi({ vinted: true }, { cloudVoie: false, coffre: [] }));
ok(Fn?.jamais instanceof Set && Fn.jamais.size === 0 && Fp?.jamais instanceof Set && Fp.jamais.size === 0,
  'coffre illisible, ou compte sans Cloud : rien n\'est jugé (jamais une tâche retenue sur un doute)');
const JOB = { platform: 'leboncoin', action: 'publish', status: 'pending', error: null, platform_fields: {} };
const M = essai(() => attente(JOB, { cloud: true, jamaisConnectee: true, maintenantIso: '2026-11-16T15:55:00.000Z', observeeLe: '2026-11-16T15:55:00.000Z' }));
ok(/^En attente de ta connexion à Leboncoin dans FillSell Cloud : /.test(M?.error ?? '') && A.ATTENTE_SESSION_RE?.test?.(M?.error ?? ''),
  'publication NEUVE : « En attente de ta connexion à Leboncoin dans FillSell Cloud… » (même ancre que 13e274de et c7c382b7)', M?.error ?? JSON.stringify(M));
ok(/pas encore connecté/.test(M?.error ?? '') && /Connecte Leboncoin dans l'app \(Réglages › Mes plateformes › « Me connecter »\)/.test(M?.error ?? '') && !/chrome|ordinateur|extension/i.test(M?.error ?? ''),
  'le geste du Cloud : « Connecte Leboncoin dans l\'app » — jamais Chrome, l\'ordinateur ni l\'extension', M?.error);
ok(M?.platform_fields?.attente_session?.pose_par === A.ATTENTE_SESSION_POSE_PAR_SERVEUR && A.attentePoseeParLeServeur?.(M?.platform_fields) === true,
  'marqueur posé par le serveur : handler-watch le lève dès que le coffre dit la plateforme connectée', JSON.stringify(M?.platform_fields));
ok(essai(() => attente({ ...JOB, error: M?.error, platform_fields: M?.platform_fields }, { cloud: true, jamaisConnectee: true })) === null,
  'une tâche qui porte déjà le message n\'est jamais réécrite');
const R = essai(() => attente({ ...JOB, platform: 'beebs', action: 'delete' }, { cloud: true, jamaisConnectee: true }));
ok(/^En attente de ta connexion à Beebs dans FillSell Cloud : ton article est vendu/.test(R?.error ?? '') && /double vente/.test(R?.error ?? ''), 'un retrait le dit aussi (risque de double vente)', R?.error);
const Rc = essai(() => attente(JOB, { cloud: true }));
ok(/est à reconnecter\. Reconnecte Leboncoin dans l'app/.test(Rc?.error ?? ''), 'plateforme connectée un jour puis tombée : le texte d\'avant (« à reconnecter »), inchangé', Rc?.error);
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
ok(/for \(const pf of foiSessions\.jamais \?\? \[\]\) \{\s*if \(!mortes\.has\(pf\)\) mortes\.set\(pf, \{ observeeLe: Date\.now\(\), fraiche: true, cloud: true, jamais: true \}\);\s*\}/.test(gpj)
  && /jamaisConnectee: m\?\.jamais === true,/.test(gpj)
  && /sessionsFoiDuCompte\(user\.id, cloudVoie, profS\?\.extension_sessions \?\? null, psProfil\)/.test(gpj)
  && /return sessionsQuiFontFoi\(sessions, \{ cloudVoie, coffre, platformSettings \}\)/.test(gpj),
  'get-pending-jobs : une plateforme du Cloud jamais connectée retient ses tâches AVEC le message (connexions isolées lues)');

console.log(`\n${rouges ? `✗ cloud-plateformes-actives : ${rouges} rouge(s), ${verts} vert(s)` : `✓ cloud-plateformes-actives : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
