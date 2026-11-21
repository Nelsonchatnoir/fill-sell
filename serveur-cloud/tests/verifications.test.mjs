// (02/11, demande de Nico) Les vérifications anti-robot du navigateur Cloud — « Résoudre la vérification ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { etatVisible, etatPublie, messageTacheCloud, pauseLbcLevee, creerVerifications, REVENUE_MS, CONFIRMATION_MS, CONFIRMATION_MAX_MS, aConfirmer } from '../src/verifications.js';
import { pageDeResolution, navigationResolution, expressionAcces } from '../src/plateformes.js';
import { requetePermise } from '../src/navigateur.js';
import { decompteEssai } from '../src/endurance.js';

const U = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

test('(02/11) deux états pour la personne, jamais confondus : à résoudre (bouton) / restreint (attente) ; et « revenue »', () => {
  for (const n of ['glissiere', 'verification', 'tache_refusee_anti_robot']) assert.equal(etatVisible(n), 'a_resoudre', n);
  for (const n of ['bloque', 'restreint']) assert.equal(etatVisible(n), 'restreint', n);
  assert.equal(etatVisible('verification_revenue'), 'revenue');
  assert.deepEqual(etatPublie({ nature: 'glissiere', le: 'L' }), { etat: 'a_resoudre', depuis: 'L' });
  assert.deepEqual(etatPublie({ nature: 'bloque', le: 'L', essai_apres: 'E' }), { etat: 'restreint', depuis: 'L', essai_apres: 'E' });
  assert.equal(etatPublie(null), null);
});

test('(02/11) le message des tâches retenues : jamais « ouvre … dans ton navigateur » ; le bon geste pour chaque état', () => {
  const a = messageTacheCloud('leboncoin', 'a_resoudre', '2026-11-02T03:57:37Z');
  const r = messageTacheCloud('leboncoin', 'restreint', '2026-11-02T03:57:37Z');
  const v = messageTacheCloud('beebs', 'revenue', null);
  for (const m of [a, r, v]) {
    assert.ok(!/dans ton navigateur|ouvre leboncoin\.fr|dans Chrome/i.test(m), m);
    assert.match(m, /les autres plateformes continuent/);
  }
  assert.match(a, /« Résoudre la vérification »/);
  assert.match(a, /depuis le 02\/11 à 04:57/, 'heure de Paris');
  assert.ok(!/Résoudre/.test(r) && /un seul essai au bout de 24 h/.test(r), 'restreint : aucun bouton promis, l\'attente dite');
  // (21/11/2026, lot de Nico, point 5) Revenue : le geste de la personne (« Résoudre la vérification »), jamais une boucle.
  assert.match(v, /« Résoudre la vérification »/);
  assert.match(v, /FillSell ne réessaie pas sans toi/);
  assert.deepEqual(pauseLbcLevee({ depuis: 'x', essai: { le: 'e' } }, { par: 'cloud (resoudre)', maintenant: 'M' }),
    { leve_le: 'M', leve_par: 'cloud (resoudre)', essai: { le: 'e', issue: 'passe', fin_le: 'M' } }, 'comme l\'essai réussi de l\'app (reprise prudente)');
});

test('(02/11) la page à rouvrir : celle où la vérification s\'est affichée (sans ancre de travail), sinon une page du compte', () => {
  assert.equal(pageDeResolution('beebs', { referer: 'https://www.beebs.app/#fillsell-worker' }), 'https://www.beebs.app/');
  assert.equal(pageDeResolution('leboncoin', { referer: 'https://api.leboncoin.fr/api/messaging-items-api/v3/conversations' }),
    'https://www.leboncoin.fr/compte/part/mes-annonces', 'une API : la page du compte, qui refait ses requêtes');
  assert.equal(pageDeResolution('leboncoin', { referer: 'https://evil.example/' }), 'https://www.leboncoin.fr/compte/part/mes-annonces');
  assert.equal(pageDeResolution('vinted', null), 'https://www.vinted.fr/');
  assert.ok(navigationResolution('leboncoin', 'https://www.leboncoin.fr/recherche'));
  assert.ok(navigationResolution('leboncoin', 'https://geo.captcha-delivery.com/captcha/?x=1'));
  assert.ok(!navigationResolution('leboncoin', 'https://www.google.com/'), 'hors de la plateforme : refusé');
  assert.ok(!navigationResolution('leboncoin', 'http://www.leboncoin.fr/'));
  assert.match(expressionAcces('beebs'), /method: 'HEAD'/, 'Beebs : la page elle-même (son compte se lit chez Google)');
  assert.match(expressionAcces('leboncoin'), /members\/me\/account/, 'Leboncoin : l\'adresse même que l\'anti-robot protège');
});

