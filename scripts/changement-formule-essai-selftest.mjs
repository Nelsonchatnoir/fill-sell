// VERROU — bloc F du 14/11/2026 (décision de Nico) : changer de formule pendant un essai, ou en perdant le Cloud.
// Cas réel (13e274de, 14/11 01:27) : essai Pro + Cloud → un clic « Business » a remplacé la formule par Business SEUL sur
// l'abonnement EN ESSAI (prorata d'un essai = 0 €) : sans fenêtre, sans paiement, essai gardé, Cloud sorti de Stripe.
// Ce verrou casse si : un changement pendant un essai part sans la fenêtre (montant exact), garde l'essai, ne demande pas
// le paiement d'abord ; si une formule sans Cloud remplace une formule avec Cloud sans le dire ni proposer la « + Cloud ».
// Parcours réel en mode TEST Stripe : scripts/stripe-test/changement-formule-essai-test.mjs. Données synthétiques.
import fs from "node:fs";
import { changementAConfirmer, parametresChangement, requeteDevis, reponseConfirmation } from "../supabase/functions/_shared/changement-formule.js";
import { textesFenetre } from "../src/lib/changementFormuleTextes.js";

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log("  ✓", m); else { ko++; console.log("  ✗", m); } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("1. La règle (pure)");
const essai = { status: "trialing" }, paye = { status: "active" };
let c = changementAConfirmer({ abonnement: essai, formuleActuelle: "pro_cloud", formuleVers: "business" });
ok(c.aConfirmer && c.essai && c.perdCloud && c.alternativeCloud === "business_cloud", "essai Pro + Cloud → Business seul : fenêtre, essai arrêté, Cloud perdu dit, « Business + Cloud » proposé (le cas du 14/11)");
c = changementAConfirmer({ abonnement: essai, formuleActuelle: "pro_cloud", formuleVers: "business", confirme: true });
ok(!c.aConfirmer && c.essai, "… confirmé : on passe, et l'essai s'arrête (essai = vrai)");
c = changementAConfirmer({ abonnement: essai, formuleActuelle: "pro_cloud", formuleVers: "business_cloud" });
ok(c.aConfirmer && !c.perdCloud && c.alternativeCloud === null, "essai Pro + Cloud → Business + Cloud : fenêtre aussi (l'essai s'arrête), Cloud gardé");
c = changementAConfirmer({ abonnement: essai, formuleActuelle: "cloud", formuleVers: "pro_cloud" });
ok(c.aConfirmer && !c.perdCloud, "essai du Cloud seul → Pro + Cloud : fenêtre (l'essai s'arrête)");
c = changementAConfirmer({ abonnement: paye, formuleActuelle: "pro_cloud", formuleVers: "business" });
ok(c.aConfirmer && !c.essai && c.perdCloud && c.alternativeCloud === "business_cloud", "Pro + Cloud PAYÉ → Business seul : fenêtre (Cloud perdu), « Business + Cloud » proposé");
c = changementAConfirmer({ abonnement: paye, formuleActuelle: "palier", formuleVers: "business" });
ok(!c.aConfirmer, "Premium payé, sans Cloud → Business : pas de fenêtre (le parcours d'avant, inchangé)");
c = changementAConfirmer({ abonnement: essai, formuleActuelle: "pro_cloud", formuleVers: "pro" });
ok(c.aConfirmer && c.perdCloud && c.alternativeCloud === null, "« retirer le Cloud » de Pro + Cloud : jamais « Pro + Cloud » reproposé (garder = ne rien changer)");
const pc = parametresChangement({ itemId: "si_1", prix: "price_b", essai: true });
ok(pc.trial_end === "now" && pc.payment_behavior === "pending_if_incomplete" && pc.proration_behavior === "always_invoice",
  "confirmé pendant l'essai : l'essai s'arrête maintenant, payé d'abord (appliqué seulement si payé)");
ok(!("trial_end" in parametresChangement({ itemId: "si_1", prix: "p", essai: false })), "hors essai : aucun trial_end");
const rd = requeteDevis({ client: "cus_1", abonnementId: "sub_1", itemId: "si_1", prix: "p", essai: true });
ok(rd.subscription_trial_end === "now" && rd.subscription_items[0].price === "p", "le devis est l'aperçu de LA facture du changement (essai arrêté)");
const r = reponseConfirmation({ formule: "business", devis: { montant: 5999, devise: "eur" }, alternative: { formule: "business_cloud", montant: 7999 }, essai: true, perdCloud: true });
ok(r.confirmation_requise && r.devis.montant_centimes === 5999 && r.devis.alternative.montant_centimes === 7999, "la réponse porte les deux montants exacts, rien n'est changé");

