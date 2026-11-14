// ═══════════════════════════════════════════════════════════════════════════
// LE FILET DE LA DÉPENSE IA — CODÉ EN DUR, 50 $ PAR JOUR (14/11/2026, lot de Nico, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// RÈGLE DE NICO (14/11) : RIEN NE DOIT ÊTRE BLOQUÉ. Ce qui rend chaque compte
// rentable, ce sont les QUOTAS DE SON PALIER (quotas_etat, clés quota_* de
// coin_config) — jamais un plafond global. Le plafond global n'est plus qu'un
// FILET contre un bug en boucle : 50 $ par jour de dépense Anthropic, pour
// chaque niveau, et plus aucun plafond par mois.
//   Avant (18/10) : « moteur » 6 $/j et 120 $/mois, « confort » 9 $/j et
//   160 $/mois, « essentiel » 14 $/j et 185 $/mois. Le 14/11, 10,18 $ dépensés :
//   le choix du rayon et l'identify coupés pour tout le monde jusqu'à minuit
//   (refus 429 identify_unavailable dans le pré-contrôle eBay) ; et novembre,
//   à 77 $ le 14, aurait refermé le « moteur » vers le 22/11, puis le reste.
//
// LES TROIS NIVEAUX restent (chaque appelant sait ce qu'il fait sans l'IA) :
//   · « moteur »    : relectures, leviers → au-delà : la question, comme avant ;
//   · « confort »   : rayon, champs, aspects, couleur, identify → au-delà : la
//                     réponse « ia_indisponible » que l'appelant sait traiter ;
//   · « essentiel » : Lens et la rédaction → au-delà : EXACTEMENT comme une
//                     panne de l'IA (rédaction : textes de repli, unité rendue ;
//                     scan : « IA indisponible », la fiche se crée sans analyse).
//   Au-delà du filet, AUCUNE action de l'utilisateur ni publication n'est
//   refusée : elle continue sans l'aide de l'IA.
// LE SIGNAL : dès 80 % du filet (40 $), puis à 100 %, une ligne usage_logs
// (user_id NULL, feature « ia_plafond_approche » / « ia_plafond_atteint »,
// une par jour de Paris) — elle remonte dans les check news.
// Le compteur illisible (panne de base) : l'essentiel et le confort PASSENT
// (une panne de compteur n'est pas une dépense), le moteur ne passe pas.
// Lecture : ia_depense_etat() (service_role), gardée 60 s en mémoire.
// ⛔ Ces nombres ne se changent qu'ici, dans le code, sur décision de Nico.

export const FILET_JOUR_USD = 50;
export const SEUIL_SIGNAL = 0.8;

export const PLAFONDS_ANTHROPIC_USD = Object.freeze({
  moteur: Object.freeze({ jour: FILET_JOUR_USD }),
  confort: Object.freeze({ jour: FILET_JOUR_USD }),
  essentiel: Object.freeze({ jour: FILET_JOUR_USD }),
});

export type NiveauIa = keyof typeof PLAFONDS_ANTHROPIC_USD;
export type EtatBudget = { anthropic_jour: number; anthropic_mois?: number; openai_jour?: number; jour?: string } | null;

/** Règle pure : le niveau peut-il appeler l'IA ? (etat null = compteur illisible) */
export function budgetOuvert(niveau: NiveauIa, etat: EtatBudget): { ouvert: boolean; motif: string | null } {
  const p = PLAFONDS_ANTHROPIC_USD[niveau];
  if (!p) return { ouvert: false, motif: "niveau_inconnu" };
  if (!etat || !Number.isFinite(Number(etat.anthropic_jour))) {
    return niveau === "moteur" ? { ouvert: false, motif: "compteur_illisible" } : { ouvert: true, motif: null };
  }
  if (Number(etat.anthropic_jour) >= p.jour) return { ouvert: false, motif: `plafond_jour_${p.jour}` };
  return { ouvert: true, motif: null };
}

