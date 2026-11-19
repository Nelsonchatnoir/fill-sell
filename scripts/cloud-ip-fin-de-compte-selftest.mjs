// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU 19/11/2026 (demande de Nico : « IP du Cloud : tout nettoyer, aucune IP payée en trop ») — rouge avant, vert après
//     node scripts/cloud-ip-fin-de-compte-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Constat (prod, 19/11) : les IP de deux essais finis tenues 48 h ; la 2e IP du compte de Nico réservée jusqu'à son
// échéance et promise au renouvellement (« réservée = toujours renouvelée ») ; une IP attribuée renouvelée à J-3 sans
// regarder si son compte vit encore à l'échéance ; l'alerte du solde comptait les IP des comptes finis (« 3 IP de
// client(s) … 12.00 $ » pour une seule due) et ne disait ni les clients refusés ni le vrai montant ; « Achat d'IP NON
// FAIT » et « stock vide sans personne qui attend » n'allaient qu'au journal ; la vente disait « complet » faute d'IP.
// Ce verrou prouve, règle par règle (la base porte les mêmes : migration 20261119190000, banc jetable à part) :
//   FIN D'ESSAI (actionCompte, miroir de cloud_compte_synchroniser_pool) · RÉSILIATION · RENOUVELLEMENT (planDuJour,
//   titulaires) · RÉSERVATION (la 39) · SOLDE (seuilSoldeProjete + couvertureSolde) · ACHAT (mail une fois par incident,
//   montant, clients refusés) · STOCK VIDE · GARDE DE LA VENTE (« ip_en_preparation » à l'écran).
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const importer = (p) => import(pathToFileURL(join(ROOT, p)).href);
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); } };
const essayer = async (m, f) => { try { await f(); } catch (e) { ok(false, m, e?.stack ?? e); } };

const R = await importer('supabase/functions/_shared/cloud-pool.js');
const N = await importer('supabase/functions/_shared/alertes-nico.js');
const A = await importer('serveur-cloud/src/approvisionnement.js');
const F = await importer('serveur-cloud/src/fournisseurIp.js');
const H = 3_600_000, J = 86_400_000;
const now = Date.parse('2026-11-19T11:00:00Z');
const iso = (ms) => new Date(now + ms).toISOString();
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ── 1. FIN D'ESSAI ET RÉSILIATION (actionCompte = cloud_compte_synchroniser_pool) ───────────────────────────────────
console.log('1. Fin d\'essai, résiliation');
await essayer('1. fin d\'essai', async () => {
  const fini = (h, extra = {}) => ({ etat: 'essai_termine', actif: false, essaiArrete: false, essaiFin: iso(-h * H), ...extra });
  const ipEssai = { id: 1, etat: 'attribuee_essai' }, ipClient = { id: 2, etat: 'attribuee_client' };
  const act = (etat, ip, profil) => R.actionCompte({ etat, ip, profil, maintenant: now }).action;
  ok(act(fini(1), ipEssai, { arretFinPeriode: true, canal: 'apple' }) === 'repos', 'essai Apple au renouvellement COUPÉ, fini il y a 1 h : l\'IP part au repos (avant : 48 h de grâce)');
  ok(act(fini(1), ipEssai, { arretFinPeriode: true, canal: 'google' }) === 'repos', 'essai Google au renouvellement coupé : repos');
  ok(act(fini(3), ipEssai, { arretFinPeriode: false, canal: 'stripe' }) === 'repos', 'essai Stripe jamais converti (annulé), fini il y a 3 h : repos');
  ok(act(fini(0.5), ipEssai, { arretFinPeriode: false, canal: 'stripe' }) === 'grace', 'essai Stripe jamais converti fini il y a 30 min : 2 h de grâce (message de Stripe en retard)');
  ok(act(fini(5), ipClient, { arretFinPeriode: false, canal: 'stripe' }) === 'repos', 'compte payé puis arrêté (IP convertie : résilié, remboursé, impayé), 5 h après la fin d\'essai : repos (décision de Nico du 19/11, avant : 48 h)');
  ok(act(fini(5), ipClient, { arretFinPeriode: false, canal: 'apple' }) === 'repos', 'le même par Apple : repos');
  ok(act(fini(5), ipEssai, { arretFinPeriode: false, canal: 'apple' }) === 'grace', 'essai Apple NON coupé, fini il y a 5 h : 2 jours de grâce (1er paiement attendu)');
  ok(act(fini(49), ipEssai, { arretFinPeriode: false, canal: 'apple' }) === 'repos', 'le même après 49 h : repos');
  ok(act(fini(1, { essaiArrete: true }), ipEssai, { canal: 'apple' }) === 'repos', 'essai arrêté : repos tout de suite');
  ok(act({ etat: 'essai_termine', actif: false, essaiArrete: false, essaiFin: iso(-33 * J) }, ipClient, { canal: 'apple', arretFinPeriode: true }) === 'repos',
    'résiliation arrivée à terme (client, période finie) : repos');
  ok(act({ etat: 'aucun', actif: false }, ipClient, null) === 'repos', 'compte supprimé (état « aucun ») : repos');
  ok(act({ etat: 'paye', actif: true }, ipClient, { canal: 'stripe' }) === 'rien', 'client actif : il garde son IP');
  ok(R.PARAMETRES.graceJours === 2 && R.PARAMETRES.graceStripeHeures === 2, `les durées, réglables en base : cloud_grace_jours ${R.PARAMETRES.graceJours} j, cloud_grace_stripe_heures ${R.PARAMETRES.graceStripeHeures} h`);
});

