// ═══════════════════════════════════════════════════════════════════════════
// BANC — LA TAILLE DU TITRE, DE BOUT EN BOUT SUR LE MOTEUR RÉEL (19/10)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le VRAI moteur de publication
// (ListingPreviewScreen en mode `pilote`, celui de la publication en lot :
// mêmes effets, même rédaction, mêmes gardes, même RPC) sur un Supabase
// FACTICE : la rédaction rend une copie Beebs, le catalogue rend la grille
// RELEVÉE de « Autres pantalons (homme) », l'envoi (spend_coins_and_publish)
// est capturé ici — rien ne sort de la machine, aucun compte, aucune session.
//
//     node scripts/apercu/capture-moteur-taille-titre.mjs
//     (ou : vite, puis /scripts/apercu/moteur-taille-titre.html?cas=deadroz|vide|conflit|ornella|unique_vide|unique_tu|unique_sans_option|unique_doute)
import { createRoot } from 'react-dom/client';
import ListingPreviewScreen from '../../src/components/ListingPreviewScreen.jsx';

const CAS = new URLSearchParams(location.search).get('cas') || 'deadroz';

// Grilles RELEVÉES (platform_category_aspects, 19/10).
const GRILLE_HOMME = ["32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL"];
const GRILLE_FEMME = ["XXXS / 30", "XXS / 32", "XS / 34", "S / 36", "M / 38", "L / 40", "XL / 42", "XXL / 44", "XXXL / 46", "4XL / 48", "5XL / 50", "6XL / 52", "7XL / 54", "8XL / 56", "9XL / 58", "Taille unique", "Autre"];
const GRILLE_BEBE = ["Prématuré (- de 45 cm)", "Naissance - 0 mois (45-50 cm)", "1 mois (50-54 cm)", "3 mois (54-60 cm)", "6 mois (60-66 cm)", "9 mois (67-74 cm)", "12 mois (74-80 cm)", "18 mois (80-86 cm)", "24 mois (86-94 cm)", "3 ans (94-102 cm)", "4 ans (102-108 cm)"];
const ARTICLES = {
  // DeadRoz, 19/10 12:19 : la fiche « W30 » (synchro Vinted), le titre dit FR40.
  deadroz: { titre: "Jeans Levi's vintage 511 W30 L32 FR40 homme bleu marine coupe slim J32", taille: "W30", genre: "Homme", grille: GRILLE_HOMME, icone: "👖" },
  // Une copie SANS taille, le titre la dit entre parenthèses.
  vide: { titre: "Jean Levi's Homme braguette patch en cuir effet usagé 100% coton bleu W36 L34 (46) J398", taille: "", genre: "Homme", grille: GRILLE_HOMME, icone: "👖" },
  // La fiche et le titre se contredisent (W32 ≠ W42 FR52) : la question reste.
  conflit: { titre: "Jean levis Denizen 299 loose fit bleu marine W42 FR52 homme coupe droite J319", taille: "W32", genre: "Homme", grille: GRILLE_HOMME, icone: "👖" },
  // Ornella : « 24M » sur la grille bébé de Beebs.
  ornella: { titre: "Pull Kiabi 24M gris clair motifs", taille: "24M", genre: "Bébé", grille: GRILLE_BEBE, icone: "🧶" },
  // (19/10 soir, taille unique) Copie VIDE, le titre dit « Taille unique » : l'option de la grille femme.
  unique_vide: { titre: "Pull oversize maille beige Taille unique femme très bon état", taille: "", genre: "Femme", grille: GRILLE_FEMME, icone: "🧶" },
  // Sébastien : « T.U » (écriture que tailles.js ne lisait pas) → « Taille unique ».
  unique_tu: { titre: "Gilet poncho style bohème noir et blanc - Lely Wood - T.U", taille: "T.U", genre: "Femme", grille: GRILLE_FEMME, icone: "🧶" },
  // Sébastien, djellaba : « Unique » face à une grille SANS taille unique (ici pantalons homme — le banc ne range pas « djellaba ») → la question reste.
  unique_sans_option: { titre: "Pantalon sarouel homme brodé marron coton", taille: "Unique", genre: "Homme", grille: GRILLE_HOMME, icone: "👖" },
  // Deux tailles dites : « Taille unique / L » → doute, la question reste.
  unique_doute: { titre: "Pull fluide à liens - Taille unique / L", taille: "", genre: "Femme", grille: GRILLE_FEMME, icone: "🧶" },
};
const A = ARTICLES[CAS] ?? ARTICLES.deadroz;
const DESCRIPTION = `${A.titre}. Très bon état.`;

const photoSvg = (couleur) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${couleur}"/><text x="300" y="330" font-size="120" text-anchor="middle" fill="#fff">${A.icone}</text></svg>`);
const PHOTOS = [photoSvg('#1F3A5F'), photoSvg('#2E4F7A'), photoSvg('#3F6A99')];

window.__appels = [];
window.__envois = [];
window.__journal = [];
window.__catalogueLu = [];

