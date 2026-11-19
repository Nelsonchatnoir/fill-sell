// ═══════════════════════════════════════════════════════════════════════════
// Selftest VERROU « LE HUB VENDEUR eBAY RENVOIE VERS /sh/landing » (19/11, ordre de Nico — priorité rouge)
//   node scripts/ebay-releve-hub-selftest.mjs
//
// LE CAS : depuis le 17/11, 27 relevés eBay par l'extension en échec sur 8 comptes qui ont des annonces
// (90ace0e4, d5531b8e, 7e436336, 36b3c8c0, 2f4383e9, 4d946500, e383895d, 963630d0) : « le Hub vendeur n'a pas rendu son
// compteur « annonces en cours » … page lue : /sh/landing (hors « Mes annonces ») », 0 annonce lue. Même échec sur le
// build ba13a51 qui réussissait le 16/11. Lu le 19/11 dans le Chrome de Nico : /sh/lst/active RENVOIE vers /sh/landing
// (eBay n'ouvre plus le Hub vendeur aux comptes qui ne l'ont pas activé) ; « Mon eBay › En cours » (/mys/active)
// répond : pastille « Tout (N) - Sélectionné », une ligne div.active-item[qa-id="active-item-<numéro>"] par annonce.
//
// Ce test REJOUE les pages (fixtures HTML minimales reconstituées, anonymisées : numéros 9000000000xx fictifs) dans
// un DOM minimal, avec la fonction de page RELUE À LA SOURCE (chrome-extension/background.js) :
//   1. /sh/landing reste hors de « Mes annonces » (aucun lien lu) — et le relevé part alors vers /mys/active ;
//   2. « Mon eBay › En cours » se lit : compteur « Tout (N) », lignes div.active-item seules (jamais un lien /itm/
//      d'un autre vendeur ailleurs dans la page), numéro recoupé, titre, prix ;
//   3. INCOMPLET ≠ DISPARU : compteur absent, ambigu, changé, ou moins de lignes que N → jamais complet ;
//   4. le branchement dans releverAnnoncesPlateforme (Hub d'abord, repli Mon eBay, couverture jugée sur Mon eBay).
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").split("\r\n").join("\n");
let ko = 0;
const check = (nom, ok, extra = "") => { if (ok) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom} ${extra}`); } };

// ── Un DOM minimal (pas de dépendance) : analyseur HTML de fixtures bien formées + sélecteurs simples ─────────────
const VIDES = new Set(["img", "br", "input", "meta", "link", "hr"]);
const decoder = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
class Noeud {
  constructor(tag, attrs, parent) { this.tagName = tag.toUpperCase(); this.attrs = attrs; this.parentElement = parent; this.enfants = []; }
  get children() { return this.enfants.filter((e) => e instanceof Noeud); }
  get textContent() { return this.enfants.map((e) => (typeof e === "string" ? e : e.textContent)).join(""); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  get href() { return this.getAttribute("href"); }
  *descendants() { for (const e of this.children) { yield e; yield* e.descendants(); } }
  querySelectorAll(sel) { const l = parserListe(sel); return [...this.descendants()].filter((e) => l.some((s) => correspond(e, s))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) { const l = parserListe(sel); for (let n = this; n; n = n.parentElement) if (l.some((s) => correspond(n, s))) return n; return null; }
  // Pour le retrait rejoué (section 5) : attributs modifiables, détachement, clics simulés, style « display ».
  get nodeType() { return 1; }
  get classList() { const c = String(this.getAttribute("class") ?? "").split(/\s+/); return { contains: (x) => c.includes(x) }; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  remove() { if (this.parentElement) { this.parentElement.enfants = this.parentElement.enfants.filter((e) => e !== this); this.parentElement = null; } }
  dispatchEvent(ev) { if (ev?.type === "click") this.__clic?.(); return true; }
  scrollIntoView() {}
  set texte(v) { this.enfants = [String(v)]; }
}
function parserHtml(html) {
  const racine = new Noeud("#document", new Map(), null);
  let cour = racine;
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) { for (let n = cour; n && n !== racine; n = n.parentElement) if (n.tagName === m[1].toUpperCase()) { cour = n.parentElement; break; } continue; }
    if (m[2]) {
      const attrs = new Map();
      const ra = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a; while ((a = ra.exec(m[3] ?? ""))) attrs.set(a[1], decoder(a[2] ?? a[3] ?? a[4] ?? ""));
      const el = new Noeud(m[2], attrs, cour);
      cour.enfants.push(el);
      if (!VIDES.has(m[2].toLowerCase()) && !/\/>$/.test(m[0])) cour = el;
      continue;
    }
    if (m[4]) cour.enfants.push(decoder(m[4]));
  }
  return racine;
}
function parserListe(sel) { return sel.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+(?![^[]*\])/).map(parserCompose)); }
function parserCompose(c) {
  const m = c.match(/^(\*|[a-zA-Z][\w-]*)?((?:[.#][\w-]+|\[[^\]]+\])*)$/);
  if (!m) throw new Error(`sélecteur non pris en charge par le DOM du test : ${c}`);
  const parts = { tag: m[1] && m[1] !== "*" ? m[1].toUpperCase() : null, classes: [], id: null, attrs: [] };
  for (const p of m[2].match(/[.#][\w-]+|\[[^\]]+\]/g) ?? []) {
    if (p[0] === ".") parts.classes.push(p.slice(1));
    else if (p[0] === "#") parts.id = p.slice(1);
    else { const a = p.slice(1, -1).match(/^([\w-]+)(?:([\^*$]?=)["']?([^"']*)["']?)?$/); parts.attrs.push({ nom: a[1], op: a[2] ?? null, val: a[3] ?? "" }); }
  }
  return parts;
}
function correspondCompose(el, p) {
  if (!(el instanceof Noeud) || el.tagName === "#DOCUMENT") return false;
  if (p.tag && el.tagName !== p.tag) return false;
  if (p.id && el.getAttribute("id") !== p.id) return false;
  const cls = String(el.getAttribute("class") ?? "").split(/\s+/);
  if (p.classes.some((c) => !cls.includes(c))) return false;
  for (const a of p.attrs) {
    const v = el.getAttribute(a.nom);
    if (v === null) return false;
    if (a.op === "=" && v !== a.val) return false;
    if (a.op === "^=" && !v.startsWith(a.val)) return false;
    if (a.op === "*=" && !v.includes(a.val)) return false;
    if (a.op === "$=" && !v.endsWith(a.val)) return false;
  }
  return true;
}
function correspond(el, chaine) {
  if (!correspondCompose(el, chaine[chaine.length - 1])) return false;
  let i = chaine.length - 2;
  for (let n = el.parentElement; n && i >= 0; n = n.parentElement) if (correspondCompose(n, chaine[i])) i--;
  return i < 0;
}
function pageDe(html, chemin) {
  const racine = parserHtml(html);
  const body = racine.querySelector("body") ?? racine;
  const document = {
    readyState: "complete", body, documentElement: { scrollHeight: 2000 },
    querySelectorAll: (s) => racine.querySelectorAll(s), querySelector: (s) => racine.querySelector(s),
  };
  const location = { pathname: chemin, hostname: "www.ebay.fr", href: `https://www.ebay.fr${chemin}` };
  const window = { scrollTo() {}, innerHeight: 800 };
  return { document, location, window };
}

