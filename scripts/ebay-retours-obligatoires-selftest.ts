// ═══════════════════════════════════════════════════════════════════════════
// Autotest — eBay refuse « Pas de retour » pour CE compte (17/10, Fluxen)
//   deno run --allow-read --allow-env --allow-net scripts/ebay-retours-obligatoires-selftest.ts
// ═══════════════════════════════════════════════════════════════════════════
// Job b731ae0f (15/10 → 16/10) : politique « Pas de retour » créée par FillSell
// (eBay l'accepte à la création), puis quatre refus identiques à la mise en
// ligne : 25002 « Spécifiez des conditions de retour valides », paramètre
// ReturnsAcceptedOption (vendeur professionnel : retours obligatoires). Pour en
// sortir, la personne a voulu passer aux retours acceptés : trois créations
// refusées (même nom « Retours FillSell »), aucune issue dans l'app.
//
// La règle vérifiée ici, pour TOUS les comptes :
//   1. ce refus est reconnu, et lui seul ;
//   2. la politique de retours refusée cesse d'être RETENUE (garde sur son
//      identifiant), le compte n'est plus prêt, la publication est parquée
//      « compte à finir — retours » avec un message clair, et le circuit
//      existant la ré-arme quand une politique est retenue ;
//   3. FillSell ne choisit JAMAIS la politique de retours à la place de la
//      personne : la politique refusée lui est proposée au choix, rien d'autre ;
//   4. créer une politique FillSell qui existe déjà la MET À JOUR (même nom) ;
//   5. l'app dit que « Pas de retour » est réservé aux vendeurs particuliers.
import assert from "node:assert/strict";
import { lireErreurEbay, refusRetoursObligatoires, type ErreurEbay } from "../supabase/functions/_shared/ebay-publication.ts";
import { etatCompteEbay } from "../supabase/functions/_shared/ebay-etat-compte.js";
import { compteEbayApiUsableDepuisLigne, etapeEbayAFinir, MESSAGE_EBAY_RETOURS_OBLIGATOIRES } from "../supabase/functions/_shared/ebay-voie.ts";

let n = 0;
const ok = (c: boolean, nom: string) => { assert.ok(c, nom); n++; console.log(`  ✓ ${nom}`); };
const lire = (p: string) => Deno.readTextFile(new URL(`../${p}`, import.meta.url)).then((t) => t.split("\r\n").join("\n"));

console.log("1. LE REFUS, RECONNU — ET LUI SEUL");
// Le corps brut RÉEL, tel que last_diagnostic.brut le garde (job b731ae0f).
const BRUT = '{"errors":[{"errorId":25002,"domain":"API_INVENTORY","subdomain":"Selling","category":"Request","message":"Une erreur utilisateur est survenue. Spécifiez des conditions de retour valides.","parameters":[{"name":"0","value":"ReturnsAcceptedOption"}]}]}';
ok(refusRetoursObligatoires(lireErreurEbay(JSON.parse(BRUT), BRUT)), "le refus réel du 15/10 est reconnu");
const autres: Array<[string, ErreurEbay]> = [
  ["25002 « BrandMPN » (06/09)", { errorId: 25002, message: "BrandMPN manquante ou invalide", params: [{ name: "0", value: "BrandMPN" }] }],
  ["25002 sans paramètre", { errorId: 25002, message: "Une erreur utilisateur est survenue." }],
  ["25129 (aspect fermé)", { errorId: 25129, message: "", params: [{ name: "3", value: "Taille" }] }],
  ["autre code, même paramètre", { errorId: 25001, message: "", params: [{ name: "0", value: "ReturnsAcceptedOption" }] }],
];
for (const [nom, e] of autres) ok(!refusRetoursObligatoires(e), `${nom} : pas ce refus`);

console.log("2. LE COMPTE APRÈS LE REFUS");
// Fluxen (3b7e2361), relevé du 15/10 23:22, sans donnée personnelle.
const SS = {
  inscription_vendeur: true, politiques_activees: true,
  politiques: { livraison: 1, paiement: 1, retours: 1 }, lieu_expedition: true,
  selling_limit: { amount: { currency: "EUR", value: "888375.61" }, quantity: 100000 },
  bloque_par_etat_ebay: false, indeterminees: [],
};
const avant = { revoked_at: null, fulfillment_policy_id: "279215284019", payment_policy_id: "279215295019", return_policy_id: "279215356019", seller_state: SS };
ok(compteEbayApiUsableDepuisLigne(avant), "avant le refus, le compte est prêt (le serveur publie)");
const apres = { ...avant, return_policy_id: null };
ok(!compteEbayApiUsableDepuisLigne(apres), "politique retirée : plus prêt — rien n'est relancé tant qu'aucune n'est retenue");
const etape = etapeEbayAFinir(apres);
ok(etape?.etape === "retours" && etape.url === null, "ce qui reste : les retours, à choisir dans FillSell (aucun lien eBay)");
const etat = etatCompteEbay(apres);
ok(etat.manquantes.length === 1 && etat.manquantes[0] === "politique_retours" && etat.aChoisir.includes("politique_retours"),
  "la politique refusée existe toujours chez eBay : proposée au choix, jamais retenue d'office");

