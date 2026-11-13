// Autotest — « Remonter mes annonces » plateforme par plateforme (03/11, demande d'un vendeur Pro) —
// `npm run selftest:remonter-par-plateforme` (src/stock/remonterParPlateforme.js, StockTab, EcranSelection).
// (13/11, étape 5 du lot « zéro problème », décision de Nico : « seuil et cases lus sur la plateforme choisie ») VERROU
// de la partie 4 : la porte « ancienne » (≥ 7 j) et la case cochée se lisent sur la plateforme choisie (jamais sur la
// plus ancienne annonce toutes plateformes, souvent eBay qu'on ne republie pas) ; tri à la milliseconde ; eBay hors du
// seuil. Cas réel : compte de63ca45, fiche 1789717140683000 (eBay importée le 19/09, republiée sur Vinted le 10/11).
import * as M from "../src/stock/remonterParPlateforme.js";
import * as Regles from "../src/stock/regles.js";
import { datesParPlateforme } from "../supabase/functions/_shared/mise-en-ligne.js";
import fs from "node:fs";
const { listeRemonter, plateformesDuChoix, phrasePlateforme, phraseToutes } = M;

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const J = 86400_000;
const MAINTENANT = Date.parse("2026-11-03T12:00:00Z");
const il = (j) => new Date(MAINTENANT - j * J).toISOString();
const job = (platform, action, jours, numero, extra = {}) => ({ id: `${platform}-${numero}`, platform, action, status: "published", published_at: il(jours), created_at: il(jours),
  platform_listing_id: numero, listing_url: `https://exemple.test/${platform}/${numero}`, handler_build: "x", platform_fields: {}, ...extra });

// Le cas du 31/10 : republiée sur Vinted et Leboncoin il y a 2 j, en ligne sur eBay depuis 42 j.
// Vinted se date sur la fiche (listed_at_guess), comme dans le Stock.
const jeuA = { id: 1, title: "Jeu A", vinted_item_id: "10000001001", listed_at_guess: il(2) };
const jobsJeuA = [job("ebay", "publish", 42, "407000000001"), job("vinted", "publish", 30, "10000001000"), job("vinted", "republish", 2, "10000001001"), job("leboncoin", "republish", 2, "3200000001")];
const art = (item, jobs, enLigne, republiables, jours) => ({ id: item.id, titre: item.title, logos: enLigne, republiables, jours,
  lignesDates: datesParPlateforme({ item, jobs, enLigne, plateformes: [], maintenant: MAINTENANT }) });
const a1 = art(jeuA, jobsJeuA, ["ebay", "vinted", "leboncoin"], ["vinted", "leboncoin"], 42);
const a2 = art({ id: 2, title: "Jeu B", vinted_item_id: "10000002001", listed_at_guess: il(25) }, [job("vinted", "publish", 25, "10000002001"), job("beebs", "publish", 9, "34000001")], ["vinted", "beebs"], ["vinted", "beebs"], 25);
const a3 = art({ id: 3, title: "Jeu C", vinted_item_id: "10000003001", listed_at_guess: il(11) }, [job("vinted", "republish", 11, "10000003001")], ["vinted"], ["vinted"], 11);
const a4 = art({ id: 4, title: "Jeu D" }, [job("leboncoin", "publish", 60, "3200000004")], ["leboncoin"], [], 60);   // pas republiable maintenant
const tous = [a1, a2, a3, a4];

console.log("\n1. LA DATE DE CHAQUE PLATEFORME (même source que le Stock)");
ok(phrasePlateforme(a1.lignesDates.find((l) => l.platform === "vinted"), "fr") === "Republiée sur Vinted il y a 2 j", "Jeu A : « Republiée sur Vinted il y a 2 j »");
ok(phrasePlateforme(a1.lignesDates.find((l) => l.platform === "ebay"), "fr") === "Publiée sur eBay il y a 42 j", "Jeu A : « Publiée sur eBay il y a 42 j »");
ok(phraseToutes(a1, "fr") === "Vinted 2 j · Leboncoin 2 j · eBay 42 j", "vue « Toutes » : chaque plateforme avec SA date", phraseToutes(a1, "fr"));
ok(phrasePlateforme({ platform: "beebs", enLigne: true, jours: null, nature: "publiee" }, "fr") === "En ligne sur Beebs · date inconnue", "date inconnue : dit, jamais inventée");
ok(phrasePlateforme({ platform: "vinted", enLigne: true, jours: 0, nature: "republiee" }, "fr") === "Republiée sur Vinted aujourd'hui", "aujourd'hui");

