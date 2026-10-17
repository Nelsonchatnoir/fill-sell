/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — l'écran bêta « Messages » / « À expédier » EN PAGE (17/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. Reproduit la coquille d'App.jsx — en-tête
// fixe (.topbar), conteneur qui défile (.wrap.page-pad), barre du bas floue et
// CLIQUABLE (.bnav, même balisage que site-coquille.jsx) — avec les VRAIS
// composants de la bêta : useEcranMessagerie (historique, retour, onglets),
// BarreMessagerie, EspaceMessagerie, SectionAExpedier. Faux client en mémoire,
// données SYNTHÉTIQUES ; aucune requête ne part (capture : tout ce qui n'est
// pas le serveur local est coupé — une photo « du CDN » casse donc vraiment).
//
//   espace-beta-page.html?commandes=0|12|16&beta=1|0  (16 = une commande par carte possible)
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import { BarChart3, Bot, Aperture, ClipboardList, LineChart } from 'lucide-react';
import { EnTete } from './site-coquille.jsx';
import BarreMessagerie from '../../src/messagerie/BarreMessagerie.jsx';
import EspaceMessagerie from '../../src/messagerie/EspaceMessagerie.jsx';
import { useEcranMessagerie } from '../../src/messagerie/useEcranMessagerie.js';

const params = new URLSearchParams(location.search);
const NB_COMMANDES = Number(params.get('commandes') ?? 0);
const BETA = params.get('beta') !== '0';
const ilYa = (h) => new Date(Date.now() - h * 3600_000).toISOString();
// Une image locale qui se charge (1 × 1) et une adresse « CDN » qui casse.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CASSEE = 'https://cdn.invalid/photo-expiree.jpg';

