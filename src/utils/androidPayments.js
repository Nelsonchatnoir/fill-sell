// ── Coupe-circuit des paiements Android (2026-08-07) ─────────────────────────
// Posé en urgence : validate-google-purchase (v1, bascule serveur du 05/08)
// rend 500 en prod — Google débite, le serveur ne crédite rien. Tant que ce
// n'est pas corrigé, le flux d'achat Google ne doit plus se lancer.
//
// Pilotage SANS redéploiement : coin_config.android_payments_enabled.
//   0             → flux Google bloqué, message honnête à la place ;
//   1 / absent    → flux normal.
// Réouverture : UPDATE coin_config SET value = 1 WHERE key = 'android_payments_enabled';
//
// La valeur est relue à CHAQUE clic d'achat, jamais mise en cache : remettre
// 1 en base rouvre le paiement immédiatement pour tout le monde.
//
// Fail-open assumé : si la lecture échoue (réseau), on ne bloque pas — le
// coupe-circuit est un geste d'urgence explicite, pas un mode dégradé par
// défaut. Web et iOS ne passent JAMAIS par ici.
export async function paiementsAndroidCoupes(supabase) {
  try {
    const { data, error } = await supabase
      .from("coin_config")
      .select("value")
      .eq("key", "android_payments_enabled")
      .maybeSingle();
    if (error) return false;
    return data?.value === 0;
  } catch {
    return false;
  }
}

export function messagePaiementAndroidCoupe(lang) {
  return lang === "en"
    ? "Payments are temporarily unavailable on Android — we're fixing it. Want Premium right now? Email support@fillsell.app"
    : "Paiement temporairement indisponible sur Android — on répare. Tu veux Premium tout de suite ? Écris-nous : support@fillsell.app";
}
