// ── (03/11 soir, JEAN-LUC LASSARAT) UN « VENDU » LEBONCOIN DÉJÀ LÀ À LA PREMIÈRE LECTURE N'EST PAS UNE VENTE DU JOUR ──
// Leboncoin garde « Article vendu » (attribut transaction_status = sold, badge de la page publique) sur une annonce
// ENCORE EN LIGNE : un vendeur de neuf en plusieurs exemplaires vend une unité par le paiement Leboncoin, l'annonce
// reste active pour les suivantes. Le 03/11, le premier relevé Leboncoin de JEAN-LUC (10:56) lisait déjà « Vendu » sur
// 5 annonces ; la veille de l'extension a posé « Vendue sur Leboncoin » (13:01-13:12), la personne a confirmé
// (18:15-18:17) : 5 ventes comptées une SECONDE fois (les vraies dataient du 12/05, 02/08, 04/08, 14/10, déjà dans
// l'historique par la page des transactions) et 4 copies Vinted retirées.
// Règle : FillSell ne date une vente Leboncoin que s'il a VU l'état changer (lu sans « Vendu », puis « Vendu »). Un
// « Vendu » présent dès la première lecture de CETTE annonce, et jamais autrement depuis, date d'avant le suivi :
// jamais une vente du jour, jamais un retrait de copie. Une annonce jamais lue par la règle (aucune trace) : rien ne
// change (inconnu ≠ ancien).
// Les traces : usage_logs « vente_leboncoin_transaction » de CETTE annonce (numéro exact), écrites par
// leboncoin_transaction_noter à chaque lecture qui dit quelque chose (première lecture « Vendu », transitions).

// Seule une annonce IMPORTÉE par un relevé (née hors FillSell) est concernée : celle que FillSell a déposée n'existait
// pas avant son dépôt, un « Vendu » lu dessus est une vente après sa mise en ligne, même à la première lecture.
// Même lecture que remises_en_vente_tick (« annonce importée ») : source = releve, ou rattachement.import.
export function annonceImportee(pf) {
  const p = pf && typeof pf === 'object' ? pf : {};
  const imp = p.rattachement && typeof p.rattachement === 'object' ? p.rattachement.import : null;
  return String(p.source ?? '') === 'releve' || imp === true || String(imp ?? '') === 'true';
}

const NEUTRES = new Set(['aucune', 'pending']);

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * @param {Array<{ created_at?: string, transaction?: string|null, avant?: string|null }>} traces
 *   les traces de l'annonce, dans n'importe quel ordre.
 * @returns {{ ancienne: boolean, premiereLecture: string|null }}
 */
export function vendueAvantSuivi(traces) {
  const t = (Array.isArray(traces) ? traces : [])
    .filter((x) => x && typeof x === 'object')
    .slice()
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  if (!t.length) return { ancienne: false, premiereLecture: null };
  const premiere = t[0];
  const premiereVendue = norm(premiere.transaction) === 'sold' && norm(premiere.avant) === '';
  // Lue un jour sans « Vendu » (aucune transaction, achat en cours) : FillSell a vu l'état changer, la règle d'avant joue.
  const vueAutrement = t.some((x) => NEUTRES.has(norm(x.transaction)) || NEUTRES.has(norm(x.avant)));
  return { ancienne: premiereVendue && !vueAutrement, premiereLecture: premiereVendue ? String(premiere.created_at ?? '') || null : null };
}

/** JJ/MM, heure de Paris, d'un instant ISO (null si illisible). */
export function jourParis(iso) {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(d);
}

/** La raison dite à la personne quand sa confirmation est refusée (≤ 500 caractères, lue par l'app : raisonRefus). */
export function raisonVenteAncienne(premiereLecture) {
  const jour = jourParis(premiereLecture);
  return `Leboncoin affichait déjà « Vendu » sur cette annonce quand FillSell l'a lue pour la première fois${jour ? `, le ${jour}` : ''} : `
    + "c'est une vente ancienne, pas une vente d'aujourd'hui. Rien n'est enregistré, rien n'est retiré ailleurs. "
    + "Si tu viens d'en vendre un exemplaire, enregistre la vente depuis la fiche de l'article.";
}
