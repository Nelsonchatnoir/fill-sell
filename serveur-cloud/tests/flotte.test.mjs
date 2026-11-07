// (03/11, points 1 et 5 de Nico) LA FLOTTE : capacité automatique, places, attribution d'un compte à un serveur,
// montée en charge préparée « à blanc » (rien n'est créé sans les deux interrupteurs), repli avant la migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capaciteServeur, planFlotte, prochainNomServeur, domaineDuServeur, typeDepuisCode, lieuDepuisCode, envPourNouveauServeur,
  amorcePour, cloudInitPour, corpsCreationHetzner, resumePlan, lireComptesDuServeur, creerFlotte, USER_DATA_MAX,
  CREATION_EN_COURS_MS, serviceDuServeur, alerteCapacite, SEUIL_CAPACITE_PCT, textePassage30, capaciteMesuree,
} from '../src/flotte.js';

const T = Date.parse('2026-11-03T18:00:00Z');
const vu = (ms) => new Date(T - ms).toISOString();
const IMAGE = 'ghcr.io/steel-dev/steel-browser@sha256:' + 'b5'.repeat(32);
const journal = () => { const l = []; return { l, info: (e, d) => l.push(['info', e, d]), alerte: (e, d) => l.push(['alerte', e, d]), erreur: (e, d) => l.push(['erreur', e, d]) }; };

test('capacité : NAVIGATEURS_MAX s’il est réglé ; sinon mémoire de l’hôte − socle, divisée par le plafond d’un navigateur', () => {
  assert.equal(capaciteServeur({ totalMo: 15613, plafondMo: 3072, reglage: 4 }), 4);
  assert.equal(capaciteServeur({ totalMo: 15613, plafondMo: 3072 }), 4, 'cx43 (15,6 Go), 3 Go par navigateur');
  assert.equal(capaciteServeur({ totalMo: 15613, plafondMo: 2048 }), 7);
  assert.equal(capaciteServeur({ totalMo: 64 * 1024, plafondMo: 3072 }), 21, 'AX42 (64 Go)');
  assert.equal(capaciteServeur({ totalMo: 15613, socleMo: 700, plafondMo: 1400 }), 10);
  assert.equal(capaciteServeur({ totalMo: null, plafondMo: 3072, repli: 8 }), 8, 'mémoire illisible : l’ancien défaut');
  assert.equal(capaciteServeur({ totalMo: 15613, plafondMo: null, repli: 8 }), 8);
  assert.equal(capaciteServeur({ totalMo: 500, plafondMo: 3072 }), 0, 'jamais négatif');
});

test('types et lieux : coin_config ne porte que des entiers (index), défaut cpx42 / fsn1', () => {
  assert.equal(typeDepuisCode(0), 'cpx42'); assert.equal(typeDepuisCode(1), 'cx43');
  assert.equal(typeDepuisCode(99), 'cpx42'); assert.equal(typeDepuisCode(-1), 'cpx42'); assert.equal(typeDepuisCode(null), 'cpx42');
  assert.equal(lieuDepuisCode(0), 'fsn1'); assert.equal(lieuDepuisCode(2), 'hel1'); assert.equal(lieuDepuisCode('x'), 'fsn1');
  assert.equal(prochainNomServeur([{ nom: 'cloud-1' }]), 'cloud-2');
  assert.equal(prochainNomServeur([{ nom: 'cloud-1' }, { nom: 'cloud-10' }, { nom: 'cloud-3' }]), 'cloud-11');
  assert.equal(prochainNomServeur([]), 'cloud-2', 'cloud-1 est réservé au serveur historique');
  assert.equal(domaineDuServeur('cloud-2'), 'cloud-2.fillsell.app');
});

test('planFlotte : places suffisantes → rien ; sous le seuil → UN serveur, préparé par le seul doyen', () => {
  const s1 = { nom: 'cloud-1', etat: 'actif', capacite: 4, comptes: 1, vu_le: vu(30_000) };
  assert.deepEqual(planFlotte({ serveurs: [s1], seuilPlacesLibres: 2, nomCourant: 'cloud-1', maintenant: T }).creer, 0);
  const plein = { ...s1, comptes: 3 };
  const p = planFlotte({ serveurs: [plein], seuilPlacesLibres: 2, nomCourant: 'cloud-1', maintenant: T });
  assert.equal(p.creer, 1); assert.equal(p.raison, 'sous_le_seuil'); assert.equal(p.nom, 'cloud-2'); assert.equal(p.domaine, 'cloud-2.fillsell.app');
  assert.equal(p.placesLibres, 1);
  const s2 = { nom: 'cloud-2', etat: 'actif', capacite: 4, comptes: 4, vu_le: vu(30_000) };
  assert.equal(planFlotte({ serveurs: [plein, s2], seuilPlacesLibres: 2, nomCourant: 'cloud-2', maintenant: T }).raison, 'pas_le_doyen');
  assert.equal(planFlotte({ serveurs: [plein, s2], seuilPlacesLibres: 2, nomCourant: 'cloud-1', maintenant: T }).nom, 'cloud-3');
});

test('planFlotte : les places de la base priment (comptes non attribués, places gardées) ; un serveur muet ne compte pas', () => {
  const s1 = { nom: 'cloud-1', etat: 'actif', capacite: 4, comptes: 0, vu_le: vu(30_000) };
  assert.equal(planFlotte({ serveurs: [s1], placesLibres: 1, seuilPlacesLibres: 2, nomCourant: 'cloud-1', maintenant: T }).creer, 1);
  const muet = { ...s1, vu_le: vu(6 * 60_000) };
  const p = planFlotte({ serveurs: [muet], seuilPlacesLibres: 2, nomCourant: 'cloud-1', maintenant: T });
  assert.equal(p.placesLibres, 0); assert.equal(p.raison, 'aucun_serveur_vivant', 'personne pour créer : l’alerte le dit');
});

