# SELECTOR_AUDIT.md — Inventaire exhaustif des sélecteurs et APIs internes de l'extension

> **Audit en lecture seule du 2026-07-26** (HEAD `73ac223`). Aucun fichier applicatif modifié,
> aucune correction proposée ici — ce document alimente la construction du registre
> (`OBSERVATORY.md`, ADR-03, prompt 1.2).
>
> **Méthode :** extraction programmatique de tous les appels `querySelector(All)` /
> `closest` / `matches` / `getElementById` avec fichier:ligne + fonction englobante,
> puis lecture des flux (publish/delete/status) pour la criticité, les fallbacks et
> les vérifications post-résolution. Aucun sélecteur inventé : tout littéral cité
> vient du code ; les sélecteurs construits dynamiquement sont notés avec leur mode
> de construction.
>
> **Convention de clés :** `<domaine>.<action>` en dot.case — `publish.submit`,
> `delete.confirm`, `status.item_state`. Les clés proposées ici sont des propositions
> de nommage pour le registre, pas des identifiants existants dans le code.

## Ampleur — appels de sélection DOM par fichier

| Fichier | Appels sélecteur | Usages layout-dépendants ⚠ | APIs |
|---|---:|---:|---|
| `content-scripts/vinted.js` | 30 | 4 | 3 endpoints internes Vinted + sonde réseau |
| `content-scripts/leboncoin.js` | 49 | 2 | 0 |
| `content-scripts/ebay.js` | 57 | 7 | 0 |
| `content-scripts/beebs.js` | 38 | 2 | 0 |
| `content-scripts/fillsell-auth.js` | 0 | 0 | 0 (pont de session, aucun DOM plateforme) |
| `background.js` | 15 (via `executeScript` sur les pages plateformes) | 2 (diagnostic pur) | Supabase + fetch de pages plateformes |
| `config.js` | 0 | 0 | URLs Supabase |
| `popup.js` | 13 (DOM **interne** du popup — hors registre) | 0 | 1 (get-pending-jobs) |
| **Total** | **202** | **17** | |

Les 13 sélecteurs de `popup.js` ciblent le HTML de l'extension elle-même
(`getElementById("cta")`…) : ils ne dépendent d'aucune plateforme et n'ont pas leur
place dans le registre. Ils ne sont pas détaillés plus bas.

---

## 1. Vinted (`content-scripts/vinted.js`)

