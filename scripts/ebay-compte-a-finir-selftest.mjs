// ═══════════════════════════════════════════════════════════════════════════
// Selftest « eBay relié mais pas prêt à vendre : l'app le DIT, avec le geste, et tout repart seul »
// (14/11/2026, point 5a de Nico — cliente Cloud af37fa49, iPhone)
//   npm run selftest:ebay-compte-a-finir
//
// CE QUI S'EST PASSÉ : eBay relié à 14:27 ; ses publications eBay parquées « compte à finir ». seller_state VIDE (le
// relevé du compte n'était lu que par l'écran Réglages › Compte eBay) → « rien de relevé » valait « vendeur » : le
// message disait « finis ton compte vendeur chez eBay (vérification ou inscription vendeur). C'est ici : — » (cause
// jamais lue, adresse retirée à l'affichage) ; « Me connecter » ouvrait « Connecter eBay — Chrome doit rester ouvert
// sur ton ordinateur » ; depuis « À régler », aucun geste ; et rien ne relisait le compte : fait sur eBay, ses
// publications ne seraient jamais reparties.
// CE QUE CE TEST VERROUILLE (rouge sur 8035118, vert après) :
//   A. le serveur ne nomme jamais une étape qu'il n'a pas lue (« a_lire »), relève le compte avant de parquer, et le
//      message NOMME ce qui manque (règles de paiement / retours / livraison, ville d'expédition), sans adresse dans le
//      texte, sans « ordinateur » ; traduit en anglais au mot près ;
//   B. l'app : le geste de chaque étape (« Créer mes conditions eBay » + l'espace vendeur eBay vérifié, « Finir mon
//      compte eBay », Seller Hub), jamais « Me connecter », dans « Où en est la publication » ET depuis « À régler » ;
//   C. la reprise seule : relecture bornée des comptes parqués (barème 15 min → 1 h → 6 h → 24 h, 3 par passe, aucune ligne inchangée réécrite),
//      ré-armement quand le compte est prêt ; ebay-account et ebay-api-worker lisent LE MÊME relevé.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n") : "");
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${String(detail).slice(0, 400)}`}`); };
const essai = (f, ...a) => { try { return typeof f === "function" ? f(...a) : undefined; } catch (e) { return { __erreur: String(e?.message ?? e) }; } };

const voie = await charger("supabase/functions/_shared/ebay-voie.ts");
const M = await charger("supabase/functions/_shared/ebay-compte-a-finir.js");
const S = await charger("src/utils/shared.js");
const MS = await charger("src/utils/messagesServeur.js");
const EP = await charger("src/utils/etatsPublication.js");

const INTERDIT = /ordinateur|computer|Chrome|extension|C'est ici|https?:\/\//i;
const ligne = (pol, ss) => ({ revoked_at: null, fulfillment_policy_id: pol[0], payment_policy_id: pol[1], return_policy_id: pol[2], seller_state: ss });
// af37fa49 le 14/11 : relié à 14:27, jamais relevé.
const AF37_JAMAIS_LU = ligne([null, null, null], null);
// Le même compte une fois relevé, tel que Nico le décrit : inscrit, aucune règle chez eBay, aucune ville d'expédition.
const SS_SANS_REGLES = { inscription_vendeur: true, politiques_activees: true, politiques: { livraison: 0, paiement: 0, retours: 0 }, lieu_expedition: false, selling_limit: { quantity: 10, amount: { value: 500, currency: "EUR" } } };
const AF37_RELEVE = ligne([null, null, null], SS_SANS_REGLES);
const SS_PRET = { ...SS_SANS_REGLES, politiques: { livraison: 1, paiement: 1, retours: 1 }, lieu_expedition: true };

