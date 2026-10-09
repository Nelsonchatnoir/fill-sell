// Autotest des règles pures de la publication en lot (src/publication/lot/regles.js).
//
//     node --import ./scripts/loader-ext.mjs scripts/publication-lot-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   · le lot ne propose JAMAIS une plateforme que la RPC refuserait
//     (en ligne, en file, en attente d'un geste, réservée par une republication,
//     dressing Vinted) ; un article disparu de Vinted y redevient libre ;
//   · Opla n'entre jamais dans un lot ;
//   · le quota n'est jamais dépassé : les articles à rédiger au-delà de ce qui
//     reste partent « le mois prochain », une fiche déjà rédigée ne compte pas ;
//   · un texte qui n'est pas celui du vendeur se relit ; un prix < 1 € se demande ;
//     un article qui ressemble se tranche ; le moteur pas au repos n'est jamais prêt ;
//   · le suivi met ce qui demande un geste en tête, l'arrêt demandé n'est
//     jamais un échec, et seul un dépôt pas commencé s'arrête.
import {
  PLATEFORMES_LOT, LOT_MAX_ARTICLES, plateformesOccupees, plateformesLibres, articleSelectionnable,
  resumeParPlateforme, choixInitial, ficheCouvre, partagerQuota, dureeEstimeeMin, libelleDuree,
  bilanArticle, texteARelire, suiviDuLot, etatJobLot, depotArretable, marqueLot, idLotDeJob,
  groupesReponseCommune,
  palierCourant, palierSuivant, canalAppareil, canalAbonnement, monteePossibleIci, repriseValable, REPRISE_LOT_MAX_MS,
} from '../src/publication/lot/regles.js';

let ko = 0, ok = 0;
const verifier = (cond, quoi, detail = '') => {
  if (cond) ok++; else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); }
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const job = (o) => ({ action: 'publish', status: 'published', created_at: '2026-10-01T10:00:00Z', platform_fields: {}, ...o });

// ── Ce qu'un article peut encore recevoir ─────────────────────────────────
{
  const item = { id: 1, photos: ['https://x/1.jpg'], statut: 'stock' };
  verifier(!PLATEFORMES_LOT.includes('opla'), 'Opla n’est jamais une plateforme du lot');
  verifier(LOT_MAX_ARTICLES === 20, 'un lot, c’est 20 articles au plus');
  verifier(egal(plateformesLibres(item, []), ['vinted', 'leboncoin', 'ebay', 'beebs']), 'article neuf : les quatre plateformes sont libres');
  const jobs = [
    job({ platform: 'leboncoin', status: 'published' }),
    job({ platform: 'beebs', status: 'pending' }),
    job({ platform: 'ebay', status: 'needs_user', platform_fields: { needs_user_source: 'champ_a_choisir' } }),
  ];
  verifier(egal(plateformesLibres(item, jobs), ['vinted']), 'en ligne, en file, en attente d’un geste : occupées (comme la RPC)', JSON.stringify(plateformesLibres(item, jobs)));
  const retire = [job({ platform: 'leboncoin', status: 'published', platform_listing_id: '42', published_at: '2026-09-01T10:00:00Z' }),
    { action: 'delete', platform: 'leboncoin', status: 'deleted', platform_listing_id: '42', created_at: '2026-09-02T10:00:00Z' }];
  verifier(plateformesLibres(item, retire).includes('leboncoin'), 'une annonce retirée libère la plateforme');
  const repub = [{ action: 'republish', platform: 'beebs', status: 'processing', platform_fields: { republish_step: 'deleted' }, created_at: '2026-10-01T10:00:00Z' }];
  verifier(!plateformesLibres(item, repub).includes('beebs'), 'une republication en vol réserve sa plateforme');
  const dressing = { ...item, vinted_item_id: '123' };
  verifier(!plateformesLibres(dressing, []).includes('vinted'), 'un article du dressing EST sur Vinted, même sans job');
  verifier(plateformesLibres({ ...dressing, disparu_le: '2026-09-30T00:00:00Z' }, []).includes('vinted'), 'disparu de Vinted : Vinted redevient libre');
  verifier(egal(plateformesLibres(item, [], ['vinted', 'beebs']), ['vinted', 'beebs']), 'seules les plateformes du compte sont proposées');
  verifier(plateformesOccupees(item, jobs).has('ebay'), 'needs_user bloque comme la RPC');
}

