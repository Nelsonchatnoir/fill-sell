// ═══════════════════════════════════════════════════════════════════════════
// LA LECTURE DES ANNONCES D'ORIGINE, DE BOUT EN BOUT (25/10, Louis) — `npm run selftest:lecture-page-publique`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le code LIVRÉ de l'extension (fonctions extraites de chrome-extension/background.js, script
// content-scripts/fillsell-auth.js joué dans une fausse page), pas des motifs de texte : la leçon du 25/10 est que
// le selftest de la 0.6.143 vérifiait la PRÉSENCE du lecteur de secours sans voir qu'il ne lisait jamais rien
// (restRequest rendait null à tout POST sans « return=representation », RPC comprises).
//   1. restRequest : une RPC rend toujours sa réponse ; une écriture de table sans representation rend null.
//   2. analyserPagePubliqueVinted : la page publique (JSON-LD Product + fil d'Ariane) → texte, couleur, rayon ;
//      404, 403, page de vérification, page d'une autre annonce, jeton périmé.
//   3. lireAnnoncesOrigineEnAttente : la liste du serveur est LUE, la fiche complétée, la lecture close ; un refus
//      de Vinted arrête tout 6 h.
//   4. lireFondVinted : le rattrapage au rythme servi, la mesure qui n'écrit rien.
//   5. fillsell-auth.js : une copie coupée de son extension le dit à la page (__fillsellPontMort), se tait, et ne se
//      déclare plus présente ; une copie vivante relaie FETCH_VINTED_PUBLIC ; jamais lancée deux fois.
//   6. reinjecterPontFillsell : le script réinjecté dans chaque onglet fillsell.app ouvert à la mise à jour.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = readFileSync(join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

/** Le corps d'une fonction de premier niveau de background.js (de sa déclaration à la première « } » en colonne 0). */
function extraire(nom) {
  const re = new RegExp(`\\n((?:async )?function ${nom}\\()`);
  const m = re.exec(BG);
  if (!m) throw new Error(`fonction introuvable : ${nom}`);
  const debut = m.index + 1;
  const fin = BG.indexOf("\n}\n", debut);
  if (fin < 0) throw new Error(`fin introuvable : ${nom}`);
  return BG.slice(debut, fin + 2);
}
function constante(nom) {
  const m = new RegExp(`\\nconst ${nom} = [^\\n]*\\n`).exec(BG);
  if (!m) throw new Error(`constante introuvable : ${nom}`);
  return m[0];
}

/** Un bac à sable : les fonctions extraites + des doublures, rendues par nom. */
function bac(noms, doublures = {}, prelude = "") {
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Number, String, Boolean, Array, Object, Set, Map, Promise, RegExp, encodeURIComponent, setTimeout, clearTimeout, ...doublures };
  vm.createContext(ctx);
  const code = `${prelude}\n${noms.map(extraire).join("\n")}\n;({ ${noms.join(", ")} })`;
  return vm.runInContext(code, ctx);
}

