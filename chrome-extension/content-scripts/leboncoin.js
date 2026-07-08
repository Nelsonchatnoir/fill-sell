// Content script Leboncoin — pilote le WIZARD de dépôt d'annonce.
//
// ⚠️ DRY_RUN doit rester à true tant que le flux post-aperçu (options de
// visibilité → dépôt réel) n'a pas été validé manuellement. En dry-run, le
// wizard est rempli jusqu'à l'APERÇU FINAL inclus (description, prix,
// adresse), mais le "Continuer" de l'aperçu — qui porte la mention « je
// confirme l'exactitude des informations » — n'est JAMAIS cliqué.
const DRY_RUN = true;

const CLICK_DELAY = 250;

// ── Communication avec le background ────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "FILL_LISTING") return;

  fillListingForm(msg.job)
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ success: false, error: String(err?.message ?? err) }));

  return true; // réponse asynchrone
});

// ── Remplissage du wizard ────────────────────────────────────────────────────
//
// Architecture relevée sur le vrai formulaire (docs/leboncoin-form-survey.md,
// côté app) :
//   1. titre (input[name=subject]) → suggestions de catégorie (radios) +
//      sélecteur manuel 2 panneaux (racine → feuille, arbre plat)
//   2. "Dites-nous en plus" : photos + critères dynamiques par catégorie
//      (combobox à IDs React instables — on passe par label[for] sémantique :
//      "condition", suffixes "_univers"/"_brand"/"_material")
//   3. interstitiel "On cherche le juste prix" (prix pré-suggéré)
//   4. aperçu final éditable : textarea#body, #price_cents, adresse
//      (autocomplete type Google Places, PAS pré-remplie depuis le compte
//      LBC — vérifié) — puis Continuer final = engagement de publication.
//
// platform_fields attendus : { etat, format_colis, univers (fourni depuis
//   2026-07 par l'app : IA + défaut "Mixte" sur le rayon Mode — LBC a un
//   rayon Mixte, cf. form-survey), lbcCategoryPath ([racine, feuille], posé
//   par l'app via lbcCategories.js), adresse? (Réglages FillSell), marque?,
//   matiere? }
//
// Politique A+C : adresse absente ou introuvable dans l'autocomplete →
// { success:false, needsUser:true } : le background remet le job en PENDING
// avec un message explicite (jamais failed) — le brouillon LBC persiste
// (restauration automatique vérifiée), rien n'est perdu.
async function fillListingForm(job) {
  console.log("[leboncoin] fillListingForm — job:", job.id, job.title, DRY_RUN ? "(DRY_RUN)" : "(LIVE)");

  const fields = job.platform_fields || {};
  const warnings = [];

  // Session : le background vient de naviguer l'onglet de travail sur
  // /deposer-une-annonce (même règle que Vinted : un seul onglet persistant,
  // une navigation par job). Si Leboncoin a redirigé (auth.leboncoin.fr,
  // /connexion…) ou affiche un formulaire d'authentification, on s'arrête
  // AVANT tout remplissage : needsUser (ré-armement borné côté background,
  // jamais de retry immédiat), aucune interaction sur une page de connexion.
  const onDepositPage =
    /(^|\.)leboncoin\.fr$/.test(location.hostname) &&
    location.pathname.startsWith("/deposer-une-annonce");
  if (!onDepositPage || document.querySelector('input[type="password"]')) {
    return {
      success: false,
      needsUser: true,
      error:
        "Connexion Leboncoin requise : se connecter sur leboncoin.fr dans Chrome " +
        "(l'onglet de travail est resté ouvert), le job repartira au prochain passage.",
    };
  }

  if (!fields.lbcCategoryPath?.length) {
    return {
      success: false,
      error:
        "platform_fields.lbcCategoryPath absent — article non mappé vers une catégorie " +
        "Leboncoin (icône hors périmètre : véhicule immatriculé, Beauté... ou job antérieur " +
        "au mapping). Régénérer l'annonce depuis l'app, ou compléter src/utils/lbcCategories.js.",
    };
  }

  // État vierge requis. L'ancien test (présence du seul input titre) laissait
  // passer un brouillon restauré à l'APERÇU : #subject y existe aussi (relevé
  // form-survey), le job repartait alors en plein milieu du wizard et mourait
  // plus loin sur "Catégorie: ni suggestion ni sélecteur manuel trouvés"
  // (cas réel du 2026-07-06). Les marqueurs d'un stade avancé — #body,
  // #price_cents, critère condition — sont absents de l'étape titre : leur
  // présence signe un brouillon repris. On ne détruit JAMAIS un brouillon
  // (ce peut être un brouillon manuel de l'utilisateur) — needsUser.
  const draftMarker = () =>
    document.querySelector('textarea#body, #body, #price_cents, label[for="condition"]');
  let entryState = await waitFor(() => {
    if (draftMarker()) return "draft";
    if (document.querySelector('input[name="subject"]')) return "step1";
    return null;
  }, 8000);
  if (entryState === "step1") {
    // L'aperçu restauré peut rendre #subject avant #body : petit délai de
    // stabilisation puis re-vérification des marqueurs avant de taper quoi
    // que ce soit dans le titre.
    await sleep(800);
    if (draftMarker()) entryState = "draft";
  }
  if (entryState !== "step1") {
    // draftBlocked : le background tente UNE fois ce job dans un onglet
    // temporaire (si le brouillon vit dans l'état de l'onglet — sessionStorage
    // — un onglet neuf repart de zéro). S'il est resté bloquant même là
    // (brouillon de compte), on retombe sur le needsUser classique.
    return {
      success: false,
      needsUser: true,
      draftBlocked: true,
      error:
        "Un brouillon Leboncoin est déjà en cours sur ce compte (le wizard ne repart pas " +
        "de zéro). Le publier ou le supprimer sur leboncoin.fr, puis relancer.",
    };
  }
  const subjectInput = document.querySelector('input[name="subject"]');

  // ── Étape 1 : titre → catégorie ──────────────────────────────────────────
  await typeInto(subjectInput, job.title);

  const [root, leaf] = fields.lbcCategoryPath;
  await selectCategory(root, leaf);

  // ── Étape 2 : photos + critères ──────────────────────────────────────────
  const photoInput = await waitForElement('input[type="file"]', 15000);
  if (job.photos?.length) await uploadPhotos(photoInput, job.photos);

  // Critères : tous NON bloquants. On ne touche jamais un critère que
  // Leboncoin a déjà pré-rempli depuis le titre (il est souvent plus précis
  // que nos données — ex. Type="Montre quartz" déduit de "Casio A158").
  if (fields.etat) {
    await fillCriterionSafe("état", 'label[for="condition"]', fields.etat, warnings);
  }
  if (fields.univers || fields.genre) {
    await fillUnivers(fields.univers || fields.genre, warnings);
  }
  if (fields.marque) {
    await fillCriterionSafe("marque", 'label[for$="_brand"]', fields.marque, warnings, { skipIfPrefilled: true });
  }
  if (fields.matiere) {
    await fillCriterionSafe("matière", 'label[for$="_material"]', fields.matiere, warnings, { skipIfPrefilled: true });
  }

  // Continuer → interstitiel "juste prix" → aperçu final
  const continueBtn = findButtonByExactText("Continuer");
  if (!continueBtn) throw new Error('Bouton "Continuer" introuvable après les critères.');
  continueBtn.click();

  // L'interstitiel peut durer plusieurs secondes : on attend l'aperçu.
  let bodyArea;
  try {
    bodyArea = await waitForElement("textarea#body, #body", 25000);
  } catch {
    // Le wizard n'a pas avancé : un critère obligatoire a probablement été
    // refusé ("Veuillez choisir un univers de vêtement" — cas réel du
    // 2026-07-06, masqué jusqu'ici par un "Élément introuvable: #body"
    // opaque). On remonte les messages de validation visibles ET les
    // warnings accumulés : l'erreur du job sert de relevé correctif.
    const validationMsgs = [...new Set(
      [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"], [class*="error" i]')]
        .map((el) => el.textContent.trim())
        .filter((t) => t && t.length <= 200)
    )].slice(0, 5);
    throw new Error(
      "Le wizard n'est pas passé à l'aperçu après Continuer" +
      (validationMsgs.length
        ? ` — messages de validation LBC: ${JSON.stringify(validationMsgs)}`
        : " (aucun message de validation visible)") +
      `. Warnings du remplissage: ${warnings.join(" | ") || "aucun"}.`
    );
  }

  // ── Étape 4 : aperçu final ───────────────────────────────────────────────
  if (job.description) {
    setFieldValue(bodyArea, job.description);
    bodyArea.blur();
    await sleep(CLICK_DELAY);
  }

  if (job.price != null) {
    // LBC pré-remplit un prix suggéré — on impose celui du job.
    const priceInput = await waitForElement("#price_cents", 8000).catch(() => null);
    if (priceInput) {
      setFieldValue(priceInput, String(Math.round(Number(job.price))));
      priceInput.dispatchEvent(new Event("blur", { bubbles: true }));
      await sleep(CLICK_DELAY);
    } else {
      const note = "prix: champ #price_cents introuvable, prix suggéré LBC conservé";
      console.warn(`[leboncoin] ⚠️ ${note}`);
      warnings.push(note);
    }
  }

  // Adresse de remise (politique A+C)
  const addressResult = await fillAddress(fields.adresse, warnings);
  if (!addressResult.ok) {
    return {
      success: false,
      needsUser: true,
      error: addressResult.error,
      warnings,
    };
  }

  if (DRY_RUN) {
    console.log(
      "[leboncoin] 🧪 DRY_RUN actif — aperçu rempli, Continuer final (« je confirme " +
      "l'exactitude ») NON cliqué.",
      "\nJob:", job.id,
      "\nTitre:", job.title,
      "\nPrix:", job.price,
      "\nChamps plateforme:", fields,
      warnings.length ? `\nWarnings (${warnings.length}): ${warnings.join(" | ")}` : "\nAucun warning."
    );
    return { success: true, dryRun: true, warnings };
  }

  // Publication LIVE : le flux post-aperçu (Continuer final → options de
  // visibilité → dépôt) n'a pas encore été relevé — refus explicite plutôt
  // qu'un enchaînement à l'aveugle sur un bouton d'engagement.
  return {
    success: false,
    error:
      "Publication LIVE Leboncoin pas encore implémentée : le flux post-aperçu doit être " +
      "relevé et validé avant d'automatiser le Continuer final. Laisser DRY_RUN=true.",
  };
}

// ── Catégorie ────────────────────────────────────────────────────────────────

// Stratégie hybride : 1) une suggestion radio dont le libellé contient la
// feuille mappée → un seul clic ; 2) sinon sélecteur manuel 2 panneaux ;
// 3) sinon erreur listant ce que Leboncoin affiche (même philosophie que le
// selectCategory Vinted : l'erreur du job sert de relevé correctif).
async function selectCategory(root, leaf) {
  // Les suggestions arrivent en asynchrone après la frappe du titre.
  await sleep(1500);

  const suggestionRadio = findSuggestionRadio(root, leaf);
  if (suggestionRadio) {
    suggestionRadio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(CLICK_DELAY);
    console.log(`[leboncoin] catégorie via suggestion: ${root} > ${leaf}`);
    return;
  }

  // Sélecteur manuel : ouvrir "Ou choisissez une autre catégorie"
  const trigger = [...document.querySelectorAll('input[role="combobox"], button')]
    .find((e) => /choisissez/i.test(e.value || e.textContent || ""));
  if (!trigger) throw new Error("Catégorie: ni suggestion ni sélecteur manuel trouvés.");
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(800);

  // Panneau gauche = racines (ul de 13 items — on repère par contenu)
  const leftUl = [...document.querySelectorAll("ul")]
    .find((u) => u.children.length >= 10 && u.textContent.includes("Divers"));
  if (!leftUl) throw new Error("Catégorie: panneau des racines introuvable.");
  const rootLi = [...leftUl.children].find((li) => li.textContent.trim() === root);
  if (!rootLi) {
    throw new Error(
      `Catégorie: racine "${root}" introuvable. Racines Leboncoin: ` +
      JSON.stringify([...leftUl.children].map((li) => li.textContent.trim()))
    );
  }
  (rootLi.querySelector("button, a") || rootLi).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(600);

  const rightUl = [...document.querySelectorAll("ul")]
    .filter((u) => u !== leftUl)
    .find((u) => [...u.children].some((c) => c.textContent.trim() === leaf));
  if (!rightUl) {
    const panes = [...document.querySelectorAll("ul")].filter((u) => u !== leftUl && u.children.length > 0);
    throw new Error(
      `Catégorie: feuille "${leaf}" introuvable sous "${root}". Options affichées: ` +
      JSON.stringify(panes.map((p) => [...p.children].map((c) => c.textContent.trim().slice(0, 40))).flat().slice(0, 20)) +
      ". Corriger src/utils/lbcCategories.js avec un de ces libellés."
    );
  }
  const leafLi = [...rightUl.children].find((c) => c.textContent.trim() === leaf);
  (leafLi.querySelector("button, a") || leafLi).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await sleep(CLICK_DELAY);
  console.log(`[leboncoin] catégorie via sélecteur manuel: ${root} > ${leaf}`);
}

// Le libellé d'une suggestion concatène racine+feuille SANS séparateur
// ("ModeMontres & Bijoux" — vérifié) : containsAsWords échouerait (pas de
// frontière de mot devant la feuille). On matche donc sur le SUFFIXE (le
// libellé se termine par la feuille) ou l'égalité racine+feuille.
function findSuggestionRadio(root, leaf) {
  const leafN = normalizeFuzzy(leaf);
  const rootN = normalizeFuzzy(root);
  for (const radio of document.querySelectorAll('input[type="radio"]')) {
    const label = radio.closest("li, label, div");
    if (!label) continue;
    const labelN = normalizeFuzzy(label.textContent);
    if (labelN.endsWith(leafN) || labelN === rootN + leafN) return radio;
  }
  return null;
}

// ── Critères (combobox à menu, IDs instables → label[for] sémantique) ──────

// label[for="condition"] ou label[for$="_material"] → wrapper → input combobox.
function findCriterionInput(labelSelector) {
  const label = document.querySelector(labelSelector);
  if (!label) return null;
  let wrap = label.parentElement;
  for (let i = 0; i < 4 && wrap; i++) {
    const inp = wrap.querySelector('input[role="combobox"]');
    if (inp) return inp;
    wrap = wrap.parentElement;
  }
  return null;
}

// Cascade v2 (portée de vinted.js) + jamais bloquant. skipIfPrefilled : ne pas
// écraser un critère que Leboncoin a déjà déduit du titre.
async function fillCriterionSafe(fieldName, labelSelector, rawValue, warnings, { skipIfPrefilled = false } = {}) {
  try {
    const input = findCriterionInput(labelSelector);
    if (!input) {
      // Critère absent pour cette catégorie : normal (champs dynamiques), silencieux.
      return false;
    }
    if (skipIfPrefilled && input.value.trim()) {
      console.log(`[leboncoin] ${fieldName}: déjà pré-rempli par LBC ("${input.value}"), conservé`);
      return true;
    }
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(700);
    const menu = document.getElementById(input.getAttribute("aria-controls"));
    const optionSelector = 'li, [role="option"], button';
    const scope = menu || document;
    const match = findOptionCascade(scope, optionSelector, rawValue);
    if (!match) {
      const available = [...scope.querySelectorAll(optionSelector)]
        .map((o) => o.textContent.trim()).filter(Boolean).slice(0, 30);
      throw new Error(`option "${rawValue}" sans correspondance. Options: ${JSON.stringify(available)}`);
    }
    match.el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(CLICK_DELAY);
    if (match.stage !== "exact") {
      const note = `${fieldName}: "${rawValue}" → option LBC "${match.label}" (match ${match.stage})`;
      console.warn(`[leboncoin] ≈ ${note}`);
      warnings.push(note);
    }
    return true;
  } catch (e) {
    const note = `${fieldName}: champ sauté — ${e.message}`;
    console.warn(`[leboncoin] ⚠️ ${note}`);
    warnings.push(note);
    document.body.click(); // referme un éventuel menu resté ouvert
    await sleep(CLICK_DELAY);
    return false;
  }
}

// ── Univers (critère OBLIGATOIRE du rayon Mode) ──────────────────────────────
// "Veuillez choisir un univers de vêtement" bloque le passage à l'aperçu :
// contrairement aux autres critères, un échec ici ne doit JAMAIS être
// silencieux (cas réel du 2026-07-06 : univers="Mixte" bien présent dans le
// job, non appliqué, zéro trace). Le combobox label[for$="_univers"] vient
// du relevé Montres & Bijoux (accessories_univers) ; sur d'autres catégories
// (Vêtements) le contrôle peut être rendu autrement (radios/pills) — d'où le
// fallback : conteneur titré "Univers" → clic sur l'option via la cascade.
async function fillUnivers(rawValue, warnings) {
  // 1. Combobox classique (relevé Montres & Bijoux)
  if (findCriterionInput('label[for$="_univers"]')) {
    await fillCriterionSafe("univers", 'label[for$="_univers"]', rawValue, warnings, { skipIfPrefilled: true });
    return;
  }

  // 2. Contrôle non-combobox : libellé "Univers" puis options cliquables
  // autour (radios, pills, boutons). On remonte de quelques parents depuis
  // le libellé jusqu'à trouver un conteneur qui porte les options.
  const title = [...document.querySelectorAll("legend, label, span, p, h2, h3, h4")]
    .find((el) => normalizeFuzzy(el.textContent) === "univers"
      || /^univers( de |[\s:*])/.test(normalizeFuzzy(el.textContent)));
  if (title) {
    let scope = title.parentElement;
    for (let i = 0; i < 4 && scope; i++, scope = scope.parentElement) {
      // Pré-rempli par LBC depuis le titre → on ne touche pas (même règle
      // que skipIfPrefilled sur le combobox).
      if (scope.querySelector('input:checked, [aria-checked="true"], [aria-selected="true"]')) {
        console.log("[leboncoin] univers: déjà pré-sélectionné par LBC, conservé");
        return;
      }
      const match = findOptionCascade(
        scope,
        'input[type="radio"], [role="radio"], [role="option"], button, label, li',
        rawValue
      );
      if (match) {
        realClick(match.el);
        await sleep(CLICK_DELAY);
        if (match.stage !== "exact") {
          const note = `univers: "${rawValue}" → option LBC "${match.label}" (match ${match.stage})`;
          console.warn(`[leboncoin] ≈ ${note}`);
          warnings.push(note);
        }
        return;
      }
    }
  }

  // 3. Introuvable : warning EXPLICITE — si le critère était réellement
  // absent de la catégorie, le Continuer passera et le warning restera
  // anodin ; s'il était obligatoire, l'échec du Continuer remontera ce
  // warning dans l'erreur du job (relevé correctif).
  const note = `univers: contrôle introuvable sur cette catégorie — valeur "${rawValue}" non appliquée`;
  console.warn(`[leboncoin] ⚠️ ${note}`);
  warnings.push(note);
}

// ── Adresse (autocomplete type Google Places) ───────────────────────────────

async function fillAddress(adresse, warnings) {
  const input = findCriterionInput('label[for="location"]')
    || [...document.querySelectorAll("input")].find((i) => (i.placeholder || "") === "Adresse");
  if (!input) {
    // Champ absent de l'aperçu (LBC l'a peut-être mémorisé d'un dépôt
    // précédent — à observer) : on continue sans bloquer.
    const note = "adresse: champ introuvable dans l'aperçu (peut-être déjà mémorisée par LBC)";
    console.warn(`[leboncoin] ⚠️ ${note}`);
    warnings.push(note);
    return { ok: true };
  }
  if (input.value.trim()) {
    console.log(`[leboncoin] adresse: déjà remplie ("${input.value}"), conservée`);
    return { ok: true };
  }
  if (!adresse) {
    return {
      ok: false,
      error:
        "Adresse requise pour Leboncoin : renseigner « Adresse de remise Leboncoin » " +
        "dans les Réglages FillSell, puis relancer. Le brouillon Leboncoin est conservé.",
    };
  }

  input.scrollIntoView({ block: "center" });
  await typeInto(input, adresse);

  // Leboncoin n'accepte une adresse que CHOISIE dans le dropdown de
  // l'autocomplete (type Google Places) : un texte collé, même correct
  // visuellement, laisse le champ invalide (cas réel du 2026-07-06,
  // "sans suggestion" alors que le texte était bien inséré). D'où :
  // détection LARGE des suggestions (listbox lié à l'input via
  // aria-controls/aria-owns d'abord, sélecteurs génériques ensuite),
  // choix de la 1re suggestion PERTINENTE (partage de tokens avec
  // l'adresse saisie), clic à séquence pointer complète, puis contrôle
  // que le champ est réellement validé avant de continuer.
  const findSuggestions = () => {
    const scopes = [];
    const ownedId = input.getAttribute("aria-controls") || input.getAttribute("aria-owns");
    if (ownedId) {
      const owned = document.getElementById(ownedId);
      if (owned) scopes.push(owned);
    }
    scopes.push(...document.querySelectorAll('[role="listbox"]'));
    let cands = scopes.flatMap((s) => [...s.querySelectorAll('[role="option"], li')]);
    if (!cands.length) {
      cands = [...document.querySelectorAll(
        '[role="option"], [class*="suggestion" i] li, ul[class*="autocomplete" i] li, [data-testid*="suggestion" i]'
      )];
    }
    // Visibles et non vides uniquement (offsetParent null = caché).
    return cands.filter((el) => el.offsetParent !== null && el.textContent.trim());
  };

  const tokens = normalizeFuzzy(adresse).split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 || /^\d+$/.test(t));
  const relevance = (el) => {
    const n = normalizeFuzzy(el.textContent);
    return tokens.reduce((score, t) => score + (n.includes(t) ? 1 : 0), 0);
  };

  const candidates = await waitFor(() => {
    const c = findSuggestions();
    return c.length ? c : null;
  }, 8000);
  if (!candidates) {
    return {
      ok: false,
      error:
        `Adresse "${adresse}" sans suggestion dans l'autocomplete Leboncoin — vérifier ` +
        "l'orthographe dans les Réglages FillSell (format : numéro rue, ville). " +
        "Le brouillon Leboncoin est conservé.",
    };
  }
  const suggestion = [...candidates].sort((a, b) => relevance(b) - relevance(a))[0];
  if (!suggestion || relevance(suggestion) === 0) {
    // Des propositions existent mais aucune ne recoupe l'adresse : ne jamais
    // forcer la suite avec une adresse non validée. La liste sert de relevé
    // correctif pour ajuster l'adresse dans les Réglages.
    return {
      ok: false,
      error:
        `Adresse "${adresse}" : aucune suggestion pertinente dans l'autocomplete Leboncoin. ` +
        `Propositions affichées: ${JSON.stringify(candidates.map((c) => c.textContent.trim()).slice(0, 5))}. ` +
        "Corriger l'adresse dans les Réglages FillSell. Le brouillon Leboncoin est conservé.",
    };
  }

  const chosen = suggestion.textContent.trim();
  realClick(suggestion);
  await sleep(CLICK_DELAY);

  // Validation post-sélection : le dropdown doit se fermer et le champ ne
  // doit porter aucun marqueur d'erreur — sinon la sélection n'a pas été
  // prise par React et l'aperçu partirait avec une adresse invalide.
  const dropdownClosed = await waitFor(() => (findSuggestions().length === 0 ? true : null), 4000);
  const errorNode = (() => {
    let scope = input;
    for (let i = 0; i < 4 && scope; i++, scope = scope.parentElement) {
      const err = scope.querySelector?.('[role="alert"], [aria-live="assertive"], [class*="error" i]');
      if (err && err.textContent.trim()) return err;
    }
    return null;
  })();
  if (!dropdownClosed || input.getAttribute("aria-invalid") === "true" || errorNode) {
    return {
      ok: false,
      error:
        `Adresse non validée par Leboncoin après sélection de "${chosen}"` +
        (errorNode ? ` — message affiché: "${errorNode.textContent.trim().slice(0, 120)}"` : "") +
        ". Vérifier l'adresse dans les Réglages FillSell. Le brouillon Leboncoin est conservé.",
    };
  }

  if (normalizeFuzzy(chosen) !== normalizeFuzzy(adresse)) {
    const note = `adresse: "${adresse}" → suggestion LBC "${chosen}"`;
    console.log(`[leboncoin] ≈ ${note}`);
    warnings.push(note);
  }
  return { ok: true };
}

