// ═══════════════════════════════════════════════════════════════════════════
// CE QUE COMPTE CHAQUE JAUGE — L'EXPLICATION AU TAP (maquette « les carrés au tap » validée par Nico, intégrée 09/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Une source pour les carrés des formules (ConversionModal : feuille des offres, « Ton plan », fenêtre de
// bienvenue — tous par CorpsCarteGrille). Les libellés des carrés ne changent pas (« 120 annonces », « illimitées
// remontées ») : ce module ne dit que l'explication ouverte au tap ou à l'appui long.
//
// ⛔ CHAQUE PHRASE DIT CE QUE LE SERVEUR COMPTE (relu dans supabase/migrations le 09/11) :
//   · annonces     = quota_annonces_consommees (20260902220000_fusion_scans_annonces.sql) : chaque ligne usage_logs
//                    'generate_listing' (une rédaction par l'IA, generate-listing ou un scan Lens unifié) + chaque
//                    ligne 'lens' non unifiée (un scan Lens qui ne rédige rien : analyse de marché). Un article saisi
//                    à la main au stock, un import : rien — (10/11/2026, migration 20261110170000) leur passe légère
//                    pose bien une ligne, mais titre ET description du vendeur (texte_vendeur_*) = hors du décompte.
//   · publications = publications_du_cycle (20261104000000_trois_jauges_interrupteur.sql) : 1 tâche 'publish' = 1
//                    plateforme, comptée publiée ou en cours (pending, processing, needs_user) ; échouée ou annulée
//                    sans mise en ligne, relevés et imports (sync-dressing, releve-annonces), retraits ('delete') : rien.
//   · remontees    = remontees_du_cycle (20261103234000) / quota_republication_free_etat (20261104000000) : 1 tâche
//                    'republish' = 1 plateforme, à la main ou automatique, faite ou en cours ; annulée ou échouée sans
//                    mise en ligne : rien ; elle n'entre ni dans les annonces ni dans les publications.
// ⛔ ÉCARTS AVEC LA MAQUETTE, corrigés vers la phrase vraie la plus proche (09/11) :
//   · « titre, description, catégorie, prix » → sans « prix » : la rédaction n'écrit jamais de prix
//     (_shared/redaction-plateformes.ts, « INTERDIT … le prix de vente » ; generate-listing rend item.prix_vente) ;
//   · « une annonce que tu écris toi-même » → « un article que tu saisis toi-même au stock » : publier un texte écrit
//     par la personne passe quand même par generate-listing (l'IA garde son titre et sa description, remplit les
//     champs des plateformes) et pose une ligne 'generate_listing' — l'écran de publication l'annonce déjà
//     (StepperNouveau : redactionIA = !m.platformListings) ;
//   · « refaire la rédaction d'un même article dans les 24 h » → retiré : la dédup 24 h ne joue qu'entre deux lignes qui
//     portent l'id de l'article (generate-listing : « Absent sur les corps item_data » ; lens-analysis : ligne
//     lens_unifie sans inventaire_id) — la première réécriture d'un article neuf compte.
//   scripts/jauges-explications-selftest.mjs relit ces règles dans les migrations : une règle qui change fait tomber
//   le selftest, et le texte se relit AVANT.
// ⛔ Anglais : Leboncoin et Beebs sont masqués hors de France (plateformes-pays) — les exemples anglais nomment
//    Vinted, eBay et Depop (comme la maquette).
// Vocabulaire : jamais « pépites », jamais « plafond » ; tutoiement.
// Aucun import : chargé tel quel par l'app (Vite) et les selftests (Node).

export const CLES_EXPLIQUEES = Object.freeze(['annonces', 'publications', 'remontees']);

