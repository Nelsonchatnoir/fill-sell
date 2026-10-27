#!/bin/bash
# Assemble l'essai à blanc de 20261027100000 (migration et réparation sans BEGIN/COMMIT + tests, transaction annulée).
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261027100000_jamais_en_ligne_referme_par_le_releve.sql
R=scripts/reparations/20261027_jamais_en_ligne_refermes.sql
T=scripts/essais/20261027100000_essai.tests.sql
O=scripts/essais/20261027100000_essai.sql
{ echo "-- Essai à blanc de 20261027100000_jamais_en_ligne_referme_par_le_releve + réparation 20261027 : ROLLBACK. Généré par 20261027100000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  grep -v -E '^(BEGIN|COMMIT);$' "$M"; grep -v -E '^(BEGIN|COMMIT);$' "$R"; cat "$T"; echo "rollback;"; } > "$O"
echo "écrit : $O"
