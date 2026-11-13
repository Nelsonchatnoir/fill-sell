// ═══════════════════════════════════════════════════════════════════════════
// LA DESCRIPTION EN BLOCS, RENDUE SELON LA PLATEFORME (13/11, lot « zéro problème », point 5a de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (12/11) : « la description est construite en blocs structurés, rendus selon la plateforme, prêts
// pour d'autres langues ». Les blocs, dans l'ordre où ils partent :
//   1. le CORPS — le texte du vendeur, ou celui que FillSell a rédigé ;
//   2. la PHRASE DE TEST — écrite au jour de l'envoi depuis la date du test (src/utils/phraseDeTest.js), omise là où
//      la plateforme la refuse ;
//   3. « Marque : X » — posé par l'extension quand la marque n'est pas dans la liste de la plateforme (Leboncoin,
//      Beebs), TOUJOURS avant le bloc suivant (get-pending-jobs sert `fin_de_description`) ;
//   4. les PHRASES FINALES du vendeur (« Finir EXACTEMENT … : ») — posées par le CODE, mot pour mot, émojis et
//      lignes vides compris, toujours en dernier : rien n'est jamais ajouté après.
// Ce que chaque plateforme reçoit (émojis, sauts de ligne, plafond, hashtags, phrase de test) se lit dans
// supabase/functions/_shared/capacites-texte.js, par plateforme et par site.
// ⛔ Le texte du vendeur n'est jamais réécrit : au service, seule sa phrase de test est remise au jour (ou omise).
// Pur (Deno + Node + Vite) : scripts/phrases-finales-selftest.ts, scripts/phrase-test-datee-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════
import { capacitesTexte } from "../../supabase/functions/_shared/capacites-texte.js";
import { lireConsignes } from "./consignesRedaction.js";
import { aujourdhuiParis, debutDesFinales, ligneComparable, rendrePhraseDeTest } from "./phraseDeTest.js";
import { retirerFaitsSansSource } from "./faitsSansSource.js";
import { retirerEtatContredit } from "../../supabase/functions/_shared/etat-plateformes.js";

const PICTOS = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const HASHTAGS = /(^|\s)#[\p{L}\p{N}_-]+/gu;

/** Coupe au dernier mot entier (même corps que clampToWord / couperAuMot). */
function couperAuMot(s, max) {
  const v = String(s ?? "");
  if (max == null || v.length <= max) return v;
  const coupe = v.slice(0, Math.max(0, max));
  const dernierEspace = coupe.lastIndexOf(" ");
  return (dernierEspace > max * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trimEnd();
}

const propre = (t) => String(t ?? "").split("\n").map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, "")).join("\n")
  .replace(/\n{3,}/g, "\n\n").trim();

/**
 * Les phrases finales du vendeur, posées EN DERNIER, mot pour mot : toute ligne du texte qui les reprend (même sans
 * ses émojis, comme le modèle les rendait) est retirée, puis le bloc exact est ajouté à la fin, après une ligne vide.
 */
export function poserFinales(texte, finales) {
  const t = String(texte ?? "");
  if (!finales || !String(finales).trim()) return t;
  const cles = new Set(String(finales).split("\n").map(ligneComparable).filter(Boolean));
  const corps = propre(t.split("\n").filter((l) => !cles.has(ligneComparable(l))).join("\n"));
  return corps ? `${corps}\n\n${finales}` : String(finales);
}

/** La fin du vendeur telle qu'elle termine le texte (pour l'extension : « Marque : X » se pose AVANT), sinon null. */
export function finDeDescription(texte, finales) {
  const i = debutDesFinales(texte, finales);
  return i >= 0 ? String(texte).slice(i).replace(/\s+$/, "") : null;
}