// ── 1. restRequest ─────────────────────────────────────────────────────────
console.log("1. restRequest — une RPC rend toujours sa réponse");
{
  const reponses = [];
  const fetch = async (url, init) => {
    reponses.push({ url, init });
    const r = reponses.prochaine ?? { status: 200, corps: "[]" };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => r.corps, json: async () => JSON.parse(r.corps) };
  };
  const { restRequest } = bac(["restRequest"], {
    fetch, AbortController, FILLSELL_CONFIG: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" },
    REST_DELAI_MAX_MS: 20_000, jetonFraisApres401: async () => null,
  });
  reponses.prochaine = { status: 200, corps: JSON.stringify([{ inventaire_id: 1, plateforme: "vinted", vinted_item_id: "123" }]) };
  const l = await restRequest("rpc/lectures_origine_en_attente", "t", { method: "POST", body: "{}" });
  ok(Array.isArray(l) && l.length === 1 && l[0].vinted_item_id === "123", "POST rpc/lectures_origine_en_attente (Prefer return=minimal) rend la liste", JSON.stringify(l));
  reponses.prochaine = { status: 200, corps: JSON.stringify({ ok: true, pause: true, synchro_demandee: false }) };
  const e = await restRequest("rpc/file_etat_poste", "t", { method: "POST", body: "{}" });
  ok(e?.pause === true, "POST rpc/file_etat_poste rend la pause (la pause entre deux tâches lit enfin sa réponse)");
  reponses.prochaine = { status: 200, corps: "" };
  ok(await restRequest("rpc/lecture_origine_faite", "t", { method: "POST", body: "{}" }) === null, "une RPC void (corps vide) rend null, sans exception");
  reponses.prochaine = { status: 204, corps: "" };
  ok(await restRequest("rpc/x", "t", { method: "POST", body: "{}" }) === null, "204 → null");
  reponses.prochaine = { status: 200, corps: JSON.stringify([{ id: 1 }]) };
  ok(await restRequest("inventaire?id=eq.1", "t", { method: "PATCH", body: "{}" }) === null, "une écriture de TABLE sans representation rend toujours null (inchangé)");
  ok(Array.isArray(await restRequest("inventaire?id=eq.1", "t", { method: "PATCH", body: "{}", headers: { Prefer: "return=representation" } })), "une écriture avec representation rend les lignes (inchangé)");
  ok(Array.isArray(await restRequest("inventaire?id=eq.1", "t")), "un GET rend les lignes (inchangé)");
  ok(reponses.every((r) => r.init.headers.Prefer), "l'en-tête Prefer part toujours (rien d'autre ne change à la requête)");
}

