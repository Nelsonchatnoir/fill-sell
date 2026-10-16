// ═══════════════════════════════════════════════════════════════════════════
// « À EXPÉDIER » — BÊTA (16/10/2026, clôture du chantier le soir)
// ═══════════════════════════════════════════════════════════════════════════
// Toutes les commandes en cours des cinq plateformes (plateforme_commandes,
// lecture seule) : état, pseudo de l'acheteur, numéro, photo, montant, article
// du stock rattaché par numéro, transporteur, date limite quand la plateforme
// la donne. Style des écrans du 16/10 (cartes blanches, Space Grotesk).
// Le bouton « Bordereau » (Vinted, Leboncoin, bordereau PRÊT chez la
// plateforme) dépose UNE demande (bordereau_demander) ; l'ordinateur de la
// personne récupère le fichier, la copie (5 jours) s'ouvre ici. Tout geste
// qui ENGAGE se fait sur la plateforme : l'app ouvre la bonne page, rien de plus.
// Relecture : une lecture à l'ouverture ; bornée (utils/relectureBornee.js)
// seulement pendant qu'une demande attend l'ordinateur — jamais de setInterval.
import { useCallback, useEffect, useRef, useState } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { UI } from '../components/ui';
import Icone from '../ecrans/Icone';
import { demarrerRelecture } from '../utils/relectureBornee';
import { actionCommande, commandesAExpedier, dateCourte, delaiEnvoi, etatDemandeBordereau, libelleEtatCommande, libelleTransporteur, montantTexte, nomPlateforme, pseudoAffiche, refusDemandeBordereau } from './vue';
import { ouvrirApres, ouvrirLien } from './ouvrir';

const ENCRE2 = '#5C6560';
const LIGNE = '#EFECE6';
const MENTHE = '#E6F1EE';
const TONS = Object.freeze({
  ok: { fond: MENTHE, encre: '#1B6E62' },
  ambre: { fond: '#FFF6E3', encre: '#8A6100' },
  rouge: { fond: '#FEF2F2', encre: '#B91C1C' },
  neutre: { fond: '#F2F0E9', encre: ENCRE2 },
});
const COLONNES = 'id,platform,commande_ref,etat,etat_plateforme,bordereau,acheteur_pseudo,titre,photo_url,montant,devise,annonce_ref,inventaire_id,conversation_ref,transporteur,envoi_ref,a_expedier_avant,vendue_le';
const ATTENTE_MAX_MS = 5 * 60_000;

function Pastille({ ton = 'neutre', children }) {
  const t = TONS[ton] ?? TONS.neutre;
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, background: t.fond, color: t.encre, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Bouton({ principal = false, desactive = false, onClick, children, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} disabled={desactive} aria-label={ariaLabel}
      style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, border: principal ? 'none' : `1px solid ${UI.border}`, background: principal ? (desactive ? '#ECE9E2' : UI.tealDeep) : '#FFFFFF', color: principal ? (desactive ? '#8A8578' : '#FFFFFF') : UI.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: desactive ? 'default' : 'pointer', flex: '1 1 auto', minWidth: 0 }}>
      {children}
    </button>
  );
}

function tonEtat(c) {
  if (c.etat === 'a_confirmer') return 'ambre';
  if (c.etat === 'a_expedier') return c.bordereau === 'indisponible' ? 'rouge' : 'ok';
  return 'neutre';
}

