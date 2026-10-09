import { readFileSync } from 'node:fs';
import path from 'node:path';

// Constantes de l'APP que le site vitrine lit par motif (09/10/2026).
//
// Le site n'importe jamais supabase-js : il n'a besoin que de la CLÉ du jeton
// de session (aiguillage vers /app quand une session existe). Lue dans
// src/lib/supabase.js par motif : un changement de forme fait tomber le
// contrôle de TOUS les builds locaux (controleSite), jamais seulement Vercel.
//
// (Jusqu'au 09/10, ce fichier s'appelait quotas.mjs et lisait aussi
// coin_config et GRANTS_FALLBACK pour afficher des quotas : décision de Nico
// du 09/10, aucun chiffre de quota nulle part — mécanique retirée.)

/** Constantes publiques du client Supabase, lues dans src/lib/supabase.js. */
export function constantesSupabase(racine) {
  const fichier = path.join(racine, 'src', 'lib', 'supabase.js');
  const source = readFileSync(fichier, 'utf8');
  const url = /export const supabaseUrl\s*=\s*['"]([^'"]+)['"]/.exec(source)?.[1];
  const cle = /export const supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/.exec(source)?.[1];
  const ref = url && /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(url)?.[1];
  if (!url || !cle || !ref) {
    throw new Error(
      `[site] src/lib/supabase.js : supabaseUrl / supabaseAnonKey introuvables ou de forme inattendue. ` +
      'Le site en a besoin pour la clé du jeton de session (aiguillage vers /app).',
    );
  }
  // Clé EXACTE du jeton de session de supabase-js : sb-<ref>-auth-token. Pas
  // un motif : « sb-<ref>-auth-token-code-verifier » (échange PKCE en cours)
  // ne prouve aucune session.
  return { url, cle, cleJeton: `sb-${ref}-auth-token` };
}
