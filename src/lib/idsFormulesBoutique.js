// Les identifiants des formules avec Cloud dans UNE boutique (11/11/2026) — lus dans le contrat partagé
// (supabase/functions/_shared/formules-cloud.js, PRODUITS_BOUTIQUES), jamais recopiés. Pur.
import { FORMULES_CLOUD, PRODUITS_BOUTIQUES } from '../../supabase/functions/_shared/formules-cloud.js';

/** { premium_cloud: 'app.fillsell.premium.cloud', … } pour canal 'apple' | 'google'. */
export function idsFormulesBoutique(canal) {
  const cle = canal === 'google' ? 'google' : 'apple';
  return Object.fromEntries(FORMULES_CLOUD.map((f) => [f, PRODUITS_BOUTIQUES[f][cle]]));
}
