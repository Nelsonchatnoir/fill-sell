#!/bin/bash
# Assemble l'essai à blanc de 20261029201000_beebs_rearmer_retrait_vente_sans_fiche (29/10, lot B 4.9 B) : l'AVANT
# (fonction de la prod), la migration sans BEGIN/COMMIT, les tests, l'INVERSE rejoué et relu — UNE transaction annulée.
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261029201000_beebs_rearmer_retrait_vente_sans_fiche.sql
I=supabase/rollbacks/20261029201000_beebs_rearmer_retrait_vente_sans_fiche_INVERSE.sql
A=scripts/essais/20261029201000_avant.sql
T=scripts/essais/20261029201000_essai.tests.sql
O=scripts/essais/20261029201000_essai.sql
{ echo "-- Essai à blanc de 20261029201000_beebs_rearmer_retrait_vente_sans_fiche : ROLLBACK. Généré par 20261029201000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  cat "$A"; grep -v -E '^(BEGIN|COMMIT);$' "$M"; cat "$T"; grep -v -E '^(BEGIN|COMMIT);$' "$I"
  cat <<'FIN'
do $inverse$
begin
  insert into _r values ('I1 inverse rejoué : retraits_beebs_rearmer_revus revenue à la prod (md5 0756d52c…)',
    md5(pg_get_functiondef('public.retraits_beebs_rearmer_revus(uuid)'::regprocedure)) = '0756d52c09e79dedc45a66971a8ebf2c', null);
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