| clé_proposée | sélecteur | fichier:ligne | fonction | workflow | criticité | fallback | vérif_post |
|---|---|---|---|---|---|---|---|
| `publish.field_input` | **dynamique** — `vintedFieldSelector(code)` : map spéciale `'#brand, [data-testid="brand-select-dropdown-input"]'` / `model` / `color` / `condition` / `size` / `material`, sinon motif générique `category-<code>-…` (ex. réel l.614 : `'#sim_lock, [data-testid="category-sim_lock-single-list-input"]'`) | vinted.js:52-68, 94, 100, 614, 679 | `vintedFieldSelector`, boucle de remplissage | publish | orange | oui — chaque entrée est déjà une paire `#id, [data-testid=…]` | oui — relecture de la valeur après pose (patterns de commit fiber) |
| `publish.photo_input` | `input[data-testid="add-photos-input"]` | vinted.js:1994 | `uploadPhotos` | publish | red | non | **non — sleep(1500×n) seul** (cf. §7) |
| `publish.dropdown_panel` | `.input-dropdown__content` (`DROPDOWN_PANEL_SELECTOR`) | vinted.js:143, 1620, 1634 | `closeAnyOpenDropdown` | publish | orange | non | oui — relecture d'absence du panneau |
| `publish.catalog_option` | `li.web_ui__Item__item [role="button"][id^="catalog-"]` (`CATALOG_OPTION_SELECTOR`) | vinted.js:1828, 1831 | `visibleCatalogLabels`, cascade catégorie | publish | orange | non | oui — match exact-d'abord (`findOptionByText`), chevron testé (`.web_ui__Cell__with-chevron`, l.1848-1850) |
| `publish.option_item` | passé en paramètre `optionSelector` aux résolveurs génériques | vinted.js:1470, 1537, 1590, 1694, 1805 | `findOptionByText`, `findOptionCascade`, `waitForOptionCascade`, `findVintedModelOption` | publish | orange | oui — cascade exact → normalisé → includes | oui — normalisation espaces insécables (U+00A0) |
| `publish.model_option` | `closest('[role="button"], [data-testid^="model-"]:not([data-testid$="--title"])')` | vinted.js:1717 | `clickModelOption` | publish | orange | oui (2 formes dans le closest) | non |
| `publish.done_button` | boutons par texte exact « Fait » sur `button, [role="button"]` | vinted.js:1436, 1449, 1622 | `findButtonByExactText` | publish | orange | non | non |
| `publish.package_type` | **dynamique** — `` `[data-testid="package_type_selector_${n}--input"]` `` (n = 1..3) | vinted.js:1955 | choix format colis | publish | orange | non | non |
| `publish.submit` | `[data-testid="upload-form-save-button"]` | vinted.js:823 | fin de `fillListingForm` | publish | **red** | **non** | **oui — `waitForPublishOutcome()`** : redirection `/items/<id>` OU sonde réseau (l.903-946) |
| `publish.success_signal` | `location.pathname` match `^\/items\/(\d+)` + captures de la sonde réseau (POST de dépôt, status + `errors[{field,value}]`) | vinted.js:903-946, 126-176 | `waitForPublishOutcome`, `readProbeSuccess`, `readServerValidationErrors` | publish | **red** | oui — 2 signaux indépendants (URL, réseau) | n/a (c'est LA vérification) |
| `publish.post_publish_modal` | `'[role="dialog"], .web_ui__Dialog__content'` puis bouton `'[data-testid*="close"], button[aria-label*="Fermer" i], button[aria-label*="Close" i]'`, repli tous `button` | vinted.js:970-974 | `closePostPublishModal` | publish | orange | oui — 3 étages | oui — relecture de disparition |
| `publish.field_dialog_headers` | `h2, h3, [role='dialog']` | vinted.js:831 | `labelWithOptions` | publish | green | — | — |
| `auth.password_guard` | `input[type="password"]` | vinted.js:451 | `fillListingForm` (garde de session) | publish | red | non | n/a — présence ⇒ `needsUser` |
| `delete.csrf_token` | `script:not([src])` (scan des scripts inline) puis `meta[name="csrf-token"], meta[name="csrf_token"]` | vinted.js:247, 251 | `extractVintedCsrfToken` | delete | **red** | oui — 2 sources | oui — absence de jeton ⇒ AUCUN envoi (l.337-352) |
| `delete.card_button` | `button, a, [role='button'], [role='menuitem']` filtrés par texte | vinted.js:408 | `findDeleteByText` | delete | red | non (texte seul) | oui — DELETE_DRY_RUN gate |
| `status.price_input` | `#price, [data-testid="price-input--input"]` | background.js:2867, 2925 | `readVintedPriceState`, `commitVintedPrice` (executeScript) | publish (garde prix pré-submit) | red | oui — paire id/testid | oui — relecture du state React après commit |

**Utilitaires génériques** (reçoivent le sélecteur en paramètre, pas de littéral propre) :
`waitForElement` (1127, 1131), `waitForStableElement` (1158), `isGone` (1172 — ⚠ `offsetParent`, cf. §9c).

---

## 2. Leboncoin (`content-scripts/leboncoin.js`)

| clé_proposée | sélecteur | fichier:ligne | fonction | workflow | criticité | fallback | vérif_post |
|---|---|---|---|---|---|---|---|
| `status.my_ads_heading` | `h1` ; `aside a, aside button` ; `a[href]` | lbc.js:172, 204, 231 | localisation de l'annonce dans « Mes annonces » | delete | red | oui — 3 approches successives | oui — identité par TITRE obligatoire (règle listing_url croisée) |
| `delete.card_container` | `closest('[data-qa-id*="ad"], article, li')` puis `closest("div")` | lbc.js:247 | remontée à la carte | delete | red | oui — 2 étages | oui — `annonceNommee()` sur la carte |
| `delete.card_delete` | `a[href*="/suppression"]` → `'[data-qa-id*="delete"], [data-qa-id*="supprimer"]'` → `button, a, [role='menuitem']` par texte | lbc.js:483, 486, 487 | boucle de recherche du contrôle Supprimer | delete | **red** | **oui — chaîne à 3 maillons déjà en place** (le seul vrai exemple du code) | oui — garde d'identité avant clic |
| `delete.menu_probe` | `querySelectorAll("button")` + `querySelector("svg")` ; `button, a` | lbc.js:306-315 | ouverture du menu d'actions de la carte | delete | red | oui (texte/icône) | DELETE_DRY_RUN gate |
| `delete.confirm` | bouton par texte + page de confirmation lue par `document.body.textContent` | lbc.js:400-446 | validation finale | delete | **red** | — | **partielle** — garde d'identité 3 cas (page nomme l'annonce / générique / AUTRE annonce ⇒ abandon), puis `sleep(3000)` + lecture best-effort, **confirmation ultime déléguée au background** (cf. §7) |
| `auth.password_guard` | `input[type="password"]` | lbc.js:542 | `fillListingForm` | publish | red | non | n/a — `needsUser` |
| `draft.marker` | `'textarea#body, #body, #price_cents, label[for="condition"]'` | lbc.js:571 | `draftMarker` (reprise de brouillon) | draft | orange | oui — 4 formes | — |
| `publish.title` | `input[name="subject"]` | lbc.js:574, 598 | remplissage titre | publish | red | non | oui — relecture valeur |
| `publish.criteria_labels` | `'label[for="condition"], label[for$="_condition"], label[for$="_brand"], label[for$="_size"], label[for$="_univers"], label[for$="_universe"], label[for$="_material"], label[for$="_type"], label[for="clothing_st"], label[for="baby_age"]'` | lbc.js:632 | attente des critères dynamiques | publish | orange | oui — union large | — |
| `publish.produit_label` | `'label[for$="_type"], label[for="baby_clothing_category"]'` (`PRODUIT_LABEL_SELECTOR`) | lbc.js:663-666 | critère « produit » | publish | orange | oui (2 formes) | oui — `skipIfPrefilled` avec contrôle du match job (f1cb67c) |
| `publish.errors_live` | `'[role="alert"], [aria-live="assertive"], [aria-live="polite"], [class*="error" i]'` | lbc.js:779 | relevé des erreurs de validation | publish | green (lecture) | — | — |
| `publish.price` | `#price_cents` | lbc.js:571, 936 | prix | publish | red | non | oui — garde pré-submit systémique (2026-07-18) |
| `publish.free_cta` | `button, a[role='button'], a` filtrés par 3 régex en cascade (« déposer sans booster » → « continuer sans/… » → « déposer mon annonce/… ») | lbc.js:974-980 | `findFreeCta` | publish | **red** | oui — 3 niveaux de texte | **oui — `preuveDepot()`** (cf. `publish.success_signal`) |
| `publish.success_signal` | `location.pathname` match `/deposer-une-annonce/confirmation` OU `body.textContent` match `/Nous avons bien reçu votre annonce\|votre annonce (est\|sera) (en ligne\|publiée\|bientôt en ligne)/i` | lbc.js:1060-1068 | `preuveDepot` | publish | **red** | oui — 2 signaux | n/a — c'est LA vérification (re-clic unique si absente, puis `needsUser`, jamais « publié » sans preuve) |
| `publish.contact_phone` | `'input[type="tel"], input[name*="phone" i], input[id*="phone" i]'` | lbc.js:986 | détection écran « Vos coordonnées » | publish | orange | oui (3 formes) | — |
| `publish.wizard_screens` | `h1, h2, h3, legend` ; `button, a[role='button']` ; `input:not([type=hidden])` | lbc.js:1109-1113 | relevé d'écran inconnu (dump `needsUser`) | publish | green (diagnostic) | — | — |
| `publish.category_combobox` | `'input[role="combobox"], button'` ; listes `ul` ×3 ; `button, a` | lbc.js:1140-1175 | saisie/validation de catégorie | publish | orange | oui — plusieurs relectures | oui — suggestion vérifiée |
| `publish.category_suggestion` | `input[type="radio"]` + `closest("li, label, div")` | lbc.js:1187-1188 | `findSuggestionRadio` | publish | orange | oui | oui — libellé comparé |
| `publish.criterion_label` | `label[for]` (énumération) ; `getElementById(<for>)` ; `input[role="combobox"]` scopé | lbc.js:1209, 1231-1235, 1282 | `enumerateLbcCriteria`, `findCriterionInput` | publish | orange | oui — label→id→combobox | oui — `allowed_values` du catalogue |
| `publish.criterion_option` | `'li, [role="option"], button'` (`optionSelector` local) | lbc.js:1283, 1287 | choix d'option de critère | publish | orange | oui — 3 formes | oui — match exact-d'abord |
| `publish.univers` | `legend, label, span, p, h2, h3, h4` + `'input:checked, [aria-checked="true"], [aria-selected="true"]'` + `closest("label")` | lbc.js:1335-1349 | `fillUnivers` | publish | orange | oui | oui — état coché relu |
| `publish.address` | `querySelectorAll("input")` filtrés | lbc.js:1420 | `fillAddress` | publish | orange | non | — |
| `publish.listbox_owned` | `getElementById(ownedId)` (aria-owns) puis `[role="listbox"]` / `'[role="option"], li'` | lbc.js:1488-1492 | options de combobox | publish | orange | oui — 2 chemins | ⚠ filtre `offsetParent` (l.1499, §9c) |

