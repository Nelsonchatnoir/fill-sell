// ═══════════════════════════════════════════════════════════════════════════
// VERROU « CAPACITÉ RÉELLE ET PALIERS DU CLOUD » (19/11/2026, décision de Nico : plus de plafond fixe à 30)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (19/11) : la capacité se calcule sur la consommation RÉELLE de chaque navigateur, au PIRE moment, en
// gardant TOUJOURS 20 % de mémoire libre et une marge sur le processeur et la puce ; elle monte par PALIERS (+5) quand les
// mesures restent saines au palier atteint, comptée sur les comptes SERVIS ; elle redescend TOUT DE SUITE et ferme les
// ventes au premier signe grave, sans jamais couper un client déjà servi ; un mail à Nico à l'approche de la limite, une
// fois par incident ; plus de plafond fixe (CAPACITE_PLAFOND 30), plus de borne à 2 Go par navigateur.
// Le défaut (avant ce correctif, flotte.js capaciteMesuree du 07/11) : capacité = min(30, ⌊(64 Go − socle) / 2 Go⌋ = 30,
// projection au 5e centile sur la mémoire du CONTENEUR, cache compris, 70 %) et jamais plus de 5 au-dessus des comptes
// OUVERTS (12 → 17) alors que les places se comptent par compte SERVI (15) ; un signe grave ne faisait que retenir la
// hausse (aucune fermeture), à la réévaluation horaire seulement ; l'alerte de capacité n'envoyait aucun mail.
// Chiffres réels (cloud-2, lus le 19/11 vers 12:15, Paris) : 64 076 Mo ; pire moment 12 282 Mo utilisés avec 12
// navigateurs ; mémoire non récupérable au pire moment de chaque compte : 95e centile 1 294 Mo, max 1 310 ; hôte 1 277 Mo
// par navigateur ; processeur p95 au pire 3,9 % ; puce 15,2 % (11 navigateurs) — limite réelle 39 (mémoire, 7 jours).
//   npm run selftest:cloud-capacite-paliers
import test from 'node:test';
import assert from 'node:assert/strict';

const F = await import('../serveur-cloud/src/flotte.js');
const exiger = (nom) => {
  if (typeof F[nom] !== 'function') {
    assert.fail(`flotte.js n'exporte pas ${nom} : la capacité vient encore de capaciteMesuree du 07/11 (plafond 30, 2 Go par navigateur, +5 au-dessus des OUVERTS)`);
  }
  return F[nom];
};

const T0 = Date.parse('2026-11-20T11:00:00Z');   // 12:00, Paris
const H = 3600_000;
const TOTAL = 64_076;

/** Une semaine de fenêtres de 5 min comme cloud-2 le 19/11 (le pire moment : 12 282 Mo à 12 navigateurs). */
function semaine({ fin = T0, heures = 168, n = 12, utilisee = 12_282, cpu = 3.9, puce = 15.2, pire = {} } = {}) {
  const detail = [];
  for (let t = fin - heures * H + 5 * 60_000; t <= fin; t += 5 * 60_000) {
    detail.push([Math.floor(t / 1000), n, utilisee - 1500, 1.5, 2.0, 0, 0]);
  }
  detail[Math.floor(detail.length / 2)] = [detail[Math.floor(detail.length / 2)][0], n, utilisee, cpu, puce, 0, 0];
  for (const [age, f] of Object.entries(pire)) {
    const t = Math.floor((fin - Number(age) * H) / 1000);
    const i = detail.findIndex((d) => d[0] >= t);
    detail[i] = [detail[i][0], f.n ?? n, f.utilisee ?? utilisee - 1500, f.cpu ?? 1.5, f.puce ?? 2, f.oom ?? 0, f.graves ?? 0];
  }
  return { fenetres: detail.length, comptes_max: n, mem_total_mo: TOTAL, mem_compte_p95_mo: 1923, n_mem: 26, n_cpu: 287, n_puce: 176,
    oom: 0, graves_7j: 0, conso_compte_pire_mo: 1294, conso_compte_max_mo: 1310, conso_hote_pire_mo: 1277, detail, detail_v: 1,
    derniere_le: new Date(fin).toISOString() };
}