/** Règle pure : quel signal la dépense du jour appelle-t-elle ? (null : aucun) */
export function signalDuJour(etat: EtatBudget): { feature: "ia_plafond_approche" | "ia_plafond_atteint"; pct: number } | null {
  if (!etat || !Number.isFinite(Number(etat.anthropic_jour))) return null;
  const pct = Number(etat.anthropic_jour) / FILET_JOUR_USD;
  if (pct >= 1) return { feature: "ia_plafond_atteint", pct };
  if (pct >= SEUIL_SIGNAL) return { feature: "ia_plafond_approche", pct };
  return null;
}

let cache: { le: number; etat: EtatBudget } | null = null;
// Les signaux déjà posés par CETTE instance (clé « jour:feature ») : la base n'est relue qu'une fois.
const signauxPoses = new Set<string>();

// deno-lint-ignore no-explicit-any
type Admin = { rpc: (f: string, a?: Record<string, unknown>) => any; from?: (t: string) => any };

/** L'état du compteur (60 s de cache par instance de fonction), null si illisible. */
export async function lireBudgetIa(admin: Admin): Promise<EtatBudget> {
  if (cache && Date.now() - cache.le < 60_000) return cache.etat;
  let etat: EtatBudget = null;
  try {
    const { data, error } = await admin.rpc("ia_depense_etat");
    if (!error && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      etat = { anthropic_jour: Number(d.anthropic_jour), anthropic_mois: Number(d.anthropic_mois), openai_jour: Number(d.openai_jour), jour: typeof d.jour === "string" ? d.jour : undefined };
    }
  } catch { etat = null; }
  cache = { le: Date.now(), etat };
  return etat;
}

/** Pose le signal du jour (80 % ou 100 %) une seule fois par jour de Paris. Ne lève jamais. */
export async function poserSignalBudget(admin: Admin, etat: EtatBudget, fonction: string): Promise<void> {
  const s = signalDuJour(etat);
  if (!s || !etat?.jour || typeof admin.from !== "function") return;
  const cle = `${etat.jour}:${s.feature}`;
  if (signauxPoses.has(cle)) return;
  signauxPoses.add(cle);
  try {
    const { data: deja } = await admin.from("usage_logs").select("id").is("user_id", null).eq("feature", s.feature)
      .gte("created_at", new Date(Date.now() - 30 * 3600_000).toISOString()).eq("metadata->>jour", etat.jour).limit(1);
    if (Array.isArray(deja) && deja.length) return;
    await admin.from("usage_logs").insert({
      user_id: null, feature: s.feature,
      metadata: {
        jour: etat.jour, fournisseur: "anthropic", depense_jour_usd: Number(Number(etat.anthropic_jour).toFixed(2)),
        filet_jour_usd: FILET_JOUR_USD, pct: Math.round(s.pct * 100), seuil_signal_pct: Math.round(SEUIL_SIGNAL * 100),
        openai_jour_usd: Number.isFinite(Number(etat.openai_jour)) ? Number(Number(etat.openai_jour).toFixed(2)) : null,
        fonction,
      },
    });
    console.warn(`[budget-ia] signal ${s.feature} posé : ${Number(etat.anthropic_jour).toFixed(2)} $ sur ${FILET_JOUR_USD} $ (${Math.round(s.pct * 100)} %)`);
  } catch (e) {
    console.error("[budget-ia] signal non posé :", (e as Error)?.message ?? e);
  }
}

/** Le coupe-circuit : true si l'appel peut partir. Toute coupure est dite dans les journaux. */
export async function budgetIaAutorise(admin: Admin, niveau: NiveauIa, fonction: string): Promise<{ ouvert: boolean; motif: string | null }> {
  const etat = await lireBudgetIa(admin);
  await poserSignalBudget(admin, etat, fonction);
  const r = budgetOuvert(niveau, etat);
  if (!r.ouvert) console.warn(`[budget-ia] ${fonction} : appel IA « ${niveau} » coupé (${r.motif}) — chemin sans IA, rien n'est bloqué`);
  return r;
}
