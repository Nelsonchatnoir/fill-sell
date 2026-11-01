#!/bin/bash
# Assemble l'essai à blanc de 20261101100000_lot_vinted_parts_egales (01/11) : l'ancienne règle sur tout le parc (AVANT),
# la migration sans BEGIN/COMMIT, les tests, la réparation des 34 lots et son inverse, l'inverse de la migration rejoué
# et relu — UNE transaction annulée.
cd "$(dirname "$0")/../.."
M=supabase/migrations/20261101100000_lot_vinted_parts_egales.sql
I=supabase/rollbacks/20261101100000_lot_vinted_parts_egales_INVERSE.sql
R=scripts/reparations/20261101_lots_vinted_parts_egales.sql
RI=scripts/reparations/20261101_lots_vinted_parts_egales_INVERSE.sql
T=scripts/essais/20261101100000_essai.tests.sql
O=scripts/essais/20261101100000_essai.sql
bloc() { sed -n "/^-- §$1\$/,/^-- §fin $1\$/p" "$T"; }
{ echo "-- Essai à blanc de 20261101100000_lot_vinted_parts_egales : ROLLBACK. Généré par 20261101100000_generer.sh."
  echo "begin;"; echo "set local statement_timeout = '300s';"
  bloc avant
  grep -v -E '^(BEGIN|COMMIT|begin|commit);$' "$M"
  bloc tests
  grep -v -E '^(BEGIN|COMMIT);$' "$R"
  bloc "apres reparation"
  grep -v -E '^(BEGIN|COMMIT);$' "$RI"
  bloc "apres inverse reparation"
  grep -v -E '^(BEGIN|COMMIT|begin|commit);$' "$I"
  sed -n '/^-- §inverse migration$/,$p' "$T"
} > "$O"
echo "écrit : $O"