test('(02/11) le verrou : seule la page de résolution (et ses cadres) passe ; jamais vers eBay ; jamais un autre onglet', () => {
  const h = { cadresPermis: new Map([['page-1', 'leboncoin']]) };
  assert.equal(requetePermise(h, { frameId: 'page-1', request: { url: 'https://api.leboncoin.fr/api/x' } }), true);
  assert.equal(requetePermise(h, { frameId: 'onglet-travail', request: { url: 'https://api.leboncoin.fr/api/x' } }), false);
  assert.equal(requetePermise(h, { request: { url: 'https://api.leboncoin.fr/api/x' } }), false, 'le service worker de l\'extension : jamais');
  assert.equal(requetePermise(h, { frameId: 'page-1', request: { url: 'https://www.ebay.fr/' } }), false, 'eBay : jamais, même depuis la page');
  const sw = (url, Origin) => requetePermise(h, { request: { url, headers: Origin ? { Origin } : {} } });
  assert.equal(sw('https://api.leboncoin.fr/x', 'https://www.leboncoin.fr'), true, 'le service worker de la plateforme, pendant SA résolution');
  assert.equal(sw('https://api.leboncoin.fr/x', 'chrome-extension://abc'), false, 'l\'extension : jamais');
  assert.equal(sw('https://api.leboncoin.fr/x', null), false, 'sans origine : non');
  assert.equal(sw('https://www.beebs.app/x', 'https://www.beebs.app'), false, 'une autre plateforme, pas en résolution : non');
});

test('(02/11, décision de Nico) remise à zéro de Beebs SEULE : ses heures d\'avant 00:15 ne comptent plus ; Vinted ne bouge pas', () => {
  const m = (le) => ({ le, evenement: 'mesure', navigateursMo: { a: 1 }, connexions: { a: { vinted: true, beebs: true } } });
  const lignes = [
    { le: '2026-11-01T21:28:49Z', evenement: 'remise_a_zero', raison: 'r' },
    { le: '2026-11-01T21:54:11Z', evenement: 'connexion_verifiee', plateforme: 'beebs', verifiee_le: '2026-11-01T21:54:11Z' },
    { le: '2026-11-01T21:50:00Z', evenement: 'connexion_verifiee', plateforme: 'vinted', verifiee_le: '2026-11-01T21:50:00Z' },
    m('2026-11-01T22:00:00Z'), m('2026-11-01T22:10:00Z'), m('2026-11-01T23:10:00Z'), m('2026-11-01T23:20:00Z'), m('2026-11-01T23:30:00Z'),
    { le: '2026-11-02T09:50:00Z', evenement: 'remise_a_zero', plateforme: 'beebs', depuis: '2026-11-01T23:15:48Z', raison: 'Beebs injoignable 22:55 → 00:15' },
  ];
  const d = decompteEssai(lignes);
  assert.equal(d.remise.le, '2026-11-01T21:28:49Z', 'la remise d\'UNE plateforme ne remet pas tout l\'essai à zéro');
  assert.equal(d.plateformes.vinted.heures_comptees, 0.5, 'Vinted : ses trois tranches de 10 min');
  assert.equal(d.plateformes.beebs.heures_comptees, 0.2, 'Beebs : seulement après 00:15:48 (23:15:48 → 23:30)');
  assert.equal(d.plateformes.beebs.remise.depuis, '2026-11-01T23:15:48.000Z');
});

// ── Le module, avec une base et un navigateur simulés ───────────────────────────────────────────────────────────────
function monter({ profil = null, taches = [], lecture = { http: 200, id: 'compte' }, etatPage = { pret: true }, pausesMessagerie = null, moteur = null, exceptionCadre = true, lectureSession = null, coffreLu = null, invoke = null, dossierEtat: dossierImpose = null } = {}) {
  const dossierEtat = dossierImpose ?? mkdtempSync(path.join(tmpdir(), 'fs-verif-'));
  const rpc = [], maj = [], alertes = [], coffre = [], bloquees = [], permis = [];
  const jobs = taches.map((t) => ({ ...t }));
  const chaine = (table) => {
    const f = { filtres: {} };
    const q = {
      select() { return q; }, limit() { return q; },
      eq(c, v) { f.filtres[c] = v; return q; },
      update(o) { f.maj = o; return q; },
      maybeSingle: async () => ({ data: table === 'profiles' ? profil : null }),
      then(ok, ko) {
        if (f.maj) { maj.push([f.filtres.id, f.maj]); const j = jobs.find((x) => x.id === f.filtres.id); if (j) Object.assign(j, f.maj); return Promise.resolve({ error: null }).then(ok, ko); }
        const data = table === 'cross_post_jobs' ? jobs.filter((j) => j.platform === f.filtres.platform && j.status === f.filtres.status) : [];
        return Promise.resolve({ data, error: null }).then(ok, ko);
      },
    };
    return q;
  };
  const base = { from: chaine, rpc: async (nom, a) => { rpc.push([nom, a]); return { error: null }; }, ...(invoke ? { functions: { invoke } } : {}) };
  const evaluer = (e) => (e.includes('captcha-delivery') ? etatPage : e.includes('location.hostname !==') ? lecture : null);
  const h = { permises: ['vinted', 'depop'], moteur, cdp: { send: async (m, p) => {
    if (m === 'Target.getTargets') return { targetInfos: [] };
    if (m === 'Target.createTarget') return { targetId: 'fond-1' };
    if (m === 'Target.attachToTarget') return { sessionId: 's-fond' };
    if (m === 'Runtime.evaluate') return { result: { value: evaluer(p.expression) } };
    if (m === 'Storage.getCookies') return { cookies: [{ name: '__Secure-Login', value: 'x', domain: '.leboncoin.fr' }] };
    return {};
  } } };
  const v = creerVerifications({
    config: { dossierEtat },
    base,
    navigateurs: { ouverts: () => [U], ouvert: () => h, permettre: async (u, l) => { permis.push(l); h.permises = l; return { ok: true }; },
      permettreCadre: (u, c) => { permis.push(`cadre:${c}`); return exceptionCadre; }, retirerCadre: (u, c) => { permis.push(`retire:${c}`); } },
    postes: { bloquerPlateforme: async (u, p, c) => { bloquees.push([p, c.nature]); return { verrou: true }; } },
    coffre: { sauvegarderCookies: async (u, c, o) => { coffre.push(o.verifiees); return {}; }, ...(coffreLu ? { lire: async () => coffreLu } : {}) },
    connexionsOuvertes: () => new Set(),
    journal: { info() {}, alerte() {}, erreur() {} },
    alertes: { signaler: async (n, t) => { alertes.push(t); } },
    pausesMessagerie,
    lecture: lectureSession,
  });
  return { v, rpc, maj, alertes, coffre, bloquees, permis, jobs };
}

