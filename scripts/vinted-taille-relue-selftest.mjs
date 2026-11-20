// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une taille posée se relit » (20/11/2026 soir, bloc B2 de Nico — romainvintedpro70, 0.6.195)
//   node scripts/vinted-taille-relue-selftest.mjs
//
// LE CAS : republication 7df02d1a (Vinted, étape 'captured', annonce intacte), « Tee-shirt Adidas rose bébé – 3/6
// mois », taille « 3-6 mois / 62 cm ». Pré-vol négatif : « Vinted exige des champs encore vides pour cette catégorie :
// Taille (accepte : … 3-6 mois / 62 cm …) ». La taille est DANS la grille (correspondance prouvée) : la pose n'a pas
// pris, ou la taille a été vidée après coup — et selectTailleVinted annonçait la pose réussie sans relire le champ.
// LA RÈGLE (vinted.js, pour toutes les tailles) : (a) une option déjà choisie ne se re-clique jamais ; (b) le champ est
// relu après la pose — vide → UN nouvel essai, puis échec avec diagnostic ; (c) dernière passe juste avant le pré-vol.
// Serveur (_shared/relance-apres-maj.js) : la tâche arrêtée ainsi repart UNE fois dès que son poste a la 0.6.195.
// Banc : le VRAI vinted.js (fonctions extraites, scripts/lib/vinted-taille-bac.mjs), un faux formulaire qui rejoue
// le déclencheur, aria-checked, la bascule d'une option re-cliquée, les clics perdus et la taille vidée après coup.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { chargerTailleVinted, panneau, extraireFonction } from "./lib/vinted-taille-bac.mjs";
import {
  RELANCES_APRES_MAJ, BUILD_0_6_195, buildLisible, reglesTailleRelueVide, tailleServieRelueVide, regleDeRelance,
  posteALeBuild, champsRelance, messageAttenteMaj,
} from "../supabase/functions/_shared/relance-apres-maj.js";
import { valeurFigureDansListeServie } from "../supabase/functions/_shared/vinted-grille-servie.ts";

const SRC = readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const bac = (document, opts) => chargerTailleVinted(SRC, document, opts);

// Grille bébé / enfant relevée (« accepte : … » du job 7df02d1a, suite de la grille enfant de Vinted).
const BEBE = ["Prématuré, jusqu'à 44cm", "Naissance / 44 cm", "Jusqu'à 1 mois / 50 cm", "1-3 mois / 56 cm", "3-6 mois / 62 cm",
  "6-9 mois / 68 cm", "9-12 mois / 74 cm", "12-18 mois / 80 cm", "18-24 mois / 86 cm", "24-36 mois / 92 cm", "3 ans / 98 cm",
  "4 ans / 104 cm", "5 ans / 110 cm", "6 ans / 116 cm", "8 ans / 128 cm", "10 ans / 140 cm", "12 ans / 152 cm", "13 ans / 158 cm",
  "14 ans / 164 cm", "Taille unique"];
const PANNEAU_BEBE = [{ texte: "", groupe: 4, idDepart: 200, options: BEBE }];
const SML = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "Taille unique"];
const EU = ["EU 42", "EU 44", "EU 46", "EU 48", "EU 50", "Taille unique"];
const COSTUMES = [{ texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML }, { texte: "DE", groupe: 91, idDepart: 2200, options: ["DE 42", "DE 44"] },
  { texte: "EU", groupe: 93, idDepart: 2400, options: EU }];
const JEANS = [{ texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML }, { texte: "W", groupe: 88, idDepart: 1900, options: ["W23 | FR 32", "W30 | FR 40", "W32 | FR 42", "W34 | FR 44"] }];
const TAILLE = "3-6 mois / 62 cm";

