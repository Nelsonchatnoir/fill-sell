// ═══════════════════════════════════════════════════════════════════════════
// BEEBS — « MES ANNONCES » NON PEINTE : LE FLUX TRANCHE SUR SA LISTE, UN MUR SE
// NOMME, ET LE VERDICT EST ÉCRIT DANS LE RUN (17/10/2026, Ornella)
//   npm run selftest:beebs-flux-mes-annonces
// ═══════════════════════════════════════════════════════════════════════════
// Le 17/10 à 08:32, la veille Beebs d'Ornella (0.6.114, son poste) a fini
// « incomplet » : « « Mes annonces » de Beebs n'a rien rendu alors que l'index
// public en montre 23 ». Les deux onglets lus à 0, puis le flux de la page n'a
// pas « concordé » — et RIEN ne disait pourquoi (le verdict n'allait qu'à la
// console). Deux défauts de règle, payés :
//   · la liste n'était « rendue » que si le compteur de Beebs (nb_products)
//     ÉGALAIT le total de l'index — or ils divergent dès qu'une annonce retirée
//     reste indexée (mesuré le 16/10 : compteur 5, index 7 ; 112 contre 113) ;
//   · la vérification anti-robot de Beebs (DataDome), servie SOUS LA MÊME
//     ADRESSE, se lisait « 0 annonce affichée » / « HTTP 403 », jamais nommée.
// Ce test EXÉCUTE la règle (jugerFluxMesAnnoncesBeebs, background.js) et le
// lecteur de page (lirePageIdentifiantsBeebs, beebs.js) tels que livrés — il
// relit la source, pas une copie — puis vérifie le câblage et les libellés.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { situationFinReleve } from "../src/annonces/finReleve.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const bg = lire("chrome-extension/background.js");
const beebs = lire("chrome-extension/content-scripts/beebs.js");

let ko = 0;
const ok = (cond, quoi, detail = "") => {
  if (cond) console.log(`  ✓ ${quoi}`);
  else { ko++; console.log(`  ✗ ${quoi}${detail ? ` — ${detail}` : ""}`); }
};
const extraire = (src, entete, fichier) => {
  const debut = src.indexOf(entete);
  const fin = src.indexOf("\n}\n", debut);
  if (debut < 0 || fin < 0) { console.error(`✗ « ${entete} » introuvable dans ${fichier}`); process.exit(1); }
  return src.slice(debut, fin + 3);
};

const juger = new Function(
  `${extraire(bg, "function jugerFluxMesAnnoncesBeebs({", "background.js")}; return jugerFluxMesAnnoncesBeebs;`,
)();
const lirePage = new Function(
  `${extraire(beebs, "function lirePageIdentifiantsBeebs(", "beebs.js")}; return lirePageIdentifiantsBeebs;`,
)();

// Des identifiants à la forme réelle (8 chiffres) ; aucun compte réel.
const ids = (n, depart = 34000000) => Array.from({ length: n }, (_, i) => String(depart + i));
const pageEnLigne = (liste, annoncees, extra = {}) => ({ page: "en_ligne", ok: true, ids: liste, annoncees, n: liste.length, ...extra });
const pageVerif = (liste, extra = {}) => ({ page: "en_verification", ok: true, ids: liste, n: liste.length, ...extra });
const flux = (...pages) => ({ ok: pages.every((p) => p.ok), pages });
// L'ANCIENNE règle (0.6.104 → 0.6.122), pour montrer ce qui change.
const ancienneRegle = (f, total, idsIndex, dejaReleves) => {
  const pEnLigne = f.pages.find((p) => p.page === "en_ligne");
  const pVerif = f.pages.find((p) => p.page === "en_verification");
  const index = new Set(idsIndex);
  return f.ok === true && pEnLigne?.ok === true && pVerif?.ok === true
    && Number(pEnLigne.annoncees) === Number(total)
    && (pEnLigne.ids ?? []).length > 0
    && (pEnLigne.ids ?? []).every((id) => index.has(String(id)))
    && (pVerif.ids ?? []).every((id) => dejaReleves.has(String(id)));
};

