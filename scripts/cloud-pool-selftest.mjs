// Autotest du POOL D'IP FRANÇAISES de l’option FillSell Cloud (conception du 04/10/2026).
//
//     npm run selftest:cloud-pool      (node scripts/cloud-pool-selftest.mjs)
//
// Ce qu'il prouve, sans réseau ni base : le cycle de vie d'une IP (transitions
// permises et interdites), l'attribution (jamais une IP qui expire pendant
// l'essai, le même compte reprend la sienne, FEFO), la purge prouvée et la
// sortie de quarantaine, le rebut (critères mesurables, Beebs = environnement),
// la taille du pool et les seuils calculés depuis λ, le plan de renouvellement
// (surplus non renouvelé, client toujours), l'alerte, l'essai unique (carte
// comprise), les coûts. Et la PHASE 1 — LA ROTATION (§ 10) : groupes, T_max,
// priorités, jamais deux comptes sur une IP, jamais un bail coupé au milieu
// d'un job, pool trop petit → file + alerte, coût réel d'un essai.
// Et que la PROPOSITION SQL dit la même chose : durée d’essai, palier exigé,
// défauts de cloud_param, codes de preuve et de bloquants, motifs de bail,
// contraintes d'exclusion — relus dans le texte de
// supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ESSAI_JOURS, EXIGE_UN_PALIER, PRIX_AFFICHE, PARAMETRES, ETATS, prochainEtat, couvertureJusqua, ipAttribuable, choisirIp,
  manquesPreuvePurge, CODES_PURGE, manquesControle, CODES_CONTROLE, peutRemettreEnPool, qualifierSignalement,
  CRITERES_REBUT, lambdaMesure, seuils, taillePoolCible, planDuJour, niveauPool, deciderAlerte,
  verdictOuvertureEssai, coutParEssai, fraisPaiement, margeParClient,
  modeCloud, groupeEffectif, dureeSession, tailleRotation, traficIpGoMois, choisirIpRotation, placesRotation,
  bloquantsBail, planifierRotation, planDuJourRotation, CODES_PURGE_COMPTE, manquesPreuvePurgeCompte,
  coutEssaiRotation, tableauCoutsRotation,
} from '../supabase/functions/_shared/cloud-pool.js';
import { CLOUD_ESSAI_JOURS, CLOUD_EXIGE_UN_PALIER, CLOUD_PRIX_AFFICHE, cloudDuProfil } from '../src/utils/palier.js';

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
ok(ESSAI_JOURS === CLOUD_ESSAI_JOURS, `durée d’essai = CLOUD_ESSAI_JOURS (${CLOUD_ESSAI_JOURS} j)`);
ok(EXIGE_UN_PALIER === CLOUD_EXIGE_UN_PALIER, `palier exigé = CLOUD_EXIGE_UN_PALIER (${CLOUD_EXIGE_UN_PALIER})`);
ok(PRIX_AFFICHE === CLOUD_PRIX_AFFICHE, `prix affiché = CLOUD_PRIX_AFFICHE (${CLOUD_PRIX_AFFICHE})`);
const sqlChemin = fileURLToPath(new URL('../supabase/migrations/PROPOSITION_20261004_cloud_option_et_pool_ip.sql.txt', import.meta.url));
const sql = readFileSync(sqlChemin, 'utf8');
const constantes = [...sql.matchAll(/c_exige_un_palier CONSTANT boolean := (true|false)/g)].map((m) => m[1] === 'true');
ok(constantes.length >= 3 && constantes.every((v) => v === CLOUD_EXIGE_UN_PALIER), `SQL : c_exige_un_palier = ${CLOUD_EXIGE_UN_PALIER} partout (${constantes.length} fonctions)`);
const durees = [...sql.matchAll(/make_interval\(days => (\d+)(?: \+|,|\))/g)].map((m) => Number(m[1]));
ok(durees.length >= 4 && durees.every((d) => d === CLOUD_ESSAI_JOURS), `SQL : chaque make_interval(days => N…) d’essai vaut ${CLOUD_ESSAI_JOURS} (${durees.length} occurrences)`);
const DEFAUTS = {
  grace_jours: PARAMETRES.graceJours, quarantaine_jours: PARAMETRES.quarantaineJours,
  marge_expiration_jours: PARAMETRES.margeExpirationJours, renouvellement_avant_jours: PARAMETRES.renouvellementAvantJours,
  attributions_max: PARAMETRES.attributionsMax, recycler_ip_client: PARAMETRES.recyclerIpClient ? 1 : 0,
  mode: PARAMETRES.mode === 'dediee' ? 2 : 1, pool_taille: PARAMETRES.poolTaille, t_max_min: PARAMETRES.tMaxMin,
  session_min_min: PARAMETRES.sessionMinMin, battement_min: PARAMETRES.battementMin,
  marge_prioritaire_pct: PARAMETRES.margePrioritairePct, groupe_max: PARAMETRES.groupeMax,
  comptes_distincts_max: PARAMETRES.comptesDistinctsMax, prolongation_max_min: PARAMETRES.prolongationMaxMin,
  poll_min: PARAMETRES.pollMin, session_max_min: PARAMETRES.sessionMaxMin,
  essais_simultanes_max: PARAMETRES.essaisSimultanesMax, empreintes_conservation_mois: PARAMETRES.empreintesConservationMois,
};
for (const [cle, attendu] of Object.entries(DEFAUTS)) {
  const vus = [...sql.matchAll(new RegExp(`cloud_param\\('${cle}', (\\d+)\\)`, 'g'))].map((m) => Number(m[1]));
  ok(vus.length > 0 && vus.every((v) => v === attendu), `SQL : cloud_param('${cle}') a le défaut de PARAMETRES (${attendu}) — ${vus.length}×`);
}
const corps = (nom) => sql.slice(sql.indexOf(`FUNCTION public.${nom}(`), sql.indexOf('$f$;', sql.indexOf(`FUNCTION public.${nom}(`)));
const codesSql = (nom) => [...corps(nom).matchAll(/array_append\(m, '([a-z_]+)'\)/g)].map((m) => m[1]);
ok(egal(codesSql('cloud_purge_manques'), [...CODES_PURGE]), 'SQL : cloud_purge_manques — mêmes codes, même ordre que manquesPreuvePurge');
ok(egal(codesSql('cloud_controle_manques'), [...CODES_CONTROLE]), 'SQL : cloud_controle_manques — mêmes codes, même ordre que manquesControle');
ok(egal(codesSql('cloud_purge_compte_manques'), [...CODES_PURGE_COMPTE]), 'SQL : cloud_purge_compte_manques — mêmes codes, même ordre que manquesPreuvePurgeCompte');
ok(egal(codesSql('cloud_bail_bloquants'), ['job_en_cours', 'job_distribue', 'republication_en_vol']), 'SQL : cloud_bail_bloquants — mêmes codes, même ordre que bloquantsBail');
const motifsSql = sql.match(/motif\s+text NOT NULL CHECK \(motif IN \(([^)]*)\)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
ok(egal(motifsSql, ['tour', 'premiere_connexion', 'priorite_retrait', 'priorite_vente', 'priorite_republication']), 'SQL : les motifs de bail = ceux que planifierRotation ouvre');
ok(/CONSTRAINT cloud_baux_ip_exclusif EXCLUDE USING gist \(ip_id WITH =, tstzrange\(debut, libre_le, '\[\)'\) WITH &&\)/.test(sql)
  && /CONSTRAINT cloud_baux_compte_exclusif EXCLUDE USING gist \(user_id WITH =, tstzrange\(debut, termine_le, '\[\)'\) WITH &&\)/.test(sql),
  'SQL : JAMAIS deux comptes sur une IP — exclusions par IP (battement compris) et par compte');
ok(/carte_absente/.test(corps('cloud_essai_ouvrir')) && /carte_deja_vue/.test(corps('cloud_essai_ouvrir')), 'SQL : cloud_essai_ouvrir refuse sans carte et une carte déjà vue');
ok(/\\mcloud_essai_veille\\M/.test(sql) && /email_logs_one_shot_unique/.test(sql), 'SQL : cloud_essai_veille ajouté à l\'index one-shot (idempotent)');
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
titre('8. Un seul essai par personne — miroir de cloud_essai_ouvrir (carte comprise)');
const premium = { is_premium: true };
const free = {};
ok(verdictOuvertureEssai({ profil: premium, appareil: 'iphone-1', carte: 'fp_A' }).ok, 'premier essai, compte Premium, appareil et carte neufs → accepté (en file s’il le faut)');
ok(verdictOuvertureEssai({ profil: free, appareil: 'pc-free', carte: 'fp_Z' }).ok, 'compte FREE → accepté : l’option se prend seule (04/10 soir)');
ok(verdictOuvertureEssai({ profil: free, appareil: 'pc-free', carte: 'fp_Z', exigePalier: true }).raison === 'palier_requis', '…palier_requis seulement si l’interrupteur repasse à true');
ok(verdictOuvertureEssai({ profil: premium, essaiExistant: true, appareil: 'iphone-1', carte: 'fp_A' }).raison === 'essai_deja_pris', '2e ESSAI, même compte → refusé');
ok(verdictOuvertureEssai({ profil: { ...premium, cloud_essai_debut: iso(T0 - 20 * J) }, appareil: 'iphone-1', carte: 'fp_A' }).raison === 'essai_deja_pris', '2e essai (colonne du profil seule) → refusé');
const vus = new Set(['appareil|appareil:iphone-1', 'carte|carte:fp_a', 'compte_plateforme|vinted:250623918']);
ok(verdictOuvertureEssai({ profil: premium, appareil: ' IPHONE-1 ', carte: 'fp_N', empreintesVues: vus }).raison === 'appareil_deja_vu', '2e essai, autre compte FillSell, MÊME APPAREIL (casse et espaces ignorés) → refusé');
ok(verdictOuvertureEssai({ profil: premium, appareil: 'pc-2' }).raison === 'carte_absente', 'SANS CARTE → refusé (carte obligatoire)');
ok(verdictOuvertureEssai({ profil: premium, appareil: 'pc-2', carte: ' FP_A ', empreintesVues: vus }).raison === 'carte_deja_vue', '2e essai, autre compte, MÊME CARTE → refusé');
const r = verdictOuvertureEssai({ profil: premium, appareil: 'pc-2', carte: 'fp_N', comptes: [{ plateforme: 'vinted', identifiant: '250623918' }], empreintesVues: vus });
ok(r.raison === 'compte_plateforme_deja_vu' && r.plateforme === 'vinted', '2e essai, autre compte FillSell, MÊME COMPTE VINTED → refusé');
ok(verdictOuvertureEssai({ profil: { ...premium, is_cloud: true }, appareil: 'pc-2', carte: 'fp_N' }).raison === 'deja_client', 'déjà client Cloud → pas d’essai');
ok(verdictOuvertureEssai({ profil: premium, appareil: '  ', carte: 'fp_N' }).raison === 'appareil_inconnu', 'sans empreinte d’appareil → pas d’essai');
ok(verdictOuvertureEssai({ profil: null, appareil: 'x', carte: 'y' }).raison === 'compte_inconnu', 'compte inconnu → refusé');
ok(verdictOuvertureEssai({ profil: premium, essaiExistant: true, appareil: 'iphone-1', carte: 'fp_a', empreintesVues: vus }).raison === 'essai_deja_pris', 'ordre des refus = SQL : le compte avant l’appareil');
ok(verdictOuvertureEssai({ profil: premium, appareil: 'iphone-1', empreintesVues: vus }).raison === 'appareil_deja_vu', '…l’appareil avant la carte (refusé AVANT de saisir sa carte)');

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

// ─────────────────────────────────────────────────────────────────────────────
titre('10. PHASE 1 — LA ROTATION');
ok(modeCloud(1) === 'rotation' && modeCloud(2) === 'dediee' && modeCloud(undefined) === 'rotation' && PARAMETRES.mode === 'rotation', 'phase 1 par défaut : rotation ; 2 = IP dédiée');
const pT = (t) => ({ ...PARAMETRES, tMaxMin: t });
ok(groupeEffectif(pT(15)) === 3 && groupeEffectif(pT(30)) === 4 && groupeEffectif(pT(60)) === 4, 'comptes par IP : 3 à T_max 15, 4 à 30 et 60 (plafond « un foyer »)');
ok(dureeSession(3, pT(15)) === 5 && dureeSession(4, pT(30)) === 7 && dureeSession(4, pT(60)) === 15 && dureeSession(1, pT(30)) === null, 'session de tour : 5 min (T15, 3), 7 min (T30, 4), 15 min (T60, 4) ; seul sur son IP = continu');
for (const t of [15, 30, 60]) {
  const g = groupeEffectif(pT(t)); const s = dureeSession(g, pT(t));
  ok((g - 1) * (s + PARAMETRES.battementMin) <= (1 - PARAMETRES.margePrioritairePct / 100) * t && s >= PARAMETRES.sessionMinMin,
    `T_max ${t} : attente entre deux sessions ${(g - 1) * (s + PARAMETRES.battementMin)} min ≤ ${t} − marge, session ≥ ${PARAMETRES.sessionMinMin} min`);
}
const t20 = tailleRotation({ comptes: 20 });
ok(t20.g === 4 && t20.ips === 5 && t20.reserve === 1 && t20.total === 6 && t20.coutIpUsdMois === 32.4, `20 comptes à T_max 30 : 5 IP + 1 de réserve = 6 IP, ${t20.coutIpUsdMois} $/mois`);
ok(t20.postesSimultanesMax === 6 && t20.cpuBasePct[0] === 0.6 && t20.cpuBasePct[1] === 1.5, 'la taille plafonne la base : 6 postes allumés au plus, 0,6 à 1,5 % CPU (mesure 0,1-0,25 %/poste)');
ok(tailleRotation({ comptes: 0 }).total === 0 && tailleRotation({ comptes: 1 }).total === 2, '0 compte → 0 IP ; 1 compte → 1 IP + 1 de réserve');
ok(tailleRotation({ comptes: 100, p: pT(15) }).total === 38 && tailleRotation({ comptes: 100 }).total === 28, '100 comptes : 38 IP à T_max 15, 28 à T_max 30');
ok(traficIpGoMois({ partActif: 1 }) === 86.4 && traficIpGoMois({ partActif: 0 }) === 17.28 && traficIpGoMois({ partActif: 1 }) < PARAMETRES.traficPlafondGoMois,
  'trafic d\'une IP occupée en continu : 17 à 86 Go / 30 j, sous les 100 Go d\'IPRoyal (mesure 26/09)');

// Admission : la maison
const R = (o) => ({ id: 1, etat: 'rotation', attributions: 0, expire_le: iso(T0 + 20 * J), ...o });
const rips = [R({ id: 1 }), R({ id: 2, expire_le: iso(T0 + 25 * J) }), R({ id: 3, attributions: 8 }), { id: 4, etat: 'disponible', attributions: 0, expire_le: iso(T0 + 28 * J) }];
ok(choisirIpRotation(rips, { userId: 'n', membres: { 1: 2, 2: 2, 3: 0 }, maintenant: T0 })?.ip.id === 2, 'nouveau compte → l\'IP la moins remplie (égalité : la plus longue échéance) — jamais une IP usée (3)');
ok(choisirIpRotation(rips, { userId: 'n', membres: { 1: 1, 2: 3 }, maintenant: T0 })?.ip.id === 1, '…la moins remplie d\'abord');
ok(choisirIpRotation(rips, { userId: 'a', membres: { 1: 3, 2: 1 }, ancienne: 1, maintenant: T0 })?.ip.id === 1, 'un compte qui revient retrouve son ancienne maison si elle a une place');
ok(choisirIpRotation(rips, { userId: 'x', maisons: [{ user_id: 'x', ip_id: 2 }], membres: { 1: 0, 2: 4 }, maintenant: T0 })?.ip.id === 2, 'déjà membre → sa maison (idempotent)');
const pleines = { 1: 4, 2: 4 };
const promu = choisirIpRotation(rips, { userId: 'n', membres: pleines, maintenant: T0 });
ok(promu?.ip.id === 4 && promu.promouvoir === true, 'groupes pleins → une IP disponible est mise en rotation');
ok(choisirIpRotation(rips, { userId: 'n', membres: pleines, maintenant: T0, p: { ...PARAMETRES, poolTaille: 3 } }) === null, 'pool à sa taille réglée et groupes pleins → null : l\'essai attend EN FILE');
ok(choisirIpRotation([R({ id: 9, expire_le: iso(T0 + 2 * J) })], { userId: 'n', maintenant: T0 }) === null, 'IP à 2 j de l\'échéance (< N) → pas de nouveau membre');
ok(placesRotation({ ips: rips, membres: pleines, p: { ...PARAMETRES, poolTaille: 3 } }) === 0, 'places libres 0 → alerte « vide » (jamais un trou silencieux)');
ok(placesRotation({ ips: rips, membres: { 1: 3, 2: 4 } }) === 1 + 4 * 1, 'places libres = places des groupes + IP promouvables × g');

// Bloquants : alignés sur jobs_reservations_extension (prod, 20260928130523)
const bail = { id: 7, user_id: 'u', poste: 'p-u', fin_douce_le: null, prolonge_min: 0 };
const resa = (o) => ({ user_id: 'u', poste: 'p-u', commence: false, expire_le: iso(T0 + 5 * 60_000), ...o });
ok(egal(bloquantsBail({ bail, reservations: [resa({ commence: true })], maintenant: T0 }), ['job_en_cours']), 'réservation COMMENCÉE → job_en_cours');
ok(egal(bloquantsBail({ bail, reservations: [resa({})], maintenant: T0 }), ['job_distribue']), 'réservation distribuée, fin douce pas posée → job_distribue');
ok(egal(bloquantsBail({ bail: { ...bail, fin_douce_le: iso(T0 - 60_000) }, reservations: [resa({})], maintenant: T0 }), ['job_distribue']), '…fin douce il y a 1 min (< un passage) → on attend encore');
ok(egal(bloquantsBail({ bail: { ...bail, fin_douce_le: iso(T0 - 3 * 60_000) }, reservations: [resa({})], maintenant: T0 }), []), '…fin douce il y a 3 min → plus rien ne bloque (elle sera libérée)');
ok(egal(bloquantsBail({ bail, reservations: [resa({ expire_le: iso(T0 - 1000) })], maintenant: T0 }), []), 'réservation expirée → ne bloque pas');
ok(egal(bloquantsBail({ bail, reservations: [resa({ commence: true, poste: 'bureau' })], maintenant: T0 }), []), 'réservation d\'un AUTRE poste (son extension de bureau) → ne bloque pas ce bail');
const repu = [{ user_id: 'u', status: 'pending', republish_step: 'deleted' }];
ok(egal(bloquantsBail({ bail, republications: repu, maintenant: T0 }), ['republication_en_vol']), 'republication déjà retirée (deleted) → republication_en_vol');
ok(egal(bloquantsBail({ bail: { ...bail, prolonge_min: 30 }, republications: repu, maintenant: T0 }), []), '…plus au plafond de prolongation (elle reprendra en priorité)');

// L'ordonnanceur
const ipsR = [{ id: 1, etat: 'rotation' }, { id: 2, etat: 'rotation' }];
const m = (u, ipId, o = {}) => ({ user_id: u, ip_id: ipId, actif: true, rejoint_le: iso(T0 - 3 * 3_600_000), derniere_fin: iso(T0 - 20 * 60_000), priorite: null, ...o });
const groupe = [m('a', 1, { derniere_fin: iso(T0 - 25 * 60_000) }), m('b', 1, { derniere_fin: iso(T0 - 10 * 60_000) }), m('c', 1), m('d', 2), m('e', 2, { actif: false })];
let pl = planifierRotation({ ips: ipsR, membres: groupe, baux: [], maintenant: T0 });
ok(pl.ouvrir.length === 2 && new Set(pl.ouvrir.map((o) => o.ip_id)).size === 2, 'deux IP libres → deux baux, UN par IP (jamais deux comptes sur une IP)');
ok(pl.ouvrir.find((o) => o.ip_id === 1)?.user_id === 'a' && pl.ouvrir.find((o) => o.ip_id === 1)?.dureeMin === 7, 'ip1 : celui qui attend depuis le plus longtemps (a), session de 7 min');
ok(pl.ouvrir.find((o) => o.ip_id === 2)?.user_id === 'd', 'ip2 : d — e est inactif (essai fini), jamais servi');
ok(pl.ouvrir.every((o) => groupe.find((x) => x.user_id === o.user_id).ip_id === o.ip_id), 'chacun sur SA maison (affinité)');
pl = planifierRotation({ ips: ipsR, membres: [...groupe.slice(0, 3), m('n', 1, { derniere_fin: null })], baux: [], maintenant: T0 });
ok(pl.ouvrir.find((o) => o.ip_id === 1)?.user_id === 'n' && pl.ouvrir.find((o) => o.ip_id === 1)?.motif === 'premiere_connexion' && pl.ouvrir.find((o) => o.ip_id === 1)?.dureeMin === 15, 'jamais servi → première connexion (15 min pour se connecter aux plateformes)');
const prio = [m('a', 1, { derniere_fin: iso(T0 - 25 * 60_000) }), m('c', 1, { priorite: { motif: 'retrait', le: iso(T0 - 60_000) } })];
pl = planifierRotation({ ips: [ipsR[0]], membres: prio, baux: [], maintenant: T0 });
ok(pl.ouvrir[0]?.user_id === 'c' && pl.ouvrir[0]?.motif === 'priorite_retrait', 'RETRAIT EN ATTENTE → session tout de suite, avant le tour');
const bailA = { id: 11, ip_id: 1, user_id: 'a', motif: 'tour', fin_prevue: iso(T0 + 5 * 60_000), fin_douce_le: null, prolonge_min: 0, bloquants: [] };
pl = planifierRotation({ ips: [ipsR[0]], membres: prio, baux: [bailA], maintenant: T0 });
ok(pl.finDouce.includes(11) && pl.terminer.includes(11) && pl.ouvrir.length === 0, 'priorité d\'un autre membre → le bail en cours finit tout de suite s\'il est sûr (l\'IP s\'ouvre à la minute suivante)');
pl = planifierRotation({ ips: [ipsR[0]], membres: prio, baux: [{ ...bailA, bloquants: ['job_en_cours'] }], maintenant: T0 });
ok(pl.finDouce.includes(11) && !pl.terminer.includes(11), '…mais un job tourne : fin douce seulement, JAMAIS coupé');
pl = planifierRotation({ ips: [ipsR[0]], membres: [m('a', 1)], baux: [{ ...bailA, fin_prevue: iso(T0 + 60_000) }], maintenant: T0 });
ok(pl.finDouce.includes(11) && !pl.terminer.includes(11), '2 min avant la fin prévue : fin douce (plus aucun job pris)');
pl = planifierRotation({ ips: [ipsR[0]], membres: [m('a', 1)], baux: [{ ...bailA, fin_prevue: iso(T0 - 1000), fin_douce_le: iso(T0 - 120_000), bloquants: ['job_en_cours'] }], maintenant: T0 });
ok(pl.prolonger.includes(11) && !pl.terminer.includes(11), 'fin prévue passée, job en cours → prolongé');
pl = planifierRotation({ ips: [ipsR[0]], membres: [m('a', 1)], baux: [{ ...bailA, fin_prevue: iso(T0 - 1000), prolonge_min: 30, bloquants: ['job_en_cours'] }], maintenant: T0 });
ok(!pl.terminer.includes(11) && !pl.prolonger.includes(11) && pl.alertes.some((x) => x.nature === 'bail_bloque_job'), 'au plafond de prolongation : alerte, et TOUJOURS pas coupé');
pl = planifierRotation({ ips: [{ id: 1, etat: 'rotation', libre_le: iso(T0 + 30_000) }], membres: [m('a', 1)], baux: [], maintenant: T0 });
ok(pl.ouvrir.length === 0, 'battement pas écoulé → personne (la base le refuserait de toute façon)');
pl = planifierRotation({ ips: [{ id: 1, etat: 'rebut' }], membres: [m('a', 1, { derniere_fin: iso(T0 - 40 * 60_000) })], baux: [], maintenant: T0 });
ok(pl.ouvrir.length === 0 && pl.alertes.some((x) => x.nature === 'tmax_depasse' && x.user_id === 'a'), 'IP hors rotation et compte qui attend depuis 40 min → alerte T_max dépassé');
pl = planifierRotation({ ips: [ipsR[0]], membres: [m('a', 1), m('b', 1), m('c', 1), m('d', 1), m('e', 1)], baux: [], maintenant: T0 });
ok(pl.alertes.some((x) => x.nature === 'groupe_trop_grand'), 'groupe de 5 pour g = 4 → alerte');
pl = planifierRotation({ ips: [ipsR[0]], membres: [m('a', 1, { priorite: { motif: 'vente', le: iso(T0 - 12 * 60_000) } }), m('b', 1)], baux: [{ ...bailA, user_id: 'b', fin_prevue: iso(T0 + 4 * 60_000), bloquants: ['job_en_cours'] }], maintenant: T0 });
ok(pl.alertes.some((x) => x.nature === 'priorite_en_attente'), 'vente constatée ailleurs qui attend > 10 min (job en cours sur l\'IP) → alerte');

// Simulation : 4 comptes, une IP, 3 heures — T_max tenu, jamais deux à la fois.
{
  const p = PARAMETRES;
  const mem = ['a', 'b', 'c', 'd'].map((u) => ({ user_id: u, ip_id: 1, actif: true, rejoint_le: iso(T0), derniere_fin: iso(T0), priorite: null }));
  let bauxA = []; let libre = null; let pire = 0; let chevauchement = false; const MIN = 60_000;
  for (let t = T0; t < T0 + 3 * 3_600_000; t += MIN) {
    const plan = planifierRotation({ ips: [{ id: 1, etat: 'rotation', libre_le: libre }], membres: mem, baux: bauxA, maintenant: t, p });
    for (const id of plan.terminer) {
      const b = bauxA.find((x) => x.id === id); bauxA = bauxA.filter((x) => x.id !== id);
      mem.find((x) => x.user_id === b.user_id).derniere_fin = iso(t); libre = iso(t + p.battementMin * MIN);
    }
    for (const o of plan.ouvrir) {
      if (bauxA.some((x) => x.ip_id === o.ip_id)) chevauchement = true;
      bauxA.push({ id: t, ip_id: o.ip_id, user_id: o.user_id, motif: o.motif, fin_prevue: iso(t + o.dureeMin * MIN), fin_douce_le: null, prolonge_min: 0, bloquants: [] });
    }
    for (const x of mem) if (!bauxA.some((b) => b.user_id === x.user_id)) pire = Math.max(pire, (t - Date.parse(x.derniere_fin)) / MIN);
  }
  ok(!chevauchement, 'simulation 3 h, 4 comptes, 1 IP : jamais deux baux en même temps');
  ok(pire <= p.tMaxMin, `simulation : la plus longue attente sans session = ${pire} min ≤ T_max ${p.tMaxMin}`);
}

// Renouvellement en rotation
const rr = [R({ id: 1, expire_le: iso(T0 + 2 * J) }), R({ id: 2, expire_le: iso(T0 + 2 * J) }), R({ id: 3, expire_le: iso(T0 + 2 * J), attributions: 8 }),
  { id: 4, etat: 'disponible', attributions: 0, expire_le: iso(T0 + 2 * J) }, { id: 5, etat: 'rebut', rebut_critere: 'liste_noire', expire_le: iso(T0 + J) }];
let pr = planDuJourRotation({ ips: rr, membres: { 1: 3 }, maintenant: T0, p: { ...PARAMETRES, poolTaille: 2 } });
ok(pr.renouveler.includes(1), 'IP en rotation AVEC des membres → toujours renouvelée');
ok(pr.renouveler.includes(2) && pr.laisserExpirer.includes(4), 'IP vide : renouvelée tant qu\'on est sous la taille du pool (2), la suivante en surplus expire');
ok(pr.laisserExpirer.includes(3) && pr.laisserExpirer.includes(5), 'IP usée et vide, IP au rebut → jamais renouvelées');
pr = planDuJourRotation({ ips: [R({ id: 1 })], membres: { 1: 4 }, maintenant: T0 });
ok(pr.aCommander === PARAMETRES.poolTaille - 1, `une seule IP pour une taille de ${PARAMETRES.poolTaille} → commander ${PARAMETRES.poolTaille - 1}`);
ok(planDuJourRotation({ ips: [R({ id: 1 })], membres: { 1: 4 }, commandesEnCours: 9, maintenant: T0 }).aCommander === 0, 'commandes en cours comptées : jamais d\'achat au-delà de la taille réglée');

// Purge d'un compte qui quitte
const pc = { version: 2, faite_le: iso(T0 + 60_000), profil: { id: 'prof-u', detruit: true }, profils_restants: 0, coffre_restants: 0, session_fillsell_revoquee: true };
ok(egal(manquesPreuvePurgeCompte(pc, iso(T0)), []), 'purge de compte complète → rien ne manque');
ok(egal(manquesPreuvePurgeCompte({ ...pc, coffre_restants: 2 }, iso(T0)), ['coffre_restants']), 'coffre pas vidé → refusée');
ok(egal(manquesPreuvePurgeCompte({ ...pc, profil: { id: 'prof-u', detruit: false } }, iso(T0)), ['profil_detruit']), 'profil pas détruit → refusée');
ok(egal(manquesPreuvePurgeCompte(null, iso(T0)), [...CODES_PURGE_COMPTE]), 'aucune preuve → tout manque, dans l\'ordre');

// Le coût réel d'un essai en rotation
const c1 = coutEssaiRotation({ g: 1 }), c4 = coutEssaiRotation({ g: 4 });
ok(c1.ipEur === 1.08 && egal(c1.serveurEur, [0.15, 0.25]) && egal(c1.totalEur, [1.24, 1.34]), `seul sur son IP : ${c1.totalEur[0]}–${c1.totalEur[1]} € l'essai de 7 j (IP ${c1.ipEur} € mesurée, serveur ${c1.serveurEur.join('–')} € estimé)`);
ok(c4.ipEur === 0.27 && egal(c4.totalEur, [0.31, 0.33]), `groupe de 4 : ${c4.totalEur[0]}–${c4.totalEur[1]} € l'essai`);
ok(c4.baseEur[1] < 0.01 && c1.carteEur === 0, 'base : moins d\'un centime par essai (mesure CPU) ; carte : 0 € (SetupIntent, aucun débit)');
const tab = tableauCoutsRotation();
ok(tab.find((x) => x.g === 4).parT.find((x) => x.tMax === 15).possible === false && tab.find((x) => x.g === 3).parT.find((x) => x.tMax === 15).possible === true, 'tableau : groupe de 4 impossible à T_max 15 (session < 5 min), 3 possible');
ok(egal(tab.find((x) => x.g === 4).parClient.find((x) => x.c === 0.25).totalEur, [1.24, 1.32]), 'groupe de 4, c = 25 % : 1,24–1,32 € d\'essais par client gagné');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