test('planFlotte : jamais deux créations ; une création bloquée ne se relance pas seule', () => {
  const plein = { nom: 'cloud-1', etat: 'actif', capacite: 4, comptes: 4, vu_le: vu(30_000) };
  const enCours = { nom: 'cloud-2', etat: 'en_creation', capacite: 0, comptes: 0, cree_le: vu(10 * 60_000) };
  assert.equal(planFlotte({ serveurs: [plein, enCours], seuilPlacesLibres: 2, nomCourant: 'cloud-1', maintenant: T }).raison, 'creation_en_cours');
  const bloque = { ...enCours, cree_le: vu(CREATION_EN_COURS_MS + 60_000) };
  const p = planFlotte({ serveurs: [plein, bloque], seuilPlacesLibres: 2, nomCourant: 'cloud-1', maintenant: T });
  assert.equal(p.creer, 0); assert.equal(p.raison, 'creation_bloquee');
});

test('.env d’un serveur neuf : même coffre et mêmes clés ; son nom, son adresse, capacité automatique, sans l’essai de 48 h', () => {
  const src = 'SUPABASE_URL=https://x.supabase.co\r\nCOFFRE_CLE=secret==\r\nSERVEUR_NOM=cloud-1\r\nDOMAINE=cloud.fillsell.app\r\nNAVIGATEURS_MAX=4\r\nENDURANCE=1\r\n';
  const e = envPourNouveauServeur(src, { nom: 'cloud-2', domaine: 'cloud-2.fillsell.app' });
  assert.match(e, /^COFFRE_CLE=secret==$/m); assert.match(e, /^SERVEUR_NOM=cloud-2$/m); assert.match(e, /^DOMAINE=cloud-2\.fillsell\.app$/m);
  assert.match(e, /^NAVIGATEURS_MAX=$/m); assert.match(e, /^ENDURANCE=0$/m); assert.ok(!e.includes('\r'));
  const sans = envPourNouveauServeur('COFFRE_CLE=k\n', { nom: 'cloud-3', domaine: 'cloud-3.fillsell.app' });
  assert.match(sans, /^SERVEUR_NOM=cloud-3$/m); assert.match(sans, /^DOMAINE=cloud-3\.fillsell\.app$/m);
});

test('amorce : le socle et les gestes du déploiement ; toute valeur douteuse est refusée (aucune injection)', () => {
  const a = amorcePour({ sha: '0123456789ab', domaine: 'cloud-2.fillsell.app', imageSteel: IMAGE, urlPaquet: 'https://x.supabase.co/storage/v1/object/sign/cloud-paquets/0123456789ab.tgz?token=abc', destinations: '176.103.182.215:12323' });
  for (const geste of ['apt-get install', 'fillsell-pare-feu.service', 'deploiement/systemd/*.path', 'ufw --force enable', 'install -m 600 /root/fillsell-env /srv/fillsell-cloud/.env',
    'docker build -q -t "fillsell-orchestrateur:$SHA"', "-f '${Version}' chromium", 'pare-feu-navigateurs.sh', 'docker compose up -d']) {
    assert.ok(a.includes(geste), geste);
  }
  assert.throws(() => amorcePour({ sha: "abc'; rm -rf /", domaine: 'cloud-2.fillsell.app', imageSteel: IMAGE, urlPaquet: 'https://a/b' }), /sha/);
  assert.throws(() => amorcePour({ sha: '0123456789ab', domaine: 'cloud-2.fillsell.app', imageSteel: IMAGE, urlPaquet: "https://a/b'x" }), /url/);
  assert.throws(() => amorcePour({ sha: '0123456789ab', domaine: 'x;y', imageSteel: IMAGE, urlPaquet: 'https://a/b' }), /domaine/);
  assert.throws(() => amorcePour({ sha: '0123456789ab', domaine: 'cloud-2.fillsell.app', imageSteel: 'steel:latest', urlPaquet: 'https://a/b' }), /image/);
});

test('cloud-init : amorce et .env en base64 (le .env en 0600), sous la limite Hetzner ; trop gros = refus', () => {
  const ci = cloudInitPour({ amorce: '#!/bin/bash\necho x\n', envTexte: 'COFFRE_CLE=k\n' });
  assert.ok(ci.startsWith('#cloud-config\n'));
  const contenus = [...ci.matchAll(/content: (\S+)/g)].map((m) => Buffer.from(m[1], 'base64').toString('utf8'));
  assert.deepEqual(contenus, ['#!/bin/bash\necho x\n', 'COFFRE_CLE=k\n']);
  assert.match(ci, /path: \/root\/fillsell-env\n\s+permissions: '0600'/);
  assert.throws(() => cloudInitPour({ amorce: 'x'.repeat(USER_DATA_MAX), envTexte: '' }), /user_data/);
});

test('corps Hetzner exact ; le résumé journalisé ne porte jamais le user_data (donc jamais le .env)', () => {
  const ud = cloudInitPour({ amorce: 'a', envTexte: 'COFFRE_CLE=ne-jamais-journaliser\n' });
  const c = corpsCreationHetzner({ nom: 'cloud-2', type: 'cpx42', lieu: 'fsn1', userData: ud, cleSsh: [7], pareFeu: 11738181 });
  assert.deepEqual({ ...c, user_data: null }, {
    name: 'fillsell-cloud-2', server_type: 'cpx42', location: 'fsn1', image: 'ubuntu-24.04', start_after_create: true, user_data: null,
    ssh_keys: [7], firewalls: [{ firewall: 11738181 }], public_net: { enable_ipv4: true, enable_ipv6: true }, labels: { fillsell: 'cloud', serveur: 'cloud-2' },
  });
  const r = JSON.stringify(resumePlan({ nom: 'cloud-2', corps: c }));
  assert.ok(!r.includes('ne-jamais-journaliser') && !r.includes(Buffer.from('COFFRE_CLE').toString('base64').slice(0, 8)));
  assert.match(r, /octets, sha256 [0-9a-f]{16}/);
});

