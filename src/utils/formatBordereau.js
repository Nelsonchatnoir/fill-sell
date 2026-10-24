// ═══════════════════════════════════════════════════════════════════════════
// BORDEREAU AUTOMATIQUE — LE FORMAT DU COMPTE (24/10/2026 soir, décision 1 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Dès qu'une vente arrive sur Vinted (étiquette payée par l'acheteur ; 24/10 soir, décision 2 de Nico : Vinted
// seulement, tous les comptes — migrations 20261024235000 et 20261024235500), FillSell demande le bordereau tout seul
// et le garde ici. Le FORMAT est un réglage choisi une fois :
// « pdf » (étiquette à imprimer, par défaut) ou « code » (code à montrer au point relais). Il vit dans
// profiles.platform_settings.bordereaux.format, écrit par platform_settings_fusionner SEULEMENT (jamais l'objet
// entier, 02/10). Une lecture au premier besoin, puis la mémoire (aucune relecture en boucle, 04/10).
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from './reglagesPlateformes';

export const FORMATS_BORDEREAU = Object.freeze(['pdf', 'code']);
/** Le format d'un objet platform_settings : « code » seulement s'il est écrit, sinon « pdf ». */
export function formatBordereauDesReglages(ps) {
  const b = ps && typeof ps === 'object' ? ps.bordereaux : null;
  return b && typeof b === 'object' && b.format === 'code' ? 'code' : 'pdf';
}
export function libelleFormatBordereau(format, lang = 'fr') {
  const en = lang === 'en';
  return format === 'code'
    ? (en ? 'Code to show at the drop-off point' : 'Code à montrer au point relais')
    : (en ? 'Label to print (PDF)' : 'Étiquette à imprimer (PDF)');
}

const memoire = new Map(); // userId → { valeur, lue }
const DEFAUT = Object.freeze({ valeur: 'pdf', lue: false });
export function useFormatBordereau(userId) {
  const [, rafraichir] = useState(0);
  useEffect(() => {
    let vivant = true;
    if (!userId || memoire.get(userId)?.lue) return undefined;
    (async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('platform_settings').eq('id', userId).maybeSingle();
        if (!error) memoire.set(userId, { valeur: formatBordereauDesReglages(data?.platform_settings), lue: true });
      } catch { /* lecture ratée : défaut « pdf », rien d'écrit */ }
      if (vivant) rafraichir((x) => x + 1);
    })();
    return () => { vivant = false; };
  }, [userId]);
  const enregistrer = async (format) => {
    if (!userId || !FORMATS_BORDEREAU.includes(format)) return { ok: false };
    const { data, error } = await fusionnerReglages(['bordereaux'], { format });
    if (error || !data) return { ok: false };
    memoire.set(userId, { valeur: format, lue: true });
    rafraichir((x) => x + 1);
    return { ok: true };
  };
  return { ...(memoire.get(userId) ?? DEFAUT), enregistrer };
}
