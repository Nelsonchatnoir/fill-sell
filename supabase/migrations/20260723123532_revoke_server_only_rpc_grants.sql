-- ── Durcissement RLS/RPC : révoquer les GRANT EXECUTE hérités à anon/authenticated ──
-- Audit sécurité 2026-07-23 : plusieurs fonctions SECURITY DEFINER destinées
-- UNIQUEMENT aux edge functions (appelées en service_role, qui bypasse ces
-- grants) avaient hérité du GRANT EXECUTE par défaut à anon et/ou authenticated,
-- les rendant joignables directement via /rest/v1/rpc/... avec la clé anon
-- publique. Aucune n'est appelée côté client (front src/ ni extension) — vérifié
-- par grep : seuls des edge functions en SUPABASE_SERVICE_ROLE_KEY les invoquent.
-- Ces REVOKE ne touchent donc AUCUN flux existant.
--
-- IMPORTANT : le grant effectif passe par PUBLIC (entrée « =X/postgres » dans
-- proacl), dont anon/authenticated sont membres. Révoquer seulement anon +
-- authenticated est INOPÉRANT tant que PUBLIC garde EXECUTE. On révoque donc à
-- PUBLIC (ce qui couvre anon, authenticated et tout rôle) ET explicitement à
-- anon/authenticated par ceinture-bretelles. service_role et postgres ont un
-- grant EXECUTE explicite propre → non affectés, les edge functions continuent.

-- Faille HAUTE — dump PII (email + statut premium + date création) de TOUS les
-- comptes, accessible sans authentification via la clé anon.
-- Appelant légitime : email-tunnel (service_role).
REVOKE EXECUTE ON FUNCTION public.email_tunnel_candidates()
  FROM PUBLIC, anon, authenticated;

-- IDOR moyen — p_user_id arbitraire permet de marquer/vendre l'inventaire d'un
-- autre compte (scoping par id+user_id, mais bigint devinable).
-- Appelant légitime : _shared/sale-orchestration.ts (service_role).
-- (consume_one_unit n'avait pas de grant PUBLIC ; FROM PUBLIC = no-op inoffensif.)
REVOKE EXECUTE ON FUNCTION public.consume_one_unit(
  bigint, uuid, numeric, numeric, numeric, numeric, text)
  FROM PUBLIC, anon, authenticated;

-- Bypass quota + pollution cross-user — tier (is_premium/is_pro) et user_id
-- passés en paramètre, jamais confrontés à auth.uid().
-- check_and_log_publish / check_publish_quota : aucun appelant actuel (fonctions
-- mortes, remplacées par le modèle Pépites) — revoke sans impact.
-- check_and_log_usage : appelants deal-analysis / voice-* / lens-analysis (service_role).
-- log_publish : aucun appelant actuel.
REVOKE EXECUTE ON FUNCTION public.check_and_log_publish(
  uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_publish_quota(
  uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_log_usage(
  uuid, text, boolean, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_publish(uuid)
  FROM PUBLIC, anon, authenticated;

-- Griefing — incrémente le compteur de slots Founder (programme fermé), basse
-- sévérité, inclus dans le même lot.
-- Appelant légitime : stripe-webhook (service_role).
REVOKE EXECUTE ON FUNCTION public.increment_founder_slots()
  FROM PUBLIC, anon, authenticated;