export function SectionAExpedier({ supabase, lang = 'fr', photosParInventaire = null, compact = false }) {
  const fr = lang !== 'en';
  const [commandes, setCommandes] = useState(null);
  const [demandes, setDemandes] = useState({});
  const [copies, setCopies] = useState({});
  const [erreur, setErreur] = useState(false);
  const [notes, setNotes] = useState({});
  const [occupee, setOccupee] = useState(null);
  const [enAttente, setEnAttente] = useState(false);
  const vivant = useRef(true);

  const charger = useCallback(async () => {
    const maintenant = new Date().toISOString();
    const [c, d, k] = await Promise.all([
      supabase.from('plateforme_commandes').select(COLONNES).in('etat', ['a_confirmer', 'a_expedier', 'inconnu']).order('vendue_le', { ascending: true }).limit(60),
      supabase.from('bordereaux_demandes').select('id,commande_id,statut,motif,copie_id,cree_le').order('cree_le', { ascending: false }).limit(60),
      supabase.from('bordereaux_copies').select('id,commande_id,chemin,expire_le').is('efface_le', null).gt('expire_le', maintenant).order('cree_le', { ascending: false }).limit(60),
    ]);
    if (!vivant.current) return undefined;
    if (c.error) { setErreur(true); setCommandes([]); return false; }
    setErreur(false);
    setCommandes(commandesAExpedier(c.data ?? []));
    const dm = {};
    for (const x of (d.error ? [] : d.data ?? [])) if (!dm[x.commande_id]) dm[x.commande_id] = x;
    const cp = {};
    for (const x of (k.error ? [] : k.data ?? [])) if (!cp[x.commande_id]) cp[x.commande_id] = x;
    setDemandes(dm);
    setCopies(cp);
    setEnAttente(Object.values(dm).some((x) => x.statut === 'demandee' || x.statut === 'en_cours'));
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

  const ouvrirCopie = (copie) => ouvrirApres(async () => {
    const { data, error } = await supabase.storage.from('bordereaux').createSignedUrl(copie.chemin, 600);
    return error ? null : (data?.signedUrl ?? null);
  });

  const demanderBordereau = async (c) => {
    if (copies[c.id]) {
      const ok = await ouvrirCopie(copies[c.id]);
      if (!ok) setNotes((n) => ({ ...n, [c.id]: fr ? 'La copie n’a pas pu s’ouvrir : réessaie.' : 'The copy could not open: try again.' }));
      return;
    }
    setOccupee(c.id);
    setNotes((n) => ({ ...n, [c.id]: null }));
    const { data, error } = await supabase.rpc('bordereau_demander', { p_commande: c.id });
    setOccupee(null);
    if (error) { setNotes((n) => ({ ...n, [c.id]: fr ? 'Demande non enregistrée : réessaie.' : 'Request not saved: try again.' })); return; }
    if (data?.copie) { setCopies((k) => ({ ...k, [c.id]: { id: data.copie, chemin: data.chemin, expire_le: data.expire_le } })); return; }
    if (data?.refuse) { setNotes((n) => ({ ...n, [c.id]: refusDemandeBordereau(data.refuse, lang) })); return; }
    setDemandes((d) => ({ ...d, [c.id]: { id: data?.id, commande_id: c.id, statut: data?.statut ?? 'demandee' } }));
    setEnAttente(true);
  };

  if (commandes === null) return null;
  const nb = commandes.length;
  return (
    <section aria-label={fr ? 'À expédier' : 'To ship'}
      style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 24, overflow: 'hidden', fontFamily: "'Space Grotesk',sans-serif", color: UI.ink }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: compact ? '14px 16px 10px' : '16px 16px 12px' }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: MENTHE, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icone nom="colis" taille={19} couleur={UI.tealDeep} epaisseur={2.1} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{fr ? 'À expédier' : 'To ship'}{nb > 0 ? ` · ${nb}` : ''}</span>
          <span style={{ fontSize: 12, color: ENCRE2, lineHeight: 1.35 }}>{fr ? 'Toutes tes commandes en cours : Vinted, Leboncoin, Beebs, Depop et eBay.' : 'All your ongoing orders: Vinted, Leboncoin, Beebs, Depop and eBay.'}</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8A6100', background: '#FFF6E3', border: '1px solid #EED9A6', borderRadius: 999, padding: '1px 8px', flex: 'none' }}>{fr ? 'bêta' : 'beta'}</span>
      </div>

      {erreur && <p style={{ margin: 0, padding: '0 16px 16px', fontSize: 13, color: ENCRE2 }}>{fr ? 'Lecture impossible pour le moment.' : 'Cannot read right now.'}</p>}
      {!erreur && nb === 0 && (
        <div style={{ padding: '6px 16px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{fr ? 'Aucune commande à expédier' : 'Nothing to ship'}</span>
          <span style={{ fontSize: 13, color: ENCRE2, lineHeight: 1.45 }}>{fr ? 'Dès qu’une vente arrive sur une plateforme, elle apparaît ici avec l’acheteur, le numéro et ce qu’il reste à faire.' : 'As soon as a sale comes in, it shows up here with the buyer, the order number and what is left to do.'}</span>
        </div>
      )}

      {commandes.map((c) => {
        const action = actionCommande(c, lang);
        const delai = delaiEnvoi(c, lang);
        const photo = (c.inventaire_id && photosParInventaire?.[c.inventaire_id]) || c.photo_url || null;
        const demande = demandes[c.id] ?? null;
        const copie = copies[c.id] ?? null;
        const etatD = !copie ? etatDemandeBordereau(demande, lang) : null;
        const attente = etatD?.attente === true;
        const meta = [pseudoAffiche(c.platform, c.acheteur_pseudo), montantTexte(c.montant, c.devise), c.vendue_le ? (fr ? `vendue ${dateCourte(c.vendue_le, lang)}` : `sold ${dateCourte(c.vendue_le, lang)}`) : null].filter(Boolean).join(' · ');
        return (
          <article key={c.id} data-commande={c.platform} style={{ borderTop: `1px solid ${LIGNE}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ position: 'relative', width: 60, height: 60, borderRadius: 14, overflow: 'hidden', background: '#F2F0E9', flex: 'none' }}>
                {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
                <span style={{ position: 'absolute', right: 3, bottom: 3, width: 20, height: 20, borderRadius: 7, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(16,32,27,.18)' }}>
                  <PlatformLogo platform={c.platform} size={14} />
                </span>
              </div>
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
              </div>
            </div>
            {delai && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: delai.urgent ? '#FFF6E3' : '#F6F5F1', color: delai.urgent ? '#8A6100' : UI.ink, fontSize: 13, fontWeight: 600 }}>
                <Icone nom="horloge" taille={16} couleur={delai.urgent ? '#8A6100' : ENCRE2} epaisseur={2.2} />{delai.texte}
              </div>
            )}
            <div style={{ fontSize: 13, color: ENCRE2, lineHeight: 1.45 }}>{action.aide}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {action.type === 'bordereau' ? (
                <>
                  <Bouton principal desactive={attente || occupee === c.id} onClick={() => demanderBordereau(c)}
                    ariaLabel={copie ? (fr ? 'Ouvrir le bordereau' : 'Open the label') : (fr ? 'Récupérer le bordereau' : 'Fetch the label')}>
                    <Icone nom="recu" taille={17} couleur={attente || occupee === c.id ? '#8A8578' : '#FFFFFF'} epaisseur={2.2} />
                    {copie ? (fr ? 'Ouvrir le bordereau' : 'Open the label') : attente ? (fr ? 'Récupération…' : 'Fetching…') : action.libelle}
                  </Bouton>
                  <Bouton onClick={() => ouvrirLien(action.url)} ariaLabel={fr ? `Voir sur ${nomPlateforme(c.platform)}` : `See on ${nomPlateforme(c.platform)}`}>
                    {fr ? `Voir sur ${nomPlateforme(c.platform)}` : `See on ${nomPlateforme(c.platform)}`}
                  </Bouton>
                </>
              ) : (
                <Bouton principal={action.ton === 'ambre'} onClick={() => ouvrirLien(action.url)} ariaLabel={action.libelle}>
                  {action.libelle}<Icone nom="fleche" taille={16} couleur={action.ton === 'ambre' ? '#FFFFFF' : UI.ink} epaisseur={2.2} />
                </Bouton>
              )}
            </div>
            {copie && <div style={{ fontSize: 12, color: ENCRE2 }}>{fr ? `Copie gardée jusqu’au ${dateCourte(copie.expire_le, lang)}, puis effacée.` : `Copy kept until ${dateCourte(copie.expire_le, lang)}, then erased.`}</div>}
            {etatD && <div role="status" style={{ fontSize: 12.5, fontWeight: 600, color: (TONS[etatD.ton] ?? TONS.neutre).encre }}>{etatD.texte}</div>}
            {notes[c.id] && <div role="status" style={{ fontSize: 12.5, fontWeight: 600, color: '#8A6100' }}>{notes[c.id]}</div>}
          </article>
        );
      })}
    </section>
  );
}

export default SectionAExpedier;
