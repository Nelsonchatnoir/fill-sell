// ═══════════════════════════════════════════════════════════════════════════
// LA SORTIE D'UN JOB BLOQUÉ, ET LE RAYON QUI CONTREDIT LA FICHE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Deux règles neuves, deux dangers opposés :
//   ⑥ abandonner une plateforme — le danger est d'en faire TROP : fermer un
//      job qui a déposé (l'annonce resterait en ligne, orpheline), fermer un
//      RETRAIT (l'annonce resterait en ligne alors qu'on la croit partie),
//      fermer un job qu'une extension tient en main.
//   ⑦ prévenir d'un rayon incohérent — le danger est d'en dire trop : un
//      avertissement qui se trompe une fois sur deux, on apprend à l'ignorer,
//      et il ne sert plus à rien le jour où il a raison.
//
//   node scripts/sortie-et-coherence-selftest.mjs
import { abandonPossible, champsApresAbandon, messageAbandon } from '../src/utils/abandonPlateforme.js';
import { rayonContreditLaFiche, phraseIncoherence, marqueurDuRayon, tailleContreditLaGrille, systemeDeTaille, systemeDeLaGrille } from '../src/utils/rayonIncoherent.js';

let ko = 0;
const ok = (nom, cond) => { console.log(`  ${cond ? 'ok  ' : '❌  '}  ${nom}`); if (!cond) ko++; };
const titre = (t) => console.log(`\n${t}\n`);

// ── ⑥ ABANDONNER UNE PLATEFORME ──────────────────────────────────────────
titre('1. Ce qui PEUT être abandonné');
ok('un dépôt needs_user sans annonce en ligne',
  abandonPossible({ id: '1', action: 'publish', status: 'needs_user', listing_url: null }).ok);
ok('un dépôt failed sans annonce en ligne',
  abandonPossible({ id: '1', action: 'publish', status: 'failed', listing_url: null }).ok);
ok('un job sans `action` (ligne historique = un dépôt)',
  abandonPossible({ id: '1', status: 'needs_user', listing_url: null }).ok);

titre("2. Ce qui ne peut JAMAIS l'être — et la raison exacte");
ok('un RETRAIT (l’annonce resterait en ligne)',
  abandonPossible({ id: '1', action: 'delete', status: 'needs_user' }).motif === 'pas_un_depot');
ok('une REPUBLICATION (elle a sa propre sortie, et peut avoir déjà retiré)',
  abandonPossible({ id: '1', action: 'republish', status: 'needs_user' }).motif === 'pas_un_depot');
ok('un job EN VOL (pending — une extension peut le prendre)',
  abandonPossible({ id: '1', action: 'publish', status: 'pending' }).motif === 'pas_arrete');
ok('un job EN COURS (processing — une extension l’a en main)',
  abandonPossible({ id: '1', action: 'publish', status: 'processing' }).motif === 'pas_arrete');
ok('un job qui a DÉPOSÉ (listing_url) — celui-là se retire, il ne s’abandonne pas',
  abandonPossible({ id: '1', action: 'publish', status: 'failed', listing_url: 'https://…/ad/1' }).motif === 'annonce_en_ligne');
ok('un job qui a déposé sans URL mais avec un identifiant',
  abandonPossible({ id: '1', action: 'publish', status: 'failed', platform_listing_id: '321' }).motif === 'annonce_en_ligne');
ok('un job DÉJÀ abandonné (pas deux fois)',
  abandonPossible({ id: '1', action: 'publish', status: 'failed', platform_fields: { abandon_utilisateur: { le: 'x' } } }).motif === 'deja_abandonne');
ok('un job publié',
  !abandonPossible({ id: '1', action: 'publish', status: 'published', listing_url: 'u' }).ok);