test('comptes du serveur : la fonction de la flotte ; repli sur l’ancien appel avant la migration ; une vraie erreur remonte', async () => {
  const appels = [];
  const fab = (reponses) => ({ rpc: async (nom, a) => { appels.push([nom, a]); return reponses[nom] ?? { data: null, error: null }; } });
  let r = await lireComptesDuServeur(fab({ cloud_comptes_du_serveur: { data: [{ user_id: 'u1' }], error: null } }), 'cloud-1');
  assert.equal(r.source, 'serveur'); assert.deepEqual(r.comptes, [{ user_id: 'u1' }]);
  assert.deepEqual(appels.at(-1), ['cloud_comptes_du_serveur', { p_serveur: 'cloud-1' }]);
  r = await lireComptesDuServeur(fab({ cloud_comptes_du_serveur: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.cloud_comptes_du_serveur(p_serveur)' } },
    cloud_comptes_a_servir: { data: [{ user_id: 'u2' }], error: null } }), 'cloud-1');
  assert.equal(r.source, 'repli'); assert.deepEqual(r.comptes, [{ user_id: 'u2' }]);
  r = await lireComptesDuServeur(fab({ cloud_comptes_a_servir: { data: [{ user_id: 'u3' }], error: null } }), 'cloud-1');
  assert.equal(r.source, 'repli', 'réponse sans tableau (faux client, simulation) : l’ancien appel');
  await assert.rejects(lireComptesDuServeur(fab({ cloud_comptes_du_serveur: { data: null, error: { message: 'canceling statement due to statement timeout' } } }), 'cloud-1'), /statement timeout/);
});

function fausseBase({ serveurs, coin = {}, places = 1, sansFonction = false }) {
  const rpc = [];
  const base = {
    rpc: async (nom, a) => {
      rpc.push([nom, a]);
      if (sansFonction && nom === 'cloud_serveur_battre') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.cloud_serveur_battre' } };
      if (nom === 'cloud_serveur_battre') return { data: { comptes: 3, places: 1, places_libres: places }, error: null };
      return { data: null, error: null };
    },
    from: (table) => ({
      select: () => {
        const r = table === 'coin_config' ? Object.entries(coin).map(([key, value]) => ({ key, value })) : serveurs;
        return { in: async () => ({ data: r, error: null }), then: (ok, ko) => Promise.resolve({ data: r, error: null }).then(ok, ko) };
      },
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async (c) => ({ data: { signedUrl: `https://x.supabase.co/storage/v1/object/sign/cloud-paquets/${c}?token=t` }, error: null }) }) },
  };
  return { base, rpc };
}
const ENV_SRC = 'COFFRE_CLE=secret-du-coffre\nSERVEUR_NOM=cloud-1\nDOMAINE=cloud.fillsell.app\n';
const fichiers = (p) => (p.endsWith('deploiement/.env') ? Promise.resolve('VERSION_ORCHESTRATEUR=0123456789ab\nDOMAINE=cloud.fillsell.app\n')
  : p.endsWith('proxys-permis.txt') ? Promise.resolve('176.103.182.215:12323\n') : p.endsWith('/.env') ? Promise.resolve(ENV_SRC) : Promise.reject(new Error('absent')));
const configFlotte = (extra = {}) => ({ serveurNom: 'cloud-1', domaine: 'cloud.fillsell.app', navigateursMax: 4, navigateursMaxAuto: false, memoireNavigateur: '3g',
  imageNavigateur: IMAGE, dossierDeploiement: '/srv/fillsell-cloud/deploiement', dossierPaquets: '/srv/fillsell-cloud/paquets', fichierEnv: '/srv/fillsell-cloud/.env',
  hetznerCreationAutorisee: false, ...extra });
const hetznerQuiRefuseTout = () => {
  const posts = [];
  return { posts, disponible: true, get: async (c) => (c === '/ssh_keys' ? { ssh_keys: [{ id: 7 }] } : c.startsWith('/firewalls') ? { firewalls: [{ id: 11738181 }] } : {}),
    post: async (c, b) => { posts.push([c, b]); throw new Error('POST interdit dans ce test'); } };
};
const pleins = [{ nom: 'cloud-1', etat: 'actif', capacite: 4, comptes: 3, vu_le: new Date().toISOString(), cree_le: '2026-10-05T12:57:44Z' }];

test('tour à blanc : sous le seuil, le plan complet est journalisé SANS rien créer (interrupteurs coupés)', async () => {
  for (const [env, auto] of [[false, 0], [true, 0], [false, 1]]) {
    const { base } = fausseBase({ serveurs: pleins, coin: { cloud_places_seuil: 2, cloud_serveurs_auto: auto } });
    const hz = hetznerQuiRefuseTout(); const j = journal(); const alertes = [];
    const f = creerFlotte({ config: configFlotte({ hetznerCreationAutorisee: env }), base, navigateurs: { ouverts: () => ['u'] }, journal: j,
      alertes: { signaler: async (n, t) => alertes.push([n, t]) }, hetzner: hz, cloudflare: { disponible: false }, lireFichier: fichiers,
      empaqueter: async () => { throw new Error('jamais à blanc'); } });
    await f.battre();
    const r = await f.tour();
    assert.equal(r.aBlanc, true, `env=${env} coin=${auto}`);
    assert.equal(hz.posts.length, 0, 'aucun POST Hetzner');
    assert.equal(r.plan.corps.server_type, 'cpx42'); assert.equal(r.plan.corps.location, 'fsn1'); assert.equal(r.plan.nom, 'cloud-2');
    assert.ok(r.plan.manques.some((m) => m.startsWith('DNS')), 'sans jeton Cloudflare, le plan le dit');
    const ligne = j.l.find((x) => x[1] === 'flotte_plan_a_blanc');
    assert.ok(ligne, 'plan journalisé'); assert.ok(!JSON.stringify(ligne).includes('secret-du-coffre'), 'jamais le .env au journal');
    assert.ok(alertes.some(([, t]) => /sous le seuil : 1 libre/.test(t)), 'alerte de seuil (cloud_pool_alertes, aucun mail)');
  }
});

