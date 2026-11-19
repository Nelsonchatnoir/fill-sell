// ═══════════════════════════════════════════════════════════════════════════
// LA COMMANDE GOOGLE PLAY : CE QUE LE CLIENT A RÉELLEMENT PAYÉ (19/11/2026, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Nico, 19/11 : « un client qui paie reçoit toujours sa confirmation, avec le montant réellement payé, exactement comme
// sur iPhone ». Apple donne le montant de chaque transaction (price, offre comprise). Google NE le donne PAS dans
// l'abonnement (subscriptionsv2) : son prix « récurrent » n'est pas ce qui a été prélevé — une montée au prorata
// (CHARGE_PRORATED_PRICE) prélève la DIFFÉRENCE jusqu'à l'échéance. Le montant payé est dans la COMMANDE
// (Play Developer API, orders.get : `total`, taxes comprises), lue par son numéro (latestOrderId de l'achat).
// LECTURE SEULE, jamais bloquante : une commande illisible (droit refusé, introuvable, réseau) rend un montant inconnu
// et sa raison — le mail dit alors le paiement sans chiffre, comme avant, et l'alerte à Nico le signale.
// Verrou : selftest:confirmation-paiement.

export const API_GOOGLE_PLAY = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
export const PAQUET_GOOGLE = 'app.fillsell.app';

/**
 * Le total payé d'une commande Google ({ total: { currencyCode, units, nanos } }) → { montant, devise } ou null
 * (montant nul ou illisible : rien n'est inventé).
 * @param {any} commande
 */
export function montantDeCommandeGoogle(commande) {
  const t = commande?.total;
  if (!t || typeof t !== 'object') return null;
  const devise = String(t.currencyCode ?? '').toUpperCase();
  const unites = Number(t.units ?? 0);
  const nanos = Number(t.nanos ?? 0);
  if (!/^[A-Z]{3}$/.test(devise) || !Number.isFinite(unites) || !Number.isFinite(nanos)) return null;
  const montant = Math.round((unites + nanos / 1e9) * 100) / 100;
  return montant > 0 ? { montant, devise } : null;
}

/**
 * Lit la commande `orderId` chez Google et rend { montant: {montant, devise} | null, raison }.
 * raison : 'ok' | 'sans_commande' | 'sans_jeton' | 'droit_refuse' (401/403 : le compte de service n'a pas « voir les
 * données financières ») | 'introuvable' (404) | `google_<statut>` | 'reseau' | 'montant_nul'.
 * @param {{ jeton: string | null, orderId: string | null, paquet?: string, fetchImpl?: typeof fetch }} p
 */
export async function lireMontantCommandeGoogle({ jeton, orderId, paquet = PAQUET_GOOGLE, fetchImpl = fetch }) {
  if (!orderId) return { montant: null, raison: 'sans_commande' };
  if (!jeton) return { montant: null, raison: 'sans_jeton' };
  let r;
  try {
    r = await fetchImpl(`${API_GOOGLE_PLAY}/applications/${encodeURIComponent(paquet)}/orders/${encodeURIComponent(String(orderId))}`,
      { headers: { Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(10_000) });
  } catch {
    return { montant: null, raison: 'reseau' };
  }
  if (r.status === 401 || r.status === 403) return { montant: null, raison: 'droit_refuse' };
  if (r.status === 404) return { montant: null, raison: 'introuvable' };
  if (!r.ok) return { montant: null, raison: `google_${r.status}` };
  let commande = null;
  try { commande = await r.json(); } catch { return { montant: null, raison: 'google_illisible' }; }
  const montant = montantDeCommandeGoogle(commande);
  return { montant, raison: montant ? 'ok' : 'montant_nul' };
}
