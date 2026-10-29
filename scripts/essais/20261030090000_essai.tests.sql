-- Essai à blanc de 20261030090000 (lot C partie 1) : rejoué DANS la transaction de l'essai, puis ROLLBACK.
-- Sous les claims de Nico (f44b5917…), fiche Vinted sans texte 1793009407689014 (annonce 9872357762).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);

do $$
declare r jsonb; l record; s record; n int;
begin
  r := public.demander_lecture_origine(1793009407689014);
  if r->>'reason' <> 'lecture_par_l_extension' then raise exception 'E1 demande : %', r; end if;
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.faite_le is not null or l.prise_le is not null or l.motif is not null then raise exception 'E2 ligne neuve : %', row_to_json(l); end if;
  select * into s from public.lecture_origine_signal();
  if s.n < 1 then raise exception 'E3 signal : %', row_to_json(s); end if;
  perform public.lecture_origine_essai(1793009407689014, 'prise', null);
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.prise_le is null then raise exception 'E4 prise'; end if;
  perform public.lecture_origine_essai(1793009407689014, 'echec', 'onglet_indisponible');
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.motif <> 'onglet_indisponible' or l.essai_le is null or l.faite_le is not null then raise exception 'E5 échec : %', row_to_json(l); end if;
  -- Dans les 15 min, une demande ordinaire ne remet rien à zéro ; « Réessayer » (p_relancer) si.
  r := public.demander_lecture_origine(1793009407689014);
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.motif is null then raise exception 'E6 une demande ordinaire a effacé l''échec'; end if;
  r := public.demander_lecture_origine(1793009407689014, true);
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.motif is not null or l.prise_le is not null or l.essai_le is not null or l.faite_le is not null then raise exception 'E7 relance : %', row_to_json(l); end if;
  perform public.lecture_origine_conclure(1793009407689014, 'introuvable');
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.faite_le is null or l.motif <> 'introuvable' then raise exception 'E8 conclusion : %', row_to_json(l); end if;
  select * into s from public.lecture_origine_signal();
  if s.n <> 0 then raise exception 'E9 signal après conclusion : %', row_to_json(s); end if;
  -- Une demande close repart à la demande suivante (comme avant), motif effacé.
  r := public.demander_lecture_origine(1793009407689014);
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.faite_le is not null or l.motif is not null then raise exception 'E10 redemande : %', row_to_json(l); end if;
  perform public.lecture_origine_faite(1793009407689014);
  select * into l from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
  if l.faite_le is null or l.motif is not null then raise exception 'E11 faite : %', row_to_json(l); end if;
  -- La liste : la plus récente d'abord.
  select count(*) into n from public.lectures_origine_en_attente();
  raise notice 'ESSAI 20261030090000 : 11/11 VERTS (liste en attente : % lignes)', n;
end $$;
reset role;
-- Un autre compte ne voit ni n'écrit la demande de Nico.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare s record;
begin
  perform public.lecture_origine_essai(1793009407689014, 'echec', 'intrus');
  select * into s from public.lecture_origine_signal();
  if s.n <> 0 then raise exception 'E12 un autre compte voit un signal'; end if;
end $$;
reset role;
select inventaire_id, motif, faite_le is not null as faite from public.lectures_origine_demandees where inventaire_id = 1793009407689014;
