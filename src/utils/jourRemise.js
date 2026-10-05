// ═══════════════════════════════════════════════════════════════════════════
// LE JOUR OÙ UN QUOTA DU MOIS REVIENT — en toutes lettres (05/10)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis le 05/10 le gratuit a 50 republications PAR MOIS (plus « à vie »).
// Le serveur rend la remise à zéro du compte (quotas_etat.republication
// .remise_le, et le refus plafond_republication_free) : c'est
// coin_wallets.next_grant_at, la MÊME date que les annonces du mois — la
// remise à zéro est à date anniversaire, par compte, jamais le 1er du mois
// (cf. reglages/quotas.js).
//
// ⛔ Absente, passée ou illisible → null, et l'appelant n'affiche RIEN :
//    jamais une date inventée sur un écran qui parle de ce qu'on a droit.
// Module sans dépendance : la modale des offres le charge sans tirer le
// client Supabase.
export function jourRemise(iso, lang = 'fr') {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t) || t <= Date.now()) return null;
  return new Date(t).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' });
}

// Le refus « republications du mois du gratuit faites » (code serveur
// plafond_republication_free), en mots. Le chiffre vient du refus : jamais
// en dur — absent, la phrase s'en passe.
export function messagePlafondRepublicationGratuit(res, lang = 'fr') {
  const jour = jourRemise(res?.remise_le, lang);
  const n = res?.plafond != null ? `${res.plafond} ` : '';
  return lang === 'en'
    ? `Your ${n}repostings for this month are all used${jour ? ` — they come back on ${jour}` : ''}. Nothing was charged.`
    : `Tes ${n}republications du mois sont toutes utilisées${jour ? ` — elles reviennent le ${jour}` : ''}. Rien n'a été débité.`;
}
