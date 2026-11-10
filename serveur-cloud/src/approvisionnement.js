// (03/11, point 2 de Nico) L'APPROVISIONNEMENT AUTOMATIQUE DES IP — appelé par l'entretien horaire (entretien.js) et,
// (07/11, décision 1) par le RÉAPPROVISIONNEMENT RAPIDE (entretien.reapprovisionnerVite, toutes les quelques minutes).
//   · RENOUVELLEMENT de toute IP que le plan désigne (une IP attribuée avant son échéance, une IP de la marge dont le pool
//     a besoin) : la commande IPRoyal entière est prolongée de 30 jours (une commande peut porter plusieurs IP : elles
//     ont la même échéance) ;
//   · ACHAT sous le stock visé (planDuJour : la MARGE, coin_config cloud_ip_marge, + les personnes en attente) : UNE
//     commande de N IP (N ≤ cloud_ip_achat_max, la remise de volume d'IPRoyal), France, 30 jours, sans renouvellement
//     chez IPRoyal ;
//   · LIVRAISON relue aux tours suivants : chaque IP livrée entre au pool (cloud_ip_ajouter : l'URL du proxy va au
//     vault, jamais au journal), le contrôle d'entrée la rend disponible.
// ⛔ LES GARDES : IPROYAL_ACHATS_AUTORISES=1 sur le serveur (iproyal.achatsAutorises), ET coin_config
//    cloud_ip_achats_auto / cloud_ip_renouvellement_auto = 1. Sinon : une PROPOSITION (alerte, aucun achat).
//    (07/11, décision 2 de Nico : « plus de plafond en dollars ») Le plafond du mois est RETIRÉ. À sa place, UNE garde
//    du NOMBRE pour l'achat : jamais plus d'IP comptées (vivantes + en commande + demandées) que de comptes Cloud + marge
//    + attente — en JS (regles.gardeNombre, porté par le plan) ET en base sous le verrou de la dépense
//    (cloud_ip_depense_ouvrir → cloud_ip_garde_nombre : plusieurs serveurs, une seule vérité). Elle n'arrête qu'une
//    boucle (alerte immédiate à support@), jamais un achat que le plan demande. Une PROLONGATION n'y passe jamais ; son
//    anti-boucle : jamais deux fois la même commande en 15 jours. Toute dépense est ouverte au registre
//    (cloud_ip_commandes) AVANT l'appel au fournisseur ; un achat échoué suspend l'achat automatique une heure.
// (10/11 soir, ordre de Nico) LE MOYEN DE PAIEMENT : le SOLDE du compte IPRoyal, JAMAIS une carte. La banque refuse
//    IPRoyal (« marchand non autorisé » : achat du 10/11 19:36 en HTTP 500, paiements de 3,50 € refusés). Le mode carte
//    du 07/11 (coin_config cloud_ip_paiement_carte / cloud_ip_carte_id, reprise par le solde) est RETIRÉ : ces réglages
//    ne sont plus lus. Solde qui ne couvre pas la dépense : RIEN n'est acheté ni prolongé, aucune bascule, UNE alerte à
//    Nico « recharger le solde » (au plus une par heure et par texte, alertes.js). Une issue inconnue (5xx, coupure) n'est
//    jamais rejouée (jamais deux paiements). Le registre dit le moyen (details.paiement = 'solde').
import { proxiesLivres } from './iproyal.js';

/** Une date IPRoyal (« 2026-12-04 12:57:45 », UTC sans fuseau) → instant (pure) ; NaN si illisible. */
export function dateIproyal(s) {
  const t = String(s ?? '').trim();
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(t)) return Date.parse(`${t.replace(' ', 'T')}Z`);
  return Date.parse(t);
}

