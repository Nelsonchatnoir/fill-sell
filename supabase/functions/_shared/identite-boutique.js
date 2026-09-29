// Seules les opérations qui touchent une annonce Vinted EXISTANTE ont une
// boutique d'origine à respecter. Une publication neuve part toujours sur la
// boutique ouverte dans Chrome : elle ne doit jamais passer par cette garde.
export function exigePreuveBoutiqueVinted({ action, platform }) {
  return platform === 'vinted' && ['delete', 'republish'].includes(action);
}

// Une boutique non confirmée ne peut pas fournir d'article à une opération
// destructive. Le transport reste compatible avec les extensions installées.
export function verifierBoutiqueOperation({ action, platform, boutiqueArticle, boutiqueSession, boutiques, lectureFiable, sessionRequise = true, historiqueListingProuve = false }) {
  const origine = String(boutiqueArticle ?? '').trim();
  const session = String(boutiqueSession ?? '').trim();
  const destructive = exigePreuveBoutiqueVinted({ action, platform });
  if (!destructive) return null;
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

export function idAnnonceVintedExact(j) {
  const colonne = String(j?.platform_listing_id || '').trim();
  const lienBrut = String(j?.listing_url || '').trim();
  const lien = lienBrut.match(/^https:\/\/(?:www\.)?vinted\.[a-z.]+\/items\/(\d+)(?:[-/?#]|$)/i)?.[1] || '';
  // Deux identifiants présents doivent raconter exactement la même chose.
  // Une colonne invalide ou un lien Vinted illisible n'est jamais masqué par
  // l'autre champ : le retrait attend une preuve cohérente.
  if (colonne && !/^\d+$/.test(colonne)) return '';
  if (lienBrut && !lien) return '';
  if (colonne && lien && colonne !== lien) return '';
  return colonne || lien;
}

function estDepotVintedFillSellExact(job, d) {
  const cible = idAnnonceVintedExact(job);
  return !!cible && d?.id !== job?.id && d?.platform === 'vinted'
    && ['publish','republish'].includes(d?.action)
    && ['published','cancelled','sold'].includes(d?.status)
    && idAnnonceVintedExact(d) === cible
    && String(d?.handler_build || '').trim().length > 0
    && !/sync-dressing|releve-annonces/i.test(String(d?.handler_build || ''));
}

// La preuve historique porte sur CET identifiant, publié par FillSell pour
// CETTE fiche. Elle n'invente pas le propriétaire Chrome : sa lecture reste
// locale.
export function depotVintedExact(job, depots) {
  const cible = idAnnonceVintedExact(job);
  if (!cible || job?.inventaire_id == null) return false;
  return (depots || []).some(d => estDepotVintedFillSellExact(job, d)
    && String(d.inventaire_id) === String(job.inventaire_id));
}

// Après suppression de la fiche, la FK met `inventaire_id` à NULL. L'identité
// de l'annonce, elle, survit : on peut retrouver le dépôt par son id exact,
// même si son statut est ensuite devenu cancelled/sold. C'est
// `retrait_job_prouve(source.id)` qui exclut les imports, fusions et
// rattachements non certains. Cette fonction ne compare JAMAIS les titres.
export function depotVintedExactParAnnonce(job, depots) {
  return (depots || []).find(d => estDepotVintedFillSellExact(job, d)) ?? null;
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
