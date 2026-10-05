// Autotest du POOL D'IP FRANÇAISES de l'option FillSell Cloud — une IP DÉDIÉE
// par compte (décision de Nico du 05/10 ; la rotation du 04/10 est abandonnée).
//
//     npm run selftest:cloud-pool      (node scripts/cloud-pool-selftest.mjs)
//
// Ce qu'il prouve, sans réseau ni base : le cycle de vie d'une IP (transitions
// permises et interdites), la réservation et l'attribution (jamais une IP qui
// expire pendant l'essai, le même compte reprend la sienne au repos, jamais une
// IP réservée par un autre, FEFO), ce que fait un compte selon son état (essai,
// payé, grâce, repos), la purge prouvée et la sortie du repos (ancien client
// compris), le rebut (critères mesurables, Beebs = environnement), la taille du
// pool, le plan de renouvellement, l'alerte (sans place = immédiate), l'essai
// unique (préparation, carte), les coûts et la capacité.
// Et que la MIGRATION SQL dit la même chose : défauts de cloud_param, codes de
// preuve et de contrôle, états, critères, ordre des refus — relus dans
// supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql. Le comportement
// de la SQL elle-même est éprouvé par scripts/cloud/banc-sql-socle.mjs (PGlite).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ESSAI_JOURS, EXIGE_UN_PALIER, PRIX_AFFICHE, PARAMETRES, ETATS, prochainEtat, couvertureJusqua, ipAttribuable, choisirIp,
  actionCompte, manquesPreuvePurge, CODES_PURGE, manquesControle, CODES_CONTROLE, peutRemettreEnPool, qualifierSignalement,
  CRITERES_REBUT, lambdaMesure, seuils, taillePoolCible, planDuJour, niveauPool, deciderAlerte,
  verdictPreparation, verdictCarte, coutParEssai, fraisPaiement, margeParClient, capacite,
} from '../supabase/functions/_shared/cloud-pool.js';
import { CLOUD_ESSAI_JOURS, CLOUD_EXIGE_UN_PALIER, CLOUD_PRIX_AFFICHE, cloudDuProfil } from '../src/utils/palier.js';

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const titre = (t) => console.log(`\n${t}`);

const J = 86_400_000;
const T0 = Date.parse('2026-10-05T10:00:00Z');
const iso = (t) => new Date(t).toISOString();
const ip = (o) => ({ id: 1, ip: '10.0.0.1', etat: 'disponible', attributions: 0, expire_le: iso(T0 + 30 * J), ...o });

// ─────────────────────────────────────────────────────────────────────────────
titre('0. Le contrat — mêmes valeurs que l\'app et que la migration SQL');
ok(ESSAI_JOURS === CLOUD_ESSAI_JOURS, `durée d'essai = CLOUD_ESSAI_JOURS (${CLOUD_ESSAI_JOURS} j)`);
ok(EXIGE_UN_PALIER === CLOUD_EXIGE_UN_PALIER, `palier exigé = CLOUD_EXIGE_UN_PALIER (${CLOUD_EXIGE_UN_PALIER})`);
ok(PRIX_AFFICHE === CLOUD_PRIX_AFFICHE && PRIX_AFFICHE === '20 €' && PARAMETRES.prixTtcEur === 20, '20 € TTC partout (app, règles, coûts)');
const sql = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261005120000_cloud_socle_ip_dediee.sql', import.meta.url)), 'utf8');
const sqlPaiements = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261004233000_option_cloud_paiements.sql', import.meta.url)), 'utf8');
ok(!existsSync(fileURLToPath(new URL('../supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt', import.meta.url))),
  'la proposition « rotation » du 04/10 est retirée (remplacée par la migration du socle)');
