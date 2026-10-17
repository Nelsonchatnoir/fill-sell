/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, jamais livré. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — bêta « messages + bordereaux » (16/10/2026, clôture le soir)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré (vite build n'a qu'une entrée). Monte les
// VRAIS composants de src/messagerie/ et la VRAIE carte du Stock avec un FAUX
// client (en mémoire, données SYNTHÉTIQUES — aucun message réel) : aucune
// requête ne part, chaque appel est journalisé dans window.__appels.
//
//   messagerie-beta.html?ecran=barre|messages|verrou|blanche|expedier|carte
// (16/10 nuit) messages = envoi ouvert (mode 2, sans liste blanche) ; verrou =
// mode 1 hors liste blanche ; blanche = mode 1 en liste blanche ; expedier :
// « Générer le bordereau » (Vinted, Leboncoin, Beebs) et son écran de confirmation.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/base.css';
import '../../src/App.css';
import '../../src/App.redesign.css';
import BarreMessagerie from '../../src/messagerie/BarreMessagerie.jsx';
import EspaceMessagerie from '../../src/messagerie/EspaceMessagerie.jsx';
import SectionAExpedier from '../../src/messagerie/SectionAExpedier.jsx';
import { CarteArticle } from '../../src/stock/Carte.jsx';

const ecran = new URLSearchParams(location.search).get('ecran') || 'messages';
const ilYa = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const DONNEES = {
  messagerie_conversations: [
    { id: 'c1', platform: 'vinted', conversation_ref: '501', interlocuteur_pseudo: 'acheteuse_a', annonce_ref: '1001', inventaire_id: 11, titre_annonce: 'Robe portefeuille bleue', photo_annonce: null, cote: 'vendeur', systeme: false, dernier_message_le: ilYa(1), dernier_extrait: 'Bonjour, elle est toujours disponible ?', non_lus: 1, reponse_possible: true, offre_montant: 18, offre_devise: 'EUR', offre_statut: 'En attente', vu_dans_app_le: null, cree_le: ilYa(3) },
    { id: 'c2', platform: 'leboncoin', conversation_ref: 'uuid-2', interlocuteur_pseudo: 'Marc', annonce_ref: '3289322234', inventaire_id: 12, titre_annonce: 'Montre Casio G-Shock', photo_annonce: null, cote: 'vendeur', systeme: false, dernier_message_le: ilYa(5), dernier_extrait: 'Marc s’intéresse à votre annonce', non_lus: 2, reponse_possible: true, vu_dans_app_le: null, cree_le: ilYa(6) },
    { id: 'c5', platform: 'beebs', conversation_ref: '3HESxABC123', interlocuteur_pseudo: 'Julie D.', annonce_ref: null, inventaire_id: null, titre_annonce: null, photo_annonce: null, cote: 'inconnu', systeme: false, dernier_message_le: ilYa(2), dernier_extrait: 'Bonjour, est-ce que la poussette est encore là ?', non_lus: 1, reponse_possible: true, vu_dans_app_le: null, cree_le: ilYa(2) },
    { id: 'c3', platform: 'ebay', conversation_ref: '123:acheteur_e', interlocuteur_pseudo: 'acheteur_e', annonce_ref: '123', inventaire_id: null, titre_annonce: 'Polaire Patagonia', photo_annonce: null, cote: 'vendeur', systeme: false, dernier_message_le: ilYa(30), dernier_extrait: 'Quelles sont les dimensions ?', non_lus: 0, reponse_possible: true, vu_dans_app_le: null, cree_le: ilYa(40) },
    { id: 'c4', platform: 'depop', conversation_ref: 'd1', interlocuteur_pseudo: 'depop', annonce_ref: null, inventaire_id: null, titre_annonce: null, photo_annonce: null, cote: 'inconnu', systeme: true, dernier_message_le: ilYa(48), dernier_extrait: 'Welcome to Depop', non_lus: 1, reponse_possible: false, vu_dans_app_le: null, cree_le: ilYa(48) },
  ],
  messagerie_messages: [
    { id: 'm1', conversation_id: 'c1', message_ref: 'm1', sens: 'recu', type: 'texte', texte: 'Bonjour, elle est toujours disponible ?', envoye_le: ilYa(1.5) },
    { id: 'm2', conversation_id: 'c1', message_ref: 'o2', sens: 'recu', type: 'offre', texte: null, offre_montant: 18, offre_devise: 'EUR', offre_statut: 'En attente', envoye_le: ilYa(1.2) },
    { id: 'm3', conversation_id: 'c1', message_ref: 's3', sens: 'plateforme', type: 'statut', texte: 'Offre reçue', envoye_le: ilYa(1.1) },
    { id: 'm4', conversation_id: 'c1', message_ref: 'm4', sens: 'envoye', type: 'texte', texte: 'Bonjour ! Oui, elle est disponible.', envoye_le: ilYa(1.0) },
  ],
  messagerie_reponses: [
    { id: 'r1', conversation_id: 'c1', texte: 'Je peux vous la laisser à 20 €.', statut: 'verrouillee', motif: 'liste_blanche', cree_le: ilYa(0.5), fini_le: null },
  ],
  messagerie_liste_blanche: ecran === 'blanche' ? [{ platform: 'vinted', conversation_ref: '501' }] : [],
  // (16/10 nuit) Le mode d'envoi dit par messagerie_compteurs : 2 ouvert, 1 liste blanche.
  _mode: ecran === 'verrou' || ecran === 'blanche' ? 1 : 2,
  messagerie_releves: [
    { platform: 'beebs', dernier_le: ilYa(0.1), dernier_motif: 'telephone_non_verifie', pause_jusqu_au: null },
    { platform: 'vinted', dernier_le: ilYa(0.1), dernier_motif: null, pause_jusqu_au: null },
    { platform: 'leboncoin', dernier_le: ilYa(0.1), dernier_motif: 'http_401', pause_jusqu_au: null },
  ],
  plateforme_commandes: [
    { id: 'k1', platform: 'vinted', commande_ref: '9001', etat: 'a_expedier', etat_plateforme: '230', bordereau: 'pret', acheteur_pseudo: 'acheteuse_a', titre: 'Robe portefeuille bleue', photo_url: null, montant: 18, devise: 'EUR', inventaire_id: 11, conversation_ref: '501', vendue_le: ilYa(20) },
    { id: 'k2', platform: 'leboncoin', commande_ref: '4401', etat: 'a_confirmer', etat_plateforme: 'in_progress/reserved', bordereau: 'a_generer', acheteur_pseudo: 'Marc', titre: 'Montre Casio G-Shock', photo_url: null, montant: 45, devise: 'EUR', inventaire_id: 12, transporteur: 'mondial_relay', vendue_le: ilYa(2), options_bordereau: { type_envoi: 'mondial_relay', generable: true } },
    { id: 'k6', platform: 'leboncoin', commande_ref: '4402', etat: 'a_expedier', etat_plateforme: 'in_progress/available', bordereau: 'pret', acheteur_pseudo: 'Sofia', titre: 'Lampe de bureau en laiton', photo_url: null, montant: 22, devise: 'EUR', inventaire_id: null, transporteur: 'shop2shop', vendue_le: ilYa(26) },
    { id: 'k3', platform: 'ebay', commande_ref: '12-34567-89012', etat: 'a_expedier', bordereau: 'a_obtenir', acheteur_pseudo: 'acheteur_e', titre: 'Polaire Patagonia', photo_url: null, montant: 55, devise: 'EUR', transporteur: 'FR_ColiposteColissimo', a_expedier_avant: ilYa(-30), vendue_le: ilYa(10) },
    { id: 'k4', platform: 'beebs', commande_ref: 'ord-9f3a2', etat: 'a_confirmer', bordereau: 'a_generer', acheteur_pseudo: 'Julie D.', titre: 'Poussette Yoyo 2', photo_url: null, montant: 180, devise: 'EUR', transporteur: 'Mondial Relay', vendue_le: ilYa(3), options_bordereau: { transporteur: 'Mondial Relay', generable: true } },
    { id: 'k5', platform: 'depop', commande_ref: '77', etat: 'a_expedier', bordereau: 'sans_objet', acheteur_pseudo: 'acheteur_d', titre: 'Veste en jean Levi’s', photo_url: null, montant: 25, devise: 'EUR', a_expedier_avant: ilYa(-100), vendue_le: ilYa(8) },
    // (16/10 nuit) À générer : Vinted (étiquette à commander, deux types), Leboncoin Colissimo (formulaire → lien).
    { id: 'k7', platform: 'vinted', commande_ref: '9002', etat: 'a_expedier', etat_plateforme: '100', bordereau: 'a_obtenir', acheteur_pseudo: 'acheteuse_b', titre: 'Pull en laine marine', photo_url: null, montant: 32, devise: 'EUR', transporteur: 'Mondial Relay', conversation_ref: '502', vendue_le: ilYa(1), options_bordereau: { transporteur: 'Mondial Relay', types_etiquette: [1, 3], domicile_seul: false, telephone_manquant: false, generable: true } },
    { id: 'k8', platform: 'leboncoin', commande_ref: '4403', etat: 'a_confirmer', etat_plateforme: 'in_progress/reserved', bordereau: 'a_generer', acheteur_pseudo: 'Paul', titre: 'Cadre photo doré', photo_url: null, montant: 15, devise: 'EUR', transporteur: 'colissimo', vendue_le: ilYa(4), options_bordereau: { type_envoi: 'colissimo', generable: true, adresse_requise: true } },
  ],
  bordereaux_demandes: [],
  bordereaux_copies: [],
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
    rpc: async (nom, params) => {
      window.__appels.push({ rpc: nom, params });
      if (nom === 'messagerie_compteurs') return { data: { beta: true, non_lus: 3, conversations_non_lues: 3, par_article: {}, a_expedier: 4, envoi_mode: DONNEES._mode, generation: true }, error: null };
      if (nom === 'messagerie_repondre') {
        const ouvert = DONNEES._mode === 2;
        return { data: { id: 'r-neuve', statut: ouvert ? 'en_attente' : 'verrouillee', motif: ouvert ? null : 'liste_blanche' }, error: null };
      }
      if (nom === 'bordereau_generer') {
        DONNEES.bordereaux_demandes.unshift({ id: 'g-1', commande_id: params.p_commande, platform: 'vinted', action: 'generer', statut: 'demandee', motif: null, copie_id: null, essais_fichier: 0, cree_le: new Date().toISOString() });
        return { data: { id: 'g-1', statut: 'demandee' }, error: null };
      }
      if (nom === 'bordereau_demander') {
        DONNEES.bordereaux_demandes.unshift({ id: 'd-1', commande_id: params.p_commande, action: 'recuperer', statut: 'demandee', motif: null, copie_id: null, cree_le: new Date().toISOString() });
        return { data: { id: 'd-1', statut: 'demandee' }, error: null };
      }
      return { data: { ok: true }, error: null };
    },
    functions: { invoke: async (nom) => { window.__appels.push({ fonction: nom }); return { data: null, error: null }; } },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' }, error: null }) }) },
  };
}

