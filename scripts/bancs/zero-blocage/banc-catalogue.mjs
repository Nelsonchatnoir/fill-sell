// ═══════════════════════════════════════════════════════════════════════════
// BANC « ZÉRO BLOCAGE » SUR TOUT LE CATALOGUE (24/10, lot de Nico, C1) — LECTURE SEULE
// ═══════════════════════════════════════════════════════════════════════════
//   node scripts/bancs/zero-blocage/banc-catalogue.mjs
// Pour chaque plateforme × rayon × champ OBLIGATOIRE connu (platform_category_aspects pour Vinted, Leboncoin,
// Beebs ; ebay_item_aspects pour eBay ; Depop : les champs exigés par son pré-vol), d'où vient la valeur
// à partir d'une fiche type (titre, description, marque, état, couleur, taille, matière, genre, âge, format
// du colis), avec les RÈGLES du code (écran Publier, serveur, extension) :
//   · auto      : posé sans rien demander — toujours présent (titre, photos, prix…), pré-rempli par la
//                 plateforme ou l'extension, liste à UNE valeur (B1), lu sur la fiche et traduit, filet
//                 qui ne bloque jamais (couleur → palette, marque → « Sans marque », MPN → « Ne s'applique
//                 pas », Département ← genre) ;
//   · deduit    : lu dans le texte ou choisi par l'IA dans la liste exacte (peut encore échouer : mesuré à part,
//                 champ_requis_bloquant « affiche ») ;
//   · refus     : la plateforme refuse l'article tel qu'il est (rayon « neuf seulement » pour un article
//                 d'occasion) — écarté avant la file (B7), jamais une question ;
//   · choix     : un VRAI choix que seule la personne peut faire (raison écrite) ;
//   · question  : aucune source — la question part encore (un trou à boucher).
// Pays : la palette de chaque champ à liste se lit par identifiant (états Vinted en 15 langues, couleurs des
// pages IT/ES/DE/NL/PT) — le catalogue partagé est français (garde de langue, migration 20261024220000).
// Résultat : docs/enquetes/zero-blocage-2410/banc-catalogue.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const imp = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
const { estListeEtatsVinted, idEtatVinted, LIBELLES_ETATS_VINTED } = await imp("src/utils/etatsVinted.js");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "fillsell-banc-catalogue-"));
let nReq = 0;
function sql(requete) {
  const f = path.join(TMP, `r${++nReq}.sql`);
  fs.writeFileSync(f, requete);
  for (let essai = 1; ; essai++) {
    try {
      const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", "-f", `"${f}"`],
        { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
    } catch (e) { if (essai >= 3) throw e; }
  }
}

const generiques = sql(`select platform, category_key, field_key, field_label, input_type, allowed_values
  from public.platform_category_aspects where required and platform in ('vinted', 'leboncoin', 'beebs')`);
const ebay = sql(`select category_id, aspects from public.ebay_item_aspects where status = 'ok'`);

const liste = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? String(x.title ?? x.code ?? "") : String(x))).filter(Boolean) : []);
const ETATS_OCCASION_FR = ["Très bon état", "Bon état", "Satisfaisant"];

