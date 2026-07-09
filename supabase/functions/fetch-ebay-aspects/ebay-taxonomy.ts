// Client de l'API eBay Taxonomy — auth OAuth (client credentials) + lecture
// des aspects par catégorie.
//
// Sources (documentation officielle, vérifiée le 2026-07-09) :
//   OAuth token           POST /identity/v1/oauth2/token
//                         Basic base64(client_id:client_secret),
//                         grant_type=client_credentials,
//                         scope=https://api.ebay.com/oauth/api_scope
//   Arbre par défaut      GET  /commerce/taxonomy/v1/get_default_category_tree_id
//                              ?marketplace_id=EBAY_FR
//                         → { categoryTreeId, categoryTreeVersion }
//   Dump complet          GET  /commerce/taxonomy/v1/category_tree/{id}/fetch_item_aspects
//                         → fichier JSON GZIPPÉ (content-type
//                           application/octet-stream, >100 Mo compressé
//                           possible), structure :
//                           { categoryTreeId, categoryTreeVersion,
//                             categoryAspects: [
//                               { category: { categoryId, categoryName },
//                                 aspects: [ { localizedAspectName,
//                                              aspectConstraint: {...},
//                                              aspectValues: [...] } ] } ] }
//   Repli par catégorie   GET  /commerce/taxonomy/v1/category_tree/{id}/get_item_aspects_for_category
//                              ?category_id=X
//                         → { aspects: [ même forme d'Aspect ] }
//
// ⚠️ Le scope OAuth reste littéralement "https://api.ebay.com/oauth/api_scope"
// même en sandbox : c'est un identifiant de scope, pas une URL appelée.
// Seul le HOST change (api.sandbox.ebay.com vs api.ebay.com).

export type EbayEnv = "sandbox" | "production";

export const EBAY_HOSTS: Record<EbayEnv, string> = {
  sandbox: "https://api.sandbox.ebay.com",
  production: "https://api.ebay.com",
};

export const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";

/** Aspect normalisé tel que stocké dans public.ebay_item_aspects.aspects */
export interface NormalizedAspect {
  name: string;
  required: boolean;
  dataType: string | null;
  format: string | null;
  mode: string | null;
  cardinality: string | null;
  /** Valeurs autorisées ; [] si l'aspect est en saisie libre (FREE_TEXT). */
  allowedValues: string[];
}

/** Forme brute renvoyée par l'API (champs eBay, non renommés). */
interface RawAspect {
  localizedAspectName?: string;
  aspectConstraint?: {
    aspectDataType?: string;
    aspectFormat?: string;
    aspectRequired?: boolean;
    aspectMode?: string;
    itemToAspectCardinality?: string;
    aspectUsage?: string;
    aspectEnabledForVariations?: boolean;
  };
  aspectValues?: Array<{ localizedValue?: string }>;
}

interface RawCategoryAspect {
  category?: { categoryId?: string; categoryName?: string };
  aspects?: RawAspect[];
}

export interface FetchItemAspectsDump {
  categoryTreeId?: string;
  categoryTreeVersion?: string;
  categoryAspects?: RawCategoryAspect[];
}

/**
 * Normalise un aspect brut. `aspectRequired` absent ⇒ false (eBay omet le
 * champ quand il est faux) — c'est une lecture du contrat, pas une supposition
 * sur la catégorie.
 */
export function normalizeAspect(raw: RawAspect): NormalizedAspect {
  const c = raw.aspectConstraint ?? {};
  return {
    name: raw.localizedAspectName ?? "",
    required: c.aspectRequired === true,
    dataType: c.aspectDataType ?? null,
    format: c.aspectFormat ?? null,
    mode: c.aspectMode ?? null,
    cardinality: c.itemToAspectCardinality ?? null,
    allowedValues: (raw.aspectValues ?? [])
      .map((v) => v.localizedValue ?? "")
      .filter(Boolean),
  };
}

/**
 * Indexe le dump fetchItemAspects par categoryId, en ne gardant QUE les
 * catégories demandées. Les catégories absentes du dump ne sont pas inventées :
 * l'appelant les traitera en status 'not_found'.
 */
