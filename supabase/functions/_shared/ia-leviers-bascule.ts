// ═══════════════════════════════════════════════════════════════════════════
// LA CASCADE DES LEVIERS IA, CHAMP PAR CHAMP (18/10/2026, « zéro friction »)
// ═══════════════════════════════════════════════════════════════════════════
// Appelée par generate-listing (resolve_aspects, voie générique Vinted /
// Leboncoin / Beebs) APRÈS l'existant (L0), sur les seuls champs que L0 a
// laissés vides — là où, sans elle, une question part chez la personne. Une
// réponse de L0 n'est JAMAIS remplacée : aucun recul possible sur ce qu'il sait.
// Quel levier pour quel champ : la table ia_leviers_bascule (migration
// 20261018160000), remplie depuis le banc (docs/enquetes/zero-friction-1810/
// banc-ia.json) et tenue par ia_leviers_evaluer() (cron 6 h) :
//   · « fantome » : le levier tourne, sa réponse est NOTÉE (usage_logs
//     ia_levier), jamais posée — la question part comme avant ;
//   · « actif »   : sa réponse est posée (contrôlée : une entrée de la liste) ;
//   · « coupe » / « eteint » : rien ne tourne.
// Coût : Haiku 5.5 (≈ 0,0001-0,0005 $ l'appel), niveau « moteur » du plafond
// IA (_shared/budget-ia.ts) — fermé, rien ne tourne et la question part.
// Leboncoin, feuilles Maison & Jardin (« Univers » / « Produit » qui dépendent
// l'un de l'autre) : AUCUN levier (banc : tous en recul sur ces paires).
import { passerLevier, coutUsd, optionsDuLevier, type Levier } from "./aspects-leviers.ts";
import { photosPourCouleurIA } from "./couleur-ia.ts";
import { budgetIaAutorise } from "./budget-ia.ts";
import type { AspectDemande, ContexteArticle } from "./ebay-aspects-ia.ts";

export type LigneBascule = { plateforme: string; champ: string; levier: Levier; etat: string };
const LEVIERS_VALIDES = new Set(["L1", "L2", "L3", "L4"]);
export const PLATEFORMES_CASCADE = new Set(["leboncoin", "beebs", "vinted"]);
const CHAMPS_PAIRE_MJ = /^(univers|produit|type)$/i;

/** Les lignes vivantes (fantome / actif) d'une plateforme ; jamais une panne. */
// deno-lint-ignore no-explicit-any
export async function lireBascules(admin: any, plateforme: string): Promise<LigneBascule[]> {
  try {
    const { data, error } = await admin.from("ia_leviers_bascule").select("plateforme, champ, levier, etat")
      .eq("plateforme", plateforme).in("etat", ["fantome", "actif"]);
    if (error) return [];
    return ((data ?? []) as LigneBascule[]).filter((l) => LEVIERS_VALIDES.has(l.levier));
  } catch { return []; }
}

/**
 * Le choix pur (testé par scripts/ia-leviers-selftest.mjs) : pour chaque champ
 * resté vide après L0, la ligne de bascule qui le couvre, ou rien.
 */
export function choisirLeviers(
  { plateforme, demandes, l0, bascules, feuilleDependante = false }:
  { plateforme: string; demandes: Array<{ name: string }>; l0: Record<string, unknown>; bascules: LigneBascule[]; feuilleDependante?: boolean },
): Array<{ name: string; ligne: LigneBascule }> {
  if (!PLATEFORMES_CASCADE.has(plateforme)) return [];
  const out: Array<{ name: string; ligne: LigneBascule }> = [];
  for (const d of demandes ?? []) {
    if (!d?.name || String(l0?.[d.name] ?? "").trim()) continue; // L0 a répondu : jamais remplacé
    if (plateforme === "leboncoin" && feuilleDependante && CHAMPS_PAIRE_MJ.test(d.name)) continue;
    if (d.name === "Univers et produit") continue;
    const ligne = bascules.find((b) => b.plateforme === plateforme && b.champ === d.name);
    if (ligne) out.push({ name: d.name, ligne });
  }
  return out;
}

/**
 * La cascade. Rend les réponses à POSER (champs « actif » seulement) ; chaque
 * réponse, posée ou notée, laisse une ligne usage_logs « ia_levier ».
 */
export async function appliquerLeviers(
  // deno-lint-ignore no-explicit-any
  { admin, userId, plateforme, categorie, inventaireId, feuilleDependante, demandes, contexte, l0, photos, apiKey, supabaseUrl }: {
    admin: any; userId: string; plateforme: string; categorie: string | null; inventaireId: string | null; feuilleDependante: boolean;
    demandes: Array<AspectDemande & { key?: string; cible?: string | null }>; contexte: ContexteArticle; l0: Record<string, unknown>;
    photos: unknown; apiKey: string; supabaseUrl: string;
  },
): Promise<{ poses: Record<string, string>; notes: number }> {
  const poses: Record<string, string> = {};
  if (!apiKey || !PLATEFORMES_CASCADE.has(plateforme)) return { poses, notes: 0 };
  const bascules = await lireBascules(admin, plateforme);
  const choix = choisirLeviers({ plateforme, demandes, l0, bascules, feuilleDependante });
  if (!choix.length) return { poses, notes: 0 };
  const budget = await budgetIaAutorise(admin, "moteur", "generate-listing:ia_levier");
  if (!budget.ouvert) return { poses, notes: 0 };
  const parLevier = new Map<Levier, Array<{ name: string; ligne: LigneBascule }>>();
  for (const c of choix) parLevier.set(c.ligne.levier, [...(parLevier.get(c.ligne.levier) ?? []), c]);
  const avecPhotos = [...parLevier.keys()].some((l) => l === "L4" || optionsDuLevier(l).photos);
  const images = avecPhotos ? (await photosPourCouleurIA(photos, supabaseUrl, 2)).sources : [];
  const lignesLog: Array<Record<string, unknown>> = [];
  await Promise.all([...parLevier.entries()].map(async ([levier, champs]) => {
    const demandesLevier = champs.map((c) => demandes.find((d) => d.name === c.name)!).filter(Boolean)
      .map((d) => ({ name: d.name, mode: d.mode, allowedValues: d.allowedValues }));
    let r;
    try { r = await passerLevier(levier, demandesLevier, contexte, images, { apiKey }); } catch { return; }
    champs.forEach((c, i) => {
      const d = demandes.find((x) => x.name === c.name);
      const valeur = String(r.aspects[c.name] ?? "").trim() || null;
      if (valeur && c.ligne.etat === "actif") poses[c.name] = valeur;
      lignesLog.push({
        user_id: userId, feature: "ia_levier",
        metadata: {
          plateforme, categorie, inventaire_id: inventaireId, champ: c.name, cle: d?.key ?? null, cible: d?.cible ?? null,
          levier, etat: c.ligne.etat, valeur, posee: Boolean(valeur && c.ligne.etat === "actif"),
          modele: optionsDuLevier(levier).modele, photos: images.length,
          // Le coût d'UN appel, porté par la première ligne seulement (compteur ia_depense_jour).
          ...(i === 0 ? { cost_usd: r.mesure.cout_usd, claude_calls: r.mesure.appels } : {}),
        },
      });
    });
  }));
  if (lignesLog.length) {
    try { await admin.from("usage_logs").insert(lignesLog); } catch { /* une mesure ne casse jamais une réponse */ }
  }
  return { poses, notes: lignesLog.length };
}

export { coutUsd };
