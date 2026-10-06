// ── AUTOTEST : UN RETRAIT BLOQUÉ PAR UNE CONNEXION SE VOIT (05/10) ──────────
// Cas réel (Joséphine) : 8 retraits Opla après des ventes, en needs_user sur
// une session Opla fermée (needs_user_source='connexion', mur_geste,
// attente_session, « Connexion Opla requise : … »). Les annonces restaient en
// ligne et l'app n'en disait RIEN — risque de double vente.
// Ce qu'il garantit (src/utils/retraitsBloques.js) :
//   1. les 8 retraits Opla needs_user sur un mur de connexion sont comptés,
//      groupés sous Opla, avec le titre de la fiche vendue ;
//   2. un retrait 'pending' qui attend une session (attente_session) compte ;
//   3. un retrait en échec d'une AUTRE nature n'est pas compté, une
//      PUBLICATION bloquée par une connexion non plus (elle a ses chemins) ;
//      ni un blocage anti-robot, ni un needs_user de plus de 30 jours : le
//      même mur que relancer_jobs_connexion, jamais un bouton sans relance ;
//   4. une fiche supprimée (inventaire_id null) garde le titre du job ;
//   5. un retrait plus récent qui a abouti éteint l'ancien ;
//   6. les phrases (bandeau, carte, « À régler ») et le câblage du Stock :
//      bandeau en tête, ligne « À régler » comptée, carte vendue avec
//      « Me connecter », Opla reconnue par le mur ancré de la carte.
//
//   node --import ./scripts/loader-ext.mjs scripts/retraits-bloques-connexion-selftest.mjs
import { readFileSync } from "node:fs";
import {
  retraitsBloquesParConnexion, retraitBloqueParConnexion, texteRetraitsBloques, ligneCarteRetraitBloque, ligneARegler,
} from "../src/utils/retraitsBloques.js";

let echecs = 0;
const ok = (titre, condition, detail) => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail !== undefined ? ` — vu : ${JSON.stringify(detail)}` : ""}`); }
};

const MSG_OPLA = "Connexion Opla requise : reconnecte-toi à Opla dans Chrome sur ton ordinateur, puis le retrait repartira tout seul. Ton annonce est intacte.";
const retraitOpla = (k) => ({
  id: `opla-${k}`, inventaire_id: 100 + k, platform: "opla", action: "delete", status: "needs_user",
  error: MSG_OPLA, title: `Titre job ${k}`, listing_url: `https://www.opla.co/annonce/${k}`,
  created_at: `2026-10-05T08:0${k}:00Z`,
  platform_fields: {
    needs_user_source: "connexion",
    mur_geste: { type: "connexion", at: "2026-10-05T08:30:00Z" },
    attente_session: { platform: "opla", observations: 3 },
  },
});
const fiches = new Map();
for (let k = 0; k < 8; k++) fiches.set(String(100 + k), { id: 100 + k, title: `Robe ${k}`, statut: "vendu" });
fiches.set("200", { id: 200, title: "Pull vendu", statut: "vendu" });
fiches.set("300", { id: 300, title: "Jean vendu", statut: "vendu" });
fiches.set("400", { id: 400, title: "Veste en stock", statut: "stock" });