const sb = fauxClient();
function Apercu() {
  if (ecran === 'barre') return <div style={{ padding: 16 }}><BarreMessagerie nonLus={3} aExpedier={2} onMessages={() => {}} onExpedier={() => {}} /></div>;
  if (ecran === 'expedier') return <div style={{ padding: 16 }}><SectionAExpedier supabase={sb} lang="fr" /></div>;
  if (ecran === 'carte') return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <CarteArticle id={11} lang="fr" photo={null} titre="Robe portefeuille bleue" prix="18,00 €" pastille={{ texte: 'En ligne', ton: 'ok' }} logos={{ liste: ['vinted'], etats: {} }} vues={42} favoris={3} messages={2} onMessages={() => { window.__appels.push({ ouvrir: 11 }); }} />
      <CarteArticle id={12} lang="fr" photo={null} titre="Montre Casio G-Shock" prix="45,00 €" pastille={{ texte: 'En ligne', ton: 'ok' }} logos={{ liste: ['leboncoin'], etats: {} }} vues={10} favoris={1} messages={null} />
    </div>
  );
  return <EspaceDemo />;
}
// (17/10) L'écran est une page pilotée par App (useEcranMessagerie) : ici, un état local.
function EspaceDemo() {
  const [ecranM, setEcranM] = useState({ onglet: 'messages', article: null, conversation: null, n: 1 });
  return <EspaceMessagerie supabase={sb} lang="fr" ecran={ecranM}
    onAller={(v) => setEcranM((e) => ({ ...v, n: e.n + 1 }))}
    onRetour={() => setEcranM((e) => (e.n > 1 ? { ...e, conversation: null, n: e.n - 1 } : e))} />;
}
createRoot(document.getElementById('apercu')).render(<Apercu />);