// ── Les règles, par plateforme et par champ (miroir de genericKnownSource, GENERIC_PREFILLED, filets serveur) ──
function verdictVinted(r) {
  const k = r.field_key; const vals = liste(r.allowed_values);
  if (["title", "photos", "description", "price"].includes(k)) return ["auto", "toujours présent sur le job"];
  if (["sim_lock", "package_size_id", "package_size"].includes(k)) return ["auto", "pré-rempli (défaut de l'extension / Vinted)"];
  if (k === "condition") {
    const fr = estListeEtatsVinted(vals) ? vals.map((v) => LIBELLES_ETATS_VINTED.fr[idEtatVinted(v)] ?? v) : vals;
    if (fr.length && !fr.some((v) => ETATS_OCCASION_FR.includes(v))) return ["refus", "rayon « neuf seulement » : un article d'occasion n'y entre pas (écarté avant la file)"];
    return ["auto", "état de la fiche, traduit par identifiant (toutes langues)"];
  }
  if (vals.length === 1) return ["auto", "liste à une seule valeur"];
  if (k === "color") return ["auto", "couleur de la fiche → palette (pages étrangères comprises), sinon « Multicolore » (jamais une question)"];
  if (k === "brand") return ["auto", "marque de la fiche ; introuvable → même marque autrement écrite, sinon « Sans marque »"];
  if (k === "size") return ["auto", "taille de la fiche traduite dans la grille (tailles, enfants, W/L)"];
  if (k === "isbn") return ["choix", "ISBN illisible sur l'annonce et les photos : seul le livre le dit (« Ce livre n'a pas d'ISBN » proposé)"];
  if (k === "internal_memory_capacity") return ["deduit", "capture de l'annonce (republication) ou stockage lu dans le titre"];
  if (k === "model") return ["deduit", "modèle lu dans le titre ou par Lens, parmi la liste de Vinted"];
  if (k === "video_game_platform") return ["deduit", "console lue dans le titre (jeuxVideo.familleJeuVideo)"];
  if (k === "video_game_ratings") return ["deduit", "PEGI lu dans le texte, sinon question (« Non précisé » existe : à décider)"];
  if (k === "computer_ram" || k === "computer_storage_capacity") return ["choix", "caractéristique technique que seul l'objet dit (si le titre ne la porte pas)"];
  if (k === "skirt_length") return ["deduit", "longueur lue dans le titre / la description"];
  return ["question", "aucune source"];
}
function verdictLeboncoin(r) {
  const k = r.field_key; const vals = liste(r.allowed_values);
  if (["quantity", "estimated_parcel_weight"].includes(k)) return ["auto", "pré-rempli (Leboncoin / extension)"];
  if (k === "condition" || /_condition$/.test(k)) return ["auto", "état de la fiche (grille Leboncoin)"];
  if (vals.length === 1) return ["auto", "liste à une seule valeur"];
  if (/_brand$/.test(k)) return ["auto", "marque de la fiche"];
  if (/_size$/.test(k) || k === "clothing_st" || k === "baby_age") return ["auto", "taille de la fiche traduite"];
  if (/_material$/.test(k)) return ["auto", "matière de la fiche"];
  if (k === "clothing_type" || k === "shoe_type" || /_univers$|_universe$/.test(k)) return ["deduit", "Univers ← genre de la fiche, sinon IA dans la liste (lbc_champs_ia)"];
  if (/_weight$/.test(k)) return ["choix", "poids que seul l'objet dit (si la fiche ne le porte pas)"];
  if (/_type$|_product$|_category$|_format$|_genre$/.test(k)) return ["deduit", "lu dans le texte, sinon IA dans la liste exacte (lbc_champs_ia, leviers)"];
  return ["question", "aucune source"];
}
function verdictBeebs(r) {
  const k = String(r.field_key).replace(/\s*\[.*\]$/, ""); const vals = liste(r.allowed_values);
  if (k === "Format du colis") return ["auto", "posé par l'extension (palier de poids)"];
  if (k === "État") return ["auto", "état de la fiche (grille Beebs)"];
  if (vals.length === 1) return ["auto", "liste à une seule valeur"];
  if (k === "Marque") return ["auto", "marque de la fiche"];
  if (k === "Taille" || k === "Pointure") return ["auto", "taille de la fiche traduite (grille Beebs)"];
  if (k === "Âge") return ["deduit", "âge de la fiche, du texte, ou des photos (levier IA)"];
  if (k === "Matière") return ["auto", "matière de la fiche"];
  if (k === "Couleur") return ["auto", "couleur de la fiche"];
  if (["Fermeture", "Alimentation", "Console"].includes(k)) return ["deduit", "lu dans le texte, sinon IA dans la liste"];
  return ["question", "aucune source"];
}
const DIMENSIONS = new Set(["longueur", "largeur", "hauteur", "profondeur", "épaisseur", "diamètre"]);
function verdictEbay(a) {
  const n = String(a.name ?? ""); const vals = Array.isArray(a.allowedValues) ? a.allowedValues : [];
  const ferme = String(a.mode ?? "") === "SELECTION_ONLY";
  if (["Marque", "Taille", "Couleur", "Matière", "Modèle", "Capacité de stockage"].includes(n)) return ["auto", "champ de la fiche (marque absente → « Sans marque/Générique »)"];
  if (n === "Département") return ["auto", "Département ← genre, dans la liste de la catégorie qui part"];
  if (n === "Numéro de pièce fabricant") return ["auto", "« Ne s'applique pas » (valeur standard d'eBay)"];
  if (ferme && vals.length === 1) return ["auto", "liste fermée à une seule valeur"];
  if (DIMENSIONS.has(n.normalize("NFC").trim().toLowerCase())) return ["choix", "mesure de l'objet : jamais inventée (lue dans le texte si elle y est)"];
  if (n === "ISBN") return ["choix", "ISBN illisible : seul le livre le dit"];
  if (n === "EAN") return ["choix", "code-barres : seul l'emballage le dit (eBay refuse « Ne s'applique pas »)"];
  return ["deduit", "IA dans la liste eBay de la catégorie (ebay_aspects_ia), sinon question"];
}
const DEPOP = [
  { field_key: "description", v: ["auto", "texte de l'annonce, du dépôt ou de la fiche"] },
  { field_key: "rayon", v: ["auto", "rayon du dépôt, ou de la capture s'il désigne une seule feuille, sinon moteur Depop"] },
  { field_key: "etat", v: ["auto", "état de la fiche → code Depop (jamais embelli)"] },
  { field_key: "port", v: ["auto", "port du dépôt, sinon prix par défaut du compte ; sinon question (le vendeur fixe son prix d'envoi)"] },
];