// ── Qui peut entrer dans un lot ───────────────────────────────────────────
{
  verifier(articleSelectionnable({ photos: ['a'], statut: 'stock' }, []).ok, 'article en stock avec photo : sélectionnable');
  verifier(articleSelectionnable({ photos: ['a'], statut: 'vendu' }, []).raison === 'Vendu', 'vendu : jamais');
  verifier(articleSelectionnable({ photos: [], statut: 'stock' }, []).raison === 'Sans photo', 'sans photo : jamais');
  const partout = ['vinted', 'leboncoin', 'ebay', 'beebs'].map((p) => job({ platform: p }));
  verifier(articleSelectionnable({ photos: [{ url: 'a' }], statut: 'stock' }, partout).raison === 'Déjà partout', 'déjà partout : jamais (photos objets acceptées)');
}

// ── « Où les publier ? » ──────────────────────────────────────────────────
{
  const articles = [
    { item: { id: 1, photos: ['a'] }, jobs: [job({ platform: 'vinted' })] },
    { item: { id: 2, photos: ['a'] }, jobs: [] },
    { item: { id: 3, photos: ['a'], vinted_item_id: '9' }, jobs: [] },
  ];
  const r = resumeParPlateforme(articles);
  verifier(r.vinted.possibles === 1 && r.vinted.dejaLa === 2, 'Vinted : 1 possible, 2 déjà là (job + dressing)', JSON.stringify(r.vinted));
  verifier(r.leboncoin.possibles === 3, 'Leboncoin : les 3');
  verifier(egal(choixInitial(r), ['vinted', 'leboncoin', 'ebay', 'beebs']), 'cochées d’office : toute plateforme où un article peut aller');
  verifier(egal(choixInitial(r, { enPause: ['beebs'], ebayBloque: true }), ['vinted', 'leboncoin']), 'jamais une plateforme en pause, jamais eBay inutilisable');
  verifier(egal(choixInitial(r, { memorise: ['leboncoin'] }), ['leboncoin']), 'le dernier choix est repris');
  verifier(egal(choixInitial({ vinted: { possibles: 0, dejaLa: 3 } }), []), 'rien de possible : rien de coché');
}

// ── Le quota ──────────────────────────────────────────────────────────────
{
  verifier(ficheCouvre({ platformListings: { platforms: { vinted: {}, leboncoin: {} } } }, ['vinted', 'leboncoin']), 'fiche rédigée pour les plateformes visées : couvre');
  verifier(!ficheCouvre({ platformListings: { platforms: { vinted: {} } } }, ['vinted', 'beebs']), 'copie manquante : ne couvre pas (le moteur rédige)');
  verifier(!ficheCouvre(null, ['vinted']), 'pas de fiche : ne couvre pas');
  const art = [1, 2, 3, 4, 5].map((id) => ({ id, fiche: id === 2 }));
  const p = partagerQuota(art, { restantes: 2, consomme: (a) => !a.fiche });
  verifier(egal(p.maintenant.map((a) => a.id), [1, 2, 3]) && egal(p.plusTard.map((a) => a.id), [4, 5]) && p.aConsommer === 2,
    '2 restantes : l’article déjà rédigé passe sans compter, les suivants attendent', JSON.stringify(p));
  const zero = partagerQuota(art, { restantes: 0, consomme: (a) => !a.fiche });
  verifier(egal(zero.maintenant.map((a) => a.id), [2]) && zero.plusTard.length === 4, 'quota à zéro : seule la fiche déjà rédigée part');
  const libre = partagerQuota(art, { restantes: null });
  verifier(libre.maintenant.length === 5 && !libre.plusTard.length, 'pas de plafond connu : tout part');
  const gratuit = partagerQuota([1, 2, 3, 4, 5, 6, 7].map((id) => ({ id })), { restantes: 5 });
  verifier(gratuit.maintenant.length === 5 && gratuit.plusTard.length === 2, 'palier gratuit (5) : jamais au-delà du quota');
}