test('1. pas de plafond 30, pas de borne à 2 Go : la limite vient de la conso RÉELLE au pire moment (42 sur ces mesures ; 39 sur cloud-2 le 19/11), pas 30', () => {
  const capaciteReelle = exiger('capaciteReelle');
  const r = capaciteReelle(semaine());
  // 12 + (64 076 − 12 816 − 12 282) / 1 294 = 42,1 ; la puce : 11 × 60 / 15,2 au pire (= 12 × 60 / 15,2 ici : 47).
  assert.equal(r.source, 'reelle');
  assert.equal(r.conso_mo, 1294, 'conso = la plus grande de (p95 des comptes au pire moment, hôte par navigateur)');
  assert.deepEqual([r.n_mem, r.n_puce, r.atteignable], [42, 47, 42], JSON.stringify(r));
  assert.ok(r.atteignable > 30, 'au-delà de 30 quand les mesures le permettent');
  const capaciteMesuree = exiger('capaciteMesuree');
  const c = capaciteMesuree({ depart: 15, theorique: 30, palier: 5, actuelle: 30, comptesServis: 29, mesures: semaine(), maintenant: T0 });
  assert.deepEqual([c.capacite, c.raison], [42, 'suit_la_memoire'], `(20/11 soir) 30 places, 29 servis : la limite de la mémoire mesurée tout de suite (42), plus de palier — ${JSON.stringify(c)}`);
  assert.equal(F.BORNE_SECURITE, 250, 'la seule borne fixe : 250 (le réseau /24 des navigateurs)');
  assert.equal(capaciteReelle({ ...semaine({ cpu: 0.1, puce: 0.1 }), conso_compte_pire_mo: 100, conso_hote_pire_mo: 100 }).atteignable, 250, 'une mesure aberrante ne passe pas la borne de sécurité');
});

test('2. réserve de 20 % : toujours au moins 20 % de mémoire libre (et 6 Gio au moins) ; sous la réserve = signe grave', () => {
  const capaciteReelle = exiger('capaciteReelle');
  const signesGraves = exiger('signesGraves');
  assert.equal(F.reserveMemoireMo(TOTAL), 12_816, '20 % de 64 076 Mo');
  assert.equal(F.reserveMemoireMo(16_000), 6144, 'un petit hôte : 6 Gio au moins (règle du 06/11)');
  // À la limite (42 navigateurs à 1 294 Mo de plus chacun), il reste 20 % libres — jamais moins.
  const r = capaciteReelle(semaine());
  const utiliseeALaLimite = 12_282 + (r.atteignable - 12) * 1294;
  assert.ok(TOTAL - utiliseeALaLimite >= 0.2 * TOTAL, `${TOTAL - utiliseeALaLimite} Mo libres à ${r.atteignable} comptes`);
  assert.ok(TOTAL - (utiliseeALaLimite + 1294) < 0.2 * TOTAL, 'un compte de plus passerait sous la réserve');
  // Une fenêtre où la mémoire disponible passe sous 20 % : grave.
  assert.deepEqual(signesGraves({ n: 30, utilisee: TOTAL - 12_000, cpu: 5, puce: 5, oom: 0, graves: 0 }, TOTAL), ['memoire_sous_reserve']);
  assert.deepEqual(signesGraves({ n: 30, utilisee: TOTAL - 13_000, cpu: 5, puce: 5, oom: 0, graves: 0 }, TOTAL), [], '13 Go libres : sain');
  assert.deepEqual(signesGraves({ n: 12, utilisee: 12_282, cpu: 95, puce: 92, oom: 1, graves: 2 }, TOTAL),
    ['processeur_sature', 'puce_saturee', 'oom', 'restriction_ou_blocage']);
});

