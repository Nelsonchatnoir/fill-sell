-- Essai à blanc de 20261030120000 (lot D point 1) : rejoué DANS la transaction de l'essai, puis ROLLBACK.
-- Sous les claims de Nico (f44b5917…), fiche Vinted sans texte 1793009407689014. Rien ne survit au ROLLBACK.
-- Les traces usage_logs sont insérées comme le ferait l'extension (feature lecture_fond, origine demandee / page).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);

do $$
declare r jsonb; l record; s record; n int;
  u uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  f bigint := 1793009407689014;
begin
  -- A. Page sans annonce, annonce MASQUÉE : conclue au premier échec, motif « masquee », plus servie.
  update public.inventaire set vinted_status = 'hidden', description = null,
         attributs = coalesce(attributs, '{}'::jsonb) - 'description_sans_lecture' where id = f;
  r := public.demander_lecture_origine(f, true);
  if r->>'reason' <> 'lecture_par_l_extension' then raise exception 'A1 demande : %', r; end if;
  select count(*) into n from public.lectures_origine_en_attente() x where x.inventaire_id = f;
  if n <> 1 then raise exception 'A2 la demande neuve doit être servie (%)', n; end if;
  insert into public.usage_logs (user_id, feature, metadata)
  values (u, 'lecture_fond', jsonb_build_object('origine', 'demandee', 'resultat', 'page_sans_annonce', 'inventaire_id', f::text));
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.faite_le is null or l.motif <> 'masquee' or l.echecs <> 1 or l.dernier_echec <> 'page_sans_annonce' then raise exception 'A3 : %', row_to_json(l); end if;
  select count(*) into n from public.lectures_origine_en_attente() x where x.inventaire_id = f;
  if n <> 0 then raise exception 'A4 une demande conclue est encore servie'; end if;
  select * into s from public.lecture_origine_signal();
  -- B. Un « Publier » ordinaire dans les 24 h : pas de nouvelle lecture, la raison est dite.
  r := public.demander_lecture_origine(f);
  if r->>'reason' <> 'conclue' or r->>'motif' <> 'masquee' then raise exception 'B1 : %', r; end if;
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.faite_le is null then raise exception 'B2 un Publier a réarmé la demande conclue'; end if;
  -- C. « Réessayer » réarme toujours, compteur remis à zéro.
  r := public.demander_lecture_origine(f, true);
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.faite_le is not null or l.echecs <> 0 or l.motif is not null or l.dernier_echec is not null then raise exception 'C1 : %', row_to_json(l); end if;
  -- D. Annonce visible : page sans annonce → « illisible ».
  update public.inventaire set vinted_status = 'active' where id = f;
  insert into public.usage_logs (user_id, feature, metadata)
  values (u, 'lecture_fond', jsonb_build_object('origine', 'page', 'resultat', 'page_sans_annonce', 'inventaire_id', f::text));
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.faite_le is null or l.motif <> 'illisible' then raise exception 'D1 : %', row_to_json(l); end if;
  -- E. Échecs passagers : plafond dur de 3, puis « illisible ». Une réussite (ok) n'est jamais comptée.
  r := public.demander_lecture_origine(f, true);
  insert into public.usage_logs (user_id, feature, metadata) values
    (u, 'lecture_fond', jsonb_build_object('origine', 'demandee', 'resultat', 'onglet_indisponible', 'inventaire_id', f::text)),
    (u, 'lecture_fond', jsonb_build_object('origine', 'demandee_tete', 'resultat', 'antirobot', 'inventaire_id', f::text));
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.faite_le is not null or l.echecs <> 2 or l.motif <> 'antirobot' then raise exception 'E1 : %', row_to_json(l); end if;
  select count(*) into n from public.lectures_origine_en_attente() x where x.inventaire_id = f;
  if n <> 1 then raise exception 'E2 deux échecs passagers : encore servie (%)', n; end if;
  insert into public.usage_logs (user_id, feature, metadata) values
    (u, 'lecture_fond', jsonb_build_object('origine', 'fond', 'resultat', 'onglet_indisponible', 'inventaire_id', f::text)),
    (u, 'lecture_fond', jsonb_build_object('origine', 'demandee', 'resultat', 'ok', 'inventaire_id', f::text));
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.echecs <> 2 then raise exception 'E3 une lecture de fond ou une réussite a été comptée : %', row_to_json(l); end if;
  insert into public.usage_logs (user_id, feature, metadata)
  values (u, 'lecture_fond', jsonb_build_object('origine', 'demandee', 'resultat', 'onglet_indisponible', 'inventaire_id', f::text));
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.faite_le is null or l.echecs <> 3 or l.motif <> 'illisible' then raise exception 'E4 plafond : %', row_to_json(l); end if;
  -- F. Le choix « Faire rédiger » posé APRÈS la demande : plus servie, plus signalée (sans rien écrire sur la demande).
  r := public.demander_lecture_origine(f, true);
  select count(*) into n from public.lectures_origine_en_attente() x where x.inventaire_id = f;
  if n <> 1 then raise exception 'F1 (%)', n; end if;
  update public.inventaire set attributs = jsonb_set(coalesce(attributs, '{}'::jsonb), '{description_sans_lecture}',
         jsonb_build_object('v', 'redigee', 'source', 'manuel', 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = f;
  select count(*) into n from public.lectures_origine_en_attente() x where x.inventaire_id = f;
  if n <> 0 then raise exception 'F2 servie après le choix'; end if;
  select * into s from public.lecture_origine_signal();
  if s.n <> 0 then raise exception 'F3 signalée après le choix : %', row_to_json(s); end if;
  -- G. Un choix ANCIEN (avant la demande) ne l'éteint pas : la question se repose à chaque Publier.
  update public.inventaire set attributs = jsonb_set(attributs, '{description_sans_lecture,at}', '"2026-01-01T00:00:00.000Z"') where id = f;
  r := public.demander_lecture_origine(f, true);
  select count(*) into n from public.lectures_origine_en_attente() x where x.inventaire_id = f;
  if n <> 1 then raise exception 'G1 un choix ancien a éteint une demande neuve (%)', n; end if;
  -- H. Un texte sur la fiche : plus servie.
  update public.inventaire set description = 'Robe longue fleurie taille M' where id = f;
  select count(*) into n from public.lectures_origine_en_attente() x where x.inventaire_id = f;
  if n <> 0 then raise exception 'H1 servie alors que la fiche a son texte'; end if;
  -- I. La conclusion de l'extension accepte les nouveaux motifs.
  update public.inventaire set description = null where id = f;
  r := public.demander_lecture_origine(f, true);
  perform public.lecture_origine_conclure(f, 'masquee');
  select * into l from public.lectures_origine_demandees where inventaire_id = f;
  if l.faite_le is null or l.motif <> 'masquee' then raise exception 'I1 : %', row_to_json(l); end if;
  -- J. Une trace d'un AUTRE compte ne touche jamais cette demande.
  r := public.demander_lecture_origine(f, true);
  reset role;
  insert into public.usage_logs (user_id, feature, metadata)
  values ('2f4383e9-23c5-4f2f-9290-103256a7f263', 'lecture_fond', jsonb_build_object('origine', 'demandee', 'resultat', 'page_sans_annonce', 'inventaire_id', f::text));
  select * into l from public.lectures_origine_demandees where inventaire_id = f and user_id = u;
  if l.faite_le is not null or l.echecs <> 0 then raise exception 'J1 un autre compte a touché la demande : %', row_to_json(l); end if;
  raise notice 'ESSAI 20261030120000 : A→J verts (10 groupes)';
end $$;