// ── La durée ──────────────────────────────────────────────────────────────
{
  const m = dureeEstimeeMin({ vinted: 10, leboncoin: 10, ebay: 10 }, { ebayParServeur: true });
  verifier(m > 20 && m < 60, `durée réaliste pour 20 dépôts par l’extension (${m} min)`);
  verifier(dureeEstimeeMin({ ebay: 5 }, { ebayParServeur: true }) === 0, 'eBay par nos serveurs : ne demande pas l’ordinateur');
  verifier(libelleDuree(42) === '≈ 40 min' && libelleDuree(3) === '≈ 5 min' && libelleDuree(80) === '≈ 1 h 20', 'durée arrondie, jamais fausse précision', `${libelleDuree(42)} | ${libelleDuree(3)} | ${libelleDuree(80)}`);
}

// ── Le bilan d’un article préparé ─────────────────────────────────────────
{
  const base = {
    preparationAuRepos: true, nbQuestions: 0, price: 12, ctaDisabled: false,
    texteVendeur: { titre: 'Robe midi Marc Cain', description: 'Portée deux fois, très bon état' },
    plateformesPubliables: new Set(['vinted', 'leboncoin']), jumeaux: [],
    // (04/10) Leboncoin exige un poids : l'article du test en a un sur sa fiche.
    initialListing: { poids_g: 450 },
  };
  verifier(bilanArticle({ ...base, initialListing: {} }).motifs.some((x) => x.cle === 'poids') && !bilanArticle({ ...base, initialListing: {} }).pret,
    '(04/10) Leboncoin sans poids : « Poids » à compléter, jamais prêt (aucun format deviné)');
  verifier(bilanArticle(base).pret, 'au repos, rien à demander, texte du vendeur : prêt');
  verifier(!bilanArticle({ ...base, preparationAuRepos: false }).pret, 'moteur pas au repos : jamais prêt');
  verifier(bilanArticle({ ...base, nbQuestions: 2 }).motifs[0].libelle === '2 réponses', 'les questions du moteur sont comptées');
  verifier(bilanArticle({ ...base, price: null }).motifs.some((x) => x.cle === 'prix'), 'sans prix : le prix se demande');
  verifier(bilanArticle({ ...base, price: '0.5' }).motifs.some((x) => x.cle === 'prix'), 'prix sous 1 € : se demande (minimum Vinted)');
  const ia = { ...base, texteVendeur: { titre: 'Robe midi Marc Cain', description: '' } };
  verifier(texteARelire(ia) && bilanArticle(ia).motifs.some((x) => x.cle === 'texte'), 'description qui n’est pas celle du vendeur : à relire');
  verifier(bilanArticle(ia, { texteValide: true }).pret, 'texte relu et validé : prêt');
  const jum = { ...base, jumeaux: [{ platform: 'leboncoin', titre: 'Robe Marc Cain' }] };
  verifier(bilanArticle(jum).motifs.some((x) => x.cle === 'jumeau'), 'un article qui ressemble, en ligne : « même article ? »');
  verifier(bilanArticle(jum, { jumeauxTranches: new Set(['leboncoin']) }).pret, 'tranché « autre article » : prêt');
  verifier(!bilanArticle({ ...base, jumeaux: [{ platform: 'beebs' }] }).motifs.some((x) => x.cle === 'jumeau'), 'jumeau sur une plateforme non visée : rien à demander');
  // (09/10 soir, Louis) la ressemblance ne retient jamais une fiche à plusieurs exemplaires
  verifier(bilanArticle({ ...jum, quantiteFiche: 9997 }).pret && !bilanArticle({ ...jum, quantiteFiche: 9997 }).motifs.some((x) => x.cle === 'jumeau'), 'fiche à 9 997 exemplaires : la ressemblance ne bloque jamais');
  verifier(bilanArticle({ ...jum, quantiteFiche: 1 }).motifs.some((x) => x.cle === 'jumeau'), "fiche à un exemplaire : la question reste, posée sur l'écran du lot");
  verifier(bilanArticle({ ...base, plateformesPubliables: new Set() }).motifs.some((x) => x.cle === 'aucune'), 'plus aucune plateforme : dit');
  verifier(!bilanArticle({ ...base, ctaDisabled: true }).pret, 'le bouton du moteur gris : jamais prêt (même règle que le stepper)');
  verifier(bilanArticle({ ...base, ctaDisabled: true, motifsCtaGris: ['Adresse de remise manquante'] }).motifs[0]?.libelle === 'Adresse de remise manquante',
    'bouton gris sans autre motif : ses mots à lui sont repris, jamais un « prêt » muet');
}