test('3. (20/11 soir, Nico : point 1c du 19/11 mené au bout) la capacité SUIT la limite de la MÉMOIRE mesurée, tout de suite ; plus aucun palier', () => {
  const capaciteMesuree = exiger('capaciteMesuree');
  const C = { depart: 15, theorique: 30, palier: 5, mesures: semaine(), maintenant: T0 };
  // Le cas du 20/11 : 19 places, 15 servis, limite atteignable 35 — « palier_non_atteint » gardait 19.
  let r = capaciteMesuree({ ...C, actuelle: 19, comptesServis: 15, palierLe: T0 - 2 * H });
  assert.deepEqual([r.capacite, r.raison], [42, 'suit_la_memoire'], 'la limite mesurée (42), même avec 4 places libres, même 2 h après un changement');
  r = capaciteMesuree({ ...C, actuelle: 17, comptesServis: 15, palierLe: null });
  assert.equal(r.capacite, 42, 'au déploiement : la limite mesurée');
  r = capaciteMesuree({ ...C, actuelle: 42, comptesServis: 42, palierLe: T0 - 25 * H });
  assert.deepEqual([r.capacite, r.raison], [42, 'limite_reelle'], 'à la limite : elle y reste');
  assert.ok(capaciteMesuree({ ...C, actuelle: 19, comptesServis: 15 }).capacite > 30, 'au-delà de 30 quand la mémoire le permet (jamais le plafond « théorique »)');
  // La mémoire est le SEUL frein : une limite du processeur ou de la puce plus basse ne la retient pas (la saturation reste
  // un signe grave, qui bloque — test 4).
  const puceBasse = semaine({ puce: 40 });
  r = capaciteMesuree({ ...C, mesures: puceBasse, actuelle: 19, comptesServis: 15 });
  assert.equal(r.capacite, r.reelle.n_mem, `puce plus basse (${r.reelle.n_puce}) : la capacité reste celle de la mémoire (${r.reelle.n_mem})`);
  // Mesures insuffisantes : rien ne bouge.
  r = capaciteMesuree({ ...C, mesures: { ...semaine(), fenetres: 10 }, actuelle: 19, comptesServis: 15 });
  assert.deepEqual([r.capacite, r.raison], [19, 'mesures_insuffisantes']);
  // Avant la migration 20261119170000 (anciennes clés seulement) : la même règle sur la limite mémoire prudente.
  const { detail, conso_compte_pire_mo, conso_hote_pire_mo, ...ancien } = semaine();
  r = capaciteMesuree({ ...C, mesures: ancien, actuelle: 17, comptesServis: 15, palierLe: null });
  assert.deepEqual([r.capacite, r.reelle.source], [Math.min(r.reelle.n_mem, 250), 'ancienne'], 'sans la migration : la limite mémoire des anciennes clés');
});

test('4. signe grave → capacité = comptes servis, IMMÉDIATEMENT (ventes fermées), 24 h ; puis reprise par paliers', () => {
  const capaciteMesuree = exiger('capaciteMesuree');
  const C = { depart: 15, theorique: 30, palier: 5, actuelle: 27, comptesServis: 21, palierLe: T0 - 48 * H, maintenant: T0 };
  for (const [nom, f] of [['oom', { oom: 1 }], ['restriction', { graves: 1 }], ['mémoire sous la réserve', { utilisee: TOTAL - 10_000 }],
    ['processeur saturé', { cpu: 96 }]]) {
    const r = capaciteMesuree({ ...C, mesures: semaine({ pire: { 2: f } }) });
    assert.deepEqual([r.capacite, r.raison, r.bloquee], [21, 'bloquee_signe_grave', true], `${nom} il y a 2 h : 27 → 21 (les servis)`);
  }
  const r = capaciteMesuree({ ...C, mesures: semaine({ pire: { 30: { oom: 1 } } }) });
  assert.equal(r.bloquee, false, 'un oom d’il y a 30 h ne bloque plus');
  const apres = capaciteMesuree({ ...C, actuelle: 21, mesures: semaine({ pire: { 25: { graves: 1 } } }), palierLe: T0 - 25 * H });
  assert.deepEqual([apres.capacite, apres.raison], [42, 'suit_la_memoire'], '(20/11 soir) 24 h après le dernier signe grave : la limite mesurée revient');
  // Le signe gardé (vu au battement, relu au démarrage) bloque aussi sans le détail.
  const garde = capaciteMesuree({ ...C, mesures: semaine(), graveLe: T0 - H });
  assert.equal(garde.capacite, 21);
});