titre('3. L’abandon est TRACÉ — jamais un bouton « faire taire »');
{
  const job = { id: '1', platform: 'ebay', action: 'publish', status: 'needs_user',
                error: 'Catégorie eBay à confirmer', platform_fields: { next_action_after: 'x', attente_session: true } };
  const archives = [];
  const pf = champsApresAbandon(job, (prec, err, statut, geste) => { archives.push({ err, statut, geste }); return prec ?? []; });
  ok('le marqueur porte la date, le statut d’où l’on vient et la plateforme',
    !!pf.abandon_utilisateur?.le && pf.abandon_utilisateur.depuis_statut === 'needs_user' && pf.abandon_utilisateur.plateforme === 'ebay');
  ok('le motif D’ORIGINE est archivé — c’est le signal qu’on veut garder',
    archives.length === 1 && archives[0].err === 'Catégorie eBay à confirmer' && archives[0].geste === 'abandon_plateforme');
  ok('la reprise automatique en attente est levée', !('next_action_after' in pf) && !('attente_session' in pf));
  ok('le message dit que rien n’est parti et que c’est réversible',
    /rien n'a été publié/i.test(messageAbandon('eBay')) && /republier/i.test(messageAbandon('eBay')));
}

// ── ⑦ LE RAYON CONTREDIT LA FICHE ────────────────────────────────────────
titre('4. Le cas réel du 20/09 — jogging de FEMME au rayon GARÇON');
{
  const chemin = ['Mode', 'Garçon', 'Vêtements (garçon)', 'Pantalons et jeans (garçon)'];
  const inc = rayonContreditLaFiche(chemin, { genre: 'Femme', taille: 'XS / 34' });
  ok('la contradiction est vue', !!inc);
  ok('elle est nommée « âge » — c’est elle qui casse les grilles de taille', inc?.motif === 'age');
  ok('la phrase nomme les DEUX camps', /garçon/i.test(phraseIncoherence(inc)) && /Femme/.test(phraseIncoherence(inc)));
  ok('elle ne donne pas d’ordre — elle demande de vérifier', /vérifie/i.test(phraseIncoherence(inc)));
}

titre('5. On se tait quand on ne sait pas — la doctrine permissive');
ok('pas de genre sur la fiche → aucun avis',
  rayonContreditLaFiche(['Mode', 'Garçon', 'Pantalons (garçon)'], {}) === null);
ok('pas de marqueur dans le chemin → aucun avis',
  rayonContreditLaFiche(['Maison', 'Décoration', 'Vases'], { genre: 'Femme' }) === null);
ok('chemin vide → aucun avis', rayonContreditLaFiche([], { genre: 'Femme' }) === null);
ok('chemin absent → aucun avis', rayonContreditLaFiche(null, { genre: 'Femme' }) === null);

titre('6. On se tait quand tout va bien — zéro faux positif sur les cas normaux');
ok('robe de femme au rayon Femmes',
  rayonContreditLaFiche(['Femmes', 'Vêtements', 'Robes'], { genre: 'Femme' }) === null);
ok('t-shirt homme au rayon Hommes',
  rayonContreditLaFiche(['Hommes', 'Vêtements', 'Hauts et t-shirts', 'T-shirts'], { genre: 'Homme' }) === null);
ok('vêtement de fille au rayon Enfants (générique, pas de sexe annoncé)',
  rayonContreditLaFiche(['Enfants', 'Vêtements filles'], { genre: 'Fille' }) === null);
ok('bébé au rayon Enfants (les arbres emboîtent bébé dans enfant)',
  rayonContreditLaFiche(['Mode', 'Enfant', 'Bébé'], { genre: 'Bébé' }) === null);
ok('univers Leboncoin en repli quand le genre manque',
  rayonContreditLaFiche(['Mode', 'Garçon', 'Pantalons (garçon)'], { univers: 'Femme' })?.motif === 'age');

titre('7. Le sexe aussi, mais seulement quand les deux sont connus');
ok('rayon garçon / fiche fille → contradiction de sexe',
  rayonContreditLaFiche(['Enfants', 'Vêtements garçons', 'Pantalons'], { genre: 'Fille' })?.motif === 'sexe');
ok('rayon Femmes / fiche Homme → contradiction de sexe',
  rayonContreditLaFiche(['Femmes', 'Chaussures'], { genre: 'Homme' })?.motif === 'sexe');
ok('rayon Enfants (sans sexe) / fiche Garçon → rien à dire',
  rayonContreditLaFiche(['Enfants', 'Jouets'], { genre: 'Garçon' }) === null);

titre('8. Le marqueur le plus PRÉCIS gagne');
ok('« Mode > Enfant > Garçon » dit garçon, pas seulement enfant',
  marqueurDuRayon(['Mode', 'Enfant', 'Garçon', 'Pantalons'])?.sexe === 'M');
ok('« Enfants > Jouets » dit enfant, sans sexe',
  marqueurDuRayon(['Enfants', 'Jouets'])?.sexe === null);

// ── LA TAILLE TRAHIT LE RAYON (2026-09-20, passe 3, point 6-e) ────────────
// Les six refus Opla « taille hors grille » du parc, un par un. L'alerte
// âge/sexe n'en attrapait qu'UN : les deux suivants ont un rayon cohérent sur
// le papier (« Enfants › Vêtements pour filles » contre une fiche « Fille »)
// et une grille d'un autre âge. Les trois derniers ont un rayon JUSTE — et
// l'alerte doit se taire, sinon elle devient du bruit.
console.log('\n4. La taille contre la grille du rayon');
const MOIS = ['0M', '0-3M', '3M', '6M', '9M', '12M', '18M', '24M'];
const LETTRES = ['TAILLE_UNIQUE', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
const ANS = ['4Y', '6Y', '8Y', '10Y', '12Y', '14Y'];
const POINTURES = ['14', '15', '16', '40', '44', '45', '50'];
ok('système : « 18 mois » est en mois', systemeDeTaille('18 mois') === 'mois');
ok('système : « 5 ans » est en années', systemeDeTaille('5 ans') === 'ans');
ok('système : « XS » est une lettre', systemeDeTaille('XS') === 'lettre');
ok('système : « 44.5 » est un nombre', systemeDeTaille('44.5') === 'nombre');
ok('système : « Taille unique » est à part', systemeDeTaille('Taille unique') === 'unique');
ok('système : un libellé inconnu ne rend rien', systemeDeTaille('bleu marine') === null);
ok('grille en mois reconnue', systemeDeLaGrille(MOIS) === 'mois');
ok('grille en lettres reconnue malgré TAILLE_UNIQUE', systemeDeLaGrille(LETTRES) === 'lettre');
ok('grille vide ne conclut rien', systemeDeLaGrille([]) === null);
ok('CAS RÉEL — Pull Coca-Cola XS dans une grille bébé : ALERTE',
  tailleContreditLaGrille('XS', MOIS)?.motif === 'taille');
ok('CAS RÉEL — Legging 5 ans dans une grille en mois : ALERTE',
  tailleContreditLaGrille('5 ans', MOIS)?.motif === 'taille');
ok('CAS RÉEL — Robe 18 mois au rayon robes FEMME : ALERTE',
  tailleContreditLaGrille('18 mois', LETTRES)?.motif === 'taille');
ok('CAS RÉEL — Camaïeu 38 contre S/M/L : SILENCE, le rayon est juste',
  tailleContreditLaGrille('38', LETTRES) === null);
ok('CAS RÉEL — Nike 44.5 contre les pointures : SILENCE, le rayon est juste',
  tailleContreditLaGrille('44.5', POINTURES) === null);
ok('« 12 ans » dans une grille en années : SILENCE',
  tailleContreditLaGrille('12 ans', ANS) === null);
ok('taille absente : SILENCE', tailleContreditLaGrille('', MOIS) === null);
ok('grille absente : SILENCE', tailleContreditLaGrille('18 mois', null) === null);
ok('la phrase nomme les deux systèmes et ne tranche pas',
  /tailles en mois/.test(phraseIncoherence(tailleContreditLaGrille('XS', MOIS), 'fr') ?? '')
  && /vérifie que c'est le bon/.test(phraseIncoherence(tailleContreditLaGrille('XS', MOIS), 'fr') ?? ''));

console.log(`\n${ko === 0 ? '✅ Un job bloqué a une sortie, et un rayon qui ment se voit.' : `❌ ${ko} test(s) en échec.`}`);
process.exit(ko === 0 ? 0 : 1);
