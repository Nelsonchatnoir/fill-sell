// ═══════════════════════════════════════════════════════════════════════════
// LOT DU 23/10 — preuve des points (rapport docs/enquetes/lot-2210-soir/RAPPORT.md § « 23/10 »)
// ═══════════════════════════════════════════════════════════════════════════
//   1. Import eBay : TOUTES les photos d'une annonce, dans l'ordre, en pleine taille ; une fiche importée ne part
//      jamais avant que toutes ses photos d'origine soient lues (« en cours de lecture », jamais une erreur) ; une
//      publication retenue ne démarre pas, même déjà servie à une extension qui la tient en mémoire ; une
//      republication de réparation ne compte dans aucun quota.
// (Les règles pures — lectureOrigineEnAttente, contenuAImposer, photosDeLaFicheALaRecreation, ebay-photos — sont
//  aussi éprouvées par contenu-du-vendeur ; ici : les chemins et les branchements, plus la ligne de l'app.)
import fs from "node:fs";
import { versLigneOrigine } from "../src/publication/lectureOrigine.js";
import { lectureOrigineEnAttente, messageLectureOrigine } from "../supabase/functions/_shared/contenu-fiche.js";
import { photosEbayPleineTaille } from "../supabase/functions/_shared/ebay-photos.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("1a. L'APP LIT LA MÊME CHOSE QUE LE SERVEUR (détail eBay, nombre de photos de l'origine)");
{
  const l = versLigneOrigine({ platform: "ebay", capture_le: null, disparu_le: null, donnees_index_le: "2026-10-23T09:55:00Z",
    photos_capture: null, photos_index: ["a", "b"] });
  ok(l.detail_le === "2026-10-23T09:55:00Z" && l.photos_origine === 2, "eBay : le détail lu par l'API vaut lecture, 2 photos à l'origine", JSON.stringify(l));
  const b = versLigneOrigine({ platform: "beebs", capture_le: "x", donnees_index_le: "y", photos_capture: [1, 2, 3, 4], photos_index: [1] });
  ok(b.detail_le === null && b.photos_origine === 4, "Beebs : seule la page capturée compte (l'index Beebs n'est pas une lecture de photos)", JSON.stringify(b));
  ok(versLigneOrigine({ platform: "leboncoin" }).photos_origine === null, "rien de lu : nombre inconnu (jamais 0 inventé)");
  const fiche = { id: 1792745533806, origine: "releve_ebay", description: "", photos: ["https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg"], attributs: {} };
  const app = lectureOrigineEnAttente(fiche, [versLigneOrigine({ platform: "ebay", donnees_index_le: null })], { maintenant: Date.parse("2026-10-23T10:00:00Z") });
  ok(app?.plateforme === "ebay", "le stepper et le lot attendent la lecture d'une fiche eBay jamais lue", JSON.stringify(app));
  ok(/Rien à faire/.test(messageLectureOrigine(app)), "… avec la phrase « en cours de lecture », rien à faire");
  const src = lire("src/publication/lectureOrigine.js");
  ok(/donnees_index_le, photos_capture:capture->photos, photos_index:donnees_index->photos/.test(src) && /\.map\(versLigneOrigine\)/.test(src),
    "attenteLectureOrigine lit le détail eBay et les photos de l'origine (sans quoi l'app attendrait sans fin)");
}

