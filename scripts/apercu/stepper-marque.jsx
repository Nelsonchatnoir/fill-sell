// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — LA MARQUE REDEMANDÉE (cas Ornella, 03/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Monte le stepper RÉEL (nouvelle peau) sur
// la fiche EXACTE d'Ornella telle que relue en base à 19:11:34 (copie Vinted
// « B », verrous { vinted: [marque, matiere], opla: [marque] }, valeur commune
// « Bonobo ») — photos remplacées par des aplats, Supabase factice, aucun
// réseau. Trois scénarios (?scenario=) :
//   · sans-marque  : la fiche n'a pas de marque → la question « Marque ·
//                    Vinted » est posée, la réponse doit la lever ;
//   · fiche-bonobo : la fiche porte « Bonobo » → aucune question de marque ;
//   · carte        : écran 2, carte Vinted → la marque se TAPE (jamais un menu
//                    fermé) et l'input ne disparaît pas sous les doigts.
//
//     node scripts/apercu/capture-stepper-marque.mjs
import { createRoot } from 'react-dom/client';
import ListingPreviewScreen from '../../src/components/ListingPreviewScreen.jsx';
import FIXTURE from '../fixtures/fiche-ornella-pull-0310.json';

const params = new URLSearchParams(location.search);
const SCENARIO = params.get('scenario') ?? 'sans-marque';
const fiche = structuredClone(FIXTURE.fiche);

const REPONSES = {
  fiches_annonce: { fiche },
  inventaire: { prix_vente: 16, prix_achat: 3, prix_achat_inconnu: false, attributs: {} },
  cross_post_jobs: [],
  coin_config: [],
  platform_health: [],
  profiles: { extension_sessions: null, extension_last_seen_at: null, extension_session_rejetee_at: null },
  // Rien au catalogue : la ligne « Marque » de Vinted est la ligne SYNTHÉTIQUE
  // (Vinted exige une marque partout sauf Livres et médias) — celle d'Ornella.
  platform_category_aspects: [],
  ebay_item_aspects: null,
  annonces_plateforme: [],
  usage_logs: null,
};
window.__appelsFactices = [];
window.__usageLogs = [];
function chaine(table) {
  const donnees = table in REPONSES ? REPONSES[table] : [];
  const proxy = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve({ data: donnees, error: null, count: Array.isArray(donnees) ? donnees.length : 0 }).then(res, rej);
      if (prop === 'catch') return () => proxy;
      return (...args) => {
        if (table === 'usage_logs' && prop === 'insert') window.__usageLogs.push(args[0]);
        window.__appelsFactices.push(`${table}.${String(prop)}`);
        return proxy;
      };
    },
    apply() { return proxy; },
  });
  return proxy;
}
const supabaseFactice = {
  from: (table) => chaine(table),
  rpc: async (nom) => ({ data: nom === 'quotas_etat' ? { annonces: { plafond: 100, consommes: 11, restantes: 89 } } : null, error: null }),
  functions: { invoke: async (nom) => ({ data: null, error: { message: `harnais : ${nom} n'est pas appelée ici`, context: null } }) },
  storage: { from: () => ({ upload: async () => ({ error: { message: 'harnais : pas de stockage' } }) }) },
};

// La ligne du Stock telle que propsStepperArticle la tend au stepper.
const article = {
  titre: 'Pull rayé crème et noir taille L', categorie: 'Mode', origine: null,
  marque: SCENARIO === 'fiche-bonobo' ? 'Bonobo' : null,
  attributs: { taille: { v: 'L', source: 'lens' }, couleur: { v: 'Crème', source: 'lens' } },
  prix_vente_suggere: 16,
};

const noop = () => {};
createRoot(document.getElementById('apercu')).render(
  <ListingPreviewScreen
    variante="nouvelle"
    inventaireId={1791047123870}
    userId="00000000-0000-4000-8000-000000000000"
    initialPhotos={fiche.photos}
    initialListing={article}
    supabase={supabaseFactice}
    lang="fr"
    onClose={noop}
    onCompleter={noop}
    ebayCompte={{ voieApi: false, etat: null, lu: true, voieApiReelle: false, rafraichir: noop }}
    plateformesVisibles={['opla']}
    plateformesOuvertes={['opla']}
    isPremium={true}
    isPro={false}
    onUpgrade={noop}
    extensionNeverSeen={false}
    extensionLastSeenAt={new Date(Date.now() - 60_000).toISOString()}
  />
);
