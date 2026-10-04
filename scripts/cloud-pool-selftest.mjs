// Autotest du POOL D'IP FRANÇAISES de l'option FillSell Cloud (conception du 04/10/2026).
//
//     npm run selftest:cloud-pool      (node scripts/cloud-pool-selftest.mjs)
//
// Ce qu'il prouve, sans réseau ni base : le cycle de vie d'une IP (transitions
// permises et interdites), l'attribution (jamais une IP qui expire pendant
// l'essai, le même compte reprend la sienne, FEFO), la purge prouvée et la
// sortie de quarantaine, le rebut (critères mesurables, Beebs = environnement),
// la taille du pool et les seuils calculés depuis λ, le plan de renouvellement
// (surplus non renouvelé, client toujours), l'alerte, l'essai unique, les coûts.
// Et que la PROPOSITION SQL dit la même chose : durée d'essai, palier exigé,
// défauts de cloud_param, codes de preuve de purge et de contrôle — relus
// dans le texte de supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ESSAI_JOURS, EXIGE_UN_PALIER, PARAMETRES, ETATS, prochainEtat, couvertureJusqua, ipAttribuable, choisirIp,
  manquesPreuvePurge, CODES_PURGE, manquesControle, CODES_CONTROLE, peutRemettreEnPool, qualifierSignalement,
  CRITERES_REBUT, lambdaMesure, seuils, taillePoolCible, planDuJour, niveauPool, deciderAlerte,
  verdictOuvertureEssai, coutParEssai, fraisPaiement, margeParClient,
} from '../supabase/functions/_shared/cloud-pool.js';
import { CLOUD_ESSAI_JOURS, CLOUD_EXIGE_UN_PALIER, cloudDuProfil } from '../src/utils/palier.js';

let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const titre = (t) => console.log(`\n${t}`);

const J = 86_400_000;
const T0 = Date.parse('2026-10-05T10:00:00Z');
const iso = (t) => new Date(t).toISOString();
const ip = (o) => ({ id: 1, ip: '194.152.141.98', etat: 'disponible', attributions: 0, expire_le: iso(T0 + 30 * J), ...o });

// ─────────────────────────────────────────────────────────────────────────────
titre('0. Le contrat — mêmes valeurs que l\'app et que la proposition SQL');
ok(ESSAI_JOURS === CLOUD_ESSAI_JOURS, `durée d'essai = CLOUD_ESSAI_JOURS (${CLOUD_ESSAI_JOURS} j)`);
ok(EXIGE_UN_PALIER === CLOUD_EXIGE_UN_PALIER, `palier exigé = CLOUD_EXIGE_UN_PALIER (${CLOUD_EXIGE_UN_PALIER})`);
const sqlChemin = fileURLToPath(new URL('../supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt', import.meta.url));
const sql = readFileSync(sqlChemin, 'utf8');
const constantes = [...sql.matchAll(/c_exige_un_palier CONSTANT boolean := (true|false)/g)].map((m) => m[1] === 'true');
ok(constantes.length >= 3 && constantes.every((v) => v === CLOUD_EXIGE_UN_PALIER), `SQL : c_exige_un_palier = ${CLOUD_EXIGE_UN_PALIER} partout (${constantes.length} fonctions)`);
const durees = [...sql.matchAll(/make_interval\(days => (\d+)(?: \+|,|\))/g)].map((m) => Number(m[1]));
ok(durees.length >= 4 && durees.every((d) => d === CLOUD_ESSAI_JOURS), `SQL : chaque make_interval(days => N…) d'essai vaut ${CLOUD_ESSAI_JOURS} (${durees.length} occurrences)`);
const DEFAUTS = {
  grace_jours: PARAMETRES.graceJours, quarantaine_jours: PARAMETRES.quarantaineJours,
  marge_expiration_jours: PARAMETRES.margeExpirationJours, renouvellement_avant_jours: PARAMETRES.renouvellementAvantJours,
  attributions_max: PARAMETRES.attributionsMax, recycler_ip_client: PARAMETRES.recyclerIpClient ? 1 : 0,
};
for (const [cle, attendu] of Object.entries(DEFAUTS)) {
  const vus = [...sql.matchAll(new RegExp(`cloud_param\\('${cle}', (\\d+)\\)`, 'g'))].map((m) => Number(m[1]));
  ok(vus.length > 0 && vus.every((v) => v === attendu), `SQL : cloud_param('${cle}') a le défaut de PARAMETRES (${attendu}) — ${vus.length}×`);
}
const corps = (nom) => sql.slice(sql.indexOf(`FUNCTION public.${nom}(`), sql.indexOf('$f$;', sql.indexOf(`FUNCTION public.${nom}(`)));
const codesSql = (nom) => [...corps(nom).matchAll(/array_append\(m, '([a-z_]+)'\)/g)].map((m) => m[1]);
ok(egal(codesSql('cloud_purge_manques'), [...CODES_PURGE]), 'SQL : cloud_purge_manques — mêmes codes, même ordre que manquesPreuvePurge');
ok(egal(codesSql('cloud_controle_manques'), [...CODES_CONTROLE]), 'SQL : cloud_controle_manques — mêmes codes, même ordre que manquesControle');
const criteresSql = corps('cloud_ip_signaler').match(/p_critere NOT IN \(([^)]*)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
ok(egal(criteresSql, [...CRITERES_REBUT]), 'SQL : cloud_ip_signaler accepte exactement CRITERES_REBUT');
const etatsSql = sql.match(/CHECK \(etat IN \(([^)]*)\)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
ok(egal(etatsSql, [...ETATS]), 'SQL : les états de cloud_ips = ETATS');
ok(!/^\s*SELECT cron\.schedule/m.test(sql) && !/^\s*PERFORM cron\.schedule/m.test(sql), 'SQL : aucun cron.schedule exécutable (décrit en commentaire seulement)');
ok(/REVOKE ALL ON public\.cloud_ips FROM anon, authenticated/.test(sql) && /REVOKE ALL ON public\.cloud_essai_empreintes FROM anon, authenticated/.test(sql), 'SQL : tables serveur seul (REVOKE explicites)');
ok(!/password|mot_de_passe|proxy_url\s+text\s+NOT NULL/i.test(sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.cloud_ips'), sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS cloud_ips_un_titulaire'))), 'SQL : aucune colonne de secret dans cloud_ips (référence au vault seulement)');

