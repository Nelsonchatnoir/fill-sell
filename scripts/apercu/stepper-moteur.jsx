// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — le stepper RÉEL (ListingPreviewScreen, son état, ses effets) monté
// sur un client Supabase FACTICE, dans ses DEUX peaux (refonte du 24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Ce que le harnais stepper-nouveau.jsx ne
// prouve pas — le câblage au moteur réel — celui-ci le prouve à hauteur du
// rendu : le composant hôte tourne en entier (init, mémos, effets, l'objet
// `moteur` construit à chaque rendu, la bascule de peau), sans session et
// sans réseau. Toute lecture Supabase rend « rien » ; la génération rend une
// erreur nommée. Un TDZ, un `undefined` lu au rendu, une boucle d'effets :
// c'est ici que ça casse, avant tout test en réel.
//
//     node scripts/apercu/capture-stepper-moteur.mjs
//     (ou : vite, puis /scripts/apercu/stepper-moteur.html?variante=classique|nouvelle)
import { createRoot } from 'react-dom/client';
import ListingPreviewScreen from '../../src/components/ListingPreviewScreen.jsx';

const params = new URLSearchParams(location.search);
const VARIANTE = params.get('variante') === 'nouvelle' ? 'nouvelle' : 'classique';

const photoSvg = (couleur) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${couleur}"/><text x="300" y="330" font-family="sans-serif" font-size="120" text-anchor="middle" fill="#fff">👟</text></svg>`);
const PHOTOS = [photoSvg('#2F4F4F'), photoSvg('#4A6B6B'), photoSvg('#6B8E8E')];

// Un client factice : toute chaîne d'appels rend { data, error: null } ; la
// génération (functions.invoke) rend une erreur nommée, jamais un appel réseau.
const REPONSES = {
  fiches_annonce: null,           // maybeSingle → pas de fiche
  inventaire: { prix_vente: 85, prix_achat: null, prix_achat_inconnu: false, attributs: {} },
  cross_post_jobs: [],
  coin_config: [],
  platform_health: [],
  profiles: { extension_sessions: null, extension_last_seen_at: null, extension_session_rejetee_at: null },
  platform_category_aspects: [],
  ebay_item_aspects: null,
  annonces_plateforme: [],
  usage_logs: null,
};
window.__appelsFactices = [];
function chaine(table) {
  const donnees = table in REPONSES ? REPONSES[table] : [];
  const proxy = new Proxy(function () {}, {
    get(_, prop) {
      // Une vraie promesse : le stepper enchaîne .then(...).catch(...).
      if (prop === 'then') return (res, rej) => Promise.resolve({ data: donnees, error: null, count: Array.isArray(donnees) ? donnees.length : 0 }).then(res, rej);
      if (prop === 'catch') return () => proxy;
      return (...args) => { window.__appelsFactices.push(`${table}.${String(prop)}(${args.map(String).join(',').slice(0, 40)})`); return proxy; };
    },
    apply() { return proxy; },
  });
  return proxy;
}
const supabaseFactice = {
  from: (table) => chaine(table),
  rpc: async (nom) => { window.__appelsFactices.push(`rpc:${nom}`); return { data: nom === 'quotas_etat' ? { annonces: { plafond: 100, consommes: 11, restantes: 89 } } : null, error: null }; },
  functions: { invoke: async (nom) => { window.__appelsFactices.push(`invoke:${nom}`); return { data: null, error: { message: `harnais : ${nom} n'est pas appelée ici`, context: null } }; } },
  storage: { from: () => ({ upload: async () => ({ error: { message: 'harnais : pas de stockage' } }) }) },
};

const noop = () => {};
createRoot(document.getElementById('apercu')).render(
  <ListingPreviewScreen
    variante={VARIANTE}
    inventaireId={1}
    userId="00000000-0000-4000-8000-000000000000"
    initialPhotos={PHOTOS}
    initialListing={{ titre: 'Baskets New Balance 990 noir', description: "New Balance 990 noires, portées quelques fois, semelle intacte.\nBoîte d'origine.", categorie: 'Mode', marque: 'New Balance', attributs: { taille: { v: 'EU 42', source: 'manuel' } }, origine: null, prix_vente_suggere: 85 }}
    supabase={supabaseFactice}
    lang="fr"
    onClose={noop}
    onCompleter={noop}
    ebayCompte={{ voieApi: true, etat: null, lu: false, voieApiReelle: true, rafraichir: noop }}
    plateformesVisibles={['opla']}
    plateformesOuvertes={['opla']}
    isPremium={true}
    isPro={true}
    onUpgrade={noop}
    extensionNeverSeen={false}
    extensionLastSeenAt={new Date(Date.now() - 60_000).toISOString()}
  />
);
