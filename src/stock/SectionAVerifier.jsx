// ── LES FICHES EN DOUTE, VISIBLES AU STOCK (15/10, P16) ─────────────────────
// ferreirasab : 515 fiches « à vérifier » HORS du stock après sa synchro — elle
// ne les voyait nulle part, sinon derrière une ligne de « À régler ». Elles se
// voient désormais dans le Stock, à part, avec leur badge : un tap ouvre SA
// question. Elles ne comptent dans AUCUN total, aucun lot, aucune publication
// tant que la question n'est pas tranchée (elles ne sont pas dans `items`).
import { premierePhoto } from '../components/GalleryPhoto';
import { S } from './jetons';

const MAX_CARTES = 6; // deux rangées de trois sur un téléphone : visibles, sans pousser le stock loin
const prixLisible = (v, fr) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null
  : (fr ? `${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €` : `€${Number(v)}`));

export default function SectionAVerifier({ lang = 'fr', items = [], onOuvrir = null }) {
  const fr = lang !== 'en';
  if (!items.length) return null;
  // les plus chères d'abord, comme l'écran des questions
  const vus = [...items].sort((a, b) => (Number(b?.sell) || 0) - (Number(a?.sell) || 0)).slice(0, MAX_CARTES);
  const actif = typeof onOuvrir === 'function';
  return (
    <section data-zone="a-verifier" aria-label={fr ? 'Articles à vérifier' : 'Items to check'}
      style={{ marginTop: 16, padding: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `0 1px 3px rgba(16,32,27,0.04), inset 0 0 0 1px ${S.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 700, color: S.ink }}>
            {fr ? `À vérifier · ${items.length} article${items.length > 1 ? 's' : ''}` : `To check · ${items.length} item${items.length > 1 ? 's' : ''}`}
          </div>
          <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>
            {fr ? 'Trouvés sur tes plateformes : sont-ils déjà dans ton stock ? Ils ne comptent nulle part tant que tu n\'as pas répondu.'
              : 'Found on your platforms: are they already in your stock? They count nowhere until you answer.'}
          </div>
        </div>
      </div>
      <div role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 8, marginTop: 12 }}>
        {vus.map((it) => {
          const photo = premierePhoto(it.photos);
          const prix = prixLisible(it.sell, fr);
          return (
            <button key={it.id} type="button" role="listitem" className="sk-btn sk-presse" disabled={!actif}
              onClick={() => actif && onOuvrir(it.id)} aria-label={fr ? `À vérifier : ${it.title ?? ''}` : `To check: ${it.title ?? ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', minWidth: 0, padding: 0, border: 'none', borderRadius: 12, overflow: 'hidden', background: S.paper, textAlign: 'left', cursor: actif ? 'pointer' : 'default', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
              <span style={{ position: 'relative', display: 'block', aspectRatio: '1 / 1', background: '#F1EFE8' }}>
                {photo && <img src={photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                <span style={{ position: 'absolute', top: 4, left: 4, padding: '2px 6px', borderRadius: 999, background: S.ambreFond, color: S.ambreEncre, fontSize: 9.5, fontWeight: 700, boxShadow: `inset 0 0 0 1px ${S.ambreBord}` }}>
                  {fr ? 'À vérifier' : 'To check'}
                </span>
              </span>
              <span style={{ padding: '6px 8px' }}>
                <span className="sk-une-ligne" style={{ display: 'block', fontSize: 11.5, lineHeight: '15px', fontWeight: 600, color: S.ink }}>{it.title ?? ''}</span>
                {prix && <span style={{ display: 'block', fontSize: 11.5, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{prix}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {actif && (
        <button type="button" className="sk-btn sk-presse" onClick={() => onOuvrir(null)}
          style={{ width: '100%', minHeight: 44, marginTop: 12, borderRadius: 999, border: `1px solid ${S.border}`, background: '#FFFFFF', color: S.ink, fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>
          {fr ? `Répondre — dix à la fois${items.length > MAX_CARTES ? ` (${items.length} en tout)` : ''}` : `Answer — ten at a time${items.length > MAX_CARTES ? ` (${items.length} in all)` : ''}`}
        </button>
      )}
    </section>
  );
}
