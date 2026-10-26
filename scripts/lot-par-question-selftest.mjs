// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAPE 2 DU LOT, PAR QUESTION (26/10 nuit, design B validé par Nico) — `npm run selftest:lot-par-question`
// ═══════════════════════════════════════════════════════════════════════════
// Le lot range ses questions par SUJET (toutes les tailles Beebs ensemble…), chacune répondue en un geste par le
// MÊME bloc que le stepper. Vérifié ici :
//   1. les questions d'un article = celles que le moteur compte (clesQuestions, genre, description, prix d'achat,
//      rayons) + celles du lot (prix, poids, même article ?, port Depop) ; deux tailles = UNE question ;
//   2. un article à revoir a toujours au moins une ligne (sauf texte seul : « Tout valider » le porte) ;
//   3. les sujets : les plus nombreux d'abord, puis dans l'ordre d'apparition ;
//   4. le code livré (26/10, refonte C : une ligne par article) : un moteur qui lève ne met de côté que SON article
//      (même barrière qu'avant), chaque ligne et chaque question sous sa barrière, la livraison repliée s'ouvre
//      d'office en « Saisir le poids », l'envoi garde les cartes d'avant ; dans une ligne, la phrase « Exigé … »
//      répétée disparaît, les phrases qui informent restent.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const S = await imp("src/publication/lot/sujetsDuLot.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const cles = (qs) => qs.map((q) => q.cle).join(" ");

console.log("1. Les questions d'un article : celles que le moteur compte, avec leurs libellés et leurs plateformes");
const m1 = {
  clesQuestions: ["couleur", "vinted:isbn", "ebay:Dimensions", "ebay:Brand"],
  genericRequiredStatus: { vinted: [{ key: "isbn", label: "ISBN", state: "missing" }, { key: "color", label: "Couleur", state: "missing" }] },
  ebayRequiredStatus: [{ name: "Brand", label: "Marque", state: "missing" }],
  plateformesPubliables: new Set(["vinted", "ebay"]),
};
const q1 = S.questionsDeLArticle(m1, [{ cle: "questions" }]);
ok(cles(q1) === "couleur vinted:isbn ebay:Dimensions ebay:Brand", "les quatre clés du moteur, dans son ordre", cles(q1));
ok(q1[0].libelle === "Couleur" && q1[0].plateformes.join() === "vinted", "Couleur : demandée par Vinted (son aspect bloquant)", JSON.stringify(q1[0]));
ok(q1[1].libelle === "ISBN" && q1[1].plateformes.join() === "vinted", "ISBN · Vinted : le libellé de l'aspect");
ok(q1[3].libelle === "Marque", "eBay : le libellé de l'aspect (« Marque »), pas son nom technique", q1[3].libelle);
ok(q1.every((q) => q.type === "moteur"), "toutes répondues par le bloc du stepper (type moteur)");

console.log("\n2. Deux tailles ou plus = UNE question (comme questionTaille du stepper) ; une seule garde son libellé");
const m2 = {
  clesQuestions: ["vinted:size", "beebs:Taille"],
  genericRequiredStatus: { vinted: [{ key: "size", label: "Taille", state: "missing" }], beebs: [{ key: "Taille", label: "Taille", state: "missing" }] },
};
const q2 = S.questionsDeLArticle(m2, []);
ok(q2.length === 1 && q2[0].cle === "taille", "une seule question « taille »", cles(q2));
ok(q2[0].cles.join() === "taille,vinted:size,beebs:Taille", "elle porte toutes les clés (le bloc montre la question groupée)", q2[0].cles?.join());
ok(q2[0].plateformes.join() === "vinted,beebs" && S.titreDuSujet(q2[0]) === "Taille · Vinted, Beebs", "titre « Taille · Vinted, Beebs »", S.titreDuSujet(q2[0]));
const q3 = S.questionsDeLArticle({ clesQuestions: ["beebs:Taille"], genericRequiredStatus: { beebs: [{ key: "Taille", label: "Taille", state: "missing" }] } }, []);
ok(q3.length === 1 && q3[0].cle === "beebs:Taille" && !q3[0].cles && q3[0].sujet === "Taille|beebs", "une taille seule (Beebs) : sa clé, son sujet « Taille · Beebs »", JSON.stringify(q3));
const q4 = S.questionsDeLArticle({ clesQuestions: ["beebs:Âge"], genericRequiredStatus: { beebs: [{ key: "Âge", label: "Âge", state: "missing" }] } }, []);
ok(q4[0].libelle === "Âge" && q4[0].sujet === "Âge|beebs", "l'âge Beebs n'est pas une taille : « Âge · Beebs »", JSON.stringify(q4));
const q5 = S.questionsDeLArticle({
  clesQuestions: ["taille", "beebs:Taille"], plateformesPubliables: new Set(["vinted", "beebs"]),
  genericRequiredStatus: { vinted: [{ key: "size", label: "Taille", state: "missing" }], beebs: [{ key: "Taille", label: "Taille", state: "invalid", blocking: true, value: "XS / 34" }] },
}, []);
ok(q5.length === 1 && q5[0].cles.join() === "taille,beebs:Taille" && q5[0].plateformes.join() === "vinted,beebs", "taille partagée manquante + grille Beebs : une question, deux plateformes", JSON.stringify(q5));