const etatsPublies = (t, pf) => t.rpc.filter(([n, a]) => n === 'platform_settings_fusionner' && a.p_chemin.join('.') === `${pf}.cloud_verification`).map(([, a]) => a.p_patch.etat);
test('(02/11) une glissière : la plateforme seule s\'arrête, l\'app le lit (« a_resoudre »), ses tâches portent la vraie cause', async () => {
  const t = monter({ taches: [{ id: 'j1', platform: 'leboncoin', status: 'pending', error: "Ouvre leboncoin.fr dans Chrome", platform_fields: {} }] });
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin', referer: 'https://api.leboncoin.fr/x' });
  assert.deepEqual(t.bloquees, [['leboncoin', 'glissiere']]);
  assert.deepEqual(etatsPublies(t, 'leboncoin'), ['a_resoudre'], 'platform_settings.leboncoin.cloud_verification');
  assert.match(t.jobs[0].error, /« Résoudre la vérification »/);
  assert.ok(t.jobs[0].platform_fields.attente_verification_cloud, 'la tâche sait pourquoi elle attend');
  assert.equal(await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin' }), null, 'jamais deux fois');
});

test('(02/11 soir, fausse alerte Leboncoin de 16:55) une glissière d\'onglet de travail est CONFIRMÉE avant d\'appeler la personne', async () => {
  const tache = () => [{ id: 'j1', platform: 'leboncoin', status: 'pending', error: null, platform_fields: {} }];
  const vue = { source: 'navigateur', nature: 'glissiere', plateforme: 'leboncoin', referer: 'https://api.leboncoin.fr/api/account/v2/members/me/account' };
  // 1. Passagère (le cas de 16:55) : fermée aussitôt, « vérification en cours » sans bouton, puis rouverte sans rien dire.
  const t = monter({ taches: tache() });
  await t.v.charger();
  const b = await t.v.bloquer(U, vue);
  assert.deepEqual(t.bloquees, [['leboncoin', 'glissiere']], 'fermée tout de suite : plus aucune requête');
  assert.deepEqual(etatsPublies(t, 'leboncoin'), ['verification_en_cours'], 'rien à faire, aucun bouton « Résoudre »');
  assert.equal(t.jobs[0].error, null, 'aucun message sur les tâches tant que ce n\'est pas confirmé');
  assert.ok(Date.parse(b.confirmation.apres) - Date.parse(b.le) === CONFIRMATION_MS);
  await t.v.releve();
  assert.equal(t.v.plateformesBloquees(U).length, 1, 'pas avant son délai');
  b.confirmation.apres = '2000-01-01T00:00:00Z';
  await t.v.releve();
  assert.deepEqual(t.v.plateformesBloquees(U), [], 'UNE page, UNE lecture : passée → rouverte');
  assert.deepEqual(t.coffre, [['leboncoin']]);
  assert.ok(!etatsPublies(t, 'leboncoin').includes('a_resoudre'), 'jamais « Résoudre » pour une glissière qui ne tient pas');
  // Elle revient dans les 30 min : droit à « Résoudre » (ni seconde confirmation, ni « revenue » : la personne n'a rien fait).
  const b2 = await t.v.bloquer(U, vue);
  assert.equal(b2.nature, 'glissiere');
  assert.ok(!b2.confirmation);
  assert.equal(etatsPublies(t, 'leboncoin').at(-1), 'a_resoudre');
  assert.equal(t.alertes.length, 0);
  // 2. Elle tient (la page de fond montre encore la glissière) : « Résoudre », tâches annotées.
  const g = monter({ taches: tache(), etatPage: { pret: true, captcha: true } });
  await g.v.charger();
  const bg = await g.v.bloquer(U, vue);
  bg.confirmation.apres = '2000-01-01T00:00:00Z';
  await g.v.releve();
  assert.equal(g.v.blocageDe(U, 'leboncoin')?.confirmation?.issue, 'glissiere');
  assert.deepEqual(etatsPublies(g, 'leboncoin'), ['verification_en_cours', 'a_resoudre']);
  assert.match(g.jobs[0].error, /« Résoudre la vérification »/);
  assert.deepEqual(g.coffre, [], 'rien rouvert sans preuve');
  // 3. Pas de navigateur pour l'essai pendant trop longtemps : la personne est appelée quand même.
  assert.ok(CONFIRMATION_MAX_MS > CONFIRMATION_MS);
  assert.ok(aConfirmer(vue) && !aConfirmer({ ...vue, source: 'tache' }) && !aConfirmer({ ...vue, nature: 'bloque' }));
});

test('(02/11) résolue : l\'état part, le message du Cloud part des tâches, la pause Leboncoin de l\'app est levée (reprise prudente)', async () => {
  const t = monter({ profil: { platform_settings: { leboncoin: { blocage_acces: { depuis: '2026-11-01T21:54:07Z' } } }, cloud_voie: true },
    taches: [{ id: 'j1', platform: 'leboncoin', status: 'pending', error: null, platform_fields: {} }] });
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin' });
  assert.equal(await t.v.resolue(U, 'leboncoin', { par: 'resoudre' }), true);
  assert.deepEqual(t.v.plateformesBloquees(U), []);
  assert.ok(t.rpc.some(([n, a]) => n === 'platform_settings_fusionner' && a.p_chemin.join('.') === 'leboncoin' && a.p_supprimer.includes('cloud_verification')), 'l\'état retiré');
  const leve = t.rpc.find(([n, a]) => n === 'platform_settings_fusionner' && a.p_chemin.join('.') === 'leboncoin.blocage_acces');
  assert.ok(leve?.[1].p_patch.leve_le && leve[1].p_patch.leve_par === 'cloud (resoudre)', 'pause de l\'app levée : la tâche retenue repart');
  assert.equal(t.jobs[0].error, null, 'le message du Cloud est parti');
  assert.ok(!t.jobs[0].platform_fields.attente_verification_cloud);
});

test('(02/11) revenue juste après la résolution : « verification_revenue », aucun bouton, l\'équipe prévenue — on ne boucle pas', async () => {
  const t = monter();
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs' });
  await t.v.resolue(U, 'beebs', { par: 'resoudre' });
  const b = await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs' });
  assert.equal(b.nature, 'verification_revenue');
  assert.equal(etatVisible(b.nature), 'revenue');
  assert.equal(t.alertes.length, 1, 'l\'équipe prévenue (alertes.js : support)');
  assert.ok(REVENUE_MS >= 30 * 60_000);
});

test('(02/11) Leboncoin en pause DANS L\'APP sur un compte Cloud → « restreint » côté Cloud (le bon message), son essai suit celui de l\'app', async () => {
  const t = monter({ profil: { cloud_voie: true, platform_settings: { leboncoin: { blocage_acces: { depuis: '2026-11-02T08:00:00Z', signe: 'http_403', essai_apres: '2099-01-01T00:00:00Z' } } } } });
  await t.v.charger();
  await t.v.releve();
  const b = t.v.blocageDe(U, 'leboncoin');
  assert.equal(b?.nature, 'restreint');
  assert.equal(b.essai_apres, '2099-01-01T00:00:00.000Z', 'le même rendez-vous que la pause de l\'app');
  const sans = monter({ profil: { cloud_voie: false, platform_settings: { leboncoin: { blocage_acces: { depuis: 'x' } } } } });
  await sans.v.charger();
  await sans.v.releve();
  assert.equal(sans.v.blocageDe(U, 'leboncoin'), null, 'un compte hors Cloud : rien ne change');
});

test('(02/11) l\'essai des 24 h d\'un accès restreint : une page de fond, UNE lecture ; passée → rouverte (coffre, verrou) ; glissière vue → « à résoudre »', async () => {
  const t = monter();
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'bloque', plateforme: 'leboncoin', essai_apres: '2000-01-01T00:00:00Z' });
  await t.v.releve();
  assert.deepEqual(t.v.plateformesBloquees(U), [], 'accès rendu : rouverte');
  assert.deepEqual(t.coffre, [['leboncoin']], 'la ligne du coffre redevient connectée (vérifiée)');
  assert.ok(t.permis.includes('cadre:fond-1') && t.permis.includes('retire:fond-1'), 'seule la page de fond passe le verrou, le temps de l\'essai');
  assert.ok(t.permis.some((l) => Array.isArray(l) && l.includes('leboncoin')), 'puis le verrou la laisse passer');
  const g = monter({ etatPage: { pret: true, captcha: true } });
  await g.v.charger();
  await g.v.bloquer(U, { nature: 'bloque', plateforme: 'beebs', essai_apres: '2000-01-01T00:00:00Z' });
  await g.v.releve();
  assert.equal(g.v.blocageDe(U, 'beebs')?.nature, 'glissiere', 'une glissière s\'affiche : la personne peut maintenant la résoudre');
  assert.deepEqual(g.coffre, [], 'rien rouvert sans preuve');
});

