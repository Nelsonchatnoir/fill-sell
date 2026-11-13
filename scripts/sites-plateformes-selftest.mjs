// VERROU (13/11/2026, étape 4 « comptes hors France », L1) — LE SITE DE CHAQUE COMPTE DE PLATEFORME, LU UNE FOIS, SERVI PARTOUT
//   npm run selftest:sites-plateformes
//   (rouge avant : VERROU_RACINE=<copie de main d73cd9d> node scripts/sites-plateformes-selftest.mjs)
//
// Règle de Nico (International) : « identifiants plutôt que libellés ; pays, langue et monnaie de chaque compte de
// plateforme lus une fois ». Plan § 2 : un module pur _shared/sites-plateformes.js — site GetUser eBay → EBAY_xx, langue,
// devise, domaine ; un pays sans marketplace Inventory → EBAY_US en anglais ; JAMAIS EBAY_FR pour un compte étranger ;
// Vinted pays/langue → VINTED_xx et domaine — et la table public.comptes_plateformes (migration M1, PRÉPARÉE), écrite
// par le callback eBay, siteDuCompteEbay, get-pending-jobs (sonde Vinted) et la sonde Depop ; lue par etatPublic.
// Cas RÉELS (prod, lus le 13/11, cités par id8 ; pseudos et identifiants eBay inventés) :
//   · eBay : c7c382b7 (« UK »), 9ea76b27 (« US »), 9324a9b7 (« Belgium_French »), 04699046 (« France »),
//     fa461c41 (« Austria »), 0a0829b8 (« Germany »), ac19c8c9 (« Italy »), 00ca4ff3 (« Canada », liaison révoquée) ;
//   · Vinted (extension_sessions.vinted_identite) : ac19c8c9 (IT, « it-fr »), c5df477d (IT, « it-fr », session sur
//     www.vinted.it), 2c89e573 (BE, « fr »), 9f64d78e (PT, « en-fr »), 04699046 (FR, « fr ») ; 56 profils sans pays.
// AVANT (main d73cd9d) : aucun module, aucune table ; le site d'un compte n'existe que comme libellé GetUser
// (ebay_accounts.ebay_site), trois tables recopiées (ebay-site.ts DOMAINES, ebay-site-attente.js ISO, ebay-hors-france.js).
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.VERROU_RACINE || join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e).slice(0, 160) }; } };