// ── [1] La correspondance ne change pas : même option visée, un seul clic, champ relu conforme ──────────────────────
console.log("\n[1] Correspondance inchangée (adulte, EU, W32 L34, âges, bébé « mois / cm ») — un clic, champ relu conforme");
for (const [taille, onglets, attendu, candidats] of [
  ["M", COSTUMES, "M", ["M"]],
  ["EU 42", COSTUMES, "EU 42", ["EU 42", "42"]],
  ["W32 L34", JEANS, "W32 | FR 42", ["W32 L34", "W32", "32"]],
  ["3 ans / 98 cm", PANNEAU_BEBE, "3 ans / 98 cm", ["3 ans / 98 cm"]],
  ["3-6 mois / 62 cm", PANNEAU_BEBE, "3-6 mois / 62 cm", ["3-6 mois / 62 cm"]],
  ["12-18 mois / 80 cm", PANNEAU_BEBE, "12-18 mois / 80 cm", ["12-18 mois / 80 cm"]],
]) {
  const p = panneau(onglets);
  const b = bac(p.document);
  const w = [];
  const pose = await b.selectTailleVinted({ taille }, w);
  ok(`« ${taille} » → « ${attendu} », un seul clic, champ relu « ${attendu} »`,
    pose === true && p.clics.length === 1 && p.clics[0] === attendu && p.champ.value === attendu, `pose=${pose} clics=${JSON.stringify(p.clics)} ${w.join(" | ")}`);
  ok(`   candidats inchangés ${JSON.stringify(candidats)}`, JSON.stringify(b.candidatsTailleVinted(taille)) === JSON.stringify(candidats), JSON.stringify(b.candidatsTailleVinted(taille)));
  ok("   journal : option cliquée, déclencheur trouvé, valeur relue", /essai 1 : option « .+ » cliquée — déclencheur category-size-single-grid-input — champ relu « /.test(b.journal().join("|")), b.journal().join("|"));
}
{
  // Le cas romain : la cascade de l'extension et le juge serveur disent la même chose.
  const racine = { querySelectorAll: () => BEBE.map((t) => ({ textContent: t })) };
  const b = bac(panneau(PANNEAU_BEBE).document);
  const m = b.findOptionCascade(racine, "x", TAILLE, { sizeField: true });
  const juge = valeurFigureDansListeServie({ champDemande: "size", valeurs: { taille: TAILLE }, listeServie: BEBE, libelles: { taille: "Taille", etat: "État" } });
  ok("7df02d1a : findOptionCascade « 3-6 mois / 62 cm » → exact ; juge serveur : offerte", m?.stage === "exact" && m?.label === TAILLE && juge.offerte === true, JSON.stringify({ m: m && { label: m.label, stage: m.stage }, juge }));
}

// ── [2] Une option DÉJÀ choisie ne se re-clique jamais (règle de la couleur, 10/09) ────────────────────────────────
console.log("\n[2] Option déjà choisie → aucun clic (le re-clic la décocherait)");
{
  const p = panneau(PANNEAU_BEBE, { aria: true, bascule: true, preselection: TAILLE });
  const w = [];
  const pose = await bac(p.document).selectTailleVinted({ taille: TAILLE }, w);
  ok("pré-remplie par Vinted (aria-checked) : conservée, AUCUN clic", pose === true && p.clics.length === 0 && p.champ.value === TAILLE, `pose=${pose} clics=${JSON.stringify(p.clics)} champ=${p.champ.value}`);
  ok("   avertissement « déjà choisie (aria) — conservée, aucun re-clic »", w.some((x) => /déjà choisie \(aria\) — conservée, aucun re-clic/.test(String(x))), w.join(" | "));
  // Contre-preuve : sur ce formulaire, un re-clic à l'aveugle (l'ancien geste) vide le champ.
  const q = panneau(PANNEAU_BEBE, { aria: true, bascule: true, preselection: TAILLE });
  q.document.querySelectorAll('[data-testid^="size-group-"]').find((n) => n.textContent === TAILLE).click();
  ok("   contre-preuve : un clic de plus sur l'option choisie la DÉCOCHE (champ vidé)", q.champ.value === "", q.champ.value);
}
{
  const p = panneau(PANNEAU_BEBE, { bascule: true, preselection: TAILLE });
  const pose = await bac(p.document).selectTailleVinted({ taille: TAILLE }, []);
  ok("sans aria, le champ la montre déjà : conservée, aucun clic", pose === true && p.clics.length === 0 && p.champ.value === TAILLE, `clics=${JSON.stringify(p.clics)} champ=${p.champ.value}`);
}
{
  const p = panneau(PANNEAU_BEBE, { aria: true, bascule: true, preselection: TAILLE });
  const pose = await bac(p.document).selectTailleVinted({ taille: TAILLE, taille_ids: [204] }, []);
  ok("par identifiant (id 204 = « 3-6 mois / 62 cm ») : déjà choisie, aucun clic", pose === true && p.clics.length === 0 && p.champ.value === TAILLE, `clics=${JSON.stringify(p.clics)}`);
}
{
  const p = panneau(PANNEAU_BEBE, { aria: true, bascule: true, preselection: "6-9 mois / 68 cm" });
  const pose = await bac(p.document).selectTailleVinted({ taille: TAILLE }, []);
  ok("une AUTRE taille pré-remplie (« 6-9 mois / 68 cm ») : la nôtre est cliquée, une fois", pose === true && p.clics.length === 1 && p.champ.value === TAILLE, `clics=${JSON.stringify(p.clics)} champ=${p.champ.value}`);
}
{
  // Un « coché » que le champ contredit (aria-selected de focus, champ vide) : retenu au 1er essai, plus au 2e.
  const p = panneau(PANNEAU_BEBE);
  p.document.querySelectorAll('[data-testid^="size-group-"]').find((n) => n.textContent === TAILLE).attrs["aria-selected"] = "true";
  const b = bac(p.document);
  const pose = await b.selectTailleVinted({ taille: TAILLE }, []);
  ok("aria « coché » mais champ VIDE : aucun clic au 1er essai, le 2e clique (le champ seul fait foi), posée",
    pose === true && p.clics.length === 1 && p.champ.value === TAILLE && /essai 1 : option « 3-6 mois \/ 62 cm » déjà choisie \(aria\), aucun clic/.test(b.journal()[0] ?? "")
      && /essai 2 : option « 3-6 mois \/ 62 cm » cliquée/.test(b.journal()[1] ?? ""), `${pose} ${JSON.stringify(p.clics)} ${b.journal().join(" | ")}`);
}