test('(02/11, règle de Nico) l\'empreinte du navigateur est FIGÉE : notée à la première ouverture, jamais changée sans accord', async () => {
  const { verdictEmpreinte, empreinteNavigateur, specConteneur, corpsSession } = await import('../src/navigateur.js');
  assert.equal(verdictEmpreinte('', 'a1'), 'premiere');
  assert.equal(verdictEmpreinte('a1\n', 'a1'), 'identique');
  assert.equal(verdictEmpreinte('a1', 'b2'), 'refusee', 'changée sans accord : le navigateur ne s\'ouvre pas');
  assert.equal(verdictEmpreinte('a1', 'b2', 'b2'), 'autorisee', 'l\'accord de Nico porte CETTE empreinte-là');
  assert.equal(verdictEmpreinte('a1', 'b2', 'c3'), 'refusee', 'un accord pour une autre empreinte ne vaut rien');
  const config = { imageNavigateur: 'i', dossierProfils: '/p', dossierExtension: '/e' };
  const e = (o = {}) => empreinteNavigateur(specConteneur({ config, user: 'u', profilId: 'p1', ...o }), corpsSession({ proxyUrl: 'http://a:b@1.2.3.4:12323' }));
  assert.equal(e(), empreinteNavigateur(specConteneur({ config, user: 'u', profilId: 'p1' }), corpsSession({ proxyUrl: 'http://c:d@9.9.9.9:12323' })),
    'une autre IP (proxy) ne change pas l\'empreinte du navigateur');
  assert.notEqual(e(), e({ langueFr: true }), 'un montage de plus (langue) la change');
});

