// ═══════════════════════════════════════════════════════════════════════════
// BEEBS — UN FANTÔME DE L'INDEX N'ENTRE JAMAIS « EN LIGNE » ; UNE LISTE « EN LIGNE »
// VIDE NE PROUVE JAMAIS SEULE UN RETRAIT (14/11/2026, compte 13e274de, Cloud)
//   npm run selftest:beebs-index-fantome
// ═══════════════════════════════════════════════════════════════════════════
// Le 14/11 de 02:05 à 09:19, chaque relevé Beebs du compte 13e274de a lu « Mes annonces » de Beebs (page peinte :
// 0, 2, 3, 10… 17 annonces) et l'index public de Beebs (6, 8, 9, 16… 23) : TOUJOURS 6 de plus — 27214557,
// 27214877, 27214883, 27214891, 27214895, 27214901, des annonces de mai 2025 dont la page est « 404 - Oups, page
// perdue ! » (relue le 14/11 vers 10:30). Le relevé les faisait entrer « en ligne » (« une annonce que SEUL l'index
// connaît est forcément visible »), le moteur en faisait des fiches (import), la personne les supprimait du stock,
// le retrait concluait « déjà hors ligne » (vrai), et le relevé suivant les réimportait : 149 publications importées
// annulées, 66 retraits en 4 heures, sur 6 annonces fantômes (+ 2 retirées entre 02:06 et 02:15).
// Les deux lectures ne se contredisaient pas : « Mes annonces » (en_ligne:0/0 à 02:17, 1/1 après le dépôt de 02:36,
// 2/2, 3/3, 10/10 ensuite) suivait EXACTEMENT les dépôts neufs ; c'est l'index qui gardait des fantômes.
// DEUX RÈGLES, pour tous les comptes :
//   1. (relevé, background.js jugerIndexSeulBeebs) une annonce que SEUL l'index porte n'entre « en ligne » que si
//      « Mes annonces » ne peut pas la montrer : liste « en ligne » tronquée ou illisible. Lue EN ENTIER (n = compteur
//      de Beebs, 0/0 compris), une annonce absente des deux onglets est un fantôme : jamais importée, comptée, nommée ;
//   2. (retrait, beebs.js preuveAbsenceMesAnnonces) une liste « en ligne » VIDE (0/0) ne prouve jamais seule
//      « déjà hors ligne » : il faut aussi la page de l'annonce, 404 sans fiche (celle déjà ouverte par le retrait,
//      sinon relue) — page en vente ou illisible : rien n'est conclu.
// Ce test EXÉCUTE les fonctions telles que livrées (il relit la source), puis vérifie le câblage.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preuveRetraitBeebsValide, verdictClotureRetraitBeebs } from "../supabase/functions/_shared/beebs-preuve-retrait.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const bg = lire("chrome-extension/background.js");
const bj = lire("chrome-extension/content-scripts/beebs.js");

let ko = 0;
const ok = (cond, quoi, detail = "") => {
  if (cond) console.log(`  ✓ ${quoi}`);
  else { ko++; console.log(`  ✗ ${quoi}${detail ? ` — ${detail}` : ""}`); }
};
const extraire = (src, entete, fichier) => {
  const debut = src.indexOf(entete);
  const fin = src.indexOf("\n}\n", debut);
  if (debut < 0 || fin < 0) return null;
  return src.slice(debut, fin + 3);
};

// Les numéros réels du cas (numéros d'annonce Beebs, aucun compte).
const FANTOMES = ["27214557", "27214877", "27214883", "27214891", "27214895", "27214901"];
const VERIF = ["33466824", "33468466", "33468667", "33469875"];
const NEUVES = ["34355030", "34355032", "34355058", "34355083", "34355084", "34355086", "34355091", "34355095", "34355097",
  "34355100", "34355315", "34355337", "34355366", "34355397", "34355451", "34355504", "34355541"];
const pageEnLigne = (ids, annoncees, extra = {}) => ({ page: "en_ligne", ok: true, ids, n: ids.length, annoncees, ...extra });
const pageVerif = (ids, extra = {}) => ({ page: "en_verification", ok: true, ids, n: ids.length, ...extra });
const flux = (...pages) => ({ ok: pages.every((p) => p.ok), lu_le: "2026-11-14T01:17:53.925Z", ids: pages.flatMap((p) => p.ids ?? []), pages });