// ─────────────────────────────────────────────────────────────────────────────
titre('1. Cycle de vie — transitions');
ok(prochainEtat('achetee', 'controle_ok') === 'disponible', 'achetée → disponible après le contrôle d\'entrée');
ok(prochainEtat('disponible', 'attribuer_essai') === 'attribuee_essai', 'disponible → attribuée (essai)');
ok(prochainEtat('attribuee_essai', 'convertir') === 'attribuee_client', 'essai converti → l\'IP reste au client');
ok(prochainEtat('attribuee_essai', 'liberer') === 'quarantaine', 'essai non converti → quarantaine');
ok(prochainEtat('quarantaine', 'sortir') === 'disponible', 'quarantaine → disponible (sur preuve)');
ok(prochainEtat('quarantaine', 'reprendre') === 'attribuee_client', 'le même compte revient payer → il reprend son IP');
ok(prochainEtat('quarantaine', 'signaler') === 'rebut', 'IP SIGNALÉE EN QUARANTAINE → rebut');
ok(prochainEtat('rebut', 'expirer') === 'expiree', 'rebut → expirée à l\'échéance (jamais renouvelée)');
ok(prochainEtat('rebut', 'renouveler') === null && prochainEtat('rebut', 'sortir') === null && prochainEtat('rebut', 'attribuer_essai') === null, 'rebut : ni renouvelée, ni remise en pool, ni attribuée');
ok(prochainEtat('attribuee_essai', 'expirer') === null && prochainEtat('attribuee_client', 'expirer') === null, 'une IP attribuée n\'expire JAMAIS sous son titulaire (interdit)');
ok(prochainEtat('disponible', 'liberer') === null && prochainEtat('quarantaine', 'attribuer_essai') === null, 'pas de libération d\'une IP libre ; pas d\'essai sur une IP en quarantaine');
ok(Object.keys({}).length === 0 && prochainEtat('expiree', 'renouveler') === null, 'expirée : terminal');