console.log("\n2. LE CHOIX DE LA PLATEFORME");
const choix = plateformesDuChoix(tous);
// (13/11, décision de Nico — seuil lu sur la plateforme choisie) Le nombre d'une pastille = les annonces ANCIENNES (≥ 7 j)
// sur cette plateforme : Jeu A, republiée il y a 2 j sur Vinted et sur Leboncoin, n'y compte plus (avant : « vinted:3,
// leboncoin:1,beebs:1 », l'âge de son annonce eBay de 42 j la faisait entrer partout).
ok(choix.map((c) => `${c.id}:${c.n}`).join(",") === "vinted:2,beebs:1", "plateformes proposées : celles où une annonce est ancienne (≥ 7 j) sur ELLE, avec leur nombre, dans l'ordre", JSON.stringify(choix));
ok(!choix.some((c) => c.id === "ebay"), "eBay jamais proposée (FillSell ne republie pas eBay, 02/11)");
const v = listeRemonter(tous, { plateforme: "vinted", tri: "anciennes", lang: "fr" });
ok(v.plateforme === "vinted" && v.lignes.map((l) => l.id).join(",") === "2,3,1", "Vinted, plus anciennes d'abord : 25 j, 11 j, 2 j", v.lignes.map((l) => `${l.id}:${l.cle}`).join(","));
ok(v.lignes[0].ligne2 === "Publiée sur Vinted il y a 25 j" && v.lignes[2].ligne2 === "Republiée sur Vinted il y a 2 j", "la ligne dit la date de CETTE plateforme (plus celle d'eBay)");
ok(listeRemonter(tous, { plateforme: "vinted", tri: "recentes" }).lignes.map((l) => l.id).join(",") === "1,3,2", "plus récentes d'abord");
// (13/11, décision de Nico) Leboncoin : aucune annonce n'y a 7 j (Jeu A y a été republiée il y a 2 j) → pas de pastille, vue « Toutes ».
ok(listeRemonter(tous, { plateforme: "leboncoin" }).plateforme === null, "Leboncoin sans annonce ancienne sur Leboncoin : pas proposée, vue « Toutes »");
const t = listeRemonter(tous, { plateforme: null });
// (13/11, décision de Nico — eBay hors du seuil « ancienne ») « Toutes » : les articles dont une annonce REPUBLIABLE a 7 j
// (Jeu A n'a d'ancienne que son eBay ; Jeu D n'est republiable nulle part), triés sur la plus ancienne d'entre elles.
ok(t.plateforme === null && t.lignes.map((l) => l.id).join(",") === "2,3", "Toutes : les annonces republiables anciennes, la plus ancienne d'abord (eBay et non-republiables hors porte)", t.lignes.map((l) => `${l.id}:${l.cle}`).join(","));
ok(listeRemonter(tous, { plateforme: "depop" }).plateforme === null, "plateforme sans annonce republiable → vue « Toutes »");
const inconnue = { ...a3, id: 5, lignesDates: [{ platform: "vinted", enLigne: true, jours: null, nature: "publiee" }] };
ok(listeRemonter([inconnue, a2, a3], { plateforme: "vinted", tri: "recentes" }).lignes.at(-1).id === 5
  && listeRemonter([inconnue, a2, a3], { plateforme: "vinted", tri: "anciennes" }).lignes.at(-1).id === 5, "date inconnue : toujours à la fin");

console.log("\n3. L'ÉCRAN L'APPLIQUE");
const st = fs.readFileSync(new URL("../src/tabs/StockTab.jsx", import.meta.url), "utf8");
ok(st.includes("lignesDates:datesParPlateforme({item:i,jobs:jobsI,enLigne:e?.enLigne??[],plateformes:[],datesRelevees})"), "même source que le suivi du Stock (datesParPlateforme)");
ok(st.includes("listeRemonter(base,{plateforme:remonterPf,tri:remonterTri,lang})") && st.includes("<ChoixPlateformeRemonter"), "choix de la plateforme et tri branchés");
ok(st.includes("ouvrirFeuilleRepublication(choisis,pfVue?[pfVue]:null)") && st.includes("choixInitial={repubSheet.choix ?? choixPlateformesRepub}"), "filtrée sur une plateforme : la feuille coche cette seule plateforme");
const es = fs.readFileSync(new URL("../src/stock/EcranSelection.jsx", import.meta.url), "utf8");
ok(es.includes("if (cleVue !== cleSelection) {") && es.includes("{enTete && <div style={{ marginTop: 16 }}>{enTete}</div>}"), "la sélection repart à neuf quand la plateforme change");

