// ═══════════════════════════════════════════════════════════════════════════
// « OUVRIR L'OFFRE SANS ORDINATEUR » — DE N'IMPORTE OÙ, VERS LA FEUILLE D'APP
// ═══════════════════════════════════════════════════════════════════════════
// CONCEPTION (04/10/2026). La 2e voie vit dans des écrans qui n'ont pas la
// main sur le paiement (parcours d'entrée, mur « installe l'extension », carte
// du Stock) ; la feuille des formules et le checkout vivent dans App.jsx.
// Plutôt que de faire descendre une prop dans sept hôtes, la voie ÉMET une
// demande, et UN seul écouteur (cloud/HoteCloud.jsx, monté par App) ouvre la
// feuille avec l'interrupteur coché.
//
// La page /extension vit HORS de l'app (routeur public, souvent sans
// session) : là, personne n'écoute. La demande est alors GARDÉE (localStorage,
// une heure) et la page mène à /app — HoteCloud la reprend à son montage.
//
// ⛔ Rien d'autre ne passe par ici : ni prix, ni palier, ni paiement. Une
//    origine (chaîne, vocabulaire du tunnel) et c'est tout.
const EVENEMENT = 'fillsell:offre-cloud';
export const CLE_DEMANDE = 'fs_offre_cloud_demandee';
const DUREE_DEMANDE_MS = 60 * 60 * 1000;

let ecouteurs = 0;

const origineSure = (o) => (typeof o === 'string' && o ? o.slice(0, 60) : 'non_precisee');

/** Demande l'ouverture de la feuille, interrupteur coché. Rend true si quelqu'un écoute. */
export function ouvrirOffreCloud(origine) {
  const o = origineSure(origine);
  if (typeof window === 'undefined') return false;
  if (ecouteurs > 0) {
    window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { origine: o } }));
    return true;
  }
  garderDemande(o);
  return false;
}

/** Hors de l'app (page /extension) : garde la demande pour l'app qui va s'ouvrir. */
export function garderDemande(origine) {
  try {
    localStorage.setItem(CLE_DEMANDE, JSON.stringify({ origine: origineSure(origine), le: Date.now() }));
  } catch { /* stockage indisponible : la page mène quand même à l'app */ }
}

/** Reprend (et efface) une demande gardée de moins d'une heure. */
export function reprendreDemande() {
  try {
    const brut = localStorage.getItem(CLE_DEMANDE);
    if (!brut) return null;
    localStorage.removeItem(CLE_DEMANDE);
    const d = JSON.parse(brut);
    if (!d || !Number.isFinite(d.le) || Date.now() - d.le > DUREE_DEMANDE_MS) return null;
    return origineSure(d.origine);
  } catch { return null; }
}

/** L'écouteur unique (HoteCloud). Rend la fonction de désabonnement. */
export function ecouterOffreCloud(surDemande) {
  if (typeof window === 'undefined') return () => {};
  const f = (e) => surDemande(origineSure(e?.detail?.origine));
  window.addEventListener(EVENEMENT, f);
  ecouteurs += 1;
  return () => {
    window.removeEventListener(EVENEMENT, f);
    ecouteurs = Math.max(0, ecouteurs - 1);
  };
}