const lignes = [];
for (const r of generiques) {
  const f = r.platform === "vinted" ? verdictVinted : r.platform === "leboncoin" ? verdictLeboncoin : verdictBeebs;
  const [verdict, raison] = f(r);
  lignes.push({ platform: r.platform, rayon: r.category_key, champ: r.field_key, verdict, raison });
}
for (const c of ebay) {
  for (const a of (Array.isArray(c.aspects) ? c.aspects : [])) {
    if (!a?.required) continue;
    const [verdict, raison] = verdictEbay(a);
    lignes.push({ platform: "ebay", rayon: String(c.category_id), champ: a.name, verdict, raison });
  }
}
for (const d of DEPOP) lignes.push({ platform: "depop", rayon: "(toutes feuilles)", champ: d.field_key, verdict: d.v[0], raison: d.v[1] });

const parPf = {};
for (const l of lignes) { parPf[l.platform] ??= { auto: 0, deduit: 0, refus: 0, choix: 0, question: 0, total: 0 }; parPf[l.platform][l.verdict]++; parPf[l.platform].total++; }
const groupe = (filtre) => {
  const m = new Map();
  for (const l of lignes.filter(filtre)) { const k = `${l.platform} · ${l.champ}`; const g = m.get(k) ?? { n: 0, raison: l.raison }; g.n++; m.set(k, g); }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1].n - a[1].n));
};
const resultat = {
  banc: "zéro blocage — tout le catalogue", fait_le: new Date().toISOString(),
  couples_rayon_champ: lignes.length, par_plateforme: parPf,
  questions_restantes: groupe((l) => l.verdict === "question"),
  vrais_choix: groupe((l) => l.verdict === "choix"),
  refus_plateforme: groupe((l) => l.verdict === "refus"),
  deduits: groupe((l) => l.verdict === "deduit"),
};
const dir = path.join(RACINE, "docs", "enquetes", "zero-blocage-2410");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "banc-catalogue.json"), `${JSON.stringify(resultat, null, 1)}\n`);
console.log(`couples rayon × champ obligatoire : ${lignes.length}`);
console.table(parPf);
console.log("QUESTIONS RESTANTES (aucune source) :"); console.table(resultat.questions_restantes);
console.log("VRAIS CHOIX DE LA PERSONNE :"); console.table(resultat.vrais_choix);
console.log("REFUS DE LA PLATEFORME (écartés avant la file) :"); console.table(resultat.refus_plateforme);
console.log("DÉDUITS (texte / IA, mesurés à part) :"); console.table(resultat.deduits);