// ── La fonction de page, relue à la source ──────────────────────────────────────────────────────────────────────
function extraireFonction(nom) {
  const i = src.indexOf(`async function ${nom}(`) >= 0 ? src.indexOf(`async function ${nom}(`) : src.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let p = src.indexOf("{", src.indexOf(")", i));
  for (let prof = 0, j = p; j < src.length; j++) {
    if (src[j] === "{") prof++;
    else if (src[j] === "}" && --prof === 0) return src.slice(i, j + 1);
  }
  return null;
}
const srcLecteur = extraireFonction("lireMonEbayEnCoursDansPage");
const srcVerdict = extraireFonction("verdictMonEbayEnCours");
const lire = async (html, chemin, attente = 300) => {
  if (!srcLecteur) return null;
  const { document, location, window } = pageDe(html, chemin);
  const f = new Function("document", "location", "window", `${srcLecteur}; return lireMonEbayEnCoursDansPage;`)(document, location, window);
  return f(attente);
};
const verdict = srcVerdict ? new Function(`${srcVerdict}; return verdictMonEbayEnCours;`)() : null;

// ── Fixtures (reconstituées d'après la lecture du 19/11 ; numéros et titres fictifs) ───────────────────────────
const ligne = (id, titre, prix, { lienAutre = null } = {}) => `
  <div class="active-item" qa-id="active-item-${id}">
    <div class="item__image"><a href="https://www.ebay.fr/itm/${lienAutre ?? id}"><img src="https://i.ebayimg.com/images/g/test/s-l225.jpg" alt=""></a></div>
    <div class="item__info">
      <div class="item-title"><a href="https://www.ebay.fr/itm/${lienAutre ?? id}">${titre}</a></div>
      <div class="item__itemid">Numéro de l'objet : ${id}</div>
      <div class="item__itemid_quantity">Quantité disponible : 1</div>
      <div class="item__price"><span>${prix}</span></div>
      <div class="item__listing-status">En cours</div>
      <div class="item__time-left">29 j 23 h</div>
    </div>
    <div class="fake-menu"><button aria-label="Plus d'actions">…</button>
      <div class="fake-menu__items"><a href="https://www.ebay.fr/sl/list?mode=SellLikeItem&amp;itemId=${id}">Vendre un objet similaire</a><button>Terminer la vente</button></div>
    </div>
  </div>`;
