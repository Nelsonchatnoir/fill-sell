// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VERROU — LA VEILLE LIT LA PREMIÈRE PAGE DES ANNONCES RÉCENTES ET IMPORTE TOUT NUMÉRO INCONNU (14/11, bloc C2, Nico)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//   npm run selftest:veille-annonces-recentes
//   SELFTEST_BACKGROUND=<chemin d'un autre background.js> : le même verrou sur une autre version (rouge sur l'avant).
// « Veille des ventes : pendant chaque passage, lire aussi la première page des annonces les plus récentes et importer
// tout numéro inconnu. Une seule page par passage, rattachement par empreinte des photos, même mécanisme Cloud et
// extension, aucun quota, aucun doublon créé. »
// Le VRAI background.js est chargé dans un vm (patron de veille-commandes-selftest) ; les pages Vinted / Leboncoin et
// la base sont simulées (données synthétiques). La lecture Leboncoin dans la page est EXÉCUTÉE (releverLeboncoinParApi,
// fetch simulé) : on compte ses requêtes. Il verrouille :
//   1. interrupteur fermé (ou porte absente) : aucune page lue, rien écrit — la veille des commandes à l'identique ;
//   2. UNE page par passage et par plateforme : Vinted page 1 « newest_first », Leboncoin pagesMax = 1 (1 requête sur
//      une liste de 250) ;
//   3. seuls les numéros en ligne jamais vus partent à la porte ; une page déjà vue = 0 appel à la base ;
//   4. aucun doublon : seuls les INCONNUS (dit la porte) sont écrits — Vinted par le chemin du dressing (fiche
//      vinted_sync estampillée de la boutique, tâche de suivi), Leboncoin par l'écriture du relevé (run_id du relevé
//      d'une page) ; un connu n'est jamais réécrit ni renvoyé ;
//   5. la clôture passe par veille_recentes_clore (jamais « done », jamais rapprocher_releve, jamais un PATCH du run) ;
//   6. aucun quota : aucune pièce, aucun compteur, aucune publication ;
//   7. anti-robot → la plateforme coupée 24 h (plus aucune lecture) ; refus de la porte → rien mémorisé, redemandé ;
//   8. la cadence de la veille (10 min) : deux polls rapprochés = une page ;
//   9. les mesures du jour (recentes_*) dans la ligne de la veille ;
//  10. Cloud = ordinateur : la copie Cloud se construit depuis ce fichier, sans patch sur ce bloc.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
const FICHIER_BG = process.env.SELFTEST_BACKGROUND ? path.resolve(process.env.SELFTEST_BACKGROUND) : path.join(DOSSIER, "background.js");
let verts = 0;
let rouges = 0;
const ok = (titre, condition, detail = "") => {
  if (condition) { verts++; console.log(`  ✓ ${titre}`); return; }
  rouges++;
  console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ""}`);
};

const memoire = {};
function charger() {
  const rien = { addListener: () => {} };
  const local = {
    get: async (k) => (typeof k === "string" ? { [k]: memoire[k] } : Array.isArray(k) ? Object.fromEntries(k.map((x) => [x, memoire[x]])) : { ...memoire }),
    set: async (o) => { Object.assign(memoire, JSON.parse(JSON.stringify(o))); },
    remove: async (k) => { for (const x of [].concat(k)) delete memoire[x]; },
  };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto, Intl,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async (url) => { monde.fetch.push(String(url)); return { ok: true, status: 200, json: async () => [], text: async () => "[]" }; },
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
                 lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }), getPlatformInfo: async () => ({}) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local, session: aire(), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }),
              remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] },
      cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
      notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(FICHIER_BG, "utf8"), contexte, { filename: "background.js" });
  return ctx;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER = "00000000-0000-4000-8000-0000000000c2";
const TOKEN = `${b64({ alg: "HS256" })}.${b64({ sub: USER })}.sig`;
const session = { access_token: TOKEN };
const BOUTIQUE = "4400000001";
const V = (n) => String(90000000000 + n);   // numéros Vinted synthétiques (11 chiffres)

// ── Le monde simulé (données synthétiques) ─────────────────────────────────────────────────────────────────────────
const monde = {
  porte: "ouverte",          // ouverte | fermee | absente | refus
  refusMotif: "releve_en_cours",
  connus: new Set(),         // numéros que la BASE connaît déjà (fiche, tâche, écart, décision)
  runs: 0,
  vinted: { http: 200, page: [], ident: { success: true, userId: BOUTIQUE, login: "boutique_essai" }, pageReponse: null },
  lbc: { liste: [] },
  fetch: [], rest: [], ouvertures: [], clotures: [], pagesVinted: [], identites: 0, lecturesLbc: [], requetesLbc: 0,
  inventaire: [], snapshots: [], jobsCrees: [], annonces: [], capture: 0, usage: [],
};
const articleVinted = (id, statut = "active") => ({
  vinted_item_id: String(id), titre: `Article ${id}`, url: `https://www.vinted.fr/items/${id}`, prix: 12, devise: "EUR",
  marque: null, taille: null, etat: null, vues: 1, favoris: 0, statut,
  photos: [{ url: `https://images1.vinted.net/t/jeton${id}/f800/1.jpeg`, principale: true, ts: 1_763_000_000 }],
  photo_ids: [Number(id)], photo_ts: 1_763_000_000,
});
const adLbc = (id, status = "active") => ({
  list_id: id, status, subject: `Annonce ${id}`, price_cents: 1500, url: `https://www.leboncoin.fr/ad/vetements/${id}`,
  images: { urls_large: [`https://img.leboncoin.fr/api/v1/lbcpb1/images/x${id}.jpg?rule=ad-large`], thumb_url: null },
  attributes: [], first_publication_date: "2026-11-13 10:00:00",
});

