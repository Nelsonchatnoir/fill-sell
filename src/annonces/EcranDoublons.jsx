// ═══════════════════════════════════════════════════════════════════════════
// « EST-CE LE MÊME ARTICLE ? » — UNE PAIRE À LA FOIS (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// N'arrivent ici que les paires de fiches PROBABLES : deux fiches du stock qui
// désignent peut-être le même objet (le relevé d'une plateforme ou le dressing
// Vinted a créé la seconde sans reconnaître la première). Ce qui était CERTAIN
// est déjà réuni par le serveur et ne passe jamais par cet écran.
//
// ⛔ UN SEUL GESTE PAR RÉPONSE, UN SEUL CHEMIN D'ÉCRITURE : la RPC
//    inventaire_doublon_decider. « Oui » fusionne (inventaire_fusionner : les
//    annonces en ligne des DEUX fiches restent en ligne et se retrouvent sur
//    la fiche gardée — rien n'est retiré, rien n'est déclaré vendu ; la
//    fusion se défait depuis la fiche). « Non » : la paire n'est plus jamais
//    reproposée.
// ⛔ La fiche gardée est choisie par le serveur (celle créée dans l'app, sinon
//    la plus ancienne ; l'annonce Vinted suit l'objet) : c'est dit, pas caché.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { premierePhoto } from '../components/GalleryPhoto';
import { track } from '../analytics/analytics';
import { deciderDoublon, pairesAffichables, raisonsDoublon, origineFiche } from '../utils/doublons';
import { A, DEGRADE, CSS_ANNONCES } from './theme';

const prixLisible = (v, fr) => (v == null || v === '' || !Number.isFinite(Number(v))
  ? null
  : `${Number(v).toLocaleString(fr ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`);

const photoDe = (item) => {
  try { return premierePhoto(item?.photos) ?? null; } catch { return null; }
};

function CarteFiche({ item, fr, garde }) {
  const url = photoDe(item);
  return (
    <div style={{ flex: 1, minWidth: 0, background: A.card, border: `1px solid ${garde ? A.mentheBord : A.border}`, borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {url
        ? <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', border: `1px solid ${A.border}` }} />
        : <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, background: A.paper, border: `1px solid ${A.border}` }} />}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: A.ink, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
        {item?.title || '—'}
      </div>
      <div style={{ fontSize: 11.5, color: A.texteSecondaire, lineHeight: 1.4 }}>
        {[prixLisible(item?.sell, fr), origineFiche(item, fr)].filter(Boolean).join(' · ')}
      </div>
      {garde && (
        <span style={{ alignSelf: 'flex-start', padding: '3px 8px', borderRadius: 999, background: A.menthe, border: `1px solid ${A.mentheBord}`, color: A.tealDeep, fontSize: 10.5, fontWeight: 700 }}>
          {fr ? 'Fiche gardée' : 'Kept item'}
        </span>
      )}
    </div>
  );
}