const jobs = [
  ...Array.from({ length: 8 }, (_, k) => retraitOpla(k)),
  // 2. Vinted : retrait en attente de session (pending).
  { id: "vinted-attente", inventaire_id: 200, platform: "vinted", action: "delete", status: "pending",
    error: "En attente de ta connexion à Vinted : …", created_at: "2026-10-05T09:00:00Z",
    listing_url: "https://www.vinted.fr/items/1", platform_fields: { attente_session: { platform: "vinted" } } },
  // 3. Retrait en échec d'une autre nature → exclu.
  { id: "lbc-echec", inventaire_id: 300, platform: "leboncoin", action: "delete", status: "failed",
    error: "Annonce introuvable sur Leboncoin", created_at: "2026-10-05T09:01:00Z", platform_fields: {} },
  // 3. Retrait needs_user SANS mur de connexion → exclu.
  { id: "beebs-question", inventaire_id: 300, platform: "beebs", action: "delete", status: "needs_user",
    error: "Est-ce la bonne annonce ?", created_at: "2026-10-05T09:02:00Z", platform_fields: { needs_user_source: "question" } },
  // 3. PUBLICATION bloquée par une connexion → exclue.
  { id: "pub-beebs", inventaire_id: 400, platform: "beebs", action: "publish", status: "needs_user",
    error: "Connexion Beebs requise : …", created_at: "2026-10-05T09:03:00Z", platform_fields: { needs_user_source: "connexion" } },
  // 4. Fiche supprimée : inventaire_id null → titre du job.
  { id: "lbc-supprimee", inventaire_id: null, platform: "leboncoin", action: "delete", status: "needs_user",
    error: "Connexion Leboncoin requise : …", title: "Lampe de chevet", created_at: "2026-10-05T09:04:00Z",
    listing_url: "https://www.leboncoin.fr/ad/x/9", platform_fields: {} },
  // 5. eBay : ancien retrait bloqué, puis un retrait plus récent qui a abouti
  //    sur la MÊME annonce → l'ancien ne compte plus.
  { id: "ebay-ancien", inventaire_id: 300, platform: "ebay", action: "delete", status: "needs_user",
    error: "Connexion eBay requise : …", listing_url: "https://www.ebay.fr/itm/5", created_at: "2026-10-04T09:00:00Z",
    platform_fields: { needs_user_source: "connexion" } },
  { id: "ebay-recent", inventaire_id: 300, platform: "ebay", action: "delete", status: "deleted",
    listing_url: "https://www.ebay.fr/itm/5", created_at: "2026-10-05T07:00:00Z", platform_fields: {} },
  // Bruit : publications, republications publiées.
  { id: "pub-ok", inventaire_id: 100, platform: "opla", action: "publish", status: "published", created_at: "2026-09-20T09:00:00Z", platform_fields: {} },
  { id: "repub", inventaire_id: 400, platform: "vinted", action: "republish", status: "pending", created_at: "2026-10-05T09:05:00Z", platform_fields: { attente_session: {} } },
];

const MAINTENANT = Date.parse("2026-10-05T12:00:00Z");
const r = retraitsBloquesParConnexion({ jobs, fiches, maintenant: MAINTENANT });
const groupe = (p) => r.parPlateforme.find((g) => g.platform === p);

console.log("\n── 1. Les 8 retraits Opla de Joséphine ────────────────────────");
ok("Opla : 8 retraits bloqués", groupe("opla")?.lignes.length === 8, groupe("opla")?.lignes.length);
ok("Opla : tous vendus", groupe("opla")?.nVendus === 8);
ok("Opla : le titre vient de la FICHE", groupe("opla")?.lignes.every((l) => /^Robe \d$/.test(l.titre)), groupe("opla")?.lignes.map((l) => l.titre));
ok("Opla : le plus récent d'abord", groupe("opla")?.lignes[0].job.id === "opla-7");
ok("le message seul suffit (sans marqueur)", retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: MSG_OPLA, platform_fields: {} }));
ok("mur_geste seul suffit", retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: "", platform_fields: { mur_geste: { type: "connexion" } } }));
ok("« Reconnexion X requise » compte aussi", retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: "Reconnexion eBay requise : …", platform_fields: {} }));
ok("un mot pris au milieu ne compte pas", !retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: "Vérifie ta connexion internet", platform_fields: {} }));

console.log("\n── 2. Vinted en attente de session ────────────────────────────");
ok("Vinted : 1 retrait 'pending' attente_session compté", groupe("vinted")?.lignes.length === 1 && groupe("vinted").lignes[0].job.id === "vinted-attente");
ok("un 'pending' SANS attente_session ne compte pas", !retraitBloqueParConnexion({ action: "delete", status: "pending", error: "En attente de ta connexion à Vinted", platform_fields: {} }));

