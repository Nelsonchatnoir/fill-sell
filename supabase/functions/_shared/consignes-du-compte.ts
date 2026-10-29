// ═══════════════════════════════════════════════════════════════════════════
// LES CONSIGNES DU VENDEUR, LUES POUR SA RÉDACTION (29/10, lot B 1.3 — promesse XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// Une lecture par génération (profiles.platform_settings.redaction.consignes), par les deux portes de la rédaction :
// lens-analysis (scan unifié) et generate-listing (écran de publication). Propres au compte : la ligne lue est celle
// du compte du jeton, jamais une autre. Best-effort : une lecture ratée = rédaction d'avant, sans consigne.
import { consignesValides } from "../../../src/utils/consignesRedaction.js";
import { strategieValide } from "../../../src/utils/strategiePrix.js";

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * (29/10, lot B 1.3-1.4) Consignes ET stratégie de prix du compte, en UNE lecture (lens-analysis : la fiche née du scan
 * porte le prix que la stratégie du vendeur propose). Lecture ratée = défauts (aucune consigne, prix du marché).
 */
export async function reglagesRedactionDuCompte(admin: Admin, userId: string | null | undefined): Promise<{ consignes: Record<string, string> | null; strategiePrix: string }> {
  if (!admin || !userId) return { consignes: null, strategiePrix: strategieValide(null) };
  try {
    const { data, error } = await admin.from("profiles")
      .select("consignes:platform_settings->redaction->consignes, strategie:platform_settings->redaction->>strategie_prix")
      .eq("id", userId).maybeSingle();
    if (error || !data) return { consignes: null, strategiePrix: strategieValide(null) };
    const c = consignesValides((data as { consignes?: unknown }).consignes);
    return { consignes: Object.keys(c).length ? c : null, strategiePrix: strategieValide((data as { strategie?: unknown }).strategie) };
  } catch {
    return { consignes: null, strategiePrix: strategieValide(null) };
  }
}

export async function consignesDuCompte(admin: Admin, userId: string | null | undefined): Promise<Record<string, string> | null> {
  if (!admin || !userId) return null;
  try {
    const { data, error } = await admin.from("profiles")
      .select("consignes:platform_settings->redaction->consignes")
      .eq("id", userId).maybeSingle();
    if (error || !data) return null;
    const c = consignesValides((data as { consignes?: unknown }).consignes);
    return Object.keys(c).length ? c : null;
  } catch {
    return null;
  }
}
