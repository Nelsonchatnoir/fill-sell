// Autotest : TITRE REFUSÉ POUR « TROP DE MAJUSCULES » — FILLSELL REMET LA CASSE NORMALE SEUL (PROPOSÉ le 25/10).
//
//     npm run selftest:casse-titre        (destination : scripts/casse-titre-selftest.mjs)
//     node casse-titre-selftest.mjs       (dossier de proposition : le module est à côté)
//
// Cas réel : Thierry Dubois, job Vinted fde2a207 (needs_user depuis le 23/10 12:32), « Monnaie Romaine ,
// Maximin II DAIA, Follis Ou Nummus Spl » refusé en 400 « Le titre contient trop de lettres majuscules. Essaie
// d'utiliser des minuscules. ». Ce qu'il prouve, sans réseau ni base :
//   A. LA LIMITE DE VINTED (7 capitales à la suite, séparateurs ignorés, chiffre ou minuscule qui coupe) sur
//      les 4 refus réels connus et sur des titres ACCEPTÉS réels (suite de 6, chiffres, ponctuation, cyrillique) ;
//   B. LA CORRECTION des refus réels : le titre attendu, sous la limite, seule la casse a changé ;
//   C. CE QUI EST CONSERVÉ : marque (et son écriture de fiche quand il faut la relâcher), sigles, références,
//      chiffres romains, mots déjà mêlés (iPhone, McRAE) ; idempotence ;
//   D. LES MODES : « phrase » (casse du vendeur lue dans sa description) et « titre » (eBay) ;
//   E. LES TITRES ACCEPTÉS ne sont jamais visés par le préventif (aucun n'atteint la limite) ;
//   F. PAS-DE-ROUGE : un refus « majuscules » → reprise corrigée UNE fois, puis la question comme avant ;
//   G. QUESTIONS TRANCHÉES, règle 8 : la question « Titre » de Thierry repart avec le titre corrigé, une fois ;
//   H. LE MOTIF dans les langues des plateformes, jamais confondu avec « symboles » ;
//   I. (si le banc est là) les 3 294 titres acceptés du banc du 25/10 : aucun nouveau titre visé.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const DANS_LE_DEPOT = join(ICI, "..", "supabase", "functions", "_shared", "casse-titre.js");
const CHEMIN = fs.existsSync(DANS_LE_DEPOT) ? DANS_LE_DEPOT : join(ICI, "casse-titre.js");
const M = await import(pathToFileURL(CHEMIN).href);
const { suiteMajusculesMax, depasseSeuilMajuscules, casseTitre, casseTitreDetail, repriseTitreMajuscules,
  titreMajusculesATrancher, MOTIF_MAJUSCULES_RE, titreEnvoye } = M;

let ko = 0;
let n = 0;
const ok = (c, m, detail) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };
// Seule la casse change : même longueur, mêmes caractères à la casse près.
const memeTexte = (a, b) => a.length === b.length && a.toLowerCase() === b.toLowerCase();

const THIERRY = "Monnaie Romaine , Maximin II DAIA, Follis Ou Nummus Spl";
const THIERRY_DESCRIPTION = "Monnaie Romaine , Maximin II DAIA, Follis Ou Nummus.\n\n4,7 grammes\n\n20mm\n\nRéf MRO2026-29-18";
const THIERRY_CORRIGE = "Monnaie Romaine , Maximin II Daia, Follis Ou Nummus Spl";
const MOTIF_FR = "Le titre contient trop de lettres majuscules. Essaie d'utiliser des minuscules.";