test('(02/11, essai de Nico 11:45) « Accès temporairement restreint » écrit dans la page ou le cadre : un accès restreint', async () => {
  const { TEXTE_ACCES_RESTREINT } = await import('../src/plateformes.js');
  for (const t of ['Accès temporairement restreint', 'Acces temporairement restreint', 'Access is temporarily restricted', 'You have been blocked', 'Vous avez été bloqué'])
    assert.ok(TEXTE_ACCES_RESTREINT.test(t), t);
  assert.ok(!TEXTE_ACCES_RESTREINT.test('Vérification de l\'appareil en cours'), 'une vérification qui passe : non');
});

test('(02/11 soir) UN navigateur : le principal prend les langues d\'un vrai Chrome français, rien d\'autre ne change', async () => {
  const nav = await import('../src/navigateur.js');
  const { specConteneur, corpsSession, empreinteNavigateur } = nav;
  const config = { imageNavigateur: 'i', dossierProfils: '/p', dossierExtension: '/e' };
  const p = specConteneur({ config, user: 'u', profilId: 'p1' });
  const s = corpsSession({ proxyUrl: 'http://a:b@1.2.3.4:12323' });
  // fr-FR, fr, en-US, en → Accept-Language « fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7 » (cause prouvée du blocage Beebs).
  // (04/11, décision de Nico) + le lecteur PDF intégré de Chromium, que steel coupait par défaut (REGLAGES_PDF).
  assert.deepEqual(s.userPreferences, { intl: { accept_languages: 'fr-FR,fr,en-US,en', selected_languages: 'fr-FR,fr,en-US,en' },
    plugins: { always_open_pdf_externally: false, plugins_disabled: [] } });
  assert.equal(s.timezone, 'Europe/Paris');
  assert.match(p.Cmd[0], /1920x1080x24/, 'son écran');
  assert.ok(p.HostConfig.Binds.some((b) => b.includes('/app/api/extensions/')) && !p.HostConfig.CpusetCpus, 'son extension, sans limite de cœurs');
  // L'empreinte que le déploiement du 02/11 soir autorise (EMPREINTE_AUTORISEE), pour le lancement en place (ca929fd96ad6) :
  // seules les langues ont changé (73cbe2096d286336 avec « fr-FR, fr »). (04/11) Avec le lecteur PDF intégré réactivé :
  // 7a1cfa22decada93 → 091d90b32056e8dd — à porter dans EMPREINTE_AUTORISEE avec l'accord de Nico, jamais avant.
  assert.equal(empreinteNavigateur({ Labels: { 'fillsell.lancement': 'ca929fd96ad6' } }, s), '091d90b32056e8dd');
  for (const n of ['specConteneurIsole', 'corpsSessionIsole', 'VARIANTES_ISOLEES', 'profilIsole', 'nomConteneurIsole'])
    assert.equal(nav[n], undefined, `plus de navigateur isolé (${n})`);
});

test('(02/11) le refus d\'un bandeau de cookies : trouvé dans la page et ses racines d\'ombre, jamais un bouton invisible', async () => {
  const { EXPRESSION_COOKIES, EXPRESSION_REFUSER_COOKIES } = await import('../src/plateformes.js');
  const bouton = (o) => ({ id: '', innerText: '', getBoundingClientRect: () => ({ width: 80, height: 30 }), clics: 0, click() { this.clics++; }, ...o });
  const racine = (els) => ({ querySelectorAll: (sel) => (sel === '*' ? els : els.filter((e) => e.click)) });
  const lancer = (expr, doc) => new Function('document', 'return ' + expr)(doc);
  const refus = bouton({ id: 'axeptio_btn_dismiss', innerText: 'Non merci' });
  const ombre = racine([refus, bouton({ id: 'axeptio_btn_acceptAll', innerText: 'OK pour moi' })]);
  const doc = racine([{ shadowRoot: ombre }, bouton({ innerText: 'Se connecter' })]);
  assert.deepEqual(lancer(EXPRESSION_COOKIES, doc), { refus: true }, 'Axeptio, dans sa racine d\'ombre');
  assert.deepEqual(lancer(EXPRESSION_REFUSER_COOKIES, doc), { clique: true });
  assert.equal(refus.clics, 1, 'le REFUS, jamais « OK pour moi »');
  assert.deepEqual(lancer(EXPRESSION_COOKIES, racine([bouton({ innerText: 'Tout refuser', getBoundingClientRect: () => ({ width: 0, height: 0 }) })])), { refus: false }, 'invisible : non');
  assert.deepEqual(lancer(EXPRESSION_COOKIES, racine([bouton({ innerText: 'Refuser' })])), { refus: true }, 'les mots usuels, hors Axeptio');
  assert.deepEqual(lancer(EXPRESSION_COOKIES, racine([bouton({ innerText: 'Se connecter' })])), { refus: false });
});