**Utilitaires génériques :** `waitForElement` (1751, 1754), `findButtonByExactText` (1848), `findOptionCascade` (1880).

---

## 3. eBay (`content-scripts/ebay.js` + confirmations dans `background.js`)

| clé_proposée | sélecteur | fichier:ligne | fonction | workflow | criticité | fallback | vérif_post |
|---|---|---|---|---|---|---|---|
| `delete.listing_row` | `` `a[href*="${itemId}"]` `` (dynamique itemId) ; `querySelectorAll("a")` ; `closest("tr")` puis `closest('[class*="grid-row"], [class*="listing-row"], li')` | ebay.js:135-148 | localisation de la ligne au Hub vendeur | delete | red | oui — ancre id → parcours ancres → 2 formes de ligne | oui — garde `ebayIdAlreadyKnown` (id 9+ chiffres ≠ preuve, 5d9d308) |
| `delete.row_menu` | `querySelectorAll("button")` puis `button.fake-menu__item` ; `"button.fake-menu__item, [role='menuitem'], button"` | ebay.js:154, 172, 302 | menu d'actions / `findEbayEnd` | delete | red | oui — 3 formes | oui — texte « Mettre fin » exigé |
| `delete.dialog` | `'[role="dialog"], [class*="dialog"], [class*="modal"]'` | ebay.js:193 | attente du dialogue de fin d'annonce | delete | **red** | oui — 3 formes | **oui — le dialogue doit NOMMER l'annonce du job, sinon abandon + `closeDialog()`** (l.225-228) |
| `delete.confirm` | boutons du dialogue par texte exact « Mettre fin à l'annonce » | ebay.js:231-241 | confirmation | **red** | red | non (texte seul) | **non dans le content script** — `sleep(4000)` puis délégation explicite au background (cf. §7) |
| `delete.dialog_close` | `querySelectorAll("button")` par texte Annuler/Fermer | ebay.js:209 | `closeDialog` (abandon propre) | delete | orange | non | oui — état loggé si introuvable |
| `nav.sell_entry` | `querySelectorAll("a")` par texte (« Vendre ») depuis la home | ebay.js:311 | `goToSellFromHome` | publish | orange | non | oui — URL du formulaire attendue ensuite |
| `auth.password_guard` | `input[type="password"]` | ebay.js:308, 364 | gardes de session | publish | red | non | n/a — `needsUser` |
| `publish.form_title` | `input[name="title"]` | ebay.js:424, 465 | formulaire atteint + remplissage | publish | **red** | **non** | oui — échec explicite si absent (categoryId refusé) |
| `publish.category_check` | `document.querySelector("main")` + `innerText` ⚠ | ebay.js:449 | vérif feuille de catégorie affichée | publish | green (warning) | — | ⚠ `innerText` (§9c) |
| `publish.specific_label` | `button[id*="item-specific-dropdown-label"]` (`SPECIFIC_LABEL_BTN`) | ebay.js:490, 917, 952, 957 | `findSpecificLabelButton` | publish | orange | non | oui — croiser PLUSIEURS labels ⇒ hors de la ligne (garde documentée l.948-950) |
| `publish.specific_value` | `button.se-expand-button__button, button.fake-menu-button__button` (`SPECIFIC_VALUE_BTN`) | ebay.js:946, 958 | bouton-valeur de la ligne | publish | orange | oui — 2 formes | oui — `readAspectDisplayValue` |
| `publish.specific_row` | `closest('[class*="summary__attributes--field"], li, .se-field, .field, div')` | ebay.js:970, 999, 1028, 1132 | remontée à la ligne d'aspect | publish | orange | oui — 5 formes | oui — dump systématique de la ligne en échec (85979e2) |
| `publish.specific_display` | `'[class*="summary__attributes--value"] [class*="textual-display"]'` + exclusion `closest('.fake-menu-button__menu, [class*="list-menu"], .menu__items, [class*="tooltip"], [class*="overlay"]')` + pilule `button[class*="summary__attributes--pill-active"]` | ebay.js:1014-1029 | `readAspectDisplayValue` — **fix a9cc6a2 : ne JAMAIS lire une option de menu fermé comme valeur** | publish | orange | oui — 3 lectures ordonnées | n/a — c'est la lecture de vérité |
| `publish.specific_menu` | `.se-filter-menu-button__menu-container` (`SPECIFICS_MENU_SELECTOR`) + repli `.fake-menu-button__menu` | ebay.js:49, 811, 1297-1299, 1364 | `visibleMenu` | publish | orange | oui — scoped `closest(".se-filter-menu-button")` puis global | ⚠ `offsetParent` (§9c) |
| `publish.specific_option` | `'[role="menuitemradio"], [role="menuitemcheckbox"], .menu__item'` | ebay.js:1341, 1350-1355, 1704 | options de menu | publish | orange | oui — 3 formes + cascade | oui — relecture display après pose |
| `publish.specific_textbox` | `"input.textbox__control, input[type='text']"` | ebay.js:1319 | saisie libre d'aspect | publish | orange | oui — 2 formes | oui — relecture 8 s (throttling onglet caché) |
| `publish.specific_toggle` | `"button.se-toggle-button-group__toggle-button, .toggle-button"` ; `button.fake-link` | ebay.js:1259, 1132, 1245 | affichages alternatifs (fake-link aria-expanded piégeux) | publish | orange | oui | oui |
| `publish.condition_value` | `#summary-condition-field-value` | ebay.js:570 | état pré-rempli par l'URL | publish | orange | non | oui — comparé au job |
| `publish.price` | `input[name="price"]` | ebay.js:584, 765 | prix | publish | red | non | oui — garde pré-submit + `offsetParent` ⚠ (l.585) |
| `publish.buy_it_now` | `button[aria-haspopup="listbox"]` + `[role="option"]` par texte « Achat immédiat » | ebay.js:1380, 1390 | `ensureAchatImmediat` | publish | orange | non | ⚠ `offsetParent` (l.1391) |
| `publish.description` | `'iframe#se-rte-frame__summary, iframe[title="Description"]'` → `[contenteditable="true"]` → oracle `textarea[name="description"]` | ebay.js:1419-1435 | `fillDescription` | publish | orange | oui — 3 étages | oui — oracle relu |
| `publish.photo_input` | `'input#fehelix-uploader, input[type="file"]'` | ebay.js:1747 | `uploadPhotos` | publish | red | oui — 2 formes | **non — sleep(1500×n) seul** (§7) |
| `publish.submit` | `querySelectorAll("button")` par texte (« Mettre en vente… ») — relocalisé sur le nœud VIVANT à chaque usage | ebay.js:859-862 | `retrouveListBtn` | publish | **red** | non (texte seul) | **oui — détection d'effet** : URL quittée / bouton détaché·désactivé / notice ou dialogue APPARU (`surveilleNotices` l.826), re-clic unique sinon, verdict final délégué au background |
| `publish.notices` | `'.page-notice, [role="alert"], [role="dialog"], [class*="lightbox" i]'` | ebay.js:826 | `surveilleNotices` (référence avant clic) | publish | red (signal) | oui — 4 formes | n/a |
| `publish.lightbox` | `.lightbox-dialog` + boutons + `'button[aria-label*="ermer" i], button.icon-btn'` | ebay.js:1482-1486 | `dismissLightboxes` (popup « Astuces photos ») | publish | orange | oui | oui — relecture ⚠ `offsetParent` (l.1482) |
| `publish.post_submit_confirm` (background) | dialogs `'[role="dialog"], [class*="lightbox" i], [class*="modal" i]'` + bouton close `'button[aria-label*="ermer" i], button[aria-label*="lose" i], button.lightbox-dialog__close'` | background.js:2538-2564 | `readEbayFailureDiagnostics`, `closeEbayPostPublishPopup` | publish | red | oui | oui — croisé avec Hub vendeur |
| `status.hub_links` | `a[href*="/itm/"]` (Hub vendeur `/sh/lst/active`) ; `a[href]` génériques | background.js:3237, 3425, 3441 | récupération `listing_url` + confirmation de publication | status_check | **red** | oui — titre obligatoire (règle listing_url croisée) | oui — matching par titre, jamais « lien unique » |

