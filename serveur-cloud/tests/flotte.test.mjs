// (03/11, points 1 et 5 de Nico) LA FLOTTE : capacité automatique, places, attribution d'un compte à un serveur,
// montée en charge préparée « à blanc » (rien n'est créé sans les deux interrupteurs), repli avant la migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capaciteServeur, planFlotte, prochainNomServeur, domaineDuServeur, typeDepuisCode, lieuDepuisCode, envPourNouveauServeur,
  amorcePour, cloudInitPour, corpsCreationHetzner, resumePlan, lireComptesDuServeur, creerFlotte, USER_DATA_MAX,
  CREATION_EN_COURS_MS,
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