const pseudos = ['genevieve-69', 'mika_4803', 'fff0_7', 'acheteuse_a', 'Marc', 'Julie D.', 'paul.r', 'lea_b', 'tom_42', 'sarah.m', 'nina', 'yanis_v'];
const pfs = ['vinted', 'vinted', 'vinted', 'leboncoin', 'leboncoin', 'beebs', 'ebay', 'vinted', 'depop', 'vinted', 'leboncoin', 'vinted'];
const CONVERSATIONS = pseudos.map((p, i) => ({
  id: `c${i}`, platform: pfs[i], conversation_ref: `ref-${i}`, interlocuteur_pseudo: p, annonce_ref: `${1000 + i}`,
  // c0 : en stock, photo d'annonce absente, la fiche commence par une photo qui casse (le cas @genevieve-69).
  inventaire_id: i < 3 ? 11 + i : null, titre_annonce: `Article d'essai ${i + 1} — un titre assez long pour être coupé`,
  photo_annonce: i === 1 ? PNG : i === 2 ? CASSEE : null, cote: 'vendeur', systeme: false,
  dernier_message_le: ilYa(2 + i * 5), dernier_extrait: 'Bonjour, est-ce toujours disponible ?', non_lus: i < 4 ? 1 : 0,
  reponse_possible: true, offre_montant: null, vu_dans_app_le: null, cree_le: ilYa(48),
})).concat([
  { id: 's1', platform: 'vinted', conversation_ref: 'sys-1', interlocuteur_pseudo: 'Vinted', systeme: true, titre_annonce: null, photo_annonce: null, inventaire_id: null, dernier_message_le: ilYa(300), dernier_extrait: 'Ton colis a été livré', non_lus: 0, reponse_possible: false },
  { id: 's2', platform: 'depop', conversation_ref: 'sys-2', interlocuteur_pseudo: 'depop', systeme: true, titre_annonce: null, photo_annonce: null, inventaire_id: null, dernier_message_le: ilYa(400), dernier_extrait: 'Nouvelle politique', non_lus: 0, reponse_possible: false },
]);
const PHOTOS = { 11: [{ url: CASSEE, type: 'original' }, PNG], 12: ['https://cdn.invalid/autre.jpg'], 13: [{ url: CASSEE }] };
// (17/10) Une commande par CARTE possible, dans des états RÉELS (ceux que
// l'extension et le serveur écrivent ; aucune commande Vinted « à confirmer » :
// Vinted n'en produit jamais — c'était la commande d'essai impossible du banc).
// `attendu` : l'action que la carte doit offrir.
const CARTES = [
  { platform: 'vinted', etat: 'a_expedier', bordereau: 'a_obtenir', options_bordereau: { generable: true, types_etiquette: [1, 3] }, attendu: 'generer', titre: 'Vinted — étiquette à commander (types connus)' },
  { platform: 'vinted', etat: 'a_expedier', bordereau: 'a_obtenir', options_bordereau: null, attendu: 'generer', titre: 'Vinted — étiquette à commander (options pas encore relues)' },
  { platform: 'leboncoin', etat: 'a_confirmer', bordereau: 'a_generer', options_bordereau: { generable: true, type_envoi: 'colissimo', adresse_requise: true }, attendu: 'generer', titre: 'Leboncoin — Colissimo, disponibilité à confirmer', transporteur: 'colissimo' },
  { platform: 'leboncoin', etat: 'a_confirmer', bordereau: 'a_generer', options_bordereau: { generable: true, type_envoi: 'mondial_relay' }, attendu: 'generer', titre: 'Leboncoin — Mondial Relay, disponibilité à confirmer' },
  { platform: 'beebs', etat: 'a_confirmer', bordereau: 'a_generer', options_bordereau: { generable: true, transporteur: 'Mondial Relay' }, attendu: 'generer', titre: 'Beebs — commande à accepter' },
  { platform: 'vinted', etat: 'a_expedier', bordereau: 'pret', attendu: 'bordereau', titre: 'Vinted — bordereau prêt' },
  { platform: 'leboncoin', etat: 'a_expedier', bordereau: 'pret', attendu: 'bordereau', titre: 'Leboncoin — bordereau prêt' },
  { platform: 'beebs', etat: 'a_expedier', bordereau: 'pret', attendu: 'bordereau', titre: 'Beebs — bordereau prêt', envoi_ref: 'MR123456' },
  { platform: 'leboncoin', etat: 'a_expedier', bordereau: 'a_obtenir', attendu: 'attente', titre: 'Leboncoin — bordereau en préparation' },
  { platform: 'beebs', etat: 'a_expedier', bordereau: 'a_obtenir', attendu: 'attente', titre: 'Beebs — bordereau en préparation' },
  { platform: 'ebay', etat: 'a_expedier', bordereau: 'a_obtenir', attendu: 'lien', titre: 'eBay — étiquette à acheter', transporteur: 'FR_ColiposteColissimo' },
  { platform: 'depop', etat: 'a_expedier', bordereau: 'sans_objet', attendu: 'lien', titre: 'Depop — à expédier, suivi connu', envoi_ref: 'XY987654', transporteur: 'La Poste' },
  { platform: 'vinted', etat: 'a_expedier', bordereau: 'a_obtenir', options_bordereau: { generable: false, domicile_seul: true }, attendu: 'lien', titre: 'Vinted — enlèvement à domicile' },
  { platform: 'vinted', etat: 'a_expedier', bordereau: 'indisponible', attendu: 'lien', titre: 'Vinted — étiquette refusée par Vinted' },
  { platform: 'leboncoin', etat: 'a_confirmer', bordereau: 'a_generer', options_bordereau: { generable: false, type_envoi: 'custom_shipping' }, attendu: 'lien', titre: 'Leboncoin — envoi libre' },
  { platform: 'beebs', etat: 'inconnu', bordereau: 'inconnu', attendu: 'attente', titre: 'Beebs — état pas encore reconnu' },
];
window.__cartes = CARTES.slice(0, NB_COMMANDES).map((c, i) => ({ id: `k${i}`, attendu: c.attendu, platform: c.platform, titre: c.titre }));
const COMMANDES = CARTES.slice(0, NB_COMMANDES).map((c, i) => ({
  id: `k${i}`, platform: c.platform, commande_ref: `90${i}`, etat: c.etat, etat_plateforme: null, bordereau: c.bordereau,
  acheteur_pseudo: `acheteur_${i}`, titre: c.titre, photo_url: i % 2 ? PNG : CASSEE, montant: 10 + i, devise: 'EUR', annonce_ref: null,
  inventaire_id: i === 0 ? 11 : null, conversation_ref: `${500 + i}`, transporteur: c.transporteur ?? 'mondial_relay', envoi_ref: c.envoi_ref ?? null,
  a_expedier_avant: c.etat === 'a_expedier' ? ilYa(-30 - i) : null, vendue_le: ilYa(20 + i), options_bordereau: c.options_bordereau ?? null, maj_le: ilYa(1),
}));
// Expédiées depuis peu : une étiquette eBay achetée (suivi relu par l'API), un envoi Depop.
const EXPEDIEES = NB_COMMANDES > 0 ? [
  { id: 'x1', platform: 'ebay', commande_ref: '12-999', etat: 'expediee', bordereau: 'sans_objet', titre: 'eBay — étiquette achetée', photo_url: PNG, transporteur: 'COLISSIMO', envoi_ref: '6A1234567890', maj_le: ilYa(5), vendue_le: ilYa(40) },
  { id: 'x2', platform: 'depop', commande_ref: '777', etat: 'expediee', bordereau: 'sans_objet', titre: 'Depop — expédiée', photo_url: null, transporteur: null, envoi_ref: null, maj_le: ilYa(30), vendue_le: ilYa(60) },
] : [];
const UID = 'u-apercu';
const DONNEES = {
  messagerie_conversations: CONVERSATIONS,
  messagerie_messages: Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, conversation_id: 'c0', message_ref: `m${i}`, sens: i % 2 ? 'envoye' : 'recu', type: 'texte', texte: `Message d'essai numéro ${i + 1}.`, envoye_le: ilYa(30 - i) })),
  messagerie_reponses: [],
  messagerie_liste_blanche: [],
  messagerie_releves: [{ platform: 'beebs', dernier_le: ilYa(0.1), dernier_motif: 'jeton_absent', pause_jusqu_au: null }],
  plateforme_commandes: [...COMMANDES, ...EXPEDIEES],
  bordereaux_demandes: [],
  bordereaux_copies: [],
  // L'adresse de remise des Réglages (sans expéditeur gardé : l'app le demande).
  profiles: [{ id: UID, platform_settings: { leboncoin: { rue: '12 rue de la Paix', code_postal: '69001', ville: 'Lyon', adresse: '12 rue de la Paix 69001 Lyon' } } }],
};