// ── Le suivi ──────────────────────────────────────────────────────────────
{
  const jobs = [
    job({ inventaire_id: 1, platform: 'vinted', status: 'published' }),
    job({ inventaire_id: 1, platform: 'leboncoin', status: 'pending' }),
    job({ inventaire_id: 2, platform: 'vinted', status: 'needs_user' }),
    job({ inventaire_id: 3, platform: 'beebs', status: 'processing' }),
    job({ inventaire_id: 4, platform: 'ebay', status: 'published' }),
    job({ inventaire_id: 5, platform: 'vinted', status: 'cancelled', platform_fields: { arret_utilisateur: '2026-10-02T23:00:00Z' } }),
    job({ inventaire_id: 6, platform: 'leboncoin', status: 'failed' }),
    { action: 'delete', inventaire_id: 4, platform: 'ebay', status: 'pending' },
  ];
  const s = suiviDuLot(jobs);
  verifier(egal(s.lignes.map((l) => l.inventaireId), ['2', '3', '1', '6', '4', '5']), 'geste d’abord, puis en cours, file, pas parties, en ligne, arrêtées', JSON.stringify(s.lignes.map((l) => l.inventaireId)));
  verifier(s.compte.geste === 1 && s.compte.en_ligne === 1 && s.compte.arretees === 1 && s.compte.pas_parties === 1, 'comptes par groupe', JSON.stringify(s.compte));
  verifier(s.annonces === 7 && s.annoncesEnLigne === 2, 'annonces comptées par plateforme (le retrait n’en est pas une)', `${s.annonces}/${s.annoncesEnLigne}`);
  verifier(!s.fini && suiviDuLot([job({ inventaire_id: 1 })]).fini, 'fini = plus rien en cours ni en file');
  verifier(etatJobLot({ status: 'cancelled', platform_fields: { arret_utilisateur: 'x' } }) === 'arretee', 'un arrêt demandé n’est jamais un échec');
  // (02/10, vu en vrai) Publiée puis retirée par la personne : le job de dépôt
  // passe 'cancelled' — c'est une réussite retirée depuis, jamais « pas partie ».
  const retiree = { action: 'publish', status: 'cancelled', published_at: '2026-10-02T21:14:10Z', listing_url: 'https://www.ebay.fr/itm/1', error: 'Annonce retirée par le vendeur', inventaire_id: 9, platform: 'ebay', platform_fields: {} };
  verifier(etatJobLot(retiree) === 'retiree', 'publiée puis retirée : « retirée depuis »');
  const sr = suiviDuLot([retiree]);
  verifier(sr.compte.retirees === 1 && sr.compte.pas_parties === 0 && sr.annoncesRetirees === 1 && sr.annoncesEnLigne === 0, 'compté à part, jamais en échec', JSON.stringify(sr.compte));
  verifier(depotArretable({ action: 'publish', status: 'pending' }), 'un dépôt en file s’arrête');
  verifier(depotArretable({ action: 'publish', status: 'needs_user' }), 'un dépôt qui attend un geste s’arrête');
  verifier(!depotArretable({ action: 'publish', status: 'processing' }), 'un dépôt commencé ne s’arrête pas (il va au bout)');
  verifier(!depotArretable({ action: 'publish', status: 'pending', listing_url: 'https://x' }), 'un dépôt qui porte un lien ne s’arrête pas');
  verifier(!depotArretable({ action: 'republish', status: 'pending' }), 'une republication n’est pas un dépôt du lot');
  const mq = marqueLot('abc', '2026-10-02T23:00:00Z');
  verifier(idLotDeJob({ platform_fields: mq }) === 'abc' && idLotDeJob({ bulk_batch_id: 'xyz' }) === 'xyz', 'l’identifiant du lot se lit sur le job (marqueur, sinon bulk_batch_id)');
}

