// « Vente annulée — Remettre en vente ? » (24/10 soir) : le texte de la carte, pur (selftest messagerie-app).
const PLAT = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', opla: 'Opla', depop: 'Depop', ebay: 'eBay' };

/** Ce que la carte dit d'une remise (etat de ventes_annulees_a_remettre). */
export function texteVenteAnnulee(v, lang = 'fr') {
  const fr = lang !== 'en';
  const plats = (Array.isArray(v?.plateformes) ? v.plateformes : []).map((p) => PLAT[p] ?? p);
  const liste = plats.join(fr ? ', ' : ', ');
  switch (v?.etat) {
    case 'proposee': return fr ? `Remettre en vente sur ${liste} ?` : `List again on ${liste}?`;
    case 'en_cours': return fr ? `Remise en vente en cours sur ${liste}.` : `Listing again on ${liste}.`;
    case 'faite': return fr ? `Remis en vente sur ${liste}.` : `Listed again on ${liste}.`;
    case 'deja_en_vente': return fr ? 'Déjà remis en ligne : ton annonce est rattachée, rien n’a été republié.' : 'Already back online: your listing is linked, nothing was republished.';
    default: return fr ? 'Remise en vente arrêtée : l’article n’est plus en stock, ou il est déjà en ligne.' : 'Relisting stopped: the item is no longer in stock, or it is already online.';
  }
}
