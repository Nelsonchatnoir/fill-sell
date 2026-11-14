// ═══════════════════════════════════════════════════════════════════════════
// VERROU (14/11/2026, point 4 de Nico — compte 13e274de) : COMPTE SUR LE CLOUD = L'EXTENSION DU PC NE FAIT PLUS RIEN
//   npm run selftest:compte-cloud-pc-en-pause
// ═══════════════════════════════════════════════════════════════════════════
// Le cas RÉEL (lu en base le 14/11, lecture seule ; heures UTC telles quelles, Paris = +1 h) :
//   · poste 727410c6 = l'extension du PC (Store 0.6.186, build 2026-11-10T14:10:14Z+ba13a51, Windows, ANGLE Intel HD
//     D3D11) : sonde 11:44:09.553Z → profiles.extension_sessions.beebs = false (ebay true http 200, beebs http null) ;
//     ses sessions de poste : beebs false, lu_le 11:44:09.750Z ; dernier poll 11:48:08Z ; ses traces usage_logs :
//     releve_ventes 08:46:12Z (vinted http_400, leboncoin jeton_absent), ventes_beebs_lecture_echec 09:32:57Z (403),
//     lecture_fond « page » 09:55:04Z et 09:59:29Z ;
//   · poste 8564d390 = le poste Cloud (build 2026-11-14T11:39:28Z+b05bafe-cloud, Linux Mesa) : beebs null (non sondée) ;
//   · cloud_coffre de 13e274de : vinted et leboncoin connectés, beebs connecte = false depuis 10:35:50Z (relevé Beebs du
//     Cloud 10:33:24Z : « FillSell Cloud : beebs demande une reconnexion (session fermée ou jeton non renouvelé) ») ;
//   · 6 retraits Beebs pending (5 fantômes 404 + 34356253), marqués par get-pending-jobs « session connue morte (relevée
//     par l'extension) » : « En attente de ta connexion à Beebs dans Chrome … Connecte-toi à Beebs sur ton ordinateur ».
// La RÈGLE verrouillée (rouge sur 8035118, vert après) :
//   1. get-pending-jobs : un compte au Cloud actif ne sert RIEN à un poste qui n'est pas le poste Cloud (réponse vide +
//      compte_cloud), n'écrit rien pour lui, ne note pas ses sessions ; Cloud plus actif → tout reprend ;
//   2. la connexion d'une plateforme du Cloud se lit dans le coffre du Cloud (get-pending-jobs, handler-watch) ;
//   3. le message d'une tâche retenue dit « reconnecte X dans l'app (… « Me connecter ») » — jamais Chrome, l'ordinateur
//      ou l'extension ; l'ancien texte de l'ordinateur est remplacé une fois ;
//   4. extension 0.6.190 : pause dite par le serveur à chaque poll, reprise au premier poll qui ne la dit plus, popup ;
//      jamais sur la copie Cloud ;
//   5. migration PRÉPARÉE (non appliquée) : la base ignore l'écriture d'extension_sessions d'un poste non Cloud.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => (fs.existsSync(path.join(RACINE, p)) ? fs.readFileSync(path.join(RACINE, p), 'utf8').replace(/\r\n/g, '\n') : '');
let ko = 0, verts = 0;
const ok = (nom, cond, d = '') => { if (cond) verts++; else ko++; console.log(`  ${cond ? 'ok  ' : 'KO  '} ${nom}${cond ? '' : `  ← ${d}`}`); };
const importer = async (p) => { try { return await import(pathToFileURL(path.join(RACINE, p)).href); } catch (e) { console.log(`  (import ${p} : ${String(e?.message ?? e).slice(0, 140)})`); return {}; } };
const fn = (m, n) => (typeof m?.[n] === 'function' ? m[n] : () => { throw new Error(`${n} absente`); });
const essai = (f) => { try { return f(); } catch (e) { return { erreur: String(e?.message ?? e) }; } };

const V = await importer('supabase/functions/_shared/cloud-voie.js');
const A = await importer('supabase/functions/_shared/attente-session.js');
const posteEcarte = fn(V, 'posteEcarteParLeCloud');
const reponse = fn(V, 'reponseCompteAuCloud');
const foi = fn(V, 'sessionsQuiFontFoi');
const attente = fn(A, 'attenteSessionServeur');
const SANS_ORDI = /chrome|ordinateur|extension/i;