---

## 4. Beebs (`content-scripts/beebs.js`)

| clé_proposée | sélecteur | fichier:ligne | fonction | workflow | criticité | fallback | vérif_post |
|---|---|---|---|---|---|---|---|
| `status.my_ads_probe` | `a, h2, h3, p, span` + `` `a[href*="${slug}"]` `` (dynamique slug) | beebs.js:169, 175 | localisation de l'annonce | delete | red | oui | oui — identité par titre |
| `delete.card_actions` | `querySelectorAll("button")` par texte (« Modifier/Dupliquer/Supprimer » via `findBeebsCard`) | beebs.js:197, 337 | carte + bouton Supprimer | delete | red | non (texte) | oui — voie par carte, PAS la barre groupée |
| `delete.dialog` | `'[role="dialog"], [class*="modal" i]'` filtré par texte « supprimer mon annonce » | beebs.js:216 | attente du dialogue | delete | **red** | oui — 2 formes | oui — texte du dialogue exigé |
| `delete.reason_radio` | `input[type="radio"]` + `` `label[for="${r.id}"]` `` — motif « Vendu via une autre plateforme » OBLIGATOIRE (le défaut pré-coché « Vendu via Beebs » déclarerait une vente chez eux) | beebs.js:228-233 | choix du motif | delete | **red** | non | oui — `radio.checked` relu après dispatch |
| `delete.confirm` | boutons du dialogue par texte exact « Supprimer l'annonce » | beebs.js:244-256 | confirmation | delete | **red** | non | **non — `sleep(6000)` puis succès** (suppression asynchrone Beebs ; état confirmé ensuite côté background, cf. §7) |
| `auth.password_guard` | `input[type="password"]` + `location.pathname.startsWith("/fr/listing")` | beebs.js:353 | garde de session | publish | red | non | n/a — `needsUser` |
| `publish.form_ready` | `button[class*="__selectButton"]` + `div[class*="__label"]` (count > 2) | beebs.js:411-417, 655-656 | attente des champs dynamiques post-catégorie | publish | orange | non | oui — sans elle tous les champs sautaient en silence |
| `publish.field_label` | `div[class*="__label"]` → `button[class*="__selectButton"]` frère (suffixe « (facultatif) » dans `span[class*="__optionalAttribute"]`) | beebs.js:897-901, 650-651 | `findField`, `enumerateBeebsFields` | publish | orange | non | oui — champs requis non remplis remontés (`unfilledRequired`) |
| `publish.panel` | `div[class*="__options"]` — scopé `trigger.parentElement` PUIS repli sur l'unique panneau visible du document (invariant : 0 fermé, 1 ouvert) | beebs.js:1039, 1052, 1487 | `panneauxVisibles`, `panelOf` | publish | orange | **oui — repli global ajouté le 26/07 (0893bc4), loggé** | oui — panneau unique exigé pour le repli |
| `publish.panel_option` | `querySelectorAll("button")` du panneau, texte non vide (seul autre bouton : retour mobile md:hidden sans texte) | beebs.js:1075, 1494 | `panelOptions` | publish | orange | n/a — générique post-migration Tailwind (les classes `__category`/`__valueButton` sont MORTES depuis le 22-23/07) | oui — `optionLabel` : checkbox id/name → 1er span → textContent |
| `publish.option_label` | `input[type="checkbox"]` (id/name = libellé exact) puis `span` | beebs.js:934-937, 1512 | `optionLabel`, feuille de catégorie | publish | orange | oui — 3 lectures ordonnées | n/a |
| `publish.panel_search` | `input[type="text"]` scopé au panneau | beebs.js:1080 | `panelSearchInput` | publish | orange | non | oui — relevé des options AVANT frappe (listes complètes seulement) |
| `publish.interstitial` | `'[role="dialog"], [aria-modal="true"], [class*="modal" i]'` (conteneurs extérieurs, hors `__options`, hors dialogue de suppression) ; fermeture : `'[aria-label*="clo" i], [aria-label*="ferm" i], [class*="close" i]'` puis `button` hors `a[href]` hors CTA store | beebs.js:1101-1144 | `findBlockingDialogs`, `dismissInterstitials` (26/07) | publish | orange | oui — 2 étages de candidats | oui — dialogue détaché/invisible exigé après clic |
| `publish.price` | `#price` | beebs.js:612 | garde prix pré-submit | publish | red | non | oui — valeur relue et parsée |
| `publish.submit` | `button[type="submit"]` | beebs.js:622 | dépôt | publish | **red** | **non** | **oui — `waitForBeebsDeposit()`** : texte « Votre article a bien été ajouté… » ou `/listing/success` (annonce en MODÉRATION ⇒ `listingUrl` null assumé, re-capture différée) |
| `publish.address` | `input[name="address"]` | beebs.js:1542 | `fillAddress` | publish | orange | non | — |
| `publish.relevance_probe` | `querySelectorAll('button')` + tokens | beebs.js:1608 | `relevance` | publish | green | — | ⚠ `offsetParent` (§9c) |