window.__appels = [];
function fauxClient() {
  const requete = (table) => {
    let lignes = [...(DONNEES[table] ?? [])];
    const q = {
      select() { return q; },
      eq(col, v) { lignes = lignes.filter((l) => String(l[col]) === String(v)); return q; },
      in(col, vs) { lignes = lignes.filter((l) => vs.map(String).includes(String(l[col]))); return q; },
      is(col, v) { lignes = lignes.filter((l) => (l[col] ?? null) === v); return q; },
      gt(col, v) { lignes = lignes.filter((l) => String(l[col] ?? '') > String(v)); return q; },
      gte(col, v) { lignes = lignes.filter((l) => String(l[col] ?? '') >= String(v)); return q; },
      order() { return q; },
      limit(n) { lignes = lignes.slice(0, n); return q; },
      then(ok, ko) { window.__appels.push({ table }); return Promise.resolve({ data: lignes, error: null }).then(ok, ko); },
    };
    return q;
  };
  return {
    from: requete,
    auth: { getSession: async () => ({ data: { session: { user: { id: UID } } }, error: null }) },
    rpc: async (nom, params2) => {
      window.__appels.push({ rpc: nom, params: params2 });
      if (nom === 'messagerie_compteurs') return { data: { beta: true, non_lus: 9, conversations_non_lues: 4, par_article: {}, a_expedier: NB_COMMANDES, envoi_mode: 2, generation: true }, error: null };
      if (nom === 'platform_settings_fusionner') {
        const ps = DONNEES.profiles[0].platform_settings;
        const [a, b] = params2.p_chemin;
        ps[a] = { ...(ps[a] ?? {}), [b]: { ...(ps[a]?.[b] ?? {}), ...params2.p_patch } };
        return { data: ps, error: null };
      }
      if (nom === 'bordereau_generer') {
        const c = DONNEES.plateforme_commandes.find((x) => x.id === params2.p_commande);
        DONNEES.bordereaux_demandes.unshift({ id: `g-${params2.p_commande}`, commande_id: params2.p_commande, platform: c?.platform, action: 'generer', statut: 'demandee', motif: null, copie_id: null, essais_fichier: 0, cree_le: new Date().toISOString() });
        return { data: { id: `g-${params2.p_commande}`, statut: 'demandee' }, error: null };
      }
      if (nom === 'bordereau_demander') {
        DONNEES.bordereaux_demandes.unshift({ id: `d-${params2.p_commande}`, commande_id: params2.p_commande, action: 'recuperer', statut: 'demandee', motif: null, copie_id: null, cree_le: new Date().toISOString() });
        return { data: { id: `d-${params2.p_commande}`, statut: 'demandee' }, error: null };
      }
      return { data: { ok: true }, error: null };
    },
    functions: { invoke: async (nom) => { window.__appels.push({ fonction: nom }); return { data: null, error: null }; } },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' }, error: null }) }) },
  };
}
const sb = fauxClient();