console.log("\n3. Les drapeaux du moteur et les motifs du lot");
const m6 = {
  clesQuestions: [], vintedGenreBlocked: true, beebsGenreBlocked: true, descriptionVideVinted: true, prixAchatManquant: true,
  rayonsAChoisir: { beebs: { question: "x" } },
};
const q6 = S.questionsDeLArticle(m6, [{ cle: "prix" }, { cle: "poids" }, { cle: "jumeau" }, { cle: "port_depop" }], { jumeaux: [{ platform: "leboncoin", titre: "Robe" }] });
ok(cles(q6) === "genre:vinted genre:beebs description prix_achat rayon:beebs prix poids jumeau:leboncoin port_depop", "genre ×2, description, prix d'achat, rayon, prix, poids, même article, port Depop", cles(q6));
ok(q6.find((q) => q.cle === "rayon:beebs")?.type === "rayon" && q6.find((q) => q.cle === "poids")?.plateformes.join() === "leboncoin", "rayon → carte rayon ; poids → Leboncoin");
ok(q6.find((q) => q.cle === "jumeau:leboncoin")?.jumeau?.titre === "Robe", "le même article ? porte l'annonce qui ressemble");
ok(S.questionsDeLArticle(m6, [], { lang: "en" }).find((q) => q.cle === "genre:vinted")?.libelle === "Who it's for", "en anglais : « Who it's for »");

console.log("\n4. Jamais un article à revoir sans ligne (sauf le texte seul, porté par « Tout valider »)");
const sansCles = S.questionsDeLArticle({ genericRequiredStatus: {} }, [{ cle: "questions" }]);
ok(sansCles.length === 1 && sansCles[0].type === "cta", "un motif « questions » sans clé lisible → « À vérifier » (ouvre la feuille)", JSON.stringify(sansCles));
ok(S.questionsDeLArticle({ clesQuestions: [] }, []).length === 1, "aucun motif lisible → « À vérifier »");
ok(S.questionsDeLArticle({ clesQuestions: [] }, [{ cle: "aucune" }])[0]?.type === "cta", "« aucune plateforme » → « À vérifier »");
ok(S.questionsDeLArticle({ clesQuestions: [] }, [{ cle: "texte" }]).length === 0, "le texte seul : aucune ligne (« Tout valider »)");
const inconnue = S.questionsDeLArticle({ clesQuestions: ["etat"], plateformesPubliables: new Set(["vinted"]) }, []);
ok(inconnue[0]?.cle === "etat" && inconnue[0]?.libelle === "etat", "une clé sans plateforme n'est jamais mal découpée", JSON.stringify(inconnue));
ok(S.questionsDeLArticle(null, []).length === 0, "sans moteur : rien (l'article est rendu ailleurs)");

console.log("\n5. Les sujets du lot : les plus nombreux d'abord, puis dans l'ordre d'apparition");
const taille = { cle: "beebs:Taille", libelle: "Taille", plateformes: ["beebs"], sujet: "Taille|beebs", type: "moteur" };
const age = { cle: "beebs:Âge", libelle: "Âge", plateformes: ["beebs"], sujet: "Âge|beebs", type: "moteur" };
const prix = { cle: "prix", libelle: "Prix de vente", plateformes: [], sujet: "Prix de vente|", type: "prix" };
const sujets = S.sujetsDuLot([{ id: "a", questions: [prix] }, { id: "b", questions: [taille, age] }, { id: "c", questions: [age, taille] }]);
ok(sujets.map((s) => s.sujet).join(" ; ") === "Taille|beebs ; Âge|beebs ; Prix de vente|", "Taille (2), Âge (2), Prix (1)", sujets.map((s) => s.sujet).join(" ; "));
ok(sujets[0].lignes.map((l) => l.id).join() === "b,c" && sujets[2].lignes[0].id === "a", "chaque ligne = un article × une question");
ok(S.titreDuSujet(sujets[2]) === "Prix de vente" && S.titreDuSujet(sujets[0]) === "Taille · Beebs", "titres : « Prix de vente », « Taille · Beebs »");

