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
ok(PRIX_AFFICHE === CLOUD_PRIX_AFFICHE && PRIX_AFFICHE === '24,99 €' && PARAMETRES.prixTtcEur === 24.99, '24,99 € TTC partout (app, règles, coûts)');
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
ok(mS.ipEur === 4.64 && mS.netEur === 20.03, 'client Stripe : 20,03 € nets, IP 4,64 €/mois');
ok(mS.margeEur > 14 && mS.margeEur < 15, `marge d'un client Stripe ≈ ${mS.margeEur} €/mois (IP + serveur + base déduits)`);
ok(fraisPaiement({ canal: 'apple' }).netEur === 17.7, 'Apple (15 %) : 17,70 € nets');
const cap = capacite({ serveurs: 1 });
ok(cap.comptesMax === 20 && capacite({ comptes: 45 }).serveursPour === 3, 'un CX43 ≈ 20 comptes en continu (estimé) ; 45 comptes → 3 serveurs');
ok(capacite({ comptes: 100 }).cpuBasePctMax === 25, '100 comptes en continu → jusqu\'à +25 % de CPU de base (Small) : le délai entre sessions compte');

// ─────────────────────────────────────────────────────────────────────────────
titre('10. (03/11, point 2 de Nico) L\'approvisionnement : stock minimum, refus par plateforme, triple garde');
{
  const M = await import('../supabase/functions/_shared/cloud-pool.js');
  const sqlAppro = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261103202000_cloud_ip_approvisionnement.sql', import.meta.url)), 'utf8');
  // (07/11, décision 1 de Nico) Le stock visé = la MARGE (cloud_ip_marge, 3) + une IP par personne qui attend ; le λ ne
  // fixe plus la cible d'achat.
  ok(M.stockVise({ marge: 2 }) === 2 && M.stockVise({ marge: 3, enAttente: 1 }) === 4 && M.stockVise({}) === M.PARAMETRES.ipMarge && M.PARAMETRES.ipMarge === 3,
    'le stock visé = la marge (3 par défaut), plus une IP par personne qui attend');
  const d = (id, refus) => ({ id, etat: 'disponible', expire_le: iso(T0 + 25 * J), attributions: 0, refus });
  const pl = M.planDuJour({ ips: [d(1, { beebs: { prouvee: true } }), d(2, {})], lambda: 0.5, marge: 2, maintenant: T0 });
  ok(pl.projete === 1 && pl.aCommander === 1 && pl.attribuables === 1, 'une IP au refus PROUVÉ ne compte pas dans le stock');
  // (04/11 soir, décision de Nico) Refus NON prouvé : plus jamais renouvelée, sauf réservée (l'IP du retour d'un compte).
  const e = (id, refus, x = {}) => ({ id, etat: 'disponible', expire_le: iso(T0 + 2 * J), attributions: 0, refus, ...x });
  const pr = M.planDuJour({ ips: [e(1, { beebs: { prouvee: false } }), e(2, { beebs: { prouvee: false } }, { reserve_pour: 'u', reserve_jusqu_au: iso(T0 + 2 * J) }),
    e(3, {}), e(4, { beebs: { prouvee: false } }, { reserve_pour: 'v', reserve_jusqu_au: iso(T0 - J) }),
    { ...e(5, { beebs: { prouvee: false } }), etat: 'attribuee_client', user_id: 'w' }], lambda: 0.5, marge: 3, maintenant: T0 });
  ok(pr.laisserExpirer.includes(1) && pr.laisserExpirer.includes(4) && !pr.renouveler.includes(1) && !pr.renouveler.includes(4),
    'une IP au refus NON prouvé (ou à la réservation échue) n\'est plus renouvelée');
  ok(pr.renouveler.includes(2) && pr.renouveler.includes(3) && pr.renouveler.includes(5),
    '…sauf réservée à un compte ; une IP saine et une IP attribuée le restent');
  ok(M.refusee({ beebs: {} }) && !M.refusee({}) && !M.refusee(null), 'refusee : au moins une plateforme');
  ok(M.choisirIp([d(1, { beebs: { prouvee: false } }), d(2, {})], { userId: 'u', maintenant: T0 }).id === 2, 'attribution : sans refus d\'abord');
  ok(M.effetSignalement('blocage_anti_robot') === 'refus_plateforme' && M.effetSignalement('liste_noire') === 'rebut',
    'un blocage de plateforme = un refus sur ELLE ; les causes prouvées restent des rebuts');
  ok(/IF p_critere IN \('blocage_anti_robot', 'captcha_repete'\) THEN/.test(sqlAppro), 'SQL : cloud_ip_signaler dit la même chose');
  // (07/11, décision 2 de Nico) Plus de plafond en dollars : la garde du NOMBRE pour l'achat, l'anti-boucle pour la prolongation.
  const garde = M.gardePour({ vivantes: 1, en_commande: 0, comptes: 1, marge: 3, attente: 0 }, 3);
  const g = { montantUsd: 29.4, envAutorise: true, interrupteur: true, garde, soldeUsd: 50 };
  ok(M.deciderDepense(g).faire === true && M.deciderDepense({ ...g, envAutorise: false }).raison === 'achats_coupes_serveur'
    && M.deciderDepense({ ...g, interrupteur: false }).raison === 'interrupteur_coupe'
    && M.deciderDepense({ ...g, garde: M.gardePour(garde, 4) }).raison === 'garde_nombre'
    && M.deciderDepense({ ...g, garde: null }).raison === 'garde_illisible'
    && M.deciderDepense({ ...g, depenseMoisUsd: 5000, budgetUsd: 60 }).faire === true
    && M.deciderDepense({ ...g, soldeUsd: 3 }).raison === 'solde_insuffisant' && M.deciderDepense({ ...g, soldeUsd: 3, paiement: 'carte' }).faire === true,
    'une dépense ne part que sous ses gardes (serveur, interrupteur, NOMBRE) et si le solde la couvre (ou par carte) — aucun plafond en dollars');
  ok(M.deciderDepense({ montantUsd: 4, envAutorise: true, interrupteur: true, soldeUsd: 50 }).faire === true
    && M.deciderDepense({ montantUsd: 4, envAutorise: true, interrupteur: true, soldeUsd: 50, dejaProlongee: true }).raison === 'prolongation_recente',
    'une prolongation n\'est jamais bornée par le nombre ; seule une deuxième prolongation en 15 jours est refusée');
  const pg = M.planDuJour({ ips: [{ ...d(9, {}), etat: 'attribuee_client', user_id: 'u' }], lambda: 0.5, marge: 3, comptesSansPlace: 0, maintenant: T0 });
  ok(pg.aCommander === 3 && pg.garde?.ok === true && pg.garde.comptees === 4 && pg.garde.borne === 4,
    'le plan porte sa garde : un achat que le plan demande passe toujours (1 compte, marge 3 : 3 IP, comptées 4 = borne 4)');
  ok(/\('cloud_ip_achats_auto', 0\)/.test(sqlAppro) && /\('cloud_ip_renouvellement_auto', 0\)/.test(sqlAppro),
    'SQL : les interrupteurs d\'achat et de renouvellement naissent COUPÉS');
  const sql07 = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261107180000_cloud_ip_marge_garde_nombre.sql', import.meta.url)), 'utf8');
  ok(new RegExp(`\\('cloud_ip_marge', ${M.PARAMETRES.ipMarge}\\)`).test(sql07) && new RegExp(`cloud_param\\('ip_marge', ${M.PARAMETRES.ipMarge}\\)`).test(sql07)
    && !/cloud_param\('ip_budget_mensuel_usd'/.test(sql07) && /\('cloud_ip_paiement_carte', 0\)/.test(sql07),
    `SQL (07/11) : marge ${M.PARAMETRES.ipMarge} — même défaut que PARAMETRES ; plus de plafond en dollars ; paiement né au solde`);
}

// ─────────────────────────────────────────────────────────────────────────────
titre('11. (07/11 soir, ordres 3 et 4 de Nico) La santé des IP libres et la règle « saines d\'abord »');
{
  const M = await import('../supabase/functions/_shared/cloud-pool.js');
  const T = Date.parse('2026-11-07T17:00:00Z');
  const S = (verdict, x = {}) => ({ version: 1, verdict, le: iso(T - 3600_000), ...(verdict === 'saine' ? { saine_le: iso(T - 3600_000) } : {}), ...x });
  const lib = (id, jours, x = {}) => ({ id, commande: `c${id}`, ip: `10.1.0.${id}`, etat: 'disponible', attributions: 1, refus: {}, expire_le: iso(T + jours * J), ...x });
  const plan = (ips, o = {}) => M.planDuJour({ ips, lambda: 0.5, marge: 3, sainesSeulement: true, maintenant: T, ...o });
  // Règle coupée : le plan d'avant (prouvé mot pour mot sur 20 000 pools au hasard contre le HEAD), à une ligne près.
  const g0 = M.planDuJour({ ips: [lib(1, 5, { sante: S('grillee') }), lib(2, 5)], lambda: 0.5, marge: 3, maintenant: T });
  ok(g0.laisserExpirer.includes(1) && g0.renouveler.includes(2) && g0.sainesSeulement === false,
    'règle coupée : le plan d\'avant ; une IP GRILLÉE n\'y est jamais renouvelée (la seule différence, et seulement avec une santé en base)');
  // Clients et réservée : toujours renouvelées.
  const c1 = plan([{ ...lib(42, 2), etat: 'attribuee_client', user_id: 'nico' }, lib(39, 2.5, { reserve_pour: 'nico', reserve_jusqu_au: iso(T + 26 * J),
    refus: { beebs: { prouvee: false, le: iso(T - 4 * J) } }, sante: S('grillee') }),
  lib(1, 25, { sante: S('saine') }), lib(2, 25, { sante: S('saine') }), lib(3, 25, { sante: S('saine') }), lib(4, 25, { sante: S('saine') })]);
  ok(c1.renouveler.includes(42) && c1.raisons[42] === 'attribuee', 'client : renouvelée avant son échéance, comme toujours');
  ok(c1.renouveler.includes(39) && c1.raisons[39] === 'reservee',
    'réservée (l\'IP gardée de Nico) : TOUJOURS renouvelée — même en surplus, même au refus non prouvé, même jugée grillée');
  // Saines > marge : seules les meilleures, jusqu'à la marge.
  const s1 = plan([lib(1, 9, { sante: S('saine') }), lib(2, 8, { sante: S('saine'), attributions: 0 }), lib(3, 9.5, { sante: S('saine') }),
    lib(4, 9.2, { sante: S('saine') }), lib(5, 25, { sante: S('saine') })]);
  ok(s1.projeteSaines === 3 && s1.renouveler.length === 2 && s1.renouveler.includes(2) && s1.renouveler.includes(1)
    && s1.laisserExpirer.includes(4) && s1.laisserExpirer.includes(3) && s1.raisons[3] === 'saine_en_surplus',
    'saines EN SURPLUS : la 5 vit (25 j) ; on renouvelle les meilleures (la moins usée, puis la plus proche) jusqu\'à 3 saines libres ; les autres expirent');
  // Saines < marge : toutes les saines, et l'achat de ce qui manque.
  const s2 = plan([lib(1, 9, { sante: S('saine') }), lib(2, 8, { sante: S('saine') })], { comptesSansPlace: 0 });
  ok(s2.renouveler.length === 2 && s2.aCommander === 1 && s2.garde?.ok === true,
    'saines SOUS la marge : toutes renouvelées, l\'achat demande ce qui manque (1) — et la garde du nombre l\'accepte');
  // Grillée : jamais renouvelée, jamais comptée ; la marge se reconstitue par l'achat.
  const s3 = plan([lib(1, 25, { sante: S('saine') }), lib(2, 25, { sante: S('saine') }), lib(40, 25, { sante: S('grillee') }), lib(41, 2, { sante: S('grillee') })],
    { comptesSansPlace: 0 });
  ok(s3.projete === 2 && s3.projeteSaines === 2 && s3.aCommander === 1 && s3.laisserExpirer.includes(41) && !s3.renouveler.includes(40)
    && s3.garde.vivantes === 2 && s3.garde.ok === true,
    'GRILLÉE : ni renouvelée, ni comptée dans la marge, ni dans la garde → l\'achat reconstitue la marge (1) et passe la garde');
  ok(!M.ipAttribuable(lib(40, 25, { sante: S('grillee') }), { maintenant: T }) && M.ipAttribuable(lib(40, 25, { sante: S('suspecte') }), { maintenant: T })
    && !M.ipAttribuable({ ...lib(77, 25, { sante: S('grillee') }), etat: 'repos', dernier_user_id: 'u', repos_fin: iso(T - J) }, { userId: 'u', maintenant: T }),
    'attribution : jamais une grillée (même au repos pour son dernier titulaire) ; une suspecte, encore');
  // Santé inconnue : contrôlée en priorité ; sans preuve à J-2, pas renouvelée.
  const s4 = plan([lib(1, 2.5), lib(2, 1.5), lib(3, 2.5, { sante: S('suspecte', { suspecte_le: iso(T - 3600_000), echecs: ['ebay'] }) }),
    lib(4, 2.5, { sante: S('saine', { saine_le: iso(T - 40 * 3600_000) }) })]);
  ok(s4.attendre.includes(1) && s4.aControler.includes(1) && s4.laisserExpirer.includes(2) && s4.raisons[2] === 'inconnue_sans_preuve'
    && s4.aControler.includes(3) && s4.aControler.includes(4) && s4.renouveler.length === 0,
    'INCONNUE / suspecte / saine trop vieille (40 h) : jamais comptée saine — à contrôler en priorité avant J-2, puis elle expire à son terme');
  // Refus non prouvé : contredit par un contrôle sain POSTÉRIEUR seulement.
  const r1 = plan([lib(1, 8, { sante: S('saine'), refus: { beebs: { prouvee: false, le: iso(T - 4 * J) } } }),
    lib(2, 8, { sante: S('saine'), refus: { beebs: { prouvee: false, le: iso(T - 60_000) } } })]);
  ok(r1.renouveler.includes(1) && r1.laisserExpirer.includes(2) && r1.raisons[2] === 'refus_non_prouve',
    'refus Beebs non prouvé du 03/11 puis contrôle sain : renouvelable ; refus noté APRÈS le dernier contrôle sain : la règle du 04/11 (pas renouvelée)');
  // L'attente élargit la cible.
  const a1 = plan([lib(1, 8, { sante: S('saine') }), lib(2, 8, { sante: S('saine') }), lib(3, 8, { sante: S('saine') }), lib(4, 8, { sante: S('saine') })], { enAttente: 1 });
  ok(a1.vise === 4 && a1.renouveler.length === 4, 'personnes en attente : la cible = marge + attente (4), comme gardeNombre et l\'achat');
  // Propriété : dans la règle « saines », un achat demandé passe toujours la garde (JS) ; jamais une grillée renouvelée.
  let graine = 5; const h = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; }; const t = (k) => Math.floor(h() * k);
  let proprietes = 0, achats = 0, grilleesRenouvelees = 0, attribueesOubliees = 0;
  for (let k = 0; k < 3000; k++) {
    const ips = [];
    for (let i = 0; i < t(12); i++) {
      const etat = ['achetee', 'disponible', 'disponible', 'attribuee_essai', 'attribuee_client', 'repos', 'rebut'][t(7)];
      ips.push(lib(i + 1, t(38) - 2 + 0.5, { etat, user_id: etat.startsWith('attribuee') ? `u${i}` : null, attributions: t(8),
        repos_fin: etat === 'repos' ? iso(T + (t(5) - 1) * J) : null, refus: [{}, {}, { beebs: { prouvee: false, le: iso(T - 4 * J) } }, { vinted: { prouvee: true } }][t(4)],
        sante: [null, S('saine'), S('suspecte', { echecs: ['ebay'] }), S('grillee'), S('inconnue')][t(5)],
        ...(h() < 0.15 ? { reserve_pour: 'r', reserve_jusqu_au: iso(T + J) } : {}) }));
    }
    const p = plan(ips, { marge: t(5), enAttente: t(3), commandesEnCours: t(3), comptesSansPlace: t(3) });
    if (p.aCommander > 0) { achats++; if (M.gardePour(p.garde, p.aCommander).ok) proprietes++; } else proprietes++;
    if (p.renouveler.some((id) => { const x = ips.find((y) => y.id === id); return M.grillee(x) && !M.reservee(x, T) && !x.etat.startsWith('attribuee'); })) grilleesRenouvelees++;
    if (ips.some((x) => x.etat.startsWith('attribuee') && Date.parse(x.expire_le) - T <= 3 * J && !p.renouveler.includes(x.id))) attribueesOubliees++;
  }
  ok(proprietes === 3000 && achats > 300 && grilleesRenouvelees === 0 && attribueesOubliees === 0,
    `3 000 pools au hasard (${achats} achats) : un achat demandé passe toujours la garde ; jamais une grillée libre renouvelée ; jamais une IP de client oubliée`);
  // La santé : un échec relu une 2e fois, 30 min au moins après le 1er.
  const c0 = M.santeSuivante(null, { fait_le: iso(T), echecs: ['ebay'], inconnus: [] });
  const cTot = M.santeSuivante(c0, { fait_le: iso(T + 10 * 60_000), echecs: ['ebay'], inconnus: [] });
  const cG = M.santeSuivante(c0, { fait_le: iso(T + 31 * 60_000), echecs: ['ebay', 'sortie:hebergeur'], inconnus: [] });
  const cAutre = M.santeSuivante(c0, { fait_le: iso(T + 31 * 60_000), echecs: ['vinted'], inconnus: [] });
  const cLeve = M.santeSuivante(c0, { fait_le: iso(T + 31 * 60_000), echecs: [], inconnus: [] });
  const cMuet = M.santeSuivante(c0, { fait_le: iso(T + 31 * 60_000), echecs: [], inconnus: ['ebay'] });
  ok(c0.verdict === 'suspecte' && cTot.verdict === 'suspecte' && cTot.suspecte_le === c0.suspecte_le && cG.verdict === 'grillee' && egal(cG.echecs, ['ebay'])
    && cAutre.verdict === 'suspecte' && cAutre.suspecte_le === iso(T + 31 * 60_000) && cLeve.verdict === 'saine' && cMuet.verdict === 'suspecte',
    'un échec → suspecte ; relu trop tôt → suspecte ; le MÊME relu 31 min après → grillée ; un autre → suspecte à nouveau ; levé → saine ; muet → reste suspecte');
  const gS = M.santeSuivante(cG, { fait_le: iso(T + 2 * J), echecs: [], inconnus: [] });
  const sM = M.santeSuivante(M.santeSuivante(null, { fait_le: iso(T), echecs: [], inconnus: [] }), { fait_le: iso(T + J), echecs: [], inconnus: ['depop'] });
  ok(gS.verdict === 'grillee' && sM.verdict === 'saine' && sM.saine_le === iso(T) && M.santeConnue({ sante: sM }, T + 30 * 3600_000) === 'saine'
    && M.santeConnue({ sante: sM }, T + 37 * 3600_000) === 'inconnue' && M.santeConnue({}, T) === 'inconnue',
    'grillée = définitif ; un contrôle muet garde « saine » sans la rafraîchir : elle vaut 36 h, puis inconnue');
  // L'IP à contrôler.
  const pool = [lib(1, 20, { sante: S('saine', { le: iso(T - 21 * 3600_000), saine_le: iso(T - 21 * 3600_000) }) }), lib(2, 25),
    lib(3, 22, { sante: S('suspecte', { le: iso(T - 40 * 60_000), suspecte_le: iso(T - 40 * 60_000), echecs: ['ebay'] }) }),
    lib(4, 20, { sante: S('saine') }), lib(39, 26, { reserve_pour: 'nico', reserve_jusqu_au: iso(T + 26 * J) }), { ...lib(42, 27), etat: 'attribuee_client', user_id: 'nico' },
    lib(40, 26, { sante: S('grillee') }), lib(6, 0.02), lib(7, 20, { etat: 'achetee' })];
  const o1 = M.choisirIpASonder(pool, { maintenant: T });
  const o2 = M.choisirIpASonder(pool.filter((x) => x.id !== 3), { maintenant: T });
  const o3 = M.choisirIpASonder(pool.filter((x) => ![2, 3, 7].includes(x.id)), { maintenant: T });
  const o4 = M.choisirIpASonder(pool.filter((x) => ![1, 2, 3, 7].includes(x.id)), { maintenant: T });
  const o5 = M.choisirIpASonder(pool, { maintenant: T, permise: (x) => x.id === 4, enUsage: [] });
  ok(o1.ip.id === 3 && o1.raison === 'confirmation' && o2.ip.id === 7 && o2.raison === 'jamais_controlee' && o3.ip.id === 1 && o3.raison === 'periodique'
    && o4 === null && o5 === null && M.choisirIpASonder(pool, { maintenant: T, enUsage: [3, 7, 2, 1] }) === null,
    'à contrôler : la suspecte (2e lecture) d\'abord, puis la jamais contrôlée (l\'échéance la plus proche), puis la plus vieille (20 h) ; jamais la réservée, l\'attribuée, la grillée, celle qui expire dans l\'heure, une sortie fermée ou une IP en usage');
  const b = M.bilanSante(pool, { marge: 3, maintenant: T });
  ok(b.libres === 6 && b.saines === 2 && b.suspectes === 1 && b.grillees === 1 && b.inconnues === 2 && b.sousMarge === false
    && M.bilanSante(pool.filter((x) => ![2, 7].includes(x.id) && x.id !== 1), { marge: 3, maintenant: T }).sousMarge === true,
    'bilan des libres (hors réservée, attribuée, échéance sous 3 j) : sous la marge quand même les inconnues ne la rempliraient pas');
  // La projection sur le pool relu en prod le 07/11 à 17:59 et la vérification manuelle de 17:26-17:40.
  const L = Date.parse('2026-11-07T16:59:00Z');
  const B = { beebs: { prouvee: false, le: '2026-11-03T15:37:37Z' } };
  const sain = { verdict: 'saine', saine_le: '2026-11-07T16:40:00Z', le: '2026-11-07T16:40:00Z' };
  const prod = [
    { id: 1, commande: '84458881', etat: 'disponible', attributions: 1, expire_le: '2026-12-04T12:57:45Z', refus: B, sante: sain },
    { id: 2, commande: '86965910', etat: 'disponible', attributions: 0, expire_le: '2026-11-29T10:37:16Z', refus: B, sante: sain },
    { id: 3, commande: '87004978', etat: 'disponible', attributions: 1, expire_le: '2026-11-29T20:00:42Z', refus: B, sante: sain },
    { id: 4, commande: '87277315', etat: 'disponible', attributions: 1, expire_le: '2026-12-02T11:29:07Z', refus: B, sante: sain },
    { id: 39, commande: '87284262', etat: 'disponible', attributions: 1, expire_le: '2026-12-03T13:09:55Z', refus: B, sante: sain, reserve_pour: 'nico', reserve_jusqu_au: '2026-12-03T13:09:55Z' },
    { id: 40, commande: '87481742', etat: 'disponible', attributions: 1, expire_le: '2026-12-04T11:03:19Z', refus: B, sante: { verdict: 'grillee', le: '2026-11-07T16:40:00Z' } },
    { id: 41, commande: '87495735', etat: 'disponible', attributions: 1, expire_le: '2026-12-04T14:08:03Z', refus: B, sante: sain },
    { id: 42, commande: '87509051', etat: 'attribuee_client', user_id: 'nico', attributions: 1, expire_le: '2026-12-04T17:08:04Z', refus: {} },
  ];
  const proj = (sainesSeulement) => Object.fromEntries(M.projeterEcheances({ ips: prod, marge: 3, sainesSeulement, maintenant: L }).map((e) => [e.id, e.evenement]));
  const pr0 = proj(false); const pr1 = proj(true);
  ok(egal(pr1, { 1: 'expire', 2: 'renouvelee', 3: 'renouvelee', 4: 'renouvelee', 39: 'renouvelee', 40: 'expire', 41: 'expire', 42: 'renouvelee' })
    && egal(pr0, { 1: 'expire', 2: 'expire', 3: 'expire', 4: 'expire', 39: 'renouvelee', 40: 'expire', 41: 'expire', 42: 'renouvelee' }),
    'pool du 07/11 : « saines d\'abord » garde 2, 3, 4 (3 saines libres = la marge) + la 39 de Nico + le client 42, laisse expirer 1, 41 (surplus) et 40 (grillée) ; la règle d\'aujourd\'hui ne garde que 39 et 42');
  const sql = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261107190000_cloud_ip_sante.sql', import.meta.url)), 'utf8');
  ok(/\('cloud_ip_sante_controle', 0\)/.test(sql) && /\('cloud_ip_renouveler_saines_seulement', 0\)/.test(sql)
    && sql.split('\n').filter((l) => !/^\s*--/.test(l) && /AND COALESCE\((p|i)\.sante ->> 'verdict', ''\) <> 'grillee'/.test(l)).length === 2,
    'SQL (07/11 soir) : les deux réglages naissent à 0 ; attribuable et garde excluent la grillée (miroir de grillee())');
}

