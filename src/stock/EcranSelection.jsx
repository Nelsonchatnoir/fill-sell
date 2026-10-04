// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LA SÉLECTION PRÉ-COCHÉE (planche : écran 09 « Remonter mes annonces »)
// ═══════════════════════════════════════════════════════════════════════════
// Le même écran sert les deux gestes de lot du haut du Stock :
//   · Remonter — les annonces qui perdent en visibilité ; le bouton ouvre la
//     feuille de republication EXISTANTE (RepublishSheet : plateformes, prix,
//     avertissements) — une seule logique de republication, au même endroit ;
//   · Publier — les articles pas encore partout ; le bouton ouvre la
//     publication en lot EXISTANTE (LotPublication), plafonnée comme avant.
// Tout est coché d'office ; on décoche ce qu'on garde. UN seul bouton.
// ⛔ Rien ne part de cet écran : il ne fait que CHOISIR. Les gardes (palier,
//    maintenance, quota, extension) restent celles du geste qu'il ouvre.
import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import EcranPlein from './EcranPlein';
import GalleryPhoto from '../components/GalleryPhoto';
import { PileLogos } from './Carte';
import { S, OMBRE, DEGRADE } from './jetons';
import { nombreFr } from './regles';

const PREMIERS = 4;

function LigneChoix({ lang, a, coche, onBasculer, separateur }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, minHeight: 64, padding: '8px 16px 8px 4px', boxSizing: 'border-box',
      background: separateur ? `linear-gradient(${S.borderSoft},${S.borderSoft}) 56px 100% / calc(100% - 57px) 1px no-repeat` : 'transparent',
    }}>
      <button type="button" role="checkbox" aria-checked={coche} aria-label={a.titre} className="sk-btn" onClick={onBasculer}
        style={{ width: 44, height: 44, padding: 0, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, boxSizing: 'border-box', background: coche ? S.tealDeep : '#FFFFFF', border: coche ? 'none' : `1.5px solid ${S.border}`, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {coche && <Check size={16} strokeWidth={3} aria-hidden="true" />}
        </span>
      </button>
      <span style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: S.paper }}>
        <GalleryPhoto url={a.photo} alt="" fallback={<span />} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </span>
      <div onClick={onBasculer} style={{ flex: 1, minWidth: 0, marginLeft: 4, cursor: 'pointer' }}>
        <div className="sk-une-ligne" style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>{a.titre}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 16, marginTop: 4 }}>
          <PileLogos lang={lang} plateformes={a.logos ?? []} />
          {a.ligne2 && <span className="sk-une-ligne" style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{a.ligne2}</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {object} p
 *   p.articles [{id, titre, photo, logos, ligne2}]
 *   p.initiale — Set d'ids cochés à l'ouverture (tout, au plafond près)
 *   p.max — plafond de sélection (null = aucun)
 *   p.bouton(n) → libellé ; p.onConfirmer(ids)
 *   p.apres — élément sous la liste (ex. la republication automatique)
 */
export default function EcranSelection({
  lang = 'fr', titre, grandTitre, sousTitre, articles = [], initiale = null, max = null,
  bouton, onConfirmer, note = null, apres = null, vide = null, onFermer, actif = true,
}) {
  const fr = lang !== 'en';
  const [sel, setSel] = useState(() => new Set(initiale ?? articles.slice(0, max ?? articles.length).map((a) => a.id)));
  const [tout, setTout] = useState(false);
  const n = articles.filter((a) => sel.has(a.id)).length;
  const auPlafond = max != null && n >= max;
  const basculer = (id) => setSel((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id);
    else if (max == null || n < max) s.add(id);
    return s;
  });
  const toutCoche = n > 0 && n === Math.min(articles.length, max ?? articles.length);
  const visibles = useMemo(() => (tout ? articles : articles.slice(0, PREMIERS)), [tout, articles]);
  const reste = articles.length - visibles.length;

  return (
    <EcranPlein lang={lang} titre={titre} onFermer={onFermer} actif={actif}
      pied={articles.length ? (
        <>
          <button type="button" className="sk-btn sk-presse" disabled={!n} onClick={() => onConfirmer?.(articles.filter((a) => sel.has(a.id)).map((a) => a.id))}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 48, padding: 0, border: 'none', borderRadius: 14, background: n ? DEGRADE : S.disabled, color: n ? '#FFFFFF' : S.ink2, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: n ? OMBRE.tuile : 'none' }}>
            {bouton?.icone ? <bouton.icone size={20} strokeWidth={2.2} aria-hidden="true" /> : null}
            {n ? bouton?.libelle?.(n) : (fr ? 'Coche au moins un article' : 'Tick at least one item')}
          </button>
          {note && <div style={{ marginTop: 8, fontSize: 12, lineHeight: '20px', fontWeight: 500, color: S.ink2, textAlign: 'center' }}>{note}</div>}
        </>
      ) : null}>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>{grandTitre}</div>
        {sousTitre && <div style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>{sousTitre}</div>}
      </div>

      {articles.length > 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 40, marginTop: 16 }}>
            <span className="sk-chiffres" style={{ flex: 1, fontSize: 13, fontWeight: 700, color: S.ink }}>
              {fr ? `${nombreFr(n, lang)} sélectionné${n > 1 ? 's' : ''}` : `${n} selected`}
              {auPlafond && max != null && articles.length > max && (
                <span style={{ fontWeight: 500, color: S.ink2 }}>{fr ? ` · ${max} au plus par lot` : ` · at most ${max} per batch`}</span>
              )}
            </span>
            <button type="button" className="sk-btn" onClick={() => setSel(toutCoche ? new Set() : new Set(articles.slice(0, max ?? articles.length).map((a) => a.id)))}
              style={{ height: 40, marginRight: -8, padding: '0 8px', border: 'none', background: 'transparent', color: S.tealDeep, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {toutCoche ? (fr ? 'Tout décocher' : 'Untick all') : (fr ? 'Tout cocher' : 'Tick all')}
            </button>
          </div>
          <div style={{ marginTop: 8, borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `${OMBRE.carte}, inset 0 0 0 1px ${S.border}` }}>
            {visibles.map((a, k) => (
              <LigneChoix key={a.id} lang={lang} a={a} coche={sel.has(a.id)} onBasculer={() => basculer(a.id)} separateur={k < visibles.length - 1 || reste > 0} />
            ))}
            {reste > 0 && (
              <button type="button" className="sk-btn" onClick={() => setTout(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 48, padding: 0, border: 'none', background: 'transparent', color: S.tealDeep, fontSize: 13, fontWeight: 700 }}>
                {fr ? `Voir ${reste > 1 ? `les ${nombreFr(reste, lang)} autres` : "l'autre"}` : `See the other ${reste}`}<ChevronDown size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      ) : vide}

      {apres && <div style={{ marginTop: 16 }}>{apres}</div>}
    </EcranPlein>
  );
}
