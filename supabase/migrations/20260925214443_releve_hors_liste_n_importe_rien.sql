-- ═══════════════════════════════════════════════════════════════════════════
-- RELEVÉ HORS « MES ANNONCES » : RIEN N'ENTRE (2026-09-25 nuit)
-- ═══════════════════════════════════════════════════════════════════════════
-- MEMINIANDMOVE (compte Leboncoin PRO), run f80c56cb du 25/09 21:48, extension
-- 0.6.66 : « Mes annonces » l'a renvoyée sur l'accueil « / » (un compte PRO
-- n'a pas /compte/part/mes-annonces). Le relevé a lu TOUS les liens /ad/ de
-- l'accueil : trois immeubles de Montluçon (AGENCY IMMO, un particulier) sont
-- entrés dans annonces_plateforme, ont été IMPORTÉS en articles avec leur job
-- « published », puis, fiches supprimées par elle, visés par trois retraits
-- (« Supprimer introuvable » : la garde de l'extension a tenu).
-- Louis, run 0db1df3e du 19/09 13:24 : même erreur, 40 annonces de l'accueil,
-- dont « Nintendo Wifi balance board » importée à la main dans son stock.
-- Parc du 15/09 au 25/09 : 5 runs Leboncoin « liste non rendue », 2 ont lu des
-- annonces — toutes d'autres vendeurs (43), aucune du compte.
--
-- LA RÈGLE (Nico) : un run dont la page « Mes annonces » n'a pas été rendue
-- n'importe RIEN, ne crée aucune annonce, aucun job, aucun rattachement.
--
-- LE SIGNAL — le texte que l'extension écrit DÉJÀ dans le run (toutes versions
-- en circulation, 0.6.66 comprise) :
--   · Leboncoin : « « Mes annonces » n'a pas rendu sa liste » — le compteur
--     « En ligne (N) » n'a pas été vu : rien ne prouve que la page est la liste ;
--   · eBay : « le Hub vendeur n'a pas rendu son compteur » — même doute (une
--     redirection vers l'accueil eBay n'a pas de compteur). 13 runs de ce type,
--     0 annonce lue : aucun effet mesuré, la porte est fermée d'avance.
-- ⛔ Beebs « page muette » n'y est PAS : ses annonces viennent de l'index
--    public, interrogé SOUS l'identifiant du vendeur (session du compte ou
--    annonces connues, contrôle anti-mauvais-compte de beebsChoisirUid) — c'est
--    une preuve d'appartenance. La lecture de page hors liste, elle, est coupée
--    côté extension (0.6.69, CHEMIN_LISTE_DU_COMPTE).
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. releve_hors_liste(erreur) / releve_run_hors_liste(run_id) : LE prédicat,
--      une seule définition ;
--   2. trigger sur vinted_sync_runs : dès que le run porte ce texte (l'extension
--      l'écrit JUSTE APRÈS avoir écrit ses annonces, avant capture et moteur),
--      les annonces CRÉÉES par ce run et encore libres sont SUPPRIMÉES, et le
--      run le dit (« [hors-liste] N annonce(s) … écartée(s) ») ;
--   3. rapprocher_releve : un run hors liste ne traite rien (retour immédiat) ;
--   4. rapprocher_traiter_annonce (relevé ET rattrapage), rapprocher_importer
--      (import auto ET manuel), rapprochement_decider (« attache » / « import »
--      depuis l'app) : une annonce dont le dernier relevé est hors liste n'est
--      ni importée, ni rattachée — seconde ceinture, pour les lignes que le
--      trigger n'a pas vues (run jamais annoté, historique).
-- ⛔ Une annonce DÉJÀ RATTACHÉE (inventaire_id ou job_id posé) n'est jamais
--    supprimée par le trigger : il ne touche que ce que ce run a créé et que
--    personne n'a encore lié.
-- ⛔ Une annonce déjà connue que ce run a revue n'est pas supprimée non plus
--    (created_at antérieur au run) ; elle attend simplement le prochain relevé
--    qui rend la liste pour être à nouveau traitée.
-- ⛔ Les quatre fonctions sont PATCHÉES sur leur définition EN PROD (ancre
--    exacte, une seule occurrence exigée, sinon la migration échoue sans rien
--    toucher) : les fichiers de migration de ces fonctions ont divergé de la
--    prod (cf. CLAUDE.md), les recopier ici réintroduirait un écart.

-- ── 1. LE PRÉDICAT ──────────────────────────────────────────────────────────
create or replace function public.releve_hors_liste(p_erreur text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  -- ⚠️ Ces deux libellés sont écrits par l'extension (releverAnnoncesPlateforme,
  --    objet COUVERTURE) : les reformuler là-bas sans bouger ici rouvre la porte.
  select coalesce(p_erreur, '') like '%n''a pas rendu sa liste%'
      or coalesce(p_erreur, '') like '%Hub vendeur n''a pas rendu son compteur%';
$$;

create or replace function public.releve_run_hors_liste(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_run_id is not null and exists (
    select 1 from public.vinted_sync_runs r
     where r.id = p_run_id and r.kind = 'annonces' and public.releve_hors_liste(r.erreur));
$$;
revoke all on function public.releve_run_hors_liste(uuid) from public, anon, authenticated;

-- ── 2. LE RUN HORS LISTE N'A RIEN CRÉÉ ─────────────────────────────────────
create or replace function public.releve_hors_liste_ecarte()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
  v_note text;
begin
  if new.started_at is not null then
    delete from public.annonces_plateforme a
     where a.user_id = new.user_id
       and a.platform = new.platform
       and a.run_id = new.id
       and a.inventaire_id is null
       and a.job_id is null
       and a.created_at >= new.started_at;
    get diagnostics n = row_count;
  end if;
  -- La trace : posée au premier écartement, reportée à chaque réécriture de
  -- l'erreur par l'extension (qui ne relit jamais ce qu'elle a écrit).
  if n > 0 then
    v_note := '[hors-liste] ' || n || ' annonce(s) lue(s) hors de « Mes annonces » écartée(s) — rien importé, rien rattaché';
  elsif tg_op = 'UPDATE' then
    v_note := substring(coalesce(old.erreur, '') from '\[hors-liste\] \d+ annonce\(s\) lue\(s\) hors de « Mes annonces » écartée\(s\) — rien importé, rien rattaché');
  end if;
  if v_note is not null and position('[hors-liste] ' in coalesce(new.erreur, '')) = 0 then
    new.erreur := new.erreur || ' · ' || v_note;
  end if;
  return new;
end;
$$;
revoke all on function public.releve_hors_liste_ecarte() from public, anon, authenticated;

drop trigger if exists releve_hors_liste_ecarte on public.vinted_sync_runs;
create trigger releve_hors_liste_ecarte
  before update of erreur on public.vinted_sync_runs
  for each row
  when (new.kind = 'annonces' and public.releve_hors_liste(new.erreur))
  execute function public.releve_hors_liste_ecarte();

-- ── 3 & 4. LES QUATRE PORTES DU MOTEUR ──────────────────────────────────────
do $patch$
declare
  r record;
  v_def text;
  n integer;
begin
  for r in
    select * from (values
      ('public.rapprocher_releve(uuid)'::regprocedure,
       $a$  v_complet := COALESCE(v_run.erreur, '') NOT LIKE '[incomplet]%';$a$,
       $b$
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : la page lue n'était pas la
  --    liste du compte. Rien n'est traité, rien n'est daté, rien n'est tranché.
  IF releve_hors_liste(v_run.erreur) THEN
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_liste', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;$b$),
      ('public.rapprocher_traiter_annonce(uuid,text[],boolean,boolean,boolean)'::regprocedure,
       $a$  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;$a$,
       $b$
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : lue par un relevé dont la
  --    page n'était pas la liste du compte — ni import, ni rattachement.
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;$b$),
      ('public.rapprocher_importer(uuid,uuid,text)'::regprocedure,
       $a$  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;$a$,
       $b$
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : jamais d'article créé depuis
  --    une annonce que rien ne prouve être au vendeur — geste manuel compris
  --    (Louis, 19/09 : une balance Wii d'un autre vendeur importée à la main).
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;$b$),
      ('public.rapprochement_decider(uuid,text,bigint)'::regprocedure,
       $a$  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;$a$,
       $b$
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : ni rattachée à une fiche, ni
  --    importée. « ignore », « detache » et « refus_proposition » restent permis.
  IF p_decision IN ('attache', 'import') AND releve_run_hors_liste(a.run_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste');
  END IF;$b$)
    ) t(fn, ancre, ajout)
  loop
    v_def := pg_get_functiondef(r.fn);
    if position('releve_run_hors_liste' in v_def) > 0 or position('releve_hors_liste(' in v_def) > 0 then
      raise notice '% : garde déjà posée, rien à faire', r.fn;
      continue;
    end if;
    n := (length(v_def) - length(replace(v_def, r.ancre, ''))) / length(r.ancre);
    if n <> 1 then
      raise exception '% : ancre trouvée % fois (1 attendue) — migration abandonnée, rien n''est modifié', r.fn, n;
    end if;
    execute replace(v_def, r.ancre, r.ancre || r.ajout);
  end loop;
end
$patch$;