test('tour avec les DEUX interrupteurs : la création suit le plan (faux client), DNS laissé à poser sans jeton', async () => {
  const { base, rpc } = fausseBase({ serveurs: pleins, coin: { cloud_places_seuil: 2, cloud_serveurs_auto: 1, cloud_serveur_type: 1, cloud_serveur_lieu: 1 } });
  const posts = [];
  const hz = { disponible: true, get: hetznerQuiRefuseTout().get, post: async (c, b) => { posts.push([c, b]); return { server: { id: 999, public_net: { ipv4: { ip: '5.6.7.8' } } } }; } };
  const f = creerFlotte({ config: configFlotte({ hetznerCreationAutorisee: true }), base, navigateurs: { ouverts: () => [] }, journal: journal(),
    alertes: { signaler: async () => {} }, hetzner: hz, cloudflare: { disponible: false }, lireFichier: fichiers, empaqueter: async () => Buffer.from('tgz') });
  await f.battre();
  const r = await f.tour();
  assert.equal(posts.length, 1); assert.equal(posts[0][0], '/servers');
  assert.equal(posts[0][1].server_type, 'cx43'); assert.equal(posts[0][1].location, 'nbg1');
  const ud = posts[0][1].user_data; const amorce = Buffer.from(/content: (\S+)/.exec(ud)[1], 'base64').toString('utf8');
  assert.ok(amorce.includes("token=t'"), 'le paquet vient de l’URL signée');
  assert.equal(r.fait.id, 999); assert.equal(r.fait.dns, 'a_poser');
  assert.equal(rpc.filter(([n]) => n === 'cloud_serveur_noter_creation').length, 2, 'en création, puis id et IPv4');
});

test('battement : avant la migration, dit une fois et ne casse rien', async () => {
  const { base } = fausseBase({ serveurs: [], sansFonction: true });
  const j = journal();
  const f = creerFlotte({ config: configFlotte(), base, navigateurs: { ouverts: () => [] }, journal: j, alertes: null, hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false }, lireFichier: fichiers });
  assert.equal(await f.battre(), null); assert.equal(await f.battre(), null);
  assert.equal(j.l.filter((x) => x[1] === 'flotte_absente').length, 1);
  assert.deepEqual(await f.tour(), { absente: true });
});

// ── (06/11 soir, règle d'attribution de Nico) ce que le serveur déclare pouvoir servir ─────────────────────────────
const INFO_CLOUD2 = { gpu: { devices: [{ deviceString: 'ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL 4.6 (Core Profile) Mesa 25.2.8-0ubuntu0.24.04.4)' }],
  auxAttributes: { glRenderer: 'ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL 4.6 (Core Profile) Mesa 25.2.8-0ubuntu0.24.04.4)' },
  featureStatus: { webgl: 'enabled', gpu_compositing: 'enabled', video_encode: 'disabled_software' } } };   // relu sur cloud-2 le 06/11 18:12
const INFO_STEEL = { gpu: { auxAttributes: { glRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)' },
  featureStatus: { webgl: 'enabled', gpu_compositing: 'enabled' } } };
const CHROME_PUCE = { moteurNavigateur: 'chrome', navigateurGpu: true, comptesAutorises: [] };
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

test('rendu lu par SystemInfo : la vraie puce de cloud-2 ; SwiftShader, llvmpipe, WebGL ou composition logiciels = LOGICIEL', async () => {
  const { renduDepuisSystemInfo } = await import('../src/navigateur.js');
  const r = renduDepuisSystemInfo(INFO_CLOUD2, { le: 'L' });
  assert.equal(r.logiciel, false, 'video_encode logiciel ne compte pas'); assert.match(r.rendu, /RPL-S/); assert.equal(r.le, 'L'); assert.equal(r.source, 'navigateur');
  assert.equal(renduDepuisSystemInfo(INFO_STEEL).logiciel, true, 'SwiftShader (cloud-1)');
  assert.equal(renduDepuisSystemInfo({ gpu: { auxAttributes: { glRenderer: 'llvmpipe (LLVM 17.0.6, 256 bits)' }, featureStatus: { webgl: 'enabled', gpu_compositing: 'enabled' } } }).logiciel, true);
  assert.equal(renduDepuisSystemInfo({ gpu: { auxAttributes: { glRenderer: 'ANGLE (Intel, Mesa)' }, featureStatus: { webgl: 'unavailable_software', gpu_compositing: 'enabled' } } }).logiciel, true);
  assert.equal(renduDepuisSystemInfo({ gpu: { auxAttributes: { glRenderer: 'ANGLE (Intel, Mesa)' }, featureStatus: { webgl: 'enabled', gpu_compositing: 'disabled_software' } } }).logiciel, true);
  assert.equal(renduDepuisSystemInfo(null), null); assert.equal(renduDepuisSystemInfo({ gpu: { featureStatus: {} } }), null, 'puce pas encore lue');
});

