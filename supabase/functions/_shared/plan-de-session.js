// ═══════════════════════════════════════════════════════════════════════════
// QUELLE OFFRE UNE PAGE STRIPE VENDAIT-ELLE ? (16/11/2026, point 2e du lot de Nico) — pur, Deno + Node + Vite
// ═══════════════════════════════════════════════════════════════════════════
// La page /cancel (« Payer par carte », après un refus de la banque) rouvrait `metadata.plan_type` de la session : pour un
// essai Premium + Cloud, plan_type vaut « standard » (les paliers le lisent) → le bouton ouvrait Premium SEUL à 12,99 €,
// payé tout de suite, sans Cloud ni essai ; Pro + Cloud rouvrait Pro. La règle : la FORMULE d'abord (metadata.formule),
// puis le Cloud seul (metadata.option = « cloud »), puis le palier d'avant. Verrou : scripts/essai-page-stripe-selftest.mjs.
const FORMULES = new Set(['premium_cloud', 'pro_cloud', 'business_cloud']);

/** Le produit à rouvrir pour une session (create-checkout-session { product }), ou null. */
export function produitDeLaSession(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  const formule = typeof m.formule === 'string' ? m.formule.trim() : '';
  if (FORMULES.has(formule)) return formule;
  if (m.option === 'cloud') return 'cloud';
  const plan = typeof m.plan_type === 'string' ? m.plan_type.trim() : '';
  return plan || null;
}