console.log("2. La fenêtre (textes)");
const T = textesFenetre(r.devis, "fr");
ok(/^Ton essai gratuit s'arrête : tu seras débité maintenant de 79,99\s€\.$/.test(T.choixCloudPhrase) && /^Ton essai gratuit s'arrête : tu seras débité maintenant de 59,99\s€\.$/.test(T.phrase),
  "« Ton essai gratuit s'arrête : tu seras débité maintenant de X € » — le montant exact");
ok(/^Business \+ Cloud — 79,99\s€ maintenant$/.test(T.choixCloud) && /^Business seul — 59,99\s€ maintenant$/.test(T.choixSeul), "Business + Cloud à son vrai prix, Business seul à côté");
ok(T.avertissementSansCloud === "Sans Cloud : tu ne pourras plus publier sans ordinateur.", "la formule seule est marquée « sans Cloud »");
ok(/Rien ne change/.test(T.garderPourquoi) && /S'il n'aboutit pas, rien ne change/.test(T.pied), "garder = rien ne change ; paiement refusé = rien ne change");
const TE = textesFenetre(r.devis, "en");
ok(/Your free trial stops: you'll be charged €59\.99 now\./.test(TE.phrase), "en anglais aussi");

console.log("3. Le câblage (serveur et app)");
const ccs = lire("supabase/functions/create-checkout-session/index.ts");
const montee = ccs.slice(ccs.indexOf("const pageEnAttente = await pageDeLaMonteeEnAttente(target, planType);") - 3000, ccs.indexOf("const factureMontee"));
ok(/changementAConfirmer\(\{ abonnement: target/.test(montee) && /if \(chgPalier\.aConfirmer\)/.test(montee) && /parametresChangement\(\{ itemId: item\.id, prix: priceId, essai: chgPalier\.essai \}\)/.test(montee),
  "montée de palier « in situ » : fenêtre d'abord, puis essai arrêté et payé d'abord (plus jamais le chemin du 14/11 01:27)");
ok(!/proration_behavior: pendantEssai \? "none"/.test(ccs) && /changementAConfirmer\(\{ abonnement: cible/.test(ccs), "formule avec Cloud : plus jamais « l'essai continue au prix choisi »");
ok(/confirme_changement/.test(ccs) && /devis_indisponible/.test(ccs), "sans montant exact lisible : rien ne change, on le dit");
const cf = lire("supabase/functions/changer-formule/index.ts");
ok(/if \(cible\.status === "trialing"\) \{/.test(cf) && /chg\.aConfirmer/.test(cf) && /parametresChangement\(\{ itemId, prix: prixVers, essai: true \}\)/.test(cf) && !/proration_behavior: "none"/.test(cf),
  "changer-formule pendant l'essai : fenêtre, essai arrêté, payé d'abord");
const app = lire("src/App.jsx");
ok(/body\?\.confirmation_requise===true&&body\?\.devis/.test(app) && /<FenetreChangementFormule/.test(app) && /triggerCheckout\(tier,f\.origine,\{confirme:true\}\)/.test(app),
  "l'app ouvre la fenêtre sur le devis, et seul un choix confirmé repart");
const af = lire("src/cloud/achatFormuleCloud.js");
ok(/d\?\.confirmation_requise === true && d\?\.devis\) return \{ etat: 'confirmation'/.test(af) && /confirme_changement: true/.test(af), "formules avec Cloud : même fenêtre, même confirmation");

console.log("4. Ce qui suivait le changement du 14/11 01:27 (audit) : métadonnées, crédit, mail de la veille");
const { metadonneesARealigner, metadonneesApresMontee } = await import("../supabase/functions/_shared/changement-formule.js");
// Le webhook : une seule écriture, seulement les clés qui changent (avant : la 2e écriture remettait « pro_cloud »).
ok(JSON.stringify(metadonneesARealigner({ formule: "pro_cloud", plan_type: "pro", essai_cloud: "1" }, { formule: null, plan: "business" })) === JSON.stringify({ formule: "", plan_type: "business" }),
  "webhook : Pro + Cloud → prix Business = { formule: '', plan_type: 'business' } en UN appel (jamais l'instantané recopié)");
ok(metadonneesARealigner({ formule: "pro_cloud", plan_type: "pro" }, { formule: "pro_cloud", plan: "pro" }) === null, "webhook : rien à réaligner → aucun appel");
ok(JSON.stringify(metadonneesApresMontee({ plan: "business", avaitFormuleCloud: true })) === JSON.stringify({ plan_type: "business", formule: "", essai_cloud: "0" })
  && JSON.stringify(metadonneesApresMontee({ plan: "pro", avaitFormuleCloud: false })) === JSON.stringify({ plan_type: "pro" }), "montée in situ : la formule avec Cloud quittée est effacée ; une montée simple ne pose que le palier");
ok(/upgraded\.status === "trialing"\s*\? \{ data: \{ skipped: "essai_en_cours" \}/.test(ccs), "montée in situ : aucun crédit du mois sur un abonnement encore en essai");
const wh = lire("supabase/functions/stripe-webhook/index.ts");
ok(/metadonneesARealigner\(subscription\.metadata \?\? \{\}, \{ formule: formuleSub \?\? null, plan \}\)/.test(wh) && !/metadata: \{ \.\.\.\(subscription\.metadata \?\? \{\}\), formule: formuleSub/.test(wh), "stripe-webhook : le réalignement passe par metadonneesARealigner");
// Le mail de la veille : la formule lue sur le PRIX ; un abonnement qui ne porte plus le Cloud n'annonce rien.
const { prixDepuisStripe } = await import("../supabase/functions/_shared/cloud-prix.js");
const TABLE = { standard: "price_std", pro: "price_pro", business: "price_bus", cloud: "price_cloud", premium_cloud: "price_pc", pro_cloud: "price_proc", business_cloud: "price_busc" };
const article = (id, montant) => ({ items: { data: [{ price: { id, unit_amount: montant, currency: "eur", recurring: { interval: "month" } }, quantity: 1 }] } });
const subRomane = { id: "sub_x", status: "trialing", metadata: { formule: "pro_cloud", plan_type: "business" }, ...article("price_bus", 5999) };
const lu = prixDepuisStripe(subRomane, TABLE);
ok(lu.renouvelle === false && lu.prix === null && lu.raison === "abonnement_sans_cloud", "veille : prix Business seul + métadonnée « pro_cloud » restée → aucun Cloud ne renouvelle, aucun mail « Pro + Cloud à 59,99 € »", JSON.stringify(lu));
const luPc = prixDepuisStripe({ id: "sub_y", status: "trialing", metadata: {}, ...article("price_proc", 4999) }, TABLE);
ok(luPc.formule === "pro_cloud" && luPc.prix?.montant === 49.99, "veille : Pro + Cloud lu sur le prix (49,99 €), même sans métadonnée", JSON.stringify(luPc));
ok(prixDepuisStripe({ id: "sub_z", status: "trialing", metadata: { option: "cloud" }, ...article("price_cloud", 2499) }, TABLE).prix?.montant === 24.99, "veille : le Cloud seul garde son prix");
ok(/prixStripe: prixStripe\(\)/.test(lire("supabase/functions/_shared/cloud-prix-source.ts")) && /prixDepuisStripe\(res\.corps, deps\.prixStripe \?\? null\)/.test(lire("supabase/functions/_shared/cloud-prix.js")), "la lecture à la source passe la table des prix");
// Les cartes « Avec Cloud » pendant un essai, sur le web : plus jamais « Ton essai continue ».
const TF = await import("../src/cloud/textesFormules.js");
ok(typeof TF.textesFormules("fr").essaiContinue === "undefined" && /^Ton essai gratuit s'arrête : tu seras débité maintenant de 49,99 € pour Pro \+ Cloud\.$/.test(TF.textesFormules("fr").essaiArreteFormule("Pro + Cloud", "49,99 €")),
  "cartes : « Ton essai gratuit s'arrête : tu seras débité maintenant de … » (essaiContinue retiré)");

console.log(ko ? `\n${ko} échec(s) sur ${n}` : `\nOK ${n}/${n}`);
process.exit(ko ? 1 : 0);