// ── A. La limite de Vinted ──────────────────────────────────────────────────
console.log("A. La limite de Vinted : 7 capitales à la suite (mesurée le 25/10)");
const REFUS = [
  ["Jaz Réveil de voyage BOURSIC 319-91 vintage avec étui", 7, "f3a5dce8, 08/09"],
  ["Cardigan KILIBBI rayé taille unique", 7, "d2e54b35, 19/09 (deux fois)"],
  [THIERRY, 7, "fde2a207, 23/10 : « II DAIA, F » — la virgule ne coupe pas"],
  ["Robe JANE WOOD marron col halter", 8, "15/08, src/utils/vintedTitle.js"],
];
for (const [t, attendu, qui] of REFUS) {
  ok(suiteMajusculesMax(t) === attendu && depasseSeuilMajuscules(t, "vinted"), `refusé par Vinted, suite de ${attendu} : « ${t} » (${qui})`, suiteMajusculesMax(t));
}
// Titres ACCEPTÉS par Vinted (réels, 90 jours) : suite de 6 au plus.
const ACCEPTES = [
  "Blouse NAF NAF fleurie XS", "Robe noire OXANA Taille S/M", "Star Wars Battlefront II Platinum PSP PAL",
  "Astérix & Obélix XXL 2 Mission Las Vegum PS2 PAL FR Complet", "Maillot OM Puma PAVARD 28 – Taille M – Neuf avec étiquette",
  "Casquette VANS Half Box Curved – Vert – NEUVE avec étiquette", "Pull col roulé Heron Preston СТИЛЬ - XL Homme / Femme",
  "H&M L.O.G.G. marinière coton – Taille L vintage y2k", "Ensemble tailleur vintage PRO-MOD marron chevrons veste + jupe T36",
  "T-shirt bleu homme XXL JHK coton basic casual oversize", "SHEIN - Top crop noir côtelé - Taille L- Bretelles fines - Basique",
  "Metro 2033 - Gioco PC DVD (Edizione Sprea Editori)", "Pull fin femme LEO GUY beige lacé sequins manches longues léger T M/L bohème chic",
  "Fallout: New Vegas PS3 avec notice – PAL FR – Bethesda", "Bottines noires T.41 + sac bandoulière OFFERT",
  "Phare Avant Gauche BMW Série 3 F30 F31 F35 LCI Full LED Hella 63117419633 OEM", "Sniper Elite III Afrika Special Edition Xbox One - PEGI 16",
  "Jean Levi's 501 Vintage Made in USA Gris W34 L36 • Style Grunge Y2K • T44 FR • Bon État(A118)",
  "T-shirt Fortnite blanc logo officiel NEUF avec étiquette Taille XXXXXL (5XL)", "Chemise fille CREEKS 6 ans",
];
for (const t of ACCEPTES) ok(!depasseSeuilMajuscules(t, "vinted"), `accepté par Vinted, sous la limite : « ${t.slice(0, 60)} » (${suiteMajusculesMax(t)})`);
ok(suiteMajusculesMax("PS2 PAL FR Complet") === 6, "un chiffre coupe la suite (« PS2 PAL FR C » = 6, accepté) — sinon 1 385 titres acceptés seraient visés");
ok(suiteMajusculesMax("ABC DEF G") === 7 && suiteMajusculesMax("ABC 1 DEF G") === 4, "espaces et ponctuation ne coupent pas ; un chiffre si");
ok(suiteMajusculesMax("СТИЛЬ ХОРОШО") === 0, "une capitale cyrillique ne compte pas (« Heron Preston СТИЛЬ - XL Homme » accepté)");
ok(!depasseSeuilMajuscules("ABCDEFGHIJ", "leboncoin") && !depasseSeuilMajuscules("ABCDEFGHIJ", "ebay"), "aucune limite connue ailleurs (0 refus en 90 jours) : jamais de préventif");

// ── B. La correction des refus réels ────────────────────────────────────────
console.log("B. Les refus réels corrigés (casse seulement)");
const CORRECTIONS = [
  [THIERRY, { marques: ["Sans marque"], plateforme: "vinted", reference: THIERRY_DESCRIPTION }, THIERRY_CORRIGE],
  ["Jaz Réveil de voyage BOURSIC 319-91 vintage avec étui", { marques: ["Jaz"], plateforme: "vinted" }, "Jaz Réveil de voyage Boursic 319-91 vintage avec étui"],
  ["Cardigan KILIBBI rayé taille unique", { marques: ["KILIBBI"], plateforme: "vinted" }, "Cardigan Kilibbi rayé taille unique"],
  ["Robe JANE WOOD marron col halter", { marques: ["Jane Wood"], plateforme: "vinted" }, "Robe Jane Wood marron col halter"],
  ["Robe JANE WOOD marron col halter", { plateforme: "vinted" }, "Robe Jane Wood marron col halter"],
];
for (const [t, o, attendu] of CORRECTIONS) {
  const d = casseTitreDetail(t, o);
  ok(d.titre === attendu, `« ${t} » → « ${attendu} »`, d.titre);
  ok(!depasseSeuilMajuscules(d.titre, "vinted") && !d.encoreAuDessus, `  sous la limite après correction (suite ${d.suiteApres})`);
  ok(memeTexte(t, d.titre), "  seule la casse a changé (même longueur, mêmes caractères)");
  ok(casseTitre(d.titre, o) === d.titre, "  idempotent");
}
ok(casseTitreDetail("Cardigan KILIBBI rayé taille unique", { marques: ["KILIBBI"], plateforme: "vinted" }).changements[0]?.raison === "limite_vinted",
  "KILIBBI : la marque n'est relâchée QUE parce qu'elle fait 7 capitales à elle seule (dit : limite_vinted)");