export function indexDumpByCategory(
  dump: FetchItemAspectsDump,
  wantedIds: Set<string>,
): Map<string, NormalizedAspect[]> {
  const out = new Map<string, NormalizedAspect[]>();
  for (const entry of dump.categoryAspects ?? []) {
    const id = entry.category?.categoryId;
    if (!id || !wantedIds.has(id)) continue;
    out.set(id, (entry.aspects ?? []).map(normalizeAspect));
  }
  return out;
}

// ── OAuth : token applicatif, mis en cache jusqu'à son expiration ───────────
// Le token client_credentials vit ~2 h. On le garde en mémoire du worker et on
// le renouvelle 60 s avant l'échéance (marge de sécurité), plutôt que de
// ré-authentifier à chaque appel.
interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
const tokenCache = new Map<string, CachedToken>();

export function _resetTokenCache() {
  tokenCache.clear();
}

export async function getAppToken(opts: {
  env: EbayEnv;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<string> {
  const { env, clientId, clientSecret } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;

  const cacheKey = `${env}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now()) return cached.token;

  const basic = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: OAUTH_SCOPE,
  });

  const res = await doFetch(`${EBAY_HOSTS[env]}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OAuth eBay (${env}) → HTTP ${res.status} : ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("OAuth eBay : access_token absent de la réponse");

  const ttlMs = (data.expires_in ?? 7200) * 1000;
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: now() + ttlMs - 60_000, // marge : renouvelle 60 s avant l'échéance
  });
  return data.access_token;
}

async function taxonomyGet(
  path: string,
  opts: { env: EbayEnv; token: string; fetchImpl?: typeof fetch; raw?: boolean },
): Promise<Response> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${EBAY_HOSTS[opts.env]}/commerce/taxonomy/v1${path}`, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      // fetch_item_aspects renvoie un binaire gzip ; les autres du JSON.
      Accept: opts.raw ? "application/octet-stream" : "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Taxonomy GET ${path} → HTTP ${res.status} : ${body.slice(0, 300)}`);
  }
  return res;
}

export async function getDefaultCategoryTreeId(opts: {
  env: EbayEnv;
  token: string;
  marketplaceId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ categoryTreeId: string; categoryTreeVersion: string }> {
  const res = await taxonomyGet(
    `/get_default_category_tree_id?marketplace_id=${encodeURIComponent(opts.marketplaceId)}`,
    opts,
  );
  const data = await res.json();
  if (!data.categoryTreeId) {
    throw new Error(`get_default_category_tree_id : categoryTreeId absent (${JSON.stringify(data).slice(0, 200)})`);
  }
  return {
    categoryTreeId: String(data.categoryTreeId),
    categoryTreeVersion: String(data.categoryTreeVersion ?? ""),
  };
}

/** Dézippe un flux gzip et parse le JSON. */
export async function gunzipJson(res: Response): Promise<FetchItemAspectsDump> {
  if (!res.body) throw new Error("fetch_item_aspects : corps de réponse vide");
  // Certains proxys décompressent déjà le gzip et retirent content-encoding.
  // On tente la décompression, et on retombe sur un parse direct si le flux
  // n'est pas gzippé (magic bytes 1f 8b absents → DecompressionStream throw).
  const buf = new Uint8Array(await res.arrayBuffer());
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!isGzip) return JSON.parse(new TextDecoder().decode(buf));

  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

export async function fetchItemAspects(opts: {
  env: EbayEnv;
  token: string;
  categoryTreeId: string;
  fetchImpl?: typeof fetch;
}): Promise<FetchItemAspectsDump> {
  const res = await taxonomyGet(
    `/category_tree/${encodeURIComponent(opts.categoryTreeId)}/fetch_item_aspects`,
    { ...opts, raw: true },
  );
  return gunzipJson(res);
}

/** Repli catégorie par catégorie (1 appel = 1 catégorie). */
export async function getItemAspectsForCategory(opts: {
  env: EbayEnv;
  token: string;
  categoryTreeId: string;
  categoryId: string;
  fetchImpl?: typeof fetch;
}): Promise<NormalizedAspect[]> {
  const res = await taxonomyGet(
    `/category_tree/${encodeURIComponent(opts.categoryTreeId)}/get_item_aspects_for_category` +
      `?category_id=${encodeURIComponent(opts.categoryId)}`,
    opts,
  );
  const data = await res.json();
  return ((data.aspects ?? []) as RawAspect[]).map(normalizeAspect);
}
