// ═══════════════════════════════════════════════════════════════════════════
// SUR QUELLE BOUTIQUE VINTED PART UNE PUBLICATION (15/10 soir, Louis — Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Un compte à plusieurs boutiques n'est plus jamais bloqué par la question
// « Sur quelle de tes boutiques Vinted publier cet article ? » (11/10). Ordre :
//   1. l'article est déjà lié à une boutique (inventaire.vinted_account_id) →
//      cette boutique (règle du 11/10 inchangée : il ne part que sur elle) ;
//   2. la personne a changé la boutique dans sa file (vinted_boutique_choisie) ;
//   3. la boutique par défaut du compte (Réglages › Mes plateformes,
//      platform_settings.vinted.boutique_defaut) ;
//   4. sans réglage, la boutique ouverte dans le navigateur au moment de
//      l'envoi (identité fraîche de la sonde de l'extension).
// ⛔ GARDE-FOU : jamais une boutique qui n'est pas confirmée sur CE compte
//    FillSell (vinted_sync_pin.boutiques) — une boutique ouverte étrangère
//    retient la publication, elle ne part jamais dessus. L'extension relit la
//    boutique juste avant le clic de dépôt (vinted.js, 0.6.109+) : autre
//    boutique ou illisible → rien n'est soumis.
// Compte à une boutique (ou aucune confirmée) : rien ne change ici.
// Pur (Deno + Vite + Node) : scripts/boutique-publication-vinted-selftest.mjs.

const txt = (v) => String(v ?? '').trim();
const sansArobase = (v) => txt(v).replace(/^@/, '').toLowerCase();

/** Les boutiques confirmées du compte : [{ user_id, login }]. */
export function boutiquesConfirmees(boutiques) {
  return (Array.isArray(boutiques) ? boutiques : [])
    .map((b) => ({ user_id: txt(b?.user_id), login: b?.login ? txt(b.login) : null }))
    .filter((b) => b.user_id);
}

/** « @login » ou numéro → numéro de boutique confirmée, sinon null. */
export function idBoutiqueConfirmee(valeur, boutiques) {
  const c = sansArobase(valeur);
  if (!c) return null;
  const b = boutiquesConfirmees(boutiques).find((x) => x.user_id === c || (x.login ?? '').toLowerCase() === c);
  return b ? b.user_id : null;
}

/**
 * → { boutique, source, motif }
 *   source : 'article' | 'choix' | 'defaut' | 'session' | null
 *   motif  : null (une boutique est retenue) | 'mono' (compte à une boutique :
 *            rien à décider ici) | 'session_inconnue' (aucune boutique lisible
 *            dans le navigateur : la publication attend l'ordinateur, sans
 *            question) | 'boutique_non_confirmee' (la boutique ouverte n'est
 *            pas sur ce compte : rien ne part)
 * @param {{ boutiqueArticle?: unknown, boutiqueChoisie?: unknown, boutiqueDefaut?: unknown, boutiqueSession?: unknown, boutiques?: unknown }} [p]
 * @returns {{ boutique: string | null, source: string | null, motif: string | null }}
 */
export function boutiquePublicationVinted({ boutiqueArticle = null, boutiqueChoisie = null, boutiqueDefaut = null, boutiqueSession = null, boutiques = [] } = {}) {
  const article = txt(boutiqueArticle);
  if (article) return { boutique: article, source: 'article', motif: null };
  const confirmees = boutiquesConfirmees(boutiques);
  if (confirmees.length < 2) return { boutique: null, source: null, motif: 'mono' };
  const choisie = idBoutiqueConfirmee(boutiqueChoisie, confirmees);
  if (choisie) return { boutique: choisie, source: 'choix', motif: null };
  const defaut = idBoutiqueConfirmee(boutiqueDefaut, confirmees);
  if (defaut) return { boutique: defaut, source: 'defaut', motif: null };
  const session = txt(boutiqueSession);
  if (!session) return { boutique: null, source: null, motif: 'session_inconnue' };
  if (!confirmees.some((b) => b.user_id === session)) return { boutique: null, source: null, motif: 'boutique_non_confirmee' };
  return { boutique: session, source: 'session', motif: null };
}

/** Le login d'une boutique confirmée (affichage), sinon null. */
export function loginBoutique(id, boutiques) {
  const b = boutiquesConfirmees(boutiques).find((x) => x.user_id === txt(id));
  return b?.login ?? null;
}
