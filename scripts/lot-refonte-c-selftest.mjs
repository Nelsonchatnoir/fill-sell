// ═══════════════════════════════════════════════════════════════════════════
// LA REFONTE C DU LOT (26/10, maquettes validées par Nico) — `npm run selftest:lot-refonte-c`
// ═══════════════════════════════════════════════════════════════════════════
// Une ligne par article, une pop-up par article (le commun, puis une section par plateforme), la même pop-up pour
// « Vérifier » à l'unité. Vérifié ici, sur les fonctions pures et sur le code livré :
//   1. la fiche lue (ficheLue.js) : ordre des plateformes, statut Prêt / À régler par plateforme, Beebs ou Depop
//      sans aucun rayon écartés d'office (et remis par « Annuler »), rayon jamais coupé ;
//   2. le poids (règle 7) : la fiche ou le choix de la personne, JAMAIS une estimation ; « sans poids » sinon ;
//      un poids grossièrement incohérent pour l'objet est signalé (robot aspirateur à 200 g), un plausible jamais ;
//   3. la photo de remplissage (Medik8 : l'image par défaut de Beebs) : petite ET presque sans couleurs ;
//   4. la description fidèle (règles 4 et 5) : même état, même genre, aucun hashtag inventé, hashtags seulement sur
//      Vinted et Depop (5 au plus), jamais sur Leboncoin ni eBay ; le texte du vendeur fait foi ;
//   5. les modèles Vinted de la marque (C6, C7) : liste complète relevée, Samsung seulement Samsung, modèle lu sur le
//      titre seulement quand il est sans ambiguïté ;
//   6. le code livré : logos (pas de pastilles lettrées), aucune ellipse, retrait d'une plateforme = un bouton,
//      « Vérifier » monte la même pop-up, le texte qui part passe par descriptionFidele.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const F = await imp("src/publication/lot/ficheLue.js");
const D = await imp("src/publication/moteur/descriptionFidele.js");
const L = await imp("src/publication/moteur/listes.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const NOM = (p) => ({ vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop", ebay: "eBay" })[p] ?? p;

