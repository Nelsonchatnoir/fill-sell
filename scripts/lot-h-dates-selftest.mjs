// ═══════════════════════════════════════════════════════════════════════════
// LOT H (31/10) — DATES DE MISE EN LIGNE PAR PLATEFORME DANS LE STOCK — `npm run selftest:lot-h-dates`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le code LIVRÉ sur les données RÉELLES de l'exemple de XEWER (« GIGN Anti-Terror Force », fiche
// 1789717144944001, relues en production le 31/10) :
//   1. _shared/mise-en-ligne.js — la règle de l'éligibilité à la republication automatique : la pastille dit la plus
//      RÉCENTE (Leboncoin, republiée le 21/10), plus l'import eBay du 18/09 ; la plateforme filtrée a sa propre date ;
//      historique : republications remplacées comprises, vraies annulations (sans published_at) nulle part ; un import
//      se dit « importée » ; un job sans lien ne date rien ; un import se date sur la plateforme.
//   2. Le tri « Mise en ligne récente » (stable, dates inconnues en dernier) et la pastille.
//   3. StockTab : pastille → détail, filtre « En ligne sur X » → date de X, tranches et tri sur la même date,
//      « Anciennes »/« Remonter » toujours sur la plus ancienne, colonnes lues.
//   4. La feuille « En ligne depuis », rendue (Vite, rendu serveur).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  annonceEnLigne, historiqueMisesEnLigne, datesParPlateforme, miseEnLigneAffichee, joursPlusAncienne,
  indexerDatesRelevees, dateDuJob, natureDuJob, NATURES,
} from "../supabase/functions/_shared/mise-en-ligne.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

