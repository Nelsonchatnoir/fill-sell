// Une boutique non confirmée ne peut pas fournir d'article à une opération.
// Le transport reste compatible avec les extensions déjà installées.
export function verifierBoutiqueOperation({ action, platform, boutiqueArticle, boutiqueSession, boutiques, lectureFiable, sessionRequise = true, historiqueListingProuve = false }) {
  const origine = String(boutiqueArticle ?? '').trim();
  const session = String(boutiqueSession ?? '').trim();
  const destructive = platform === 'vinted' && ['delete', 'republish'].includes(action);
  const importe = !!origine && ['publish', 'republish', 'delete'].includes(action);
  if (!destructive && !importe) return null;
  if (!lectureFiable) return 'lecture_indisponible';
  const confirmees = new Set((Array.isArray(boutiques) ? boutiques : []).map(b => String(b?.user_id ?? '').trim()).filter(Boolean));
  if (!origine) return destructive && !sessionRequise && historiqueListingProuve ? null : 'origine_inconnue';
  if (!confirmees.has(origine)) return 'boutique_non_confirmee';
  // Le serveur ne connaît pas toujours la session Chrome (anciens clients,
  // sonde sans identité). Son absence ne prouve pas une boutique étrangère.
  // La vérification locale avant geste reste stricte ; seul le distributeur
  // peut déléguer cette lecture au handler déjà installé.
  if (destructive && !session && sessionRequise) return 'session_inconnue';
  if (destructive && session && origine !== session) return 'boutique_etrangere';
  return null;
}

// La preuve porte sur CET identifiant, publié par FillSell pour CETTE fiche.
// Elle n'invente pas le propriétaire Chrome : sa lecture reste locale.
export function depotVintedExact(job, depots) {
  const id = j => String(j?.platform_listing_id || '').trim() || String(j?.listing_url || '').match(/^https:\/\/(?:www\.)?vinted\.[a-z.]+\/items\/(\d+)(?:[-/?#]|$)/i)?.[1] || '';
  const cible = id(job);
  if (!cible || job?.inventaire_id == null) return false;
  return (depots || []).some(d => d.id !== job.id && d.platform === 'vinted' &&
    ['publish','republish'].includes(d.action) && d.status === 'published' &&
    String(d.inventaire_id) === String(job.inventaire_id) && id(d) === cible &&
    /^\d{4}-\d{2}-\d{2}T/.test(String(d.handler_build || '')) &&
    !/sync-dressing|releve-annonces/i.test(d.handler_build));
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