console.log("\n── 3. Ce qui n'entre pas ──────────────────────────────────────");
const ids = r.parPlateforme.flatMap((g) => g.lignes.map((l) => l.job.id));
ok("retrait 'failed' d'une autre nature exclu", !ids.includes("lbc-echec"));
ok("retrait needs_user sans mur de connexion exclu", !ids.includes("beebs-question"));
ok("publication bloquée par une connexion exclue", !ids.includes("pub-beebs"));
ok("republication en attente de session exclue", !ids.includes("repub"));
ok("un 'failed' même avec le message de connexion n'entre pas", !retraitBloqueParConnexion({ action: "delete", status: "failed", error: "Connexion Opla requise", platform_fields: { needs_user_source: "connexion" } }));
// Le MÊME mur que relancer_jobs_connexion : jamais un « Me connecter » sur un
// job que le serveur ne relancera pas.
ok("blocage anti-robot exclu (message)", !retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: "Connexion Vinted requise — vérification anti-robot", platform_fields: { needs_user_source: "connexion" } }, MAINTENANT));
ok("blocage anti-robot exclu (marqueur)", !retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: "Connexion Vinted requise", platform_fields: { blocage_antirobot: true } }, MAINTENANT));
ok("needs_user de plus de 30 jours exclu (le serveur ne le relance plus)", !retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: MSG_OPLA, created_at: "2026-09-04T11:00:00Z", platform_fields: { needs_user_source: "connexion" } }, MAINTENANT));
ok("needs_user de 29 jours compté", retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: MSG_OPLA, created_at: "2026-09-06T12:00:00Z", platform_fields: { needs_user_source: "connexion" } }, MAINTENANT));
ok("'pending' en attente de session : pas de fenêtre (l'extension le reprend seule)", retraitBloqueParConnexion({ action: "delete", status: "pending", created_at: "2026-08-01T00:00:00Z", platform_fields: { attente_session: {} } }, MAINTENANT));
ok("session_vinted et pas_de_rouge.motif='connexion' comptent (mêmes marqueurs que le serveur)",
  retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: "", platform_fields: { needs_user_source: "session_vinted" } }, MAINTENANT)
  && retraitBloqueParConnexion({ action: "delete", status: "needs_user", error: "", platform_fields: { pas_de_rouge: { motif: "connexion" } } }, MAINTENANT));

console.log("\n── 4. Fiche supprimée ─────────────────────────────────────────");
const lbc = groupe("leboncoin");
ok("Leboncoin : le retrait de la fiche supprimée compte", lbc?.lignes.length === 1 && lbc.lignes[0].job.id === "lbc-supprimee");
ok("titre du job quand la fiche n'existe plus", lbc?.lignes[0].titre === "Lampe de chevet", lbc?.lignes[0]);
ok("fiche supprimée : ni « vendu » ni fiche", lbc?.lignes[0].vendu === false && lbc?.lignes[0].fiche === null);
ok("fiche supprimée : absente de parArticle", ![...r.parArticle.values()].flat().some((b) => b.job.id === "lbc-supprimee"));

console.log("\n── 5. Un retrait plus récent qui a abouti éteint l'ancien ─────");
ok("eBay : rien (le retrait du 05/10 a abouti)", !groupe("ebay"), groupe("ebay"));

console.log("\n── Totaux, ordre, carte ───────────────────────────────────────");
ok("total = 8 Opla + 1 Vinted + 1 Leboncoin = 10", r.total === 10, r.total);
ok("ordre fixe des plateformes (Vinted, Leboncoin, …, Opla)", r.parPlateforme.map((g) => g.platform).join(",") === "vinted,leboncoin,opla", r.parPlateforme.map((g) => g.platform));
ok("parArticle : la fiche 103 porte son retrait Opla", r.parArticle.get("103")?.[0]?.platform === "opla");
ok("parArticle : la fiche 200 porte son retrait Vinted", r.parArticle.get("200")?.[0]?.platform === "vinted");
ok("rien chargé → rien", retraitsBloquesParConnexion({ jobs: [], fiches, maintenant: MAINTENANT }).total === 0);
ok("fiches en tableau acceptées", retraitsBloquesParConnexion({ jobs, fiches: [...fiches.values()], maintenant: MAINTENANT }).parPlateforme.find((g) => g.platform === "opla")?.lignes[0].titre === "Robe 7");