// ── C. Ce qui est conservé ──────────────────────────────────────────────────
console.log("C. Marques, sigles, références, chiffres romains, mots mêlés : conservés");
const C1 = casseTitre("Sweat GORE-TEX L'OREAL PARIS ID.4 VW 11B941005B", { plateforme: "vinted" });
ok(C1 === "Sweat Gore-Tex L'Oreal Paris ID.4 VW 11B941005B", "références (ID.4, 11B941005B) et sigle (VW) intacts, mots composés en casse normale", C1);
ok(casseTitre("Phare BMW F30 LED feu OEM PS4 XXL NEUF", { plateforme: "vinted" }) === "Phare BMW F30 LED feu OEM PS4 XXL Neuf", "BMW, F30, LED, OEM, PS4, XXL conservés ; « NEUF » → « Neuf »");
ok(casseTitre("Phare BMW F30 LED OEM PS4 XXL NEUF", { plateforme: "vinted" }) === "Phare BMW F30 LED Oem PS4 XXL Neuf",
  "« LED OEM PS » fait 8 à la suite (Vinted refuserait) : un sigle, le dernier des plus longs, passe en casse normale");
ok(casseTitre("Louis XVIII pièce XIXe siècle MONNAIE", { plateforme: "vinted" }) === "Louis XVIII pièce XIXe siècle Monnaie", "chiffres romains (XVIII, XIXe) conservés");
ok(casseTitre("iPhone 12 Pro Max McRAE PAL FR UK", { plateforme: "vinted" }) === "iPhone 12 Pro Max McRAE Pal FR UK", "mots mêlés (iPhone, McRAE) jamais touchés ; la limite relâche d'abord le sigle le plus long de la suite");
ok(casseTitre("Pull GUESS col V", { marques: ["Guess"], plateforme: "vinted" }) === "Pull GUESS col V", "titre sous la limite : la marque reste écrite comme dans le titre");
ok(casseTitre("Blouse NAF NAF fleurie XS", { marques: ["Naf Naf"], plateforme: "vinted" }) === "Blouse NAF NAF fleurie XS", "marque de deux mots reconnue (« NAF NAF » = « Naf Naf »), conservée");
ok(casseTitre("Baskets NIKE AIR MAX 90 blanches", { marques: ["Nike"], plateforme: "vinted" }) === "Baskets NIKE Air Max 90 blanches", "marque conservée, « AIR MAX » en casse normale suffit");
ok(casseTitre("Cardigan KILIBBI XL rayé", { marques: ["KILIBBI"], plateforme: "vinted" }) === "Cardigan Kilibbi XL rayé", "on relâche le mot qui porte le plus de capitales, pas le sigle voisin");
const imp = casseTitreDetail("A B C D E F G H", { plateforme: "vinted" });
ok(imp.encoreAuDessus && imp.titre === "A B C D E F G H", "rien de conservé ne peut descendre (lettres seules) : encoreAuDessus → la question, titre intact");
ok(casseTitre("") === "" && casseTitre(null) === "", "titre vide : vide");
ok(casseTitre("Robe rose taille M", { plateforme: "vinted" }) === "Robe rose taille M", "un titre sans capitales ressort à l'identique");

// ── D. Les modes ────────────────────────────────────────────────────────────
console.log("D. Mode « phrase » (Vinted, Leboncoin, Beebs, Depop) et mode « titre » (eBay)");
const HP = "LOT DE 3 LIVRES HARRY POTTER";
const HP_DESC = "Lot de trois livres Harry Potter en bon état.";
ok(casseTitre(HP, { plateforme: "vinted", reference: HP_DESC }) === "Lot de 3 livres Harry Potter", "phrase : la casse du vendeur, lue dans sa description (« livres » ; « Harry Potter »)");
ok(casseTitre(HP, { plateforme: "ebay", reference: HP_DESC }) === "Lot de 3 Livres Harry Potter", "titre (eBay) : Capitalisé, liaisons en minuscules");
ok(casseTitre(HP, { plateforme: "vinted" }) === "Lot de 3 Livres Harry Potter", "phrase sans description : un nom propre ne perd jamais sa majuscule");
ok(casseTitre("ROBE LONGUE FLEURIE ZARA TAILLE M", { marques: ["Zara"], plateforme: "vinted", reference: "Robe longue fleurie Zara, taille M." }) === "Robe longue fleurie Zara taille M",
  "titre crié : la marque comme la fiche l'écrit, la casse du vendeur");
