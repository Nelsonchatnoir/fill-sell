// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LA CARTE ET LA LIGNE D'UN ARTICLE (planche : écrans 01, 03)
// ═══════════════════════════════════════════════════════════════════════════
// Composants de PRÉSENTATION : ils reçoivent un article déjà lu par StockTab
// (pastille, logos, action principale calculés avec les fonctions d'avant la
// refonte) et ne décident de rien. Une carte = photo carrée, pastille d'état
// courte, « … », prix et logos (3 au plus, puis « +N »), titre sur 2 lignes,
// marque · vues · favoris, et UNE action principale.
// ⛔ Aucun émoji : icônes Lucide (le seul jeu de l'app), au trait.
// ⛔ Cibles tactiles ≥ 40 px : les logos (16 px) ne sont PAS des boutons —
//    « Gérer les plateformes » vit dans le menu « … ».
import { Ellipsis, Eye, Heart, Upload, ChevronsUp, CircleAlert, BadgeEuro, Check, Package, ChevronRight } from 'lucide-react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import GalleryPhoto from '../components/GalleryPhoto';
import { S, OMBRE, TONS, DEGRADE } from './jetons';
import { pileLogos } from './regles';

const NOMS = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };

// ── LA PILE DE LOGOS — 16 px, chevauchement de 4, liseré blanc de 2 ────────
export function PileLogos({ lang = 'fr', plateformes = [], etats = {}, taille = 16, max = 3 }) {
  const { visibles, reste } = pileLogos(plateformes, max);
  if (!visibles.length) return null;
  const fr = lang !== 'en';
  const noms = plateformes.map((p) => NOMS[p] ?? p);
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} ${fr ? 'et' : 'and'} ${noms[noms.length - 1]}` : noms[0];
  return (
    <span role="img" aria-label={`${fr ? 'En ligne sur' : 'Live on'} ${liste}`} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {visibles.map((p, k) => {
        const e = etats[p] ?? {};
        return (
          <span key={p} style={{
            display: 'flex', marginLeft: k ? -4 : 0, borderRadius: Math.round(taille * 0.28), boxShadow: '0 0 0 2px #FFFFFF',
            opacity: e.attenue ? 0.45 : 1, position: 'relative', zIndex: visibles.length - k,
          }}>
            <PlatformLogo platform={p} size={taille} desature={!!e.desature} />
          </span>
        );
      })}
      {reste > 0 && (
        <span className="sk-chiffres" style={{
          marginLeft: -4, minWidth: taille + 4, height: taille, padding: '0 4px', boxSizing: 'border-box',
          borderRadius: 999, background: S.paper, boxShadow: '0 0 0 2px #FFFFFF', border: `1px solid ${S.border}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9.5, lineHeight: 1, fontWeight: 700, color: S.ink2, position: 'relative',
        }}>+{reste}</span>
      )}
    </span>
  );
}

// ── LA PASTILLE D'ÉTAT — point de 8 px + texte court, jamais coupé ─────────
export function PastilleEtat({ texte, ton = 'neutre', pulse = false, compacte = false }) {
  if (!texte) return null;
  const t = TONS[ton] ?? TONS.neutre;
  return (
    <span data-pastille="1" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, height: compacte ? 16 : 24, padding: compacte ? 0 : '0 8px',
      borderRadius: 999, background: compacte ? 'transparent' : '#FFFFFF', boxShadow: compacte ? 'none' : OMBRE.pastille,
      fontSize: compacte ? 12 : 11, lineHeight: compacte ? '16px' : 1, fontWeight: compacte ? 600 : 700,
      color: compacte ? S.ink2 : t.encre, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span aria-hidden="true" className={pulse ? 'sk-pouls' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', background: t.point, flexShrink: 0 }} />
      {texte}
    </span>
  );
}

// ── L'ACTION PRINCIPALE — 40 px, un seul bouton par carte ──────────────────
const ICONES_ACTION = { regler: CircleAlert, publier: Upload, remonter: ChevronsUp, vendu: BadgeEuro };

export function BoutonAction({ action, libelle, onTap, desactive = false, titre = null, hauteur = 40 }) {
  if (!action) return null;
  const Icone = ICONES_ACTION[action] ?? null;
  const style = action === 'regler'
    ? { background: S.ambreFond, border: `1px solid ${S.ambreBord}`, color: S.ambreEncre }
    : action === 'vendu'
      ? { background: '#FFFFFF', border: `1px solid ${S.border}`, color: S.ink }
      : { background: DEGRADE, border: 'none', color: '#FFFFFF' };
  return (
    <button type="button" className="sk-btn sk-presse" disabled={desactive} title={titre ?? undefined}
      onClick={(e) => { e.stopPropagation(); if (!desactive) onTap?.(); }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: hauteur,
        padding: '0 8px', boxSizing: 'border-box', borderRadius: 12, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
        opacity: desactive ? 0.55 : 1, ...style,
      }}>
      {Icone && <Icone size={16} strokeWidth={action === 'vendu' ? 2 : 2.2} aria-hidden="true" style={action === 'vendu' ? { color: S.tealDeep } : undefined} />}
      {libelle}
    </button>
  );
}

