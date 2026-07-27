// chrome-extension/selectors/resolve.js
//
// Couche de résolution en cascade au-dessus des registres déclaratifs
// (docs/SELECTOR_AUDIT.md → *.registry.js). Contrats :
//
// - resolveSelector(platform, key, root, params) parcourt la chaîne dans
//   l'ordre et s'arrête au premier maillon qui résout ET dont le bloc assert
//   passe. Un maillon qui résout mais dont l'assert échoue est un ÉCHEC de
//   maillon : on passe au suivant.
// - Si aucun maillon ne résout : SelectorResolutionError (platform, key,
//   criticality, nombre de maillons essayés). JAMAIS de retour null silencieux —
//   a fortiori sur une clé de criticité red.
// - Télémétrie (table public.selector_health) émise dès que via > 0 OU qu'un
//   assert a échoué en chemin, et sur échec total (resolved_via = -1).
//   Fire-and-forget : jamais bloquante, jamais de throw depuis la télémétrie.
// - Convention fenêtre non rendue (audit §9c) : les asserts de visibilité
//   n'utilisent QUE getComputedStyle — jamais offsetParent, getClientRects,
//   getBoundingClientRect ni innerText.
//
// Types de maillon résolvables ici : css, testid, xpath, text, template
// (params fournis à l'appel), dynamic (uniquement si params.selector est
// fourni). Les maillons 'signal' et les 'dynamic'/'text' sans littéral ne sont
// pas résolvables déclarativement : ils comptent comme maillons essayés en
// échec (leur migration se fera clé par clé, avec params).

import { VINTED_SELECTORS } from "./vinted.registry.js";
import { LEBONCOIN_SELECTORS } from "./leboncoin.registry.js";
import { EBAY_SELECTORS } from "./ebay.registry.js";
import { BEEBS_SELECTORS } from "./beebs.registry.js";
import { getInstallId } from "./installId.js";

const REGISTRIES = {
  vinted: VINTED_SELECTORS,
  leboncoin: LEBONCOIN_SELECTORS,
  ebay: EBAY_SELECTORS,
  beebs: BEEBS_SELECTORS,
};

export class SelectorResolutionError extends Error {
  constructor({ platform, key, criticality, triedLinks }) {
    super(
      `[selectors] ${platform}/${key} (criticité ${criticality}) : aucun des ${triedLinks} maillon(s) n'a résolu`
    );
    this.name = "SelectorResolutionError";
    this.platform = platform;
    this.key = key;
    this.criticality = criticality;
    this.triedLinks = triedLinks;
  }
}

function registryEntry(platform, key) {
  const registry = REGISTRIES[platform];
  if (!registry) {
    throw new Error(`[selectors] plateforme inconnue : ${platform}`);
  }
  const entry = registry[key];
  if (!entry) {
    throw new Error(`[selectors] clé inconnue : ${platform}/${key}`);
  }
  return entry;
}

// Échappement d'une valeur injectée dans un sélecteur d'attribut entre guillemets.
function escapeForAttr(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function cssForLink(link, params) {
  switch (link.type) {
    case "css":
      return link.value;
    case "testid":
      return `[data-testid="${escapeForAttr(link.value)}"]`;
    case "template": {
      if (!params) return null;
      let out = link.value;
      for (const p of link.params || []) {
        if (params[p] === undefined || params[p] === null) return null;
        out = out.split(`{${p}}`).join(escapeForAttr(params[p]));
      }
      return out;
    }
    case "dynamic":
      // Non résolvable déclarativement, sauf sélecteur construit fourni à l'appel.
      return typeof params?.selector === "string" ? params.selector : null;
    default:
      return null; // 'signal' et types inconnus : pas des sélecteurs d'élément
  }
}

// Candidats d'un maillon, dans l'ordre du document. Tableau vide = maillon non résolu.
function linkCandidates(link, root, params) {
  try {
    if (link.type === "xpath") {
      const doc = root.ownerDocument || root;
      const result = doc.evaluate(
        link.value,
        root,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      const out = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i);
        if (node && node.nodeType === 1) out.push(node);
      }
      return out;
    }
    if (link.type === "text") {
      if (!link.scope || !link.textMatches) return []; // libellé non littéralisé dans l'audit
      const re = new RegExp(link.textMatches, "i");
      return Array.from(root.querySelectorAll(link.scope)).filter((el) =>
        re.test((el.textContent || "").trim())
      );
    }
    const css = cssForLink(link, params);
    if (!css) return [];
    return Array.from(root.querySelectorAll(css));
  } catch (_) {
    // Sélecteur invalide sur cette page / API absente : maillon en échec, la
    // cascade continue.
    return [];
  }
}

