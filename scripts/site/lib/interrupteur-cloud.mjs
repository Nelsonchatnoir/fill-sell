// L'INTERRUPTEUR DES FORMULES AVEC CLOUD, lu au build du site (12/11/2026, plan de nuit de Nico).
//
// Le site bascule EN MÊME TEMPS que le web de l'app : même clé (CLE_INTERRUPTEUR_FORMULES.stripe de
// supabase/functions/_shared/formules-cloud.js, aujourd'hui « cloud_formules_stripe »), même table (coin_config, lisible
// par la clé publique, comme la grille à 3 jauges : lib/grille.mjs). OUVERT = value 1 ; FERMÉ = aucune ligne, une autre
// valeur, ou une base illisible (réseau, délai, HTTP) : jamais une offre montrée sur un doute.
//   · lu au build du SITE seulement (mode « build » : Vercel, site:apercu) ; dater, og et le contrôle des builds de
//     l'app restent hors ligne → fermé ;
//   · fermé : aucun prix « avec Cloud », aucun interrupteur « Sans / Avec Cloud », aucune offre dans les données
//     structurées — le bandeau de repli sans prix ;
//   · `env.FILLSELL_SITE_FORMULES_CLOUD` = « ouvert » | « ferme » : forçage pour un aperçu LOCAL (captures, relecture)
//     — IGNORÉ sur Vercel (env.VERCEL), où seule la base décide ;
//   · `env.FILLSELL_SITE_GRILLE_HORS_LIGNE = '1'` (selftests) : aucune requête → fermé (sauf forçage local).
// Un changement de l'interrupteur apparaît au déploiement suivant du site (Vercel : redéployer après l'ouverture).
import { CLE_INTERRUPTEUR_FORMULES } from '../../../supabase/functions/_shared/formules-cloud.js';

export const CLE_INTERRUPTEUR_SITE = CLE_INTERRUPTEUR_FORMULES.stripe;

/** La value de coin_config dit-elle « ouvert » ? 1 (nombre ou texte) seulement. */
export const valeurOuverte = (v) => v === 1 || v === '1' || (typeof v === 'string' && v.trim() === '1');

/**
 * Rend { ouvert, source, raison } — jamais d'exception. source : 'force' | 'base' | 'absente'.
 */
export async function lireInterrupteurFormules(supabase, { env = process.env, delaiMs = 5000, essais = 3, fetcher = globalThis.fetch } = {}) {
  const force = String(env?.FILLSELL_SITE_FORMULES_CLOUD ?? '').trim().toLowerCase();
  if (!env?.VERCEL && (force === 'ouvert' || force === 'ferme')) {
    return { ouvert: force === 'ouvert', source: 'force', raison: `forcé en local (FILLSELL_SITE_FORMULES_CLOUD=${force})` };
  }
  if (env?.FILLSELL_SITE_GRILLE_HORS_LIGNE === '1') return { ouvert: false, source: 'absente', raison: 'hors ligne (selftest)' };
  if (!supabase?.url || !supabase?.cle || typeof fetcher !== 'function') return { ouvert: false, source: 'absente', raison: 'clé publique illisible' };
  if (typeof CLE_INTERRUPTEUR_SITE !== 'string' || !/^[a-z0-9_]+$/.test(CLE_INTERRUPTEUR_SITE)) {
    return { ouvert: false, source: 'absente', raison: `clé de l'interrupteur illisible (${CLE_INTERRUPTEUR_SITE})` };
  }
  const url = `${supabase.url}/rest/v1/coin_config?select=value&key=eq.${CLE_INTERRUPTEUR_SITE}`;
  let raison = 'inconnue';
  for (let i = 0; i < essais; i++) {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), delaiMs);
    try {
      const r = await fetcher(url, { headers: { apikey: supabase.cle, Authorization: `Bearer ${supabase.cle}` }, signal: ctrl.signal });
      if (!r.ok) { raison = `HTTP ${r.status}`; continue; }
      const lignes = await r.json();
      if (!Array.isArray(lignes)) { raison = 'réponse illisible'; continue; }
      if (!lignes.length) return { ouvert: false, source: 'base', raison: `${CLE_INTERRUPTEUR_SITE} absente de coin_config (fermé)` };
      const v = lignes[0]?.value;
      return valeurOuverte(v)
        ? { ouvert: true, source: 'base', raison: `${CLE_INTERRUPTEUR_SITE} = 1 (ouvert)` }
        : { ouvert: false, source: 'base', raison: `${CLE_INTERRUPTEUR_SITE} = ${JSON.stringify(v)} (fermé)` };
    } catch (e) {
      raison = e?.name === 'AbortError' ? `délai de ${delaiMs} ms dépassé` : (e?.message ?? String(e));
    } finally {
      clearTimeout(minuteur);
    }
  }
  return { ouvert: false, source: 'absente', raison };
}