/** Les IP à renouveler, groupées par commande IPRoyal (pure) : Map commande → [ip_id]. Sans commande : écartée. */
export function grouperParCommande(ids, ips) {
  const parId = new Map((ips ?? []).map((i) => [Number(i.id), i]));
  const out = new Map();
  for (const id of ids ?? []) {
    const c = parId.get(Number(id))?.commande;
    if (!c) continue;
    out.set(String(c), [...(out.get(String(c)) ?? []), Number(id)]);
  }
  return out;
}

const RAISONS = Object.freeze({
  achats_coupes_serveur: 'achats coupés sur le serveur (IPROYAL_ACHATS_AUTORISES)',
  interrupteur_coupe: 'interrupteur coupé (coin_config)',
  garde_nombre: 'garde du nombre : plus d\'IP que de comptes Cloud + marge + attente',
  garde_illisible: 'garde du nombre illisible',
  prolongation_recente: 'commande déjà prolongée il y a moins de 15 jours',
  solde_insuffisant: 'solde IPRoyal insuffisant',
  prix_illisible: 'prix IPRoyal illisible',
  prix_ou_quantite_illisible: 'prix IPRoyal illisible',
  nature_inconnue: 'nature inconnue',
  echec_recent: 'un achat a échoué il y a moins d\'une heure',
  rebuts_controle: 'IP refusées au contrôle d\'entrée en série (24 h) : achat automatique suspendu, vérifier IPRoyal et le contrôle',
});
export const raisonLisible = (r) => RAISONS[r] ?? r;

/** (07/11) Un achat échoué suspend l'achat automatique pendant ce délai : jamais une boucle d'essais. */
export const ECHEC_ACHAT_PAUSE_MS = 3600_000;

/** (10/11 soir) L'alerte d'un solde qui ne couvre pas une dépense (pure) : ce qui manque, et « recharger ». */
export function texteSoldeInsuffisant({ nature, soldeUsd, montantUsd, texte }) {
  const s = Number(soldeUsd), m = Number(montantUsd);
  const manque = Number.isFinite(s) && Number.isFinite(m) ? Math.max(0, Math.ceil((m - s) * 100) / 100) : NaN;
  return `${nature} d'IP NON FAIT : solde IPRoyal ${Number.isFinite(s) ? `${s.toFixed(2)} $` : 'illisible'}, il faut ${Number.isFinite(m) ? `${m.toFixed(2)} $` : '?'}`
    + `${Number.isFinite(manque) ? ` (manque ${manque.toFixed(2)} $)` : ''}. RECHARGER LE SOLDE sur le tableau de bord IPRoyal — les IP ne se paient`
    + ` jamais par carte, rien n'est acheté d'ici là. (${texte})`;
}