test('service déclaré : apte seulement avec Chrome officiel, puce et rendu réel ; incapable sans eux ; rendu inconnu ≠ incapable', async () => {
  const { renduDepuisSystemInfo } = await import('../src/navigateur.js');
  const reel = renduDepuisSystemInfo(INFO_CLOUD2, { le: 'L' }); const logiciel = renduDepuisSystemInfo(INFO_STEEL);
  let s = serviceDuServeur({ config: { ...CHROME_PUCE, comptesAutorises: [NICO, 'pas-un-uuid'] }, rendu: reel });
  assert.deepEqual([s.apte, s.incapable, s.raisons], [true, false, []]); assert.deepEqual(s.comptes, [NICO], 'liste fermée, uuid seulement');
  assert.equal(s.rendu_le, 'L');
  assert.equal(serviceDuServeur({ config: CHROME_PUCE, rendu: reel }).comptes, 'tous', 'COMPTES_AUTORISES vide = tous');
  s = serviceDuServeur({ config: CHROME_PUCE, rendu: null });
  assert.deepEqual([s.apte, s.incapable, s.raisons], [false, false, ['rendu_inconnu']], 'juste après un démarrage : ne reçoit rien, garde ses comptes');
  s = serviceDuServeur({ config: CHROME_PUCE, rendu: logiciel });
  assert.deepEqual([s.apte, s.incapable, s.raisons], [false, true, ['rendu_logiciel']]);
  s = serviceDuServeur({ config: { moteurNavigateur: 'steel', navigateurGpu: false, comptesAutorises: ['00000000-0000-0000-0000-000000000000'] }, rendu: null });
  assert.deepEqual([s.apte, s.incapable], [false, true], 'cloud-1 : steel, sans puce');
  assert.deepEqual(s.raisons, ['moteur_sans_chrome_officiel', 'sans_puce', 'rendu_inconnu']);
  assert.equal(serviceDuServeur({ config: { ...CHROME_PUCE, navigateurGpu: false }, rendu: reel }).incapable, true, 'puce coupée');
});

test('battement : la déclaration part dans details.service — rendu du navigateur, sinon etat/rendu-serveur.json', async () => {
  const { renduDepuisSystemInfo } = await import('../src/navigateur.js');
  const reel = renduDepuisSystemInfo(INFO_CLOUD2, { le: 'L' });
  const conf = configFlotte({ ...CHROME_PUCE, comptesAutorises: [NICO], dossierEtat: '/etat' });
  let { base, rpc } = fausseBase({ serveurs: [] });
  let f = creerFlotte({ config: conf, base, navigateurs: { ouverts: () => [], dernierRendu: () => reel }, journal: journal(), alertes: null,
    hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false }, lireFichier: fichiers });
  await f.battre();
  let d = rpc.find(([n]) => n === 'cloud_serveur_battre')[1].p_details;
  assert.equal(d.service.apte, true); assert.deepEqual(d.service.comptes, [NICO]); assert.equal(d.capacite_auto, false, 'le reste du battement inchangé');
  ({ base, rpc } = fausseBase({ serveurs: [] }));
  const lus = [];
  f = creerFlotte({ config: conf, base, navigateurs: { ouverts: () => [] }, journal: journal(), alertes: null, hetzner: hetznerQuiRefuseTout(),
    cloudflare: { disponible: false }, lireFichier: (p) => { lus.push(p); return p === '/etat/rendu-serveur.json' ? Promise.resolve(JSON.stringify({ ...reel, source: 'verification_hors_reseau' })) : fichiers(p); } });
  await f.battre();
  d = rpc.find(([n]) => n === 'cloud_serveur_battre')[1].p_details;
  assert.equal(d.service.apte, true); assert.equal(d.service.rendu_source, 'verification_hors_reseau'); assert.ok(lus.includes('/etat/rendu-serveur.json'));
  ({ base, rpc } = fausseBase({ serveurs: [] }));
  f = creerFlotte({ config: conf, base, navigateurs: { ouverts: () => [] }, journal: journal(), alertes: null, hetzner: hetznerQuiRefuseTout(),
    cloudflare: { disponible: false }, lireFichier: fichiers });
  await f.battre();
  d = rpc.find(([n]) => n === 'cloud_serveur_battre')[1].p_details;
  assert.deepEqual([d.service.apte, d.service.incapable], [false, false], 'aucun rendu connu : ne reçoit rien, ne perd rien');
});

test('rendu d’un navigateur ouvert : un seul appel SystemInfo.getInfo, sans session de page ; une erreur = inconnu', async () => {
  const { lireRenduNavigateur } = await import('../src/navigateur.js');
  const appels = [];
  const r = await lireRenduNavigateur({ send: async (m, p, s) => { appels.push([m, p, s]); return INFO_CLOUD2; } });
  assert.equal(r.logiciel, false); assert.deepEqual(appels, [['SystemInfo.getInfo', undefined, undefined]], 'niveau navigateur : aucune page');
  assert.equal(await lireRenduNavigateur({ send: async () => { throw new Error('fermé'); } }), null);
  assert.equal(await lireRenduNavigateur({ send: () => { throw new Error('synchrone'); } }), null);
});