console.log("\n6. Le code livré de l'écran (26/10, refonte C : une ligne par article)");
const lot = lire("src/publication/lot/LotPublication.jsx");
const vue = lot.slice(lot.indexOf("export function VueListe("), lot.indexOf("// Rend, sous une barrière, l'erreur"));
ok(vue.length > 2000, "la vue « une ligne par article » est là (VueListe)");
ok(/try \{[\s\S]{0,700}questionsDeLArticle\([\s\S]{0,200}\} catch \(erreur\) \{\s*casses\.push\(\{ id, erreur \}\);/.test(vue), "un moteur qui lève en lisant ses questions : l'article est mis à part, l'écran continue");
ok(/casses\.map\(\(\{ id, erreur \}\) => \([\s\S]{0,200}onErreur=\{\(e\) => mettreDeCote\(id, e, "questions"\)\}[\s\S]{0,200}<Relancer erreur=\{erreur\} \/>/.test(vue), "… et mis de côté par SA barrière, comme avant (mettreDeCote « questions »)");
ok(/function Relancer\(\{ erreur \}\) \{\s*throw erreur;/.test(lot), "Relancer rend l'erreur sous la barrière");
ok((vue.match(/<BarriereErreur key=\{id\} nom=\{`ligne \$\{id\}`\} onErreur=\{\(e\) => mettreDeCote\(id, e, "ligne"\)\}/g) ?? []).length >= 3, "chaque ligne (à régler, prêts, autres) sous sa barrière : une ligne cassée met son article de côté");
ok(/<BarriereErreur key=\{`\$\{id\}:\$\{q\.cle\}`\} nom=\{`question \$\{id\}`\}/.test(vue), "chaque question sous la ligne, sous sa barrière");
ok((vue.match(/<Rendu f=\{\(\) => ligne\(id\)\} \/>/g) ?? []).length === 2 && !/\{ligne\(id\)\}/.test(vue) && /function Rendu\(\{ f \}\) \{\s*return f\(\);/.test(lot),
  "une ligne se construit DANS sa barrière (Rendu), jamais dans le rendu de la liste (aperçu « casse » du 26/10)");
ok(/const sansPoids = [^;]*?try \{/.test(vue.replace(/\n/g, " ")), "le compte « sans poids » ne lève jamais pour un moteur cassé");
ok(vue.includes("seulement={q.cles ?? [q.cle]} puces"), "une question sous la ligne = le bloc du stepper limité à SES clés, en puces");
ok(/for \(const id of aTexte\) decider\(id, \{ texteValide: true \}\)/.test(vue) && /for \(const id of textesValides\) decider\(id, \{ texteValide: false \}\)/.test(vue), "« Tout valider » valide les textes du lot, « Annuler » les rend");
ok(/places\.current\.get\(id\) === "haut"/.test(vue) && /useRef\(new Map\(\)\)/.test(vue), "une ligne garde sa place quand elle devient prête (C2 : rien ne saute)");
ok(/remettrePlateforme\(id, e\.p\)/.test(vue) && /phraseEcartees\(/.test(vue), "une plateforme écartée d'office : une ligne discrète et « Annuler »");
ok(/<FicheArticle m=\{mOuvert\}/.test(vue), "toucher une ligne ouvre LA pop-up de l'article (FicheArticle)");
ok(/onClick=\{\(\) => setOuvert\(null\)\}>\{en \? "Later" : "Plus tard"\}/.test(vue), "« Plus tard » ferme sans rien décider (jamais un retrait du lot)");
ok(/<PliDuLot [^>]*ouvertDOffice=\{choixPoidsLbc === "saisir"\}/.test(lot), "la livraison du lot est repliée, ouverte d'office quand le lot attend un poids saisi");
ok(/\{!envoi && blocProtege\("liste",/.test(lot) && /\{envoi && aCompleter\.map\(\(id\) => \(/.test(lot), "hors envoi : la liste ; pendant l'envoi : les cartes d'avant");
ok(/sansPoids\.length > 0 && \(/.test(vue) && /<PoidsPourTous en=\{en\} ids=\{sansPoids\}/.test(vue), "« Colis · N articles sans poids » porte « Un poids pour les N »");

console.log("\n7. Le bloc de questions dans une ligne de sujet");
const bloc = lire("src/publication/BlocQuestions.jsx");
ok(bloc.includes('q.questionTaille && (voir("taille") || q.questionTaille.lignes.some(({ gp, a }) => voir(gp === "ebay" ? `ebay:${a.name}` : `${gp}:${a.key}`)))'),
  "la taille groupée se montre pour la clé d'une de ses plateformes (jamais une ligne vide)");
ok(bloc.includes('{!seulement && <div className="fsn-q-why">{en ? "Required by these platforms.'), "« Exigé par ces plateformes » : retirée d'une ligne de sujet");
ok(bloc.includes('(!seulement || (gp === "vinted" && a.key === "isbn") || a.state === "invalid") && <div className="fsn-q-why">'), "aspect : « Exigé ici » retirée, l'ISBN (où le trouver) et la valeur hors liste restent");
ok(bloc.includes('(!seulement || a.state === "invalid") && <div className="fsn-q-why">'), "eBay : « Exigé par eBay » retirée, la valeur hors liste reste");
ok(bloc.includes('(brut || !seulement) && <div className="fsn-q-why">'), "taille groupée : la valeur lue (« XS / 34 » ne s'écrit pas…) reste");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