test('(04/11 soir, règle de Nico) une résolution réussie lève la pause de la messagerie de SA plateforme (et la coupure de sa veille)', async () => {
  const levees = [];
  const t = monter({ pausesMessagerie: { lever: async (u, ps, o) => { levees.push([u, ps, o.raison]); return { base: ps, extension: null }; } } });
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin' });
  assert.equal(await t.v.resolue(U, 'leboncoin', { par: 'resoudre' }), true);
  assert.deepEqual(levees, [[U, ['leboncoin'], 'resolution (resoudre)']]);
  const sans = monter();
  await sans.v.charger();
  await sans.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin' });
  assert.equal(await sans.v.resolue(U, 'leboncoin', { par: 'resoudre' }), true, 'sans le module : la résolution tient comme avant');
});

test('(20/11, point 5 de Nico — compte 2f8b09d2) moteur CHROME : l’essai a son exception par le relais, jamais « verrou sans exception par page »', async () => {
  const vue = { source: 'navigateur', nature: 'glissiere', plateforme: 'beebs', referer: 'https://www.beebs.app/' };
  // 1. La glissière ne tient plus : l’essai regarde VRAIMENT la page, Beebs est rouvert (relais permis), rien n’est rendu.
  const t = monter({ moteur: 'chrome', exceptionCadre: false });
  await t.v.charger();
  const b = await t.v.bloquer(U, vue);
  b.confirmation.apres = '2000-01-01T00:00:00Z';
  await t.v.releve();
  assert.deepEqual(t.v.plateformesBloquees(U), [], 'passée → rouverte (avant : « erreur », fermée pour toujours)');
  const listes = t.permis.filter(Array.isArray);
  assert.ok(listes.some((l) => l.includes('beebs') && l.includes('vinted') && l.includes('depop')), 'Beebs permis au relais le temps de l’essai');
  assert.ok(listes.at(-1).includes('beebs'), 'rouverte : Beebs reste permis (pas de liste rendue par-dessus)');
  // 2. La glissière tient encore : à résoudre, et le relais retrouve sa liste d’avant (Beebs refermé).
  const g = monter({ moteur: 'chrome', exceptionCadre: false, etatPage: { pret: true, captcha: true } });
  await g.v.charger();
  const bg = await g.v.bloquer(U, vue);
  bg.confirmation.apres = '2000-01-01T00:00:00Z';
  await g.v.releve();
  assert.equal(g.v.blocageDe(U, 'beebs')?.confirmation?.issue, 'glissiere', 'la page a été lue (avant : « erreur »)');
  const lg = g.permis.filter(Array.isArray);
  assert.ok(lg.some((l) => l.includes('beebs')) && !lg.at(-1).includes('beebs'), 'relais rendu sans Beebs après l’essai');
  // 3. Moteur steel : l'exception par page, comme avant (aucune liste du relais touchée par l’essai).
  const st = monter({ exceptionCadre: true });
  await st.v.charger();
  const bs = await st.v.bloquer(U, vue);
  bs.confirmation.apres = '2000-01-01T00:00:00Z';
  await st.v.releve();
  assert.ok(st.permis.some((x) => String(x).startsWith('cadre:')), 'steel : exception par page');
});


// ── (21/11/2026 midi, point 3 de Nico — Muriel 0c97dc8b, Beebs) Une vérification passée TOUTE SEULE n'est pas une résolution
// par la personne : la glissière suivante est un PREMIER captcha (confirmation), jamais « revenue ».
import { revenueApres, confirmerApres, requalifierRevenuesSansLaPersonne, RESOLUTIONS_SANS_LA_PERSONNE } from '../src/verifications.js';

test('(21/11) « revenue » seulement après une résolution de la personne ; passée seule → premier captcha', () => {
  assert.deepEqual([...RESOLUTIONS_SANS_LA_PERSONNE], ['confirmation', 'verification_passee_seule', 'resoudre_sans_glissiere']);
  assert.equal(revenueApres({ resolue_le: 'L', resolue_par: 'resoudre' }), true, 'glissée par elle');
  assert.equal(revenueApres({ resolue_le: 'L', resolue_par: 'connexion' }), true);
  for (const par of RESOLUTIONS_SANS_LA_PERSONNE) assert.equal(revenueApres({ resolue_le: 'L', resolue_par: par }), false, par);
  assert.equal(confirmerApres(null, false), true, 'premier captcha : confirmé');
  assert.equal(confirmerApres({ resolue_par: 'verification_passee_seule' }, true), true, 'après une vérification passée seule : confirmé comme un premier');
  assert.equal(confirmerApres({ resolue_par: 'resoudre_sans_glissiere' }, true), true);
  assert.equal(confirmerApres({ resolue_par: 'confirmation' }, true), false, '(02/11 soir) pas de seconde confirmation');
});

