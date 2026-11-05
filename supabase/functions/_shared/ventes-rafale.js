// ═══════════════════════════════════════════════════════════════════════════
// UNE RAFALE DE VENTES = UN SEUL MAIL ET UN SEUL PUSH (05/11/2026 soir, décision c de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Avant : 8 ventes distinctes ou plus d'un compte en 5 minutes = « rattrapage de masse », AUCUN mail ni push.
// Désormais la base ouvre UNE note récapitulative par rafale (push_ventes, origine 'rafale', migration
// 20261105220000) : ses ventes prêtes sont listées dans push_ventes.articles, une ligne par note décidée
// ({ note, titre, prix, devise, plateforme, inventaire_id, vente_id, articles, a_decider }) ; push-ventes l'envoie
// UNE fois (réservation « vente:<id> » de la note récapitulative, index email_logs_vente_unique).
// Ici, pur (aucun accès réseau ni base) : les lignes, le nombre de ventes (une commande Vinted compte ses articles,
// règle du 17/10 « une vente par article »), le texte du push. Le mail : mailRafale (_shared/emails-fillsell.ts).
// Selftest : scripts/rafale-recapitulatif-selftest.mjs.

/**
 * Les lignes d'un récapitulatif, normalisées (une entrée non objet est écartée ; ordre gardé).
 * @param {unknown} articles push_ventes.articles de la note récapitulative
 * @returns {Array<{ note: number|null, titre: string|null, prix: number|string|null, devise: string|null,
 *   plateforme: string|null, inventaire_id: number|null, vente_id: number|null,
 *   articles: Array<{ titre?: string|null, prix?: number|string|null, inventaire_id?: number|null }>|null,
 *   a_decider: boolean }>}
 */
export function lignesRafale(articles) {
  if (!Array.isArray(articles)) return [];
  return articles
    .filter((l) => l && typeof l === "object" && !Array.isArray(l))
    .map((l) => ({
      note: l.note == null || !Number.isFinite(Number(l.note)) ? null : Number(l.note),
      titre: l.titre == null ? null : String(l.titre),
      prix: l.prix ?? null,
      devise: l.devise == null ? null : String(l.devise),
      plateforme: l.plateforme == null ? null : String(l.plateforme),
      inventaire_id: l.inventaire_id == null ? null : Number(l.inventaire_id),
      vente_id: l.vente_id == null ? null : Number(l.vente_id),
      articles: Array.isArray(l.articles) && l.articles.length
        ? l.articles.filter((a) => a && typeof a === "object" && !Array.isArray(a))
        : null,
      a_decider: l.a_decider === true,
    }));
}

/** Les articles d'une ligne : ceux de la commande (Vinted), sinon la ligne elle-même. */
export function articlesDeLaLigne(l) {
  return Array.isArray(l?.articles) && l.articles.length ? l.articles : [l];
}

/** Le nombre de ventes d'un récapitulatif : un article = une vente (règle du 17/10). */
export function nombreDeVentes(lignes) {
  return (Array.isArray(lignes) ? lignes : []).reduce((s, l) => s + articlesDeLaLigne(l).length, 0);
}

const court = (t, max) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

/**
 * Le push du récapitulatif (deux ventes ou plus ; une seule vente garde le push d'une vente, messageVente).
 * Même forme que messageVente (_shared/push-envoi.ts) : { titre, corps, donnees } ; type « vente » — l'appui ouvre
 * l'app comme pour une vente (onglet Ventes : aucun inventaire_id).
 * @param {{ id: number|string, articles?: unknown }} note
 * @param {string} [lang]
 */
export function messageRafale(note, lang = "fr") {
  const en = lang === "en";
  const lignes = lignesRafale(note?.articles);
  const n = nombreDeVentes(lignes);
  const titres = lignes.flatMap((l) => articlesDeLaLigne(l))
    .map((a) => String(a?.titre ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => court(t, 50));
  const reste = n - titres.length;
  const cites = titres.map((t) => (en ? `"${t}"` : `« ${t} »`)).join(", ");
  const corps = !titres.length
    ? (en ? "Open FillSell to see them." : "Ouvre FillSell pour les voir.")
    : reste > 0
      ? (en ? `${cites} and ${reste} more` : `${cites} et ${reste} autre${reste > 1 ? "s" : ""}`)
      : cites;
  return {
    titre: en ? `🎉 ${n} sales at once` : `🎉 ${n} ventes d'un coup`,
    corps: court(corps, 178),
    donnees: { type: "vente", note_id: String(note?.id ?? ""), recap: "1" },
  };
}
