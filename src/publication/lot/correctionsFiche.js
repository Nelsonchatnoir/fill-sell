// ═══════════════════════════════════════════════════════════════════════════
// LA CORRECTION D'UN ARTICLE : LE MOTEUR, LA FICHE, LE JOURNAL (19/11/2026, refonte du lot — maquettes lot-1911)
// ═══════════════════════════════════════════════════════════════════════════
// Les gestes de la pop-up de l'article (FicheArticle) et de la liste du lot : une correction passe par le moteur
// (./corrections.js), s'écrit sur la fiche (inventaire, best-effort : la copie est déjà corrigée) et se journalise
// (usage_logs « publication_correction » : le champ et la portée, jamais la valeur).
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PORTEE_TOUTES, valeurDeLArticle, valeurDeLaCopie, appliquerCorrection, patchFicheCorrection, copieAPart } from "./corrections";

/** Écrire la réponse d'un champ du RAYON (aspect de la copie, ou aspect eBay), comme le bloc de questions. */
export function ecrireDetail(m, d, v) {
  if (d.ebay) { m.noterReponseQuestion?.("ebay", d.ligne, v); m.setEbayAspect?.(d.cle, v); return; }
  m.noterReponseQuestion?.(d.gp, d.ligne, v);
  if (d.dedicatedTarget && m.setPlatformDedicatedField) m.setPlatformDedicatedField(d.gp, d.dedicatedTarget, v);
  else m.setPlatformAspect?.(d.gp, d.cle, v);
}

// ── LA FICHE : CE QUI S'Y ÉCRIT, ET LE JOURNAL (19/11) ──────────────────────────────────────────────────────────
// Les attributs de la fiche tels que CETTE session les a écrits (la fusion remplace une clé entière : on fusionne
// d'abord ici, pour ne jamais perdre la correction d'avant).
const attributsEcrits = new Map();
export const attributsDe = (m) => attributsEcrits.get(m?.invId) ?? m?.propsStepGeneration?.attributsFiche ?? m?.initialListing?.attributs ?? null;
/** Écrit une correction sur la fiche (best-effort : la copie est déjà corrigée, l'échec se dit dans la console). */
export function ecrireSurLaFiche(m, { colonnes = {}, attributs = {} } = {}) {
  const id = m?.invId, uid = m?.userId, sb = m?.supabase;
  const maj = { ...colonnes, ...(Object.keys(attributs).length ? { attributs } : {}) };
  if (!Object.keys(maj).length) return;
  if (Object.keys(attributs).length) attributsEcrits.set(id, { ...(attributsDe(m) ?? {}), ...attributs });
  if (!id || !uid || !sb?.from) return;
  sb.from("inventaire").update(maj).eq("id", id).eq("user_id", uid).select("id")
    .then(({ error }) => { if (error) console.warn("[fiche] correction non gardée sur la fiche :", error.message); }, () => {});
}
/** Ce que la personne a corrigé (champ, portée), jamais la valeur : usage_logs « publication_correction ». */
export function journaliserCorrection(m, metadata) {
  const uid = m?.userId, sb = m?.supabase;
  if (!uid || !sb?.from) return;
  sb.from("usage_logs").insert({ user_id: uid, feature: "publication_correction", metadata: { ...metadata, lot: Boolean(m?.pilote) } })
    .then(({ error }) => { if (error) console.warn("[fiche] correction non journalisée :", error.message); }, () => {});
}
/** Le geste complet : la copie (moteur), la fiche, le journal. */
// `respecterAPart` (onglet « L'article ») : une copie qui a SA valeur, choisie pour elle seule, la garde.
export function corriger(m, { cle, valeur, portee, plateformes, detail = null, respecterAPart = false }) {
  const base = valeurDeLArticle(m, cle);
  const avant = portee === PORTEE_TOUTES ? base : valeurDeLaCopie(m, portee, cle);
  const gardees = respecterAPart ? plateformes.filter((p) => copieAPart(m, p, cle)) : [];
  if (detail && portee !== PORTEE_TOUTES) ecrireDetail(m, detail, valeur);
  else if (respecterAPart && cle === "prix") m.poserPrixGeneral?.(valeur);
  else if (respecterAPart && (cle === "etat" || cle === "titre" || cle === "description")) m.poserValeurGenerale?.(cle, valeur);
  else if (!appliquerCorrection(m, { cle, valeur, portee, plateformes, gardees })) return false;
  ecrireSurLaFiche(m, patchFicheCorrection({ cle, valeur, portee, base, attributs: attributsDe(m), garderAPart: respecterAPart }));
  // (20/11/2026 soir, bloc B1 de Nico — ornellaracano) Le titre ou la description de TOUTES ses plateformes passe par
  // le texte général du moteur (poserValeurGenerale = sa retouche), qui l'écrit sur la fiche ET le trace lui-même, une
  // fois la modification validée (ListingPreviewScreen, ecrireTextesTapes) : pas une seconde trace ici.
  if (m?.retouchesTracees && portee === PORTEE_TOUTES && (cle === "titre" || cle === "description")) return true;
  journaliserCorrection(m, {
    champ: cle, portee: portee === PORTEE_TOUTES ? "toutes" : "plateforme", plateforme: portee === PORTEE_TOUTES ? null : portee,
    plateformes: plateformes.length, avait_valeur: Boolean(String(avant ?? "").trim()),
  });
  return true;
}

/** Un grand écran (web, ordinateur) : la vue « Côte à côte » a la place de ses colonnes. Jamais sur téléphone. */
export function useGrandEcran() {
  const lire = () => {
    try { return !Capacitor.isNativePlatform() && typeof window !== "undefined" && Boolean(window.matchMedia?.("(min-width: 1000px)").matches); } catch { return false; }
  };
  const [grand, setGrand] = useState(lire);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(min-width: 1000px)");
    const suivre = () => setGrand(lire());
    mq.addEventListener?.("change", suivre);
    return () => mq.removeEventListener?.("change", suivre);
  }, []);
  return grand;
}