// ── Les données réelles de GIGN (31/10, lecture seule) ─────────────────────
const GIGN = { id: "1789717144944001", title: "Gign Anti-Terror Force Ps2 – version française Pal – sans notice", listed_at_guess: "2026-10-20T06:29:14+00:00", vinted_item_id: "10453104073" };
const J = (platform, action, status, published_at, created_at, platform_listing_id, listing_url, handler_build) => ({ platform, action, status, published_at, created_at, platform_listing_id, listing_url, handler_build });
const JOBS = [
  J("leboncoin", "republish", "cancelled", "2026-10-07T18:55:17.116+00:00", "2026-10-07T18:48:02.977334+00:00", "3284198728", "https://www.leboncoin.fr/ad/jeux_video/3284198728", "2026-10-06T18:38:36Z+b230ebe · v0.6.102"),
  J("leboncoin", "publish", "cancelled", "2026-09-19T17:15:05.498244+00:00", "2026-09-19T17:15:05.498244+00:00", "3256673160", "https://www.leboncoin.fr/ad/jeux_video/3256673160", "releve-annonces"),
  J("vinted", "republish", "cancelled", "2026-10-11T22:15:53.463+00:00", "2026-10-11T20:37:28.796145+00:00", "10341934266", "https://www.vinted.fr/items/10341934266-gign", "2026-10-09T11:12:52Z+9d442ae · v0.6.106"),
  J("vinted", "republish", "cancelled", "2026-09-21T07:19:07.567+00:00", "2026-09-21T07:15:01.085009+00:00", "10079731171", "https://www.vinted.fr/items/10079731171-gign", "2026-09-20T17:39:01Z+349ea65 · v0.6.48"),
  J("opla", "publish", "published", "2026-09-28T07:52:07.166065+00:00", "2026-09-28T07:52:07.166065+00:00", "art_060dd9097432c8e427b6baa123a0e967", "https://www.opla.co/product/art_060dd9097432c8e427b6baa123a0e967", "releve-annonces"),
  J("vinted", "publish", "cancelled", "2026-09-18T07:39:04.869+00:00", "2026-09-18T07:39:00.400211+00:00", "9776250300", "https://www.vinted.fr/items/9776250300-gign", "2026-09-17T22:25:29Z+196afe6 · sync-dressing"),
  J("opla", "republish", "cancelled", null, "2026-10-05T16:13:31.303993+00:00", "art_060dd9097432c8e427b6baa123a0e967", "https://www.opla.co/product/art_060dd9097432c8e427b6baa123a0e967", null),
  J("leboncoin", "republish", "cancelled", null, "2026-10-05T16:13:31.101578+00:00", "3256673160", "https://www.leboncoin.fr/ad/jeux_video/3256673160", null),
  J("leboncoin", "republish", "cancelled", "2026-10-11T22:31:49.817+00:00", "2026-10-11T20:37:29.015316+00:00", "3286805218", "https://www.leboncoin.fr/ad/jeux_video/3286805218", "2026-10-09T11:12:52Z+9d442ae · v0.6.106"),
  J("vinted", "republish", "cancelled", "2026-10-01T06:15:59.951+00:00", "2026-10-01T06:12:01.860426+00:00", "10199888316", "https://www.vinted.fr/items/10199888316-gign", "2026-09-30T20:16:41Z+73c4929 · v0.6.81"),
  J("vinted", "republish", "cancelled", null, "2026-10-05T16:13:30.880327+00:00", null, "https://www.vinted.fr/items/10199888316", null),
  J("vinted", "republish", "cancelled", null, "2026-10-30T17:16:30.317706+00:00", null, "https://www.vinted.fr/items/10453104073", null),
  J("vinted", "republish", "published", "2026-10-20T06:29:16.412+00:00", "2026-10-20T06:24:01.084479+00:00", "10453104073", "https://www.vinted.fr/items/10453104073-gign", "2026-10-18T16:26:21Z+492f753 · v0.6.128"),
  J("leboncoin", "republish", "published", "2026-10-21T14:52:57.301+00:00", "2026-10-21T14:42:01.397643+00:00", "3292602533", "https://www.leboncoin.fr/ad/jeux_video/3292602533", "2026-10-18T16:26:21Z+492f753 · v0.6.128"),
  J("ebay", "publish", "published", "2026-09-18T10:35:53.13912+00:00", "2026-09-18T10:35:53.13912+00:00", "377446788935", "https://www.ebay.fr/itm/377446788935", "releve-annonces"),
  J("leboncoin", "republish", "cancelled", null, "2026-10-30T17:16:31.423735+00:00", "3292602533", "https://www.leboncoin.fr/ad/jeux_video/3292602533", null),
];
const RELEVES = indexerDatesRelevees([
  { listing_id: "3292602533", platform: "leboncoin", publiee_le: "2026-10-21T14:53:06+00:00" },
  { listing_id: "3286805218", platform: "leboncoin", publiee_le: "2026-10-11T22:31:47+00:00" },
]);
const MAINTENANT = Date.parse("2026-10-31T11:00:00+01:00");
const EN_LIGNE = ["vinted", "leboncoin", "ebay"];   // les logos de la carte de XEWER (Opla quittée le 10/10)
const ctx = { item: GIGN, jobs: JOBS, enLigne: EN_LIGNE, datesRelevees: RELEVES, maintenant: MAINTENANT };

