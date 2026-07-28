// Observation + garde-fou anti-abus des fonctions IA non facturées.
// Posé le 2026-07-28, avant lancement.
//
// Quatre fonctions (voice-parse, normalize-title, stats-analysis,
// lot-distribute) appelaient une API payante sans quota, sans Pépites et sans
// log : impossible de savoir combien de fois elles tournaient, donc impossible
// de chiffrer leur coût ou de repérer une boucle. Ce module apporte les deux
// briques manquantes, et RIEN d'autre : on ne facture pas, on ne restreint pas
// un usage normal.
//
// TROIS PRINCIPES :
//
// 1. VOIR D'ABORD. Le log part à chaque appel, avec les tokens et le coût.
//    C'est ce qui permettra de décider plus tard s'il faut facturer, et à
//    quel prix — décider sans mesure, c'est ce qu'on vient d'éviter.
//
// 2. LE GARDE-FOU ARRÊTE UNE BOUCLE, PAS UN UTILISATEUR. Les seuils sont
//    calibrés très au-dessus du maximum réellement observé en base : ils ne
//    peuvent être atteints que par un script ou une boucle infinie. Un
//    utilisateur, même très intensif, ne les verra jamais.
//
// 3. LA TÉLÉMÉTRIE NE CASSE JAMAIS L'APPEL. Toute erreur de lecture ou
//    d'écriture est avalée : si le comptage échoue, on LAISSE PASSER (on
//    n'invente pas un refus sur une panne de base), et si le log échoue, la
//    fonction répond quand même.

// Haiku 4.5 : 1 $/MTok en entrée, 5 $/MTok en sortie.
const PRIX_IN_PAR_TOKEN = 1 / 1_000_000;
const PRIX_OUT_PAR_TOKEN = 5 / 1_000_000;

export type UsageTokens = { in: number; out: number };

/** Extrait les tokens d'une réponse Anthropic, quelle que soit sa forme. */
export function tokensDe(reponse: unknown): UsageTokens {
  const u = (reponse as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  return { in: u?.input_tokens ?? 0, out: u?.output_tokens ?? 0 };
}

/**
 * Nombre d'appels de cette feature par cet utilisateur sur 24 h glissantes.
 * Renvoie null si le comptage est impossible — l'appelant doit alors LAISSER
 * PASSER : une panne de lecture ne doit pas se transformer en refus de service.
 */
async function appelsDernieres24h(
  admin: { from: (t: string) => any },
  userId: string,
  feature: string,
): Promise<number | null> {
  try {
    const depuis = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count, error } = await admin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", feature)
      .gte("created_at", depuis);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/**
 * Garde-fou : `true` si l'appel peut continuer. Un utilisateur non identifié
 * (pas de JWT exploitable) passe aussi — le but est d'arrêter une boucle
 * authentifiée, pas de durcir l'authentification, qui reste le travail du
 * gateway et du code appelant.
 */
export async function appelAutorise(
  admin: { from: (t: string) => any },
  userId: string | null,
  feature: string,
  seuilParJour: number,
): Promise<boolean> {
  if (!userId) return true;
  const n = await appelsDernieres24h(admin, userId, feature);
  if (n === null) return true;          // comptage impossible → on laisse passer
  return n < seuilParJour;
}

/**
 * Écrit une ligne usage_logs pour cet appel. Best-effort de bout en bout :
 * jamais awaité de manière bloquante par l'appelant si celui-ci préfère
 * répondre immédiatement, et toute erreur est avalée avec un log serveur.
 */
export async function loggerAppelIA(
  admin: { from: (t: string) => any },
  userId: string | null,
  feature: string,
  tokens: UsageTokens,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!userId) return;
  const cout = tokens.in * PRIX_IN_PAR_TOKEN + tokens.out * PRIX_OUT_PAR_TOKEN;
  try {
    await admin.from("usage_logs").insert({
      user_id: userId,
      feature,
      metadata: {
        ...extra,
        input_tokens: tokens.in,
        output_tokens: tokens.out,
        cost_usd: Number(cout.toFixed(6)),
      },
    });
  } catch (e) {
    console.error(`[${feature}] usage_logs:`, (e as Error)?.message);
  }
}
