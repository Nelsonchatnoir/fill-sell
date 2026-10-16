// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES — TOUTES PLATEFORMES — BÊTA (16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Écran MINIMAL pour valider la donnée (Nico seul, drapeau
// beta_flags.messages_bordereaux) : la liste des conversations des 30
// derniers jours, une conversation et ses messages, une zone de réponse.
// La réponse est ENREGISTRÉE (messagerie_repondre) mais ne part que vers une
// conversation de la liste blanche (vide au 16/10) : l'écran le dit.
// Ouvrir une conversation ici ne la marque PAS lue chez la plateforme
// (messagerie_vue ne touche que FillSell).
// Pas de design final : Claude fera les maquettes à partir du rapport.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, Send, MessageCircle, Package, Lock } from 'lucide-react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { S, OMBRE } from '../stock/jetons';
import { conversationNonLue, dateCourte, etatReponse, montantTexte, nomPlateforme, trierConversations } from './vue';
import SectionAExpedier from './SectionAExpedier';

const COLS_CONV = 'id,platform,conversation_ref,interlocuteur_pseudo,annonce_ref,inventaire_id,titre_annonce,photo_annonce,cote,systeme,dernier_message_le,dernier_extrait,non_lus,reponse_possible,offre_montant,offre_devise,offre_statut,vu_dans_app_le,cree_le';
const COLS_MSG = 'id,message_ref,sens,type,texte,offre_montant,offre_devise,offre_statut,envoye_le';
const COLS_REP = 'id,texte,statut,motif,cree_le,fini_le';

