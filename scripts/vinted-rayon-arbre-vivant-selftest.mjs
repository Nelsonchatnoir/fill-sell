// (07/11 nuit, points 1 et 2 — lot des rouges) Vinted : un rayon de l'ANCIEN arbre sur un compte basculé, et un rayon
// refusé au compte Pro. Le VRAI code : le moteur serveur (_shared/rayon-refuse-moteur.js, rayon-moteur-attendu.js), la
// descente de l'extension (selectCategory, extraite de content-scripts/vinted.js et jouée sur un panneau simulé), le
// câblage de background.js / handler-watch / correctifs-extension.
//   Cas fondateurs : 9256e3ae, job dca7193f « Éponge anti-buée pour voiture » — « Hommes › Accessoires › Autres » (99) ;
//   e95e8b9d, job fb90b403 « Rasoir vintage » — 400 « Les utilisateurs Vinted Pro ne peuvent pas ajouter d'articles
//   dans ce catalogue » (field « category »).
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/rayon-refuse-moteur.js")).href);
const A = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/rayon-moteur-attendu.js")).href);
const C = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/correctifs-extension.js")).href);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

const DEPUIS_LA_FICHE = ["Hommes", "Accessoires", "Autres"];
const NIVEAU_HOMMES_BASCULE = ["Vêtements", "Chaussures", "Sacs et sacoches", "Chapeaux et casquettes", "Soins"];
const SACS = ["Sacs à dos", "Mallettes", "Sacs banane", "Housses pour vêtements", "Sacs de sport", "Fourre-tout et sacs marins",
  "Bagages et valises", "Cartables et sacoches", "Sacs à bandoulière", "Porte-monnaie"];
const jobVinted = (allowed, extra = {}) => ({
  platform: "vinted", status: "needs_user", action: "publish", title: "🚗 Éponge anti-buée pour voiture – Neuve",
  platform_fields: { categoryPath: DEPUIS_LA_FICHE, needsUserField: { field_key: "categoryLevelChoice", allowed_values: allowed }, ...extra },
});

