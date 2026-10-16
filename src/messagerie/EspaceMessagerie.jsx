// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES — TOUTES PLATEFORMES — BÊTA (16/10/2026, clôture le soir)
// ═══════════════════════════════════════════════════════════════════════════
// Compte porteur du drapeau beta_flags.messages_bordereaux seulement. Style
// des écrans du 16/10 (cartes blanches, segments, Space Grotesk).
//   · la liste des conversations des 30 derniers jours, toutes plateformes,
//     filtrable par plateforme ; ce qui EMPÊCHE une lecture est dit en tête
//     (messagerie_releves : Beebs sans téléphone vérifié, session absente,
//     pause de sécurité) au lieu d'une liste vide ;
//   · une conversation : messages, offre, article de ton stock ; ouvrir ici ne
//     la marque PAS lue chez la plateforme (messagerie_vue ne touche que FillSell) ;
//   · la réponse est ENREGISTRÉE (messagerie_repondre) mais ne part que vers
//     une conversation de la liste blanche : l'écran dit « verrouillé » ou
//     « envoi actif », puis l'état de chaque réponse.
// Relectures bornées (utils/relectureBornee.js), jamais de setInterval.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { UI } from '../components/ui';
import Icone from '../ecrans/Icone';
import { demarrerRelecture } from '../utils/relectureBornee';
import { Send } from 'lucide-react';
import { conversationNonLue, dateCourte, etatReponse, etatZoneReponse, lienConversation, montantTexte, murReleve, nomPlateforme, ORDRE_PLATEFORMES, pseudoAffiche, trierConversations } from './vue';
import { ouvrirLien } from './ouvrir';
import SectionAExpedier from './SectionAExpedier';

const ENCRE2 = '#5C6560';
const LIGNE = '#EFECE6';
const MENTHE = '#E6F1EE';
const TONS = Object.freeze({
  ok: { fond: MENTHE, encre: '#1B6E62', bord: '#D6E2DE' },
  ambre: { fond: '#FFF6E3', encre: '#8A6100', bord: '#EED9A6' },
  rouge: { fond: '#FEF2F2', encre: '#B91C1C', bord: '#FECACA' },
  neutre: { fond: '#F6F5F1', encre: ENCRE2, bord: UI.border },
});
const COLS_CONV = 'id,platform,conversation_ref,interlocuteur_pseudo,annonce_ref,inventaire_id,titre_annonce,photo_annonce,cote,systeme,dernier_message_le,dernier_extrait,non_lus,reponse_possible,offre_montant,offre_devise,offre_statut,commande_ref,vu_dans_app_le,cree_le';
const COLS_MSG = 'id,message_ref,sens,type,texte,offre_montant,offre_devise,offre_statut,envoye_le';
const COLS_REP = 'id,texte,statut,motif,cree_le,fini_le';
const POLICE = "'Space Grotesk',sans-serif";

