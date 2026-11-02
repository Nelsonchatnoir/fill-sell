// ═══════════════════════════════════════════════════════════════════════════
// coin_config LU UNE FOIS PAR MINUTE ET PAR INSTANCE, JAMAIS À CHAQUE APPEL (02/11/2026, facture Supabase)
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré le 02/11 (journaux de la passerelle, 24 h) : 171 417 lectures de coin_config par les fonctions — 7 par poll
// de get-pending-jobs (opla_sortie_le, keepalive_actif, prevol_copie_actif, lecture_fond_mode, …), pour une table de
// 110 lignes (6,8 Ko) qui change quelques fois par semaine. Ici : la table ENTIÈRE est lue une fois, gardée 60 s dans
// la mémoire de l'instance, et chaque lecteur reçoit EXACTEMENT la forme que lui rendait PostgREST
// ({ data, error }) — rien ne change pour lui. Lisible par tous (politique « readable by all users ») : le client
// passé (utilisateur ou service) lit la même chose.
// ⛔ Une lecture en erreur ne remplace jamais une table connue : on garde la précédente (60 s de plus au plus) ; sans
//    table connue, l'erreur est rendue telle quelle — le lecteur garde son repli d'avant.
// Un réglage changé en base est vu en 60 s au plus. Pur (Deno + Node).

export const COIN_CONFIG_TTL_MS = 60_000;

let cache = null;      // { le: ms, lignes: Map<key, value> }
let enCours = null;    // Promise<Map|null> — une seule lecture à la fois

/** Vide le cache (tests). */
export function viderCoinConfig() { cache = null; enCours = null; }

/** La table entière (Map key → value), ou null si elle n'a jamais pu être lue. */
export async function tableCoinConfig(client, maintenant = Date.now()) {
  if (cache && maintenant - cache.le < COIN_CONFIG_TTL_MS) return { lignes: cache.lignes, error: null };
  if (!enCours) {
    enCours = (async () => {
      try {
        const { data, error } = await client.from("coin_config").select("key, value");
        if (error || !Array.isArray(data)) return { lignes: cache?.lignes ?? null, error: error ?? { message: "coin_config illisible" } };
        const lignes = new Map(data.map((r) => [String(r.key), r.value]));
        cache = { le: Date.now(), lignes };
        return { lignes, error: null };
      } catch (e) {
        return { lignes: cache?.lignes ?? null, error: { message: String(e?.message ?? e) } };
      } finally {
        enCours = null;
      }
    })();
  }
  return await enCours;
}

/** = `client.from("coin_config").select("value").eq("key", cle).maybeSingle()` */
export async function configUne(client, cle) {
  const { lignes, error } = await tableCoinConfig(client);
  if (!lignes) return { data: null, error };
  return { data: lignes.has(cle) ? { value: lignes.get(cle) } : null, error: null };
}

/** = `client.from("coin_config").select("key, value").in("key", cles)` */
export async function configPlusieurs(client, cles) {
  const { lignes, error } = await tableCoinConfig(client);
  if (!lignes) return { data: null, error };
  return { data: cles.filter((k) => lignes.has(k)).map((k) => ({ key: k, value: lignes.get(k) })), error: null };
}

/** = `client.from("coin_config").select("key, value").like("key", `${prefixe}%`)` */
export async function configPrefixe(client, prefixe) {
  const { lignes, error } = await tableCoinConfig(client);
  if (!lignes) return { data: null, error };
  return { data: [...lignes].filter(([k]) => k.startsWith(prefixe)).map(([key, value]) => ({ key, value })), error: null };
}
