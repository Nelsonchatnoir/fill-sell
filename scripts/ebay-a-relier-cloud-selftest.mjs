// ═══════════════════════════════════════════════════════════════════════════
// Selftest « un client FillSell Cloud dont l'eBay n'est pas relié : le geste est de relier eBay, jamais l'ordinateur »
// (12/11, lot « zéro problème », N3 — reste de l'étape 1, famille des retraits)
//   npm run selftest:ebay-a-relier-cloud
//
// LE TROU : la copie Cloud de l'extension ne fait que Vinted, Leboncoin, Beebs et Depop (PLATEFORMES_CLOUD_VOIE) ; eBay
// d'un client Cloud passe par l'API d'eBay — seulement si SON eBay est relié à FillSell (profiles.ebay_voie_api ET une
// ligne ebay_accounts non révoquée). Sinon, un RETRAIT ou une PUBLICATION eBay (voie « extension ») part vers
// l'ordinateur (jobsSelonDrapeauCloud garde eBay) : sans ordinateur, il attend sans fin, et l'app dit « ouvre Chrome sur
// ton ordinateur » — réécrit pour le Cloud en « FillSell Cloud la retirera dès qu'il reprend » : FAUX, le Cloud ne fait
// pas eBay. Pour un retrait d'article vendu, c'est un risque de double vente que personne ne voit.
// Comptes concernés le 12/11 23:00 : b695d990 (4 annonces eBay en ligne, voie extension), d607ba20, d0ac0538 (Cloud
// actif, eBay non relié, aucune tâche ouverte) ; f0acd3af, c7c382b7, f44b5917 (Cloud, eBay relié) ne sont pas touchés.
//
// CE QUE CE TEST VERROUILLE :
//   A. la règle (_shared/cloud-voie.js) : tâche eBay voie extension en file (ou arrêtée sur un mur « Chrome ») d'un compte
//      au Cloud actif dont l'eBay n'est pas relié → « à toi de jouer » : relie ton compte eBay à FillSell (Réglages › Mes
//      plateformes › eBay) ; un retrait le dit comme un risque de double vente ; jamais « ordinateur » ni « Chrome » ;
//      écrite une fois ; levée seule dès qu'eBay est relié (la voie API la reprend) ou que le Cloud n'est plus actif ;
//   B. l'app (src/utils/retraitsBloques.js) : le mur « relier_ebay », avant « ordinateur », dans « À régler », la carte de
//      l'article et la ligne « articles vendus encore en ligne » — en français et en anglais, client Cloud ou non ;
//   C. handler-watch : la passe bornée (comptes au Cloud actif seulement), compare-and-set sur le statut lu.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
const CV = await charger("supabase/functions/_shared/cloud-voie.js");
const RB = await charger("src/utils/retraitsBloques.js");
const RC = await charger("src/utils/retraitsCloud.js");
const C = await charger("src/cloud/connexionsCloud.js");

