// ═══════════════════════════════════════════════════════════════════════════
// RECRÉATION VINTED : L'ONGLET RENVOYÉ AU PROFIL NE CONCLUT RIEN, LA COPIE SE
// CHERCHE PAR-DELÀ LES BROUILLONS, AU RETRAIT LE PLUS TÔT
//   `npm run selftest:recreation-vinted-0-6-128`
// ═══════════════════════════════════════════════════════════════════════════
// 18/10/2026 (extension 0.6.128). Régis (boutique 31995881) : 7 copies du
// « Short jean Levi's » (f33d2e5d), 4 du bloc feuillet (8ab903a4). Faits :
//   · Vinted, après un dépôt réussi, redirige vers /member/<id du vendeur>
//     (plus /items/<id>) ; le content script meurt avant de répondre ;
//   · la ceinture dressing lisait la page 1, au seuil deleted_at =
//     deleted_at_serveur = 13:18:45 — daté 7 min TROP TARD (le retrait est à
//     13:11:38, heure Vinted ; la copie est née à 13:11:49) ;
//   · le dressing vu par sa propriétaire liste les BROUILLONS d'abord : Régis
//     en a 99, sa page 1 n'en portait que — ses copies étaient en page 2 ;
//   · faute de copie lue, replanifierOuArreterRecreation relançait une
//     recréation : une copie de plus à chaque passage.
// Décision de Nico : seul le NUMÉRO de l'annonce retrouvé au dressing clôt le
// job ; /member/<id> ne prouve rien, il interdit seulement de conclure à l'échec.
// Ce test exécute le VRAI background.js (vm) — fonctions pures, puis
// conclureRecreationApresSoumission de bout en bout (onglet, dressing, base
// simulés) — et lirePageDressing de vinted.js (paramètre `order`).
//   node scripts/recreation-vinted-0-6-128-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

let ongletCourant = { id: 1, url: "https://www.vinted.fr/items/new" };
function chargerBackground() {
  const rien = { addListener: () => {} };
  const aire = (m) => ({ get: async (k) => (typeof k === "string" ? { [k]: m[k] } : { ...m }), set: async (o) => { Object.assign(m, o); }, remove: async (k) => { delete m[k]; } });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"), btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire({}), session: aire({}), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }), remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ ...ongletCourant }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] }, cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} }, notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return { ctx, contexte };
}
const { ctx: B, contexte } = chargerBackground();
await new Promise((r) => setTimeout(r, 30));
const BG = lire("chrome-extension/background.js");
const iso = (s) => new Date(s).toISOString();
const ts = (s) => Math.floor(Date.parse(s) / 1000);

// Le cas réel de Régis (f33d2e5d), tel qu'en base le 18/10.
const PF_REGIS = () => ({
  vinted_item_id: "7000000001", vinted_account_id: "31995881", republish_step: "deleted",
  deleted_at: "2026-10-18T13:18:45.791Z", deleted_at_serveur: "2026-10-18T13:18:45.791Z",
  deleted_at_client: "2026-10-18T13:11:38.000Z", suppression_verdict: { date_serveur: "2026-10-18T13:11:38.000Z", http: 200 },
  recreation_tentee: { n: 1, at: "2026-10-18T13:11:20.000Z", une_passe: true },
});
const TITRE = "Short jean Levi's levi Strauss 24x32 525 8501";
const COPIE = { vinted_item_id: "7000000777", titre: TITRE, url: "https://www.vinted.fr/items/7000000777-short-jean", photo_ts: ts("2026-10-18T13:11:49Z") };

