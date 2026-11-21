// Autotest VERROU : LE STOCK EXISTANT NE COMPTE JAMAIS, ET LE TEXTE DU VENDEUR FAIT FOI (21/11/2026, URGENT — 0c97dc8b).
//
//     node --import ./scripts/loader-ext.mjs scripts/stock-importe-2111-selftest.mjs
//
// Ce qui s'est passé (lu en base, heures de Paris) : le 20/11 de 23:28 à 00:12, 0c97dc8b (essai Pro + Cloud)
// prépare en lot 297 articles de son stock (233 imports Vinted, 58 Leboncoin). 189 lectures de description dépassent la
// garde de 40 s du lot (« lot_preparation_garde » issue « lecture », 42 s en moyenne) : la garde du 19/11 envoie chaque
// article AU MOTEUR SANS SA DESCRIPTION, l'IA rédige à la place de la sienne (128 générations texte_vendeur_description =
// false, origine vinted_sync) et chacune compte (règle du 10/11 : seul titre ET description du vendeur exemptent) :
// « Tu as utilisé tes 120 annonces de ce mois-ci » à 00:03. Au passage, 22 retouches IA pour un quota Pro de 20 : le lot
// ne posait les photos d'origine que lorsqu'il changeait la sélection du moteur.
// Ce qu'il prouve :
//   1. la garde de lecture (regles.issueGardeLecture) : un article importé sans son texte ne va JAMAIS au moteur — il
//      attend sa lecture d'origine ; revenu d'une lecture faite, ou sans annonce d'origine : comme avant ;
//   2. le lot : la garde l'applique (phase « origine », demande de la fenêtre, motif), le refus du serveur le renvoie
//      attendre (moteur démonté, jamais un aller-retour sans fin), les photos d'origine toujours ;
//   3. generate-listing : refus 409 « texte_origine_non_lu » AVANT le guichet et l'IA (la règle de get-pending-jobs),
//      le stock importé ne passe jamais au guichet du quota, la ligne le dit ; l'écran comprend le refus ;
//   4. l'app prévoit pareil (redactionHorsQuota) ; la migration et son inverse (preuve : scripts/quotas/preuve-stock-importe.mjs).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const R = await charger("src/publication/lot/regles.js");
const S = await charger("src/utils/sourceDuTexte.js");

console.log("1. la garde de lecture du lot (regles.issueGardeLecture)");
{
  const g = R.issueGardeLecture;
  ok(typeof g === "function" && R.CODE_TEXTE_ORIGINE_NON_LU === "texte_origine_non_lu", "la règle et le code du serveur existent");
  ok(g({ origine: "vinted_sync", description: "" }) === "origine", "import Vinted sans description (le cas de 0c97dc8b) : il attend sa lecture d'origine, jamais le moteur");
  ok(g({ origine: "vinted_sync", description: null }) === "origine", "… description absente : pareil");
  ok(g({ origine: "vinted_sync", description: "Neuf" }) === "origine", "… description d'un seul mot (rien dit) : pareil");
  for (const p of ["leboncoin", "beebs", "ebay", "depop"]) ok(g({ origine: `releve_${p}`, description: "" }) === "origine", `relevé ${p} sans description : il attend sa lecture`);
  ok(g({ origine: "vinted_sync", description: "Porté deux fois, très bon état." }) === "moteur", "import dont le texte est en main : le moteur, comme avant");
  ok(g({ origine: null, description: "" }) === "moteur", "fiche neuve (aucune annonce d'origine) : le moteur, comme avant — l'IA rédige, c'est une création");
  ok(g({ origine: "lens", description: "" }) === "moteur", "fiche née d'un scan : le moteur");
  ok(g({ origine: "vinted_sync", description: "" }, { origineLueLe: Date.now() }) === "moteur", "revenu d'une lecture d'origine FAITE : la base fait foi (generate-listing relit la fiche), jamais une boucle");
  ok(g(null) === "moteur", "rien : le moteur (prudence, comme avant)");
}

