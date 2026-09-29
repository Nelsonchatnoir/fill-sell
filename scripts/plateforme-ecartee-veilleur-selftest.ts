// `npm run selftest:plateforme-ecartee-veilleur`
import {
  estJobPlateformeEcartee,
  messagePlateformeEcartee,
} from "../supabase/functions/_shared/plateforme-ecartee.ts";

let erreurs = 0;
const verifier = (nom: string, condition: boolean) => {
  console.log(`  ${condition ? "✓" : "✗"} ${nom}`);
  if (!condition) erreurs++;
};

console.log("\n1. Seul le motif officiel protège le job");
verifier("motif officiel", estJobPlateformeEcartee({
  platform_fields: { needs_user_source: "plateforme_ecartee" },
}));
verifier("ancien motif conservé sous la garde ne suffit pas", !estJobPlateformeEcartee({
  platform_fields: {
    needs_user_source: "session_vinted",
    plateforme_ecartee: { source_avant: "session_vinted" },
  },
}));
verifier("job sans champs", !estJobPlateformeEcartee({}));
verifier("valeur ressemblante refusée", !estJobPlateformeEcartee({
  platform_fields: { needs_user_source: "plateforme_ecartee_temporaire" },
}));

console.log("\n2. Le reparcage reprend exactement la phrase officielle");
verifier("libellé Vinted et chemin de reprise", messagePlateformeEcartee("vinted") ===
  "En pause : tu as indiqué ne pas vendre sur Vinted. Rien ne part sur cette plateforme. " +
  "Pour la reprendre, réactive-la dans Réglages › Plateformes : cette publication repartira d'elle-même.");

if (erreurs) {
  console.error(`\n❌ plateforme écartée / veilleur : ${erreurs} défaut(s)`);
  Deno.exit(1);
}
console.log("\n✅ plateforme écartée : aucun réveil générique possible");
