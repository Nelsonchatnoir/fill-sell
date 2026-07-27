// chrome-extension/selectors/leboncoin.registry.js
//
// FICHIER DE DONNÉES PUR — aucune logique, aucun import applicatif.
// Source de vérité : docs/SELECTOR_AUDIT.md (audit du 2026-07-26, HEAD 73ac223), §2.
// Aucun sélecteur inventé — mêmes conventions de maillons que vinted.registry.js.

export const LEBONCOIN_SELECTORS = {
  "status.my_ads_heading": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: "h1" },
      { type: "css", value: "aside a, aside button" },
      { type: "css", value: "a[href]" },
    ],
    source: "leboncoin.js:172, 204, 231",
    note: "localisation de l'annonce dans « Mes annonces » — 3 approches successives ; identité par TITRE obligatoire (règle listing_url croisée)",
  },

  "delete.card_container": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: '[data-qa-id*="ad"], article, li', note: "via closest() depuis l'ancre trouvée" },
      { type: "css", value: "div", note: "via closest(), repli" },
    ],
    source: "leboncoin.js:247",
    note: "remontée à la carte ; vérif post : annonceNommee() sur la carte",
  },

  "delete.card_delete": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: 'a[href*="/suppression"]' },
      { type: "css", value: '[data-qa-id*="delete"], [data-qa-id*="supprimer"]' },
      {
        type: "text",
        scope: "button, a, [role='menuitem']",
        textMatches: null,
        note: "par texte — libellé exact non littéralisé dans l'audit",
      },
    ],
    assert: { visible: true, enabled: true },
    source: "leboncoin.js:483, 486, 487",
    note: "chaîne à 3 maillons DÉJÀ en place en prod (seul vrai exemple du code) ; garde d'identité avant clic",
  },

  "delete.menu_probe": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      { type: "css", value: "button", note: "querySelectorAll(\"button\") + querySelector(\"svg\") interne (texte/icône)" },
      { type: "css", value: "button, a" },
    ],
    source: "leboncoin.js:306-315",
    note: "ouverture du menu d'actions de la carte ; gate DELETE_DRY_RUN",
  },

  "delete.confirm": {
    criticality: "red",
    workflows: ["delete"],
    chain: [
      {
        type: "dynamic",
        construction:
          "bouton trouvé par texte + page de confirmation lue par document.body.textContent (lbc.js:400-446)",
      },
    ],
    source: "leboncoin.js:400-446",
    note: "vérif partielle — garde d'identité 3 cas (page nomme l'annonce / générique / AUTRE annonce ⇒ abandon), puis sleep(3000) + lecture best-effort ; confirmation ultime déléguée au background (§7)",
  },

  "auth.password_guard": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[type="password"]' }],
    source: "leboncoin.js:542 (fillListingForm)",
    note: "sémantique INVERSÉE : présence ⇒ needsUser ; absence = état sain",
  },

  "draft.marker": {
    criticality: "orange",
    workflows: ["draft"],
    chain: [
      { type: "css", value: 'textarea#body, #body, #price_cents, label[for="condition"]', note: "4 formes en union" },
    ],
    source: "leboncoin.js:571 (draftMarker, reprise de brouillon)",
  },

  "publish.title": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: 'input[name="subject"]' }],
    assert: { visible: true, enabled: true },
    source: "leboncoin.js:574, 598",
    note: "aucun fallback (§8) ; vérif post : relecture valeur",
  },

  "publish.criteria_labels": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      {
        type: "css",
        value:
          'label[for="condition"], label[for$="_condition"], label[for$="_brand"], label[for$="_size"], label[for$="_univers"], label[for$="_universe"], label[for$="_material"], label[for$="_type"], label[for="clothing_st"], label[for="baby_age"]',
        note: "union large (fallback interne à l'union)",
      },
    ],
    source: "leboncoin.js:632",
    note: "attente des critères dynamiques",
  },

  "publish.produit_label": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'label[for$="_type"], label[for="baby_clothing_category"]', note: "2 formes" },
    ],
    source: "leboncoin.js:663-666 (PRODUIT_LABEL_SELECTOR)",
    note: "critère « produit » ; vérif post : skipIfPrefilled avec contrôle du match job (f1cb67c)",
  },

  "publish.errors_live": {
    criticality: "green",
    workflows: ["publish"],
    chain: [
      { type: "css", value: '[role="alert"], [aria-live="assertive"], [aria-live="polite"], [class*="error" i]' },
    ],
    source: "leboncoin.js:779",
    note: "relevé des erreurs de validation (lecture seule)",
  },

  "publish.price": {
    criticality: "red",
    workflows: ["publish"],
    chain: [{ type: "css", value: "#price_cents" }],
    assert: { visible: true, enabled: true },
    source: "leboncoin.js:571, 936",
    note: "aucun fallback (§8) ; vérif post : garde pré-submit systémique (2026-07-18)",
  },

  "publish.free_cta": {
    criticality: "red",
    workflows: ["publish"],
    chain: [
      {
        type: "text",
        scope: "button, a[role='button'], a",
        textMatches: "déposer sans booster",
        note: "régex n°1 de findFreeCta",
      },
      {
        type: "text",
        scope: "button, a[role='button'], a",
        textMatches: "continuer sans",
        note: "régex n°2 « continuer sans/… » — cascade complète dans findFreeCta (lbc.js:974-980), libellés élidés dans l'audit",
      },
      {
        type: "text",
        scope: "button, a[role='button'], a",
        textMatches: "déposer mon annonce",
        note: "régex n°3 « déposer mon annonce/… » — idem, libellés élidés dans l'audit",
      },
    ],
    assert: { visible: true, enabled: true },
    source: "leboncoin.js:974-980 (findFreeCta)",
    note: "3 niveaux de texte, pas de fallback structurel ; vérif post : preuveDepot() (cf. publish.success_signal)",
  },

  "publish.success_signal": {
    criticality: "red",
    workflows: ["publish"],
    chain: [
      {
        type: "signal",
        signals: [
          { kind: "url", pattern: "\\/deposer-une-annonce\\/confirmation" },
          {
            kind: "text",
            target: "document.body.textContent",
            pattern:
              "Nous avons bien reçu votre annonce|votre annonce (est|sera) (en ligne|publiée|bientôt en ligne)",
            flags: "i",
          },
        ],
      },
    ],
    source: "leboncoin.js:1060-1068 (preuveDepot)",
    note: "2 signaux — c'est LA vérification (re-clic unique si absente, puis needsUser, jamais « publié » sans preuve)",
  },

  "publish.contact_phone": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'input[type="tel"], input[name*="phone" i], input[id*="phone" i]', note: "3 formes" },
    ],
    source: "leboncoin.js:986",
    note: "détection de l'écran « Vos coordonnées »",
  },

  "publish.wizard_screens": {
    criticality: "green",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "h1, h2, h3, legend" },
      { type: "css", value: "button, a[role='button']" },
      { type: "css", value: "input:not([type=hidden])" },
    ],
    source: "leboncoin.js:1109-1113",
    note: "relevé d'écran inconnu (dump needsUser) — trois collections lues ENSEMBLE, pas des fallbacks",
  },

  "publish.category_combobox": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'input[role="combobox"], button' },
      { type: "css", value: "ul", note: "listes ul ×3" },
      { type: "css", value: "button, a" },
    ],
    source: "leboncoin.js:1140-1175",
    note: "saisie/validation de catégorie — plusieurs relectures ; vérif post : suggestion vérifiée",
  },

  "publish.category_suggestion": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'input[type="radio"]' },
      { type: "css", value: "li, label, div", note: "via closest() depuis le radio" },
    ],
    source: "leboncoin.js:1187-1188 (findSuggestionRadio)",
    note: "vérif post : libellé comparé",
  },

  "publish.criterion_label": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "label[for]", note: "énumération" },
      { type: "dynamic", construction: "getElementById(<for>) — id lu sur l'attribut for du label" },
      { type: "css", value: 'input[role="combobox"]', note: "scopé" },
    ],
    source: "leboncoin.js:1209, 1231-1235, 1282 (enumerateLbcCriteria, findCriterionInput)",
    note: "cascade label → id → combobox ; vérif post : allowed_values du catalogue",
  },

  "publish.criterion_option": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: 'li, [role="option"], button', note: "optionSelector local, 3 formes" },
    ],
    source: "leboncoin.js:1283, 1287",
    note: "choix d'option de critère ; vérif post : match exact-d'abord",
  },

  "publish.univers": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "legend, label, span, p, h2, h3, h4" },
      { type: "css", value: 'input:checked, [aria-checked="true"], [aria-selected="true"]' },
      { type: "css", value: "label", note: "via closest()" },
    ],
    source: "leboncoin.js:1335-1349 (fillUnivers)",
    note: "vérif post : état coché relu",
  },

  "publish.address": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "css", value: "input", note: "querySelectorAll(\"input\") filtrés dans fillAddress" },
    ],
    source: "leboncoin.js:1420 (fillAddress)",
  },

  "publish.listbox_owned": {
    criticality: "orange",
    workflows: ["publish"],
    chain: [
      { type: "dynamic", construction: "getElementById(ownedId) — id lu sur aria-owns" },
      { type: "css", value: '[role="listbox"]' },
      { type: "css", value: '[role="option"], li' },
    ],
    source: "leboncoin.js:1488-1492",
    note: "options de combobox — 2 chemins ; ⚠ filtre offsetParent l.1499 (§9c, interdit fenêtre non rendue)",
  },
};