// ── 2. RENOUVELLEMENT : seulement l'IP d'un compte actif à son échéance ─────────────────────────────────────────────
console.log('2. Renouvellement');
// Le pool du 19/11 (à J-3 de chaque échéance), comptes de banc.
const ip = (id, etat, user, expireJ, extra = {}) => ({ id, commande: `c${id}`, etat, user_id: user, dernier_user_id: user, expire_le: iso(expireJ * J),
  attributions: 1, refus: {}, sante: { verdict: 'saine', saine_le: iso(-H) }, ...extra });
const pool = [
  ip(3, 'attribuee_client', U(3), 2.5),              // client payant (Apple) : à renouveler
  ip(2, 'attribuee_client', U(2), 2.5),              // compte résilié, encore titulaire (avant le passage de l'entretien)
  ip(4, 'attribuee_essai', U(4), 2.5),               // essai fini (en grâce)
  ip(83, 'attribuee_essai', U(83), 2.5),             // essai au renouvellement coupé qui finit AVANT l'échéance
  ip(40, 'attribuee_essai', U(40), 2.5),             // essai non coupé : il deviendra client
  ip(42, 'attribuee_client', U(42), 2.5),            // compte offert (Nico)
  ip(39, 'disponible', null, 2.5, { reserve_pour: U(42), reserve_jusqu_au: iso(2.5 * J), refus: { beebs: { cause: 'restreint', le: iso(-15 * J) } }, sante: null }),
  ip(86, 'disponible', null, 30), ip(87, 'disponible', null, 30), ip(88, 'disponible', null, 30),
];
const titulaires = new Map([
  [3, { actif: true, fin: null }], [2, { actif: false, fin: iso(0) }], [4, { actif: false, fin: iso(0) }],
  [83, { actif: true, fin: iso(-2 * J + 4 * J) }], [40, { actif: true, fin: null }], [42, { actif: true, fin: null }],
]);
await essayer('2. renouvellement', async () => {
  const p = R.planDuJour({ ips: pool, lambda: 1, marge: 2, enAttente: 0, sainesSeulement: true, titulaires, maintenant: now });
  const r = new Set(p.renouveler.map(Number));
  ok(r.has(3) && r.has(42) && r.has(40), 'renouvelées : le client payant, le compte offert, l\'essai non coupé', JSON.stringify(p.renouveler));
  ok(!r.has(2) && !r.has(4), 'JAMAIS renouvelée : l\'IP d\'un compte fini (résilié, essai fini en grâce)', JSON.stringify(p.raisons));
  ok(!r.has(83), 'JAMAIS renouvelée : l\'IP d\'un essai au renouvellement coupé qui finit avant l\'échéance', JSON.stringify(p.raisons[83]));
  ok(!r.has(39), 'JAMAIS renouvelée : la 2e IP réservée à un compte qui tient déjà la sienne (la 39)', JSON.stringify(p.raisons[39]));
  ok(r.size === 3, `3 renouvellements en tout (${[...r].join(', ')})`);
  const sans = R.planDuJour({ ips: pool, lambda: 1, marge: 2, enAttente: 0, sainesSeulement: true, maintenant: now });
  ok([2, 3, 4, 40, 42, 83].every((id) => sans.renouveler.map(Number).includes(id)), 'titulaires illisibles : toute IP attribuée se renouvelle (jamais couper un client sur un doute)');
  const grillee = pool.map((x) => (x.id === 39 ? { ...x, sante: { verdict: 'grillee', grillee_le: iso(-J) } } : x));
  ok(!R.planDuJour({ ips: grillee, lambda: 1, marge: 2, sainesSeulement: true, titulaires, maintenant: now }).renouveler.map(Number).includes(39), 'une IP grillée réservée n\'est pas renouvelée non plus');
  const avant = R.planDuJour({ ips: pool, lambda: 1, marge: 2, sainesSeulement: false, titulaires, maintenant: now });
  ok(!avant.renouveler.map(Number).includes(39) && !avant.renouveler.map(Number).includes(2), 'règle « saines » coupée : mêmes refus (39, compte fini)');
  ok(R.titulaireFiniAvant({ actif: true, fin: iso(J) }, iso(2 * J)) === true && R.titulaireFiniAvant({ actif: true, fin: null }, iso(2 * J)) === false
    && R.titulaireFiniAvant(null, iso(2 * J)) === false, 'titulaireFiniAvant : fin connue avant l\'échéance = fini ; inconnue = continue');
});

