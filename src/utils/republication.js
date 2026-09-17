// ═════════════════════════════════════════════════════════════════════════════
// REPUBLICATION MULTIPLATEFORME — côté app (2026-09-17)
// docs/REPUBLICATION_MULTIPLATEFORME_CONCEPTION.md
// ═════════════════════════════════════════════════════════════════════════════
// UNE seule porte pour lancer une republication, quelle que soit la
// plateforme : Vinted garde son appel historique (vintedSync.republierArticleVinted,
// 4 paramètres — inchangé, il marche avec l'ancienne ET la nouvelle signature
// de la RPC) ; Leboncoin / Beebs / Opla passent le 5e paramètre `p_platform`
// (migration 20260917220000). Si la migration n'est pas encore appliquée,
// PostgREST refuse la signature : on le DIT (republication_multi_indisponible)
// au lieu d'un message technique, et rien n'est débité.
//
// L'ÉLIGIBILITÉ par plateforme vit ici aussi — une seule expression, lue par
// le bouton de la carte, la feuille et le mode lot : ils ne peuvent pas se
// contredire. Vinted : la règle historique de repubEtat (StockTab) est
// reproduite à l'identique ; les autres : annonce EN LIGNE portée par un job
// FillSell (computeRemovalInfo.publishedActive + listing_url), aucune
// republication vivante sur cette plateforme, aucune aboutie depuis 24 h.
import { computeRemovalInfo, vintedMasqueeMalgreJobs } from './publicationState';
import { republierArticleVinted } from './vintedSync';
import { PLATEFORMES_STOCK, plateformesDuCompte } from './stockFiltres';

// Dérivée de la table unique du stock (utils/stockFiltres) : tout sauf eBay —
// eBay reste HORS republication (garde-fou du 17/09), rien d'autre n'est exclu.
export const PLATEFORMES_REPUBLIABLES = PLATEFORMES_STOCK.filter((p) => p !== 'ebay');
export const LABEL_PLATEFORME = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };
export const LABEL_COURT = { vinted: 'Vinted', leboncoin: 'LBC', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };

const REASON_SIGNATURE_RE = /function|signature|p_platform|schema cache|PGRST202/i;

// Dernier job republish d'un article POUR une plateforme.
export function dernierRepublish(jobsAll, platform) {
  let last = null;
  for (const j of jobsAll ?? []) {
    if (j.action !== 'republish' || j.platform !== platform) continue;
    if (!last || Date.parse(j.created_at || 0) > Date.parse(last.created_at || 0)) last = j;
  }
  return last;
}

// État de republication d'un article sur UNE plateforme :
//   'ok' | 'vivant' | 'cadence' | 'gelee' | 'ineligible'
export function repubEtatPlateforme(item, jobsAll, platform) {
  const jobs = jobsAll ?? [];
  if (platform === 'vinted') {
    if (!(item?.vinted_item_id && !item?.disparu_le && item?.statut !== 'vendu'
      && !vintedMasqueeMalgreJobs(item, jobs))) return 'ineligible';
  } else {
    if (!item || item.disparu_le || item.statut === 'vendu') return 'ineligible';
    const { publishedActive, latestPubByPlatform } = computeRemovalInfo(jobs);
    if (!publishedActive.includes(platform)) return 'ineligible';
    // Sans lien, le retrait ne saurait pas cibler : pas republiable (Beebs en
    // vérification, URL jamais captée…).
    if (!String(latestPubByPlatform[platform]?.listing_url ?? '').trim()) return 'ineligible';
  }
  const last = dernierRepublish(jobs, platform);
  if (last?.platform_fields?.gel_livres_le) return 'gelee';
  if (last && (last.status === 'pending' || last.status === 'processing' || last.status === 'needs_user')) return 'vivant';
  if (last && last.status === 'published') {
    const repere = Date.parse(last.platform_fields?.recreated_at ?? last.published_at ?? '');
    if (Number.isFinite(repere) && Date.now() - repere < 24 * 3600 * 1000) return 'cadence';
  }
  return 'ok';
}

// Les plateformes republiables MAINTENANT pour un article (dans l'ordre
// d'affichage). `multiOuverte` = interrupteur serveur lu par l'app : à faux,
// Vinted seul — rien ne change pour personne tant qu'il est à 0.
// `plateformesOuvertes` (App.jsx) : Opla n'entre que si elle est ouverte pour
// CE compte — même condition que la carte, le stepper et les chips
// (plateformesDuCompte), jamais une liste à part.
export function plateformesRepubliables(item, jobsAll, { multiOuverte = false, plateformesOuvertes = [] } = {}) {
  const compte = plateformesDuCompte(plateformesOuvertes);
  const liste = (multiOuverte ? PLATEFORMES_REPUBLIABLES : ['vinted']).filter((p) => compte.includes(p));
  return liste.filter((p) => repubEtatPlateforme(item, jobsAll, p) === 'ok');
}