// La barre du bas : balisage de site-coquille.jsx (= App.jsx), CLIQUABLE comme celle d'App.
const TABS = [
  { Icon: BarChart3, label: 'Tableau', idx: 0 }, { Icon: Bot, label: 'Stock IA', idx: 1 },
  { Icon: Aperture, label: 'Lens', idx: 2 }, { Icon: ClipboardList, label: 'Ventes', idx: 3 }, { Icon: LineChart, label: 'Stats', idx: 4 },
];
function BarreOnglets({ actif, onTab }) {
  return (
    <div className="bnav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, justifyContent: 'center', zIndex: 50, paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 14px)' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, padding: '10px 10px 10px', borderRadius: 26, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(18px) saturate(1.6)', WebkitBackdropFilter: 'blur(18px) saturate(1.6)', border: '1px solid #E7E3D8', boxShadow: '0 12px 32px rgba(16,32,27,0.10), 0 2px 8px rgba(16,32,27,0.05)' }}>
        {TABS.map((onglet) => {
          const { Icon, label, idx } = onglet;
          const isActive = idx === actif;
          if (idx === 2) return (
            <button key={idx} type="button" data-onglet-bas={idx} onClick={() => onTab(idx)} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}>
              <span style={{ position: 'absolute', top: -26, width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(155deg,#2F9E90,#1B6E62)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color="#FFFFFF" strokeWidth={1.9} />
              </span>
              <span style={{ height: 30 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#2F9E90' : '#8A8578' }}>{label}</span>
            </button>
          );
          return (
            <button key={idx} type="button" data-onglet-bas={idx} data-actif={isActive ? '1' : '0'} onClick={() => onTab(idx)} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0', width: 60, background: 'none', border: 'none', fontFamily: 'inherit' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 30 }}>
                {isActive && <span style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(47,158,144,0.10)' }} />}
                <Icon size={17} color={isActive ? '#2F9E90' : '#A6A192'} strokeWidth={isActive ? 2.1 : 1.7} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: isActive ? '#2F9E90' : '#8A8578' }}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stock() {
  return (
    <div data-onglet="stock" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: '6px 0', fontSize: 34 }}>Mon stock</h1>
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} data-carte-stock={i} style={{ background: '#FFF', border: '1px solid #E7E3D8', borderRadius: 20, padding: 16, fontSize: 15 }}>Article du stock {i + 1}</div>
      ))}
    </div>
  );
}

function App() {
  const scrollRef = useRef(null);
  const [tab, setTab] = useState(1);
  const ecranMessagerie = useEcranMessagerie(scrollRef, tab);
  const espaceMessagerie = ecranMessagerie.ecran;
  const setEspaceMessagerie = ecranMessagerie.aller;
  // App.jsx : chaque changement d'onglet remet le conteneur en haut.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [tab]);
  useEffect(() => { window.__etat = { tab, ecran: espaceMessagerie }; }, [tab, espaceMessagerie]);
  // L'entrée « indicateur de la carte du Stock » (Stock défilé) : même appel qu'App.
  useEffect(() => { window.__ouvrirDepuisCarte = (id) => setEspaceMessagerie({ onglet: 'messages', article: id }); }, [setEspaceMessagerie]);
  // Un changement d'onglet venu d'ailleurs (lien du mail « Vendu », notification).
  useEffect(() => { window.__changerOnglet = setTab; }, []);
  return (
    <div className="app-root" style={{ height: '100dvh', overflowY: 'hidden', display: 'flex', flexDirection: 'column', overflowX: 'hidden', maxWidth: '100vw', position: 'relative' }}>
      <EnTete tm={{ profit: 0, count: 0 }} />
      <div className="desktop-nav" style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.06)' }} />
      <div ref={scrollRef} id="zone-defilement" className={BETA && espaceMessagerie ? 'wrap page-pad fs-espace-beta-ouvert' : 'wrap page-pad'} style={{ padding: '18px 14px 16px', background: 'var(--bg)', flex: '1', overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
        {BETA && tab === 1 && !espaceMessagerie && (
          <BarreMessagerie lang="fr" nonLus={9} aExpedier={NB_COMMANDES}
            onMessages={() => setEspaceMessagerie({ onglet: 'messages', article: null })}
            onExpedier={() => setEspaceMessagerie({ onglet: 'expedier', article: null })} />
        )}
        {BETA && espaceMessagerie && (
          <EspaceMessagerie supabase={sb} lang="fr" ecran={espaceMessagerie} onAller={setEspaceMessagerie}
            onRetour={ecranMessagerie.retour} photosParInventaire={PHOTOS} onChange={() => {}} />
        )}
        {tab === 0 && <div data-onglet="tableau"><h1>Tableau</h1></div>}
        {tab === 1 && <Stock />}
        {tab === 3 && <div data-onglet="ventes"><h1>Ventes</h1></div>}
        {tab === 4 && <div data-onglet="stats"><h1>Stats</h1></div>}
        {tab === 2 && <div data-onglet="lens"><h1>Lens</h1></div>}
      </div>
      <BarreOnglets actif={tab} onTab={setTab} />
    </div>
  );
}
createRoot(document.getElementById('apercu')).render(<App />);
