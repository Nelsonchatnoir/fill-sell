// ═══════════════════════════════════════════════════════════════════════════
// LES ÉTATS VINTED S'AFFICHENT DANS LA LANGUE DE L'APP (03/10, point E — dew)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel : dew, formulaire Vinted en anglais. L'app affichait « Condition
// (accepte : New with tags · New without tags · Very good · Good ·
// Satisfactory) », un sélecteur en anglais dans « ✋ Compléter », et 368
// fiches portaient « Very good » (relevé du dressing, gardé tel quel : il dit
// la langue du compte à langue-vendeur.ts). La règle : la VALEUR envoyée à la
// page reste la sienne, ce qui S'AFFICHE ou se LIT sur la fiche est le libellé
// de la langue de l'app, retrouvé par l'identifiant d'état.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  LIBELLES_ETATS_VINTED, idEtatVinted, libelleEtatVinted, estListeEtatsVinted,
  estChampEtatVinted, etatsVintedLisibles, nomChampEtat,
} from "../src/utils/etatsVinted.js";

let echecs = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const racine = new URL("../", import.meta.url);
const lire = (p) => readFileSync(new URL(p, racine), "utf8");

console.log("1. LA TABLE EST CELLE DU SERVEUR");
{
  const { ETATS_VINTED } = await import(pathToFileURL(new URL("supabase/functions/_shared/vinted-pays.ts", racine).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href);
  const serveur = Object.fromEntries(Object.entries(ETATS_VINTED).map(([l, e]) => [l, e.libelles]));
  ok(JSON.stringify(serveur) === JSON.stringify(LIBELLES_ETATS_VINTED),
    "src/utils/etatsVinted.js = ETATS_VINTED de vinted-pays.ts, langue par langue",
    "les deux tables ont divergé : recopier les libellés de vinted-pays.ts");
  const vus = new Map();
  let collision = null;
  for (const [l, lib] of Object.entries(LIBELLES_ETATS_VINTED)) {
    for (const [id, t] of Object.entries(lib)) {
      const k = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      if (vus.has(k) && vus.get(k) !== Number(id)) collision = `${t} (${l})`;
      vus.set(k, Number(id));
    }
  }
  ok(!collision, "aucun libellé ne désigne deux états différents d'une langue à l'autre", collision ?? "");
}

console.log("2. LE LIBELLÉ AFFICHÉ");
ok(idEtatVinted("Very good") === 2 && idEtatVinted("  very GOOD ") === 2, "« Very good » = état 2, casse et espaces ignorés");
ok(libelleEtatVinted("Very good") === "Très bon état", "« Very good » s'affiche « Très bon état »");
ok(libelleEtatVinted("New with tags") === "Neuf avec étiquette", "« New with tags » s'affiche « Neuf avec étiquette »");
ok(libelleEtatVinted("Ottime") === "Très bon état", "l'italien aussi (« Ottime »)");
ok(libelleEtatVinted("Satisfactory") === "Satisfaisant", "« Satisfactory » s'affiche « Satisfaisant »");
ok(libelleEtatVinted("Très bon état") === "Très bon état", "un libellé français reste le même");
ok(libelleEtatVinted("Very good", "en") === "Very good", "app en anglais : le libellé anglais");
ok(libelleEtatVinted("Ottime", "en") === "Very good", "app en anglais : l'italien s'affiche en anglais");
ok(libelleEtatVinted("XL") === "XL" && libelleEtatVinted("") === "", "une valeur qui n'est pas un état passe intacte");
ok(nomChampEtat("fr") === "État" && nomChampEtat("en") === "Condition", "le nom du champ dans la langue de l'app");

console.log("3. LA QUESTION « ✋ COMPLÉTER »");
ok(estChampEtatVinted("vinted", { field_key: "condition", field_label: "Condition" }), "clé condition : c'est l'état");
ok(estChampEtatVinted("vinted", { field_key: "x", allowed_values: ["New with tags", "Very good", "Good"] }), "liste faite d'états : c'est l'état");
ok(!estChampEtatVinted("vinted", { field_key: "size", allowed_values: ["S", "M", "L"] }), "une taille n'est pas l'état");
ok(!estChampEtatVinted("beebs", { field_key: "condition" }), "hors Vinted : rien ne change");
ok(!estChampEtatVinted("vinted", null), "aucun champ : rien");
ok(estListeEtatsVinted([{ title: "Very good" }, "Good"]), "options objets ({ title }) reconnues");
ok(!estListeEtatsVinted(["Very good", "Rouge"]), "une liste mêlée n'est pas une liste d'états");

console.log("4. LE MESSAGE DE L'EXTENSION");
const DEW = "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted exige des champs encore vides pour cette catégorie : Condition (accepte : New with tags · New without tags · Very good · Good · Satisfactory). Compléter ces champs dans l'app (copie Vinted), puis relancer la publication. Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».";
{
  const t = etatsVintedLisibles(DEW, "vinted", "fr");
  ok(t.includes("pour cette catégorie : État (accepte : Neuf avec étiquette · Neuf sans étiquette · Très bon état · Bon état · Satisfaisant)."),
    "le message de dew : champ et valeurs en français, espace gardée", t);
  ok(!/Very good|New with|Satisfactory|Condition/.test(t), "plus un mot anglais d'état dans le message");
  ok(t.startsWith("Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted."), "le reste du message est intact");
  const deux = "Vinted exige des champs encore vides pour cette catégorie : Size (accepte : S · M · L), Condition (accepte : Very good · Good).";
  const t2 = etatsVintedLisibles(deux, "vinted", "fr");
  ok(t2 === "Vinted exige des champs encore vides pour cette catégorie : Size (accepte : S · M · L), État (accepte : Très bon état · Bon état).",
    "deux champs : seule la liste d'états est traduite", t2);
  ok(etatsVintedLisibles(DEW, "beebs", "fr") === DEW, "hors Vinted : texte intact");
  ok(etatsVintedLisibles("Vinted a refusé l'annonce.", "vinted", "fr") === "Vinted a refusé l'annonce.", "sans « accepte : » : texte intact");
  ok(etatsVintedLisibles(null, "vinted", "fr") === "", "rien : chaîne vide");
}

console.log("5. CE QUE L'APP AFFICHE (humanizeJobError, jobErrorSansFaussePromesse)");
{
  const { humanizeJobError, jobErrorSansFaussePromesse } = await import(new URL("src/utils/shared.js", racine).href);
  const job = { platform: "vinted", action: "republish", status: "needs_user", error: DEW, platform_fields: {} };
  const h = humanizeJobError(job, "fr");
  ok(/État \(accepte : Neuf avec étiquette/.test(h) && !/Very good/.test(h), "humanizeJobError : états en français", h);
  const b = jobErrorSansFaussePromesse(job, "fr");
  ok(/État \(accepte : Neuf avec étiquette/.test(b) && !/Very good/.test(b), "jobErrorSansFaussePromesse : états en français", b);
  const lbc = { platform: "leboncoin", action: "publish", status: "needs_user", error: "Leboncoin exige : État (accepte : Very good · Good).", platform_fields: {} };
  ok(!/Très bon état/.test(humanizeJobError(lbc, "fr")), "Leboncoin : la règle ne touche que Vinted", humanizeJobError(lbc, "fr"));
}

console.log("6. LE CÂBLAGE");
const stock = lire("src/tabs/StockTab.jsx");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/\{libelleChamp\(f\)\}/.test(stock) && /\{libelleChamp\(c\)\}/.test(stock), "« ✋ Compléter » : le nom du champ passe par libelleChamp");
ok((stock.match(/libelle=\{libelleOption\((f|c)\)\}/g) ?? []).length === 2, "« ✋ Compléter » : les deux sélecteurs affichent libelleOption");
ok(/\{libelleOption\(f\)\(v\)\}/.test(stock), "« ✋ Compléter » : les boutons (2-3 réponses) aussi");
ok(/k === "etat" && job\.platform === "vinted" \? libelleEtatVinted\(brut, "fr"\) : brut/.test(stock), "la réponse entre sur la fiche en français");
ok(/libelle = libelleIdentite \}\)/.test(lps) && /<option key=\{v\} value=\{v\}>\{libelle\(v\)\}<\/option>/.test(lps), "AspectValueInput : texte affiché ≠ valeur envoyée");
ok(/if \(cle === "etat" && t\) return libelleEtatVinted\(t, "fr"\);/.test(lps), "stepper : l'état de la fiche se lit en français (valeurAttributFiche)");
ok(/return cle === "etat" \? libelleEtatVinted\(v, "fr"\) : v;/.test(lps), "stepper : idem pour attributV");

if (echecs) { console.error(`\n${echecs} échec(s)`); process.exit(1); }
console.log("\nTout est vert.");
