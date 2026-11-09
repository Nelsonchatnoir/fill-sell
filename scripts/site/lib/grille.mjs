// LA GRILLE À 3 JAUGES DES CARTES DE TARIFS — lue EN BASE au build (08/11/2026, décision de Nico).
//
// Avant : les volumes des cartes étaient recopiés à la main dans tarifs.yml (« un quota changé en base = ce fichier
// changé le même jour ») — et ils avaient dérivé (Business « 300 annonces », Pro « 5 000 republications » quand la
// base disait illimité). Désormais : AUCUN chiffre de volume dans tarifs.yml (lireTarifs le refuse) ; les chiffres
// viennent de coin_config — les MÊMES clés que l'app (jauge_<jauge>_<palier>, quota_retouche_<palier>,
// jauge_lens_business ; 0 = illimité) — lues par la clé publique (coin_config est lisible par tous), puis rendues par
// les MÊMES fonctions que l'app (src/utils/jauges.js : grilleDuPalier, nombre, motJauge). Un quota changé en base
// apparaît au déploiement suivant du site.
// ⛔ Base illisible (réseau, délai) : les cartes partent SANS carrés (aucun chiffre de repli recopié) et le build le
//    dit en avertissement — jamais un chiffre faux, jamais un build bloqué pour ça.
// (09/11/2026, intégration de la maquette « Landing — section Cloud + tarifs à 3 jauges » validée par Nico)
//   · LE SERVEUR DÉCIDE, comme dans l'app (jauges.js, grilleActiveConfig) : interrupteur grille_trois_jauges à 0 en
//     base = la grille n'est pas en service → cartes sans carrés (jamais une grille que l'app ne montre pas) ;
//   · lue au build du SITE seulement (mode « build » : Vercel, site:apercu) — dater, og, contrôle des builds de l'app
//     n'en ont pas besoin et restent hors ligne ;
//   · les carrés et ces lignes sont de l'HABILLAGE (hors empreinte des dates) : une coupure réseau ne rend jamais un
//     build rouge, et un quota changé en base ne périme aucune page.
import { GRILLE_REPLI, JAUGES, grilleActiveConfig, grilleDuPalier, nombre, motJauge } from '../../../src/utils/jauges.js';
import { nomAccessibleCarre } from '../../../src/utils/jaugesExplications.js';

export const CLES_GRILLE = Object.freeze([
  'grille_trois_jauges',
  ...Object.keys(GRILLE_REPLI).flatMap((p) => [...JAUGES.map((j) => `jauge_${j}_${p}`), `quota_retouche_${p}`]),
  'jauge_lens_business',
]);
const PALIER_DU_SITE = Object.freeze({ gratuit: 'free', premium: 'premium', pro: 'pro', business: 'business' });

/**
 * coin_config (clés de la grille), par l'API publique. Rend { K, source: 'base' } ou { K: null, source: 'absente',
 * raison }. `env.FILLSELL_SITE_GRILLE_HORS_LIGNE = '1'` : aucune requête (selftests). Jamais d'exception.
 */
export async function lireGrilleEnBase(supabase, { env = process.env, delaiMs = 5000, essais = 3, fetcher = globalThis.fetch } = {}) {
  if (env?.FILLSELL_SITE_GRILLE_HORS_LIGNE === '1') return { K: null, source: 'absente', raison: 'hors ligne (selftest)' };
  if (!supabase?.url || !supabase?.cle || typeof fetcher !== 'function') return { K: null, source: 'absente', raison: 'clé publique illisible' };
  const url = `${supabase.url}/rest/v1/coin_config?select=key,value&key=in.(${CLES_GRILLE.join(',')})`;
  let raison = 'inconnue';
  for (let i = 0; i < essais; i++) {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), delaiMs);
    try {
      const r = await fetcher(url, { headers: { apikey: supabase.cle, Authorization: `Bearer ${supabase.cle}` }, signal: ctrl.signal });
      if (!r.ok) { raison = `HTTP ${r.status}`; continue; }
      const lignes = await r.json();
      if (!Array.isArray(lignes)) { raison = 'réponse illisible'; continue; }
      const K = {};
      for (const l of lignes) if (l && typeof l.key === 'string') K[l.key] = l.value;
      // Une grille sans ses clés de volumes n'est pas une grille : rien plutôt qu'un repli.
      const manquantes = CLES_GRILLE.filter((k) => k.startsWith('jauge_') && !(k in K));
      if (manquantes.length) return { K: null, source: 'absente', raison: `clés absentes en base : ${manquantes.join(', ')}` };
      if (!grilleActiveConfig(K)) return { K: null, source: 'absente', raison: 'interrupteur grille_trois_jauges à 0 en base (grille pas en service)' };
      return { K, source: 'base' };
    } catch (e) {
      raison = e?.name === 'AbortError' ? `délai de ${delaiMs} ms dépassé` : (e?.message ?? String(e));
    } finally {
      clearTimeout(minuteur);
    }
  }
  return { K: null, source: 'absente', raison };
}

/**
 * Les carrés et les lignes chiffrées d'une carte du site, depuis K (null → null : la carte part sans carrés).
 *   carres : [{ cle, valeur, mot, aria, illimite }] dans l'ordre annonces · publications · remontées ;
 *   lignes : [« Retouche IA : 20 annonces retouchées par mois »] (+ Lens du Business), mêmes phrases que l'app.
 */
export function jaugesDeCarte(K, idPalier, lang) {
  if (!K) return null;
  const p = PALIER_DU_SITE[idPalier];
  if (!p) return null;
  const en = lang === 'en';
  const g = grilleDuPalier(K, p);
  const carres = JAUGES.map((cle) => {
    const illimite = g[cle] === Infinity;
    const valeur = illimite ? (en ? 'unlimited' : 'illimitées') : nombre(g[cle], lang);
    const mot = motJauge(cle, 2, lang);
    return { cle, valeur, mot, illimite, aria: nomAccessibleCarre(valeur, mot, lang) };
  });
  // Ordre de la maquette : Lens (Business) d'abord, puis la retouche IA.
  const lignes = [];
  if (p === 'business' && g.lens != null) lignes.push(en ? `Lens: ${nombre(g.lens, lang)} scans a month` : `Lens : ${nombre(g.lens, lang)} scans par mois`);
  const ret = Number(g.retouches) || 0;
  if (ret > 0) {
    lignes.push(en ? `AI touch-up: ${nombre(ret, lang)} ${ret === 1 ? 'listing' : 'listings'} retouched a month`
      : `Retouche IA : ${nombre(ret, lang)} ${ret > 1 ? 'annonces retouchées' : 'annonce retouchée'} par mois`);
  }
  return { carres, lignes };
}
