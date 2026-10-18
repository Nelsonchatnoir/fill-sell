// ═══════════════════════════════════════════════════════════════════════════
// « À EXPÉDIER » — BÊTA (16/10/2026, clôture du chantier le soir ; nuit : générer)
// ═══════════════════════════════════════════════════════════════════════════
// Toutes les commandes en cours des cinq plateformes (plateforme_commandes,
// lecture seule) : état, pseudo de l'acheteur, numéro, photo, montant, article
// du stock rattaché par numéro, transporteur, date limite quand la plateforme
// la donne. Style des écrans du 16/10 (cartes blanches, Space Grotesk).
//   · « Récupérer le bordereau » (bordereau PRÊT chez la plateforme) dépose UNE
//     demande (bordereau_demander) ; l'ordinateur de la personne récupère le
//     fichier, la copie (5 jours) s'ouvre ici ;
//   · (16/10 nuit) « Générer le bordereau » (Vinted : commander l'étiquette ;
//     Leboncoin : confirmer la disponibilité ; Beebs : accepter la commande)
//     ouvre d'abord l'ÉCRAN DE CONFIRMATION — une phrase dit ce que le geste
//     engage ; seul « Confirmer » dépose la demande (bordereau_generer, la
//     phrase est gardée en base). Une seule génération par commande, à vie ;
//   · la copie s'ouvre dans l'aperçu (impression/) : original ou 10 × 15,
//     partager, télécharger, imprimer ; « Tout imprimer » réunit les prêtes.
// Relecture : une lecture à l'ouverture ; bornée (utils/relectureBornee.js)
// seulement pendant qu'une demande attend l'ordinateur — jamais de setInterval.
// (17/10, constat de Nico sur iPhone) Dans la page « À expédier » (dansPage),
// le titre est celui de la page ; la vignette suit la règle de Vignette.jsx
// (photo de l'annonce, sinon la fiche rattachée, sinon une icône) ; l'écran de
// confirmation est une Couche (portail sur body, barre du bas masquée) — sur
// iPhone, ses boutons passaient sous la barre du bas.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { UI } from '../components/ui';
import Icone from '../ecrans/Icone';
import { demarrerRelecture } from '../utils/relectureBornee';
import { sourcesVignette, suiviCommande, expedieesRecentes, actionCommande, commandesAExpedier, dateCourte, delaiEnvoi, etatDemandeBordereau, extensionCommandeVinted, libelleEtatCommande, libelleTransporteur, libelleTypeEtiquette, montantTexte, nomPlateforme, pseudoAffiche, refusDemandeBordereau } from './vue';
import { ouvrirLien } from './ouvrir';
import { useReglagesMessagerie } from './useMessagerieBeta';
import Couche from './Couche';
import Vignette from './Vignette';
// L'aperçu et « Tout imprimer » (pdf.js, pdf-lib derrière) ne se chargent qu'à l'usage :
// rien de plus à l'ouverture des Ventes, pour personne.
const ApercuBordereau = lazy(() => import('./impression/ApercuBordereau.jsx'));
const BoutonToutImprimer = lazy(() => import('./impression/ToutImprimer.jsx').then((m) => ({ default: m.BoutonToutImprimer })));

const ENCRE2 = '#5C6560';
const LIGNE = '#EFECE6';
const MENTHE = '#E6F1EE';
const TONS = Object.freeze({
  ok: { fond: MENTHE, encre: '#1B6E62' },
  ambre: { fond: '#FFF6E3', encre: '#8A6100' },
  rouge: { fond: '#FEF2F2', encre: '#B91C1C' },
  neutre: { fond: '#F2F0E9', encre: ENCRE2 },
});
const COLONNES_BASE = 'id,platform,commande_ref,etat,etat_plateforme,bordereau,acheteur_pseudo,titre,photo_url,montant,devise,annonce_ref,inventaire_id,conversation_ref,transporteur,envoi_ref,a_expedier_avant,vendue_le';
// (16/10 nuit) Colonnes posées par la migration 20261016220000 : tant qu'elle
// n'est pas appliquée, l'écran relit sans elles (rien ne casse, pas de génération).
const COLONNES = `${COLONNES_BASE},options_bordereau`;
const COLS_DEMANDES = 'id,commande_id,platform,action,statut,motif,copie_id,essais_fichier,cree_le';
const COLS_DEMANDES_BASE = 'id,commande_id,platform,statut,motif,copie_id,cree_le';
const colonneAbsente = (e) => e?.code === '42703' || /column .* does not exist|could not find .* column/i.test(String(e?.message ?? ''));
const ATTENTE_MAX_MS = 5 * 60_000;