console.log("\n4. SEUIL ET CASES LUS SUR LA PLATEFORME CHOISIE (13/11, décision de Nico) — VERROU");
const fn = (nom) => (typeof M[nom] === "function" ? M[nom] : null);
// 4a. Cas réel — de63ca45, fiche 1789717140683000, dates lues en prod le 13/11 : eBay importée le 19/09 18:46 (en ligne),
//     Vinted republiée le 10/11 11:41 (listed_at_guess), Leboncoin republiée le 10/11 13:47. Le 13/11 à midi : Vinted et
//     Leboncoin ont 3 j ; seule l'annonce eBay (54 j) est « ancienne » — et FillSell ne republie pas eBay.
const MIDI_13 = Date.parse("2026-11-13T12:00:00Z");
const jobReel = (platform, action, quand, numero, handler) => ({ id: `${platform}-${numero}`, platform, action, status: "published", published_at: quand, created_at: quand,
  platform_listing_id: numero, listing_url: `https://exemple.test/${platform}/${numero}`, handler_build: handler, platform_fields: {} });
const ficheReelle = { id: "1789717140683000", title: "Fiche réelle de63ca45", vinted_item_id: "10747599564", listed_at_guess: "2026-11-10T11:41:41Z" };
const jobsReels = [
  jobReel("ebay", "publish", "2026-09-19T18:46:06Z", "377503532134", "releve-annonces"),
  jobReel("vinted", "republish", "2026-11-10T11:41:44Z", "10747599564", "2026-11-09T20:53:23Z+e00c214 · v0.6.185"),
  jobReel("leboncoin", "republish", "2026-11-10T13:47:40Z", "3306312274", "2026-11-09T20:53:23Z+e00c214 · v0.6.185"),
];
const artM = (item, jobs, enLigne, republiables) => ({ id: item.id, titre: item.title, logos: enLigne, republiables,
  jours: Regles.ancienneteJours(item, jobs, enLigne, MIDI_13),
  lignesDates: datesParPlateforme({ item, jobs, enLigne, plateformes: [], maintenant: MIDI_13 }) });
const reel = artM(ficheReelle, jobsReels, ["ebay", "vinted", "leboncoin"], ["vinted", "leboncoin"]);
const vieux = artM({ id: "v25", title: "Vinted 25 j", vinted_item_id: "1", listed_at_guess: new Date(MIDI_13 - 25 * J).toISOString() },
  [jobReel("vinted", "publish", new Date(MIDI_13 - 25 * J).toISOString(), "1", "x")], ["vinted"], ["vinted"]);
ok(reel.jours === 54, "décor : l'âge « toutes plateformes » de la fiche réelle est celui d'eBay (54 j) — la porte d'avant", String(reel.jours));
ok(fn("aRemonter") && M.aRemonter(reel) === false && M.aRemonter(vieux) === true, "fiche réelle : n'entre PAS dans « Remonter » (aucune annonce republiable n'a 7 j ; eBay hors du seuil)");
const vReel = listeRemonter([reel, vieux], { plateforme: "vinted", tri: "anciennes", lang: "fr" });
const ligneReel = vReel.lignes.find((l) => l.id === reel.id);
ok(vReel.plateforme === "vinted" && ligneReel && ligneReel.coche === false, "sous « Vinted » : la fiche réelle est visible mais DÉCOCHÉE (Vinted 3 j < 7 j)", JSON.stringify(ligneReel && { coche: ligneReel.coche, cle: ligneReel.cle }));
ok(Array.isArray(vReel.aCocher) && vReel.aCocher.join(",") === "v25" && vReel.nAnciennes === 1, "sous « Vinted » : seule l'annonce Vinted de 25 j est cochée et comptée", JSON.stringify({ aCocher: vReel.aCocher, n: vReel.nAnciennes }));
ok(plateformesDuChoix([reel, vieux]).map((c) => `${c.id}:${c.n}`).join(",") === "vinted:1", "pastilles : « Vinted 1 », pas de Leboncoin (3 j), jamais eBay", JSON.stringify(plateformesDuChoix([reel, vieux])));
ok(!listeRemonter([reel, vieux], { plateforme: null }).lignes.some((l) => l.id === reel.id), "« Toutes » : la fiche réelle n'y est pas (son ancienneté ne tenait qu'à eBay)");
ok(typeof Regles.ancienneteRemontable === "function" && Regles.ancienneteRemontable(ficheReelle, jobsReels, ["vinted", "leboncoin"], MIDI_13) === 3
  && Regles.ancienneteRemontable(ficheReelle, jobsReels, ["vinted", "leboncoin", "ebay"], MIDI_13) === 3,
  "regles.ancienneteRemontable : l'âge des annonces REPUBLIABLES (3 j), eBay jamais compté (même passé par erreur)");

