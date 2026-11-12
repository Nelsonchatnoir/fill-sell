// ═══════════════════════════════════════════════════════════════════════════
// LE MRR, PAR CANAL, SUR LES SEULS ABONNEMENTS ACTIFS (30/10, lot D point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Demande de Nico : « le calcul du MRR ne compte que les abonnements actifs, par canal ». Aucun calcul n'existait
// (ni dans le dépôt, ni en base) ; compter des profils porteurs d'un jeton aurait donné 8 « abonnés Google » pour
// UN vrai payeur (6 jetons morts + BONCOIN, remboursé). Règle : un abonnement compte s'il est relu ACTIF chez son
// canal (Stripe « active » ; Apple : transaction en cours, non révoquée, hors essai gratuit ; Google : ACTIVE, ou
// résilié encore payé), jamais un essai (trialing, essai gratuit), jamais un impayé (past_due, période de grâce).
// Montants TTC par mois. Calculé par abonnements-stores-audit (lecture seule). Pur.
//
// (11/11/2026, offres Cloud, § 9 du plan) SEPT CATÉGORIES, les formules avec Cloud À PART des formules seules :
//   premium · pro · business · cloud (le Cloud SEUL, hérité) · premium_cloud · pro_cloud · business_cloud.
// La catégorie se lit sur l'identifiant du prix Stripe ou du produit de boutique (formules-serveur.js,
// formuleDuProduit), jamais sur une colonne. Le total dit les € PAR CATÉGORIE et les COMPTES distincts (un compte
// qui paie deux abonnements compte une fois ; `abonnes` reste le nombre de lignes d'abonnement, comme avant).
import { PRIX_AVEC_CLOUD_EUR, FORMULES_CLOUD } from "./formules-cloud.js";
import { formuleDuProduit } from "./formules-serveur.js";

/** Prix publics TTC par mois — repli quand le canal ne donne pas le montant.
 *  (03/11, décision de Nico) Cloud seul à 24,99 € sur les trois canaux (= CLOUD_PRIX_AFFICHE, src/utils/palier.js).
 *  (11/11) Les formules avec Cloud : formules-cloud.js (PRIX_AVEC_CLOUD_EUR). */
export const PRIX_MENSUELS_TTC = Object.freeze({ premium: 12.99, pro: 29.99, business: 59.99, cloud: 24.99, ...PRIX_AVEC_CLOUD_EUR });
/** Les sept catégories du comptage (cloud = le Cloud SEUL). */
export const CATEGORIES_MRR = Object.freeze(["premium", "pro", "business", "cloud", ...FORMULES_CLOUD]);

/** La catégorie d'un produit des stores, formules avec Cloud comprises ; null pour un pack ou un inconnu. */
export function palierProduitStore(id) {
  const p = String(id ?? "");
  // (11/11) Une formule avec Cloud est SA catégorie (jamais « cloud », jamais le palier seul).
  const f = formuleDuProduit(p);
  if (f && FORMULES_CLOUD.includes(f.formule)) return f.formule;
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
  // (11/11) Une formule avec Cloud : son prix (ou sa métadonnée `formule`, posée par create-checkout-session).
  const formule = ids.map((id) => formuleDuProduit(id, prix)?.formule).find((f) => FORMULES_CLOUD.includes(f))
    ?? (FORMULES_CLOUD.includes(meta.formule) && !ids.some((id) => formuleDuProduit(id, prix)) ? meta.formule : null);
  const palier = formule ?? (meta.option === "cloud" || (prix.cloud && ids.includes(prix.cloud)) ? "cloud"
    : (meta.plan_type === "business" || (prix.business && ids.includes(prix.business))) ? "business"
    : (meta.plan_type === "pro" || (prix.pro && ids.includes(prix.pro))) ? "pro" : "premium");
  const client = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  return { canal: "stripe", palier, eur: Math.round(eur * 100) / 100, ref: sub.id ?? null, ...(client ? { client } : {}) };
}

/**
 * Additionne les lignes par canal (pur) → { stripe:{abonnes, eur, par_palier, comptes, eur_par_palier}, apple:…, google:…,
 * total:{abonnes, eur, comptes, par_palier, eur_par_palier} }. `compte` (l'identifiant FillSell) d'une ligne fait les
 * comptes distincts ; sans lui, sa référence (un abonnement non rattaché compte pour un).
 */
export function mrrParCanal(lignes) {
  const out = {};
  let abonnes = 0, eur = 0;
  const comptesTotal = new Set();
  const parPalierTotal = {}, eurParPalierTotal = {};
  for (const c of ["stripe", "apple", "google"]) out[c] = { abonnes: 0, eur: 0, par_palier: {}, comptes: 0, eur_par_palier: {} };
  const comptes = { stripe: new Set(), apple: new Set(), google: new Set() };
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (!l || !out[l.canal] || !(Number(l.eur) > 0)) continue;
    const o = out[l.canal];
    o.abonnes += 1; o.eur += Number(l.eur);
    o.par_palier[l.palier] = (o.par_palier[l.palier] ?? 0) + 1;
    o.eur_par_palier[l.palier] = Math.round(((o.eur_par_palier[l.palier] ?? 0) + Number(l.eur)) * 100) / 100;
    const qui = String(l.compte ?? l.client ?? l.ref ?? `${l.canal}:${abonnes}`);
    comptes[l.canal].add(qui); comptesTotal.add(qui);
    parPalierTotal[l.palier] = (parPalierTotal[l.palier] ?? 0) + 1;
    eurParPalierTotal[l.palier] = Math.round(((eurParPalierTotal[l.palier] ?? 0) + Number(l.eur)) * 100) / 100;
    abonnes += 1; eur += Number(l.eur);
  }
  for (const c of Object.keys(out)) { out[c].eur = Math.round(out[c].eur * 100) / 100; out[c].comptes = comptes[c].size; }
  out.total = { abonnes, eur: Math.round(eur * 100) / 100, comptes: comptesTotal.size, par_palier: parPalierTotal, eur_par_palier: eurParPalierTotal };
  return out;
}