// ── Les données réelles (14/11) ───────────────────────────────────────────────────────────────────────────────────
const SESSIONS_13E = { ebay: true, beebs: false, vinted: true, leboncoin: true, http: { ebay: 200, beebs: null, vinted: 200, leboncoin: 403 },
  checked_at_par_plateforme: { ebay: '2026-11-14T11:44:09.553Z', beebs: '2026-11-14T11:44:09.553Z', vinted: '2026-11-14T14:05:01.127Z', leboncoin: '2026-11-14T12:43:10.745Z' } };
const COFFRE_13E = [
  { plateforme: 'beebs', connecte: false, maj_le: '2026-11-14T10:35:50.005Z' },
  { plateforme: 'fillsell', connecte: true, maj_le: '2026-11-14T14:09:34.087Z' },
  { plateforme: 'leboncoin', connecte: true, maj_le: '2026-11-14T14:09:33.896Z' },
  { plateforme: 'vinted', connecte: true, maj_le: '2026-11-14T14:09:33.824Z' },
];
const TEXTE_PC = "En attente de ta connexion à Beebs dans Chrome : ton article est vendu mais son annonce est encore en ligne sur Beebs (risque de double vente). Connecte-toi à Beebs sur ton ordinateur : le retrait repartira tout seul.";
const RETRAIT_34356253 = { platform: 'beebs', action: 'delete', status: 'pending', platform_listing_id: '34356253', error: TEXTE_PC,
  platform_fields: { attente_session: { motif: "session connue morte (relevée par l'extension) — tâche retenue par le serveur", depuis: '2026-11-14T11:44:09.553Z',
    derniere: '2026-11-14T13:03:03.351Z', platform: 'beebs', pose_par: 'get-pending-jobs (session connue morte)', observations: 0 } } };

console.log('1. Qui est mis de côté (pur)');
ok('PC d\'un compte au Cloud actif : mis de côté', essai(() => posteEcarte({ cloudVoie: true, posteCloud: false })) === true);
ok('le poste Cloud : jamais', essai(() => posteEcarte({ cloudVoie: true, posteCloud: true })) === false);
ok('Cloud plus actif (cloud_voie faux : fin d\'essai, résiliation, impayé) : le PC reprend', essai(() => posteEcarte({ cloudVoie: false, posteCloud: false })) === false);
ok('drapeau illisible (null) : comme avant, jamais privé de sa file sur un doute', essai(() => posteEcarte({ cloudVoie: null, posteCloud: false })) === false);
const R = essai(() => reponse({ delegations: [{ compte: 'x', plateformes: ['leboncoin'] }] }));
ok('réponse : aucune tâche, aucun relevé, aucune commande, aucune lecture de fond, aucune demande de connexion',
  Array.isArray(R?.jobs) && R.jobs.length === 0 && R.sync_command === null && R.sync_commands?.length === 0 && R.sync_commands_annonces?.length === 0
  && R.connexion_commands?.length === 0 && R.lecture_fond === null && R.lecture_fond_beebs === null, JSON.stringify(R));
ok('réponse : compte_cloud dit, avec le texte de pause (« Extension en pause : ton compte utilise FillSell Cloud »)',
  R?.compte_cloud?.actif === true && /^Extension en pause : ton compte utilise FillSell Cloud, tout se fait depuis nos serveurs/.test(R.compte_cloud.texte ?? ''), JSON.stringify(R?.compte_cloud));
ok('le texte de pause ne demande rien à l\'ordinateur ni à Chrome', !/chrome|ordinateur/i.test(R?.compte_cloud?.texte ?? 'x'));
ok('un compte qui exécute Leboncoin pour d\'autres garde sa liste (delegations)', R?.delegations?.length === 1);
ok('extensions déjà installées (≥ 0.6.164) : Leboncoin « délégué ailleurs » — plus aucune visite Leboncoin de ce poste, même de lui-même',
  R?.blocages?.leboncoin?.etat === 'delegue' && /FillSell Cloud/.test(R.blocages.leboncoin.message ?? '') && !/ordinateur|chrome/i.test(R.blocages.leboncoin.message ?? 'x'), JSON.stringify(R?.blocages));
ok('… levier réellement lu par l\'extension : « delegue » arrête sonde, relevé, ventes, veilleur Leboncoin (leboncoinEnPause / leboncoinDelegueAilleurs)',
  /if \(plateformes\.includes\("leboncoin"\) && await leboncoinDelegueAilleurs\(\)\)/.test(lire('chrome-extension/background.js'))
  && /return Boolean\(b && b\.etat && b\.etat !== "libre"\);/.test(lire('chrome-extension/background.js')));