// ── [3] Clic non pris → UN nouvel essai, puis échec avec diagnostic ───────────────────────────────────────────────
console.log("\n[3] Clic non pris → un nouvel essai ; toujours rien → échec nommé, diagnostic, jamais « hors grille »");
{
  const p = panneau(PANNEAU_BEBE, { clicsPerdus: 1 });
  const b = bac(p.document);
  const w = [];
  const pose = await b.selectTailleVinted({ taille: TAILLE }, w);
  ok("1er clic perdu : reposée au 2e essai (deux clics), champ relu conforme", pose === true && p.clics.length === 2 && p.champ.value === TAILLE, `pose=${pose} clics=${JSON.stringify(p.clics)}`);
  ok("   avertissement « posée au 2e essai (1er essai : … champ relu VIDE) »", w.some((x) => /posée au 2e essai \(1er essai : essai 1 : .*champ relu VIDE\)/.test(String(x))), w.join(" | "));
  ok("   la relecture attend au plus 3 s par essai (horloge virtuelle)", b.horloge() >= 3000 && b.horloge() < 7000, String(b.horloge()));
}
{
  const p = panneau(PANNEAU_BEBE, { clicsPerdus: 5 });
  const b = bac(p.document);
  const w = [];
  const pose = await b.selectTailleVinted({ taille: TAILLE }, w);
  const diag = b.diag() ?? "";
  ok("clics toujours perdus : échec après DEUX essais, pas un de plus", pose === false && p.clics.length === 2, `pose=${pose} clics=${JSON.stringify(p.clics)}`);
  ok("   saisie non prise notée (deux essais)", b.nonPrise()?.essais?.length === 2 && b.nonPrise()?.taille === TAILLE, JSON.stringify(b.nonPrise()));
  ok("   diagnostic : motif, taille, option visée, déclencheur trouvé, valeur relue, à chaque essai",
    /^taille_non_prise_vinted — taille demandée « 3-6 mois \/ 62 cm » — essai 1 : option « 3-6 mois \/ 62 cm » cliquée — déclencheur category-size-single-grid-input — champ relu VIDE \| essai 2 : /.test(diag), diag);
  ok("   jamais « hors grille » : aucune liste d'options relevée pour ce champ (le verdict hors grille ne se déclenche pas)", !b.optionsRelevees.has("taille"), JSON.stringify([...b.optionsRelevees]));
}
{
  // Déclencheur ABSENT du formulaire (la relecture ne trouve pas le champ) : dit tel quel.
  const p = panneau(PANNEAU_BEBE);
  p.champ.attrs = {};
  const b = bac(p.document);
  const pose = await b.selectTailleVinted({ taille: TAILLE }, []);
  ok("déclencheur introuvable : échec nommé « déclencheur ABSENT »", pose === false && /déclencheur ABSENT — champ relu VIDE/.test(b.diag() ?? ""), b.diag());
}
{
  // Une AUTRE valeur affichée après le clic : jamais un clic de plus à l'aveugle — constaté, non bloquant.
  const p = panneau(PANNEAU_BEBE);
  const b = bac(p.document);
  const opts = p.document.querySelectorAll('[data-testid^="size-group-"]');
  for (const n of opts) { const f = n.onClick; n.onClick = () => { f(); p.champ.value = "6-9 mois / 68 cm"; }; }
  const w = [];
  const pose = await b.selectTailleVinted({ taille: TAILLE }, w);
  ok("champ relu sur une autre valeur : un seul clic (jamais re-cliqué à l'aveugle), constaté",
    pose === false && p.clics.length === 1 && /champ relu « 6-9 mois \/ 68 cm »/.test(b.diag() ?? "") && !b.optionsRelevees.has("taille"), `pose=${pose} clics=${JSON.stringify(p.clics)} ${b.diag()}`);
}
{
  // Hors grille : le verdict d'avant, à l'octet (aucun nouvel essai, la liste relevée pour la question).
  const p = panneau(PANNEAU_BEBE);
  const b = bac(p.document);
  const pose = await b.selectTailleVinted({ taille: "15 et moins" }, []);
  ok("hors grille : aucun clic, aucun 2e essai, options relevées (la question d'avant), rien de « non pris »",
    pose === false && p.clics.length === 0 && (b.optionsRelevees.get("taille") ?? []).length > 0 && b.nonPrise() === null, `${pose} ${JSON.stringify(p.clics)} ${JSON.stringify(b.nonPrise())}`);
}