console.log("1. La règle de date (celle de l'éligibilité à la republication automatique), sur GIGN");
const aff = miseEnLigneAffichee(ctx);
ok(aff?.platform === "leboncoin" && aff.jours === 9 && aff.nature === NATURES.REPUBLIEE, "pastille : la PLUS RÉCENTE — Leboncoin, republiée le 21/10 (9 j au 31/10), plus l'import eBay", JSON.stringify(aff));
ok(joursPlusAncienne(ctx) === 42, "la plus ANCIENNE reste l'import eBay du 18/09 (42 j) — « Anciennes » et « Remonter »", String(joursPlusAncienne(ctx)));
const vinted = miseEnLigneAffichee({ ...ctx, plateforme: "vinted" });
ok(vinted?.platform === "vinted" && vinted.date === GIGN.listed_at_guess && vinted.jours === 11, "filtre « En ligne sur Vinted » : la date de Vinted (listed_at_guess, 20/10, 11 j)", JSON.stringify(vinted));
const ebay = miseEnLigneAffichee({ ...ctx, plateforme: "ebay" });
ok(ebay?.nature === NATURES.IMPORTEE && ebay.jours === 42, "filtre « En ligne sur eBay » : importée le 18/09", JSON.stringify(ebay));
ok(miseEnLigneAffichee({ ...ctx, plateforme: "beebs" }) === null, "filtre sur une plateforme où l'article n'est pas : rien de daté (jamais une autre plateforme)");
const lbc = annonceEnLigne({ item: GIGN, jobs: JOBS, platform: "leboncoin", datesRelevees: RELEVES });
ok(lbc?.date === "2026-10-21T14:52:57.301+00:00" && lbc.numero === "3292602533", "Leboncoin : le dernier job publié qui porte un lien, daté par published_at (republication : la date relevée n'entre pas)");
const hLbc = historiqueMisesEnLigne({ item: GIGN, jobs: JOBS, platform: "leboncoin", datesRelevees: RELEVES });
ok(hLbc.length === 4, "historique Leboncoin : 4 mises en ligne (import 19/09, republiées 07/10, 12/10, 21/10)", String(hLbc.length));
ok(hLbc.map((h) => h.numero).join(",") === "3292602533,3286805218,3284198728,3256673160", "historique : la plus récente d'abord", hLbc.map((h) => h.numero).join(","));
ok(hLbc[3].nature === NATURES.IMPORTEE && hLbc[0].nature === NATURES.REPUBLIEE, "historique : l'import se dit « importée », les republications « republiée »");
ok(!hLbc.some((h) => h.date == null) && hLbc.filter((h) => h.statut === "cancelled").length === 3, "les republications REMPLACÉES (cancelled avec published_at) y sont ; les 2 annulations sans mise en ligne (05/10, 30/10) n'y sont pas");
const hVinted = historiqueMisesEnLigne({ item: GIGN, jobs: JOBS, platform: "vinted", datesRelevees: RELEVES });
ok(hVinted.length === 5 && hVinted[0].numero === "10453104073" && hVinted[4].nature === NATURES.IMPORTEE, "historique Vinted : 5 (l'import du dressing « sync-dressing » du 18/09 + 4 republications), annulations sans mise en ligne exclues", hVinted.map((h) => `${h.numero}:${h.nature}`).join(","));
const lignes = datesParPlateforme({ ...ctx, plateformes: ["vinted", "leboncoin", "beebs", "ebay"] });
ok(lignes.map((l) => l.platform).join(",") === "leboncoin,vinted,ebay", "détail : en ligne d'abord, la plus récente en tête ; Beebs (jamais en ligne, aucun historique) absent ; Opla (quittée) absente", lignes.map((l) => l.platform).join(","));
ok(lignes[2].nature === NATURES.IMPORTEE && lignes[0].jours === 9 && lignes[1].jours === 11, "détail : chaque plateforme a sa nature et son âge");