console.log("\n1. Le seuil : la date de retrait la plus TÔT, horloge Vinted d'abord");
ok(B.seuilRetraitRecreation(PF_REGIS()) === "2026-10-18T13:11:38.000Z", "Régis : min(date_serveur, client, deleted_at, serveur) = 13:11:38 (et non 13:18:45)");
ok(B.seuilRetraitRecreation({ deleted_at: "2026-10-18T10:00:05Z", deleted_at_serveur: "2026-10-18T10:00:00Z" }) === iso("2026-10-18T10:00:00Z"), "sans verdict : le plus tôt de deleted_at / deleted_at_serveur");
ok(B.seuilRetraitRecreation({ deleted_at: "pas une date" }) === null && B.seuilRetraitRecreation({}) === null && B.seuilRetraitRecreation(null) === null, "aucune date lisible → null (l'appelant garde son repli)");
{
  const avant = B.reconnaitreAnnonceRecreee([COPIE], { titre: TITRE, deletedAt: PF_REGIS().deleted_at, idsConnus: new Set() });
  const apres = B.reconnaitreAnnonceRecreee([COPIE], { titre: TITRE, deletedAt: B.seuilRetraitRecreation(PF_REGIS()), idsConnus: new Set() });
  ok(!avant.item, "AVANT (seuil deleted_at 13:18:45) : la copie de 13:11:49 n'est PAS reconnue — c'est la 2e copie de Régis");
  ok(apres.item?.vinted_item_id === COPIE.vinted_item_id, "APRÈS (seuil 13:11:38) : la copie est reconnue");
  const seuil = "2026-10-18T13:11:38.000Z";
  const a = (s) => ({ ...COPIE, photo_ts: ts(s) });
  ok(B.reconnaitreAnnonceRecreee([a("2026-10-18T13:11:36Z")], { titre: TITRE, deletedAt: seuil, idsConnus: [] }).item, "tolérance : une photo 2 s avant le seuil est reconnue (toujours ≥ seuil − 2 s)");
  ok(!B.reconnaitreAnnonceRecreee([a("2026-10-18T13:11:35Z")], { titre: TITRE, deletedAt: seuil, idsConnus: [] }).item, "…3 s avant : non");
  ok(!B.reconnaitreAnnonceRecreee([{ ...COPIE, photo_ts: null }], { titre: TITRE, deletedAt: seuil, idsConnus: [] }).item, "photo_ts absent : jamais reconnue");
  ok(!B.reconnaitreAnnonceRecreee([COPIE], { titre: TITRE, deletedAt: seuil, idsConnus: new Set([COPIE.vinted_item_id]) }).item, "id déjà suivi par l'inventaire : jamais reconnue");
  const deux = B.reconnaitreAnnonceRecreee([COPIE, { ...COPIE, vinted_item_id: "7000000778" }], { titre: TITRE, deletedAt: seuil, idsConnus: [] });
  ok(!deux.item && /2 annonces correspondent/.test(deux.raison), "deux candidates : abstention (inchangé)");
}

console.log("\n2. L'onglet renvoyé au profil du vendeur (ne prouve rien, interdit seulement de conclure à l'échec)");
ok(B.idProfilVintedDepuisUrl("https://www.vinted.fr/member/31995881") === "31995881", "/member/31995881 reconnu");
ok(B.idProfilVintedDepuisUrl("https://www.vinted.fr/member/31995881-regis?tab=closet") === "31995881", "/member/31995881-login?… reconnu");
ok(B.idProfilVintedDepuisUrl("https://www.vinted.it/member/31995881/") === "31995881", "autre domaine Vinted (vinted.it)");
ok(B.idProfilVintedDepuisUrl("https://www.vinted.fr/items/new") === null && B.idProfilVintedDepuisUrl("https://www.vinted.fr/items/7000000777") === null, "formulaire et /items/<id> : pas un profil");
ok(B.idProfilVintedDepuisUrl("https://evil.example/www.vinted.fr/member/31995881") === null && B.idProfilVintedDepuisUrl(null) === null, "hôte qui n'est pas Vinted, ou rien : null");
const ids = B.identitesBoutiqueRecreation({ vinted_account_id: "31995881" }, { platform_fields: { republish_delete_then_submit: { vinted_account_id: "31995881" } } });
ok(ids.has("31995881"), "identités du job : pf.vinted_account_id et la boutique de l'une-passe");
ok(B.depotPartiVersProfil({ url: "https://www.vinted.fr/items/new", pendingUrl: "https://www.vinted.fr/member/31995881" }, ids)?.id === "31995881", "pendingUrl /member/31995881 : dépôt réussi");
ok(B.depotPartiVersProfil({ url: "https://www.vinted.fr/member/31995881" }, ids)?.id === "31995881", "url /member/31995881 : dépôt réussi");
ok(B.depotPartiVersProfil({ url: "https://www.vinted.fr/member/555" }, ids) === null, "le profil d'une AUTRE boutique : rien conclu");
ok(B.depotPartiVersProfil({ url: "https://www.vinted.fr/items/new" }, ids) === null, "onglet resté sur le formulaire (échec) : rien conclu");
vm.runInContext('identiteVintedCache = { at: Date.now(), val: { user_id: "424242", login: "x" } };', contexte);
ok(B.identitesBoutiqueRecreation({}, {}).has("424242"), "l'identité connue du cycle compte aussi (job sans boutique)");
vm.runInContext("identiteVintedCache = { at: 0, val: null };", contexte);