// Clic "réel" : certains composants React de Leboncoin ignorent un
// MouseEvent click isolé (même famille de composants que l'autocomplete) —
// on rejoue la séquence complète pointerdown → mousedown → pointerup →
// mouseup → click, comme une vraie interaction.
function realClick(el) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
  }
}

// ── Helpers génériques (repris de vinted.js — candidats à un shared-fill.js
// commun quand les deux handlers seront stabilisés) ─────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForElement(selector, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Élément introuvable: ${selector}`));
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Polling générique d'une condition (retourne null au timeout, ne rejette pas).
async function waitFor(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(120);
  }
  return null;
}

function setNativeValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// ⚠️ Les inputs React de Leboncoin (titre, adresse) IGNORENT setNativeValue +
// event "input" : le compteur reste à 0/200 et les suggestions/autocomplete
// ne se déclenchent JAMAIS (vérifié en dry-run réel — contrairement à Vinted).
// execCommand("insertText") insère comme une vraie frappe et déclenche bien
// les handlers React ; on garde setNativeValue en repli si execCommand échoue.
async function typeInto(input, text) {
  input.focus();
  // Vider une éventuelle valeur existante (sélection totale puis remplacement).
  try {
    input.setSelectionRange?.(0, input.value.length);
  } catch { /* certains types d'input n'exposent pas setSelectionRange */ }
  const ok = document.execCommand("insertText", false, text);
  if (!ok || input.value !== text) {
    // Repli : frappe caractère par caractère via le setter natif.
    setNativeValue(input, "");
    for (const char of text) {
      setNativeValue(input, input.value + char);
      await sleep(35);
    }
  }
  await sleep(CLICK_DELAY);
}

