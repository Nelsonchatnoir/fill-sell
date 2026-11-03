// Autotest — « Remonter mes annonces » plateforme par plateforme (03/11, demande d'un vendeur Pro) —
// `npm run selftest:remonter-par-plateforme` (src/stock/remonterParPlateforme.js, StockTab, EcranSelection).
import { listeRemonter, plateformesDuChoix, phrasePlateforme, phraseToutes } from "../src/stock/remonterParPlateforme.js";
import { datesParPlateforme } from "../supabase/functions/_shared/mise-en-ligne.js";
import fs from "node:fs";

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
ok(choix.map((c) => `${c.id}:${c.n}`).join(",") === "vinted:3,leboncoin:1,beebs:1", "plateformes proposées : republiables maintenant, avec leur nombre, dans l'ordre", JSON.stringify(choix));
ok(!choix.some((c) => c.id === "ebay"), "eBay jamais proposée (FillSell ne republie pas eBay, 02/11)");
const v = listeRemonter(tous, { plateforme: "vinted", tri: "anciennes", lang: "fr" });
ok(v.plateforme === "vinted" && v.lignes.map((l) => l.id).join(",") === "2,3,1", "Vinted, plus anciennes d'abord : 25 j, 11 j, 2 j", v.lignes.map((l) => `${l.id}:${l.cle}`).join(","));
ok(v.lignes[0].ligne2 === "Publiée sur Vinted il y a 25 j" && v.lignes[2].ligne2 === "Republiée sur Vinted il y a 2 j", "la ligne dit la date de CETTE plateforme (plus celle d'eBay)");
ok(listeRemonter(tous, { plateforme: "vinted", tri: "recentes" }).lignes.map((l) => l.id).join(",") === "1,3,2", "plus récentes d'abord");
ok(listeRemonter(tous, { plateforme: "leboncoin" }).lignes.map((l) => l.id).join(",") === "1", "Leboncoin : seulement les annonces republiables sur Leboncoin");
const t = listeRemonter(tous, { plateforme: null });
ok(t.plateforme === null && t.lignes.map((l) => l.id).join(",") === "4,1,2,3", "Toutes : la plus ancienne annonce en ligne d'abord (comme avant)");
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

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