export function creerApprovisionnement({ base, iproyal, alertes, journal, regles, attendreLivraisonMs = 120_000, pasMs = 20_000, maintenant = () => Date.now() }) {
  let dernierEchecAchat = null;
  const param = async (cle, defaut) => {
    const { data, error } = await base.rpc('cloud_param', { p_cle: cle, p_defaut: defaut });
    return error ? defaut : Number(data ?? defaut);
  };

  /** Les gardes et réglages, lus à chaque tour (un changement de coin_config vaut au tour suivant). */
  async function gardes() {
    // (07/11 soir, ordres 3 et 4 de Nico) cloud_ip_sante_controle (le contrôle de santé périodique) et
    // cloud_ip_renouveler_saines_seulement (la règle « saines d'abord ») : 0 par défaut — le comportement d'avant.
    // (10/11 soir) cloud_ip_paiement_carte / cloud_ip_carte_id ne sont plus lus : les IP se paient par le solde, toujours.
    const [achatsAuto, renouvAuto, marge, achatMax, santeControle, sainesSeulement] = await Promise.all([
      param('ip_achats_auto', 0), param('ip_renouvellement_auto', 0), param('ip_marge', regles?.PARAMETRES?.ipMarge ?? 3),
      param('ip_achat_max', regles?.PARAMETRES?.ipAchatMax ?? 10),
      param('ip_sante_controle', 0), param('ip_renouveler_saines_seulement', 0),
    ]);
    return {
      envAutorise: iproyal?.achatsAutorises === true, achatsAuto: achatsAuto === 1, renouvAuto: renouvAuto === 1,
      marge: Math.max(0, Math.floor(Number.isFinite(marge) ? marge : 3)), achatMax: Math.max(1, Math.min(50, achatMax || 10)),
      santeControle: santeControle === 1, sainesSeulement: sainesSeulement === 1,
    };
  }

  /** (10/11 soir) Le moyen de paiement : le SOLDE, toujours (jamais une carte — ordre de Nico). */
  function moyenPaiement() {
    return { mode: 'solde' };
  }

  /** Une dépense refusée ou impossible : dite (jamais un mail à un utilisateur ; ALERTES_MAIL décide pour support@). */
  async function dire(nature, raison, texte, details) {
    journal.info('approvisionnement_refuse', { nature, raison, ...details });
    if (raison === 'achats_coupes_serveur' || raison === 'interrupteur_coupe') {
      await alertes?.signaler('serveur', `Proposition (aucune dépense faite, ${raisonLisible(raison)}) : ${texte}`, details);
    } else if (raison === 'garde_nombre') {
      // (07/11, décision 2) La garde du nombre a parlé : une boucle d'achat est possible — alerte IMMÉDIATE.
      const gd = details?.garde ?? {};
      await alertes?.signaler('serveur', `Achat d'IP BLOQUÉ par la garde du nombre : ${gd.comptees ?? '?'} IP comptées (vivantes ${gd.vivantes ?? '?'}`
        + ` + en commande ${gd.en_commande ?? '?'} + demandées ${gd.demandees ?? '?'}) pour une borne de ${gd.borne ?? '?'} (comptes Cloud ${gd.comptes ?? '?'}`
        + ` + marge ${gd.marge ?? '?'} + attente ${gd.attente ?? '?'}). Une boucle d'achat ? Rien n'est acheté : relire cloud_ip_commandes et cloud_ips. (${texte})`, details);
    } else if (raison === 'solde_insuffisant') {
      // (10/11 soir) Le solde ne couvre pas : rien n'est fait, aucune bascule sur une carte — Nico recharge le solde.
      await alertes?.signaler('serveur', texteSoldeInsuffisant({ nature: nature === 'achat' ? 'Achat' : 'Renouvellement',
        soldeUsd: details?.solde_usd, montantUsd: details?.prix_usd, texte }), details);
    } else {
      await alertes?.signaler('serveur', `Dépense IPRoyal BLOQUÉE (${raisonLisible(raison)}) : ${texte}`, details);
    }
  }

  /**
   * LE PAIEMENT D'UNE DÉPENSE DÉJÀ OUVERTE AU REGISTRE : `geste()` = l'appel IPRoyal, payé par le SOLDE. (10/11 soir)
   * Plus de carte ni de reprise : une erreur remonte telle quelle ; un 5xx ou une coupure = issue inconnue, jamais rejouée.
   */
  async function payer({ geste }) {
    try {
      return { r: await geste(), paiement: 'solde' };
    } catch (e) {
      if (!(Number(e?.statut) >= 400 && Number(e?.statut) < 500)) {
        e.message = `${e.message} — issue inconnue (aucune reprise : jamais deux paiements), vérifier le tableau de bord IPRoyal`;
      }
      throw e;
    }
  }

  /** La livraison des commandes en cours : chaque IP livrée entre au pool (état « achetee »). */
  async function livrer(instantLu = maintenant()) {
    if (!iproyal?.disponible) return { livrees: 0 };
    const { data: enCours } = await base.from('cloud_ip_commandes')
      .select('id, commande, quantite, demandee_le, statut').eq('nature', 'achat').in('statut', ['demandee', 'en_cours']);
    let livrees = 0;
    for (const c of enCours ?? []) {
      if (!c.commande) {
        // Ouverte au registre, jamais passée (mort entre les deux) : comptée par la garde du nombre, dite — jamais rejouée.
        if (instantLu - Date.parse(c.demandee_le) > 3600_000) {
          await alertes?.signaler('serveur', `Dépense IPRoyal n° ${c.id} ouverte sans commande depuis plus d'une heure : vérifier le tableau de bord IPRoyal.`, { depense: c.id });
        }
        continue;
      }
      try {
        const cmd = await iproyal.lireCommande(c.commande);
        const proxies = proxiesLivres(cmd);
        if (proxies.length < Number(c.quantite)) {
          if (instantLu - Date.parse(c.demandee_le) > 48 * 3600_000) {
            await alertes?.signaler('serveur', `Commande IPRoyal ${c.commande} : ${proxies.length}/${c.quantite} IP livrées après 48 h.`, { commande: c.commande });
          }
          continue;
        }
        const expire = dateIproyal(cmd?.expire_date);
        const ajoutees = [];
        for (const p of proxies) {
          const url = iproyal.urlProxy(cmd, p.ip);
          if (!url || !Number.isFinite(expire)) continue;
          const { data, error } = await base.rpc('cloud_ip_ajouter', { p_commande: String(c.commande), p_ip: p.ip, p_port: p.port,
            p_ville: cmd?.location ?? null, p_asn: null, p_proxy_url: url, p_expire_le: new Date(expire).toISOString() });
          if (error && !/duplicate|unique/i.test(error.message)) { journal.erreur('livraison_ajout_echec', { commande: c.commande, erreur: error.message }); continue; }
          ajoutees.push(p.ip);
          if (data != null) livrees++;
        }
        if (ajoutees.length === proxies.length) {
          await base.rpc('cloud_ip_depense_fermer', { p_id: c.id, p_statut: 'livree', p_commande: null, p_prix_usd: null, p_details: { ips: ajoutees.length } });
          journal.info('commande_livree', { commande: c.commande, ips: ajoutees.length });
        }
      } catch (e) { journal.alerte('livraison_illisible', { commande: c.commande, erreur: e.message }); }
    }
    return { livrees };
  }

  /**
   * Les renouvellements du plan (une commande entière à la fois). `registre` : lignes récentes de cloud_ip_commandes
   * (l'anti-boucle des prolongations, ici et en base). Jamais bornés par la garde du nombre.
   */
  async function renouveler(plan, ips, g, solde, { registre = [] } = {}) {
    const faits = [];
    for (const [commande, ids] of grouperParCommande(plan?.renouveler ?? [], ips)) {
      let montant = NaN, cat = null, quantite = ids.length;
      try {
        cat = await iproyal.catalogueIsp();
        quantite = proxiesLivres(await iproyal.lireCommande(commande)).length || ids.length;
        montant = await iproyal.prixCommande(quantite, cat);
      } catch (e) { journal.alerte('renouvellement_prix_illisible', { commande, erreur: e.message }); }
      const texte = `renouveler la commande ${commande} (${quantite} IP : ${ids.join(', ')}) pour ${Number.isFinite(montant) ? `${montant.toFixed(2)} $` : 'un prix illisible'}.`;
      const paiement = moyenPaiement();
      const dejaProlongee = ids.some((id) => regles.prolongationRecente({ registre, commande, ip: id, maintenant: maintenant() }));
      const d = regles.deciderDepense({ montantUsd: montant, envAutorise: g.envAutorise, interrupteur: g.renouvAuto, dejaProlongee,
        soldeUsd: solde?.montant });
      if (!d.faire) { await dire('prolongation', d.raison, texte, { commande, ips: ids, prix_usd: montant, solde_usd: solde?.montant ?? null }); faits.push({ commande, fait: false, raison: d.raison }); continue; }
      const { data: o } = await base.rpc('cloud_ip_depense_ouvrir', { p_nature: 'prolongation', p_quantite: quantite, p_prix_usd: montant,
        p_ip: ids[0], p_details: { commande, ips: ids, paiement: paiement.mode } });
      if (!o?.ok) { await dire('prolongation', o?.raison ?? 'refus_base', texte, { commande }); faits.push({ commande, fait: false, raison: o?.raison }); continue; }
      try {
        const p = await payer({ geste: () => iproyal.prolonger(commande, cat.planId) });
        const fin = dateIproyal(p.r?.expire_date);
        await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'livree', p_commande: String(commande), p_prix_usd: montant,
          p_details: { expire_date: p.r?.expire_date ?? null, paiement: p.paiement } });
        if (Number.isFinite(fin)) {
          for (const id of ids) await base.rpc('cloud_ip_renouvelee', { p_ip: id, p_expire_le: new Date(fin).toISOString() });
        }
        if (p.paiement === 'solde' && solde && Number.isFinite(solde.montant)) solde.montant -= montant;
        registre.push({ nature: 'prolongation', statut: 'livree', demandee_le: new Date(maintenant()).toISOString(), ip_id: ids[0], details: { commande } });
        journal.info('renouvellement_fait', { commande, ips: ids.length, prix_usd: montant, paiement: p.paiement });
        faits.push({ commande, fait: true, paiement: p.paiement });
      } catch (e) {
        await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'echec', p_commande: String(commande), p_prix_usd: null, p_details: { erreur: e.message.slice(0, 200) } });
        await alertes?.signaler('serveur', `Renouvellement IPRoyal ÉCHOUÉ (commande ${commande}) : ${e.message.slice(0, 200)}`, { commande });
        faits.push({ commande, fait: false, raison: 'echec' });
      }
    }
    return faits;
  }

  /**
   * (04/11 soir, essai GPU — règle de Nico : « aucun achat d'IP sans mon accord écrit tant que le Cloud n'est pas ouvert »)
   * Le registre d'un achat sur ACCORD ÉCRIT quand l'interrupteur automatique est à 0 : cloud_ip_depense_ouvrir le refuse
   * (il ne connaît que l'automatique) ; la ligne s'écrit donc ici, mêmes colonnes, et `go_par` dit l'accord. La garde du
   * nombre a été relue en base juste avant (acheter). Aucun achat automatique ne peut courir en même temps (interrupteur à 0).
   */
  async function ouvrirSurAccord({ quantite, prixUsd, details, accord }) {
    const { data, error } = await base.from('cloud_ip_commandes').insert({ fournisseur: 'iproyal', nature: 'achat', quantite, statut: 'demandee',
      prix_usd: prixUsd, go_par: `accord écrit de Nico : ${accord}`.slice(0, 300), details: { ...details, accord_ecrit: accord } }).select('id').maybeSingle();
    if (error || !data?.id) return { ok: false, raison: 'registre_refuse' };
    return { ok: true, id: data.id };
  }

  /**
   * L'achat sous le stock visé : UNE commande de N IP (N ≤ cloud_ip_achat_max), sous la garde du nombre que porte le
   * plan (planDuJour, `garde`) — la base la revérifie sous verrou. (04/11 soir) `accordEcrit` : le texte de l'accord
   * écrit de Nico — il tient lieu d'interrupteur automatique, rien d'autre (serveur, garde du nombre relue en base, solde,
   * registre).
   */
  async function acheter(plan, g, solde, { accordEcrit = null } = {}) {
    const accord = typeof accordEcrit === 'string' && accordEcrit.trim().length >= 10 ? accordEcrit.trim() : null;
    const n = Math.min(Math.max(0, Math.floor(Number(plan?.aCommander) || 0)), g.achatMax);
    if (n <= 0) return { fait: false, raison: 'rien_a_acheter' };
    const t0 = maintenant();
    if (!accord && dernierEchecAchat != null && t0 - dernierEchecAchat < ECHEC_ACHAT_PAUSE_MS) {
      journal.info('achat_suspendu', { raison: 'echec_recent', depuis_s: Math.round((t0 - dernierEchecAchat) / 1000) });
      return { fait: false, raison: 'echec_recent' };
    }
    let montant = NaN, cat = null;
    try { cat = await iproyal.catalogueIsp(); montant = await iproyal.prixCommande(n, cat); } catch (e) { journal.alerte('achat_prix_illisible', { erreur: e.message }); }
    const texte = `acheter ${n} IP France 30 jours pour ${Number.isFinite(montant) ? `${montant.toFixed(2)} $` : 'un prix illisible'} (stock visé ${plan.vise}, prêtes ${plan.projete}).`;
    const paiement = moyenPaiement();
    // (07/11, décision 2) La garde du nombre : celle du plan (JS) ; sur accord écrit (plan sans garde), relue en base.
    const surAccord = Boolean(accord) && !g.achatsAuto;
    let garde = regles.gardePour(plan?.garde ?? null, n);
    if (surAccord) {
      const { data, error } = await base.rpc('cloud_ip_garde_nombre', { p_quantite: n });
      garde = error ? null : data;
    }
    const d = regles.deciderDepense({ montantUsd: montant, envAutorise: g.envAutorise, interrupteur: g.achatsAuto || Boolean(accord),
      garde, rebutsEntree: surAccord ? 0 : (plan?.rebutsEntree24h ?? 0), soldeUsd: solde?.montant });
    if (!d.faire) { await dire('achat', d.raison, texte, { quantite: n, prix_usd: montant, solde_usd: solde?.montant ?? null, ...(garde ? { garde } : {}) }); return { fait: false, raison: d.raison }; }
    const detailsAchat = { produit: cat.produitId, offre: cat.planId, lieu: cat.lieuId, paiement: paiement.mode,
      ...(accord ? { accord_ecrit: accord } : {}) };
    const o = surAccord
      ? await ouvrirSurAccord({ quantite: n, prixUsd: montant, details: detailsAchat, accord })
      : (await base.rpc('cloud_ip_depense_ouvrir', { p_nature: 'achat', p_quantite: n, p_prix_usd: montant, p_ip: null, p_details: detailsAchat })).data;
    if (!o?.ok) {
      await dire('achat', o?.raison ?? 'refus_base', texte, { quantite: n, ...(o?.garde ? { garde: o.garde } : {}) });
      return { fait: false, raison: o?.raison };
    }
    let commande = null;
    try {
      const p = await payer({ geste: () => iproyal.commander(n, cat) });
      commande = p.r;
      await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'en_cours', p_commande: String(commande.id), p_prix_usd: montant,
        p_details: { paiement: p.paiement } });
      if (p.paiement === 'solde' && solde && Number.isFinite(solde.montant)) solde.montant -= montant;
      journal.info('achat_fait', { commande: String(commande.id), quantite: n, prix_usd: montant, paiement: p.paiement });
    } catch (e) {
      dernierEchecAchat = maintenant();
      await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'echec', p_commande: null, p_prix_usd: null, p_details: { erreur: e.message.slice(0, 200) } });
      await alertes?.signaler('serveur', `Achat IPRoyal ÉCHOUÉ (${n} IP) : ${e.message.slice(0, 200)}. Achat automatique suspendu une heure.`, { quantite: n });
      return { fait: false, raison: 'echec' };
    }
    // La livraison prend quelques minutes chez IPRoyal : relue ici un moment, sinon au tour suivant.
    for (let t = 0; t < attendreLivraisonMs; t += pasMs) {
      await new Promise((r) => setTimeout(r, pasMs));
      if ((await livrer()).livrees > 0) break;
    }
    return { fait: true, commande: String(commande.id), quantite: n };
  }

  return { gardes, moyenPaiement, livrer, renouveler, acheter };
}
