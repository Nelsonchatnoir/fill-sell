#!/bin/bash
# Assemble l'essai à blanc de 20261023100000 (migration sans BEGIN/COMMIT + tests, transaction annulée).
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261023100000_photos_origine_toutes.sql
T=scripts/essais/20261023100000_essai.tests.sql
O=scripts/essais/20261023100000_essai.sql
{ echo "-- Essai à blanc de 20261023100000_photos_origine_toutes : ROLLBACK. Généré par 20261023100000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  grep -v -E '^(BEGIN|COMMIT);$' "$M"; cat "$T"; echo "rollback;"; } > "$O"
echo "écrit : $O"
