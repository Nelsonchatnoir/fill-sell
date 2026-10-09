// `npm run selftest:depop-acces` — DEPOP N'EXISTE QUE POUR CEUX QUI L'ONT
// (09/10/2026). Ce test EXÉCUTE ce qu'il peut (le texte d'autorisation, le
// pré-vol et la traduction des tailles du connecteur), et lit le reste (le
// manifeste, la garde de get-pending-jobs, la garde en base).
//
// Ce qu'il tient :
//   A. le texte « Autoriser Depop » est LE MÊME, à l'octet, côté serveur
//      (_shared/textes-jobs.ts) et côté extension (background.js) ;
//   B. le manifeste n'ajoute qu'un hôte OPTIONNEL (www.depop.com) par rapport
//      à la 0.6.104 livrée : aucune permission obligatoire de plus, donc ni
//      avertissement ni extension désactivée chez les utilisateurs actuels ;
//   C. le serveur ne sert un job Depop qu'au poste qui déclare « depop_acces »,
//      et l'extension ne le déclare qu'avec la permission accordée ;
//   D. la base refuse tout Depop d'un compte non autorisé (migration lue) ;
//   E. le pré-vol de content-scripts/depop.js refuse ce que Depop refuse
//      (description ≤ 1 000, 5 hashtags, photos, prix ≥ 1 €, rayon par
//      identifiant, beauté neuve seulement) et DEMANDE ce qui manque (état,
//      genre enfant, port) — jamais une valeur inventée ;
//   F. la taille passe par la règle ACTUELLE de _shared/tailles.js, recopiée
//      à l'octet dans depop-tailles.js (jamais la copie gelée d'Opla) :
//      « EU 42 » → « EUR 42 », hors grille → question, « Other » jamais seul.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const dit = (nom, c, detail) => { if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

const bg = lire("chrome-extension/background.js");

