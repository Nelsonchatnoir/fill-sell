-- ═══════════════════════════════════════════════════════════════════════════
-- VENTE ANNULÉE → SES RETRAITS EN ATTENTE SONT ANNULÉS (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════════════
-- MEMINIANDMOVE, robe Oh Polly 1789926947675004 : vente déclarée à 10:45 →
-- retraits LBC, Vinted et Opla armés (10:47). Vente supprimée par elle à
-- 19:44 : l'app a remis la fiche en stock et éteint la QUESTION « retirer les
-- autres annonces ? » (pending_removal)… mais pas le retrait Opla déjà armé
-- (1d8af3ad, needs_user « Autoriser Opla »). Il aurait retiré l'annonce Opla
-- d'une robe disponible dès qu'elle aurait autorisé Opla.
--
-- LA RÈGLE (Nico) : quand une vente est annulée, tous les retraits encore en
-- attente qu'elle avait déclenchés sont annulés, sur toutes les plateformes.
--
-- LE SIGNAL : la fiche passe de 'vendu' à 'stock' (c'est ce que fait l'app
-- quand on supprime une vente, cf. remettreEnStockApresVenteSupprimee).
-- ⛔ PAS la suppression d'une ligne `ventes` : supprimer un ARTICLE supprime
--    aussi ses ventes, et ce flux-là retire volontairement ses annonces.
-- LES RETRAITS VISÉS : action 'delete', encore en attente ('pending',
-- 'needs_user'), sur cette fiche, armés depuis la vente (moment de la vente =
-- dernier job 'sold' de la fiche, sinon inventaire.date ; marge 10 min).
-- ⛔ Moment de la vente inconnu → rien n'est annulé : on ne devine pas.
-- ⛔ Un retrait déjà PARTI ('processing') n'est pas arraché à l'extension.
-- ⛔ Un retrait demandé à la main AVANT la vente n'est pas touché.
-- La question « retirer les autres annonces ? » est éteinte au passage, côté
-- serveur aussi (l'app le fait déjà ; ceci couvre tout autre chemin).
-- Balayage du 25/09 : aucun autre retrait orphelin sur le parc (le seul
-- retrait en attente sur un article en stock, c1c8a6b5, est manuel).

create or replace function public.inventaire_vente_annulee_retraits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vente timestamptz;
begin
  if old.statut = 'vendu' and new.statut = 'stock' then
    select max(j.sold_at) into v_vente
      from public.cross_post_jobs j
     where j.inventaire_id = new.id and j.status = 'sold';
    if v_vente is null then
      begin
        v_vente := nullif(btrim(coalesce(old.date, '')), '')::timestamptz;
      exception when others then
        v_vente := null;
      end;
    end if;
    if v_vente is null then
      return new;
    end if;

    update public.cross_post_jobs
       set status = 'cancelled',
           error = 'Retrait annulé : la vente a été annulée, l''article est de nouveau disponible. Ton annonce reste en ligne.',
           platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
             'retrait_annule', jsonb_build_object(
               'le', now(), 'motif', 'vente_annulee', 'vente_du', v_vente,
               'pose_par', 'trigger inventaire_vente_annulee_retraits'))
     where inventaire_id = new.id
       and action = 'delete'
       and status in ('pending', 'needs_user')
       and created_at >= v_vente - interval '10 minutes';

    update public.cross_post_jobs
       set platform_fields = platform_fields || jsonb_build_object(
             'pending_removal', false,
             'pending_removal_eteint', jsonb_build_object('motif', 'vente_annulee', 'at', now()))
     where inventaire_id = new.id
       and platform_fields ->> 'pending_removal' = 'true';
  end if;
  return new;
end;
$$;

drop trigger if exists inventaire_vente_annulee_retraits on public.inventaire;
create trigger inventaire_vente_annulee_retraits
  after update of statut on public.inventaire
  for each row execute function public.inventaire_vente_annulee_retraits();
