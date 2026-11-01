#!/bin/bash
# Assemble l'essai à blanc de 20261101073000_question_article_inconnu_vente_recente (01/11) : la migration sans
# BEGIN/COMMIT, les tests, la réparation des 123 questions et son inverse, l'inverse de la migration rejoué et relu —
# UNE transaction annulée.
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261101073000_question_article_inconnu_vente_recente.sql
I=supabase/rollbacks/20261101073000_question_article_inconnu_vente_recente_INVERSE.sql
R=scripts/reparations/20261101_questions_article_inconnu_anciennes.sql
RI=scripts/reparations/20261101_questions_article_inconnu_anciennes_INVERSE.sql
T=scripts/essais/20261101073000_essai.tests.sql
A=scripts/essais/20261101073000_essai.apres.sql
O=scripts/essais/20261101073000_essai.sql
{ echo "-- Essai à blanc de 20261101073000_question_article_inconnu_vente_recente : ROLLBACK. Généré par 20261101073000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  grep -v -E '^(BEGIN|COMMIT|begin|commit);$' "$M"
  cat "$T"
  grep -v -E '^(BEGIN|COMMIT);$' "$R"
  sed -n '/^-- §réparation$/,/^-- §fin réparation$/p' "$A"
  grep -v -E '^(BEGIN|COMMIT);$' "$RI"
  sed -n '/^-- §inverse réparation$/,/^-- §fin inverse réparation$/p' "$A"
  grep -v -E '^(BEGIN|COMMIT|begin|commit);$' "$I"
  sed -n '/^-- §inverse migration$/,$p' "$A"
} > "$O"
echo "écrit : $O"
