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
import { mkdir } from 'node:fs/promises';
import { nouveauProfilId } from './navigateur.js';
import { claims } from './sessionFillsell.js';

export function creerEntretien({ config, base, navigateurs, coffre, sessions, iproyal, controles, alertes, regles, journal }) {
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

  async function tour() {
    const bilan = {};
    const { data: e1, error } = await base.rpc('cloud_pool_entretien');
    if (error) throw new Error(`cloud_pool_entretien : ${error.message}`);
    bilan.base = e1;

    const { data: ips } = await base.from('cloud_ips')
      .select('id, commande, ip, etat, dernier_user_id, liberee_le, repos_fin, purge_prouvee_le, expire_le, attributions, reserve_pour, reserve_jusqu_au');
    const toutes = (ips ?? []).map((i) => ({ ...i, ip: String(i.ip).replace(/\/32$/, '') }));

    // 2. Purges
    bilan.purges = 0;
    for (const ip of toutes.filter((i) => i.etat === 'repos' && !i.purge_prouvee_le && i.dernier_user_id)) {
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

    // 4. Échéances relues (lecture seule), plan proposé.
    if (iproyal.disponible) {
      for (const i of toutes.filter((x) => !['expiree', 'rebut'].includes(x.etat))) {
        try {
          const cmd = await iproyal.lireCommande(i.commande);
          const fin = Date.parse(cmd?.expire_date ?? '');
          if (Number.isFinite(fin) && fin > Date.parse(i.expire_le)) {
            await base.rpc('cloud_ip_renouvelee', { p_ip: i.id, p_expire_le: new Date(fin).toISOString() });
          }
        } catch (e) { journal.alerte('echeance_illisible', { ip_id: i.id, erreur: e.message }); }
      }
    }
    const { data: etat } = await base.rpc('cloud_pool_etat');
    const plan = regles.planDuJour({ ips: toutes, lambda: regles.lambdaMesure(etat?.essais_7j ?? 0),
      enAttente: etat?.en_attente ?? 0, commandesEnCours: etat?.commandes_en_cours ?? 0 });
    bilan.plan = { renouveler: plan.renouveler.length, laisserExpirer: plan.laisserExpirer.length, aCommander: plan.aCommander, niveau: plan.niveau };
    if (plan.renouveler.length || plan.aCommander > 0) {
      await alertes.signaler('serveur', `Proposition (aucun achat fait) : renouveler ${plan.renouveler.length} IP (${plan.renouveler.join(', ') || '—'}), commander ${plan.aCommander} IP neuve(s).`, { plan: bilan.plan });
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

  return { tour, purger };
}