// Le job republish en needs_user le plus récent, toutes plateformes — celui
// que le bouton « Republier maintenant / Compléter » doit viser.
export function republishAReprendre(jobsAll) {
  let r = null;
  for (const j of jobsAll ?? []) {
    if (j.action !== 'republish' || j.status !== 'needs_user') continue;
    if (!r || Date.parse(j.created_at || 0) > Date.parse(r.created_at || 0)) r = j;
  }
  return r;
}

export async function republierArticle(supabase, { platform, inventaireId, vintedItemId = null, prixRepublication = null }) {
  if (platform === 'vinted') {
    return republierArticleVinted(supabase, { inventaireId, vintedItemId, prixRepublication });
  }
  const prix = Number(prixRepublication);
  const { data, error } = await supabase.rpc('spend_coins_and_republish', {
    p_inventaire_id: inventaireId ?? null,
    p_vinted_item_id: null,
    p_source: 'manuel',
    p_prix_republication: Number.isFinite(prix) && prix >= 1 ? prix : null,
    p_platform: platform,
  });
  if (error) {
    if (REASON_SIGNATURE_RE.test(String(error.message ?? ''))) {
      return { success: false, reason: 'republication_multi_indisponible', error: error.message, platform };
    }
    return { success: false, error: error.message, platform };
  }
  if (data?.allowed === false) return { success: false, ...data, platform };
  return { success: true, job_id: data?.job_id ?? null, price: data?.price ?? null, platform };
}

// Le refus, en mots — UNE table pour toutes les plateformes. `res.message`
// (serveur) prime quand il existe : il est écrit pour être lu.
export function messageRefusRepublication(res, lang = 'fr', platform = res?.platform ?? 'vinted') {
  const fr = lang !== 'en';
  const nom = LABEL_PLATEFORME[platform] ?? platform;
  if (res?.message) return res.message;
  const M = {
    extension_trop_ancienne: fr
      ? (platform === 'vinted'
        ? "L'extension de ton ordinateur doit passer en 0.5.0 ou plus récente pour republier."
        : `Republier sur ${nom} demande l'extension 0.6.42 ou plus récente : Chrome la met à jour tout seul, réessaie un peu plus tard.`)
      : (platform === 'vinted'
        ? 'The extension on your computer needs version 0.5.0 or newer to repost.'
        : `Reposting on ${nom} needs extension 0.6.42 or newer: Chrome updates it on its own, try again a bit later.`),
    republish_en_cours: fr ? `Une republication est déjà en cours sur ${nom} pour cet article.` : `A repost is already running on ${nom} for this item.`,
    cadence_24h: fr ? `Déjà republié sur ${nom} il y a moins de 24 h — une republication par annonce et par jour.` : `Already reposted on ${nom} less than 24 h ago — one repost per listing per day.`,
    plafond_republication_mensuel: fr
      ? `Tes ${res?.plafond ?? ''} republications du mois sont faites — ça repart au prochain cycle.`
      : `Your ${res?.plafond ?? ''} monthly repostings are done — back next cycle.`,
    republication_multi_fermee: fr ? `La republication sur ${nom} n'est pas encore ouverte sur ton compte.` : `Reposting on ${nom} is not open on your account yet.`,
    republication_multi_indisponible: fr ? `La republication sur ${nom} arrive : elle n'est pas encore activée côté serveur. Rien n'a été décompté.` : `Reposting on ${nom} is coming: it is not enabled server-side yet. Nothing was charged.`,
    annonce_introuvable: fr ? `Aucune annonce ${nom} en ligne déposée par FillSell pour cet article : republier n'est possible que sur une annonce que FillSell a publiée.` : `No live ${nom} listing published by FillSell for this item: only listings FillSell published can be reposted.`,
    article_vendu: fr ? 'Cet article est vendu : rien à republier.' : 'This item is sold: nothing to repost.',
    article_sans_photo: fr ? 'Sans photo, la republication ne peut pas aboutir.' : 'Without a photo the repost cannot go through.',
    invalid_platform: fr ? 'Plateforme inconnue.' : 'Unknown platform.',
    invalid_item: fr ? 'Article introuvable.' : 'Item not found.',
  };
  return M[res?.reason] ?? res?.error ?? (fr ? 'Republication impossible.' : 'Repost failed.');
}