// ── 3. SOLDE : le vrai besoin, les clients refusés, le montant à recharger ──────────────────────────────────────────
console.log('3. Solde');
await essayer('3. solde', async () => {
  const registre = [{ nature: 'achat', statut: 'livree', quantite: 14, prix_usd: 53, demandee_le: iso(-10 * J) }];
  const ips19 = [
    ip(2, 'attribuee_client', U(2), 10), ip(3, 'attribuee_client', U(3), 10.4), ip(4, 'attribuee_essai', U(4), 13),
    ip(1, 'attribuee_client', U(1), 15),
  ];
  const t19 = new Map([[2, { actif: false, fin: iso(0) }], [3, { actif: true, fin: null }], [4, { actif: false, fin: iso(0) }], [1, { actif: true, fin: null }]]);
  const sansT = R.seuilSoldeProjete({ ips: ips19, registre, marge: 2, prixIpUsd: 4, maintenant: now });
  const avecT = R.seuilSoldeProjete({ ips: ips19, registre, marge: 2, prixIpUsd: 4, titulaires: t19, maintenant: now });
  ok(sansT.attribuees === 3, `sans titulaires (lecture ratée) : comme avant, 3 IP attribuées échoient (${sansT.attribuees})`);
  ok(avecT.attribuees === 1, `avec titulaires : 1 seule IP de client vraiment due (la 3) au lieu de 3 (${avecT.attribuees})`);
  ok(avecT.achatsRythme === 7, `arrivées au rythme réel : 14 IP en 30 j → 7 sur 14 j (${avecT.achatsRythme})`);
  const c = N.couvertureSolde({ soldeUsd: 2.15, projection: { ...avecT, prixIpUsd: 3 } });
  ok(c.lisible && c.ipsClientsNonCouvertes === 1 && c.clientsRefuses === 7, `solde 2,15 $ : 1 IP de client non renouvelée, 7 nouveaux clients refusés (${JSON.stringify(c)})`);
  const seuil = avecT.renouvellements * 3 + avecT.achats * 3;
  ok(N.couvertureSolde({ soldeUsd: 2.15, projection: { ...avecT, prixIpUsd: 3, seuilUsd: seuil } }).aRechargerUsd === Math.ceil(seuil - 2.15), 'à recharger = la dépense prévue sur 14 jours − le solde, au dollar supérieur');
  const riche = N.couvertureSolde({ soldeUsd: 93.15, projection: { ...avecT, prixIpUsd: 3, seuilUsd: seuil } });
  ok(riche.clientsRefuses === 0 && riche.ipsClientsNonCouvertes === 0 && riche.aRechargerUsd === 0 && riche.couvert === true, 'solde 93,15 $ : personne refusé, rien à recharger');
  const s = N.alerteSolde({ soldeUsd: 2.15, projection: { ...avecT, prixIpUsd: 4 } });
  ok(s.insuffisant === true && s.besoinUsd === 4 && s.clientsRefuses === 7, `alerteSolde : besoin réel 4 $ (au lieu de 12 $), 7 clients refusés (${JSON.stringify(s)})`);
});

