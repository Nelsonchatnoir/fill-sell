#!/bin/bash
# Assemble l'essai à blanc de 20261027120000 (migration et réparation sans BEGIN/COMMIT + tests, transaction annulée).
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261027120000_releve_identifiant_avant_fiche.sql
R=scripts/reparations/20261027_doublons_identifiant.sql
T=scripts/essais/20261027120000_essai.tests.sql
O=scripts/essais/20261027120000_essai.sql
{ echo "-- Essai à blanc de 20261027120000_releve_identifiant_avant_fiche + réparation 20261027 : ROLLBACK. Généré par 20261027120000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '120s';"
  grep -v -E '^(BEGIN|COMMIT);$' "$M"; grep -v -E '^(BEGIN|COMMIT);$' "$R"; cat "$T"; echo "rollback;"; } > "$O"
echo "écrit : $O"
