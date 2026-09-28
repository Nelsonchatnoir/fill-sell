// Une boutique non confirmée ne peut pas fournir d'article à une opération.
// Le transport reste compatible avec les extensions déjà installées.
export function verifierBoutiqueOperation({ action, platform, boutiqueArticle, boutiqueSession, boutiques, lectureFiable }) {
  const origine = String(boutiqueArticle ?? '').trim();
  const session = String(boutiqueSession ?? '').trim();
  const destructive = platform === 'vinted' && ['delete', 'republish'].includes(action);
  const importe = !!origine && ['publish', 'republish', 'delete'].includes(action);
  if (!destructive && !importe) return null;
  if (!lectureFiable) return 'lecture_indisponible';
  const confirmees = new Set((Array.isArray(boutiques) ? boutiques : []).map(b => String(b?.user_id ?? '').trim()).filter(Boolean));
  if (!origine) return 'origine_inconnue';
  if (!confirmees.has(origine)) return 'boutique_non_confirmee';
  if (destructive && !session) return 'session_inconnue';
  if (destructive && origine !== session) return 'boutique_etrangere';
  return null;
}

export function identiteBoutiqueFraiche(sessions, maintenant = Date.now()) {
  const date = Date.parse(String(sessions?.checked_at ?? ''));
  if (!Number.isFinite(date) || date > maintenant || maintenant-date > 30*60*1000) return null;
  const id = String(sessions?.vinted_identite?.user_id ?? '').trim();
  return id ? sessions.vinted_identite : null;
}

export function origineBoutiqueProuvee(article, job) {
  const a = String(article ?? '').trim();
  const j = String(job ?? '').trim();
  return { origine: a || j, contradictoire: !!a && !!j && a !== j };
}