// ── [4] Taille vidée après coup → la dernière passe la repose, puis les requis sont recalculés ─────────────────────
console.log("\n[4] Champ vidé après coup (suggestion tardive) → dernière passe avant le pré-vol");
const requisDe = (p, { requise = true } = {}) => async () => ({
  discovered: [{ key: "size", label: "Taille", required: requise, inputType: "grid", options: null, source: "dom" }],
  unfilled: requise && !p.champ.value ? ["Taille"] : [],
  hadConfig: true,
});
{
  const p = panneau(PANNEAU_BEBE, { aria: true, bascule: true });
  const b = bac(p.document, { computeVintedRequiredState: requisDe(p) });
  const w = [];
  const fields = { taille: TAILLE };
  ok("pose du début : posée, relue", (await b.selectTailleVinted(fields, w)) === true && p.champ.value === TAILLE);
  p.vider(); // la suggestion d'attributs de Vinted arrive et vide la taille
  const avant = await requisDe(p)();
  ok("   puis vidée : le pré-vol l'aurait trouvée vide (« Taille » parmi les requis vides)", avant.unfilled.includes("Taille"));
  const apres = await b.dernierePasseTailleVinted(fields, w, avant);
  ok("dernière passe : reposée (un clic de plus, pas deux), requis recalculés sans « Taille »",
    p.champ.value === TAILLE && p.clics.length === 2 && Array.isArray(apres?.unfilled) && apres.unfilled.length === 0, `clics=${JSON.stringify(p.clics)} apres=${JSON.stringify(apres)}`);
  ok("   tracée (avertissements « dernière passe »)", w.some((x) => /dernière passe \(pose rejouée une fois\)/.test(String(x))) && w.some((x) => /dernière passe — posée et relue, requis recalculés \(aucun vide\)/.test(String(x))), w.join(" | "));
  ok("   republication par identifiant aussi (taille_ids seuls)", await (async () => {
    const q = panneau(PANNEAU_BEBE);
    const bq = bac(q.document, { computeVintedRequiredState: requisDe(q) });
    const r = await bq.dernierePasseTailleVinted({ taille_ids: [204] }, [], await requisDe(q)());
    return q.champ.value === TAILLE && r?.unfilled?.length === 0;
  })());
}
{
  const p = panneau(PANNEAU_BEBE);
  const b = bac(p.document, { computeVintedRequiredState: requisDe(p) });
  const etat = await requisDe(p)();
  ok("rien à faire sans taille sur la tâche : null, aucun clic", (await b.dernierePasseTailleVinted({}, [], etat)) === null && p.clics.length === 0);
  ok("rien à faire quand la Taille n'est pas requise : null, aucun clic",
    (await b.dernierePasseTailleVinted({ taille: TAILLE }, [], await requisDe(p, { requise: false })())) === null && p.clics.length === 0);
  p.champ.value = "6-9 mois / 68 cm";
  ok("rien à faire quand le champ porte une valeur : null, aucun clic",
    (await b.dernierePasseTailleVinted({ taille: TAILLE }, [], { ...etat, unfilled: ["Taille"] })) === null && p.clics.length === 0);
  p.champ.value = "";
  const q = panneau(PANNEAU_BEBE);
  const bq = bac(q.document, { computeVintedRequiredState: requisDe(q) });
  await bq.selectTailleVinted({ taille: "15 et moins" }, []);
  ok("jamais après un échec « hors grille » (rejouer ne changerait rien)",
    (await bq.dernierePasseTailleVinted({ taille: "15 et moins" }, [], await requisDe(q)())) === null && q.clics.length === 0);
}
{
  // Toujours pas posée : l'état recalculé garde « Taille », et le pré-vol renvoie ce que l'étape taille a vu.
  const p = panneau(PANNEAU_BEBE, { clicsPerdus: 99 });
  const b = bac(p.document, { computeVintedRequiredState: requisDe(p) });
  const w = [];
  const fields = { taille: TAILLE };
  await b.selectTailleVinted(fields, w);
  const apres = await b.dernierePasseTailleVinted(fields, w, await requisDe(p)());
  ok("pose impossible : la dernière passe rejoue UNE fois (deux essais), la Taille reste vide (le pré-vol en décide)",
    p.clics.length === 4 && apres?.unfilled?.includes("Taille"), `clics=${p.clics.length} ${JSON.stringify(apres)}`);
  const d = b.diagnosticTailleVidePrevol(fields, apres) ?? "";
  ok("   diagnostic du pré-vol : motif, déclencheur, champ relu, essais de la pose ET de la dernière passe",
    /^taille_non_prise_vinted — taille de la tâche « 3-6 mois \/ 62 cm » — au pré-vol : déclencheur category-size-single-grid-input, champ relu VIDE — essai 1 : /.test(d)
      && /dernière passe avant le pré-vol/.test(d) && (d.match(/essai \d : option/g) ?? []).length === 4, d);
  ok("   aucun diagnostic de taille quand la Taille n'est pas parmi les vides", b.diagnosticTailleVidePrevol(fields, { ...apres, unfilled: ["État"] }) === null);
}
{
  // Requis illisibles après la repose : l'état d'avant, sans la Taille si le champ la porte maintenant.
  const p = panneau(PANNEAU_BEBE);
  const b = bac(p.document, { computeVintedRequiredState: async () => { throw new Error("config illisible"); } });
  const etat = { discovered: [{ key: "size", label: "Taille", required: true }], unfilled: ["Taille", "État"], hadConfig: true };
  const apres = await b.dernierePasseTailleVinted({ taille: TAILLE }, [], etat);
  ok("requis illisibles après la repose : « Taille » retirée (le champ la porte), « État » gardé", JSON.stringify(apres?.unfilled) === JSON.stringify(["État"]), JSON.stringify(apres));
}