const pastilles = (n) => `
  <ul class="carousel__list">
    <li class="carousel__snap-point"><button class="me-carousel__pill selected" aria-pressed="true">Tout (${n}) - Sélectionné</button></li>
    <li class="carousel__snap-point"><button class="me-carousel__pill">Offres reçues (0)</button></li>
  </ul>`;
const recos = `<section class="recos"><h2>Objets sponsorisés</h2><a href="https://www.ebay.fr/itm/811111111111">Objet d'un autre vendeur</a>
  <a href="https://www.ebay.fr/itm/822222222222"><img src="https://i.ebayimg.com/x.jpg" alt=""> 5,00 EUR</a></section>`;
const page = (corps) => `<html><head><title>Mon eBay : En cours</title></head><body><header>Bonjour Testeur ! Mon eBay</header><h1>En cours</h1>${corps}</body></html>`;
const ids = (n, depart = 1) => Array.from({ length: n }, (_, k) => `9000000000${String(depart + k).padStart(2, "0")}`);
const SIX = ids(6);
const pageSix = page(pastilles(6) + SIX.map((id, k) => ligne(id, `Article de test ${k + 1}`, `${8 + k},00 EUR`)).join("") + recos);
const LANDING = `<html><body><header>Bonjour Testeur ! Mon eBay</header><h1>Hub vendeur eBay</h1>
  <p>Découvrez comment vendre plus facilement. Le Hub vendeur eBay vous permet de gérer vos activités</p>
  <a href="https://www.ebay.fr/sh/landing?start=1">Commencer à utiliser</a>${recos}</body></html>`;

console.log("\n1. La page qui casse : /sh/landing n'est pas « Mes annonces », et le relevé part alors vers « Mon eBay › En cours »");
{
  const bloc = src.slice(src.indexOf("const CHEMIN_LISTE_DU_COMPTE = {"));
  const CHEMIN = new Function(`${bloc.slice(0, bloc.indexOf("};") + 2)}; return CHEMIN_LISTE_DU_COMPTE;`)();
  check("le Hub /sh/lst/active reste le chemin de la lecture générique", CHEMIN.ebay.test("/sh/lst/active"));
  check("/sh/landing est HORS de « Mes annonces » (aucun lien de la page lu)", !CHEMIN.ebay.test("/sh/landing"));
  check("la lecture générique (liens /itm/ de toute la page) n'est JAMAIS ouverte à /mys/active", !CHEMIN.ebay.test("/mys/active"));
  check("le Hub reste lu d'abord (RELEVE_PAGES.ebay = /sh/lst/active?limit=200&offset=0)",
    src.includes('ebay: [{ url: "https://www.ebay.fr/sh/lst/active?limit=200&offset=0", statut: "en_ligne" }]'));
  check("l'adresse de repli est « Mon eBay › En cours » (MON_EBAY_EN_COURS_URL)", src.includes('const MON_EBAY_EN_COURS_URL = "https://www.ebay.fr/mys/active";'));
  const r = await lire(LANDING, "/sh/landing");
  check("lue par le lecteur Mon eBay, /sh/landing rend « hors liste » et 0 annonce (les liens sponsorisés ne sont pas lus)",
    r && r.surLaListe === false && r.horsListe === "/sh/landing" && r.annonces.length === 0, JSON.stringify(r)?.slice(0, 200));
}

