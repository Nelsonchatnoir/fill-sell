// ═══════════════════════════════════════════════════════════════════════════
// Selftest « ZÉRO DOUBLON, JAMAIS DEUX OBJETS FUSIONNÉS » (2026-09-25)
//   node --import ./scripts/loader-ext.mjs scripts/doublons-selftest.mjs
//
// La règle vit en SQL (migrations 20260925150000 et 20260925151000) ; sa
// référence JS (scripts/lib/meme-objet.mjs) sert au recensement à blanc et à
// ce test. Trois choses sont prouvées :
//   1. la règle, sur des paires RÉELLES du parc (titres, prix, distances
//      d'empreintes mesurées le 25/09) : ce qui est certain l'est, ce qui est
//      douteux reste une question, deux objets différents ne sont jamais
//      fusionnés ;
//   2. les listes (mots vides, marques vides) sont les MÊMES en JS et en SQL,
//      à l'octet ;
//   3. les gardes structurelles des migrations sont en place (le faisceau ne
//      rend que 'propose', les fonctions qui prennent un compte ne sont pas
//      appelables par une personne connectée, la décision humaine est
//      définitive, la défusion rend l'identité Vinted).
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = await import(pathToFileURL(join(ROOT, "scripts/lib/meme-objet.mjs")).href);
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const verdict = (titreA, titreB, prixA, prixB, dh = null, ph = null, marques = [null, null]) =>
  M.niveau(M.signaux({ titreA, titreB, prixA, prixB, marqueA: marques[0], marqueB: marques[1],
    distancePhoto: dh == null ? null : { dhash: dh, phash: ph } }));
const cas = (nom, attendu, v) => ok(`${attendu.padEnd(8)} ${nom}`, v.niveau === attendu, JSON.stringify(v));

console.log("\n[1] Certain — la photo prouve, le titre confirme (paires réelles du 25/09)");
cas("« Ancien bénitier » / « Ancien Petit Bénitier » (19 € / 32 €, dHash 0)", "certain", verdict("Ancien bénitier", "Ancien Petit Bénitier", 19, 32, 0, 0));
cas("« Orchidées, roses… » / « Orchidée et rose… » (8,9 € / 6 €, dHash 3)", "certain", verdict("Orchidées, roses et autres fleurs fascinantes", "Orchidée et rose et autres fleurs fascinantes", 8.9, 6, 3, 2));
cas("« Pèse lettres » / « pèse lettre ancien vintage balance… » (dHash 1)", "certain", verdict("Pèse lettres", "pèse lettre ancien vintage balance poste appareil mesure", 32, 35, 1, 2));
cas("« Maquette Heller 80289 Alouette III » ×2 (dHash 0)", "certain", verdict("YR059 HELLER 1/72 maquette helicoptere 80289 Alouette III Sécurité Civile", "Maquette heller ref 80289 ( alouette iii securite civile ) au 1/72", 18.49, 25, 0, 0));
cas("« Wrangler lot 3 boxers… » / « 3 boxers Wrangler » (lots des deux côtés)", "certain", verdict("Wrangler lot 3 boxers homme coton/élasthanne braguette boutonnée M", "3 boxers Wrangler", 32.35, 30, 0, 0));
cas("titre exact + prix égal, sans photo connue", "certain", verdict("0803 - Jupe d été doublée taille 48 - BP", "0803 - Jupe d été doublée taille 48 - BP", 5, 5));