console.log("\n3. La lecture du dressing : par-delà les brouillons, les annonces en ligne les plus récentes");
const SEUIL_MS = Date.parse("2026-10-18T13:11:38Z");
const article = (id, s) => ({ vinted_item_id: String(id), titre: `Article ${id}`, statut: "active", photo_ts: ts(s) });
const recents = (k, s = "2026-10-18T13:05:00Z") => Array.from({ length: 96 }, (_, i) => article(8000000000 + k * 100 + i, s));
// Les brouillons de Régis : même titre que la copie et photo récente pour
// certains — ils ne doivent JAMAIS être pris pour elle.
const brouillons = (k) => Array.from({ length: 96 }, (_, i) => ({ vinted_item_id: String(9000000000 + k * 100 + i), titre: i === 0 ? TITRE : `Brouillon ${i}`, statut: "draft", photo_ts: ts("2026-10-18T13:11:50Z") }));
ok(B.continuerLectureDressingCopie({ articles: brouillons(1) }, 1, SEUIL_MS) === true, "page qui ne porte QUE des brouillons → page suivante");
ok(B.continuerLectureDressingCopie({ articles: recents(1) }, 1, SEUIL_MS) === true, "annonces en ligne toutes récentes (13:05 ≥ seuil − 10 min) → page suivante");
ok(B.continuerLectureDressingCopie({ articles: [...recents(1).slice(0, 50), ...recents(2, "2026-10-18T12:00:00Z").slice(0, 46)] }, 1, SEUIL_MS) === false, "une annonce en ligne < seuil − 10 min → arrêt (au-delà, tout est plus ancien)");
ok(B.continuerLectureDressingCopie({ articles: [...brouillons(1).slice(0, 40), ...recents(2, "2026-10-18T12:00:00Z").slice(0, 56)] }, 1, SEUIL_MS) === false, "brouillons puis annonces anciennes : la règle d'arrêt ne regarde que les annonces en ligne");
ok(B.continuerLectureDressingCopie({ articles: [...recents(1).slice(0, 95), { vinted_item_id: "1", statut: "active", photo_ts: null }] }, 1, SEUIL_MS) === true, "une photo sans date : pas « ancienne » → on continue");
ok(B.continuerLectureDressingCopie({ articles: recents(1), pagination: { total_pages: 1 } }, 1, SEUIL_MS) === false, "dernière page (pagination) → arrêt");
ok(B.continuerLectureDressingCopie({ articles: [] }, 1, SEUIL_MS) === false, "page vide → arrêt");
ok(B.continuerLectureDressingCopie({ articles: recents(1) }, 1, NaN) === false && B.continuerLectureDressingCopie({ articles: brouillons(1) }, 1, NaN) === true, "sans seuil : la première page d'annonces en ligne suffit (aucune reconnaissance possible au-delà)");
ok(!B.reconnaitreAnnonceRecreee([{ ...COPIE, statut: "draft" }], { titre: TITRE, deletedAt: "2026-10-18T13:11:38Z", idsConnus: [] }).item, "reconnaitreAnnonceRecreee : un brouillon n'est jamais la copie");