console.log("\n2. « Mon eBay › En cours » se lit (6 annonces, pastille « Tout (6) - Sélectionné »)");
{
  const r = await lire(pageSix, "/mys/active");
  check("le lecteur existe (lireMonEbayEnCoursDansPage)", !!srcLecteur);
  check("sur la liste, compteur 6", r?.surLaListe === true && r?.total === 6, JSON.stringify({ s: r?.surLaListe, t: r?.total }));
  check("6 annonces lues, les numéros des lignes", r?.annonces?.length === 6 && SIX.every((id) => r.annonces.some((a) => a.listing_id === id)));
  check("aucun lien /itm/ hors des lignes (objets sponsorisés 811…, 822…)", r && !r.annonces.some((a) => /^8[12]{2}/.test(a.listing_id)));
  const a1 = r?.annonces?.find((a) => a.listing_id === SIX[0]);
  check("titre lu dans .item-title", a1?.titre === "Article de test 1", a1?.titre);
  check("prix « 8,00 EUR » lu 8 (feuille .item__price)", a1?.prix === 8, String(a1?.prix));
  check("adresse canonique /itm/<numéro>, statut en ligne", a1?.url === `https://www.ebay.fr/itm/${SIX[0]}` && a1?.statut === "en_ligne");
  const rf = await lire(pageSix, "/mys/active/rf/container_sort=TIME_LEFT_NEWLY_LISTED&container_filter=ALL&container_limit=200");
  check("l'adresse filtrée que la page construit (/mys/active/rf/…) est aussi « En cours »", rf?.surLaListe === true && rf?.annonces?.length === 6);
  const v = verdict ? verdict({ ...r, lues: r?.annonces?.length }) : null;
  check("verdict : COMPLET (6 lignes lues = Tout (6))", v?.rendue === true && v?.complet === true && v?.total === 6, JSON.stringify(v));
}

console.log("\n3. INCOMPLET ≠ DISPARU");
{
  const vingtCinq = ids(25);
  const p30 = page(pastilles(30) + vingtCinq.map((id, k) => ligne(id, `Objet ${k + 1}`, "5,00 EUR")).join(""));
  const r30 = await lire(p30, "/mys/active");
  check("« Tout (30) » et 25 lignes : 25 lues, compteur 30", r30?.annonces?.length === 25 && r30?.total === 30);
  const v30 = verdict?.({ ...r30, lues: r30?.annonces?.length });
  check("… verdict INCOMPLET (25 sur 30), total gardé pour le juge", v30?.complet === false && v30?.rendue === true && v30?.total === 30, JSON.stringify(v30));

  const sansPastille = page(SIX.slice(0, 3).map((id, k) => ligne(id, `Objet ${k}`, "5,00 EUR")).join(""));
  const rs = await lire(sansPastille, "/mys/active");
  check("sans pastille « Tout (N) » : lignes lues, compteur null", rs?.annonces?.length === 3 && rs?.total === null);
  const vs = verdict?.({ ...rs, lues: rs?.annonces?.length });
  check("… verdict INCOMPLET, couverture inconnue (total null)", vs?.complet === false && vs?.total === null && vs?.rendue === true, JSON.stringify(vs));

  const ambigu = page(`<ul><li class="carousel__snap-point"><button class="me-carousel__pill selected">Tout (6) - Sélectionné</button></li></ul>
    <ul><li class="carousel__snap-point"><button class="me-carousel__pill">Tout (9)</button></li></ul>` + SIX.map((id) => ligne(id, "Objet", "5,00 EUR")).join(""));
  const ra = await lire(ambigu, "/mys/active");
  check("deux « Tout (N) » qui se contredisent : compteur null (on ne choisit pas)", ra?.total === null, String(ra?.total));

  const contradiction = page(pastilles(2) + ligne(SIX[0], "Objet A", "5,00 EUR") + ligne(SIX[1], "Objet B", "5,00 EUR", { lienAutre: "833333333333" }));
  const rc = await lire(contradiction, "/mys/active");
  check("une ligne dont qa-id et lien se contredisent n'est PAS lue (1 lue, 1 illisible)", rc?.annonces?.length === 1 && rc?.illisibles === 1, JSON.stringify({ n: rc?.annonces?.length, i: rc?.illisibles }));
  check("… et le verdict reste INCOMPLET (1 sur 2)", verdict?.({ ...rc, lues: rc?.annonces?.length })?.complet === false);

  const vide = page(pastilles(0) + "<p>Aucun objet en vente</p>");
  const rv = await lire(vide, "/mys/active");
  const vv = verdict?.({ ...rv, lues: rv?.annonces?.length });
  check("« Tout (0) » : la page DIT vide, total laissé au juge du compte vide (null) — jamais « complet à 0 » d'office",
    rv?.total === 0 && vv?.pageDitVide === true && vv?.total === null && vv?.complet === false, JSON.stringify(vv));

  check("page de connexion : non rendue, incomplet", verdict?.({ connexion: true })?.rendue === false && verdict?.({ connexion: true })?.complet === false);
  check("hors « En cours » : non rendue, incomplet", verdict?.({ surLaListe: false, horsListe: "/sh/landing" })?.rendue === false);
  check("compteur changé entre deux pages : incomplet, total null", (() => { const x = verdict?.({ surLaListe: true, total: 30, lues: 30, compteurInstable: true }); return x?.complet === false && x?.total === null; })());
  check("lecture absente (script sans résultat) : non rendue", verdict?.(null)?.rendue === false);
}