let ko = 0, n = 0;
const ok = (cond, nom, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const fn = (nom) => (typeof CV[nom] === "function" ? CV[nom] : () => { throw new Error(`${nom} absente`); });
const essai = (f, ...a) => { try { return f(...a); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
const INTERDIT = /Chrome|ordinateur|computer|dès qu'il reprend|as soon as it's back/i;

const B695 = "b695d990-ad33-40be-bd04-ec8616d5f91a";
const D607 = "d607ba20-9c52-4b56-9a5f-50b73f89ca0a";
const D0AC = "d0ac0538-0dbc-4bea-8c57-1c412a07d2c4";
const F0AC = "f0acd3af-2571-4a7e-a3db-100ee3f7c867";
const MAINTENANT = "2026-11-13T08:00:00.000Z";
// Le retrait qu'une vente armerait sur l'une des 4 annonces eBay de b695d990 (publication 8be37a2d, annonce 900025128240).
const retraitB695 = { id: "00000000-b695-4000-8000-000000000001", user_id: B695, platform: "ebay", action: "delete", status: "pending", voie: "extension",
  created_at: "2026-11-13T07:00:00.000Z", inventaire_id: 1794230274891, listing_url: "https://www.ebay.fr/itm/900025128240", platform_listing_id: "900025128240",
  error: null, platform_fields: { arme_par: { le: "2026-11-13T07:00:00.000Z", pose_par: "armer_retrait_job (serveur)" } } };
const publicationD607 = { id: "00000000-d607-4000-8000-000000000001", user_id: D607, platform: "ebay", action: "publish", status: "pending", voie: "extension",
  created_at: "2026-11-13T07:00:00.000Z", inventaire_id: 1, error: null, platform_fields: {} };
const republicationD0AC = { ...publicationD607, id: "00000000-d0ac-4000-8000-000000000001", user_id: D0AC, action: "republish" };
const cloudNonRelie = { cloudVoie: true, ebayRelie: false };

console.log("[A] la règle serveur (_shared/cloud-voie.js)");
{
  const doit = fn("ebayARelierPourLeCloud");
  ok(essai(doit, retraitB695, cloudNonRelie) === true, "b695d990 : retrait eBay en file, Cloud actif, eBay non relié → à relier");
  ok(essai(doit, publicationD607, cloudNonRelie) === true, "d607ba20 : publication eBay en file → à relier");
  ok(essai(doit, republicationD0AC, cloudNonRelie) === true, "d0ac0538 : republication eBay en file → à relier");
  ok(essai(doit, { ...retraitB695, user_id: F0AC }, { cloudVoie: true, ebayRelie: true }) === false, "f0acd3af : eBay relié → jamais (l'API fait la tâche)");
  ok(essai(doit, retraitB695, { cloudVoie: false, ebayRelie: false }) === false && essai(doit, retraitB695, { cloudVoie: null, ebayRelie: false }) === false,
    "compte sans Cloud actif (faux ou illisible) → jamais : l'ordinateur garde sa tâche");
  ok(essai(doit, { ...retraitB695, voie: "api" }, cloudNonRelie) === false, "voie API → jamais");
  ok(essai(doit, { ...retraitB695, status: "processing" }, cloudNonRelie) === false, "une tâche EN COURS n'est jamais touchée");
  ok(essai(doit, { ...retraitB695, platform: "vinted" }, cloudNonRelie) === false, "Vinted (fait par le Cloud) → jamais");
  ok(essai(doit, { ...retraitB695, status: "needs_user", platform_fields: { needs_user_source: "ebay_connexion_requise" } }, cloudNonRelie) === true,
    "arrêtée sur le mur « connecte-toi à eBay dans Chrome » → le vrai geste, relier eBay");
  ok(essai(doit, { ...publicationD607, status: "needs_user", platform_fields: { needs_user_source: "champ", needsUserField: { field_key: "marque" } } }, cloudNonRelie) === false,
    "arrêtée sur une autre question (un champ) → jamais écrasée");
  const pose = essai(fn("patchEbayARelierCloud"), retraitB695, { maintenant: MAINTENANT });
  ok(pose?.status === "needs_user" && pose?.platform_fields?.needs_user_source === CV.SOURCE_EBAY_A_RELIER_CLOUD && pose?.platform_fields?.[CV.SOURCE_EBAY_A_RELIER_CLOUD]?.depuis === MAINTENANT,
    "posée : à toi de jouer, source « ebay_a_relier_cloud », datée", JSON.stringify(pose));
  ok(/[Rr]elie ton compte eBay à FillSell \(Réglages › Mes plateformes › eBay\)/.test(pose?.error ?? "") && /risque de double vente/.test(pose?.error ?? "") && !INTERDIT.test(pose?.error ?? ""),
    "retrait : « relie ton compte eBay… », risque de double vente dit, jamais l'ordinateur ni Chrome", pose?.error);
  const poseP = essai(fn("patchEbayARelierCloud"), publicationD607, { maintenant: MAINTENANT });
  ok(/[Rr]elie ton compte eBay à FillSell/.test(poseP?.error ?? "") && !/double vente/.test(poseP?.error ?? "") && !INTERDIT.test(poseP?.error ?? ""), "publication : le geste, sans parler de double vente", poseP?.error);
  ok(essai(doit, { ...retraitB695, status: "needs_user", error: pose?.error, platform_fields: pose?.platform_fields }, cloudNonRelie) === false, "déjà posée → rien réécrit (aucune ligne inchangée)");
  const archive = essai(fn("patchEbayARelierCloud"), { ...retraitB695, error: "En attente de ta connexion à eBay dans Chrome" }, { maintenant: MAINTENANT });
  ok(Array.isArray(archive?.platform_fields?.erreurs_archivees) && archive.platform_fields.erreurs_archivees.length === 1, "l'ancien message est archivé");
  const posee = { ...retraitB695, status: "needs_user", error: pose?.error, platform_fields: pose?.platform_fields };
  const lever = fn("leveeEbayARelierCloud");
  ok(essai(lever, posee, { cloudVoie: true, ebayRelie: true }) === true, "eBay relié ensuite → levée");
  ok(essai(lever, posee, { cloudVoie: false, ebayRelie: false }) === true, "Cloud plus actif → levée (l'ordinateur reprend sa tâche)");
  ok(essai(lever, posee, cloudNonRelie) === false, "toujours Cloud, toujours non relié → elle reste");
  ok(essai(lever, posee, { cloudVoie: null, ebayRelie: null }) === false, "profil illisible → rien ne bouge (jamais sur un doute)");
  const leve = essai(fn("patchLeveeEbayARelierCloud"), posee, { maintenant: MAINTENANT, motif: "ebay_relie" });
  ok(leve?.status === "pending" && leve?.error === null && !leve?.platform_fields?.needs_user_source && !leve?.platform_fields?.[CV.SOURCE_EBAY_A_RELIER_CLOUD]
    && leve?.platform_fields?.ebay_a_relier_cloud_leve?.motif === "ebay_relie", "levée : en file, message effacé, trace gardée", JSON.stringify(leve));
  for (const lang of ["fr", "en"]) {
    for (const action of ["delete", "publish", "republish"]) {
      const t = essai(fn("texteEbayARelierCloud"), action, lang);
      ok(typeof t === "string" && !INTERDIT.test(t) && (lang === "fr" ? /Réglages › Mes plateformes › eBay/ : /Settings › My platforms › eBay/).test(t), `texte ${action} (${lang}) : le geste, jamais l'ordinateur`, String(t));
    }
  }
}

console.log("\n[B] l'app : le mur « relier_ebay » (src/utils/retraitsBloques.js)");
{
  const posee = { ...retraitB695, status: "needs_user", error: "x", platform_fields: { ...retraitB695.platform_fields, needs_user_source: "ebay_a_relier_cloud", ebay_a_relier_cloud: { depuis: MAINTENANT } } };
  const fiche = { id: 1794230274891, statut: "vendu", titre: "article" };
  const r = RB.retraitsBloquesParConnexion({ jobs: [posee], fiches: [fiche], extensionVueLe: null, maintenant: Date.parse(MAINTENANT) + 3600_000 });
  ok(r.total === 1 && r.parPlateforme[0]?.mur === "relier_ebay", "retrait posé : mur « relier_ebay » (jamais « ordinateur », même sans ordinateur vu)", JSON.stringify(r.parPlateforme.map((g) => g.mur)));
  C.publierConnexionsCloud({ clientCloud: true, lu: true });
  for (const lang of ["fr", "en"]) {
    const t = RB.texteRetraitsBloques(r.parPlateforme[0], lang) ?? "";
    ok(!INTERDIT.test(t) && (lang === "fr" ? /relie ton compte eBay à FillSell \(Réglages › Mes plateformes › eBay\)/ : /connect your eBay account to FillSell \(Settings › My platforms › eBay\)/).test(t)
      && (lang === "fr" ? /risque de double vente/ : /risk of selling twice/).test(t), `bandeau (${lang}), client Cloud : le geste et le risque`, t);
    const carte = RB.ligneCarteRetraitBloque("ebay", lang, "relier_ebay") ?? "";
    ok(!INTERDIT.test(carte) && /eBay/.test(carte) && (lang === "fr" ? /Réglages › Mes plateformes › eBay/ : /Settings › My platforms › eBay/).test(carte), `carte de l'article (${lang})`, carte);
    const ar = RB.ligneARegler(r, lang) ?? {};
    ok(!INTERDIT.test(`${ar.titre} ${ar.detail}`) && (lang === "fr" ? /relie ton compte eBay à FillSell/i : /connect your eBay account to FillSell/i).test(ar.detail ?? ""), `« À régler » (${lang})`, JSON.stringify(ar));
    const articles = RB.articlesVendusEncoreEnLigne({ retraits: r, fiches: [fiche] });
    const d = RB.detailArticleVenduEnLigne(articles[0], lang) ?? "";
    ok(articles.length === 1 && articles[0].ton === "echec" && !INTERDIT.test(d) && (lang === "fr" ? /relie ton compte eBay à FillSell/i : /connect your eBay account to FillSell/i).test(d),
      `article vendu encore en ligne (${lang}) : en rouge, le geste`, d);
  }
  const mixte = RB.retraitsBloquesParConnexion({ jobs: [posee, { ...retraitB695, id: "v", platform: "vinted", listing_url: "https://www.vinted.fr/items/1", status: "pending", platform_fields: { attente_connexion: { depuis: MAINTENANT } } }],
    fiches: [fiche], extensionVueLe: null, maintenant: Date.parse(MAINTENANT) + 3600_000 });
  const am = RB.ligneARegler(mixte, "fr");
  ok(/[Rr]elie ton compte eBay à FillSell/.test(am?.detail ?? "") && /reconnecte/.test(am?.detail ?? ""), "murs mêlés : un geste par mur", JSON.stringify(am));
  C.publierConnexionsCloud({ clientCloud: false, lu: true });
  ok(!INTERDIT.test(RB.texteRetraitsBloques(r.parPlateforme[0], "fr") ?? ""), "même texte pour un compte qui n'est plus au Cloud (le marqueur est levé par le serveur)");
  ok(RC.retraitPourLeCloud(RB.ligneCarteRetraitBloque("ebay", "fr", "relier_ebay"), true) === RB.ligneCarteRetraitBloque("ebay", "fr", "relier_ebay"), "la réécriture du Cloud ne touche pas ce texte");
}

console.log("\n[C] handler-watch : la passe bornée");
{
  const hw = lire("supabase/functions/handler-watch/index.ts");
  const i = hw.indexOf("(12/11, lot « zéro problème », N3)");
  const bloc = i > 0 ? hw.slice(i, i + 6000) : "";
  ok(i > 0, "handler-watch porte la passe N3");
  ok(/from\("profiles"\)\.select\("id, ebay_voie_api"\)\.eq\("cloud_voie", true\)/.test(bloc), "lit les seuls comptes au Cloud actif (et leur drapeau eBay)");
  ok(/from\("ebay_accounts"\)\.select\("user_id"\)\.in\("user_id", [^)]+\)\.is\("revoked_at", null\)/.test(bloc), "eBay relié = drapeau ET liaison non révoquée");
  ok(/from\("cross_post_jobs"\)[\s\S]{0,300}\.eq\("platform", "ebay"\)[\s\S]{0,200}\.in\("status", \["pending", "needs_user"\]\)[\s\S]{0,200}\.limit\(\d+\)/.test(bloc), "tâches eBay en file ou arrêtées de ces comptes, bornées");
  ok(/from\("profiles"\)\.select\("id, cloud_voie, ebay_voie_api"\)\.in\("id", /.test(bloc) && /needs_user_source", SOURCE_EBAY_A_RELIER_CLOUD\)/.test(bloc), "les tâches posées sont relues pour la levée (Cloud arrêté ou eBay relié)");
  ok(/patchEbayARelierCloud\(/.test(bloc) && /patchLeveeEbayARelierCloud\(/.test(bloc) && /\.eq\("status", j\.status\)/.test(bloc), "écritures par la règle, compare-and-set sur le statut lu");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — un client Cloud à l'eBay non relié : « relie ton compte eBay à FillSell », jamais l'ordinateur`);
process.exit(ko ? 1 : 0);