// Le dressing simulé de Régis, tel que sa propriétaire le voit : 96 BROUILLONS
// en page 1, la copie en page 2 parmi les annonces en ligne (de la plus récente
// à la plus ancienne). L'ordre par défaut est servi sans `order`.
const messages = [];
let dressing = null;
B.sendMessageToTab = async (tabId, msg) => {
  messages.push(msg);
  if (msg.type === "VINTED_CURRENT_USER") return { success: true, userId: "31995881" };
  if (msg.type === "SYNC_DRESSING_PAGE") return dressing(msg);
  return null;
};
B.sleep = async () => {};
const COPIE_EN_LIGNE = { ...COPIE, statut: "active" };
const dressingRegis = ({ avecCopie, copieEnBrouillon = false }) => (msg) => {
  const p1 = brouillons(1);
  if (copieEnBrouillon) p1[5] = { ...COPIE, statut: "draft" };
  const pages = {
    1: p1,
    2: [...brouillons(2).slice(0, 3), ...(avecCopie ? [COPIE_EN_LIGNE] : []), ...recents(2).slice(0, 40), ...recents(3, "2026-10-18T11:00:00Z").slice(0, 52)],
    3: recents(4, "2026-10-17T10:00:00Z"),
  };
  return { success: true, page: msg.page, articles: pages[msg.page] ?? [], pagination: { total_pages: 9 } };
};
{
  dressing = dressingRegis({ avecCopie: true });
  messages.length = 0;
  const lu = await B.lireDressingPourCopie(1, "31995881", B.seuilRetraitRecreation(PF_REGIS()));
  const pagesDemandees = messages.filter((m) => m.type === "SYNC_DRESSING_PAGE");
  ok(lu.success && lu.complet && lu.pages === 2, `96 brouillons en page 1 → page 2 lue ; elle porte une annonce en ligne ancienne → arrêt — ${lu.pages} page(s)`);
  ok(pagesDemandees.every((m) => m.order === "newest_first"), "chaque page est demandée avec order=newest_first");
  ok(lu.articles.some((a) => a.vinted_item_id === COPIE.vinted_item_id), "la copie, en page 2 derrière 96 brouillons, est lue (avant : page 1 seule — jamais vue chez Régis)");
  ok(lu.brouillons === 99 && lu.articles.every((a) => a.statut !== "draft"), `les brouillons sont écartés (${lu.brouillons} vus, aucun rendu)`);
  ok(B.reconnaitreAnnonceRecreee(lu.articles, { titre: TITRE, deletedAt: B.seuilRetraitRecreation(PF_REGIS()), idsConnus: [] }).item?.vinted_item_id === COPIE.vinted_item_id,
    "…et reconnue (le brouillon au même titre, photo 13:11:50, ne fait pas une 2e candidate)");
  dressing = (msg) => ({ success: true, page: msg.page, articles: msg.page === 1 ? [COPIE_EN_LIGNE, ...recents(5, "2026-10-18T09:00:00Z").slice(0, 95)] : [] });
  const luSans = await B.lireDressingPourCopie(1, "31995881", B.seuilRetraitRecreation(PF_REGIS()));
  ok(luSans.pages === 1 && luSans.articles.some((a) => a.vinted_item_id === COPIE.vinted_item_id), "compte sans brouillon (111savagenow, tessy.galy, xxewwer) : la copie en page 1, une page lue");
  dressing = () => ({ success: true, articles: brouillons(1), pagination: { total_pages: 50 } });
  const luBrouillons = await B.lireDressingPourCopie(1, "31995881", B.seuilRetraitRecreation(PF_REGIS()));
  ok(luBrouillons.pages === 10 && luBrouillons.complet === false, "que des brouillons : 10 pages au plus, lecture dite INCOMPLÈTE");
  dressing = dressingRegis({ avecCopie: false });
  const lu2 = await B.lireDressingPourCopie(1, "31995881", B.seuilRetraitRecreation(PF_REGIS()));
  ok(lu2.success && lu2.complet && lu2.pages === 2, `sans copie : arrêt après la page 2 (annonce en ligne ancienne) — ${lu2.pages} page(s)`);
  dressing = (msg) => (msg.page === 1 ? { success: true, page: 1, articles: recents(1) } : { success: false, error: "HTTP 403" });
  const lu3 = await B.lireDressingPourCopie(1, "31995881", B.seuilRetraitRecreation(PF_REGIS()));
  ok(lu3.success && lu3.complet === false && lu3.pages === 1, "page 2 illisible : lecture PARTIELLE (complet: false) — la pré-vérification la traite comme non lue après une tentative");
  dressing = () => ({ success: false, error: "HTTP 403" });
  ok((await B.lireDressingPourCopie(1, "31995881", null)).success === false, "page 1 illisible : success false");
}