function cle() {
  try { return crypto.randomUUID(); } catch { return `r-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function Segments({ valeur, onChange, options }) {
  return (
    <div role="tablist" style={{ display: 'flex', padding: 4, borderRadius: 18, background: '#ECE9E2', gap: 2, flex: 1, minWidth: 0 }}>
      {options.map(([k, libelle, compte]) => {
        const on = k === valeur;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)}
            style={{ flex: 1, minWidth: 0, height: 36, border: 0, borderRadius: 14, background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 2px 6px rgba(16,32,27,.08)' : 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 600, color: on ? UI.ink : ENCRE2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {libelle}
            {compte > 0 && <span className="sk-chiffres" style={{ minWidth: 20, height: 20, borderRadius: 999, background: k === 'expedier' ? '#E0A53C' : UI.tealDeep, color: '#FFFFFF', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{compte}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Mur({ mur }) {
  const t = TONS[mur.ton] ?? TONS.neutre;
  return (
    <div role="status" style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 18, background: t.fond, border: `1px solid ${t.bord}` }}>
      <span style={{ width: 34, height: 34, borderRadius: 11, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icone nom={mur.cle === 'telephone' ? 'telephone' : mur.cle === 'pause' ? 'horloge' : 'alerte'} taille={18} couleur={t.encre} epaisseur={2.2} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: t.encre }}>{mur.titre}</span>
        <span style={{ fontSize: 13, lineHeight: 1.45, color: UI.ink }}>{mur.texte}</span>
        {mur.action && (
          <button type="button" onClick={() => ouvrirLien(mur.action.url)}
            style={{ alignSelf: 'flex-start', marginTop: 4, minHeight: 40, padding: '0 14px', borderRadius: 12, border: `1px solid ${t.bord}`, background: '#FFFFFF', color: UI.ink, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            {mur.action.libelle}<Icone nom="fleche" taille={15} couleur={UI.ink} epaisseur={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

function Bulle({ m, lang }) {
  const fr = lang !== 'en';
  const moi = m.sens === 'envoye';
  const plateforme = m.sens === 'plateforme';
  const texte = m.type === 'offre'
    ? `${fr ? 'Offre' : 'Offer'} ${montantTexte(m.offre_montant, m.offre_devise) ?? ''}${m.offre_statut ? ` · ${m.offre_statut}` : ''}`
    : m.type === 'favori' ? (fr ? 'A mis l’annonce en favori.' : 'Added the listing to favourites.')
    : (m.texte ?? (fr ? '(photo ou message sans texte)' : '(photo or message without text)'));
  return (
    <div style={{ alignSelf: plateforme ? 'center' : (moi ? 'flex-end' : 'flex-start'), maxWidth: plateforme ? '92%' : '82%' }}>
      <div style={{
        padding: plateforme ? '6px 12px' : '9px 13px', borderRadius: plateforme ? 999 : (moi ? '18px 18px 6px 18px' : '18px 18px 18px 6px'),
        fontSize: plateforme ? 12.5 : 14.5, lineHeight: 1.4,
        background: plateforme ? '#F2F0E9' : (moi ? MENTHE : '#FFFFFF'), border: plateforme ? 'none' : `1px solid ${moi ? '#D6E2DE' : UI.border}`,
        color: plateforme ? ENCRE2 : UI.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}>{texte}</div>
      <div style={{ fontSize: 11, color: '#8A918E', marginTop: 3, textAlign: plateforme ? 'center' : (moi ? 'right' : 'left') }}>{dateCourte(m.envoye_le, lang)}</div>
    </div>
  );
}

function Vignette({ photo, platform, taille = 52 }) {
  return (
    <div style={{ position: 'relative', width: taille, height: taille, borderRadius: 14, overflow: 'hidden', background: '#F2F0E9', flex: 'none' }}>
      {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icone nom="recu" taille={20} couleur="#B5B0A3" epaisseur={1.8} /></span>}
      <span style={{ position: 'absolute', right: 3, bottom: 3, width: 20, height: 20, borderRadius: 7, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(16,32,27,.18)' }}>
        <PlatformLogo platform={platform} size={14} />
      </span>
    </div>
  );
}

function Conversation({ supabase, conv, lang, photo, onRetour, onVue }) {
  const fr = lang !== 'en';
  const [messages, setMessages] = useState(null);
  const [reponses, setReponses] = useState([]);
  const [blanche, setBlanche] = useState(false);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const finRef = useRef(null);

  const charger = useCallback(async () => {
    const [m, r, lb] = await Promise.all([
      supabase.from('messagerie_messages').select(COLS_MSG).eq('conversation_id', conv.id).order('envoye_le', { ascending: true }).limit(200),
      supabase.from('messagerie_reponses').select(COLS_REP).eq('conversation_id', conv.id).order('cree_le', { ascending: true }).limit(50),
      supabase.from('messagerie_liste_blanche').select('conversation_ref').eq('platform', conv.platform).eq('conversation_ref', conv.conversation_ref).limit(1),
    ]);
    setMessages(m.error ? [] : (m.data ?? []));
    const reps = r.error ? [] : (r.data ?? []);
    setReponses(reps);
    setBlanche(!lb.error && (lb.data ?? []).length > 0);
    return undefined;
  }, [supabase, conv.id, conv.platform, conv.conversation_ref]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      await Promise.resolve();
      if (vivant) await charger();
    })();
    supabase.rpc('messagerie_vue', { p_conversation: conv.id }).then(() => onVue?.()).catch(() => {});
    return () => { vivant = false; };
  }, [charger, supabase, conv.id, onVue]);

  // Une réponse attend l'extension : relecture bornée (10 s, 5 min au plus).
  const attente = reponses.some((r) => r.statut === 'en_attente' || r.statut === 'en_cours');
  useEffect(() => {
    if (!attente) return undefined;
    const rel = demarrerRelecture(charger, { intervalleMs: 10_000, maxMs: 60_000, immediat: false });
    const fin = setTimeout(() => rel.arreter(), 5 * 60_000);
    return () => { clearTimeout(fin); rel.arreter(); };
  }, [attente, charger]);

  useEffect(() => { finRef.current?.scrollIntoView?.({ block: 'end' }); }, [messages, reponses]);

  const zone = etatZoneReponse(conv, blanche, lang);
  const repondre = async () => {
    const t = texte.trim();
    if (!t || envoi || !zone.possible) return;
    setEnvoi(true); setErreur(null);
    const { error } = await supabase.rpc('messagerie_repondre', { p_conversation: conv.id, p_texte: t, p_cle: cle() });
    setEnvoi(false);
    if (error) { setErreur(fr ? 'Réponse non enregistrée. Réessaie.' : 'Reply not saved. Try again.'); return; }
    setTexte('');
    // eBay se répond par le serveur : on lui demande tout de suite d'essayer
    // (il ne part QUE vers une conversation de la liste blanche).
    if (conv.platform === 'ebay') supabase.functions.invoke('ebay-messagerie', { body: { mode: 'envoyer' } }).catch(() => {});
    charger();
  };
  const tz = TONS[zone.ton] ?? TONS.neutre;
  const sousTitre = [nomPlateforme(conv.platform), conv.titre_annonce].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontFamily: POLICE, color: UI.ink }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${LIGNE}`, background: '#FFFFFF' }}>
        <button type="button" onClick={onRetour} aria-label={fr ? 'Retour' : 'Back'}
          style={{ width: 44, height: 44, border: 'none', borderRadius: 12, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <Icone nom="retour" taille={20} couleur={UI.ink} epaisseur={2.2} />
        </button>
        <Vignette photo={photo} platform={conv.platform} taille={42} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pseudoAffiche(conv.platform, conv.interlocuteur_pseudo) ?? nomPlateforme(conv.platform)}
          </div>
          <div style={{ fontSize: 12.5, color: ENCRE2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sousTitre}</div>
        </div>
        {lienConversation(conv) && (
          <button type="button" onClick={() => ouvrirLien(lienConversation(conv))} aria-label={fr ? `Ouvrir sur ${nomPlateforme(conv.platform)}` : `Open on ${nomPlateforme(conv.platform)}`}
            style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, background: '#FFFFFF', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: UI.ink, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', flex: 'none' }}>
            {fr ? 'Ouvrir' : 'Open'}<Icone nom="fleche" taille={14} couleur={UI.ink} epaisseur={2.2} />
          </button>
        )}
      </div>
      {(conv.inventaire_id || conv.offre_montant != null) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 14px', borderBottom: `1px solid ${LIGNE}`, background: '#FFFFFF' }}>
          {conv.inventaire_id ? <span style={{ fontSize: 12, fontWeight: 700, color: '#1B6E62', background: MENTHE, borderRadius: 999, padding: '3px 10px' }}>{fr ? 'Article de ton stock' : 'Item in your stock'}</span> : null}
          {conv.offre_montant != null ? <span style={{ fontSize: 12, fontWeight: 700, color: '#8A6100', background: '#FFF6E3', borderRadius: 999, padding: '3px 10px' }}>{fr ? 'Offre' : 'Offer'} {montantTexte(conv.offre_montant, conv.offre_devise)}{conv.offre_statut ? ` · ${conv.offre_statut}` : ''}</span> : null}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: '#FAFBFB' }}>
        {messages === null && <p style={{ fontSize: 13, color: ENCRE2 }}>{fr ? 'Chargement…' : 'Loading…'}</p>}
        {messages?.length === 0 && <p style={{ fontSize: 13, color: ENCRE2, lineHeight: 1.45 }}>{fr ? 'Les messages de cette conversation arrivent au prochain relevé de ton extension, ordinateur allumé.' : 'Messages arrive with your extension’s next read, computer on.'}</p>}
        {messages?.map((m) => <Bulle key={m.id} m={m} lang={lang} />)}
        {reponses.map((r) => {
          const e = etatReponse(r, lang);
          const t = TONS[e.ton] ?? TONS.neutre;
          return (
            <div key={r.id} style={{ alignSelf: 'flex-end', maxWidth: '82%' }}>
              <div style={{ padding: '9px 13px', borderRadius: '18px 18px 6px 18px', fontSize: 14.5, lineHeight: 1.4, background: '#FFFFFF', border: `1.5px dashed ${t.bord}`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: UI.ink }}>{r.texte}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 3, textAlign: 'right', color: t.encre }}>{e.texte}</div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>
      <div style={{ borderTop: `1px solid ${LIGNE}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#FFFFFF' }}>
        <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 12, background: tz.fond, color: tz.encre, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>
          <Icone nom={zone.verrouillee ? 'alerte' : zone.possible ? 'coche' : 'croix'} taille={15} couleur={tz.encre} epaisseur={2.3} style={{ flex: 'none', marginTop: 1 }} />
          <span>{zone.texte}</span>
        </div>
        {zone.possible && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea value={texte} onChange={(e) => setTexte(e.target.value.slice(0, 2000))} rows={2}
              placeholder={fr ? 'Écrire une réponse…' : 'Write a reply…'} aria-label={fr ? 'Réponse' : 'Reply'}
              style={{ flex: 1, resize: 'none', borderRadius: 14, border: `1px solid ${UI.border}`, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', minHeight: 48, color: UI.ink, background: '#FFFFFF' }} />
            <button type="button" onClick={repondre} disabled={!texte.trim() || envoi}
              aria-label={zone.verrouillee ? (fr ? 'Enregistrer la réponse (verrouillée)' : 'Save reply (locked)') : (fr ? 'Envoyer la réponse' : 'Send reply')}
              style={{ width: 48, height: 48, borderRadius: 14, border: 'none', background: texte.trim() && !envoi ? UI.tealDeep : '#ECE9E2', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: texte.trim() ? 'pointer' : 'default', flex: 'none' }}>
              <Send size={19} strokeWidth={2.2} color={texte.trim() && !envoi ? '#FFFFFF' : '#8A8578'} aria-hidden="true" />
            </button>
          </div>
        )}
        {erreur && <div style={{ fontSize: 12.5, color: '#B91C1C' }}>{erreur}</div>}
      </div>
    </div>
  );
}

export default function EspaceMessagerie({ supabase, lang = 'fr', ouvert, onFermer, ongletInitial = 'messages', filtreArticle = null, photosParInventaire = null, onChange, aExpedier = 0 }) {
  const fr = lang !== 'en';
  // Monté à l'ouverture seulement (App) : l'état initial vient des props.
  const [onglet, setOnglet] = useState(ongletInitial);
  const [conversations, setConversations] = useState(null);
  const [releves, setReleves] = useState([]);
  const [choisie, setChoisie] = useState(null);
  const [article, setArticle] = useState(filtreArticle);
  const [plateforme, setPlateforme] = useState(null);

  const charger = useCallback(async () => {
    const [c, r] = await Promise.all([
      supabase.from('messagerie_conversations').select(COLS_CONV).order('dernier_message_le', { ascending: false, nullsFirst: false }).limit(200),
      supabase.from('messagerie_releves').select('platform,dernier_le,dernier_motif,pause_jusqu_au').limit(10),
    ]);
    setConversations(c.error ? [] : trierConversations(c.data ?? []));
    setReleves(r.error ? [] : (r.data ?? []));
  }, [supabase]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      await Promise.resolve();
      if (vivant && ouvert) await charger();
    })();
    return () => { vivant = false; };
  }, [ouvert, charger]);

  const murs = useMemo(() => releves.map((r) => murReleve(r, lang)).filter(Boolean)
    .sort((a, b) => Number(b.cle === 'telephone') - Number(a.cle === 'telephone')), [releves, lang]);
  const parArticle = useMemo(() => (conversations ?? []).filter((c) => article == null || String(c.inventaire_id) === String(article)), [conversations, article]);
  const presentes = useMemo(() => ORDRE_PLATEFORMES.filter((p) => parArticle.some((c) => c.platform === p)), [parArticle]);
  const visibles = useMemo(() => parArticle.filter((c) => plateforme == null || c.platform === plateforme), [parArticle, plateforme]);
  const personnes = visibles.filter((c) => !c.systeme);
  const systemes = visibles.filter((c) => c.systeme);
  const nonLues = (conversations ?? []).filter(conversationNonLue).length;
  const photoDe = (c) => (c.inventaire_id && photosParInventaire?.[c.inventaire_id]) || c.photo_annonce || null;

  if (!ouvert) return null;
  const ligne = (c, i) => {
    const nonLue = conversationNonLue(c);
    return (
      <button key={c.id} type="button" onClick={() => setChoisie(c)} data-conversation={c.platform}
        style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', width: '100%', minHeight: 72, padding: '12px 14px', border: 'none', borderTop: i ? `1px solid ${LIGNE}` : 'none', background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', color: UI.ink, opacity: c.systeme ? 0.8 : 1 }}>
        <Vignette photo={photoDe(c)} platform={c.platform} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 14.5, fontWeight: nonLue ? 800 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {pseudoAffiche(c.platform, c.interlocuteur_pseudo) ?? nomPlateforme(c.platform)}
            </span>
            <span style={{ fontSize: 11.5, color: nonLue ? '#1B6E62' : '#8A918E', fontWeight: nonLue ? 700 : 500, flexShrink: 0 }}>{dateCourte(c.dernier_message_le, lang)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: ENCRE2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[c.titre_annonce ?? nomPlateforme(c.platform), c.inventaire_id ? (fr ? 'dans ton stock' : 'in your stock') : null].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: nonLue ? UI.ink : ENCRE2, fontWeight: nonLue ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.dernier_extrait ?? ''}</span>
            {nonLue && <span className="sk-chiffres" style={{ minWidth: 22, height: 22, borderRadius: 999, background: UI.tealDeep, color: '#FFFFFF', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 }}>{c.non_lus}</span>}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={fr ? 'Messages' : 'Messages'}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(16,32,27,0.45)', display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}
      onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#FAFBFB', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(16,32,27,0.22)', minHeight: 0, fontFamily: POLICE, color: UI.ink }}>
        {choisie ? (
          <Conversation supabase={supabase} conv={choisie} lang={lang} photo={photoDe(choisie)} onRetour={() => { setChoisie(null); charger(); }} onVue={onChange} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 10px', background: '#FFFFFF', borderBottom: `1px solid ${LIGNE}` }}>
              <Segments valeur={onglet} onChange={setOnglet}
                options={[['messages', fr ? 'Messages' : 'Messages', nonLues], ['expedier', fr ? 'À expédier' : 'To ship', aExpedier]]} />
              <button type="button" onClick={onFermer} aria-label={fr ? 'Fermer' : 'Close'}
                style={{ width: 44, height: 44, border: 'none', borderRadius: 12, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
                <Icone nom="croix" taille={20} couleur={UI.ink} epaisseur={2.2} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {onglet === 'expedier' ? (
                <SectionAExpedier supabase={supabase} lang={lang} photosParInventaire={photosParInventaire} compact />
              ) : (
                <>
                  {murs.map((m) => <Mur key={`${m.cle}-${m.titre}`} mur={m} />)}
                  {(presentes.length > 1 || article != null) && (
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                      {article != null && (
                        <button type="button" onClick={() => setArticle(null)}
                          style={{ flex: 'none', minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${UI.ink}`, background: UI.ink, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          {fr ? 'Cet article' : 'This item'}<Icone nom="croix" taille={13} couleur="#FFFFFF" epaisseur={2.4} />
                        </button>
                      )}
                      {[null, ...presentes].map((p) => {
                        const on = plateforme === p;
                        return (
                          <button key={p ?? 'tous'} type="button" onClick={() => setPlateforme(p)}
                            style={{ flex: 'none', minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? UI.tealDeep : UI.border}`, background: on ? MENTHE : '#FFFFFF', color: UI.ink, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            {p ? <PlatformLogo platform={p} size={14} /> : null}{p ? nomPlateforme(p) : (fr ? 'Toutes' : 'All')}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {conversations === null && <p style={{ fontSize: 13, color: ENCRE2 }}>{fr ? 'Chargement…' : 'Loading…'}</p>}
                  {conversations !== null && visibles.length === 0 && (
                    <div style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 24, padding: '18px 16px', display: 'flex', gap: 12 }}>
                      <span style={{ width: 36, height: 36, borderRadius: 11, background: MENTHE, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                        <Icone nom="cloche" taille={18} couleur={UI.tealDeep} epaisseur={2.1} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 700 }}>{fr ? 'Aucune conversation pour l’instant' : 'No conversation yet'}</span>
                        <span style={{ fontSize: 13, color: ENCRE2, lineHeight: 1.45 }}>{fr ? 'Tes messages Vinted, Leboncoin, Beebs, Depop et eBay arrivent ici, relevés par ton extension (ordinateur allumé) et par eBay.' : 'Your Vinted, Leboncoin, Beebs, Depop and eBay messages arrive here, read by your extension (computer on) and by eBay.'}</span>
                      </span>
                    </div>
                  )}
                  {personnes.length > 0 && (
                    <div style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 24, overflow: 'hidden' }}>
                      {personnes.map(ligne)}
                    </div>
                  )}
                  {systemes.length > 0 && (
                    <>
                      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.11em', color: '#6F7774', textTransform: 'uppercase', padding: '4px 4px 0' }}>{fr ? 'Messages des plateformes' : 'Platform messages'}</span>
                      <div style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 24, overflow: 'hidden' }}>
                        {systemes.map(ligne)}
                      </div>
                    </>
                  )}
                  <p style={{ margin: '2px 4px 0', fontSize: 12, color: '#8A918E', lineHeight: 1.45 }}>
                    {fr ? 'Ouvrir une conversation ici ne la marque pas lue chez la plateforme. Bêta : 30 jours de messages, aucune IA.' : 'Opening a conversation here does not mark it read on the platform. Beta: 30 days of messages, no AI.'}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