const ctx = charger();
const aBloc = typeof ctx.veillerAnnoncesRecentes === "function";

// La page : l'injection dans l'onglet remplacée par la page simulée — la lecture Leboncoin, elle, est EXÉCUTÉE.
ctx.executerDansOngletPlateforme = async (platform, func, args = []) => {
  const src = String(func);
  if (platform === "vinted" && src.includes("my_orders")) return { ok: true, http: 200, commandes: [], requetes: 1 };
  if (platform === "leboncoin" && src.includes("pages/transactions")) return { ok: true, http: 200, commandes: [], requetes: 1, typeCompte: "individual" };
  if (platform === "leboncoin" && src.includes("dashboard/v1/search")) {
    monde.lecturesLbc.push(args);
    const liste = monde.lbc.liste;
    const fetchPage = async (_u, opts) => {
      monde.requetesLbc++;
      const corps = JSON.parse(opts.body);
      const ads = liste.slice(corps.offset, corps.offset + corps.limit);
      return { status: 200, json: async () => ({ ads, total: liste.length, account_stats: { active_ads: liste.length } }) };
    };
    const charge = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, account_id: "lbc-compte-1" })).toString("base64url");
    const localStorage = { getItem: (k) => (k === "luat" ? `e30.${charge}.sig` : null) };
    const document = { cookie: "lbc_user_id=lbc-compte-1" };
    const fn = new Function("fetch", "localStorage", "document", "setTimeout", "atob", "btoa", `return ${src};`)(
      fetchPage, localStorage, document, (f) => f(), ctx.atob, ctx.btoa);
    return fn(...args);
  }
  return { ok: false, motif: "inattendu" };
};
ctx.assurerJetonLeboncoin = async () => ({ ok: true, deja: true });
ctx.workTabForFetch = async () => 7;
ctx.sendMessageToTab = async (_tabId, msg) => {
  if (msg?.type === "VINTED_CURRENT_USER") { monde.identites++; return monde.vinted.ident; }
  if (msg?.type === "SYNC_DRESSING_PAGE") {
    monde.pagesVinted.push({ page: msg.page, order: msg.order ?? null, userId: msg.userId });
    if (monde.vinted.pageReponse) return monde.vinted.pageReponse;
    return { success: true, page: msg.page, articles: monde.vinted.page, pagination: { total_pages: 3, total_entries: 250 } };
  }
  return null;
};
ctx.capturerAnnonces = async (_pf, annonces) => { monde.capture += annonces.length; return { capturees: annonces.length }; };