function cle() {
  try { return crypto.randomUUID(); } catch { return `r-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function Bulle({ m, lang }) {
  const fr = lang !== 'en';
  const moi = m.sens === 'envoye';
  const plateforme = m.sens === 'plateforme';
  const texte = m.type === 'offre'
    ? `${fr ? 'Offre' : 'Offer'} ${montantTexte(m.offre_montant, m.offre_devise) ?? ''}${m.offre_statut ? ` · ${m.offre_statut}` : ''}`
    : m.type === 'favori' ? (fr ? 'A mis l’annonce en favori.' : 'Added the listing to favourites.')
    : (m.texte ?? (fr ? '(message sans texte)' : '(no text)'));
  return (
    <div style={{ alignSelf: plateforme ? 'center' : (moi ? 'flex-end' : 'flex-start'), maxWidth: plateforme ? '92%' : '80%' }}>
      <div style={{
        padding: plateforme ? '6px 10px' : '8px 12px', borderRadius: 14, fontSize: plateforme ? 12 : 14, lineHeight: '20px',
        background: plateforme ? S.paper : (moi ? S.menthe : '#FFFFFF'), border: `1px solid ${plateforme ? S.borderSoft : (moi ? S.mentheBord : S.border)}`,
        color: plateforme ? S.ink2 : S.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}>{texte}</div>
      <div style={{ fontSize: 11, color: S.chevron, marginTop: 2, textAlign: moi ? 'right' : 'left' }}>{dateCourte(m.envoye_le, lang)}</div>
    </div>
  );
}

function Conversation({ supabase, conv, lang, onRetour, onVue }) {
  const fr = lang !== 'en';
  const [messages, setMessages] = useState(null);
  const [reponses, setReponses] = useState([]);
  const [blanche, setBlanche] = useState(false);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    const [m, r, lb] = await Promise.all([
      supabase.from('messagerie_messages').select(COLS_MSG).eq('conversation_id', conv.id).order('envoye_le', { ascending: true }).limit(200),
      supabase.from('messagerie_reponses').select(COLS_REP).eq('conversation_id', conv.id).order('cree_le', { ascending: true }).limit(50),
      supabase.from('messagerie_liste_blanche').select('conversation_ref').eq('platform', conv.platform).eq('conversation_ref', conv.conversation_ref).limit(1),
    ]);
    setMessages(m.error ? [] : (m.data ?? []));
    setReponses(r.error ? [] : (r.data ?? []));
    setBlanche(!lb.error && (lb.data ?? []).length > 0);
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

  const repondre = async () => {
    const t = texte.trim();
    if (!t || envoi) return;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${S.border}` }}>
        <button type="button" onClick={onRetour} aria-label={fr ? 'Retour' : 'Back'} style={{ width: 40, height: 40, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <PlatformLogo platform={conv.platform} size={20} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: S.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.interlocuteur_pseudo ? `@${conv.interlocuteur_pseudo}` : nomPlateforme(conv.platform)}
          </div>
          <div style={{ fontSize: 12, color: S.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[conv.titre_annonce, conv.inventaire_id ? (fr ? 'article de ton stock' : 'item in your stock') : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: S.page }}>
        {messages === null && <p style={{ fontSize: 13, color: S.ink2 }}>{fr ? 'Chargement…' : 'Loading…'}</p>}
        {messages?.length === 0 && <p style={{ fontSize: 13, color: S.ink2 }}>{fr ? 'Les messages de cette conversation arriveront au prochain relevé de ton extension.' : 'Messages will arrive with your extension’s next pass.'}</p>}
        {messages?.map((m) => <Bulle key={m.id} m={m} lang={lang} />)}
        {reponses.map((r) => {
          const e = etatReponse(r, lang);
          return (
            <div key={r.id} style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
              <div style={{ padding: '8px 12px', borderRadius: 14, fontSize: 14, background: S.menthe, border: `1px dashed ${S.mentheBord}`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: S.ink }}>{r.texte}</div>
              <div style={{ fontSize: 11, marginTop: 2, textAlign: 'right', color: e.ton === 'rouge' ? S.rouge : e.ton === 'ambre' ? S.ambreEncre : S.ink2 }}>{e.texte}</div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${S.border}`, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, background: '#FFFFFF' }}>
        {!blanche && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: S.ambreEncre }}>
            <Lock size={13} aria-hidden="true" />
            {fr ? 'Bêta : l’envoi est verrouillé (seules les conversations de la liste blanche partent).' : 'Beta: sending is locked (only whitelisted conversations go out).'}
          </div>
        )}
        {conv.reponse_possible === false && (
          <div style={{ fontSize: 12, color: S.ink2 }}>{fr ? 'La plateforme ne permet pas de répondre à cette conversation.' : 'The platform does not allow replies here.'}</div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value.slice(0, 2000))} rows={2}
            placeholder={fr ? 'Écrire une réponse…' : 'Write a reply…'} aria-label={fr ? 'Réponse' : 'Reply'}
            style={{ flex: 1, resize: 'none', borderRadius: 12, border: `1px solid ${S.border}`, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', minHeight: 44 }} />
          <button type="button" onClick={repondre} disabled={!texte.trim() || envoi || conv.systeme}
            aria-label={fr ? 'Enregistrer la réponse' : 'Save reply'}
            style={{ minWidth: 44, minHeight: 44, borderRadius: 12, border: 'none', background: texte.trim() && !conv.systeme ? S.tealDeep : S.disabled, color: texte.trim() && !conv.systeme ? '#FFFFFF' : S.chevron, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: texte.trim() ? 'pointer' : 'default' }}>
            <Send size={18} />
          </button>
        </div>
        {erreur && <div style={{ fontSize: 12, color: S.rouge }}>{erreur}</div>}
      </div>
    </div>
  );
}

export default function EspaceMessagerie({ supabase, lang = 'fr', ouvert, onFermer, ongletInitial = 'messages', filtreArticle = null, photosParInventaire = null, onChange }) {
  const fr = lang !== 'en';
  // Monté à l'ouverture seulement (App) : l'état initial vient des props.
  const [onglet, setOnglet] = useState(ongletInitial);
  const [conversations, setConversations] = useState(null);
  const [choisie, setChoisie] = useState(null);
  const [article, setArticle] = useState(filtreArticle);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('messagerie_conversations').select(COLS_CONV)
      .order('dernier_message_le', { ascending: false, nullsFirst: false }).limit(200);
    setConversations(error ? [] : trierConversations(data ?? []));
  }, [supabase]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      await Promise.resolve();
      if (vivant && ouvert) await charger();
    })();
    return () => { vivant = false; };
  }, [ouvert, charger]);

  const visibles = useMemo(() => (conversations ?? []).filter((c) => article == null || String(c.inventaire_id) === String(article)), [conversations, article]);

  if (!ouvert) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={fr ? 'Messages' : 'Messages'}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: S.voile, display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}
      onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: S.page, display: 'flex', flexDirection: 'column', boxShadow: OMBRE.feuille, minHeight: 0 }}>
        {choisie ? (
          <Conversation supabase={supabase} conv={choisie} lang={lang} onRetour={() => { setChoisie(null); charger(); }} onVue={onChange} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 8px', borderBottom: `1px solid ${S.border}`, background: '#FFFFFF' }}>
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                {[['messages', fr ? 'Messages' : 'Messages', <MessageCircle key="i" size={15} aria-hidden="true" />], ['expedier', fr ? 'À expédier' : 'To ship', <Package key="i" size={15} aria-hidden="true" />]].map(([k, l, icone]) => (
                  <button key={k} type="button" onClick={() => setOnglet(k)}
                    style={{ minHeight: 40, padding: '0 12px', borderRadius: 999, border: `1px solid ${onglet === k ? S.ink : S.border}`, background: onglet === k ? S.ink : '#FFFFFF', color: onglet === k ? '#FFFFFF' : S.ink, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    {icone}{l}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: S.ambreEncre, background: S.ambreFond, border: `1px solid ${S.ambreBord}`, borderRadius: 999, padding: '1px 8px' }}>{fr ? 'bêta' : 'beta'}</span>
              <button type="button" onClick={onFermer} aria-label={fr ? 'Fermer' : 'Close'} style={{ width: 40, height: 40, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {onglet === 'expedier' ? (
                <SectionAExpedier supabase={supabase} lang={lang} photosParInventaire={photosParInventaire} compact />
              ) : (
                <>
                  {article != null && (
                    <button type="button" onClick={() => setArticle(null)} style={{ alignSelf: 'flex-start', minHeight: 36, padding: '0 10px', borderRadius: 999, border: `1px solid ${S.border}`, background: '#FFFFFF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {fr ? 'Cet article seulement · tout voir' : 'This item only · see all'}
                    </button>
                  )}
                  {conversations === null && <p style={{ fontSize: 13, color: S.ink2 }}>{fr ? 'Chargement…' : 'Loading…'}</p>}
                  {conversations !== null && visibles.length === 0 && (
                    <p style={{ fontSize: 13, color: S.ink2 }}>{fr ? 'Aucune conversation relevée pour l’instant (30 derniers jours). Elles arrivent au prochain relevé de ton extension.' : 'No conversation yet (last 30 days). They arrive with your extension’s next pass.'}</p>
                  )}
                  {visibles.map((c) => {
                    const nonLue = conversationNonLue(c);
                    return (
                      <button key={c.id} type="button" onClick={() => setChoisie(c)}
                        style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', width: '100%', minHeight: 64, padding: 10, borderRadius: 14, border: `1px solid ${S.border}`, background: '#FFFFFF', cursor: 'pointer', opacity: c.systeme ? 0.75 : 1 }}>
                        <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: S.paper, flexShrink: 0 }}>
                          {(c.inventaire_id && photosParInventaire?.[c.inventaire_id]) || c.photo_annonce
                            ? <img src={(c.inventaire_id && photosParInventaire?.[c.inventaire_id]) || c.photo_annonce} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : null}
                          <span style={{ position: 'absolute', bottom: 2, right: 2 }}><PlatformLogo platform={c.platform} size={16} /></span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                            <span style={{ fontSize: 14, fontWeight: nonLue ? 800 : 600, color: S.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {c.interlocuteur_pseudo ? `@${c.interlocuteur_pseudo}` : nomPlateforme(c.platform)}
                            </span>
                            <span style={{ fontSize: 11, color: S.chevron, flexShrink: 0 }}>{dateCourte(c.dernier_message_le, lang)}</span>
                          </div>
                          <div style={{ fontSize: 12, color: S.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.titre_annonce ?? nomPlateforme(c.platform)}</div>
                          <div style={{ fontSize: 12, color: nonLue ? S.ink : S.ink2, fontWeight: nonLue ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.dernier_extrait ?? ''}</div>
                        </div>
                        {nonLue && (
                          <span className="sk-chiffres" style={{ minWidth: 22, height: 22, borderRadius: 999, background: S.tealDeep, color: '#FFFFFF', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{c.non_lus}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
