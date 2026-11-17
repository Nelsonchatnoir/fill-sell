// ═══════════════════════════════════════════════════════════════════════════
// API DE CONVERSIONS META — L'ENVOI, LA TRACE, L'ALERTE (17/11/2026, ordre de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Sans dépendance : tout ce qui touche au réseau, à la base, aux secrets et aux mails est INJECTÉ (`deps`) — la fonction
// edge (Deno, ./meta-capi-deno.ts) branche le vrai ; le verrou (scripts/meta-capi-envoi-selftest.mjs, Node) branche des
// doublures. Règles pures : ./meta-capi.js.
//
// Ce que ce module garantit, partout (inscription, essai, premier paiement) :
//   · un pixel sans jeton n'est jamais muet : statut « jeton_absent » dans la trace, une ligne d'erreur claire qui nomme
//     le secret, et le compte dans la série d'échecs ;
//   · une trace par envoi (usage_logs : meta_capi_inscription / meta_capi_evenement), statut par pixel (« envoye ») ;
//   · au 4e échec d'affilée (plus de 3), UNE alerte à support@ — jamais une par échec ;
//   · jamais une erreur remontée : un paiement, une inscription ne dépendent en rien de Meta.
// deps : {
//   lireJeton(nomSecret) → string|null ; fetch(url, init) ;
//   ecrireTrace({ feature, userId, metadata }) ; lireTracesRecentes(n) → [metadata] (features suivies, la plus récente
//   d'abord) ; envoyerAlerte({ sujet, html }) ;
//   lireCompte(userId) → { id, email }|null ; lireAccord(userId) → metadata de la trace d'inscription|null ;
//   lireDejaEnvoyes(userId) → [nom] ; journal : { log, warn, error } ; maintenant() → ms
// }
import {
  ENVOYE, FEATURE_EVENEMENT, JETON_ABSENT, PIXELS_CAPI, SEUIL_ALERTE,
  contexteDeTrace, doitAlerter, estCompteDeTest, estEchec, evenementServeur, nomSecretJeton, statutReponse, texteAlerte, urlEnvoi,
} from './meta-capi.js';

const DELAI_META_MS = 10_000;

/**
 * Envoie UN événement à chaque pixel de l'API de conversions. → { pixels: { <pixel>: statut }, fbtrace: { <pixel>: id } }
 * `testEventCode` : le code de « Tester les événements » (essai de Nico seulement ; jamais pour un vrai compte).
 * @param {{ evenement: any, deps: any, testEventCode?: string | null }} p
 */
export async function envoyerAuxPixels({ evenement, deps, testEventCode = null }) {
  const pixels = {};
  const fbtrace = {};
  await Promise.all(PIXELS_CAPI.map(async (pixel) => {
    const jeton = deps.lireJeton(nomSecretJeton(pixel));
    if (!jeton) { pixels[pixel] = JETON_ABSENT; return; }
    try {
      const rep = await deps.fetch(urlEnvoi(pixel), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [evenement], access_token: jeton, ...(testEventCode ? { test_event_code: String(testEventCode) } : {}) }),
        signal: AbortSignal.timeout(DELAI_META_MS),
      });
      const corps = await rep.json().catch(() => null);
      pixels[pixel] = statutReponse({ ok: rep.ok, status: rep.status, corps });
      if (corps?.fbtrace_id) fbtrace[pixel] = String(corps.fbtrace_id).slice(0, 64);
    } catch (e) {
      pixels[pixel] = `echec:${String(e?.message ?? e).replace(/access_token=[^&\s]+/g, 'access_token=…').slice(0, 120)}`;
    }
  }));
  return { pixels, fbtrace };
}

/**
 * Écrit la trace, dit clairement un échec, et alerte support@ au 4e échec d'affilée. Ne lève jamais.
 * `suivie` : false pour un essai de Nico (trace à part, hors de la série).
 * @param {{ deps: any, feature: string, userId?: string | null, metadata: any, suivie?: boolean }} p
 */