console.log("\n4. conclureRecreationApresSoumission, de bout en bout (onglet, dressing et base simulés)");
const ecritures = [];
const requetes = [];
B.updateJobStatus = async (_t, jobId, status, extra = {}) => { ecritures.push({ jobId, status, pf: JSON.parse(JSON.stringify(extra.platform_fields ?? null)), error: extra.error ?? null, listing_url: extra.listing_url ?? null }); return { ok: true }; };
B.restRequest = async (chemin, _t, init = {}) => { requetes.push({ chemin, methode: init.method ?? "GET" }); return []; };
B.decodeJwtSub = () => "user-regis";
B.preuveColisEnvoi = async () => null;
B.preuveMarqueEnvoi = async () => null;
B.vintedUploadSucceededForTitle = async () => null;
B.preuveBoutiqueVintedApresDepot = async (pf) => pf;
B.recordRecentResult = async () => {};
B.markNeedsUser = async () => {};
const CANAL_COUPE = { success: false, error: "canal coupé pendant la recréation : A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received" };
const jobR = () => ({ id: "f33d2e5d-0000-0000-0000-000000000000", inventaire_id: 42, title: TITRE, platform: "vinted", action: "republish" });
const jobRecreation = { title: TITRE, platform_fields: { vinted_account_id: "31995881" } };

