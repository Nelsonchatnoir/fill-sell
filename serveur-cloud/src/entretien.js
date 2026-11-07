// L'ENTRETIEN HORAIRE du pool — dans l'orchestrateur (il a la clé de service,
// le jeton IPRoyal et le réseau), jamais dans pg_cron :
//   1. cloud_pool_entretien() (réservations échues, comptes qui suivent leur état,
//      échéances, ménage RGPD) ;
//   2. PURGE PROUVÉE de chaque IP partie au repos : conteneur et profil détruits,
//      coffre vidé, session FillSell révoquée, identifiants du proxy changés —
//      la preuve va à cloud_ip_noter_purge (sans elle, l'IP ne sort jamais du repos) ;
//   3. contrôles : entrée des IP livrées, sortie des repos finis ;
//   4. échéances relues chez IPRoyal (renouvellement automatique) ; ce qu'il
//      FAUDRAIT renouveler ou commander est PROPOSÉ par alerte (aucun achat
//      sans le GO de Nico) ;
//   5. alertes : pool vide / presque vide, compte actif sans IP, purge en retard.
// (03/11, point 2 de Nico) Et désormais, tout automatique :
//   0. le PARE-FEU des navigateurs suit le pool (pareFeu.js : la liste écrite, l'hôte la rejoue sans redéploiement) ;
//      aucune IP n'est contrôlée ni visitée tant que la preuve ne porte pas sa sortie ;
//   3 bis. la REQUALIFICATION : une IP disponible au refus de plateforme non prouvé reçoit UNE visite de contrôle de
//      cette plateforme (au plus une par heure ; controle.js), dont le verdict lève ou prouve le refus ;
//   4 bis. la LIVRAISON des commandes, le RENOUVELLEMENT et l'ACHAT sous le stock visé — sous leurs gardes
//      (approvisionnement.js) ; sans elles, une proposition (alerte).
// (07/11, décisions de Nico)
//   1. « IP toujours d'avance » : le stock visé = la MARGE (cloud_ip_marge) + l'attente ; et entre deux entretiens, le
//      RÉAPPROVISIONNEMENT RAPIDE (reapprovisionnerVite, toutes les REAPPRO_RAPIDE_MIN minutes) : lecture de trois petites
//      tables, livraison et contrôle d'entrée des IP achetées, achat dès qu'il manque des IP — mêmes gardes, jamais en
//      même temps qu'un entretien (un seul verrou), jamais une boucle (garde du nombre, pause d'une heure après un échec) ;
//   3. le SOLDE IPRoyal : l'alerte part sous la dépense prévue sur 14 jours (regles.seuilSoldeProjete) et dit combien
//      recharger ; en paiement par carte, l'alerte est celle de la carte (absente, expirée, expire dans 45 jours).
// (07/11 soir, ordres 3 et 4 de Nico)
//   4. LE CONTRÔLE DE SANTÉ des IP libres (controlerSante, toutes les SANTE_IP_MIN minutes, coin_config
//      cloud_ip_sante_controle = 1) : une IP à la fois (cloud-pool.choisirIpASonder), un Chrome jetable (sante.js), sous le
//      MÊME verrou que l'entretien et le réapprovisionnement (jamais deux navigateurs de contrôle ensemble), jamais pendant
//      une pointe de charge ; le verdict va à cloud_ip_sante_noter ; une IP GRILLÉE n'est plus attribuable
//      (cloud_ip_attribuable) et l'alerte part à support@ ; à chaque entretien, l'alerte « IP saines libres sous la marge ».
//   3. LA RÈGLE « SAINES D'ABORD » du renouvellement (planDuJour, sainesSeulement) : coin_config
//      cloud_ip_renouveler_saines_seulement = 1, ET le contrôle de santé allumé (sans lui, aucune santé n'est connue : le
//      plan d'avant, dit par une alerte).
import { mkdir } from 'node:fs/promises';
import { loadavg, cpus } from 'node:os';
import { nouveauProfilId } from './navigateur.js';
import { claims } from './sessionFillsell.js';
import { creerPareFeu, sortieOuverte } from './pareFeu.js';
import { creerApprovisionnement, dateIproyal } from './approvisionnement.js';

export const VISITE_ESPACEMENT_MS = 3600_000;   // (03/11) au plus une visite de contrôle de plateforme par heure
const COLONNES_IPS = 'id, commande, ip, port, etat, user_id, dernier_user_id, liberee_le, repos_fin, purge_prouvee_le, expire_le, attributions, reserve_pour, reserve_jusqu_au, refus, rebut_critere, rebut_le';
/** (07/11 soir) La charge de l'hôte (1 min) par processeur — le conteneur voit celle de l'hôte. */
export const chargeHote = () => loadavg()[0] / Math.max(1, cpus().length);

