// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — DONNÉES FICTIVES : retraits bloqués par une connexion + limite du
// jour de la republication (05/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Aucune donnée réelle : un compte inventé,
// des titres inventés, des numéros d'annonce inventés, des dates relatives à
// l'heure de la page. Servi au harnais du Stock (stock-refonte.jsx) à la place
// de build/apercu-stock/donnees.json par retraits-plafond-0510.jsx.
//
// Ce que les données posent :
//   · 3 articles VENDUS (statut 'vendu', quantite 0), chacun avec un retrait
//     Opla en needs_user sur une session Opla fermée (needs_user_source
//     'connexion', mur_geste connexion, attente_session) ;
//   · le 1er des trois a AUSSI un retrait Vinted 'pending' en attente de
//     session (« En attente de ta connexion à Vinted dans Chrome : … ») —
//     deux lignes sur la même carte ;
//   · 1 article vendu dont le retrait a abouti (carte vendue ordinaire) ;
//   · 8 annonces Vinted en ligne depuis 9 à 40 jours (« Remonter » : 8) et
//     3 articles récents ou pas encore publiés ;
//   · un compte RELEVÉ comme en prod : sync_multi_ouverte = 1 (carte de synchro
//     de la refonte), un relevé fini par plateforme (Vinted 10, Leboncoin 4,
//     Beebs 2, eBay 1, Opla 3) ;
//   · get-pending-jobs {plafond_only} : limite 50, 45 faites, aucune en file
//     → 8 republications = 5 aujourd'hui, 3 demain.

export const UID_FICTIF = '0f1c2d3e-4b5a-4c6d-8e7f-000000000510';
export const EMAIL_FICTIF = 'compte-fictif@exemple.test';

const J = 86400000;
const H = 3600000;
const iso = (ms) => new Date(ms).toISOString();

// Une vignette neutre (aplat + initiale), sans réseau.
function vignette(fond, texte) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">`
    + `<rect width="400" height="500" fill="${fond}"/>`
    + `<text x="200" y="285" font-family="Arial,sans-serif" font-size="120" font-weight="700" fill="rgba(255,255,255,0.85)" text-anchor="middle">${texte}</text></svg>`;
  return [{ type: 'original', url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }];
}

let compteurJob = 0;
const idJob = () => `00000000-0510-4000-8000-${String(++compteurJob).padStart(12, '0')}`;

/** Le prochain minuit de Paris (même arithmétique que get-pending-jobs). */
function minuitParis(maintenant) {
  const jour = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const sec = (ts) => {
    const [h, m, s] = new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).split(':').map(Number);
    return h * 3600 + m * 60 + s;
  };
  let t = maintenant + (86400 - sec(maintenant)) * 1000;
  if (jour(t) === jour(maintenant)) t += H;
  t -= sec(t) * 1000;
  return { jour: jour(maintenant), reprise: iso(Math.floor(t / 1000) * 1000) };
}

/** La réponse de get-pending-jobs en mode plafond_only (forme de la v216). */
export function reponsePlafond(maintenant = Date.now(), { limite = 50, faits = 45, palier = 'premium' } = {}) {
  const { jour, reprise } = minuitParis(maintenant);
  return {
    plafond_republish: {
      limite, faits, palier, sequence: 0, pause_apres: null, pause_duree_min: null,
      retenue: faits >= limite, motif: faits >= limite ? 'plafond' : null, jour, reprise,
    },
    annonces_en_attente: null,
    creneau_republish: null,
    creneaux_republish: null,
  };
}

const MSG_OPLA = 'Connexion Opla requise : reconnecte-toi à Opla dans Chrome, sur ton ordinateur. '
  + "Ton article est vendu mais son annonce est encore en ligne sur Opla (risque de double vente) : "
  + "FillSell la retire tout seul dès que c'est fait.";
const MSG_VINTED_ATTENTE = 'En attente de ta connexion à Vinted dans Chrome : ton article est vendu mais son annonce est encore '
  + 'en ligne sur Vinted (risque de double vente). Le retrait repartira tout seul dès que tu seras reconnecté(e).';

