// ═══════════════════════════════════════════════════════════════════════════
// LA BOUTIQUE VINTED PAR DÉFAUT D'UN COMPTE À PLUSIEURS BOUTIQUES (15/10 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Réglages › Mes plateformes. Une publication d'un article sans boutique part
// sur elle ; sans réglage, sur la boutique ouverte dans le navigateur au moment
// de l'envoi (règle commune serveur/app : _shared/boutique-publication-vinted.js).
// Écriture par platform_settings_fusionner SEULEMENT (jamais l'objet entier).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fusionnerReglages } from './reglagesPlateformes';
import { boutiquesConfirmees } from '../../supabase/functions/_shared/boutique-publication-vinted.js';

export function useBoutiqueVintedParDefaut(userId, actif = true) {
  const [etat, setEtat] = useState({ lue: false, valeur: null, boutiques: [] });
  const relire = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.from('profiles').select('platform_settings, vinted_sync_pin').eq('id', userId).maybeSingle();
      if (error) return;
      const v = data?.platform_settings?.vinted?.boutique_defaut;
      setEtat({ lue: true, valeur: v == null || v === '' ? null : String(v), boutiques: boutiquesConfirmees(data?.vinted_sync_pin?.boutiques) });
    } catch { /* inconnu : rien d'affiché */ }
  }, [userId]);
  useEffect(() => { if (actif) relire(); }, [actif, relire]);
  const enregistrer = useCallback(async (id) => {
    const { error } = id
      ? await fusionnerReglages(['vinted'], { boutique_defaut: String(id) })
      : await fusionnerReglages(['vinted'], null, ['boutique_defaut']);
    if (!error) setEtat((e) => ({ ...e, valeur: id ? String(id) : null }));
    return { ok: !error };
  }, []);
  return { ...etat, enregistrer, relire };
}