/**
 * Le texte RÉDIGÉ par FillSell pour une plateforme : le corps du modèle, ce que la source ne dit pas retiré, les
 * consignes du vendeur tenues (émojis ou hashtags qu'il refuse, LUS négation comprise), les capacités de la
 * plateforme appliquées, ses phrases finales posées par le code, le plafond appliqué au corps seulement.
 * @param {string} texte  ce que le modèle a écrit
 * @param {string} plateforme
 * @param {{site?: string|null, consignes?: any, lues?: ReturnType<typeof lireConsignes>|null, sources?: string[]|null,
 *   etatConnu?: string|null, etatServi?: string|null, langue?: string, max?: number|null}} [opts]
 *   etatConnu : palier de l'état qui part, `null` = inconnu (un état général affirmé tombe) ; etatServi : le libellé
 *   de cet état (un état général qui le contredit tombe, sur le corps seulement).
 * @returns {{texte: string, retires: Array<{segment: string, motif: string}>, etatRetires: string[]}}
 */
export function rendreDescriptionGeneree(texte, plateforme, { site = null, consignes = null, lues = null, sources = null, etatConnu, etatServi = null, langue = "fr", max = null } = {}) {
  const l = lues ?? (consignes ? lireConsignes(consignes, { langue }) : null);
  const cap = capacitesTexte(plateforme, site)?.description ?? null;
  const brut = String(texte ?? "");
  let t = brut;
  if (l?.hashtags === "retirer") t = t.replace(HASHTAGS, "$1").replace(/[ \t]+\n/g, "\n");
  if (l?.emojis === "retirer" || cap?.emojis === false) t = t.replace(PICTOS, "");
  let retires = [];
  if (sources) {
    const r = retirerFaitsSansSource(t, { sources, langue, etatConnu });
    t = r.texte; retires = r.retires;
  }
  // L'état général qui contredit le champ (cas Louis, 21/09) : sur le CORPS seulement — jamais sur les phrases finales.
  let etatRetires = [];
  if (etatServi) {
    const r = retirerEtatContredit(t, etatServi);
    if (r.modifie) { t = r.texte; etatRetires = r.retires; }
  }
  if (cap?.sautsDeLigne === false) t = t.replace(/\s*\n+\s*/g, " ");
  // Rien de retiré, aucune consigne : le texte du modèle, à l'octet près (seul le plafond s'applique, comme avant).
  if (l || t !== brut) t = propre(t);
  const plafond = max ?? cap?.max ?? null;
  if (l?.finales) {
    const corps = couperAuMot(poserFinales(t, l.finales).slice(0, -l.finales.length).replace(/\s+$/, ""), plafond == null ? null : plafond - l.finales.length - 2);
    t = corps ? `${corps}\n\n${l.finales}` : l.finales;
  } else if (plafond != null) {
    t = couperAuMot(t, plafond);
  }
  return { texte: t, retires, etatRetires };
}

/**
 * Le texte SERVI pour un envoi (get-pending-jobs) : la phrase de test écrite au jour de l'envoi depuis la date du
 * test (ou omise là où la plateforme la refuse) ; la fin du vendeur repérée, pour que l'extension pose « Marque : X »
 * AVANT elle. Rien d'autre n'est touché.
 * @param {string} texte
 * @param {{plateforme: string, site?: string|null, consignes?: any, lues?: ReturnType<typeof lireConsignes>|null,
 *   testeLe?: string|null, aujourdhui?: string, langue?: string}} opts
 * @returns {{texte: string, modifie: boolean, phrase: string|null, date: string|null, omise: boolean,
 *   fin_de_description: string|null}}
 */
export function rendreDescriptionAuService(texte, { plateforme, site = null, consignes = null, lues = null, testeLe = null, aujourdhui = aujourdhuiParis(), langue = "fr" } = {}) {
  const l = lues ?? (consignes ? lireConsignes(consignes, { langue }) : null);
  const cap = capacitesTexte(plateforme, site)?.description ?? null;
  const r = rendrePhraseDeTest(texte, {
    testeLe, aujourdhui, langue, finales: l?.finales ?? null,
    modele: l?.modeleTest ?? null,
    accepte: cap ? cap.phraseDeTest !== false : true,
  });
  return { ...r, fin_de_description: l?.finales ? finDeDescription(r.texte, l.finales) : null };
}