export function donneesFictives(maintenant = Date.now()) {
  compteurJob = 0;
  const avant = (ms) => iso(maintenant - ms);
  const inventaire = [];
  const jobs = [];

  const fiche = (o) => {
    const ligne = {
      user_id: UID_FICTIF, fusionne_dans: null, disparu_le: null, prix_achat_inconnu: false,
      purchase_costs: 0, selling_fees: 0, emplacement: null, plateforme: null, origine: null,
      description: '', attributs: null, vinted_catalog_id: null, vinted_account_id: null,
      vinted_view_count: null, vinted_favourite_count: null, margin: null, margin_pct: null,
      ...o,
    };
    if (ligne.prix_achat != null && ligne.prix_vente != null) {
      ligne.margin = ligne.prix_vente - ligne.prix_achat;
      ligne.margin_pct = ligne.prix_vente ? Math.round((ligne.margin / ligne.prix_vente) * 1000) / 10 : null;
    }
    inventaire.push(ligne);
    return ligne;
  };
  const job = (o) => {
    const j = {
      id: idJob(), user_id: UID_FICTIF, status: 'published', error: null, published_at: null,
      platform_fields: {}, action: 'publish', listing_url: null, title: null, bulk_batch_id: null, voie: 'extension',
      ...o,
    };
    if (j.status === 'published' && !j.published_at) j.published_at = j.created_at;
    jobs.push(j);
    return j;
  };

  // ── LE STOCK : 8 annonces Vinted anciennes (Remonter), 3 récentes ─────────
  const anciennes = [
    ['Veste en jean délavée', 'Levi’s', 'Mode', 22, 8, '#5B7DB1', 'V', 40, true],
    ['Robe d’été fleurie', 'Sézane', 'Mode', 35, 12, '#C9787E', 'R', 33, false],
    ['Baskets blanches en cuir', 'Veja', 'Mode', 48, 20, '#9AA7A2', 'B', 27, true],
    ['Pull col roulé en laine', 'Uniqlo', 'Mode', 18, 6, '#8C6F5A', 'P', 21, false],
    ['Sac à main cuir camel', 'Longchamp', 'Mode', 55, 25, '#B8864B', 'S', 18, true],
    ['Jean droit taille haute', 'Mango', 'Mode', 15, 5, '#3F5E8C', 'J', 14, false],
    ['Manteau long gris chiné', 'Zara', 'Mode', 45, 18, '#7B8088', 'M', 11, false],
    ['Chemise en lin blanche', 'Monoprix', 'Mode', 16, null, '#C8C2B4', 'C', 9, false],
  ];
  anciennes.forEach(([titre, marque, type, pv, pa, fond, lettre, jours, lbc], k) => {
    const vid = String(9100000001 + k);
    const f = fiche({
      id: `a0510000-0000-4000-8000-${String(k + 1).padStart(12, '0')}`,
      titre, marque, type, prix_vente: pv, prix_achat: pa, statut: 'stock', quantite: 1,
      date: avant(jours * J + 2 * H).slice(0, 10), created_at: avant(jours * J + 2 * H),
      photos: vignette(fond, lettre), vinted_item_id: vid, vinted_status: 'active',
      listed_at_guess: avant(jours * J), last_synced_at: avant(3 * H),
      vinted_view_count: 30 + k * 7, vinted_favourite_count: 2 + (k % 4),
    });
    job({ inventaire_id: f.id, platform: 'vinted', created_at: avant(jours * J), listing_url: `https://www.vinted.fr/items/${vid}`, title: titre });
    if (lbc) job({ inventaire_id: f.id, platform: 'leboncoin', created_at: avant((jours - 1) * J), listing_url: `https://www.leboncoin.fr/ad/vetements/${3100000001 + k}`, title: titre });
  });
  const recentes = [
    ['Bottines en daim marron', 'Minelli', 'Mode', 39, 15, '#7A5236', 'B', 3, true],
    ['Écharpe en cachemire', 'Bonpoint', 'Mode', 29, 10, '#A04F5B', 'É', 2, false],
  ];
  recentes.forEach(([titre, marque, type, pv, pa, fond, lettre, jours, vinted], k) => {
    const vid = String(9100000101 + k);
    const f = fiche({
      id: `a0510000-0000-4000-8000-${String(101 + k).padStart(12, '0')}`,
      titre, marque, type, prix_vente: pv, prix_achat: pa, statut: 'stock', quantite: 1,
      date: avant(jours * J + 2 * H).slice(0, 10), created_at: avant(jours * J + 2 * H),
      photos: vignette(fond, lettre), vinted_item_id: vinted ? vid : null, vinted_status: vinted ? 'active' : null,
      listed_at_guess: vinted ? avant(jours * J) : null, last_synced_at: avant(3 * H),
    });
    if (vinted) job({ inventaire_id: f.id, platform: 'vinted', created_at: avant(jours * J), listing_url: `https://www.vinted.fr/items/${vid}`, title: titre });
    else job({ inventaire_id: f.id, platform: 'leboncoin', created_at: avant(jours * J), listing_url: `https://www.leboncoin.fr/ad/accessoires_bagagerie/${3100000101 + k}`, title: titre });
  });
  fiche({
    id: 'a0510000-0000-4000-8000-000000000201',
    titre: 'Lampe de bureau vintage', marque: '', type: 'Maison', prix_vente: 24, prix_achat: 7, statut: 'stock', quantite: 1,
    date: avant(1 * J).slice(0, 10), created_at: avant(1 * J), photos: vignette('#4F7A6B', 'L'),
  });

  // ── LES VENDUS : 3 retraits Opla bloqués (+1 Vinted en attente), 1 ordinaire
  const vendus = [
    ['Montre acier bracelet cuir', 'Fossil', 'Mode', 65, 30, '#5C6B73', 'M', 1, true],
    ['Lampe de chevet en laiton', '', 'Maison', 32, 9, '#A88B4A', 'L', 2, false],
    ['Livre de recettes illustré', '', 'Livres', 12, 2, '#6E8B5E', 'L', 3, false],
  ];
  vendus.forEach(([titre, marque, type, pv, pa, fond, lettre, jours, aussiVinted], k) => {
    const f = fiche({
      id: `a0510000-0000-4000-8000-${String(301 + k).padStart(12, '0')}`,
      titre, marque, type, prix_vente: pv, prix_achat: pa, statut: 'vendu', quantite: 0,
      date: avant(jours * J).slice(0, 10), date_vente: avant(jours * J), created_at: avant((jours + 20) * J),
      photos: vignette(fond, lettre), plateforme: 'Leboncoin',
    });
    const urlOpla = `https://www.opla.fr/annonce/exemple-${510001 + k}`;
    job({ inventaire_id: f.id, platform: 'opla', created_at: avant((jours + 18) * J), listing_url: urlOpla, title: titre });
    job({ inventaire_id: f.id, platform: 'leboncoin', created_at: avant((jours + 19) * J), listing_url: `https://www.leboncoin.fr/ad/divers/${3100000301 + k}`, title: titre });
    job({
      inventaire_id: f.id, platform: 'opla', action: 'delete', status: 'needs_user', created_at: avant(jours * J - 2 * H),
      listing_url: urlOpla, title: titre, error: MSG_OPLA,
      platform_fields: {
        needs_user_source: 'connexion', mur_geste: { type: 'connexion' },
        attente_session: { platform: 'opla', observations: 3, depuis: avant(jours * J - 2 * H), derniere: avant(40 * 60000), pose_par: 'extension' },
      },
    });
    if (aussiVinted) {
      const vid = String(9100000301 + k);
      const urlV = `https://www.vinted.fr/items/${vid}`;
      job({ inventaire_id: f.id, platform: 'vinted', created_at: avant((jours + 17) * J), listing_url: urlV, title: titre });
      job({
        inventaire_id: f.id, platform: 'vinted', action: 'delete', status: 'pending', created_at: avant(jours * J - 3 * H),
        listing_url: urlV, title: titre, error: MSG_VINTED_ATTENTE,
        platform_fields: {
          attente_session: { platform: 'vinted', observations: 2, depuis: avant(jours * J - 3 * H), derniere: avant(25 * 60000), pose_par: 'extension' },
          next_action_after: iso(maintenant + 20 * 60000),
        },
      });
    }
  });
  {
    const f = fiche({
      id: 'a0510000-0000-4000-8000-000000000401',
      titre: 'Blouson aviateur marron', marque: 'Schott', type: 'Mode', prix_vente: 85, prix_achat: 40, statut: 'vendu', quantite: 0,
      date: avant(5 * J).slice(0, 10), date_vente: avant(5 * J), created_at: avant(30 * J),
      photos: vignette('#6B4A33', 'B'), plateforme: 'Vinted',
    });
    const urlL = 'https://www.leboncoin.fr/ad/vetements/3100000401';
    job({ inventaire_id: f.id, platform: 'leboncoin', created_at: avant(28 * J), listing_url: urlL, title: f.titre });
    job({ inventaire_id: f.id, platform: 'leboncoin', action: 'delete', status: 'published', created_at: avant(5 * J - H), listing_url: urlL, title: f.titre });
  }

  // Quelques annonces Beebs et eBay, pour que le compte ressemble à un compte
  // relevé sur ses cinq plateformes (pastilles de la carte de synchro).
  const parTitre = (t) => inventaire.find((i) => i.titre === t);
  [['Robe d’été fleurie', 'beebs', 'https://www.beebs.app/fr/annonce/exemple-510101'],
    ['Pull col roulé en laine', 'beebs', 'https://www.beebs.app/fr/annonce/exemple-510102'],
    ['Sac à main cuir camel', 'ebay', 'https://www.ebay.fr/itm/100000510103']].forEach(([t, platform, url]) => {
    const f = parTitre(t);
    if (f) job({ inventaire_id: f.id, platform, created_at: avant(8 * J), listing_url: url, title: t });
  });

  // ── Les relevés déjà faits : la carte « Synchronisé il y a … », une pastille
  //    par plateforme avec son nombre d'annonces (items_vus du dernier relevé).
  const run = (platform, kind, il, vus) => ({
    id: `run-0510-${platform}-${kind}`, user_id: UID_FICTIF, platform, kind, status: 'done', declencheur: 'auto',
    queued_at: avant(il + 60000), started_at: avant(il + 50000), finished_at: avant(il), updated_at: avant(il),
    erreur: null, items_vus: vus, items_crees: 0, items_maj: 0, total_entries: vus, total_pages: 1, page_suivante: null,
    vinted_login: platform === 'vinted' ? 'boutique-fictive' : null, vinted_user_id: platform === 'vinted' ? '424242' : null,
  });

  return {
    lu_le: iso(maintenant),
    origine: 'données FICTIVES (scripts/apercu/retraits-plafond-0510-donnees.js) — aucune donnée réelle',
    utilisateur: { id: UID_FICTIF, email: EMAIL_FICTIF },
    tables: {
      profiles: [{
        id: UID_FICTIF, email: EMAIL_FICTIF, is_premium: true, is_pro: false, is_business: false,
        extension_last_seen_at: avant(90 * 1000), extension_version: '0.6.97', extension_build: '0.6.97-ddf3ebe',
        vinted_sync_pin: null, beta_flags: {}, platform_settings: { plateformes_vendeur: ['vinted', 'leboncoin', 'opla'] },
      }],
      inventaire,
      cross_post_jobs: jobs,
      vinted_sync_runs: [
        run('vinted', 'dressing', 2 * H, 10),
        run('leboncoin', 'annonces', 2 * H + 4 * 60000, 4),
        run('beebs', 'annonces', 2 * H + 6 * 60000, 2),
        run('ebay', 'annonces', 2 * H + 7 * 60000, 1),
        // Opla relevé AVANT la fermeture de sa session (les 3 vendus y sont encore).
        run('opla', 'annonces', 5 * H, 3),
      ],
      // sync_multi_ouverte = 1 : la carte de synchro de la refonte (BlocSynchro),
      // celle du Stock d'aujourd'hui — sans elle, la carte d'accueil « Tu vends
      // déjà sur Vinted ? ». republication_multi_ouverte reste absente (fermée) :
      // la feuille de republication vise Vinted seul.
      coin_config: [{ key: 'sync_multi_ouverte', value: 1 }],
      fiches_annonce: [],
    },
    rpc: {
      quotas_etat: { annonces: { restantes: 37, plafond: 60 } },
    },
  };
}
