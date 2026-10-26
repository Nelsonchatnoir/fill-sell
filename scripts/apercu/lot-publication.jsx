// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — la publication en lot, écran par écran et état par état (02/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte les composants RÉELS du lot
// (CoqueLot, EcranPlateformes, EcranAvant, ArticleAQuestions + BlocQuestions,
// EcranFin, SuiviLot, entrées du Stock) sur des données fabriquées : les états
// qu'un compte réel ne montre pas à la demande (quota presque vide, extension
// jamais installée, session fermée, refus) se voient ici, à 390 px.
// Les moteurs sont FACTICES (objets `m` à la forme du moteur du stepper) : le
// vrai moteur, lui, a été éprouvé en réel sur le compte de Nico.
//
//     node scripts/apercu/capture-lot-publication.mjs
//     (ou : vite, puis /scripts/apercu/lot-publication.html#scene=<nom>)
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import LotPublication, { CoqueLot, EcranPlateformes, EcranAvant, EcranFin } from '../../src/publication/lot/LotPublication.jsx';
import SuiviLot from '../../src/publication/lot/SuiviLot.jsx';
import { LignePublierPlusieurs, AppelFiltrePublier, EnteteModeLot, BarreSelectionLot, LigneLotEnCours } from '../../src/publication/lot/EntreesStock.jsx';
import { LigneATraiter } from '../../src/components/FiltresStock.jsx';
import { STOCK_CSS } from '../../src/tabs/StockTab.jsx';
import { resumeParPlateforme, partagerQuota, suiviDuLot, marqueLot } from '../../src/publication/lot/regles.js';
import { useTranslation } from '../../src/i18n/useTranslation.js';

const scene = new URLSearchParams(location.hash.slice(1)).get('scene') || 'ou-publier';
const noop = () => {};

// ── Des articles crédibles (photos dessinées : aucun appel réseau) ─────────
const photo = (fond, emoji) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${fond}"/><text x="200" y="250" font-size="170" text-anchor="middle">${emoji}</text></svg>`);
const A = [
  { id: 101, title: 'Robe midi Marc Cain noir et blanc', sell: 45, photos: [photo('#2E2A2B', '👗')], statut: 'stock', origine: 'vinted_sync', vinted_item_id: '9000001' },
  { id: 102, title: 'Baskets New Balance 990 noir, 42', sell: 55, photos: [photo('#3A4742', '👟')], statut: 'stock' },
  { id: 103, title: 'Cluedo édition 2019, complet', sell: 12, photos: [photo('#7A3B2E', '🎲')], statut: 'stock' },
  { id: 104, title: 'Puzzle 1000 pièces Ravensburger Venise', sell: 9, photos: [photo('#2F6E9E', '🧩')], statut: 'stock' },
  { id: 105, title: 'Peluche loup et renard Jellycat', sell: 13.5, photos: [photo('#B98B5E', '🧸')], statut: 'stock' },
  { id: 106, title: 'Hot Wheels Stunt Track, piste complète', sell: 18, photos: [photo('#C0392B', '🏎️')], statut: 'stock' },
  { id: 107, title: 'Harry Potter tome 3, poche', sell: 4, photos: [photo('#5B3F8C', '📚')], statut: 'stock' },
];
const donnees = A.map((item) => ({ id: String(item.id), item, jobs: item.vinted_item_id ? [] : [] }));
const parId = new Map(donnees.map((d) => [d.id, d]));
const L = { attente: 'En attente', lecture: 'Ta description…', montage: 'Lecture…', redaction: 'Rédaction…', verification: 'Vérification…', pret: 'Prêt', questions: 'À compléter', quota: 'Reste au stock', rien: 'Ne part pas', erreur: 'Pas préparé', retire: 'Retiré du lot', envoi: 'Envoi…', envoye: 'En file', refuse: 'Pas parti' };