console.log("1. La fiche lue, plateforme par plateforme");
const m1 = {
  plateformesPubliables: new Set(["ebay", "vinted", "beebs"]), selected: new Set(["ebay", "vinted", "beebs", "leboncoin"]),
  rayonsAChoisir: { beebs: { objet: "sérum visage" } }, suggestionsParPf: { beebs: [] },
  genericRequiredStatus: { vinted: [{ key: "model", label: "Modèle", state: "missing" }], leboncoin: [{ key: "brand", label: "Marque", state: "ok" }] },
  ebayRequiredStatus: [{ name: "Brand", label: "Marque", state: "ok", value: "Medik8" }],
  edited: { vinted: { platform_fields: { categoryPath: ["Beauté", "Soins du visage", "Sérums"] } } },
};
ok(F.plateformesDeLArticle(m1).join() === "vinted,leboncoin,beebs,ebay", "l'ordre de l'app : Vinted, Leboncoin, Beebs, eBay", F.plateformesDeLArticle(m1).join());
ok(F.statutPlateforme(m1, "vinted") === "a_regler" && F.statutPlateforme(m1, "ebay") === "pret" && F.statutPlateforme(m1, "leboncoin") === "pret", "statut par plateforme : Vinted à régler (modèle), eBay et Leboncoin prêts");
const ec = F.ecarteesAutomatiques(m1);
ok(ec.length === 1 && ec[0].p === "beebs" && ec[0].motif === "aucun_rayon", "Beebs sans aucun rayon candidat : écarté d'office (C9)", JSON.stringify(ec));
ok(F.ecarteesAutomatiques(m1, ["beebs"]).length === 0, "… sauf s'il a été remis (« Annuler »)");
ok(F.ecarteesAutomatiques({ ...m1, suggestionsParPf: { beebs: [{ chemin: ["Beauté", "Soins"] }] } }).length === 0, "Beebs avec un rayon à proposer : jamais écarté (la question reste)");
ok(F.ecarteesAutomatiques({ rayonsAChoisir: { vinted: {}, leboncoin: {}, ebay: {} }, suggestionsParPf: {} }).length === 0, "Vinted, Leboncoin, eBay : jamais écartés d'office");
ok(F.phraseEcartees([{ p: "depop", motif: "aucun_rayon" }], NOM) === "Pas sur Depop : aucun rayon.", "la ligne discrète : « Pas sur Depop : aucun rayon. »");
ok(F.phraseEcartees([{ p: "beebs", motif: "aucun_rayon" }, { p: "depop", motif: "aucun_rayon" }], NOM) === "Pas sur Beebs ni Depop : aucun rayon.", "deux plateformes : « Pas sur Beebs ni Depop »");
ok(F.texteRayon(F.cheminRayon(m1, "vinted")) === "Beauté › Soins du visage › Sérums", "le rayon s'écrit en entier, étages séparés par « › »");
const neuf = { genericRequiredStatus: { beebs: [{ key: "Etat", label: "État", neufSeulement: true, value: "Très bon état", valeursNeuves: ["Neuf avec étiquette"], state: "invalid" }] } };
ok(F.rayonNeufDe(neuf, "beebs")?.valeursNeuves?.[0] === "Neuf avec étiquette" && F.aReglerSurPlateforme(neuf, "beebs").includes("neuf"), "rayon « neuf seulement » : la valeur neuve à proposer est connue (C8)");
ok(!F.detailsDe(neuf, "beebs").length, "… et la ligne « neuf » n'est pas répétée dans les caractéristiques");
// (26/10, test réel sur le lot de Nico) « Format du colis : À choisir » sous un colis « 200 g » ; la taille Vinted absente.
const mBeebs = { genericRequiredStatus: { beebs: [{ key: "Format du colis", label: "Format du colis", state: "prefilled" }, { key: "Taille", label: "Taille", value: "M", state: "ok" }],
  leboncoin: [{ key: "quantity", label: "Quantité", state: "prefilled" }] },
  edited: { vinted: { platform_fields: { taille: "M" } }, beebs: { platform_fields: { taille: "M" } } } };
ok(!F.detailsDe(mBeebs, "beebs").some((d) => d.cle === "Format du colis"), "le format du colis Beebs n'est pas redit sous la ligne « Colis »");
ok(F.detailsDe(mBeebs, "leboncoin")[0]?.rempli === "depot", "un champ rempli au dépôt est dit tel quel (jamais « À choisir »)");
ok(F.detailsDe(mBeebs, "vinted").some((d) => d.cle === "taille" && d.valeur === "M" && d.lectureSeule), "la taille de la copie Vinted se voit dans sa section (règle 6)");
ok(F.detailsDe(mBeebs, "beebs").filter((d) => /taille/i.test(d.label)).length === 1, "… jamais deux fois quand le rayon la porte déjà");

console.log("\n2. Le poids : la fiche ou le choix, jamais une estimation (règle 7)");
const mPoids = { initialListing: { poids_g: 650 }, edited: { leboncoin: { platform_fields: { estimated_parcel_weight: "De 250 g à 500 g", poids_ia: 300 } } } };
ok(F.poidsAffiche(mPoids, {}, null) === 650, "le poids de la fiche (650 g)");
ok(F.poidsAffiche(mPoids, { poids: 1200 }, null) === 1200, "le choix de la personne passe devant (1,2 kg)");
ok(F.poidsAffiche({ edited: mPoids.edited }, {}, { poids_g: null }) === null, "sans poids de fiche : null — ni la tranche Leboncoin, ni l'estimation");
ok(F.poidsAffiche({}, {}, { poids_g: 0 }) === null, "0 g n'est pas un poids");
ok(F.textePoids(650) === "650 g" && F.textePoids(1200) === "1,2 kg" && F.textePoids(1200, "en") === "1.2 kg", "en mots : « 650 g », « 1,2 kg »");
const lbc = F.colisDe({ edited: { leboncoin: { platform_fields: {} } } }, "leboncoin", { poids: null });
ok(lbc.manquant === true && lbc.libelle === "Sans poids", "Leboncoin sans poids : « Sans poids », manquant");
ok(F.colisDe({ edited: { leboncoin: { platform_fields: {} } } }, "leboncoin", { poids: 650 }).libelle === "650 g", "Leboncoin avec poids : « 650 g »");
const inc = F.poidsIncoherent("Robot aspirateur LIEE laveur", 200);
ok(inc && inc.nom === "un robot aspirateur" && inc.propositions.length === 2, "robot aspirateur à 200 g : signalé, deux poids plausibles proposés", JSON.stringify(inc));
ok(F.poidsIncoherent("Bouilloire électrique inox", 200) !== null && F.poidsIncoherent("Bouilloire électrique inox", 1200) === null, "bouilloire : 200 g signalé, 1,2 kg jamais");
ok(F.poidsIncoherent("Legging Ironwomen noir", 200) === null && F.poidsIncoherent("Livre EAT Gilles Lartigot", 900) === null, "objet sans borne connue : rien n'est dit");

