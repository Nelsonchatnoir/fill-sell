// ═══════════════════════════════════════════════════════════════════════════
// coin_config RELU SEULEMENT QUAND IL A CHANGÉ (02/11/2026, facture Supabase — migration 20261102160000)
// ═══════════════════════════════════════════════════════════════════════════
// get-pending-jobs lisait coin_config 7 fois par poll (~170 000 lectures par jour) pour une table de 110 lignes qui
// change quelques fois par semaine. La base tient une VERSION de coin_config (signal_global, incrémentée par un
// déclencheur dans la transaction de chaque écriture), rendue par signal_poll en tête de poll. Ici :
//   · version connue et égale à celle du cache → la table en mémoire de l'instance (aucune lecture) ;
//   · version différente → la table ENTIÈRE est relue une fois, puis servie ;
//   · version inconnue (null : signal illisible) → la requête d'origine, telle quelle (comportement d'avant).
// Exact : la table relue après la lecture de la version est au moins aussi récente qu'elle ; un changement plus
// tardif change la version, vue au poll suivant — comme une lecture faite un instant plus tôt dans le poll d'avant.
// Chaque lecteur reçoit la forme que lui rendait PostgREST ({ data, error }). Pur (Deno + Node).

let cache = null;   // { version, lignes: Map<key, value> }

/** Vide le cache (tests). */
export function viderCoinConfig() { cache = null; }

async function table(client, version) {
  if (cache && cache.version === version) return { lignes: cache.lignes, error: null };
  const { data, error } = await client.from("coin_config").select("key, value");
  if (error || !Array.isArray(data)) return { lignes: null, error: error ?? { message: "coin_config illisible" } };
  const lignes = new Map(data.map((r) => [String(r.key), r.value]));
  cache = { version, lignes };
  return { lignes, error: null };
}

/** = `client.from("coin_config").select("value").eq("key", cle).maybeSingle()` */
export async function configUne(client, cle, version) {
  if (typeof version !== "number") return await client.from("coin_config").select("value").eq("key", cle).maybeSingle();
  const { lignes, error } = await table(client, version);
  if (!lignes) return { data: null, error };
  return { data: lignes.has(cle) ? { value: lignes.get(cle) } : null, error: null };
}

/** = `client.from("coin_config").select("key, value").in("key", cles)` */
export async function configPlusieurs(client, cles, version) {
  if (typeof version !== "number") return await client.from("coin_config").select("key, value").in("key", cles);
  const { lignes, error } = await table(client, version);
  if (!lignes) return { data: null, error };
  return { data: cles.filter((k) => lignes.has(k)).map((k) => ({ key: k, value: lignes.get(k) })), error: null };
}

/** LIKE de SQL (sensible à la casse) : « _ » = un caractère, « % » = n'importe quelle suite. */
export function commeLike(motif) {
  const re = String(motif).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, ".").replace(/%/g, "[\\s\\S]*");
  return new RegExp(`^${re}$`);
}

/** = `client.from("coin_config").select("key, value").like("key", `${prefixe}%`)` — même sémantique que LIKE. */
export async function configPrefixe(client, prefixe, version) {
  if (typeof version !== "number") return await client.from("coin_config").select("key, value").like("key", `${prefixe}%`);
  const { lignes, error } = await table(client, version);
  if (!lignes) return { data: null, error };
  const re = commeLike(`${prefixe}%`);
  return { data: [...lignes].filter(([k]) => re.test(k)).map(([key, value]) => ({ key, value })), error: null };
}