export async function tracerEtSurveiller({ deps, feature, userId = null, metadata, suivie = true }) {
  const journal = deps.journal ?? console;
  try {
    await deps.ecrireTrace({ feature, userId, metadata });
  } catch (e) {
    journal.error(`[meta-capi] trace ${feature} non écrite : ${e?.message ?? e}`);
  }
  if (!estEchec(metadata?.pixels)) return { alerte: false };
  const absents = Object.entries(metadata?.pixels ?? {}).filter(([, s]) => s === JETON_ABSENT).map(([p]) => nomSecretJeton(p));
  journal.error(`[meta-capi] ENVOI À META RATÉ (${metadata?.nom ?? feature}) : ${JSON.stringify(metadata?.pixels ?? {})}`
    + (absents.length ? ` — secret absent : ${absents.join(', ')} (Gestionnaire d'événements Meta › Paramètres › Générer un token d'accès)` : ''));
  if (!suivie) return { alerte: false };
  try {
    const recents = await deps.lireTracesRecentes(SEUIL_ALERTE + 1);
    if (!doitAlerter(recents)) return { alerte: false };
    await deps.envoyerAlerte(texteAlerte(recents));
    journal.error(`[meta-capi] alerte envoyée à support@ : ${SEUIL_ALERTE} échecs d'affilée`);
    return { alerte: true };
  } catch (e) {
    journal.error(`[meta-capi] alerte impossible : ${e?.message ?? e}`);
    return { alerte: false };
  }
}

/**
 * L'essai Cloud et le premier paiement chez Meta, pour UN compte. → bilan [{ nom?, resultat }]. Ne lève jamais.
 *   demandes : [{ nom: 'StartTrial'|'Subscribe'|'Purchase', montant }] (demandesDeCloud / demandesDePaiement) ;
 *   canal : 'stripe' | 'apple' | 'google' ; test : achat de test d'une boutique (rien ne part).
 * Rien ne part sans l'accord donné sur le web à l'inscription (trace meta_capi_inscription), ni pour un compte de
 * test ; chaque nom ne part qu'UNE fois par compte (« le premier »).
 * @param {{ deps: any, userId: string | null | undefined, canal?: string | null, test?: boolean, demandes: Array<{ nom: string, montant?: any }> }} p
 */
export async function conversionsMeta({ deps, userId, canal, test = false, demandes }) {
  const journal = deps.journal ?? console;
  try {
    if (test === true) return [{ resultat: 'achat_de_test' }];
    if (!userId || !Array.isArray(demandes) || demandes.length === 0) return [];
    const compte = await deps.lireCompte(userId);
    if (!compte?.email) return [{ resultat: 'compte_introuvable' }];
    if (estCompteDeTest(compte.email)) return [{ resultat: 'compte_de_test' }];
    const accord = await deps.lireAccord(userId);
    if (!accord) return [{ resultat: 'sans_accord_web' }];
    const contexte = contexteDeTrace(accord);
    const deja = new Set(await deps.lireDejaEnvoyes(userId));
    const bilan = [];
    for (const d of demandes) {
      if (deja.has(d.nom)) { bilan.push({ nom: d.nom, resultat: 'deja_envoye' }); continue; }
      const r = await evenementServeur({ nom: d.nom, compte, contexte, canal, montant: d.montant, maintenant: deps.maintenant?.() ?? Date.now() });
      if (!r.evenement) { bilan.push({ nom: d.nom, resultat: r.refus }); continue; }
      deja.add(d.nom);
      const envoi = await envoyerAuxPixels({ evenement: r.evenement, deps });
      await tracerEtSurveiller({
        deps, feature: FEATURE_EVENEMENT, userId,
        metadata: {
          nom: d.nom, event_id: r.evenement.event_id, canal: canal ?? null, action_source: r.evenement.action_source,
          valeur: r.evenement.custom_data?.value ?? null, devise: r.evenement.custom_data?.currency ?? null,
          pixels: envoi.pixels, fbtrace: envoi.fbtrace,
        },
      });
      bilan.push({ nom: d.nom, resultat: estEchec(envoi.pixels) ? 'echec' : ENVOYE });
    }
    if (bilan.length) journal.log(`[meta-capi] ${canal ?? '?'} user=${userId} ${JSON.stringify(bilan)}`);
    return bilan;
  } catch (e) {
    journal.error(`[meta-capi] conversions impossibles : ${e?.message ?? e}`);
    return [{ resultat: 'erreur' }];
  }
}
