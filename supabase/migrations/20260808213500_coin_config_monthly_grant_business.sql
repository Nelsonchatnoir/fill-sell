-- Grant mensuel du palier Business : 3000 Pépites/mois (59,99 €/mois).
-- Clé au patron 'monthly_grant_' || tier — lue telle quelle par
-- grant_monthly_coins et upgrade_monthly_grant (aucun autre branchement).
-- Rappel grille : les PRIX des actions restent identiques à tous les
-- paliers (décision du 08/08) — cette clé est un grant, pas un tarif.
-- Idempotente (upsert).

insert into public.coin_config (key, value)
values ('monthly_grant_business', 3000)
on conflict (key) do update set value = excluded.value, updated_at = now();
