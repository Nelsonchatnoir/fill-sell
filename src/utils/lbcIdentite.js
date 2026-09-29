// Transaction sécurisée Leboncoin — uniquement une preuve booléenne et datée.
// Les valeurs de nom/prénom restent chez Leboncoin et ne sont jamais reçues.

export const IDENTITE_LBC_FRAICHE_MS = 3 * 60 * 60 * 1000;

function versionAuMoins(version, minimum) {
  const morceaux = (v) => String(v ?? '').trim().split('.').map((x) => Number.parseInt(x, 10) || 0);
  if (!String(version ?? '').trim()) return false;
  const a = morceaux(version);
  const b = morceaux(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/**
 * Rend { supportee, presente, verifie_le }. `presente` est tri-état : true,
 * false, ou null si la preuve est absente/périmée.
 */
export function preuveIdentiteLeboncoin(sessions, extensionVersion, maintenant = Date.now()) {
  const supportee = versionAuMoins(extensionVersion, '0.6.80');
  if (!supportee) return { supportee: false, presente: null, verifie_le: null };
  const brut = sessions?.checked_at_par_plateforme?.leboncoin_identite ?? null;
  const vu = brut ? Date.parse(brut) : NaN;
  const frais = Number.isFinite(vu) && vu <= maintenant + 60_000 && maintenant - vu <= IDENTITE_LBC_FRAICHE_MS;
  return {
    supportee: true,
    presente: frais && typeof sessions?.leboncoin_identite === 'boolean' ? sessions.leboncoin_identite : null,
    verifie_le: frais ? brut : null,
  };
}
