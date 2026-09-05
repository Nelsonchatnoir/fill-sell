import { useState, useEffect, useCallback } from 'react';
import { UI, Eyebrow } from './ui';
import PlatformLogo from './platform-logos/PlatformLogo';
import { demarrerConnexionEbay, lireEtatEbay, agirEbay, ouvrirConsentementEbay } from '../utils/ebayCompte';

// ═══════════════════════════════════════════════════════════════════════════
// Section « eBay » des Paramètres — LOT 0 (connecter) + LOT 1 (dire ce qui
// manque), 05/09/2026. Ne publie rien.
//
// · Pastille : Non connecté / Connecté / À reconnecter (révocation côté eBay =
//   état NORMAL, pas une erreur) ;
// · Bouton « Connecter mon compte eBay » → consentement chez eBay (aucun mot
//   de passe ne passe par FillSell) ;
// · Checklist vendeur : chaque ligne non cochée porte UNE phrase et UN lien
//   direct vers la page eBay concernée (garde-fou Nico). Une ligne que
//   l'Account API ne permet pas de déterminer n'est pas renvoyée par le
//   serveur, donc pas affichée — jamais de conditionnel à l'écran ;
// · Politiques : CHOIX entre « utiliser une existante » et « en créer une ».
//   La création ne part que sur le clic « Créer » — jamais d'office.
//
// La voie formulaire (extension Chrome) reste EN PLACE et inchangée : cette
// section ne touche à aucun handler.
// ═══════════════════════════════════════════════════════════════════════════

// Liens eBay FR par ligne — VÉRIFIÉS dans Chrome le 05/09 (session Nico) :
//   · /bp/policyoptin et /bp/manage sont les adresses qu'eBay lui-même pose
//     dans sa page d'aide « Gestionnaire des conditions de vente » (id=4212).
//     Sur un compte NON activé, /bp/manage redirige vers /bp/policyoptin
//     (page « Mettez plus rapidement vos objets en vente », blocs Retours /
//     Livraison / Paiement) — c'est bien l'écran d'activation ;
//   · /sl/sell est l'entrée « Vendre » d'eBay (atterrit sur /sl/sell?sr=wnstart
//     pour un vendeur établi ; un compte à l'inscription incomplète y est
//     redirigé vers son parcours d'inscription).
// Les pages exigent une session eBay ouverte dans le navigateur.
const LIENS = {
  inscription_vendeur: 'https://www.ebay.fr/sl/sell',
  politiques_activees: 'https://www.ebay.fr/bp/policyoptin',
  politique_livraison: 'https://www.ebay.fr/bp/manage',
  politique_paiement: 'https://www.ebay.fr/bp/manage',
  politique_retours: 'https://www.ebay.fr/bp/manage',
};

const TYPE_PAR_CLE = { politique_livraison: 'fulfillment', politique_paiement: 'payment', politique_retours: 'return' };