// 4b. Tri à la milliseconde : deux annonces Vinted du même jour (9 j) — la plus ancienne À L'HEURE d'abord, quel que soit
//     l'ordre du stock ; départage stable par identifiant.
const vintedA = (id, joursFlottants) => artM({ id, title: id, vinted_item_id: id, listed_at_guess: new Date(MIDI_13 - joursFlottants * J).toISOString() },
  [jobReel("vinted", "publish", new Date(MIDI_13 - joursFlottants * J).toISOString(), id, "x")], ["vinted"], ["vinted"]);
const matin = vintedA("matin", 9.6), soir = vintedA("soir", 9.1);
ok(matin.lignesDates[0].jours === soir.lignesDates[0].jours, "décor : même nombre de jours entiers (9)");
ok(listeRemonter([soir, matin], { plateforme: "vinted", tri: "anciennes" }).lignes.map((l) => l.id).join(",") === "matin,soir", "plus anciennes d'abord : à l'heure près (avant : ordre du stock à égalité de jours)");
ok(listeRemonter([matin, soir], { plateforme: "vinted", tri: "recentes" }).lignes.map((l) => l.id).join(",") === "soir,matin", "plus récentes d'abord : à l'heure près");
const jumeauA = vintedA("b-jumeau", 9.6), jumeauB = vintedA("a-jumeau", 9.6);
ok(listeRemonter([jumeauA, jumeauB], { plateforme: "vinted" }).lignes.map((l) => l.id).join(",") === "a-jumeau,b-jumeau", "même instant : départage stable par identifiant");

// 4c. « Toutes » : la clé est la plus ancienne annonce REPUBLIABLE, jamais eBay.
const ebayVieux = artM({ id: "ebay60-v10", title: "eBay 60 j + Vinted 10 j", vinted_item_id: "2", listed_at_guess: new Date(MIDI_13 - 10 * J).toISOString() },
  [jobReel("ebay", "publish", new Date(MIDI_13 - 60 * J).toISOString(), "4070001", "x"), jobReel("vinted", "publish", new Date(MIDI_13 - 10 * J).toISOString(), "2", "x")],
  ["ebay", "vinted"], ["vinted"]);
const v20 = vintedA("v20", 20);
ok(listeRemonter([ebayVieux, v20], { plateforme: null, tri: "anciennes" }).lignes.map((l) => l.id).join(",") === "v20,ebay60-v10", "« Toutes » : Vinted 20 j passe avant (eBay 60 j + Vinted 10 j) — eBay ne compte pas");

// 4d. Gratuit (plafond du mois) : les cochées sont les PLUS ANCIENNES, quel que soit le tri affiché.
const trois = [vintedA("v8", 8), vintedA("v30", 30), vintedA("v15", 15)];
const rec = listeRemonter(trois, { plateforme: "vinted", tri: "recentes" });
ok(Array.isArray(rec.aCocher) && rec.aCocher.slice(0, 1).join(",") === "v30", "plafond d'1 : la plus ancienne est cochée même en « plus récentes d'abord »", JSON.stringify(rec.aCocher));

// 4e. L'écran applique la règle (StockTab).
ok(st.includes("ancienneteRemontable(i,jobsByInventaire[i.id]") || st.includes("ancienneteRemontable(i, jobsByInventaire[i.id]"), "porte du Stock (tuile « Remonter ») : ancienneteRemontable (plateformes republiables, jamais eBay)");
ok(st.includes("repubCandidatsTout.filter(i=>set.has(String(i.id)))"), "confirmer : une annonce décochée d'office puis cochée à la main part aussi");
ok(st.includes("initiale={new Set(aCocher.slice(0,"), "cases d'ouverture : celles de la plateforme choisie (aCocher), au plafond près");
ok(st.includes("ancienne: estAncienne(ancienneteRemontable(item, d.jobsAll, d.repubMaintenant"), "carte : l'action « Remonter » suit la même règle (jamais l'âge d'eBay)");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
