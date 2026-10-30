// ═══════════════════════════════════════════════════════════════════════════
// LE MRR, PAR CANAL, SUR LES SEULS ABONNEMENTS ACTIFS (30/10, lot D point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico : « le calcul du MRR ne compte que les abonnements actifs, par canal ». Aucun calcul n'existait
// (ni dans le dépôt, ni en base) ; compter des profils porteurs d'un jeton aurait donné 8 « abonnés Google » pour
// UN vrai payeur (6 jetons morts + BONCOIN, remboursé). Règle : un abonnement compte s'il est relu ACTIF chez son
// canal (Stripe « active » ; Apple : transaction en cours, non révoquée, hors essai gratuit ; Google : ACTIVE, ou
// résilié encore payé), jamais un essai (trialing, essai gratuit), jamais un impayé (past_due, période de grâce).
// Montants TTC par mois. Calculé par abonnements-stores-audit (lecture seule). Pur.

/** Prix publics TTC par mois (Premium, Pro, Business, Cloud) — repli quand le canal ne donne pas le montant. */
export const PRIX_MENSUELS_TTC = Object.freeze({ premium: 12.99, pro: 29.99, business: 59.99, cloud: 20 });

/** Le palier d'un produit des stores, Cloud compris ; null pour un pack ou un inconnu. */
export function palierProduitStore(id) {
  const p = String(id ?? "");
  if (/cloud/.test(p)) return "cloud";
  if (/business/.test(p)) return "business";
  if (/\.pro2?\.sub$/.test(p)) return "pro";
  if (/(premium\.(sub|standard)|founder)/.test(p)) return "premium";
  return null;
}

/** Un abonnement Stripe → une ligne de MRR, ou null s'il ne compte pas (pur). `prix` : ids des prix connus. */
export function ligneMrrStripe(sub, prix = {}) {
  if (!sub || sub.status !== "active") return null;            // trialing, past_due, unpaid, canceled : 0
  const items = sub.items?.data ?? [];
  let eur = 0;
  for (const it of items) {
    const p = it?.price ?? it?.plan ?? {};
    const montant = Number(p.unit_amount ?? p.amount ?? 0) / 100 * (Number(it?.quantity) || 1);
    const rec = p.recurring ?? { interval: p.interval, interval_count: p.interval_count };
    const n = Number(rec?.interval_count) || 1;
    const parMois = rec?.interval === "year" ? montant / (12 * n) : rec?.interval === "week" ? montant * 52 / (12 * n)
      : rec?.interval === "day" ? montant * 365 / (12 * n) : montant / n;
    eur += parMois;
  }
  const ids = items.map((it) => it?.price?.id ?? it?.plan?.id ?? "");
  const meta = sub.metadata ?? {};
  const palier = meta.option === "cloud" || (prix.cloud && ids.includes(prix.cloud)) ? "cloud"
    : (meta.plan_type === "business" || (prix.business && ids.includes(prix.business))) ? "business"
    : (meta.plan_type === "pro" || (prix.pro && ids.includes(prix.pro))) ? "pro" : "premium";
  return { canal: "stripe", palier, eur: Math.round(eur * 100) / 100, ref: sub.id ?? null };
}

/** Additionne les lignes par canal (pur) → { stripe:{abonnes, eur, par_palier}, apple:…, google:…, total:{abonnes, eur} }. */
export function mrrParCanal(lignes) {
  const out = {};
  let abonnes = 0, eur = 0;
  for (const c of ["stripe", "apple", "google"]) out[c] = { abonnes: 0, eur: 0, par_palier: {} };
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (!l || !out[l.canal] || !(Number(l.eur) > 0)) continue;
    const o = out[l.canal];
    o.abonnes += 1; o.eur += Number(l.eur);
    o.par_palier[l.palier] = (o.par_palier[l.palier] ?? 0) + 1;
    abonnes += 1; eur += Number(l.eur);
  }
  for (const c of Object.keys(out)) out[c].eur = Math.round(out[c].eur * 100) / 100;
  out.total = { abonnes, eur: Math.round(eur * 100) / 100 };
  return out;
}