// ─────────────────────────────────────────────────────────────────────────────
titre('2. Attribution — jamais une IP qui expire pendant l\'essai');
const lim = couvertureJusqua({ nature: 'essai', maintenant: T0 });
ok(lim === T0 + 10 * J, 'un essai exige une IP payée jusqu\'à 7 j + 2 j de grâce + 1 j de marge');
ok(!ipAttribuable(ip({ expire_le: iso(T0 + 9 * J) }), { nature: 'essai', maintenant: T0 }), 'IP qui expire dans 9 j → refusée pour un essai');
ok(ipAttribuable(ip({ expire_le: iso(T0 + 10 * J) }), { nature: 'essai', maintenant: T0 }), 'IP qui expire dans 10 j pile → acceptée (borne incluse)');
ok(ipAttribuable(ip({ expire_le: iso(T0 + 9 * J) }), { nature: 'client', maintenant: T0 }), '…la même sert un client payant (il est renouvelé de toute façon)');
ok(!ipAttribuable(ip({ expire_le: iso(T0 + 2 * J) }), { nature: 'client', maintenant: T0 }), 'IP à 2 j de l\'échéance → refusée même à un client (moins que N = 3 j)');
ok(!ipAttribuable(ip({ attributions: 6 }), { nature: 'essai', maintenant: T0 }), 'IP usée (6 comptes) → plus attribuée');
ok(!ipAttribuable(ip({ etat: 'rebut', rebut_critere: 'liste_noire' }), { nature: 'client', maintenant: T0 }), 'IP au rebut → jamais attribuée');
ok(!ipAttribuable(ip({ etat: 'quarantaine', dernier_user_id: 'u-A' }), { nature: 'client', userId: 'u-B', maintenant: T0 }), 'IP en quarantaine → jamais à un AUTRE compte');
const pool = [
  ip({ id: 10, expire_le: iso(T0 + 25 * J) }),
  ip({ id: 11, expire_le: iso(T0 + 12 * J), attributions: 2 }),
  ip({ id: 12, expire_le: iso(T0 + 12 * J), attributions: 1 }),
  ip({ id: 13, expire_le: iso(T0 + 8 * J) }),
  ip({ id: 14, etat: 'attribuee_essai', user_id: 'u-X', expire_le: iso(T0 + 20 * J) }),
  ip({ id: 15, etat: 'quarantaine', dernier_user_id: 'u-A', liberee_le: iso(T0 - J), quarantaine_fin: iso(T0 + 13 * J), expire_le: iso(T0 + 20 * J) }),
];
ok(choisirIp(pool, { nature: 'essai', userId: 'u-N', maintenant: T0 })?.id === 12, 'FEFO : celle qui expire le plus tôt tout en couvrant, la moins usée à égalité (12, pas 13 qui expire pendant l\'essai)');
ok(choisirIp(pool, { nature: 'client', userId: 'u-A', maintenant: T0 })?.id === 15, 'le même compte revient → il reprend SA propre IP en quarantaine');
ok(choisirIp(pool, { nature: 'essai', userId: 'u-X', maintenant: T0 })?.id === 14, 'déjà titulaire → la même IP (idempotent), jamais une deuxième');
ok(choisirIp([], { nature: 'essai', userId: 'u-N', maintenant: T0 }) === null, 'POOL VIDE → null (l\'appelant met en file, jamais d\'erreur)');
ok(choisirIp(pool.filter((x) => x.id === 13 || x.id === 14), { nature: 'essai', userId: 'u-N', maintenant: T0 }) === null, 'pool sans IP couvrant l\'essai → null (13 expire pendant l\'essai, 14 a un titulaire)');