// ── Les réponses communes ─────────────────────────────────────────────────
{
  const poids = ['Moins de 1 kg', '1 à 2 kg', '2 à 5 kg'];
  const g = groupesReponseCommune([
    { id: 1, gp: 'leboncoin', key: 'estimated_parcel_weight', label: 'Poids du colis', allowedValues: poids },
    { id: 2, gp: 'leboncoin', key: 'estimated_parcel_weight', label: 'Poids du colis', allowedValues: poids },
    { id: 3, gp: 'leboncoin', key: 'estimated_parcel_weight', label: 'Poids du colis', allowedValues: [...poids, '5 à 10 kg'] },
    { id: 4, gp: 'beebs', key: 'Taille', label: 'Taille', allowedValues: ['S', 'M'] },
    { id: 5, gp: 'vinted', key: 'brand', label: 'Marque', allowedValues: [] },
  ]);
  verifier(g.length === 1 && egal(g[0].ids, [1, 2]), 'même plateforme, même champ, MÊME liste : une réponse pour tous ; une liste différente reste à part', JSON.stringify(g));
}

// ── Le mur de conversion (03/10, décision de Nico) ────────────────────────
{
  verifier(palierCourant({}) === 'gratuit' && palierCourant({ isPremium: true }) === 'premium'
    && palierCourant({ isPremium: true, isPro: true }) === 'pro' && palierCourant({ isPremium: true, isPro: true, isBusiness: true }) === 'business',
    "le palier suit l'expression canonique (business > pro > premium > gratuit)");
  verifier(palierSuivant('gratuit') === 'premium' && palierSuivant('premium') === 'pro', 'gratuit → Premium, Premium → Pro');
  verifier(palierSuivant('pro', { businessVisible: false }) === null && palierSuivant('pro', { businessVisible: true }) === 'business',
    "Pro → Business seulement si l'offre Business est visible");
  verifier(palierSuivant('business', { businessVisible: true }) === null, 'Business : rien au-dessus, le mur ne propose que « continuer »');
  verifier(canalAppareil('ios') === 'apple' && canalAppareil('android') === 'google' && canalAppareil('web') === 'stripe', "canal de l'appareil");
  verifier(canalAbonnement({ payant: false, apple: 'x' }, 'stripe') === null, 'gratuit (ou offert) : aucun abonnement à doublonner, même avec un vieux marqueur Apple');
  verifier(canalAbonnement({ payant: true, apple: 'x' }, 'stripe') === 'apple', "payé sur l'App Store, vu du web → apple");
  verifier(canalAbonnement({ payant: true, apple: 'x', stripe: 'cus_1' }, 'stripe') === 'stripe', "deux marqueurs dont celui de cet appareil : c'est ici");
  verifier(canalAbonnement({ payant: true }, 'stripe') === null, 'premium sans aucun marqueur (offert) : achat ici');
  verifier(monteePossibleIci(null, 'stripe') && monteePossibleIci('google', 'google') && !monteePossibleIci('apple', 'stripe') && !monteePossibleIci('stripe', 'apple'),
    'un abonnement se change là où il a été pris : jamais un second abonnement ailleurs');
  const t = Date.parse('2026-10-03T10:00:00Z');
  verifier(repriseValable({ ids: ['1'], le: '2026-10-03T09:30:00Z' }, t), "reprise d'un lot interrompu par le paiement : valable 2 h");
  verifier(!repriseValable({ ids: ['1'], le: new Date(t - REPRISE_LOT_MAX_MS - 1000).toISOString() }, t)
    && !repriseValable({ ids: [], le: '2026-10-03T09:30:00Z' }, t) && !repriseValable(null, t),
    'reprise périmée, vide ou absente : rien ne se rouvre');
}

console.log(`\npublication-lot : ${ok} contrôles verts, ${ko} rouges`);
process.exit(ko ? 1 : 0);