const FR = Object.freeze({
  libelles: Object.freeze({ exemple: 'Exemple', compte: 'Compte aussi :', pas: 'Ne compte jamais :', fermer: 'Fermer', ouvrir: "qu'est-ce que ça compte ?" }),
  annonces: Object.freeze({
    titre: 'Annonces',
    definition: "Une annonce, c'est une fiche créée par l'IA de FillSell à partir de tes photos : titre, description, catégorie.",
    exemple: "Tu prends un pull en photo, l'IA rédige l'annonce : ça fait 1 annonce, que tu la mettes ensuite sur 1 plateforme ou sur 3.",
    compte: "chaque scan Lens, même s'il ne débouche pas sur une fiche.",
    pas: 'un article que tu saisis toi-même au stock, tes annonces importées des plateformes.',
  }),
  publications: Object.freeze({
    titre: 'Publications',
    definition: "Une publication, c'est la mise en ligne d'une annonce sur une plateforme.",
    exemple: 'Ton pull mis en ligne sur Vinted, Leboncoin et eBay : ça fait 3 publications (et toujours 1 annonce).',
    compte: "une mise en ligne en cours compte dès qu'elle part.",
    pas: 'une mise en ligne qui échoue ou que tu annules avant son départ, tes annonces importées, les retraits.',
  }),
  remontees: Object.freeze({
    titre: 'Remontées',
    definition: "Une remontée, c'est quand FillSell remet ton annonce en tête de liste sur une plateforme, pour qu'elle soit revue par les acheteurs.",
    exemple: 'Ton pull remonté sur Vinted et sur Leboncoin : ça fait 2 remontées. Une remontée ne prend ni annonce ni publication.',
    compte: 'chaque remontée, à la main ou automatique, sur chaque plateforme.',
    pas: 'une remontée annulée avant son départ.',
  }),
});

const EN = Object.freeze({
  libelles: Object.freeze({ exemple: 'Example', compte: 'Also counts:', pas: 'Never counts:', fermer: 'Close', ouvrir: 'what does it count?' }),
  annonces: Object.freeze({
    titre: 'Listings',
    definition: "A listing is a product sheet written by FillSell's AI from your photos: title, description, category.",
    exemple: 'You photograph a sweater, the AI writes the listing: that is 1 listing, whether you then put it on 1 platform or on 3.',
    compte: 'each Lens scan, even if it does not lead to a listing.',
    pas: 'an item you type into your stock yourself, your listings imported from the platforms.',
  }),
  publications: Object.freeze({
    titre: 'Publications',
    definition: 'A publication is putting one listing online on one platform.',
    exemple: 'Your sweater put online on Vinted, eBay and Depop: that is 3 publications (and still 1 listing).',
    compte: 'a publication on its way counts as soon as it starts.',
    pas: 'a publication that fails or that you cancel before it goes out, your imported listings, removals.',
  }),
  remontees: Object.freeze({
    titre: 'Bumps',
    definition: 'A bump is when FillSell puts your listing back at the top on a platform, so buyers see it again.',
    exemple: 'Your sweater bumped on Vinted and on Depop: that is 2 bumps. A bump uses neither a listing nor a publication.',
    compte: 'every bump, by hand or automatic, on each platform.',
    pas: 'a bump cancelled before it goes out.',
  }),
});

/** L'explication d'une jauge (annonces | publications | remontees), dans la langue (fr par défaut). Inconnue → null. */
export function explicationJauge(cle, lang = 'fr') {
  const T = lang === 'en' ? EN : FR;
  return CLES_EXPLIQUEES.includes(cle) ? T[cle] : null;
}

/** Les libellés de la feuille (Exemple, Compte aussi, Ne compte jamais, Fermer, la question du carré). */
export function libellesExplication(lang = 'fr') {
  return (lang === 'en' ? EN : FR).libelles;
}

/** Le nom accessible d'un carré : « 120 annonces — qu'est-ce que ça compte ? ». */
export function nomAccessibleCarre(valeur, mot, lang = 'fr') {
  return `${valeur} ${mot} — ${libellesExplication(lang).ouvrir}`;
}