console.log("1. LA RÈGLE DU FLUX (jugerFluxMesAnnoncesBeebs, exécutée)");
{
  // Ornella, 15/10 : 23 en ligne, toutes dans l'index de 23.
  const i23 = ids(23);
  const r = juger({ flux: flux(pageEnLigne(i23, 23), pageVerif([])), totalIndex: 23, idsIndex: i23 });
  ok(r.rendue && r.motif === null && r.mur === null, "23/23 dans l'index de 23 → liste lue par le flux");
  ok(/^\[flux\] en ligne 23\/23, en vérification 0, index 23 → liste lue par le flux$/.test(r.trace), "la trace dit ce qui a été lu", r.trace);
}
{
  // 16/10, deux annonces retirées à 19:32 encore indexées à 23:04 : compteur 5, index 7.
  const i7 = ids(7);
  const f = flux(pageEnLigne(i7.slice(0, 5), 5), pageVerif([]));
  const r = juger({ flux: f, totalIndex: 7, idsIndex: i7 });
  ok(!ancienneRegle(f, 7, i7, new Set(i7)), "ANCIENNE règle : compteur 5 ≠ index 7 → page muette (le défaut)");
  ok(r.rendue, "règle du 17/10 : liste entière (5/5), chacune dans l'index de 7 → lue par le flux");
}
{
  // Liste « en ligne » tronquée (Beebs n'en rend que 60).
  const i113 = ids(113);
  const tronquee = juger({ flux: flux(pageEnLigne(i113.slice(0, 60), 112), pageVerif([])), totalIndex: 113, idsIndex: i113 });
  ok(!tronquee.rendue && /tronquée \(60\/112\)/.test(tronquee.motif ?? ""), "tronquée 60/112, index 113 → rien n'est conclu (comme avant)", tronquee.motif);
  const egale = juger({ flux: flux(pageEnLigne(i113.slice(0, 60), 113), pageVerif([])), totalIndex: 113, idsIndex: i113 });
  ok(egale.rendue, "tronquée 60/113, index 113 → lue (compteur = index, comme avant)");
}
{
  // « En vérification » : une connue entre au relevé, une inconnue est comptée.
  const i10 = ids(10);
  const connue = "33990001";
  const inconnue = "34190001";
  const connues = new Map([[connue, { url: `https://www.beebs.app/fr/p/${connue}`, titre: "connue", prix: 12, photo_url: null }]]);
  const f = flux(pageEnLigne(i10, 10), pageVerif([connue, inconnue]));
  const r = juger({ flux: f, totalIndex: 10, idsIndex: i10, connues });
  ok(!ancienneRegle(f, 10, i10, new Set(i10)), "ANCIENNE règle : une annonce en vérification non peinte → page muette");
  ok(r.rendue && r.verification.length === 1 && r.verification[0] === connue, "règle du 17/10 : la CONNUE entre au relevé (statut en vérification)");
  ok(r.inconnues === 1 && /dont 1 inconnue\(s\) de FillSell/.test(r.trace), "l'inconnue est comptée, jamais inventée", r.trace);
}
{
  const i5 = ids(5);
  const antiRobot = juger({
    flux: flux({ page: "en_ligne", ok: false, ids: [], n: 0, motif: "vérification anti-robot de Beebs (DataDome)", mur: "anti_robot" }, pageVerif([])),
    totalIndex: 5, idsIndex: i5,
  });
  ok(!antiRobot.rendue && antiRobot.mur === "anti_robot" && /anti-robot/.test(antiRobot.trace), "mur anti-robot → rien n'est conclu, le mur est NOMMÉ");
  const connexion = juger({
    flux: flux({ page: "en_ligne", ok: false, ids: [], n: 0, motif: "renvoyée vers www.beebs.app/fr/auth", mur: "connexion" }, pageVerif([])),
    totalIndex: 5, idsIndex: i5,
  });
  ok(!connexion.rendue && connexion.mur === "connexion", "renvoi vers la connexion → rien n'est conclu, mur « connexion »");
  const horsIndex = juger({ flux: flux(pageEnLigne([...i5.slice(0, 4), "39999999"], 5), pageVerif([])), totalIndex: 5, idsIndex: i5 });
  ok(!horsIndex.rendue && /absente de l'index/.test(horsIndex.motif ?? ""), "une annonce « en ligne » hors de l'index (autre vendeur ?) → rien n'est conclu");
  const sansCompteur = juger({ flux: flux(pageEnLigne(i5, undefined), pageVerif([])), totalIndex: 5, idsIndex: i5 });
  const compteurNul = juger({ flux: flux(pageEnLigne(i5, null), pageVerif([])), totalIndex: 5, idsIndex: i5 });
  ok(!sansCompteur.rendue && !compteurNul.rendue && /compteur de Beebs absent/.test(compteurNul.motif ?? ""),
    "compteur absent (ou null, qui vaudrait 0) → rien n'est conclu");
  const rienLu = juger({ flux: flux(pageEnLigne([], 0), pageVerif([])), totalIndex: 5, idsIndex: i5 });
  ok(!rienLu.rendue && /aucune annonce « en ligne »/.test(rienLu.motif ?? ""), "aucune annonce « en ligne » dans le flux, index 5 → rien n'est conclu");
  const verifIllisible = juger({
    flux: flux(pageEnLigne(i5, 5), { page: "en_verification", ok: false, ids: [], n: 0, motif: "1 clé(s) exacte(s) pour 0 carte(s)" }),
    totalIndex: 5, idsIndex: i5,
  });
  ok(!verifIllisible.rendue && /« en vérification » illisible/.test(verifIllisible.motif ?? ""), "« en vérification » illisible → rien n'est conclu");
  const sansOnglet = juger({ flux: { ok: false, pages: [pageEnLigne(i5, 5)] }, totalIndex: 5, idsIndex: i5 });
  ok(!sansOnglet.rendue && /onglet absent/.test(sansOnglet.motif ?? ""), "un onglet manquant → rien n'est conclu");
  const muet = juger({ flux: null, totalIndex: 5, idsIndex: i5 });
  ok(!muet.rendue && muet.motif === "flux sans réponse", "flux sans réponse → rien n'est conclu");
  ok(muet.verification.length === 0 && muet.inconnues === 0 && horsIndex.verification.length === 0,
    "rien n'est conclu → rien n'entre au relevé");
  ok([antiRobot, connexion, horsIndex, muet].every((x) => /→ rien n'est conclu \(/.test(x.trace)), "chaque refus porte SA raison dans la trace");
}

console.log("\n2. LE LECTEUR DE PAGE NOMME LE MUR (lirePageIdentifiantsBeebs, exécuté)");
{
  const chemin = "/fr/account/my-adverts";
  const auth = lirePage("en_ligne", chemin, "https://www.beebs.app/fr/auth?from=%2Ffr%2Faccount%2Fmy-adverts&step=sign-in", 200, "<html></html>");
  ok(!auth.ok && auth.mur === "connexion" && /renvoyée vers www\.beebs\.app\/fr\/auth/.test(auth.motif), "renvoi vers /fr/auth → mur « connexion »", JSON.stringify(auth));
  const accueil = lirePage("en_ligne", chemin, "https://www.beebs.app/fr", 200, "<html></html>");
  ok(!accueil.ok && accueil.mur === undefined, "renvoi vers une autre page → illisible, sans mur inventé");
  const datadome = lirePage("en_ligne", chemin, `https://www.beebs.app${chemin}`, 403,
    '<html><head><script src="https://ct.captcha-delivery.com/c.js"></script></head><body>Please enable JS and disable any ad blocker</body></html>');
  ok(!datadome.ok && datadome.mur === "anti_robot" && /anti-robot/.test(datadome.motif), "403 DataDome sous la même adresse → mur « anti_robot »", JSON.stringify(datadome));
  const http403 = lirePage("en_ligne", chemin, `https://www.beebs.app${chemin}`, 403, "<html>Forbidden</html>");
  ok(!http403.ok && http403.motif === "HTTP 403" && http403.mur === undefined, "403 sans vérification anti-robot → « HTTP 403 », comme avant");
  ok(/pages: pages\.map\(\(p\) => \(\{ \.\.\.p, n: p\.ids\.length \}\)\)/.test(beebs), "le mur voyage avec la page jusqu'au background (lireIdsMesAnnoncesBeebs)");
  ok(/^const BEEBS_BUILD = "2026-10-17-mur-nomme /m.test(beebs), "empreinte du content script à jour");
}

console.log("\n3. LE CÂBLAGE DU RELEVÉ (background.js)");
{
  const debut = bg.indexOf("async function releverAnnoncesPlateforme(");
  const releve = bg.slice(debut, bg.indexOf("\n}\n", debut));
  const lecteur = bg.slice(bg.indexOf("async function releverLiensAnnoncesDansOnglet("), bg.indexOf("async function releverAnnoncesPlateforme("));
  ok(/const murAntiRobot = \(\) => plateforme === "beebs" && \(/.test(lecteur) && /captcha-delivery/.test(lecteur) && /anti_robot: murAntiRobot\(\),/.test(lecteur),
    "la page de travail voit la vérification anti-robot (mêmes repères que estPageBotShieldBeebs)");
  ok(/if \(platform === "beebs" && r\?\.page\?\.anti_robot === true\) beebsAntiRobot = true;/.test(releve), "le relevé la retient");
  ok(/&select=listing_id,url,titre,prix,photo_url&order=vu_le\.desc&limit=200/.test(releve) && /connuesBeebs\.set\(id, \{/.test(releve),
    "les annonces connues arrivent avec leurs champs");
  ok(/annonces\.set\(id, \{ \.\.\.connuesBeebs\.get\(id\), listing_id: id, statut: "en_verification", source_releve: "flux_mes_annonces" \}\)/.test(releve),
    "une annonce « en vérification » du flux entre avec SES champs, statut en vérification");
  ok(/listeRendue: beebsPageMuette == null && !beebsAntiRobot/.test(releve), "un mur anti-robot non levé par le flux laisse la liste non rendue");
  ok(/comptePeutEtreVide = dejaConnues === 0 && !beebsAntiRobot;/.test(releve), "un mur anti-robot ne prouve jamais un compte vide");
  ok(/\.\.\.\(platform === "beebs" && beebsFluxTrace \? \[beebsFluxTrace\] : \[\]\)/.test(releve), "le verdict du flux part TOUJOURS dans le run");
}

console.log("\n4. LES LIBELLÉS : NOMMÉS, LUS PAR L'APP, JAMAIS PRIS POUR « HORS LISTE »");
{
  const antiRobot = bg.match(/"(\[anti_robot\] Beebs a montré [^"]+)"/)?.[1];
  const connexion = bg.match(/"(\[pas_connecte\] « Mes annonces » de Beebs [^"]+)"/)?.[1];
  ok(Boolean(antiRobot && connexion), "les deux libellés existent dans background.js");
  const run = (absent) => `[incomplet] ${absent} — rien n'est conclu disparu · [défilement] page : 0 annonce(s) affichée(s) (1 défilement(s), la page n'en affichait pas plus)`;
  ok(situationFinReleve({ erreur: run(antiRobot) }) === "anti_robot", "« [anti_robot] » → situation anti_robot (l'app dit que la plateforme a bloqué la lecture)");
  ok(situationFinReleve({ erreur: run(connexion) }) === "pas_connecte", "« [pas_connecte] » → situation pas_connecte (« Connecte-toi à Beebs sur ton ordinateur »)");
  ok(situationFinReleve({ erreur: run(`« Mes annonces » de Beebs n'a rien rendu alors que l'index public en montre 23`) }) === "echec",
    "page muette sans mur : situation inchangée (échec)");
  // releve_hors_liste (prod) : like '%n''a pas rendu sa liste%' or '%Hub vendeur n''a pas rendu son compteur%'.
  const horsListe = (t) => /n'a pas rendu sa liste|Hub vendeur n'a pas rendu son compteur/.test(t);
  ok(!horsListe(antiRobot) && !horsListe(connexion), "aucun libellé neuf n'est lu « hors liste » par le serveur (le relevé importe comme avant)");
}

if (ko) { console.log(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\n✓ beebs-flux-mes-annonces : le flux tranche sur sa liste, le mur se nomme, le verdict est écrit");