let n = 0, ko = 0;
const ok = (c, nom, d) => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}${d === undefined ? "" : `\n      ← ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 400)}`}`); } };

const S = await charger("supabase/functions/_shared/sites-plateformes.js");
const A = await charger("supabase/functions/_shared/ebay-site-attente.js");
const VP = await charger("supabase/functions/_shared/vinted-pays.ts");
ok(!S.__erreur, "le module pur _shared/sites-plateformes.js existe", S.__erreur);
const f = (nom) => (typeof S[nom] === "function" ? S[nom] : () => undefined);
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sousEnsemble = (o, attendu) => o != null && Object.entries(attendu).every(([k, v]) => egal(o[k], v));

console.log("1. eBay : le site GetUser de chaque cas réel → identifiants (marketplace, pays, langue, devise, domaine)");
const CAS_EBAY = [
  ["c7c382b7", "UK", { site: "EBAY_GB", pays: "GB", langue: "en-GB", devise: "GBP", domaine: "ebay.co.uk" }],
  ["9ea76b27", "US", { site: "EBAY_US", pays: "US", langue: "en-US", devise: "USD", domaine: "ebay.com" }],
  ["9324a9b7", "Belgium_French", { site: "EBAY_BE", pays: "BE", langue: "fr-BE", devise: "EUR", domaine: "befr.ebay.be" }],
  ["04699046", "France", { site: "EBAY_FR", pays: "FR", langue: "fr-FR", devise: "EUR", domaine: "ebay.fr" }],
  ["fa461c41", "Austria", { site: "EBAY_AT", pays: "AT", langue: "de-AT", devise: "EUR", domaine: "ebay.at" }],
  ["0a0829b8", "Germany", { site: "EBAY_DE", pays: "DE", langue: "de-DE", devise: "EUR", domaine: "ebay.de" }],
  ["ac19c8c9", "Italy", { site: "EBAY_IT", pays: "IT", langue: "it-IT", devise: "EUR", domaine: "ebay.it" }],
  ["00ca4ff3", "Canada", { site: "EBAY_CA", pays: "CA", langue: "en-CA", devise: "CAD", domaine: "ebay.ca" }],
];
for (const [id8, getUser, attendu] of CAS_EBAY) {
  const r = f("siteEbayDuGetUser")(getUser);
  ok(sousEnsemble(r, attendu) && r.siteGetUser === getUser, `${id8} (GetUser « ${getUser} ») → ${attendu.site}, ${attendu.pays}, ${attendu.langue}, ${attendu.devise}, ${attendu.domaine}`, r);
}
ok(f("siteEbayDuGetUser")("Belgium_Dutch")?.site === "EBAY_BE" && f("siteEbayDuGetUser")("Belgium_Dutch")?.langue === "nl-BE",
  "Belgique néerlandophone : EBAY_BE en nl-BE (le même marketplace, une autre langue)", f("siteEbayDuGetUser")("Belgium_Dutch"));
ok(sousEnsemble(f("siteEbayDuGetUser")("CanadaFrench"), { site: "EBAY_CA", langue: "fr-CA", devise: "CAD", pays: "CA" }), "Canada francophone : EBAY_CA en fr-CA");
ok(sousEnsemble(f("siteEbayDuGetUser")("eBayMotors"), { site: "EBAY_US", pays: "US", langue: "en-US", devise: "USD" }), "eBay Motors : un compte américain → EBAY_US");

console.log("2. Un pays sans marketplace Inventory → EBAY_US en anglais (jamais EBAY_FR)");
for (const [getUser, cc] of [["Malaysia", "MY"], ["India", "IN"], ["Philippines", "PH"], ["HongKong", "HK"], ["Singapore", "SG"]]) {
  const r = f("siteEbayDuGetUser")(getUser);
  ok(sousEnsemble(r, { site: "EBAY_US", pays: cc, langue: "en-US", devise: "USD", domaine: "ebay.com", inventaire: false }),
    `« ${getUser} » : EBAY_US, en-US, USD, ebay.com — pays du compte gardé (${cc}), marqué sans marketplace Inventory prouvée`, r);
}

console.log("3. JAMAIS EBAY_FR pour un compte étranger ; un site inconnu = rien (pas de ligne)");
const sitesConnus = Object.keys(S.SITES_EBAY ?? {});
ok(sitesConnus.length >= 22, `la table des sites GetUser couvre les 22 sites déjà connus du serveur (${sitesConnus.length})`, sitesConnus);
const fautifs = sitesConnus.filter((s) => s !== "France" && f("siteEbayDuGetUser")(s)?.site === "EBAY_FR");
ok(sitesConnus.length > 0 && fautifs.length === 0, "aucun site GetUser autre que « France » ne rend EBAY_FR", fautifs);
for (const v of [null, undefined, "", "CustomCode", "france", " UK", "EBAY_GB"]) {
  ok(S.siteEbayDuGetUser && f("siteEbayDuGetUser")(v) === null, `GetUser ${JSON.stringify(v)} : inconnu → null (jamais deviné)`);
}
const formes = sitesConnus.map((s) => f("siteEbayDuGetUser")(s)).filter(Boolean);
ok(sitesConnus.length >= 22 && formes.length === sitesConnus.length && formes.every((r) => /^EBAY_[A-Z]{2}$/.test(r.site) && /^[A-Z]{2}$/.test(r.pays)
  && /^[a-z]{2}-[A-Z]{2}$/.test(r.langue) && /^[A-Z]{3}$/.test(r.devise) && /^[a-z0-9.-]+$/.test(r.domaine)),
  "identifiants seulement : EBAY_xx, ISO 3166, BCP 47, ISO 4217, domaine — jamais un libellé");

console.log("4. Aligné sur l'existant (une seule table, pas de concurrente)");
const ISO_AVANT = { France: "FR", UK: "GB", US: "US", eBayMotors: "US", Germany: "DE", Austria: "AT", Italy: "IT", Spain: "ES",
  Belgium_French: "BE", Belgium_Dutch: "BE", Netherlands: "NL", Ireland: "IE", Switzerland: "CH", Poland: "PL", Canada: "CA",
  CanadaFrench: "CA", Australia: "AU", HongKong: "HK", India: "IN", Malaysia: "MY", Philippines: "PH", Singapore: "SG" };
ok(Object.entries(ISO_AVANT).every(([s, cc]) => f("paysIsoDuSiteEbay")(s) === cc), "sites-plateformes : les 22 pays ISO de L0, à l'identique");
ok(typeof A.paysIsoDuSiteEbay === "function" && Object.entries(ISO_AVANT).every(([s, cc]) => A.paysIsoDuSiteEbay(s) === cc) && A.paysIsoDuSiteEbay("Narnia") === null,
  "ebay-site-attente.js (L0) rend toujours les mêmes pays (verrou ebay-site-attente)");
const attente = lire("supabase/functions/_shared/ebay-site-attente.js");
ok(/from "\.\/sites-plateformes\.js"/.test(attente) && !/const ISO = Object\.freeze\(\{/.test(attente), "ebay-site-attente.js lit la table de sites-plateformes.js (sa recopie ISO retirée)");
const DOMAINES_AVANT = { France: "ebay.fr", Italy: "ebay.it", Spain: "ebay.es", Germany: "ebay.de", Austria: "ebay.at",
  Belgium_French: "befr.ebay.be", Belgium_Dutch: "benl.ebay.be", Netherlands: "ebay.nl", Ireland: "ebay.ie",
  UK: "ebay.co.uk", US: "ebay.com", Switzerland: "ebay.ch", Poland: "ebay.pl", Canada: "ebay.ca",
  CanadaFrench: "cafr.ebay.ca", Australia: "ebay.com.au" };
ok(Object.entries(DOMAINES_AVANT).every(([s, d]) => f("domaineCompteEbay")(s) === d), "domaine du compte : les 16 domaines d'ebay-site.ts, à l'octet");
const siteTs = lire("supabase/functions/_shared/ebay-site.ts");
ok(/from "\.\/sites-plateformes\.js"/.test(siteTs) && !/const DOMAINES: Record<string, string> = \{/.test(siteTs) && /domaineCompteEbay\(site\)/.test(siteTs),
  "ebay-site.ts : domaineSiteEbay lit sites-plateformes.js (sa table DOMAINES retirée)");
const sp = lire("supabase/functions/_shared/sites-plateformes.js");
ok(/from "\.\/vinted-pays\.ts"/.test(sp) && /PAYS_VINTED_EURO/.test(sp) && !/www\.vinted\.it/.test(sp), "Vinted : les domaines de la zone euro viennent de vinted-pays.ts (relevés le 25/09), jamais recopiés");
ok(sp.length > 0 && !/^import .*(supabase|esm\.sh|Deno)/m.test(sp) &&!/\bfetch\(|\.from\("/.test(sp), "module PUR : aucun accès réseau ni base");

console.log("5. Vinted : pays et langue de la sonde → VINTED_xx, langue BCP 47, devise, domaine du site");
const CAS_VINTED = [
  ["ac19c8c9", { user_id: "100000001", pays: "IT", langue: "it-fr" }, { site: "VINTED_IT", pays: "IT", langue: "it", devise: "EUR", domaine: "vinted.it" }],
  ["c5df477d", { user_id: "100000002", pays: "IT", langue: "it-fr", domaine: "www.vinted.it" }, { site: "VINTED_IT", pays: "IT", langue: "it", devise: "EUR", domaine: "vinted.it" }],
  ["2c89e573", { user_id: "100000003", pays: "BE", langue: "fr" }, { site: "VINTED_BE", pays: "BE", langue: "fr", devise: "EUR", domaine: "vinted.be" }],
  ["9f64d78e", { user_id: "100000004", pays: "PT", langue: "en-fr" }, { site: "VINTED_PT", pays: "PT", langue: "en", devise: "EUR", domaine: "vinted.pt" }],
  ["04699046", { user_id: "100000005", pays: "FR", langue: "fr" }, { site: "VINTED_FR", pays: "FR", langue: "fr", devise: "EUR", domaine: "vinted.fr" }],
];
for (const [id8, ident, attendu] of CAS_VINTED) {
  const r = f("siteVinted")({ pays: ident.pays, locale: ident.langue });
  ok(sousEnsemble(r, attendu), `${id8} (sonde ${ident.pays}, « ${ident.langue} ») → ${attendu.site}, langue ${attendu.langue}, ${attendu.devise}, ${attendu.domaine}`, r);
}
ok(Object.keys(VP.PAYS_VINTED_EURO ?? {}).length === 18 && Object.entries(VP.PAYS_VINTED_EURO ?? {}).every(([cc, p]) => f("siteVinted")({ pays: cc })?.domaine === p.domaine.replace(/^www\./, "") && f("siteVinted")({ pays: cc })?.devise === "EUR"),
  "les 18 pays Vinted de la zone euro : domaine relevé, euro");
ok(sousEnsemble(f("siteVinted")({ pays: "GB", locale: "en-gb" }), { site: "VINTED_GB", pays: "GB", langue: "en", devise: null, domaine: null }),
  "hors zone euro (non relevé) : VINTED_GB, langue lue, devise et domaine INCONNUS (null) — jamais devinés", f("siteVinted")({ pays: "GB", locale: "en-gb" }));
for (const v of [{}, { pays: null, locale: "fr" }, { pays: "fra" }, { pays: "" }]) ok(S.siteVinted && f("siteVinted")(v) === null, `sonde sans pays ${JSON.stringify(v)} → null (pas de ligne)`);
ok(f("siteVinted")({ pays: "FR", locale: "??" })?.langue === null, "langue illisible → null (la ligne garde le site et le pays)");

console.log("6. Depop (sonde) ; Leboncoin et Beebs (sites français)");
ok(sousEnsemble(f("siteDepop")({ pays: "GB" }), { site: "DEPOP_GB", pays: "GB", langue: null, devise: "GBP", domaine: "depop.com" }), "Depop GB → DEPOP_GB, GBP, depop.com, langue non lue (null)", f("siteDepop")({ pays: "GB" }));
ok(f("siteDepop")({ pays: "US" })?.devise === "USD" && f("siteDepop")({ pays: "AU" })?.devise === "AUD" && f("siteDepop")({ pays: "FR" })?.devise === "EUR", "Depop US → USD, AU → AUD, FR → EUR");
ok(sousEnsemble(f("siteDepop")({ pays: "JP" }), { site: "DEPOP_JP", devise: null }) && f("siteDepop")({ pays: null }) === null, "Depop d'un pays non relevé : devise inconnue (null) ; pays absent → null");
const depopJs = lire("chrome-extension/content-scripts/depop.js");
const euroExt = (depopJs.match(/DEPOP_PAYS_EURO = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "").match(/[A-Z]{2}/g) ?? [];
ok(euroExt.length === 20 && egal([...(S.PAYS_DEPOP_EURO ?? [])].sort(), [...euroExt].sort()), "la zone euro de Depop est celle de l'extension (depop.js), à l'identique", { module: S.PAYS_DEPOP_EURO, extension: euroExt });
ok(sousEnsemble(f("siteFranceSeule")("leboncoin"), { site: "LEBONCOIN_FR", pays: "FR", langue: "fr-FR", devise: "EUR", domaine: "leboncoin.fr" })
  && sousEnsemble(f("siteFranceSeule")("beebs"), { site: "BEEBS_FR", pays: "FR", devise: "EUR" }) && f("siteFranceSeule")("ebay") === null,
  "Leboncoin → LEBONCOIN_FR, Beebs → BEEBS_FR (sites français) ; eBay n'est jamais « France seule »");

console.log("7. La ligne de comptes_plateformes (inconnu = pas de ligne)");
const U = "c7c382b7-0000-4000-8000-000000000001";
const lE = f("ligneCompteEbay")({ userId: U, compte: "eias-essai-c7c382b7", siteGetUser: "UK" });
ok(egal(lE, { user_id: U, plateforme: "ebay", compte: "eias-essai-c7c382b7", site: "EBAY_GB", pays: "GB", langue: "en-GB", devise: "GBP", domaine: "ebay.co.uk", source: "ebay_getuser", brut: { site: "UK" } }),
  "c7c382b7 : la ligne eBay (compte = l'identifiant immuable EIAS, jamais le pseudo ; brut = le site GetUser)", lE);
ok(S.ligneCompteEbay && f("ligneCompteEbay")({ userId: U, compte: null, siteGetUser: "UK" }) === null && f("ligneCompteEbay")({ userId: U, compte: "x", siteGetUser: null }) === null
  && f("ligneCompteEbay")({ userId: null, compte: "x", siteGetUser: "UK" }) === null, "compte, site ou utilisateur inconnu → aucune ligne");
const lV = f("ligneCompteVinted")({ userId: U, identite: { user_id: "100000001", login: "vendeur-essai-1", pays: "IT", langue: "it-fr", domaine: "www.vinted.it" } });
ok(egal(lV, { user_id: U, plateforme: "vinted", compte: "100000001", site: "VINTED_IT", pays: "IT", langue: "it", devise: "EUR", domaine: "vinted.it", source: "vinted_sonde", brut: { pays: "IT", locale: "it-fr" } }),
  "ac19c8c9 / c5df477d : la ligne Vinted (compte = numéro Vinted, jamais le pseudo ; le domaine de SESSION n'entre pas dans brut — il bouge avec le poste)", lV);
ok(S.ligneCompteVinted && f("ligneCompteVinted")({ userId: U, identite: { user_id: "100000009", login: "vendeur-essai-2" } }) === null && f("ligneCompteVinted")({ userId: U, identite: null }) === null,
  "les 56 profils dont la sonde n'a pas de pays : aucune ligne");
const lD = f("ligneCompteDepop")({ userId: U, identite: { user_id: "200000001", login: "vendeur-essai-3", pays: "GB" } });
ok(egal(lD, { user_id: U, plateforme: "depop", compte: "200000001", site: "DEPOP_GB", pays: "GB", langue: null, devise: "GBP", domaine: "depop.com", source: "depop_sonde", brut: { pays: "GB" } }), "la ligne Depop (sonde de l'extension)", lD);
const lS = f("lignesDesSessions")(U, { vinted: true, vinted_identite: { user_id: "100000001", pays: "IT", langue: "it-fr" }, depop: true, depop_identite: { user_id: "200000001", pays: "GB" } });
ok(Array.isArray(lS) && lS.length === 2 && lS[0].plateforme === "vinted" && lS[1].plateforme === "depop", "les sessions de l'extension → une ligne Vinted et une ligne Depop", lS);
ok(egal(f("lignesDesSessions")(U, { vinted: null, vinted_identite: null }), []) && egal(f("lignesDesSessions")(U, null), []), "sessions muettes ou absentes : aucune ligne");

console.log("8. Servi à l'app : site_compte dans etatPublic (ebay-oauth.ts), sans identifiant de compte ni brut");
const compteRosa = { ebay_user_id: "vendeur-essai-uk", ebay_eias_token: "eias-essai-c7c382b7", ebay_site: "UK", ebay_site_lu_le: "2026-11-12T17:30:00Z", revoked_at: null };
const vueDerivee = f("siteCompteEbayPublic")(compteRosa, null);
ok(sousEnsemble(vueDerivee, { site: "EBAY_GB", pays: "GB", langue: "en-GB", devise: "GBP", domaine: "ebay.co.uk", pilote: false, depuis: "ebay_accounts" }) && !("compte" in (vueDerivee ?? {})) && !("brut" in (vueDerivee ?? {})),
  "AVANT la migration (table absente) : site_compte calculé du site GetUser (mêmes valeurs)", vueDerivee);
const ligneLue = { ...lE, compte: "eias-essai-c7c382b7", lu_le: "2026-11-13T10:00:00Z", pilote: true };
const vueLue = f("siteCompteEbayPublic")(compteRosa, ligneLue);
ok(sousEnsemble(vueLue, { site: "EBAY_GB", pilote: true, lu_le: "2026-11-13T10:00:00Z", depuis: "comptes_plateformes" }) && !("compte" in (vueLue ?? {})), "APRÈS : la ligne lue est servie (pilote compris)", vueLue);
ok(sousEnsemble(f("siteCompteEbayPublic")(compteRosa, { ...ligneLue, compte: "eias-d-un-autre-compte" }), { pilote: false }), "une ligne d'un AUTRE compte eBay (re-liaison) n'est jamais servie : retour au site GetUser");
ok(S.siteCompteEbayPublic && f("siteCompteEbayPublic")(null, null) === null && f("siteCompteEbayPublic")({ ...compteRosa, ebay_site: null }, null) === null, "aucun compte / site jamais lu → site_compte null (rien n'est grisé ni ouvert)");
const oauth = lire("supabase/functions/_shared/ebay-oauth.ts");
ok(/site_compte: siteCompteEbayPublic\(compte, /.test(oauth) && /politiques: null, ebay_site: null, site_compte: null,/.test(oauth) && /ebay_site: compte\.ebay_site \?\? null,/.test(oauth),
  "etatPublic sert site_compte (et garde ebay_site, lu par l'app d'aujourd'hui)");
const account = lire("supabase/functions/ebay-account/index.ts");
ok(/lireComptePlateforme\(admin, \{ userId: user\.id, plateforme: "ebay", compte: compte\?\.ebay_eias_token/.test(account) && /etatPublic\(compte, \{ siteCompte/.test(account),
  "ebay-account (statut) lit la ligne de comptes_plateformes et la sert");

console.log("9. Les écrivains (code prêt, sans effet tant que la migration n'est pas appliquée)");
const cb = lire("supabase/functions/ebay-oauth-callback/index.ts");
ok(/noterComptePlateforme\(admin, ligneCompteEbay\(\{ userId, compte: identite\.eiasToken, siteGetUser: identite\.site/.test(cb), "ebay-oauth-callback : le site lu à la liaison est noté");
ok(/noterComptePlateforme\(admin, ligneCompteEbay\(/.test(siteTs) && /ebay_eias_token/.test(siteTs), "siteDuCompteEbay : le site lu par GetUser est noté (une lecture → une ligne)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok((gpj.match(/noterComptesDesSessions\(/g) ?? []).length >= 2, "get-pending-jobs : les sessions lues (Vinted, Depop) notent leur compte — tâches servies et contexte du popup");
const bg = lire("chrome-extension/background.js");
ok(/identite: r\.id \? \{ user_id: String\(r\.id\), login: r\.username \?\? null, pays: /.test(bg) && /depop_identite: depop\.identite \?\? null/.test(bg) && /fusion\.depop_identite = prev\.depop_identite \?\? null/.test(bg),
  "extension (0.6.187) : la sonde Depop remonte le pays du compte (depop_identite), gardé entre deux sondes comme vinted_identite");

console.log("10. La migration M1 et le remplissage initial (PRÉPARÉS, jamais appliqués)");
const mig = fs.existsSync(join(ROOT, "supabase/migrations")) ? fs.readdirSync(join(ROOT, "supabase/migrations")).find((x) => /_comptes_plateformes\.sql$/.test(x)) : null;
const m = mig ? lire(`supabase/migrations/${mig}`) : "";
ok(!!mig && /CREATE TABLE IF NOT EXISTS public\.comptes_plateformes/.test(m) && /PRIMARY KEY \(user_id, plateforme, compte\)/.test(m), "M1 : table comptes_plateformes, clé (user_id, plateforme, compte)", mig);
ok(/ENABLE ROW LEVEL SECURITY/.test(m) && /FOR SELECT TO authenticated USING \(user_id = \(SELECT auth\.uid\(\)\)\)/.test(m) && /GRANT SELECT ON public\.comptes_plateformes TO authenticated;/.test(m)
  && /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.comptes_plateformes TO service_role;/.test(m) && !/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO authenticated/.test(m),
  "M1 : RLS — lecture par le propriétaire, écriture par le serveur seulement");
ok(/site <> 'EBAY_FR' OR pays = 'FR'/.test(m), "M1 : la base elle-même refuse EBAY_FR pour un compte d'un autre pays");
const inv = mig ? lire(`supabase/rollbacks/${mig.replace(/\.sql$/, "_INVERSE.sql")}`) : "";
ok(/DROP TABLE IF EXISTS public\.comptes_plateformes/.test(inv), "M1 : son inverse existe (supabase/rollbacks)");
const rep = fs.existsSync(join(ROOT, "scripts/reparations")) ? fs.readdirSync(join(ROOT, "scripts/reparations")).filter((x) => /comptes_plateformes_remplissage/.test(x)).sort() : [];
ok(rep.length === 3, "remplissage initial : script + _INVERSE + _PREUVE (scripts/reparations)", rep);
const script = rep.length ? lire(`scripts/reparations/${rep.find((x) => !/_INVERSE|_PREUVE/.test(x))}`) : "";
const valeurs = [...script.matchAll(/\('([A-Za-z_]+)', '(EBAY_[A-Z]{2})', '([A-Z]{2})', '([a-z]{2}-[A-Z]{2})', '([A-Z]{3})', '([a-z0-9.-]+)'\)/g)].map((x) => x.slice(1));
ok(valeurs.length >= 22 && valeurs.length === sitesConnus.length && valeurs.every(([s, site, pays, langue, devise, domaine]) => egal(f("siteEbayDuGetUser")(s) && [site, pays, langue, devise, domaine],
  [f("siteEbayDuGetUser")(s)?.site, f("siteEbayDuGetUser")(s)?.pays, f("siteEbayDuGetUser")(s)?.langue, f("siteEbayDuGetUser")(s)?.devise, f("siteEbayDuGetUser")(s)?.domaine])),
  `le script porte la table du module, à l'identique (${valeurs.length} sites GetUser)`);
const euroScript = (script.match(/-- vinted_pays_euro: ([A-Z ]+)/)?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
const domainesScript = [...script.matchAll(/\('([A-Z]{2})', '(vinted\.[a-z]+)'\)/g)].map((x) => [x[1], x[2]]);
ok(euroScript.length === 18 && egal([...euroScript].sort(), Object.keys(VP.PAYS_VINTED_EURO ?? {}).sort())
  && domainesScript.length === 18 && domainesScript.every(([cc, d]) => f("siteVinted")({ pays: cc })?.domaine === d),
  "le script porte la zone euro Vinted de vinted-pays.ts (pays et domaines), à l'identique", domainesScript.length);

const pkg = lire("package.json");
ok(/"selftest:sites-plateformes": "node scripts\/sites-plateformes-selftest\.mjs"/.test(pkg), "le verrou est inscrit dans package.json");

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
