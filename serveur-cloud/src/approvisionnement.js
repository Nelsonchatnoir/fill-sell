// (03/11, point 2 de Nico) L'APPROVISIONNEMENT AUTOMATIQUE DES IP — appelé par l'entretien horaire (entretien.js).
//   · RENOUVELLEMENT de toute IP que le plan désigne (une IP attribuée avant son échéance, une IP du stock dont le pool
//     a besoin) : la commande IPRoyal entière est prolongée de 30 jours (une commande peut porter plusieurs IP : elles
//     ont la même échéance) — prolonger() enfin appelée ;
//   · ACHAT sous le stock visé (planDuJour : jamais sous cloud_ip_stock_min) : UNE commande de N IP (N ≤
//     cloud_ip_achat_max, la remise de volume d'IPRoyal), France, 30 jours, sans renouvellement chez IPRoyal ;
//   · LIVRAISON relue aux tours suivants : chaque IP livrée entre au pool (cloud_ip_ajouter : l'URL du proxy va au
//     vault, jamais au journal), le contrôle d'entrée la rend disponible.
// ⛔ TRIPLE GARDE, tout coupé au 03/11 : IPROYAL_ACHATS_AUTORISES=1 sur le serveur (iproyal.achatsAutorises), ET
//    coin_config cloud_ip_achats_auto / cloud_ip_renouvellement_auto = 1, ET le plafond du mois
//    (cloud_ip_budget_mensuel_usd, vérifié en base sous verrou par cloud_ip_depense_ouvrir). Sinon : une PROPOSITION
//    (alerte, aucun achat). Toute dépense est ouverte au registre (cloud_ip_commandes) AVANT l'appel au fournisseur.
//    Alerte (jamais un mail à un utilisateur) si le solde IPRoyal ne couvre pas la prochaine dépense, ou si le plafond
//    la bloque.
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
  plafond: 'plafond du mois atteint (cloud_ip_budget_mensuel_usd)',
  solde_insuffisant: 'solde IPRoyal insuffisant',
  prix_illisible: 'prix IPRoyal illisible',
  prix_ou_quantite_illisible: 'prix IPRoyal illisible',
  nature_inconnue: 'nature inconnue',
});
export const raisonLisible = (r) => RAISONS[r] ?? r;