console.log("2. le lot (LotPublication.jsx)");
{
  const lp = lire("src/publication/lot/LotPublication.jsx");
  const pilote = lp.slice(lp.indexOf("// ── LE PILOTE : faire avancer chaque moteur"), lp.indexOf("function raisonRien("));
  const garde = pilote.slice(pilote.indexOf('if (st.phase === "lecture") {'), pilote.indexOf("if (PHASES_MOTEUR.has(st.phase)) {"));
  ok(/maintenant - pilL\.lectureDepuis >= GARDE_LECTURE_MS/.test(garde) && /issueGardeLecture\(itemG, st\) === "origine"/.test(garde),
    "à l'échéance de la lecture, la garde demande à la règle");
  ok(/phase: "origine"[\s\S]{0,400}origineDemandee: false[\s\S]{0,120}originePlateforme: pfG/.test(garde),
    "… un import sans texte passe à « Lecture de ton annonce d'origine » (la fenêtre en demande la lecture)");
  ok(garde.indexOf('issue: "lecture_vers_origine"') > 0 && garde.indexOf('issueGardeLecture(itemG, st)') < garde.indexOf('lusRef.current.add(id);'),
    "… et c'est tracé ; seul un article qui n'attend rien est rendu au moteur");
  ok(/raison: messageLectureOrigine\(\{ plateforme: pfG \}, en \? "en" : "fr", "preparation"\)/.test(garde), "la ligne dit pourquoi elle attend (la phrase de préparation)");
  const redac = pilote.slice(pilote.indexOf('if (phase === "redaction") {'), pilote.indexOf('if (phase === "verification" || phase === "pret"'));
  ok(/m\.platformErrorCode === CODE_TEXTE_ORIGINE_NON_LU/.test(redac) && /lusRef\.current\.delete\(id\);[\s\S]{0,200}phase: "origine"/.test(redac),
    "le refus du serveur (texte_origine_non_lu) renvoie l'article attendre sa lecture, jamais « Pas préparé » en silence");
  ok(/pil\.refusOrigine > 2[\s\S]{0,200}phase: "erreur"/.test(redac) && /n'écrit pas ta description à ta place/.test(redac),
    "… jamais un aller-retour sans fin : au troisième refus, la ligne le dit (il reste au stock, rien d'écrit)");
  ok(/const garder = \(id\) => !\["quota", "rien", "erreur", "retire", "refuse", "envoye", "origine"\]\.includes/.test(lp),
    "un article renvoyé à sa lecture retrouve un moteur NEUF (l'ancien gardait le refus)");
  const montage = pilote.slice(pilote.indexOf('if (phase === "montage") {'), pilote.indexOf('if (phase === "redaction") {'));
  const iPhoto = montage.indexOf('if (m.photoOption !== "original" && typeof m.setPhotoOption === "function")');
  ok(iPhoto > montage.indexOf("if (!memeSelection) {") && iPhoto < montage.indexOf("m.suivant();"),
    "les photos d'ORIGINE avant la rédaction, même quand la sélection du moteur était déjà juste (22 retouches de 0c97dc8b)");
  ok(/m\.setSelected\(new Set\(cible\)\); if \(m\.photoOption !== "original"\) m\.setPhotoOption\("original"\);/.test(montage), "… la pose d'avant reste (sélection changée)");
  ok(/import \{ plateformeOrigine \} from "\.\.\/\.\.\/\.\.\/supabase\/functions\/_shared\/contenu-fiche\.js";/.test(lp) && /issueGardeLecture, CODE_TEXTE_ORIGINE_NON_LU,/.test(lp), "imports en place");
}