test('(21/11) le cas de Muriel rejoué : 11:05 passée seule, 11:19 glissière → confirmation (pas d’arrêt) ; la revenue déjà posée est requalifiée', async () => {
  const t = monter();
  const il = new Date(Date.now() - 10 * 60_000).toISOString();
  const passee = { le: il, user: U, plateforme: 'beebs', nature: 'glissiere', source: 'navigateur', debloquee_le: il, resolue_le: il, resolue_par: 'verification_passee_seule' };
  await t.v.ajouter(passee);
  const b = await t.v.bloquer(U, { plateforme: 'beebs', nature: 'glissiere', source: 'navigateur', detail: 'cadre DataDome dans un onglet de travail' });
  assert.equal(b.nature, 'glissiere', 'jamais « verification_revenue »');
  assert.ok(b.confirmation?.apres, 'confirmée comme un premier captcha');
  assert.equal(t.alertes.length, 0, 'aucune alerte « redemandée juste après sa résolution »');
  // Après une résolution de la personne (« Résoudre » avec la glissière vue), la revenue reste la règle.
  const t2 = monter();
  await t2.v.ajouter({ ...passee, resolue_par: 'resoudre' });
  const b2 = await t2.v.bloquer(U, { plateforme: 'beebs', nature: 'glissiere', source: 'navigateur' });
  assert.equal(b2.nature, 'verification_revenue');
  // La revenue posée AVANT ce correctif (11:19:10) : requalifiée au démarrage (charger).
  const liste = [passee, { le: 'X', user: U, plateforme: 'beebs', nature: 'verification_revenue', nature_vue: 'glissiere', source: 'navigateur', resolue_avant: passee.resolue_le }];
  assert.equal(requalifierRevenuesSansLaPersonne(liste, Date.parse('2026-11-21T12:30:00Z')), 1);
  assert.equal(liste[1].nature, 'glissiere');
  assert.equal(liste[1].resolue_avant, undefined);
  assert.equal(liste[1].confirmation.depuis, '2026-11-21T12:30:00.000Z', 'son délai part de la requalification');
  assert.equal(liste[1].requalifiee.resolution_avant, 'verification_passee_seule');
  const parElle = [{ ...passee, resolue_par: 'resoudre' }, { le: 'X', user: U, plateforme: 'beebs', nature: 'verification_revenue', resolue_avant: passee.resolue_le }];
  assert.equal(requalifierRevenuesSansLaPersonne(parElle), 0);
  assert.equal(parElle[1].nature, 'verification_revenue');
});

test('(21/11, point 2) confirmation : « session fermée » seulement si la plateforme le dit (lecture de fond) ; lue → passée', async () => {
  for (const [issue, attendue] of [['ok', 'passe'], ['perdue', 'session_fermee'], ['incertaine', 'impossible_ou_refuse']]) {
    const appels = [];
    const t = monter({ lecture: { http: 0, motif: 'sans_jeton' }, lectureSession: { lire: async (u, p, o) => { appels.push(o.raison); return { issue, http: issue === 'ok' ? 200 : 0 }; } } });
    await t.v.charger();
    const b = await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin', source: 'navigateur' });
    b.confirmation.apres = '2000-01-01T00:00:00Z';
    await t.v.releve();
    assert.deepEqual(appels, ['essai_confirmation'], issue);
    const fin = b.confirmation.issue;
    if (attendue === 'impossible_ou_refuse') assert.ok(['refuse', 'impossible'].includes(fin), `${issue} → ${fin}`);
    else assert.equal(fin, attendue, issue);
  }
});

test('(21/11, point 2 — c7c382b7 17/11) vérification passée seule : session LUE sur la plateforme → le coffre redevient connecté (jamais « à reconnecter »)', async () => {
  const appels = [];
  const lectureSession = { lire: async (u, p, o) => { appels.push(o.raison); return { issue: 'ok', http: 200 }; } };
  const t = monter({ lectureSession, coffreLu: { beebs: { connecte: false, bloquee: { nature: 'glissiere' } } } });
  await t.v.charger();
  await t.v.verificationPassee(U, 'beebs');
  assert.deepEqual(appels, ['verification_passee_seule']);
  assert.deepEqual(t.coffre, [['beebs']], 'coffre « connecté » (vérifiée)');
  assert.ok(t.permis.some((l) => Array.isArray(l) && l.includes('beebs')), 'le relais la laisse passer');
  // Session pas lue (perdue, sans conclusion) : rien ne change. Déjà connectée au coffre : aucune lecture.
  for (const issue of ['perdue', 'incertaine']) {
    const t2 = monter({ lectureSession: { lire: async () => ({ issue }) }, coffreLu: { beebs: { connecte: false, bloquee: {} } } });
    await t2.v.charger();
    await t2.v.verificationPassee(U, 'beebs');
    assert.deepEqual(t2.coffre, [], issue);
  }
  const a3 = [];
  const t3 = monter({ lectureSession: { lire: async () => { a3.push(1); return { issue: 'ok' }; } }, coffreLu: { beebs: { connecte: true } } });
  await t3.v.charger();
  await t3.v.verificationPassee(U, 'beebs');
  assert.equal(a3.length, 0, 'déjà connectée : aucune page de plus sur la plateforme');
});