ctx.restRequest = async (chemin, _tok, init = {}) => {
  const methode = init.method ?? "GET";
  monde.rest.push(`${methode} ${chemin.split("?")[0]}`);
  const corps = init.body ? JSON.parse(init.body) : null;
  if (chemin.startsWith("coin_config")) return [{ value: 1 }];
  if (chemin.startsWith("rpc/palier_de")) return "pro";
  if (chemin.startsWith("rpc/veille_recentes_droits")) {
    if (monde.porte === "absente") throw new Error("REST rpc/veille_recentes_droits → HTTP 404");
    return { ouverte: monde.porte !== "fermee", plateformes: ["vinted", "leboncoin"] };
  }
  if (chemin.startsWith("rpc/veille_recentes_ouvrir")) {
    monde.ouvertures.push(corps);
    if (monde.porte === "refus") return { ok: false, motif: monde.refusMotif };
    const inconnus = (corps.p_ids ?? []).filter((id) => !monde.connus.has(String(id)));
    if (!inconnus.length) return { ok: true, lues: corps.p_ids.length, inconnus: [], connus: { fiche: corps.p_ids.length } };
    monde.runs++;
    return { ok: true, lues: corps.p_ids.length, inconnus, connus: {}, run_id: `00000000-0000-4000-8000-00000000r${String(monde.runs).padStart(3, "0")}` };
  }
  if (chemin.startsWith("rpc/veille_recentes_clore")) { monde.clotures.push(corps); return { ok: true, statut: corps.p_bilan.ok ? "incomplete" : "failed" }; }
  if (chemin.startsWith("usage_logs")) { monde.usage.push(...(corps ?? [])); return null; }
  if (chemin.startsWith("inventaire?on_conflict")) {
    for (const l of corps) { monde.inventaire.push(l); monde.connus.add(String(l.vinted_item_id)); }
    return null;
  }
  if (chemin.startsWith("inventaire?")) return [];
  if (chemin.startsWith("vinted_listing_snapshots")) { monde.snapshots.push(...corps); return null; }
  if (chemin.startsWith("cross_post_jobs") && methode === "POST") { monde.jobsCrees.push(...corps); return null; }
  if (chemin.startsWith("cross_post_jobs")) return [];
  if (chemin.startsWith("annonces_plateforme?on_conflict")) {
    for (const l of corps) { monde.annonces.push(l); monde.connus.add(String(l.listing_id)); }
    return null;
  }
  if (chemin.startsWith("annonces_plateforme?select=")) return [];
  return [];
};

const etat = () => memoire.veille_commandes_etat ?? {};
const forcerEcheance = () => {
  const e = memoire.veille_commandes_etat;
  for (const pf of ["vinted", "leboncoin"]) if (e?.[pf]) e[pf].prochain = 0;
};
const raz = () => {
  for (const k of Object.keys(memoire)) delete memoire[k];
  Object.assign(monde, { fetch: [], rest: [], ouvertures: [], clotures: [], pagesVinted: [], identites: 0, lecturesLbc: [], requetesLbc: 0,
    inventaire: [], snapshots: [], jobsCrees: [], annonces: [], capture: 0, usage: [], runs: 0, connus: new Set() });
  monde.vinted.pageReponse = null;
};
const interdit = /spend_coins|coin_balance|consume_|quota|credits?_|rapprocher_releve|vinted_sync_runs/;

console.log("\n── VEILLE DES ANNONCES RÉCENTES (C2) ─────────────────────────────────────────────────────────────");
ok("le bloc existe dans background.js (veillerAnnoncesRecentes, la porte, la clôture)", aBloc
  && typeof ctx.lirePremierePageRecentes === "function" && typeof ctx.ouvrirVeilleRecentes === "function"
  && typeof ctx.cloreVeilleRecentes === "function");