// ── Un moteur FACTICE à la forme de celui du stepper ───────────────────────
function moteurFactice(t, tpl, p = {}) {
  return {
    lang: 'fr', t, tpl, supabase: null, step: 3, preparationAuRepos: true, ctaDisabled: false, motifsCtaGris: [],
    platformFieldsConfig: { vinted: [{ key: 'taille', label: 'Taille', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL'].map((v) => ({ value: v, label: v })) }] },
    redSharedFields: [], sharedFields: {}, sharedChildAxes: null, redSharedFieldPlatforms: {}, missingSharedFieldsDetailed: [],
    genericRequiredStatus: {}, ebayRequiredStatus: [], selected: new Set(p.plateformes ?? []), plateformesPubliables: new Set(p.plateformes ?? []),
    setPlatformAspect: noop, setEbayAspect: noop, setSelected: noop, setSharedField: noop, setPlatformDedicatedField: noop, setEbaySharedField: noop,
    noterReponseFiche: noop, noterReponseFicheValeur: noop, modifierCarte: noop, poserPrixGeneral: noop, poserValeurGenerale: noop,
    demanderPrixAchat: false, prixAchatManquant: false, descriptionVideVinted: false, vintedGenreBlocked: false, beebsGenreBlocked: false,
    EBAY_CLOSED_LIST_MAX: 30, edited: {}, jumeaux: [], generales: {}, texteVendeur: { titre: 'x x', description: 'x x' },
    initialListing: { description: '' }, price: 12, rayonsAChoisir: {}, suggestionsParPf: {}, plateformesRetirables: [], questionsParPlateforme: {},
    // (26/10 nuit) Les clés des questions, comme le pilote les exporte (vue « par question »).
    clesQuestions: [],
    ...p,
  };
}

const POIDS = ['Moins de 250 g', '250 g à 500 g', '500 g à 1 kg', '1 à 2 kg', '2 à 5 kg'];

function Avant({ etape }) {
  const { t, tpl } = useTranslation('fr');
  // (11/10 soir) Le choix du poids Leboncoin : « Laisser Leboncoin estimer »
  // (défaut) ; la scène « poids-lbc-saisir » part de « Saisir le poids ».
  const [choixPoids, setChoixPoids] = useState(etape === 'poids-lbc-saisir' ? 'saisir' : 'estimer');
  const [decisions, setDecisions] = useState({});
  const decider = (id, patch) => setDecisions((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  const lot = { id: 'apercu', le: '2026-10-02T21:40:00Z', ids: A.map((a) => String(a.id)), plateformes: ['vinted', 'leboncoin', 'ebay', 'beebs'] };
  const enPrep = etape === 'preparation';
  const etats = {};
  const moteurs = new Map();
  const pfs = (id) => (id === '101' ? ['leboncoin', 'ebay', 'beebs'] : ['vinted', 'leboncoin', 'ebay', 'beebs']);
  A.forEach((a, i) => {
    const id = String(a.id);
    // (03/10) Le 6e article : sa description est lue sur Vinted, au rythme des dépôts.
    if (enPrep) etats[id] = i === 5 ? { phase: 'lecture', lecture: 'vinted' } : { phase: i < 2 ? 'pret' : i === 2 ? 'questions' : i < 5 ? (i === 3 ? 'redaction' : 'verification') : 'attente' };
    else if (etape === 'pret' || etape === 'envoi') etats[id] = { phase: etape === 'envoi' && i < 3 ? 'envoye' : etape === 'envoi' && i === 3 ? 'envoi' : 'pret', envoyees: pfs(id) };
    // (11/10 soir) Lot Leboncoin sans poids : prêt quand Leboncoin estime ;
    // à compléter (motif poids) seulement en « Saisir le poids ».
    else if (etape === 'poids-lbc' || etape === 'poids-lbc-saisir') etats[id] = choixPoids === 'saisir'
      ? { phase: 'questions', motifs: [{ cle: 'poids', libelle: 'Poids Leboncoin' }] }
      : { phase: 'pret', envoyees: pfs(id) };
    else etats[id] = { phase: i === 0 || i === 2 ? 'questions' : 'pret' };
    moteurs.set(id, moteurFactice(t, tpl, { plateformes: pfs(id) }));
  });
  // (11/10) Le poids Leboncoin : connu (500 g) dans les scènes « prêt », à
  // donner dans la scène du lot de Louis (articles Leboncoin sans poids).
  const poidsScene = etape === 'poids-lbc' || etape === 'poids-lbc-saisir' || etape === 'questions' ? () => null : () => 500;
  if (etape === 'casse') {
    // (10/10) Un article dont la carte lève à l'affichage (103, à compléter)
    // et un dont la LIGNE lève (104, prêt) : chacun est mis de côté, le bloc
    // Livraison (qui lit aussi 104) est remplacé par une phrase, les autres
    // articles restent — jamais une page blanche.
    const casse = (base) => Object.defineProperty({ ...base }, 'plateformesPubliables', { get() { throw new Error('moteur cassé (aperçu)'); } });
    etats['103'] = { phase: 'questions', motifs: [{ cle: 'questions', libelle: '1 réponse' }] };
    moteurs.set('103', casse(moteurFactice(t, tpl, { plateformes: ['leboncoin'] })));
    etats['104'] = { phase: 'pret' };
    moteurs.set('104', casse(moteurFactice(t, tpl, { plateformes: ['leboncoin'] })));
  }
  if (etape === 'questions') {
    // Robe du dressing : description restée sur Vinted, texte proposé à relire ;
    // et une robe qui ressemble, déjà en ligne sur Leboncoin.
    etats['101'] = { phase: 'questions', motifs: [{ cle: 'texte', libelle: 'Texte à relire' }, { cle: 'jumeau', libelle: 'Même article ?' }] };
    moteurs.set('101', moteurFactice(t, tpl, {
      plateformes: ['leboncoin', 'ebay', 'beebs'],
      texteVendeur: { titre: 'Robe midi Marc Cain noir et blanc', description: '' },
      generales: { titre: 'Robe midi Marc Cain noir et blanc', description: "Robe midi Marc Cain à motif graphique noir et blanc, coupe droite, manches courtes. Très bon état, portée quelques fois. Taille 38." },
      jumeaux: [{ platform: 'leboncoin', titre: 'Robe Marc Cain noire et blanche T38', prix: 45, url: 'https://www.leboncoin.fr/ad/x' }],
    }));
    // Cluedo : le poids du colis Leboncoin (liste fermée) et le prix ; Hot Wheels : le même poids (même liste).
    etats['103'] = { phase: 'questions', motifs: [{ cle: 'questions', libelle: '1 réponse' }, { cle: 'prix', libelle: 'Prix' }] };
    moteurs.set('103', moteurFactice(t, tpl, {
      plateformes: ['vinted', 'leboncoin', 'ebay', 'beebs'], price: null, nbQuestions: 1,
      genericRequiredStatus: { leboncoin: [{ key: 'estimated_parcel_weight', label: 'Poids du colis', state: 'missing', allowedValues: POIDS, inputType: 'select' }] },
      questionsParPlateforme: { leboncoin: ['Poids du colis'] }, clesQuestions: ['leboncoin:estimated_parcel_weight'],
    }));
    etats['106'] = { phase: 'questions', motifs: [{ cle: 'questions', libelle: '1 réponse' }] };
    moteurs.set('106', moteurFactice(t, tpl, {
      plateformes: ['vinted', 'leboncoin', 'ebay', 'beebs'], nbQuestions: 1,
      genericRequiredStatus: { leboncoin: [{ key: 'estimated_parcel_weight', label: 'Poids du colis', state: 'missing', allowedValues: POIDS, inputType: 'select' }] },
      questionsParPlateforme: { leboncoin: ['Poids du colis'] }, clesQuestions: ['leboncoin:estimated_parcel_weight'],
    }));
  }
  // (26/10 nuit) Le texte validé quitte les motifs de l'article, comme bilanArticle le fait dans l'écran réel.
  for (const [id, d] of Object.entries(decisions)) {
    if (!d?.texteValide || !etats[id]?.motifs) continue;
    const motifs = etats[id].motifs.filter((x) => x.cle !== 'texte');
    etats[id] = motifs.length ? { ...etats[id], motifs } : { phase: 'pret', envoyees: pfs(id) };
  }
  const prets = lot.ids.filter((id) => etats[id]?.phase === 'pret');
  const aCompleter = lot.ids.filter((id) => etats[id]?.phase === 'questions');
  const prepares = lot.ids.filter((id) => !['attente', 'lecture', 'montage', 'redaction', 'verification'].includes(etats[id]?.phase)).length;
  const annoncesPretes = prets.reduce((n, id) => n + (etape === 'casse' && id === '104' ? 0 : pfs(id).length), 0);
  const communes = etape === 'questions' ? [{
    signature: 'poids', gp: 'leboncoin', key: 'estimated_parcel_weight', label: 'Poids du colis', allowedValues: POIDS, ids: ['103', '106'], entrees: [],
  }] : [];
  const envoi = etape === 'envoi' ? { fait: 3, total: 7 } : null;
  const cta = enPrep ? `Préparation… ${prepares} sur ${lot.ids.length}` : etape === 'envoi' ? 'Mise en file… 3 sur 7'
    : aCompleter.length ? `Envoyer les ${prets.length} prêts (${annoncesPretes} annonces)` : `Envoyer ${annoncesPretes} annonces`;
  const sous = enPrep ? ["Tu peux déjà répondre ci-dessous dès qu'une question apparaît."]
    : etape === 'envoi' ? ['Garde cet écran ouvert quelques secondes.']
    : aCompleter.length ? [`Les ${aCompleter.length} autres restent dans ton stock, préparés : rien n'est perdu.`]
    : ["L'extension FillSell les dépose ensuite depuis ton ordinateur, une après l'autre."];
  return (
    <CoqueLot en={false} ecran="lot-avant" titre="Publier 7 articles" numeroEcran={2}
      retour={{ onClick: noop }} quitter={{ onClick: noop }} cta={cta} ctaDesactive={enPrep || etape === 'envoi'} onCta={noop} sous={sous}>
      <EcranAvant en={false} lang="fr" L={L} lot={lot} etats={etats} lignes={lot.ids} parId={parId} moteurs={moteurs} decisions={decisions}
        prepares={prepares} preparationFinie={!enPrep} prets={prets} aCompleter={aCompleter} annoncesPretes={annoncesPretes}
        communes={communes} repondreCommune={noop} decider={decider} trancherJumeau={noop} sansPlateforme={noop} retirerDuLot={noop} envoi={envoi}
        poidsDe={poidsScene} poserPoids={noop} poserPoidsDuLot={noop}
        choixPoidsLbc={choixPoids} choisirPoidsLbc={setChoixPoids} />
    </CoqueLot>
  );
}

function OuPublier({ variante }) {
  const quota = variante === 'quota' || variante === 'quota-boutique';
  const sel = donnees.slice(0, quota ? 5 : 3);
  const resume = resumeParPlateforme(sel.map((d) => ({ ...d, jobs: d.item.vinted_item_id ? [] : [] })));
  const choix = variante === 'extension' ? ['vinted', 'leboncoin'] : ['vinted', 'leboncoin', 'ebay', 'beebs'];
  const cibles = Object.fromEntries(sel.map((d) => [d.id, choix.filter((p) => !(d.item.vinted_item_id && p === 'vinted'))]));
  const restantes = quota ? 2 : 74;
  const partage = partagerQuota(sel, { restantes, consomme: () => true });
  const annonces = partage.maintenant.reduce((n, d) => n + cibles[d.id].length, 0);
  // Le mur de conversion (03/10) : monter d'un palier ici, ou — compte payé
  // sur l'App Store, vu du web — la phrase qui dit où changer de formule.
  const mur = quota ? { palierVise: 'premium', quotaVise: 40, onMonter: noop, renvoiBoutique: variante === 'quota-boutique' ? 'apple' : null } : null;
  return (
    <CoqueLot en={false} ecran="lot-plateformes" titre={`Publier ${sel.length} articles`} numeroEcran={1}
      retour={{ onClick: noop }} quitter={{ onClick: noop }} cta={quota ? `Continuer avec ${partage.maintenant.length} articles` : `Préparer ${annonces} annonces`} onCta={noop}
      sous={[quota ? `Les ${partage.plusTard.length} autres restent dans ton stock : tu pourras les publier dès ton nouveau mois. Rien ne part encore.` : 'Rien ne part encore : on prépare, tu vérifies.']}>
      <EcranPlateformes en={false} lang="fr" userId="x" donnees={sel} resume={resume} choix={choix} basculer={noop}
        sessions={variante === 'session' ? { leboncoin: false } : {}}
        pauses={variante === 'extension' ? { beebs: "Beebs a changé sa page de dépôt : on adapte l'extension, tes annonces Beebs repartiront toutes seules." } : {}}
        ebayBloque={variante === 'extension'} ebayParServeur={variante !== 'extension'}
        quotas={{ annonces: { plafond: quota ? 5 : 120, restantes } }} restantes={restantes} remise="2026-11-04T00:00:00Z"
        partage={partage} annoncesPrevues={annonces} duree={quota ? '≈ 10 min' : '≈ 15 min'}
        extensionNeverSeen={variante === 'extension'} extensionLastSeenAt={new Date().toISOString()} mur={mur} fichesLues />
    </CoqueLot>
  );
}

function Fin({ variante }) {
  const lot = { id: 'apercu', le: '2026-10-02T21:40:00Z', ids: A.slice(0, 5).map((a) => String(a.id)), plateformes: [] };
  const etats = variante === 'erreur'
    ? {
      101: { phase: 'refuse', raison: "Le serveur a refusé la publication (connexion perdue). Rien n'a été décompté — réessaie dans un instant." },
      102: { phase: 'erreur', raison: "La rédaction n'a pas abouti : le souci vient de nos serveurs." },
      103: { phase: 'rien', raison: 'Déjà en ligne partout où tu vends.' },
    }
    : {
      101: { phase: 'envoye', envoyees: ['leboncoin', 'ebay', 'beebs'] }, 102: { phase: 'envoye', envoyees: ['vinted', 'leboncoin', 'ebay', 'beebs'] },
      103: { phase: 'envoye', envoyees: ['vinted', 'leboncoin', 'ebay'] }, 104: { phase: 'questions' }, 105: { phase: 'quota' },
      106: { phase: 'quota' },
    };
  const lignes = Object.keys(etats);
  return (
    <CoqueLot en={false} ecran="lot-fin" titre="C'est parti" numeroEcran={3} cta="Retour au stock" onCta={noop} sous={['Tu suis le lot en haut de ton Stock.']}>
      <EcranFin en={false} L={L} lot={{ ...lot, ids: lignes }} etats={etats} lignes={lignes} parId={parId} extensionNeverSeen={false} ebayParServeur onOuvrirArticle={noop} remise="2026-11-04T00:00:00Z" />
    </CoqueLot>
  );
}

const lotId = 'apercu-lot';
const mq = (le = '2026-10-02T21:40:00Z') => marqueLot(lotId, le);
const jobsSuivi = [
  { id: 'j1', inventaire_id: 101, platform: 'leboncoin', action: 'publish', status: 'needs_user', error: 'Leboncoin demande « Poids du colis » — choisis-le pour que la publication reparte.', platform_fields: { ...mq(), needs_user_source: 'champ_a_choisir', needsUserField: { field_key: 'estimated_parcel_weight', field_label: 'Poids du colis' } }, created_at: '2026-10-02T21:40:01Z' },
  { id: 'j2', inventaire_id: 101, platform: 'ebay', action: 'publish', status: 'published', platform_fields: mq(), created_at: '2026-10-02T21:40:01Z', voie: 'api' },
  { id: 'j3', inventaire_id: 102, platform: 'vinted', action: 'publish', status: 'processing', platform_fields: mq(), created_at: '2026-10-02T21:40:03Z' },
  { id: 'j4', inventaire_id: 102, platform: 'leboncoin', action: 'publish', status: 'pending', platform_fields: mq(), created_at: '2026-10-02T21:40:03Z' },
  { id: 'j5', inventaire_id: 103, platform: 'vinted', action: 'publish', status: 'pending', platform_fields: mq(), created_at: '2026-10-02T21:40:05Z' },
  { id: 'j6', inventaire_id: 103, platform: 'beebs', action: 'publish', status: 'pending', platform_fields: mq(), created_at: '2026-10-02T21:40:05Z' },
  { id: 'j7', inventaire_id: 104, platform: 'vinted', action: 'publish', status: 'published', platform_fields: mq(), created_at: '2026-10-02T21:40:07Z' },
  { id: 'j8', inventaire_id: 104, platform: 'leboncoin', action: 'publish', status: 'published', platform_fields: mq(), created_at: '2026-10-02T21:40:07Z' },
  { id: 'j9', inventaire_id: 105, platform: 'vinted', action: 'publish', status: 'cancelled', error: "Arrêtée à ta demande — rien n'a été publié.", platform_fields: { ...mq(), arret_utilisateur: '2026-10-02T21:52:00Z' }, created_at: '2026-10-02T21:40:09Z' },
  { id: 'j10', inventaire_id: 106, platform: 'beebs', action: 'publish', status: 'cancelled', error: "Beebs n'accepte pas cet article (règle Beebs) — rien n'a été publié.", platform_fields: mq(), created_at: '2026-10-02T21:40:11Z' },
];
const boutonGeste = <button type="button" style={{ border: 'none', borderRadius: 999, padding: '8px 14px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(120deg,#2F9E90,#1B6E62)' }}>Compléter</button>;

function Stock({ variante }) {
  const suivi = suiviDuLot(jobsSuivi);
  return (
    <div className="stock-v2" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <style>{STOCK_CSS}</style>
      {variante === 'porte' && (
        <>
          <LigneATraiter lang="fr" total={3} onOuvrir={noop} />
          <LignePublierPlusieurs lang="fr" nombre={38} onOuvrir={noop} />
          <LigneLotEnCours lang="fr" suivi={suivi} le="2026-10-02T21:40:00Z" onOuvrir={noop} />
        </>
      )}
      {variante === 'filtre' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, background: '#EFF4F2', border: '1px solid #D6E2DE', color: '#1B6E62' }}>Pas encore sur Leboncoin ✕</span>
          </div>
          <AppelFiltrePublier lang="fr" nombre={12} plateforme="leboncoin" onPublier={noop} />
        </>
      )}
      {(variante === 'selection' || variante === 'vide') && (
        <>
          <EnteteModeLot lang="fr" onQuitter={noop} />
          <BarreSelectionLot lang="fr" n={variante === 'vide' ? 0 : 3} nVue={variante === 'vide' ? 0 : 12} onTout={noop} onVider={noop} onContinuer={noop} plein={false} />
          {variante === 'vide' && <div style={{ fontSize: 13, color: '#5C6560', padding: '4px 2px 12px' }}>Aucun article de cette vue ne peut partir : ils sont déjà partout, vendus ou sans photo.</div>}
          {variante === 'selection' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {A.slice(0, 4).map((a, i) => (
                <div key={a.id} className={`gcard${i < 3 ? ' gcard--lot-choisi' : ''}`}>
                  <div className="gphoto"><img src={a.photos[0]} alt="" /><span className={`lot-case${i < 3 ? ' on' : ''}`}>{i < 3 ? '✓' : ''}</span></div>
                  <div style={{ padding: '8px 10px 10px' }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{a.sell.toFixed(2).replace('.', ',')} €</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#10201B', lineHeight: 1.3, marginTop: 2 }}>{a.title}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Suivi({ arret }) {
  return (
    <div style={{ minHeight: '100vh', background: '#EDEAE0' }}>
      <SuiviLot lang="fr" lot={{ id: lotId, le: '2026-10-02T21:40:00Z' }} jobs={jobsSuivi} articles={new Map(A.map((a) => [String(a.id), a]))}
        userId="x" supabase={null} arretesIci={[]} onArretes={noop} onPatchJobs={noop}
        renderGeste={(job) => (job.status === 'needs_user' ? boutonGeste : null)} onFermer={noop} confirmerInitial={arret} />
    </div>
  );
}

// (10/10) L'écran du lot ENTIER, dont un effet lève (client Supabase absent) :
// le dernier recours s'affiche — une phrase et « Revenir au stock ».
function EcranCasse() {
  return (
    <LotPublication articles={A.slice(0, 3)} jobsByInventaire={{}} prixVinted={null}
      ctx={{ userId: 'x', supabase: null, lang: 'fr', plateformesCompte: ['vinted', 'leboncoin'] }}
      onJobsQueued={noop} onFermer={noop} onEnvoye={noop} onOuvrirArticle={noop} />
  );
}

// ── (26/10) LA REFONTE C — le lot de Nico du 26/10 au matin, tel que le moteur le prépare ─────────────────────────
// Une ligne par article, une pop-up par article. Les moteurs restent FACTICES (la forme du pilote du stepper) ; les
// valeurs sont celles du lot réel : le Medik8 (image par défaut de Beebs, rayon Beebs « neuf seulement »), le
// téléphone Samsung (modèle lu sur le titre), le Scotch (aucun rayon Depop), la bouilloire à 200 g, le robot LIEE sans
// poids, le jeu PS4 (âge Beebs), le livre EAT (ISBN), le legging (taille déjà connue, convertie).
const remplissage = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#F2EEF8"/><path d="M50 120 Q100 40 150 120 Z" fill="#7B4FB8"/><rect x="40" y="118" width="130" height="14" rx="7" fill="#5E3A93"/></svg>');
const B = [
  { id: 201, title: 'Medik8 Crystal Retinal 6 sérum 30 ml', sell: 38, photos: [remplissage], statut: 'stock', poids_g: 100 },
  { id: 202, title: 'Téléphone Samsung Galaxy S10 128 Go noir', sell: 120, photos: [photo('#1F2A33', '📱')], statut: 'stock', poids_g: 400 },
  { id: 203, title: 'Lot de 6 rouleaux Scotch Magic 3M', sell: 9, photos: [photo('#C9A227', '🧻')], statut: 'stock', poids_g: 250 },
  { id: 204, title: 'Bouilloire électrique inox 1,7 L', sell: 15, photos: [photo('#9AA5A8', '🫖')], statut: 'stock', poids_g: 200 },
  { id: 205, title: 'Robot aspirateur laveur LIEE', sell: 85, photos: [photo('#2B2B2B', '🤖')], statut: 'stock' },
  { id: 206, title: 'Call of Duty Black Ops III PS4', sell: 8, photos: [photo('#3B4A2F', '🎮')], statut: 'stock', poids_g: 150 },
  { id: 207, title: 'EAT Gilles Lartigot livre', sell: 12, photos: [photo('#E7E1D2', '📗')], statut: 'stock', poids_g: 900 },
  { id: 208, title: 'Legging de sport Ironwomen noir taille M', sell: 14, photos: [photo('#111111', '🩱')], statut: 'stock', poids_g: 200 },
];
const donneesC = B.map((item) => ({ id: String(item.id), item, jobs: [] }));
const parIdC = new Map(donneesC.map((d) => [d.id, d]));
const AGES = ['0-3 mois', '3-6 mois', '6-12 mois', '1-2 ans', '2-4 ans', '4-6 ans', '6-8 ans', '8-10 ans', '10-12 ans', '12 ans et +', '16 ans et +', '18 ans et +'];
const ETATS_BEEBS = ['Neuf avec étiquette', 'Neuf sans étiquette', 'Très bon état', 'Bon état', 'Satisfaisant'];
const copie = (titre, description, pf = {}) => ({ title: titre, description, platform_fields: pf });
function moteursC(t, tpl) {
  const mk = (id, p) => moteurFactice(t, tpl, p);
  const all = ['vinted', 'leboncoin', 'beebs', 'ebay'];
  const m = new Map();
  m.set('201', {
    ...mk('201', { plateformes: all, price: 38, generales: { titre: B[0].title, description: 'Sérum Medik8 Crystal Retinal 6, flacon de 30 ml entamé une fois. Très bon état.', etat: 'Très bon état' } }),
    initialListing: { titre: B[0].title, poids_g: 100, description: '' },
    edited: {
      vinted: copie(B[0].title, '', { categoryPath: ['Beauté', 'Soins du visage', 'Sérums'] }),
      leboncoin: copie(B[0].title, '', { lbcCategoryPath: ['Mode', 'Accessoires et bagagerie', 'Beauté'] }),
      beebs: copie(B[0].title, '', { beebsCategoryPath: ['Maman', 'Soins et beauté', 'Soins du visage'] }),
      ebay: copie(B[0].title, '', { ebayCategoryPath: ['Beauté, bien-être, parfums', 'Soins du visage et de la peau', 'Sérums'] }),
    },
    genericRequiredStatus: { beebs: [{ key: 'État', label: 'Rayon', value: 'Très bon état', state: 'invalid', neufSeulement: true, blocking: true, allowedValues: [], valeursNeuves: ['Neuf avec étiquette', 'Neuf sans étiquette'], message: 'Ce rayon Beebs n\'accepte que des articles neufs (ton article : « Très bon état »).' }] },
    ebayRequiredStatus: [{ name: 'Marque', label: 'Marque', value: 'Medik8', state: 'ok' }, { name: 'Type', label: 'Type', value: 'Sérum', state: 'ok' }],
    clesQuestions: ['beebs:État'], questionsParPlateforme: { beebs: ['État'] },
  });
  m.set('202', {
    ...mk('202', { plateformes: all, price: 120, texteVendeur: { titre: '', description: '' }, generales: { titre: B[1].title, description: 'Samsung Galaxy S10, 128 Go, noir. Écran sans rayure, batterie qui tient la journée. Vendu avec son câble.', etat: 'Très bon état' } }),
    initialListing: { titre: B[1].title, poids_g: 400, description: '' },
    edited: {
      vinted: copie(B[1].title, '', { categoryPath: ['Électronique', 'Téléphones portables et équipements de communication', 'Téléphones portables'], packageSizeId: 1 }),
      leboncoin: copie(B[1].title, '', { lbcCategoryPath: ['Électronique', 'Téléphones & Objets connectés'] }),
      beebs: copie(B[1].title, '', { beebsCategoryPath: ['Maison', 'Multimédia', 'Téléphonie'] }),
      ebay: copie(B[1].title, '', { ebayCategoryPath: ['Téléphonie, mobilité', 'Téléphones mobiles'] }),
    },
    genericRequiredStatus: { vinted: [{ key: 'brand', label: 'Marque', value: 'Samsung', state: 'ok' }, { key: 'model', label: 'Modèle', value: 'Galaxy S10', state: 'ok' }, { key: 'storage', label: 'Capacité de stockage', value: '128 Go', state: 'ok' }] },
    ebayRequiredStatus: [{ name: 'Marque', label: 'Marque', value: 'Samsung', state: 'ok' }, { name: 'Modèle', label: 'Modèle', value: 'Galaxy S10', state: 'ok' }],
  });
  m.set('203', {
    ...mk('203', { plateformes: [...all, 'depop'], price: 9, generales: { titre: B[2].title, description: 'Six rouleaux de Scotch Magic 3M, neufs sous blister.', etat: 'Neuf avec étiquette' } }),
    plateformesPubliables: new Set(all), selected: new Set(all),
    initialListing: { titre: B[2].title, poids_g: 250, description: '' },
    edited: {
      vinted: copie(B[2].title, '', { categoryPath: ['Maison', 'Fournitures de bureau'] }),
      leboncoin: copie(B[2].title, '', { lbcCategoryPath: ['Maison', 'Fournitures de bureau'] }),
      beebs: copie(B[2].title, '', { beebsCategoryPath: ['Maison', 'Papeterie'] }),
      ebay: copie(B[2].title, '', { ebayCategoryPath: ['Fournitures de bureau', 'Rubans adhésifs'] }),
    },
  });
  m.set('204', {
    ...mk('204', { plateformes: all, price: 15, generales: { titre: B[3].title, description: 'Bouilloire électrique en inox, 1,7 litre, arrêt automatique. Bon état, détartrée.', etat: 'Bon état' } }),
    initialListing: { titre: B[3].title, poids_g: 200, description: '' },
    edited: {
      vinted: copie(B[3].title, '', { categoryPath: ['Maison', 'Cuisine', 'Petit électroménager'] }),
      leboncoin: copie(B[3].title, '', { lbcCategoryPath: ['Maison', 'Électroménager'] }),
      beebs: copie(B[3].title, '', { beebsCategoryPath: ['Maison', 'Cuisine'] }),
      ebay: copie(B[3].title, '', { ebayCategoryPath: ['Maison', 'Petit électroménager', 'Bouilloires'] }),
    },
  });
  m.set('205', {
    ...mk('205', { plateformes: ['leboncoin', 'beebs', 'ebay'], price: 85, generales: { titre: B[4].title, description: 'Robot aspirateur laveur LIEE, avec sa base de charge et deux brosses. Fonctionne parfaitement.', etat: 'Très bon état' } }),
    initialListing: { titre: B[4].title, description: '' },
    edited: {
      leboncoin: copie(B[4].title, '', { lbcCategoryPath: ['Maison', 'Électroménager'] }),
      beebs: copie(B[4].title, '', { beebsCategoryPath: ['Maison', 'Électroménager'] }),
      ebay: copie(B[4].title, '', { ebayCategoryPath: ['Maison', 'Aspirateurs', 'Robots aspirateurs'] }),
    },
  });
  m.set('206', {
    ...mk('206', { plateformes: all, price: 8, nbQuestions: 1, generales: { titre: B[5].title, description: 'Call of Duty Black Ops III pour PS4, avec sa boîte. Disque sans rayure.', etat: 'Très bon état' } }),
    initialListing: { titre: B[5].title, poids_g: 150, description: '' },
    edited: {
      vinted: copie(B[5].title, '', { categoryPath: ['Électronique', 'Jeux vidéo et consoles', 'Jeux vidéo'] }),
      leboncoin: copie(B[5].title, '', { lbcCategoryPath: ['Électronique', 'Consoles & Jeux vidéo'] }),
      beebs: copie(B[5].title, '', { beebsCategoryPath: ['Jeux et jouets', 'Jeux vidéo'] }),
      ebay: copie(B[5].title, '', { ebayCategoryPath: ['Jeux vidéo, consoles', 'Jeux vidéo'] }),
    },
    genericRequiredStatus: { beebs: [{ key: 'Âge', label: 'Âge', value: '', state: 'missing', allowedValues: AGES, inputType: 'select' }] },
    clesQuestions: ['beebs:Âge'], questionsParPlateforme: { beebs: ['Âge'] },
  });
  m.set('207', {
    ...mk('207', { plateformes: all, price: 12, nbQuestions: 1, generales: { titre: B[6].title, description: 'Le livre EAT de Gilles Lartigot, broché. Très bon état, aucune annotation.', etat: 'Très bon état' } }),
    initialListing: { titre: B[6].title, poids_g: 900, description: '' },
    edited: {
      vinted: copie(B[6].title, '', { categoryPath: ['Divertissement', 'Livres', 'Non-fiction'] }),
      leboncoin: copie(B[6].title, '', { lbcCategoryPath: ['Loisirs', 'Livres'] }),
      beebs: copie(B[6].title, '', { beebsCategoryPath: ['Maman', 'Livres'] }),
      ebay: copie(B[6].title, '', { ebayCategoryPath: ['Livres, BD, revues', 'Livres'] }),
    },
    genericRequiredStatus: { vinted: [{ key: 'isbn', label: 'ISBN', value: '', state: 'missing', inputType: 'text' }] },
    clesQuestions: ['vinted:isbn'], questionsParPlateforme: { vinted: ['ISBN'] },
  });
  m.set('208', {
    ...mk('208', { plateformes: all, price: 14, texteVendeur: { titre: '', description: '' }, generales: { titre: B[7].title, description: 'Legging de sport Ironwomen noir, taille M. Bon état général, porté deux fois. Idéal pour femme.\n\n#ironwomen #legging #noir #femme #fitness', etat: 'Très bon état' } }),
    initialListing: { titre: B[7].title, poids_g: 200, description: '' },
    edited: {
      vinted: copie(B[7].title, '', { categoryPath: ['Femmes', 'Vêtements de sport', 'Leggings'], packageSizeId: 1 }),
      leboncoin: copie(B[7].title, '', { lbcCategoryPath: ['Mode', 'Vêtements', 'Femme'] }),
      beebs: copie(B[7].title, '', { beebsCategoryPath: ['Maman', 'Vêtements', 'Sport'] }),
      ebay: copie(B[7].title, '', { ebayCategoryPath: ['Vêtements, accessoires', 'Femmes', 'Vêtements de sport', 'Leggings'] }),
    },
    genericRequiredStatus: { vinted: [{ key: 'size', label: 'Taille', value: 'M / 38 / 10', state: 'ok' }], beebs: [{ key: 'Taille', label: 'Taille', value: 'M', state: 'ok' }] },
    ebayRequiredStatus: [{ name: 'Taille', label: 'Taille', value: 'M', state: 'ok' }, { name: 'Marque', label: 'Marque', value: 'Ironwomen', state: 'ok' }],
  });
  return m;
}

function RefonteC({ etape }) {
  const { t, tpl } = useTranslation('fr');
  const [decisions, setDecisions] = useState({ '203': { ecartees: { depop: 'aucun_rayon' } } });
  const decider = (id, patch) => setDecisions((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
  const [moteurs] = useState(() => moteursC(t, tpl));
  const lot = { id: 'apercu-c', le: '2026-10-26T09:40:00Z', ids: B.map((a) => String(a.id)), plateformes: ['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'] };
  const enPrep = etape === 'preparation';
  const etats = {};
  const pfs = (id) => [...(moteurs.get(id)?.plateformesPubliables ?? [])];
  for (const [i, a] of B.entries()) {
    const id = String(a.id);
    const d = decisions[id] ?? {};
    if (enPrep && i >= 5) { etats[id] = { phase: i === 5 ? 'redaction' : 'attente' }; continue; }
    const motifs = [];
    if (id === '201') motifs.push({ cle: 'questions', libelle: '1 réponse' });
    if (id === '206' || id === '207') motifs.push({ cle: 'questions', libelle: '1 réponse' });
    if (['202', '208'].includes(id) && !d.texteValide) motifs.push({ cle: 'texte', libelle: 'Texte à relire' });
    if (d.photoVide) motifs.push({ cle: 'photo', libelle: 'Photo' });
    etats[id] = motifs.length ? { phase: 'questions', motifs } : { phase: 'pret', envoyees: pfs(id) };
  }
  const prets = lot.ids.filter((id) => etats[id]?.phase === 'pret');
  const aCompleter = lot.ids.filter((id) => etats[id]?.phase === 'questions');
  const prepares = lot.ids.filter((id) => !['attente', 'lecture', 'montage', 'redaction', 'verification'].includes(etats[id]?.phase)).length;
  const annoncesPretes = prets.reduce((n, id) => n + pfs(id).length, 0);
  const cta = enPrep ? `Préparation… ${prepares} sur ${lot.ids.length}` : aCompleter.length ? `Envoyer les ${prets.length} prêts (${annoncesPretes} annonces)` : `Envoyer ${annoncesPretes} annonces`;
  const sous = enPrep ? ["Tu peux déjà répondre ci-dessous dès qu'une question apparaît."]
    : aCompleter.length ? [`Les ${aCompleter.length} autres restent dans ton stock, préparés : rien n'est perdu.`]
    : ["L'extension FillSell les dépose ensuite depuis ton ordinateur, une après l'autre."];
  const poidsDe = (id) => decisions[id]?.poids ?? parIdC.get(id)?.item?.poids_g ?? null;
  return (
    <CoqueLot en={false} ecran="lot-avant" titre={`Publier ${B.length} articles`} numeroEcran={2}
      retour={{ onClick: noop }} quitter={{ onClick: noop }} cta={cta} ctaDesactive={enPrep} onCta={noop} sous={sous}>
      <EcranAvant en={false} lang="fr" L={L} lot={lot} etats={etats} lignes={lot.ids} parId={parIdC} moteurs={moteurs} decisions={decisions}
        prepares={prepares} preparationFinie={!enPrep} prets={prets} aCompleter={aCompleter} annoncesPretes={annoncesPretes}
        communes={[]} repondreCommune={noop} decider={decider} trancherJumeau={noop}
        sansPlateforme={(id, p) => decider(id, { ecartees: { ...(decisions[id]?.ecartees ?? {}), [p]: 'retiree' } })}
        remettrePlateforme={(id, p) => decider(id, { remises: [...(decisions[id]?.remises ?? []), p] })}
        retirerDuLot={noop} envoi={null}
        poidsDe={poidsDe} poserPoids={(id, g) => decider(id, { poids: g, poidsConfirme: true })} poserPoidsDuLot={(ids, g) => { for (const id of ids) decider(id, { poids: g }); }}
        choixPoidsLbc="estimer" choisirPoidsLbc={noop} />
    </CoqueLot>
  );
}

const SCENES = {
  'stock-porte': () => <Stock variante="porte" />,
  'stock-filtre': () => <Stock variante="filtre" />,
  'stock-selection': () => <Stock variante="selection" />,
  'stock-vide': () => <Stock variante="vide" />,
  'ou-publier': () => <OuPublier />,
  'ou-publier-session': () => <OuPublier variante="session" />,
  'ou-publier-quota': () => <OuPublier variante="quota" />,
  'ou-publier-quota-boutique': () => <OuPublier variante="quota-boutique" />,
  'ou-publier-extension': () => <OuPublier variante="extension" />,
  preparation: () => <Avant etape="preparation" />,
  questions: () => <Avant etape="questions" />,
  pret: () => <Avant etape="pret" />,
  'poids-lbc': () => <Avant etape="poids-lbc" />,
  'poids-lbc-saisir': () => <Avant etape="poids-lbc-saisir" />,
  envoi: () => <Avant etape="envoi" />,
  casse: () => <Avant etape="casse" />,
  'ecran-casse': () => <EcranCasse />,
  'c-liste': () => <RefonteC />,
  'c-preparation': () => <RefonteC etape="preparation" />,
  fin: () => <Fin />,
  'fin-erreur': () => <Fin variante="erreur" />,
  suivi: () => <Suivi />,
  'suivi-arret': () => <Suivi arret />,
};

createRoot(document.getElementById('apercu')).render((SCENES[scene] ?? SCENES['ou-publier'])());
