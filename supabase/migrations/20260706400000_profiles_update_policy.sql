-- profiles : RLS activé mais AUCUNE policy UPDATE — tous les updates client
-- (username, platform_settings.leboncoin.adresse, compteurs voice/lens…)
-- matchaient 0 ligne SANS erreur PostgREST : l'app affichait "✅ enregistré"
-- alors que rien n'était écrit (cas réel : adresse de remise Leboncoin jamais
-- persistée pour aucun utilisateur, jobs LBC condamnés au failed "adresse
-- requise"). Les writes service-role (webhooks, edge functions) passaient,
-- ce qui masquait le trou.
CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Resserrage indispensable AVANT d'ouvrir l'UPDATE : le grant existant était
-- table entière — avec la policy ci-dessus, un client pourrait sinon
-- s'auto-attribuer is_premium/is_pro/is_founder ou coller un
-- apple_original_transaction_id (la détection premium repose dessus).
-- Seules les colonnes réellement écrites par le client sont ouvertes ;
-- l'abonnement reste exclusivement service-role (webhooks Stripe/Apple/Google),
-- y compris le flow IAP Android dont l'écriture client directe reste un no-op
-- volontaire (statu quo, le webhook Google Play fait foi).
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  username,
  platform_settings,
  currency,
  lang,
  push_token,
  voice_count_today,
  voice_count_date,
  lens_count_today,
  lens_count_date,
  stats_analysis_cache
) ON public.profiles TO authenticated;