// ─────────────────────────────────────────────────────────────────────────────
titre('3. Purge prouvée et sortie de quarantaine');
const LIB = T0 - 15 * J;
const preuve = {
  version: 1, faite_le: iso(LIB + 600_000),
  profil: { ancien: 'prof-a', nouveau: 'prof-b', ancien_detruit: true, nouveau_cree_le: iso(LIB + 300_000) },
  cookies_restants: 0, stockages_restants: 0, coffre_restants: 0, session_fillsell_revoquee: true,
  empreinte: { ancienne: 'e1', nouvelle: 'e2' }, identifiants_proxy_renouveles: true,
};
ok(egal(manquesPreuvePurge(preuve, iso(LIB)), []), 'preuve complète → rien ne manque');
ok(egal(manquesPreuvePurge({ ...preuve, cookies_restants: 3 }, iso(LIB)), ['cookies_restants']), 'un cookie resté → refusée');
ok(egal(manquesPreuvePurge({ ...preuve, profil: { ...preuve.profil, nouveau: 'prof-a' } }, iso(LIB)), ['profil_recree']), 'même profil (non recréé) → refusée');
ok(egal(manquesPreuvePurge({ ...preuve, empreinte: { ancienne: 'e1', nouvelle: 'e1' } }, iso(LIB)), ['empreinte_nouvelle']), 'même empreinte de navigateur → refusée');
ok(manquesPreuvePurge({ ...preuve, faite_le: iso(LIB - 1000) }, iso(LIB)).includes('faite_apres_liberation'), 'preuve antérieure à la libération → refusée');
ok(egal(manquesPreuvePurge({ ...preuve, coffre_restants: undefined }, iso(LIB)), ['coffre_restants']), 'coffre non compté (absent ≠ 0) → refusée');
ok(egal(manquesPreuvePurge(null, iso(LIB)), [...CODES_PURGE]), 'aucune preuve → tout manque, dans l\'ordre');
const controle = { fait_le: iso(T0 - 3_600_000), ip_sortie: '194.152.141.98', pays: 'FR', listes_noires: [], plateformes: { vinted: 'ok', leboncoin: 'ok', ebay: 'ok' } };
const enQuar = ip({ etat: 'quarantaine', derniere_origine: 'essai', liberee_le: iso(LIB), quarantaine_fin: iso(LIB + 14 * J), purge_preuve: preuve, purge_prouvee_le: iso(LIB + 700_000), expire_le: iso(T0 + 20 * J) });
ok(peutRemettreEnPool(enQuar, controle, T0).ok, 'quarantaine finie + purge prouvée + contrôle frais → disponible');
ok(egal(peutRemettreEnPool(enQuar, controle, LIB + 13 * J).manques, ['quarantaine_en_cours', 'controle_frais']), 'avant la fin des 14 jours → refusée');
ok(egal(peutRemettreEnPool({ ...enQuar, purge_prouvee_le: null }, controle, T0).manques, ['purge_non_prouvee']), 'sans preuve de purge → refusée');
ok(egal(peutRemettreEnPool(enQuar, { ...controle, fait_le: iso(T0 - 25 * 3_600_000) }, T0).manques, ['controle_frais']), 'contrôle de plus de 24 h → refusé');
ok(egal(peutRemettreEnPool(enQuar, { ...controle, listes_noires: ['zen.spamhaus.org'] }, T0).manques, ['listes_noires']), 'IP en liste noire → refusée');
ok(egal(peutRemettreEnPool(enQuar, { ...controle, plateformes: { vinted: 'ok', leboncoin: 'bloque' } }, T0).manques, ['plateformes']), 'page Leboncoin bloquée → refusée');
ok(egal(peutRemettreEnPool({ ...enQuar, derniere_origine: 'client' }, controle, T0).manques, ['ancien_client']), 'IP d\'un ancien client payant → jamais à un autre compte');
ok(egal(peutRemettreEnPool({ ...enQuar, etat: 'rebut', rebut_critere: 'captcha_repete' }, controle, T0).manques, ['pas_en_quarantaine']), 'IP signalée en quarantaine (rebut) → jamais remise en pool');