const T = {
  fr: {
    section: 'Compte eBay',
    nonConnecte: 'Non connecté',
    connecte: 'Connecté',
    aReconnecter: 'À reconnecter',
    intro: "Relie ton compte vendeur eBay pour que FillSell lise l'état de ton compte (et, plus tard, publie sans que Chrome soit ouvert). La connexion se fait chez eBay : FillSell ne voit jamais ton mot de passe.",
    reconnexion: "eBay a retiré l'accès de FillSell à ton compte (révocation ou accès expiré). C'est normal — reconnecte-toi pour reprendre.",
    connecter: 'Connecter mon compte eBay',
    reconnecter: 'Reconnecter mon compte eBay',
    connecteLe: 'Connecté le',
    verif: 'Vérification chez eBay…',
    checklist: 'Ce que ton compte vendeur a, et ce qui lui manque',
    plafond: (q, m) => `Plafond de vente eBay : ${q ?? '—'} articles / ${m ?? '—'} par mois.`,
    ouvrir: 'Ouvrir chez eBay ↗',
    lignes: {
      inscription_vendeur: {
        label: 'Inscription vendeur terminée',
        manque: "Ton inscription vendeur eBay n'est pas terminée. eBay te demande de compléter ton profil vendeur (identité, coordonnées, moyen d'être payé) avant ta première annonce.",
        lien: 'Terminer mon inscription vendeur sur eBay ↗',
      },
      politiques_activees: {
        label: 'Politiques de vente activées',
        manque: "Les « politiques de vente » eBay (livraison, paiement, retours) ne sont pas activées sur ton compte. eBay les exige pour publier une annonce par API.",
        lien: 'Activer les politiques de vente sur eBay ↗',
        action: 'Activer depuis FillSell',
      },
      politique_livraison: {
        label: 'Politique de livraison',
        manque: "Tu n'as aucune politique de livraison eBay : elle dit comment tu expédies et à quel prix.",
        lien: 'Gérer mes politiques sur eBay ↗',
      },
      politique_paiement: {
        label: 'Politique de paiement',
        manque: "Tu n'as aucune politique de paiement eBay.",
        lien: 'Gérer mes politiques sur eBay ↗',
      },
      politique_retours: {
        label: 'Politique de retours',
        manque: "Tu n'as aucune politique de retours eBay : elle dit si tu acceptes les retours, et sous quel délai.",
        lien: 'Gérer mes politiques sur eBay ↗',
      },
    },
    utiliserExistante: 'Utiliser une politique existante',
    utiliser: 'Utiliser',
    utilisee: 'utilisée par FillSell',
    ouCreer: 'En créer une',
    creerDepuis: 'Créer une politique depuis FillSell',
    creer: 'Créer',
    annuler: 'Annuler',
    nom: 'Nom de la politique',
    livraisonMode: 'Mode',
    colissimo: 'Colissimo',
    mainPropre: 'Remise en main propre',
    frais: 'Frais de port (€, 0 = offerts)',
    delai: "Délai d'expédition",
    jours: (n) => `${n} jour${n > 1 ? 's' : ''}`,
    paiementNote: 'Paiement immédiat à l\'achat (paiements gérés par eBay).',
    retoursMode: 'Retours',
    retoursAcceptes: 'Acceptés sous 30 jours, frais de retour à l\'acheteur',
    retoursRefuses: 'Pas de retour',
    creee: 'Politique créée chez eBay et retenue pour FillSell.',
    deconnecter: 'Déconnecter eBay de FillSell',
    confirmerDeco: 'Confirmer la déconnexion',
    decoNote: 'FillSell oublie les jetons ; rien n\'est supprimé chez eBay.',
    erreurGenerique: 'eBay ou FillSell n\'a pas répondu. Réessaie dans un instant.',
  },
  en: {
    section: 'eBay account',
    nonConnecte: 'Not connected',
    connecte: 'Connected',
    aReconnecter: 'Reconnect needed',
    intro: "Link your eBay seller account so FillSell can read your seller status (and, later, publish without Chrome open). Sign-in happens at eBay: FillSell never sees your password.",
    reconnexion: "eBay removed FillSell's access to your account (revoked or expired). That's normal — reconnect to resume.",
    connecter: 'Connect my eBay account',
    reconnecter: 'Reconnect my eBay account',
    connecteLe: 'Connected on',
    verif: 'Checking with eBay…',
    checklist: 'What your seller account has, and what it lacks',
    plafond: (q, m) => `eBay selling limit: ${q ?? '—'} items / ${m ?? '—'} per month.`,
    ouvrir: 'Open at eBay ↗',
    lignes: {
      inscription_vendeur: {
        label: 'Seller registration completed',
        manque: "Your eBay seller registration isn't complete. eBay asks you to finish your seller profile (identity, contact details, payout method) before your first listing.",
        lien: 'Finish my seller registration on eBay ↗',
      },
      politiques_activees: {
        label: 'Business policies enabled',
        manque: "eBay business policies (shipping, payment, returns) aren't enabled on your account. eBay requires them to publish via API.",
        lien: 'Enable business policies on eBay ↗',
        action: 'Enable from FillSell',
      },
      politique_livraison: {
        label: 'Shipping policy',
        manque: "You have no eBay shipping policy: it says how you ship and at what price.",
        lien: 'Manage my policies on eBay ↗',
      },
      politique_paiement: {
        label: 'Payment policy',
        manque: "You have no eBay payment policy.",
        lien: 'Manage my policies on eBay ↗',
      },
      politique_retours: {
        label: 'Return policy',
        manque: "You have no eBay return policy: it says whether you accept returns, and within what period.",
        lien: 'Manage my policies on eBay ↗',
      },
    },
    utiliserExistante: 'Use an existing policy',
    utiliser: 'Use',
    utilisee: 'used by FillSell',
    ouCreer: 'Create one',
    creerDepuis: 'Create a policy from FillSell',
    creer: 'Create',
    annuler: 'Cancel',
    nom: 'Policy name',
    livraisonMode: 'Method',
    colissimo: 'Colissimo',
    mainPropre: 'Local pickup',
    frais: 'Shipping cost (€, 0 = free)',
    delai: 'Handling time',
    jours: (n) => `${n} day${n > 1 ? 's' : ''}`,
    paiementNote: 'Immediate payment at purchase (eBay managed payments).',
    retoursMode: 'Returns',
    retoursAcceptes: 'Accepted within 30 days, buyer pays return shipping',
    retoursRefuses: 'No returns',
    creee: 'Policy created at eBay and selected for FillSell.',
    deconnecter: 'Disconnect eBay from FillSell',
    confirmerDeco: 'Confirm disconnection',
    decoNote: 'FillSell forgets the tokens; nothing is deleted at eBay.',
    erreurGenerique: "eBay or FillSell didn't answer. Try again in a moment.",
  },
};

