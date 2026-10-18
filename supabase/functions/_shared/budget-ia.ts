// ═══════════════════════════════════════════════════════════════════════════
// LE PLAFOND DE LA DÉPENSE IA — CODÉ EN DUR, COUPE-CIRCUIT AUTOMATIQUE (18/10, lot 2)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico : la dépense Anthropic totale reste SOUS 200 $/mois, avec de la
// marge. Mesuré le 18/10 (compteur ia_depense_jour, alimenté par usage_logs.
// metadata.cost_usd) : ≈ 89 $ en septembre, 54,8 $ du 01 au 18/10 (≈ 3,1 $/jour,
// pic 6,4 $), projection d'octobre ≈ 96 $.
//
// TROIS NIVEAUX, du moins utile au plus utile — au-delà de son plafond, un
// niveau RETOMBE SUR L'ANCIEN CHEMIN, sans rien casser :
//   · « moteur »    : ce que le lot 2 ajoute (relectures, lecture de photo au
//                     dépôt) → au-delà : la question, comme avant ;
//   · « confort »   : choix de rayon dans une liste, champs, aspects, couleur
//                     (resolve-categorie, seconde passe) → au-delà : l'arbre,
//                     le texte, puis la question, comme avant (l'appelant sait
//                     déjà faire sans l'IA : réponse « ia_indisponible ») ;
//   · « essentiel » : Lens et la rédaction → au-delà : l'app dit que l'analyse
//                     est indisponible et la fiche se remplit à la main.
// Le compteur illisible (panne de base) : l'essentiel et le confort PASSENT
// (une panne de compteur n'est pas une dépense), le moteur ne passe pas.
// Lecture : ia_depense_etat() (service_role), gardée 60 s en mémoire.
// ⛔ Ces nombres ne se changent qu'ici, dans le code, sur décision de Nico.

export const PLAFONDS_ANTHROPIC_USD = Object.freeze({
  moteur: { jour: 6, mois: 120 },
  confort: { jour: 9, mois: 160 },
  essentiel: { jour: 14, mois: 185 },
});

export type NiveauIa = keyof typeof PLAFONDS_ANTHROPIC_USD;
export type EtatBudget = { anthropic_jour: number; anthropic_mois: number } | null;

/** Règle pure : le niveau peut-il appeler l'IA ? (etat null = compteur illisible) */
export function budgetOuvert(niveau: NiveauIa, etat: EtatBudget): { ouvert: boolean; motif: string | null } {
  const p = PLAFONDS_ANTHROPIC_USD[niveau];
  if (!p) return { ouvert: false, motif: "niveau_inconnu" };
  if (!etat || !Number.isFinite(Number(etat.anthropic_jour)) || !Number.isFinite(Number(etat.anthropic_mois))) {
    return niveau === "moteur" ? { ouvert: false, motif: "compteur_illisible" } : { ouvert: true, motif: null };
  }
  if (Number(etat.anthropic_mois) >= p.mois) return { ouvert: false, motif: `plafond_mois_${p.mois}` };
  if (Number(etat.anthropic_jour) >= p.jour) return { ouvert: false, motif: `plafond_jour_${p.jour}` };
  return { ouvert: true, motif: null };
}

let cache: { le: number; etat: EtatBudget } | null = null;

/** L'état du compteur (60 s de cache par instance de fonction), null si illisible. */
export async function lireBudgetIa(admin: { rpc: (f: string, a?: Record<string, unknown>) => any }): Promise<EtatBudget> {
  if (cache && Date.now() - cache.le < 60_000) return cache.etat;
  let etat: EtatBudget = null;
  try {
    const { data, error } = await admin.rpc("ia_depense_etat");
    if (!error && data && typeof data === "object") {
      etat = { anthropic_jour: Number((data as Record<string, unknown>).anthropic_jour), anthropic_mois: Number((data as Record<string, unknown>).anthropic_mois) };
    }
  } catch { etat = null; }
  cache = { le: Date.now(), etat };
  return etat;
}

/** Le coupe-circuit : true si l'appel peut partir. Toute coupure est dite dans les journaux. */
export async function budgetIaAutorise(admin: { rpc: (f: string, a?: Record<string, unknown>) => any }, niveau: NiveauIa, fonction: string): Promise<{ ouvert: boolean; motif: string | null }> {
  const r = budgetOuvert(niveau, await lireBudgetIa(admin));
  if (!r.ouvert) console.warn(`[budget-ia] ${fonction} : appel IA « ${niveau} » coupé (${r.motif}) — ancien chemin, sans IA`);
  return r;
}
