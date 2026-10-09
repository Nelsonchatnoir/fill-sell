// selftest:identifiant-avant-moteur (09/10, parcours Depop de Nico)
// Une annonce relevée dont l'identifiant est celui d'un dépôt FillSell publié
// rejoint l'article de ce dépôt AVANT que le moteur v3 lise le compte — jamais
// une fiche neuve (09/10 07:11 : job 49217123, annonce Depop importée en
// fiche 1791529881380 13 s après le relevé, avant le filet de handler-watch).
import fs from "node:fs";

const src = fs.readFileSync(new URL("../supabase/functions/rapprochement/index.ts", import.meta.url), "utf8");
const echecs = [];
const verifier = (ok, msg) => { if (!ok) echecs.push(msg); };

const def = src.indexOf("const rattacherParIdentifiant = async");
const appel = src.indexOf("await rattacherParIdentifiant(user)");
const lecture = src.indexOf('admin.rpc("rapprochement_v3_lire"');
verifier(def > 0, "rattacherParIdentifiant absente");
verifier(appel > 0 && lecture > 0 && appel < lecture, "le rattachement par identifiant doit précéder rapprochement_v3_lire");
const corps = def > 0 ? src.slice(def, src.indexOf("\n  };", def)) : "";
verifier(/\.eq\("status", "published"\)/.test(corps), "seuls les dépôts publiés comptent");
verifier(/\.in\("action", \["publish", "republish"\]\)/.test(corps), "publication ou republication seulement");
verifier(/\.in\("platform_listing_id"/.test(corps), "l'identifiant, rien d'autre (jamais un titre ni une photo)");
verifier(/`\$\{j\.platform\}\|\$\{j\.platform_listing_id\}`/.test(corps) && /`\$\{a\.platform\}\|\$\{a\.listing_id\}`/.test(corps), "même plateforme ET même identifiant");
verifier(/\.eq\("id", a\.id\)\.is\("inventaire_id", null\)/.test(corps), "compare-and-swap : une annonce déjà rattachée n'est jamais déplacée");
verifier(/\.is\("ignoree_le", null\)/.test(corps) && /\.is\("disparu_le", null\)/.test(corps), "ni annonce ignorée par la personne, ni annonce disparue");
verifier(/source_rapprochement: "job"/.test(corps), "la preuve se lit comme un dépôt (forcesDe : source = job)");
verifier(/motif: "identifiant_avant_moteur"/.test(corps), "la décision laisse sa trace dans rapprochements");
verifier(/if \(!simuler\) parCompte\.par_identifiant/.test(src), "une simulation n'écrit rien");

if (echecs.length) {
  console.error("❌ selftest:identifiant-avant-moteur\n - " + echecs.join("\n - "));
  process.exit(1);
}
console.log("[selftest:identifiant-avant-moteur] OK — l'identifiant d'un dépôt FillSell est rattaché avant toute décision du moteur.");