console.log("\n── 6. Les phrases ─────────────────────────────────────────────");
ok("bandeau Opla, tout vendu", texteRetraitsBloques(groupe("opla"), "fr") === "8 articles vendus encore en ligne sur Opla : FillSell ne peut pas les retirer tant que tu ne te reconnectes pas à Opla dans Chrome, sur ton ordinateur — risque de double vente.", texteRetraitsBloques(groupe("opla"), "fr"));
ok("bandeau Vinted, singulier", texteRetraitsBloques(groupe("vinted"), "fr") === "1 article vendu encore en ligne sur Vinted : FillSell ne peut pas le retirer tant que tu ne te reconnectes pas à Vinted dans Chrome, sur ton ordinateur — risque de double vente.", texteRetraitsBloques(groupe("vinted"), "fr"));
ok("bandeau fiche supprimée : jamais « vendu » à tort", texteRetraitsBloques(lbc, "fr") === "1 annonce encore en ligne sur Leboncoin alors que tu as demandé son retrait : FillSell ne peut pas la retirer tant que tu ne te reconnectes pas à Leboncoin dans Chrome, sur ton ordinateur.", texteRetraitsBloques(lbc, "fr"));
{
  const mixte = { platform: "opla", nom: "Opla", nVendus: 2, lignes: [{ vendu: true }, { vendu: true }, { vendu: false }] };
  ok("bandeau mixte : « dont 2 vendus : risque de double vente »", texteRetraitsBloques(mixte, "fr") === "3 annonces encore en ligne sur Opla alors que tu as demandé leur retrait : FillSell ne peut pas les retirer tant que tu ne te reconnectes pas à Opla dans Chrome, sur ton ordinateur — dont 2 vendus : risque de double vente.", texteRetraitsBloques(mixte, "fr"));
}
ok("ligne de carte", ligneCarteRetraitBloque("opla", "fr") === "Encore en ligne sur Opla — reconnecte-toi pour le retirer (risque de double vente)");
{
  const l = ligneARegler(r, "fr");
  ok("« À régler » : titre au pluriel", l.titre === "Annonces encore en ligne à retirer", l);
  ok("« À régler » : nomme les plateformes", l.detail === "Reconnecte-toi à Vinted, Leboncoin et Opla pour que FillSell les retire — risque de double vente.", l.detail);
  const seul = ligneARegler(retraitsBloquesParConnexion({ jobs: [retraitOpla(1)], fiches, maintenant: MAINTENANT }), "fr");
  ok("« À régler » : singulier", seul.titre === "Annonce encore en ligne à retirer" && seul.detail === "Reconnecte-toi à Opla pour que FillSell la retire — risque de double vente.", seul);
}
ok("aucun « pépites » nulle part", !/p[ée]pite/i.test(readFileSync(new URL("../src/utils/retraitsBloques.js", import.meta.url), "utf8")));

