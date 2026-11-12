// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LES FORMULES AVEC CLOUD LISENT DU PROFIL (11/11/2026) — deux lectures à part, qui échouent sans rien casser
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ Rien ne part tant que `actif` est faux : les appelants passent formulesCloudVendables(userId) (fermé = aucune
//    requête, l'app d'avant). ⛔ POSTGREST EST TOUT OU RIEN (docs/agents/pieges.md) : une colonne absente vide toute la
//    requête. D'où DEUX lectures :
//   1. les colonnes qui EXISTENT (palier, Founder, ce qui dit le canal de l'abonnement, l'échéance) ;
//   2. profiles.cloud_formule — la formule avec Cloud que porte l'abonnement, posée par le SERVEUR (code serveur des
//      formules, en parallèle) : tant qu'elle n'existe pas en base, sa lecture échoue → null, et les écrans font comme
//      si aucune formule avec Cloud n'était prise (jamais un état deviné).
// Une lecture par clé primaire à l'ouverture de l'écran, relue sur demande ; jamais de boucle.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { canalAbonnementDuProfil } from './formulesCloud';
import { FORMULES_CLOUD } from '../../supabase/functions/_shared/formules-cloud.js';

export const COLONNES_PROFIL_FORMULES = 'is_premium, is_pro, is_business, is_comped, is_founder, stripe_customer_id, apple_original_transaction_id, google_purchase_token, google_product_id, subscription_period_end';
export const COLONNE_FORMULE = 'cloud_formule';

const VIDE = Object.freeze({ etat: 'inactif', profil: null, formuleActuelle: null, canalAbonnement: null, founder: false, echeance: null });

/** @returns {{ etat: 'inactif'|'lecture'|'ok'|'echec', profil, formuleActuelle, canalAbonnement, founder, echeance, relire }} */
export function useProfilFormules(userId, { actif = true } = {}) {
  const [lu, setLu] = useState({ pour: null, etat: 'lecture', profil: null, formule: null });
  const [tour, setTour] = useState(0);
  const relire = useCallback(() => setTour((n) => n + 1), []);
  const doitLire = Boolean(actif && userId);

  useEffect(() => {
    if (!doitLire) return undefined;
    let mort = false;
    const cle = `${userId}:${tour}`;
    const profil = Promise.resolve()
      .then(() => supabase.from('profiles').select(COLONNES_PROFIL_FORMULES).eq('id', userId).maybeSingle())
      .then(({ data, error }) => (error || !data ? null : data), () => null);
    const formule = Promise.resolve()
      .then(() => supabase.from('profiles').select(COLONNE_FORMULE).eq('id', userId).maybeSingle())
      .then(({ data, error }) => (error ? null : (FORMULES_CLOUD.includes(data?.[COLONNE_FORMULE]) ? data[COLONNE_FORMULE] : null)), () => null);
    Promise.all([profil, formule]).then(([p, f]) => {
      if (!mort) setLu({ pour: cle, etat: p ? 'ok' : 'echec', profil: p, formule: f });
    });
    return () => { mort = true; };
  }, [doitLire, userId, tour]);

  if (!doitLire) return { ...VIDE, relire };
  if (lu.pour !== `${userId}:${tour}`) return { ...VIDE, etat: 'lecture', relire };
  return {
    etat: lu.etat, profil: lu.profil, formuleActuelle: lu.formule,
    canalAbonnement: canalAbonnementDuProfil(lu.profil), founder: lu.profil?.is_founder === true,
    echeance: lu.profil?.subscription_period_end ?? null, relire,
  };
}