console.log('2. La connexion qui fait foi (pur) — 13e274de');
const F = essai(() => foi(SESSIONS_13E, { cloudVoie: true, coffre: COFFRE_13E }));
ok('Beebs : jugée par le coffre du Cloud (à reconnecter depuis 10:35:50Z), pas par la sonde du PC',
  F?.sessions?.beebs === false && F.sessions.checked_at_par_plateforme?.beebs === '2026-11-14T10:35:50.005Z' && F.cloud?.has('beebs'), JSON.stringify(F));
ok('Vinted, Leboncoin : connectées selon le Cloud', F?.sessions?.vinted === true && F.sessions.leboncoin === true);
ok('eBay : la sonde du PC (true) ne dit rien pour un client Cloud', F?.sessions?.ebay === null && !F.cloud?.has('ebay'));
ok('Depop jamais connectée au Cloud : inconnue (jamais « morte »)', F?.sessions?.depop === null);
const Frecon = essai(() => foi(SESSIONS_13E, { cloudVoie: true, coffre: COFFRE_13E.map((l) => (l.plateforme === 'beebs' ? { ...l, connecte: true, maj_le: '2026-11-14T16:00:00.000Z' } : l)) }));
ok('Beebs reconnectée dans l\'app : vivante, datée de la reconnexion (la retenue tombe)', Frecon?.sessions?.beebs === true && Frecon.sessions.checked_at_par_plateforme.beebs === '2026-11-14T16:00:00.000Z');
const Fsans = essai(() => foi(SESSIONS_13E, { cloudVoie: false, coffre: COFFRE_13E }));
ok('Cloud plus actif : extension_sessions telles quelles (l\'ordinateur reprend)', Fsans?.sessions === SESSIONS_13E && Fsans.cloud?.size === 0);
const Fillisible = essai(() => foi(SESSIONS_13E, { cloudVoie: true, coffre: null }));
ok('coffre illisible : rien de « mort » (aucune retenue sur un doute)', Fillisible?.sessions?.beebs === null);

console.log('3. Le message d\'une tâche retenue, pour un client Cloud — retrait 34356253');
const M = essai(() => attente(RETRAIT_34356253, { observeeLe: '2026-11-14T10:35:50.005Z', navigateur: 'Chrome', maintenantIso: '2026-11-14T16:00:00.000Z', cloud: true }));
ok('l\'ancien texte de l\'ordinateur est remplacé (une écriture)', M && M.error !== TEXTE_PC, JSON.stringify(M));
ok('ancre gardée (« En attente de ta connexion à Beebs ») : l\'app, handler-watch, get-pending-jobs la lisent',
  A.ATTENTE_SESSION_RE?.test?.(M?.error ?? '') === true && /^En attente de ta connexion à Beebs/.test(M?.error ?? ''));