console.log("3. LE MESSAGE");
const M = MESSAGE_EBAY_RETOURS_OBLIGATOIRES;
ok(/« Pas de retour »/.test(M) && /vendeurs professionnels/.test(M) && /Réglages › Compte eBay/.test(M) && /rien n'a été mis en ligne/.test(M),
  "il dit ce qu'eBay refuse, pourquoi, où le régler, et que rien n'est parti");
ok(!/\bjobs?\b|HTTP|25002|ReturnsAcceptedOption|https?:\/\/|worker|null/i.test(M), "aucun mot de développeur");
ok(!/\b(dans|sous|d'ici|vers) \d|minute|heure|\d+ ?h\b/i.test(M), "aucune promesse de délai");

console.log("4. LE WORKER (code livré)");
const w = await lire("supabase/functions/ebay-api-worker/index.ts");
const iBranche = w.indexOf("if (refusRetoursObligatoires(e)) {");
const iGenerique = w.indexOf('const refus = messageRefus("la publication", pub.http, e);');
ok(iBranche > 0 && iGenerique > iBranche, "la branche précède le refus générique de la mise en ligne");
const branche = w.slice(iBranche, iGenerique);
ok((branche.match(/\.update\(/g) ?? []).length === 1 && /\.update\(\{ return_policy_id: null \}\)/.test(branche)
  && /\.eq\("user_id", job\.user_id\)\.eq\("return_policy_id", compte\.return_policy_id\)/.test(branche),
  "une seule écriture sur le compte : la politique refusée cesse d'être retenue, gardée par son identifiant");
ok(/needs_user_source: SOURCE_EBAY_COMPTE_A_FINIR/.test(branche) && /ebay_a_finir: \{ etape: "retours", url: null \}/.test(branche),
  "publication parquée « compte à finir — retours » : le circuit existant la ré-arme");
ok(/status: "needs_user", error: MESSAGE_EBAY_RETOURS_OBLIGATOIRES/.test(branche) && /quoi: "retours_obligatoires"/.test(branche),
  "le message clair à l'écran, le motif nommé dans le diagnostic");
ok((w.match(/messageEbayCompteAFinir\(/g) ?? []).length === 2, "les deux parcages « compte à finir » d'avant sont inchangés");

console.log("5. ebay-account : UNE POLITIQUE FILLSELL SE MET À JOUR, ELLE NE SE RECRÉE PAS");
const a = await lire("supabase/functions/ebay-account/index.ts");
const iCreer = a.indexOf('if (action === "creer_politique") {');
const creer = a.slice(iCreer, a.indexOf("return json({ error: `Action inconnue", iCreer));
ok(iCreer > 0 && /get_by_policy_name\?marketplace_id=\$\{MARKETPLACE\}&name=\$\{encodeURIComponent\(corps\.name\)\}/.test(creer),
  "la politique FillSell est cherchée par son nom");
ok(/method: "PUT", body: corps/.test(creer) && /method: "POST", body: corps/.test(creer) && /if \(type !== "fulfillment"\)/.test(creer),
  "existe déjà → mise à jour ; sinon création ; la livraison garde poser_livraison");
ok(/retours=\$\{String\(options\.retours \?\? "acceptes_30"\)\}/.test(creer), "le choix des retours est journalisé");
ok((a.match(/corpsCreation\(/g) ?? []).length === 2, "une politique ne se crée QUE sur le geste de la personne (un seul appel, dans creer_politique)");

console.log("6. CE QUE L'APP DIT");
const sec = await lire("src/components/EbayCompteSection.jsx");
ok(/retoursRefuses: 'Pas de retour \(vendeurs particuliers seulement\)'/.test(sec) && /retoursRefuses: 'No returns \(private sellers only\)'/.test(sec),
  "le bouton « Pas de retour » dit qu'il est réservé aux vendeurs particuliers");
const parc = await lire("src/utils/ebayParcours.js");
ok(/« Pas de retour » est réservé aux vendeurs particuliers : eBay oblige les vendeurs professionnels à accepter les retours\./.test(parc),
  "l'étape « retours » du parcours le dit aussi");

console.log(`\n✓ refus « Pas de retour » : la règle tient — ${n} contrôles`);