---

## 5. background.js — transverse (executeScript + navigation + états)

| clé_proposée | sélecteur / pattern | fichier:ligne | fonction | workflow | criticité |
|---|---|---|---|---|---|
| `status.item_state.vinted` | parsing du HTML récupéré par `fetch(url, {credentials:"include", redirect:"follow"})` | background.js:3723, 3745, 3915 | `detectVintedState`, `vintedListedPrice` | status_check (détection de vente) | **red** — écrit le statut de vente |
| `status.item_state.leboncoin` | idem — 410 + title/h1 relevés réels (6ea6ad0) ; ⚠ une copie 200 périmée peut alterner avec le 410 pendant des heures : UN SEUL 410 prime (eda2722) | background.js:3805 | `detectLeboncoinState` | status_check | **red** |
| `status.item_state.ebay` | idem, URL finale incluse | background.js:3829 | `detectEbayState` | status_check | **red** |
| `status.item_state.beebs` | idem | background.js:3845 | `detectBeebsState` | status_check | **red** |
| `status.recapture` | `fetch(cible)` des pages « Mes annonces » (`MY_LISTINGS_URL` l.3323-3330) + ancres par TITRE | background.js:3878, 3237-3441 | re-capture listing_url (Beebs différé : modération) | status_check | red |
| `nav.work_tab` | fragment `#fillsell-worker`, `WORK_TAB_FRAGMENT` (l.1724) ; relance même-URL ⇒ `chrome.tabs.reload` explicite (0893bc4) | background.js:1724, 2040-2160 | `getOrCreateWorkTab`, `navigateWorkTab` | tous | red |
| `auth.reauth_hosts` | regex de domaines : `signin.ebay.(fr\|com)`, `vinted.(fr\|com)` (/auth), `auth.leboncoin.fr` | background.js:2305 | interception de ré-authentification post-clic | publish | red — empêche les « published » fantômes |
| `publish.deposit_urls` | `https://www.vinted.fr/items/new` ; `https://www.leboncoin.fr/deposer-une-annonce` ; `https://www.beebs.app/fr/listing` ; eBay : home `https://www.ebay.fr/` puis URL construite `/sl/list?mode=AddItem&categoryId=…` (jamais d'URL sans categoryId — throw) | background.js:68-110 | `PLATFORM_HANDLERS` | publish | red |
| `diag.*` | `diagOf`/`persist` — `querySelector(sel)` paramétrique + `getBoundingClientRect`/`offsetParent` **à titre de DIAGNOSTIC UNIQUEMENT** (jamais décisionnel) | background.js:2980-3052 | sondes de champ Vinted | publish | green |

---

## 6. APIs internes des plateformes

| Plateforme | Appel | Méthode/headers | Réponse attendue | fichier:ligne |
|---|---|---|---|---|
| Vinted | `/api/v2/items/{itemId}` | GET, `credentials:include` | 200 = présent, 404 = absent (test d'existence idempotent) | vinted.js:269 |
| Vinted | `/api/v2/users/current` | GET | état de session (connecté ou non) | vinted.js:287 |
| Vinted | `/api/v2/items/{itemId}/delete` | **POST**, `X-CSRF-Token` (script inline) + `X-Anon-Id` (cookie `anon_id`) | 200/204 = supprimé ; **404 = déjà absent ⇒ succès idempotent** ; 401/403 ⇒ corps journalisé puis arbitrage (item encore là ? session morte ?) — jamais de conclusion réflexe | vinted.js:356-385 |
| Vinted | Sonde réseau de publication (script injecté monde MAIN) : capture le POST de dépôt → status + `errors[{field,value}]` relayés via `VINTED_PROBE_CAPTURE` | — | 200 + id d'item, ou 400 avec champs requis serveur (persistés au catalogue, source `server_400`) | vinted.js:126-176, 903-965 |
| Leboncoin | aucune API interne appelée — DOM + lecture de pages par le background | | | |
| eBay | aucune API interne appelée par l'extension (l'API Taxonomy vit côté serveur, keyset dédié, jamais dans l'extension) | | | |
| Beebs | aucune API interne appelée — DOM uniquement | | | |
| Supabase (infra) | `auth/v1/verify` (bootstrap **token_hash**), `auth/v1/token` (refresh), `functions/v1/<name>` (`get-pending-jobs` avec `build`, `update-job-status`, `extension-session`…), `rest/v1/cross_post_jobs…` | | | background.js:401, 487, 513-514, 558, 4089-4090 ; popup.js:105 |

---

## 7. Succès supposés sans signal de confirmation réel

Le pattern du bug LBC historique (succès inconditionnel après un sleep) a été
**éradiqué des quatre chemins de PUBLICATION** — chacun a aujourd'hui une preuve :

| Plateforme | Preuve de publication | Depuis |
|---|---|---|
| Vinted | redirection `/items/<id>` OU sonde réseau (400 serveur remonté structuré) | 2026-07-12 (vinted.js:843-889) |
| Leboncoin | redirection `/deposer-une-annonce/confirmation` OU message « Nous avons bien reçu votre annonce » ; sinon re-clic unique puis `needsUser` | 2026-07-19 (lbc.js:1044-1093) |
| eBay | détection d'effet post-clic (URL/bouton/notice) + verdict background (réponse serveur + Hub vendeur) | 2026-07-19 (ebay.js:833-901) |
| Beebs | `waitForBeebsDeposit()` — confirmation de dépôt en modération | 2026-07-13 (beebs.js:624-642) |

**CE QUI RESTE — liste exhaustive des successions `action → sleep → suite` sans signal :**

1. **Upload de photos, LES 4 PLATEFORMES** — le seul pattern sleep-sans-signal
   encore présent sur un chemin critique, à l'identique partout :
   `input.files = …; dispatchEvent(change); await sleep(1500 × nbPhotos)` :
   - vinted.js:1997-2001 (`uploadPhotos`)
   - leboncoin.js:1948-1951 (`uploadPhotos`)
   - ebay.js:1754-1757 (`uploadPhotos`)
   - beebs.js:1637 (`uploadPhotos`)
   Aucune lecture du nombre de vignettes rendues, d'état d'upload ou de requête
   réseau : un upload plus lent que 1,5 s/photo (réseau, photos lourdes) enchaîne
   sur la suite du remplissage avec des photos manquantes, sans erreur. Sur eBay
   le gate pré-submit relit certains champs mais pas le compte de photos.
2. **Beebs `delete.confirm`** — beebs.js:249-256 : `realClick(confirmBtn)` →
   `sleep(6000)` → `success: true`, aucun signal lu (documenté : suppression
   asynchrone, la liste reste obsolète quelques secondes). Filet existant : le
   background pose `delete_confirmed_by: "etat_annonce"` après vérification
   d'état (background.js:4747, 4822) — la conclusion du content script seul est
   optimiste, le verdict durable vient de l'état.
3. **eBay `delete.confirm`** — ebay.js:239-248 : `realClick` → `sleep(4000)` →
   `success: true` avec délégation EXPLICITE au background (« annonce plus en
   ligne ⇒ suppression confirmée ») ; lecture best-effort du texte « annonce
   terminée » à titre de trace seulement.
4. **LBC `delete.confirm`** — lbc.js:437-446 : `realClick` → `sleep(3000)` →
   lecture best-effort de « suppression a bien été prise en compte », succès
   retourné même sans elle, « confirmation ultime » déléguée au background.
5. **Vinted `publish.submit`** — vinted.js:824-826 : `click()` → `sleep(2500)` —
   **non problématique** : immédiatement suivi de `waitForPublishOutcome()`, le
   sleep n'est qu'un délai de courtoisie avant la boucle de preuve.

Constat transversal : les trois `delete.confirm` DOM (Beebs, eBay, LBC) partagent
le même contrat implicite « le content script rapporte le geste, le background
confirme par l'état ». Ce contrat n'est écrit nulle part comme invariant — il
tient tant que la vérification d'état du background reste sur le chemin de tous
les jobs delete.

---

## 8. Sélecteurs de criticité red SANS AUCUN fallback

| Plateforme | clé | sélecteur unique | Ce qui casse |
|---|---|---|---|
| Vinted | `publish.submit` | `[data-testid="upload-form-save-button"]` | publication |
| Vinted | `publish.photo_input` | `input[data-testid="add-photos-input"]` | publication (photos) |
| Leboncoin | `publish.title` | `input[name="subject"]` | publication |
| Leboncoin | `publish.price` | `#price_cents` | publication |
| eBay | `publish.form_title` | `input[name="title"]` | publication (et détection « formulaire atteint ») |
| eBay | `publish.price` | `input[name="price"]` | publication |
| Beebs | `publish.price` | `#price` | publication (garde pré-submit) |
| Beebs | `publish.submit` | `button[type="submit"]` | publication |
| Toutes | `auth.password_guard` | `input[type="password"]` | détection de déconnexion (un faux négatif ⇒ remplissage sur page de login) |

Les boutons trouvés PAR TEXTE (`findFreeCta` LBC, `retrouveListBtn` eBay,
confirmations delete par libellé exact) n'ont pas de fallback STRUCTUREL : leur
seule redondance est la cascade de régex/textes. Un changement de wording les
casse tous ensemble.

---

## 9. Classes de bug vécues en juillet

### a) Boucles de retry qui BASCULENT un état (bug Beebs 23-26/07)

| Endroit | État | Détail |
|---|---|---|
| beebs.js:1317+ (`selectCategory`) et `openPanelOptions` | **CORRIGÉ 26/07 (0893bc4)** | le clic sur le déclencheur est une bascule ; on ne re-clique plus que panneau constaté fermé |
| ebay.js:1295-1315 (`fillSpecific`, menus) | **exposé au même mécanisme** | re-clic « si le menu n'a pas réagi », MAIS le test d'ouverture (`visibleMenu`) repose sur `offsetParent` (l.1298-1300) — un faux « fermé » en fenêtre non rendue ferait re-cliquer un bouton de menu `fake-menu-button` dont le clic est aussi une bascule. Combinaison (a)+(c). Constat, pas de correction ici |
| ebay.js:869-890 (`publish.submit` re-clic) | non-bascule | le re-clic n'a lieu qu'en l'absence TOTALE d'effet observable (URL/bouton/notice) ; un submit n'est pas un toggle — risque résiduel = double dépôt si le 1er clic a pris sans AUCUN signal en 8 s, documenté dans le code |
| lbc.js:1071-1080 (`publish.free_cta` re-clic) | non-bascule | même logique : re-clic unique si `preuveDepot` absente après 15 s ; le code note explicitement que le background re-vérifie « Mes annonces » avant tout ré-armement pour éviter le doublon |

### b) Interstitiels pouvant intercepter un clic — état par plateforme

| Plateforme | Dismiss générique pré-interaction | Ce qui existe |
|---|---|---|
| Beebs | **OUI** — `dismissInterstitials()` (26/07) : structurel (`role=dialog`/`aria-modal`/`modal`), appelé à l'arrivée + avant chaque champ/tentative | |
| eBay | **OUI** — `dismissLightboxes()` (`.lightbox-dialog`, popup « Astuces photos »), appelé à l'arrivée sur le formulaire ET avant chaque interaction sensible (ebay.js:441, 820, 1095, 1219) ; + `closeEbayPostPublishPopup` côté background | |
| Vinted | **PARTIEL** | `closeAnyOpenDropdown()` avant le clic Publier (panneau interne, pas un interstitiel) et `closePostPublishModal` APRÈS publication. **Aucun dismiss d'interstitiel AVANT interaction** (bannière cookies, promo app) |
| Leboncoin | **AUCUN** | l'interstitiel « On cherche le juste prix » est traité comme étape de flux (lbc.js:750-755) ; **aucune gestion de bannière cookies (Didomi) ni de modale promo** — le compte de travail a déjà consenti, mais une réapparition (purge cookies, nouvelle campagne) intercepterait les clics sans diagnostic |

### c) Usages layout-dépendants (interdits par la convention fenêtre non rendue — seuls `getComputedStyle` et `textContent` sont fiables)

**Décisionnels** (participent à un choix ou un verdict) :

| fichier:ligne | usage | rôle |
|---|---|---|
| vinted.js:1173 | `el.offsetParent === null` dans `isGone()` | test de disparition — en fenêtre non rendue, `offsetParent` est null même pour un élément présent ⇒ « disparu » à tort |
| vinted.js:1636 | filtre `offsetParent !== null` | choix de la cible de clic extérieur (repli `document.body`) |
| leboncoin.js:1499 | filtre `offsetParent !== null` | options de listbox retenues |
| leboncoin.js:1634 | `getClientRects().length > 0` dans `isHumanMessageNode` | détection de messages d'écran |
| ebay.js:585 | `offsetParent !== null` | validation du champ prix |
| ebay.js:1298-1300 | `offsetParent` ×2 dans `visibleMenu()` | test d'ouverture du menu de specifics (cf. §9a) |
| ebay.js:1364 | `offsetParent` | menu encore ouvert ? |
| ebay.js:1391 | `offsetParent` | option « Achat immédiat » visible |
| ebay.js:1482 | `offsetParent` | lightbox visible |
| ebay.js:449 | `main.innerText` | vérif catégorie affichée (innerText vide sans rendu ⇒ warning émis à tort) |
| beebs.js:1255 | filtre `offsetParent !== null` dans `researchPanelFor` | options prises « par visibilité » — le repli « Autre » |
| beebs.js:1608 | filtre `offsetParent !== null` | sonde `relevance` |

**Diagnostic pur** (loggés, jamais décisionnels — conformes) :
vinted.js:237 (chaîne de diag), vinted.js:1212 (`getBoundingClientRect` pour les
coordonnées d'événements synthétiques), background.js:2981-2984 (`diagOf`).

`elementFromPoint` et `checkVisibility` : **aucune occurrence** dans l'extension.

---

*Fin d'audit. Aucune correction proposée dans ce fichier (contrainte d'énoncé) —
les constats §7-§9 sont les entrées attendues des chantiers registre (ADR-03),
assertions (§5 de la spec) et de la release extension 0.4.3+.*