ok('le geste : reconnecter Beebs DANS L\'APP (« Me connecter »)', /Reconnecte Beebs dans l'app/.test(M?.error ?? '') && /Me connecter/.test(M?.error ?? ''), M?.error);
ok('jamais « Chrome », « ordinateur », « extension »', !SANS_ORDI.test(M?.error ?? 'Chrome'), M?.error);
ok('le risque de double vente reste dit', /risque de double vente/.test(M?.error ?? ''));
ok('marqueur : depuis gardé (11:44:09.553Z), posé par le serveur (la levée de handler-watch s\'applique), motif du Cloud',
  M?.platform_fields?.attente_session?.depuis === '2026-11-14T11:44:09.553Z'
  && M.platform_fields.attente_session.pose_par === 'get-pending-jobs (session connue morte)' && /FillSell Cloud/.test(M.platform_fields.attente_session.motif ?? ''), JSON.stringify(M?.platform_fields));
ok('déjà au texte du Cloud : rien à écrire (aucune ligne inchangée réécrite)',
  essai(() => attente({ ...RETRAIT_34356253, error: M?.error, platform_fields: M?.platform_fields }, { cloud: true })) === null);
const Mpub = essai(() => attente({ platform: 'vinted', action: 'republish', error: null, platform_fields: {} }, { cloud: true }));
ok('une republication : même geste, sans Chrome ni ordinateur', /Reconnecte Vinted dans l'app/.test(Mpub?.error ?? '') && !SANS_ORDI.test(Mpub?.error ?? 'Chrome'), Mpub?.error);
const Mordi = essai(() => attente({ platform: 'beebs', action: 'delete', error: null, platform_fields: {} }, { navigateur: 'Chrome' }));
ok('un compte sans Cloud : le texte de l\'ordinateur, inchangé', /dans Chrome/.test(Mordi?.error ?? '') && /sur ton ordinateur/.test(Mordi?.error ?? ''), Mordi?.error);

console.log('4. Branchements serveur');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const iTelem = gpj.indexOf('} catch (_e) { /* télémétrie best-effort, jamais bloquante */ }');
const iEcarte = gpj.indexOf('return json(reponseCompteAuCloud({ delegations: delegationsExecutees }));');
const iArretes = gpj.indexOf('let aDesArretes = true;');
ok('get-pending-jobs : le poste mis de côté reçoit la réponse vide JUSTE APRÈS la télémétrie, avant toute lecture ou écriture de la file',
  iTelem > 0 && iEcarte > iTelem && iArretes > iEcarte, `${iTelem} ${iEcarte} ${iArretes}`);
ok('… sur la règle partagée (posteEcarteParLeCloud), drapeau relu s\'il ne l\'a pas été', /if \(posteEcarteParLeCloud\(\{ cloudVoie, posteCloud \}\)\) \{\n\s*console\.log/.test(gpj)
  && /if \(!posteCloud && cloudVoie === null\) cloudVoie = await cloudVoieDuCompte\(user\.id\);/.test(gpj.slice(iTelem, iEcarte)));
ok('get-pending-jobs : les sessions d\'un poste mis de côté ne sont pas notées sur lui', /if \(!posteEcarteParLeCloud\(\{ cloudVoie, posteCloud \}\)\) Object\.assign\(patchPoste, patchPosteDuPoll\(body\)\);/.test(gpj));
ok('get-pending-jobs : un poste mis de côté ne relance rien (Depop ; Opla fermée depuis le 10/10)',
  /const n = posteEcarteParLeCloud\(\{ cloudVoie, posteCloud \}\) \? 0 : await rearmerJobsDepopParques\(admin, user\.id, sessionId\);/.test(gpj));
ok('get-pending-jobs : la retenue « session morte » lit la connexion qui fait foi (coffre du Cloud), sans tâche-sonde, message du Cloud',
  /foiSessions = await sessionsFoiDuCompte\(user\.id, cloudVoie, profS\?\.extension_sessions \?\? null\);/.test(gpj)
  && /\.from\("cloud_coffre"\)\.select\("plateforme, connecte, maj_le"\)\.eq\("user_id", userId\)/.test(gpj)
  && /return sessionsQuiFontFoi\(sessions, \{ cloudVoie, coffre \}\)/.test(gpj)
  && /if \(foiSessions\.cloud\.has\(pf\)\) \{ mortes\.set\(pf, \{ observeeLe, fraiche: true, cloud: true \}\); continue; \}/.test(gpj)
  && /cloud: m\?\.cloud === true,/.test(gpj));
ok('get-pending-jobs : l\'attente espacée se lève sur la reconnexion vue par le Cloud',
  /const sessionsA = cloudVoie === true && foiSessions \? foiSessions\.sessions : await sessionsDuProfil\(userClient, user\.id\);/.test(gpj));
ok('get-pending-jobs : le corps du gestionnaire reste analysable par TypeScript (les lectures de la règle sont hors du gestionnaire)',
  /^async function cloudVoieDuCompte\(userId: string\)/m.test(gpj) && /^async function sessionsFoiDuCompte\(/m.test(gpj) && /^async function sessionsDuProfil\(/m.test(gpj));
const hw = lire('supabase/functions/handler-watch/index.ts');
ok('handler-watch : les deux levées (mur de connexion, attente de session) lisent le coffre pour un compte au Cloud',
  (hw.match(/const vue = sessionsQuiFontFoi\(null, \{ cloudVoie: true, coffre: eCoffreA \? \[\] : \(parCompte\.get\(id\) \?\? \[\]\) \}\)/g) ?? []).length === 2
  && (hw.match(/\.select\("id, extension_sessions, cloud_voie"\)/g) ?? []).length === 2);

console.log('5. Extension 0.6.190 (le PC se met en pause sur la parole du serveur)');
const man = JSON.parse(lire('chrome-extension/manifest.json') || '{}');
ok('manifeste 0.6.190', man.version === '0.6.190', man.version);
const bg = lire('chrome-extension/background.js');
ok('chaque poll note ce que dit le serveur (pause ou reprise)', /await globalThis\.noterPauseCloudServeur\?\.\(rep\.compte_cloud\);/.test(bg));
ok('en pause : rien d\'autre ce cycle (retour juste après le poll), éveil relâché',
  /if \(globalThis\.pauseCloudActive\?\.\(\) === true\) \{\n\s*await relacherEveil\("relache", 0, null\)/.test(bg));
ok('en pause : ni repêchage ni sonde de session avant le poll',
  /if \(!enPauseCloud\) await recoverStaleProcessingJobs\(session\)/.test(bg) && /if \(!enPauseCloud\) reportPlatformSessions\(session\.access_token\)/.test(bg));
ok('en pause : seules les alarmes du poll travaillent', /if \(alarm\.name !== ALARM_NAME\) \{\n\s*extensionEnPauseCloud\(\)\.then/.test(bg));
ok('en pause : les demandes de la page et du popup qui font travailler ce poste sont refusées (compte_cloud)',
  /if \(TRAVAUX_REFUSES_EN_PAUSE_CLOUD\.has\(msg\?\.type\) && pauseCloudActive\(\)\)/.test(bg)
  && ['FETCH_VINTED_PUBLIC', 'FETCH_VINTED_ITEM', 'CAPTURE_VINTED_ITEM', 'SYNC_DRESSING', 'SONDER_SESSION', 'PUBLISH_NOW'].every((t) => bg.includes(`"${t}"`)));
const gardes = ['reportPlatformSessions', 'lancerRelevePlateforme', 'lancerReleveVentes', 'syncDressingVinted', 'checkPublishedListings', 'veillerCommandes',
  'lireVentesBeebsSiDue', 'releverMessagerieBeta', 'maybeAutoRepublish', 'lireAnnoncesOrigineEnAttente'];
const sansGarde = gardes.filter((g) => {
  const i = bg.indexOf(`async function ${g}(`);
  // La garde est à l'entrée : dans les 12 premières lignes de la fonction, avant tout travail.
  // Par globalThis : une fonction extraite seule par un autre selftest (vm) continue comme avant.
  return i < 0 || !/\n\s*if \([^\n]*await globalThis\.extensionEnPauseCloud\?\.\(\)\) return/.test(bg.slice(i, i + 1600).split('\n').slice(0, 12).join('\n'));
});
ok('en pause : relevés, ventes, commandes, messagerie, sondes, lectures et republication automatique s\'arrêtent à l\'entrée', sansGarde.length === 0, sansGarde.join(', '));
ok('la pause ne vaut que 30 min après la dernière réponse qui l\'a dite (rien de figé à demeure)', /const PAUSE_CLOUD_FRAICHEUR_MS = 30 \* 60_000;/.test(bg));

// Le background chargé pour de vrai (vm, faux chrome) : pause posée puis levée par la seule parole du serveur.
function charger(source) {
  const rien = { addListener: () => {} };
  const stockage = {};
  const aire = (m) => ({ get: async (k) => (typeof k === 'string' ? { [k]: m[k] } : { ...m }), set: async (o) => { Object.assign(m, o); }, remove: async (k) => { delete m[k]; } });
  const titres = [];
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(RACINE, 'chrome-extension', f), 'utf8'), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: 'selftest', getManifest: () => ({ version: '0.6.190' }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire(stockage), session: aire({}), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }), remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] }, cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {}, setTitle: (o) => titres.push(o?.title) },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} }, notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(source, contexte, { filename: 'background.js' });
  return { ctx, stockage, titres };
}
if (bg) {
  const pc = essai(() => charger(fs.readFileSync(path.join(RACINE, 'chrome-extension', 'background.js'), 'utf8')));
  if (pc?.erreur || typeof pc?.ctx?.noterPauseCloudServeur !== 'function') {
    ok('background chargé (vm) avec noterPauseCloudServeur', false, pc?.erreur ?? 'noterPauseCloudServeur absente');
  } else {
    await new Promise((r) => setTimeout(r, 30));
    await pc.ctx.noterPauseCloudServeur({ actif: true, texte: 'Extension en pause : ton compte utilise FillSell Cloud, tout se fait depuis nos serveurs.' });
    ok('PC : le serveur dit « compte sur le Cloud » → pause active, mémorisée avec son heure, titre de l\'icône', pc.ctx.pauseCloudActive() === true
      && Boolean(pc.stockage.fillsell_compte_cloud?.le) && /FillSell Cloud/.test(pc.titres.at(-1) ?? ''));
    ok('PC : pause dite il y a 31 min sans poll depuis → plus active (jamais figée)', pc.ctx.pauseCloudActive(Date.now() + 31 * 60_000) === false);
    await pc.ctx.noterPauseCloudServeur(undefined);
    ok('PC : le poll suivant ne la dit plus (fin d\'essai, résiliation, impayé) → reprise, mémoire effacée', pc.ctx.pauseCloudActive() === false && !('fillsell_compte_cloud' in pc.stockage));
    await pc.ctx.noterPauseCloudServeur({ actif: true });
    ok('PC : sans texte du serveur, le texte de pause par défaut', /Extension en pause : ton compte utilise FillSell Cloud/.test(pc.stockage.fillsell_compte_cloud?.texte ?? ''));
  }
  const cl = essai(() => charger(fs.readFileSync(path.join(RACINE, 'chrome-extension', 'background.js'), 'utf8').split('__FILLSELL_BUILD_ID__').join('2026-11-14T11:39:28Z+b05bafe-cloud')));
  if (!cl?.erreur && typeof cl?.ctx?.noterPauseCloudServeur === 'function') {
    await cl.ctx.noterPauseCloudServeur({ actif: true });
    ok('copie Cloud (BUILD_ID « -cloud ») : JAMAIS en pause, même si on le lui disait', cl.ctx.pauseCloudActive() === false && !('fillsell_compte_cloud' in cl.stockage));
  } else ok('copie Cloud chargée (vm)', false, cl?.erreur ?? 'noterPauseCloudServeur absente');
}
const B = await importer('scripts/cloud/build-extension-cloud.mjs');
const patch = essai(() => fn(B, 'patcherBackground')(fs.readFileSync(path.join(RACINE, 'chrome-extension', 'background.js'), 'utf8')));
ok('la copie Cloud se construit toujours (toutes les ancres de scripts/cloud/build-extension-cloud.mjs trouvées)', !patch?.erreur && typeof patch?.bg === 'string', patch?.erreur);

