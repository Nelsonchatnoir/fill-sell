// selftest:annonce-partagee-tranchee (09/10, parcours Depop de Nico)
// « Quel article vend cette annonce ? » : quand la personne attribue l'annonce
// à l'article du geste (retrait, republication), get-pending-jobs tranche
// (defaire_croisement_annonce) et le geste repart au passage suivant. La
// réponse restait dans `annonce_partagee.choix` : à CHAQUE passage le job
// redevenait un « répondu », tranché puis écarté — jamais servi (job 9089e65c,
// tranche_le réécrit toutes les deux minutes). Ce test tient : la réponse
// tranchée sort de `choix` (trace `choix_tranche`) AVANT l'écriture ; seule une
// réponse dans `choix` fait un « répondu » ; une réponse illisible est effacée
// (la question revient) ; un geste écarté repart d'un état relu.
import fs from "node:fs";

const src = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8").split("\r\n").join("\n");
const echecs = [];
const verifier = (ok, msg) => { if (!ok) echecs.push(msg); };

const debut = src.indexOf("// ── 1. Les réponses de la personne");
const fin = src.indexOf("// ── 2. Les croisements", debut);
verifier(debut > 0 && fin > debut, "bloc « réponses de la personne » introuvable");
const bloc = debut > 0 && fin > debut ? src.slice(debut, fin) : "";

verifier(/const repondus = out\.filter\(\(j\) => vaRetirer\(j\) && j\.inventaire_id != null\s*&& String\(\(\(pfR\(j\)\["annonce_partagee"\] \?\? \{\}\) as Record<string, unknown>\)\["choix"\] \?\? ""\)\.trim\(\)\);/.test(bloc),
  "un « répondu » = une réponse présente dans annonce_partagee.choix");
const branche = bloc.slice(bloc.indexOf("if (garde === Number(j.inventaire_id)) {"));
verifier(branche.length > 0, "branche « l'article du geste » introuvable");
const iTrace = branche.indexOf('ap["choix_tranche"] = ap["choix"];');
const iRetrait = branche.indexOf('delete ap["choix"];');
const iEcrit = branche.indexOf('await userClient.from("cross_post_jobs").update({ platform_fields: pf })');
verifier(iTrace > 0, "la réponse tranchée est gardée en trace (choix_tranche)");
verifier(iRetrait > iTrace, "la réponse tranchée sort de `choix`");
verifier(iEcrit > iRetrait, "…AVANT l'écriture du job (sinon il reste « répondu » au passage suivant)");
verifier(/ap\["tranche_le"\] = new Date\(\)\.toISOString\(\);/.test(branche) && /ap\["garde"\] = garde;/.test(branche), "tranche_le et garde restent posés");
verifier(/if \(!choisi\) \{[\s\S]*?delete ap\["choix"\];[\s\S]*?continue;/.test(bloc), "une réponse illisible est effacée : la question revient");
verifier(/out = out\.filter\(\(j\) => !tranches\.has\(String\(j\.id\)\)\);/.test(bloc), "le geste tranché repart au passage SUIVANT, relu d'un état propre");

if (echecs.length) {
  console.error("❌ selftest:annonce-partagee-tranchee\n - " + echecs.join("\n - "));
  process.exit(1);
}
console.log("[selftest:annonce-partagee-tranchee] OK — une réponse tranchée sort de `choix` : le geste repart au passage suivant, une seule fois tranché.");