// ── 2. La page publique ────────────────────────────────────────────────────
console.log("2. analyserPagePubliqueVinted — la page publique d'une annonce");
// Forme RELEVÉE le 25/10 sur https://www.vinted.fr/items/10499143345 (louis-seller), réduite à ce qui est lu.
const produit = (id, extra = {}) => ({
  "@context": "https://schema.org", "@type": "Product", name: "coffret secret écurie de poney Playmobil",
  description: "Vendu avec tous les accessoires présents en photo\nPetit coffret qui se ferme à l'aide d'une clef présente sous le coffret",
  image: "https://images1.vinted.net/t/x/f800/b.webp", brand: { "@type": "Brand", name: "Playmobil" },
  category: "Enfants Sets de jeux", color: "Multicolore",
  offers: { "@type": "Offer", availability: "InStock", itemCondition: "UsedCondition", price: 10, priceCurrency: "EUR", url: `https://www.vinted.fr/items/${id}-coffret-secret-ecurie-de-poney-playmobil` },
  ...extra,
});
const page = (id, { p = produit(id), crumbs = [1193, 1499, 1730, 3313], status = 200, avant = "" } = {}) => ({
  ok: status >= 200 && status < 300, status, finalUrl: `https://www.vinted.fr/items/${id}`,
  html: `<html><head>${avant}<script type="application/ld+json">${JSON.stringify(p)}</script></head><body>` +
    crumbs.map((c) => `<a href="/catalog/${c}-x?referrer=item-crumbs">x</a>`).join("") + `<a href="/brand/12-playmobil">Playmobil</a></body></html>`,
});
{
  const { analyserPagePubliqueVinted } = bac(["lireFluxNextVinted", "analyserPagePubliqueVinted", "estPageBotShield"]);
  const lu = analyserPagePubliqueVinted(page("10499143345"), "10499143345");
  ok(lu.ok === true, "la page de l'annonce se lit", JSON.stringify(lu));
  ok(lu.description?.startsWith("Vendu avec tous les accessoires") && lu.description.includes("\n"), "le texte du vendeur, entier (retours à la ligne gardés)");
  ok(lu.couleur === "Multicolore" && lu.couleur2 === null, "la couleur");
  ok(lu.catalog_id === 3313 && lu.fil_ariane.join(">") === "1193>1499>1730>3313", "le rayon : la FEUILLE du fil d'Ariane (jamais le lien de marque)");
  ok(lu.marque === "Playmobil" && lu.prix === 10 && lu.disponible === true, "marque, prix, disponibilité");
  const deux = analyserPagePubliqueVinted(page("1", { p: produit("1", { color: "Noir, Blanc" }) }), "1");
  ok(deux.couleur === "Noir" && deux.couleur2 === "Blanc", "deux couleurs → couleur et couleur2");
  const vendu = analyserPagePubliqueVinted(page("2", { p: produit("2", { offers: { ...produit("2").offers, availability: "SoldOut" } }) }), "2");
  ok(vendu.ok && vendu.disponible === false, "une annonce vendue se lit aussi (disponible: false)");
  ok(analyserPagePubliqueVinted({ ok: false, status: 404, html: "<html>introuvable</html>" }, "3").motif === "introuvable", "404 → introuvable");
  ok(analyserPagePubliqueVinted({ ok: false, status: 403, html: "<html>datadome</html>" }, "3").motif === "antirobot", "403 → antirobot");
  ok(analyserPagePubliqueVinted({ ok: false, status: 429, html: "" }, "3").motif === "antirobot", "429 → antirobot");
  ok(analyserPagePubliqueVinted({ ok: true, status: 200, html: "<html><script src=\"https://geo.captcha-delivery.com/x.js\"></script></html>" }, "3").motif === "antirobot", "page de vérification (200, sans l'annonce) → antirobot");
  ok(analyserPagePubliqueVinted(page("999"), "3").motif === "page_sans_annonce", "le Product d'une AUTRE annonce n'est jamais pris pour celle-ci");
  const avecDd = analyserPagePubliqueVinted(page("4", { avant: "<script src=\"https://js.datadome.co/tags.js\"></script>" }), "4");
  ok(avecDd.ok === true, "une vraie page qui charge la balise DataDome reste lue (seule une page SANS l'annonce est un refus)");
  ok(analyserPagePubliqueVinted({ ok: true, status: 200, finalUrl: "https://www.vinted.fr/session-refresh?ref=x", html: "" }, "5").motif === "session_a_rafraichir", "jeton web périmé : rien n'est conclu");
  ok(analyserPagePubliqueVinted(page("6", { p: produit("6", { description: "" }) }), "6").description === null, "une annonce sans description se lit (description: null)");
  // Jeton web expiré (mesuré sur le poste pilote le 25/10, 14:24) : un vrai chargement, puis UNE nouvelle lecture.
  const lectures = [];
  const navigations = [];
  const sv = bac(["lirePagePubliqueVintedSousVerrou", "lireFluxNextVinted", "analyserPagePubliqueVinted", "estPageBotShield"], {
    VO: { origineVinted: () => "https://www.vinted.fr" },
    getOrCreateWorkTab: async (pf, url) => { navigations.push(url); return 1; },
    lirePageParOngletDeTravail: async (url) => {
      lectures.push(url);
      return lectures.length === 1 ? { ok: true, status: 200, finalUrl: "https://www.vinted.fr/session-refresh?ref=x", html: "" } : page("7");
    },
  });
  const r7 = await sv.lirePagePubliqueVintedSousVerrou("7");
  ok(r7.ok === true && r7.apres_rechargement === true && navigations.length === 1 && lectures.length === 2, "jeton web expiré : la page de l'annonce est chargée une fois, puis relue — et lue", JSON.stringify({ r7: r7.motif ?? "ok", navigations, lectures: lectures.length }));

  // (28/10, 0.6.149 — Petite planète, Microsoft Edge) L'onglet de travail en veille : 1 072 lectures de 20 s, toutes
  // « onglet_indisponible », du 27/10 19:43 au 28/10 02:00. Un vrai chargement de l'annonce le réveille, puis UNE relecture.
  const w = { lectures: 0, navigations: [], reminimise: 0 };
  const sw = bac(["lirePagePubliqueVintedSousVerrou", "lireFluxNextVinted", "analyserPagePubliqueVinted", "estPageBotShield"], {
    VO: { origineVinted: () => "https://www.vinted.fr" },
    getOrCreateWorkTab: async (pf, url) => { w.navigations.push(url); return 1; },
    reminimiserFenetreSiRestauree: async () => { w.reminimise++; },
    lirePageParOngletDeTravail: async () => { w.lectures++; return w.lectures === 1 ? null : page("8"); },
  });
  const r8 = await sw.lirePagePubliqueVintedSousVerrou("8");
  ok(r8.ok === true && w.navigations.length === 1 && /\/items\/8$/.test(w.navigations[0]) && w.lectures === 2 && w.reminimise === 1,
    "onglet en veille : la page de l'annonce est chargée une fois (réveil), relue — et lue ; la fenêtre de travail se re-minimise", JSON.stringify({ r8: r8.motif ?? "ok", ...w }));
  const z = { lectures: 0, navigations: 0 };
  const sz = bac(["lirePagePubliqueVintedSousVerrou", "lireFluxNextVinted", "analyserPagePubliqueVinted", "estPageBotShield"], {
    VO: { origineVinted: () => "https://www.vinted.fr" },
    getOrCreateWorkTab: async () => { z.navigations++; throw new Error("onglet de travail vinted : le content script ne répond pas"); },
    reminimiserFenetreSiRestauree: async () => {},
    lirePageParOngletDeTravail: async () => { z.lectures++; return null; },
  });
  const r9 = await sz.lirePagePubliqueVintedSousVerrou("9");
  ok(r9.ok === false && r9.motif === "onglet_indisponible" && r9.reveil === true && z.navigations === 1 && z.lectures === 1,
    "réveil impossible : « onglet_indisponible » dit tout de suite, un seul geste, jamais une boucle", JSON.stringify({ r9, ...z }));
  // Un onglet GELÉ se dit sans attendre les 20 s de l'injection.
  let injections = 0;
  const lp = bac(["lirePageParOngletDeTravail"], {
    workTabForFetch: async () => 5,
    chrome: { tabs: { get: async () => ({ id: 5, frozen: true }) }, scripting: { executeScript: async () => { injections++; return [{ result: { ok: true, status: 200, html: "" } }]; } } },
  });
  ok(await lp.lirePageParOngletDeTravail("https://www.vinted.fr/items/1", "vinted") === null && injections === 0,
    "onglet gelé (tab.frozen) : rien n'est injecté, l'appelant le réveille aussitôt");
  let injVivant = 0;
  const lv = bac(["lirePageParOngletDeTravail"], {
    workTabForFetch: async () => 5,
    chrome: { tabs: { get: async () => ({ id: 5, frozen: false }) }, scripting: { executeScript: async () => { injVivant++; return [{ result: { ok: true, status: 200, finalUrl: "u", html: "x" } }]; } } },
  });
  const pv = await lv.lirePageParOngletDeTravail("https://www.vinted.fr/items/1", "vinted");
  ok(pv?.status === 200 && injVivant === 1, "onglet éveillé : la lecture d'avant, inchangée");
}