ok(!/btree_gist|EXCLUDE USING gist|cloud_baux|cloud_affinites|rotation/i.test(sql.replace(/^--.*$/gm, '')), 'SQL : plus de rotation, de baux, d\'exclusion ni de btree_gist (hors commentaires)');
ok(/c_exige_un_palier CONSTANT boolean := false/.test(sqlPaiements), 'SQL (paiements) : cloud_etat n\'exige pas de palier');
const DEFAUTS = {
  grace_jours: PARAMETRES.graceJours, repos_jours: PARAMETRES.reposJours,
  marge_expiration_jours: PARAMETRES.margeExpirationJours, renouvellement_avant_jours: PARAMETRES.renouvellementAvantJours,
  attributions_max: PARAMETRES.attributionsMax, reservation_min: PARAMETRES.reservationMin,
  empreintes_conservation_mois: PARAMETRES.empreintesConservationMois,
};
for (const [cle, attendu] of Object.entries(DEFAUTS)) {
  const vus = [...sql.matchAll(new RegExp(`cloud_param\\('${cle}', (\\d+)\\)`, 'g'))].map((m) => Number(m[1]));
  ok(vus.length > 0 && vus.every((v) => v === attendu), `SQL : cloud_param('${cle}') a le défaut de PARAMETRES (${attendu}) — ${vus.length}×`);
}
ok(/NULLIF\(public\.cloud_param\('delai_sessions_min', -1\), -1\)/.test(sql) && PARAMETRES.delaiSessionsMin === null,
  'délai entre deux sessions : NON tranché — réglage, absent = null (navigateur en continu), en SQL comme en JS');