console.log("\n1. Interrupteur fermé, porte absente : aucune page lue, rien écrit");
for (const porte of ["fermee", "absente"]) {
  raz(); monde.porte = porte;
  monde.vinted.page = [articleVinted(V(101))];
  monde.lbc.liste = [adLbc(3000000101)];
  await ctx.veillerCommandes(session);
  ok(`${porte} : 0 page Vinted, 0 lecture Leboncoin, 0 appel à la porte`,
    monde.pagesVinted.length === 0 && monde.lecturesLbc.length === 0 && monde.ouvertures.length === 0,
    JSON.stringify({ v: monde.pagesVinted.length, l: monde.lecturesLbc.length, o: monde.ouvertures.length }));
  ok(`${porte} : rien écrit`, monde.inventaire.length === 0 && monde.annonces.length === 0);
}

console.log("\n2. Interrupteur ouvert : UNE page par passage et par plateforme");
raz(); monde.porte = "ouverte";
monde.vinted.page = [articleVinted(V(201)), articleVinted(V(202), "draft"), articleVinted(V(203), "sold"), articleVinted(V(204))];
monde.lbc.liste = Array.from({ length: 250 }, (_, i) => adLbc(3000000000 + i, i === 1 ? "inactive" : "active"));
monde.connus = new Set([V(204), ...Array.from({ length: 250 }, (_, i) => String(3000000000 + i)).filter((x) => !["3000000000", "3000000002"].includes(x))]);
await ctx.veillerCommandes(session);
ok("Vinted : une seule page lue, la page 1, « les plus récentes d'abord », sur la boutique connectée",
  monde.pagesVinted.length === 1 && monde.pagesVinted[0].page === 1 && monde.pagesVinted[0].order === "newest_first"
  && monde.pagesVinted[0].userId === BOUTIQUE, JSON.stringify(monde.pagesVinted));
ok("Leboncoin : une seule lecture, pagesMax = 1, UNE requête sur une liste de 250", monde.lecturesLbc.length === 1
  && monde.lecturesLbc[0]?.[1] === 1 && monde.requetesLbc === 1, JSON.stringify({ l: monde.lecturesLbc, r: monde.requetesLbc }));

console.log("\n3. À la porte : les seuls numéros EN LIGNE jamais vus");
const ouvV = monde.ouvertures.find((o) => o.p_platform === "vinted");
const ouvL = monde.ouvertures.find((o) => o.p_platform === "leboncoin");
ok("Vinted : brouillon et vendue jamais envoyés (201, 204)", JSON.stringify(ouvV?.p_ids) === JSON.stringify([V(201), V(204)]), JSON.stringify(ouvV?.p_ids));
ok("Vinted : la boutique lue part avec (la porte la veut CONFIRMÉE)", ouvV?.p_compte === BOUTIQUE);
ok("Leboncoin : la page 1 (100 annonces), sans l'inactive", ouvL?.p_ids?.length === 99 && !ouvL.p_ids.includes("3000000001"), String(ouvL?.p_ids?.length));
ok("Leboncoin : le compte de la page part avec", ouvL?.p_compte === "lbc-compte-1");

console.log("\n4. Aucun doublon : seuls les INCONNUS sont écrits, par le chemin d'import d'un relevé");
ok("Vinted : une fiche, la seule inconnue (201), origine vinted_sync, estampillée de la boutique",
  monde.inventaire.length === 1 && monde.inventaire[0].vinted_item_id === V(201) && monde.inventaire[0].origine === "vinted_sync"
  && monde.inventaire[0].vinted_account_id === BOUTIQUE, JSON.stringify(monde.inventaire.map((l) => l.vinted_item_id)));
ok("Vinted : sa tâche de suivi (détection de vente), rien pour le connu",
  monde.jobsCrees.length === 1 && monde.jobsCrees[0].platform_listing_id === V(201) && monde.jobsCrees[0].status === "published");
