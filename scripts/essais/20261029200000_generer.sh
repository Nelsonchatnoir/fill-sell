#!/bin/bash
# Assemble l'essai à blanc de 20261029200000_beebs_un_seul_juge_jamais_en_ligne (29/10, lot B 4.5/4.9) :
# l'AVANT (règle de la prod sur les 4 dépôts, écritures défaites), la migration sans BEGIN/COMMIT, les tests, l'INVERSE
# rejoué et relu — le tout dans UNE transaction annulée (ROLLBACK). Rien n'est écrit en base.
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261029200000_beebs_un_seul_juge_jamais_en_ligne.sql
I=supabase/rollbacks/20261029200000_beebs_un_seul_juge_jamais_en_ligne_INVERSE.sql
A=scripts/essais/20261029200000_avant.sql
T=scripts/essais/20261029200000_essai.tests.sql
O=scripts/essais/20261029200000_essai.sql
{ echo "-- Essai à blanc de 20261029200000_beebs_un_seul_juge_jamais_en_ligne : ROLLBACK. Généré par 20261029200000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  cat "$A"; grep -v -E '^(BEGIN|COMMIT);$' "$M"; cat "$T"; grep -v -E '^(BEGIN|COMMIT);$' "$I"
  cat <<'FIN'
do $inverse$
begin
  insert into _r values ('I1 inverse rejoué : trancher revenue à la prod (md5 6ea3fdf…), les trois fonctions retirées',
    md5(pg_get_functiondef('public.trancher_publications_sans_lien(uuid,text,uuid)'::regprocedure)) = '6ea3fdf30588cf009c3bf3ba50ec1058'
    and to_regprocedure('public.beebs_preuve_jamais_en_ligne(uuid,text,timestamp with time zone,numeric,jsonb,uuid)') is null
    and to_regprocedure('public.releve_beebs_voit_tout_en_ligne(uuid)') is null
    and to_regprocedure('public.beebs_message_jamais_en_ligne(jsonb,boolean,text)') is null, null);
end
$inverse$;
select essai, ok, detail from (
  select essai, ok, detail from _r
  union all select 'Σ verts', bool_and(ok), (count(*) filter (where ok))::text || '/' || count(*)::text from _r) s
 order by essai;
rollback;
FIN
} > "$O"
echo "écrit : $O"