console.log("\n[2] Probable — une QUESTION, jamais une fusion");
cas("LE PICHET : « années 30 » / « années 1930 », photos différentes (fond détouré, dHash 22)", "probable", verdict("Pichet Art déco années 30 Tchécoslovaquie céramique oiseaux fleurs vintage", "Pichet Art Déco Tchécoslovaquie années 1930 Céramique Oiseaux Fleurs Vintage", 15, 25, 22, 20));
cas("le pichet sans empreinte connue (titre précis, 9 mots)", "probable", verdict("Pichet Art déco années 30 Tchécoslovaquie céramique oiseaux fleurs vintage", "Pichet Art Déco Tchécoslovaquie années 1930 Céramique Oiseaux Fleurs Vintage", 15, 25));
cas("LOT CONTRE UNITÉ : « 6 Spatules… » (10 €) / « Spatule à raclette » (1,8 €), même photo", "probable", verdict("6 Spatules à raclette personnalisées", "Spatule à raclette", 10, 1.8, 0, 2));
cas("LOT CONTRE UNITÉ : « Deux Jolie Petit Tableaux » (25 €) / « Jolie petit tableau jardin » (9 €)", "probable", verdict("Jolie petit tableau jardin", "Deux Jolie Petit Tableaux", 9, 25, 0, 0));
cas("photo réutilisée : « Chaussettes à paillettes à message » / « … Aventurière »", "probable", verdict("Chaussettes à paillettes à message", "Chaussettes à paillettes Aventurière", 5, 5, 0, 0));
cas("nombres partiels : « Lot 4 coupelles … 7,5 cm » / « Lot 4 coupelles … »", "probable", verdict("Lot 4 coupelles chinoises anciennes porcelaine décor floral marque rouge 7,5 cm", "Lot 4 coupelles chinoises porcelaine décor floral marques rouges", 35, 35, 0, 0));
cas("« Boite Massily » / « … Massilly … » : photo identique, titre qui se recoupe à peine", "probable", verdict("Boite Massily france", "RARE Grande Boite metal Massilly France decor HB Henriot Quimper VINTAGE", 5, 8.01, 3, 4));
{
  const v = M.signaux({ titreA: "6 Spatules à raclette personnalisées", titreB: "Spatule à raclette", prixA: 10, prixB: 1.8, distancePhoto: { dhash: 0, phash: 2 } });
  ok("la garde « lot contre unité » est bien ce qui empêche le certain", v.lot === "lot_contre_unite", JSON.stringify(v));
}

console.log("\n[3] Écarté — deux objets, jamais rapprochés");
cas("kits de Louis : « Rangement Blanc et Noir » / « … Blanc et Gris » (même photo)", "ecarte", verdict("Rangement Blanc et Noir pour 12 pots et 12 couvercles pour yaourtière Multidélices", "Rangement Blanc et Gris pour 12 pots et 12 couvercles pour yaourtière Multidélices", 10, 10, 0, 0));
cas("tomes : « princesses tome 2 » / « princesses tome 3 »", "ecarte", verdict("Livre une, deux, trois princesses tome 2 les lettres volées", "Livre une, deux, trois princesses tome 3 l'invité fantôme", 2, 2, 0, 0));
cas("marques : « Soutien-gorge Freegun 90B » / « soutien gorge » (marque Confidence)", "ecarte", verdict("0713 - Soutien-gorge Freegun 90B", "0713 - soutien gorge taille 110E", 5, 5, null, null, ["Freegun", "Confidence Lingerie"]));
cas("titres exacts génériques, photos différentes (« Spatule raclette personnalisée »)", "ecarte", verdict("Spatule raclette personnalisée", "Spatule raclette personnalisée", 1.8, 1.8, 25, 24));
cas("« Chaussettes à paillettes 5 » / « … fais-moi fondre », photos différentes", "ecarte", verdict("Chaussettes à paillettes 5", "Chaussettes à paillettes fais-moi fondre", 5, 5, 30, 30));
cas("« Montre Seiko or jaune noire femme » / « Montre Seiko quartz day/date », photos différentes", "ecarte", verdict("Montre Seiko or jaune noire femme", "Montre Seiko quartz day/date / Seiko quartz day/date watch", 30, 30, 17, 14));

console.log("\n[4] Les mots qui comptent et les décennies (miroir de titre_jetons / titre_nombres)");
ok("jetons : pluriels ramenés, mots vides retirés, « années 30 » = 1930",
  JSON.stringify(M.jetonsDuTitre("Pichet Art déco années 30 Tchécoslovaquie céramique oiseaux fleurs vintage")) === JSON.stringify(["1930", "annee", "art", "ceramique", "deco", "fleur", "oiseau", "pichet", "tchecoslovaquie"]),
  JSON.stringify(M.jetonsDuTitre("Pichet Art déco années 30 Tchécoslovaquie céramique oiseaux fleurs vintage")));