console.log("1. RELEVÉ : UNE ANNONCE QUE SEUL L'INDEX PORTE (jugerIndexSeulBeebs, background.js, exécutée)");
const srcJuge = extraire(bg, "function jugerIndexSeulBeebs({", "background.js");
ok(srcJuge !== null, "la règle existe (avant le correctif : toute annonce de l'index seul entrait « en ligne »)");
const juger = srcJuge ? new Function(`${srcJuge}; return jugerIndexSeulBeebs;`)() : null;
if (juger) {
  // 14/11 02:37 : page « en ligne » peinte 0, « en vérification » 4, index 6 (les six fantômes).
  const r0 = juger({ flux: flux(pageVerif(VERIF), pageEnLigne([], 0)), idsIndexSeuls: FANTOMES });
  ok(r0.lue === true && r0.admises.length === 0 && r0.fantomes.length === 6 && FANTOMES.every((id) => r0.fantomes.includes(id)),
    "14/11 02:37 : « en ligne » 0/0 lue en entier, « en vérification » 4 → les 6 de l'index seul sont des fantômes, aucune importée", JSON.stringify(r0));
  ok(/fant[ôo]me/i.test(r0.trace) && r0.trace.includes("27214557") && /0\/0/.test(r0.trace), "la trace du run nomme les fantômes et la lecture (0/0)", r0.trace);
  // 14/11 09:18 : « en ligne » 17/17 (les dépôts neufs), index 23.
  const r1 = juger({ flux: flux(pageVerif(VERIF), pageEnLigne(NEUVES, 17)), idsIndexSeuls: FANTOMES });
  ok(r1.lue && r1.admises.length === 0 && r1.fantomes.length === 6, "14/11 09:18 : 17/17 lues, index 23 → 6 fantômes écartés", JSON.stringify(r1));
  // Page peinte incomplète (fenêtre minimisée) : l'index en montre que la page n'a pas peintes, le flux les a.
  const r2 = juger({ flux: flux(pageVerif([]), pageEnLigne(NEUVES, 17)), idsIndexSeuls: NEUVES.slice(5) });
  ok(r2.lue && r2.admises.length === 12 && r2.fantomes.length === 0, "page peinte à moitié : les annonces du flux « en ligne » entrent (comme avant)", JSON.stringify(r2));
  // Gros compte : « en ligne » tronquée à 60 (Joséphine, a99e2876 : 60/98) → l'index comble, comme avant.
  const soixante = Array.from({ length: 60 }, (_, k) => String(34000000 + k));
  const reste = Array.from({ length: 38 }, (_, k) => String(34100000 + k));
  const r3 = juger({ flux: flux(pageVerif([]), pageEnLigne(soixante, 98)), idsIndexSeuls: reste });
  ok(r3.lue === false && r3.admises.length === 38 && r3.fantomes.length === 0, "liste « en ligne » tronquée (60/98) : l'index comble le reste, rien n'est écarté", JSON.stringify(r3));
  // Flux illisible (anti-robot, connexion, sans réponse) : comme avant, rien n'est écarté.
  const r4 = juger({ flux: flux(pageVerif([]), { page: "en_ligne", ok: false, ids: [], n: 0, motif: "vérification anti-robot de Beebs (DataDome)", mur: "anti_robot" }), idsIndexSeuls: FANTOMES });
  ok(r4.lue === false && r4.admises.length === 6, "« en ligne » illisible : rien n'est écarté (jamais sur une lecture ratée)", JSON.stringify(r4));
  const r5 = juger({ flux: null, idsIndexSeuls: FANTOMES });
  ok(r5.lue === false && r5.admises.length === 6, "flux sans réponse : rien n'est écarté");
  const r6 = juger({ flux: flux(pageVerif([], { ok: false, motif: "1 clé(s) exacte(s) pour 2 carte(s)" }), pageEnLigne([], 0)), idsIndexSeuls: FANTOMES });
  ok(r6.lue === false && r6.admises.length === 6, "« en vérification » illisible : rien n'est écarté (elle seule sépare une annonce en vérification)");
  const r7 = juger({ flux: flux(pageVerif([]), pageEnLigne(NEUVES, null)), idsIndexSeuls: FANTOMES });
  ok(r7.lue === false && r7.admises.length === 6, "sans compteur de Beebs : rien n'est écarté");
  // Une annonce de l'index seul que le flux range « en vérification » : ni en ligne, ni fantôme.
  const r8 = juger({ flux: flux(pageVerif([VERIF[0]]), pageEnLigne([], 0)), idsIndexSeuls: [VERIF[0], FANTOMES[0]] });
  ok(r8.lue && r8.admises.length === 0 && r8.fantomes.length === 1 && r8.fantomes[0] === FANTOMES[0] && r8.enVerification.includes(VERIF[0]),
    "annonce de l'index seul « en vérification » dans le flux : jamais « en ligne », jamais fantôme", JSON.stringify(r8));
  const r9 = juger({ flux: flux(pageVerif([]), pageEnLigne([], 0)), idsIndexSeuls: [] });
  ok(r9.lue === true && r9.admises.length === 0 && r9.fantomes.length === 0 && r9.trace === null, "rien que l'index seul porte : aucune trace");
}

