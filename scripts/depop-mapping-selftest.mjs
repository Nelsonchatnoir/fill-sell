// ═══════════════════════════════════════════════════════════════════════════
// AUTOTEST DU RATTACHEMENT DEPOP (2026-10-08) — préparation INERTE
//   npm run selftest:depop-mapping
//
// Sans réseau ni base. Ce qu'il prouve :
//   A. AUCUNE FEUILLE NE DISPARAÎT : les 160 types de produit relevés ont
//      chacun une ligne dans DEPOP_TYPE_VERS_INTERNE (ni manquant, ni en
//      trop) ; les 322 feuilles proposées par le formulaire ont TOUTES une
//      destination interne ; seules les feuilles inactives sont « non
//      rattachées », avec leur raison ; une icône absente a un pourquoi.
//   B. AUCUN IDENTIFIANT ORPHELIN : chaque clé Depop citée (feuille, état,
//      couleur, matière, taille, marque) existe dans le relevé ; chaque icône,
//      type et famille cités existent dans la taxonomie interne
//      (ALL_OBJECT_ICONS, detectType, FAMILLES, PALIERS_ETAT, VINTED_COLORS,
//      CHILD_*_SIZES).
//   C. LE SENS ALLER EST SÛR : chaque icône vise une feuille proposée ET
//      officiellement rattachée à son département ; toutes les icônes ont une
//      décision (aucune « unmapped ») ; « Mixte » n'est jamais résolu ; un
//      Bébé fait demander le genre ; un état ne s'améliore jamais.
//   D. DEPOP RESTE INVISIBLE : rien n'importe les deux modules Depop, aucun
//      fichier de l'app, du serveur ou de l'extension ne cite Depop hors de la
//      liste connue avant le 08/10, la migration ne pose que le drapeau à 0.
//   E. LE TEST MORD : chaque contrôle est rejoué sur une copie abîmée et doit
//      tomber.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (rel) => fs.readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const json = (rel) => JSON.parse(lire(rel));

const ARBRE = json("docs/plateformes/depop/arbre.json");
const ATTR = json("docs/plateformes/depop/attributs.json");
const TAILLES = json("docs/plateformes/depop/tailles.json");
const BRUT = json("docs/plateformes/depop/brut/attributes.json");

const cat = await import("../src/utils/depopCategories.js");
const att = await import("../src/utils/depopAttributs.js");
const { ALL_OBJECT_ICONS } = await import("../src/utils/shared.js");
const { FAMILLES } = await import("../src/utils/familleCategorie.js");
const { PALIERS_ETAT, RANG_ETAT } = await import("../supabase/functions/_shared/etat-plateformes.js");
const { VINTED_COLORS } = await import("../src/utils/vintedColors.js");
const { CHILD_MONTH_SIZES, CHILD_YEAR_SIZES } = await import("../src/utils/childSizes.js");

