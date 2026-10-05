// ═══════════════════════════════════════════════════════════════════════════
// MODIFIER EN LOT LE PRIX OU LA QUANTITÉ DES FICHES (04/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (Business) : changer le prix ou la quantité de plusieurs articles
// d'un coup. Sélection multiple ; une valeur fixe ; pour le prix, aussi un
// montant ou un pourcentage en plus ou en moins.
//
// ⛔ CE QUI CHANGE, ET CE QUI NE CHANGE PAS — à dire tel quel à l'écran :
//    · les FICHES (inventaire.prix_vente / inventaire.quantite) changent ;
//      le prix garde sa trace (prix_vente_change_par = 'app', déclencheur
//      inventaire_trace_changements) ;
//    · les annonces DÉJÀ EN LIGNE ne changent pas, sur AUCUNE plateforme :
//      aucun chemin ne leur envoie un prix ou une quantité de fiche (les jobs
//      ne savent que publier, retirer, republier) — et une republication
//      remet l'annonce au prix OÙ ELLE EST (règle du 03/10) ;
//    · le nouveau prix sert aux PROCHAINES publications de ces articles.
// ⛔ QUANTITÉ : 1 au moins. 0 voudrait dire « vendu » — c'est le geste
//    Vendre, qui retire les copies en ligne ; ici on ne retire rien.
// ⛔ PRIX : 1 € au moins (le minimum de Vinted, garde de publication). Un
//    article SANS prix ne reçoit pas de « + 10 % » : il n'a pas de base, il
//    est laissé de côté et compté — jamais un prix inventé.
// Pur, sans React ni réseau (scripts/modifier-en-lot-selftest.mjs).

export const OPERATIONS_PRIX = Object.freeze(["fixer", "plus_euros", "moins_euros", "plus_pct", "moins_pct"]);
export const PRIX_MIN = 1;

/** « 12,5 », « 12.50 € », « 10 % » → nombre, ou null. */
export function lireNombre(brut) {
  const t = String(brut ?? "").trim().replace(/[\s€%]/g, "").replace(",", ".");
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const arrondi = (n) => Math.round(n * 100) / 100;
const prixDe = (item) => {
  const v = item?.prix_vente ?? item?.sell;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Le prix après l'opération, ou { raison } si l'article est laissé de côté. */
export function nouveauPrix(actuel, operation, valeur) {
  const v = Number(valeur);
  if (!OPERATIONS_PRIX.includes(operation) || !Number.isFinite(v) || v < 0) return { raison: "valeur" };
  if (operation === "fixer") return v >= PRIX_MIN ? { prix: arrondi(v) } : { raison: "sous_minimum" };
  if (actuel == null) return { raison: "sans_prix" };
  const p = operation === "plus_euros" ? actuel + v
    : operation === "moins_euros" ? actuel - v
    : operation === "plus_pct" ? actuel * (1 + v / 100)
    : actuel * (1 - v / 100);
  const r = arrondi(p);
  return r >= PRIX_MIN ? { prix: r } : { raison: "sous_minimum" };
}

/**
 * Le plan d'un changement de prix : ce qui change, ce qui est laissé de côté.
 * @returns {{ changements: Array<{id, avant, apres}>, ignores: Array<{id, raison}> }}
 */
export function planPrix(items, operation, valeur) {
  const changements = [];
  const ignores = [];
  for (const item of items ?? []) {
    const avant = prixDe(item);
    const r = nouveauPrix(avant, operation, valeur);
    if (r.prix == null) ignores.push({ id: item.id, raison: r.raison });
    else if (r.prix !== avant) changements.push({ id: item.id, avant, apres: r.prix });
  }
  return { changements, ignores };
}

/** Le plan d'un changement de quantité (entier, 1 au moins). */
export function planQuantite(items, valeur) {
  const q = Number(valeur);
  if (!Number.isInteger(q) || q < 1) return { changements: [], ignores: (items ?? []).map((i) => ({ id: i.id, raison: "quantite" })) };
  const changements = [];
  for (const item of items ?? []) {
    const avant = Number(item?.quantite ?? 1) || 1;
    if (avant !== q) changements.push({ id: item.id, avant, apres: q });
  }
  return { changements, ignores: [] };
}

/** Regroupe les changements par nouvelle valeur : une écriture par valeur, pas par article. */
export function parValeur(changements) {
  const m = new Map();
  for (const c of changements ?? []) {
    const k = String(c.apres);
    if (!m.has(k)) m.set(k, { valeur: c.apres, ids: [] });
    m.get(k).ids.push(c.id);
  }
  return [...m.values()];
}
