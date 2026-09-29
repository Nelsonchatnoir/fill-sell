// ═══════════════════════════════════════════════════════════════════════════
// RAYON DÉPLACÉ PAR VINTED : LA PAGE DE L'ANNONCE TRANCHE (0.6.79, 28/09)
//   node scripts/vinted-rayon-deplace-selftest.mjs
//   node scripts/vinted-rayon-deplace-selftest.mjs build/extension/content-scripts/vinted.js build/extension/background.js
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS : Casio G-Shock de Nico (inventaire 1785444834689, annonce Vinted
// 10062296164), republiée sans souci les 28/08, 03/09, 12/09 et 19/09
// (catalog_id 97, Hommes > Accessoires > Montres). Le 28/09 au soir, captures
// 9187 et 9188 : le formulaire d'ÉDITION rend catalog_id 5570 (+ attribut
// department=575), un rayon absent de TOUT arbre /api/v2/item_upload/catalogs
// — le propre formulaire de Vinted affiche la catégorie VIDE. La page publique
// de la même annonce dit toujours 97, fil d'Ariane 5 > 82 > 97.
// Verdict « incomplet », job 7af0ec78 en needs_user, annonce intacte.
//
// ⛔ CE TEST EXÉCUTE LE VRAI CODE : capturerAnnonceVinted et ses fonctions sont
//    EXTRAITES du fichier passé (source ou paquet minifié), jamais recopiées.
//    Le réseau Vinted est une doublure qui rend des formes RELEVÉES sur la
//    vraie page le 28/09 (guillemets échappés du flux React Server Components,
//    liens « item-crumbs »).
// ⛔ Il rejoue aussi le code d'AVANT (2701d9a, la 0.6.78) : la panne doit s'y
//    reproduire, sinon le test ne prouve rien.
import fs from "node:fs";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const FICHIER_VINTED = (process.argv[2] ?? "chrome-extension/content-scripts/vinted.js").replace(/\\/g, "/");
const FICHIER_BG = (process.argv[3] ?? "chrome-extension/background.js").replace(/\\/g, "/");
const SRC = fs.readFileSync(FICHIER_VINTED, "utf8");
const SRC_BG = fs.readFileSync(FICHIER_BG, "utf8");
let SRC_AVANT = null;
try {
  SRC_AVANT = execSync("git show 2701d9a:chrome-extension/content-scripts/vinted.js", { maxBuffer: 64 * 1024 * 1024 }).toString();
} catch { /* dépôt sans cet objet : on saute la reproduction */ }
console.log(`fichiers exécutés : ${FICHIER_VINTED} · ${FICHIER_BG}\n`);

let echecs = 0;
const dit = (ok, quoi, extra = "") => { if (!ok) echecs++; console.log(`${ok ? "  ok  " : " ÉCHEC"}  ${quoi}${ok || !extra ? "" : `  → ${extra}`}`); };

// ── Doublures Vinted ─────────────────────────────────────────────────────────
const ITEM = 10062296164;
// Arbre du compte de Nico, réduit aux branches utiles, tel que relevé le 28/09 :
// « Jupes » y est la feuille 5523 ; 5570 n'y est nulle part.
const ARBRE_NICO = [
  { id: 1904, title: "Femmes", catalogs: [
    { id: 4, title: "Vêtements", catalogs: [{ id: 5523, title: "Jupes", catalogs: [] }] },
    { id: 1187, title: "Accessoires", catalogs: [
      { id: 20, title: "Ceintures", catalogs: [] },
      { id: 1852, title: "Porte-clés", catalogs: [] },
    ] },
  ] },
  { id: 5, title: "Hommes", catalogs: [{ id: 82, title: "Accessoires", catalogs: [
    { id: 97, title: "Montres", catalogs: [] }, { id: 99, title: "Autres", catalogs: [] },
  ] }] },
  { id: 2309, title: "Livres et médias", catalogs: [{ id: 2312, title: "Livres", catalogs: [] }] },
];
const natifCasio = (catalogId) => ({
  id: ITEM, title: "Casio G-Shock Noir", description: "Montre G-Shock Casio, très bon état.",
  catalog_id: catalogId, brand_id: 2575, brand_dto: { id: 2575, title: "CASIO" },
  color1: "Noir", color1_id: 1, color2: null, color2_id: null, package_size_id: 1, isbn: null,
  price: { amount: "61.0", currency_code: "EUR" },
  photos: [{ full_size_url: "https://images1.vinted.net/t/casio/f800/1.webp" }],
  item_attributes: [
    { code: "material", ids: [300] }, { code: "department", ids: [575] },
    { code: "condition", ids: [2] }, { code: "size", ids: [1435] },
  ],
});
const esc = (s) => s.replace(/"/g, '\\"');
// Page publique : les deux porteurs du rayon relevés sur la vraie page (le
// plugin « breadcrumbs » et l'objet item), un article VOISIN d'un autre rayon,
// et les liens du fil d'Ariane (dont le lien de marque, à ignorer).
function pagePublique({ id = ITEM, catalogs = [97, 97], fil = [5, 82, 97], voisin = true } = {}) {
  const rsc = [
    `{"data":{"name":"breadcrumbs","type":"breadcrumbs","section":"content","data":{"item_id":${id},"brand_id":2575,"catalog_id":${catalogs[0]},"breadcrumbs":[{"title":"Hommes","url":"/catalog/5-hommes"}]}}}`,
    `["$","$L113",null,{"item":{"id":${id},"title":"Casio G-Shock Noir","catalog_id":${catalogs[1]},"is_hidden":false,"currency":"EUR"}}]`,
    voisin ? `{"item":{"id":9999999999,"title":"Autre article","catalog_id":1234,"is_hidden":false}}` : "",
  ].map((b) => `<script>self.__next_f.push([1,"${esc(b)}"])</script>`).join("\n");
  const liens = fil.map((c) => `<li><a href="/catalog/${c}-rayon?referrer=item-crumbs" itemProp="url" data-testid="breadcrumb"><span>x</span></a></li>`).join("")
    + (fil.length ? `<li><a href="/catalog/${fil.at(-1)}-watches/brand/2575-casio?referrer=item-crumbs">CASIO Montres</a></li>` : "");
  return `<!DOCTYPE html><html lang="fr-FR"><head><title>Casio G-Shock Noir | Vinted</title></head><body><ul>${liens}</ul>${rsc}</body></html>`;
}

// Forme relevée en direct le 29/09 sur la ceinture 10100959188 et les trois
// porte-clés de Deborah : `catalog_id` AVANT `item_id`, les deux sous forme de
// chaînes, dans le flux RSC échappé. L'ancien parseur de la 0.6.79 ne lisait
// que des nombres dans l'ordre inverse ; cette doublure verrouille la règle,
// sans utiliser le titre comme preuve.
function pagePubliqueFormeLive({ catalogId, fil }) {
  const bloc = `{"data":{"catalog_id":"${catalogId}","currency":"EUR","item_id":"${ITEM}"}}`;
  const rsc = `<script>self.__next_f.push([1,"${esc(bloc)}"])</script>`;
  const liens = fil.map((c) => `<li><a href="/catalog/${c}-rayon?referrer=item-crumbs"><span>x</span></a></li>`).join("")
    + `<li><a href="/catalog/${fil.at(-1)}-rayon/brand/1-marque?referrer=item-crumbs">marque</a></li>`;
  return `<!DOCTYPE html><html lang="fr-FR"><body><ul>${liens}</ul>${rsc}</body></html>`;
}

function reseau({ natif, arbre = ARBRE_NICO, page = pagePublique(), pageStatus = 200, pageRedirigee = null }) {
  const appels = [];
  const reponse = (status, corps, url, redirected = false) => ({
    ok: status >= 200 && status < 300, status, redirected, url,
    headers: { get: (h) => (String(h).toLowerCase() === "content-type" ? "application/json" : null) },
    text: async () => corps,
  });
  const fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    if (u.startsWith("/api/v2/item_upload/items/")) return reponse(200, JSON.stringify({ item: natif }), u);
    if (u === "/api/v2/item_upload/catalogs") return reponse(200, JSON.stringify({ catalogs: arbre, code: 0 }), u);
    if (u === "/api/v2/size_groups") return reponse(200, JSON.stringify({ size_groups: [{ id: 62, sizes: [{ id: 1435, title: "Taille unique" }] }] }), u);
    if (u.startsWith("/items/")) {
      if (pageRedirigee) return reponse(200, "<html><title>Session refresh</title></html>", `https://www.vinted.fr${pageRedirigee}`, true);
      return reponse(pageStatus, page, `https://www.vinted.fr/items/${ITEM}-casio-g-shock-noir`, true);
    }
    return reponse(404, "<div>404</div>", u);
  };
  return { fetch, appels };
}

// ── Bac à sable : le vrai code extrait ───────────────────────────────────────
const FONCTIONS = [
  "fetchBorne", "lireReferentielVinted", "resoudreCheminCatalogue", "racineDuCatalogue",
  "catalogueDeLaPagePublique", "resoudreTaille", "attributVintedIds", "resoudreCouleurs",
  "lireDetailArticle", "capturerAnnonceVinted",
];
function charger(src, fetch) {
  const corps = FONCTIONS.map((n) => {
    try { return extraireFonctionJs(src, n); } catch { return ""; } // absente d'une ancienne version
  }).join("\n");
  const ctx = vm.createContext({
    fetch, AbortController, setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(`
    const _refCache = {}; const FETCH_BORNE_MS = 30000;
    const VINTED_PACKAGE_SIZES_PAR_ID = { 1: "Petit", 2: "Moyen", 3: "Grand" };
    const VINTED_SANS_MARQUE = "Sans marque"; const VINTED_BRAND_ID_SANS_MARQUE = 1;
    function estPageBotShieldVinted() { return false; }
    ${corps}
    globalThis.__capturer = capturerAnnonceVinted;`, ctx);
  return ctx.__capturer;
}
async function capturer(src, opts) {
  const net = reseau(opts);
  const res = await charger(src, net.fetch)(String(ITEM));
  return { res, appels: net.appels, pageLue: net.appels.some((u) => u.startsWith("/items/")) };
}
const trace = (res) => (res.diagnostics ?? []).find((d) => d.cle === "categorie_page_publique") ?? null;
const manqueCategorie = (res) => (res.champs_manquants ?? []).some((m) => /^categorie/.test(m));

// ── 1. La panne se reproduit sur le code d'avant ─────────────────────────────
console.log("1. Code d'avant (2701d9a, 0.6.78) : la Casio 5570 tombe en capture incomplète");
if (SRC_AVANT) {
  const { res } = await capturer(SRC_AVANT, { natif: natifCasio(5570) });
  dit(res.success === true && manqueCategorie(res) && !res.libelles?.categoryPath,
    "5570 → « categorie (catalog_id → chemin de libellés) », aucun chemin", JSON.stringify(res.champs_manquants));
} else {
  console.log("  (objet 2701d9a absent — reproduction sautée)");
}

// ── 2. Le correctif : la page de l'annonce donne 97, vérifié sur l'arbre ─────
console.log("\n2. Nouveau code : 5570 absent de l'arbre → la page de l'annonce tranche");
{
  const { res, pageLue } = await capturer(SRC, { natif: natifCasio(5570) });
  const t = trace(res);
  dit(pageLue, "la page publique de l'annonce est lue");
  dit(!manqueCategorie(res), "plus de catégorie manquante", JSON.stringify(res.champs_manquants));
  dit(JSON.stringify(res.libelles?.categoryPath) === JSON.stringify(["Hommes", "Accessoires", "Montres"]),
    "chemin = Hommes > Accessoires > Montres (celui des captures 2046/3112/5196/6633)", JSON.stringify(res.libelles?.categoryPath));
  dit(res.libelles?.catalog_id_depot === 97, "libelles.catalog_id_depot = 97 (l'id POSÉ à la recréation)", String(res.libelles?.catalog_id_depot));
  dit(res.natif?.catalog_id === 5570, "le natif reste intact (5570), rien n'est réécrit");
  dit(t?.resolu === true && t?.catalog_id_edition === 5570 && t?.catalog_id_page === 97 && t?.fil_ariane?.join(">") === "5>82>97",
    "diagnostic : édition 5570, page 97, fil d'Ariane 5 > 82 > 97", JSON.stringify(t));
  dit(res.libelles?.taille === "Taille unique", "la taille (item_attributes size=1435) reste résolue");
  // Les seuls champs encore manquants sont les photos (re-hébergement, posé
  // côté background) : le verdict sera « valide » une fois les photos faites.
  dit((res.champs_manquants ?? []).every((m) => /^photos_rehebergees/.test(m)), "seul manque le re-hébergement des photos (fait par le background)", JSON.stringify(res.champs_manquants));
}

console.log("\n2b. Forme RSC live du 29/09 : identifiants entre guillemets et rayon avant l'article");
for (const cas of [
  { ancien: 5542, actuel: 20, fil: [1904, 1187, 20], chemin: ["Femmes", "Accessoires", "Ceintures"], nom: "Ceinture" },
  { ancien: 5552, actuel: 1852, fil: [1904, 1187, 1852], chemin: ["Femmes", "Accessoires", "Porte-clés"], nom: "trois objets de collection" },
]) {
  const { res } = await capturer(SRC, {
    natif: natifCasio(cas.ancien),
    page: pagePubliqueFormeLive({ catalogId: cas.actuel, fil: cas.fil }),
  });
  const t = trace(res);
  dit(!manqueCategorie(res), `${cas.nom} : la catégorie n'est plus manquante`, JSON.stringify(res.champs_manquants));
  dit(JSON.stringify(res.libelles?.categoryPath) === JSON.stringify(cas.chemin)
      && res.libelles?.catalog_id_depot === cas.actuel
      && t?.catalog_id_page === cas.actuel,
    `${cas.ancien} déplacé → feuille exacte ${cas.actuel} (${cas.chemin.join(" > ")})`, JSON.stringify(t));
}

// ── 3. Aucune requête de plus quand l'id est dans l'arbre ────────────────────
console.log("\n3. Rayon présent dans l'arbre (97, la capture du 19/09) : rien ne change");
{
  const neuf = await capturer(SRC, { natif: natifCasio(97) });
  dit(!neuf.pageLue, "la page publique n'est PAS lue");
  dit(neuf.res.libelles?.catalog_id_depot === undefined, "pas de catalog_id_depot");
  if (SRC_AVANT) {
    const avant = await capturer(SRC_AVANT, { natif: natifCasio(97) });
    dit(JSON.stringify(neuf.res.libelles) === JSON.stringify(avant.res.libelles)
      && JSON.stringify(neuf.res.champs_manquants) === JSON.stringify(avant.res.champs_manquants),
    "libellés et champs manquants IDENTIQUES au code d'avant");
    dit(neuf.appels.join("|") === avant.appels.join("|"), "mêmes requêtes, dans le même ordre", `${neuf.appels.join(",")} ≠ ${avant.appels.join(",")}`);
  }
}

// ── 4. Rien de deviné : chaque doute laisse l'arrêt AVANT suppression ────────
console.log("\n4. Doutes : la catégorie reste manquante (arrêt avant suppression)");
const refus = [
  ["page qui porte un rayon absent de l'arbre (5570)", { page: pagePublique({ catalogs: [5570, 5570], fil: [] }) }, /absent de l'arbre/],
  ["page qui porte un rayon NON feuille (82, Accessoires)", { page: pagePublique({ catalogs: [82, 82], fil: [5, 82] }) }, /pas une feuille/],
  ["deux rayons différents pour la même annonce", { page: pagePublique({ catalogs: [97, 99] }) }, /plusieurs rayons/],
  ["fil d'Ariane ≠ chemin de l'arbre", { page: pagePublique({ fil: [1904, 4, 5523] }) }, /fil d'Ariane/],
  ["page d'un AUTRE article (identifiant différent)", { page: pagePublique({ id: 1111111111 }) }, /introuvable dans la page/],
  ["page sans aucun porteur du rayon", { page: "<html><body>rien</body></html>" }, /introuvable dans la page/],
  ["page 403 (anti-robot)", { pageStatus: 403 }, /HTTP 403/],
  ["session web périmée (redirigée vers /session-refresh)", { pageRedirigee: "/session-refresh?ref_url=%2Fitems%2F10062296164" }, /session-refresh/],
];
for (const [nom, opts, motif] of refus) {
  const { res } = await capturer(SRC, { natif: natifCasio(5570), ...opts });
  const t = trace(res);
  dit(manqueCategorie(res) && !res.libelles?.categoryPath && res.libelles?.catalog_id_depot === undefined && motif.test(String(t?.motif ?? "")),
    nom, `motif=${t?.motif} manquants=${JSON.stringify(res.champs_manquants)}`);
}

// ── 5. Le job de recréation pose l'id de l'arbre ─────────────────────────────
console.log("\n5. background.js : construireJobRecreation pose le rayon de l'arbre");
{
  const ctx = vm.createContext({});
  vm.runInContext(`function sanitizeJob(j) { return j; }\n${extraireFonctionJs(SRC_BG, "construireJobRecreation")}\nglobalThis.__f = construireJobRecreation;`, ctx);
  const job = { id: "7af0ec78", inventaire_id: 1785444834689, title: "Casio" };
  const pf = { vinted_ids_actifs: true };
  const avecDepot = ctx.__f(job, pf, { payload: { natif: natifCasio(5570), titre: "Casio" }, libelles: { categoryPath: ["Hommes", "Accessoires", "Montres"], catalog_id_depot: 97 }, photos_urls: ["u"] }, 61);
  dit(avecDepot.platform_fields?.vinted_ids?.catalog_id === 97, "catalog_id_depot 97 → vinted_ids.catalog_id = 97", JSON.stringify(avecDepot.platform_fields?.vinted_ids));
  dit(JSON.stringify(avecDepot.platform_fields?.categoryPath) === JSON.stringify(["Hommes", "Accessoires", "Montres"]), "categoryPath transmis");
  const sansDepot = ctx.__f(job, pf, { payload: { natif: natifCasio(97), titre: "Casio" }, libelles: { categoryPath: ["Hommes", "Accessoires", "Montres"] }, photos_urls: ["u"] }, 61);
  dit(sansDepot.platform_fields?.vinted_ids?.catalog_id === 97, "sans catalog_id_depot : l'id du natif, comme avant");
}

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
