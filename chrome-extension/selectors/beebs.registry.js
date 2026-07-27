// chrome-extension/selectors/beebs.registry.js
//
// FICHIER DE DONNÉES PUR — aucune logique, aucun import applicatif.
// Source de vérité : docs/SELECTOR_AUDIT.md (audit du 2026-07-26, HEAD 73ac223), §4.
// Aucun sélecteur inventé — mêmes conventions de maillons que vinted.registry.js.
// Rappel post-migration Tailwind (22-23/07) : les classes __category/__valueButton
// sont MORTES ; les sélecteurs génériques ci-dessous sont l'état prod.
//
// Clés optional: true (A1 — sémantique inversée, d'après les notes déjà
// portées par le registre ; se résolvent par tryResolveSelector) :
//   - auth.password_guard (présence = needsUser, absence = état sain)

export const BEEBS_SELECTORS = {
  "status.my_ads_probe": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: "a, h2, h3, p, span" },
      { type: "template", value: 'a[href*="{slug}"]', params: ["slug"], note: "ancre par slug d'annonce (dynamique)" },
    ],
    source: "beebs.js:169, 175",
    note: "localisation de l'annonce ; vérif post : identité par titre",
  },

  "delete.card_actions": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      {
        type: "text",
        scope: "button",
        textMatches: "Modifier|Dupliquer|Supprimer",
        note: "approximation déclarative (OR) — la source réelle est un ET : /Modifier/ ∧ /Dupliquer/ ∧ /Supprimer/ sur le texte du PARENT (findBeebsCard, beebs.js:322) puis === « Supprimer » strict (findBeebsCardDelete, beebs.js:340) ; casse sensible conforme au code, aucun flag",
      },
    ],
    source: "beebs.js:197, 337",
    note: "carte + bouton Supprimer — voie PAR CARTE, jamais la barre groupée ; pas de fallback structurel (texte seul)",
  },

  "delete.dialog": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: '[role="dialog"], [class*="modal" i]', note: "2 formes" },
    ],
    assert: { textMatches: "supprimer mon annonce", flags: "i" },
    source: "beebs.js:216 (filtre /supprimer mon annonce/i, relevé code 27/07)",
    note: "attente du dialogue — texte « supprimer mon annonce » exigé dans le dialogue",
  },

  "delete.reason_radio": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: 'input[type="radio"]' },
      { type: "template", value: 'label[for="{id}"]', params: ["id"], note: "label du radio (dynamique r.id)" },
    ],
    source: "beebs.js:228-233",
    note: "motif « Vendu via une autre plateforme » OBLIGATOIRE — le défaut pré-coché « Vendu via Beebs » déclarerait une vente chez eux ; vérif post : radio.checked relu après dispatch",
  },

  "delete.confirm": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      {
        type: "text",
        scope: "button",
        textMatches: "^supprimer l['’]annonce$",
        flags: "i",
        note: "source beebs.js:246 : /^supprimer l['’]annonce$/i (classe d'apostrophes ET flag i dans le code) — flags restaurés au code le 27/07",
      },
    ],
    assert: { visible: true, enabled: true },
    source: "beebs.js:244-256",
    note: "AUCUNE vérif dans le content script — sleep(6000) puis succès (suppression asynchrone Beebs) ; verdict durable côté background par l'état de l'annonce (§7)",
  },

  "auth.password_guard": {
    criticality: "red",
    optional: true,
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[type="password"]' }],
    source: "beebs.js:353",
    note: "combiné à location.pathname.startsWith(\"/fr/listing\") ; sémantique INVERSÉE : présence ⇒ needsUser",
  },

  "publish.form_ready": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'button[class*="__selectButton"]' },
      { type: "css", value: 'div[class*="__label"]' },
    ],
    source: "beebs.js:411-417, 655-656",
    note: "deux collections COMPTÉES ensemble (count > 2 exigé), pas des fallbacks — attente des champs dynamiques post-catégorie ; sans elle tous les champs sautaient en silence",
  },

  "publish.field_label": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'div[class*="__label"]' },
      { type: "css", value: 'button[class*="__selectButton"]', note: "frère du label" },
      { type: "css", value: 'span[class*="__optionalAttribute"]', note: "suffixe « (facultatif) »" },
    ],
    source: "beebs.js:897-901, 650-651 (findField, enumerateBeebsFields)",
    note: "vérif post : champs requis non remplis remontés (unfilledRequired)",
  },

  "publish.panel": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'div[class*="__options"]', note: "scopé trigger.parentElement" },
      {
        type: "css",
        value: 'div[class*="__options"]',
        note: "repli GLOBAL ajouté le 26/07 (0893bc4), loggé — unique panneau visible du document (invariant : 0 fermé, 1 ouvert)",
      },
    ],
    source: "beebs.js:1039, 1052, 1487 (panneauxVisibles, panelOf)",
    note: "vérif post : panneau unique exigé pour le repli",
  },

  "publish.panel_option": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "text",
        scope: "button",
        textMatches: "\\S",
        note: "boutons du panneau à texte non vide (seul autre bouton : retour mobile md:hidden sans texte) — générique post-migration Tailwind",
      },
    ],
    source: "beebs.js:1075, 1494 (panelOptions)",
    note: "vérif post : optionLabel (checkbox id/name → 1er span → textContent)",
  },

  "publish.option_label": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'input[type="checkbox"]', note: "id/name = libellé exact" },
      { type: "css", value: "span", note: "1er span" },
      { type: "dynamic", construction: "textContent du bouton (3e lecture ordonnée de optionLabel)" },
    ],
    source: "beebs.js:934-937, 1512 (optionLabel, feuille de catégorie)",
    note: "3 lectures ordonnées",
  },

  "publish.panel_search": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'input[type="text"]', note: "scopé au panneau" },
    ],
    source: "beebs.js:1080 (panelSearchInput)",
    note: "vérif post : relevé des options AVANT frappe (listes complètes seulement)",
  },

  "publish.interstitial": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "css",
        value: '[role="dialog"], [aria-modal="true"], [class*="modal" i]',
        note: "conteneurs extérieurs — hors __options, hors dialogue de suppression",
      },
      {
        type: "css",
        value: '[aria-label*="clo" i], [aria-label*="ferm" i], [class*="close" i]',
        note: "fermeture, étage 1",
      },
      { type: "css", value: "button", note: "fermeture, étage 2 — hors a[href], hors CTA store" },
    ],
    source: "beebs.js:1101-1144 (findBlockingDialogs, dismissInterstitials, 26/07)",
    note: "vérif post : dialogue détaché/invisible exigé après clic",
  },

  "publish.price": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: "#price" }],
    assert: { visible: true, enabled: true },
    source: "beebs.js:612",
    note: "aucun fallback (§8) ; garde prix pré-submit — valeur relue et parsée",
  },

  "publish.submit": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'button[type="submit"]' }],
    assert: { visible: true, enabled: true, tag: "button" },
    source: "beebs.js:622",
    note: "aucun fallback (§8) ; vérif post : waitForBeebsDeposit() — texte « Votre article a bien été ajouté… » ou /listing/success (annonce en MODÉRATION ⇒ listingUrl null assumé, re-capture différée)",
  },

  "publish.address": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[name="address"]' }],
    source: "beebs.js:1542 (fillAddress)",
  },

  "publish.relevance_probe": {
    criticality: "green",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "button", note: "querySelectorAll('button') + tokens" },
    ],
    source: "beebs.js:1608 (relevance)",
    note: "⚠ filtre offsetParent (§9c)",
  },
};