// Renseigne un champ texte/textarea de l'aperçu (description, prix) de façon
// robuste : execCommand d'abord (comme typeInto), setNativeValue en repli.
function setFieldValue(el, value) {
  el.focus();
  try { el.setSelectionRange?.(0, el.value.length); } catch { /* noop */ }
  const ok = document.execCommand("insertText", false, String(value));
  if (!ok || el.value !== String(value)) setNativeValue(el, String(value));
}

function findButtonByExactText(text) {
  const candidates = document.querySelectorAll('button, [role="button"]');
  for (const el of candidates) {
    if (el.textContent.trim() === text) return el;
  }
  return null;
}

const normalizeFuzzy = (s) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function containsAsWords(hay, needle) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

// Cascade v2 identique à vinted.js : exact → option⊂valeur (la plus longue) →
// valeur⊂option (la plus courte) → composants (et/,/&/+) → null.
function findOptionCascade(root, optionSelector, text) {
  const options = Array.from(root.querySelectorAll(optionSelector))
    .map((el) => ({ el, label: el.textContent.trim(), norm: normalizeFuzzy(el.textContent) }))
    .filter((o) => o.norm);
  if (!options.length) return null;
  const target = normalizeFuzzy(text);

  const exact = options.find(
    (o) => o.norm === target || o.label.split("/").some((p) => normalizeFuzzy(p) === target)
  );
  if (exact) return { ...exact, stage: "exact" };

  const optionInTarget = (t) =>
    options.filter((o) => containsAsWords(t, o.norm)).sort((a, b) => b.norm.length - a.norm.length)[0];
  const fuzzy = optionInTarget(target);
  if (fuzzy) return { ...fuzzy, stage: "fuzzy" };

  const targetInOption = (t) =>
    options.filter((o) => containsAsWords(o.norm, t)).sort((a, b) => a.norm.length - b.norm.length)[0];
  const inverse = targetInOption(target);
  if (inverse) return { ...inverse, stage: "fuzzy-inverse" };

  const components = target.split(/\s+et\s+|[,&+/]/).map((c) => c.trim()).filter(Boolean);
  if (components.length > 1) {
    for (const comp of components) {
      const compExact = options.find((o) => o.norm === comp);
      if (compExact) return { ...compExact, stage: "composant" };
      const compFuzzy = optionInTarget(comp) || targetInOption(comp);
      if (compFuzzy) return { ...compFuzzy, stage: "composant" };
    }
  }
  return null;
}

async function urlToFile(url, index) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new File([blob], `photo_${index}.${ext}`, { type: blob.type });
}

async function uploadPhotos(input, photos) {
  const files = await Promise.all(photos.map((p, i) => urlToFile(p.url, i)));
  const dataTransfer = new DataTransfer();
  files.forEach((f) => dataTransfer.items.add(f));
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(1500 * files.length);
}

console.log("[leboncoin] Content script FillSell chargé (DRY_RUN =", DRY_RUN, ", wizard-v4: univers radios/pills + erreurs de validation remontées)");
