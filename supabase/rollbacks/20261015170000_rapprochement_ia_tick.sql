-- Inverse de 20261015170000_rapprochement_ia_tick.sql.
select cron.unschedule('rapprochement-ia-2min');
drop function if exists public.rapprochement_ia_tick(integer);
update coin_config set value = '0', updated_at = now() where key = 'rapprochement_ia_actif';
