// ═══════════════════════════════════════════════════════════════════════════
// LE FORMAT DU COLIS VINTED : AU LOT, À L'ENVOI, RETENU PAR RAYON — SELFTEST
// (05/10, point 3)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico : « Ajoute-la au bloc Livraison et à l'envoi. Même
// principe que pour Leboncoin : rien de deviné ; le choix de la personne est
// retenu pour les publications suivantes. »
// Constat : la carte Vinted du lot n'avait qu'une phrase ; la table générée
// du 27/09 passait AVANT le relevé du formulaire et nommait l'id 8 « 5 kg » —
// le relevé réel (03-04/10) dit « 1|Petit, 2|Moyen, 3|Grand, 8|Volumineux et
// lourd » : la carte cachait « Volumineux et lourd ».
//
// Ce qu'il garantit :
//   1. la clé du retenu (cleColisRetenu) = le chemin en texte « A > B > C » ;
//   2. la grille RELEVÉE passe avant la table générée, avec SES libellés ;
//   3. l'ordre de ce qui part : choix sur la copie (carte, lot) > fiche >
//      retenu du rayon > rien ; colis_source 'manuel' sur tout choix de la
//      personne (copie, fiche, « Vinted choisit » compris), 'retenu' pour le
//      retenu ; rien n'est jamais deviné (ni du poids, ni du rayon) ;
//   4. retenir = la RPC de fusion, au chemin ["vinted","colis_retenus"],
//      { clé: { id, libelle } } ou { clé: null } ; jamais hors grille, jamais
//      une écriture inchangée ; une lecture par session ;
//   5. le lot et le stepper sont branchés (lecture statique).
//
//   npm run selftest:colis-vinted-retenu
import fs from "node:fs";
import {
  cleColisRetenu, grilleColisVinted, chargerGrilleColisRelevee, colisVintedPourJob, colisVintedRetenu,
  colisRetenuDuRayon, colisRetenusDuProfil, retenirColisVinted, semerColisRetenus, colisRetenusEnCache,
  chargerColisRetenus,
} from "../src/utils/vintedColis.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const lire = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const copie = (o) => JSON.parse(JSON.stringify(o));

// Rayons RÉELS : la table générée les connaît (Petit/Moyen/Grand, kilos) ;
// un rayon jamais observé n'a pas de grille.
const PAN = ["Maison", "Décoration", "Rangement et organisation", "Paniers de rangement"];
const BOUIL = ["Maison", "Petits appareils de cuisine", "Bouilloires"];
const PIECES = ["Maison", "Petits appareils de cuisine", "Pièces détachées pour petits appareils de cuisine"];
const ROBE = ["Femmes", "Vêtements", "Robes", "Robes casual"];
const K_PAN = PAN.join(" > ");
const K_BOUIL = BOUIL.join(" > ");

console.log("1. La clé du retenu");
ok(cleColisRetenu(PAN) === K_PAN, "chemin → « A > B > C »");
ok(cleColisRetenu(["Maison ", " Décoration", "", null, "Paniers"]) === "Maison > Décoration > Paniers", "segments rognés, vides retirés (le serveur imite à l'octet)");
ok(cleColisRetenu([]) === null && cleColisRetenu(null) === null && cleColisRetenu("") === null, "rayon vide → aucune clé");

console.log("2. La grille relevée sur le formulaire passe avant la table générée");
ok(JSON.stringify(grilleColisVinted(PAN)?.map((g) => g.id)) === "[1,2,3]", "avant le relevé : la table générée (Petit/Moyen/Grand)");
const lectures = [];
const fauxCatalogue = (valeurs) => ({
  from: (t) => ({ select: (c) => { const q = { eqs: [], eq(k, v) { this.eqs.push([k, v]); return this; },
    maybeSingle: async () => { lectures.push({ t, c, eqs: q.eqs }); return { data: { allowed_values: valeurs } }; } }; return q; } }),
});
const gPan = await chargerGrilleColisRelevee(fauxCatalogue(["1|Petit", "2|Moyen", "3|Grand", "8|Volumineux et lourd"]), PAN);
ok(lectures.length === 1 && lectures[0].eqs.some(([k, v]) => k === "category_key" && v === K_PAN), "le relevé est LU même quand la table connaît le rayon");
ok(JSON.stringify(gPan?.map((g) => g.id)) === "[1,2,3,8]", "après le relevé : 1, 2, 3 et 8 — la grille que Vinted offre vraiment");
ok(gPan?.find((g) => g.id === 8)?.libelle === "Volumineux et lourd", "id 8 = « Volumineux et lourd » (le libellé du relevé), plus jamais « 5 kg »");
await chargerGrilleColisRelevee(fauxCatalogue(["1|Petit"]), PAN);
ok(lectures.length === 1, "une lecture par rayon et par session (cache)");
await chargerGrilleColisRelevee(fauxCatalogue([]), BOUIL);
ok(JSON.stringify(grilleColisVinted(BOUIL)?.map((g) => g.id)) === "[8,9,10]", "relevé vide → la table générée reste (rien d'inventé)");
ok(grilleColisVinted(PIECES) === null, "rayon jamais observé ni relevé → aucune grille");