const pop = lire('chrome-extension/popup.js');
const popHtml = lire('chrome-extension/popup.html');
ok('popup : la pause dite par le serveur remplace l\'état habituel (même clé que le background)',
  /const PAUSE_CLOUD_KEY = "fillsell_compte_cloud";/.test(pop) && /if \(renderPauseCloud\(\)\) \{ renderAccount\(\); renderSwitch\(\); renderDiag\(\); return; \}/.test(pop)
  && /<section id="pause-cloud"/.test(popHtml) && /body\.en-pause-cloud #plateformes/.test(popHtml) && /body\.en-pause-cloud #queue,/.test(popHtml));

console.log('6. La base (migration PRÉPARÉE, non appliquée)');
const mig = lire('supabase/migrations/20261114170000_sessions_poste_cloud_seul.sql');
const inv = lire('supabase/rollbacks/20261114170000_sessions_poste_cloud_seul_INVERSE.sql');
ok('la garde existe et le dit : NON APPLIQUÉE, feu vert de Nico requis', /NON APPLIQUÉE : feu vert NOMMÉ de Nico requis/.test(mig)
  && /CREATE TRIGGER profiles_a_sessions_poste_cloud_seul\n\s*BEFORE UPDATE OF extension_sessions ON public\.profiles/.test(mig)
  && /new\.extension_sessions := old\.extension_sessions;/.test(mig));
ok('elle ne touche que les clients (role authenticated) d\'un compte au Cloud actif, hors poste Cloud',
  /if old\.cloud_voie is not true then return new; end if;/.test(mig) && /<> 'authenticated' then return new; end if;/.test(mig) && /cloud_postes c where c\.user_id = old\.id and c\.session_fillsell_id::text = v_sid/.test(mig));
ok('son inverse existe', /DROP TRIGGER IF EXISTS profiles_a_sessions_poste_cloud_seul ON public\.profiles;/.test(inv) && /DROP FUNCTION IF EXISTS public\.profiles_sessions_poste_cloud_seul\(\);/.test(inv));
ok('son banc jetable existe', /20261114170000_sessions_poste_cloud_seul/.test(lire('scripts/cloud/preuve-sessions-poste-cloud-seul.mjs')));

console.log(ko ? `\n${ko} KO — ${verts} ok` : `\nTout est vert (${verts}).`);
process.exit(ko ? 1 : 0);