// ── LE REPLI SANS PHOTO — une icône au trait, jamais un émoji ──────────────
function SansPhoto() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.chevron, background: S.paper }}>
      <Package size={32} strokeWidth={1.6} aria-hidden="true" />
    </div>
  );
}

function CaseSelection({ coche, lang }) {
  const fr = lang !== 'en';
  return (
    <span role="img" aria-label={coche ? (fr ? 'Sélectionné' : 'Selected') : (fr ? 'Non sélectionné' : 'Not selected')}
      style={{
        position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 8, boxSizing: 'border-box',
        background: coche ? S.tealDeep : 'rgba(255,255,255,0.92)', border: coche ? 'none' : `1.5px solid ${S.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', boxShadow: OMBRE.bouton,
      }}>
      {coche && <Check size={16} strokeWidth={3} aria-hidden="true" />}
    </span>
  );
}

/**
 * @param {object} p
 *   p.photo, p.titre, p.marque, p.prix (texte « 12,00 € » ou null), p.prixDetail
 *   p.pastille {texte, ton, pulse, titre, onTap}   p.logos {liste, etats}
 *   p.vues, p.favoris (null = inconnu, jamais un faux 0)
 *   p.action {action, libelle, onTap, desactive, titre} | null
 *   p.actionElement — remplace le bouton (ex. « Me connecter » direct)
 *   p.horsLigne — photo désaturée   p.quantite   p.boutique (@login)
 *   p.onOuvrir (tap carte)   p.onMenu (« … »)
 *   p.selection {coche, onBasculer} | null — mode sélection (lot, prix…)
 *   p.bas — barre de progression du job   p.note — message transitoire
 */
export function CarteArticle(p) {
  const fr = p.lang !== 'en';
  const enSelection = !!p.selection;
  const ouvrir = () => { if (enSelection) p.selection.onBasculer?.(); else p.onOuvrir?.(); };
  return (
    <article data-carte={p.id}
      role={enSelection ? 'checkbox' : undefined} aria-checked={enSelection ? !!p.selection.coche : undefined}
      tabIndex={enSelection ? 0 : undefined}
      onKeyDown={enSelection ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ouvrir(); } } : undefined}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 352, minWidth: 0, boxSizing: 'border-box',
        borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: OMBRE.carte,
        outline: `${enSelection && p.selection.coche ? 2 : 1}px solid ${enSelection && p.selection.coche ? S.tealDeep : S.border}`,
        outlineOffset: enSelection && p.selection.coche ? -2 : -1,
      }}>
      {/* La photo : un tap ouvre la fiche (modifier), comme avant la refonte. */}
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: S.paper }}>
        <button type="button" onClick={ouvrir} className="sk-btn" aria-label={enSelection ? p.titre : `${fr ? 'Modifier' : 'Edit'} ${p.titre}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 'none', background: 'transparent', display: 'block' }}>
          <span style={{ display: 'block', width: '100%', height: '100%', ...(p.horsLigne ? { filter: 'grayscale(0.55)', opacity: 0.82 } : null) }}>
            <GalleryPhoto url={p.photo} alt={p.titre} fallback={<SansPhoto />} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>
        </button>
        {p.pastille?.texte && (
          p.pastille.onTap && !enSelection ? (
            <button type="button" className="sk-btn" title={p.pastille.titre ?? undefined} aria-label={p.pastille.titre ?? p.pastille.texte}
              onClick={(e) => { e.stopPropagation(); p.pastille.onTap(); }}
              style={{ position: 'absolute', top: 0, left: 0, maxWidth: '100%', minHeight: 40, padding: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'flex-start' }}>
              <PastilleEtat texte={p.pastille.texte} ton={p.pastille.ton} pulse={p.pastille.pulse} />
            </button>
          ) : (
            <span title={p.pastille.titre ?? undefined} style={{ position: 'absolute', top: 8, left: 8, maxWidth: 'calc(100% - 16px)', display: 'flex', pointerEvents: 'none' }}>
              <PastilleEtat texte={p.pastille.texte} ton={p.pastille.ton} pulse={p.pastille.pulse} />
            </span>
          )
        )}
        {enSelection
          ? <CaseSelection coche={!!p.selection.coche} lang={p.lang} />
          : (p.quantite > 1 && (
            <span className="sk-chiffres" style={{ position: 'absolute', top: 8, right: 8, height: 24, padding: '0 8px', borderRadius: 999, background: '#FFFFFF', boxShadow: OMBRE.pastille, display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: S.ink }}>
              ×{p.quantite}
            </span>
          ))}
        {p.onMenu && !enSelection && (
          <button type="button" aria-label={fr ? 'Plus d’actions' : 'More actions'} className="sk-btn"
            onClick={(e) => { e.stopPropagation(); p.onMenu(); }}
            style={{ position: 'absolute', right: 0, bottom: 0, width: 44, height: 44, padding: 0, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', boxShadow: OMBRE.bouton, display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.ink }}>
              <Ellipsis size={16} strokeWidth={2.4} aria-hidden="true" />
            </span>
          </button>
        )}
      </div>

      <div onClick={ouvrir} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, minWidth: 0, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 24 }}>
          {p.prix
            ? <span className="sk-chiffres" title={p.prixDetail ?? undefined} style={{ fontSize: 17, lineHeight: '24px', fontWeight: 700, letterSpacing: '-0.01em', color: S.ink, whiteSpace: 'nowrap' }}>{p.prix}</span>
            : <span style={{ fontSize: 12, fontWeight: 600, color: S.ink2, whiteSpace: 'nowrap' }}>{p.prixDetail ?? ''}</span>}
          <PileLogos lang={p.lang} plateformes={p.logos?.liste ?? []} etats={p.logos?.etats ?? {}} />
        </div>
        <div className="sk-deux-lignes" style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ink, overflowWrap: 'anywhere' }}>{p.titre}</div>
        {(p.marque || p.vues != null || p.favoris != null || p.boutique) && (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, height: 16, fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, minWidth: 0 }}>
            <span className="sk-une-ligne" style={{ flex: 1, minWidth: 0 }}>{[p.marque, p.boutique].filter(Boolean).join(' · ')}</span>
            {p.vues != null && (
              <span title={fr ? `${p.vues} vues` : `${p.vues} views`} className="sk-chiffres" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, flexShrink: 0 }}>
                <Eye size={14} strokeWidth={2} aria-hidden="true" />{p.vues}
              </span>
            )}
            {p.favoris != null && (
              <span title={fr ? `${p.favoris} favoris` : `${p.favoris} favourites`} className="sk-chiffres" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, flexShrink: 0 }}>
                <Heart size={14} strokeWidth={2} aria-hidden="true" />{p.favoris}
              </span>
            )}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 16 }} />
        {!enSelection && (p.actionElement ?? (p.action && (
          <BoutonAction action={p.action.action} libelle={p.action.libelle} onTap={p.action.onTap} desactive={p.action.desactive} titre={p.action.titre} />
        )))}
        {p.note}
      </div>
      {p.bas}
    </article>
  );
}