test('5. jamais sous les comptes servis : aucun client déjà servi n’est coupé', () => {
  const capaciteMesuree = exiger('capaciteMesuree');
  const C = { depart: 15, theorique: 30, palier: 5, maintenant: T0 };
  assert.equal(capaciteMesuree({ ...C, actuelle: 22, comptesServis: 20, mesures: semaine({ utilisee: 50_000 }) }).capacite, 20,
    'limite réelle effondrée (mémoire) : la vente s’arrête, les 20 servis restent');
  assert.equal(capaciteMesuree({ ...C, actuelle: 22, comptesServis: 24, mesures: semaine({ pire: { 1: { oom: 1 } } }) }).capacite, 24, 'bloquée : = les 24 servis');
  assert.equal(capaciteMesuree({ ...C, actuelle: null, comptesServis: 20, mesures: null }).capacite, 20, 'aucune mesure : jamais sous les servis');
});

// ── Le branchement : la flotte bloque au battement, reprend ses paliers au démarrage, écrit un mail par incident ──
function fausseBase({ mesures, derniere = null, ligne = null, comptes = 15, monitor = [] } = {}) {
  const appels = [];
  const etat = { comptes, monitor, mails: [], pool: [] };
  const q = (table) => {
    const st = { op: 'select', filtres: [], payload: null, unique: false };
    const exec = () => {
      if (table === 'cloud_mesures') return { data: derniere ? [derniere] : [], error: null };
      if (table === 'cloud_serveurs') return { data: ligne ? [ligne] : [], error: null };
      if (table === 'coin_config') return { data: [{ key: 'cloud_places_seuil', value: 0 }], error: null };
      if (table === 'cloud_pool_alertes') { if (st.op === 'insert') etat.pool.push(st.payload); return { data: null, error: null }; }
      if (table === 'monitor_state') {
        const ok = (r) => st.filtres.every(([c, v]) => r[c] === v);
        if (st.op === 'select') { const r = etat.monitor.find(ok); return { data: st.unique ? (r ? { ...r } : null) : etat.monitor.filter(ok), error: null }; }
        if (st.op === 'upsert') {
          if (etat.monitor.some((r) => r.platform === st.payload.platform && r.signature === st.payload.signature)) return { data: [], error: null };
          const r = { id: etat.monitor.length + 1, ...st.payload }; etat.monitor.push(r); return { data: [{ id: r.id }], error: null };
        }
        if (st.op === 'update') { const rs = etat.monitor.filter(ok); rs.forEach((r) => Object.assign(r, st.payload)); return { data: rs.map((r) => ({ id: r.id })), error: null }; }
      }
      return { data: [], error: null };
    };
    const b = {
      select() { return b; }, insert(p) { st.op = 'insert'; st.payload = p; return b; }, upsert(p) { st.op = 'upsert'; st.payload = p; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; }, eq(c, v) { st.filtres.push([c, v]); return b; }, in() { return b; },
      lt() { return b; }, order() { return b; }, limit() { return b; }, maybeSingle() { st.unique = true; return b; },
      then(ok, ko) { return Promise.resolve().then(exec).then(ok, ko); },
    };
    return b;
  };
  const base = {
    appels, etat,
    rpc: async (nom, a) => {
      appels.push([nom, a]);
      if (nom === 'cloud_capacite_mesures') return { data: mesures, error: null };
      if (nom === 'cloud_comptes_du_serveur') return { data: Array.from({ length: etat.comptes }, (_, i) => ({ user_id: `u${i}` })), error: null };
      if (nom === 'cloud_serveur_battre') return { data: { comptes: etat.comptes, places: Math.max(0, a.p_capacite - etat.comptes), places_libres: Math.max(0, a.p_capacite - etat.comptes) }, error: null };
      if (nom === 'envoyer_mail_ponctuel') { etat.mails.push(a); return { data: { ok: true }, error: null }; }
      return { data: null, error: null };
    },
    from: q,
  };
  return base;
}
const CONFIG = { serveurNom: 'cloud-2', domaine: 'cloud-2.fillsell.app', navigateursMaxAuto: true, navigateursMax: 15, capaciteDepart: 15,
  capacitePlafond: 30, capaciteTheorique: 30, capaciteAvance: 5, memoireNavigateur: '2g', moteurNavigateur: 'chrome', navigateurGpu: true,
  comptesAutorises: [], alertesMail: true, alertesDestinataire: 'support@fillsell.app' };