// ─────────────────────────────────────────────────────────────────────────────
titre('12. (07/11 soir, « la 3 est donnée en dernier ») L\'opérateur de sortie : l\'IP atypique en dernier');
{
  const M = await import('../supabase/functions/_shared/cloud-pool.js');
  const T = Date.parse('2026-11-07T19:30:00Z');
  const OP = (rang) => ({ as: ['5511', '6830', '2914'][rang], pays: ['FR', 'NL', 'US'][rang], registre: ['ripencc', 'ripencc', 'arin'][rang], rang });
  const S = (rang, x = {}) => ({ version: 1, verdict: 'saine', le: iso(T - 3600_000), saine_le: iso(T - 3600_000), ...(rang == null ? {} : { operateur: OP(rang) }), ...x });
  const lib = (id, jours, x = {}) => ({ id, commande: `c${id}`, etat: 'disponible', attributions: 1, refus: {}, expire_le: iso(T + jours * J), ...x });
  ok(M.rangOperateur({ sante: S(0) }) === 0 && M.rangOperateur({ sante: S(2) }) === 2 && M.rangOperateur({ sante: S(null) }) === 1 && M.rangOperateur({}) === 1
    && M.rangOperateur({ sante: { operateur: { rang: '2' } } }) === 1 && M.rangOperateur({ sante: { operateur: { rang: 7 } } }) === 1,
    'rang : 0 français, 1 européen, 2 hors d\'Europe ; inconnu ou illisible = 1 (au milieu), comme cloud_ip_rang_operateur');
  ok(!M.operateurAtypique({ sante: S(0) }) && M.operateurAtypique({ sante: S(1) }) && M.operateurAtypique({ sante: S(2) }) && !M.operateurAtypique({ sante: S(null) }),
    'atypique = opérateur connu et non français (Liberty Global NL, NTT America US) ; jamais sur un inconnu');
  ok(M.ipAttribuable(lib(3, 25, { sante: S(2) }), { maintenant: T }) && M.santeConnue({ sante: S(2) }, T) === 'saine',
    'une IP atypique reste SAINE et ATTRIBUABLE');
  // L'attribution : la 3 en dernier ; sans opérateur connu, l'ordre d'avant (prouvé contre le HEAD : 120 000 choix).
  const pool = [lib(2, 21.7, { sante: S(1) }), lib(3, 22.1, { sante: S(2) }), lib(4, 24.7, { sante: S(1) }), lib(1, 26.8, { sante: S(0) }), lib(41, 26.85, { sante: S(0) })];
  const suite = (ips) => { const l = ips.map((x) => ({ ...x })); const o = []; for (;;) { const x = M.choisirIp(l, { userId: `u${o.length}`, maintenant: T }); if (!x) break; o.push(x.id); x.etat = 'attribuee_essai'; x.user_id = `u${o.length - 1}`; } return o; };
  ok(egal(suite(pool), [1, 41, 2, 4, 3]) && egal(suite(pool.map((x) => ({ ...x, sante: S(null) }))), [2, 3, 4, 1, 41]),
    'attribution : 1, 41 (Orange FR), 2, 4 (Liberty NL), puis la 3 (NTT US) EN DERNIER ; sans opérateur connu : l\'échéance d\'abord, comme avant');
  ok(M.choisirIp([lib(1, 26, { sante: S(0), refus: { beebs: { prouvee: false } } }), lib(3, 22, { sante: S(2) })], { userId: 'u', maintenant: T }).id === 1
    && M.choisirIp([lib(1, 26, { sante: S(0), refus: { beebs: { prouvee: true } } }), lib(3, 22, { sante: S(2) })], { userId: 'u', maintenant: T }).id === 3
    && M.choisirIp([lib(3, 22, { sante: S(2), reserve_pour: 'u', reserve_jusqu_au: iso(T + J) }), lib(1, 26, { sante: S(0) })], { userId: 'u', maintenant: T }).id === 3,
    'l\'opérateur passe avant le refus non prouvé, après le refus PROUVÉ (dernier recours) et après SA réservation');
  // Le renouvellement « saines » : la saine atypique gardée en dernier.
  const r = M.planDuJour({ ips: [lib(1, 8, { sante: S(0) }), lib(3, 7, { sante: S(2), attributions: 0 }), lib(4, 8.5, { sante: S(1) }), lib(41, 9, { sante: S(0) })],
    lambda: 0.5, marge: 3, sainesSeulement: true, maintenant: T });
  ok(egal([...r.renouveler].sort(), [1, 4, 41]) && r.laisserExpirer.includes(3) && r.raisons[3] === 'saine_en_surplus',
    'renouvellement « saines » : la 3 (NTT, pourtant la moins usée et la plus proche) est la saine laissée en surplus — l\'opérateur d\'abord');
  const r0 = M.planDuJour({ ips: [lib(1, 8, { sante: S(0) }), lib(3, 7, { sante: S(2), attributions: 0 }), lib(4, 8.5, { sante: S(1) }), lib(41, 9, { sante: S(0) })],
    lambda: 0.5, marge: 3, maintenant: T });
  ok(r0.renouveler.includes(3), 'règle coupée : l\'ordre d\'avant (l\'opérateur ne range rien)');
  // La santé garde l'opérateur relevé ; un relevé illisible ne l'efface pas.
  const s1 = M.santeSuivante(null, { fait_le: iso(T), echecs: [], inconnus: [], operateur: OP(2) });
  const s2 = M.santeSuivante(s1, { fait_le: iso(T + J), echecs: [], inconnus: [], operateur: { as: '2914', rang: null } });
  const s3 = M.santeSuivante(s2, { fait_le: iso(T + 2 * J), echecs: ['ebay'], inconnus: [] });
  ok(s1.operateur.rang === 2 && s2.operateur.rang === 2 && s3.operateur.rang === 2 && s3.verdict === 'suspecte',
    'santeSuivante : l\'opérateur relevé est gardé ; un relevé illisible (DNS muet) ou absent ne l\'efface pas');
  // Le pool relu en prod le 07/11 ~19:30 (la 2 au repos jusqu'au 14/11), verdicts 1, 3, 4, 41 saines, 40 grillée, 39 réservée saine.
  const B = { beebs: { prouvee: false, le: '2026-11-03T15:37:37Z' } };
  const L = Date.parse('2026-11-07T18:30:00Z');
  const sain = (rang) => ({ verdict: 'saine', saine_le: '2026-11-07T18:30:00Z', le: '2026-11-07T18:30:00Z', operateur: OP(rang) });
  const prod = [
    { id: 1, commande: '84458881', etat: 'disponible', attributions: 1, expire_le: '2026-12-04T12:57:45Z', refus: B, sante: sain(0) },
    { id: 2, commande: '86965910', etat: 'repos', attributions: 1, dernier_user_id: 'nicotest', liberee_le: '2026-11-07T18:12:00Z', repos_fin: '2026-11-14T18:12:00Z',
      expire_le: '2026-11-29T10:37:16Z', refus: B },
    { id: 3, commande: '87004978', etat: 'disponible', attributions: 1, expire_le: '2026-11-29T20:00:42Z', refus: B, sante: sain(2) },
    { id: 4, commande: '87277315', etat: 'disponible', attributions: 1, expire_le: '2026-12-02T11:29:07Z', refus: B, sante: sain(1) },
    { id: 39, commande: '87284262', etat: 'disponible', attributions: 1, expire_le: '2026-12-03T13:09:55Z', refus: B, sante: sain(0), reserve_pour: 'nico', reserve_jusqu_au: '2026-12-03T13:09:55Z' },
    { id: 40, commande: '87481742', etat: 'disponible', attributions: 1, expire_le: '2026-12-04T11:03:19Z', refus: B, sante: { verdict: 'grillee', le: '2026-11-07T18:30:00Z', operateur: OP(2) } },
    { id: 41, commande: '87495735', etat: 'disponible', attributions: 1, expire_le: '2026-12-04T14:08:03Z', refus: B, sante: sain(0) },
    { id: 42, commande: '87509051', etat: 'attribuee_client', user_id: 'nico', attributions: 1, expire_le: '2026-12-04T17:08:04Z', refus: {} },
  ];
  const pr = Object.fromEntries(M.projeterEcheances({ ips: prod, marge: 3, sainesSeulement: true, maintenant: L }).map((e) => [e.id, e.evenement]));
  ok(egal(pr, { 1: 'renouvelee', 2: 'expire', 3: 'expire', 4: 'renouvelee', 39: 'renouvelee', 40: 'expire', 41: 'renouvelee', 42: 'renouvelee' }),
    'pool du 07/11 soir : 39 et le client 42 renouvelés ; la marge = 1, 41 (Orange) + 4 (Liberty) ; la 3 (NTT) expire, la 40 grillée expire, la 2 (au repos, santé inconnue) expire');
}

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