console.log("\n2. RELEVÉ : LE CÂBLAGE (releverAnnoncesPlateforme)");
{
  const debut = bg.indexOf("async function releverAnnoncesPlateforme(");
  const releve = bg.slice(debut, bg.indexOf("\n}\n", debut));
  const bloc = releve.slice(releve.indexOf("let ajoutees = 0;"), releve.indexOf("« MES ANNONCES » PEINTE VIDE : LE FLUX DE LA PAGE TRANCHE"));
  ok(/jugerIndexSeulBeebs\(\{/.test(bloc), "l'index seul passe par la règle avant d'entrer au relevé");
  ok(/sendMessageToTab\(dernierTabId, \{ type: "BEEBS_IDS_MES_ANNONCES" \}, 60_000\)/.test(bloc), "« Mes annonces » relue par la commande existante (lecture pure), seulement quand l'index seul porte quelque chose");
  ok(/if \(!juge(?:Index)?\.admises\.includes\(id\)\) continue;|admisesIndex\.has\(/.test(bloc) && /source_releve: "index_public"/.test(bloc),
    "un fantôme n'est jamais posé « en ligne »");
  ok(/beebsIndexSeulTrace/.test(releve) && /\.\.\.\(platform === "beebs" && beebsIndexSeulTrace \? \[beebsIndexSeulTrace\] : \[\]\)/.test(releve), "les fantômes sont nommés dans le run");
  ok(/total: Number\.isFinite\(beebsTotalIndex\) \? beebsTotalIndex - beebsFantomes : beebsTotalIndex/.test(releve),
    "la couverture compte sans les fantômes (le relevé ne se dit pas partiel à vie)");
  ok(/const flux = fluxMesAnnoncesBeebs \?\? await sendMessageToTab\(dernierTabId, \{ type: "BEEBS_IDS_MES_ANNONCES" \}, 60_000\)/.test(releve),
    "page muette : le flux déjà lu sert, jamais deux lectures");
}

console.log("\n3. RETRAIT : UNE LISTE « EN LIGNE » VIDE NE PROUVE JAMAIS SEULE (preuveAbsenceMesAnnonces, beebs.js, exécutée)");
const fn = (nom) => {
  const d = bj.indexOf(`async function ${nom}(`) >= 0 ? bj.indexOf(`async function ${nom}(`) : bj.indexOf(`function ${nom}(`);
  if (d < 0) throw new Error(`${nom} absent de beebs.js`);
  return bj.slice(d, bj.indexOf("\n}\n", d) + 2);
};
const src = [bj.match(/^const REGLE_SUPPRESSION_ENVOYEE_404 = .*$/m)?.[0] ?? "", fn("produitVenduSurBeebs"), fn("jugerConstats404Beebs"),
  fn("jugerConstats404ApresEnvoi"), fn("resumeLectureMesAnnonces"), fn("preuveAbsenceMesAnnonces"), fn("preuveRetraitDepuis")].join("\n");
const fabrique = (lecture, { pageAnnonce = { http: null, produit: false }, index = null } = {}) => {
  const appels = { page: 0 };
  const api = new Function("lireIdsMesAnnoncesBeebs", "sleep", "pageAnnonceBeebs", "presenceIndexBeebs",
    `${src}; return { preuveAbsenceMesAnnonces, preuveRetraitDepuis };`)(
    async () => lecture, async () => {}, async () => { appels.page++; return pageAnnonce; }, async () => index);
  return { ...api, appels };
};
const t = () => {};
// 14/11 02:17:53 (retrait 5d255a09 de 27214557) : « en vérification » 4, « en ligne » 0/0, lue par fetch.
const L00 = flux(pageVerif(VERIF), pageEnLigne([], 0));
{
  const f = fabrique(L00); // page de l'annonce ILLISIBLE (403, sans réponse)
  const r = await f.preuveAbsenceMesAnnonces("27214557", t, { constats404: [] });
  ok(r.verdict === "illisible", "0/0 et page de l'annonce illisible : rien n'est conclu (avant : « absente » sur la liste vide seule)", JSON.stringify({ v: r.verdict }));
  ok(f.appels.page === 1, "la page de l'annonce est relue quand le retrait ne l'a pas déjà ouverte");
}
{
  const f = fabrique(L00, { pageAnnonce: { http: 404, produit: false } });
  const r = await f.preuveAbsenceMesAnnonces("27214557", t, { constats404: [] });
  ok(r.verdict === "absente" && r.lecture?.preuve_annonce?.page_http === 404 && r.lecture.preuve_annonce.produit === false
    && r.lecture.preuve_annonce.en_ligne === "0/0" && r.lecture.preuve_annonce.en_verification === "complete" && r.lecture.preuve_annonce.regle === "liste_vide_page_404",
    "0/0 + page « 404 - Oups, page perdue ! » sans fiche (relevé réel du 14/11) → déjà hors ligne, AVEC la preuve de la page", JSON.stringify(r.lecture?.preuve_annonce));
  const preuve = f.preuveRetraitDepuis(r.lecture, "27214557", "deja_absente");
  ok(preuve.source === "mes_annonces" && preuve.absente === true && preuve.annonce?.regle === "liste_vide_page_404"
    && preuveRetraitBeebsValide({ preuve_retrait: preuve }) && verdictClotureRetraitBeebs({ preuve_retrait: preuve }, "2026-11-14T12:00:00Z+abc1234 · v0.6.189") === "ok",
    "la preuve écrite est acceptée par le serveur tel qu'il est (aucun déploiement de fonction requis)", JSON.stringify(preuve.annonce));
}
{
  // La page DÉJÀ ouverte par le retrait (chemin 1) tranche sans nouvelle lecture.
  const f = fabrique(L00, { pageAnnonce: { http: 200, produit: true, sku: "27214557", disponibilite: "InStock" } });
  const r = await f.preuveAbsenceMesAnnonces("27214557", t, { constats404: [], pageCourante: { http: 404, produit: false, par: "page_courante" } });
  ok(r.verdict === "absente" && r.lecture?.preuve_annonce?.par === "page_courante" && f.appels.page === 0,
    "page courante du retrait (404 sans fiche) : preuve sans relecture réseau", JSON.stringify({ v: r.verdict, pa: r.lecture?.preuve_annonce, appels: f.appels }));
}
{
  const f = fabrique(L00, { pageAnnonce: { http: 200, produit: true, sku: "27214557", disponibilite: "InStock" } });
  const r = await f.preuveAbsenceMesAnnonces("27214557", t, { constats404: [] });
  ok(r.verdict === "illisible" && r.lecture?.liste_vide?.page_http === 200 && Array.isArray(r.lecture?.constats404) && r.lecture.constats404.length === 0,
    "0/0 mais la page est EN VENTE (200, fiche) : contradiction, jamais « hors ligne » (autre compte connecté ?)", JSON.stringify({ v: r.verdict, lv: r.lecture?.liste_vide }));
}
{
  const f = fabrique(L00, { pageAnnonce: { http: 200, produit: true, sku: "27214557", disponibilite: "SoldOut" } });
  const r = await f.preuveAbsenceMesAnnonces("27214557", t, {});
  const preuve = f.preuveRetraitDepuis(r.lecture, "27214557", "deja_absente");
  ok(r.verdict === "absente" && preuve.source === "page_produit" && preuve.vendue === true && preuveRetraitBeebsValide({ preuve_retrait: preuve }),
    "0/0 et la fiche du numéro EXACT dit « SoldOut » : plus achetable, preuve « page_produit »", JSON.stringify(preuve));
}
{
  const f = fabrique(L00, { pageAnnonce: { http: 404, produit: false } });
  const r = await f.preuveAbsenceMesAnnonces("33466824", t, {});
  ok(r.verdict === "presente", "0/0 mais l'annonce est « en vérification » : présente (un 404 de vérification ne prouve rien)");
}
{
  // Une liste NON vide lue en entier : la règle du 03/10, inchangée (aucune lecture de la page).
  const f = fabrique(flux(pageVerif(VERIF), pageEnLigne(NEUVES, 17)));
  const r = await f.preuveAbsenceMesAnnonces("27214557", t, { constats404: [] });
  ok(r.verdict === "absente" && f.appels.page === 0, "liste « en ligne » non vide lue en entier (17/17) : absente, comme avant", JSON.stringify({ v: r.verdict, appels: f.appels }));
}

console.log("\n4. RETRAIT : LE CÂBLAGE (deleteListing, pageCouranteAnnonceBeebs)");
{
  const dl = bj.slice(bj.indexOf("async function deleteListing(job)"), bj.indexOf("// ⚠️⚠️ AUCUNE MESURE DE LAYOUT DANS CE FICHIER"));
  const c1 = dl.slice(dl.indexOf("if (surAnnonce()) {"), dl.indexOf("// ── CHEMIN 2"));
  ok(/ctxPreuve\.pageCourante = pageCouranteAnnonceBeebs\(idCible\);/.test(c1)
    && c1.indexOf("ctxPreuve.pageCourante = pageCouranteAnnonceBeebs(idCible);") < c1.indexOf("await preuveAbsenceMesAnnonces(idCible, t, ctxPreuve)"),
    "chemin 1 : la page déjà ouverte est lue AVANT la preuve");
  ok(/preuve\.lecture\?\.liste_vide \? MESSAGE_LISTE_VIDE_BEEBS/.test(c1) && /const MESSAGE_LISTE_VIDE_BEEBS =/.test(bj), "le message dit la vraie raison (liste vide, page non prouvée)");
  const m = bj.match(/const MESSAGE_LISTE_VIDE_BEEBS =\s*([\s\S]*?);\n/)?.[1] ?? "";
  ok(/rien n'a été touché/.test(m) && !/encore en vente|reste en vente/.test(m), "message vrai, jamais « encore en vente »", m);
  // pageCouranteAnnonceBeebs exécutée sur une page simulée (aucun réseau).
  const srcPc = extraire(bj, "function pageCouranteAnnonceBeebs(", "beebs.js");
  ok(srcPc !== null, "pageCouranteAnnonceBeebs existe");
  if (srcPc) {
    const pc = (pathname, statut, titre, ldjson = []) => new Function("location", "performance", "document", "idAnnonceBeebs", "ficheProduitBeebs",
      `${srcPc}; return pageCouranteAnnonceBeebs;`)(
      { pathname },
      { getEntriesByType: () => (statut == null ? [] : [{ responseStatus: statut }]) },
      { title: titre, querySelectorAll: () => ldjson.map((j) => ({ textContent: JSON.stringify(j) })) },
      new Function(`${extraire(bj, "function idAnnonceBeebs(", "beebs.js")}; return idAnnonceBeebs;`)(),
      new Function(`${extraire(bj, "function ficheProduitBeebs(", "beebs.js")}; return ficheProduitBeebs;`)());
    const p404 = pc("/fr/p/27214557", 404, "404 - Beebs | Achat et vente d’occasion pour la famille")("27214557");
    ok(p404?.http === 404 && p404.produit === false && p404.par === "page_courante", "page 404 réelle du 14/11 : 404 sans fiche", JSON.stringify(p404));
    const pTitre = pc("/fr/p/27214557", 0, "404 - Beebs | Achat et vente d’occasion pour la famille")("27214557");
    ok(pTitre?.http === 404, "statut HTTP absent : le titre « 404 - » de Beebs suffit", JSON.stringify(pTitre));
    const p200 = pc("/fr/p/34355504-sac", 200, "Sac", [{ "@type": "Product", sku: "34355504", offers: { availability: "https://schema.org/InStock" } }])("34355504");
    ok(p200?.http === 200 && p200.produit === true && p200.disponibilite === "InStock", "annonce en vente : 200 avec sa fiche", JSON.stringify(p200));
    ok(pc("/fr/p/34355504-sac", 200, "Sac")("27214557") === null, "page d'une AUTRE annonce : rien");
    ok(pc("/fr/p/27214557", 403, "beebs.app")("27214557") === null, "mur anti-robot (403) : rien, la lecture réseau prend le relais");
    ok(pc("/fr/p/27214557", null, "Beebs")("27214557") === null, "statut et titre muets : rien");
  }
}

console.log(ko ? `\n✗ ${ko} vérification(s) en échec` : "\n✓ fantômes de l'index écartés, liste vide jamais une preuve seule");
process.exit(ko ? 1 : 0);