const journal = () => { const l = []; return { l, info: (e, d) => l.push(['info', e, d]), alerte: (e, d) => l.push(['alerte', e, d]), erreur: (e, d) => l.push(['erreur', e, d]) }; };
/** L'horloge de l'essai pour TOUT (flotte, alertes.js, alertes-nico.js lisent Date.now()). */
async function avecHorloge(t, f) { const vrai = Date.now; Date.now = () => t.v; try { return await f(); } finally { Date.now = vrai; } }
const flotte = (base, { t, alertes, j = journal() }) => F.creerFlotte({ config: CONFIG, base, navigateurs: { ouverts: () => [], dernierRendu: () => null }, journal: j,
  alertes, hetzner: { disponible: false }, cloudflare: { disponible: false }, lireFichier: async () => { throw new Error('absent'); }, maintenant: () => t.v });

test('6. flotte : au démarrage, capacité et palier REPRIS de cloud_serveurs ; le battement déclare palier_le et ne descend jamais sous les servis', async () => {
  const t = { v: T0 };
  const base = fausseBase({ mesures: semaine(), ligne: { nom: 'cloud-2', capacite: 22, details: { capacite: { palier_le: new Date(T0 - 2 * H).toISOString() } } }, comptes: 21 });
  const f = flotte(base, { t, alertes: { signaler: async () => ({}) } });
  await f.evaluerCapacite();
  assert.deepEqual([f.capacite(), f.etatCapacite().raison], [42, 'suit_la_memoire'], '(20/11 soir) au démarrage : la limite mesurée, sans attendre');
  await f.battre();
  const d = base.appels.filter(([n]) => n === 'cloud_serveur_battre').at(-1)[1];
  assert.equal(d.p_capacite, 42);
  assert.equal(typeof d.p_details.capacite.palier_le, 'string', 'palier_le déclaré au battement (relu au prochain démarrage)');
  assert.equal(d.p_details.capacite.plafond, undefined, 'plus de plafond déclaré');
  base.etat.comptes = 23;   // une vente arrivée entre deux battements
  await f.battre();
  assert.ok(f.capacite() >= 23, 'jamais sous les comptes servis');
});