test('(21/11, point 2 — f0acd3af 21/11 10:31) une ligne « en vérification » sans blocage en cours : relue toutes les 6 h au plus, rouverte si lue', async () => {
  const appels = [];
  let issue = 'perdue';
  const t = monter({ lectureSession: { lire: async (u, p, o) => { appels.push([p, o.raison]); return { issue, http: 200 }; } },
    coffreLu: { leboncoin: { connecte: false, bloquee: { nature: 'glissiere' } }, vinted: { connecte: true } } });
  await t.v.charger();
  await t.v.releve();
  assert.deepEqual(appels, [['leboncoin', 'coffre_en_verification_sans_blocage']], 'seule la ligne en vérification est relue');
  assert.deepEqual(t.coffre, [], 'perdue : rien ne change');
  issue = 'ok';
  await t.v.releve();
  assert.equal(appels.length, 1, 'pas relue avant 6 h');
});

// ── (21/11/2026, lot de Nico, point 5 — Muriel) UN CAPTCHA = LA CLIENTE PRÉVENUE, UNE FOIS PAR INCIDENT ─────────────────
test('(21/11) à résoudre : la cliente est prévenue (push-cloud-verification) une seule fois ; restreint : jamais ; un échec ne bloque rien', async () => {
  const appels = [];
  const invoke = async (nom, o) => { appels.push([nom, o.body]); return { data: { push: false, mail: false, push_motif: 'sans_appareil', mail_motif: 'mail_coupe' }, error: null }; };
  const t = monter({ invoke });
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin', referer: 'https://api.leboncoin.fr/x' });
  assert.deepEqual(appels.map(([n, b]) => [n, b.user_id, b.plateforme, b.etat]), [['push-cloud-verification', U, 'leboncoin', 'a_resoudre']]);
  // Republiée (relecture, annotation, redémarrage) : jamais une seconde fois pour le même incident.
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'leboncoin', referer: 'https://api.leboncoin.fr/x' });
  assert.equal(appels.length, 1, 'une fois par incident');
  // Accès restreint (rien à faire glisser) : personne n'est appelé.
  await t.v.bloquer(U, { nature: 'bloque', plateforme: 'vinted', referer: 'https://www.vinted.fr/x' });
  assert.equal(appels.length, 1, 'restreint : aucune notification');
  // Un envoi qui échoue ne casse ni le blocage ni la publication.
  const t2 = monter({ invoke: async () => { throw new Error('réseau'); } });
  await t2.v.charger();
  await t2.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs', referer: 'https://www.beebs.app/x' });
  assert.deepEqual(etatsPublies(t2, 'beebs'), ['a_resoudre']);
});

test('(21/11 soir) un envoi raté ne vaut pas « prévenue » : nouvel essai (pas avant 30 min) ; un ancien marquage sans réussite, rechargé au démarrage, prévient une fois', async () => {
  const { mkdtempSync: mk, writeFileSync: ecrire, readFileSync: lireF, mkdirSync: creer } = await import('node:fs');
  // 1. Échec (le 401 de 15:46) : rien n'est marqué « prévenue » ; une republication immédiate ne rappelle pas (30 min).
  let n = 0;
  const t = monter({ invoke: async () => { n++; return { data: null, error: new Error('Edge Function returned a non-2xx status code') }; } });
  await t.v.charger();
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs', referer: 'https://www.beebs.app/x' });
  assert.equal(n, 1, 'un essai');
  await t.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs', referer: 'https://www.beebs.app/x' });
  assert.equal(n, 1, 'pas de second essai dans les 30 min');
  // 2. Le cas de 15:46 : un blocage ouvert, marqué « prévenue » par l'ancienne règle (avant l'appel raté), sans réussite.
  const dossier = mk(path.join(tmpdir(), 'fs-verif-ancien-'));
  creer(path.join(dossier, 'endurance'), { recursive: true });
  ecrire(path.join(dossier, 'endurance', 'blocages.json'), JSON.stringify([{ user: U, plateforme: 'beebs', nature: 'glissiere', le: '2026-11-18T13:36:18.442Z',
    confirmee_le: '2026-11-18T13:37:00.000Z', cliente_prevenue_le: '2026-11-21T14:46:51.000Z' }]));
  const appels = [];
  const t3 = monter({ invoke: async (nom, o) => { appels.push(o.body); return { data: { push: true }, error: null }; }, dossierEtat: dossier });
  await t3.v.charger();
  assert.equal(appels.length, 1, 'au démarrage, l\'incident encore ouvert prévient la cliente une fois');
  const garde = JSON.parse(lireF(path.join(dossier, 'endurance', 'blocages.json'), 'utf8'));
  assert.equal(garde[0].cliente_prevenue_ok, true, 'réussite gardée');
  await t3.v.bloquer(U, { nature: 'glissiere', plateforme: 'beebs', referer: 'https://www.beebs.app/x' });
  assert.equal(appels.length, 1, 'puis plus jamais pour cet incident');
});