// ─────────────────────────────────────────────────────────────────────────────
titre('4. Signalement → rebut : critères mesurables');
const t = (h) => iso(T0 - h * 3_600_000);
ok(qualifierSignalement({ observation: { nature: 'blocage', plateforme: 'beebs', le: t(0) }, temoins: { beebs: 0 }, maintenant: T0 }).environnement === true, 'Beebs bloque TOUT le Cloud (aucun témoin ne passe) → environnement, aucune IP jetée');
ok(qualifierSignalement({ observation: { nature: 'blocage', plateforme: 'vinted', le: t(0) }, temoins: { vinted: 2 }, maintenant: T0 }).critere === 'blocage_anti_robot', 'Vinted bloque cette IP alors que 2 autres passent → rebut');
ok(qualifierSignalement({ observation: { nature: 'captcha', plateforme: 'leboncoin', le: t(0) }, historique: [{ nature: 'captcha', plateforme: 'leboncoin', le: t(5) }], maintenant: T0 }).critere === null, '2 captchas en 24 h → pas encore');
ok(qualifierSignalement({ observation: { nature: 'captcha', plateforme: 'leboncoin', le: t(0) }, historique: [{ nature: 'captcha', plateforme: 'leboncoin', le: t(5) }, { nature: 'captcha', plateforme: 'leboncoin', le: t(20) }], maintenant: T0 }).critere === 'captcha_repete', '3 captchas sur la même plateforme en 24 h → rebut');
ok(qualifierSignalement({ observation: { nature: 'captcha', plateforme: 'leboncoin', le: t(0) }, historique: [{ nature: 'captcha', plateforme: 'leboncoin', le: t(25) }, { nature: 'captcha', plateforme: 'leboncoin', le: t(30) }], maintenant: T0 }).critere === null, 'captchas de plus de 24 h → ne comptent plus');
ok(qualifierSignalement({ observation: { nature: 'restriction', plateforme: 'vinted', le: t(0) }, maintenant: T0 }).critere === 'compte_restreint', 'un compte restreint → rebut tout de suite');
ok(qualifierSignalement({ observation: { nature: 'liste_noire', le: t(0) }, maintenant: T0 }).critere === 'liste_noire', 'liste noire publique → rebut');
ok(qualifierSignalement({ observation: { nature: 'sortie_ko', le: t(0) }, historique: [{ nature: 'sortie_ko', le: t(1) }, { nature: 'sortie_ok', le: t(2) }, { nature: 'sortie_ko', le: t(3) }], maintenant: T0 }).critere === null, 'sorties ratées : un succès entre deux remet à zéro');
ok(qualifierSignalement({ observation: { nature: 'sortie_ko', le: t(0) }, historique: [{ nature: 'sortie_ko', le: t(1) }, { nature: 'sortie_ko', le: t(2) }], maintenant: T0 }).critere === 'sortie_non_conforme', '3 sorties ratées d\'affilée → rebut');

// ─────────────────────────────────────────────────────────────────────────────
titre('5. Taille du pool et seuils — calculés depuis λ, jamais en dur');
ok(lambdaMesure(0) === PARAMETRES.lambdaMin && lambdaMesure(14) === 2, 'λ mesuré = demandes 7 j / 7, plancher 0,5');
const s05 = seuils({ lambda: 0 }), s2 = seuils({ lambda: 2 }), s20 = seuils({ lambda: 20 });
ok(s05.commande >= 1 && s05.alerte >= 1, `pool calme (λ plancher) : seuils ≥ 1 (commande ${s05.commande}, alerte ${s05.alerte})`);
ok(s2.commande > s05.commande && s20.commande > s2.commande && s20.alerte > s2.alerte, `seuils croissants avec λ (λ=2 : ${s2.commande}/${s2.alerte} ; λ=20 : ${s20.commande}/${s20.alerte})`);
const t2 = taillePoolCible({ lambda: 2, conversion: 0.25 });
ok(t2.enCycle === 38, `λ=2, c=25 % : ${t2.joursParEssai} j d'IP par essai → 38 IP en cycle`);
ok(taillePoolCible({ lambda: 5, conversion: 0.10 }).enCycle === 107, 'λ=5, c=10 % : 107 en cycle (pas 108 : le flottant 5 × 21,4 est tenu)');
ok(taillePoolCible({ lambda: 2, conversion: 0.25, p: { ...PARAMETRES, quarantaineJours: 7 } }).enCycle < t2.enCycle, 'une quarantaine plus courte réduit le pool');
ok(taillePoolCible({ lambda: 2, conversion: 1 }).enCycle === 14, 'tout converti : seule la semaine d\'essai occupe le pool');