// Le verbe du bouton de confirmation : le geste, nommé.
const GESTES = Object.freeze({
  vinted: ['Commander l’étiquette', 'Order the label'],
  leboncoin: ['Confirmer la disponibilité', 'Confirm availability'],
  beebs: ['Accepter la commande', 'Accept the order'],
});

function Pastille({ ton = 'neutre', children }) {
  const t = TONS[ton] ?? TONS.neutre;
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: t.fond, color: t.encre, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Bouton({ principal = false, desactive = false, onClick, children, ariaLabel, ton = null }) {
  const fond = principal ? (desactive ? '#ECE9E2' : (ton === 'ambre' ? '#9A6200' : UI.tealDeep)) : '#FFFFFF';
  return (
    <button type="button" onClick={onClick} disabled={desactive} aria-label={ariaLabel}
      style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, border: principal ? 'none' : `1px solid ${UI.border}`, background: fond, color: principal ? (desactive ? '#8A8578' : '#FFFFFF') : UI.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: desactive ? 'default' : 'pointer', flex: '1 1 auto', minWidth: 0 }}>
      {children}
    </button>
  );
}

function tonEtat(c) {
  if (c.etat === 'a_confirmer') return 'ambre';
  if (c.etat === 'a_expedier') return c.bordereau === 'indisponible' ? 'rouge' : 'ok';
  return 'neutre';
}

/**
 * L'ÉCRAN DE CONFIRMATION d'une génération : la commande, la phrase de ce que
 * le geste engage, le type d'étiquette (Vinted : papier ou QR — options pas
 * encore relues comprises), l'expéditeur (Leboncoin Colissimo / courrier suivi :
 * l'adresse du compte Leboncoin, lue au moment du geste), puis « Annuler » ou le
 * geste nommé. Rien ne part sans ce second appui.
 */
