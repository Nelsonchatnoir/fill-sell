-- ─────────────────────────────────────────────────────────────────────────────
-- consume_one_unit — consommation ATOMIQUE d'une unité d'un article de stock
-- 2026-07-22 · plan « lots », points ① et ②
--
-- POURQUOI CETTE FONCTION EXISTE
-- Le gate anti-double-vente de sale-orchestration.ts était :
--     UPDATE inventaire SET statut='vendu' … WHERE id=… AND statut <> 'vendu'
-- Un UPDATE conditionnel qui ne matche qu'UNE fois : parfait pour une pièce
-- unique, faux dès que l'article a plusieurs unités. Il basculait TOUT le lot
-- en 'vendu' à la première vente — 9 unités disparaissaient du stock sans
-- vente enregistrée (limite déjà documentée dans le code : « Limite assumée :
-- quantite > 1 passe quand même tout l'article en vendu »).
--
-- Or PostgREST ne sait pas exprimer `quantite = quantite - 1` : l'API REST
-- n'affecte que des valeurs littérales. Le gate doit donc descendre en SQL.
--
-- CONCURRENCE (l'exigence centrale)
-- SELECT … FOR UPDATE prend un verrou de ligne : deux ventes quasi simultanées
-- sur deux plateformes différentes sont sérialisées par Postgres. La seconde
-- lit la quantité DÉJÀ décrémentée. Sur un article à 1 unité, la seconde voit
-- statut='vendu' et repart avec won=false — exactement la sémantique du
-- `.neq('statut','vendu')` d'avant, mais qui fonctionne pour N unités.
--
-- ATOMICITÉ ÉTENDUE À LA LIGNE D'HISTORIQUE (écart assumé au plan initial)
-- Le plan prévoyait que l'edge function insère la ligne d'historique après
-- l'appel. Elle est faite ICI, dans la même transaction : si la fonction Deno
-- mourait entre les deux appels, on obtiendrait un stock décrémenté SANS trace
-- de la vente — une unité évaporée, impossible à retrouver. Un seul aller-retour
-- SQL rend cet état intermédiaire inatteignable.
--
-- CONVENTION DE LA LIGNE D'HISTORIQUE : identique à confirmSell (App.jsx:2771)
--   vente partielle → l'article reste 'stock' à quantite-1
--                   + une NOUVELLE ligne inventaire {statut:'vendu', quantite:1}
--   dernière unité  → l'article lui-même passe 'vendu', quantite 0
-- ⚠️ inventaire.id n'a NI default NI identity (vérifié en base) : tout INSERT
-- doit fournir un id. confirmSell le génère en JS (Date.now()+random) au risque
-- d'une collision ; ici on boucle jusqu'à un id réellement libre.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.consume_one_unit(
  p_inventaire_id bigint,
  p_user_id       uuid,
  p_prix_vente    numeric default null,
  p_margin        numeric default null,
  p_margin_pct    numeric default null,
  p_selling_fees  numeric default 0,
  p_plateforme    text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.inventaire%rowtype;
  v_etait   integer;
  v_restant integer;
  v_new_id  bigint;
begin
  -- Verrou de ligne : c'est LUI qui sérialise les ventes concurrentes.
  select * into v_row
    from public.inventaire
   where id = p_inventaire_id
     and user_id = p_user_id
   for update;

  if not found then
    return jsonb_build_object('won', false, 'reason', 'introuvable',
                              'restant', null, 'etait', null);
  end if;

  v_etait := coalesce(v_row.quantite, 1);

  -- Déjà épuisé : le perdant de la course repart les mains vides, sans rien
  -- écrire. Aucune vente, aucun email, aucune ligne d'historique en double.
  if v_row.statut = 'vendu' or v_etait <= 0 then
    return jsonb_build_object('won', false, 'reason', 'deja_epuise',
                              'restant', greatest(v_etait, 0), 'etait', v_etait);
  end if;

  v_restant := v_etait - 1;

  if v_restant > 0 then
    -- LOT : l'article reste en stock, amputé d'une unité.
    update public.inventaire
       set quantite = v_restant
     where id = p_inventaire_id;

    -- id libre garanti (pas de default sur inventaire.id).
    loop
      v_new_id := (extract(epoch from clock_timestamp()) * 1000)::bigint
                  + (random() * 9999)::int;
      exit when not exists (select 1 from public.inventaire where id = v_new_id);
    end loop;

    insert into public.inventaire
      (id, user_id, titre, prix_achat, purchase_costs, prix_vente,
       margin, margin_pct, selling_fees, statut, quantite,
       marque, type, description, emplacement, plateforme, date)
    values
      (v_new_id, p_user_id, v_row.titre, v_row.prix_achat, 0, p_prix_vente,
       p_margin, p_margin_pct, coalesce(p_selling_fees, 0), 'vendu', 1,
       v_row.marque, v_row.type, v_row.description, v_row.emplacement,
       p_plateforme,
       to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  else
    -- DERNIÈRE UNITÉ (et donc TOUT article à quantite = 1) : comportement
    -- strictement identique à celui d'avant — mêmes colonnes, mêmes valeurs.
    update public.inventaire
       set quantite     = 0,
           statut       = 'vendu',
           prix_vente   = p_prix_vente,
           margin       = p_margin,
           margin_pct   = p_margin_pct,
           selling_fees = coalesce(p_selling_fees, 0)
     where id = p_inventaire_id;
  end if;

  return jsonb_build_object('won', true, 'restant', v_restant, 'etait', v_etait);
end;
$$;

comment on function public.consume_one_unit(bigint, uuid, numeric, numeric, numeric, numeric, text) is
  'Consomme atomiquement 1 unité d''un article. Verrou de ligne FOR UPDATE : gère deux ventes simultanées sur deux plateformes. restant>0 → article reste en stock + ligne d''historique vendue (convention confirmSell) ; restant=0 → article passe vendu (comportement historique des pièces uniques).';

grant execute on function public.consume_one_unit(bigint, uuid, numeric, numeric, numeric, numeric, text)
  to authenticated, service_role;
