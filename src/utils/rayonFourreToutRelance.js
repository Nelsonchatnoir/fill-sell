// ═══════════════════════════════════════════════════════════════════════════
// RELANCER UN DÉPÔT PARTI DANS UN FOURRE-TOUT : LE RAYON EST RE-RÉSOLU
// (2026-09-25, point 2 — le pichet de Jocabroc)
// ═══════════════════════════════════════════════════════════════════════════
// Un dépôt Leboncoin en « Divers > Autres » refusé à la modération, relancé
// tel quel, repart… en « Divers > Autres » et se fait refuser de nouveau
// (Louis, 23/09 : deux « Rangement » relancés, deux refus). « Relancer » ne
// recopie donc plus le fourre-tout : le rayon est re-résolu par le MÊME
// mécanisme que la publication (rayonApresRefus — le fourre-tout exclu, deux
// descentes, arbitrage), exactement ce que fait scripts/rattrapage-rayon-
// refuse.mjs côté support.
// Issues : « trouve » (le rayon est posé sur pf, on relance) ; « question » ou
// « attente » (aucun rayon sûr, ou service injoignable) : on NE relance PAS et
// on le dit — « Aucune valeur inventée : si la catégorie reste incertaine,
// c'est la question qui part » (republier depuis la fiche pose la question).
import { supabase } from '../lib/supabase';
import { rayonApresRefus, appliquerRayonApresRefus, cheminsRefuses, familleVetoDe } from './rayonApresRefus';
import { candidatsParMot } from './categorieParMot';
import { estFourreToutCatalogue } from './fourreTout';

const CHAMP_RAYON = { leboncoin: 'lbcCategoryPath', beebs: 'beebsCategoryPath', opla: 'oplaCategoryPath', vinted: 'categoryPath' };

/** Le dépôt porte-t-il un fourre-tout de catalogue qui n'a PAS été choisi par la personne ? */
export function rayonFourreToutARevoir(platform, pf) {
  const champ = CHAMP_RAYON[platform];
  if (!champ || !pf) return false;
  if (pf.categorie_source === 'choix_humain') return false;
  return estFourreToutCatalogue(pf[champ]);
}

const appelerResolve = async (body) => {
  for (let essai = 0; essai < 2; essai++) {
    try {
      const { data, error } = await supabase.functions.invoke('resolve-categorie', { body });
      if (!error && data && data.motif !== 'ia_indisponible') return { data, injoignable: false };
    } catch { /* retenté une fois */ }
    if (essai === 0) await new Promise((ok) => setTimeout(ok, 1200));
  }
  return { data: null, injoignable: true };
};

/**
 * Re-résout le rayon d'un dépôt parti dans un fourre-tout. MUTE `pf` quand un
 * rayon est trouvé. Rend l'issue : 'trouve' | 'question' | 'attente' | 'erreur'.
 */
export async function reResoudreRayonFourreTout({ platform, pf, titre }) {
  try {
    const champ = CHAMP_RAYON[platform];
    const avant = Array.isArray(pf[champ]) ? pf[champ] : null;
    pf.categorie_verification = {
      ...(pf.categorie_verification ?? {}),
      verdict: 'incoherent', chemin_icone: avant, motif: 'fourre_tout_refuse',
    };
    const t = String(titre ?? '');
    const objet = String(pf.categorie_objet_ia || pf.categorie_verification?.objet || t);
    const genre = String(pf.genre || pf.univers || '');
    const refuses = cheminsRefuses(platform, pf);
    const plaus = pf.categorie_plausibilite ?? null;
    const familleVeto = familleVetoDe(plaus ? { famille: plaus.famille_objet, source: plaus.source_famille } : null);
    const connus = await candidatsParMot(objet, platform, { genre, titre: t });
    const res = await rayonApresRefus({
      platform, objet, titre: t,
      attributs: { genre: genre === 'Mixte' ? '' : genre, taille: String(pf.taille ?? ''), marque: String(pf.marque ?? '') },
      genre, refuses, familleVeto, pf, appelerResolve, candidatsConnus: connus,
    });
    if (res.issue !== 'trouve' || estFourreToutCatalogue(res.chemin)) return res.issue === 'trouve' ? 'question' : res.issue;
    appliquerRayonApresRefus(platform, pf, res, { objet, motSource: 'ia', refuses });
    pf.relance_fourre_tout = { le: new Date().toISOString(), rayon_avant: avant, rayon_apres: res.chemin, par: 'relance (app)' };
    return 'trouve';
  } catch (e) {
    console.warn('[relance] re-résolution du rayon impossible :', e?.message ?? e);
    return 'erreur';
  }
}

export function messageRayonNonTrouve(platform, fr = true) {
  const pf = { leboncoin: 'Leboncoin', beebs: 'Beebs', opla: 'Opla', vinted: 'Vinted' }[platform] ?? platform;
  return fr
    ? `${pf} refuse les annonces rangées dans un rayon « Autres » et aucun rayon sûr n'a été trouvé pour cet article : republie-le depuis sa fiche, le rayon te sera demandé.`
    : `${pf} rejects listings filed under an “Other” category and no reliable category was found for this item: republish it from its item page, you'll be asked for the category.`;
}
