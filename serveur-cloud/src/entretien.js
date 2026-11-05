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
//   4 bis. la LIVRAISON des commandes, le RENOUVELLEMENT et l'ACHAT sous le stock visé — sous la triple garde
//      (approvisionnement.js) ; sans elle, une proposition (alerte).
import { mkdir } from 'node:fs/promises';
import { nouveauProfilId } from './navigateur.js';
import { claims } from './sessionFillsell.js';
import { creerPareFeu, sortieOuverte } from './pareFeu.js';
import { creerApprovisionnement, dateIproyal } from './approvisionnement.js';

export const VISITE_ESPACEMENT_MS = 3600_000;   // (03/11) au plus une visite de contrôle de plateforme par heure

export function creerEntretien({ config, base, navigateurs, coffre, sessions, iproyal, controles, alertes, regles, journal, fournisseurIp,
  pareFeu = creerPareFeu({ config, journal }), approvisionnement = creerApprovisionnement({ base, iproyal, alertes, journal, regles }) }) {
  let derniereVisite = 0;
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

  async function tour() {
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

    const { data: ips } = await base.from('cloud_ips')
      .select('id, commande, ip, port, etat, user_id, dernier_user_id, liberee_le, repos_fin, purge_prouvee_le, expire_le, attributions, reserve_pour, reserve_jusqu_au, refus');
    const toutes = (ips ?? []).map((i) => ({ ...i, ip: String(i.ip).replace(/\/32$/, '') }));

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
      const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: i.id });
      if (!proxyUrl) continue;
      controlesFaits++;
      const c = await controles.controler({ ipId: i.id, ip: i.ip, proxyUrl }).catch((e) => { journal.erreur('controle_echec', { ip_id: i.id, erreur: e.message }); return null; });
      if (!c) continue;
      const rpc = nature === 'entree' ? 'cloud_ip_controle_entree' : 'cloud_ip_remettre_en_pool';
      const { data } = await base.rpc(rpc, { p_ip: i.id, p_controle: c });
      journal.info('controle_applique', { ip_id: i.id, nature, ok: data?.ok === true, manques: data?.manques ?? [] });
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
    // (30/10, lot D) Le solde du fournisseur (lecture seule) : alerte s'il passe sous le seuil, aucun achat.
    bilan.solde = await fournisseurIp?.verifierSolde().catch((e2) => { journal.alerte('solde_echec', { erreur: e2.message }); return null; }) ?? null;
    // En ROTATION, un compte n'attend jamais une IP dédiée : pas de plan d'achat ni d'alerte « pool vide ».
    if (await fournisseurIp?.rotationActive().catch(() => false)) {
      bilan.rotation = true;
      bilan.purges_comptes = await purgerComptesInactifs().catch((e2) => { journal.erreur('purge_comptes_echec', { erreur: e2.message }); return null; });
      journal.info('entretien', bilan);
      return bilan;
    }
    // 4 bis. (03/11) Les commandes livrées entrent au pool (contrôle d'entrée au tour suivant, sortie ouverte d'abord).
    bilan.livraisons = (await approvisionnement.livrer().catch((e) => { journal.alerte('livraisons_echec', { erreur: e.message }); return null; }))?.livrees ?? null;
    const { data: etat } = await base.rpc('cloud_pool_etat');
    const g = await (approvisionnement.gardesEtSeuil ?? approvisionnement.gardes)().catch((e) => { journal.alerte('gardes_illisibles', { erreur: e.message }); return null; });
    const plan = regles.planDuJour({ ips: toutes, lambda: regles.lambdaMesure(etat?.essais_7j ?? 0),
      enAttente: etat?.en_attente ?? 0, commandesEnCours: etat?.commandes_en_cours ?? 0,
      stockMin: g?.stockMin ?? regles.PARAMETRES?.ipStockMin });
    bilan.plan = { renouveler: plan.renouveler.length, laisserExpirer: plan.laisserExpirer.length, aCommander: plan.aCommander, niveau: plan.niveau, vise: plan.vise };
    // (03/11) Renouveler puis acheter, sous la triple garde ; sans elle, une proposition (approvisionnement.js).
    if (g && (plan.renouveler.length || plan.aCommander > 0)) {
      const soldeVivant = bilan.solde ? { ...bilan.solde } : null;
      bilan.renouvellements = await approvisionnement.renouveler(plan, toutes, g, soldeVivant)
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
    bilan.etat = { attribuables: etat?.attribuables_essai, en_attente: etat?.en_attente, sans_place: etat?.comptes_sans_place };
    journal.info('entretien', bilan);
    return bilan;
  }

  return { tour, purger, purgerComptesInactifs };
}
