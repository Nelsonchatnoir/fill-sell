// VERROU — 15/11/2026, cliente 13e274de (Pro, essai Cloud) — point 2 de Nico : « sur le Cloud, il n'y a pas d'onglet sur
// son ordinateur : la consigne est impossible à suivre ». Le 14/11 à 21:34:42, son poste Cloud (handler_build
// « 2026-11-14T11:39:28Z+b05bafe-cloud · v0.6.189.45717 ») a préparé le dépôt « Lot 4 bracelets » jusqu'à « Valider et
// payer » et écrit : « dans l'onglet Leboncoin ouvert sur ton ordinateur, clique « Valider et payer » ». L'app, voulant
// le dire au Cloud, le transformait en « résous la vérification » (« Valider » pris pour « valide ») ; la carte « À
// régler » disait « sur ton ordinateur » ; aucun geste ne menait à la page.
// Ce verrou casse si un compte Cloud relit « ordinateur / onglet / Chrome » sur ce parcours, si le geste « Payer sur
// Leboncoin » disparaît, ou si la vue « payer » de l'orchestrateur clique, ferme l'onglet ou sort de la page de paiement.
//   (node --import ./scripts/loader-ext.mjs scripts/cloud-payer-leboncoin-selftest.mjs)
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MSG_LBC_A_PAYER, MSG_LBC_A_PAYER_CLOUD, messageAPayerDuPc, messageAPayer } from '../supabase/functions/_shared/lbc-forfait.js';
import { estPosteCloud } from '../supabase/functions/_shared/cloud-voie.js';
import { texteTacheCloud, LBC_A_PAYER_CLOUD, noterCompteCourantCloud } from '../src/cloud/voieCloud.js';
import { phraseEtat } from '../src/utils/etatsPublication.js';
import { ligneAlertes } from '../src/utils/alertesCompte.js';
import { textesPauseLbc, TEXTES_PAUSE_LBC } from '../src/utils/pauseLeboncoin.js';
import {
  navigationPaiementPermise, paiementConclu, tachePayable, expressionMarquerOnglet, champsOngletFerme, creerVuePaiement,
  MESSAGES_PAIEMENT, ATTRIBUT_MARQUE, CLE_ATTENTE_PAIEMENT,
} from '../serveur-cloud/src/paiement.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log('  ✓', m); else { ko++; console.log('  ✗', m, d === undefined ? '' : JSON.stringify(d).slice(0, 400)); } };
const PC = /ordinateur|onglet|Chrome|\btab\b|computer|extension/i;
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8');

console.log('1. Le texte écrit sur la tâche : celui du poste qui a préparé le dépôt');
ok(estPosteCloud('2026-11-14T11:39:28Z+b05bafe-cloud · v0.6.189.45717'), 'le build de Romane est bien reconnu « poste Cloud »');
ok(messageAPayerDuPc(MSG_LBC_A_PAYER), 'le texte de l’extension (toutes versions) est reconnu');
ok(!PC.test(MSG_LBC_A_PAYER_CLOUD) && /Payer sur Leboncoin/.test(MSG_LBC_A_PAYER_CLOUD) && /c'est toi qui cliques « Valider et payer »/.test(MSG_LBC_A_PAYER_CLOUD) && /ne paie jamais à ta place/.test(MSG_LBC_A_PAYER_CLOUD),
  'texte du Cloud : le geste « Payer sur Leboncoin », elle clique elle-même, FillSell ne paie jamais — aucun mot du PC', MSG_LBC_A_PAYER_CLOUD);
