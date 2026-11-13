// ═══════════════════════════════════════════════════════════════════════════
// AVANT LA FEUILLE D'UNE BOUTIQUE : UN SEUL ABONNEMENT PAR COMPTE, TOUS CANAUX (13/11/2026, 3e réponse de Nico, point a)
// ═══════════════════════════════════════════════════════════════════════════
// iPhone / Android : un achat de l'App Store / Google Play ne se refuse plus après coup — l'argent est parti. Avant
// d'ouvrir la feuille (forfait, formule avec Cloud, Cloud seul), l'app demande au serveur (fonction garde-abonnement,
// lecture seule : profil, Stripe relu, Google relu) si l'achat créerait un second abonnement. Cas réels : c7c382b7 (Pro
// par carte, puis Cloud seul pris sur iPhone le 12/11) ; f0acd3af (Pro App Store, puis Cloud seul App Store le 09/11).
// Serveur muet (réseau, fonction pas encore déployée, Stripe illisible) → la preuve LOCALE (le profil : abonnement de boutique,
// client Stripe avec palier payé) avec la même règle (_shared/un-seul-abonnement.js) — le Cloud seul n'y entre pas : ses
// colonnes ne se lisent que par useCloudProfil (règle de selftest:cloud-ecrans), le serveur le voit ; profil illisible aussi →
// l'achat passe (source 'inconnu') et l'alerte « deux abonnements » des webhooks prévient support@ s'il en crée un second.
import { vivantsBoutiques, decisionAchat, messageUnSeulAbonnement } from '../../supabase/functions/_shared/un-seul-abonnement.js';

export const COLONNES_GARDE_BASE = 'is_premium, is_pro, is_business, stripe_customer_id, apple_original_transaction_id, google_purchase_token, google_product_id, subscription_period_end';
const DELAI_SERVEUR_MS = 8000;

/** La preuve locale (pure) : l'abonnement de boutique du profil, et Stripe vu par ses traces (client + palier payé sans
 *  abonnement de boutique vivant). */
export function vivantsLocaux(p, maintenant = Date.now()) {
  if (!p) return [];
  const boutiques = vivantsBoutiques(p, { maintenant });
  const out = [...boutiques];
  const palierBoutique = boutiques.some((v) => v.type === 'palier');
  const paye = p.is_premium === true || p.is_pro === true || p.is_business === true;
  if (p.stripe_customer_id && paye && !palierBoutique) out.push({ canal: 'stripe', type: 'palier', rang: p.is_business ? 3 : p.is_pro ? 2 : 1, id: null });
  return out;
}

const avecDelai = (promesse, ms) => Promise.race([Promise.resolve(promesse), new Promise((r) => setTimeout(() => r({ delai: true }), ms))]);

/**
 * @param {{ supabase: any, userId: string, canal: 'apple'|'google', achat: 'palier'|'formule'|'cloud_seul', lang?: string, delaiMs?: number }} p
 * @returns {Promise<{ permis: boolean, motif: string|null, canal: string|null, message: string|null, source: 'serveur'|'local'|'inconnu' }>}
 */
export async function gardeAchatBoutique({ supabase, userId, canal, achat, lang = 'fr', delaiMs = DELAI_SERVEUR_MS }) {
  const lire = (d, source) => ({
    permis: d.permis === true, motif: d.permis ? null : (d.motif ?? null), canal: d.canal ?? null, source,
    message: d.permis ? null : ((lang === 'en' ? d.message_en : d.message_fr) || messageUnSeulAbonnement(d, lang)),
  });
  // 1. Le serveur (garde-abonnement) : Stripe et Google relus chez eux.
  try {
    const r = await avecDelai(supabase?.functions?.invoke?.('garde-abonnement', { body: { canal, achat } }), delaiMs);
    const d = r && !r.delai && !r.error ? r.data : null;
    if (d && typeof d.permis === 'boolean') return lire(d, 'serveur');
  } catch { /* repli local */ }
  // 2. La preuve locale : le profil (colonnes de facturation seulement).
  try {
    const base = await avecDelai(supabase.from('profiles').select(COLONNES_GARDE_BASE).eq('id', userId).maybeSingle(), 4000);
    if (!base || base.delai || base.error || !base.data) return { permis: true, motif: null, canal: null, message: null, source: 'inconnu' };
    const d = decisionAchat({ canal, achat, vivants: vivantsLocaux(base.data) });
    return lire(d, 'local');
  } catch {
    return { permis: true, motif: null, canal: null, message: null, source: 'inconnu' };
  }
}
