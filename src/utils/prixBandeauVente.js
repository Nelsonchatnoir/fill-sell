// ═══════════════════════════════════════════════════════════════════════════
// LE BANDEAU « VENDUE ? / 🎉 VENDUE SUR … » : SON PRIX, SES RÉPONSES (11/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas Rémi (11/10). Deux défauts du même bandeau :
//   · le prix pré-rempli lisait `detected_price ?? job.price` ; sur une
//     REPUBLICATION les deux sont NULL (6 415 republications Vinted sur 7 953
//     en 30 jours) alors que le prix est écrit sur le job
//     (`platform_fields.prix_recreation`, `republish_snapshot.prix`) → champ
//     vide → « Prix de vente requis » (27 bandeaux ouverts le 11/10) ;
//   · « Non, je l'ai retirée » restait offert sous une PREUVE de vente
//     (`sale_signal = 'sold'`) : 5 taps, 5 jobs annulés, aucune vente.
// Une seule source pour le bandeau, la revue en liste et l'enregistrement
// (confirmSaleFromBanner) : ce qui est montré est ce qui part.

// Un prix lisible : nombre fini STRICTEMENT positif, sinon null. Les relevés
// de republication l'écrivent parfois en texte (« 10.0 »). Jamais 0 : un 0
// n'est pas un prix, c'est une absence.
export function prixLisible(v) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Le prix proposé : prix lu sur la page (Vinted) > prix du job > prix de la
// republication > prix relevé sur l'annonce avant sa suppression > prix de
// vente de la fiche. Une valeur absente, illisible ou ≤ 0 passe à la
// suivante ; aucune → null (le champ reste vide et le geste est refusé tant
// qu'il l'est). Rien n'est deviné : chaque source est un prix de mise en
// ligne réel de CET article.
export function prixParDefautDuBandeau(job, fiche = null) {
  const pf = job?.platform_fields || {};
  const candidats = [
    pf.detected_price,
    job?.price,
    pf.prix_recreation,
    pf.republish_snapshot?.prix,
    fiche?.sell ?? fiche?.prix_vente,
  ];
  for (const c of candidats) {
    const p = prixLisible(c);
    if (p != null) return p;
  }
  return null;
}

// « Non, je l'ai retirée » : jamais sous une preuve positive de vente.
export function preuveDeVente(job) {
  return (job?.platform_fields || {}).sale_signal === 'sold';
}
export function retireeProposable(job) {
  return !preuveDeVente(job);
}