ok(messageAPayer(true) === MSG_LBC_A_PAYER_CLOUD && messageAPayer(false) === MSG_LBC_A_PAYER, 'un compte sans Cloud garde son texte, mot pour mot');
ok(MSG_LBC_A_PAYER_CLOUD === LBC_A_PAYER_CLOUD.fr, 'le serveur et l’app disent la même phrase');
const ujs = lire('supabase/functions/update-job-status/index.ts');
const blocMur = ujs.slice(ujs.indexOf('if (!murPerime && MOTIFS_LBC_PAIEMENT.includes('), ujs.indexOf('// ══ PLUS JAMAIS DE needs_user MUET'));
ok(/if \(estPosteCloud\(body\.handler_build\)\) \{[\s\S]{0,200}if \(messageAPayerDuPc\(patch\.error\)\) patch\.error = MSG_LBC_A_PAYER_CLOUD;/.test(blocMur)
  && /messageAPayerDuPc\(d\["detail"\]\)\) pfN\["last_diagnostic"\] = \{ \.\.\.d, detail: MSG_LBC_A_PAYER_CLOUD/.test(blocMur),
  'update-job-status : au mur « Valider et payer », le poste Cloud reçoit le texte du Cloud (message et last_diagnostic.detail)');

console.log('2. Ce que l’app montre à un compte Cloud (réécriture des textes de tâche)');
const ecrit = texteTacheCloud(MSG_LBC_A_PAYER, 'Leboncoin');
ok(ecrit === LBC_A_PAYER_CLOUD.fr, 'AVANT : « Si FillSell te le demande, résous la vérification… » — APRÈS : le geste du Cloud', ecrit);
ok(texteTacheCloud(MSG_LBC_A_PAYER, 'Leboncoin', 'en') === LBC_A_PAYER_CLOUD.en, 'en anglais aussi');
ok(!/Reconnecte/.test(texteTacheCloud("Ta connexion n'est pas en cause. Ferme Chrome complètement puis rouvre-le, puis relance-la.", 'Vinted')),
  '« Ta connexion n’est pas en cause » n’est jamais lu comme une connexion à refaire');
const fermeChrome = texteTacheCloud('La tâche ne démarre pas. Ferme Chrome complètement puis rouvre-le, puis relance-la.', 'Vinted');
ok(!PC.test(fermeChrome) && /relance/.test(fermeChrome) && !/rien à faire/.test(fermeChrome), '« Ferme Chrome… puis relance » : plus de Chrome, et jamais « rien à faire » quand un geste reste', fermeChrome);
const conditions = texteTacheCloud('Vinted demande d’accepter ses nouvelles conditions : ouvre vinted.fr dans Chrome sur ton ordinateur, accepte les conditions, puis relance.', 'Vinted');
ok(!PC.test(conditions) && /accepte les conditions/.test(conditions) && /téléphone/.test(conditions) && !/Reconnecte/.test(conditions),
  'conditions Vinted (geste de COMPTE) : le même geste, depuis son téléphone — jamais « Reconnecte Vinted »', conditions);
for (const t of ["Republie cet article quand tu es DEVANT ton ordinateur — le clic, puis Chrome ouvert.", "Relance la republication depuis l'app, Chrome ouvert.",
  "Pour corriger sur l'onglet resté ouvert (ou l'article dans FillSell), relance ensuite.", "La tâche a été mise en veille par Chrome."]) {
  const r = texteTacheCloud(t, 'Vinted');
  ok(!PC.test(r), `plus de mot du PC : « ${t.slice(0, 50)}… »`, r);
}
ok(/Résoudre la vérification/.test(texteTacheCloud('Beebs affiche une vérification anti-robot. Ouvre Beebs sur ton ordinateur et valide-la maintenant.', 'Beebs')),
  'une vraie vérification garde « Résoudre la vérification » (règle d’avant)');
ok(texteTacheCloud('En attente : ton annonce a été retirée.', 'Depop') === 'En attente : ton annonce a été retirée.', 'un texte sans renvoi au PC : inchangé');
noterCompteCourantCloud(true);
const pe = phraseEtat('leboncoin', { kind: 'attente', motif: 'a_payer_lbc' }, 'fr');
ok(/Payer sur Leboncoin/.test(pe) && !PC.test(pe), 'phraseEtat (stepper) : « prête… dans ton FillSell Cloud : appuie sur « Payer sur Leboncoin » »', pe);
ok(/reconnecte-le à ton FillSell Cloud/.test(ligneAlertes([{ kind: 'connexion', platform: 'leboncoin' }], 'fr').detail), 'ligne « À régler » des connexions : le Cloud');
noterCompteCourantCloud(false);
ok(/ouvert sur ton ordinateur/.test(phraseEtat('leboncoin', { kind: 'attente', motif: 'a_payer_lbc' }, 'fr')), 'compte sans Cloud : phraseEtat inchangée');
ok(/connecte-toi sur ton ordinateur/.test(ligneAlertes([{ kind: 'connexion', platform: 'leboncoin' }], 'fr').detail), 'compte sans Cloud : ligne des connexions inchangée');
const TP = textesPauseLbc('fr', true);
ok(!PC.test(`${TP.titreSession} ${TP.texteSession('x')} ${TP.demande} ${TP.dejaDemande} ${TP.texte('x')}`) && TP.bouton === 'Leboncoin remarche', 'bandeau « Leboncoin en pause » : textes du Cloud, même bouton');
ok(textesPauseLbc('fr', false) === TEXTES_PAUSE_LBC.fr, 'bandeau, compte sans Cloud : textes inchangés');
const et = lire('supabase/functions/email-tunnel/index.ts');
ok(/\.select\("id, email, lang, extension_last_seen_at, cloud_voie"\)/.test(et) && /if \(prof\.cloud_voie === true\) \{[\s\S]{0,200}continue;/.test(et),
  'mail de relance (« ton ordinateur », « installe l’extension ») : jamais à un compte au Cloud actif');

console.log('3. La vue « payer » de l’orchestrateur (règles pures)');
ok(navigationPaiementPermise('https://www.leboncoin.fr/deposer-une-annonce/options') && navigationPaiementPermise('https://checkoutshopper-live.adyen.com/x')
  && navigationPaiementPermise('https://acs.banque.fr/3ds'), 'Leboncoin, le prestataire de paiement, la banque (3-D Secure) passent');
ok(!navigationPaiementPermise('https://www.vinted.fr/') && !navigationPaiementPermise('https://www.ebay.fr/') && !navigationPaiementPermise('http://www.leboncoin.fr/')
  && !navigationPaiementPermise('javascript:alert(1)'), 'jamais une autre plateforme, eBay, ni rien hors https');
ok(paiementConclu('https://www.leboncoin.fr/deposer-une-annonce/confirmation?x') && paiementConclu('https://www.leboncoin.fr/ad/accessoires_bijoux/3309555758')
  && !paiementConclu('https://www.leboncoin.fr/deposer-une-annonce/options'), 'fin : page de confirmation ou annonce (même règle que l’extension)');
const ROMANE = '13e274de-7af1-4368-8c31-afe214252ca2';
const jobP = { id: 'c7c98610-c837-4db7-ab0a-964bda23fa31', user_id: ROMANE, platform: 'leboncoin', status: 'needs_user', platform_fields: { last_diagnostic: { quoi: 'lbc_valider_et_payer' }, attente_paiement: { depuis: '2026-11-14T20:47:00.773Z' } } };
ok(tachePayable(jobP, ROMANE) && !tachePayable(jobP, 'autre') && !tachePayable({ ...jobP, status: 'published' }, ROMANE)
  && !tachePayable({ ...jobP, platform_fields: { ...jobP.platform_fields, attente_paiement: { onglet_ferme_le: 'x' } } }, ROMANE), 'seulement SA tâche au mur « Valider et payer », pas close');
const expr = expressionMarquerOnglet(jobP.id, 'abc123');
ok(expr.includes(CLE_ATTENTE_PAIEMENT) && expr.includes(ATTRIBUT_MARQUE) && !/\.click\(|dispatchEvent|submit\(/.test(expr), 'l’onglet SUIVI par l’extension est marqué — aucun clic, aucun envoi de formulaire');
ok(champsOngletFerme(jobP.platform_fields, 'T', 'onglet_ferme').attente_paiement.onglet_ferme_le === 'T', 'onglet parti : noté comme le fait l’extension (« Préparer à nouveau »)');
const src = lire('serveur-cloud/src/paiement.js');
const srcSansCommentaires = src.replace(/\/\/.*$/gm, '');
ok(!/Target\.closeTarget/.test(srcSansCommentaires) && !/mousePressed|mouseReleased|\.click\(/.test(srcSansCommentaires),'paiement.js : jamais Target.closeTarget, jamais un clic de souris inventé');
ok(/if \(m\.mode === 'payer'\) \{[\s\S]{0,300}jobIdValide\(m\.job\)/.test(lire('serveur-cloud/src/connexion.js')), 'connexion.js : le mode « payer » exige un numéro de tâche valide');

console.log('4. La vue « payer » jouée contre un faux navigateur (cas de Romane : DEUX onglets au même écran)');
const appels = [];
const ecouteurs = new Set();
let jetonVu = null;
const PAGES = [{ targetId: 'P1', type: 'page', url: 'https://www.leboncoin.fr/deposer-une-annonce/options' }, { targetId: 'P2', type: 'page', url: 'https://www.leboncoin.fr/deposer-une-annonce/options' },
  { targetId: 'SW', type: 'service_worker', url: 'chrome-extension://idext/background.js' }];
let urlP2 = PAGES[1].url;
const cdp = {
  on: (f) => { ecouteurs.add(f); return () => ecouteurs.delete(f); },
  async send(methode, params = {}, sid) {
    appels.push({ methode, params, sid });
    if (methode === 'Target.getTargets') return { targetInfos: PAGES };
    if (methode === 'Target.attachToTarget') return { sessionId: `S-${params.targetId}` };
    if (methode === 'Page.getFrameTree') return { frameTree: { frame: { id: `F-${sid}` } } };
    if (methode === 'Browser.getWindowForTarget') return { windowId: 7 };
    if (methode === 'Runtime.evaluate') {
      if (sid === 'S-SW') { jetonVu = /args: \["([0-9a-f]+)"\]/.exec(params.expression)?.[1] ?? null; return { result: { value: { ok: true, url: PAGES[1].url } } }; }
      if (/getAttribute/.test(params.expression)) return { result: { value: sid === 'S-P2' ? jetonVu : null } };
      if (params.expression === 'location.href') return { result: { value: urlP2 } };
      return { result: { value: false } };
    }
    return {};
  },
};
const envois = [];
const ws = { readyState: 1, bufferedAmount: 0, send: () => {}, close: (c) => envois.push({ ferme: c }) };
const base = {
  from: () => ({
    select() { return this; }, eq() { return this; }, update() { return this; },
    maybeSingle: async () => ({ data: { ...jobP } }),
  }),
};
const journal = { info: () => {}, alerte: () => {}, erreur: () => {} };
const vue = creerVuePaiement({ user: ROMANE, jobId: jobP.id, lang: 'fr', ws, envoyer: (o) => envois.push(o), largeur: 390, hauteur: 700, dpr: 3,
  base, navigateurs: { ouvert: () => ({ cdp, moteur: 'chrome' }) }, postes: { extensionId: async () => 'idext' }, journal, touches: {}, surFin: () => {} });
await vue.demarrer();
const evts = (e) => envois.filter((x) => x.t === 'etat' && x.etape === e);
ok(evts('pret').length === 1 && evts('pret')[0].message === MESSAGES_PAIEMENT.fr.pret, 'la page s’ouvre : « vérifie le dépôt, puis clique toi-même « Valider et payer » »', envois);
ok(appels.some((a) => a.methode === 'Page.startScreencast' && a.sid === 'S-P2') && !appels.some((a) => a.methode === 'Page.startScreencast' && a.sid === 'S-P1'),
  'l’onglet montré est celui que l’extension SUIT (P2, marqué) — jamais l’autre dépôt au même écran (P1)');
ok(appels.some((a) => a.methode === 'Target.detachFromTarget' && a.params.sessionId === 'S-P1'), 'l’autre onglet est seulement lâché');
ok(!appels.some((a) => /^Input\./.test(a.methode)), 'à l’ouverture : AUCUN geste envoyé à la page (FillSell ne clique jamais)');
const ecouter = (m) => Promise.all([...ecouteurs].map((f) => f(m)));
await ecouter({ method: 'Fetch.requestPaused', sessionId: 'S-P2', params: { requestId: 'r1', frameId: 'F-S-P2', resourceType: 'Document', request: { url: 'https://www.vinted.fr/' } } });
await ecouter({ method: 'Fetch.requestPaused', sessionId: 'S-P2', params: { requestId: 'r2', frameId: 'F-S-P2', resourceType: 'Document', request: { url: 'https://checkoutshopper-live.adyen.com/pay' } } });
ok(appels.some((a) => a.methode === 'Fetch.failRequest' && a.params.requestId === 'r1') && appels.some((a) => a.methode === 'Fetch.continueRequest' && a.params.requestId === 'r2'),
  'navigation : Vinted refusé, la page du prestataire de paiement suivie');
await vue.geste({ t: 'toucher', type: 'debut', x: 100, y: 200 }, ws);
await vue.geste({ t: 'toucher', type: 'fin', x: 100, y: 200 }, ws);
ok(appels.filter((a) => a.methode === 'Input.dispatchTouchEvent').length === 2, 'seuls les gestes de la personne sont rejoués (son doigt)');
urlP2 = 'https://www.leboncoin.fr/deposer-une-annonce/confirmation';
await vue.geste({ t: 'termine' }, ws);
ok(evts('paye').length === 1, 'page de confirmation : « C’est fait : ton annonce est publiée… FillSell reprend tout seul »');
vue.fermer('client');
await new Promise((r) => setTimeout(r, 30));
ok(!appels.some((a) => a.methode === 'Target.closeTarget'), 'fin : l’onglet de paiement n’est JAMAIS fermé (l’extension le surveille)');
ok(['Fetch.disable', 'Emulation.clearDeviceMetricsOverride', 'Page.stopScreencast'].every((m) => appels.some((a) => a.methode === m && a.sid === 'S-P2')), 'fin : l’onglet est rendu tel qu’il était (filtre, format, diffusion retirés)');

// La même vue quand l'onglet n'est plus là (navigateur Cloud redémarré) : dit, noté, jamais un autre onglet.
const envois2 = [];
const ecrits = [];
const base2 = { from: () => ({ select() { return this; }, eq() { return this; }, update(v) { ecrits.push(v); return this; }, maybeSingle: async () => ({ data: { ...jobP } }), then: undefined }) };
const cdp2 = { on: () => () => {}, async send(m, p, sid) { if (m === 'Target.getTargets') return { targetInfos: PAGES }; if (m === 'Target.attachToTarget') return { sessionId: `S-${p.targetId}` }; if (m === 'Runtime.evaluate' && sid === 'S-SW') return { result: { value: { ok: false, motif: 'aucune_attente' } } }; return {}; } };
const vue2 = creerVuePaiement({ user: ROMANE, jobId: jobP.id, lang: 'fr', ws: { readyState: 1, send: () => {}, close: () => {} }, envoyer: (o) => envois2.push(o), largeur: 390, hauteur: 700, dpr: 2,
  base: base2, navigateurs: { ouvert: () => ({ cdp: cdp2, moteur: 'chrome' }) }, postes: { extensionId: async () => 'idext' }, journal, touches: {}, surFin: () => {} });
await vue2.demarrer();
ok(envois2.some((x) => x.etape === 'page_fermee' && /Préparer à nouveau/.test(x.message)), 'onglet plus suivi : « appuie sur « Préparer à nouveau » », jamais un autre onglet montré');
ok(ecrits.some((v) => v.platform_fields?.attente_paiement?.onglet_ferme_le), 'et noté sur la tâche (la carte propose « Préparer à nouveau »)');

console.log('5. La carte « À régler » rendue (compte Cloud / compte sans Cloud)');
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const portail = join(ROOT, 'scripts/lib/portail-en-place.mjs');
const vite = await createServer({ root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: portail }] }, ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const texte = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  const E = (await vite.ssrLoadModule('/src/stock/EcranForfaitLbc.jsx')).default;
  const prete = { ...jobP, title: 'Lot 4 bracelets joncs acier inoxydable doré large', action: 'publish', created_at: '2026-11-14T20:34:42Z',
    platform_fields: { ...jobP.platform_fields, attente_paiement: { depuis: new Date(Date.now() - 3_600_000).toISOString() }, last_diagnostic: { quoi: 'lbc_valider_et_payer', at: new Date(Date.now() - 3_600_000).toISOString() } } };
  const tCloud = texte(React.createElement(E, { lang: 'fr', attentes: [prete], cloud: true, onFermer: () => {} }));
  ok(/Payer sur Leboncoin/.test(tCloud) && /dans ton FillSell Cloud/.test(tCloud) && !/ordinateur|onglet/i.test(tCloud), 'Cloud : « Payer sur Leboncoin », la page de son Cloud — ni ordinateur ni onglet', tCloud.slice(0, 500));
  const tPc = texte(React.createElement(E, { lang: 'fr', attentes: [prete], cloud: false, onFermer: () => {} }));
  ok(/dans l’onglet Leboncoin ouvert sur ton ordinateur/.test(tPc) && !/Payer sur Leboncoin/.test(tPc), 'sans Cloud : texte et gestes du PC inchangés');
  const close = { ...prete, platform_fields: { ...prete.platform_fields, attente_paiement: { depuis: prete.platform_fields.attente_paiement.depuis, onglet_ferme_le: new Date().toISOString() } } };
  const tClose = texte(React.createElement(E, { lang: 'fr', attentes: [close], cloud: true, onFermer: () => {} }));
  ok(/Préparer à nouveau/.test(tClose) && /n’est plus ouverte dans ton FillSell Cloud/.test(tClose) && !/ordinateur|onglet/i.test(tClose), 'Cloud, page partie : « Préparer à nouveau », dit avec les mots du Cloud', tClose.slice(0, 400));
} finally {
  await vite.close();
}

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