console.log("\n3. La photo de remplissage (Medik8 de Nico)");
ok(F.estPhotoDeRemplissage({ largeur: 200, hauteur: 200, couleurs: 30 }) === true, "l'image par défaut de Beebs (200 × 200, 30 couleurs) : pas une photo");
ok(F.estPhotoDeRemplissage({ largeur: 140, hauteur: 70, couleurs: 67 }) === false && F.estPhotoDeRemplissage({ largeur: 131, hauteur: 140, couleurs: 99 }) === false, "de vraies photos minuscules : des photos");
ok(F.estPhotoDeRemplissage({ largeur: 1200, hauteur: 1200, couleurs: 20 }) === false, "une grande image peu colorée : une photo (jamais déclarée vide)");
ok(F.estPhotoDeRemplissage({}) === false, "rien de lu : jamais déclarée vide");
const regles = lire("src/publication/lot/regles.js");
ok(/if \(decisions\.photoVide === true\) \{\s*motifs\.push\(\{ cle: "photo"/.test(regles), "bilanArticle : une photo de remplissage = un motif « Photo » (rien ne part avec)");

console.log("\n4. La description fidèle (règles 4 et 5)");
const fiche = { titre: "Hoodie Nike kaki", marque: "Nike", couleur: "Kaki", etat: "Très bon état", genre: "" };
const ia = "Hoodie Nike kaki en coton. Bon état général, porté quelques fois. Idéal pour femme.\n\n#nike #hoodie #kaki #femme #streetwear";
const v = D.descriptionFidele(ia, "vinted", { fiche });
ok(v.includes("Très bon état général") && !/(^|[^è])Bon état/.test(v.replace("Très bon état", "")), "« Bon état général » devient « Très bon état général » (l'état de la fiche)", v);
ok(v.includes("#nike #hoodie #kaki") && !v.includes("#femme") && !v.includes("#streetwear"), "Vinted : seuls les hashtags que la fiche fonde restent (#femme, #streetwear tombent)", v);
ok(!/pour femme/.test(v), "« pour femme » sans rien qui le fonde : tombe (aucun genre inventé)", v);
const l = D.descriptionFidele(ia, "leboncoin", { fiche });
ok(!l.includes("#"), "Leboncoin : aucun hashtag", l);
ok(!D.descriptionFidele("Bel article #vintage en laine.", "ebay", { fiche: { titre: "Pull vintage laine" } }).includes("#") && D.descriptionFidele("Bel article #vintage en laine.", "ebay", { fiche: { titre: "Pull vintage laine" } }).includes("vintage en laine"), "eBay : « #vintage » dans une phrase redevient « vintage »");
const dep = D.descriptionFidele("Pull.\n#pull #laine #bleu #vintage #hiver #chaud #doux", "depop", { fiche: { titre: "Pull laine bleu vintage hiver chaud doux" } });
ok((dep.match(/#/g) ?? []).length === 5, "Depop : 5 hashtags au plus", dep);
ok(D.descriptionFidele("Robe homme taille M.", "vinted", { fiche: { titre: "Robe", genre: "Femme" } }) === "Robe femme taille M.", "fiche « Femme » : « homme » devient « femme »");
ok(D.descriptionFidele("Veste pour femme.", "vinted", { fiche: { titre: "Veste femme" } }) === "Veste pour femme.", "« pour femme » fondé par le titre : il reste");
const vendeur = "Mon pull, bon état. #vintage #femme";
ok(D.descriptionFidele(vendeur, "vinted", { fiche, texteDuVendeur: true }) === vendeur, "le texte du vendeur fait foi sur Vinted (état et hashtags gardés)");
// (30/10, lot E) Le texte du vendeur part TEL QUEL partout (avant : sa ligne de hashtags tombait hors Vinted/Depop).
for (const p of ["leboncoin", "beebs", "ebay", "opla"]) ok(D.descriptionFidele(vendeur, p, { fiche, texteDuVendeur: true }) === vendeur, `… et sur ${p} aussi (lot E : hashtags du vendeur gardés)`, D.descriptionFidele(vendeur, p, { fiche, texteDuVendeur: true }));
// thecloset72000, 30/10 : sa référence ajoutée sous le texte de FillSell, absente de toute copie rédigée.
const copies = { vinted: ["Jean Lee bleu.", "", "Envoi rapide ! 🚀", "", "#lee #jean #relaxedfit"].join("\n"), leboncoin: "Jean Lee bleu. Remise en main propre." };
const carte = ["Jean Lee bleu.", "", "#the_closet72jeanFR44 #jean"].join("\n");
const siennes = D.lignesEcritesParLaPersonne(carte, Object.values(copies));
ok(siennes.size === 1 && [...siennes][0].includes("the_closet72jeanfr44"), "lignes écrites par la personne : sa référence seulement (le texte de FillSell n'en fait pas partie)", JSON.stringify([...siennes]));
for (const p of ["vinted", "depop", "leboncoin", "beebs", "ebay"]) {
  const out = D.descriptionFidele(carte, p, { fiche: { titre: "Jean Lee", etat: "Bon état" }, lignesDuVendeur: siennes });
  ok(out.endsWith("#the_closet72jeanFR44 #jean"), `${p} : « #the_closet72jeanFR44 #jean » part tel quel (lot E)`, out);
}
const ia2 = ["Jean Lee bleu.", "", "#lee #jean #relaxedfit"].join("\n");
ok(!D.descriptionFidele(ia2, "leboncoin", { fiche: { titre: "Jean Lee bleu" }, lignesDuVendeur: D.lignesEcritesParLaPersonne(ia2, Object.values(copies)) }).includes("#"), "les hashtags de FillSell, eux, tombent toujours sur Leboncoin (règle 5)");
ok(D.lignesEcritesParLaPersonne(carte, []).size === 0, "copies inconnues : aucune ligne protégée (règle d'avant)");
const dep2 = D.descriptionFidele(["Pull.", "#pull #laine #bleu #vintage", "#ma_ref #stock2"].join("\n"), "depop", { fiche: { titre: "Pull laine bleu vintage" }, lignesDuVendeur: new Set(["#ma_ref #stock2"]) });
ok((dep2.match(/#/g) ?? []).length === 5 && dep2.includes("#ma_ref #stock2"), "Depop : les hashtags de la personne passent d'abord, 5 au plus en tout", dep2);
ok(D.hashtagsServent("vinted") && D.hashtagsServent("depop") && !D.hashtagsServent("leboncoin") && !D.hashtagsServent("ebay") && !D.hashtagsServent("beebs"), "hashtags utiles : Vinted et Depop seulement");
ok(D.descriptionFidele("", "vinted", { fiche }) === "", "un texte vide reste vide (rien n'est ajouté)");

console.log("\n5. Les modèles Vinted de la marque (C6, C7)");
const TEL = ["Électronique", "Téléphones portables et équipements de communication", "Téléphones portables"];
const sam = L.modelesVintedDuRelevé(TEL, "Samsung");
ok(Array.isArray(sam) && sam.length > 1000, "Samsung en Téléphones portables : la liste complète relevée (plus de 1 000 modèles)", String(sam?.length));
ok(sam && !sam.some((x) => /^iphone/i.test(x)), "… aucun iPhone dans la liste Samsung");
ok(L.modelesVintedDuRelevé(TEL, "samsung")?.length === sam?.length, "la marque se compare sans la casse");
ok(L.modelesVintedPourLaMarque("vinted", "model", ["iPhone 12", "iPhone 13"], "Samsung", TEL) === sam, "le champ « Modèle » Vinted d'un Samsung : la liste Samsung, jamais celle d'Apple");
ok(L.modelesVintedPourLaMarque("leboncoin", "model", ["x"], "Samsung", TEL).join() === "x", "une autre plateforme : sa liste, inchangée");
const lu = L.modeleLuDansLeTexte("Téléphone Samsung Galaxy S10 128 Go noir", sam);
ok(typeof lu === "string" && /s10$/i.test(lu.trim()), "« Samsung Galaxy S10 » lu sur le titre : rempli sans question", String(lu));
ok(L.modeleLuDansLeTexte("Téléphone Samsung Galaxy noir", sam) === null, "« Galaxy » seul (une gamme) : rien n'est posé, la question reste");
ok(L.modeleLuDansLeTexte("Téléphone portable", sam) === null, "rien de lisible : null");

console.log("\n6. Le code livré");
const fa = lire("src/publication/lot/FicheArticle.jsx");
const lp = lire("src/publication/lot/LotPublication.jsx");
const css = lire("src/publication/lot/lot.css");
const ver = lire("src/publication/EcranVerifier.jsx");
const mr = lire("src/publication/moteur/regles.js");
const blocC = css.slice(css.indexOf("REFONTE C"));
ok(/<Logo /.test(fa) && /<Logo /.test(lp.slice(lp.indexOf("export function VueListe("))), "les vrais logos des plateformes : pop-up et lignes (règle 1)");
ok(!/text-overflow:\s*ellipsis/.test(blocC) && !/-webkit-line-clamp/.test(blocC), "aucune ellipse dans les styles de la refonte (règle 2)");
ok(/className="fsf-retirer-pf"/.test(fa) && /Ne pas publier sur/.test(fa), "le retrait d'une plateforme est un bouton « ✕ Ne pas publier sur X » (règle 3)");
ok(/statutPlateforme\(/.test(fa) && /"Prêt"|Prêt/.test(fa) && /À régler/.test(fa), "chaque section de plateforme affiche son statut Prêt / À régler (règle 3)");
ok(/<FicheArticle m=\{m\}/.test(ver), "« Vérifier » d'un seul article monte la même pop-up (C11)");
ok(/descriptionFidele\(edited\[platform\]\?\.description \?\? "", platform, \{\s*fiche: ficheTexte, texteDuVendeur,\s*lignesDuVendeur: lignesEcritesParLaPersonne\(edited\[platform\]\?\.description \?\? "", Object\.values\(descriptionsGenerees \?\? \{\}\)\),\s*\}\)/.test(mr), "le texte qui PART passe par descriptionFidele (construireJobs), lignes de la personne comprises (lot E)");
ok(/descriptionFidele\(/.test(fa) && /hashtagsServent\(/.test(fa), "le texte MONTRÉ aussi (même fonction)");
ok(/seulementLeRayon rechercheOuverte=\{ouvert === "rayon"\}/.test(fa), "« Changer » ouvre la recherche de rayon d'office, la carte ne redit ni la limite ni les champs");
ok(/phase === "rien" && etats\[id\]\?\.ecartement/.test(lp) && /prev\[id\]\?\.phase === "rien" && prev\[id\]\?\.ecartement/.test(lp), "un article qui ne part nulle part (sa seule plateforme écartée d'office) a son « Annuler »");
ok(/\{\(\) => setOuvert\(null\)\}>\{en \? "Later" : "Plus tard"\}/.test(lp), "« Plus tard » ferme la pop-up, sans retirer l'article du lot");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
