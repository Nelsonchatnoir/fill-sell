// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT eBAY APRÈS VENTE N'EST JAMAIS BLOQUÉ S'IL EXISTE UNE VOIE — `npm run selftest:ebay-ordinateur-cloud-2111`
// ═══════════════════════════════════════════════════════════════════════════
// (21/11/2026 nuit, rouge 3 de Nico — alisonbertincourt) Compte au Cloud actif, eBay non relié à l'API : le retrait eBay de
// sa veste vendue passait « relie ton eBay » alors que l'extension de son ordinateur venait de publier sur eBay.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { posteGardeEbay, ordinateurVivant, ebayARelierPourLeCloud, leveeEbayARelierCloud, texteEbayARelierCloud, texteEbayARelierAJour, ORDINATEUR_VIVANT_MS }
  from "../supabase/functions/_shared/cloud-voie.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

const t = Date.parse("2026-11-21T00:00:00Z");
const RETRAIT = { platform: "ebay", action: "delete", status: "pending", voie: "extension", platform_fields: {} };
const ARRETE = { ...RETRAIT, status: "needs_user", platform_fields: { needs_user_source: "ebay_a_relier_cloud" } };

console.log("1. La règle");
ok(posteGardeEbay({ cloudVoie: true, posteCloud: false, ebayRelie: false }), "ordinateur d'un compte au Cloud, eBay non relié : il garde eBay");
ok(!posteGardeEbay({ cloudVoie: true, posteCloud: false, ebayRelie: true }) && !posteGardeEbay({ cloudVoie: true, posteCloud: true, ebayRelie: false })
  && !posteGardeEbay({ cloudVoie: true, posteCloud: false, ebayRelie: null }), "eBay relié (voie API), le poste Cloud, ou une liaison illisible : non");
ok(ordinateurVivant(new Date(t - 10 * 60_000).toISOString(), t) && !ordinateurVivant(new Date(t - ORDINATEUR_VIVANT_MS - 1000).toISOString(), t) && !ordinateurVivant(null, t),
  "l'ordinateur vivant : vu il y a moins de 30 min (la vraie extension)");
ok(!ebayARelierPourLeCloud(RETRAIT, { cloudVoie: true, ebayRelie: false, ordinateurVivant: true }), "ordinateur vivant : jamais « relie ton eBay »");
ok(ebayARelierPourLeCloud(RETRAIT, { cloudVoie: true, ebayRelie: false, ordinateurVivant: false }), "sans ordinateur vivant : le geste d'avant");
ok(leveeEbayARelierCloud(ARRETE, { cloudVoie: true, ebayRelie: false, ordinateurVivant: true }), "un retrait déjà arrêté repart dès que l'ordinateur vit");
const txt = texteEbayARelierCloud("delete", "fr", { aUnOrdinateur: true });
ok(/Allume ton ordinateur avec l'extension FillSell/.test(txt) && /double vente/.test(txt), "le compte a un ordinateur : il est nommé comme voie, avec le risque de double vente");

const DEJA = { ...ARRETE, error: "Ton article est vendu, mais son annonce est encore en ligne sur eBay : FillSell Cloud ne peut la retirer que si ton compte eBay est relié à FillSell." };
ok(/Allume ton ordinateur/.test(texteEbayARelierAJour(DEJA, { aUnOrdinateur: true }) ?? "") && texteEbayARelierAJour({ ...DEJA, error: txt }, { aUnOrdinateur: true }) === null
  && texteEbayARelierAJour(RETRAIT, { aUnOrdinateur: true }) === null, "une tâche déjà arrêtée : son texte remis à jour une fois (ordinateur nommé), jamais une autre");

console.log("2. Le câblage");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/if \(!posteGardeEbay\(\{ cloudVoie, posteCloud, ebayRelie: ebayRelieP \}\)\) \{/.test(gpj) && /seulEbayPC = true;/.test(gpj), "get-pending-jobs : l'ordinateur garde eBay quand il n'est pas relié");
ok(/if \(seulEbayPC\) q = q\.eq\("platform", "ebay"\);/.test(gpj), "… ses SEULES tâches eBay (jamais une autre plateforme du Cloud)");
ok(/if \(!ebayAFaire\) \{[\s\S]{0,300}return json\(reponseCompteAuCloud\(\{ delegations: delegationsExecutees \}\)\);\n\s*\}\n\s*seulEbayPC = true;/.test(gpj)
  && /\.eq\("voie", "extension"\)\.in\("status", \["pending", "processing"\]\)\.limit\(1\)/.test(gpj),
  "… et seulement s'il a une tâche eBay à faire (sinon la pause d'avant, sans le parcours complet)");
ok(/patchLeveeEbayARelierCloud\(j as never, \{ motif: "ordinateur_vivant" \}\)/.test(gpj), "… ses « relie ton eBay » repartent tout de suite (un retrait n'attend pas une voie qui existe)");
ok(/compte_cloud: pauseCloudPC\.compte_cloud/.test(gpj) && /connexion_commands: \[\], lecture_fond: null/.test(gpj), "… et la pause pour tout le reste (aucune commande, aucune lecture, Leboncoin délégué)");
ok(/const admin = createClient\(Deno\.env\.get\("SUPABASE_URL"\)!, Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)!\);\n\s*let ebayRelieP/.test(gpj), "le client de service est créé là où il sert");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/ordinateurVivant: ordinateurVivant\(p\.extension_ordinateur_vu_le\)/.test(hw) && /e\.ordinateurVivant \? "ordinateur_vivant"/.test(hw), "handler-watch : ordinateur vivant → jamais posé, et levé");
ok(/texteEbayARelierAJour\(j, \{ aUnOrdinateur: e\.aUnOrdinateur === true \}\)/.test(hw) && /\.eq\("error", String\(j\.error \?\? ""\)\)/.test(hw),
  "handler-watch : le texte des tâches déjà arrêtées remis à jour (compare-and-set sur le statut et le texte)");

console.log(`\n${rouges ? "✗" : "✓"} ebay-ordinateur-cloud-2111 : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