console.log("1b. LES LECTURES DU DÉTAIL eBAY : PLEINE TAILLE, ET D'ABORD CE QUE LA PERSONNE ATTEND");
{
  const p = photosEbayPleineTaille(["https://i.ebayimg.com/00/s/NTEyWDUwOQ==/z/Jk8AAeSwJDpq2a78/$_1.JPG?set_id=8800005007",
    "https://i.ebayimg.com/00/s/NTcwWDYyOA==/z/UMYAAeSwEmpq2a8D/$_1.JPG?set_id=8800005007"]);
  ok(p[0] === "https://i.ebayimg.com/images/g/Jk8AAeSwJDpq2a78/s-l1600.jpg" && p[1].includes("UMYAAeSwEmpq2a8D/s-l1600"), "avers puis revers, en pleine taille", JSON.stringify(p));
  const api = lire("supabase/functions/ebay-releve-api/index.ts");
  ok(/attente_lecture_origine/.test(api) && /Number\(retenue\(b\)\) - Number\(retenue\(a\)\)/.test(api), "ebay-releve-api lit d'abord les fiches dont une publication attend");
  ok(/DETAILS_PAR_RUN_LECTURE_ORIGINE = 150/.test(api) && /serveur:lecture_origine/.test(api) && /retenuesNonLues > 0 && details > 0/.test(api),
    "une demande de lecture d'origine lit plus large, et la suite est redemandée tant qu'il en reste (seulement si le passage a avancé)");
  const hw = lire("supabase/functions/handler-watch/index.ts");
  ok(/const PHOTOS_FICHES_MAX = 48;/.test(hw) && /attendues\.has\(Number\(x\)\)/.test(hw), "le rapatriement sert d'abord les fiches dont une tâche attend (48 photos par passage)");
}

console.log("1c. LA RETENUE AU DÉPART, ET AU DÉMARRAGE (base)");
{
  const m1 = lire("supabase/migrations/20261023100000_photos_origine_toutes.sql");
  ok(/photo_est_vignette_de_fiche/.test(m1) && /rehosted\/' \|\| p_inventaire::text/.test(m1) && /COALESCE\(i\.photos -> 0 ->> 'url', i\.photos ->> 0\)/.test(m1),
    "la complétion reconnaît la vignette recopiée chez nous et la photo au format {url}");
  ok(/photos_origine_completees/.test(m1) && /'detail_le'/.test(m1) && /'photos_origine'/.test(m1), "tracée au journal ; le fournisseur de contenu dit la lecture du détail eBay et les photos de l'origine");
  ok(/releve_\(leboncoin\|beebs\|depop\|ebay\)/.test(m1), "une fiche eBay demande sa lecture (relevé de veille eBay)");
  const m2 = lire("supabase/migrations/20261023110000_retenue_lecture_origine_au_demarrage.sql");
  ok(/attente_lecture_origine'\s*\n\s*AND p_statut IN \('processing', 'failed', 'needs_user', 'pending'\)/.test(m2) && !/p_statut IN \([^)]*'published'/.test(m2),
    "une publication retenue ne démarre pas, n'est jamais écrite en échec ; un résultat réel (published) passe toujours");
  const m3 = lire("supabase/migrations/20261023120000_republications_hors_quota.sql");
  ok((m3.match(/\?\| ARRAY\['opla_sortie', 'hors_quota'\]\)/g) ?? []).length === 4, "« hors quota » : exclu des quatre comptes (plafond, quota gratuit, affichage, places)");
  for (const f of ["20261023100000_photos_origine_toutes_INVERSE.sql", "20261023110000_retenue_lecture_origine_au_demarrage_INVERSE.sql", "20261023120000_republications_hors_quota_INVERSE.sql"]) {
    ok(fs.existsSync(new URL(`../supabase/rollbacks/${f}`, import.meta.url)), `inverse prêt : ${f}`);
  }
}