// ── (06/11 soir, décision de Nico) l'alerte de capacité réelle ──────────────────────────────────────────────────
test('capacité : seuil 80 % par défaut (07/11, décision 4 ; 65 avant) — comptes / capacité, puis mémoire, processeur, puce de la mesure fraîche', () => {
  const T0 = Date.parse('2026-11-07T08:00:00Z');
  const mesure = (o = {}, ilYa = 60_000) => ({ le: new Date(T0 - ilYa).toISOString(), hote: { mem_utilisee_max_pct: 30, cpu_moy_pct: 10, puce_moy_pct: 2, ...o } });
  assert.equal(SEUIL_CAPACITE_PCT, 80);
  let r = alerteCapacite({ comptes: 10, capacite: 15, mesure: mesure(), maintenant: T0 });
  assert.equal(r.atteint, false, '10 / 15 = 67 % : plus d’alerte (elle partait à 65 %)'); assert.equal(r.taux.comptes, 67); assert.equal(r.mesure_fraiche, true);
  r = alerteCapacite({ comptes: 24, capacite: 30, mesure: mesure(), maintenant: T0 });
  assert.deepEqual([r.atteint, r.raisons], [true, ['comptes 80 %']], '24 / 30 : l’alerte');
  r = alerteCapacite({ comptes: 23, capacite: 30, mesure: mesure(), maintenant: T0 });
  assert.equal(r.atteint, false, '23 / 30 = 77 %');
  r = alerteCapacite({ comptes: 3, capacite: 15, mesure: mesure({ mem_utilisee_max_pct: 81.2, puce_moy_pct: 80 }), maintenant: T0 });
  assert.deepEqual(r.raisons, ['memoire 81 %', 'puce 80 %'], 'la mesure réelle déclenche même avec peu de comptes');
  r = alerteCapacite({ comptes: 3, capacite: 15, mesure: mesure({ cpu_moy_pct: 90 }, 20 * 60_000), maintenant: T0 });
  assert.deepEqual([r.atteint, r.mesure_fraiche], [false, false], 'mesure de plus de 15 min : ignorée');
  r = alerteCapacite({ comptes: 3, capacite: 15, mesure: mesure({ cpu_moy_pct: 61 }), seuilPct: 60, maintenant: T0 });
  assert.deepEqual(r.raisons, ['processeur 61 %'], 'seuil réglable (coin_config cloud_capacite_alerte_pct)');
  assert.equal(alerteCapacite({ comptes: null, capacite: 0, mesure: null }).atteint, false, 'rien de connu : rien');
});

test('capacité dans le tour : une alerte (support@ par alertes.signaler), puis plus rien pendant 6 h ; sans table de mesures, rien ne casse', async () => {
  let t = Date.parse('2026-11-07T08:00:00Z');
  const mesureLigne = { le: new Date(t - 60_000).toISOString(), hote: { mem_utilisee_max_pct: 20, cpu_moy_pct: 5, puce_moy_pct: 1 } };
  const { base } = fausseBase({ serveurs: pleins, coin: { cloud_places_seuil: 0, cloud_capacite_alerte_pct: 65 }, places: 10 });
  const from = base.from;
  base.from = (table) => (table === 'cloud_mesures'
    ? { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [mesureLigne], error: null }) }) }) }) } : from(table));
  const alertes = []; const j = journal();
  const f = creerFlotte({ config: configFlotte({ navigateursMax: 4 }), base, navigateurs: { ouverts: () => [] }, journal: j,
    alertes: { signaler: async (n, texte, d) => alertes.push([n, texte, d]) }, hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false },
    lireFichier: fichiers, maintenant: () => t });
  await f.battre();   // la fausse base rend 3 comptes : 3 / 4 = 75 %
  await f.tour();
  const cap = alertes.filter(([, x]) => /^Capacité de cloud-1 : seuil de 65 % atteint — comptes 75 %/.test(x));
  assert.equal(cap.length, 1); assert.match(cap[0][1], /REPRISE\.md, « Ajouter un serveur »/); assert.equal(cap[0][0], 'serveur');
  assert.ok(j.l.some((x) => x[1] === 'capacite_seuil'));
  t += 3600_000; await f.tour();
  assert.equal(alertes.filter(([, x]) => /^Capacité/.test(x)).length, 1, 'pas de rappel avant 6 h');
  t += 5 * 3600_000; await f.tour();
  assert.equal(alertes.filter(([, x]) => /^Capacité/.test(x)).length, 2, 'rappel au bout de 6 h');
  const { base: sansTable } = fausseBase({ serveurs: pleins, coin: { cloud_places_seuil: 0 } });
  const g = creerFlotte({ config: configFlotte({ navigateursMax: 40 }), base: sansTable, navigateurs: { ouverts: () => [] }, journal: journal(),
    alertes: { signaler: async () => { throw new Error('aucune alerte attendue'); } }, hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false }, lireFichier: fichiers });
  await g.battre(); await g.tour();
});

// ── (06/11 soir, règle de Nico) passer de 15 à 30 comptes : l'alerte dit quand TOUTES les conditions sont réunies ──
const LIGNE_30 = { serveur: 'cloud-2', conditions_reunies: true, comptes_p20: 10, fenetres: 2000, mem_proj_p95_mo: 43500, total: 64076,
  cpu_proj_p95_pct: 45, puce_proj_p95_pct: 15, jobs: 120, rates: 3, duree_p95_s: 144, bride_med: 0.12, bride_med_reference: 0.1,
  signes_par_compte_jour: 0.994, signes_par_compte_jour_reference: 1.08 };