ok("Leboncoin : les deux inconnues seulement, sous le relevé d'une page (run_id rendu par la porte)",
  monde.annonces.length === 2 && monde.annonces.every((l) => /r00\d$/.test(l.run_id) && l.statut_plateforme === "en_ligne")
  && monde.annonces.map((l) => l.listing_id).sort().join() === "3000000000,3000000002", JSON.stringify(monde.annonces.map((l) => l.listing_id)));
ok("Leboncoin : les photos de la liste capturées (aucune page ouverte)", monde.capture === 2);

console.log("\n5. La clôture : veille_recentes_clore, jamais « done », jamais rapprocher_releve");
ok("deux clôtures (une par relevé d'une page), réussies", monde.clotures.length === 2 && monde.clotures.every((c) => c.p_bilan.ok === true));
ok("l'extension n'écrit jamais elle-même un relevé (ni POST ni PATCH de vinted_sync_runs)", !monde.rest.some((r) => /vinted_sync_runs/.test(r)));
ok("jamais rapprocher_releve (il jugerait des absences sur une page)", !monde.rest.some((r) => /rapprocher_releve/.test(r)) && !monde.fetch.some((u) => /rapprocher_releve/.test(u)));

console.log("\n6. Aucun quota : aucune pièce, aucun compteur, aucune publication");
ok("aucun appel à une table ou une fonction de pièces / quotas", !monde.rest.some((r) => /spend_coins|coin_balance|consume_|quota|credit/.test(r)), monde.rest.join(" | "));
const source = fs.readFileSync(FICHIER_BG, "utf8").replace(/\r\n/g, "\n");
const debutBloc = source.indexOf("VEILLE DES ANNONCES RÉCENTES (14/11");
const finBloc = source.indexOf("async function veillerAnnoncesRecentes(");
const blocTexte = debutBloc > 0 && finBloc > debutBloc ? source.slice(debutBloc, source.indexOf("\n}\n", finBloc) + 2) : "";
ok("le bloc ne nomme aucune pièce, aucun quota, aucun relevé écrit à la main",
  blocTexte.length > 2000 && !interdit.test(blocTexte.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*\*[\s\S]*?\*\//g, "")), String(blocTexte.length));

console.log("\n7. Une page déjà vue = 0 appel à la base ; un numéro neuf = lui seul");
const avantRest = monde.rest.length;
forcerEcheance();
await ctx.veillerCommandes(session);
const restPassage2 = monde.rest.slice(avantRest);
ok("deuxième passage : une page lue par plateforme", monde.pagesVinted.length === 2 && monde.lecturesLbc.length === 2);
ok("deuxième passage : aucune porte appelée, rien écrit (page déjà vue)", !restPassage2.some((r) => /veille_recentes_ouvrir|on_conflict|inventaire|annonces_plateforme/.test(r))
  && monde.inventaire.length === 1 && monde.annonces.length === 2, restPassage2.join(" | "));
ok("identité Vinted gardée 30 min : un seul VINTED_CURRENT_USER en deux passages", monde.identites === 1);
monde.vinted.page = [articleVinted(V(205)), ...monde.vinted.page];
monde.lbc.liste = [adLbc(3000000999), ...monde.lbc.liste];
forcerEcheance();
await ctx.veillerCommandes(session);
const ouvV3 = monde.ouvertures.filter((o) => o.p_platform === "vinted").at(-1);
const ouvL3 = monde.ouvertures.filter((o) => o.p_platform === "leboncoin").at(-1);
ok("un numéro neuf Vinted : lui seul part à la porte, lui seul est écrit", JSON.stringify(ouvV3?.p_ids) === JSON.stringify([V(205)])
  && monde.inventaire.length === 2 && monde.inventaire[1].vinted_item_id === V(205), JSON.stringify(ouvV3?.p_ids));
ok("un numéro neuf Leboncoin : lui seul (et celui que la page a poussé hors de la 1re page n'est pas relu)",
  JSON.stringify(ouvL3?.p_ids) === JSON.stringify(["3000000999"]) && monde.annonces.length === 3, JSON.stringify(ouvL3?.p_ids));

console.log("\n8. La cadence de la veille : deux polls rapprochés = une page");
const pagesAvant = monde.pagesVinted.length;
await ctx.veillerCommandes(session);
ok("2 min après : aucune page relue", monde.pagesVinted.length === pagesAvant);

console.log("\n9. Un connu n'est jamais réécrit ; refus de la porte : rien mémorisé, redemandé au passage suivant");
raz(); monde.porte = "ouverte";
monde.vinted.page = [articleVinted(V(301))];
monde.lbc.liste = [];
monde.connus = new Set([V(301)]);
await ctx.veillerCommandes(session);
ok("connu (fiche, tâche ou écart) : aucune écriture, aucun relevé ouvert", monde.inventaire.length === 0 && monde.runs === 0 && monde.clotures.length === 0);
forcerEcheance();
await ctx.veillerCommandes(session);
ok("connu : jamais renvoyé à la porte", monde.ouvertures.filter((o) => o.p_platform === "vinted").length === 1);
raz(); monde.porte = "refus"; monde.refusMotif = "republication";
monde.vinted.page = [articleVinted(V(401))];
await ctx.veillerCommandes(session);
forcerEcheance();
await ctx.veillerCommandes(session);
ok("refus (republication engagée) : rien écrit, redemandé au passage suivant", monde.inventaire.length === 0
  && monde.ouvertures.filter((o) => o.p_platform === "vinted").length === 2, String(monde.ouvertures.length));
ok("refus : le motif est gardé pour le diagnostic", etat().vinted?.recentes?.dernier_motif === "republication");

console.log("\n10. Anti-robot : la plateforme coupée 24 h, plus aucune lecture");
raz(); monde.porte = "ouverte";
monde.vinted.page = [articleVinted(V(501))];
monde.vinted.pageReponse = { success: false, accesRefuse: true, httpStatus: 403, error: "403" };
await ctx.veillerCommandes(session);
ok("403 sur la page : veille Vinted coupée 24 h", Number(etat().vinted?.coupee?.jusqu) > Date.now() + 23 * 3600_000);
const lectures = monde.pagesVinted.length;
forcerEcheance();
await ctx.veillerCommandes(session);
ok("coupée : aucune page relue, rien envoyé à la porte", monde.pagesVinted.length === lectures && monde.ouvertures.filter((o) => o.p_platform === "vinted").length === 0);

console.log("\n11. Les mesures du jour (recentes_*) dans la ligne de la veille");
raz(); monde.porte = "ouverte";
monde.vinted.page = [articleVinted(V(601))];
monde.lbc.liste = [adLbc(3000000601)];
await ctx.veillerCommandes(session);
const m = etat().mesures ?? {};
ok("passages, requêtes, nouveaux, inconnus, importés comptés par plateforme",
  m.vinted?.recentes_passages === 1 && m.vinted?.recentes_requetes === 2 && m.vinted?.recentes_inconnues === 1 && m.vinted?.recentes_importees === 1
  && m.leboncoin?.recentes_passages === 1 && m.leboncoin?.recentes_requetes === 1 && m.leboncoin?.recentes_importees === 1, JSON.stringify(m));

console.log("\n12. Cloud = ordinateur : la copie Cloud se construit depuis ce fichier, sans patch sur ce bloc");
const build = fs.readFileSync(path.join(RACINE, "scripts/cloud/build-extension-cloud.mjs"), "utf8");
ok("aucun patch Cloud ne touche la veille des annonces récentes", !/veillerAnnoncesRecentes|veille_recentes|lirePremierePageRecentes/.test(build));
ok("la veille des commandes (et donc ce bloc) tourne dans le poll, Cloud compris", /await veillerCommandes\(session\)/.test(source)
  && /await veillerAnnoncesRecentes\(platform/.test(source));

console.log(rouges ? `\n✗ ${rouges} rouge(s), ${verts} vert(s)` : `\n✓ veille des annonces récentes : une page, les inconnus seulement, aucun quota (${verts} verts)`);
process.exit(rouges ? 1 : 0);