{
  // A. Redirection vers le profil, copie dans le dressing (page 2) → rattachée.
  ecritures.length = 0; requetes.length = 0; messages.length = 0;
  ongletCourant = { id: 1, url: "https://www.vinted.fr/items/new", pendingUrl: "https://www.vinted.fr/member/31995881" };
  dressing = dressingRegis({ avecCopie: true });
  const pf = PF_REGIS();
  const r = await B.conclureRecreationApresSoumission("jeton", jobR(), pf, jobRecreation, 1, CANAL_COUPE);
  const fin = ecritures.at(-1);
  ok(r.status === "published" && fin?.status === "published" && fin.pf.new_vinted_item_id === COPIE.vinted_item_id, "A. profil + copie lue : le job est clos sur la copie (aucune recréation)", JSON.stringify(r));
  ok(fin.pf.depot_parti_vers_profil?.url === "https://www.vinted.fr/member/31995881", "A. la redirection est tracée (depot_parti_vers_profil)");
  ok(requetes.some((q) => /^inventaire\?id=eq\.42$/.test(q.chemin) && q.methode === "PATCH"), "A. la ligne d'inventaire reçoit le nouvel id");
  ok(requetes.filter((q) => /vinted_item_id=in\./.test(q.chemin)).every((q) => /vinted_item_id=in\.\(("\d+",?)+\)/.test(q.chemin)), "A. les ids connus sont lus PARMI ceux du dressing (.in() par lots), plus tout l'inventaire");
}
{
  // B. Redirection vers le profil, copie PAS encore visible → attente, jamais une recréation.
  ecritures.length = 0; messages.length = 0;
  ongletCourant = { id: 1, url: "https://www.vinted.fr/member/31995881" };
  dressing = dressingRegis({ avecCopie: false });
  const pf = PF_REGIS();
  const avant = Date.now();
  const r = await B.conclureRecreationApresSoumission("jeton", jobR(), pf, jobRecreation, 1, CANAL_COUPE);
  const fin = ecritures.at(-1);
  const echeance = Date.parse(fin?.pf?.next_action_after ?? "");
  ok(r.status === "skipped" && fin?.status === "pending", "B. profil sans copie lue : job 'pending' (statut « skipped »), jamais un échec", JSON.stringify(r));
  ok(fin.pf.depot_incertain?.motif === "redirection_profil_sans_copie_lue" && !!fin.pf.depot_incertain.at, "B. pf.depot_incertain = { at, motif: 'redirection_profil_sans_copie_lue' }");
  ok(echeance - avant >= 14.9 * 60_000 && echeance - avant <= 15.1 * 60_000, "B. next_action_after à +15 min");
  ok(fin.pf.recreation_retries === undefined, "B. recreation_retries n'est PAS incrémenté (avant : retentative 1/2 dans 5 min = une copie de plus)");
  ok(messages.filter((m) => m.type === "SYNC_DRESSING_PAGE" && m.page === 1).length === 2, "B. le dressing est relu une seconde fois avant de conclure");
}
{
  // C. Onglet resté sur le formulaire (vrai échec) → comportement d'avant.
  ecritures.length = 0;
  ongletCourant = { id: 1, url: "https://www.vinted.fr/items/new" };
  dressing = dressingRegis({ avecCopie: false });
  const pf = PF_REGIS();
  const r = await B.conclureRecreationApresSoumission("jeton", jobR(), pf, jobRecreation, 1, { success: false, error: "Vinted a refusé le dépôt (400)" });
  const fin = ecritures.at(-1);
  ok(r.status === "retry" && fin?.status === "pending" && fin.pf.recreation_retries === 1 && !fin.pf.depot_incertain, "C. formulaire toujours là, aucune copie : retentative comme avant (recreation_retries 1)");
}
{
  // D. Redirection vers le profil d'une AUTRE boutique : pas la signature du job.
  ecritures.length = 0;
  ongletCourant = { id: 1, url: "https://www.vinted.fr/member/555" };
  dressing = dressingRegis({ avecCopie: false });
  const r = await B.conclureRecreationApresSoumission("jeton", jobR(), PF_REGIS(), jobRecreation, 1, CANAL_COUPE);
  ok(r.status === "retry" && !ecritures.at(-1).pf.depot_parti_vers_profil, "D. profil d'une autre boutique : rien conclu de la redirection");
}
{
  // E. Décision de Nico : JAMAIS clore sur l'adresse. Profil + la copie n'existe
  //    qu'en BROUILLON (même titre, photo récente) → aucune annonce en ligne
  //    retrouvée par son numéro : le job attend, il n'est pas clos.
  ecritures.length = 0;
  ongletCourant = { id: 1, url: "https://www.vinted.fr/member/31995881" };
  dressing = dressingRegis({ avecCopie: false, copieEnBrouillon: true });
  const r = await B.conclureRecreationApresSoumission("jeton", jobR(), PF_REGIS(), jobRecreation, 1, CANAL_COUPE);
  ok(r.status === "skipped" && ecritures.every((e) => e.status !== "published") && ecritures.at(-1).pf.depot_incertain, "E. /member/<boutique> ne clôt jamais : seul le numéro d'une annonce EN LIGNE retrouvée au dressing clôt (brouillon ignoré)");
}