// ─────────────────────────────────────────────────────────────────────────────
titre('6. Plan de l\'heure — renouveler, laisser expirer, commander');
const vide = planDuJour({ ips: [], lambda: 2, enAttente: 1, maintenant: T0 });
ok(vide.niveau === 'vide' && vide.aCommander === vide.vise && vide.aCommander === s2.commande + 1, `POOL VIDE avec 1 essai en file → alerte « vide », commander ${vide.aCommander}`);
ok(planDuJour({ ips: [], lambda: 2, enAttente: 0, commandesEnCours: 50, maintenant: T0 }).aCommander === 0, 'commandes en cours comptées → pas de double commande');
const surplus = Array.from({ length: 10 }, (_, i) => ip({ id: 100 + i, expire_le: iso(T0 + 2 * J) }));
const pS = planDuJour({ ips: surplus, lambda: 0.5, maintenant: T0 });
ok(pS.renouveler.length === pS.vise && pS.laisserExpirer.length === 10 - pS.vise && pS.aCommander === 0, `IP DISPONIBLES EN SURPLUS non renouvelées : ${pS.renouveler.length} gardées (le besoin), ${pS.laisserExpirer.length} laissées expirer`);
const pC = planDuJour({ ips: [ip({ id: 1, etat: 'attribuee_client', user_id: 'u-C', expire_le: iso(T0 + 2 * J) })], lambda: 0.5, maintenant: T0 });
ok(pC.renouveler.includes(1), 'IP de client payant à 2 j de l\'échéance → TOUJOURS renouvelée');
ok(planDuJour({ ips: [ip({ id: 1, etat: 'attribuee_client', user_id: 'u-C', expire_le: iso(T0 + 4 * J) })], lambda: 0.5, maintenant: T0 }).attendre.includes(1), '…à 4 j : on attend (N = 3 j)');
ok(planDuJour({ ips: [ip({ id: 1, etat: 'rebut', rebut_critere: 'liste_noire', expire_le: iso(T0 + J) })], lambda: 20, maintenant: T0 }).laisserExpirer.includes(1), 'IP au rebut → jamais renouvelée, même pool à sec');
const pU = planDuJour({ ips: [ip({ id: 1, attributions: 6, expire_le: iso(T0 + 2 * J) })], lambda: 2, maintenant: T0 });
ok(pU.laisserExpirer.includes(1) && pU.aCommander === pU.vise, 'IP usée → pas prolongée ; on commande du neuf à la place');
const pQ = planDuJour({ ips: [ip({ id: 1, etat: 'quarantaine', derniere_origine: 'essai', liberee_le: iso(T0 - J), quarantaine_fin: iso(T0 + 13 * J), expire_le: iso(T0 + 2 * J) })], lambda: 2, maintenant: T0 });
ok(pQ.laisserExpirer.includes(1), 'IP en quarantaine pour 13 j encore, échéance dans 2 j → pas de prolongation (payer sa quarantaine pour rien)');
const pD = planDuJour({ ips: [ip({ id: 1, expire_le: iso(T0 + 8 * J) })], lambda: 2, maintenant: T0 });
ok(pD.renouveler.includes(1), 'IP disponible qui ne couvre plus un essai (8 j < 10 j), et dont on a besoin → prolongée tout de suite');
ok(planDuJour({ ips: [ip({ id: 1, etat: 'quarantaine', derniere_origine: 'client', liberee_le: iso(T0 - J), quarantaine_fin: iso(T0), expire_le: iso(T0 + 2 * J) })], lambda: 20, maintenant: T0 }).laisserExpirer.includes(1), 'IP d\'ancien client → pas prolongée (elle attend son retour jusqu\'à l\'échéance)');

// Conversion le DERNIER jour : l'IP couvrait fin + grâce + marge, elle est renouvelée à temps.
const debut = T0, fin = T0 + 7 * J;
const ipEssai = ip({ id: 7, etat: 'attribuee_essai', user_id: 'u-L', expire_le: iso(debut + 10 * J) });
const profil = { is_premium: true, cloud_essai_debut: iso(debut), cloud_essai_fin: iso(fin) };
const avant = cloudDuProfil(profil, fin - 60_000);
ok(avant.etat === 'essai' && avant.joursRestants === 1, 'CONVERSION LE DERNIER JOUR — une minute avant la fin : « essai », J-1 (palier.js)');
ok(prochainEtat(ipEssai.etat, 'convertir') === 'attribuee_client', '…il paie : l\'IP de l\'essai devient la sienne');
ok(cloudDuProfil({ ...profil, is_cloud: true }, fin + J).etat === 'paye', '…et l\'état passe à « payé », même après la fin de l\'essai');
const ipConv = { ...ipEssai, etat: 'attribuee_client' };
ok(planDuJour({ ips: [ipConv], lambda: 0.5, maintenant: fin - 60_000 }).attendre.includes(7), '…au moment de payer : 3 j + 1 min d\'échéance → décision à l\'heure suivante');
ok(planDuJour({ ips: [ipConv], lambda: 0.5, maintenant: fin + 3_600_000 }).renouveler.includes(7), '…une heure plus tard (≤ 3 j) → renouvelée, plus de 2 j avant l\'échéance');
ok(planDuJour({ ips: [ipConv], lambda: 0.5, maintenant: fin + 1.5 * J }).renouveler.includes(7), 'conversion pendant la grâce (J+1,5) → renouvelée aussitôt');