// ── A. LE TEXTE D'AUTORISATION, À L'OCTET ────────────────────────────────────
console.log("\nA. « AUTORISER DEPOP » : LE MÊME TEXTE DES DEUX CÔTÉS");
{
  const m = bg.match(/\/\/ ⟦depop-autorisation:début⟧\n([\s\S]*?)\/\/ ⟦depop-autorisation:fin⟧/);
  dit("le bloc est balisé dans background.js", !!m);
  const ext = m ? new Function(`${m[1]}\nreturn messageAutorisationDepop;`)() : () => null;
  const tj = lire("supabase/functions/_shared/textes-jobs.ts");
  const m2 = tj.match(/export function autorisationDepopRequise\(action: string\): string \{[\s\S]*?\n\}/);
  dit("la fonction serveur est trouvée", !!m2);
  const js = m2 ? ts.transpileModule(m2[0].replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText : "";
  const srv = m2 ? new Function(`${js}\nreturn autorisationDepopRequise;`)() : () => null;
  for (const a of ["publish", "republish", "delete"]) {
    dit(`${a} : identique`, ext(a) === srv(a) && typeof ext(a) === "string" && ext(a).includes("« Autoriser Depop »"), `${ext(a)} ≠ ${srv(a)}`);
  }
  dit("le geste est nommé dans les deux textes", srv("publish").includes("Autoriser Depop"));
  dit("la source du needs_user est « depop_acces »", /export const SOURCE_DEPOP_ACCES = "depop_acces";/.test(tj));
}

// ── B. LE MANIFESTE : UN HÔTE OPTIONNEL DE PLUS, RIEN D'AUTRE ────────────────
console.log("\nB. LE MANIFESTE N'AJOUTE QU'UN HÔTE OPTIONNEL (référence : 0.6.104 livrée, 0cec9e6)");
{
  const man = JSON.parse(lire("chrome-extension/manifest.json"));
  const ref = JSON.parse(execFileSync("git", ["-C", RACINE, "show", "0cec9e6:chrome-extension/manifest.json"]).toString());
  // (0.6.106) Les domaines Vinted étrangers (optionnels + web_accessible_resources,
  // qui n'est pas une permission) sont prouvés par selftest:vinted-origine : ils
  // sont mis de côté ici, où la garantie reste celle de Depop — un seul hôte
  // Depop, optionnel, et rien d'obligatoire en plus.
  const VINTED_ETRANGER = /^https:\/\/www\.vinted\.(be|lu|nl|de|at|it|es|pt|ie|fi|ee|lv|lt|sk|si|hr|gr)\/\*$/;
  const sansVintedEtranger = (o) => ({
    ...o,
    web_accessible_resources: (o.web_accessible_resources ?? []).map((w) => ({ ...w, matches: (w.matches ?? []).filter((m) => !VINTED_ETRANGER.test(m)) })),
  });
  const sans = (o) => { const c = { ...sansVintedEtranger(o) }; delete c.version; delete c.version_name; delete c.optional_host_permissions; return JSON.stringify(c); };
  dit("tout le reste est identique (permissions, hôtes obligatoires, content_scripts, ressources…)", sans(man) === sans(ref));
  dit("permissions inchangées", JSON.stringify(man.permissions) === JSON.stringify(ref.permissions));
  dit("hôtes obligatoires inchangés", JSON.stringify(man.host_permissions) === JSON.stringify(ref.host_permissions));
  const ajout = (man.optional_host_permissions ?? []).filter((h) => !(ref.optional_host_permissions ?? []).includes(h) && !VINTED_ETRANGER.test(h));
  const retrait = (ref.optional_host_permissions ?? []).filter((h) => !(man.optional_host_permissions ?? []).includes(h));
  dit("un seul ajout, optionnel : https://www.depop.com/*", JSON.stringify(ajout) === JSON.stringify(["https://www.depop.com/*"]), JSON.stringify(ajout));
  dit("aucun hôte optionnel retiré", retrait.length === 0, JSON.stringify(retrait));
  const partout = JSON.stringify({ h: man.host_permissions, c: man.content_scripts, w: man.web_accessible_resources });
  dit("depop.com n'est obligatoire nulle part", !/depop/i.test(partout));
  dit("aucun fichier Depop déclaré dans le manifeste (enregistré à la demande)", !/depop/i.test(JSON.stringify(man.content_scripts ?? [])));
  const livrables = lire("scripts/hotes-livrables-cws.mjs");
  dit("le contrôle du paquet CWS connaît l'hôte optionnel", livrables.includes("'https://www.depop.com/*'"));
}

// ── C. LE SERVEUR NE SERT DEPOP QU'AU POSTE QUI L'A ──────────────────────────
console.log("\nC. UN JOB DEPOP NE VA QU'AU POSTE QUI DÉCLARE « depop_acces »");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  dit("get-pending-jobs lit la capacité", gpj.includes(`const posteAvecDepop = capacites.includes("depop_acces");`));
  dit("et écarte tout job Depop sans elle", /if \(!posteAvecDepop\) \{\s*const avantD = out\.length;\s*out = out\.filter\(\(j\) => j\.platform !== "depop"\);/.test(gpj));
  dit("l'extension ne la déclare qu'avec la permission", bg.includes(`caps.push((await depopAccesAccorde()) ? "depop_acces" : "sans_depop");`));
  dit("la permission est lue sur l'origine exacte", /async function depopAccesAccorde\(\) \{\s*try \{ return await chrome\.permissions\.contains\(\{ origins: \[DEPOP_ORIGINE\] \}\); \}/.test(bg));
  dit("les scripts Depop ne sont enregistrés que pour www.depop.com", bg.includes(`const DEPOP_ORIGINE = "https://www.depop.com/*";`)
    && /id: DEPOP_SCRIPTS_ID, matches: \[DEPOP_ORIGINE\]/.test(bg));
  dit("aucun passage automatique ne relève Depop sans la permission",
    bg.includes(`if (platform === "depop" && !runId && !(await depopAccesAccorde())) return { ok: false, reason: "depop_acces" };`)
    && bg.includes(`if (platform === "depop" && !(await depopAccesAccorde())) continue;`));
  dit("ni ne lit ses ventes sans elle", /async function lancerReleveVentes[\s\S]{0,300}if \(platform === "depop" && !\(await depopAccesAccorde\(\)\)\) return \{ ok: false, reason: "depop_acces" \};/.test(bg));
  dit("la sonde Depop n'entre que chez un poste qui a la permission",
    bg.includes(`if (!arguments[1]?.plateformes && (await depopAccesAccorde())) plateformes = [...plateformes, "depop"];`));
}

// ── D. LA BASE REFUSE DEPOP À UN COMPTE NON AUTORISÉ ─────────────────────────
console.log("\nD. LA GARDE EN BASE (migration 20261009020000, appliquée le 09/10)");
{
  const mig = lire("supabase/migrations/20261009020000_depop_plateforme_base.sql");
  dit("depop_autorise : drapeau OU bêta, et un client ne s'informe que de SON compte",
    /CREATE OR REPLACE FUNCTION public\.depop_autorise\(p_user uuid\)/.test(mig) && /auth\.uid\(\) IS NOT NULL AND auth\.uid\(\) <> p_user/i.test(mig));
  dit("l'exception est nommée", mig.includes("depop_non_ouvert"));
  for (const t of ["garde_depop_acces_jobs", "garde_depop_acces_annonces", "garde_depop_acces_releves", "garde_depop_acces_creneaux", "garde_depop_acces_catalogue"]) {
    dit(`déclencheur ${t}`, new RegExp(`CREATE TRIGGER ${t}\\b`).test(mig));
  }
  dit("le drapeau d'ouverture reste à 0 (aucune ouverture dans ce chantier)", !/depop_ouvert'?\s*,\s*1\b|value\s*=\s*1[^0-9][\s\S]{0,40}depop_ouvert/i.test(mig));
}

// ── E. LE PRÉ-VOL DU CONNECTEUR, EXÉCUTÉ ──────────────────────────────────────
console.log("\nE. LE PRÉ-VOL DE depop.js (exécuté dans un bac à sable)");
const ctx = vm.createContext({ console, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
ctx.globalThis = ctx;
vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}
;globalThis.__t = { depopPrevol, depopResoudreTaille, depopCompterHashtags, DEPOP_ETAT_PAR_LIBELLE };`, ctx, { filename: "depop.js" });
const T = ctx.__t;
{
  const base = () => ({
    description: "Blouse en lin, portée deux fois. #lin #ete", photos: ["https://exemple.test/1.jpg"], price: 999,
    platform_fields: { depopCategoryPath: ["womenswear", "tops", "blouses"], depopEtat: "used_excellent", depopPort: 5 },
  });
  const avec = (f) => { const j = base(); f(j); return T.depopPrevol(j); };
  dit("un job complet passe", T.depopPrevol(base()).ok === true);
  dit("1 000 caractères passent", avec((j) => { j.description = "a".repeat(1000); }).ok === true);
  dit("1 001 caractères : refus", avec((j) => { j.description = "a".repeat(1001); }).motif === "description_trop_longue");
  dit("5 hashtags passent", avec((j) => { j.description = "x #a #b #c #d #e"; }).ok === true);
  dit("6 hashtags : refus", avec((j) => { j.description = "x #a #b #c #d #e #f"; }).motif === "hashtags");
  dit("sans description : refus", avec((j) => { j.description = "  "; }).motif === "description_vide");
  dit("sans photo : refus", avec((j) => { j.photos = []; }).motif === "sans_photo");
  const r9 = avec((j) => { j.photos = Array.from({ length: 10 }, (_, i) => `https://exemple.test/${i}.jpg`); });
  dit("10 photos : les 8 premières partent, 2 écartées et dites", r9.ok && r9.photos.length === 8 && r9.photosEcartees === 2);
  dit("prix 0,99 € : refus", avec((j) => { j.price = 0.99; }).motif === "prix");
  dit("prix 1 € : passe", avec((j) => { j.price = 1; }).ok === true);
  dit("rayon par LIBELLÉ (pas un identifiant) : refus", avec((j) => { j.platform_fields.depopCategoryPath = ["Femme", "Hauts", "Chemisiers"]; }).motif === "categorie");
  dit("rayon à deux niveaux : refus", avec((j) => { j.platform_fields.depopCategoryPath = ["womenswear", "tops"]; }).motif === "categorie");
  const sansEtat = avec((j) => { delete j.platform_fields.depopEtat; });
  dit("sans état : une QUESTION (choix fermés en français)", sansEtat.motif === "etat" && sansEtat.question?.allowed_values?.includes("Très bon état"));
  dit("un état en français se traduit (« Bon état » → used_good)", avec((j) => { j.platform_fields.depopEtat = "Bon état"; }).etat === "used_good");
  const beaute = avec((j) => { j.platform_fields.depopCategoryPath = ["everything-else", "beauty", "makeup"]; });
  dit("beauté d'occasion : refus DÉFINITIF (Depop : « Nouveau » seulement)", beaute.motif === "beaute_neuf_seulement" && beaute.definitif === true);
  dit("beauté neuve : passe", avec((j) => { j.platform_fields.depopCategoryPath = ["everything-else", "beauty", "makeup"]; j.platform_fields.depopEtat = "brand_new"; }).ok === true);
  const enfant = avec((j) => { j.platform_fields.depopCategoryPath = ["kidswear", "dresses", "casual-dresses"]; });
  dit("enfant sans genre : une QUESTION", enfant.motif === "genre_enfant" && enfant.question?.allowed_values?.join() === "Fille,Garçon,Mixte");
  dit("enfant « Fille » : passe, genre female", avec((j) => { j.platform_fields.depopCategoryPath = ["kidswear", "dresses", "casual-dresses"]; j.platform_fields.depopGenre = "Fille"; }).genre === "female");
  dit("femme : genre posé par le rayon, jamais demandé", T.depopPrevol(base()).genre === "female");
  const sansPort = avec((j) => { delete j.platform_fields.depopPort; });
  dit("sans frais de port : une QUESTION (montant libre)", sansPort.motif === "port" && sansPort.question?.input_type === "number");
  dit("port 0 € : passe (envoi offert)", avec((j) => { j.platform_fields.depopPort = 0; }).port === 0);
  dit("port 100 € : refus (strictement moins de 100)", avec((j) => { j.platform_fields.depopPort = 100; }).motif === "port");
  dit("port « 4,90 » : lu 4.9", avec((j) => { j.platform_fields.depopPort = "4,90"; }).port === 4.9);
}

// ── F. LA TAILLE : LA RÈGLE ACTUELLE, À L'OCTET ──────────────────────────────
console.log("\nF. LA TAILLE DEPOP PASSE PAR LA RÈGLE ACTUELLE (jamais la copie gelée d'Opla)");
{
  const regle = lire("supabase/functions/_shared/tailles.js").replace(/^export function /gm, "function ").replace(/^export const /gm, "const ");
  dit("depop-tailles.js contient _shared/tailles.js à l'octet près", lire("chrome-extension/content-scripts/depop-tailles.js").includes(regle));
  const l = /const DEPOP_SCRIPTS = \[([^\]]+)\]/.exec(bg)?.[1] ?? "";
  dit("injecté AVANT depop.js", l.indexOf("depop-tailles.js") > -1 && l.indexOf("depop-tailles.js") < l.indexOf("content-scripts/depop.js"));
  dit("et jamais la copie gelée d'Opla dans le monde Depop", !l.includes("tailles-vocabulaire.js"));

  const brut = JSON.parse(lire("docs/plateformes/depop/brut/attributes-categories-size-mapping.json"));
  const grilles = { feuilles: new Map(), grilles: new Map(brut.size_sets.map((s) => [s.id, s])) };
  for (const e of brut.category_size_mapping) grilles.feuilles.set(`${e.department}/${e.group}/${e.product_type}`, e);
  const taille = (chemin, t) => T.depopResoudreTaille({ depopTaille: t }, chemin.split("/"), "IT", grilles);
  const lib = (chemin, t) => taille(chemin, t)?.libelle ?? (taille(chemin, t)?.question ? "QUESTION" : JSON.stringify(taille(chemin, t)));
  const H = "menswear/footwear/sandals", E = "kidswear/dresses/casual-dresses", F = "womenswear/tops/blouses";
  const cas = [
    [H, "EU 42", "EUR 42"], [H, "EUR 42", "EUR 42"], [H, "42", "EUR 42"], [H, "42,5", "EUR 42.5"], [H, "44.5", "EUR 44.5"],
    [H, "UK 8", "QUESTION"], [H, "Taille unique", "One size"], [H, "Autre", "QUESTION"], [H, "", "QUESTION"],
    [E, "12 ans", "12 years"], [E, "3 mois", "QUESTION"],
    [F, "M", "M"], [F, "38", "38"], [F, "FR 38", "38"], [F, "XXL", "XXL"], [F, "2XL", "XXL"],
  ];
  for (const [c, t, attendu] of cas) dit(`${c.split("/").pop()} « ${t} » → ${attendu}`, lib(c, t) === attendu, lib(c, t));
  const r = taille(H, "EU 42");
  dit("l'identifiant rendu est celui de la grille 79 (EUR 42)", r.idGrille === 79 && grilles.grilles.get(79).sizes.find((s) => s.id === r.idTaille)?.name_i18n?.en === "EUR 42");
  dit("la question liste les tailles EXACTES de la grille", taille(H, "UK 8").question?.allowed_values?.includes("EUR 42.5") === true);
  dit("une feuille sans grille ne demande rien", taille("menswear/accessories/other-accessories", "M")?.sansGrille === true);
}

if (ko) { console.error(`\n[selftest:depop-acces] ÉCHEC — ${ko} contrôle(s).`); process.exit(1); }
assert.ok(true);
console.log("\n[selftest:depop-acces] OK — Depop n'existe que pour un poste et un compte autorisés ; le connecteur refuse et demande comme Depop.");