test('passage à 30 : le texte dit chaque chiffre de la règle ; rien si une condition manque ou si le serveur a déjà 30 places', () => {
  const t = textePassage30(LIGNE_30, 15);
  assert.match(t, /^Passage à 30 comptes possible sur cloud-2 \(aujourd'hui 15\)/);
  for (const m of [/mémoire projetée 42 Go \(68 %\)/, /processeur projeté 45 %/, /puce projetée 15 %/, /120 jobs, 3 % ratés, p95 144 s/,
    /signes 0\.994 par compte et par jour \(référence 1\.08\)/, /NAVIGATEURS_MAX=30/]) assert.match(t, m);
  assert.equal(textePassage30({ ...LIGNE_30, conditions_reunies: false }, 15), null);
  assert.equal(textePassage30(LIGNE_30, 30), null, 'déjà 30');
  assert.equal(textePassage30(null, 15), null, 'vue absente');
});

test('passage à 30 dans le tour : lu une fois par heure, une alerte puis un rappel au plus par 24 h ; rien au-delà de 30 places', async () => {
  let t = Date.parse('2026-11-14T08:00:00Z'); let lectures = 0; let ligne = { ...LIGNE_30, conditions_reunies: false };
  const { base } = fausseBase({ serveurs: pleins, coin: { cloud_places_seuil: 0 }, places: 10 });
  const from = base.from;
  base.from = (table) => (table === 'cloud_passage_30'
    ? { select: () => ({ eq: () => ({ limit: async () => { lectures++; return { data: [ligne], error: null }; } }) }) } : from(table));
  const alertes = [];
  const f = creerFlotte({ config: configFlotte({ navigateursMax: 15 }), base, navigateurs: { ouverts: () => [] }, journal: journal(),
    alertes: { signaler: async (n, texte) => alertes.push(texte) }, hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false },
    lireFichier: fichiers, maintenant: () => t });
  await f.battre(); await f.tour();
  assert.equal(lectures, 1); assert.equal(alertes.filter((x) => /^Passage à 30/.test(x)).length, 0, 'conditions non réunies : rien');
  ligne = LIGNE_30; t += 10 * 60_000; await f.tour();
  assert.equal(lectures, 1, 'pas relue avant une heure');
  t += 3600_000; await f.tour();
  assert.equal(lectures, 2); assert.equal(alertes.filter((x) => /^Passage à 30/.test(x)).length, 1);
  t += 3600_000; await f.tour();
  assert.equal(alertes.filter((x) => /^Passage à 30/.test(x)).length, 1, 'pas de rappel avant 24 h');
  t += 24 * 3600_000; await f.tour();
  assert.equal(alertes.filter((x) => /^Passage à 30/.test(x)).length, 2, 'rappel au bout de 24 h');
  const g = creerFlotte({ config: configFlotte({ navigateursMax: 30 }), base, navigateurs: { ouverts: () => [] }, journal: journal(),
    alertes: { signaler: async (n, texte) => alertes.push(texte) }, hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false },
    lireFichier: fichiers, maintenant: () => t });
  const avant = lectures; await g.battre(); await g.tour();
  assert.equal(lectures, avant, 'à 30 places, la vue n’est même plus lue');
});

// ── (07/11, décision 4 de Nico) LA CAPACITÉ MESURÉE : départ 15, elle monte seule jusqu'à 30 sur les mesures réelles ──
const MESURES = (o = {}) => ({ fenetres: 288, comptes_max: 1, mem_compte_p95_mo: 845, n_mem: 50, n_cpu: 833, n_puce: null, graves_7j: 0, oom: 0,
  derniere_le: '2026-11-07T13:47:07Z', ...o });

test('capacité mesurée (pure) : départ 15 ; +5 au plus au-dessus des comptes RÉELLEMENT mesurés ; plafond 30 et théorique ; jamais sous les comptes servis ; retenue sur un signe grave', () => {
  const C = { depart: 15, plafond: 30, theorique: 30, avance: 5 };
  let r = capaciteMesuree({ ...C, actuelle: 15, comptesServis: 1, mesures: MESURES() });
  assert.deepEqual([r.capacite, r.atteignable, r.raison], [15, 30, 'stable'], 'cloud-2 le 07/11 : 1 compte mesuré → 15 (le départ), 30 atteignables');
  r = capaciteMesuree({ ...C, actuelle: 15, comptesServis: 12, mesures: MESURES({ comptes_max: 12 }) });
  assert.deepEqual([r.capacite, r.raison], [17, 'mesures_hausse'], '12 vrais comptes mesurés : 17, sans geste');
  assert.equal(capaciteMesuree({ ...C, actuelle: 25, comptesServis: 28, mesures: MESURES({ comptes_max: 28 }) }).capacite, 30, 'jamais au-delà de 30');
  assert.equal(capaciteMesuree({ ...C, plafond: 40, theorique: 30, actuelle: 25, comptesServis: 28, mesures: MESURES({ comptes_max: 28 }) }).capacite, 30,
    'ni au-delà de la capacité théorique (mémoire / plafond d’un navigateur)');
  r = capaciteMesuree({ ...C, actuelle: 25, comptesServis: 20, mesures: MESURES({ comptes_max: 20, n_cpu: 22 }) });
  assert.deepEqual([r.capacite, r.atteignable, r.raison], [22, 22, 'mesures_baisse'], 'le processeur projeté borne à 22');
  r = capaciteMesuree({ ...C, actuelle: 15, comptesServis: 14, mesures: MESURES({ comptes_max: 14, n_mem: 12 }) });
  assert.deepEqual([r.capacite, r.atteignable], [14, 14], 'mémoire projetée 12 : la vente s’arrête, mais jamais sous les 14 comptes servis (aucun compte retiré)');
  r = capaciteMesuree({ ...C, actuelle: 15, comptesServis: 14, mesures: MESURES({ comptes_max: 14, graves_7j: 1 }) });
  assert.deepEqual([r.capacite, r.raison, r.retenue], [15, 'retenue_signes', true], 'une restriction ou un blocage sur 7 jours : aucune hausse');
  assert.equal(capaciteMesuree({ ...C, actuelle: 15, comptesServis: 14, mesures: MESURES({ comptes_max: 14, oom: 2 }) }).capacite, 15, 'un oom : aucune hausse');
  r = capaciteMesuree({ ...C, actuelle: 18, comptesServis: 3, mesures: MESURES({ fenetres: 100 }) });
  assert.deepEqual([r.capacite, r.raison], [18, 'mesures_insuffisantes'], 'moins de 12 h de mesures : rien ne bouge');
  assert.equal(capaciteMesuree({ ...C, actuelle: null, comptesServis: 0, mesures: null }).capacite, 15, 'aucune mesure (fonction absente) : le départ');
  assert.equal(capaciteMesuree({ ...C, actuelle: 15, comptesServis: 1, mesures: MESURES({ mem_compte_p95_mo: null }) }).raison, 'mesures_insuffisantes', 'aucun compte mesuré');
  assert.equal(capaciteMesuree({ ...C, theorique: 7, actuelle: null, comptesServis: 0, mesures: null }).capacite, 7, 'un petit hôte : la théorique borne le départ');
  assert.equal(capaciteMesuree({ ...C, actuelle: null, comptesServis: 20, mesures: null }).capacite, 20, 'redémarrage : jamais sous les comptes servis');
});

