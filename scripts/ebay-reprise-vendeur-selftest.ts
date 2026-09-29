// `npm run selftest:ebay-reprise-vendeur`
import {
  estJobVendeurEbayInactif,
  preuveHubApresActivationVendeur,
} from "../supabase/functions/_shared/ebay-reprise-extension.ts";

const maintenant = Date.parse("2026-09-29T12:00:00Z");
const job = {
  platform: "ebay",
  action: "publish",
  status: "needs_user",
  platform_fields: {
    needs_user_source: "ebay_compte_vendeur_inactif",
    compte_vendeur_inactif: { derniere: "2026-09-29T10:00:00Z" },
  },
};
let erreurs = 0;
const verifier = (nom: string, condition: boolean) => {
  console.log(`  ${condition ? "✓" : "✗"} ${nom}`);
  if (!condition) erreurs++;
};

console.log("\n1. Le job exact est reconnu, aucun autre motif ne l'est");
verifier("publication eBay / source nommée", estJobVendeurEbayInactif(job));
verifier("republication eBay / source nommée", estJobVendeurEbayInactif({ ...job, action: "republish" }));
verifier("un mur de connexion ordinaire reste hors de cette règle",
  !estJobVendeurEbayInactif({ ...job, platform_fields: { needs_user_source: "ebay_connexion_requise" } }));
verifier("un retrait n'est jamais réarmé par cette règle", !estJobVendeurEbayInactif({ ...job, action: "delete" }));

console.log("\n2. Seul un Hub frais et postérieur au mur réarme");
const preuve = (sessions: Record<string, unknown>) => preuveHubApresActivationVendeur(job, sessions, maintenant);
verifier("session eBay générale seule : refusée", preuve({ ebay: true, checked_at_par_plateforme: { ebay: "2026-09-29T11:00:00Z" } }) === null);
verifier("Hub inconnu : refusé", preuve({ ebay_hub: null, checked_at_par_plateforme: { ebay_hub: "2026-09-29T11:00:00Z" } }) === null);
verifier("Hub daté avant le blocage : refusé", preuve({ ebay_hub: true, checked_at_par_plateforme: { ebay_hub: "2026-09-29T09:59:59Z" } }) === null);
verifier("Hub trop vieux : refusé", preuve({ ebay_hub: true, checked_at_par_plateforme: { ebay_hub: "2026-09-29T08:00:00Z" } }) === null);
verifier("Hub positif, frais et postérieur : accepté",
  preuve({ ebay_hub: true, checked_at_par_plateforme: { ebay_hub: "2026-09-29T11:00:00Z" } }) === Date.parse("2026-09-29T11:00:00Z"));
verifier("date globale sans date Hub : refusée",
  preuve({ ebay_hub: true, checked_at: "2026-09-29T11:00:00Z" }) === null);

if (erreurs) {
  console.error(`\n❌ reprise vendeur eBay : ${erreurs} défaut(s)`);
  Deno.exit(1);
}
console.log("\n✅ reprise vendeur eBay : aucune relance sans preuve du Seller Hub");
