// Autotest : UN LIEN LEBONCOIN QUI S'OUVRE SUR L'ANNONCE (26/10, Elodie82).
//
//     npm run selftest:lien-leboncoin-ouvrable
//
// Le portefeuille Celine d'Elodie82 (vendu sur Vinted le 26/10) restait en ligne sur Leboncoin : son retrait ouvrait
// /ad/3295261130, que Leboncoin redirige vers /ad/ad/3295261130 — une 404. La garde d'identité lisait le titre « 404 »
// et abandonnait (« listing_url douteux »), à chaque essai. Relevé réel du 26/10 (vrai navigateur) : /ad/<id> et
// /ad/x/<id> → 404 ; /ad/<n'importe quel rayon réel>/<id> → l'annonce. Ce qu'il prouve, sans réseau ni base :
//   A. la règle serveur (annonce-lien.ts) : lien réécrit seulement s'il ne s'ouvre pas, depuis l'identifiant ;
//   B. la même règle dans l'extension (background.js), au retrait, au dépôt payé, au relevé (écrite dans la page) ;
//   C. une page 404 n'est plus « une annonce intitulée 404 » : aucun clic, mot « introuvable », état relu ;
//   D. get-pending-jobs réécrit le lien d'un retrait Leboncoin avant de le servir (compare-and-swap sur pending) ;
//   E. le rattachement d'un dépôt coupé ne recopie jamais un lien de relevé qui mène à une 404.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };

const ID = "3295261130";
const BON = `https://www.leboncoin.fr/ad/vetements/${ID}`;

// ── A. La règle serveur ──────────────────────────────────────────────────────
console.log("A. annonce-lien.ts : lienOuvrable / lienDepuisId");
const L = await charger("supabase/functions/_shared/annonce-lien.ts");
ok(L.lienOuvrable("leboncoin", `https://www.leboncoin.fr/ad/${ID}`) === BON, "/ad/<id> (le lien d'Elodie) → /ad/vetements/<id>");
ok(L.lienOuvrable("leboncoin", `https://www.leboncoin.fr/ad/x/${ID}`) === BON, "/ad/x/<id> → /ad/vetements/<id>");
ok(L.lienOuvrable("leboncoin", `https://www.leboncoin.fr/ad/ad/${ID}`) === BON, "/ad/ad/<id> → /ad/vetements/<id>");
ok(L.lienOuvrable("leboncoin", `https://www.leboncoin.fr/ad/chaussures/3295273889`) === "https://www.leboncoin.fr/ad/chaussures/3295273889", "un lien qui s'ouvre (rayon réel) reste tel quel");
ok(L.lienOuvrable("leboncoin", `https://www.leboncoin.fr/ad/accessoires_bagagerie/${ID}?x=1`) === `https://www.leboncoin.fr/ad/accessoires_bagagerie/${ID}?x=1`, "paramètres conservés sur un lien juste");
ok(L.lienOuvrable("leboncoin", `https://www.leboncoin.fr/ad/${ID}`, "3295000000") === "https://www.leboncoin.fr/ad/vetements/3295000000", "l'identifiant du job prime sur celui du lien faux");
ok(L.lienOuvrable("leboncoin", null, ID) === BON, "sans lien : depuis l'identifiant seul");
ok(L.lienOuvrable("leboncoin", null, null) === null, "ni lien ni identifiant : null (rien d'inventé)");
ok(L.lienOuvrable("leboncoin", "https://www.leboncoin.fr/compte/part/mes-annonces") === "https://www.leboncoin.fr/compte/part/mes-annonces", "un lien sans identifiant est rendu tel quel");
ok(L.lienOuvrable("vinted", "https://www.vinted.fr/items/123") === "https://www.vinted.fr/items/123", "les autres plateformes ne sont pas touchées");
ok(L.lienDepuisId("leboncoin", ID) === BON && L.lienDepuisId("leboncoin", "12") === null, "lienDepuisId Leboncoin : la forme observée, un vrai numéro seulement");
ok(L.idDepuisLien("leboncoin", BON) === ID && L.idDepuisLien("leboncoin", `https://www.leboncoin.fr/ad/${ID}`) === null, "idDepuisLien inchangé");
ok(L.lienReconstructible("leboncoin") === true, "Leboncoin est désormais reconstructible (forme relevée le 26/10)");
for (const p of ["beebs", "vinted", "ebay"]) ok(L.lienDepuisId(p, "123456789012") !== null, `${p} : forme canonique inchangée`);

// ── B. L'extension ───────────────────────────────────────────────────────────
console.log("B. background.js : la même règle");
const bg = lire("chrome-extension/background.js");
const src = bg.match(/const RAYON_CANONIQUE_LBC = "vetements";\nfunction lienLeboncoinOuvrable\(url, id = null\) \{[\s\S]*?\n\}/)?.[0];
ok(Boolean(src), "lienLeboncoinOuvrable est présente");
const f = src ? new Function(`${src}; return lienLeboncoinOuvrable;`)() : () => null;
const cas = [[`https://www.leboncoin.fr/ad/${ID}`, null], [`https://www.leboncoin.fr/ad/x/${ID}`, null], [`https://www.leboncoin.fr/ad/ad/${ID}`, null],
  ["https://www.leboncoin.fr/ad/chaussures/3295273889", null], [null, ID], [null, null], [`https://www.leboncoin.fr/ad/${ID}`, "3295000000"]];