console.log("\n4. Le branchement dans releverAnnoncesPlateforme");
{
  const fn = src.slice(src.indexOf("async function releverAnnoncesPlateforme("));
  const corps = fn.slice(0, fn.indexOf("\n}\n"));
  check("repli Mon eBay quand le Hub n'a pas rendu son compteur (ni compteur, ni phrase de vide)",
    /platform === "ebay" && dernierTabId != null && !Number\.isFinite\(ebayTotalEnCours\) && !pageDitVide\)/.test(corps) && corps.includes("await releverMonEbayEnCours(dernierTabId)"));
  check("le repli passe APRÈS le rechargement unique du Hub muet", corps.indexOf("await chrome.tabs.reload(dernierTabId)") < corps.indexOf("await releverMonEbayEnCours(dernierTabId)"));
  check("la couverture eBay se juge sur les lignes de Mon eBay quand c'est lui qui a été lu",
    /comptees: ebayMonEbayLues \?\? annonces\.size/.test(corps));
  check("la page hors liste du Hub (/sh/landing) ne compte plus contre la liste QUE si Mon eBay a rendu la sienne",
    /if \(vMonEbay\.rendue\) \{[\s\S]{0,1500}pagesHorsListe\.length = 0;/.test(corps));
  check("le libellé lu par le serveur (releve_hors_liste) est inchangé",
    corps.includes(`absent: "le Hub vendeur n'a pas rendu son compteur « annonces en cours »"`));
  check("le mur de connexion de Mon eBay se nomme comme celui du Hub (sondes, « absente »)",
    /lu\?\.connexion === true && annonces\.size === 0/.test(corps));
  check("la trace Mon eBay est écrite dans le run (défilement)", corps.includes("ebayMonEbayTrace"));
}

