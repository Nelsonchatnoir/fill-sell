#!/bin/bash
# Assemble l'essai à blanc de 20261022200000 : migration (sans son BEGIN/COMMIT) + tests, dans UNE transaction annulée.
# Usage : bash scripts/essais/20261022200000_generer.sh && npx supabase db query --linked -f scripts/essais/20261022200000_essai.sql
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261022200000_file_synchro_boutique_partagee.sql
T=scripts/essais/20261022200000_essai.tests.sql
O=scripts/essais/20261022200000_essai.sql
{
  echo "-- Essai à blanc de 20261022200000_file_synchro_boutique_partagee (22/10 soir) : ROLLBACK, rien n'est gardé."
  echo "-- Généré par scripts/essais/20261022200000_generer.sh — ne pas éditer à la main."
  echo "begin;"
  echo "set local statement_timeout = '170s';"
  grep -v -E '^(BEGIN|COMMIT);$' "$M"
  cat "$T"
  echo "rollback;"
} > "$O"
echo "écrit : $O ($(wc -l < "$O") lignes)"