function ConfirmationGeneration({ commande: c, action, lang, occupe, onAnnuler, onConfirmer }) {
  const fr = lang !== 'en';
  const types = action.types ?? [];
  const [type, setType] = useState(types.includes(1) ? 1 : (types[0] ?? null));
  const geste = GESTES[c.platform] ?? ['Confirmer', 'Confirm'];
  const meta = [pseudoAffiche(c.platform, c.acheteur_pseudo), montantTexte(c.montant, c.devise), libelleTransporteur(c.transporteur)].filter(Boolean).join(' · ');
  const choix = (types.length > 1 || action.typesSupposes) && type != null ? { type_etiquette: type } : {};
  return (
    <Couche onFermer={occupe ? undefined : onAnnuler}>
    <div role="dialog" aria-modal="true" aria-label={fr ? 'Générer le bordereau' : 'Generate the label'}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(16,32,27,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={occupe ? undefined : onAnnuler}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: "'Space Grotesk',sans-serif", color: UI.ink, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: '#FFF6E3', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <PlatformLogo platform={c.platform} size={18} />
          </span>
          <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{fr ? 'Générer le bordereau ?' : 'Generate the label?'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{c.titre ?? (fr ? 'Article' : 'Item')}</span>
          {meta && <span style={{ fontSize: 12.5, color: ENCRE2, overflowWrap: 'anywhere' }}>{meta}</span>}
          <span style={{ fontSize: 12, color: '#8A918E' }}>{`${nomPlateforme(c.platform)} · ${fr ? 'commande' : 'order'} ${c.commande_ref}`}</span>
        </div>
        <div role="note" style={{ padding: '12px 14px', borderRadius: 14, background: '#FFF6E3', border: '1px solid #EED9A6', color: '#5C4300', fontSize: 14, fontWeight: 700, lineHeight: 1.45 }}>
          {action.phrase}
        </div>
        {types.length > 1 && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend style={{ fontSize: 13, fontWeight: 700, color: ENCRE2, marginBottom: 6 }}>{fr ? 'Dépôt en point relais : ce que Vinted te donne' : 'Drop-off at a parcel point: what Vinted gives you'}</legend>
            {types.map((t) => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '8px 12px', borderRadius: 12, border: `1.5px solid ${type === t ? UI.tealDeep : UI.border}`, background: type === t ? MENTHE : '#FFFFFF', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                <input type="radio" name="type-etiquette" checked={type === t} onChange={() => setType(t)} style={{ width: 18, height: 18, accentColor: UI.tealDeep }} />
                {libelleTypeEtiquette(t, lang)}
              </label>
            ))}
            {action.typesSupposes && <div style={{ fontSize: 12.5, color: ENCRE2, lineHeight: 1.4 }}>{fr ? 'Ton ordinateur vérifie juste avant de commander que Vinted propose ce type pour cette commande ; sinon rien n’est commandé et FillSell te le dit.' : 'Your computer checks right before ordering that Vinted offers this type for this order; otherwise nothing is ordered and FillSell tells you.'}</div>}
          </fieldset>
        )}
        {action.adresse === true && (
          <div data-expediteur="compte-leboncoin" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 14, border: `1px solid ${UI.border}`, background: '#FFFFFF', fontSize: 13, lineHeight: 1.45 }}>
            <Icone nom="maison" taille={17} couleur={ENCRE2} epaisseur={2.1} style={{ flex: 'none', marginTop: 1 }} />
            <span>{fr ? 'Expéditeur : l’adresse enregistrée dans ton compte Leboncoin (nom, adresse, téléphone), lue par ton ordinateur au moment du geste. Incomplète : rien ne part et FillSell te le dit.' : 'Sender: the address saved in your Leboncoin account (name, address, phone), read by your computer at the time of the step. Incomplete: nothing is sent and FillSell tells you.'}</span>
          </div>
        )}
        <div style={{ fontSize: 12.5, color: ENCRE2, lineHeight: 1.45 }}>
          {fr ? `Ton ordinateur (Chrome ouvert, extension active) le fait sur ${nomPlateforme(c.platform)} à son prochain passage, une seule fois, puis le bordereau s’affiche ici.` : `Your computer (Chrome open, extension on) does it on ${nomPlateforme(c.platform)} on its next pass, only once, then the label shows up here.`}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Bouton onClick={onAnnuler} desactive={occupe} ariaLabel={fr ? 'Annuler' : 'Cancel'}>{fr ? 'Annuler' : 'Cancel'}</Bouton>
          <Bouton principal ton="ambre" desactive={occupe || ((types.length > 1) && type == null)}
            onClick={() => onConfirmer(choix, action.phrase)}
            ariaLabel={fr ? geste[0] : geste[1]}>
            {occupe ? (fr ? 'Envoi…' : 'Sending…') : (fr ? geste[0] : geste[1])}
          </Bouton>
        </div>
      </div>
    </div>
    </Couche>
  );
}

