// ── (09/11, point 1 de Nico — assopmfrance « Écusson pm 123 ») LA TRACE D'UN REFUS GARDE LE MOTIF DU SERVEUR ───────
// spend_coins_and_republish répond reason 'annonce_introuvable' pour trois causes différentes : aucun dépôt FillSell en
// ligne, annonce vendue, annonce plus en ligne (motif 'annonce_vendue' / 'annonce_partie', avec sa phrase dans
// `message`). La trace action_app_ratee ne gardait que `reason` et `res.error` (vide sur un refus) : « annonce
// introuvable » a été lu comme « FillSell ne trouve pas l'annonce importée », alors que le serveur avait dit « vendue ».
// Désormais : motif = reason[:motif] (« annonce_introuvable:annonce_vendue »), message = la phrase du serveur.
export function traceRefusRepublication(res) {
  const reason = String(res?.reason ?? 'refus');
  const sous = typeof res?.motif === 'string' && res.motif.trim() ? res.motif.trim() : null;
  const texte = res?.message ?? res?.error ?? null;
  return {
    motif: sous ? `${reason}:${sous}` : reason,
    message: texte ? String(texte).slice(0, 160) : null,
    annonce: res?.annonce != null ? String(res.annonce) : null,
  };
}

