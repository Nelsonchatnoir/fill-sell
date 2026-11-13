// ═══════════════════════════════════════════════════════════════════════════
// LA DESCRIPTION QU'eBAY REÇOIT PAR L'API, ÉCRITE AU SERVICE COMME AILLEURS (13/11, lot « zéro problème », point 5a)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (12/11) : la date de test est une DONNÉE de la fiche (inventaire.attributs.teste_le) et la phrase
// de test est écrite À CHAQUE ENVOI selon le modèle du vendeur (ses consignes), omise là où la plateforme la refuse ;
// les phrases finales du vendeur restent les dernières, mot pour mot (src/utils/blocsDescription.js).
// Les plateformes servies à l'extension la reçoivent de get-pending-jobs (rendreDescriptionAuService). eBay par l'API
// (ebay-api-worker, publier() — publication ET republication) envoyait `descriptionEbay(job.description)` : le texte
// copié de la fiche à la création de la tâche, sans consignes ni date. Cas réel, compte de63ca45 : la tâche 70c6910c,
// publiée le 03/11, disait « Jeu testé aujourd’hui, le 2 novembre 2026 » ; et ses fiches réparées
// (scripts/reparations/20261113_de63ca45_date_de_test.sql : phrase sortie du texte, date dans teste_le) seraient
// parties sur eBay SANS phrase.
// RÈGLE, pour tous les comptes : le texte de la tâche passe par la MÊME fonction que get-pending-jobs (plateforme
// « ebay »), avec les consignes du compte et la date de test de la fiche (même lecture : `{ v: "AAAA-MM-JJ" }`), puis
// devient le HTML d'eBay (descriptionEbay). Sans modèle de phrase ni date : à l'octet près le HTML d'avant. Le texte de
// la tâche en base n'est jamais réécrit (texte SERVI, comme get-pending-jobs).
// Verrou : scripts/ebay-phrase-test-api-selftest.ts.
import { descriptionEbay } from "./ebay-publication.ts";
import { rendreDescriptionAuService } from "../../../src/utils/blocsDescription.js";
import { lireConsignes } from "../../../src/utils/consignesRedaction.js";
import { aujourdhuiParis } from "../../../src/utils/phraseDeTest.js";

export interface RenduAuService {
  texte: string; modifie: boolean; phrase: string | null; date: string | null; omise: boolean; fin_de_description: string | null;
}

/** La date de test de la fiche (attributs.teste_le = { v: "AAAA-MM-JJ", … }), sinon null — même lecture que get-pending-jobs. */
export function testeLeDeLaFiche(attributs: unknown): string | null {
  const t = attributs && typeof attributs === "object" ? (attributs as Record<string, unknown>).teste_le : null;
  const v = t && typeof t === "object" ? (t as Record<string, unknown>).v : null;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Le texte d'une tâche eBay tel qu'il part ce jour-là : la phrase de test écrite au jour de l'envoi (depuis la date de
 * la fiche, ou celle d'une phrase du modèle déjà dans le texte), à sa place, avant les phrases finales du vendeur.
 * Texte vide : rien n'est écrit (le titre le remplace dans descriptionEbay, comme avant ; get-pending-jobs ne sert pas
 * non plus un texte vide).
 */
export function texteEbayAuService(
  description: string | null | undefined,
  { consignes = null, attributs = null, aujourdhui = aujourdhuiParis() }: { consignes?: unknown; attributs?: unknown; aujourdhui?: string } = {},
): RenduAuService {
  const texte = String(description ?? "");
  if (!texte.trim()) return { texte, modifie: false, phrase: null, date: null, omise: false, fin_de_description: null };
  const lues = consignes ? lireConsignes(consignes) : null;
  return rendreDescriptionAuService(texte, { plateforme: "ebay", lues, testeLe: testeLeDeLaFiche(attributs), aujourdhui }) as RenduAuService;
}

/**
 * Le HTML envoyé à eBay (product.description ET listingDescription) pour une tâche, et ce qui a été écrit (diagnostic).
 * `diagnostic` : null quand aucune phrase de test n'est en jeu (ni date, ni omission).
 */
export function descriptionEbayServie(
  job: { description?: string | null; title?: string | null },
  opts: { consignes?: unknown; attributs?: unknown; aujourdhui?: string } = {},
): { html: string; rendu: RenduAuService; diagnostic: { phrase: string | null; date: string | null; omise: boolean; ecrite: boolean } | null } {
  const rendu = texteEbayAuService(job.description, opts);
  return {
    html: descriptionEbay(rendu.texte, job.title ?? ""),
    rendu,
    diagnostic: rendu.date || rendu.omise ? { phrase: rendu.phrase, date: rendu.date, omise: rendu.omise, ecrite: rendu.modifie } : null,
  };
}