ok(casseTitre("T-SHIRT LEVI'S HOMME TAILLE XL", { marques: ["Levi's"], plateforme: "vinted", reference: "t-shirt homme taille XL" }) === "T-shirt Levi's homme taille XL", "premier mot d'un titre crié à la française (« T-shirt »)");
ok(casseTitre("Antique candle box in lethal material WITH CANDLE", { plateforme: "vinted", reference: "antique candle box with candle" }) === "Antique candle box in lethal material with candle", "d702cbed : « WITH CANDLE » → « with candle »");

// ── E. Le préventif ne vise aucun titre accepté ─────────────────────────────
console.log("E. Préventif (get-pending-jobs, app) : aucun titre accepté n'est visé");
for (const t of ACCEPTES) {
  const servi = depasseSeuilMajuscules(t, "vinted") ? casseTitre(t, { plateforme: "vinted" }) : t;
  ok(servi === t, `servi à l'identique : « ${t.slice(0, 50)} »`);
}

// ── F. Pas-de-rouge : la reprise, une fois ──────────────────────────────────
console.log("F. Pas-de-rouge : refus « majuscules » → reprise corrigée UNE fois");
const LE = "2026-10-25T03:00:00.000Z";
const r1 = repriseTitreMajuscules({ titre: THIERRY, action: "publish", plateforme: "vinted", pf: { marque: "Sans marque" }, motifRefus: MOTIF_FR, reference: THIERRY_DESCRIPTION, maintenant: LE });
ok(r1 && r1.apres === THIERRY_CORRIGE && r1.pf.titre_saisi === THIERRY_CORRIGE, "Thierry : le titre corrigé rangé comme une réponse (titre_saisi)", r1);
ok(r1?.pf?.titre_refuse?.motif === MOTIF_FR && r1?.pf?.titre_casse_corrigee?.avant === THIERRY, "titre_refuse (get-pending-jobs l'écrit sur le job) et titre d'avant gardé (titre_casse_corrigee.avant)");
ok(repriseTitreMajuscules({ titre: THIERRY, plateforme: "vinted", pf: { titre_casse_corrigee: { le: LE } }, motifRefus: MOTIF_FR }) === null, "deuxième refus après la correction : null → la question « Titre », comme avant");
ok(repriseTitreMajuscules({ titre: THIERRY, plateforme: "vinted", pf: {}, motifRefus: "Le titre contient trop de symboles d'affilée" }) === null, "un refus « symboles » n'est pas pour cette règle");
ok(repriseTitreMajuscules({ titre: 'Hoodie Streetwear "Gangs / Security" – Motif Bandana Paisley – Taille S ✨', plateforme: "vinted", pf: {}, motifRefus: MOTIF_FR }) === null,
  "rien à mettre en casse normale : null → la question (selftest titre-symboles-vinted : motif vinted_titre_refuse inchangé)");
const r2 = repriseTitreMajuscules({ titre: "Titre de la fiche", action: "republish", plateforme: "vinted", pf: { republish_snapshot: { titre: "Cardigan KILIBBI rayé taille unique", marque: "KILIBBI" } }, motifRefus: MOTIF_FR, maintenant: LE });
ok(r2?.avant === "Cardigan KILIBBI rayé taille unique" && r2?.apres === "Cardigan Kilibbi rayé taille unique", "republication : on corrige le titre CAPTURÉ, celui que Vinted a reçu", r2);
ok(titreEnvoye({ title: "a", action: "publish", platform_fields: { titre_saisi: "b" } }) === "b", "le titre envoyé : la réponse rangée d'abord");

