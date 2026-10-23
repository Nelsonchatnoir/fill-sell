#!/bin/bash
# Assemble l'essai à blanc de 20261023150000 (migration sans BEGIN/COMMIT + tests, transaction annulée).
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261023150000_remplacee_par_compte_relie_boutiques_distinctes.sql
T=scripts/essais/20261023150000_essai.tests.sql
O=scripts/essais/20261023150000_essai.sql
{ echo "-- Essai à blanc de 20261023150000_remplacee_par_compte_relie_boutiques_distinctes : ROLLBACK. Généré par 20261023150000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '170s';"
  grep -v -E '^(BEGIN|COMMIT);$' "$M"; cat "$T"; echo "rollback;"; } > "$O"
echo "écrit : $O"
