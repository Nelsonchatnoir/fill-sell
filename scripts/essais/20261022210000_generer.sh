#!/bin/bash
# Assemble l'essai à blanc de 20261022210000 (migration sans BEGIN/COMMIT + tests, transaction annulée).
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261022210000_contenu_du_vendeur.sql
T=scripts/essais/20261022210000_essai.tests.sql
O=scripts/essais/20261022210000_essai.sql
{ echo "-- Essai à blanc de 20261022210000_contenu_du_vendeur : ROLLBACK. Généré par 20261022210000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  grep -v -E '^(BEGIN|COMMIT);$' "$M"; cat "$T"; echo "rollback;"; } > "$O"
echo "écrit : $O"