// detectType (src/utils/shared.js) : la liste fermée des types qu'il rend.
const TYPES = new Set(["Mode", "High-Tech", "Maison", "Électroménager", "Jouets", "Livres", "Sport", "Auto-Moto", "Beauté", "Musique", "Collection", "Jardin", "Bricolage", "Autre"]);
{
  // Relue dans la source : les `return '<Type>'` de detectType, jusqu'à la
  // fonction suivante. Une recopie qui diverge casse ce test.
  const src = lire("src/utils/shared.js");
  const debut = src.indexOf("export function detectType");
  const corps = src.slice(debut, src.indexOf("\nexport function", debut + 10));
  const rendus = new Set([...corps.matchAll(/return '([^']+)'/g)].map((m) => m[1]));
  if (JSON.stringify([...rendus].sort()) !== JSON.stringify([...TYPES].sort())) throw new Error(`detectType rend ${[...rendus].join(", ")} — la liste TYPES du test a divergé`);
}

let echecs = 0;
const ok = (cond, msg) => { if (!cond) { echecs++; console.log(`✗ ${msg}`); } return cond; };

// ── Données du relevé ───────────────────────────────────────────────────────
const feuilles = ARBRE.noeuds.filter((n) => n.feuille);
const proposees = feuilles.filter((n) => n.proposee_par_formulaire);
const typesReleves = new Map(); // "groupe/type" -> actif ?
for (const n of feuilles) typesReleves.set(`${n.groupe}/${n.type_produit}`, n.statut === "active" && n.proposee_par_formulaire);
const feuilleParCle = new Map(feuilles.map((n) => [n.id, n]));
const conditionIds = ATTR.etat.valeurs.map((v) => v.id);
const couleurIds = new Set(ATTR.couleur.valeurs.filter((v) => v.statut === "active").map((v) => v.id));
const matieres = ATTR.attributs_par_type.find((a) => a.id === "material").valeurs.filter((v) => v.statut === "active");
const grille = (id) => TAILLES.grilles.find((g) => g.id === id);

// ═══ A + B (catégories, sens retour) ═══════════════════════════════════════
function controleRetour(table) {
  const erreurs = [];
  const cles = new Set(Object.keys(table));
  for (const t of typesReleves.keys()) if (!cles.has(t)) erreurs.push(`type relevé sans ligne : ${t}`);
  for (const t of cles) if (!typesReleves.has(t)) erreurs.push(`ligne orpheline (aucun type relevé) : ${t}`);
  for (const [t, r] of Object.entries(table)) {
    const actif = typesReleves.get(t);
    if (r.non_rattachee) {
      if (actif) erreurs.push(`${t} : actif chez Depop mais « non rattaché »`);
      if (!String(r.non_rattachee).trim()) erreurs.push(`${t} : non rattaché sans raison`);
      continue;
    }
    if (actif === false) erreurs.push(`${t} : inactif chez Depop mais rattaché`);
    if (!TYPES.has(r.type)) erreurs.push(`${t} : type « ${r.type} » hors detectType`);
    if (!FAMILLES.includes(r.famille)) erreurs.push(`${t} : famille « ${r.famille} » hors FAMILLES`);
    if (r.icone !== null && !ALL_OBJECT_ICONS.includes(r.icone)) erreurs.push(`${t} : icône « ${r.icone} » hors ALL_OBJECT_ICONS`);
    if (r.icone === null && !String(r.pourquoi ?? "").trim()) erreurs.push(`${t} : sans icône et sans pourquoi`);
  }
  return erreurs;
}
function controleFeuilles(versInterne) {
  const erreurs = [];
  for (const f of proposees) {
    const r = versInterne(f.id);
    if (!r) erreurs.push(`feuille sans destination : ${f.id}`);
    else if (r.non_rattachee) erreurs.push(`feuille proposée mais non rattachée : ${f.id}`);
  }
  return erreurs;
}
{
  const e = controleRetour(cat.DEPOP_TYPE_VERS_INTERNE);
  e.forEach((x) => ok(false, x));
  const f = controleFeuilles(cat.depopVersInterne);
  f.forEach((x) => ok(false, x));
  ok(typesReleves.size === 160, `160 types relevés (lu : ${typesReleves.size})`);
  ok(proposees.length === 322, `322 feuilles proposées (lu : ${proposees.length})`);
}

// ═══ C (catégories, sens aller) ════════════════════════════════════════════
const DEPS_MODE = new Set(["womenswear", "menswear", "kidswear"]);
function controleAller({ MODE, HORS_MODE, SANS_FEUILLE_DEFAUT }) {
  const erreurs = [];
  const cible = (cle) => {
    const f = feuilleParCle.get(cle);
    if (!f) return `feuille inexistante : ${cle}`;
    if (!f.proposee_par_formulaire) return `feuille non proposée par le formulaire : ${cle}`;
    if (!f.liste_officielle) return `type hors liste officielle du département (sans grille de tailles) : ${cle}`;
    return null;
  };
  for (const [icone, parDep] of Object.entries(MODE)) {
    if (!ALL_OBJECT_ICONS.includes(icone)) erreurs.push(`MODE : icône orpheline ${icone}`);
    for (const [dep, cleType] of Object.entries(parDep)) {
      if (!DEPS_MODE.has(dep)) erreurs.push(`MODE ${icone} : département ${dep} inconnu`);
      const x = cible(`${dep}/${cleType}`); if (x) erreurs.push(`MODE ${icone} → ${x}`);
    }
  }
  for (const [icone, cleType] of Object.entries(HORS_MODE)) {
    if (!ALL_OBJECT_ICONS.includes(icone)) erreurs.push(`HORS_MODE : icône orpheline ${icone}`);
    if (Object.prototype.hasOwnProperty.call(MODE, icone)) erreurs.push(`${icone} : à la fois MODE et HORS_MODE`);
    if (cleType) { const x = cible(`everything-else/${cleType}`); if (x) erreurs.push(`HORS_MODE ${icone} → ${x}`); }
  }
  for (const icone of SANS_FEUILLE_DEFAUT) if (!ALL_OBJECT_ICONS.includes(icone)) erreurs.push(`défaut : icône orpheline ${icone}`);
  for (const icone of ALL_OBJECT_ICONS) {
    const decide = Object.prototype.hasOwnProperty.call(MODE, icone) || Object.prototype.hasOwnProperty.call(HORS_MODE, icone) || SANS_FEUILLE_DEFAUT.has(icone);
    if (!decide) erreurs.push(`icône sans décision Depop : ${icone}`);
  }
  return erreurs;
}
controleAller(cat._internes).forEach((x) => ok(false, x));
{
  const statuts = {};
  for (const i of ALL_OBJECT_ICONS) statuts[cat.depopCategoryStatus(i)] = (statuts[cat.depopCategoryStatus(i)] ?? 0) + 1;
  ok(!statuts.unmapped, `aucune icône « unmapped » (${JSON.stringify(statuts)})`);
  ok(cat.getDepopCategory("👕", "Mixte") === null, "« Mixte » n'est jamais résolu (aucun département unisexe adulte)");
  ok(cat.getDepopCategory("👕", "") === null, "genre absent : rien");
  const bebe = cat.getDepopCategory("👕", "Bébé");
  ok(bebe?.cle === "kidswear/tops/tshirts" && bebe.genre_a_demander === true && bebe.genre_enfant === null, "Bébé : Enfants, genre à demander");
  ok(cat.getDepopCategory("👕", "Fille")?.genre_enfant === "female" && cat.getDepopCategory("👕", "Garçon")?.genre_enfant === "male" && cat.getDepopCategory("👕", "Enfant")?.genre_enfant === "unisex", "Fille/Garçon/Enfant → female/male/unisex");
  ok(cat.getDepopCategory("👗", "Homme") === null, "pas de robe en Homme");
  ok(cat.getDepopCategory("🌸", "Homme")?.cle === "everything-else/beauty/fragrance" && cat.getDepopCategory("🌸", "")?.cle === "everything-else/beauty/fragrance", "hors mode : même feuille quel que soit le genre");
  ok(cat.getDepopCategory("📱", "Femme") === null && cat.depopCategoryStatus("📱") === "unavailable", "smartphone : pas de rayon Depop (unavailable)");
  ok(cat.depopCategoryStatus("🏠") === "no_default", "🏠 : no_default");
  // aller puis retour : la feuille visée est rattachée
  for (const [icone] of Object.entries(cat._internes.HORS_MODE)) {
    const c = cat.getDepopCategory(icone, "");
    if (c) ok(!cat.depopVersInterne(c.cle)?.non_rattachee, `aller-retour ${icone} → ${c.cle}`);
  }
}

// ═══ B (attributs) ═════════════════════════════════════════════════════════
function controleEtat(parPalier, parEtat) {
  const erreurs = [];
  if (JSON.stringify(Object.keys(parPalier)) !== JSON.stringify(PALIERS_ETAT)) erreurs.push("DEPOP_ETAT_PAR_PALIER : paliers ≠ PALIERS_ETAT");
  const ids = Object.values(parPalier);
  if (new Set(ids).size !== ids.length) erreurs.push("DEPOP_ETAT_PAR_PALIER : deux paliers vers le même état");
  for (const id of ids) if (!conditionIds.includes(id)) erreurs.push(`état orphelin : ${id}`);
  for (const id of conditionIds) if (!ids.includes(id)) erreurs.push(`état Depop jamais visé : ${id}`);
  for (const id of conditionIds) if (!parEtat[id]) erreurs.push(`état Depop sans palier retour : ${id}`);
  for (const [palier, id] of Object.entries(parPalier)) {
    const retour = parEtat[id];
    if (RANG_ETAT[retour] > RANG_ETAT[palier]) erreurs.push(`aller-retour ${palier} → ${id} → ${retour} : état embelli`);
  }
  return erreurs;
}
controleEtat(att.DEPOP_ETAT_PAR_PALIER, att.DEPOP_PALIER_PAR_ETAT).forEach((x) => ok(false, x));
ok(JSON.stringify([...att.DEPOP_TYPES_NEUF_SEULEMENT].sort()) === JSON.stringify([...ATTR.etat.neuf_seulement_pour].sort()), "types neuf seulement = relevé");
for (const t of att.DEPOP_TYPES_NEUF_SEULEMENT) ok(typesReleves.get(`beauty/${t}`) === true, `type neuf seulement existant : beauty/${t}`);
ok(att.depopEtat("Neuf avec étiquette", "makeup").id === "brand_new", "maquillage neuf avec étiquette → brand_new");
ok(att.depopEtat("Très bon état", "makeup").refus === "etat_neuf_seulement", "maquillage entamé → question, jamais « Nouveau »");
ok(att.depopEtat("Neuf sans étiquette", "skincare").refus === "etat_neuf_seulement", "soin neuf sans étiquette → question (pas d'embellissement)");
ok(att.depopEtat("Bon état", "tshirts").id === "used_good", "t-shirt bon état → used_good");
ok(att.depopEtat("??", "tshirts").refus === "etat_inconnu", "état illisible → question");

function controleCouleurs(table) {
  const erreurs = [];
  if (JSON.stringify(Object.keys(table)) !== JSON.stringify(VINTED_COLORS)) erreurs.push("couleurs : clés ≠ VINTED_COLORS (ordre compris)");
  for (const [k, v] of Object.entries(table)) if (v !== null && !couleurIds.has(v)) erreurs.push(`couleur orpheline : ${k} → ${v}`);
  const atteintes = new Set(Object.values(table).filter(Boolean));
  for (const id of couleurIds) if (!atteintes.has(id)) erreurs.push(`couleur Depop jamais atteinte : ${id}`);
  return erreurs;
}
controleCouleurs(att.DEPOP_COULEUR_PAR_LIBELLE).forEach((x) => ok(false, x));
{
  const r = att.depopCouleurs("Rouge et Blanc, Noir");
  ok(JSON.stringify(r.ids) === '["red","white"]' && JSON.stringify(r.tronquees) === '["black"]', "couleurs : 2 au plus, la 3e est nommée");
  ok(JSON.stringify(att.depopCouleurs("Turquoise").ids) === "[]", "teinte à cheval : rien n'est envoyé");
}

function controleMatieres(table) {
  const erreurs = [];
  const ids = Object.keys(table);
  const releves = matieres.map((m) => m.id);
  for (const id of releves) if (!ids.includes(id)) erreurs.push(`matière relevée sans ligne : ${id}`);
  for (const id of ids) if (!releves.includes(id)) erreurs.push(`matière orpheline : ${id}`);
  for (const m of matieres) if (table[m.id]?.[0] !== m.libelle_fr) erreurs.push(`${m.id} : 1er libellé ≠ libellé relevé « ${m.libelle_fr} »`);
  const vus = new Map();
  for (const [id, mots] of Object.entries(table)) for (const w of mots) {
    const k = w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (vus.has(k) && vus.get(k) !== id) erreurs.push(`« ${w} » désigne deux matières (${vus.get(k)}, ${id})`);
    vus.set(k, id);
  }
  return erreurs;
}
controleMatieres(att.DEPOP_MATIERES).forEach((x) => ok(false, x));
ok(JSON.stringify(att.depopMatieres("80% coton, 20% élasthanne").ids) === '["cotton","elastane-lycra-spandex"]', "matières : composition lue");
ok(JSON.stringify(att.depopMatieres("Daim").ids) === '["suede"]' && JSON.stringify(att.depopMatieres("Fibre magique").ecartees) === '["Fibre magique"]', "matières : daim → suede ; l'inconnu est écarté et nommé");

function controleTaillesEnfant(table) {
  const erreurs = [];
  const canon = [...CHILD_MONTH_SIZES, ...CHILD_YEAR_SIZES].map((e) => e.value);
  if (JSON.stringify(Object.keys(table)) !== JSON.stringify(canon)) erreurs.push("tailles enfant : clés ≠ CHILD_MONTH_SIZES + CHILD_YEAR_SIZES");
  for (const [k, v] of Object.entries(table)) {
    if (v === null) continue;
    const g = grille(v.grille);
    const t = g?.tailles.find((x) => x.id === v.id);
    if (!g || g.region !== "IT") erreurs.push(`${k} : grille ${v.grille} absente ou hors région IT`);
    else if (!t) erreurs.push(`${k} : taille ${v.grille}.${v.id} orpheline`);
    else if (t.libelle !== v.libelle) erreurs.push(`${k} : libellé « ${v.libelle} » ≠ relevé « ${t.libelle} »`);
  }
  return erreurs;
}
controleTaillesEnfant(att.DEPOP_TAILLE_ENFANT).forEach((x) => ok(false, x));
{
  const g104 = grille(104);
  for (const [n, id] of Object.entries(att._internes.POINTURES_ENFANT)) {
    const t = g104.tailles.find((x) => x.id === id);
    ok(t && t.libelle === (Number(n) >= 33 ? `${n} (adult)` : String(n)), `pointure enfant EU ${n} → 104.${id}`);
  }
  ok(att.depopPointureEnfant("EU 31")?.id === 16 && att.depopPointureEnfant("EU 41") === null && att.depopPointureEnfant("EU 30,5") === null, "pointures : 31 → 16 ; 41 et demi-pointure → question");
}

{
  const unb = BRUT.brand.find((b) => b.id === att.DEPOP_SANS_MARQUE);
  ok(unb && unb.status === "active", "`unbranded` existe et est active dans la liste des marques");
  ok(att.depopMarqueAbsente("Sans marque") && att.depopMarqueAbsente("") && !att.depopMarqueAbsente("Nike"), "absence de marque : estSansMarque (la seule liste)");
}

// ═══ D (invisibilité) ══════════════════════════════════════════════════════
const MODULES = ["src/utils/depopCategories.js", "src/utils/depopAttributs.js"];
// Fichiers qui citaient Depop AVANT le 08/10 (textes, prompts, blog, motif de départ) — figés.
const CONNUS = new Set([
  "src/blog/comment-calculer-profits-vinted.md", "src/blog/how-to-calculate-reselling-profits.md",
  "src/i18n/translations.js", "src/stock/regles.js", "src/tabs/StockTab.jsx",
  "supabase/functions/_shared/description-leboncoin.ts", "supabase/functions/deal-analysis/index.ts",
  "supabase/functions/email-tunnel/index.ts", "supabase/functions/lens-analysis/index.ts",
  "supabase/functions/stats-analysis/index.ts", "supabase/functions/voice-intent/index.ts",
  "supabase/functions/voice-parse/index.ts", "supabase/migrations/20260919170000_emails_porte_unique.sql",
  "supabase/migrations/20261006090000_departs_compte.sql",
  ...MODULES, "supabase/migrations/20261008230000_depop_drapeau_inerte.sql",
]);
function controleInvisible(fichiersQuiCitent, imports) {
  const erreurs = [];
  for (const f of fichiersQuiCitent) if (!CONNUS.has(f)) erreurs.push(`Depop cité dans un fichier de l'app/serveur/extension : ${f}`);
  for (const f of imports) erreurs.push(`module Depop importé par ${f}`);
  return erreurs;
}
const gitGrep = (args) => {
  try { return execFileSync("git", ["grep", ...args], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch (e) { if (e.status === 1) return []; throw e; }
};
// Fichiers suivis ET fichiers neufs non encore ajoutés (--untracked).
const citent = gitGrep(["--untracked", "-il", "depop", "--", "src", "supabase", "chrome-extension", "public", "index.html", "vite.config.js"]);
const importent = gitGrep(["--untracked", "-l", "-E", "depop(Categories|Attributs)", "--", "src", "supabase", "chrome-extension"]).filter((f) => !MODULES.includes(f));
controleInvisible(citent, importent).forEach((x) => ok(false, x));
{
  const manifeste = lire("chrome-extension/manifest.json");
  ok(!/depop/i.test(manifeste), "manifest de l'extension : aucun hôte Depop");
  const mig = lire("supabase/migrations/20261008230000_depop_drapeau_inerte.sql");
  const code = mig.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  ok(/VALUES \('depop_ouvert', 0, now\(\)\)/.test(code) && /ON CONFLICT \(key\) DO NOTHING/.test(code), "migration : depop_ouvert = 0, jamais réécrit");
  ok(!/\b(UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE)\b/i.test(code) && !/'depop_ouvert',\s*1/.test(code), "migration : aucune autre instruction, jamais à 1");
}

// ═══ E (le test mord) ══════════════════════════════════════════════════════
{
  const mord = (nom, erreurs) => ok(erreurs.length > 0, `mutation non détectée : ${nom}`);
  const retour = { ...cat.DEPOP_TYPE_VERS_INTERNE };
  delete retour["tops/tshirts"];
  mord("type retiré du sens retour", controleRetour(retour));
  mord("ligne orpheline", controleRetour({ ...cat.DEPOP_TYPE_VERS_INTERNE, "tops/inexistant": { icone: "👕", type: "Mode", famille: "mode" } }));
  mord("icône inventée", controleRetour({ ...cat.DEPOP_TYPE_VERS_INTERNE, "tops/tshirts": { icone: "🦄", type: "Mode", famille: "mode" } }));
  mord("famille inventée", controleRetour({ ...cat.DEPOP_TYPE_VERS_INTERNE, "tops/tshirts": { icone: "👕", type: "Mode", famille: "vetement" } }));
  mord("type actif déclaré non rattaché", controleRetour({ ...cat.DEPOP_TYPE_VERS_INTERNE, "tops/tshirts": { non_rattachee: "x" } }));
  mord("inactif rattaché", controleRetour({ ...cat.DEPOP_TYPE_VERS_INTERNE, "accessories/rings": { icone: "💍", type: "Mode", famille: "mode" } }));
  mord("sans icône sans pourquoi", controleRetour({ ...cat.DEPOP_TYPE_VERS_INTERNE, "tops/corsets": { icone: null, type: "Mode", famille: "mode" } }));
  mord("feuille sans destination", controleFeuilles((cle) => (cle === "kidswear/bundles/bundles" ? null : cat.depopVersInterne(cle))));
  const I = cat._internes;
  mord("aller vers une feuille hors liste officielle", controleAller({ ...I, MODE: { ...I.MODE, "👔": { menswear: "tops/blouses" } } }));
  mord("aller vers une feuille inexistante", controleAller({ ...I, HORS_MODE: { ...I.HORS_MODE, "🌸": "beauty/parfum" } }));
  mord("aller vers une feuille inactive", controleAller({ ...I, HORS_MODE: { ...I.HORS_MODE, "⚡": "home/home-appliances" } }));
  const sansDecision = { ...I.HORS_MODE }; delete sansDecision["📱"];
  mord("icône sans décision", controleAller({ ...I, HORS_MODE: sansDecision }));
  mord("état embelli", controleEtat(att.DEPOP_ETAT_PAR_PALIER, { ...att.DEPOP_PALIER_PAR_ETAT, used_like_new: "neuf_etiquette" }));
  mord("état orphelin", controleEtat({ ...att.DEPOP_ETAT_PAR_PALIER, bon: "used_ok" }, att.DEPOP_PALIER_PAR_ETAT));
  mord("couleur orpheline", controleCouleurs({ ...att.DEPOP_COULEUR_PAR_LIBELLE, Noir: "noir" }));
  mord("couleur Depop jamais atteinte", controleCouleurs({ ...att.DEPOP_COULEUR_PAR_LIBELLE, "Kaki": null }));
  mord("matière orpheline", controleMatieres({ ...att.DEPOP_MATIERES, bambou: ["Bambou"] }));
  mord("matière à deux sens", controleMatieres({ ...att.DEPOP_MATIERES, wool: ["Laine", "Coton"] }));
  mord("taille enfant orpheline", controleTaillesEnfant({ ...att.DEPOP_TAILLE_ENFANT, "8 ans": { grille: 101, id: 99, libelle: "8 years" } }));
  mord("taille enfant mal libellée", controleTaillesEnfant({ ...att.DEPOP_TAILLE_ENFANT, "8 ans": { grille: 101, id: 14, libelle: "9 years" } }));
  mord("Depop cité ailleurs", controleInvisible([...citent, "src/utils/stockFiltres.js"], []));
  mord("module Depop importé", controleInvisible(citent, ["src/App.jsx"]));
}

// ── Bilan ───────────────────────────────────────────────────────────────────
const parNiveau = { icone: 0, type: 0, non_rattachee: 0 };
for (const f of feuilles) {
  const r = cat.depopVersInterne(f.id);
  if (r?.non_rattachee) parNiveau.non_rattachee++;
  else if (r?.icone) parNiveau.icone++;
  else parNiveau.type++;
}
console.log(`Feuilles Depop (${feuilles.length}) : ${parNiveau.icone} rattachées à une icône, ${parNiveau.type} au type seulement, ${parNiveau.non_rattachee} non rattachées (inactives).`);
console.log(echecs ? `\n${echecs} échec(s)` : "\nselftest:depop-mapping — tout est vert.");
process.exit(echecs ? 1 : 0);
