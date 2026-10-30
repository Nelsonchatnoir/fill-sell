// LE FOURNISSEUR D'IP — UN SEUL MODULE (30/10, lot D, décision de Nico : « isole le fournisseur dans un seul
// module, pour pouvoir en changer sans toucher au reste »). Le reste de l'orchestrateur ne connaît que :
//   · proxyPour(user, compte) → { proxyUrl, ipId, mode, sortie }   (la sortie d'UN navigateur, à son ouverture) ;
//   · solde()                 → { montant, devise } ou null         (lecture seule) ;
//   · verifierSolde()         → alerte « solde bas » au plus une fois par jour.
// Changer de fournisseur = réécrire CE fichier (et iproyal.js, son client), rien d'autre.
//
// Deux modes, choisis par la base (coin_config.cloud_ip_rotation) :
//   · DÉDIÉ (05/10) : le compte a SON IP (cloud_ips), lue au coffre de la base ;
//   · ROTATION (30/10, « IP françaises en rotation au départ ») : le compte n'a pas d'IP attribuée.
//       - résidentiel IPRoyal (si IPROYAL_RESI_UTILISATEUR / IPROYAL_RESI_MOT_DE_PASSE sont posés) : passerelle
//         geo.iproyal.com, pays FR, session COLLANTE par compte et par tranche (ROTATION_HEURES, 24 h par défaut) :
//         une même IP pendant une session de navigation, une autre à la tranche suivante ;
//       - sinon : les IP FRANÇAISES du pool (dédiées achetées), réparties entre les comptes et tournées à chaque
//         tranche. Aujourd'hui une seule : 94.194.94.233 (commande 84458881, jusqu'au 04/11 13:57).
// ⛔ JAMAIS d'achat ici : lire seulement (solde, commandes). Les achats restent refusés par iproyal.js.
import { createHash } from 'node:crypto';

const PASSERELLE_RESIDENTIELLE = { hote: 'geo.iproyal.com', port: 12321 };

/** La tranche de rotation d'un instant (pur) : un entier qui change toutes les `heures` heures. */
export function trancheRotation(maintenant, heures = 24) {
  const h = Math.max(1, Number(heures) || 24);
  return Math.floor(maintenant / (h * 3600_000));
}

/** L'identifiant de session collante d'un compte pour une tranche (pur, sans rien dire du compte). */
export function sessionCollante(user, tranche) {
  return createHash('sha256').update(`fillsell-cloud:${user}:${tranche}`).digest('hex').slice(0, 8);   // IPRoyal : 8 caractères
}

/** L'URL résidentielle (pur) — pays FR, session collante, durée de vie = la tranche. */
export function urlResidentielle({ utilisateur, motDePasse, session, heures = 24 }) {
  const mdp = `${motDePasse}_country-fr_session-${session}_lifetime-${Math.max(1, Math.min(168, Number(heures) || 24))}h`;
  return `http://${encodeURIComponent(utilisateur)}:${encodeURIComponent(mdp)}@${PASSERELLE_RESIDENTIELLE.hote}:${PASSERELLE_RESIDENTIELLE.port}`;
}

/**
 * L'IP du pool d'un compte pour une tranche (pur) : rendez-vous (le plus haut hachage gagne) — chaque compte garde
 * la même IP pendant la tranche, la répartition est stable quand une IP entre ou sort, et elle tourne à la tranche
 * suivante. Seules les IP françaises, ni au rebut, ni expirées (une heure de marge).
 */
export function ipDuPool(ips, user, tranche, maintenant = Date.now()) {
  const vivantes = (Array.isArray(ips) ? ips : []).filter((i) => i && String(i.pays ?? '').toUpperCase() === 'FR'
    && !['rebut', 'expiree', 'achetee'].includes(String(i.etat ?? ''))
    && Date.parse(String(i.expire_le ?? '')) > maintenant + 3600_000);
  if (!vivantes.length) return null;
  let meilleure = null, score = '';
  for (const i of vivantes) {
    const s = createHash('sha256').update(`${user}:${tranche}:${i.id}`).digest('hex');
    if (s > score) { score = s; meilleure = i; }
  }
  return meilleure;
}

