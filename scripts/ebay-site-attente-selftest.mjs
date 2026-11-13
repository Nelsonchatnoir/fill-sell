// VERROU (13/11/2026, étape 4 L0 — décisions D9 et D10 de Nico) — eBAY HORS DE FRANCE : AUCUNE TÂCHE CLOSE
//   npm run selftest:ebay-site-attente
//   (rouge avant : VERROU_RACINE=<copie de main 5274cd4> node scripts/ebay-site-attente-selftest.mjs)
//
// « D9 : … AUCUNE tâche close. Les tâches eBay des comptes découverts hors France passent en attente avec un message
// vrai (« ton site eBay arrive bientôt, rien n'est perdu ») et repartent seules à l'ouverture de leur site. Un job
// bloqué se laisse retenter, jamais fermé. » — « D10 : … Un compte eBay ÉTRANGER ne passe jamais par ebay.fr, même par
// l'extension (règle du 25/09) : il est orienté vers l'API (« relie ton eBay à FillSell »). »
// Cas RÉELS (prod, lus le 13/11, cités par id8) — tous fermés « FillSell publie seulement sur eBay France » par
// ebay-api-worker (fermerAttentesEbayHorsFrance) :
//   · compte c7c382b7 (eBay UK) : fc9fe66d (pending, voie api, 12/11 20:20 → close 20:22), 5ab3543b (needs_user
//     « ebay_compte_a_finir », voie api), 71b6a2c3 (needs_user « ebay_compte_vendeur_inactif », voie extension) —
//     12 tâches fermées d'un coup le 12/11 à 18:30, à la lecture de son site ;
//   · compte 9ea76b27 (eBay US) : 3801f1b2 (pending, api, 09/11) ; compte b7b4033a (eBay US) : 652865ee (02/11).
//   · D10 : comptes au site connu étranger et liaison révoquée (9f64d78e US, 00ca4ff3 Canada) — rien ne les retenait
//     d'une publication par l'extension sur ebay.fr.
//   · le filet SQL expire_publish_reservations (cron quotidien 03:20 UTC) ferme toute attente de plus de 14 jours
//     (« attente_14j ») : la migration 20261113184500 en exempte l'attente du site eBay.
// Aucune donnée de client : pseudos et ids de tâches complets inventés (préfixes réels).
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.VERROU_RACINE || join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e).slice(0, 160) }; } };