export default function EcranDoublons({ lang, items, doublons, onClose, onDecision }) {
  const fr = lang !== 'en';
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);
  const [traitees, setTraitees] = useState(() => new Set());

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = useMemo(
    () => pairesAffichables(doublons, items).filter((d) => !traitees.has(d.id)),
    [doublons, items, traitees],
  );
  const paire = file[0] ?? null;

  const repondre = async (decision) => {
    if (!paire || busy) return;
    setBusy(true); setErreur(null);
    const r = await deciderDoublon(paire.id, decision).catch((e) => ({ ok: false, message: String(e?.message ?? e) }));
    setBusy(false);
    if (!r?.ok && r?.reason !== 'deja_tranchee') {
      setErreur(fr ? "Réponse non enregistrée — réessaie dans un instant." : 'Answer not saved — try again in a moment.');
      return;
    }
    track('doublon_decision', { decision });
    setFait(decision === 'oui'
      ? (fr ? `Réunies en une seule fiche : « ${paire.a?.title ?? ''} ». Tu peux défaire la fusion depuis la fiche.` : `Merged into one item: “${paire.a?.title ?? ''}”. You can undo it from the item.`)
      : (fr ? 'Noté : ce sont deux articles différents. On ne te le redemandera pas.' : "Noted: they're two different items. We won't ask again."));
    setTraitees((v) => new Set([...v, paire.id]));
    onDecision?.();
  };

  const raisons = paire ? raisonsDoublon(paire.preuves, fr) : [];

  return createPortal(
    <div onClick={onClose} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: A.canvas, borderRadius: '26px 26px 0 0',
          maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 24px)', boxSizing: 'border-box', fontFamily: 'inherit',
        }}>
        <style>{CSS_ANNONCES}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: A.ink }}>{fr ? 'Est-ce le même article ?' : 'Is it the same item?'}</div>
            {paire && (
              <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 500, color: A.texteSecondaire, fontVariantNumeric: 'tabular-nums' }}>
                {fr ? `1 sur ${file.length}` : `1 of ${file.length}`}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={fr ? 'Fermer' : 'Close'} className="rv-focus"
            style={{ border: 'none', background: 'transparent', fontSize: 20, color: A.texteSecondaire, cursor: 'pointer', lineHeight: 1, minWidth: 44, minHeight: 44 }}>✕</button>
        </div>

        {fait && (
          <div className="rv-up" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 12px', padding: '10px 12px', borderRadius: 12, background: A.menthe, border: `1px solid ${A.mentheBord}` }}>
            <span aria-hidden="true" style={{ color: A.tealDeep, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.45, color: A.ink }}>{fait}</span>
          </div>
        )}
        {erreur && (
          <div style={{ margin: '6px 0 12px', padding: '10px 12px', borderRadius: 12, background: '#FDECEA', border: '1px solid #F3C7C2', fontSize: 12, lineHeight: 1.45, color: A.rougeTexte }}>{erreur}</div>
        )}

        {!paire ? (
          <div className="rv-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 8px 10px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: DEGRADE, color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: A.ink }}>{fr ? 'Plus aucune question' : 'No more questions'}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: A.texteSecondaire, maxWidth: 340 }}>
              {fr ? "Chaque objet de ton stock n'a plus qu'une fiche, ou tu nous as dit lesquels sont différents." : 'Every item in your stock has a single entry, or you told us which ones differ.'}
            </div>
            <button type="button" onClick={onClose} className="rv-cta rv-focus"
              style={{ marginTop: 4, minHeight: 44, padding: '0 22px', borderRadius: 999, border: 'none', background: DEGRADE, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              {fr ? 'Fermer' : 'Close'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: A.texteSecondaire, lineHeight: 1.5, marginBottom: 12 }}>
              {fr
                ? `Ces deux fiches se ressemblent beaucoup${raisons.length ? ` (${raisons.join(', ')})` : ''}. Si c'est le même objet, on les réunit : ses annonces en ligne restent en ligne, rien n'est retiré.`
                : `These two items look alike${raisons.length ? ` (${raisons.join(', ')})` : ''}. If they're the same object, we merge them: its online listings stay online, nothing is removed.`}
            </div>
            <div className="rv-up" style={{ display: 'flex', gap: 10 }}>
              <CarteFiche item={paire.a} fr={fr} garde />
              <CarteFiche item={paire.b} fr={fr} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button type="button" disabled={busy} onClick={() => repondre('oui')} className="rv-cta rv-focus"
                style={{ width: '100%', minHeight: 48, borderRadius: 999, border: 'none', background: DEGRADE, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {fr ? "Oui, c'est le même" : "Yes, it's the same"}
              </button>
              <button type="button" disabled={busy} onClick={() => repondre('non')} className="rv-focus"
                style={{ width: '100%', minHeight: 46, borderRadius: 999, border: `1px solid ${A.border}`, background: A.card, color: A.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                {fr ? 'Non, ce sont deux articles' : "No, they're two items"}
              </button>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: A.texteSecondaire, textAlign: 'center' }}>
                {fr ? 'La fusion se défait depuis la fiche gardée.' : 'A merge can be undone from the kept item.'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