// ── G. Questions tranchées, règle 8 : la question de Thierry repart seule ──
console.log("G. Questions tranchées (handler-watch), règle 8 : job fde2a207 tel qu'en base le 25/10");
const JOB_THIERRY = {
  id: "fde2a207-3d8e-4699-86f2-d9bf34b43da9", platform: "vinted", action: "publish", status: "needs_user", title: THIERRY,
  description: THIERRY_DESCRIPTION,
  error: "Vinted refuse le titre de cette annonce : « Le titre contient trop de lettres majuscules. Essaie d'utiliser des minuscules. ». Rien n'a été publié. Écris un autre titre ci-dessous (bouton « ✋ Compléter ») : la publication repart d'elle-même avec ce titre.",
  platform_fields: {
    marque: "Sans marque", needs_user_source: "champ_a_choisir",
    needsUserField: { field_key: "title", field_label: "Titre", input_type: "text", platform: "vinted", target: { key: "titre_saisi", root: null } },
    titre_refuse: { le: "2026-10-23T10:32:18.171Z", motif: MOTIF_FR },
    pas_de_rouge: { at: "2026-10-23T10:32:18.171Z", motif: "vinted_titre_refuse", verdict: "a_toi" },
    needs_user_tick_le: "2026-10-24T22:00:08.085Z", needs_user_actif_ms: 23221506, needs_user_vu_le: "2026-10-23T10:33:01.290Z",
    needs_user_vu_erreur: "Vinted refuse le titre de cette annonce…",
  },
};
const g = titreMajusculesATrancher(JOB_THIERRY, LE);
ok(g && g.apres === THIERRY_CORRIGE && g.platform_fields.titre_saisi === THIERRY_CORRIGE, "tranchée : titre_saisi = le titre corrigé", g?.apres);
ok(g && !("needs_user_source" in g.platform_fields) && !("needsUserField" in g.platform_fields) && !("needs_user_tick_le" in g.platform_fields), "la question et ses compteurs retirés (le job peut repartir en file)");
ok(g?.platform_fields?.titre_refuse?.motif === MOTIF_FR, "titre_refuse GARDÉ : get-pending-jobs écrit le titre sur le job et archive l'ancien (titre_refuse_remplace)");
ok(Array.isArray(g?.platform_fields?.erreurs_archivees) && g.platform_fields.erreurs_archivees.at(-1)?.erreur?.startsWith("Vinted refuse le titre"), "l'erreur affichée est archivée");
ok(titreMajusculesATrancher({ ...JOB_THIERRY, platform_fields: g.platform_fields, status: "needs_user" }, LE) === null, "une seule passe par job (titre_casse_corrigee)");
ok(titreMajusculesATrancher({ ...JOB_THIERRY, platform_fields: { ...JOB_THIERRY.platform_fields, titre_refuse: { motif: "Le titre contient trop de symboles d'affilée" } } }, LE) === null, "motif « symboles » : règle 7, pas celle-ci");
ok(titreMajusculesATrancher({ ...JOB_THIERRY, status: "pending" }, LE) === null, "jamais sur un job qui n'attend pas la personne");

// ── H. Le motif, dans les langues des plateformes ───────────────────────────
console.log("H. Le motif « majuscules »");
for (const t of [MOTIF_FR, "Il titolo contiene troppe lettere maiuscole", "El título contiene demasiadas letras mayúsculas",
  "Der Titel enthält zu viele Großbuchstaben", "De titel bevat te veel hoofdletters", "Tytuł zawiera zbyt wiele wielkich liter",
  "O título contém demasiadas letras maiúsculas", "The title contains too many capital letters"]) ok(MOTIF_MAJUSCULES_RE.test(t), `reconnu : « ${t} »`);
for (const t of ["Le titre contient trop de symboles d'affilée", "troppi simboli consecutivi", "Le champ Titre doit être renseigné"]) ok(!MOTIF_MAJUSCULES_RE.test(t), `pas confondu : « ${t} »`);

// ── I. Le banc du 25/10 (lecture seule, hors dépôt) ─────────────────────────
const BANC = join(ICI, "banc-suites.json");
if (fs.existsSync(BANC)) {
  console.log("I. Banc : titres ACCEPTÉS par Vinted (90 jours) dont la suite atteint 5");
  const banc = JSON.parse(fs.readFileSync(BANC, "utf8"));
  const vises = banc.filter((r) => depasseSeuilMajuscules(r.titre, "vinted"));
  const connus = new Set(["d2e54b35", "d19a846e", "d702cbed"]); // titres de job partis tempérés ou réécrits
  ok(banc.length > 3000, `${banc.length} titres acceptés lus`);
  ok(vises.every((r) => connus.has(String(r.id).slice(0, 8))), `visés par le préventif : ${vises.length}, tous des titres de job partis autrement (KILIBBI refusé, GOYEAU et WITH CANDLE tempérés au service)`, vises.map((r) => r.titre));
  ok(banc.filter((r) => suiteMajusculesMax(r.titre) === 6).length > 700, "plus de 700 titres acceptés à 6 : la limite est bien 7");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n}`);
process.exit(ko ? 1 : 0);
