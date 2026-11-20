// (20/11/2026 soir, BLOC D DE NICO) LA VEILLE DES IP DU CLOUD dans l'ops-digest (pur : testé par
// scripts/ops-digest-ip-cloud-2011-selftest.mjs). L'essai Cloud démarre désormais tout de suite quand une IP est en route
// (migration 20261120230000, place promise) : deux lignes rouges disent ce qui ne doit jamais durer.
//   1. ACHAT D'IP EN ÉCHEC (24 h) : les achats du registre (cloud_ip_commandes) clos en échec dans les 24 dernières heures
//      (refus d'IPRoyal, commande remboursée, issue inconnue relue sans commande), et ceux à l'issue INCONNUE pas encore
//      relus chez IPRoyal (« demandee » sans commande depuis ISSUE_INCONNUE_ALERTE_MS : l'orchestrateur ne rachète rien
//      d'ici là) ;
//   2. ESSAI CLOUD SANS IP DEPUIS PLUS DE 30 MIN : un compte au Cloud actif (essai en cours ou payé) sans IP attribuée depuis
//      ESSAI_SANS_IP_ALERTE_MS — depuis le début de son essai, ou son dernier événement d'IP (cloud_ip_evenements) s'il est plus
//      récent. Rotation : jamais (l'IP ne borne rien).
// Heure de Paris partout ; les comptes en id8.
export const ESSAI_SANS_IP_ALERTE_MS = 30 * 60_000;
export const ISSUE_INCONNUE_ALERTE_MS = 10 * 60_000;
const JOUR_MS = 24 * 3_600_000;

export const heureParis = (t) => new Date(t).toLocaleString('fr-FR', {
  timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const minutes = (ms) => Math.max(0, Math.round(ms / 60_000));
const erreurDe = (c) => String(c?.details?.erreur ?? c?.details?.iproyal ?? '').slice(0, 160) || 'motif non noté';

/**
 * Les lignes rouges « achat d'IP en échec (24 h) » (pur). `commandes` : lignes de cloud_ip_commandes.
 * @param {{ commandes?: any[], maintenant?: number }} [o]
 * @returns {string[]}
 */
export function achatsIpEnEchec({ commandes = [], maintenant = Date.now() } = {}) {
  const lignes = [];
  const vues = new Set();
  for (const c of [...(commandes ?? [])].sort((a, b) => Number(a?.id) - Number(b?.id))) {
    if (!c || vues.has(c.id) || (c.nature && c.nature !== 'achat')) continue;
    vues.add(c.id);
    const t = Date.parse(c.demandee_le);
    if (!Number.isFinite(t)) continue;
    if (c.statut === 'echec' && maintenant - t <= JOUR_MS) {
      lignes.push(`Achat n° ${c.id} (${c.quantite} IP, ${heureParis(t)}) en échec : ${erreurDe(c)}`
        + `${c.commande ? ` — commande IPRoyal ${c.commande}` : ''}.`);
    } else if (c.statut === 'demandee' && !c.commande && maintenant - t >= ISSUE_INCONNUE_ALERTE_MS) {
      lignes.push(`Achat n° ${c.id} (${c.quantite} IP, ${heureParis(t)}) à l'issue INCONNUE depuis ${minutes(maintenant - t)} min, pas encore `
        + `relu chez IPRoyal (rien n'est racheté d'ici là) : ${erreurDe(c)}. Relire le tableau de bord IPRoyal.`);
    }
  }
  return lignes;
}

/**
 * Les lignes rouges « essai Cloud sans IP depuis plus de 30 min » (pur). `profils` : id, is_cloud, cloud_essai_debut,
 * cloud_essai_fin, cloud_essai_arrete ; `titulaires` : les user_id qui tiennent une IP (cloud_ips.user_id) ; `evenements` :
 * { user_id, le } (cloud_ip_evenements) ; `rotation` : coin_config cloud_ip_rotation = 1.
 * @param {{ profils?: any[], titulaires?: any[], evenements?: any[], maintenant?: number, rotation?: boolean }} [o]
 * @returns {string[]}
 */
export function essaisCloudSansIp({ profils = [], titulaires = [], evenements = [], maintenant = Date.now(), rotation = false } = {}) {
  if (rotation) return [];
  const avecIp = new Set((titulaires ?? []).filter(Boolean).map(String));
  const dernier = new Map();
  for (const e of evenements ?? []) {
    const t = Date.parse(e?.le);
    if (e?.user_id && Number.isFinite(t) && t > (dernier.get(String(e.user_id)) ?? -Infinity)) dernier.set(String(e.user_id), t);
  }
  const lignes = [];
  const vus = new Set();
  for (const p of profils ?? []) {
    if (!p?.id || vus.has(String(p.id))) continue;
    vus.add(String(p.id));
    const debut = Date.parse(p.cloud_essai_debut);
    const essai = Number.isFinite(debut) && debut <= maintenant && Date.parse(p.cloud_essai_fin) > maintenant && p.cloud_essai_arrete !== true;
    if (!(p.is_cloud === true || essai) || avecIp.has(String(p.id))) continue;
    const depuis = Math.max(Number.isFinite(debut) ? debut : -Infinity, dernier.get(String(p.id)) ?? -Infinity);
    if (Number.isFinite(depuis) && maintenant - depuis < ESSAI_SANS_IP_ALERTE_MS) continue;
    lignes.push(`${String(p.id).slice(0, 8)} (${p.is_cloud === true ? 'Cloud payé' : 'essai Cloud'}) sans IP `
      + `${Number.isFinite(depuis) ? `depuis ${heureParis(depuis)} (${minutes(maintenant - depuis)} min)` : 'depuis une date inconnue'} : `
      + 'relire cloud_ip_commandes (achat en route ?) et le pool — l\'orchestrateur achète pour lui et le contrôle d\'abord.');
  }
  return lignes;
}
