// « Vente annulée — Remettre en vente ? » (24/10 soir) : le texte de la carte, pur (selftest messagerie-app).
const PLAT = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', opla: 'Opla', depop: 'Depop', ebay: 'eBay' };

// (07/11, Ornella) Une remise fermée dit POURQUOI (motif de ventes_annulees_a_remettre, migration 20261107150000).
const MOTIFS = {
  vendu_sous_autre_fiche: {
    fr: 'Déjà vendu sous une autre fiche de ton stock : rien n’a été remis en vente.',
    en: 'Already sold under another item in your stock: nothing was listed again.',
  },
  deja_en_vente_autre_fiche: {
    fr: 'Déjà remis en ligne sous une autre fiche de ton stock : rien n’a été republié.',
    en: 'Already back online under another item in your stock: nothing was republished.',
  },
  plus_en_stock: {
    fr: 'Remise en vente arrêtée : l’article n’est plus dans ton stock.',
    en: 'Relisting stopped: the item is no longer in your stock.',
  },
  choix_personne: {
    fr: 'Tu as choisi de ne pas le remettre en vente.',
    en: 'You chose not to list it again.',
  },
};

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
    default: {
      const m = MOTIFS[v?.motif];
      if (m) return fr ? m.fr : m.en;
      return fr ? 'Remise en vente arrêtée : l’article n’est plus en stock, ou il est déjà en ligne.' : 'Relisting stopped: the item is no longer in stock, or it is already online.';
    }
  }
}