/** (17/10) La plateforme en DERNIER RECOURS : un lien discret, jamais un bouton qui appelle. */
function LienSecours({ url, platform, lang }) {
  const fr = lang !== 'en';
  return (
    <button type="button" data-lien-secours onClick={() => ouvrirLien(url)}
      style={{ alignSelf: 'flex-start', minHeight: 32, padding: '4px 0', border: 'none', background: 'none', color: ENCRE2, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
      {fr ? `Voir la commande sur ${nomPlateforme(platform)}` : `See the order on ${nomPlateforme(platform)}`}
    </button>
  );
}

export function SectionAExpedier({ supabase, lang = 'fr', photosParInventaire = null, dansPage = false }) {
  const fr = lang !== 'en';
  const reglages = useReglagesMessagerie(supabase);
  const [commandes, setCommandes] = useState(null);
  const [demandes, setDemandes] = useState({});
  const [copies, setCopies] = useState({});
  const [erreur, setErreur] = useState(false);
  const [notes, setNotes] = useState({});
  const [occupee, setOccupee] = useState(null);
  const [enAttente, setEnAttente] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [expediees, setExpediees] = useState([]);
  // (18/10) L'extension de ce compte sait-elle commander l'étiquette Vinted (0.6.126) ? null = inconnu.
  const [extensionVinted, setExtensionVinted] = useState(null);
  const vivant = useRef(true);

  const charger = useCallback(async () => {
    const maintenant = new Date().toISOString();
    const lireCommandes = (cols) => supabase.from('plateforme_commandes').select(cols).in('etat', ['a_confirmer', 'a_expedier', 'inconnu']).order('vendue_le', { ascending: true }).limit(60);
    const lireDemandes = (cols) => supabase.from('bordereaux_demandes').select(cols).order('cree_le', { ascending: false }).limit(60);
    let [c, d, k] = await Promise.all([
      lireCommandes(COLONNES),
      lireDemandes(COLS_DEMANDES),
      supabase.from('bordereaux_copies').select('id,commande_id,chemin,expire_le').is('efface_le', null).gt('expire_le', maintenant).order('cree_le', { ascending: false }).limit(60),
    ]);
    // (17/10) Les commandes expédiées depuis 3 jours : leur suivi reste visible ici
    // (une étiquette eBay achetée passe la commande « expédiée » aussitôt).
    // Lecture annexe : sa panne ne cache jamais la liste principale.
    try {
      const e = await supabase.from('plateforme_commandes').select(`${COLONNES_BASE},maj_le`).eq('etat', 'expediee')
        .gte('maj_le', new Date(Date.now() - 3 * 86400000).toISOString()).order('maj_le', { ascending: false }).limit(20);
      if (vivant.current) setExpediees(e.error ? [] : expedieesRecentes(e.data ?? []));
    } catch { if (vivant.current) setExpediees([]); }
    // (18/10) Lecture annexe (une ligne) : sa panne laisse « inconnu », jamais un bouton en moins.
    try {
      const uid = (await supabase.auth.getSession())?.data?.session?.user?.id ?? null;
      const p = uid ? await supabase.from('profiles').select('extension_build').eq('id', uid).maybeSingle() : null;
      if (vivant.current) setExtensionVinted(p && !p.error ? extensionCommandeVinted(p.data?.extension_build) : null);
    } catch { if (vivant.current) setExtensionVinted(null); }
    if (colonneAbsente(c.error)) c = await lireCommandes(COLONNES_BASE);
    if (colonneAbsente(d.error)) d = await lireDemandes(COLS_DEMANDES_BASE);
    if (!vivant.current) return undefined;
    if (c.error) { setErreur(true); setCommandes([]); return false; }
    setErreur(false);
    setCommandes(commandesAExpedier(c.data ?? []));
    // La demande qui parle pour la commande : une génération d'abord (elle
    // engage), sinon la plus récente.
    const dm = {};
    for (const x of (d.error ? [] : d.data ?? [])) {
      const deja = dm[x.commande_id];
      if (!deja || (x.action === 'generer' && deja.action !== 'generer')) dm[x.commande_id] = x;
    }
    const cp = {};
    for (const x of (k.error ? [] : k.data ?? [])) if (!cp[x.commande_id]) cp[x.commande_id] = x;
    setDemandes(dm);
    setCopies(cp);
    setEnAttente(Object.values(dm).some((x) => !cp[x.commande_id] && (x.statut === 'demandee' || x.statut === 'en_cours'
      || (x.action === 'generer' && x.statut === 'generee' && Number(x.essais_fichier) < 15 && x.motif !== 'fichier_sur_beebs'))));
    return undefined;
  }, [supabase]);

  useEffect(() => {
    vivant.current = true;
    (async () => { await Promise.resolve(); await charger(); })();
    return () => { vivant.current = false; };
  }, [charger]);

  // Une demande attend l'ordinateur : relecture bornée, 5 min au plus.
  useEffect(() => {
    if (!enAttente) return undefined;
    const r = demarrerRelecture(charger, { intervalleMs: 6000, maxMs: 30_000, immediat: false });
    const fin = setTimeout(() => r.arreter(), ATTENTE_MAX_MS);
    return () => { clearTimeout(fin); r.arreter(); };
  }, [enAttente, charger]);

  const copiePour = (c, copie) => ({ chemin: copie.chemin, platform: c.platform, transporteur: c.transporteur ?? null, commande_ref: c.commande_ref });

  const demanderBordereau = async (c) => {
    if (copies[c.id]) { setApercu(copiePour(c, copies[c.id])); return; }
    setOccupee(c.id);
    setNotes((n) => ({ ...n, [c.id]: null }));
    const { data, error } = await supabase.rpc('bordereau_demander', { p_commande: c.id });
    setOccupee(null);
    if (error) { setNotes((n) => ({ ...n, [c.id]: fr ? 'Demande non enregistrée : réessaie.' : 'Request not saved: try again.' })); return; }
    if (data?.copie) {
      const copie = { id: data.copie, chemin: data.chemin, expire_le: data.expire_le };
      setCopies((k) => ({ ...k, [c.id]: copie }));
      setApercu(copiePour(c, copie));
      return;
    }
    if (data?.refuse) { setNotes((n) => ({ ...n, [c.id]: refusDemandeBordereau(data.refuse, lang) })); return; }
    setDemandes((d) => ({ ...d, [c.id]: { id: data?.id, commande_id: c.id, action: 'recuperer', statut: data?.statut ?? 'demandee' } }));
    setEnAttente(true);
  };

  // Le SECOND appui (écran de confirmation) : la demande de génération.
  const confirmerGeneration = async (c, choix, phrase) => {
    setOccupee(c.id);
    setNotes((n) => ({ ...n, [c.id]: null }));
    const { data, error } = await supabase.rpc('bordereau_generer', { p_commande: c.id, p_choix: choix ?? {}, p_engagement: phrase });
    setOccupee(null);
    setConfirmation(null);
    if (error) { setNotes((n) => ({ ...n, [c.id]: fr ? 'Demande non enregistrée : rien n’a été fait. Réessaie.' : 'Request not saved: nothing was done. Try again.' })); return; }
    if (data?.copie) {
      const copie = { id: data.copie, chemin: data.chemin, expire_le: data.expire_le };
      setCopies((k) => ({ ...k, [c.id]: copie }));
      setApercu(copiePour(c, copie));
      return;
    }
    if (data?.refuse) { setNotes((n) => ({ ...n, [c.id]: refusDemandeBordereau(data.refuse, lang) })); return; }
    setDemandes((d) => ({ ...d, [c.id]: { id: data?.id, commande_id: c.id, action: 'generer', statut: data?.statut ?? 'demandee', motif: data?.motif ?? null } }));
    setEnAttente(true);
  };

  if (commandes === null) return null;
  const nb = commandes.length;
  const pretes = commandes.filter((c) => copies[c.id]).map((c) => copiePour(c, copies[c.id]));
  return (
    <section aria-label={fr ? 'À expédier' : 'To ship'}
      style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 24, overflow: 'hidden', fontFamily: "'Space Grotesk',sans-serif", color: UI.ink }}>
      {!dansPage && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px' }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: MENTHE, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icone nom="colis" taille={19} couleur={UI.tealDeep} epaisseur={2.1} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{fr ? 'À expédier' : 'To ship'}{nb > 0 ? ` · ${nb}` : ''}</span>
          <span style={{ fontSize: 12, color: ENCRE2, lineHeight: 1.35 }}>{fr ? 'Toutes tes commandes en cours : Vinted, Leboncoin, Beebs, Depop et eBay.' : 'All your ongoing orders: Vinted, Leboncoin, Beebs, Depop and eBay.'}</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8A6100', background: '#FFF6E3', border: '1px solid #EED9A6', borderRadius: 999, padding: '1px 8px', flex: 'none' }}>{fr ? 'bêta' : 'beta'}</span>
      </div>
      )}
      {pretes.length >= 2 && (
        <div style={{ padding: dansPage ? '14px 16px 12px' : '0 16px 12px', display: 'flex' }}>
          <Suspense fallback={null}><BoutonToutImprimer copies={pretes} supabase={supabase} lang={lang} /></Suspense>
        </div>
      )}

      {erreur && <p style={{ margin: 0, padding: dansPage ? '16px' : '0 16px 16px', fontSize: 13, color: ENCRE2 }}>{fr ? 'Lecture impossible pour le moment.' : 'Cannot read right now.'}</p>}
      {!erreur && nb === 0 && (
        <div style={{ padding: dansPage ? '18px 16px' : '6px 16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{fr ? 'Aucune commande à expédier' : 'Nothing to ship'}</span>
          <span style={{ fontSize: 13, color: ENCRE2, lineHeight: 1.45 }}>{fr ? 'Dès qu’une vente arrive sur une plateforme, elle apparaît ici avec l’acheteur, le numéro et ce qu’il reste à faire.' : 'As soon as a sale comes in, it shows up here with the buyer, the order number and what is left to do.'}</span>
        </div>
      )}

      {commandes.map((c, i) => {
        const action = actionCommande(c, lang, reglages.generation, extensionVinted);
        const delai = delaiEnvoi(c, lang);
        const demande = demandes[c.id] ?? null;
        const copie = copies[c.id] ?? null;
        const etatD = !copie ? etatDemandeBordereau(demande, lang, c.platform) : null;
        const attente = etatD?.attente === true;
        // Une génération déjà née (en cours, faite, incertaine) : plus jamais le bouton « Générer ».
        const generationNee = demande?.action === 'generer' && ['demandee', 'en_cours', 'generee', 'prete', 'incertaine'].includes(demande.statut);
        const meta = [pseudoAffiche(c.platform, c.acheteur_pseudo), montantTexte(c.montant, c.devise), c.vendue_le ? (fr ? `vendue ${dateCourte(c.vendue_le, lang)}` : `sold ${dateCourte(c.vendue_le, lang)}`) : null].filter(Boolean).join(' · ');
        const suivi = suiviCommande(c, lang);
        // (17/10) Le geste FillSell en bouton ; la plateforme en dernier recours (lien discret),
        // sauf quand c'est le SEUL geste possible (type 'lien' : il dit pourquoi).
        const boutonFillSell = copie || action.type === 'bordereau' || (action.type === 'generer' && !generationNee);
        return (
          <article key={c.id} data-commande={c.platform} data-action={copie ? 'copie' : action.type} style={{ borderTop: dansPage && i === 0 && pretes.length < 2 ? 'none' : `1px solid ${LIGNE}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Vignette sources={sourcesVignette(c.photo_url, c.inventaire_id ? photosParInventaire?.[c.inventaire_id] : null)} platform={c.platform} taille={60} icone="colis" />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Pastille ton={tonEtat(c)}>{libelleEtatCommande(c.etat, lang, c.platform)}</Pastille>
                  <span style={{ fontSize: 12, fontWeight: 600, color: ENCRE2 }}>{nomPlateforme(c.platform)}</span>
                  {c.inventaire_id ? <Pastille ton="neutre">{fr ? 'Dans ton stock' : 'In your stock'}</Pastille> : null}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{c.titre ?? (fr ? 'Article' : 'Item')}</div>
                {meta && <div style={{ fontSize: 12.5, color: ENCRE2, overflowWrap: 'anywhere' }}>{meta}</div>}
                <div style={{ fontSize: 12, color: '#8A918E', overflowWrap: 'anywhere' }}>
                  {[`${fr ? 'Commande' : 'Order'} ${c.commande_ref}`, libelleTransporteur(c.transporteur)].filter(Boolean).join(' · ')}
                </div>
                {suivi && <div data-suivi style={{ fontSize: 12.5, fontWeight: 600, color: UI.ink, overflowWrap: 'anywhere' }}>{suivi.texte}</div>}
              </div>
            </div>
            {delai && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: delai.urgent ? '#FFF6E3' : '#F6F5F1', color: delai.urgent ? '#8A6100' : UI.ink, fontSize: 13, fontWeight: 600 }}>
                <Icone nom="horloge" taille={16} couleur={delai.urgent ? '#8A6100' : ENCRE2} epaisseur={2.2} />{delai.texte}
              </div>
            )}
            {!copie && !generationNee && <div style={{ fontSize: 13, color: ENCRE2, lineHeight: 1.45 }}>{action.aide}</div>}
            {(boutonFillSell || action.type === 'lien') && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {copie ? (
                  <Bouton principal onClick={() => setApercu(copiePour(c, copie))} ariaLabel={fr ? 'Ouvrir le bordereau' : 'Open the label'}>
                    <Icone nom="recu" taille={17} couleur="#FFFFFF" epaisseur={2.2} />{fr ? 'Ouvrir le bordereau' : 'Open the label'}
                  </Bouton>
                ) : action.type === 'bordereau' ? (
                  <Bouton principal desactive={attente || occupee === c.id} onClick={() => demanderBordereau(c)}
                    ariaLabel={fr ? 'Récupérer le bordereau' : 'Fetch the label'}>
                    <Icone nom="recu" taille={17} couleur={attente || occupee === c.id ? '#8A8578' : '#FFFFFF'} epaisseur={2.2} />
                    {attente ? (fr ? 'Récupération…' : 'Fetching…') : action.libelle}
                  </Bouton>
                ) : action.type === 'generer' && !generationNee ? (
                  <Bouton principal ton="ambre" desactive={occupee === c.id} onClick={() => setConfirmation({ commande: c, action })} ariaLabel={action.libelle}>
                    <Icone nom="recu" taille={17} couleur="#FFFFFF" epaisseur={2.2} />{action.libelle}
                  </Bouton>
                ) : (
                  // Ce que FillSell ne fait pas : un bouton BLANC (jamais l'air de l'action principale).
                  <Bouton onClick={() => ouvrirLien(action.url)} ariaLabel={action.libelle}>
                    {action.libelle}
                    <Icone nom="fleche" taille={16} couleur={UI.ink} epaisseur={2.2} />
                  </Bouton>
                )}
              </div>
            )}
            {copie && <div style={{ fontSize: 12, color: ENCRE2 }}>{fr ? `Copie gardée jusqu’au ${dateCourte(copie.expire_le, lang)}, puis effacée.` : `Copy kept until ${dateCourte(copie.expire_le, lang)}, then erased.`}</div>}
            {etatD && <div role="status" style={{ fontSize: 12.5, fontWeight: 600, color: (TONS[etatD.ton] ?? TONS.neutre).encre, lineHeight: 1.45 }}>{etatD.texte}</div>}
            {notes[c.id] && <div role="status" style={{ fontSize: 12.5, fontWeight: 600, color: '#8A6100' }}>{notes[c.id]}</div>}
            {action.type !== 'lien' && action.url && <LienSecours url={action.url} platform={c.platform} lang={lang} />}
          </article>
        );
      })}
      {expediees.length > 0 && (
        <div data-expediees style={{ borderTop: `1px solid ${LIGNE}`, padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10, background: '#FBFAF7' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.11em', color: '#6F7774', textTransform: 'uppercase' }}>{fr ? 'Expédiées depuis 3 jours' : 'Shipped in the last 3 days'}</span>
          {expediees.map((c) => {
            const suivi = suiviCommande(c, lang);
            return (
              <div key={c.id} data-expediee={c.platform} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Vignette sources={sourcesVignette(c.photo_url, c.inventaire_id ? photosParInventaire?.[c.inventaire_id] : null)} platform={c.platform} taille={40} icone="colis" />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titre ?? (fr ? 'Article' : 'Item')}</span>
                  <span style={{ fontSize: 12.5, color: ENCRE2, overflowWrap: 'anywhere' }}>
                    {suivi ? suivi.texte : [nomPlateforme(c.platform), libelleTransporteur(c.transporteur), fr ? 'expédiée' : 'shipped'].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmation && (
        <ConfirmationGeneration commande={confirmation.commande} action={confirmation.action} lang={lang}
          occupe={occupee === confirmation.commande.id}
          onAnnuler={() => setConfirmation(null)}
          onConfirmer={(choix, phrase) => confirmerGeneration(confirmation.commande, choix, phrase)} />
      )}
      {apercu && <Suspense fallback={null}><ApercuBordereau ouvert copie={apercu} supabase={supabase} lang={lang} onFermer={() => setApercu(null)} /></Suspense>}
    </section>
  );
}

export default SectionAExpedier;