export function creerEntretien({ config, base, navigateurs, coffre, sessions, iproyal, controles, alertes, regles, journal, fournisseurIp,
  pareFeu = creerPareFeu({ config, journal }), approvisionnement = creerApprovisionnement({ base, iproyal, alertes, journal, regles }),
  sante = null, charge = chargeHote }) {
  let derniereVisite = 0;
  let occupe = false;            // (07/11) UN verrou : l'entretien et le réapprovisionnement rapide ne courent jamais ensemble
  let dernierLambda = null;      // (07/11) le λ du dernier entretien (le réapprovisionnement rapide ne relit pas les essais)
  let santeAbsenteLe = null;     // (07/11 soir) la colonne cloud_ips.sante manquait (migration 20261107190000 pas encore en base)
  let derniereAlerteMarge = 0;   // (07/11 soir) « saines sous la marge » : un rappel toutes les santeAlerteRappelH heures
  let derniereAlerteRegle = 0;

  /** Le pool. (07/11 soir) Avec la santé (colonne sante) ; sans elle tant que la migration manque (relu une fois par heure). */
  async function lireIps() {
    const normaliser = (ips, avecSante) => Object.assign((ips ?? []).map((i) => ({ ...i, ip: String(i.ip).replace(/\/32$/, '') })), { avecSante });
    if (santeAbsenteLe == null || Date.now() - santeAbsenteLe > 3600_000) {
      const { data, error } = await base.from('cloud_ips').select(`${COLONNES_IPS}, sante`);
      if (!error) { santeAbsenteLe = null; return normaliser(data, true); }
      if (!/sante/i.test(String(error.message ?? ''))) throw new Error(`cloud_ips : ${error.message}`);
      if (santeAbsenteLe == null) journal.alerte('sante_colonne_absente', { erreur: error.message });
      santeAbsenteLe = Date.now();
    }
    const { data: ips, error } = await base.from('cloud_ips').select(COLONNES_IPS);
    if (error) throw new Error(`cloud_ips : ${error.message}`);
    return normaliser(ips, false);
  }
  /** (07/11) Le registre des dépenses des 30 derniers jours (petite table) : rythme d'achat, prix, anti-boucle. */
  async function lireRegistre(maintenant = Date.now()) {
    const q = base.from('cloud_ip_commandes').select('id, nature, quantite, statut, prix_usd, demandee_le, ip_id, details');
    const { data, error } = await (typeof q.gte === 'function' ? q.gte('demandee_le', new Date(maintenant - 30 * 86_400_000).toISOString()) : q);
    return error ? [] : (data ?? []);
  }
  /** (07/11) Le prix d'UNE IP 30 jours : le catalogue IPRoyal, sinon le registre, sinon PARAMETRES. */
  async function prixIp(registre) {
    if (iproyal?.disponible && iproyal.catalogueIsp) {
      const p = await iproyal.catalogueIsp().then((c) => Number(c?.prixUnitaireUsd)).catch(() => NaN);
      if (p > 0) return p;
    }
    return regles.prixIpDuRegistre?.(registre) ?? regles.PARAMETRES?.prixIpUsd30j ?? 5.4;
  }
  /** Le contrôle d'une IP (entrée ou sortie de repos), depuis un navigateur neuf ; le verdict va à la base. */
  async function controlerIp(i, nature) {
    const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: i.id });
    if (!proxyUrl) return false;
    const c = await controles.controler({ ipId: i.id, ip: i.ip, proxyUrl }).catch((e) => { journal.erreur('controle_echec', { ip_id: i.id, erreur: e.message }); return null; });
    if (!c) return true;
    const rpc = nature === 'entree' ? 'cloud_ip_controle_entree' : 'cloud_ip_remettre_en_pool';
    const { data } = await base.rpc(rpc, { p_ip: i.id, p_controle: c });
    journal.info('controle_applique', { ip_id: i.id, nature, ok: data?.ok === true, manques: data?.manques ?? [] });
    return true;
  }
  /** (04/11) Les plateformes dont les visites de contrôle sont coupées (coin_config) ; « * » = lecture ratée, toutes. */
  async function visitesCoupees() {
    const coupees = new Set();
    for (const pf of ['vinted', 'leboncoin', 'beebs', 'depop']) {
      const { data, error } = await base.rpc('cloud_param', { p_cle: `visites_controle_${pf}`, p_defaut: 1 });
      if (error) { coupees.add('*'); break; }
      if (Number(data) === 0) coupees.add(pf);
    }
    return coupees;
  }

  /** (04/11) Le compte tient-il encore une IP, ou son Cloud est-il actif ? Dans le doute (lecture ratée) : oui, jamais de purge. */
  async function compteToujoursActif(user, ips) {
    if ((ips ?? []).some((i) => i.user_id && i.user_id === user)) return true;
    const { data: e, error } = await base.rpc('cloud_etat', { p_user: user });
    if (error) return true;
    return e?.actif === true;
  }

  async function purger(ip) {
    const user = ip.dernier_user_id;
    const { data: poste } = await base.from('cloud_postes').select('session_fillsell_id, details').eq('user_id', user).maybeSingle();
    const ancien = poste?.details?.profil ?? null;
    const c = await coffre.lire(user).catch(() => ({}));
    const sessionCoffre = c.fillsell?.own ? claims(c.fillsell.own.access_token)?.session_id : null;
    // 1. Le navigateur et le profil.
    const { profilsRestants } = await navigateurs.detruire(user, ancien);
    // 2. Le coffre.
    await coffre.vider(user);
    const restants = Object.keys(await coffre.lire(user).catch(() => ({ x: 1 }))).length;
    // 3. La session FillSell posée par le serveur (et elle seule).
    let revoquee = true;
    for (const s of new Set([poste?.session_fillsell_id, sessionCoffre].filter(Boolean))) {
      try { await sessions.revoquer(user, s); } catch (e) { revoquee = false; journal.erreur('purge_revocation_echec', { user, erreur: e.message }); }
    }
    // 4. Les identifiants du proxy.
    let identifiants = false;
    if (iproyal.disponible) {
      try {
        const url = await iproyal.changerIdentifiants(ip.commande, ip.ip);
        const { data } = await base.rpc('cloud_ip_identifiants_changes', { p_ip: ip.id, p_proxy_url: url });
        identifiants = data === true;
      } catch (e) { journal.erreur('purge_identifiants_echec', { ip_id: ip.id, erreur: e.message }); }
    }
    // 5. Un profil NEUF (vide) pour la suite.
    const nouveau = nouveauProfilId(user);
    await mkdir(`${config.dossierProfils}/${nouveau}`, { recursive: true });
    const neufLe = new Date().toISOString();
    await base.rpc('cloud_poste_noter', { p_user: user, p_etat: 'eteint', p_details: { profil: nouveau, session_fillsell_id: '', purge: neufLe } });
    const preuve = {
      version: 1, faite_le: new Date().toISOString(),
      profil: { ancien: ancien ?? `inconnu-${ip.id}`, nouveau, ancien_detruit: profilsRestants === 0, nouveau_cree_le: neufLe },
      cookies_restants: profilsRestants === 0 ? 0 : 1, stockages_restants: profilsRestants === 0 ? 0 : 1,
      coffre_restants: restants, session_fillsell_revoquee: revoquee,
      empreinte: { ancienne: ancien ?? `inconnu-${ip.id}`, nouvelle: nouveau },
      identifiants_proxy_renouveles: identifiants,
    };
    const { data: r } = await base.rpc('cloud_ip_noter_purge', { p_ip: ip.id, p_preuve: preuve });
    journal.info('purge', { ip_id: ip.id, user, ok: r?.ok === true, manques: r?.manques ?? [] });
    if (r?.ok !== true) await alertes.signaler('serveur', `Purge incomplète de l'IP ${ip.id} : ${(r?.manques ?? []).join(', ')}`, { ip_id: ip.id });
    return r;
  }

  /**
   * (30/10, lot D) LA PURGE EN ROTATION — la promesse « effacé au plus tard 3 jours après la fin » (conditions,
   * art. 8 ; confidentialité 4.8). Sans IP attribuée, la purge du 05/10 (déclenchée par l'IP qui part au repos) ne
   * s'éveille jamais : on purge donc PAR COMPTE. Un compte dont le Cloud n'est plus actif (essai fini hors grâce de
   * `grace_jours`, arrêt, fin d'abonnement, compte supprimé) et qui garde des données Cloud (coffre, session FillSell
   * du navigateur, profil non purgé) : navigateur et profil détruits, coffre vidé, session révoquée — à chaque entretien
   * horaire, donc au plus tard grâce (2 j) + 1 h après la fin.
   */
  async function purgerComptesInactifs(maintenant = Date.now()) {
    const [{ data: postes }, { data: coffres }] = await Promise.all([
      base.from('cloud_postes').select('user_id, session_fillsell_id, details'),
      base.from('cloud_coffre').select('user_id'),
    ]);
    const parUser = new Map();
    for (const po of postes ?? []) parUser.set(po.user_id, { poste: po, coffre: false });
    for (const c of coffres ?? []) parUser.set(c.user_id, { ...(parUser.get(c.user_id) ?? { poste: null }), coffre: true });
    const purges = [];
    for (const [user, { poste, coffre: aCoffre }] of parUser) {
      const restes = aCoffre || Boolean(poste?.session_fillsell_id) || (poste?.details?.profil && !poste?.details?.purge);
      if (!restes) continue;
      const { data: e } = await base.rpc('cloud_etat', { p_user: user });
      if (e?.actif === true) continue;
      const fin = Date.parse(String(e?.essaiFin ?? ''));
      const graceJ = Number((await base.rpc('cloud_param', { p_cle: 'grace_jours', p_defaut: 2 })).data ?? 2);
      if (e?.etat === 'essai_termine' && e?.essaiArrete !== true && Number.isFinite(fin) && fin + graceJ * 86_400_000 > maintenant) continue;
      try {
        const c = await coffre.lire(user).catch(() => ({}));
        const sessionCoffre = c.fillsell?.own ? claims(c.fillsell.own.access_token)?.session_id : null;
        const { profilsRestants } = await navigateurs.detruire(user, poste?.details?.profil ?? null);
        await coffre.vider(user);
        let revoquee = true;
        for (const s of new Set([poste?.session_fillsell_id, sessionCoffre].filter(Boolean))) {
          try { await sessions.revoquer(user, s); } catch (err) { revoquee = false; journal.erreur('purge_revocation_echec', { user, erreur: err.message }); }
        }
        const le = new Date().toISOString();
        await base.rpc('cloud_poste_noter', { p_user: user, p_etat: 'eteint', p_details: { purge: le, session_fillsell_id: '', profil_detruit: profilsRestants === 0 } });
        journal.info('purge_compte', { user: String(user).slice(0, 8), etat: e?.etat ?? 'inconnu', profil_detruit: profilsRestants === 0, session_revoquee: revoquee });
        purges.push(user);
        if (profilsRestants !== 0 || !revoquee) await alertes.signaler('serveur', `Purge incomplète du compte ${String(user).slice(0, 8)} (rotation).`);
      } catch (err) { journal.erreur('purge_compte_echec', { user: String(user).slice(0, 8), erreur: err.message }); }
    }
    return purges.length;
  }

  /** (07/11) L'entretien horaire, sous le verrou partagé avec le réapprovisionnement rapide. */
  async function tour() {
    if (occupe) return { occupe: true };
    occupe = true;
    try { return await tourSansVerrou(); } finally { occupe = false; }
  }

  async function tourSansVerrou() {
    const bilan = {};
    // (04/11 soir, essai GPU) ENTRETIEN_POOL=0 : un SECOND serveur (l'essai) ne tient pas le pool — cloud-1 le fait. Seul
    // le pare-feu de SES navigateurs suit le pool (étape 0) : aucune purge, aucun contrôle, aucune visite, aucune échéance,
    // aucun achat, aucune livraison, aucune alerte, aucun cloud_pool_entretien() — jamais deux entretiens du même pool.
    const pool = config?.entretienPool !== false;
    if (pool) {
      const { data: e1, error } = await base.rpc('cloud_pool_entretien');
      if (error) throw new Error(`cloud_pool_entretien : ${error.message}`);
      bilan.base = e1;
    } else bilan.pool = 'coupe';

    let toutes = await lireIps();

    // 0. (03/11) Le pare-feu des navigateurs suit le pool : la liste écrite, l'hôte la rejoue (aucun redéploiement).
    //    Les IP qu'un navigateur ouvert utilise restent permises quoi qu'il arrive.
    const enUsage = (navigateurs?.ouverts?.() ?? []).map((u) => navigateurs.ouvert?.(u)?.ipId).filter((x) => x != null);
    const pf = await pareFeu.synchroniser(toutes, { enUsage })
      .catch((e) => { journal.alerte('pare_feu_synchro_echec', { erreur: e.message }); return null; });
    const appliquees = pf?.appliquees ?? await pareFeu.appliquees().catch(() => null);
    const sortiePermise = (i) => Boolean(appliquees) && sortieOuverte(appliquees, i.ip, i.port ?? 12323);
    bilan.pare_feu = { ecrit: pf?.ecrit ?? false, manquantes: pf?.manquantes?.length ?? null };
    if (!pool) { journal.info('entretien', bilan); return bilan; }

    // 2. Purges
    bilan.purges = 0;
    bilan.purges_refusees = 0;
    for (const ip of toutes.filter((i) => i.etat === 'repos' && !i.purge_prouvee_le && i.dernier_user_id)) {
      // ⛔ (04/11, incident de 12:25 — règle de Nico : « ne plus jamais repartir de zéro ») La purge détruit le profil,
      // vide le coffre (cookies DataDome compris) et révoque la session : elle n'est due qu'à un compte qui PART. Un compte
      // qui tient encore une IP, ou dont le Cloud est actif, n'est JAMAIS purgé parce qu'une de ses IP est au repos (le
      // 04/11, cloud_ip_liberer sur un compte actif a fait effacer Vinted, Leboncoin, Depop). L'IP reste au repos, dite.
      if (await compteToujoursActif(ip.dernier_user_id, toutes)) {
        bilan.purges_refusees++;
        journal.alerte('purge_refusee_compte_actif', { ip_id: ip.id, user: String(ip.dernier_user_id).slice(0, 8) });
        continue;
      }
      await purger(ip).catch((e) => journal.erreur('purge_echec', { ip_id: ip.id, erreur: e.message }));
      bilan.purges++;
    }

    // 3. Contrôles (au plus 2 par heure : chacun allume un navigateur)
    let controlesFaits = 0;
    const aControler = [
      ...toutes.filter((i) => i.etat === 'achetee').map((i) => ({ i, nature: 'entree' })),
      ...toutes.filter((i) => i.etat === 'repos' && i.purge_prouvee_le && Date.parse(i.repos_fin) <= Date.now()).map((i) => ({ i, nature: 'sortie' })),
    ];
    for (const { i, nature } of aControler) {
      if (controlesFaits >= 2) break;
      // (03/11) Jamais un contrôle par une sortie que le pare-feu n'a pas encore ouverte : il échouerait et jetterait l'IP.
      if (!sortiePermise(i)) { journal.info('controle_reporte_pare_feu', { ip_id: i.id, nature }); continue; }
      if (await controlerIp(i, nature)) controlesFaits++;
    }
    bilan.controles = controlesFaits;

    // 3 bis. (03/11) LA REQUALIFICATION : une visite de contrôle de la plateforme qui a refusé, sur une IP DISPONIBLE
    //        (jamais une IP tenue par un compte), au plus une par heure, seulement si le pare-feu ouvre sa sortie.
    bilan.visite = null;
    // (04/11, accord de Nico) L'INTERRUPTEUR DES VISITES DE CONTRÔLE, par plateforme : coin_config
    // `cloud_visites_controle_<plateforme>` = 0 → aucune visite de cette plateforme, depuis aucune IP. Chaque visite
    // présente à la plateforme notre navigateur sans cookie, depuis une IP du pool ; pendant le chantier Beebs, aucune.
    // Une lecture ratée de l'interrupteur coupe la visite (jamais une visite sur un doute).
    const coupees = await visitesCoupees();
    bilan.visites_coupees = [...coupees];
    if (controles?.visiterPlateforme && controlesFaits < 2 && Date.now() - derniereVisite >= VISITE_ESPACEMENT_MS) {
      const { data: aVisiter } = await base.rpc('cloud_ip_a_visiter');
      const parId = new Map(toutes.map((i) => [Number(i.id), i]));
      const v = (aVisiter ?? []).find((x) => !coupees.has(x.plateforme) && !coupees.has('*')
        && parId.get(Number(x.ip_id)) && sortiePermise(parId.get(Number(x.ip_id))));
      if (v) {
        derniereVisite = Date.now();
        const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: v.ip_id });
        if (proxyUrl) {
          const visite = await controles.visiterPlateforme({ ipId: v.ip_id, proxyUrl, plateforme: v.plateforme })
            .catch((e) => { journal.erreur('visite_controle_echec', { ip_id: v.ip_id, erreur: e.message }); return null; });
          if (visite) {
            const { data: r } = await base.rpc('cloud_ip_refus_visite', { p_ip: v.ip_id, p_plateforme: v.plateforme, p_visite: visite });
            bilan.visite = { ip_id: v.ip_id, plateforme: v.plateforme, verdict: visite.verdict, issue: r?.issue ?? r?.raison ?? null };
            journal.info('requalification', bilan.visite);
          }
        }
      }
    }

    // 4. Échéances relues (lecture seule), plan proposé.
    if (iproyal.disponible) {
      for (const i of toutes.filter((x) => !['expiree', 'rebut'].includes(x.etat))) {
        try {
          const cmd = await iproyal.lireCommande(i.commande);
          const fin = dateIproyal(cmd?.expire_date);
          if (Number.isFinite(fin) && fin > Date.parse(i.expire_le)) {
            await base.rpc('cloud_ip_renouvelee', { p_ip: i.id, p_expire_le: new Date(fin).toISOString() });
          }
        } catch (e) { journal.alerte('echeance_illisible', { ip_id: i.id, erreur: e.message }); }
      }
    }
    // (07/11) Les réglages (marge, interrupteurs, moyen de paiement), le registre des 30 derniers jours, l'état du pool.
    const g = await approvisionnement.gardes().catch((e) => { journal.alerte('gardes_illisibles', { erreur: e.message }); return null; });
    const registre = await lireRegistre().catch(() => []);
    let { data: etat } = await base.rpc('cloud_pool_etat');
    // (30/10, lot D ; 07/11, décision 3) Le solde du fournisseur (lecture seule, aucune recharge) : l'alerte part sous la
    // dépense prévue sur 14 jours ; en paiement par CARTE, c'est la carte qui est surveillée (et le solde si elle manque).
    bilan.carte = g?.paiementCarte ? await approvisionnement.verifierCarte?.(g).catch((e2) => { journal.alerte('carte_echec', { erreur: e2.message }); return null; }) ?? null : null;
    const projection = regles.seuilSoldeProjete
      ? regles.seuilSoldeProjete({ ips: toutes, registre, marge: g?.marge ?? regles.PARAMETRES?.ipMarge, enAttente: etat?.en_attente ?? 0, prixIpUsd: await prixIp(registre) })
      : null;
    bilan.solde = await fournisseurIp?.verifierSolde(Date.now(), { projection, alerter: bilan.carte?.mode !== 'carte' })
      .catch((e2) => { journal.alerte('solde_echec', { erreur: e2.message }); return null; }) ?? null;
    // En ROTATION, un compte n'attend jamais une IP dédiée : pas de plan d'achat ni d'alerte « pool vide ».
    if (await fournisseurIp?.rotationActive().catch(() => false)) {
      bilan.rotation = true;
      bilan.purges_comptes = await purgerComptesInactifs().catch((e2) => { journal.erreur('purge_comptes_echec', { erreur: e2.message }); return null; });
      journal.info('entretien', bilan);
      return bilan;
    }
    // 4 bis. (03/11) Les commandes livrées entrent au pool (contrôle d'entrée au tour suivant, sortie ouverte d'abord).
    bilan.livraisons = (await approvisionnement.livrer().catch((e) => { journal.alerte('livraisons_echec', { erreur: e.message }); return null; }))?.livrees ?? null;
    // (07/11) Une livraison a fermé des commandes et ajouté des IP : le pool et l'état sont RELUS — sinon le plan ne
    // verrait ni la commande (fermée) ni ses IP (lues avant) et rachèterait ce qui vient d'arriver.
    if (bilan.livraisons > 0) { toutes = await lireIps(); ({ data: etat } = await base.rpc('cloud_pool_etat')); }
    dernierLambda = regles.lambdaMesure(etat?.essais_7j ?? 0);
    const sainesSeulement = await regleSaines(g, toutes);
    const plan = regles.planDuJour({ ips: toutes, lambda: dernierLambda,
      enAttente: etat?.en_attente ?? 0, commandesEnCours: etat?.commandes_en_cours ?? 0,
      marge: g?.marge ?? regles.PARAMETRES?.ipMarge, comptesSansPlace: etat?.comptes_sans_place ?? null, sainesSeulement });
    bilan.plan = { renouveler: plan.renouveler.length, laisserExpirer: plan.laisserExpirer.length, aCommander: plan.aCommander, niveau: plan.niveau, vise: plan.vise,
      garde: plan.garde ? { comptees: plan.garde.comptees, borne: plan.garde.borne, ok: plan.garde.ok } : null,
      ...(sainesSeulement ? { saines_seulement: true, projete_saines: plan.projeteSaines, a_controler: plan.aControler } : {}) };
    // (07/11 soir, ordre 4) Le bilan de santé des IP libres et l'alerte « saines sous la marge » (contrôle allumé seulement).
    if (g?.santeControle && toutes.avecSante && regles.bilanSante) {
      bilan.sante = regles.bilanSante(toutes, { marge: g.marge });
      const rappel = (regles.PARAMETRES?.santeAlerteRappelH ?? 6) * 3600_000;
      if (bilan.sante.sousMarge && Date.now() - derniereAlerteMarge >= rappel) {
        derniereAlerteMarge = Date.now();
        const s = bilan.sante;
        await alertes?.signaler('serveur', `IP saines libres SOUS LA MARGE (contrôle de santé) : ${s.saines} saine(s) pour une marge de ${s.marge} — `
          + `${s.suspectes} suspecte(s), ${s.inconnues} pas encore contrôlée(s), ${s.grillees} grillée(s) sur ${s.libres} IP libres. `
          + `${g.achatsAuto ? 'L\'achat automatique reconstitue la marge (cloud_ip_achats_auto = 1).' : 'Achats automatiques COUPÉS (cloud_ip_achats_auto = 0) : la marge ne se reconstitue pas seule.'}`, { sante: s });
      }
    }
    // (03/11) Renouveler puis acheter, sous leurs gardes ; sans elles, une proposition (approvisionnement.js).
    if (g && (plan.renouveler.length || plan.aCommander > 0)) {
      const soldeVivant = bilan.solde ? { ...bilan.solde } : null;
      bilan.renouvellements = await approvisionnement.renouveler(plan, toutes, g, soldeVivant, { registre })
        .catch((e) => { journal.erreur('renouvellements_echec', { erreur: e.message }); return null; });
      bilan.achat = await approvisionnement.acheter(plan, g, soldeVivant)
        .catch((e) => { journal.erreur('achat_echec', { erreur: e.message }); return null; });
    }

    // 5. Alertes
    const decision = regles.deciderAlerte({ niveau: plan.niveau, attribuables: etat?.attribuables_essai ?? 0,
      seuilCommande: plan.seuils.commande, sansPlace: etat?.comptes_sans_place ?? 0 });
    if (decision.action === 'alerte') {
      await alertes.signaler(decision.niveau, decision.niveau === 'sans_place'
        ? `${etat?.comptes_sans_place} compte(s) Cloud actif(s) SANS IP : achète une IP (essai en attente : ${etat?.en_attente ?? 0}).`
        : `Pool ${decision.niveau === 'vide' ? 'VIDE' : 'presque vide'} : ${etat?.attribuables_essai ?? 0} IP libre(s), ${etat?.en_attente ?? 0} personne(s) attendent une place.`, { etat });
    }
    if ((etat?.purges_en_retard ?? 0) > 0) await alertes.signaler('serveur', `${etat.purges_en_retard} purge(s) en retard de plus d'une heure.`);
    // (07/11) La garde du nombre ne compte pas le rebut : une série d'IP jetées serait une boucle qu'elle ne voit pas — elle
    // est DITE ici ; au contrôle d'ENTRÉE, au-delà de PARAMETRES.ipRebutsEntreeMax en 24 h, l'achat automatique se suspend.
    if ((etat?.rebuts_24h ?? 0) >= 2) await alertes.signaler('serveur', `${etat.rebuts_24h} IP envoyées au rebut en 24 h (dont ${plan.rebutsEntree24h ?? '?'} au contrôle d'entrée) : à partir de ${regles.PARAMETRES?.ipRebutsEntreeMax ?? 3} au contrôle d'entrée, l'achat automatique se suspend 24 h. Relire cloud_ip_evenements.`);
    bilan.etat = { attribuables: etat?.attribuables_essai, en_attente: etat?.en_attente, sans_place: etat?.comptes_sans_place };
    journal.info('entretien', bilan);
    return bilan;
  }

  /** (07/11) Les IP des achats en cours (registre : « demandee », « en_cours ») — une petite table. */
  async function achatsEnCours() {
    const { data, error } = await base.from('cloud_ip_commandes').select('quantite').eq('nature', 'achat').in('statut', ['demandee', 'en_cours']);
    if (error) throw new Error(`cloud_ip_commandes : ${error.message}`);
    return (data ?? []).reduce((n, c) => n + (Number(c.quantite) || 0), 0);
  }
  async function personnesEnAttente() {
    const { count, error } = await base.from('cloud_attente').select('user_id', { count: 'exact', head: true });
    if (error) throw new Error(`cloud_attente : ${error.message}`);
    return Number(count) || 0;
  }

  /**
   * (07/11, décision 1 de Nico : « IP toujours d'avance ; la liste d'attente n'est qu'un filet ») LE RÉAPPROVISIONNEMENT
   * RAPIDE — toutes les REAPPRO_RAPIDE_MIN minutes (index.js). Rien sans IPROYAL_ACHATS_AUTORISES=1 (aucune lecture) ni
   * sans cloud_ip_achats_auto = 1 ; sinon trois petites lectures (cloud_ips, achats en cours, attente). Puis, seulement
   * s'il y a lieu : la livraison des commandes en cours (IPRoyal), le pare-feu et le contrôle d'entrée d'UNE IP achetée
   * (elle devient attribuable sans attendre l'heure), et l'achat de ce qui manque à la marge — mêmes gardes que
   * l'entretien (garde du nombre en JS et en base, pause d'une heure après un échec). Jamais pendant un entretien (même
   * verrou) ; jamais deux achats ensemble (le verrou ici, la base sous verrou entre serveurs).
   */
  async function reapprovisionnerVite() {
    if (config?.entretienPool === false) return { pool: 'coupe' };
    if (iproyal?.achatsAutorises !== true) return { coupe: 'serveur' };
    if (occupe) return { occupe: true };
    occupe = true;
    try {
      const g = await approvisionnement.gardes();
      if (!g?.envAutorise || !g?.achatsAuto) return { coupe: 'interrupteur' };
      if (await fournisseurIp?.rotationActive?.().catch(() => false)) return { rotation: true };
      const bilan = {};
      let toutes = await lireIps();
      let enCommande = await achatsEnCours();
      if (enCommande > 0) {
        bilan.livraisons = (await approvisionnement.livrer().catch((e) => { journal.alerte('livraisons_echec', { erreur: e.message }); return null; }))?.livrees ?? 0;
        if (bilan.livraisons > 0) { toutes = await lireIps(); enCommande = await achatsEnCours(); }
      }
      const achetees = toutes.filter((i) => i.etat === 'achetee');
      if (achetees.length && controles?.controler) {
        const enUsage = (navigateurs?.ouverts?.() ?? []).map((u) => navigateurs.ouvert?.(u)?.ipId).filter((x) => x != null);
        const pf = await pareFeu.synchroniser(toutes, { enUsage }).catch((e) => { journal.alerte('pare_feu_synchro_echec', { erreur: e.message }); return null; });
        const appliquees = pf?.appliquees ?? await pareFeu.appliquees().catch(() => null);
        const i = achetees.find((x) => appliquees && sortieOuverte(appliquees, x.ip, x.port ?? 12323));
        if (i && await controlerIp(i, 'entree')) { bilan.controle = i.id; toutes = await lireIps(); }
      }
      const lambda = dernierLambda ?? regles.lambdaMesure(0);
      const sainesSeulement = await regleSaines(g, toutes);
      const avant = regles.planDuJour({ ips: toutes, lambda, enAttente: await personnesEnAttente(), commandesEnCours: enCommande, marge: g.marge, sainesSeulement });
      if (avant.aCommander <= 0) {
        if (Object.keys(bilan).length) journal.info('reappro_rapide', { ...bilan, aCommander: 0 });
        return { ...bilan, aCommander: 0 };
      }
      // Il manque des IP : l'état du pool (comptes actifs sans IP) porte la garde du nombre ; puis l'achat.
      const { data: etat, error } = await base.rpc('cloud_pool_etat');
      if (error) throw new Error(`cloud_pool_etat : ${error.message}`);
      const plan = regles.planDuJour({ ips: toutes, lambda, enAttente: etat?.en_attente ?? 0, commandesEnCours: etat?.commandes_en_cours ?? enCommande,
        marge: g.marge, comptesSansPlace: etat?.comptes_sans_place ?? null, sainesSeulement });
      bilan.aCommander = plan.aCommander;
      if (plan.aCommander > 0) {
        const solde = await fournisseurIp?.solde?.().catch(() => null) ?? null;
        bilan.achat = await approvisionnement.acheter(plan, g, solde ? { ...solde } : null);
      }
      journal.info('reappro_rapide', { ...bilan, vise: plan.vise, projete: plan.projete,
        garde: plan.garde ? { comptees: plan.garde.comptees, borne: plan.garde.borne, ok: plan.garde.ok } : null });
      return bilan;
    } finally { occupe = false; }
  }

  /**
   * (07/11 soir, ordre 3 de Nico) La règle « saines d'abord » s'applique-t-elle ? Le réglage (cloud_ip_renouveler_saines_
   * seulement = 1) ET le contrôle de santé allumé ET la santé lue en base. Demandée sans eux : la règle d'avant, dite.
   */
  async function regleSaines(g, toutes) {
    if (!g?.sainesSeulement) return false;
    if (g.santeControle && toutes?.avecSante) return true;
    if (Date.now() - derniereAlerteRegle >= (regles.PARAMETRES?.santeAlerteRappelH ?? 6) * 3600_000) {
      derniereAlerteRegle = Date.now();
      await alertes?.signaler('serveur', `Règle « saines d'abord » demandée (cloud_ip_renouveler_saines_seulement = 1) mais ${!g.santeControle
        ? 'le contrôle de santé est coupé (cloud_ip_sante_controle = 0)' : 'la colonne cloud_ips.sante manque (migration 20261107190000)'} : aucune santé connue, le renouvellement suit la règle d'avant.`);
    }
    return false;
  }

  /**
   * (07/11 soir, ordre 4 de Nico : « ce contrôle de santé doit tourner seul, régulièrement, sur toutes les IP libres ; une IP
   * grillée n'est jamais donnée à un client ») LE CONTRÔLE DE SANTÉ — toutes les SANTE_IP_MIN minutes (index.js). Rien
   * sans coin_config cloud_ip_sante_controle = 1 (une seule lecture). Sinon, sous le verrou de l'entretien (jamais deux
   * navigateurs de contrôle ensemble), hors pointe de charge (PARAMETRES.santeChargeMax), UNE IP (choisirIpASonder : libre,
   * ni réservée ni en usage, sortie ouverte par le pare-feu ; suspectes, jamais contrôlées, puis au plus tard toutes les
   * 20 h) contrôlée par un Chrome jetable (sante.js) ; la santé suivante (santeSuivante : un échec rend « suspecte », le
   * même échec relu au moins 30 min plus tard « grillée ») va à cloud_ip_sante_noter. Devenue grillée : alerte support@.
   */
  async function controlerSante() {
    if (config?.entretienPool === false) return { pool: 'coupe' };
    if (!sante?.verifier || !regles.choisirIpASonder) return { coupe: 'module' };
    const { data: actif, error } = await base.rpc('cloud_param', { p_cle: 'ip_sante_controle', p_defaut: 0 });
    if (error || Number(actif) !== 1) return { coupe: 'interrupteur' };
    if (occupe) return { occupe: true };
    const c = Number(charge?.());
    if (Number.isFinite(c) && c > (regles.PARAMETRES?.santeChargeMax ?? 0.7)) {
      journal.info('sante_reportee_charge', { charge: Math.round(c * 100) / 100 });
      return { charge: c };
    }
    occupe = true;
    try {
      const toutes = await lireIps();
      if (!toutes.avecSante) return { coupe: 'migration_absente' };
      const appliquees = await pareFeu.appliquees().catch(() => null);
      const enUsage = (navigateurs?.ouverts?.() ?? []).map((u) => navigateurs.ouvert?.(u)?.ipId).filter((x) => x != null);
      const choix = regles.choisirIpASonder(toutes, { enUsage,
        permise: (i) => Boolean(appliquees) && sortieOuverte(appliquees, i.ip, i.port ?? 12323) });
      if (!choix) return { rien: true };
      const ip = choix.ip;
      const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: ip.id });
      if (!proxyUrl) { journal.alerte('sante_proxy_illisible', { ip_id: ip.id }); return { ip_id: ip.id, raison: 'proxy_illisible' }; }
      const controle = await sante.verifier({ ipId: ip.id, ip: ip.ip, proxyUrl });
      const nouvelle = regles.santeSuivante(ip.sante ?? null, controle);
      const { data: r, error: e2 } = await base.rpc('cloud_ip_sante_noter', { p_ip: ip.id, p_sante: nouvelle });
      const bilan = { ip_id: ip.id, raison: choix.raison, dues: choix.dues, avant: ip.sante?.verdict ?? null, verdict: nouvelle.verdict,
        echecs: controle.echecs, inconnus: controle.inconnus, ecrit: r?.ok === true, ...(r?.ok === true ? {} : { refus: r?.raison ?? e2?.message ?? null }) };
      journal.info('sante_ip', bilan);
      if (r?.ok === true && nouvelle.verdict === 'grillee' && r.avant !== 'grillee') {
        const echeance = new Date(ip.expire_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
        await alertes?.signaler('serveur', `IP ${ip.id} (${ip.ip}) GRILLÉE au contrôle de santé : ${nouvelle.echecs.join(', ')} — échec relu par un 2e contrôle `
          + `(1er le ${nouvelle.suspecte_le}). Elle n'est plus attribuable, ne compte plus dans la marge et ne sera jamais renouvelée : elle expire à son terme (${echeance}, heure de Paris).`,
        { ip_id: ip.id, sante: { echecs: nouvelle.echecs, suspecte_le: nouvelle.suspecte_le, grillee_le: nouvelle.grillee_le, resume: controle.resume } });
      }
      return bilan;
    } finally { occupe = false; }
  }

  return { tour, purger, purgerComptesInactifs, reapprovisionnerVite, controlerSante };
}