test('capacité AUTOMATIQUE dans la flotte : évaluée au démarrage puis chaque heure, déclarée au battement, dite à support@ quand elle change ; alerte à 80 % de l’atteignable ; jamais la vue passage_30', async () => {
  let t = Date.parse('2026-11-07T15:00:00Z');
  let m = MESURES();
  let comptesBattus = 1;
  let lecturesPassage = 0;
  const battements = [];
  const { base } = fausseBase({ serveurs: pleins, coin: { cloud_places_seuil: 0 } });
  const rpc = base.rpc; const from = base.from;
  base.rpc = async (nom, a) => {
    if (nom === 'cloud_serveur_battre') { battements.push(a); return { data: { comptes: comptesBattus, places: 0, places_libres: 0 }, error: null }; }
    if (nom === 'cloud_capacite_mesures') return { data: m, error: null };
    return rpc(nom, a);
  };
  base.from = (table) => (table === 'cloud_passage_30'
    ? { select: () => ({ eq: () => ({ limit: async () => { lecturesPassage++; return { data: [], error: null }; } }) }) } : from(table));
  const alertes = []; const j = journal();
  const f = creerFlotte({ config: configFlotte({ serveurNom: 'cloud-2', navigateursMax: 15, navigateursMaxAuto: true, capaciteDepart: 15, capacitePlafond: 30,
    capaciteTheorique: 30, capaciteAvance: 5 }), base, navigateurs: { ouverts: () => [] }, journal: j,
  alertes: { signaler: async (n, texte) => alertes.push(texte) }, hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false }, lireFichier: fichiers, maintenant: () => t });
  const e = await f.evaluerCapacite();
  assert.deepEqual([f.capacite(), e.atteignable, alertes.length], [15, 30, 0], 'au démarrage : 15, rien à dire');
  await f.battre();
  assert.equal(battements.at(-1).p_capacite, 15);
  assert.deepEqual(battements.at(-1).p_details.capacite, { raison: 'stable', atteignable: 30, depart: 15, plafond: 30 });
  m = MESURES({ comptes_max: 14 }); comptesBattus = 14;
  t += 10 * 60_000; await f.battre(); await f.tour();
  assert.equal(f.capacite(), 15, 'pas relue avant une heure');
  t += 3600_000; await f.tour();
  assert.equal(f.capacite(), 19, '14 vrais comptes : 19, sans aucun geste');
  assert.ok(alertes.some((x) => /^Capacité de cloud-2 : 15 → 19 comptes \(mesures_hausse ; mesurée atteignable 30, 14 comptes au plus sur 24 h, plafond 30\)\. Aucun geste à faire\./.test(x)), JSON.stringify(alertes));
  assert.ok(j.l.some((x) => x[1] === 'capacite_changee'));
  await f.battre();
  assert.equal(battements.at(-1).p_capacite, 19, 'le battement déclare la capacité mesurée (les places de la vente suivent)');
  assert.ok(!alertes.some((x) => /seuil de/.test(x)), '14 / 30 atteignables : aucune alerte de seuil');
  comptesBattus = 24; m = MESURES({ comptes_max: 24 });
  t += 3600_000; await f.battre(); await f.tour();
  assert.equal(f.capacite(), 29);
  assert.ok(alertes.some((x) => /^Capacité de cloud-2 : seuil de 80 % atteint — comptes 80 % \(24 comptes pour 30 mesurés atteignables, 29 ouverts à la vente\)\. Marche à suivre : docs\/cloud\/REPRISE\.md, « Ajouter un serveur » \(aucun serveur n'est commandé automatiquement\)\./.test(x)), JSON.stringify(alertes));
  assert.equal(lecturesPassage, 0, 'capacité mesurée : la vue passage_30 n’est jamais lue (la capacité monte seule)');
  // Capacité FIXE (NAVIGATEURS_MAX réglé) : aucune évaluation, comme avant.
  const g = creerFlotte({ config: configFlotte({ navigateursMax: 15, navigateursMaxAuto: false }), base, navigateurs: { ouverts: () => [] }, journal: journal(),
    alertes: { signaler: async () => {} }, hetzner: hetznerQuiRefuseTout(), cloudflare: { disponible: false }, lireFichier: fichiers, maintenant: () => t });
  assert.equal((await g.evaluerCapacite()).raison, 'fixe'); assert.equal(g.capacite(), 15);
});

test('aucun serveur n’est commandé seul : la création exige HETZNER_CREATION_AUTORISEE=1 ET coin_config cloud_serveurs_auto = 1 (prod : 0)', async () => {
  for (const [env, auto] of [[false, 0], [true, 0], [false, 1]]) {
    const { base } = fausseBase({ serveurs: pleins, coin: { cloud_places_seuil: 30, cloud_serveurs_auto: auto } });
    const hz = hetznerQuiRefuseTout();
    const f = creerFlotte({ config: configFlotte({ hetznerCreationAutorisee: env, navigateursMaxAuto: true, capaciteDepart: 15, capacitePlafond: 30 }), base,
      navigateurs: { ouverts: () => [] }, journal: journal(), alertes: { signaler: async () => {} }, hetzner: hz, cloudflare: { disponible: false },
      lireFichier: fichiers, empaqueter: async () => { throw new Error('jamais'); } });
    await f.battre();
    const r = await f.tour();
    assert.equal(hz.posts.length, 0, `env=${env} coin=${auto} : aucun POST Hetzner`);
    assert.equal(r.aBlanc, true);
  }
});