// ── 4. ACHAT : un mail par incident, le montant à recharger, les clients refusés ────────────────────────────────────
console.log('4. Achat impossible faute de solde');
await essayer('4. achat', async () => {
  ok(N.decisionMail('orchestrateur.achat_ip_solde').mail === true, '« Achat d\'IP NON FAIT, recharger » est dans la liste des mails à Nico');
  ok(N.ALERTES['orchestrateur.achat_ip_solde']?.silenceH != null, 'un ÉTAT (un mail, puis rien tant que l\'incident dure)');
  const signaux = [], resolus = [];
  const alertes = { regle: async () => N, async signaler(niv, texte, details, o) { signaux.push({ texte, o }); }, async resoudre(a, cle) { resolus.push([a, cle]); } };
  const regles = { ...R };
  const appro = A.creerApprovisionnement({ base: { async rpc() { return { data: null }; } }, journal: { info() {}, alerte() {}, erreur() {} }, alertes, regles,
    iproyal: { disponible: true, achatsAutorises: true, async catalogueIsp() { return { produitId: 9, planId: 22, lieuId: 25 }; }, async prixCommande(n) { return n >= 2 ? 3 * n : 4; } } });
  const g = { envAutorise: true, achatsAuto: true, renouvAuto: true, marge: 2, achatMax: 2 };
  const plan = { aCommander: 3, vise: 3, projete: 1, garde: { vivantes: 14, en_commande: 0, comptes: 14, marge: 2, attente: 1 } };
  const projection = { attribuees: 1, renouvellements: 1, achats: 7, achatsRythme: 7, prixIpUsd: 3, horizonJours: 14, seuilUsd: 24 };
  const r = await appro.acheter(plan, g, { montant: 2.15 }, { projection, enAttente: 1 });
  ok(r.fait === false && r.raison === 'solde_insuffisant', 'solde 2,15 $ : rien acheté');
  const m = signaux.at(-1);
  ok(m?.o?.alerte === 'orchestrateur.achat_ip_solde' && m?.o?.cle === 'iproyal_achat', 'le signal porte l\'alerte « achat impossible » (mail une fois par incident, clé « iproyal_achat »)', JSON.stringify(m?.o));
  ok(/RECHARGER/.test(m?.texte ?? '') && /22 \$/.test(m?.texte ?? '') && /7 nouveau\(x\) client\(s\)/.test(m?.texte ?? '') && /1 personne\(s\) attend/.test(m?.texte ?? ''),
    'le texte dit combien recharger (22 $), combien de clients seraient refusés (7) et qui attend déjà (1)', m?.texte);
  const appro2 = A.creerApprovisionnement({ base: { async rpc(nom) { return nom === 'cloud_ip_depense_ouvrir' ? { data: { ok: true, id: 9 } } : { data: null }; } },
    journal: { info() {}, alerte() {}, erreur() {} }, alertes, regles, attendreLivraisonMs: 0,
    iproyal: { disponible: true, achatsAutorises: true, async catalogueIsp() { return { produitId: 9, planId: 22, lieuId: 25 }; }, async prixCommande(n) { return 3 * n; },
      async commander() { return { id: 'o1' }; }, async lireCommande() { return {}; } } });
  const r2 = await appro2.acheter({ ...plan, aCommander: 2 }, g, { montant: 100 }, { projection, enAttente: 1 });
  ok(r2.fait === true && resolus.some(([a, c]) => a === 'orchestrateur.achat_ip_solde' && c === 'iproyal_achat'), 'un achat réussi RÉSOUT l\'incident (le prochain manque renverra un mail)', JSON.stringify({ r2, resolus }));
});

// ── 5. LE MAIL DU SOLDE dit les clients refusés et le montant ───────────────────────────────────────────────────────
console.log('5. Alerte du solde (14 jours)');
await essayer('5. solde mail', async () => {
  const msgs = [], resolus = [];
  const f = F.creerFournisseurIp({ config: { iproyalSoldeAlerte: 5 }, base: {}, journal: { info() {}, alerte() {}, erreur() {} },
    iproyal: { disponible: true, async solde() { return { montant: 2.15, devise: 'USD' }; } },
    alertes: { regle: async () => N, async signaler(n, m, d, o) { msgs.push({ m, d, o }); }, async resoudre(a, c) { resolus.push([a, c]); } } });
  const projection = { attribuees: 1, renouvellements: 1, achats: 7, achatsRythme: 7, prixIpUsd: 3, horizonJours: 14, seuilUsd: 24 };
  await f.verifierSolde(now, { projection });
  const t = msgs.at(-1)?.m ?? '';
  ok(/7 nouveau\(x\) client\(s\) seraient refusé\(s\)/.test(t) && /Recharger d'au moins 22 \$/.test(t) && /1 IP de client\(s\)/.test(t), 'le mail dit les clients refusés, l\'IP de client non couverte et le montant', t);
  const f2 = F.creerFournisseurIp({ config: { iproyalSoldeAlerte: 5 }, base: {}, journal: { info() {}, alerte() {}, erreur() {} },
    iproyal: { disponible: true, async solde() { return { montant: 93.15, devise: 'USD' }; } },
    alertes: { regle: async () => N, async signaler() {}, async resoudre(a, c) { resolus.push([a, c]); } } });
  await f2.verifierSolde(now, { projection });
  ok(resolus.some(([a]) => a === 'orchestrateur.achat_ip_solde'), 'un solde qui couvre les 14 jours résout l\'incident « achat impossible »');
});

