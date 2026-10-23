#!/bin/bash
# Assemble l'essai à blanc de 20261024140000 (migration sans BEGIN/COMMIT + tests, transaction annulée).
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261024140000_refus_plateformes_vraie_cause.sql
T=scripts/essais/20261024140000_essai.tests.sql
O=scripts/essais/20261024140000_essai.sql
{ echo "-- Essai à blanc de 20261024140000_refus_plateformes_vraie_cause : ROLLBACK. Généré par 20261024140000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  grep -v -E '^(BEGIN|COMMIT);$' "$M"; cat "$T"; echo "rollback;"; } > "$O"
echo "écrit : $O"