for (const [u, id] of cas) ok(f(u, id) === L.lienOuvrable("leboncoin", u, id), `extension = serveur pour ${u ?? "(aucun lien)"} / ${id ?? "-"}`);
ok(/leboncoin: \(job\) => lienLeboncoinOuvrable\(job\.listing_url, job\.platform_listing_id\) \|\| "https:\/\/www\.leboncoin\.fr\/compte\/part\/mes-annonces"/.test(bg), "le retrait ouvre le lien qui s'ouvre (DELETE_TARGETS)");
ok(!/leboncoin\.fr\/ad\/x\/\$\{/.test(bg) && !/`https:\/\/www\.leboncoin\.fr\/ad\/\$\{id\}`/.test(bg), "plus aucun lien /ad/x/<id> ni /ad/<id> fabriqué");
ok(/if \(id\) extra\.listing_url = lienLeboncoinOuvrable\(null, id\);/.test(bg), "dépôt payé : la forme qui s'ouvre");
const releve = bg.match(/\n( +)url: \/\^https:\\\/\\\/www\\\.leboncoin\\\.fr\\\/ad\\\/\(\?!ad\\\/\|x\\\/\)\[a-z_\]\+\\\/\\d\{6,\}\/\.test\(String\(a\?\.url \?\? ""\)\) \? String\(a\.url\) : `https:\/\/www\.leboncoin\.fr\/ad\/vetements\/\$\{id\}`,/);
ok(Boolean(releve), "relevé (code exécuté dans la page) : règle écrite sur place, pas d'appel hors page");
const reReleve = /^https:\/\/www\.leboncoin\.fr\/ad\/(?!ad\/|x\/)[a-z_]+\/\d{6,}/;
ok(!reReleve.test(`https://www.leboncoin.fr/ad/${ID}`) && !reReleve.test(`https://www.leboncoin.fr/ad/x/${ID}`) && reReleve.test(BON), "la règle écrite dans la page refuse /ad/<id> et /ad/x/<id>");
ok(/leboncoin\\\.fr\\\/ad\\\/\(\?:\(\?:ad\|x\)\\\/\)\?\(\\d\+\)\\\/\?\$\/\);/.test(bg), "lecture d'état : /ad/x/<id> et /ad/ad/<id> lus sous /vi/<id>.htm, comme /ad/<id>");

// ── C. La page 404 ───────────────────────────────────────────────────────────
console.log("C. leboncoin.js : une page 404 n'est pas une annonce");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
const i404 = lbc.indexOf('if (h1 === "404" || /page introuvable/i.test(document.title)) {');
const iGarde = lbc.indexOf("const preuveTitre = annonceNommee(h1, job, null);");
ok(i404 > 0 && iGarde > i404, "la 404 est reconnue AVANT la garde d'identité (plus de « s'intitule « 404 » »)");
const bloc404 = lbc.slice(i404, i404 + 400);
ok(/lienMort: true/.test(bloc404) && /Annonce introuvable/.test(bloc404) && !/click|\.click\(/.test(bloc404), "aucun clic, résultat « introuvable » (l'état est relu par le background)");

// ── D. get-pending-jobs ──────────────────────────────────────────────────────
console.log("D. get-pending-jobs : le lien est réécrit avant d'être servi");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/import \{ lienDepuisId, idDepuisLien, lienOuvrable \} from "\.\.\/_shared\/annonce-lien\.ts";/.test(gpj), "import de la règle");
const iBloc = gpj.indexOf("UN LIEN LEBONCOIN QUI NE S'OUVRE PAS EST RÉÉCRIT AVANT D'ÊTRE SERVI");
const iSans = gpj.indexOf("let heldRetraitSansLien = 0;");
ok(iBloc > 0 && iSans > iBloc, "la réécriture passe avant le tri des retraits sans lien");
const blocG = gpj.slice(iBloc, iSans);
ok(/j\.platform !== "leboncoin" \|\| j\.action !== "delete"/.test(blocG), "Leboncoin, retraits seulement");
ok(/\.eq\("status", "pending"\)\.eq\("listing_url", avant\)/.test(blocG), "compare-and-swap : pending ET le lien lu");
ok(/lien_reecrit: \{ le: /.test(blocG), "la réécriture est tracée sur le job (avant / après)");
ok(/url = lienOuvrable\(String\(d\.platform\), a\.url, a\.listing_id\) \?\? String\(a\.url\); idRetrouve = String\(a\.listing_id\); provenance = "releve_du_compte";/.test(gpj), "le lien lu dans le relevé passe par la règle");

// ── E. Le rattachement d'un dépôt coupé ──────────────────────────────────────
console.log("E. depot-coupe-tranche : jamais un lien de relevé qui mène à une 404");
const D = await charger("supabase/functions/_shared/depot-coupe-tranche.js");
const job = { id: "j", platform: "leboncoin", action: "publish", platform_fields: {} };
const p1 = D.patchRattachementDepotCoupe(job, { annonce: { listing_id: ID, url: `https://www.leboncoin.fr/ad/${ID}`, statut_plateforme: "inconnu" }, preuve: "photos" }, { lienDepuisId: L.lienDepuisId });
ok(p1.listing_url === BON, "lien de relevé /ad/<id> → la forme qui s'ouvre", p1.listing_url);
const p2 = D.patchRattachementDepotCoupe(job, { annonce: { listing_id: ID, url: `https://www.leboncoin.fr/ad/accessoires_bagagerie/${ID}`, statut_plateforme: "en_ligne" }, preuve: "photos" }, { lienDepuisId: L.lienDepuisId });
ok(p2.listing_url === `https://www.leboncoin.fr/ad/accessoires_bagagerie/${ID}`, "lien de relevé juste : gardé");
const p3 = D.patchRattachementDepotCoupe({ ...job, platform: "beebs" }, { annonce: { listing_id: "123", url: "https://www.beebs.app/fr/p/123", statut_plateforme: "en_ligne" }, preuve: "photos" }, { lienDepuisId: L.lienDepuisId });
ok(p3.listing_url === "https://www.beebs.app/fr/p/123", "Beebs inchangé");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