export function creerApprovisionnement({ base, iproyal, alertes, journal, regles, attendreLivraisonMs = 120_000, pasMs = 20_000 }) {
  const param = async (cle, defaut) => {
    const { data, error } = await base.rpc('cloud_param', { p_cle: cle, p_defaut: defaut });
    return error ? defaut : Number(data ?? defaut);
  };

  /** Les gardes et l'état du mois, lus à chaque tour (un changement de coin_config vaut au tour suivant). */
  async function gardes() {
    const [achatsAuto, renouvAuto, budgetUsd, stockMin, achatMax, depense] = await Promise.all([
      param('ip_achats_auto', 0), param('ip_renouvellement_auto', 0), param('ip_budget_mensuel_usd', 0),
      param('ip_stock_min', regles?.PARAMETRES?.ipStockMin ?? 2), param('ip_achat_max', regles?.PARAMETRES?.ipAchatMax ?? 10),
      base.rpc('cloud_ip_depenses_mois'),
    ]);
    return {
      envAutorise: iproyal?.achatsAutorises === true, achatsAuto: achatsAuto === 1, renouvAuto: renouvAuto === 1,
      budgetUsd, stockMin, achatMax: Math.max(1, Math.min(50, achatMax || 10)),
      depenseMoisUsd: Number(depense?.data ?? 0) || 0,
    };
  }

  /** Une dépense refusée ou impossible : dite (jamais un mail à un utilisateur ; ALERTES_MAIL décide pour support@). */
  async function dire(nature, raison, texte, details) {
    journal.info('approvisionnement_refuse', { nature, raison, ...details });
    if (raison === 'achats_coupes_serveur' || raison === 'interrupteur_coupe') {
      await alertes?.signaler('serveur', `Proposition (aucune dépense faite, ${raisonLisible(raison)}) : ${texte}`, details);
    } else {
      await alertes?.signaler('serveur', `Dépense IPRoyal BLOQUÉE (${raisonLisible(raison)}) : ${texte}`, details);
    }
  }

  /** La livraison des commandes en cours : chaque IP livrée entre au pool (état « achetee »). */
  async function livrer(maintenant = Date.now()) {
    if (!iproyal?.disponible) return { livrees: 0 };
    const { data: enCours } = await base.from('cloud_ip_commandes')
      .select('id, commande, quantite, demandee_le, statut').eq('nature', 'achat').in('statut', ['demandee', 'en_cours']);
    let livrees = 0;
    for (const c of enCours ?? []) {
      if (!c.commande) {
        // Ouverte au registre, jamais passée (mort entre les deux) : comptée dans le plafond, dite — jamais rejouée.
        if (maintenant - Date.parse(c.demandee_le) > 3600_000) {
          await alertes?.signaler('serveur', `Dépense IPRoyal n° ${c.id} ouverte sans commande depuis plus d'une heure : vérifier le tableau de bord IPRoyal.`, { depense: c.id });
        }
        continue;
      }
      try {
        const cmd = await iproyal.lireCommande(c.commande);
        const proxies = proxiesLivres(cmd);
        if (proxies.length < Number(c.quantite)) {
          if (maintenant - Date.parse(c.demandee_le) > 48 * 3600_000) {
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

  /** Les renouvellements du plan (une commande entière à la fois). */
  async function renouveler(plan, ips, g, solde) {
    const faits = [];
    for (const [commande, ids] of grouperParCommande(plan?.renouveler ?? [], ips)) {
      let montant = NaN, cat = null, quantite = ids.length;
      try {
        cat = await iproyal.catalogueIsp();
        quantite = proxiesLivres(await iproyal.lireCommande(commande)).length || ids.length;
        montant = await iproyal.prixCommande(quantite, cat);
      } catch (e) { journal.alerte('renouvellement_prix_illisible', { commande, erreur: e.message }); }
      const texte = `renouveler la commande ${commande} (${quantite} IP : ${ids.join(', ')}) pour ${Number.isFinite(montant) ? `${montant.toFixed(2)} $` : 'un prix illisible'}.`;
      if (Number.isFinite(montant) && !regles.soldeCouvre(solde?.montant, montant)) {
        await alertes?.signaler('serveur', `Solde IPRoyal ${Number(solde?.montant ?? NaN).toFixed(2)} $ : il ne couvre pas le prochain renouvellement (${montant.toFixed(2)} $). Recharger le solde.`, { commande });
      }
      const d = regles.deciderDepense({ montantUsd: montant, envAutorise: g.envAutorise, interrupteur: g.renouvAuto,
        budgetUsd: g.budgetUsd, depenseMoisUsd: g.depenseMoisUsd, soldeUsd: solde?.montant });
      if (!d.faire) { await dire('prolongation', d.raison, texte, { commande, ips: ids, prix_usd: montant }); faits.push({ commande, fait: false, raison: d.raison }); continue; }
      const { data: o } = await base.rpc('cloud_ip_depense_ouvrir', { p_nature: 'prolongation', p_quantite: quantite, p_prix_usd: montant,
        p_ip: ids[0], p_details: { commande, ips: ids } });
      if (!o?.ok) { await dire('prolongation', o?.raison ?? 'refus_base', texte, { commande }); faits.push({ commande, fait: false, raison: o?.raison }); continue; }
      try {
        const r = await iproyal.prolonger(commande, cat.planId);
        const fin = dateIproyal(r?.expire_date);
        await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'livree', p_commande: String(commande), p_prix_usd: montant,
          p_details: { expire_date: r?.expire_date ?? null } });
        if (Number.isFinite(fin)) {
          for (const id of ids) await base.rpc('cloud_ip_renouvelee', { p_ip: id, p_expire_le: new Date(fin).toISOString() });
        }
        g.depenseMoisUsd += montant;
        if (solde && Number.isFinite(solde.montant)) solde.montant -= montant;
        journal.info('renouvellement_fait', { commande, ips: ids.length, prix_usd: montant });
        faits.push({ commande, fait: true });
      } catch (e) {
        await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'echec', p_commande: String(commande), p_prix_usd: null, p_details: { erreur: e.message.slice(0, 200) } });
        await alertes?.signaler('serveur', `Renouvellement IPRoyal ÉCHOUÉ (commande ${commande}) : ${e.message.slice(0, 120)}`, { commande });
        faits.push({ commande, fait: false, raison: 'echec' });
      }
    }
    return faits;
  }

  /** L'achat sous le stock visé : UNE commande de N IP (N ≤ cloud_ip_achat_max). */
  async function acheter(plan, g, solde) {
    const n = Math.min(Math.max(0, Math.floor(Number(plan?.aCommander) || 0)), g.achatMax);
    if (n <= 0) return { fait: false, raison: 'rien_a_acheter' };
    let montant = NaN, cat = null;
    try { cat = await iproyal.catalogueIsp(); montant = await iproyal.prixCommande(n, cat); } catch (e) { journal.alerte('achat_prix_illisible', { erreur: e.message }); }
    const texte = `acheter ${n} IP France 30 jours pour ${Number.isFinite(montant) ? `${montant.toFixed(2)} $` : 'un prix illisible'} (stock visé ${plan.vise}, prêtes ${plan.projete}).`;
    if (Number.isFinite(montant) && !regles.soldeCouvre(solde?.montant, montant)) {
      await alertes?.signaler('serveur', `Solde IPRoyal ${Number(solde?.montant ?? NaN).toFixed(2)} $ : il ne couvre pas le prochain achat (${n} IP, ${montant.toFixed(2)} $). Recharger le solde.`, { quantite: n });
    }
    const d = regles.deciderDepense({ montantUsd: montant, envAutorise: g.envAutorise, interrupteur: g.achatsAuto,
      budgetUsd: g.budgetUsd, depenseMoisUsd: g.depenseMoisUsd, soldeUsd: solde?.montant });
    if (!d.faire) { await dire('achat', d.raison, texte, { quantite: n, prix_usd: montant }); return { fait: false, raison: d.raison }; }
    const { data: o } = await base.rpc('cloud_ip_depense_ouvrir', { p_nature: 'achat', p_quantite: n, p_prix_usd: montant, p_ip: null,
      p_details: { produit: cat.produitId, offre: cat.planId, lieu: cat.lieuId } });
    if (!o?.ok) { await dire('achat', o?.raison ?? 'refus_base', texte, { quantite: n }); return { fait: false, raison: o?.raison }; }
    let commande = null;
    try {
      commande = await iproyal.commander(n, cat);
      await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'en_cours', p_commande: String(commande.id), p_prix_usd: montant, p_details: {} });
      g.depenseMoisUsd += montant;
      if (solde && Number.isFinite(solde.montant)) solde.montant -= montant;
      journal.info('achat_fait', { commande: String(commande.id), quantite: n, prix_usd: montant });
    } catch (e) {
      await base.rpc('cloud_ip_depense_fermer', { p_id: o.id, p_statut: 'echec', p_commande: null, p_prix_usd: null, p_details: { erreur: e.message.slice(0, 200) } });
      await alertes?.signaler('serveur', `Achat IPRoyal ÉCHOUÉ (${n} IP) : ${e.message.slice(0, 120)}`, { quantite: n });
      return { fait: false, raison: 'echec' };
    }
    // La livraison prend quelques minutes chez IPRoyal : relue ici un moment, sinon au tour suivant.
    for (let t = 0; t < attendreLivraisonMs; t += pasMs) {
      await new Promise((r) => setTimeout(r, pasMs));
      if ((await livrer()).livrees > 0) break;
    }
    return { fait: true, commande: String(commande.id), quantite: n };
  }

  return { gardes, livrer, renouveler, acheter };
}