console.log("3. LES ANNONCES MORTES NE REPARTENT PLUS EN REPUBLICATION AUTOMATIQUE (base)");
{
  const m = lire("supabase/migrations/20261023140000_republication_annonce_introuvable.sql");
  ok(/THEN 'annonce_introuvable'/.test(m) && /x\.platform_fields ->> 'sale_signal' = 'unavailable'/.test(m) && /x\.platform_fields \? 'annonce_disparue'/.test(m)
     && /a\.vu_le > COALESCE\(/.test(m), "une absence établie sur l'identifiant exact écarte l'annonce ; un relevé qui la revoit lève la garde");
  ok(!/WHEN v_probant AND sn\.premier IS NOT NULL[\s\S]{0,200}annonce_introuvable/.test(m), "la branche Vinted est inchangée");
  ok(fs.existsSync(new URL("../supabase/rollbacks/20261023140000_republication_annonce_introuvable_INVERSE.sql", import.meta.url)), "inverse prêt");
  const rp = lire("src/components/RepublicationPlanifiee.jsx");
  ok(/annonce_introuvable: fr \?/.test(rp), "l'app dit pourquoi elle est sautée (jamais un code brut)");
}

console.log("4a. LES QUESTIONS ATTENDENT LE REPOS DU MOTEUR (écran et journal)");
{
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  const iDecl = lps.indexOf("const [questionsAuRepos, setQuestionsAuRepos] = useState(false);");
  const iTele = lps.indexOf("const moteurRetenu = !questionsAuRepos || resolutionFaitePour !== platformListings || catalogueLuPour !== genericCategoryKeysSig;");
  const iRepos = lps.indexOf("const preparationAuRepos = (() => {");
  ok(iDecl > 0 && iTele > iDecl && iRepos > iTele, "l'état est déclaré AVANT la télémétrie qui le lit (aucune ombre TDZ), le repos calculé après");
  ok((lps.match(/moteurRetenu\) && !champBloquantVus\.current\[k\]\) continue;|moteurRetenu && !champBloquantVus\.current\[k\]\) continue;/g) ?? []).length >= 4,
    "aucun « affiche » NOUVEAU au journal avant le repos : champs de catégorie, eBay, champs partagés, rayon");
  ok(/setTimeout\(\(\) => setQuestionsAuRepos\(true\), preparationAuRepos \? Math\.min\(REPOS_AVANT_LECTURE_MS, filetDans\) : filetDans\)/.test(lps)
     && /import \{ REPOS_AVANT_LECTURE_MS \} from "\.\.\/publication\/lot\/regles";/.test(lps) && /const FILET_QUESTIONS_MS = 45_000;/.test(lps),
    "1,2 s de repos (le délai du lot, une seule règle), filet de 45 s ; une fois montrées, elles restent");
  ok(/\n\s+questionsAuRepos,\r?\n/.test(lps), "« Confirmer » reçoit l'état");
  const ec = lire("src/publication/EcranConfirmer.jsx");
  ok(/const enPreparation = m\.questionsAuRepos === false;/.test(ec) && /\{verdict && !enPreparation && \(/.test(ec) && /enPreparation\s*\n?\s*\? <Carte gravite="flat">/.test(ec),
    "« Confirmer » : ni question, ni verdict avant le repos — « On complète les derniers champs… »");
}

console.log("4b. « CASQUE » : LA MARQUE, LA TAILLE ET LE CONTEXTE AVANT LE MOT");
{
  const { detectObjectKeywordDetail, familleDuCasque } = await import("../src/utils/shared.js");
  const ic = (t, d = "") => detectObjectKeywordDetail(t, d)?.icon ?? null;
  ok(ic("Casque enfant Oxelo Decathlon - Taille 55-58 cm", " Oxelo") === "⛑️", "louis-seller : « Casque enfant Oxelo Decathlon - Taille 55-58 cm » → ⛑️ (sport), plus 🎧");
  ok(ic("Casque de ski Quechua bleu – Taille S") === "⛑️" && ic("Casque de vélo") === "⛑️" && ic("Casque chantier enfant") === "⛑️", "ski, vélo, chantier → ⛑️");
  ok(ic("Casque de moto homme taille L") === "🪖" && ic("Casque Exo 520 Air Shade noir mat taille M", " Scorpion") === "🪖", "moto (mot ou marque) → 🪖");
  ok(ic("Casque audio Jabra") === "🎧" && ic("Bose QuietComfort Ultra - Casque réduction de bruit") === "🎧" && ic("Casque gaming sans fil blanc et bleu") === "🎧", "⛔ les casques audio restent 🎧");
  ok(ic("Casque Bluetooth sans fil noir avec housse de protection") === "🎧", "⛔ signaux contradictoires (Bluetooth + « protection ») : la règle d'avant, jamais une devinette");
  ok(ic("Casque Oxbow") === "🎧" && familleDuCasque("Casque", "") === null, "aucun signal : la règle d'avant");
  ok(ic("Casque vélo") === "⛑️" && ic("Casque moto intégral") === "🪖", "les règles qualifiées d'avant inchangées");
  ok(ic("Écouteurs sans fil Sony") === "🎧" && ic("Robe d'été fleurie") !== "⛑️", "rien d'autre ne bouge");
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ lot du 23/10 : photos d'origine (eBay) toutes, dans l'ordre, en pleine taille ; retenue au départ et au démarrage ; hors quota");