/** Faut-il alerter sur le solde (pur) ? sous le seuil, au plus une fois par 24 h. */
export function alerteSolde(montant, seuil, derniereAlerteLe, maintenant = Date.now()) {
  if (!Number.isFinite(montant) || !Number.isFinite(seuil)) return false;
  if (montant >= seuil) return false;
  return !(Number.isFinite(derniereAlerteLe) && maintenant - derniereAlerteLe < 24 * 3600_000);
}

export function creerFournisseurIp({ config, base, iproyal, journal, alertes }) {
  let derniereAlerteSolde = null;
  const heures = config.rotationHeures ?? 24;

  async function rotationActive() {
    const { data } = await base.from('coin_config').select('value').eq('key', 'cloud_ip_rotation').maybeSingle();
    return Number(data?.value) === 1;
  }

  async function proxyDuPool(ipId) {
    const { data: proxyUrl, error } = await base.rpc('cloud_proxy_identifiants', { p_ip: ipId });
    if (error || !proxyUrl) throw new Error(`proxy de l'IP ${ipId} illisible : ${error?.message ?? 'absent'}`);
    return proxyUrl;
  }

  /** La sortie d'un navigateur, à son ouverture. */
  async function proxyPour(user, compte, maintenant = Date.now()) {
    // Mode dédié : le compte a son IP.
    if (compte?.ip_id != null) {
      return { proxyUrl: await proxyDuPool(compte.ip_id), ipId: Number(compte.ip_id), mode: 'dedie', sortie: compte.ip ?? null };
    }
    if (!(await rotationActive())) throw new Error('compte sans IP et rotation coupée (coin_config.cloud_ip_rotation)');
    const tranche = trancheRotation(maintenant, heures);
    // Rotation résidentielle, si ses identifiants existent.
    if (config.iproyalResiUtilisateur && config.iproyalResiMotDePasse) {
      const session = sessionCollante(user, tranche);
      return {
        proxyUrl: urlResidentielle({ utilisateur: config.iproyalResiUtilisateur, motDePasse: config.iproyalResiMotDePasse, session, heures }),
        ipId: null, mode: 'residentiel', sortie: `résidentielle FR (session ${session})`,
      };
    }
    // Rotation sur les IP françaises du pool.
    const { data: ips, error } = await base.from('cloud_ips').select('id, ip, pays, etat, expire_le');
    if (error) throw new Error(`pool illisible : ${error.message}`);
    const choisie = ipDuPool(ips ?? [], user, tranche, maintenant);
    if (!choisie) throw new Error('aucune IP française vivante dans le pool');
    return { proxyUrl: await proxyDuPool(choisie.id), ipId: null, ipPool: Number(choisie.id), mode: 'rotation_pool',
      sortie: String(choisie.ip).replace(/\/32$/, '') };
  }

  /** Le solde du compte IPRoyal (lecture seule), ou null. */
  async function solde() {
    if (!iproyal?.disponible) return null;
    try { return await iproyal.solde(); } catch (e) { journal.alerte('solde_illisible', { erreur: e.message }); return null; }
  }

  /** Alerte « solde bas » (support@, par la porte d'envoi unique), au plus une fois par jour. Aucun achat. */
  async function verifierSolde(maintenant = Date.now()) {
    const s = await solde();
    if (!s) return null;
    const seuil = config.iproyalSoldeAlerte ?? 5;
    if (alerteSolde(s.montant, seuil, derniereAlerteSolde, maintenant)) {
      derniereAlerteSolde = maintenant;
      await alertes?.signaler('serveur', `Solde IPRoyal bas : ${s.montant.toFixed(2)} ${s.devise} (seuil ${seuil}). Aucun achat fait : ton accord est nécessaire.`, { solde: s });
    }
    return { ...s, seuil, sous_le_seuil: s.montant < seuil };
  }

  return { proxyPour, solde, verifierSolde, rotationActive };
}