// ═══ A. LE MOTEUR SERVEUR ═══════════════════════════════════════════════════════════════════════════════════════
{
  // A1. La première question de l'extension (niveau « Hommes » du compte basculé) : plan « rayon disparu », tout l'arbre vivant.
  const plan = M.rayonRefuseDuJob(jobVinted(NIVEAU_HOMMES_BASCULE));
  ok(plan && plan.raison === M.RAISON_RAYON_DISPARU && plan.base.join(" > ") === DEPUIS_LA_FICHE.join(" > ") && plan.enfantsVivants == null,
    "dca7193f (1re question) : plan « rayon disparu de l'arbre du compte », base = le chemin d'origine, aucun filtre de niveau");
  const f = M.feuillesCandidates({ plateforme: "vinted", base: plan.base });
  ok(f.length > 2000 && f.length < 2600, `arbre vivant entier (${f.length} feuilles)`);
  ok(!f.some((x) => x.chemin[1] === "Accessoires" && ["Femmes", "Hommes"].includes(x.chemin[0])), "aucune feuille sous « Femmes/Hommes › Accessoires » (branches retirées)");
  ok(!f.some((x) => x.id === "99"), "« Hommes › Accessoires › Autres » (99) n'est jamais proposée");
  ok(f.some((x) => x.chemin.join(" > ") === "Hommes > Sacs et sacoches > Sacs à dos" && x.id === "246"), "rayon déplacé : « Hommes › Sacs et sacoches › Sacs à dos » (même id 246)");
  ok(f.some((x) => x.chemin.join(" > ") === "Accessoires de mode > Ceintures"), "racine « Accessoires de mode » présente");
  // A2. L'état d'aujourd'hui (question « dix sacs » après la réponse « Sacs et sacoches ») : même plan.
  const plan2 = M.rayonRefuseDuJob(jobVinted(SACS, { categoryLevelChoice: "Sacs et sacoches" }));
  ok(plan2 && plan2.raison === M.RAISON_RAYON_DISPARU, "dca7193f (état du 07/11, dix sacs) : même plan, jugé sur l'arbre vivant");
  // A3. Contre-épreuve : une page qui montre ENCORE « Accessoires » (compte resté sur l'ancien arbre) → la règle d'avant,
  //     à l'identique (plan « refusé », enfants lus sur la page, feuilles SOUS le rayon d'origine).
  const ancienPlan = M.rayonRefuseDuJob(jobVinted(["Vêtements", "Chaussures", "Accessoires", "Soins"]));
  ok(ancienPlan?.raison === M.RAISON_RAYON_REFUSE && Array.isArray(ancienPlan.enfantsVivants)
    && M.feuillesCandidates({ plateforme: "vinted", base: ancienPlan.base, enfantsVivants: ancienPlan.enfantsVivants }).length === 0,
    "page de l'ancien arbre (« Accessoires » affiché) : règle d'avant (99 est une feuille → aucune feuille, la question de l'extension reste)");
  const bijoux = { platform: "vinted", status: "needs_user", action: "publish", platform_fields: { categoryPath: ["Femmes", "Accessoires", "Bijoux"],
    needsUserField: { field_key: "categoryLevelChoice", allowed_values: ["Bracelets", "Colliers", "Bagues", "Breloques et pendentifs", "Autres bijoux"] } } };
  const pb = M.rayonRefuseDuJob(bijoux);
  const fb = M.feuillesCandidates({ plateforme: "vinted", base: pb.base, enfantsVivants: pb.enfantsVivants });
  ok(pb.raison === M.RAISON_RAYON_REFUSE && fb.length === 5 && fb.every((x) => x.chemin.slice(0, 3).join(">") === "Femmes>Accessoires>Bijoux"),
    "compte resté sur l'ancien arbre (« Bijoux » intermédiaire, sous-rayons de l'ancien arbre) : feuilles SOUS le rayon, comme avant");
  ok(!M.pageDuNouvelArbreVinted([]) && !M.pageDuNouvelArbreVinted(["Inconnu A", "Inconnu B"]), "preuve du nouvel arbre : jamais sur une liste vide ou inconnue");
  // A4. Équivalent sûr : posé seul, sans IA.
  let appels = 0;
  const iaInterdite = async () => { appels++; throw new Error("l'IA ne doit pas être appelée"); };
  for (const [de, vers] of [
    [["Hommes", "Accessoires", "Sacs et sacoches", "Sacs à dos"], "Hommes > Sacs et sacoches > Sacs à dos"],
    [["Femmes", "Accessoires", "Ceintures"], "Accessoires de mode > Ceintures"],
    [["Femmes", "Accessoires", "Chapeaux et casquettes", "Bonnets"], "Femmes > Chapeaux et casquettes > Bonnets"],
  ]) {
    const r = await M.resoudreRayonRefuse({ plateforme: "vinted", base: de, titre: "x" }, iaInterdite);
    ok(r.chemin?.join(" > ") === vers && r.source === "seule_feuille", `équivalent sûr : « ${de.join(" › ")} » → « ${vers} »`);
  }
  ok(appels === 0, "équivalents : aucun appel à l'IA");
  // A5. Sans équivalent : l'IA en deux temps (branche montrée avec ce qu'elle contient, puis la feuille).
  const corps = [];
  const ia = (b1, b2) => async (c) => {
    corps.push(c);
    const liste = c.candidats.vinted;
    if (corps.length === 1) return { choix: b1 ? { vinted: liste.find((x) => x.chemin.join(" > ") === b1) } : {} };
    return { choix: b2 ? { vinted: liste.find((x) => x.chemin.join(" > ") === b2) } : {} };
  };
  const entree = { plateforme: "vinted", base: plan.base, titre: "Éponge anti-buée pour voiture", objet: "éponge", user_id: "u" };
  const cible = "Maison > Entretien de la maison > Aspirateurs et nettoyage > Appareils de nettoyage spécialisés";
  const r5 = await M.resoudreRayonRefuse(entree, ia("Maison > Entretien de la maison", cible));
  ok(r5.chemin?.join(" > ") === cible && r5.source === "ia_arbre_vivant", "IA : branche « Maison › Entretien de la maison », puis la feuille");
  ok(corps[0].consigne === "plus_proche" && corps[0].candidats.vinted.length <= 600 && corps[0].candidats.vinted.every((b) => b.chemin.length <= 2)
    && corps[0].candidats.vinted.some((b) => Array.isArray(b.sous) && b.sous.length), "1er temps : ≤ 600 branches (2 niveaux), ce qu'elles contiennent montré, consigne « le plus proche »");
  ok(!corps[1].consigne && corps[1].candidats.vinted.every((x) => x.chemin.slice(0, 2).join(" > ") === "Maison > Entretien de la maison"), "2e temps : les feuilles de la branche seules, consigne ordinaire (null permis)");
  // A6. La feuille introuvable dans la branche : la question de FEUILLES de la branche, chemins complets.
  corps.length = 0;
  const r6 = await M.resoudreRayonRefuse(entree, ia("Maison > Entretien de la maison", null));
  ok(r6.doute && r6.motif === "ia_sans_choix" && r6.feuilles.length > 5 && r6.feuilles.every((x) => x.chemin[0] === "Maison"), "IA sans feuille : doute, les feuilles de la branche");
  const q6 = M.questionRayonRefuse({ plateforme: "vinted", base: plan.base, feuilles: r6.feuilles, cleChamp: M.CLE_REPONSE_RAYON, raison: plan.raison });
  ok(q6.raison === M.RAISON_RAYON_DISPARU && q6.options_completes && q6.allowed_values.every((v) => v.startsWith("Maison › Entretien de la maison › ")),
    "question : chemins COMPLETS (la base morte n'est pas un préfixe), raison « rayon disparu »");
  const rep = M.cheminDeLaReponse({ plateforme: "vinted", base: plan.base, reponse: q6.allowed_values[0] });
  ok(rep && rep.chemin.join(" › ") === q6.allowed_values[0], "la réponse (chemin complet) se retraduit en feuille (get-pending-jobs, sans IA)");
  // Une question posée AVANT ce correctif sous un rayon de l'ancien arbre (libellé relatif) se retraduit toujours.
  const ancienneQ = M.cheminDeLaReponse({ plateforme: "vinted", base: ["Femmes", "Accessoires", "Bijoux"], reponse: "Colliers" });
  ok(ancienneQ && ancienneQ.chemin.join(" > ") === "Femmes > Accessoires > Bijoux > Colliers", "réponse d'une question d'avant (libellé relatif sous l'ancien rayon) : jamais perdue");
  // A7. Aucune branche : les feuilles vivantes de la racine d'origine (« Hommes »), jamais l'arbre entier.
  corps.length = 0;
  const r7 = await M.resoudreRayonRefuse(entree, ia(null, null));
  ok(r7.doute && r7.motif === "ia_sans_branche" && r7.feuilles.every((x) => x.chemin[0] === "Hommes") && !r7.feuilles.some((x) => x.chemin[1] === "Accessoires"),
    "IA sans branche : la question propose les rayons vivants de « Hommes »");
  // A8. IA injoignable : réessai (ia_indisponible) avec des feuilles en main.
  const r8 = await M.resoudreRayonRefuse(entree, async () => { throw new Error("HTTP 503"); });
  ok(r8.doute && r8.iaIndisponible && r8.feuilles.length > 0, "IA injoignable : ia_indisponible, des feuilles prêtes pour la question");
  // A9. Les messages : vrais, la sortie « Abandonner Vinted pour cet article » nommée (elle existe pour une publication).
  const msg = M.messageRayonAChoisir("vinted", plan.base, plan.raison);
  ok(/n'a plus la catégorie « Hommes › Accessoires › Autres »/.test(msg) && /Abandonner Vinted pour cet article/.test(msg) && !/sous-catégorie/.test(msg),
    "message « rayon disparu » : le chemin d'origine, la sortie nommée, jamais « sous-catégorie »");
  ok(M.rayonRefuseDuJob({ ...jobVinted(NIVEAU_HOMMES_BASCULE), action: "republish", platform_fields: { republish_snapshot: { categoryPath: DEPUIS_LA_FICHE }, needsUserField: { field_key: "categoryLevelChoice", allowed_values: NIVEAU_HOMMES_BASCULE } } })?.raison === M.RAISON_RAYON_REFUSE,
    "republication : arbre vivant aussi, mais message d'avant (le bouton « Abandonner » n'existe pas pour une republication)");
  const pause = A.pauseRayonMoteur({ platform: "vinted", action: "publish", pfIn: jobVinted(NIVEAU_HOMMES_BASCULE).platform_fields, pfEnBase: {}, message: "x" });
  ok(pause?.pause && /n'a plus la catégorie de cet article/.test(pause.message), "pause d'update-job-status : message « rayon disparu », FillSell choisit");
  // A10. Le doute « aucune_feuille » posé avant ce correctif se rejuge UNE fois (handler-watch) — jamais en boucle.
  const rmDca = { plateforme: "vinted", base: DEPUIS_LA_FICHE, doute: true, essais: 3, motif: "aucune_feuille" };
  ok(M.rayonMoteurARejuger(rmDca, plan) === true, "dca7193f : rayon_moteur { aucune_feuille, essais 3 } → rejugé");
  ok(M.rayonMoteurARejuger({ ...rmDca, motif: "ia_sans_choix" }, plan) === false, "un vrai doute (motif réécrit après le rejugement) : jamais rejugé");
  ok(M.rayonMoteurARejuger({ ...rmDca, base: ["Enfants", "Jeux et jouets"] }, plan) === false, "autre rayon : jamais");
  const hw = lire("supabase/functions/handler-watch/index.ts");
  ok(/return Number\(rm\?\.essais \?\? 0\) < ESSAIS_RAYON_MAX \|\| !!rm\?\.chemin \|\| rayonMoteurARejuger\(rm, plan\);/.test(hw)
    && /genresDuRayonVinted, rayonMoteurARejuger, CLE_REPONSE_RAYON/.test(hw), "handler-watch : la porte de rejugement est câblée (filtre + import)");
  // A11. Contre-épreuves : l'Horloge (niveau devenu intermédiaire) et les libellés relatifs, au caractère près.
  const horloge = { platform: "vinted", status: "needs_user", action: "republish",
    platform_fields: { republish_snapshot: { categoryPath: ["Enfants", "Jeux et jouets"] }, needsUserField: { field_key: "categoryLevelChoice", allowed_values: ["Figurines et accessoires", "Jeux de construction"] } } };
  const ph = M.rayonRefuseDuJob(horloge);
  ok(ph?.raison === M.RAISON_RAYON_REFUSE && ph.base.join(">") === "Enfants>Jeux et jouets" && Array.isArray(ph.enfantsVivants), "Horloge : plan d'avant, inchangé");
  const fh = M.feuillesCandidates({ plateforme: "vinted", base: ph.base, enfantsVivants: ph.enfantsVivants });
  ok(fh.length > 0 && fh.every((x) => x.chemin[0] === "Enfants" && x.chemin[1] === "Jeux et jouets"), "Horloge : feuilles SOUS le rayon d'origine, comme avant");
  ok(M.libelleFeuille(fh[0].chemin, ph.base) === fh[0].chemin.slice(2).join(" › "), "libellé relatif au rayon d'origine quand il en est le préfixe (inchangé)");
  ok(M.libelleFeuille(["A", "B"], ["A", "B"]) === "A › B" && M.libelleFeuille(["A", "B"], []) === "A › B", "libellés limites inchangés");
}

// ═══ B. LE RAYON REFUSÉ AU COMPTE PRO (serveur) ════════════════════════════════════════════════════════════════
{
  const refuse = ["Hommes", "Soins", "Accessoires", "Autres accessoires beauté"];
  const jobPro = (raison, action = "publish") => ({ platform: "vinted", status: "needs_user", action,
    platform_fields: { categoryPath: refuse, needsUserField: { field_key: "categoryLevelChoice", allowed_values: [], raison } } });
  const plan = M.rayonRefuseDuJob(jobPro("rayon_interdit_pro"));
  ok(plan?.raison === M.RAISON_RAYON_INTERDIT_PRO && plan.base.join(">") === "Hommes" && plan.exclure.join(">") === refuse.join(">"),
    "fb90b403 : plan « interdit aux comptes Pro », racine « Hommes », le rayon refusé exclu");
  ok(M.rayonRefuseDuJob(jobPro("rayon_interdit_pro", "republish")) === null, "republication : pas de question (message vrai seul)");
  ok(M.rayonRefuseDuJob(jobPro("rayon_refuse_au_compte"))?.raison === M.RAISON_RAYON_REFUSE_AU_COMPTE, "refus sans « Pro » : même traitement, sa propre raison");
  let appels = 0;
  const r = await M.resoudreRayonRefuse({ plateforme: "vinted", base: plan.base, exclure: plan.exclure, titre: "Rasoir vintage" }, async () => { appels++; return {}; });
  ok(r.doute && r.motif === "choix_de_la_personne" && appels === 0, "jamais l'IA : la personne choisit (aucun contournement d'une interdiction)");
  ok(!r.feuilles.some((x) => x.chemin.join(">") === refuse.join(">")) && r.feuilles[0].chemin.slice(0, 3).join(">") === "Hommes>Soins>Accessoires",
    "le rayon refusé n'est jamais reproposé ; les plus proches en tête");
  const q = M.questionRayonRefuse({ plateforme: "vinted", base: plan.base, feuilles: r.feuilles, cleChamp: M.CLE_REPONSE_RAYON, raison: plan.raison });
  ok(q.raison === M.RAISON_RAYON_INTERDIT_PRO && q.allowed_values.length === r.feuilles.length && !q.allowed_values[0].startsWith("Hommes"),
    "question : feuilles relatives à « Hommes », raison « interdit aux comptes Pro »");
  const rep = M.cheminDeLaReponse({ plateforme: "vinted", base: plan.base, reponse: q.allowed_values[2] });
  ok(rep && rep.chemin[0] === "Hommes", "réponse retraduite (get-pending-jobs) sur la même base");
  ok(/n'autorise pas les comptes Pro/.test(M.messageRayonAChoisir("vinted", plan.base, plan.raison))
    && /Abandonner Vinted pour cet article/.test(M.messageRayonAChoisir("vinted", plan.base, plan.raison))
    && !/Pro/.test(M.messageRayonAChoisir("vinted", plan.base, M.RAISON_RAYON_REFUSE_AU_COMPTE)), "messages vrais (Pro / sans Pro), sortie nommée");
  const pause = A.pauseRayonMoteur({ platform: "vinted", action: "publish", pfIn: jobPro("rayon_interdit_pro").platform_fields, pfEnBase: {}, message: "x" });
  ok(pause?.pause && /comptes Pro/.test(pause.message) && /tu choisiras/.test(pause.message), "pause : « tu choisiras », jamais « FillSell la choisit »");
  // Le correctif d'extension qui relance fb90b403 au build 0.6.179 : INERTE tant que le zip n'existe pas.
  const fb = { status: "needs_user", platform: "vinted", action: "publish", handler_build: "2026-11-02T08:51:41Z+ae3c8e6 · v0.6.166",
    error: "Vinted a refusé la publication : Les utilisateurs Vinted Pro ne peuvent pas ajouter d'articles dans ce catalogue — l'annonce n'a PAS été créée. Champ exigé par Vinted : category.",
    platform_fields: { needsUserField: { field_key: "category" } } };
  const entree = C.CORRECTIFS_EXTENSION.find((c) => c.cle === "vinted_rayon_refuse_au_compte");
  ok(entree && entree.buildMin === C.BUILD_VINTED_RAYON_REFUSE_AU_COMPTE, "entrée « vinted_rayon_refuse_au_compte » présente");
  // (07/11 20:56) buildMin posé au BUILD_ID du zip 0.6.179 (2026-11-07T19:56:30Z+3c365ba).
  ok(entree?.buildMin === "2026-11-07T19:56:30Z", "buildMin = BUILD_ID du paquet 0.6.179");
  ok(C.correctifPourJob(fb)?.cle === "vinted_rayon_refuse_au_compte", "fb90b403 (build 0.6.166) repart une fois");
  ok(C.posteAJour("2026-11-07T19:56:30Z+3c365ba", entree) && !C.posteAJour("2026-11-07T14:34:17Z+bef6d20", entree), "poste 0.6.179 à jour ; poste 0.6.178 non");
}

// ═══ C. L'EXTENSION : LA DESCENTE (selectCategory, VRAI code) SUR UN PANNEAU SIMULÉ ═══════════════════════════
const vt = lire("chrome-extension/content-scripts/vinted.js");
const bg = lire("chrome-extension/background.js");
{
  const ARBRE = {
    Hommes: {
      "Vêtements": { "T-shirts": null, "Pulls": null },
      "Chaussures": { "Baskets": null },
      "Sacs et sacoches": Object.fromEntries(SACS.map((s) => [s, null])),
      "Chapeaux et casquettes": { "Bonnets": null, "Casquettes": null },
      "Soins": null,
    },
    Femmes: { "Chapeaux et casquettes": { "Bonnets": null, "Bandeaux": null } },
  };
  const fab = () => {
    const etat = { courant: ARBRE, pile: [], selection: null };
    const nf = new Function(`${extraireFonctionJs(vt, "texteComparable")}; return (s) => texteComparable(s);`)();
    const el = (k) => ({ k, enfants: etat.courant[k], click() { if (this.enfants) { etat.pile.push(k); etat.courant = this.enfants; } else etat.selection = [...etat.pile, k]; } });
    const trouve = (label, opts = {}) => Object.keys(etat.courant).filter((k) => (opts.exactOnly ? k === label : nf(k) === nf(label))).map((k) => ({ el: el(k) }));
    const ctx = {
      console: { log() {}, warn() {}, error() {} },
      sel: async () => ({ selectorFor: () => "[data-testid^=catalog-]" }),
      RENOMMAGES_RACINE_VINTED: {}, RACINES_FR_VINTED: ["Femmes", "Hommes", "Enfants", "Maison"], VINTED_DOMAINE_PAGE: "vinted.fr",
      CATALOG_PREMIER_NIVEAU_MS: 0, categorieArbitrage: null, categorieSuggestionRetenue: null,
      openDropdown: async () => {}, humanPause: async () => {}, sleep: async () => {}, confirmDropdownIfNeeded: async () => {},
      document: { querySelectorAll: () => [], getElementById: () => null },
      chrome: { runtime: { sendMessage: async () => ({}) } },
      waitForStableCatalogOption: async (_s, label, opts) => { const m = trouve(label, opts); if (!m.length) throw new Error("introuvable"); return m[0]; },
      findOptionMatches: (_d, _s, label, opts) => trouve(label, opts),
      isChevronOption: (e) => !!e?.enfants,
      visibleCatalogChoices: async () => Object.keys(etat.courant),
      visibleCatalogLabels: async () => Object.keys(etat.courant),
      attendreOptionsCatalogue: async () => Object.keys(etat.courant),
      visibleCatalogChildIds: async () => new Set(),
      estSuggestionCatalogue: () => false, describeMatchedOption: () => "", resoudreCheminIdsCatalogue: async () => null,
      langueEtrangereDesRacinesVinted: () => null,
    };
    vm.createContext(ctx);
    vm.runInContext([extraireFonctionJs(vt, "texteComparable"), "const normalizeFuzzy = (s) => texteComparable(s);",
      extraireFonctionJs(vt, "erreurCategorie"), extraireFonctionJs(vt, "selectCategory"), "this.selectCategory = selectCategory;"].join("\n"), ctx);
    return { etat, selectCategory: ctx.selectCategory };
  };
  const jouer = async (chemin, fields = {}) => {
    const { etat, selectCategory } = fab();
    try { await selectCategory(chemin, fields, "titre"); return { selection: etat.selection }; }
    catch (e) { return { erreur: e, selection: etat.selection }; }
  };
  // C1. dca7193f : la personne a remplacé « Accessoires » par « Sacs et sacoches » — la queue « Autres » est coupée.
  const c1 = await jouer(DEPUIS_LA_FICHE, { categoryLevelChoice: "Sacs et sacoches" });
  ok(c1.erreur?.needsUserField?.field_key === "categoryLevelChoice" && c1.erreur.needsUserField.allowed_values.join("|") === SACS.join("|"),
    "dca7193f : sous « Sacs et sacoches », la question des sous-niveaux RÉELS (plus « Vinted ne propose pas « Autres » »)");
  ok(!/« Autres »/.test(c1.erreur.message) && /sous « Sacs et sacoches »/.test(c1.erreur.message), "le message parle du choix, jamais de la queue héritée");
  ok(Array.isArray(c1.erreur.cheminApresChoix) && c1.erreur.cheminApresChoix.join(">") === "Hommes>Sacs et sacoches", "la question porte le chemin corrigé (Hommes › Sacs et sacoches)");
  // C2. La réponse suivante, sur le chemin corrigé (ce que l'arrière-plan en fait) : ajoutée, la feuille est posée.
  const c2 = await jouer(c1.erreur.cheminApresChoix, { categoryLevelChoice: "Sacs à dos" });
  ok(!c2.erreur && c2.selection?.join(">") === "Hommes>Sacs et sacoches>Sacs à dos", "réponse suivante : ajoutée au chemin corrigé → publiée, jamais une boucle");
  // C3. Niveau retiré par Vinted : le libellé plus bas de la queue est affiché sous le choix → la descente reprend sur lui.
  const c3 = await jouer(["Hommes", "Accessoires", "Sacs et sacoches", "Sacs à dos"], { categoryLevelChoice: "Sacs et sacoches" });
  ok(!c3.erreur && c3.selection?.join(">") === "Hommes>Sacs et sacoches>Sacs à dos", "niveau retiré : « Sacs à dos » repris sous le choix, sans question");
  // C4. Le choix est une FEUILLE : la queue héritée est coupée, la feuille posée.
  const c4 = await jouer(DEPUIS_LA_FICHE, { categoryLevelChoice: "Soins" });
  ok(!c4.erreur && c4.selection?.join(">") === "Hommes>Soins", "choix feuille : posé, queue coupée");
  // C5. Contre-épreuve (renommage seul) : la queue trouvée sous le choix sert, comme avant.
  const c5 = await jouer(["Femmes", "Chapeaux & casquettes", "Bonnets"], { categoryLevelChoice: "Chapeaux et casquettes" });
  ok(!c5.erreur && c5.selection?.join(">") === "Femmes>Chapeaux et casquettes>Bonnets", "renommage : la queue « Bonnets » sert toujours");
  // C6. Contre-épreuve (aucun choix) : la question d'avant, au caractère près, sans chemin corrigé.
  const c6 = await jouer(DEPUIS_LA_FICHE, {});
  ok(c6.erreur?.message?.startsWith("Vinted ne propose pas « Accessoires » à cet endroit") && c6.erreur.needsUserField.allowed_values.join("|") === Object.keys(ARBRE.Hommes).join("|")
    && c6.erreur.cheminApresChoix === undefined, "sans choix : « Vinted ne propose pas « Accessoires » », options du niveau, rien d'autre");
  // C7. Contre-épreuve (chemin juste) : posé tel quel.
  const c7 = await jouer(["Hommes", "Vêtements", "Pulls"], {});
  ok(!c7.erreur && c7.selection?.join(">") === "Hommes>Vêtements>Pulls", "chemin juste : inchangé");
  // C8. Cul-de-sac (intermédiaire) + choix : ajouté (règle d'avant), et une question suivante y porterait le chemin.
  const c8 = await jouer(["Hommes", "Sacs et sacoches"], { categoryLevelChoice: "Mallettes" });
  ok(!c8.erreur && c8.selection?.join(">") === "Hommes>Sacs et sacoches>Mallettes", "cul-de-sac + choix : ajouté, posé");
  // Le câblage : la catégorie rend cheminApresChoix, l'arrière-plan en fait le chemin de la publication (jamais une recréation).
  ok(/\.\.\.\(Array\.isArray\(e\?\.cheminApresChoix\) && e\.cheminApresChoix\.length \? \{ cheminApresChoix: e\.cheminApresChoix\.map\(String\) \} : \{\}\),/.test(vt),
    "vinted.js : le résultat needsUser rend cheminApresChoix");
  ok(/result\.needsUserField\.field_key === "categoryLevelChoice"\s*\n\s*&& Array\.isArray\(result\.cheminApresChoix\)/.test(bg)
    && /pfChoix\.categoryPath = result\.cheminApresChoix\.map\(String\)\.slice\(0, 8\);\s*\n\s*delete pfChoix\.categoryLevelChoice;/.test(bg)
    && /!job\.platform_fields\?\.republish_recreation\s*\n\s*&& result\.needsUserField\.field_key === "categoryLevelChoice"/.test(bg), "background.js : chemin corrigé posé (publication seulement), choix consommé effacé");
}

// ═══ D. L'EXTENSION : LE REFUS DU RAYON AU COMPTE (point 2) ═══════════════════════════════════════════════════
{
  ok(/\n  category: "Catégorie",\n/.test(vt), "« category » a son libellé (jamais la clé brute)");
  const bloc = vt.slice(vt.indexOf("const refusRayon = serverRequired.find("), vt.indexOf("const refusRayon = serverRequired.find(") + 2200);
  ok(/Vinted n'autorise pas les comptes Pro à vendre dans le rayon/.test(bloc) && /rayonRefuseAuCompte: \{ pro, message: valeurRefus\.slice\(0, 300\), chemin \}/.test(bloc)
    && /preuveEchec: "refus_serveur"/.test(bloc), "vinted.js : message vrai, rayonRefuseAuCompte rendu, refus prouvé");
  ok(vt.indexOf("const refusRayon = serverRequired.find(") < vt.indexOf("error: dimensionsColis\n"), "le refus du rayon passe avant « renseigne … »");
  const nonRes = bg.match(/const NON_RESOLUBLES = new Set\(\[[^\]]*\]\);/g) ?? [];
  ok(nonRes.length === 2 && nonRes.every((l) => /"category"/.test(l)), "« category » dans les DEUX listes NON_RESOLUBLES (publication, recréation)");
  ok(/raison: refusCompte\.pro === true \? "rayon_interdit_pro" : "rayon_refuse_au_compte",/.test(bg)
    && bg.indexOf("result.rayonRefuseAuCompte && (job.action ?? \"publish\") === \"publish\"") < bg.indexOf('"parcel_dimensions_height", "parcel_dimensions_width", "parcel_dimensions_length", "category"]);'),
    "background.js : question de RAYON (categoryLevelChoice marquée) avant la liste des champs résolubles");
  ok(M.RAISON_NU_INTERDIT_PRO === "rayon_interdit_pro" && M.RAISON_NU_REFUSE_AU_COMPTE === "rayon_refuse_au_compte", "marques extension ↔ serveur identiques");
  ok(/const motif = result\?\.rayonRefuseAuCompte\s*\n\s*\? motifLisible\(result\?\.error/.test(bg), "recréation : le refus se dit tel quel, jamais « Vinted exige « Catégorie » »");
}

console.log(`vinted-rayon-arbre-vivant : OK (${n} vérifications)`);