test('7. flotte : premier signe grave dans la dernière fenêtre → bloquée aux servis AU BATTEMENT (sans attendre l’heure) ; mail à Nico UNE fois par incident', async () => {
  const { creerAlertes, chargerRegleNico } = await import('../serveur-cloud/src/alertes.js');
  const regle = await chargerRegleNico();
  assert.equal(regle.decisionMail(F.ALERTE_CAPACITE ?? 'orchestrateur.capacite_limite').mail, true,
    'l’alerte de capacité envoie un mail (liste fermée, alertes-nico.js) — avant : « orchestrateur.autre », journal seulement');
  const t = { v: T0 };
  await avecHorloge(t, async () => {
  const fenetre = (age, f = {}) => ({ le: new Date(T0 - age).toISOString(), hote: { navigateurs_max: 20, mem_total_mo: TOTAL, mem_dispo_min_mo: 40_000,
    cpu_p95_pct: 3, puce_p95_pct: 3, ...f.hote }, comptes: { a: { oom: 0, signes: { restriction: 0, blocage: 0 } }, ...f.comptes } });
  const base = fausseBase({ mesures: semaine(), ligne: { nom: 'cloud-2', capacite: 27, details: { capacite: { palier_le: new Date(T0 - 30 * H).toISOString() } } },
    comptes: 21, derniere: fenetre(60_000) });
  const j = journal();
  const alertes = creerAlertes({ config: CONFIG, base, journal: j, regle });
  const f = flotte(base, { t, alertes, j });
  await f.evaluerCapacite();
  await f.battre();
  assert.equal(f.capacite(), f.etatCapacite().n_mem, `(20/11 soir) tout est sain : la limite de la mémoire mesurée (${f.etatCapacite().n_mem})`);
  // La fenêtre suivante porte un blocage de plateforme.
  base.etat.monitor.length = 0;
  t.v += 5 * 60_000;
  const grave = fenetre(30_000, { comptes: { b: { oom: 0, signes: { restriction: 0, blocage: 1 } } } });
  grave.le = new Date(t.v - 30_000).toISOString();
  base.from = ((avant) => (table) => (table === 'cloud_mesures' ? { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [grave], error: null }) }) }) }) } : avant(table)))(base.from);
  await f.battre();
  const dernier = base.appels.filter(([n]) => n === 'cloud_serveur_battre').at(-1)[1];
  assert.deepEqual([f.capacite(), dernier.p_capacite, f.etatCapacite().bloquee], [21, 21, true], 'bloquée aux 21 servis dès ce battement');
  assert.equal(base.etat.mails.length, 1, 'un mail à Nico');
  assert.match(base.etat.mails[0].p_sujet, /BLOQUÉE à 21 comptes/);
  // Un compte part pendant le blocage : la place ne rouvre pas.
  base.etat.comptes = 20;
  t.v += 60_000; await f.battre();
  assert.equal(base.appels.filter(([n]) => n === 'cloud_serveur_battre').at(-1)[1].p_capacite, 20, 'bloquée : la capacité suit les servis, aucune place ne rouvre');
  // Le même incident : un 2e signe grave 10 min plus tard (autre fenêtre, autre texte), puis le tour : aucun second mail.
  t.v += 10 * 60_000;
  grave.le = new Date(t.v - 30_000).toISOString();
  await f.battre();
  assert.equal(j.l.filter((x) => x[1] === 'capacite_bloquee').length, 2, 'le 2e signe grave est bien vu et dit');
  t.v += 2 * H; await f.tour(); await f.battre();
  assert.equal(base.etat.mails.length, 1, 'le même incident : aucun second mail');
  assert.ok(base.etat.pool.length >= 2, 'chaque signal reste au journal (cloud_pool_alertes)');
  });
});

test('8. flotte : à 80 % de la limite réelle, UN mail « décider d’un 2e serveur » ; résolu 10 points dessous ; un nouvel incident = un nouveau mail', async () => {
  const { creerAlertes, chargerRegleNico } = await import('../serveur-cloud/src/alertes.js');
  const regle = await chargerRegleNico();
  const t = { v: T0 };
  await avecHorloge(t, async () => {
  const base = fausseBase({ mesures: semaine(), ligne: { nom: 'cloud-2', capacite: 37, details: { capacite: { palier_le: new Date(T0 - 2 * H).toISOString() } } }, comptes: 35 });
  const alertes = creerAlertes({ config: CONFIG, base, journal: journal(), regle });
  const f = flotte(base, { t, alertes });
  await f.evaluerCapacite(); await f.battre(); await f.tour();
  assert.equal(f.etatCapacite().atteignable, 42);
  assert.equal(base.etat.mails.length, 1, '35 servis / 42 réels = 83 % : un mail');
  assert.match(base.etat.mails[0].p_html, /Décider d&#39;un 2e serveur|Décider d'un 2e serveur/);
  t.v += 7 * H; await f.battre(); await f.tour();
  assert.equal(base.etat.mails.length, 1, 'toujours au-dessus 7 h après : rien de plus (une fois par incident)');
  base.etat.comptes = 30;   // 71 % : sous 80, pas sous 70 → l'incident reste ouvert
  t.v += 10 * 60_000; await f.battre(); await f.tour();
  base.etat.comptes = 35;
  t.v += 7 * H; await f.battre(); await f.tour();
  assert.equal(base.etat.mails.length, 1, 'un taux qui oscille autour du seuil ne renvoie pas de mail');
  base.etat.comptes = 25;   // 60 % : résolu
  t.v += 10 * 60_000; await f.battre(); await f.tour();
  base.etat.comptes = 35;
  t.v += 2 * H; await f.battre(); await f.tour();
  assert.equal(base.etat.mails.length, 2, 'résolu puis revenu : un nouvel incident, un nouveau mail');
  });
});