// ── LA LIGNE DE LA VUE LISTE — 72 px : vignette, titre, état et logos, prix ─
// Un tap ouvre le menu de l'article (toutes ses actions, dont « Modifier »).
export function LigneArticle(p) {
  const fr = p.lang !== 'en';
  const enSelection = !!p.selection;
  const ouvrir = () => { if (enSelection) p.selection.onBasculer?.(); else p.onMenu?.(); };
  return (
    <button type="button" onClick={ouvrir} className="sk-btn" data-ligne={p.id}
      role={enSelection ? 'checkbox' : undefined} aria-checked={enSelection ? !!p.selection.coche : undefined}
      aria-label={enSelection ? p.titre : `${p.titre} — ${fr ? 'actions' : 'actions'}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 72, padding: '8px 16px', boxSizing: 'border-box',
        border: 'none', textAlign: 'left', color: S.ink,
        background: `linear-gradient(${S.borderSoft},${S.borderSoft}) 84px 100% / calc(100% - 85px) 1px no-repeat, ${enSelection && p.selection.coche ? S.menthe : '#FFFFFF'}`,
      }}>
      <span style={{ position: 'relative', width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: S.paper, ...(p.horsLigne ? { filter: 'grayscale(0.55)', opacity: 0.82 } : null) }}>
        <GalleryPhoto url={p.photo} alt="" fallback={<SansPhoto />} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {enSelection && p.selection.coche && (
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(27,110,98,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}>
            <Check size={22} strokeWidth={3} />
          </span>
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="sk-une-ligne" style={{ display: 'block', fontSize: 14, lineHeight: '20px', fontWeight: 600 }}>{p.titre}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, height: 16, marginTop: 4, minWidth: 0 }}>
          <PastilleEtat texte={p.pastille?.texte} ton={p.pastille?.ton} pulse={p.pastille?.pulse} compacte />
          <PileLogos lang={p.lang} plateformes={p.logos?.liste ?? []} etats={p.logos?.etats ?? {}} />
        </span>
      </span>
      {p.prix
        ? <span className="sk-chiffres" style={{ fontSize: 15, lineHeight: '20px', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{p.prix}</span>
        : <ChevronRight size={18} color={S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />}
    </button>
  );
}
