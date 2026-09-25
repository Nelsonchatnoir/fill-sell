// ============================================================================
// LA LANGUE DE RÉDACTION VINTED D'UN VENDEUR (zone euro, lot 4, 25/09/2026)
//
// Nico : « Les annonces rédigées par Lens le sont dans la langue du site
// Vinted du vendeur. » Alberto (compte Vinted italien) voit vinted.fr en
// ITALIEN : une annonce rédigée en français y serait publiée telle quelle,
// en français, sur son dressing italien.
//
// D'OÙ VIENT LA LANGUE, dans cet ordre — jamais devinée :
//   1. la sonde du compte (extension ≥ 0.6.69) : users/current.locale,
//      remonté dans extension_sessions.vinted_identite.langue, avec le pays ;
//   2. à défaut, ce que Vinted a montré à CE compte : les libellés d'état
//      relevés par la synchronisation du dressing (inventaire.attributs.etat,
//      source « vinted_liste » — p. ex. « Nuovo con cartellino » chez Alberto)
//      comparés aux tables relevées (_shared/vinted-pays.ts). Une seule langue
//      possible, sinon rien.
// ⛔ JAMAIS POUR LE FRANÇAIS : rend null, et la rédaction reste celle
//    d'aujourd'hui, à l'identique.
// ⛔ JAMAIS L'ANGLAIS DÉDUIT : un compte en anglais sur vinted.fr peut être un
//    compte français ; sans le pays de la sonde, on ne change rien.
// ⛔ SEULEMENT SI LE PAYS EST OUVERT (coin_config vinted_pays_<cc> = 1).
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { ETATS_VINTED, type LangueVinted, paysDeLaLangue } from "./vinted-pays.ts";

const LANGUES = new Set(Object.keys(ETATS_VINTED));

export interface LangueVendeur { langue: LangueVinted; pays: string[]; source: string }

export async function langueRedactionVinted(admin: SupabaseClient, userId: string): Promise<LangueVendeur | null> {
  const { data: prof } = await admin.from("profiles").select("extension_sessions").eq("id", userId).maybeSingle();
  const ident = (((prof?.extension_sessions ?? {}) as Record<string, unknown>).vinted_identite ?? null) as
    { pays?: unknown; langue?: unknown } | null;
  const paysSonde = /^[A-Z]{2}$/.test(String(ident?.pays ?? "")) ? String(ident!.pays) : null;
  const langueSonde = String(ident?.langue ?? "").toLowerCase().slice(0, 2);

  let langue: LangueVinted | null = null;
  let source = "";
  if (LANGUES.has(langueSonde)) {
    langue = langueSonde as LangueVinted;
    source = "sonde du compte (users/current.locale)";
  } else {
    // Libellés d'état relevés par la synchro du dressing — ceux que Vinted a
    // écrits pour CE compte, dans SA langue.
    const { data: lignes } = await admin.from("inventaire")
      .select("attributs").eq("user_id", userId)
      .eq("attributs->etat->>source", "vinted_liste")
      .limit(40);
    const libelles = new Set<string>();
    for (const l of (lignes ?? []) as Array<{ attributs: Record<string, unknown> | null }>) {
      const v = String(((l.attributs?.etat ?? {}) as Record<string, unknown>).v ?? "").trim().toLowerCase();
      if (v) libelles.add(v);
    }
    if (libelles.size) {
      const possibles = (Object.keys(ETATS_VINTED) as LangueVinted[]).filter((lg) => {
        const table = new Set(Object.values(ETATS_VINTED[lg].libelles).map((t) => t.toLowerCase()));
        return [...libelles].every((v) => table.has(v));
      });
      if (possibles.length === 1) {
        langue = possibles[0];
        source = `libellés d'état du dressing (${[...libelles].slice(0, 3).join(", ")})`;
      }
    }
  }
  if (!langue || langue === "fr") return null;
  if (langue === "en" && !paysSonde) return null;

  const pays = paysSonde ? [paysSonde] : paysDeLaLangue(langue);
  if (!pays.length || pays.includes("FR")) return null;
  const { data: cfg } = await admin.from("coin_config").select("key, value")
    .in("key", pays.map((cc) => `vinted_pays_${cc.toLowerCase()}`));
  const ouvert = ((cfg ?? []) as Array<{ key: string; value: number }>).some((r) => Number(r.value) === 1);
  if (!ouvert) return null;
  return { langue, pays, source };
}