console.log("\n5. vinted.js — lirePageDressing(page, userId, { order })");
{
  const src = lire("chrome-extension/content-scripts/vinted.js");
  const urls = [];
  const c = vm.createContext({
    console: { log() {} }, encodeURIComponent, JSON, String, Number, Array, Math,
    estPageBotShieldVinted: () => false, entetesApiVinted: () => ({}), VINTED_ORIGINE_PAGE: "https://www.vinted.fr",
    fetchBorne: async (u) => { urls.push(u); return { status: 200, text: async () => JSON.stringify({ items: [], pagination: { total_pages: 1 } }) }; },
  });
  vm.runInContext(`${extraireFonctionJs(src, "lirePageDressing")}\n;globalThis.__f = lirePageDressing;`, c);
  await c.__f(1, "31995881");
  await c.__f(2, "31995881", { order: "newest_first" });
  await c.__f(1, "31995881", { order: "x&evil=1" });
  ok(urls[0] === "/api/v2/wardrobe/31995881/items?page=1&per_page=96", "sans order : l'URL du relevé, à la lettre", urls[0]);
  ok(urls[1] === "/api/v2/wardrobe/31995881/items?page=2&per_page=96&order=newest_first", "order=newest_first ajouté", urls[1]);
  ok(urls[2] === "/api/v2/wardrobe/31995881/items?page=1&per_page=96", "un order qui n'est pas un mot simple n'entre jamais dans l'URL", urls[2]);
  ok(/lirePageDressing\(msg\.page, msg\.userId, msg\.order \? \{ order: msg\.order \} : undefined\)/.test(src), "SYNC_DRESSING_PAGE transmet `order` s'il est fourni");
}

console.log("\n6. Ancres — l'une-passe, la pré-vérification, la réserve de la sync");
const conclure = extraireFonctionJs(BG, "conclureRecreationApresSoumission");
ok(/const versProfil = depotPartiVersProfil\(tNum, identitesBoutiqueRecreation\(pf, jobRecreation\)\);/.test(conclure) && /if \(versProfil\) return await retenirDepotIncertain\(accessToken, job, pf\);/.test(conclure)
  && conclure.indexOf("retenirDepotIncertain(") < conclure.indexOf("replanifierOuArreterRecreation("), "conclure : la redirection vers le profil ne mène jamais à replanifierOuArreterRecreation");
ok(/const aSupprime = result\?\.deleted === true \|\| marqueDeletedAt != null \|\| enBase\?\.step === "deleted";/.test(BG)
  && /const versProfilUnePasse = \(!aSupprime && result\?\.success !== true && !refusAvantRetrait\)/.test(BG)
  && /if \(versProfilUnePasse\) \{[\s\S]{0,300}return await retenirDepotIncertain\(accessToken, job, pf\);/.test(BG),
  "une-passe : l'onglet sur le profil ne prouve PAS le retrait (aSupprime inchangé) ; sans marque de retrait, le job attend le relevé au lieu du « intacte »");
ok(BG.indexOf("if (versProfilUnePasse) {") < BG.indexOf("// Transitoire (challenge DataDome, session, photos pas arrivées, canal"), "…et ce test passe avant le needs_user transitoire");
ok(/const seuilRecreation = seuilRetraitRecreation\(pf\) \?\? pf\.deleted_at \?\? null;\s*const page = await lireDressingPourCopie\(tabVerif, ident\.userId, seuilRecreation\);/.test(BG)
  && /deletedAt: seuilRecreation,/.test(BG) && /dressingLu = page\.complet === true \|\| !dejaTentee \|\| Boolean\(item\)/.test(BG),
  "pré-vérification : annonces en ligne récentes par-delà les brouillons, seuil le plus tôt ; lecture partielle après une tentative (sans copie trouvée) = dressing non lu");
ok(BG.indexOf("const dejaImportees =") > 0 && BG.indexOf("const dejaImportees =") < BG.indexOf("reconnaitreAnnonceRecreee(page.articles"), "pré-vérification : la garde « déjà importée » passe toujours avant la reconnaissance");
ok(!/type: "SYNC_DRESSING_PAGE", page: 1, userId: ident(2)?\.userId,\s*\}\)/.test(BG), "plus aucune lecture « page 1 seule » pour la recréation");
ok(/const seuilR = seuilRetraitRecreation\(j\.platform_fields\) \?\? j\.platform_fields\?\.deleted_at \?\? null;/.test(BG), "la réserve de la sync compare au même seuil");

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`✗ ${ko} échec(s)`); process.exit(1); }
console.log("✓ selftest recreation-vinted-0-6-128 : OK");