console.log("2. Les cas de bord de la règle SQL");
const imp = { platform: "leboncoin", action: "publish", status: "published", handler_build: "releve-annonces", published_at: "2026-10-10T10:00:00Z", created_at: "2026-10-10T10:00:00Z", platform_listing_id: "111", listing_url: "https://www.leboncoin.fr/ad/x/111" };
ok(dateDuJob(imp, indexerDatesRelevees([{ platform: "leboncoin", listing_id: "111", publiee_le: "2026-08-01T08:00:00Z" }])) === "2026-08-01T08:00:00Z", "import : la date de mise en ligne RÉELLE relevée sur la plateforme (antérieure au job)");
ok(dateDuJob(imp, indexerDatesRelevees([{ platform: "leboncoin", listing_id: "111", publiee_le: "2026-10-20T08:00:00Z" }])) === imp.published_at, "import : date relevée POSTÉRIEURE au job → la date du job (comme la règle SQL)");
ok(dateDuJob(imp, new Map()) === imp.published_at, "import sans date relevée → la date du job");
ok(dateDuJob({ ...imp, handler_build: "x · v0.6.150" }, indexerDatesRelevees([{ platform: "leboncoin", listing_id: "111", publiee_le: "2026-08-01T08:00:00Z" }])) === imp.published_at, "dépôt FillSell : sa propre date, jamais la date relevée");
ok(dateDuJob({ ...imp, published_at: null }, new Map()) === imp.created_at, "published_at absent → created_at (coalesce, comme SQL)");
ok(annonceEnLigne({ item: {}, jobs: [{ ...imp, listing_url: "" }], platform: "leboncoin" }) === null, "un job publié SANS lien ne date rien (règle SQL)");
ok(annonceEnLigne({ item: {}, jobs: [{ ...imp, status: "cancelled" }], platform: "leboncoin" }) === null, "aucun job « published » → pas d'annonce en ligne datée");
ok(annonceEnLigne({ item: { listed_at_guess: "2026-10-01T00:00:00Z" }, jobs: [], platform: "vinted" }) === null, "Vinted sans annonce sur la fiche (vinted_item_id) → rien");
ok(annonceEnLigne({ item: { vinted_item_id: "123456789", listed_at_guess: "2026-10-01T00:00:00Z" }, jobs: [], platform: "vinted" })?.nature === NATURES.IMPORTEE, "Vinted sans job FillSell sur ce numéro → « importée » (trouvée au dressing)");
ok(natureDuJob({ action: "publish", handler_build: "2026-09-17T22:25:29Z+196afe6 · sync-dressing" }) === NATURES.IMPORTEE, "« … · sync-dressing » → importée");
ok(natureDuJob({ action: "publish", handler_build: "ebay-api-worker 3-lens" }) === NATURES.PUBLIEE, "eBay par l'API (FillSell) → publiée");

console.log("3. Le tri « Mise en ligne récente » et la pastille");
const { trierStock, libelleTri, libelleTriCourt, TRIS_STOCK } = await import("../src/utils/stockFiltres.js");
const R = await import("../src/stock/regles.js");
const items = [{ id: 1, d: Date.parse("2026-10-01") }, { id: 2, d: null }, { id: 3, d: Date.parse("2026-10-21") }, { id: 4, d: Date.parse("2026-10-01") }];
const tri = trierStock(items, "en_ligne_recent", { miseEnLigne: (it) => it.d }).map((it) => it.id).join(",");
ok(tri === "3,1,4,2", "tri : la plus récente d'abord, stable, date inconnue en dernier", tri);
ok(R.TRIS_PLANCHE.includes("en_ligne_recent") && TRIS_STOCK.includes("en_ligne_recent"), "le tri est dans la planche et dans la liste des tris");
ok(R.libelleTriPlanche("en_ligne_recent") === "Mise en ligne récente" && libelleTri("en_ligne_recent") === "Mise en ligne récente" && libelleTriCourt("en_ligne_recent") === "En ligne récent", "ses libellés (long et court)");
ok(R.pastilleCourte({ genre: "en_ligne", jours: aff.jours }).texte === "En ligne · 9 j", "pastille GIGN : « En ligne · 9 j » (au lieu de « En ligne · 42 j »)", R.pastilleCourte({ genre: "en_ligne", jours: aff.jours }).texte);
ok(R.ancienneteJours(GIGN, JOBS, EN_LIGNE, MAINTENANT, RELEVES) === 42 && R.estAncienne(42), "« Anciennes » / « Remonter » : toujours l'annonce la plus ancienne (ancienneteJours → la même règle)");