// ─────────────────────────────────────────────────────────────────────────────
titre('7. Alerte « pool presque vide » (modèle veille-cpu)');
ok(niveauPool({ attribuables: 0, seuilAlerte: 3 }) === 'vide' && niveauPool({ attribuables: 2, seuilAlerte: 3 }) === 'presque_vide' && niveauPool({ attribuables: 2, arrivantes: 1, seuilAlerte: 3 }) === null, 'niveaux : vide / presque vide / rien (les IP en route comptent)');
ok(deciderAlerte({ niveau: 'vide', seuilCommande: 5, maintenant: T0 }).action === 'alerte', 'pool vide → alerte immédiate');
ok(deciderAlerte({ niveau: 'vide', derniereAlerte: { le: iso(T0 - 30 * 60_000), niveau: 'vide' }, seuilCommande: 5, maintenant: T0 }).action === null, '…rappel pas avant 1 h');
ok(deciderAlerte({ niveau: 'vide', derniereAlerte: { le: iso(T0 - 61 * 60_000), niveau: 'vide' }, seuilCommande: 5, maintenant: T0 }).action === 'alerte', '…rappel après 1 h');
ok(deciderAlerte({ niveau: 'vide', derniereAlerte: { le: iso(T0 - 10 * 60_000), niveau: 'presque_vide' }, seuilCommande: 5, maintenant: T0 }).action === 'alerte', 'presque vide → vide : prévenu tout de suite');
ok(deciderAlerte({ niveau: 'presque_vide', derniereAlerte: { le: iso(T0 - 2 * 3_600_000), niveau: 'presque_vide' }, seuilCommande: 5, maintenant: T0 }).action === null, 'presque vide : rappel toutes les 6 h seulement');
ok(deciderAlerte({ niveau: null, derniereAlerte: { le: iso(T0 - 3_600_000), niveau: 'vide' }, attribuables: 5, seuilCommande: 5, maintenant: T0 }).action === 'retabli', 'retour au seuil de commande → « rétabli »');
ok(deciderAlerte({ niveau: null, derniereAlerte: { le: iso(T0 - 3_600_000), niveau: 'vide' }, dernierRetabli: iso(T0 - 600_000), attribuables: 9, seuilCommande: 5, maintenant: T0 }).action === null, '« rétabli » déjà dit → silence');

// ─────────────────────────────────────────────────────────────────────────────
titre('8. Un seul essai par personne — miroir de cloud_essai_ouvrir');
const premium = { is_premium: true };
ok(verdictOuvertureEssai({ profil: premium, appareil: 'iphone-1' }).ok, 'premier essai, compte Premium, appareil neuf → accepté (en file s\'il le faut)');
ok(verdictOuvertureEssai({ profil: premium, essaiExistant: true, appareil: 'iphone-1' }).raison === 'essai_deja_pris', '2e ESSAI, même compte → refusé');
ok(verdictOuvertureEssai({ profil: { ...premium, cloud_essai_debut: iso(T0 - 20 * J) }, appareil: 'iphone-1' }).raison === 'essai_deja_pris', '2e essai (colonne du profil seule) → refusé');
const vus = new Set(['appareil|appareil:iphone-1', 'compte_plateforme|vinted:250623918']);
ok(verdictOuvertureEssai({ profil: premium, appareil: ' IPHONE-1 ', empreintesVues: vus }).raison === 'appareil_deja_vu', '2e essai, autre compte FillSell, MÊME APPAREIL (casse et espaces ignorés) → refusé');
const r = verdictOuvertureEssai({ profil: premium, appareil: 'pc-2', comptes: [{ plateforme: 'vinted', identifiant: '250623918' }], empreintesVues: vus });
ok(r.raison === 'compte_plateforme_deja_vu' && r.plateforme === 'vinted', '2e essai, autre compte FillSell, MÊME COMPTE VINTED → refusé');
ok(verdictOuvertureEssai({ profil: {}, appareil: 'pc-2' }).raison === 'palier_requis', 'compte gratuit → palier requis (CLOUD_EXIGE_UN_PALIER)');
ok(verdictOuvertureEssai({ profil: {}, appareil: 'pc-2', exigePalier: false }).ok, '…sauf si Nico ouvre l\'essai aux gratuits');
ok(verdictOuvertureEssai({ profil: { ...premium, is_cloud: true }, appareil: 'pc-2' }).raison === 'deja_client', 'déjà client Cloud → pas d\'essai');
ok(verdictOuvertureEssai({ profil: premium, appareil: '  ' }).raison === 'appareil_inconnu', 'sans empreinte d\'appareil → pas d\'essai');
ok(verdictOuvertureEssai({ profil: null, appareil: 'x' }).raison === 'compte_inconnu', 'compte inconnu → refusé');
ok(verdictOuvertureEssai({ profil: premium, essaiExistant: true, appareil: 'iphone-1', empreintesVues: vus }).raison === 'essai_deja_pris', 'ordre des refus = SQL : le compte avant l\'appareil');