console.log("3. generate-listing");
{
  const gl = lire("supabase/functions/generate-listing/index.ts");
  ok(/import \{ plateformeOrigine, lectureOrigineEnAttente \} from "\.\.\/_shared\/contenu-fiche\.js";/.test(gl), "la règle de get-pending-jobs, importée telle quelle");
  const iStock = gl.indexOf("const stockImporte = ligneDuStock && Boolean(plateformeOrigine(item");
  const iRefus = gl.indexOf('code: "texte_origine_non_lu"');
  const iGuichet = gl.indexOf('.rpc("spend_coins_for_generate"');
  const iIA = gl.indexOf("const ANTHROPIC_KEY");
  ok(iStock > 0 && iRefus > iStock && iRefus < iGuichet && iGuichet < iIA, "le refus passe AVANT le guichet du quota et avant tout appel IA (rien de décompté)");
  ok(/if \(stockImporte && !descriptionVendeuse && body\.description_verrouillee !== false && inventaire_id != null/.test(gl),
    "il ne vise que l'article importé relu en base, sans sa description, hors « Générer » demandé");
  ok(/rpc\("fiches_contenu_vendeur", \{ p_user: user\.id, p_ids: \[Number\(inventaire_id\)\] \}\)/.test(gl)
    && /lectureOrigineEnAttente\(f, \(f\.annonces as unknown\[\]\) \?\? \[\], \{ descriptionLueLe: f\.description_lue_le, origineLueLe: f\.origine_lue_le \}\)/.test(gl)
    && /attente\.manque\.includes\("description"\)/.test(gl), "… exactement ce que get-pending-jobs attend au départ (fiches_contenu_vendeur, lectureOrigineEnAttente)");
  ok(/error: "generation_limit", code: "texte_origine_non_lu"/.test(gl) && /\}, 409\);/.test(gl.slice(iRefus, iRefus + 600)),
    "409 lisible par un écran d'avant (generation_limit + message) et par le lot (code)");
  ok(/feature: "texte_origine_non_lu"/.test(gl), "chaque refus est tracé (usage_logs, hors quota)");
  ok(/fcErr\) console\.warn[\s\S]{0,80}rédaction comme avant/.test(gl) && /lecture d'origine illisible[\s\S]{0,80}rédaction comme avant/.test(gl), "base illisible : comme avant (get-pending-jobs retient et réimpose au départ)");
  ok(/passeLegere \|\| stockImporte\s*\n\s*\? \{ data: \{ allowed: true, price: 0, passe_legere: passeLegere, stock_importe: stockImporte \}/.test(gl),
    "le stock importé ne passe jamais au guichet (ni plafond, ni garde-fou du jour, ni débit)");
  ok(/\.\.\.\(stockImporte \? \{ stock_importe: true \} : \{\}\),/.test(gl) && /texte_vendeur_origine: origineItem \|\| null,/.test(gl), "la ligne generate_listing le dit (stock_importe, texte_vendeur_origine)");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/if \(errBody\?\.code === "texte_origine_non_lu"\) \{\s*\n\s*setPlatformErrorCode\("texte_origine_non_lu"\);/.test(lps)
    && lps.indexOf('errBody?.code === "texte_origine_non_lu"') < lps.indexOf('errBody?.error === "generation_limit" && errBody?.message'),
    "l'écran comprend le refus (avant le message générique) et le dit");
}

console.log("4. la prévision de l'app et la migration");
{
  const h = S.redactionHorsQuota;
  ok(h({ origine: "vinted_sync", title: "Pull Brooks XL", description: "" }, { ligneDuStock: true, descriptionALire: false }), "import Vinted sans description : hors quota (avant : compté)");
  ok(h({ origine: "releve_leboncoin", titre: "", description: "" }, { ligneDuStock: true }), "relevé Leboncoin vide : hors quota");
  ok(!h({ origine: null, titre: "Veste", description: "" }, { ligneDuStock: true }), "fiche neuve, l'IA rédige : compte");
  ok(!h({ origine: "vinted_sync", titre: "", description: "" }, { ligneDuStock: false }), "un corps item_data qui se dit importé : compte (seule la fiche de la base fait foi)");
  const mig = lire("supabase/migrations/20261121010000_stock_importe_hors_quota.sql");
  const inv = lire("supabase/rollbacks/20261121010000_stock_importe_hors_quota_INVERSE.sql");
  const prod = lire("scripts/quotas/fixtures/prod-2111-stock-importe.sql");
  ok((mig.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length === 1 && /FUNCTION public\.quota_annonces_consommees\(p_user_id uuid, p_cycle timestamp with time zone\)/.test(mig),
    "la migration ne réécrit QUE quota_annonces_consommees (même signature : droits inchangés)");
  ok((mig.match(/u\.metadata \? 'inventaire_id'\s*\n\s*AND \(COALESCE\(u\.metadata->>'texte_vendeur_origine', ''\) = 'vinted_sync'\s*\n\s*OR COALESCE\(u\.metadata->>'texte_vendeur_origine', ''\) ~ '\^releve_\[a-z\]\+\$'\)\)/g) ?? []).length === 1
    && /prev\.metadata \? 'inventaire_id'\s*\n\s*AND \(COALESCE\(prev\.metadata->>'texte_vendeur_origine', ''\) = 'vinted_sync'/.test(mig),
    "l'article importé sort du décompte, et n'ouvre pas la dédup 24 h");
  ok(!/\b(DELETE|UPDATE|INSERT|DROP|ALTER|GRANT|REVOKE)\b/.test(mig.replace(/--[^\n]*/g, "")), "aucune écriture de données, aucun droit touché");
  const corps = (t) => t.slice(t.indexOf("CREATE OR REPLACE FUNCTION"), t.lastIndexOf("$function$;"));
  ok(corps(inv) === corps(prod) && corps(prod).length > 1500, "l'inverse = la définition de prod relue le 21/11 (md5 6e2f60f0…)");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