console.log("A. LE SERVEUR : JAMAIS UNE CAUSE QU'IL N'A PAS LUE, ET LE MESSAGE NOMME CE QUI MANQUE");
{
  const e = essai(voie.etapeEbayAFinir, AF37_JAMAIS_LU);
  ok(e?.etape === "a_lire" && e.url === null, "af37fa49 jamais relevé : « a_lire », jamais « vendeur » (inscription vendeur inventée)", JSON.stringify(e));
  const m = String(essai(voie.messageEbayCompteAFinir, e) ?? "");
  ok(!/vérification ou inscription vendeur|inscription vendeur/.test(m) && /Réglages › Compte eBay/.test(m) && !INTERDIT.test(m),
    "son message ne dit pas « inscription vendeur », il mène à l'écran eBay de FillSell, sans adresse ni « ordinateur »", m);
  const e2 = essai(voie.etapeEbayAFinir, AF37_RELEVE);
  ok(e2?.etape === "conditions" && Array.isArray(e2.manque) && ["politique_livraison", "politique_paiement", "politique_retours", "lieu_expedition"].every((c) => e2.manque.includes(c)),
    "relevé : étape « conditions », et les étapes qui manquent sont portées (manque)", JSON.stringify(e2));
  const m2 = String(essai(voie.messageEbayCompteAFinir, e2) ?? "");
  ok(/configure ton compte vendeur eBay/.test(m2) && /tes règles de paiement, de retours et de livraison/.test(m2) && /ta ville d'expédition \(ville et code postal\)/.test(m2)
    && /« Créer mes conditions eBay »/.test(m2) && /espace vendeur eBay/.test(m2) && !INTERDIT.test(m2),
    "le message nomme les règles de paiement / retours / livraison et la ville, le geste, l'espace vendeur — sans adresse", m2);
  ok(essai(voie.etapeEbayAFinir, ligne(["f", "p", "r"], SS_PRET)) === null, "compte prêt : rien à finir");
  const etapes = ["plafond", "vendeur", "retours", "conditions", "parcours", "a_lire"];
  const tous = etapes.map((etape) => ({ etape, m: String(essai(voie.messageEbayCompteAFinir, { etape, url: etape === "plafond" || etape === "vendeur" ? "https://www.ebay.fr/sh/ovw" : null, manque: ["politique_paiement", "lieu_expedition"] }) ?? "") }));
  const fautes = tous.filter(({ m }) => INTERDIT.test(m) || !/Rien n'a été envoyé à eBay, et tes annonces eBay partiront toutes seules dès que ton compte sera prêt\.$/.test(m));
  ok(fautes.length === 0, "chaque étape : aucune adresse dans le texte (« C'est ici : — » à l'écran), jamais « ordinateur », la reprise seule dite", JSON.stringify(fautes));
  const job = (m, af) => ({ platform: "ebay", status: "needs_user", error: m, platform_fields: { needs_user_source: "ebay_compte_a_finir", ebay_a_finir: af } });
  const casses = tous.filter(({ m }) => /C'est ici\s*:\s*—/.test(String(essai(S.humanizeJobError, job(m, null), "fr") ?? "")));
  ok(casses.length === 0, "à l'écran (humanizeJobError) : plus jamais « C'est ici : — »", JSON.stringify(casses));
  const enFaux = tous.filter(({ etape, m }) => {
    const en = essai(MS.traduireMessageServeur, m, "en");
    return en !== essai(M.texteCompteEbayAFinir, { etape, manque: ["politique_paiement", "lieu_expedition"] }, "en") || /[éèàç]|Rien|ton compte/.test(String(en));
  });
  ok(enFaux.length === 0, "en anglais : la phrase exacte, traduite par le module qui l'écrit", JSON.stringify(enFaux).slice(0, 300));
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  ok(!/etatCompteEbayApi\(/.test(w) && (w.match(/await etatCompteEbayApiFrais\(admin, env, (j|job)\.user_id\)/g) ?? []).length === 2,
    "ebay-api-worker : les deux parcages relèvent le compte avant de parquer (etatCompteEbayApiFrais), plus aucun état non lu");
  const r = lire("supabase/functions/_shared/ebay-releve-compte.ts");
  ok(/ligne\.seller_state == null \|\| !Number\.isFinite\(lu\) \|\| maintenant - lu >= perimeMs/.test(r) && /export const RELEVE_PERIME_MS = 30 \* 60_000;/.test(r),
    "relevé avant parcage : jamais lu, ou il y a plus de 30 min");
  const iFrais = r.indexOf("let ligne = await lire();");
  ok(iFrais > 0 && /^let ligne = await lire\(\);\s*\n\s*if \(compteEbayApiUsableDepuisLigne\(ligne\)\) return \{ usable: true, aFinir: null, releve: false \};/.test(r.slice(iFrais)),
    "un compte que la base dit prêt n'est jamais relevé au parcage (aucun appel eBay de plus pour les comptes qui publient)");
}

console.log("\nB. L'APP : LE GESTE DE CHAQUE ÉTAPE, JAMAIS « ME CONNECTER »");
{
  const g = (af) => essai(S.lienVerificationEbay, { platform: "ebay", status: "needs_user", platform_fields: { needs_user_source: "ebay_compte_a_finir", ebay_a_finir: af } }, "fr");
  const cond = g({ etape: "conditions", url: null, manque: ["politique_paiement"] });
  ok(cond?.action === "creer_conditions_ebay" && /Créer mes conditions eBay/.test(cond.libelle) && cond.lien?.url === "https://www.ebay.fr/bp/manage" && /eBay/.test(cond.lien?.libelle ?? ""),
    "conditions : « Créer mes conditions eBay » (04/11), puis l'espace vendeur eBay (bp/manage, lien vérifié le 14/11)", JSON.stringify(cond));
  ok(M.LIEN_EBAY_REGLES_DE_VENTE === "https://www.ebay.fr/bp/manage" && M.LIEN_EBAY_ESPACE_VENDEUR === "https://www.ebay.fr/sh/ovw", "liens eBay vérifiés seulement");
  for (const etape of ["parcours", "retours", "a_lire"]) {
    const x = g({ etape, url: null, manque: [] });
    ok(x?.action === "ouvrir_compte_ebay" && x.url === null && /Finir mon compte eBay/.test(x.libelle) && /toutes seules/.test(x.aide), `${etape} : « Finir mon compte eBay » (l'écran eBay de FillSell), il n'y avait AUCUN geste`, JSON.stringify(x));
  }
  const vend = g({ etape: "vendeur", url: "https://evil.example/x", manque: [] });
  ok(vend?.url === "https://www.ebay.fr/sh/ovw" && /Finir mon compte vendeur eBay/.test(vend.libelle), "inscription vendeur : le Seller Hub, jamais un lien hors ebay.fr", JSON.stringify(vend));
  const avant = g(undefined);
  ok(avant?.action === "ouvrir_compte_ebay" && avant.lien?.url === "https://www.ebay.fr/sh/ovw", "job parqué avant le 14/11 sans étape : l'écran eBay, et le Seller Hub en second", JSON.stringify(avant));
  const tousLesGestes = JSON.stringify([cond, vend, avant, g({ etape: "plafond", url: "https://www.ebay.fr/sh/ovw" })]);
  ok(!/ordinateur|Chrome|Me connecter/.test(tousLesGestes), "aucun geste ne dit « ordinateur », « Chrome » ni « Me connecter »");
  const nat = essai(EP.natureAttente, { platform: "ebay", status: "needs_user", platform_fields: { needs_user_source: "ebay_compte_a_finir" } });
  ok(nat?.kind === "attente_compte_ebay", "natureAttente : une attente de compte, plus une « connexion » (écrans de publication)", JSON.stringify(nat));
  const phrase = String(essai(EP.phraseEtat, "ebay", nat, "fr") ?? "");
  ok(/compte vendeur eBay/.test(phrase) && !/connexion|ordinateur/.test(phrase), "la phrase d'état dit le compte vendeur eBay", phrase);
  ok(essai(EP.natureAttente, { platform: "ebay", status: "needs_user", platform_fields: { needs_user_source: "ebay_connexion_requise" } })?.kind === "attente_connexion",
    "un compte PAS relié garde « Me connecter » (ebay_connexion_requise inchangé)");
  const st = lire("src/tabs/StockTab.jsx");
  ok(!/\['ebay_connexion_requise', 'ebay_compte_a_finir'\]\.includes\(job\?\.platform_fields\?\.needs_user_source\)\) return MOTIFS\.CONNEXION/.test(st)
    && /if \(pf === 'ebay' && job\?\.platform_fields\?\.needs_user_source === 'ebay_connexion_requise'\) return MOTIFS\.CONNEXION;/.test(st),
    "Stock : « compte à finir » n'est plus un mur de connexion (plus de « Connecter eBay — … ordinateur » sur un compte relié)");
  ok(/failJobModal\.platform_fields\?\.needs_user_source==='ebay_compte_a_finir'&&\(\s*<div style=\{\{marginBottom:12\}\}>\s*<GesteCompteEbay lang=\{lang\} geste=\{lienVerificationEbay\(failJobModal,lang\)\}/.test(st),
    "« À régler » › Voir : le geste est là (il n'y en avait aucun)");
  ok(/return <GesteCompteEbay lang=\{lang\} geste=\{lien\} onOuvrirCompteEbay=\{onOuvrirCompteEbay\} \/>;/.test(st) && /onOuvrirCompteEbay=\{\(\)=>\{setJobStatusItem\(null\);setEbayPanneauStock\(true\);\}\}/.test(st),
    "« Où en est la publication » : le même geste, « Finir mon compte eBay » ouvre Réglages › Compte eBay");
  const comp = lire("src/stock/GesteCompteEbay.jsx");
  ok(/onClick=\{onOuvrirCompteEbay\}/.test(comp) && /<BoutonConditionsEbay/.test(comp) && /rel="noopener noreferrer"/.test(comp) && !/ordinateur|Me connecter/.test(comp.replace(/^\/\/.*$/gm, "")),
    "GesteCompteEbay : l'écran eBay, « Créer mes conditions eBay », le lien eBay — rien d'autre");
}

console.log("\nC. LA REPRISE SEULE, SANS RELECTURE EN BOUCLE");
{
  const due = (parqueMin, luMin) => essai(voie.relectureCompteEbayDue, {
    parqueDepuis: new Date(Date.parse("2026-11-14T15:00:00Z") - parqueMin * 60_000).toISOString(),
    releveLe: luMin == null ? null : new Date(Date.parse("2026-11-14T15:00:00Z") - luMin * 60_000).toISOString(),
    maintenant: Date.parse("2026-11-14T15:00:00Z"),
  });
  ok(due(5, null) === true, "parqué il y a 5 min, jamais relevé : relu");
  ok(due(30, 14) === false && due(30, 16) === true, "les 2 premières heures : toutes les 15 min");
  ok(due(180, 30) === false && due(180, 61) === true, "le premier jour : toutes les heures");
  ok(due(3 * 1440, 300) === false && due(3 * 1440, 361) === true, "la première semaine : toutes les 6 h");
  ok(due(20 * 1440, 1000) === false && due(20 * 1440, 1441) === true, "jusqu'à 30 jours : une fois par jour");
  ok(due(31 * 1440, null) === false && due(0, null) === true, "après 30 jours : plus jamais (le geste dans l'app relit toujours)");
  ok(voie.RELECTURES_COMPTE_EBAY_PAR_PASSE === 3, "3 comptes au plus par passe");
  const pq = essai(voie.parqueeLeEbay, { created_at: "2026-11-14T13:13:40Z", platform_fields: { voie_reroutee: { le: "2026-11-14T13:38:05Z", compte_pret: false } } });
  ok(pq === "2026-11-14T13:38:05Z", "parcage de dfc38020 : le passage à l'API « compte pas prêt » (14:38), pas la création (14:13)", pq);
  const w = lire("supabase/functions/ebay-api-worker/index.ts");
  const i = w.indexOf("async function relireComptesEbayAFinir(");
  const f = i > 0 ? w.slice(i, w.indexOf("\n}\n", i)) : "";
  ok(/\.eq\("platform_fields->>needs_user_source", SOURCE_EBAY_COMPTE_A_FINIR\)/.test(f) && /\.limit\(300\)/.test(f) && /ids\.slice\(i, i \+ 100\)/.test(f),
    "seuls les comptes qui ont des publications parquées sont lus (300 au plus, .in() par 100)");
  ok(/if \(relus >= RELECTURES_COMPTE_EBAY_PAR_PASSE\) break;/.test(f) && /relectureCompteEbayDue\(\{ releveLe: ligne\.seller_state_at/.test(f),
    "bornée : le barème, 3 relevés par passe");
  ok(/if \(compteEbayApiUsableDepuisLigne\(apres\)\) \{ relances \+= await rearmerJobsEbayConnexionSiUtilisable\(admin, userId\); continue; \}/.test(f),
    "prêt : les publications parquées repartent (ré-armement gardé par needs_user)");
  ok(/if \(j\.error === message && JSON\.stringify\(pf0\.ebay_a_finir \?\? null\) === JSON\.stringify\(aFinir\)\) continue;/.test(f) && /\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(f),
    "pas prêt : le message suit ce qui manque, aucune ligne inchangée réécrite, garde needs_user");
  ok(/comptesAFinir = await relireComptesEbayAFinir\(admin, env\)/.test(w) && w.indexOf("comptesAFinir = await relireComptesEbayAFinir") < w.indexOf("if (!jobs?.length) return json({ traites: 0"),
    "la passe tourne à chaque passage du worker, avant la sortie anticipée");
  const a = lire("supabase/functions/ebay-account/index.ts");
  ok(!/async function releverChecklist\(/.test(a) && /import \{[^}]*releverChecklist[^}]*\} from "\.\.\/_shared\/ebay-releve-compte\.ts";/.test(a),
    "ebay-account et ebay-api-worker : LE MÊME relevé (_shared/ebay-releve-compte.ts), plus de copie");
}

console.log(`\n${ko ? `✗ ${ko} échec(s)` : "✓ tout est vert"} — ${n} contrôles`);
process.exit(ko ? 1 : 0);