ok("jetons des deux pichets identiques", JSON.stringify(M.jetonsDuTitre("Pichet Art Déco Tchécoslovaquie années 1930 Céramique Oiseaux Fleurs Vintage")) === JSON.stringify(M.jetonsDuTitre("Pichet Art déco années 30 Tchécoslovaquie céramique oiseaux fleurs vintage")));
ok("« Vintage » n'est pas une marque", M.marqueUtile("Vintage") === "" && M.marqueUtile("Sans marque") === "" && M.marqueUtile("Kiabi") === "kiabi");
ok("lot : « 6 Spatules », « Lot de », « Deux », « 3 x » ; pas « 0803 - Jupe »",
  M.quantiteMarquee("6 Spatules à raclette") && M.quantiteMarquee("Lot de 2 livres") && M.quantiteMarquee("Deux jolis tableaux") && M.quantiteMarquee("Boxers 3 x Wrangler") && !M.quantiteMarquee("0803 - Jupe d été"));

console.log("\n[5] JS ≡ SQL, à l'octet");
const lire = (f) => fs.readFileSync(join(ROOT, "supabase/migrations", f), "utf8");
const m1 = lire("20260925150000_rattachement_preuves_croisees.sql");
const m2 = lire("20260925151000_doublons_fiches.sql");
const liste = (sql, bloc) => { const m = sql.match(new RegExp(`⟦${bloc}:début⟧[\\s\\S]*?ARRAY\\[([\\s\\S]*?)\\][\\s\\S]*?⟦${bloc}:fin⟧`)); return m ? m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")) : null; };
ok("MOTS_VIDES : JS ≡ SQL (titre_jetons)", JSON.stringify(liste(m1, "mots-vides")) === JSON.stringify(M.MOTS_VIDES), JSON.stringify(liste(m1, "mots-vides")));
ok("MARQUES_VIDES : JS ≡ SQL (titre_marque_utile)", JSON.stringify(liste(m1, "marques-vides")) === JSON.stringify(M.MARQUES_VIDES), JSON.stringify(liste(m1, "marques-vides")));
ok("seuils photo SQL = _shared/empreinte-image.ts (5 / 8 / 10)", /WHEN d <= 5 AND p <= 8 THEN 'identique' WHEN d <= 10 THEN 'proche'/.test(m1));
ok("certain photo SQL : ov ≥ 0,75 ; titre précis : ≥ 5 mots, ≥ 0,8",
  /certain_photo := v = 'identique' AND ov >= 0\.75/.test(m2) && /ov >= 0\.8 AND COALESCE\(\(s ->> 'communs'\)::integer, 0\) >= 5/.test(m2));
ok("lot contre unité SQL : ratio de prix > 1,8", /v_ratio > 1\.8/.test(m2));

console.log("\n[6] Les gardes des migrations");
ok("md5 prod relu AVANT tout patch (classer, nombres, fusion, défusion)",
  /a20a0db8459ca37ded6c21834bc3b469/.test(m1) && /d07ba847ed719f67168862827dcc078f/.test(m1) && /c14d1f1839c6991578378caf8b3e4077/.test(m2) && /fff536e47878e751e7f5ac7b8238b7a7/.test(m2));
ok("le faisceau reste 'propose' (aucune nouvelle bande n'est introduite dans classer)", !/'bande', 'certain'[^\n]*photo/.test(m1));
ok("fusion pour un compte : jamais appelable par une personne connectée",
  /REVOKE ALL ON FUNCTION public\.inventaire_fusionner_pour\(uuid, bigint, bigint, text\) FROM PUBLIC, anon, authenticated/.test(m2));
ok("la décision humaine est définitive (refusée, défaite, proposition refusée/détachée)",
  /d\.statut IN \('refusee', 'defaite'\)/.test(m2) && /r\.decision IN \('refus_proposition', 'detache'\)/.test(m2) && /f\.defait_le IS NOT NULL/.test(m2));
ok("la défusion rend l'identité Vinted et clôt la paire", /ELSIF v_cle = 'vinted_identite' THEN/.test(m2) && /SET statut = 'defaite'/.test(m2));
ok("une fiche vendue n'est jamais fusionnée ni proposée", /v_motif := 'fiche_vendue'/.test(m2));
ok("le « Oui » de l'app passe par auth.uid()", /v_user uuid := auth\.uid\(\);[\s\S]*inventaire_fusionner_pour\(v_user, d\.garde, d\.absorbe/.test(m2));

console.log(ko ? `\n${ko} contrôle(s) en échec.` : "\nTous les contrôles passent : certain = une seule fiche, douteux = une question, deux objets = jamais fusionnés.");
process.exit(ko ? 1 : 0);