console.log("\n5. Le retrait par « Mon eBay › En cours » (fenêtre RELEVÉE EN VRAI le 19/11 sur l'annonce de test de Nico)");
{
  const ebay = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/ebay.js"), "utf8").split("\r\n").join("\n");
  const extraireDe = (texte, nom) => {
    const i = texte.indexOf(`async function ${nom}(`) >= 0 ? texte.indexOf(`async function ${nom}(`) : texte.indexOf(`function ${nom}(`);
    if (i < 0) return null;
    const p = texte.indexOf("{", texte.indexOf(")", i));
    for (let prof = 0, j = p; j < texte.length; j++) {
      if (texte[j] === "{") prof++;
      else if (texte[j] === "}" && --prof === 0) return texte.slice(i, j + 1);
    }
    return null;
  };
  check("mode « terminer » (le vrai retrait)", /const RETRAIT_MON_EBAY_MODE = "terminer";/.test(ebay));
  check("ebay.js passe par ce chemin sur /mys/active seulement", /if \(\/\^\\\/mys\\\/active\(\?:\\\/\|\$\)\/i\.test\(location\.pathname\)\) return deleteListingMonEbay\(job, trace, t\);/.test(ebay));
  const srcRetrait = extraireDe(ebay, "deleteListingMonEbay");
  const constantes = ["SEL_ITEMS_MENU_EBAY", "RETRAIT_MON_EBAY_MODE", "FIN_MON_EBAY_REVUE_MS"]
    .map((c) => (ebay.match(new RegExp(`^const ${c} = [^\\n]*;$`, "m")) || [""])[0]).join("\n");
  const aides = ["texteDe", "estVisibleSansLayout", "estLibelleFinAnnonce", "realClick"].map((n) => extraireDe(ebay, n) ?? "").join("\n");
  // La page filtrée par le numéro, reconstituée d'après la lecture réelle du 19/11 (numéros et titre fictifs).
  const N = "900000000077";
  const pageRetrait = ({ autreLien = null, dialogueAutreNumero = false, ouvreFenetre = true, total = 1, ligne = true, rendue = true } = {}) => `<html><body>
    <header><div class="gh-identity__dialog" role="dialog">Chargement en cours…</div></header>
    ${rendue ? `<ul class="carousel__list"><li class="carousel__snap-point"><button class="me-carousel__pill selected">Tout (${total}) - Sélectionné</button></li></ul>` : ""}
    ${ligne ? `<div class="active-item" qa-id="active-item-${N}">
      <a href="https://www.ebay.fr/itm/${autreLien ?? N}"><img src="https://i.ebayimg.com/x.jpg"></a>
      <div class="item-title"><a href="https://www.ebay.fr/itm/${N}">TEST FillSell NE PAS ACHETER</a></div>
      <div class="item__itemid">${N}</div>
      <span class="fake-menu-button item__inline-cta">
        <button class="fake-menu-button__button btn btn--secondary" aria-label="Autres options - TEST FillSell NE PAS ACHETER" aria-expanded="false" aria-controls="nid-7-content">…</button>
        <div id="nid-7-content" style="display:none"><ul class="fake-menu__items">
          <li><button class="fake-menu-button__item">Modifier</button></li>
          <li><button class="fake-menu-button__item">Partager l'annonce</button></li>
          <li><button class="fake-menu-button__item">Afficher l'historique du trafic</button></li>
          <li><button class="fake-menu-button__item">Terminer la vente</button></li>
        </ul></div>
      </span>
    </div>` : ""}
    <div class="lightbox-dialog me-end-listing-modal-wrapper me-dialog" role="dialog" aria-modal="true" style="display:none"${ouvreFenetre ? "" : " data-muet=\"1\""}>
      <div class="lightbox-dialog__window"><button class="icon-btn lightbox-dialog__close" aria-label="Close">×</button>
        <div class="lightbox-dialog__main"><div class="me-dialog__content"><div class="se-end-listing">
          <h2>Mettre fin à l'annonce</h2><p>Voulez-vous vraiment mettre fin à cette annonce ?${dialogueAutreNumero ? " (800000000099)" : ""}</p>
          <button class="fake-link">Donnez votre avis</button>
          <div class="se-end-listing__footer-actions"><button class="btn btn--secondary">Annuler</button><button class="btn btn--primary">Mettre fin à l'annonce</button></div>
        </div></div></div>
      </div>
    </div></body></html>`;
  const rejouer = async (opts = {}, platformFields = {}) => {
    const racine = parserHtml(pageRetrait(opts));
    const q = (s) => racine.querySelector(s);
    const clics = { declencheur: 0, terminer: 0, confirmer: 0, annuler: 0, identite: 0 };
    const montrer = (el, oui) => el?.setAttribute("style", oui ? "display:block" : "display:none");
    const declencheur = q("button.fake-menu-button__button");
    const menu = q("#nid-7-content");
    const fenetre = q(".me-end-listing-modal-wrapper");
    const pastille = q(".me-carousel__pill");
    if (declencheur) declencheur.__clic = () => { clics.declencheur++; montrer(menu, true); declencheur.setAttribute("aria-expanded", "true"); };
    const item = racine.querySelectorAll("button.fake-menu-button__item").find((b) => b.textContent === "Terminer la vente");
    if (item) item.__clic = () => { clics.terminer++; if (opts.ouvreFenetre !== false) montrer(fenetre, true); };
    const [annuler, confirmer] = fenetre.querySelectorAll(".se-end-listing__footer-actions button");
    annuler.__clic = () => { clics.annuler++; montrer(fenetre, false); };
    confirmer.__clic = () => { clics.confirmer++; montrer(fenetre, false); q(`div.active-item[qa-id="active-item-${N}"]`)?.remove(); if (pastille) pastille.texte = "Tout (0) - Sélectionné"; };
    q(".gh-identity__dialog").__clic = () => { clics.identite++; };
    const document = {
      readyState: "complete", body: racine.querySelector("body"),
      querySelectorAll: (s) => racine.querySelectorAll(s), querySelector: (s) => racine.querySelector(s),
      getElementById: (id) => racine.querySelector(`#${id}`),
      contains: (el) => { for (let n = el; n; n = n.parentElement) if (n === racine) return true; return false; },
    };
    const location = { pathname: `/mys/active/rf/container_sort=TIME_LEFT_NEWLY_LISTED&container_filter=ALL&container_query=${N}&container_limit=25`, hostname: "www.ebay.fr" };
    location.href = `https://www.ebay.fr${location.pathname}`;
    const getComputedStyle = (el) => ({ display: /display:\s*none/.test(String(el.getAttribute("style") ?? "")) ? "none" : "block", visibility: "visible" });
    class MouseEvent { constructor(type) { this.type = type; } }
    const PointerEvent = MouseEvent;
    // waitFor : quelques tours sans horloge (le vrai attend en temps réel) ; pauses nulles.
    const waitFor = async (fn) => { for (let i = 0; i < 4; i++) { const v = fn(); if (v) return v; await Promise.resolve(); } return null; };
    const humanPause = async () => {};
    const fabrique = new Function("document", "location", "window", "getComputedStyle", "MouseEvent", "PointerEvent", "waitFor", "humanPause",
      `${constantes}\n${aides}\n${srcRetrait}\nreturn deleteListingMonEbay;`);
    const f = fabrique(document, location, {}, getComputedStyle, MouseEvent, PointerEvent, waitFor, humanPause);
    const trace = [];
    const r = await f({ listing_url: `https://www.ebay.fr/itm/${N}`, platform_fields: platformFields }, trace, (l) => trace.push(l));
    return { r, clics, trace };
  };
  check("la fonction de retrait est lisible à la source", !!srcRetrait && /function realClick/.test(aides));
  if (srcRetrait) {
    const a = await rejouer();
    check("chemin complet : ligne → « Autres options » → « Terminer la vente » → UN clic « Mettre fin à l'annonce »",
      a.clics.declencheur === 1 && a.clics.terminer === 1 && a.clics.confirmer === 1 && a.clics.annuler === 0, JSON.stringify(a.clics));
    check("la fenêtre de l'en-tête (gh-identity__dialog « Chargement en cours… ») n'est jamais prise pour la confirmation", a.clics.identite === 0);
    check("après le clic : PAS de succès sans preuve — fin envoyée, à prouver par le background (reprise)",
      a.r.success === false && a.r.reprise === true && a.r.monEbayFinCliquee === true && a.r.numero === N && typeof a.r.finCliqueeLe === "string", JSON.stringify({ s: a.r.success, rp: a.r.reprise, m: a.r.monEbayFinCliquee }));
    const b = await rejouer({ autreLien: "833333333333" });
    check("un lien de la ligne porte un autre numéro : AUCUN clic", b.clics.declencheur + b.clics.terminer + b.clics.confirmer === 0 && b.r.success === false && b.r.reprise === true);
    const c = await rejouer({ dialogueAutreNumero: true });
    check("la fenêtre nomme un autre numéro : refermée par « Annuler », jamais confirmée", c.clics.confirmer === 0 && c.clics.annuler === 1 && c.r.reprise === true);
    const d = await rejouer({ ouvreFenetre: false });
    check("« Terminer la vente » n'ouvre pas la fenêtre « Mettre fin à l'annonce » : rien n'est confirmé, reprise", d.clics.confirmer === 0 && d.r.reprise === true && !d.r.monEbayFinCliquee);
    const recente = { ebay_fin_envoyee: { le: new Date().toISOString(), numero: N } };
    const e = await rejouer({}, recente);
    check("fin déjà envoyée il y a peu, annonce encore affichée : AUCUN nouveau clic (jamais deux confirmations)",
      e.clics.declencheur + e.clics.terminer + e.clics.confirmer === 0 && e.r.success === false && e.r.reprise === true);
    const g = await rejouer({ ligne: false, total: 0 }, recente);
    check("fin envoyée puis « Tout (0) » sans la ligne : succès PROUVÉ (preuve écrite)",
      g.r.success === true && g.r.preuveRetrait?.source === "mon_ebay_en_cours" && g.r.preuveRetrait?.total === 0 && g.clics.confirmer === 0, JSON.stringify(g.r.preuveRetrait));
    const h = await rejouer({ ligne: false, total: 0 });
    check("« Tout (0) » sans fin envoyée par nous : « introuvable » — le background demande à eBay (vendue ? terminée ?)",
      h.r.success === false && /introuvable/i.test(h.r.error) && !h.r.reprise);
    const i = await rejouer({ ligne: false, rendue: false });
    check("page pas rendue (ni compteur ni ligne) : reprise, rien n'est touché", i.r.success === false && i.r.reprise === true && i.clics.confirmer === 0);
    check("un seul appel du clic de confirmation dans tout le code du retrait", (srcRetrait.match(/realClick\(confirmer\)/g) ?? []).length === 1);
  }
  // La PREUVE (background) : la liste filtrée relue.
  const srcLireFin = extraireFonction("lireFinMonEbayDansPage");
  const srcVerdictFin = extraireFonction("verdictFinMonEbay");
  const verdictFin = srcVerdictFin ? new Function(`${srcVerdictFin}; return verdictFinMonEbay;`)() : null;
  const relire = async (html, chemin) => {
    if (!srcLireFin) return null;
    const { document, location, window } = pageDe(html, chemin);
    return new Function("document", "location", "window", `${srcLireFin}; return lireFinMonEbayDansPage;`)(document, location, window)(N, 200);
  };
  const cheminFiltre = `/mys/active/rf/container_sort=TIME_LEFT_NEWLY_LISTED&container_filter=ALL&container_query=${N}&container_limit=25`;
  const fin0 = await relire(page(pastilles(0)), cheminFiltre);
  check("relecture « Tout (0) », aucune ligne : fin PROUVÉE", verdictFin?.(fin0)?.prouvee === true && verdictFin?.(fin0)?.preuve?.source === "mon_ebay_en_cours", JSON.stringify(fin0));
  const encore = await relire(page(pastilles(1) + ligne(N, "TEST", "9 999,00 EUR")), cheminFiltre);
  check("relecture : la ligne de ce numéro est encore là → NON prouvée", verdictFin?.(encore)?.prouvee === false);
  const muette = await relire(page(""), cheminFiltre);
  check("relecture sans compteur → NON prouvée", verdictFin?.(muette)?.prouvee === false);
  const ailleurs = await relire(LANDING, "/sh/landing");
  check("relecture hors « En cours » → NON prouvée", verdictFin?.(ailleurs)?.prouvee === false);
  check("relecture absente → NON prouvée", verdictFin?.(null)?.prouvee === false);
  const fnRetrait = src.slice(src.indexOf("async function executerRetraitViaHandler("));
  const corpsRetrait = fnRetrait.slice(0, fnRetrait.indexOf("\n}\n"));
  check("background : une fin envoyée n'est un succès QUE prouvée (prouverFinMonEbay), sinon reprise",
    /result\?\.monEbayFinCliquee === true/.test(corpsRetrait) && /await prouverFinMonEbay\(tabId, job\)/.test(corpsRetrait)
      && /preuve\.prouvee\s*\n?\s*\? \{ \.\.\.result, success: true/.test(corpsRetrait) && /success: false, reprise: true/.test(corpsRetrait));
  check("background : la fin envoyée est notée sur le job (ebay_fin_envoyee) avant la relecture",
    corpsRetrait.indexOf("ebay_fin_envoyee") > 0 && corpsRetrait.indexOf("ebay_fin_envoyee") < corpsRetrait.indexOf("await prouverFinMonEbay(tabId, job)"));
  const blocAdr = extraireFonction("adresseRetraitMonEbay");
  const adr = blocAdr ? new Function(`${blocAdr}; return adresseRetraitMonEbay;`)() : null;
  check("adresse de retrait = recherche par numéro de « En cours » (container_query)",
    adr?.({ listing_url: "https://www.ebay.fr/itm/900000000001" }) === "https://www.ebay.fr/mys/active/rf/container_sort=TIME_LEFT_NEWLY_LISTED&container_filter=ALL&container_query=900000000001&container_limit=25");
  check("sans numéro : aucune adresse (jamais un retrait par titre)", adr?.({ listing_url: "", title: "Objet" }) === null);
  check("la bascule ne part QUE depuis /sh/landing", /if \(!\/\^\\\/sh\\\/landing\(\?:\\\/\|\$\)\/i\.test\(chemin\)\) return false;/.test(src));
}

console.log(ko ? `\n✗ ${ko} cas en échec` : "\n✓ tous les cas passent");
process.exit(ko ? 1 : 0);