const durees = [...sql.matchAll(/make_interval\(days => (\d+) \+ public\.cloud_param\('grace_jours'/g)].map((m) => Number(m[1]));
ok(durees.length >= 1 && durees.every((d) => d === CLOUD_ESSAI_JOURS), `SQL : la couverture d'essai part de ${CLOUD_ESSAI_JOURS} j`);
const corps = (nom) => sql.slice(sql.indexOf(`FUNCTION public.${nom}(`), sql.indexOf('$f$;', sql.indexOf(`FUNCTION public.${nom}(`)));
const codesSql = (nom) => [...corps(nom).matchAll(/array_append\(m, '([a-z_]+)'\)/g)].map((m) => m[1]);
ok(egal(codesSql('cloud_purge_manques'), [...CODES_PURGE]), 'SQL : cloud_purge_manques — mêmes codes, même ordre que manquesPreuvePurge');
ok(egal(codesSql('cloud_controle_manques'), [...CODES_CONTROLE]), 'SQL : cloud_controle_manques — mêmes codes, même ordre que manquesControle');
ok(egal(codesSql('cloud_ip_remettre_en_pool'), ['pas_au_repos', 'repos_en_cours', 'purge_non_prouvee', 'expiree']),
  'SQL : cloud_ip_remettre_en_pool — mêmes refus que peutRemettreEnPool (plus de « ancien_client »)');
const criteresSql = corps('cloud_ip_signaler').match(/p_critere NOT IN \(([^)]*)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
ok(egal(criteresSql, [...CRITERES_REBUT]), 'SQL : cloud_ip_signaler accepte exactement CRITERES_REBUT');
const etatsSql = sql.match(/CHECK \(etat IN \(([^)]*)\)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
ok(egal(etatsSql, [...ETATS]), 'SQL : les états de cloud_ips = ETATS');
const prep = corps('cloud_essai_preparer_moi');
const ordrePrep = ['compte_inconnu', 'deja_client', 'pool_vide', 'essai_deja_pris', 'appareil_inconnu', 'appareil_deja_vu', 'compte_plateforme_deja_vu']
  .map((r) => prep.indexOf(`'${r}'`));
ok(ordrePrep.every((i) => i > 0) && ordrePrep.every((i, k) => k === 0 || i > ordrePrep[k - 1]), 'SQL : cloud_essai_preparer_moi — refus et raisons dans l\'ordre de verdictPreparation');
ok(/cloud_ips_un_titulaire ON public\.cloud_ips \(user_id\) WHERE user_id IS NOT NULL/.test(sql)
  && /CHECK \(\(etat IN \('attribuee_essai','attribuee_client'\)\) = \(user_id IS NOT NULL\)\)/.test(sql),
  'SQL : l\'exclusivité tient en une colonne + un index unique (une IP = un compte ; un compte = une IP)');
ok(!/^\s*SELECT cron\.schedule/m.test(sql) && !/^\s*PERFORM cron\.schedule/m.test(sql), 'SQL : aucun cron (l\'entretien tourne dans l\'orchestrateur)');
ok(/REVOKE ALL ON public\.cloud_ips FROM anon, authenticated/.test(sql) && /REVOKE ALL ON public\.cloud_coffre FROM anon, authenticated/.test(sql)
  && /REVOKE ALL ON public\.cloud_essai_empreintes FROM anon, authenticated/.test(sql), 'SQL : tables serveur seul (REVOKE explicites)');
ok(!/password|mot_de_passe|proxy_url\s+text/i.test(sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.cloud_ips'), sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS cloud_ips_un_titulaire'))),
  'SQL : aucune colonne de secret dans cloud_ips (référence au vault seulement)');
ok(/\\mcloud_essai_veille\\M/.test(sql) && /email_logs_one_shot_unique/.test(sql), 'SQL : cloud_essai_veille ajouté à l\'index one-shot (idempotent)');
ok(/plateforme IN \('vinted','leboncoin','beebs','fillsell'\)/.test(sql) && !/'opla'/.test(sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.cloud_coffre'), sql.indexOf('CREATE TABLE IF NOT EXISTS public.cloud_postes'))),
  'SQL : le coffre ne connaît que Vinted, Leboncoin, Beebs et la session FillSell (Opla sort le 10/10, eBay passe par l\'API)');

// ─────────────────────────────────────────────────────────────────────────────
titre('1. Cycle de vie — transitions');
ok(prochainEtat('achetee', 'controle_ok') === 'disponible', 'achetée → disponible après le contrôle d\'entrée');
ok(prochainEtat('disponible', 'attribuer_essai') === 'attribuee_essai', 'disponible → attribuée (essai)');
ok(prochainEtat('attribuee_essai', 'convertir') === 'attribuee_client', 'essai converti → l\'IP reste au même compte');
ok(prochainEtat('attribuee_essai', 'liberer') === 'repos' && prochainEtat('attribuee_client', 'liberer') === 'repos', 'essai non converti OU option arrêtée → repos');
ok(prochainEtat('repos', 'sortir') === 'disponible', 'repos → disponible (sur preuve)');
ok(prochainEtat('repos', 'reprendre_client') === 'attribuee_client' && prochainEtat('repos', 'reprendre_essai') === 'attribuee_essai', 'le même compte revient → il reprend son IP');
ok(prochainEtat('repos', 'signaler') === 'rebut', 'IP signalée au repos → rebut');
ok(prochainEtat('rebut', 'renouveler') === null && prochainEtat('rebut', 'sortir') === null && prochainEtat('rebut', 'attribuer_essai') === null, 'rebut : ni renouvelée, ni remise en pool, ni attribuée');
ok(prochainEtat('attribuee_essai', 'expirer') === null && prochainEtat('attribuee_client', 'expirer') === null, 'une IP attribuée n\'expire JAMAIS sous son titulaire');
ok(prochainEtat('disponible', 'mettre_en_rotation') === null && !ETATS.includes('rotation') && !ETATS.includes('quarantaine'), 'plus de rotation (ni état, ni transition)');
ok(prochainEtat('expiree', 'renouveler') === null, 'expirée : terminal');

// ─────────────────────────────────────────────────────────────────────────────
titre('2. Réservation et attribution — une IP, un compte');
ok(couvertureJusqua({ nature: 'essai', maintenant: T0 }) === T0 + 10 * J, 'un essai exige une IP payée jusqu\'à 7 j + 2 j de grâce + 1 j de marge');
ok(!ipAttribuable(ip({ expire_le: iso(T0 + 9 * J) }), { nature: 'essai', maintenant: T0 }), 'IP qui expire dans 9 j → refusée pour un essai');
ok(ipAttribuable(ip({ expire_le: iso(T0 + 10 * J) }), { nature: 'essai', maintenant: T0 }), 'IP qui expire dans 10 j pile → acceptée');
ok(ipAttribuable(ip({ expire_le: iso(T0 + 9 * J) }), { nature: 'client', maintenant: T0 }), '…la même sert un client payant (renouvelée de toute façon)');
ok(!ipAttribuable(ip({ attributions: 6 }), { nature: 'essai', maintenant: T0 }), 'IP usée (6 comptes) → plus attribuée');
ok(!ipAttribuable(ip({ etat: 'rebut' }), { nature: 'client', maintenant: T0 }), 'IP au rebut → jamais attribuée');
ok(!ipAttribuable(ip({ etat: 'repos', dernier_user_id: 'u-A' }), { userId: 'u-B', maintenant: T0 }), 'IP au repos → JAMAIS à un AUTRE compte');
ok(ipAttribuable(ip({ etat: 'repos', dernier_user_id: 'u-A' }), { userId: 'u-A', maintenant: T0 }), 'IP au repos → à son dernier titulaire, oui');
ok(!ipAttribuable(ip({ reserve_pour: 'u-A', reserve_jusqu_au: iso(T0 + 10 * 60_000) }), { userId: 'u-B', maintenant: T0 }), 'IP réservée par A (paiement en cours) → pas à B');
ok(ipAttribuable(ip({ reserve_pour: 'u-A', reserve_jusqu_au: iso(T0 - 60_000) }), { userId: 'u-B', maintenant: T0 }), '…réservation échue → libre');
const pool = [
  ip({ id: 10, expire_le: iso(T0 + 25 * J) }),
  ip({ id: 11, expire_le: iso(T0 + 12 * J), attributions: 2 }),
  ip({ id: 12, expire_le: iso(T0 + 12 * J), attributions: 1 }),
  ip({ id: 13, expire_le: iso(T0 + 8 * J) }),
  ip({ id: 14, etat: 'attribuee_essai', user_id: 'u-X', expire_le: iso(T0 + 20 * J) }),
  ip({ id: 15, etat: 'repos', dernier_user_id: 'u-A', liberee_le: iso(T0 - J), repos_fin: iso(T0 + 6 * J), expire_le: iso(T0 + 20 * J) }),
  ip({ id: 16, expire_le: iso(T0 + 28 * J), reserve_pour: 'u-R', reserve_jusqu_au: iso(T0 + 20 * 60_000) }),
];
ok(choisirIp(pool, { userId: 'u-X', maintenant: T0 })?.id === 14, 'déjà titulaire → la même (idempotent)');
ok(choisirIp(pool, { userId: 'u-A', maintenant: T0 })?.id === 15, 'le même compte reprend SA propre IP au repos');
ok(choisirIp(pool, { userId: 'u-R', maintenant: T0 })?.id === 16, 'sa RÉSERVATION passe avant le FEFO');
ok(choisirIp(pool, { userId: 'u-N', maintenant: T0 })?.id === 12, 'sinon FEFO couvrant l\'essai (13 expire trop tôt), la moins usée à égalité (12 avant 11)');
ok(choisirIp([pool[3], pool[4], pool[5]], { userId: 'u-N', maintenant: T0 }) === null, 'pool vide pour lui → null (jamais une IP au repos d\'un autre)');

// ─────────────────────────────────────────────────────────────────────────────
titre('3. Le compte suit son état (cloud_compte_synchroniser)');
const etat = (prof, now = T0) => cloudDuProfil(prof, now);
ok(actionCompte({ etat: etat({ cloud_essai_debut: iso(T0), cloud_essai_fin: iso(T0 + 7 * J) }) }).action === 'attribuer', 'essai qui démarre, sans IP → attribuer');
ok(actionCompte({ etat: etat({ cloud_essai_debut: iso(T0), cloud_essai_fin: iso(T0 + 7 * J) }) }).nature === 'essai', '…nature essai');
ok(actionCompte({ etat: etat({ is_cloud: true }), ip: ip({ etat: 'attribuee_essai' }) }).action === 'convertir', 'payé sur une IP d\'essai → convertir');
ok(actionCompte({ etat: etat({ is_cloud: true }) }).nature === 'client', 'payé sans IP → attribuer (client)');
const finie = etat({ cloud_essai_debut: iso(T0 - 8 * J), cloud_essai_fin: iso(T0 - J) });
ok(actionCompte({ etat: finie, ip: ip({ etat: 'attribuee_essai' }), maintenant: T0 }).action === 'grace', 'essai fini hier, non payé → grâce (2 j)');
ok(actionCompte({ etat: finie, ip: ip({ etat: 'attribuee_essai' }), maintenant: T0 + 2 * J }).action === 'repos', '…grâce écoulée → repos');
const arrete = etat({ cloud_essai_debut: iso(T0 - J), cloud_essai_fin: iso(T0), cloud_essai_arrete: true });
ok(actionCompte({ etat: arrete, ip: ip({ etat: 'attribuee_essai' }), maintenant: T0 }).action === 'repos', 'essai ARRÊTÉ → repos tout de suite (pas de grâce)');
ok(actionCompte({ etat: etat({}), ip: null }).action === 'rien', 'aucun Cloud, aucune IP → rien');
ok(actionCompte({ etat: etat({ is_cloud: false, cloud_essai_debut: iso(T0 - 40 * J), cloud_essai_fin: iso(T0 - 33 * J) }), ip: ip({ etat: 'attribuee_client' }) }).action === 'repos', 'option arrêtée (client) → repos');

// ─────────────────────────────────────────────────────────────────────────────
titre('4. Purge prouvée, contrôle, sortie du repos');
const lib = T0 - 8 * J;
const preuve = { version: 1, faite_le: iso(lib + 60_000), profil: { ancien: 'p1', nouveau: 'p2', ancien_detruit: true, nouveau_cree_le: iso(lib + 60_000) },
  cookies_restants: 0, stockages_restants: 0, coffre_restants: 0, session_fillsell_revoquee: true,
  empreinte: { ancienne: 'e1', nouvelle: 'e2' }, identifiants_proxy_renouveles: true };
ok(manquesPreuvePurge(preuve, iso(lib)).length === 0, 'preuve complète : rien ne manque');
ok(egal(manquesPreuvePurge({}, iso(lib)), [...CODES_PURGE]), 'preuve vide : les 11 manques, dans l\'ordre');
ok(manquesPreuvePurge({ ...preuve, faite_le: iso(lib - 1000) }, iso(lib)).includes('faite_apres_liberation'), 'preuve d\'AVANT la libération : refusée');
const controle = { fait_le: iso(T0 - 3600_000), ip_sortie: '10.0.0.1', pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok', leboncoin: 'ok' } };
ok(manquesControle(controle, ip({}), T0).length === 0, 'contrôle frais et bon');
ok(egal(manquesControle({}, ip({}), T0), [...CODES_CONTROLE]), 'contrôle vide : les 5 manques, dans l\'ordre');
ok(manquesControle({ ...controle, plateformes: { vinted: 'bloque' } }, ip({}), T0).includes('plateformes'), 'une plateforme qui bloque → refus');
const auRepos = ip({ etat: 'repos', liberee_le: iso(lib), repos_fin: iso(lib + 7 * J), purge_preuve: preuve, purge_prouvee_le: iso(lib + 60_000), derniere_origine: 'client' });
ok(peutRemettreEnPool(auRepos, controle, T0).ok, 'repos fini + purge prouvée + contrôle → disponible, MÊME pour un ancien client (05/10)');
ok(peutRemettreEnPool(auRepos, controle, lib + 6 * J).manques.includes('repos_en_cours'), 'avant 7 jours de repos → refus');
ok(peutRemettreEnPool({ ...auRepos, purge_prouvee_le: null }, controle, T0).manques.includes('purge_non_prouvee'), 'sans preuve → refus');

// ─────────────────────────────────────────────────────────────────────────────
titre('5. Signalement');
ok(qualifierSignalement({ observation: { nature: 'blocage', plateforme: 'beebs' }, temoins: { beebs: 0 } }).environnement === true, 'Beebs bloque partout → l\'environnement, aucune IP jetée');
ok(qualifierSignalement({ observation: { nature: 'blocage', plateforme: 'vinted' }, temoins: { vinted: 2 } }).critere === 'blocage_anti_robot', 'bloquée alors que 2 autres IP passent → rebut');
const capt = [{ nature: 'captcha', plateforme: 'vinted', le: iso(T0 - 3600_000) }, { nature: 'captcha', plateforme: 'vinted', le: iso(T0 - 7200_000) }];
ok(qualifierSignalement({ observation: { nature: 'captcha', plateforme: 'vinted' }, historique: capt, maintenant: T0 }).critere === 'captcha_repete', '3e captcha en 24 h → rebut');
ok(qualifierSignalement({ observation: { nature: 'restriction' } }).critere === 'compte_restreint', 'compte restreint → rebut dès le premier');

// ─────────────────────────────────────────────────────────────────────────────
titre('6. Taille du pool, plan, alertes');
ok(lambdaMesure(0) === PARAMETRES.lambdaMin && lambdaMesure(14) === 2, 'λ = essais sur 7 j / 7, plancher 0,5');
const t0 = taillePoolCible({ lambda: 1, conversion: 0.25, clients: 10, departsClientsJour: 0.1 });
// essais 7 + grâce 1,5 + repos (0,75 + 0,1) × 7 = 5,95 → 14,45 → 15 ; sécurité λ=1, H=1,04 : 1,04 + 1,65·1,02 = 2,72 → 3
ok(t0.clients === 10 && t0.enCycle === 15 && t0.securite === 3 && t0.total === 28, 'λ=1/j, c=25 %, 10 clients, 0,1 départ/j → 28 IP (10 + 15 + 3)');
ok(t0.coutMensuelUsd === 151.2, '…151,20 $ / mois');
const plan = planDuJour({
  ips: [ip({ id: 1, etat: 'attribuee_client', user_id: 'u', expire_le: iso(T0 + 2 * J) }),
        ip({ id: 2, etat: 'rebut', expire_le: iso(T0 + 2 * J) }),
        ip({ id: 3, etat: 'repos', repos_fin: iso(T0 + 20 * J), expire_le: iso(T0 + 2 * J) }),
        ip({ id: 4, expire_le: iso(T0 + 20 * J) })],
  lambda: 0.5, maintenant: T0,
});
ok(plan.renouveler.includes(1), 'IP d\'un client à 2 j de l\'échéance → renouvelée');
ok(plan.laisserExpirer.includes(2) && plan.laisserExpirer.includes(3), 'rebut et repos qui ne sera pas prêt à temps → expirent');
ok(plan.aCommander >= 0 && typeof plan.niveau !== 'undefined', 'aCommander est une PROPOSITION (aucun achat sans GO)');
ok(niveauPool({ attribuables: 0, seuilAlerte: 2 }) === 'vide' && niveauPool({ attribuables: 1, seuilAlerte: 2 }) === 'presque_vide', 'niveaux vide / presque vide');
ok(deciderAlerte({ niveau: null, sansPlace: 1 }).niveau === 'sans_place', 'un compte actif sans IP → alerte IMMÉDIATE « sans_place »');
ok(deciderAlerte({ niveau: 'vide', maintenant: T0 }).action === 'alerte', 'pool vide → alerte');
ok(deciderAlerte({ niveau: 'vide', derniereAlerte: { le: iso(T0 - 10 * 60_000), niveau: 'vide' }, maintenant: T0 }).action === null, '…pas de rappel avant 1 h');
ok(deciderAlerte({ niveau: null, derniereAlerte: { le: iso(T0 - J) }, attribuables: 3, seuilCommande: 2, maintenant: T0 }).action === 'retabli', 'pool rétabli → « rétabli »');

// ─────────────────────────────────────────────────────────────────────────────
titre('7. L\'essai unique — préparation (avant le paiement), carte');
ok(verdictPreparation({ profil: null }).raison === 'compte_inconnu', 'compte inconnu → refus');
ok(verdictPreparation({ profil: { is_cloud: true }, placeLibre: true }).raison === 'deja_client', 'déjà client → refus');
ok(verdictPreparation({ profil: {}, placeLibre: false, appareil: 'x' }).raison === 'pool_vide', 'pool vide → refus (le nouvel essai ATTEND)');
const vu = new Set(['appareil|appareil:dev-1', 'compte_plateforme|vinted:250623918']);
ok(egal(verdictPreparation({ profil: { cloud_essai_debut: iso(T0) }, placeLibre: true, appareil: 'dev-9' }), { ok: true, essai: false, raison: 'essai_deja_pris' }), 'essai déjà pris → option possible, sans essai');
ok(verdictPreparation({ profil: {}, placeLibre: true, appareil: ' DEV-1 ', empreintesVues: vu }).raison === 'appareil_deja_vu', 'même appareil (normalisé) → sans essai');
ok(verdictPreparation({ profil: {}, placeLibre: true, appareil: 'dev-2', comptes: [{ plateforme: 'vinted', identifiant: '250623918' }], empreintesVues: vu }).raison === 'compte_plateforme_deja_vu', 'même compte Vinted → sans essai');
ok(egal(verdictPreparation({ profil: {}, placeLibre: true, appareil: 'dev-2', empreintesVues: vu }), { ok: true, essai: true, raison: null }), 'tout neuf → essai permis');
ok(verdictCarte({ userId: 'u', carte: '' }).raison === 'carte_absente', 'sans carte → refus');
ok(verdictCarte({ userId: 'u', carte: 'fp', proprietaireEmpreinte: 'u' }).deja_note === true, 'rejeu même compte → accepté');
ok(verdictCarte({ userId: 'u', carte: 'fp', proprietaireEmpreinte: 'v' }).raison === 'carte_deja_vue', 'carte d\'un autre essai → refus');

// ─────────────────────────────────────────────────────────────────────────────
titre('8. Coûts et capacité (IP dédiée)');
const c25 = coutParEssai({ conversion: 0.25 });
ok(c25.nonConverti.joursIp === 16 && c25.converti.joursIp === 7, 'essai non converti : 16 j d\'IP (7 + 2 de grâce + 7 de repos) ; converti : 7 j');
ok(c25.nonConverti.ipEur === 2.48 && c25.converti.ipEur === 1.08, 'IP : 2,48 € (non converti), 1,08 € (converti) à 5,40 $ / 30 j');
ok(c25.serveurMesure === false, 'le serveur est ESTIMÉ tant qu\'il n\'a pas tourné (dit, jamais caché)');
const mS = margeParClient({ canal: 'stripe' });
ok(mS.ipEur === 4.64 && mS.netEur === 15.98, 'client Stripe : 15,98 € nets, IP 4,64 €/mois');
ok(mS.margeEur > 10 && mS.margeEur < 11, `marge d'un client Stripe ≈ ${mS.margeEur} €/mois (IP + serveur + base déduits)`);
ok(fraisPaiement({ canal: 'apple' }).netEur === 14.17, 'Apple (15 %) : 14,17 € nets');
const cap = capacite({ serveurs: 1 });
ok(cap.comptesMax === 20 && capacite({ comptes: 45 }).serveursPour === 3, 'un CX43 ≈ 20 comptes en continu (estimé) ; 45 comptes → 3 serveurs');
ok(capacite({ comptes: 100 }).cpuBasePctMax === 25, '100 comptes en continu → jusqu\'à +25 % de CPU de base (Small) : le délai entre sessions compte');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