// ─────────────────────────────────────────────────────────────────────────────
titre('9. Coûts — paramètres ouverts signalés, jamais devinés');
const ce = coutParEssai({ conversion: 0.25 });
ok(ce.nonConverti.joursIp === 23 && ce.converti.joursIp === 7, 'IP : 23 jours par essai non converti (7 + 2 + 14), 7 par essai converti');
ok(ce.nonConverti.ipEur === 3.56 && ce.converti.ipEur === 1.08, `IP : ${ce.nonConverti.ipEur} € (non converti), ${ce.converti.ipEur} € (converti) à 5,40 $ / 30 j`);
ok(ce.complet === false && ce.nonConverti.serveurEur === null, 'serveur et base non mesurés → coût marqué incomplet (null, jamais 0)');
ok(ce.nonConverti.ipEur < ce.ipNeuveParEssaiEur, `recycler (23 j) coûte moins qu'une IP neuve jetée par essai (${ce.ipNeuveParEssaiEur} €)`);
ok(coutParEssai({ conversion: 0.25, p: { ...PARAMETRES, quarantaineJours: 30 } }).nonConverti.ipEur > ce.ipNeuveParEssaiEur, '…mais avec 30 j de quarantaine, recycler coûterait PLUS que du neuf');
const plein = coutParEssai({ conversion: 0.25, p: { ...PARAMETRES, coutServeurEurJour: 0.5, coutBaseEurJour: 0.1 } });
ok(plein.complet && plein.nonConverti.totalEur === 7.76, 'paramètres remplis → total complet (3,56 + 7 × 0,5 + 7 × 0,1 = 7,76 €)');
ok(coutParEssai({ conversion: 0 }).parClientAcquisEur === null, 'aucune conversion → coût par client acquis non défini');
const st = fraisPaiement({ canal: 'stripe' });
ok(st.htEur === 16.67 && st.fraisEur === 0.69 && st.netEur === 15.98, `Stripe : 20 € TTC → ${st.htEur} € HT − ${st.fraisEur} € (1,5 % + 0,25 € + Billing 0,7 %) = ${st.netEur} €`);
ok(fraisPaiement({ canal: 'stripe', memeFacture: true }).fraisEur === 0.44, 'Stripe, option sur la facture du palier : pas de second 0,25 € → 0,44 €');
ok(fraisPaiement({ canal: 'apple' }).netEur === 14.17 && fraisPaiement({ canal: 'google' }).netEur === 14.17, 'Apple / Google à 15 % du HT → 14,17 €');
ok(fraisPaiement({ canal: 'apple', p: { ...PARAMETRES, commissionApple: 0.30 } }).netEur === 11.67, 'Apple hors Small Business Program (30 %) → 11,67 €');
const mS = margeParClient({ canal: 'stripe' });
ok(mS.ipEur === 4.64 && mS.margeEur === 11.33 && mS.complet === false, `marge client Stripe avant serveur et base : ${mS.margeEur} € / mois (IP ${mS.ipEur} €) — incomplète`);
ok(fraisPaiement({ canal: 'paypal' }) === null, 'canal inconnu → null');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