// ── 3. et 4. Le lecteur des annonces d'origine et le rattrapage ─────────────
console.log("3. lireAnnoncesOrigineEnAttente — la liste du serveur est LUE");
function monde({ liste = [], lu = () => ({ ok: true, description: "Texte du vendeur", couleur: "Noir", catalog_id: 77, http: 200 }), servie = null, etat = { attente: 0, demande: 0, taches: 0 }, apresLecture = null } = {}) {
  // (26/10) Une horloge simulée : la lecture de fond attend 20 à 45 s entre deux pages (attendreOuCeder) — le temps avance
  // d'un coup à chaque sommeil, sans attendre pour de vrai.
  let horloge = Date.now();
  class FausseDate extends Date { constructor(...a) { super(...(a.length ? a : [horloge])); } static now() { return horloge; } }
  const appels = [];
  const stockage = {};
  const doublures = {
    restRequest: async (path, token, init = {}) => {
      appels.push({ path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
      // Comme la base : une lecture close (lecture_origine_faite) quitte la liste.
      if (path.startsWith("rpc/lectures_origine_en_attente")) {
        const closes = new Set(appels.filter((a) => a.path === "rpc/lecture_origine_faite").map((a) => String(a.body?.p_fiche)));
        return liste.filter((l) => !closes.has(String(l.inventaire_id)));
      }
      return null;
    },
    lirePagePubliqueVintedSousVerrou: async (id) => { const r = { ...lu(id), ms: 12 }; apresLecture?.(etat); return r; },
    sleep: async (ms) => { horloge += Math.max(1, Number(ms) || 0); },
    Date: FausseDate, __etat: etat,
    decodeJwtSub: () => "u1",
    FILLSELL_BUILD_ID: "test",
    tracerLectureOrigineRatee: async () => { appels.push({ path: "trace_ratee" }); },
    chrome: { storage: { local: { get: async (k) => ({ [k]: stockage[k] }), set: async (o) => Object.assign(stockage, o) } } },
  };
  // jobFlowWaiters, derniereDemandeAppMs, tachesDuCycle : lus par fondDoitCeder, pilotés de l'extérieur par `etat`.
  const prelude = `let derniereLectureOrigine = 0; let vintedPauseAntirobotServeur = false;\n${constante("LECTURE_FOND_PAUSE_KEY")}${constante("lecturesFondDuCycle")}${constante("echecsLectureOrigine")}${constante("lecturesDemandeesEnVol")}${constante("FOND_PAUSE_APRES_DEMANDE_MS")}let lectureFondServie = ${JSON.stringify(servie)};\nObject.defineProperty(globalThis, "jobFlowWaiters", { get: () => __etat.attente });\nObject.defineProperty(globalThis, "derniereDemandeAppMs", { get: () => __etat.demande });\nObject.defineProperty(globalThis, "tachesDuCycle", { get: () => __etat.taches });`;
  const f = bac(["attributsChamps", "ecrireLecturePagePublique", "lectureFondEnPause", "poserPauseLectureFond", "tracerLectureFond",
    "lectureOrigineEnRepos", "noterEchecLectureOrigine", "ordreLecturesOrigine", "marquerLectureDemandee", "lireAnnoncesOrigineEnAttente", "fondDoitCeder", "attendreOuCeder", "lireFondVinted"], doublures, prelude);
  return { f, appels, stockage, avancer: (ms) => { horloge += ms; } };
}
{
  const { f, appels } = monde({ liste: [{ inventaire_id: 42, plateforme: "vinted", vinted_item_id: "10499143345", depuis: new Date().toISOString() }] });
  await f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  const desc = appels.find((a) => a.method === "PATCH" && a.path.startsWith("inventaire?id=eq.42&or=(description.is.null"));
  ok(desc?.body?.description === "Texte du vendeur", "la description lue est posée, seulement si la fiche n'en a pas", JSON.stringify(appels.map((a) => a.path)));
  const attr = appels.find((a) => a.method === "PATCH" && a.path === "inventaire?id=eq.42");
  ok(attr?.body?.attributs?.couleur?.v === "Noir" && attr.body.attributs.couleur.source === "vinted_detail" && attr.body.attributs.categorie_vinted?.v === 77, "couleur et rayon posés en attributs (source vinted_detail : la base arbitre)");
  ok(attr?.body?.attributs?.description_source?.v === "vinted", "le texte est marqué comme celui du vendeur (description_source)");
  ok(appels.some((a) => a.path === "inventaire?id=eq.42&vinted_catalog_id=is.null" && a.body.vinted_catalog_id === 77), "le rayon Vinted posé s'il manque");
  ok(appels.some((a) => a.path === "rpc/lecture_origine_faite" && a.body.p_fiche === 42), "la lecture demandée est close");
  ok(appels.some((a) => a.path === "usage_logs" && a.body?.[0]?.feature === "lecture_fond" && a.body[0].metadata.resultat === "ok"), "chaque lecture laisse sa trace (usage_logs « lecture_fond »)");
}
{
  const { f, appels, stockage } = monde({
    liste: [1, 2].map((n) => ({ inventaire_id: n, plateforme: "vinted", vinted_item_id: String(1000 + n) })),
    lu: () => ({ ok: false, motif: "antirobot", http: 403 }),
  });
  await f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  ok(appels.filter((a) => a.path.startsWith("usage_logs")).length === 1, "un refus de Vinted arrête la série au premier article");
  ok(Number(stockage.fs_lecture_fond_pause_jusqua) > Date.now() + 5 * 3600_000, "et coupe toute lecture de fond 6 h (mémoire locale)");
  ok(!appels.some((a) => a.path === "rpc/lecture_origine_faite"), "rien n'est clos sur un refus");
  await f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  ok(!appels.slice(-1)[0] || appels.filter((a) => a.path.startsWith("rpc/lectures_origine_en_attente")).length === 1, "pendant la pause, la liste n'est même pas relue");
}
{
  const { f, appels } = monde({ liste: [{ inventaire_id: 9, plateforme: "vinted", vinted_item_id: "9" }], lu: () => ({ ok: false, motif: "introuvable", http: 404 }) });
  await f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  ok(appels.some((a) => a.path === "rpc/lecture_origine_faite"), "une annonce qui n'existe plus : l'attente est close (jamais une attente sans fin)");
}
{
  // (28/10, 0.6.149) Petite planète : trois demandes anciennes qui échouent à chaque cycle (onglet en veille), puis la
  // fiche qu'elle attend devant son téléphone. Avant : les trois anciennes d'abord, à chaque cycle — la nouvelle jamais lue.
  const t0 = Date.now();
  const iso = (minAvant) => new Date(t0 - minAvant * 60_000).toISOString();
  const liste = [
    { inventaire_id: 19, plateforme: "vinted", vinted_item_id: "19", depuis: iso(180) },
    { inventaire_id: 20, plateforme: "vinted", vinted_item_id: "20", depuis: iso(170) },
    { inventaire_id: 21, plateforme: "vinted", vinted_item_id: "21", depuis: iso(160) },
    { inventaire_id: 11, plateforme: "vinted", vinted_item_id: "11", depuis: iso(0.2) },
  ];
  const lues = [];
  const m = monde({ liste, lu: (id) => { lues.push(id); return ["19", "20", "21"].includes(id) ? { ok: false, motif: "onglet_indisponible" } : { ok: true, description: "Texte", http: 200 }; } });
  await m.f.lireAnnoncesOrigineEnAttente({ access_token: "t" });
  ok(lues.join(",") === "11,21,20", "la demande la plus RÉCENTE est lue d'abord (celle que l'écran attend), puis les autres de la plus récente à la plus ancienne", lues.join(","));
  ok(m.appels.some((a) => a.path === "rpc/lecture_origine_faite" && a.body.p_fiche === 11) && !m.appels.some((a) => a.path === "rpc/lecture_origine_faite" && a.body.p_fiche !== 11),
    "elle est lue et close ; les fiches ratées ne sont JAMAIS closes (leur texte existe peut-être)");
  const cycle = async (min) => { const n = lues.length; m.avancer(min * 60_000); await m.f.lireAnnoncesOrigineEnAttente({ access_token: "t" }); return lues.slice(n).join(","); };
  const c2 = await cycle(2);
  ok(c2 === "19", "2 min plus tard : les deux fiches ratées se reposent, la suivante passe", c2);
  const c3 = await cycle(4);
  ok(c3 === "21,20", "après 5 min de repos, les ratées du 1er cycle sont relues ; celle du 2e cycle se repose encore", c3);
  const c4 = await cycle(6);
  ok(c4 === "19", "deuxième échec : 10 min de repos (5, 10, 20, 40, puis 60 min au plus) — seule la fiche reposée repasse", c4);
  const { f: g } = monde();
  ok(g.ordreLecturesOrigine([{ inventaire_id: 1, plateforme: "vinted", vinted_item_id: "1", depuis: null }, { inventaire_id: 2, plateforme: "vinted", vinted_item_id: "2", depuis: iso(1) }, { inventaire_id: 3, plateforme: "leboncoin", vinted_item_id: null, depuis: iso(0) }]).map((l) => l.inventaire_id).join(",") === "2,1",
    "ordre : récente d'abord, sans date en dernier, jamais une autre plateforme");
}
console.log("4. lireFondVinted — le rattrapage au rythme servi");
{
  const liste = [1, 2, 3].map((n) => ({ inventaire_id: String(n), vinted_item_id: String(500 + n) }));
  const { f, appels } = monde({ servie: { actif: true, mode: "rattrapage", par_cycle: 2, ecart_s: [20, 45], liste } });
  await f.lireFondVinted({ access_token: "t" });
  ok(appels.filter((a) => a.path === "usage_logs").length === 2, "2 pages au plus par poll (par_cycle)");
  ok(appels.filter((a) => a.method === "PATCH" && /^inventaire\?id=eq\.\d+&or=/.test(a.path)).length === 2, "chaque fiche lue reçoit SON texte");
  const m = monde({ servie: { actif: true, mode: "mesure", par_cycle: 2, ecart_s: [20, 45], liste } });
  await m.f.lireFondVinted({ access_token: "t" });
  ok(m.appels.filter((a) => a.path === "usage_logs").length === 2 && !m.appels.some((a) => a.method === "PATCH"), "mode mesure : le même chemin, rien n'est écrit sur la fiche");
  const o = monde({ servie: { actif: false, raison: "pas_encore_ouvert" } });
  await o.f.lireFondVinted({ access_token: "t" });
  ok(o.appels.length === 0, "compte pas encore ouvert : aucune lecture");
  // (26/10, urgence lenteur) La lecture de fond cède la place — mesuré sur le poste de Nico : 75 s et 97 s d'attente
  // d'une lecture demandée par l'écran derrière trois pages de fond espacées de 20 à 45 s, verrou tenu.
  const s3 = { actif: true, mode: "rattrapage", par_cycle: 3, ecart_s: [20, 45], liste };
  const a = monde({ servie: s3, etat: { attente: 1, demande: 0, taches: 0 } });
  await a.f.lireFondVinted({ access_token: "t" });
  ok(!a.appels.some((x) => x.path === "usage_logs"), "un flux attend le verrou (lecture demandée, Publier maintenant) : aucune page de fond");
  const d = monde({ servie: s3, etat: { attente: 0, demande: Date.now() - 5 * 60_000, taches: 0 } });
  await d.f.lireFondVinted({ access_token: "t" });
  ok(!d.appels.some((x) => x.path === "usage_logs"), "l'app a demandé quelque chose il y a 5 min (la personne publie) : aucune page de fond");
  const t = monde({ servie: s3, etat: { attente: 0, demande: 0, taches: 2 } });
  await t.f.lireFondVinted({ access_token: "t" });
  ok(!t.appels.some((x) => x.path === "usage_logs"), "ce poll a eu des tâches : pas de lecture de fond derrière la file");
  const v = monde({ servie: s3, apresLecture: (e) => { e.attente = 1; } });
  await v.f.lireFondVinted({ access_token: "t" });
  ok(v.appels.filter((x) => x.path === "usage_logs").length === 1, "une demande arrive pendant l'attente entre deux pages : la lecture de fond s'arrête après la page en cours (le verrou est rendu)", String(v.appels.filter((x) => x.path === "usage_logs").length));
  const libre = monde({ servie: s3, etat: { attente: 0, demande: Date.now() - 11 * 60_000, taches: 0 } });
  await libre.f.lireFondVinted({ access_token: "t" });
  ok(libre.appels.filter((x) => x.path === "usage_logs").length === 3, "personne n'attend, plus de demande depuis 10 min : les 3 pages du poll, comme avant");
}

// ── 5. fillsell-auth.js ─────────────────────────────────────────────────────
console.log("5. fillsell-auth.js — le pont de la page");
const SCRIPT = readFileSync(join(RACINE, "chrome-extension/content-scripts/fillsell-auth.js"), "utf8").replace(/\r\n/g, "\n");
function fausseePage({ vivant = true } = {}) {
  const ecouteurs = [];
  const recus = [];
  const envoyes = [];
  const fenetre = {
    location: { origin: "https://fillsell.app" },
    addEventListener: (t, f) => { if (t === "message") ecouteurs.push(f); },
    removeEventListener: (t, f) => { const i = ecouteurs.indexOf(f); if (i >= 0) ecouteurs.splice(i, 1); },
    postMessage: (data) => { recus.push(data); for (const f of [...ecouteurs]) f({ source: fenetre, data }); },
  };
  const runtime = {
    get id() { return vivant ? "ext" : undefined; },
    sendMessage: (msg, cb) => { if (!vivant) throw new Error("Extension context invalidated."); envoyes.push(msg); cb?.({ success: true, ok: true, description: "x" }); },
    getManifest: () => { if (!vivant) throw new Error("Extension context invalidated."); return { version: "0.6.144" }; },
    lastError: null,
  };
  const ctx = { window: fenetre, localStorage: { length: 0, key: () => null, getItem: () => null }, chrome: { runtime }, console: { log() {} }, setTimeout: () => 0, clearTimeout: () => {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { ctx, fenetre, recus, envoyes, ecouteurs, jouer: () => vm.runInContext(SCRIPT, ctx), basculer: (v) => { vivant = v; } };
}
{
  const p = fausseePage({ vivant: true });
  p.jouer();
  ok(p.recus.some((d) => d.__fillsellExt), "une copie vivante s'annonce à l'injection");
  p.fenetre.postMessage({ __fillsellCmd: "FETCH_VINTED_PUBLIC", vintedItemId: "10499143345" });
  ok(p.envoyes.some((m) => m.type === "FETCH_VINTED_PUBLIC" && m.vintedItemId === "10499143345"), "FETCH_VINTED_PUBLIC est relayé à l'extension");
  ok(p.recus.some((d) => d.__fillsellAnnoncePublique?.vintedItemId === "10499143345"), "la réponse revient à la page sous __fillsellAnnoncePublique");
  const n = p.ecouteurs.length;
  p.jouer();
  ok(p.ecouteurs.length === n, "réinjectée dans le même monde isolé : elle ne se lance pas deux fois");
  // L'extension se met à jour : cette copie est coupée.
  p.basculer(false);
  const avant = p.recus.length;
  p.fenetre.postMessage({ __fillsellPing: true });
  ok(!p.recus.slice(avant).some((d) => d.__fillsellExt), "coupée, elle ne se déclare plus présente au ping");
  p.fenetre.postMessage({ __fillsellCmd: "FETCH_VINTED_ITEM", vintedItemId: "1" });
  ok(p.recus.some((d) => d.__fillsellPontMort?.cmd === "FETCH_VINTED_ITEM"), "coupée, elle DIT à la page que le pont est mort (__fillsellPontMort)");
  const morts = p.recus.filter((d) => d.__fillsellPontMort).length;
  p.fenetre.postMessage({ __fillsellCmd: "FETCH_VINTED_ITEM", vintedItemId: "2" });
  ok(p.recus.filter((d) => d.__fillsellPontMort).length === morts, "puis se tait (elle a retiré son écoute)");
}

// ── 6. La réinjection à la mise à jour ──────────────────────────────────────
console.log("6. reinjecterPontFillsell — à chaque installation ou mise à jour");
{
  const injectes = [];
  const chrome = {
    tabs: { query: async (q) => (q.url === "https://fillsell.app/*" ? [{ id: 1 }, { id: 2, discarded: true }, { id: 3 }] : []) },
    scripting: { executeScript: async ({ target, files }) => { if (target.tabId === 3) throw new Error("onglet fermé"); injectes.push({ tab: target.tabId, files }); return []; } },
  };
  const { reinjecterPontFillsell } = bac(["reinjecterPontFillsell"], { chrome });
  const n = await reinjecterPontFillsell("update");
  ok(n === 1 && injectes.length === 1 && injectes[0].tab === 1 && injectes[0].files[0] === "content-scripts/fillsell-auth.js", "le script est réinjecté dans les onglets fillsell.app ouverts (déchargé ou fermé : sans conséquence)", JSON.stringify(injectes));
  ok(/chrome\.runtime\.onInstalled\.addListener\(\(details\) => \{\s*if \(details\?\.reason !== "update" && details\?\.reason !== "install"\) return;\s*reinjecterPontFillsell\(details\.reason\)/.test(BG), "branché sur onInstalled (install et update)");
  ok(/FETCH_VINTED_PUBLIC/.test(SCRIPT) && /msg\?\.type === "FETCH_VINTED_PUBLIC"/.test(BG), "la commande existe des deux côtés du pont");
  const poll = BG.slice(BG.indexOf("async function pollAndProcessJobsUnlocked"), BG.indexOf("await recoverMissingListingUrls(session)"));
  ok(/lecturesFondDuCycle\.clear\(\)/.test(poll) && /await lireFondVinted\(session\)/.test(poll), "le rattrapage tourne à la fin du poll, une fiche jamais deux fois par cycle");
  ok(/lectureFondServie = rep\.lecture_fond/.test(BG), "la règle du rattrapage vient du serveur (get-pending-jobs → lecture_fond)");
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} lecture-page-publique : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