let n = 0, ko = 0;
const ok = (c, nom, d) => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d === undefined ? "" : `\n      ← ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 400)}`}`); } };

const A = await charger("supabase/functions/_shared/ebay-site-attente.js");
const { archiverErreur } = await charger("supabase/functions/_shared/erreurs-archivees.js");
const { traduireMessageServeur } = await charger("src/utils/messagesServeur.js");
const module = !A.__erreur;
ok(module, "le module _shared/ebay-site-attente.js existe (la règle de l'attente)", A.__erreur);
const f = (nom) => (module && typeof A[nom] === "function" ? A[nom] : () => ({}));

const MOTS_INTERDITS = /ordinateur|chrome|computer/i;
const PHRASE_NICO = "Ton site eBay arrive bientôt, rien n'est perdu";
const job = (id, o) => ({ id: `${id}-0000-4000-8000-000000000000`, platform: "ebay", action: "publish", error: null, platform_fields: {}, ...o });

console.log("1. Cas réels : la tâche passe EN ATTENTE, jamais close");
const cas = [
  ["fc9fe66d", "c7c382b7", "UK", job("fc9fe66d", { status: "pending", voie: "api" })],
  ["5ab3543b", "c7c382b7", "UK", job("5ab3543b", { status: "needs_user", voie: "api", error: "Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : il reste à finir sa configuration (paiement, retours, livraison). Rien n'a été envoyé à eBay — l'annonce partira toute seule dès que ton compte sera prêt.", platform_fields: { needs_user_source: "ebay_compte_a_finir", ebay_a_finir: { etape: "politiques" } } })],
  ["71b6a2c3", "c7c382b7", "UK", job("71b6a2c3", { status: "needs_user", voie: "extension", platform_fields: { needs_user_source: "ebay_compte_vendeur_inactif", error_technique: { brut: "page eBay inattendue" } } })],
  ["3801f1b2", "9ea76b27", "US", job("3801f1b2", { status: "pending", voie: "api" })],
  ["652865ee", "b7b4033a", "US", job("652865ee", { status: "pending", voie: "api" })],
];
for (const [id8, compte8, site, j] of cas) {
  const w = f("ecritureAttenteSiteEbay")(j, { par: "ebay-api-worker", site, compte: "vendeur_essai", maintenant: Date.parse("2026-11-13T18:00:00Z"), archiver: archiverErreur });
  const pf = w.platform_fields ?? {};
  ok(w.status === "needs_user" && pf.needs_user_source === "ebay_site_etranger" && String(w.error ?? "").includes(PHRASE_NICO)
    && pf.hors_quota === true && pf.ebay_site_attente?.site === site && pf.ebay_site_attente?.statut_avant === j.status,
  `${id8} (compte ${compte8}, eBay ${site}, ${j.status}, voie ${j.voie}) : needs_user « ebay_site_etranger », « ${PHRASE_NICO} », hors quota — jamais cancelled`, { status: w.status, error: w.error });
  if (j.platform_fields.needs_user_source) ok(pf.ebay_site_attente?.source_avant === j.platform_fields.needs_user_source && !pf.ebay_a_finir, `${id8} : l'attente d'avant (${j.platform_fields.needs_user_source}) est gardée dans la marque, « compte à finir » retiré`);
}
{
  const relance = { ...cas[0][3], status: "pending", error: null, platform_fields: { ebay_site_attente: { depuis: "2026-11-13T18:00:00.000Z", site: "UK" } } };
  const w = f("ecritureAttenteSiteEbay")(relance, { par: "ebay-api-worker", site: "UK", compte: "vendeur_essai", maintenant: Date.parse("2026-11-20T09:00:00Z") });
  ok(w.status === "needs_user" && w.platform_fields?.ebay_site_attente?.depuis === "2026-11-13T18:00:00.000Z", "retentée à la main (pending) : elle revient en attente, la date de début gardée — jamais close");
}
for (const lang of ["fr", "en"]) for (const action of ["publish", "republish"]) {
  const a = f("messageAttenteSiteEbay")("UK", "vendeur_essai", { action, lang });
  const r = f("messageRelierEbayEtranger")("US", null, { action, lang });
  ok(typeof a === "string" && typeof r === "string" && !MOTS_INTERDITS.test(a) && !MOTS_INTERDITS.test(r) && /ebay\.fr/.test(a) && /ebay\.fr/.test(r),
    `messages ${lang} (${action}) : ni « ordinateur » ni « Chrome » (client Cloud compris), ebay.fr jamais à la place`, { a, r });
}
ok(String(f("messageRelierEbayEtranger")("US", null, {})).includes("Relie ton eBay à FillSell"), "D10 : « Relie ton eBay à FillSell » (mot pour mot)");
ok(String(f("messageAttenteSiteEbay")("UK", null, { lang: "en" })).includes("Your eBay site is coming soon, nothing is lost"), "en anglais : « Your eBay site is coming soon, nothing is lost »");

console.log("2. Site ouvert : le code ET l'interrupteur ; aujourd'hui eBay France seul");
ok(JSON.stringify(A.SITES_EBAY_PUBLIABLES) === JSON.stringify(["France"]), "le code ne sait publier que sur eBay France (SITES_EBAY_PUBLIABLES)", A.SITES_EBAY_PUBLIABLES);
ok(f("siteEbayOuvert")("France") === true && f("siteEbayOuvert")("UK", { ouvertes: [] }) === false, "France ouverte, Royaume-Uni fermé");
ok(f("siteEbayOuvert")("UK", { ouvertes: ["ebay_pays_gb"] }) === false, "un interrupteur ebay_pays_gb posé trop tôt n'ouvre RIEN (le code ne sait pas publier sur ebay.co.uk)");
ok(f("cleOuvertureSiteEbay")("UK") === "ebay_pays_gb" && f("cleOuvertureSiteEbay")("Belgium_French") === "ebay_pays_be" && f("cleOuvertureSiteEbay")("US") === "ebay_pays_us", "la clé de l'interrupteur = celle de _shared/plateformes-pays.js (ebay_pays_<cc>)");
ok(f("siteEbayEnAttente")(null) === false && f("siteEbayEnAttente")("") === false && f("siteEbayEnAttente")("France") === false && f("siteEbayEnAttente")("Italy") === true, "site inconnu → rien n'est décidé ; France → rien ; Italie → attente");

console.log("3. Reprise seule : à l'ouverture du site, ou quand le compte relié est sur eBay France");
const enAttente = (voie, action = "publish", geste = "attendre") => ({ ...job("fc9fe66d", { status: "needs_user", voie, action }), error: "x", platform_fields: { needs_user_source: "ebay_site_etranger", ebay_site_attente: { site: "UK", geste }, hors_quota: true } });
const compteUK = { ebay_site: "UK", ebay_user_id: "vendeur_essai", revoked_at: null };
const d = (j, ctx) => f("decisionAttenteSiteEbay")(j, ctx) ?? {};
ok(d(enAttente("api"), { compte: compteUK, drapeauApi: true }).action === "rien", "c7c382b7 (UK, relié) : site fermé → elle attend (rien n'est écrit)");
ok(d(enAttente("api"), { compte: compteUK, drapeauApi: true, ouvertes: ["ebay_pays_gb"] }).action === "rien", "interrupteur seul : elle attend toujours (jamais publiée sur ebay.fr)");
ok(d(enAttente("api"), { compte: { ...compteUK, ebay_site: "France" }, drapeauApi: true }).action === "reprendre", "compte relié maintenant sur eBay France → reprise (pending)");
ok(d(enAttente("extension", "publish", "relier"), { compte: compteUK, drapeauApi: true }).voie === "api", "publication de l'extension d'un compte relié depuis → reprise par l'API (voie api)");
ok(d(enAttente("api"), { compte: { ...compteUK, revoked_at: "2026-11-14T00:00:00Z" }, drapeauApi: true }).action === "remessage", "liaison révoquée → le message dit « relie ton eBay » (jamais close, jamais ebay.fr)");
ok(d(enAttente("api"), { compte: null, drapeauApi: false }).action === "remessage" && d(enAttente("api", "publish", "relier"), { compte: null }).action === "rien", "compte délié : « relie ton eBay », une seule écriture puis rien");
const rep = f("ecritureRepriseAttenteSiteEbay")(enAttente("api"), { motif: "compte_ebay_france", maintenant: Date.parse("2026-11-20T09:00:00Z"), archiver: archiverErreur });
ok(rep.status === "pending" && rep.error === null && !rep.platform_fields?.needs_user_source && rep.platform_fields?.ebay_site_attente_levee?.motif === "compte_ebay_france" && rep.platform_fields?.hors_quota === true,
  "la reprise : pending, message effacé et archivé, levée tracée, hors quota gardé", rep);

console.log("4. D10 — l'extension ne publie jamais sur ebay.fr pour un compte connu étranger");
const e = (j, ctx) => f("decisionEbayEtrangerExtension")(j, ctx) ?? {};
ok(e(cas[2][3], { compte: compteUK, drapeauApi: true }).servir === false, "71b6a2c3 (c7c382b7, UK, voie extension) : jamais servie à l'extension");
ok(e({ ...cas[2][3], status: "pending" }, { compte: compteUK, drapeauApi: true }).ecrire === false, "… publication d'un compte relié : l'API la reprend (aucune écriture ici)");
const repubUK = e(job("71b6a2c3", { status: "pending", voie: "extension", action: "republish" }), { compte: compteUK, drapeauApi: true });
ok(repubUK.servir === false && repubUK.ecrire === true && repubUK.geste === "attendre", "republication de l'extension d'un compte UK relié : retenue, en attente de son site", repubUK);
const revUS = e(job("9f64d78e", { status: "pending", voie: "extension" }), { compte: { ebay_site: "US", revoked_at: "2026-10-27T10:23:14Z" }, drapeauApi: true });
ok(revUS.servir === false && revUS.ecrire === true && revUS.geste === "relier", "compte 9f64d78e (US, liaison révoquée) : jamais ebay.fr — « relie ton eBay à FillSell »", revUS);
ok(e(job("00ca4ff3", { status: "pending", voie: "extension", action: "delete" }), { compte: { ebay_site: "Canada", revoked_at: "2026-10-14T00:00:00Z" } }).servir === true, "un RETRAIT d'un compte étranger est toujours servi (jamais retenu ni fermé)");
ok(e(job("aaaaaaaa", { status: "pending", voie: "extension" }), { compte: { ebay_site: "France", revoked_at: null }, drapeauApi: false }).servir === true, "compte eBay FRANÇAIS par l'extension : servi, sur ebay.fr (inchangé)");
ok(e(job("bbbbbbbb", { status: "pending", voie: "extension" }), { compte: null }).servir === true, "aucune liaison API (site impossible à lire) : servi comme avant — jamais retenu sur un doute");

console.log("5. Branchements (code) : plus aucune clôture, la reprise tourne, les filets épargnent l'attente");
const wk = lire("supabase/functions/ebay-api-worker/index.ts");
ok(!/clotureEbayHorsFrance\(/.test(wk), "ebay-api-worker : plus aucun appel à clotureEbayHorsFrance (aucune tâche close)");
ok((wk.match(/ecritureAttenteSiteEbay\(/g) ?? []).length >= 3, "ebay-api-worker : l'attente aux trois endroits d'avant (voie extension → api, filet, prise du job)");
ok(/await reprendreAttentesSiteEbay\(admin, ouvertes\)/.test(wk) && wk.indexOf("await reprendreAttentesSiteEbay(admin, ouvertes)") < wk.indexOf("if (!jobs?.length) return json("), "ebay-api-worker : la reprise tourne à chaque passage, avant la sortie anticipée");
ok(/\.like\("key", "ebay_pays_%"\)/.test(wk), "ebay-api-worker : l'interrupteur par site lu dans coin_config (ebay_pays_*)");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/needs_user_source === SOURCE_EBAY_SITE_ATTENTE\) return false;/.test(hw), "handler-watch : le solde des 72 h n'arrête jamais l'attente du site eBay");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/decisionEbayEtrangerExtension\(/.test(gpj) && /select\("user_id, ebay_site, ebay_user_id, revoked_at"\)/.test(gpj), "get-pending-jobs : D10 — le site du compte lu (même révoqué) avant de servir une tâche eBay à l'extension");
const mig = lire("supabase/migrations/20261113184500_ebay_site_attente_jamais_expiree.sql");
const inv = lire("supabase/rollbacks/20261113184500_ebay_site_attente_jamais_expiree_INVERSE.sql");
ok(/needs_user_source' = 'ebay_site_etranger' THEN NULL/.test(mig) && mig.indexOf("'ebay_site_etranger' THEN NULL") < mig.indexOf("THEN 'attente_14j'") && /'attente_14j'/.test(inv) && !/ebay_site_etranger/.test(inv),
  "migration préparée : expire_publish_reservations n'arrête plus l'attente du site eBay (14 j, 30 j) ; inverse = la prod du 13/11");

console.log("6. L'app : le texte vrai, en français et en anglais");
const fdj = lire("src/utils/fileDesJobs.js");
ok(/ebay_etranger: "En pause : ton site eBay arrive bientôt, rien n'est perdu/.test(fdj) && /ebay_etranger: "Paused: your eBay site is coming soon, nothing is lost/.test(fdj), "file des tâches : « En pause : ton site eBay arrive bientôt, rien n'est perdu » (fr, en)");
if (typeof traduireMessageServeur === "function" && module) {
  for (const [site, compte] of [["UK", "vendeur_essai"], ["US", null], ["Belgium_French", "boutique-essai"], ["Germany", null]]) {
    for (const action of ["publish", "republish"]) {
      for (const [nom, fn] of [["attente", A.messageAttenteSiteEbay], ["relier", A.messageRelierEbayEtranger]]) {
        const fr = fn(site, compte, { action });
        const en = traduireMessageServeur(fr, "en");
        ok(en === fn(site, compte, { action, lang: "en" }) && traduireMessageServeur(fr, "fr") === fr, `traduction ${nom} ${action} ${site} : la phrase anglaise du module`, { en });
      }
    }
  }
} else ok(false, "traduction : module ou table absents");

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