// ── [5] Le déclencheur « bloom » de Vinted (28/10) : la relecture passe par valeurChampVinted ───────────────────────
console.log("\n[5] Menu « bloom » (bouton + span « --value », data-placeholder tant que rien n'est choisi)");
{
  globalThis.CSS ??= { escape: (s) => String(s) };
  const p = panneau(PANNEAU_BEBE, { clicsPerdus: 1 });
  const c = p.champ;
  c.attrs = { id: "_r_8_", "data-testid": "category-size-single-grid_chips-input", class: "select-root" };
  c.tagName = "BUTTON";
  c.classList = { contains: (x) => x === "select-root" };
  c.hasAttribute = (n) => n === "data-placeholder" && !c.value;
  c.querySelector = (sel) => (/--value"\]$/.test(sel) ? { textContent: c.value ? `  ${c.value.replace(/ /g, " ")} ` : "Sélectionne une taille" } : null);
  const b = bac(p.document);
  const pose = await b.selectTailleVinted({ taille: TAILLE }, []);
  ok("bloom : placeholder lu VIDE au 1er essai, valeur du span (espaces insécables) lue conforme au 2e",
    pose === true && p.clics.length === 2 && /champ relu VIDE/.test(b.journal()[0] ?? "") && /déclencheur category-size-single-grid_chips-input/.test(b.journal()[0] ?? ""), `${pose} ${JSON.stringify(p.clics)} ${b.journal().join(" | ")}`);
}

// ── [6] La relecture compare sans jamais confondre deux tailles ────────────────────────────────────────────────────
console.log("\n[6] tailleRelueCorrespond : la même taille écrite autrement, jamais une autre");
{
  const b = bac(panneau(PANNEAU_BEBE).document);
  const egal = (v, o) => b.tailleRelueCorrespond(v, o);
  ok("identiques, espaces insécables et tirets typographiques gommés", egal("3-6 mois / 62 cm", "3-6 mois / 62 cm") && egal("3–6 mois / 62 cm", "3-6 mois / 62 cm"));
  ok("un segment entier de l'autre (« M » ↔ « M / 38 / 10 », « 3-6 mois » ↔ « 3-6 mois / 62 cm »)", egal("M", "M / 38 / 10") && egal("3-6 mois / 62 cm", "3-6 mois"));
  ok("le système d'onglet en plus (« EU 38 » ↔ « 38 »)", egal("38", "EU 38") && egal("EU 42", "42"));
  ok("jamais une autre taille : 6-9 mois, 13 ans, L / 40 / 10, 38,5, vide",
    !egal("6-9 mois / 68 cm", "3-6 mois / 62 cm") && !egal("13 ans / 158 cm", "3 ans / 98 cm") && !egal("L / 40 / 10", "M / 38 / 10")
      && !egal("38,5", "EU 38") && !egal("", "M") && !egal("M", ""));
}

// ── [7] Le câblage dans fillListingForm ────────────────────────────────────────────────────────────────────────────
console.log("\n[7] Câblage : dernière passe avant le pré-vol, diagnostic du pré-vol, B.5 tenue");
{
  const iReq = SRC.indexOf("let requiredState = await computeVintedRequiredState()");
  const iJalon = SRC.indexOf('jalonRemplissage("Requis");', iReq);
  const iPasse = SRC.indexOf("await dernierePasseTailleVinted(fields, warnings, requiredState)", iReq);
  const iMarque = SRC.indexOf("if (marqueParId) {", iReq);
  const iDry = SRC.indexOf("const dryRun = DRY_RUN", iReq);
  const iGate = SRC.indexOf("if (!requiredState.hadConfig) {", iReq);
  ok("dernière passe : après le constat des requis, avant le filtre marque, le DRY_RUN et les gates",
    iReq > 0 && iJalon > iReq && iPasse > iJalon && iPasse < iMarque && iMarque < iDry && iDry < iGate, JSON.stringify({ iReq, iJalon, iPasse, iMarque, iDry, iGate }));
  const blocPasse = SRC.slice(iPasse - 200, iPasse + 400);
  ok("   l'état recalculé remplace l'état d'avant, seulement quand la passe a joué", /if \(apresTaille\) \{\s*requiredState = apresTaille;/.test(blocPasse), blocPasse);
  const iRetour = SRC.indexOf("`Vinted exige des champs encore vides pour cette catégorie : ${requiredState.unfilled.map(labelWithOptions)");
  const retour = SRC.slice(iRetour - 600, iRetour + 400);
  ok("pré-vol : la Taille vide part avec son diagnostic (last_diagnostic)",
    iRetour > 0 && /const diagTaillePrevol = diagnosticTailleVidePrevol\(fields, requiredState\);/.test(retour) && /\.\.\.\(diagTaillePrevol \? \{ diagnostic: diagTaillePrevol \} : \{\}\)/.test(retour), retour);
  const iRecre = SRC.indexOf("if (requiredState.unfilled.length && recreation) {");
  const recre = SRC.slice(iRecre, iRecre + 700);
  ok("recréation (B.5) : on soumet quand même, le diagnostic voyage en avertissement", /RECRÉATION : soumission tentée quand même/.test(recre) && /diagnosticTailleVidePrevol\(fields, requiredState\)/.test(recre) && !/return \{/.test(recre.slice(0, recre.indexOf("} else if"))), recre);
  const iReset = SRC.indexOf("journalTailleVinted = [];");
  const iTaille = SRC.indexOf("const taillePosee = await selectTailleVinted(fields, warnings);");
  ok("le journal de l'étape taille repart de zéro à chaque remplissage, avant la pose", iReset > 0 && iReset < iTaille, JSON.stringify({ iReset, iTaille }));
  const essai = extraireFonction(SRC, "poserTailleVintedUnEssai");
  ok("un essai ne clique jamais une option sans la règle « déjà choisie »",
    !/\b(?:el|cible|match\.el)\.click\(\)/.test(essai) && (essai.match(/cliquerOptionTailleSansBasculer\(/g) ?? []).length === 3, "clic direct trouvé");
  ok("candidatsTailleVinted et findOptionCascade : toujours appelés par l'essai, dans le même ordre",
    essai.indexOf("candidatsTailleVinted(libelle)") > 0 && /waitForOptionCascade\(TAILLE_OPTIONS_SEL, candidat, onglet \? 1500 : 5000, \{ sizeField: true \}\)/.test(essai));
}

// ── [8] Serveur : la tâche arrêtée repart UNE fois dès que son poste a la 0.6.195 ───────────────────────────────────
console.log("\n[8] relance-apres-maj : « Taille (accepte : … ) » relue vide sur une taille servie");
{
  // (20/11/2026 soir) Rempli au commit 053797c (EXTENSION_LAST_COMMIT de la 0.6.195) : les 5 règles sont au balayage ; un repère
  // « À REMPLIR » les laisserait INERTES (absentes du balayage, jamais jouées).
  ok(buildLisible({ buildMin: BUILD_0_6_195 })
      ? `build rempli (« ${BUILD_0_6_195} ») : les 5 règles sont au balayage`
      : `build à remplir (« ${BUILD_0_6_195} ») : règles INERTES — absentes du balayage, jamais jouées`,
    reglesTailleRelueVide().length === 5 && (buildLisible({ buildMin: BUILD_0_6_195 })
      ? RELANCES_APRES_MAJ.filter((r) => /taille_relue_vide/.test(r.cle)).length === 5
      : !RELANCES_APRES_MAJ.some((r) => /taille_relue_vide/.test(r.cle))));
  if (!buildLisible({ buildMin: BUILD_0_6_195 })) console.log("  ⚠   À FAIRE AU BUILD 0.6.195 : remplir BUILD_0_6_195 (EXTENSION_LAST_COMMIT) dans _shared/relance-apres-maj.js");
  const B = "2026-11-20T21:00:00Z"; // un horodatage de build quelconque, pour le banc
  const R = reglesTailleRelueVide(B);
  const BRUT = "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted exige des champs encore vides pour cette catégorie : Taille (accepte : Prématuré, jusqu'à 44cm · Naissance / 44 cm · Jusqu'à 1 mois / 50 cm · 1-3 mois / 56 cm · 3-6 mois / 62 cm · 6-9 mois / 68 cm · 9-12 mois / 74 cm · 12-18 mois / 80 cm). Compléter ces champs dans l'app (copie Vinted), puis relancer la publication. Relevé sur ton annonce — Taille : 3-6 mois / 62 cm. Le choix se fait dans l'app : fiche de l'article, bouton « ✋ Compléter ».";
  const ROMAIN = {
    id: "7df02d1a-daac-4735-975f-8d450b55cd9b", platform: "vinted", action: "republish", status: "needs_user",
    handler_build: "2026-11-19T12:01:34Z+b8a84d3 · v0.6.194", error: BRUT,
    platform_fields: { needs_user_source: "prevol_negatif", republish_step: "captured", republish_snapshot: { taille: TAILLE }, vinted_item_id: "10736584047" },
  };
  const r1 = regleDeRelance(ROMAIN, R);
  ok("7df02d1a (pré-vol négatif, texte « Taille (accepte : … ) ») : règle vinted_taille_relue_vide_republish_prevol_negatif", r1?.cle === "vinted_taille_relue_vide_republish_prevol_negatif" && r1?.version === "0.6.195", JSON.stringify(r1));
  ok("   message d'attente neutre, avant toute suppression", /AVANT toute suppression/.test(messageAttenteMaj(ROMAIN, r1) ?? "") && /repartira toute seule/.test(messageAttenteMaj(ROMAIN, r1) ?? ""));
  ok("   poste en 0.6.194 : pas encore ; poste au build : oui", posteALeBuild(ROMAIN.handler_build, r1) === false && posteALeBuild("2026-11-21T08:00:00Z+abcdef0", r1) === true);
  const pfR = champsRelance(ROMAIN, r1, { maintenant: "2026-11-21T08:05:00Z", extensionBuild: "2026-11-21T08:00:00Z+abcdef0" });
  ok("   relancée une fois : étape et capture gardées, servie seulement à un poste au build", pfR.republish_step === "captured" && pfR.republish_snapshot?.taille === TAILLE && pfR.build_min_requis === B && !pfR.needs_user_source);
  ok("   puis plus jamais", regleDeRelance({ ...ROMAIN, platform_fields: { ...pfR, needs_user_source: "prevol_negatif" } }, R) === null);
  // Reprises épuisées (update-job-status) : l'arrêt tel qu'il est calculé (error null, la question de l'extension) …
  const nufTaille = { platform: "vinted", field_key: "size", field_label: "Taille", input_type: "dropdown", allowed_values: BEBE, target: { root: "vintedAspects", key: "size" } };
  const ARRET = { ...ROMAIN, error: null, platform_fields: { ...ROMAIN.platform_fields, error_technique: { brut: BRUT }, needsUserField: nufTaille, needs_user_source: "grille_incoherente" } };
  const r2 = regleDeRelance(ARRET, R);
  ok("reprises épuisées (update-job-status, liste servie entière) : règle …_republish_grille_incoherente + message d'attente",
    r2?.cle === "vinted_taille_relue_vide_republish_grille_incoherente" && Boolean(messageAttenteMaj(ARRET, r2)), JSON.stringify(r2));
  // … puis tel qu'il est écrit (question retirée, verdict d'update-job-status gardé) : handler-watch le retrouve.
  const ECRIT = { ...ROMAIN, error: messageAttenteMaj(ARRET, r2), platform_fields: { ...ROMAIN.platform_fields, needs_user_source: "grille_incoherente",
    taille_grille_refus: { champs: ["taille"], valeurs: { taille: TAILLE }, valeur_offerte_par_vinted: true, issue: "relance_apres_maj" } } };
  ok("   écrit (question retirée, taille_grille_refus) : retrouvé par le balayage", regleDeRelance(ECRIT, R)?.cle === "vinted_taille_relue_vide_republish_grille_incoherente");
  const QUESTION = { ...ROMAIN, error: "Vinted propose bien Taille « 3-6 mois / 62 cm » …", platform_fields: { ...ROMAIN.platform_fields, needs_user_source: "champ_a_choisir",
    needsUserField: { ...nufTaille, allowed_values: [TAILLE, ...BEBE.filter((x) => x !== TAILLE)], raison: "saisie_non_prise_vinted" } } };
  ok("question « saisie non prise » déjà posée (champ_a_choisir) : relancée aussi", regleDeRelance(QUESTION, R)?.cle === "vinted_taille_relue_vide_republish_champ_a_choisir");
  const PUB = { platform: "vinted", action: "publish", status: "needs_user", error: "Vinted exige des champs encore vides pour cette catégorie : Taille (accepte : XS · S · M · L).",
    platform_fields: { needs_user_source: "champ_a_choisir", taille: "M", needsUserField: { field_key: "size", field_label: "Taille", allowed_values: ["XS", "S", "M", "L", "XL"] } } };
  ok("publication qui porte « M », Taille relue vide : règle …_publish_champ_a_choisir", regleDeRelance(PUB, R)?.cle === "vinted_taille_relue_vide_publish_champ_a_choisir");
  console.log("   — jamais une vraie question, jamais après un retrait, jamais un arrêt écrit par un build qui a le correctif —");
  ok("taille HORS de la liste servie (« 15 et moins ») : jamais", regleDeRelance({ ...ROMAIN, platform_fields: { ...ROMAIN.platform_fields, republish_snapshot: { taille: "15 et moins" } } }, R) === null);
  ok("publication SANS taille : la question est vraie, jamais", regleDeRelance({ ...PUB, platform_fields: { ...PUB.platform_fields, taille: undefined } }, R) === null);
  ok("taille au-delà des 8 options du message, sans liste entière : on ne conclut rien (jamais)", regleDeRelance({ ...ROMAIN, platform_fields: { ...ROMAIN.platform_fields, republish_snapshot: { taille: "3 ans / 98 cm" } } }, R) === null);
  ok("étape 'deleted' : jamais (même avec la marque du message d'attente)",
    regleDeRelance({ ...ROMAIN, platform_fields: { ...ROMAIN.platform_fields, republish_step: "deleted" } }, R) === null
      && R.every((r) => r.predicat({ ...ROMAIN, platform_fields: { ...ROMAIN.platform_fields, republish_step: "deleted", attente_maj_extension: { cle: r.cle } } }) === false)
      && tailleServieRelueVide({ ...ROMAIN, platform_fields: { ...ROMAIN.platform_fields, deleted_at: "2026-11-20T18:00:00Z" } }) === false);
  ok("arrêt écrit par un build qui a déjà le correctif : jamais", regleDeRelance({ ...ROMAIN, handler_build: "2026-11-21T08:00:00Z+abcdef0 · v0.6.195" }, R) === null);
  ok("« État (accepte : … ) » seul : jamais", regleDeRelance({ ...ROMAIN, error: "Vinted exige des champs encore vides pour cette catégorie : État (accepte : Très bon état · Bon état)." }, R) === null);
  ok("Leboncoin, même texte : jamais", regleDeRelance({ ...ROMAIN, platform: "leboncoin" }, R) === null);
  ok("déjà relancée par une autre règle : jamais", regleDeRelance({ ...ROMAIN, platform_fields: { ...ROMAIN.platform_fields, relance_apres_maj: { cle: "autre" } } }, R) === null);
  // Avec la 0.6.195 au balayage, cet arrêt (taille servie relue vide, écrit en 0.6.194) est pris par SA règle — jamais par une
  // règle d'avant (« menus bloom »).
  { const r0 = regleDeRelance(ARRET);
    ok("les règles d'avant ne bougent pas (le même arrêt écrit en 0.6.194 n'est pas « menus bloom »)", r0 === null || /taille_relue_vide/.test(String(r0.cle ?? ""))); }
}

console.log(ko ? `\n[selftest:vinted-taille-relue] ÉCHEC — ${ko} vérification(s) en défaut.` : "\n[selftest:vinted-taille-relue] OK");
process.exit(ko ? 1 : 0);