console.log("3. Ce qui part : copie > fiche > retenu > rien");
const RETENUS = { [K_PAN]: { id: 8, libelle: "Volumineux et lourd" }, [K_BOUIL]: { id: 9, libelle: "10 kg" } };
const fiche = (v) => ({ colis_vinted: { v, source: "manuel" } });
{
  const pf = { categoryPath: PAN, packageSizeId: 2 };
  const r = colisVintedPourJob(pf, fiche(3), RETENUS);
  ok(pf.packageSizeId === 2 && pf.packageSize === "Moyen" && pf.colis_source === "manuel" && r.ranger?.v === 2, "choix sur la copie (carte ou lot) → il part, 'manuel', rangé sur la fiche");
}
{
  const pf = { categoryPath: PAN };
  const r = colisVintedPourJob(pf, fiche(3), RETENUS);
  ok(pf.packageSizeId === 3 && pf.colis_source === "manuel" && r.ranger === null, "sans choix ici : la fiche passe avant le retenu ('manuel', rien à re-ranger)");
}
{
  const pf = { categoryPath: PAN };
  const r = colisVintedPourJob(pf, null, RETENUS);
  ok(pf.packageSizeId === 8 && pf.packageSize === "Volumineux et lourd" && pf.colis_source === "retenu" && r.ranger === null,
    "sans choix ni fiche : le retenu du rayon, libellé du relevé, 'retenu', rien rangé sur la fiche");
}
{
  const base = { categoryPath: ROBE, taille: "M", lbcPoidsGrammes: 5000 };
  const pf = copie(base);
  colisVintedPourJob(pf, null, null);
  ok(JSON.stringify(pf) === JSON.stringify(base), "rien choisi, rien retenu → job identique à l'octet (aucun format deviné du poids ni du rayon)");
  const pf2 = copie(base);
  colisVintedPourJob(pf2, null, RETENUS);
  ok(JSON.stringify(pf2) === JSON.stringify(base), "un retenu d'un AUTRE rayon ne s'applique jamais (clé exacte)");
}
{
  const pf = { categoryPath: PAN, packageSizeId: 0 };
  const r = colisVintedPourJob(pf, fiche(3), RETENUS);
  ok(!("packageSizeId" in pf) && pf.colis_source === "manuel" && r.ranger?.v === 0, "« Vinted choisit » fait ici → aucun format, 'manuel' (le serveur n'y remet pas le retenu)");
}
{
  const pf = { categoryPath: PAN };
  colisVintedPourJob(pf, fiche(0), RETENUS);
  ok(!("packageSizeId" in pf) && pf.colis_source === "manuel", "fiche « Vinted choisit » → passe avant le retenu");
}
{
  const pf = { categoryPath: PAN, packageSizeId: 12 };
  colisVintedPourJob(pf, null, RETENUS);
  ok(pf.packageSizeId === 8 && pf.colis_source === "retenu", "choix hors de la grille du rayon publié (rayon changé) → ne part pas ; le retenu du rayon prend la suite");
}
{
  const pf = { categoryPath: PAN };
  colisVintedPourJob(pf, null, { [K_PAN]: { id: 11, libelle: "5 kg" } });
  ok(!("packageSizeId" in pf) && !("colis_source" in pf), "retenu hors de la grille actuelle → jamais posé");
}
{
  const pf = { categoryPath: PAN };
  colisVintedPourJob(pf, null, { [K_PAN]: null });
  ok(!("packageSizeId" in pf) && !("colis_source" in pf), "retenu à null (« Vinted choisit ») → rien");
}
{
  const pf = { categoryPath: PIECES };
  colisVintedPourJob(pf, null, { [PIECES.join(" > ")]: { id: 2, libelle: "Moyen" } });
  ok(!("packageSizeId" in pf), "rayon sans grille connue → aucun format, même retenu (rien d'inventé)");
}
ok(colisVintedRetenu({ pf: {}, chemin: PAN, retenus: RETENUS })?.origine === "retenu", "la carte montre le retenu du rayon (origine « retenu »)");
ok(colisVintedRetenu({ pf: {}, chemin: PAN, attributsFiche: fiche(2), retenus: RETENUS })?.origine === "fiche", "la carte : la fiche avant le retenu");
ok(colisVintedRetenu({ pf: { packageSizeId: 0 }, chemin: PAN, retenus: RETENUS }) === null, "la carte : « habituel » choisi l'emporte sur le retenu");
ok(colisRetenuDuRayon(RETENUS, BOUIL)?.libelle === "10 kg", "colisRetenuDuRayon : le libellé de la grille actuelle");
ok(JSON.stringify(colisRetenusDuProfil({ vinted: { colis_retenus: RETENUS } })) === JSON.stringify(RETENUS) && JSON.stringify(colisRetenusDuProfil(null)) === "{}", "colisRetenusDuProfil lit platform_settings.vinted.colis_retenus");

