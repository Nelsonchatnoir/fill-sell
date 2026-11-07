// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// « RIEN N'EST VENDU » NE S'AFFICHE JAMAIS SUR LA REMISE EN VENTE D'UN ARTICLE VENDU (07/11/2026, point 1, Louis)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Une remise en vente (cross_post_jobs.platform_fields.remise_en_vente) suit une VENTE : l'article a été vendu une
// fois. Les phrases écrites en base par le serveur, les fonctions SQL et l'extension (« rien à refaire, rien n'est
// vendu », « Rien n'est vendu, ton article reste dans ton stock… », « Rien n'est en ligne, rien n'est vendu… ») sont
// fausses sur ce job. La base ne change pas (le support lit le texte d'origine) : la phrase est corrigée À L'AFFICHAGE,
// comme la traduction (utils/messagesServeur.js). Depuis la migration 20261107140000 les fonctions SQL touchées
// l'écrivent juste d'elles-mêmes (phrase_rien_vendu) ; cette règle couvre les anciens textes et les autres écrivains.
// Branché sur humanizeJobError (utils/shared.js). Preuve : scripts/annonce-vendue-jamais-en-ligne-selftest.mjs.

/** Le job est-il une remise en vente (il suit une vente) ? */
export function jobSuitUneVente(job) {
  const pf = job?.platform_fields;
  return Boolean(pf && typeof pf === 'object' && pf.remise_en_vente);
}

/** Le texte affiché, sans « rien n'est vendu » quand le job suit une vente (français et anglais). */
export function sansRienVenduSurVente(texte, job) {
  if (typeof texte !== 'string' || !texte || !jobSuitUneVente(job)) return texte;
  return texte
    .replace(/Rien n['’]est en ligne, rien n['’]est vendu/g, "Rien n'est en ligne, ta vente d'avant n'est pas touchée")
    .replace(/Rien n['’]est vendu/g, "Ta vente d'avant n'est pas touchée")
    .replace(/rien n['’]est vendu/g, "ta vente d'avant n'est pas touchée")
    .replace(/Nothing is online, nothing is sold/g, 'Nothing is online, your earlier sale is not affected')
    .replace(/Nothing is sold/g, 'Your earlier sale is not affected')
    .replace(/nothing is sold/g, 'your earlier sale is not affected');
}
