-- APPLIQUÉE le 26/09 (GO Nico) — version enregistrée 20260926093606.
-- ═══════════════════════════════════════════════════════════════════════════
-- RETRAIT DU DIAGNOSTIC TEMPORAIRE 20260926092254 (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesure faite, sur de vraies requêtes du compte de Nico :
--   · app web   : PATCH /inventaire, origin « https://fillsell.app »,
--                 x-client-info « supabase-js-web/2.101.1 » ;
--   · extension : PATCH et POST /inventaire, origin
--                 « chrome-extension://malmbnhfmgpnkmjeefdjgnojjeghilee »,
--                 sans x-client-info ni referer (relevé Vinted de 11:35).
-- L'en-tête Origin arrive donc bien jusqu'à la base, et distingue l'extension
-- de l'app. Le diagnostic n'a plus d'objet : trigger, fonction et table
-- (8 lignes, toutes du compte de Nico) sont retirés.

drop trigger if exists _diag_entetes_inventaire on public.inventaire;
drop function if exists public._diag_entetes_inventaire_noter();
drop table if exists public._diag_entetes_inventaire;