console.log("4. Retenir : la RPC de fusion, rien d'autre");
const appels = [];
const fusionner = async (chemin, patch, supprimer = []) => { appels.push({ chemin, patch, supprimer }); return { data: { vinted: { colis_retenus: { ...RETENUS, ...patch } } }, error: null }; };
semerColisRetenus("u1", {});
await retenirColisVinted({ userId: "u1", chemin: PAN, id: 8, fusionner });
ok(appels.length === 1 && JSON.stringify(appels[0].chemin) === '["vinted","colis_retenus"]', "chemin de la fusion : [\"vinted\", \"colis_retenus\"]");
ok(JSON.stringify(appels[0].patch) === JSON.stringify({ [K_PAN]: { id: 8, libelle: "Volumineux et lourd" } }), "patch : { « A > B > C »: { id, libelle } } (libellé du relevé)");
ok(colisRetenusEnCache("u1")?.[K_PAN]?.id === 8, "le cache de la session suit l'écriture");
ok(retenirColisVinted({ userId: "u1", chemin: PAN, id: 8, fusionner }) === null && appels.length === 1, "même valeur → aucune écriture");
ok(retenirColisVinted({ userId: "u1", chemin: PAN, id: 11, fusionner }) === null && appels.length === 1, "format hors de la grille du rayon → jamais retenu");
ok(retenirColisVinted({ userId: "u1", chemin: [], id: 2, fusionner }) === null, "rayon vide → rien");
await retenirColisVinted({ userId: "u1", chemin: PAN, id: 0, fusionner });
ok(appels.length === 2 && JSON.stringify(appels[1].patch) === JSON.stringify({ [K_PAN]: null }) && appels[1].supprimer.length === 0,
  "« Vinted choisit » → la clé passe à null (aucune suppression d'objet, jamais l'objet entier)");
{
  let lus = 0;
  const fauxProfil = { from: (t) => ({ select: (c) => ({ eq: () => ({ maybeSingle: async () => { lus++; return { data: t === "profiles" && /^colis:platform_settings->vinted->colis_retenus$/.test(c) ? { colis: { [K_BOUIL]: { id: 10, libelle: "20 kg" } } } : null }; } }) }) }) };
  const a = await chargerColisRetenus(fauxProfil, "u2");
  const b = await chargerColisRetenus(fauxProfil, "u2");
  ok(a?.[K_BOUIL]?.id === 10 && b === a && lus === 1, "une lecture par session : la seule colonne utile (platform_settings->vinted->colis_retenus)");
}

console.log("5. Le lot et le stepper sont branchés");
const lot = lire("src/publication/lot/LotPublication.jsx");
const liv = lire("src/publication/lot/LivraisonDuLot.jsx");
const carte = lire("src/components/CarteColisVinted.jsx");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/retenirColisVinted\(\{ userId, chemin, id, fusionner: fusionnerReglages \}\)/.test(lot), "lot : le choix se retient par fusionnerReglages");
ok(/m\.poserColisVinted\(voulu === undefined \? null : voulu\)/.test(lot), "lot : le choix part sur les copies Vinted du rayon (même geste que la carte)");
ok(/Recommandé par Vinted/.test(liv) && /Vinted proposera ses tailles pour ce rayon/.test(liv) && /choisirColisVinted\(r\.cle, r\.chemin, g\.id\)/.test(liv),
  "Livraison du lot : « Recommandé par Vinted », les formats du rayon, ou « Vinted proposera ses tailles »");
ok(/retenirColisVinted\(\{ userId, chemin, id, fusionner: fusionnerReglages \}\)/.test(carte) && /chargerColisRetenus\(supabase, userId\)/.test(carte), "carte du stepper : relit le retenu et retient le choix");
ok(/colisVintedPourJob\(champsResolus\.vinted, articleBase\?\.attributs \?\? initialListing\?\.attributs \?\? null, colisRetenus\)/.test(lps), "envoi : le retenu du rayon entre dans colisVintedPourJob");
ok(/poserColisVinted: \(id\) => setEdited/.test(lps), "moteur : poserColisVinted exposé au lot");
ok(![lot, liv, carte].some((s) => /update\(\{\s*platform_settings/.test(s)), "⛔ jamais d'update de platform_settings entier");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ colis Vinted : au lot et à l'envoi, retenu par rayon, rien de deviné");
process.exit(ko ? 1 : 0);