const NOMS_DEFAUT = { fulfillment: 'Livraison FillSell', payment: 'Paiement FillSell', return: 'Retours FillSell' };

function Pastille({ ton, children }) {
  const couleurs = ton === 'ok'
    ? { bg: `${UI.teal}1A`, fg: UI.tealDeep, dot: UI.teal }
    : ton === 'attention'
      ? { bg: `${UI.amber}22`, fg: '#9A5A3A', dot: UI.amber }
      : { bg: UI.chip, fg: UI.mute2, dot: UI.mute };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: couleurs.bg, color: couleurs.fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: couleurs.dot, flexShrink: 0 }} />
      {children}
    </span>
  );
}

const boutonPlein = (disabled) => ({
  padding: '9px 14px', borderRadius: 999, border: 'none',
  background: disabled ? '#DCEEEA' : `linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
});
const boutonCreux = (disabled) => ({
  padding: '7px 12px', borderRadius: 999, border: `1px solid ${UI.border}`, background: UI.card,
  color: disabled ? UI.mute : UI.ink, fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
});
const champ = { padding: '8px 12px', borderRadius: 10, border: `1px solid ${UI.border}`, fontSize: 13, fontWeight: 600, color: UI.ink, background: UI.card, outline: 'none', fontFamily: 'inherit', minWidth: 0, width: '100%', boxSizing: 'border-box' };

export default function EbayCompteSection({ lang = 'fr', user }) {
  const t = T[lang === 'fr' ? 'fr' : 'en'];
  const [etat, setEtat] = useState(null);         // vue publique du compte (jamais de jeton)
  const [checklist, setChecklist] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [busy, setBusy] = useState(null);         // action en cours
  const [erreur, setErreur] = useState('');
  const [creation, setCreation] = useState(null); // { type, nom, livraison, frais, delai, retours }
  const [confirmDeco, setConfirmDeco] = useState(false);
  const [creeeMsg, setCreeeMsg] = useState('');

  const charger = useCallback(async () => {
    if (!user) return;
    setChargement(true); setErreur('');
    try {
      // Un seul appel : sans compte relié, le serveur répond sans toucher eBay ;
      // avec compte, il relève la checklist (5 appels Account API) et la stocke.
      const r = await lireEtatEbay('checklist');
      setEtat(r.etat ?? null);
      setChecklist(r.checklist ?? null);
    } catch (e) {
      setErreur(e?.message || t.erreurGenerique);
    } finally {
      setChargement(false);
    }
  }, [user, t.erreurGenerique]);

  useEffect(() => { charger(); }, [charger]);
  // Retour de l'écran de consentement (natif : navigateur système ; web :
  // nouvel onglet) — on relit dès que l'app redevient visible.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') charger(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [charger]);

  const connecter = async () => {
    setBusy('connexion'); setErreur('');
    try {
      const { url } = await demarrerConnexionEbay();
      if (!url) throw new Error(t.erreurGenerique);
      await ouvrirConsentementEbay(url);
    } catch (e) {
      setErreur(e?.message || t.erreurGenerique);
    } finally {
      setBusy(null);
    }
  };

  const agir = async (action, params, cle) => {
    setBusy(cle ?? action); setErreur(''); setCreeeMsg('');
    try {
      const r = await agirEbay(action, params);
      if (r.etat) setEtat(r.etat);
      if (r.checklist !== undefined && r.checklist !== null) setChecklist(r.checklist);
      if (action === 'deconnecter') { setChecklist(null); setConfirmDeco(false); }
      if (action === 'creer_politique') { setCreation(null); setCreeeMsg(t.creee); }
      return r;
    } catch (e) {
      setErreur(e?.message || t.erreurGenerique);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const ouvrirCreation = (type) => setCreation({ type, nom: NOMS_DEFAUT[type], livraison: 'colissimo', frais: '4.99', delai: 2, retours: 'acceptes_30' });

  const connecte = Boolean(etat?.connecte);
  const aReconnecter = Boolean(etat?.a_reconnecter);
  const tonPastille = connecte ? 'ok' : aReconnecter ? 'attention' : 'neutre';
  const textePastille = connecte ? t.connecte : aReconnecter ? t.aReconnecter : t.nonConnecte;
  const dateConnexion = etat?.connected_at ? new Date(etat.connected_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB') : null;
  const limite = checklist?.selling_limit;
  const montant = limite?.amount?.value != null ? `${Number(limite.amount.value).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')} ${limite.amount.currency ?? ''}`.trim() : null;

  const rendreChoixPolitique = (ligne) => {
    const type = TYPE_PAR_CLE[ligne.cle];
    if (!type) return null;
    const existantes = ligne.existantes ?? [];
    const choisie = etat?.politiques?.[type] ?? null;
    const formulaireOuvert = creation?.type === type;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {existantes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute2 }}>{t.utiliserExistante}</div>
            {existantes.map((p) => {
              const active = p.id === choisie;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: UI.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name || p.id}{active && <span style={{ color: UI.tealDeep, fontWeight: 700 }}> · {t.utilisee}</span>}
                  </span>
                  {!active && (
                    <button onClick={() => agir('choisir_politique', { type, id: p.id }, `choix_${type}`)} disabled={busy != null} style={boutonCreux(busy != null)}>
                      {busy === `choix_${type}` ? '…' : t.utiliser}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!formulaireOuvert && (
          <button onClick={() => ouvrirCreation(type)} disabled={busy != null} style={{ ...boutonCreux(busy != null), alignSelf: 'flex-start' }}>
            {existantes.length > 0 ? t.ouCreer : t.creerDepuis}
          </button>
        )}
        {formulaireOuvert && (
          <div style={{ background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute2 }}>{t.nom}
              <input value={creation.nom} onChange={(e) => setCreation((c) => ({ ...c, nom: e.target.value.slice(0, 64) }))} style={{ ...champ, marginTop: 4 }} />
            </label>
            {type === 'fulfillment' && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute2 }}>{t.livraisonMode}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['colissimo', t.colissimo], ['main_propre', t.mainPropre]].map(([v, l]) => (
                    <button key={v} onClick={() => setCreation((c) => ({ ...c, livraison: v }))} style={{ ...boutonCreux(false), ...(creation.livraison === v ? { background: `${UI.teal}1A`, borderColor: UI.teal, color: UI.tealDeep } : {}) }}>{l}</button>
                  ))}
                </div>
                {creation.livraison === 'colissimo' && (
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute2 }}>{t.frais}
                    <input value={creation.frais} inputMode="decimal" onChange={(e) => setCreation((c) => ({ ...c, frais: e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) }))} style={{ ...champ, marginTop: 4 }} />
                  </label>
                )}
                <div style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute2 }}>{t.delai}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3].map((n) => (
                    <button key={n} onClick={() => setCreation((c) => ({ ...c, delai: n }))} style={{ ...boutonCreux(false), ...(creation.delai === n ? { background: `${UI.teal}1A`, borderColor: UI.teal, color: UI.tealDeep } : {}) }}>{t.jours(n)}</button>
                  ))}
                </div>
              </>
            )}
            {type === 'payment' && <div style={{ fontSize: 12, color: UI.mute2, lineHeight: 1.5 }}>{t.paiementNote}</div>}
            {type === 'return' && (
              <>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute2 }}>{t.retoursMode}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[['acceptes_30', t.retoursAcceptes], ['refuses', t.retoursRefuses]].map(([v, l]) => (
                    <button key={v} onClick={() => setCreation((c) => ({ ...c, retours: v }))} style={{ ...boutonCreux(false), textAlign: 'left', ...(creation.retours === v ? { background: `${UI.teal}1A`, borderColor: UI.teal, color: UI.tealDeep } : {}) }}>{l}</button>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* La création ne part QUE d'ici — clic explicite. */}
              <button
                onClick={() => agir('creer_politique', { type, options: { nom: creation.nom, livraison: creation.livraison, frais_eur: creation.frais, delai_jours: creation.delai, retours: creation.retours } }, `creer_${type}`)}
                disabled={busy != null}
                style={boutonPlein(busy != null)}
              >
                {busy === `creer_${type}` ? '…' : t.creer}
              </button>
              <button onClick={() => setCreation(null)} disabled={busy != null} style={boutonCreux(busy != null)}>{t.annuler}</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: UI.paper, border: `1px solid ${UI.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <PlatformLogo platform="ebay" size={22} />
          <Eyebrow style={{ margin: 0 }}>{t.section}</Eyebrow>
        </div>
        {etat !== null && <Pastille ton={tonPastille}>{textePastille}</Pastille>}
      </div>

      {!connecte && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: UI.mute2, lineHeight: 1.55 }}>{aReconnecter ? t.reconnexion : t.intro}</div>
          <button onClick={connecter} disabled={busy != null || chargement} style={{ ...boutonPlein(busy != null || chargement), alignSelf: 'flex-start' }}>
            {busy === 'connexion' ? '…' : (aReconnecter ? t.reconnecter : t.connecter)}
          </button>
        </div>
      )}

      {connecte && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: UI.ink, fontWeight: 600 }}>
            {etat.ebay_user_id ? <>@{etat.ebay_user_id}</> : null}
            {dateConnexion && <span style={{ color: UI.mute2, fontWeight: 500 }}>{etat.ebay_user_id ? ' · ' : ''}{t.connecteLe} {dateConnexion}</span>}
          </div>

          {chargement && !checklist && <div style={{ fontSize: 12, color: UI.mute2 }}>{t.verif}</div>}

          {checklist?.lignes?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: UI.mute2 }}>{t.checklist}</div>
              {checklist.lignes.map((ligne) => {
                const txt = t.lignes[ligne.cle];
                if (!txt) return null;
                const ok = ligne.etat === 'ok';
                return (
                  <div key={ligne.cle} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span aria-hidden style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: ok ? `${UI.teal}1A` : `${UI.amber}22`, color: ok ? UI.tealDeep : '#9A5A3A', border: `1px solid ${ok ? UI.teal : UI.amber}55` }}>
                      {ok ? '✓' : '○'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: UI.ink }}>{txt.label}</div>
                      {!ok && (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 12.5, color: UI.ink, lineHeight: 1.5 }}>{txt.manque}</div>
                          <a href={LIENS[ligne.cle]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: UI.tealDeep, textDecoration: 'none' }}>{txt.lien}</a>
                          {ligne.cle === 'politiques_activees' && (
                            <button onClick={() => agir('activer_politiques', {}, 'activer')} disabled={busy != null} style={{ ...boutonCreux(busy != null), alignSelf: 'flex-start' }}>
                              {busy === 'activer' ? '…' : txt.action}
                            </button>
                          )}
                        </div>
                      )}
                      {TYPE_PAR_CLE[ligne.cle] && rendreChoixPolitique(ligne)}
                    </div>
                  </div>
                );
              })}
              {limite && (limite.quantity != null || montant) && (
                <div style={{ fontSize: 11.5, color: UI.mute, lineHeight: 1.4 }}>{t.plafond(limite.quantity, montant)}</div>
              )}
              {creeeMsg && <div style={{ fontSize: 12, color: UI.tealDeep, fontWeight: 600 }}>{creeeMsg}</div>}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
            {!confirmDeco ? (
              <button onClick={() => setConfirmDeco(true)} disabled={busy != null} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: UI.mute, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                {t.deconnecter}
              </button>
            ) : (
              <>
                <button onClick={() => agir('deconnecter', {}, 'deco')} disabled={busy != null} style={{ ...boutonCreux(busy != null), color: UI.negative, borderColor: `${UI.negative}66` }}>
                  {busy === 'deco' ? '…' : t.confirmerDeco}
                </button>
                <button onClick={() => setConfirmDeco(false)} disabled={busy != null} style={boutonCreux(busy != null)}>{t.annuler}</button>
                <span style={{ fontSize: 11, color: UI.mute }}>{t.decoNote}</span>
              </>
            )}
          </div>
        </div>
      )}

      {erreur && <div style={{ marginTop: 8, fontSize: 12, color: UI.negative, fontWeight: 600, lineHeight: 1.45 }}>{erreur}</div>}
    </div>
  );
}
