// ═══════════════════════════════════════════════════════════════════════════
// LE CACHE DES QUESTIONS POSÉES À L'IA (18/10 nuit, point 5)
// ═══════════════════════════════════════════════════════════════════════════
// Une question = l'empreinte sha256 EXACTE de ce qui part chez Anthropic
// (modèle, consigne, message, max_tokens, temperature). La même question reçoit
// la réponse déjà payée (table ia_questions_cache, service_role seulement) ; la
// réponse — neuve ou relue — passe par LES MÊMES contrôles chez l'appelant :
// ce module ne rend que le TEXTE du modèle, jamais une décision.
//   · le message contient le contenu de l'article, la plateforme et la liste
//     des champs / candidates : l'article change → nouvelle empreinte ;
//   · 30 jours au plus ; une ligne plus vieille est remplacée ;
//   · un interrupteur coin_config PAR FONCTION (lu une fois par minute et par
//     instance) : `ia_cache_categorie` (resolve-categorie, température 0),
//     `ia_cache_aspects` (aspects eBay / Leboncoin / Beebs) ; éteint =
//     exactement le chemin d'avant ;
//   · tout échec du cache (table absente, réseau) = la question part à l'IA.
// Pur côté décision ; seules lireCache / rangerCache / cacheAllume touchent la base.

// deno-lint-ignore no-explicit-any
type Admin = any;

export const CACHE_JOURS = 30;

/** JSON stable (clés triées) : deux corps égaux donnent la même chaîne. */
export function jsonStable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(jsonStable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${jsonStable(o[k])}`).join(",")}}`;
}

/** L'empreinte d'une question (corps de l'appel Anthropic, sans la clé API). */
export async function empreinteQuestion(corps: Record<string, unknown>): Promise<string> {
  const { model, system, messages, max_tokens, temperature } = corps ?? {};
  const texte = jsonStable({ model, system, messages, max_tokens, temperature: temperature ?? null });
  const octets = new TextEncoder().encode(texte);
  const h = await crypto.subtle.digest("SHA-256", octets);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const interrupteurs = new Map<string, { valeur: boolean; lu: number }>();
/** Un interrupteur coin_config (1 = allumé ; absent, illisible = éteint), relu au plus une fois par minute. */
export async function cacheAllume(admin: Admin, cleInterrupteur: string): Promise<boolean> {
  if (!admin || !cleInterrupteur) return false;
  const deja = interrupteurs.get(cleInterrupteur);
  if (deja && Date.now() - deja.lu < 60_000) return deja.valeur;
  let valeur = false;
  try {
    const { data } = await admin.from("coin_config").select("value").eq("key", cleInterrupteur).maybeSingle();
    valeur = Number(data?.value) === 1;
  } catch { valeur = false; }
  interrupteurs.set(cleInterrupteur, { valeur, lu: Date.now() });
  return valeur;
}

/** La réponse déjà payée pour cette empreinte (≤ 30 jours), sinon null. */
export async function lireCache(admin: Admin, cle: string): Promise<string | null> {
  try {
    const depuis = new Date(Date.now() - CACHE_JOURS * 86_400_000).toISOString();
    const { data, error } = await admin.from("ia_questions_cache").select("reponse, usages")
      .eq("cle", cle).gte("cree_le", depuis).maybeSingle();
    if (error || !data || typeof data.reponse !== "string") return null;
    // Compteur best-effort (une écriture par relecture, jamais bloquante).
    admin.from("ia_questions_cache").update({ usages: (Number(data.usages) || 0) + 1, dernier_usage_le: new Date().toISOString() })
      .eq("cle", cle).then(() => {}, () => {});
    return data.reponse;
  } catch {
    return null;
  }
}

/** Range une réponse neuve (remplace une ligne de plus de 30 jours). */
export async function rangerCache(admin: Admin, cle: string, fonction: string, modele: string, reponse: string, usage?: { input_tokens?: number; output_tokens?: number } | null): Promise<void> {
  if (!reponse || reponse.length > 20000) return;
  try {
    await admin.from("ia_questions_cache").upsert({
      cle, fonction, modele, reponse,
      tokens_entree: Number(usage?.input_tokens) || null, tokens_sortie: Number(usage?.output_tokens) || null,
      cree_le: new Date().toISOString(), dernier_usage_le: new Date().toISOString(), usages: 0,
    }, { onConflict: "cle" });
    // Ménage borné : une fois sur cent rangements, les réponses de plus de
    // 30 jours partent (index sur cree_le ; jamais d'intervalle, jamais de cron).
    if (Math.random() < 0.01) {
      admin.from("ia_questions_cache").delete().lt("cree_le", new Date(Date.now() - CACHE_JOURS * 86_400_000).toISOString())
        .then(() => {}, () => {});
    }
  } catch { /* le cache ne fait jamais échouer une question */ }
}

/**
 * Pose une question à Anthropic, par le cache quand il est allumé.
 * Rend { texte, data, depuisCache } — `data` est la réponse brute de l'API
 * (null depuis le cache : aucun appel, aucun coût), `texte` le contenu texte.
 * Une réponse HTTP en erreur n'est jamais rangée.
 */
export async function questionClaude(
  corps: Record<string, unknown>,
  // forcer : le banc de comparaison seulement (ia-banc-deduction), jamais en service.
  opts: { apiKey: string; admin?: Admin; fonction: string; interrupteur: string; fetchFn?: typeof fetch; forcer?: boolean },
): Promise<{ texte: string; data: unknown; depuisCache: boolean; ok: boolean; statut: number; erreur?: string }> {
  const allume = opts.admin ? (opts.forcer === true || await cacheAllume(opts.admin, opts.interrupteur)) : false;
  const cle = allume ? await empreinteQuestion(corps) : null;
  if (allume && cle) {
    const deja = await lireCache(opts.admin, cle);
    if (deja !== null) return { texte: deja, data: null, depuisCache: true, ok: true, statut: 200 };
  }
  const f = opts.fetchFn ?? fetch;
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(corps),
  });
  if (!res.ok) return { texte: "", data: null, depuisCache: false, ok: false, statut: res.status, erreur: (await res.text()).slice(0, 300) };
  const data = await res.json();
  // (18/10, zéro friction) Le premier bloc TEXTE : un modèle 5.5 peut ouvrir sa réponse par un bloc de réflexion.
  const blocs = Array.isArray(data?.content) ? data.content : [];
  const texte = String(blocs.find((b: { type?: string }) => b?.type === "text")?.text ?? blocs[0]?.text ?? "");
  if (allume && cle && texte) await rangerCache(opts.admin, cle, opts.fonction, String(corps.model ?? ""), texte, data?.usage ?? null);
  return { texte, data, depuisCache: false, ok: true, statut: res.status };
}
