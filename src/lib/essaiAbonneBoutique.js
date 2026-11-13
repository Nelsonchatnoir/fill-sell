// ═══════════════════════════════════════════════════════════════════════════
// L'ESSAI DU CLOUD POUR UN ABONNÉ APP STORE / GOOGLE PLAY — CÔTÉ APP, DERRIÈRE UNE VERSION NATIVE MINIMALE (13/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// 3e réponse de Nico, point f. ⛔ INACTIF : ESSAI_ABONNE_BINAIRE_MIN vaut null sur les deux plateformes — aucun appel,
// aucune option passée à la feuille. Il s'ouvre quand (1) le binaire qui sait passer l'offre existe (iOS : le module
// natif transmet `promotionalOffer` à Product.PurchaseOption.promotionalOffer(offerID:keyID:nonce:signature:timestamp:) ;
// Android : il choisit l'offre `offerIdentifier` du forfait au lieu de la première), (2) sa version est écrite ici, et
// (3) le serveur est ouvert (secret ESSAI_ABONNES_BOUTIQUE = 1, fonction signer-offre-boutique). Les offres elles-mêmes
// sont à créer par Nico (App Store Connect, Play Console) : _shared/offre-essai-abonne.js, OFFRES_ESSAI_ABONNE.
export const ESSAI_ABONNE_BINAIRE_MIN = Object.freeze({ ios: null, android: null });

const parties = (v) => String(v ?? '').split('.').map((x) => Number.parseInt(x, 10) || 0);
const auMoins = (v, min) => {
  const a = parties(v), b = parties(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return true;
};

/** Le binaire de ce téléphone sait-il passer l'offre d'essai d'abonné ? (pur) — null (aujourd'hui) = non, partout. */
export function essaiAbonneBoutiqueOuvert({ platform, binaire }) {
  const min = platform === 'ios' ? ESSAI_ABONNE_BINAIRE_MIN.ios : platform === 'android' ? ESSAI_ABONNE_BINAIRE_MIN.android : null;
  return Boolean(min && binaire && auMoins(binaire, min));
}

/**
 * L'option à passer à la feuille de la boutique pour l'essai d'un abonné, ou null (fermé, pas éligible, serveur muet :
 * l'achat continue SANS essai, comme aujourd'hui — le texte « Pas d'essai : … prélevés aujourd'hui » a déjà été dit).
 * @returns {Promise<null | { apple?: object, google?: string }>}
 */
export async function offreEssaiAbonne({ supabase, platform, binaire, formule }) {
  if (!essaiAbonneBoutiqueOuvert({ platform, binaire })) return null;
  try {
    const canal = platform === 'ios' ? 'apple' : 'google';
    const { data, error } = await supabase.functions.invoke('signer-offre-boutique', { body: { canal, formule } });
    if (error || data?.permis !== true) return null;
    if (canal === 'apple' && data.promotionalOffer?.signature) return { apple: data.promotionalOffer };
    if (canal === 'google' && typeof data.offerIdentifier === 'string') return { google: data.offerIdentifier };
  } catch { /* sans essai */ }
  return null;
}