// ── 6. STOCK VIDE, même sans personne qui attend : un mail par incident ─────────────────────────────────────────────
console.log('6. Stock d\'IP saines vide');
await essayer('6. stock vide', async () => {
  ok(N.decisionMail('orchestrateur.stock_ip_vide').mail === true, '« plus aucune IP saine libre » est dans la liste des mails à Nico');
  const vide = N.alertePool({ sansPlace: 0, enAttente: 0, sainesLibres: 0, inconnuesLibres: 0, enRoute: 0, attribuables: 3 });
  ok(vide.stockVide === true && vide.sansIp === false, 'personne n\'attend, 0 saine, rien en route (3 grillées libres) : stock VIDE', JSON.stringify(vide));
  ok(N.alertePool({ sansPlace: 0, enAttente: 0, sainesLibres: 0, inconnuesLibres: 1, enRoute: 0 }).stockVide === false, 'une IP livrée pas encore contrôlée : pas vide (contrôle dans les minutes)');
  ok(N.alertePool({ sansPlace: 0, enAttente: 0, sainesLibres: 0, inconnuesLibres: 0, enRoute: 2 }).stockVide === false, 'des IP en route (achetées) : pas vide');
  ok(N.alertePool({ sansPlace: 0, enAttente: 0, sainesLibres: 2, inconnuesLibres: 0, enRoute: 0 }).stockVide === false, 'des saines libres : pas vide');
  ok(N.alertePool({ sansPlace: 0, enAttente: 0, sainesLibres: null, attribuables: 0, enRoute: 0 }).stockVide === true, 'santé coupée : 0 attribuable et rien en route = vide');
  const src = fs.readFileSync(join(ROOT, 'serveur-cloud/src/entretien.js'), 'utf8');
  ok(/orchestrateur\.stock_ip_vide/.test(src) && /resoudre\?\.\('orchestrateur\.stock_ip_vide'/.test(src), 'l\'entretien signale le stock vide et le résout quand il revient');
});

// ── 7. LA GARDE DE LA VENTE : « une place se prépare », jamais « complet » faute d'IP ──────────────────────────────
console.log('7. Vente fermée faute d\'IP');
await essayer('7. garde', async () => {
  const mig = fs.readFileSync(join(ROOT, 'supabase/migrations/20261119190000_cloud_ip_fin_de_compte.sql'), 'utf8');
  ok(/'ip_en_preparation'/.test(mig) && /IN \('complet', 'ip_en_preparation'\)/.test(mig), 'la base rend « ip_en_preparation » et la préparation l\'inscrit à la liste d\'attente');
  const achat = fs.readFileSync(join(ROOT, 'src/cloud/achatCloud.js'), 'utf8');
  ok(/ip_en_preparation/.test(achat), 'l\'achat (achatCloud.js) la traite comme une vente fermée, avec sa phrase');
  const tc = await importer('src/cloud/textesConnexion.js');
  const fr = tc.textesConnexion('fr'), en = tc.textesConnexion('en');
  ok(/Une place se prépare/.test(fr?.ipEnPreparation ?? '') && /prévenu\(e\)/.test(fr?.ipEnPreparation ?? '') && /being prepared/i.test(en?.ipEnPreparation ?? ''),
    'la phrase vraie, fr et en : « Une place se prépare : inscris-toi, tu es prévenu(e) dès qu\'elle est prête »', JSON.stringify({ fr: fr?.ipEnPreparation, en: en?.ipEnPreparation }));
});

// ── 8. LE REMPLACEMENT D'UNE ADRESSE PAR IPRoyal (80, 81, 82 le 19/11) : relue, contrôlée de nouveau ────────────────
console.log('8. Adresse remplacée par IPRoyal dans la même commande');
await essayer('8. remplacement', async () => {
  const nos = [{ id: 80, commande: '1', ip: '10.0.0.80', etat: 'disponible', expire_le: iso(27 * J) }];
  const r = R.remplacementsDeCommande?.({ ips: nos, proxies: [{ ip: '10.9.9.80', port: 12323 }] });
  ok(r?.remplacer?.length === 1 && r.remplacer[0].id === 80 && r.remplacer[0].nouvelle === '10.9.9.80', 'une adresse disparue + une neuve dans la même commande = un remplacement', JSON.stringify(r));
  ok(R.remplacementsDeCommande?.({ ips: nos, proxies: [] })?.remplacer.length === 0, 'commande relue sans aucune adresse (lecture ratée) : rien (jamais deviné)');
  ok(R.remplacementsDeCommande?.({ ips: nos, proxies: [{ ip: '10.0.0.80' }] })?.remplacer.length === 0, 'même adresse : rien');
  const appels = [], signaux = [];
  const cmd = { expire_date: '2026-12-16 17:06:14', proxy_data: { ports: { http: 12323 }, proxies: [{ ip: '10.9.9.80', port: 12323, username: 'u', password: 'p' }] } };
  const appro = A.creerApprovisionnement({ regles: R, journal: { info() {}, alerte() {}, erreur() {} },
    alertes: { async signaler(n, m, d) { signaux.push(m); } },
    base: { async rpc(nom, args) { appels.push([nom, args]); return { data: nom === 'cloud_ip_remplacee' ? { ok: true } : true, error: null }; } },
    iproyal: { disponible: true, async lireCommande(c) { return c === '2' ? { ...cmd, proxy_data: { proxies: [{ ip: '10.9.9.81', username: 'u', password: 'p' }] } } : cmd; },
      urlProxy(c, ip) { return `http://u:p@${ip}:12323`; } } });
  ok(typeof appro.relireCommandes === 'function', 'l\'approvisionnement relit les commandes (une lecture par commande)');
  const b = await appro.relireCommandes?.([...nos, { id: 81, commande: '2', ip: '10.0.0.81', etat: 'attribuee_client', user_id: U(81), expire_le: iso(27 * J) }]);
  const rp = appels.find(([n]) => n === 'cloud_ip_remplacee');
  ok(rp && rp[1].p_ip === 80 && rp[1].p_nouvelle === '10.9.9.80' && rp[1].p_proxy_url === 'http://u:p@10.9.9.80:12323', 'IP libre : cloud_ip_remplacee avec la nouvelle adresse et ses identifiants', JSON.stringify(appels));
  ok(!appels.some(([n, a]) => n === 'cloud_ip_remplacee' && a.p_ip === 81) && signaux.some((m) => /IP 81/.test(m)) && b?.refusees?.includes(81),
    'IP ATTRIBUÉE : jamais changée seule, une alerte', JSON.stringify({ b, signaux }));
  const src = fs.readFileSync(join(ROOT, 'serveur-cloud/src/entretien.js'), 'utf8');
  ok(/approvisionnement\.relireCommandes\(toutes\)/.test(src), 'l\'entretien horaire passe par la relecture des commandes');
  const mig = fs.readFileSync(join(ROOT, 'supabase/migrations/20261119190000_cloud_ip_fin_de_compte.sql'), 'utf8');
  ok(/FUNCTION public\.cloud_ip_remplacee/.test(mig) && /etat = 'achetee'/.test(mig) && /sante = NULL/.test(mig) && /'remplacement'::text/.test(mig),
    'la base : l\'IP repart « achetee », santé effacée (contrôle d\'entrée puis santé), nature « remplacement » au journal');
});

// ── 9. (19/11 ~14:00, décisions de Nico) ACHAT SUR DEMANDE, UN À LA FOIS, JAMAIS POUR REMPLACER ; REMPLACEMENT DEMANDÉ ──
console.log('9. Achat sur demande, remplacement demandé à IPRoyal, alerte pendant la coupure');
await essayer('9. sur demande', async () => {
  const saine = { verdict: 'saine', le: iso(-H), saine_le: iso(-H) };
  const libre = (id, x = {}) => ({ id, commande: `c${id}`, ip: `10.0.0.${id}`, etat: 'disponible', user_id: null, attributions: 0, refus: {}, expire_le: iso(25 * J), sante: saine, ...x });
  const grillee = { verdict: 'grillee', le: iso(-H), suspecte_le: iso(-2 * H), grillee_le: iso(-H), echecs: ['sortie:hebergeur', 'sortie:proxy'],
    dernier: { le: iso(-H), echecs: ['sortie:hebergeur', 'sortie:proxy'], resume: { sortie: { as: 'AS25369 Hydra Communications Ltd', org: 'TELUS', hebergeur: true, proxy: true, pays: 'FR' } } } };
  // La vraie attente.
  const att = [
    { inscrit_le: iso(-3 * J), notifie_le: null, derniere_le: iso(-3 * J) },            // inscrite, pas encore prévenue : attend
    { inscrit_le: null, notifie_le: null, derniere_le: iso(-2 * H) },                   // a essayé il y a 2 h : attend
    { inscrit_le: null, notifie_le: null, derniere_le: iso(-3 * J) },                   // a essayé il y a 3 jours, pas inscrite : non
    { inscrit_le: iso(-5 * J), notifie_le: iso(-2 * J), derniere_le: iso(-5 * J) },     // place offerte il y a 2 j, jamais revenue : non
  ];
  ok(R.attenteVraie?.(att, now) === 2, `la VRAIE attente : 2 personnes sur 4 lignes (${R.attenteVraie?.(att, now)})`);
  // Pas de marge achetée d'avance : personne n'attend → 0 achat, même avec 0 IP libre.
  ok(R.achatSurDemande?.({ ips: [], attente: 0, maintenant: now })?.aCommander === 0, 'personne n\'attend, 0 IP libre : AUCUN achat (plus de marge achetée d\'avance)');
  ok(R.achatSurDemande?.({ ips: [libre(1)], attente: 1, maintenant: now })?.aCommander === 0, 'quelqu\'un attend, une IP saine libre : aucun achat');
  ok(R.achatSurDemande?.({ ips: [libre(1, { sante: grillee })], attente: 1, maintenant: now })?.aCommander === 1, 'quelqu\'un attend, la seule libre est grillée : 1 achat (pour la personne, pas pour la grillée)');
  ok(R.achatSurDemande?.({ ips: [libre(1, { sante: grillee }), libre(2, { sante: grillee })], attente: 0, maintenant: now })?.aCommander === 0, 'des IP grillées, personne n\'attend : AUCUN rachat pour les remplacer');
  ok(R.achatSurDemande?.({ ips: [], attente: 3, maintenant: now })?.aCommander === 1, '3 personnes attendent, 0 IP : UNE IP à la fois');
  ok(R.achatSurDemande?.({ ips: [{ ...libre(5), etat: 'achetee', sante: null }], attente: 2, maintenant: now })?.raison === 'achat_en_route'
    && R.achatSurDemande?.({ ips: [], attente: 2, commandesEnCours: 1, maintenant: now })?.aCommander === 0, 'un achat en route (commande, contrôle d\'entrée à venir) : le suivant attend');
  ok(R.achatSurDemande?.({ ips: [libre(6, { sante: null })], attente: 1, maintenant: now })?.aCommander === 0, 'l\'IP qui vient de passer l\'entrée (pas encore jugée) sert d\'abord : pas de 2e achat avant son verdict');
  ok(R.achatSurDemande?.({ ips: [], attente: 0, comptesSansPlace: 1, maintenant: now })?.aCommander === 1, 'un compte Cloud actif sans IP : 1 achat');
  // La demande de remplacement : grillée / suspecte hébergeur-proxy-pays, ou refusée au contrôle d'entrée.
  const g88 = libre(88, { sante: grillee, commande: '88946849' });
  const d = R.remplacementADemander?.(g88);
  ok(d?.motif === 'sortie' && d.codes.includes('sortie:hebergeur') && typeof d.cle === 'string', 'grillée hébergeur + proxy : remplacement à demander', JSON.stringify(d));
  ok(R.remplacementADemander?.(libre(9, { sante: { verdict: 'suspecte', suspecte_le: iso(-H), echecs: ['sortie:hebergeur'] } }))?.motif === 'sortie', 'suspecte hébergeur : demandé tout de suite (un classement, pas un incident)');
  ok(R.remplacementADemander?.(libre(10, { sante: { verdict: 'grillee', echecs: ['leboncoin'] } })) === null, 'grillée sur une plateforme (Leboncoin) : pas un défaut d\'IPRoyal, rien demandé');
  ok(R.remplacementADemander?.({ ...libre(11), etat: 'quarantaine', quarantaine: { origine: 'controle_entree', essais: 3, depuis: iso(-2 * H) } })?.motif === 'controle_entree'
    && R.remplacementADemander?.({ ...libre(12), etat: 'quarantaine', quarantaine: { origine: 'controle_entree', essais: 1, depuis: iso(-10 * 60_000) } }) === null,
  'refusée au contrôle d\'entrée 3 fois (≈ 1 h 15) : demandé ; un seul échec (livraison lente) : pas encore');
  ok(R.remplacementADemander?.({ ...g88, etat: 'attribuee_client', user_id: U(1) }) === null, 'une IP qui sert un compte : jamais par ce chemin');
  const t = R.texteDemandeRemplacement?.(g88, d);
  ok(/88946849/.test(t?.support ?? '') && /AS25369/.test(t.support) && /hosting/.test(t.support) && /replace/.test(t.support)
    && /AUCUNE IP n'est rachetée/.test(t.nico) && /Texte prêt pour le support IPRoyal/.test(t.nico), 'le texte prêt pour le support (commande, preuve, demande) et le mail à Nico', JSON.stringify(t));
  ok(N.decisionMail('orchestrateur.ip_a_remplacer').mail === true && N.ALERTES['orchestrateur.ip_a_remplacer'].silenceH === null,
    'la demande de remplacement est un mail, UN par IP et par défaut (événement)');
  // L'alerte « client sans IP » : achats coupés → tout de suite ; rachat qui tourne avec une IP en route → pas d'alerte.
  ok(N.alertePool({ enAttente: 1, sainesLibres: 0, inconnuesLibres: 0, enRoute: 1, achatsCoupes: true }).sansIp === true, 'achats COUPÉS, quelqu\'un attend sans IP saine : alerte');
  ok(N.alertePool({ enAttente: 1, sainesLibres: 0, inconnuesLibres: 0, enRoute: 1, achatsCoupes: false }).sansIp === false
    && N.alertePool({ enAttente: 1, sainesLibres: 0, inconnuesLibres: 0, enRoute: 0, achatsCoupes: false }).sansIp === true,
  'rachat allumé : une IP en route sert la personne (pas d\'alerte) ; rien en route (garde, solde) : alerte');
  // Le réapprovisionnement rapide pendant la coupure : l'alerte part toutes les 5 min (un mail par incident), jamais un achat.
  const E = await importer('serveur-cloud/src/entretien.js');
  const fausseBase = (ips, attente) => ({
    from(table) { const q = { select() { return q; }, eq() { return q; }, in() { return q; }, gte() { return q; },
      then(r, k) { return Promise.resolve({ data: table === 'cloud_ips' ? ips : table === 'cloud_attente' ? attente : [], error: null }).then(r, k); } }; return q; },
    async rpc() { return { data: null, error: null }; },
  });
  const vus = [];
  const e = E.creerEntretien({ config: { entretienPool: true }, base: fausseBase([libre(80, { sante: grillee })], att), regles: R, journal: { info() {}, alerte() {}, erreur() {} },
    iproyal: { disponible: true, achatsAutorises: true }, alertes: { async signaler(n, m, dd, o) { vus.push({ m, o }); }, async resoudre() {} },
    pareFeu: { async appliquees() { return null; }, async synchroniser() { return null; } }, navigateurs: { ouverts: () => [] }, controles: null,
    approvisionnement: { async gardes() { return { envAutorise: true, achatsAuto: false, surDemande: true, marge: 2, achatMax: 2 }; }, async acheter() { throw new Error('jamais un achat'); } },
    fournisseurIp: { async rotationActive() { return false; } } });
  const r = await e.reapprovisionnerVite();
  ok(r.coupe === 'interrupteur' && vus.length === 1 && vus[0].o?.alerte === 'orchestrateur.client_sans_ip' && vus[0].o?.cle === 'pool' && /COUPÉS/.test(vus[0].m),
    'interrupteur COUPÉ, 2 personnes attendent, aucune IP saine (la 80 grillée) : « client sans IP » au réassort rapide (5 min), jamais un achat', JSON.stringify({ r, vus }));
  // Rachat allumé, sur demande : 1 IP achetée pour la personne qui attend ; une commande en cours : rien.
  const achats = [];
  const fausseBase2 = (ips, attente, enCours) => ({
    from(table) { const q = { select() { return q; }, eq() { return q; }, in() { return q; }, gte() { return q; },
      then(rr, k) { return Promise.resolve({ data: table === 'cloud_ips' ? ips : table === 'cloud_attente' ? attente : table === 'cloud_ip_commandes' ? enCours : [], error: null }).then(rr, k); } }; return q; },
    async rpc(nom) { return { data: nom === 'cloud_pool_etat' ? { en_attente: attente.length, comptes_sans_place: 0, commandes_en_cours: enCours.reduce((n, c) => n + c.quantite, 0) } : null, error: null }; },
  });
  const e2 = (ips, enCours) => E.creerEntretien({ config: { entretienPool: true }, base: fausseBase2(ips, att, enCours), regles: R, journal: { info() {}, alerte() {}, erreur() {} },
    iproyal: { disponible: true, achatsAutorises: true }, alertes: { async signaler() {}, async resoudre() {} },
    pareFeu: { async appliquees() { return null; }, async synchroniser() { return null; } }, navigateurs: { ouverts: () => [] }, controles: null,
    approvisionnement: { async gardes() { return { envAutorise: true, achatsAuto: true, surDemande: true, marge: 2, achatMax: 2 }; }, async livrer() { return { livrees: 0 }; },
      async acheter(plan) { achats.push(plan.aCommander); return { fait: true, quantite: plan.aCommander }; } },
    fournisseurIp: { async rotationActive() { return false; }, async solde() { return { montant: 85 }; } } });
  await e2([libre(80, { sante: grillee })], []).reapprovisionnerVite();
  ok(achats.length === 1 && achats[0] === 1, `rachat allumé, 2 personnes attendent, aucune IP saine : UN achat d'UNE IP (${JSON.stringify(achats)})`);
  await e2([libre(80, { sante: grillee })], [{ quantite: 1 }]).reapprovisionnerVite();
  ok(achats.length === 1, 'une commande en cours : le suivant attend son contrôle d\'entrée (aucun 2e achat)');
  await e2([libre(1), libre(2)], []).reapprovisionnerVite();
  ok(achats.length === 1, '2 IP saines libres pour 2 personnes : aucun achat');
  const src = fs.readFileSync(join(ROOT, 'serveur-cloud/src/entretien.js'), 'utf8');
  ok(/await demanderRemplacement\(\{ \.\.\.ip, sante: nouvelle \}\)/.test(src) && /await demanderRemplacement\(\{ \.\.\.i, etat: 'quarantaine', quarantaine: q \}\)/.test(src),
    'la santé et le contrôle d\'entrée déclenchent seuls la demande de remplacement');
  const reg = fs.readFileSync(join(ROOT, 'scripts/reparations/20261119_cloud_ip_reglages.sql'), 'utf8');
  ok(/'cloud_ip_achat_sur_demande', 1/.test(reg), 'le script des réglages allume l\'achat sur demande (cloud_ip_achat_sur_demande = 1)');
});

console.log(`\n${verts} ok, ${rouges} raté(s)`);
process.exit(rouges ? 1 : 0);