console.log("\n── 6. Le câblage du Stock ─────────────────────────────────────");
{
  const src = readFileSync(new URL("../src/tabs/StockTab.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  ok("calcul sur les jobs DÉJÀ chargés (tousLesJobs, fichesToutes)", /retraitsBloquesParConnexion\(\{ jobs: tousLesJobs, fiches: fichesToutes \}\)/.test(src));
  ok("aucune lecture neuve : pas de requête dans le calcul", !/retraitsBloquesParConnexion[\s\S]{0,200}supabase/.test(src));
  // (05/10, Nico) Jamais un bandeau empilé en haut du Stock (refonte du
  // 03/10) : le signal vit dans « À régler », qui ouvre un écran dédié.
  ok("aucun bandeau de retraits en haut du Stock", !src.includes("{retraitsBloques.total>0&&(") && !/<div ref=\{bandeauRetraitsRef\}/.test(src));
  ok("la ligne « À régler » ouvre l'écran des retraits", /\{ cle: 'retraits', n: nbRetraitsBloques[\s\S]{0,200}onOuvrir: \(\) => setGesteOuvert\('retraits'\) \}/.test(src));
  ok("l'écran est rendu, retour vers « À régler »", /\{gesteOuvert==='retraits'&&\(\s*<EcranRetraitsBloques [^>]*retraits=\{retraitsBloques\}[\s\S]{0,200}onFermer=\{\(\)=>setGesteOuvert\('a_regler'\)\}/.test(src));
  const ecranRetraits = readFileSync(new URL("../src/stock/EcranRetraitsBloques.jsx", import.meta.url), "utf8");
  ok("l'écran : la phrase, « Me connecter » par plateforme et la liste des articles", /texteRetraitsBloques\(g, lang\)/.test(ecranRetraits) && /<BoutonMeConnecter userId=\{userId\} platform=\{g\.platform\}/.test(ecranRetraits) && /g\.lignes\.map\(\(l\) =>/.test(ecranRetraits));
  ok("l'écran garde le gabarit de la refonte (EcranPlein)", /<EcranPlein /.test(ecranRetraits));
  ok("« À régler » compte les retraits bloqués", /const nbARegler = nbRetraitsBloques \+ nbAttenteAction/.test(src));
  ok("« À régler » : ligne 'retraits' en tête", /const lignesARegler = \[\n(?:\s*\/\/.*\n)*\s*\{ cle: 'retraits', n: nbRetraitsBloques/.test(src));
  // (05/10, relu au harnais) Le bouton COMPACT : la variante « bouton »
  // débordait de la carte à 360 et 390 px.
  ok("carte vendue : la ligne et « Me connecter » (compact), jamais sur « compte bloqué » (06/10)", /ligneCarteRetraitBloque\(p, lang, murDe\.get\(p\)\)\}\s*<\/span>\s*\{murDe\.get\(p\) !== 'compte_bloque' && <BoutonMeConnecter userId=\{user\.id\} platform=\{p\}[^>]*variante="bouton" compact\/>\}/.test(src));
  ok("Opla reconnue par le mur ancré (jumeau de handler-watch)", /opla: \/\^Connexion Opla requise\/i/.test(src));
  const ecran = readFileSync(new URL("../src/stock/EcranARegler.jsx", import.meta.url), "utf8");
  ok("écran « À régler » : icône de la ligne 'retraits'", /retraits: AlertTriangle/.test(ecran));
}

console.log("\n── 7. (06/10) Vinted : session absente, session illisible, « compte bloqué » ──");
{
  // Formes RELEVÉES en base le 06/10 (geronimo 94bf96fe, pironneau 15cad160,
  // DeadRoz a7dd76cd, Sandra 333e23d4).
  const ger = { id: "94bf96fe", inventaire_id: 500, platform: "vinted", action: "delete", status: "pending", created_at: "2026-10-03T21:55:13Z",
    listing_url: "https://www.vinted.fr/items/10205785002", title: "Official Overwatch 2 fleece hoodie",
    error: "Connecte-toi à Vinted sur ton ordinateur. Rien n'a été touché : le retrait repart tout seul dès que tu es connecté (prochain essai dans 30 min).",
    platform_fields: { attente_connexion: { platform: "vinted", depuis: "2026-10-06T08:18:58Z" }, verification_boutique_vinted: { motif: "session_inconnue", n: 7 } } };
  const piro = { id: "15cad160", inventaire_id: 501, platform: "vinted", action: "delete", status: "pending", created_at: "2026-10-04T10:00:08Z",
    listing_url: "https://www.vinted.fr/items/9923486901", title: "Figurine Power Rangers",
    platform_fields: { verification_boutique_vinted: { motif: "session_inconnue", n: 5 } } };
  const dead = { id: "a7dd76cd", inventaire_id: 502, platform: "vinted", action: "delete", status: "pending", created_at: "2026-10-01T20:09:57Z",
    listing_url: "https://www.vinted.fr/items/9865454800", title: "Jeans Levi's homme 511",
    platform_fields: { compte_vinted_bloque: { depuis: "2026-10-03T11:00:08Z", essais: 5 } } };
  const sandra = { ...dead, id: "333e23d4", inventaire_id: 503, status: "needs_user", listing_url: "https://www.vinted.fr/items/9733506257",
    platform_fields: { needs_user_source: "compte_vinted_bloque", compte_vinted_bloque: { essais: 1 } } };
  const autreBoutique = { ...piro, id: "x1", inventaire_id: 504, listing_url: "https://www.vinted.fr/items/1", platform_fields: { verification_boutique_vinted: { motif: "origine_inconnue" } } };
  const f7 = new Map([["500", { id: 500, title: "Hoodie", statut: "stock" }], ["501", { id: 501, title: "Figurine", statut: "vendu" }],
    ["502", { id: 502, title: "Jeans", statut: "vendu" }], ["503", { id: 503, title: "T'choupi", statut: "stock" }], ["504", { id: 504, title: "Autre", statut: "stock" }]]);
  ok("session Vinted absente (attente_connexion) → compté, mur « connexion »", retraitBloqueParConnexion(ger, MAINTENANT));
  ok("session illisible avant le retrait (session_inconnue) → compté", retraitBloqueParConnexion(piro, MAINTENANT));
  ok("boutique d'origine inconnue (pas une connexion) → pas compté", !retraitBloqueParConnexion(autreBoutique, MAINTENANT));
  const r7 = retraitsBloquesParConnexion({ jobs: [ger, piro, dead, sandra, autreBoutique], fiches: f7, maintenant: MAINTENANT });
  ok("4 retraits Vinted à régler (2 connexion, 2 compte bloqué)", r7.total === 4, r7.total);
  const gCx = r7.parPlateforme.find((g) => g.platform === "vinted" && g.mur === "connexion");
  const gCb = r7.parPlateforme.find((g) => g.platform === "vinted" && g.mur === "compte_bloque");
  ok("deux cartes Vinted distinctes (connexion / compte bloqué)", gCx?.lignes.length === 2 && gCb?.lignes.length === 2, r7.parPlateforme.map((g) => `${g.platform}:${g.mur}:${g.lignes.length}`));
  ok("carte « compte bloqué » : retirer depuis l'appli Vinted, jamais « reconnecte-toi »",
    /compte bloqué/.test(texteRetraitsBloques(gCb, "fr")) && /appli Vinted/.test(texteRetraitsBloques(gCb, "fr")) && !/reconnect/i.test(texteRetraitsBloques(gCb, "fr")), texteRetraitsBloques(gCb, "fr"));
  ok("ligne de carte vendue « compte bloqué »", /appli Vinted/.test(ligneCarteRetraitBloque("vinted", "fr", "compte_bloque")) && !/reconnecte/i.test(ligneCarteRetraitBloque("vinted", "fr", "compte_bloque")));
  ok("ligne de carte vendue « connexion » inchangée", ligneCarteRetraitBloque("vinted", "fr") === ligneCarteRetraitBloque("vinted", "fr", "connexion"));
  const seulCb = ligneARegler(retraitsBloquesParConnexion({ jobs: [dead], fiches: f7, maintenant: MAINTENANT }), "fr");
  ok("« À régler » seulement « compte bloqué » : le geste est l'appli Vinted", /appli Vinted/.test(seulCb.detail), seulCb.detail);
  const ecran = readFileSync(new URL("../src/stock/EcranRetraitsBloques.jsx", import.meta.url), "utf8");
  ok("l'écran ne montre jamais « Me connecter » sur une carte « compte bloqué »", /\{userId && g\.mur !== 'compte_bloque' && \(/.test(ecran));
}

console.log(echecs ? `\n${echecs} échec(s)` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