// Asserts post-résolution, pré-action. Fenêtre non rendue (§9c) : visibilité
// par getComputedStyle uniquement.
function assertPasses(el, assert) {
  if (!assert) return true;
  try {
    if (assert.tag && el.tagName.toLowerCase() !== assert.tag.toLowerCase()) {
      return false;
    }
    if (assert.visible) {
      if (!el.isConnected) return false;
      const win = el.ownerDocument && el.ownerDocument.defaultView;
      if (win) {
        const cs = win.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
      }
    }
    if (assert.enabled) {
      if (el.disabled === true) return false;
      if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return false;
    }
    if (assert.textMatches) {
      const re = new RegExp(assert.textMatches, "i");
      if (!re.test((el.textContent || "").trim())) return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

// --- Télémétrie selector_health -------------------------------------------
// Anonyme (install_id seulement), fire-and-forget, dédupliquée en mémoire pour
// ne pas marteler l'API quand une même dégradation se répète dans la session.

const TELEMETRY_DEDUPE_MS = 10 * 60 * 1000;
const telemetrySent = new Map(); // "platform/key/via/assert" -> timestamp

function telemetryConfig() {
  const cfg = globalThis.FILLSELL_CONFIG;
  return {
    url: cfg?.SUPABASE_URL || "https://tojihnuawsoohlolangc.supabase.co",
    anonKey: cfg?.SUPABASE_ANON_KEY || "sb_publishable_0GoTciuApxM64_zrq3h43Q_c2Z6Obyr",
  };
}

function extensionVersion() {
  try {
    return globalThis.chrome?.runtime?.getManifest?.().version || null;
  } catch (_) {
    return null;
  }
}

function reportSelectorHealth(platform, key, resolvedVia, assertPassed) {
  try {
    const dedupeKey = `${platform}/${key}/${resolvedVia}/${assertPassed}`;
    const last = telemetrySent.get(dedupeKey);
    const now = Date.now();
    if (last && now - last < TELEMETRY_DEDUPE_MS) return;
    telemetrySent.set(dedupeKey, now);

    // Chaîne async détachée — l'appelant n'attend jamais la télémétrie.
    getInstallId()
      .then((installId) => {
        const { url, anonKey } = telemetryConfig();
        return fetch(`${url}/rest/v1/selector_health`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            install_id: installId,
            platform,
            selector_key: key,
            resolved_via: resolvedVia,
            assert_passed: assertPassed,
            extension_version: extensionVersion(),
          }),
        });
      })
      .catch(() => {});
  } catch (_) {
    // Jamais de throw depuis la télémétrie.
  }
}

// --- API publique ----------------------------------------------------------

// resolveSelector(platform, key, root?, params?) →
//   { el, via, key, platform } — via = index du maillon ayant résolu.
// params : valeurs des maillons 'template' ({ n: 2 }, { itemId: "…" }) et,
// pour les maillons 'dynamic', un sélecteur déjà construit ({ selector: "…" }).
export function resolveSelector(platform, key, root = document, params = undefined) {
  const entry = registryEntry(platform, key);
  const chain = entry.chain || [];
  let assertFailed = false;

  for (let via = 0; via < chain.length; via++) {
    const candidates = linkCandidates(chain[via], root, params);
    if (!candidates.length) continue;
    const el = candidates.find((c) => assertPasses(c, entry.assert)) || null;
    if (!el) {
      // Le maillon résout mais l'assert échoue : échec du maillon, on cascade.
      assertFailed = true;
      continue;
    }
    if (via > 0 || assertFailed) {
      reportSelectorHealth(platform, key, via, !assertFailed);
    }
    return { el, via, key, platform };
  }

  reportSelectorHealth(platform, key, -1, false);
  throw new SelectorResolutionError({
    platform,
    key,
    criticality: entry.criticality,
    triedLinks: chain.length,
  });
}

// resolveSelectorAll(platform, key, root?, params?) →
//   { els, via, key, platform } — tous les candidats du premier maillon dont au
//   moins un élément passe l'assert (les éléments en échec d'assert sont exclus).
export function resolveSelectorAll(platform, key, root = document, params = undefined) {
  const entry = registryEntry(platform, key);
  const chain = entry.chain || [];
  let assertFailed = false;

  for (let via = 0; via < chain.length; via++) {
    const candidates = linkCandidates(chain[via], root, params);
    if (!candidates.length) continue;
    const els = candidates.filter((c) => assertPasses(c, entry.assert));
    if (!els.length) {
      assertFailed = true;
      continue;
    }
    if (via > 0 || assertFailed) {
      reportSelectorHealth(platform, key, via, !assertFailed);
    }
    return { els, via, key, platform };
  }

  reportSelectorHealth(platform, key, -1, false);
  throw new SelectorResolutionError({
    platform,
    key,
    criticality: entry.criticality,
    triedLinks: chain.length,
  });
}
