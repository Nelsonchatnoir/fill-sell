// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LE PRIX CHOISI À LA REPUBLICATION (15/11/2026, point 5 de Nico — nino57270, 7153db13)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Pur (Node + Vite). La feuille de republication (StockTab, RepublishSheet) propose « Garder », « −5 % », « −10 % »,
// « −15 % » et, pour UN article, « Autre prix » avec un champ. Le SERVEUR décide du prix de chaque annonce
// (public.prix_de_republication, migration 20261115180000) : un prix saisi gagne ; sinon le prix de la FICHE s'il a été
// changé par la personne après la mise en ligne, sinon celui de l'annonce ; une baisse en % s'applique sur ce prix-là,
// annonce par annonce. L'app n'envoie donc plus un prix calculé pour une baisse : elle envoie le pourcentage.
// Verrou : scripts/prix-republication-selftest.mjs.

/** Le prix le plus bas accepté à la saisie (le serveur refuse en dessous de 1 €). */
export const PRIX_SAISI_MIN_EUR = 1;
export const PRIX_SAISI_MAX_EUR = 100000;

/**
 * Lit un prix saisi (« 139 », « 139,50 », « 139.5 », « 139 € »).
 * @returns {{ ok: true, prix: number } | { ok: false, raison: 'vide'|'pas_un_nombre'|'trop_petit'|'trop_de_decimales'|'trop_grand' }}
 */
export function lirePrixSaisi(texte) {
  const brut = String(texte ?? '').replace(/€/g, '').replace(/\s+/g, '').replace(',', '.');
  if (!brut) return { ok: false, raison: 'vide' };
  if (!/^\d+(\.\d+)?$/.test(brut)) return { ok: false, raison: 'pas_un_nombre' };
  const prix = Number(brut);
  if (!Number.isFinite(prix)) return { ok: false, raison: 'pas_un_nombre' };
  if (/\.\d{3,}$/.test(brut)) return { ok: false, raison: 'trop_de_decimales' };
  if (prix < PRIX_SAISI_MIN_EUR) return { ok: false, raison: 'trop_petit' };
  if (prix > PRIX_SAISI_MAX_EUR) return { ok: false, raison: 'trop_grand' };
  return { ok: true, prix: Math.round(prix * 100) / 100 };
}

/** La phrase d'un refus de saisie, en mots simples. */
export function messagePrixSaisi(raison, lang = 'fr') {
  const en = lang === 'en';
  switch (raison) {
    case 'vide': return en ? 'Type the new price in euros.' : 'Indique le nouveau prix en euros.';
    case 'trop_petit': return en ? 'The price must be at least €1.' : 'Le prix doit être d’au moins 1 €.';
    case 'trop_de_decimales': return en ? 'Two decimals at most (e.g. 139.50).' : 'Deux chiffres après la virgule au plus (ex. 139,50).';
    case 'trop_grand': return en ? 'That price looks too high: check it.' : 'Ce prix paraît trop élevé : vérifie-le.';
    default: return en ? 'Type a price in euros, numbers only (e.g. 139).' : 'Indique un prix en euros, en chiffres (ex. 139).';
  }
}

/**
 * Ce que la feuille envoie pour un article : un prix saisi (« Autre prix », un article seulement), OU une baisse en %
 * (que le serveur applique au prix de chaque annonce), OU rien (« Garder » : le serveur garde le prix de l'annonce, ou
 * prend celui de la fiche si la personne l'a changé depuis la mise en ligne).
 * @param {{ solo: boolean, mode: 'garder'|'pct'|'autre', pct?: number, saisie?: string }} c
 * @returns {{ prix: number|null, baissePct: number|null, erreur: string|null }}
 */
export function choixPrixRepublication({ solo, mode, pct = 0, saisie = '' }) {
  if (mode === 'autre') {
    if (!solo) return { prix: null, baissePct: null, erreur: 'autre_prix_en_lot' };
    const l = lirePrixSaisi(saisie);
    return l.ok ? { prix: l.prix, baissePct: null, erreur: null } : { prix: null, baissePct: null, erreur: l.raison };
  }
  if (mode === 'pct' && Number(pct) > 0) {
    const p = Number(pct);
    return p >= 1 && p < 90 ? { prix: null, baissePct: p, erreur: null } : { prix: null, baissePct: null, erreur: 'pas_un_nombre' };
  }
  return { prix: null, baissePct: null, erreur: null };
}