console.log("4. StockTab : la pastille, le filtre, le tri, les tranches");
const ST = lire("src/tabs/StockTab.jsx");
ok(/import \{ miseEnLigneAffichee, indexerDatesRelevees, datesParPlateforme \} from '\.\.\/\.\.\/supabase\/functions\/_shared\/mise-en-ligne\.js';/.test(ST), "StockTab lit le module partagé (une seule règle)");
ok(/const plateformeDatee = filtreDiffusion\?\.mode === 'en_ligne' \? filtreDiffusion\.platform : null;/.test(ST), "filtre « En ligne sur X » actif → la date de X");
const blocPastille = ST.slice(ST.indexOf("(31/10, lot H — XEWER) La pastille dit"), ST.indexOf("return { ...pastilleCourte({ genre: d.disparuDeVinted ? 'hors_ligne'"));
ok(/miseEnLigneArticle\(item, enLigneDatables\)/.test(blocPastille) && /onTap: \(\) => setDatesItem\(item\)/.test(blocPastille), "pastille « En ligne » : la date affichée, et un appui ouvre le détail");
ok(/joursAncienne = ancienneteJours\(/.test(blocPastille) && /const jours = pastille\.joursAncienne \?\?/.test(ST), "l'action « Remonter » garde l'âge de la plus ancienne");
ok(/trancheAnciennete\(infoFiltre\(i\)\.joursAffiches\)/.test(ST), "tranches d'ancienneté : la date que dit la carte");
ok(/miseEnLigne: \(i\) => \{ const m = miseEnLigneArticle\(i, indexEtat\.get\(String\(i\.id\)\)\?\.enLigne \?\? \[\]\); return m \? Date\.parse\(m\.date\) : null; \}/.test(ST), "tri « Mise en ligne récente » : la même date");
ok(/const SELECT_JOBS = "[^"]*platform_listing_id, handler_build"/.test(ST), "les jobs du Stock portent le numéro et la marque d'import");
ok(/<DatesEnLigne lang=\{lang\}/.test(ST) && /datesParPlateforme\(\{item:datesItem/.test(ST), "la feuille « En ligne depuis » est rendue avec datesParPlateforme");
ok(/infos\.push\(\{ cle: 'age', ton: 'neutre', onTap: \(\) => setDatesItem\(item\)/.test(ST), "menu « … » (vue Liste) : « En ligne sur … depuis … » ouvre le même détail");
const SP = lire("src/utils/syncPlateformes.js");
ok(/export async function lireDatesRelevees/.test(SP) && /lireToutesPages\(\(\) => supabase\s*\n?\s*\.from\('annonces_plateforme'\)\s*\n?\s*\.select\('id,platform,listing_id,publiee_le'\)/.test(SP), "dates relevées : lues par pages, une seule fois");

console.log("5. La feuille « En ligne depuis », rendue");
globalThis.document ??= { body: {} };
const { createServer } = await import("vite");
const vite = await createServer({
  root: RACINE, configFile: false, logLevel: "silent", appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(RACINE, "scripts/lib/portail-en-place.mjs") }] },
  ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const D = await vite.ssrLoadModule("/src/stock/DatesEnLigne.jsx");
  const texte = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
  const t = texte(renderToStaticMarkup(React.createElement(D.default, { lang: "fr", titre: GIGN.title, lignes, onFermer: () => {} })));
  ok(/En ligne depuis/.test(t) && t.includes(GIGN.title), "titre de la feuille et article");
  ok(/Leboncoin.*En ligne depuis 9 j.*Republiée par FillSell/.test(t), "Leboncoin : en ligne depuis 9 j, republiée par FillSell", t.slice(0, 300));
  ok(/Vinted.*En ligne depuis 11 j/.test(t) && /eBay.*En ligne depuis 42 j.*Importée \(déjà sur la plateforme\)/.test(t), "Vinted 11 j ; eBay 42 j, importée");
  ok(/21 oct\. 2026 à 16:52/.test(t), "la date à l'heure de Paris (21 oct. 2026 à 16:52)");
  ok(/Historique · 4 mises en ligne dont 3 republications/.test(t), "Leboncoin : historique 4 mises en ligne dont 3 republications");
  ok(!/Plus en ligne/.test(t), "aucune plateforme hors ligne inventée");
  const tf = texte(renderToStaticMarkup(React.createElement(D.default, { lang: "fr", titre: "x", lignes, plateformeFiltree: "vinted", onFermer: () => {} })));
  ok(/Filtre actif : la carte montre la date de Vinted\./.test(tf), "filtre actif : la feuille le dit");
  const te = texte(renderToStaticMarkup(React.createElement(D.default, { lang: "en", titre: "x", lignes, onFermer: () => {} })));
  ok(/Live since/.test(te) && /Reposted by FillSell/.test(te) && /Imported/.test(te), "anglais");
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(lire("src/stock/DatesEnLigne.jsx")), "aucun émoji dans la feuille");
} finally {
  await vite.close();
}

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
if (rouges) process.exit(1);
