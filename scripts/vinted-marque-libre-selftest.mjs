// La marque Vinted se pose TELLE QUELLE (03/10, règle de Nico) : la ligne
// EXACTE du catalogue, sinon « Utiliser "X" comme marque » quand Vinted la
// propose — et quand Vinted ne connaît pas la marque et n'offre que « Sans
// marque » (relevé réel du 03/10 sur vinted.fr), une QUESTION. Jamais une
// marque approchante, jamais « Sans marque » à la place d'une vraie marque.
// Banc : la vraie fonction attendreChoixMarque (extraite de vinted.js), sur un
// faux panneau Marque.
// (26/10, point 4 — Nico : « créer la marque au lieu de bloquer ») L'attente
// dure 30 s, se réveille sur le DOM et suit une horloge simulée ici ; elle ne
// conclut plus « inconnue » au bout de 3 s de « Sans marque » seule ; la
// chaîne du 24/10 ne demande plus un #brand vide ; la question dit « Vinted
// n'a pas proposé de créer « X » sur ce formulaire ». Le banc du pré-rempli :
// scripts/vinted-marque-preremplie-selftest.mjs.
import fs from "node:fs";
import assert from "node:assert/strict";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const src = fs.readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8");

// ── 1. Le code : plus de repli « Sans marque », relecture de LA marque ──────
const corps = extraireFonctionJs(src, "selectVintedBrand");
assert.doesNotMatch(corps, /brand_fallback_no_brand/, "plus aucun repli « Sans marque » pour une vraie marque");
const iSans = corps.indexOf("if (SANS_MARQUE_RE.test(marque))");
const iFinSans = corps.indexOf("const demandee =");
assert.ok(iSans > 0 && iFinSans > iSans, "« Sans marque » demandé garde son chemin natif");
// (24/10, lot « zéro blocage », A3 — Nico) « Une marque introuvable ne bloque jamais : marque la plus proche prouvée, ou
// « Sans marque » quand la catégorie l'accepte. Jamais une marque inventée. » Remplace la règle du 03/10 ci-dessus :
// « Sans marque » n'est posé qu'en DERNIER recours — aucune ligne cliquée, #brand vide, ni identifiant prouvé, ni
// écriture équivalente unique —, jamais par-dessus une marque déjà sur la page.
{
  const apres = corps.slice(iFinSans);
  // (26/10) La chaîne ne demande plus un #brand vide : un pré-remplissage faux de Vinted ne la coupe plus.
  const iChaine = apres.indexOf('if (!choix?.el && (choix?.type === "inconnue" || choix?.type === "aucune" || idDeLAnnonce)) {');
  const iSansMarque = apres.indexOf("await selectVintedNoBrand(trigger);");
  assert.ok(iChaine > 0 && iSansMarque > iChaine && (apres.match(/selectVintedNoBrand\(/g) ?? []).length === 1,
    "« Sans marque » pour une vraie marque : un seul appel, au bout de la chaîne de repli (24/10)");
  assert.doesNotMatch(apres, /surLaPage/, "(26/10) plus aucune condition « #brand vide » sur la chaîne de repli");
  const chaine = apres.slice(iChaine, iSansMarque);
  // L'envoi par identifiant, lui, exige toujours un #brand vide (la sonde n'écrit jamais par-dessus la page).
  assert.ok(chaine.includes("if (idDeLAnnonce && injectionProuvee && !lireBrand()) {") && chaine.includes("if (memes.length === 1) {"),
    "avant « Sans marque » : l'identifiant prouvé (champ vide), puis la même marque sous une autre écriture (unique)");
  // (26/10) 1. #brand porte déjà LA marque → fait, avant même d'ouvrir le menu.
  const iDeja = apres.indexOf("if (estLaMarque(prerempli)) {");
  assert.ok(iDeja > 0 && iDeja < apres.indexOf("await openDropdown(trigger);"), "(26/10) marque déjà posée par Vinted : rien n'est ouvert, rien n'est demandé");
}
assert.ok(corps.includes("texteComparable(posee) === texteComparable(demandee)"), "la relecture compare #brand à LA marque demandée");
assert.ok(corps.includes("if (choix?.el) {"), "on ne clique que sur une ligne trouvée");
assert.match(corps, /needsUser: true,[\s\S]{0,400}Vinted n'a pas proposé de créer « \$\{demandee\} » sur ce formulaire/, "(26/10) une question au texte vrai, pas un choix");
assert.doesNotMatch(src, /ne permet plus/, "(26/10) la phrase fausse du 03/10 a disparu de vinted.js");
assert.ok(corps.includes(`allowed_values: proposees, target: { key: "marque" }`), "la réponse s'écrit dans la marque de la copie");
assert.match(src, /const questionMarque = await selectVintedBrand\(fields\.marque, warnings, \{\s*marqueId: fields\.marque_id,\s*marqueCapturee: fields\.marque_capturee \?\? null,\s*\/\/[^\n]*\n\s*injectionProuvee: fields\.marque_injection_prouvee === true,\s*\}\);\s*if \(questionMarque\?\.poseeParId\) marqueParId = [^\n]+\n\s*if \(questionMarque\?\.needsUser\)/, "la question remonte jusqu'au résultat du dépôt (et l'id de la marque d'origine voyage, 06/10 ; la marque capturée et la pose par identifiant, 17/10)");
assert.doesNotMatch(corps, /nearest|approch|includes\(cible\)|startsWith\(cible\)/i, "aucun rapprochement");

// ── 2. Le comportement : la vraie fonction sur un faux panneau ─────────────
const texteComparable = new Function(`${extraireFonctionJs(src, "texteComparable")}; return texteComparable;`)();
// (26/10) L'attente se réveille sur le DOM (attendreMutationOu) et lit l'horloge : ici une horloge simulée
// (Date.now) qui avance de ce que l'attente demande — 30 s se jouent en quelques millisecondes.
const fabriquer = new Function("document", "sel", "attendreMutationOu", "texteComparable", "Date",
  `${extraireFonctionJs(src, "attendreChoixMarque")}; return attendreChoixMarque;`);
function panneau(lignes, libre = null, { sansMarque = false } = {}) {
  const els = lignes.map(([id, label]) => ({ id, getAttribute: (a) => (a === "aria-label" ? label : null), textContent: label }));
  const document = {
    querySelectorAll: () => els,
    querySelector: (q) => (q === "#empty-brand" && sansMarque ? { id: "empty-brand" } : null),
  };
  const elLibre = libre ? { id: "custom-select-brand", textContent: libre } : null;
  const sel = async () => ({
    resolveSelector: () => { if (!elLibre) { const e = new Error("absent"); e.name = "SelectorResolutionError"; throw e; } return { el: elLibre }; },
  });
  return { document, sel };
}
let dureeSimulee = 0;
async function choisir(marque, lignes, libre, timeout = 400, options = {}) {
  const p = panneau(lignes, libre, options);
  const horloge = { t: 0 };
  const attendre = async (ms) => { horloge.t += ms; };
  const r = await fabriquer(p.document, p.sel, attendre, texteComparable, { now: () => horloge.t })(marque, timeout, options.marqueId ?? null);
  dureeSimulee = horloge.t;
  return r;
}

// a) La marque du catalogue : la ligne exacte, même aux accents/apostrophes près.
let r = await choisir("Bonobo", [["brand-1", "Bonobo Jeans"], ["brand-2", "Bonobo"], ["suggested-brand-3", "Bonobos"]], null);
assert.equal(r?.type, "catalogue"); assert.equal(r.el.id, "brand-2", "« Bonobo », pas « Bonobo Jeans » ni « Bonobos »");
r = await choisir("Levi's", [["brand-9", "Levi’s"]], null);
assert.equal(r?.el?.id, "brand-9", "apostrophe typographique = même marque");
r = await choisir("Gerard Darel", [["suggested-brand-4", "Gérard Darel"]], null);
assert.equal(r?.el?.id, "suggested-brand-4", "accents = même marque");

// b) Une marque absente que Vinted propose de créer : la ligne qui la NOMME.
r = await choisir("Zorglub Atelier", [["brand-5", "Zorglub"], ["brand-6", "Atelier"]], "Utiliser « Zorglub Atelier » comme marque", 3000);
assert.equal(r?.type, "libre", "création de LA marque tapée");
r = await choisir("Zorglub Atelier", [["brand-5", "Zorglub"]], "Utiliser « Zorglub » comme marque", 400);
assert.equal(r?.el, undefined, "une ligne de création qui nomme une AUTRE marque n'est jamais cliquée");
assert.equal(r?.type, "aucune");
r = await choisir("Nike", [["brand-7", "Nike ACG"], ["brand-8", "Nikes"]], null, 400);
assert.equal(r?.el, undefined, "« Nike ACG » n'est pas « Nike » : rien n'est cliqué");
assert.deepEqual(r?.suggestions, ["Nike ACG", "Nikes"], "les marques proposées par Vinted remontent dans la question");

// c) Seule la ligne « Sans marque » (#empty-brand, le relevé du 03/10) : « inconnue », sans clic.
//    (26/10) Plus au bout de 3 s : une recherche lente (onglet caché) passait ainsi pour une marque que
//    Vinted refuse de créer. On attend la ligne de création jusqu'à l'échéance.
{
  const v = await choisir("Zorglubia", [], null, 8000, { sansMarque: true });
  assert.equal(v?.type, "inconnue", "seule « Sans marque » proposée jusqu'au bout → « inconnue »");
  assert.equal(v?.el, undefined, "« Sans marque » n'est JAMAIS cliqué à la place de la marque demandée");
  assert.ok(dureeSimulee >= 8000, `(26/10) attendu jusqu'à l'échéance (8 s simulées), jamais conclu à 3 s — ${dureeSimulee} ms`);
}

// d) (06/10, Ciddjy « Kiabi », Carla « Burano ») Republication : l'id de la
//    marque de l'annonce d'origine est connu (brand_id de la capture).
r = await choisir("Kiabi", [["suggested-brand-60", "Kiabi"], ["brand-61", "Urban Kiabi"]], null, 400, { marqueId: 60 });
assert.equal(r?.el?.id, "suggested-brand-60", "la ligne de la marque d'origine, par son id");
r = await choisir("Kiabi", [["brand-61", "Urban Kiabi"], ["brand-60", "KIABI "]], null, 400, { marqueId: 60 });
assert.equal(r?.el?.id, "brand-60", "par l'id, même si le libellé affiché diffère");
r = await choisir("Kiabi", [["brand-61", "Urban Kiabi"]], null, 400, { marqueId: 60 });
assert.equal(r?.el, undefined, "l'id absent de la liste : jamais une autre marque");
{
  const v = await choisir("Kiabi", [], null, 400, { marqueId: 60, sansMarque: true });
  assert.equal(v?.type, "aucune", "marque d'origine connue : jamais « inconnue » sur une liste encore vide (poste lent)");
}
r = await choisir("Bonobo", [["brand-2", "Bonobo"]], null, 400, { marqueId: null });
assert.equal(r?.el?.id, "brand-2", "sans id (publication) : la ligne exacte, comme avant");

console.log("✓ Vinted : la marque posée est la marque demandée — catalogue exact (ou l'id de la marque d'origine), sinon marque libre, sinon une question ; jamais une autre");