// ── Le Supabase factice : chaque chaîne retient ses filtres, la réponse dépend
//    de la table et des filtres ; toute écriture est retenue, jamais envoyée.
function reponse(table, f, mode) {
  if (table === 'platform_category_aspects') {
    window.__catalogueLu.push(`${f.platform ?? '?'} › ${f.category_key ?? '?'}`);
    if (f.platform === 'beebs') return [{ field_key: 'Taille', field_label: 'Taille', required: true, input_type: 'dropdown', allowed_values: A.grille }];
    return [];
  }
  if (table === 'inventaire') {
    const ligne = { id: 4242, titre: A.titre, description: DESCRIPTION, prix_vente: 35, prix_achat: 5, prix_achat_inconnu: false, quantite: 1, statut: 'stock',
      attributs: A.taille ? { taille: { v: A.taille, source: 'vinted_detail' }, genre: { v: A.genre, source: 'vinted_detail' } } : { genre: { v: A.genre, source: 'vinted_detail' } } };
    return mode === 'single' ? ligne : [ligne];
  }
  if (table === 'profiles') {
    // L'adresse de remise (Leboncoin ET Beebs l'exigent) : un compte réglé.
    const p = { extension_sessions: null, extension_last_seen_at: new Date(Date.now() - 60_000).toISOString(), extension_session_rejetee_at: null, beta_flags: {},
      platform_settings: { leboncoin: { adresse: '1 rue du Banc 75001 Paris' } } };
    return mode === 'single' ? p : [p];
  }
  return mode === 'single' ? null : [];
}
function chaine(table) {
  const f = {};
  let mode = 'liste';
  let ecriture = null;
  const proxy = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') {
        return (res, rej) => {
          const data = ecriture ? (Array.isArray(ecriture) ? ecriture : [ecriture]) : reponse(table, f, mode);
          return Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : 0 }).then(res, rej);
        };
      }
      if (prop === 'catch') return () => proxy;
      return (...args) => {
        window.__appels.push(`${table}.${String(prop)}`);
        if (prop === 'eq' && typeof args[0] === 'string') f[args[0]] = args[1];
        if (prop === 'maybeSingle' || prop === 'single') mode = 'single';
        if (['insert', 'update', 'upsert'].includes(prop)) {
          ecriture = args[0];
          if (table === 'usage_logs') window.__journal.push(...[].concat(args[0]));
        }
        return proxy;
      };
    },
    apply() { return proxy; },
  });
  return proxy;
}
// La rédaction : la copie Beebs telle que generate-listing la rend (la fiche
// porte la taille, la rédaction la recopie sans la toucher).
const REDACTION = {
  platforms: {
    beebs: {
      title: A.titre, description: DESCRIPTION,
      platform_fields: { taille: A.taille, genre: A.genre, marque: "Levi's", etat: 'Très bon état', couleur: 'Bleu' },
    },
  },
  photos: PHOTOS, price: 35,
};
const supabaseFactice = {
  from: (table) => chaine(table),
  rpc: async (nom, args) => {
    window.__appels.push(`rpc:${nom}`);
    if (nom === 'spend_coins_and_publish') {
      window.__envois.push(args);
      return { data: { allowed: true, jobs: (args?.p_jobs ?? []).map((r, i) => ({ id: `job-${i}`, platform: r.platform })) }, error: null };
    }
    if (nom === 'quotas_etat') return { data: { annonces: { plafond: 100, consommes: 11, restantes: 89 } }, error: null };
    return { data: null, error: null };
  },
  functions: {
    invoke: async (nom, opts) => {
      window.__appels.push(`invoke:${nom}`);
      if (nom === 'generate-listing') return { data: REDACTION, error: null };
      return { data: null, error: { message: `banc : ${nom} n'est pas appelée ici`, context: null } };
    },
  },
  storage: { from: () => ({ upload: async () => ({ error: { message: 'banc : pas de stockage' } }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};

const pilote = { surMoteur: (_id, m) => { window.__moteur = m; } };
createRoot(document.getElementById('apercu')).render(
  <ListingPreviewScreen
    variante="nouvelle"
    pilote={pilote}
    inventaireId={4242}
    userId="00000000-0000-4000-8000-000000000000"
    initialPhotos={PHOTOS}
    initialListing={{ id: 4242, titre: A.titre, description: DESCRIPTION, marque: "Levi's", categorie: 'Mode', taille: A.taille || null, genre: A.genre,
      attributs: A.taille ? { taille: { v: A.taille, source: 'vinted_detail' } } : {}, origine: 'vinted_sync', prix_vente_suggere: 35 }}
    supabase={supabaseFactice}
    lang="fr"
    onClose={() => {}}
    ebayCompte={{ voieApi: false, etat: null, lu: true, voieApiReelle: false, rafraichir: () => {} }}
    isPremium={true}
    isPro={true}
    isBusiness={true}
    extensionNeverSeen={false}
    extensionLastSeenAt={new Date(Date.now() - 60_000).toISOString()}
  />
);
