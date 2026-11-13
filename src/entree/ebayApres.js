// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS D'ENTRÉE — RELIER eBAY APRÈS LE PARCOURS (13/11/2026, bloc B2 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré du 08 au 13/11 : 23 inscrits ont ouvert le consentement eBay AU MILIEU du parcours, 12 n'y sont jamais revenus
// (sur le web, la page eBay remplace l'app ; le parcours se marque fini à la sortie) — 9 avaient pourtant relié eBay.
// Désormais eBay se relie depuis le récap, et dans CET ordre, sans exception :
//   1. l'adresse de consentement est demandée (demarrerConnexionEbay) — si eBay ne répond pas, on RESTE sur le récap,
//      l'erreur s'y dit, rien n'est fini ni ouvert ;
//   2. le parcours est marqué fini (terminer : profiles.onboarded_at, caches, destination) — ATTENDU ;
//   3. seulement alors la page eBay s'ouvre (ouvrirConsentementEbay : la page remplace l'app sur le web, le navigateur
//      du système sur iPhone / Android). Au retour, la personne est dans l'app, parcours fait.
// ⛔ Orchestration PURE : les quatre gestes sont passés par la coque (ParcoursEntree), aucun appel ici. Les fonctions
//    eBay sont celles qui existent déjà (utils/ebayCompte, mêmes que EbayCompteSection et l'ancienne étape).
// Télémétrie : 'ebay_apres_parcours' (le geste), puis la valeur historique 'ebay_oauth_ouvert' avec apres_parcours.

/**
 * @param {{ lang: string, demarrer: (lang: string) => Promise<{url?: string, consent_url?: string}>,
 *   terminer: () => Promise<void>, ouvrir: (url: string) => Promise<void>, journaliser?: (choix: string, extra?: object) => void }} o
 * @returns {Promise<{ ok: boolean, erreur?: string }>}
 */
export async function relierEbayApresEntree({ lang, demarrer, terminer, ouvrir, journaliser = null }) {
  journaliser?.('ebay_apres_parcours');
  let url = null;
  try {
    const r = await demarrer(lang === 'en' ? 'en' : 'fr');
    // Même lecture que l'ancienne étape : `url`, et le repli d'une réponse plus ancienne.
    url = r?.url ?? r?.consent_url ?? null;
  } catch (e) {
    return { ok: false, erreur: e?.message ?? 'eBay indisponible' };
  }
  if (!url) return { ok: false, erreur: 'URL de consentement absente' };
  await terminer();
  journaliser?.('ebay_oauth_ouvert', { apres_parcours: true });
  try {
    await ouvrir(url);
  } catch {
    // Le parcours est déjà fini : la personne est dans l'app, eBay reste à relier depuis le Tableau ou les Réglages.
  }
  return { ok: true };
}
