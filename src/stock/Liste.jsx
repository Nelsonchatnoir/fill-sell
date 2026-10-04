// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LE HAUT DE LA LISTE ET LE PANNEAU « FILTRER ET TRIER »
// (planche : écrans 01, 03, 07)
// ═══════════════════════════════════════════════════════════════════════════
// Recherche + Filtrer sur une ligne · filtres rapides en pastilles qui
// défilent (une seule active, pleine) · filtres posés en puces retirables ·
// en-tête de liste (compte, tri en un tap, Cartes / Liste) · le panneau.
// ⛔ CE FICHIER NE FILTRE RIEN : il reçoit des options déjà calculées (libellé,
//    actif, onTap) — la logique reste dans StockTab, App.jsx et
//    utils/stockFiltres, comme pour FiltresStock.jsx avant lui.
import { Search, SlidersHorizontal, X, ArrowDownUp, LayoutGrid, List, Check, ChevronRight } from 'lucide-react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import Feuille, { IntituleSection } from './Feuille';
import { S, OMBRE, DEGRADE } from './jetons';
import { nombreFr } from './regles';

const fr = (lang) => lang !== 'en';

// ── RECHERCHE + FILTRER ─────────────────────────────────────────────────────
export function BarreRecherche({ lang = 'fr', search, setSearch, nbFiltres = 0, onFiltrer }) {
  const f = fr(lang);
  const actif = nbFiltres > 0;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, height: 48, padding: '0 16px', boxSizing: 'border-box', borderRadius: 14, background: '#FFFFFF', border: `1px solid ${S.border}` }}>
        <Search size={20} color={S.placeholder} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
        <input type="search" value={search ?? ''} onChange={(e) => setSearch?.(e.target.value)} className="sk-champ"
          placeholder={f ? 'Rechercher un article' : 'Search an item'} aria-label={f ? 'Rechercher un article' : 'Search an item'}
          style={{ flex: 1, minWidth: 0, height: 40, padding: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 16, color: S.ink }} />
        {search ? (
          <button type="button" className="sk-btn" onClick={() => setSearch?.('')} aria-label={f ? 'Effacer la recherche' : 'Clear search'}
            style={{ width: 40, height: 40, marginRight: -12, padding: 0, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: S.ink2, flexShrink: 0 }}>
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
      </label>
      <button type="button" className="sk-btn sk-presse" onClick={onFiltrer}
        aria-label={actif ? (f ? `Filtrer, ${nbFiltres} filtre${nbFiltres > 1 ? 's' : ''} actif${nbFiltres > 1 ? 's' : ''}` : `Filter, ${nbFiltres} active`) : (f ? 'Filtrer et trier' : 'Filter and sort')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 48, padding: '0 16px', boxSizing: 'border-box', borderRadius: 14, flexShrink: 0,
          background: actif ? S.menthe : '#FFFFFF', border: `1px solid ${actif ? S.tealDeep : S.border}`, boxShadow: actif ? `inset 0 0 0 1px ${S.tealDeep}` : 'none',
          color: S.ink, fontSize: 14, fontWeight: 700,
        }}>
        {actif
          ? <span aria-hidden="true" className="sk-chiffres" style={{ minWidth: 20, height: 20, padding: '0 4px', boxSizing: 'border-box', borderRadius: 999, background: S.tealDeep, color: '#FFFFFF', fontSize: 12, lineHeight: '20px', fontWeight: 700, textAlign: 'center' }}>{nbFiltres}</span>
          : <SlidersHorizontal size={20} strokeWidth={2} aria-hidden="true" />}
        {f ? 'Filtrer' : 'Filter'}
      </button>
    </div>
  );
}

// ── FILTRES RAPIDES — même format pour toutes, l'active pleine ─────────────
// La rangée défile jusqu'au bord de l'écran : elle « saigne » de la marge
// intérieure de la page (14 px, .wrap.page-pad d'App.jsx) — pas un pixel de
// plus, sinon la page entière défile de côté.
export function FiltresRapides({ lang = 'fr', options = [], actif = 'tous', onChoisir }) {
  return (
    <div role="group" aria-label={fr(lang) ? 'Filtres rapides' : 'Quick filters'} className="sk-defile"
      style={{ display: 'flex', gap: 8, height: 40, margin: '0 -14px', padding: '0 14px' }}>
      {options.map((o) => {
        const on = o.cle === actif;
        return (
          <button key={o.cle} type="button" aria-pressed={on} className="sk-btn" onClick={() => onChoisir?.(o.cle)}
            style={{
              flexShrink: 0, height: 40, padding: '0 12px', boxSizing: 'border-box', borderRadius: 999, whiteSpace: 'nowrap',
              border: `1px solid ${on ? S.selection : S.border}`, background: on ? S.selection : '#FFFFFF', color: on ? '#FFFFFF' : S.ink,
              fontSize: 13, fontWeight: 600,
            }}>{o.libelle}</button>
        );
      })}
      <span aria-hidden="true" style={{ flexShrink: 0, width: 8 }} />
    </div>
  );
}

// ── LES FILTRES POSÉS — puces menthe retirables + « Tout effacer » ──────────
export function FiltresActifs({ lang = 'fr', puces = [], onToutEffacer }) {
  if (!puces.length) return null;
  const f = fr(lang);
  return (
    <div role="group" aria-label={f ? 'Filtres actifs' : 'Active filters'} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 40 }}>
      {puces.map((p) => (
        <button key={p.cle} type="button" className="sk-btn" onClick={p.onRetirer} aria-label={f ? `Retirer le filtre ${p.libelle}` : `Remove filter ${p.libelle}`}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, maxWidth: '100%', padding: '0 8px 0 12px', boxSizing: 'border-box',
            borderRadius: 999, background: S.menthe, border: `1px solid ${S.mentheBord}`, color: S.tealDeep, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
          <span className="sk-une-ligne" style={{ minWidth: 0 }}>{p.libelle}</span>
          <X size={16} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0 }} />
        </button>
      ))}
      <button type="button" className="sk-btn" onClick={onToutEffacer}
        style={{ flexShrink: 0, height: 40, marginLeft: 'auto', padding: '0 8px', border: 'none', background: 'transparent', color: S.ink, fontSize: 13, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>
        {f ? 'Tout effacer' : 'Clear all'}
      </button>
    </div>
  );
}

// ── EN-TÊTE DE LISTE — compte, tri en un tap, Cartes / Liste ───────────────
export function EnTeteListe({ lang = 'fr', texteCompte, libelleTri, onTri, affichage = 'cartes', setAffichage }) {
  const f = fr(lang);
  const segment = (cle, Icone, libelle) => {
    const on = affichage === cle;
    return on ? (
      <button type="button" aria-pressed="true" className="sk-btn" onClick={() => setAffichage?.(cle)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', border: 'none', borderRadius: 8, background: '#FFFFFF', boxShadow: OMBRE.segment, color: S.ink, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
        <Icone size={16} strokeWidth={2} aria-hidden="true" />{libelle}
      </button>
    ) : (
      <button type="button" aria-pressed="false" aria-label={libelle} className="sk-btn" onClick={() => setAffichage?.(cle)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 32, padding: 0, border: 'none', borderRadius: 8, background: 'transparent', color: S.ink2 }}>
        <Icone size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40 }}>
      <span className="sk-une-ligne sk-chiffres" style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: S.ink }}>{texteCompte}</span>
      {libelleTri && (
        <button type="button" className="sk-btn" onClick={onTri} aria-label={f ? `Trier : ${libelleTri}` : `Sort: ${libelleTri}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 8px', border: 'none', background: 'transparent', color: S.ink, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <ArrowDownUp size={16} color={S.ink2} strokeWidth={2} aria-hidden="true" />{libelleTri}
        </button>
      )}
      <div role="group" aria-label={f ? 'Affichage du stock' : 'Stock view'} style={{ display: 'flex', height: 40, padding: 4, boxSizing: 'border-box', borderRadius: 12, background: S.sheet, flexShrink: 0 }}>
        {segment('cartes', LayoutGrid, f ? 'Cartes' : 'Cards')}
        {segment('liste', List, f ? 'Liste' : 'List')}
      </div>
    </div>
  );
}

// ── LA PETITE FEUILLE DE TRI — les mêmes cinq choix que le panneau ─────────
export function FeuilleTri({ lang = 'fr', options = [], onFermer }) {
  return (
    <Feuille lang={lang} titre={fr(lang) ? 'Trier par' : 'Sort by'} onFermer={onFermer}>
      <div role="radiogroup" style={{ borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
        {options.map((o) => (
          <button key={o.cle} type="button" role="radio" aria-checked={o.actif} className="sk-btn" onClick={o.onTap}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '0 16px', border: 'none', background: o.actif ? S.menthe : 'transparent', boxShadow: `inset 0 -1px 0 ${S.borderSoft}`, textAlign: 'left', color: S.ink, fontSize: 15, fontWeight: o.actif ? 700 : 600 }}>
            <span style={{ flex: 1 }}>{o.libelle}</span>
            {o.actif && <Check size={20} color={S.tealDeep} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </Feuille>
  );
}

// ── LES PUCES DU PANNEAU ────────────────────────────────────────────────────
function Puce({ libelle, actif, onTap, role = undefined, desactive = false }) {
  return (
    <button type="button" className="sk-btn" onClick={onTap} disabled={desactive}
      role={role} aria-checked={role === 'radio' ? actif : undefined} aria-pressed={role ? undefined : actif}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, height: 40, padding: '0 12px', boxSizing: 'border-box', borderRadius: 999, whiteSpace: 'nowrap',
        background: actif ? S.selection : '#FFFFFF', border: `1px solid ${actif ? S.selection : S.border}`, color: actif ? '#FFFFFF' : S.ink,
        fontSize: 13, fontWeight: actif ? 700 : 600, opacity: desactive ? 0.45 : 1,
      }}>
      {actif && <Check size={16} strokeWidth={2.4} aria-hidden="true" />}{libelle}
    </button>
  );
}

function ToutVoir({ lang, onTap }) {
  return (
    <button type="button" className="sk-btn" onClick={onTap}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, margin: '-8px -8px -8px 0', padding: '0 8px', border: 'none', background: 'transparent', color: S.tealDeep, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {fr(lang) ? 'Tout voir' : 'See all'}<ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

function ChampPrix({ etiquette, valeur, setValeur, aria }) {
  const plein = String(valeur ?? '').trim() !== '';
  return (
    <label style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', boxSizing: 'border-box', borderRadius: 12, background: '#FFFFFF',
      border: `1px solid ${plein ? S.tealDeep : S.border}`, boxShadow: plein ? `inset 0 0 0 1px ${S.tealDeep}` : 'none',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: S.ink2 }}>{etiquette}</span>
      <input type="text" inputMode="decimal" value={valeur ?? ''} onChange={(e) => setValeur?.(e.target.value)} aria-label={aria} className="sk-champ"
        placeholder="—" style={{ flex: 1, minWidth: 0, height: 32, padding: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: S.ink, textAlign: 'right' }} />
      <span style={{ fontSize: 16, fontWeight: 700, color: S.ink }}>€</span>
    </label>
  );
}

/**
 * Le panneau « Filtrer et trier ». Chaque option arrive avec son onTap : un
 * choix s'applique à l'instant où on le touche (rien à valider, rien à
 * perdre) ; le bouton du bas ANNONCE le résultat, recalculé en direct, et
 * referme.
 */
export function PanneauFiltres({
  lang = 'fr', tris = [], etats = [], plateformes = null, anciennete = [], categories = null, marques = null,
  prix = null, nbResultat = 0, onToutEffacer, effacable = false, onFermer, actif = true,
}) {
  const f = fr(lang);
  const section = (titre, enfants, droite = null) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <IntituleSection droite={droite}>{titre}</IntituleSection>
      {enfants}
    </div>
  );
  const rangee = (opts, role) => (
    <div role={role === 'radio' ? 'radiogroup' : undefined} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {opts.map((o) => <Puce key={o.cle} libelle={o.libelle} actif={!!o.actif} onTap={o.onTap} role={role} desactive={o.desactive} />)}
    </div>
  );
  return (
    <Feuille lang={lang} actif={actif} titre={f ? 'Filtrer et trier' : 'Filter and sort'} onFermer={onFermer}
      pied={(
        <>
          <button type="button" className="sk-btn" onClick={onToutEffacer} disabled={!effacable}
            style={{ height: 48, padding: '0 8px', border: 'none', background: 'transparent', color: S.ink, fontSize: 14, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap', opacity: effacable ? 1 : 0.45 }}>
            {f ? 'Tout effacer' : 'Clear all'}
          </button>
          <button type="button" className="sk-btn sk-presse" onClick={onFermer}
            style={{ flex: 1, height: 48, border: 'none', borderRadius: 14, background: nbResultat === 0 ? S.disabled : DEGRADE, color: nbResultat === 0 ? S.ink2 : '#FFFFFF', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: nbResultat === 0 ? 'none' : OMBRE.primaire }}>
            {nbResultat === 0 ? (f ? 'Aucun article' : 'No items')
              : f ? `Voir ${nombreFr(nbResultat, lang)} article${nbResultat > 1 ? 's' : ''}` : `Show ${nbResultat} item${nbResultat > 1 ? 's' : ''}`}
          </button>
        </>
      )}>
      {tris.length > 0 && section(f ? 'Trier par' : 'Sort by', rangee(tris, 'radio'))}
      {etats.length > 0 && section(f ? 'État' : 'Status', rangee(etats))}
      {plateformes && plateformes.options.length > 0 && section(f ? 'Plateformes' : 'Marketplaces', (
        <>
          {plateformes.modes && (
            <div role="group" style={{ display: 'flex', height: 40, padding: 4, boxSizing: 'border-box', borderRadius: 12, background: S.disabled, alignSelf: 'flex-start' }}>
              {plateformes.modes.map((m) => (
                <button key={m.cle} type="button" aria-pressed={m.actif} className="sk-btn" onClick={m.onTap}
                  style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 8, background: m.actif ? '#FFFFFF' : 'transparent', boxShadow: m.actif ? OMBRE.segment : 'none', color: m.actif ? S.ink : S.ink2, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {m.libelle}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, plateformes.options.length)},minmax(0,1fr))`, gap: 8 }}>
            {plateformes.options.map((o) => (
              <button key={o.cle} type="button" aria-pressed={!!o.actif} aria-label={o.libelle} className="sk-btn" onClick={o.onTap}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, padding: 0, boxSizing: 'border-box', borderRadius: 999,
                  background: o.actif ? S.menthe : '#FFFFFF', border: `1px solid ${o.actif ? S.tealDeep : S.border}`, boxShadow: o.actif ? `inset 0 0 0 1px ${S.tealDeep}` : 'none',
                }}>
                <PlatformLogo platform={o.cle} size={24} />
              </button>
            ))}
          </div>
          {plateformes.extra && rangee(plateformes.extra)}
        </>
      ))}
      {anciennete.length > 0 && section(f ? 'Ancienneté de l’annonce' : 'Listing age', rangee(anciennete))}
      {categories && categories.options.length > 0 && section(f ? 'Catégorie' : 'Category', rangee(categories.options), categories.onToutVoir ? <ToutVoir lang={lang} onTap={categories.onToutVoir} /> : null)}
      {marques && marques.options.length > 0 && section(f ? 'Marque' : 'Brand', rangee(marques.options), marques.onToutVoir ? <ToutVoir lang={lang} onTap={marques.onToutVoir} /> : null)}
      {prix && section(f ? 'Prix' : 'Price', (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChampPrix etiquette="Min" valeur={prix.min} setValeur={prix.setMin} aria={f ? 'Prix minimum en euros' : 'Minimum price in euros'} />
          <span aria-hidden="true" style={{ fontSize: 16, fontWeight: 600, color: S.chevron }}>–</span>
          <ChampPrix etiquette="Max" valeur={prix.max} setValeur={prix.setMax} aria={f ? 'Prix maximum en euros' : 'Maximum price in euros'} />
        </div>
      ))}
    </Feuille>
  );
}

// ── UN ÉTAT VIDE QUI DONNE LA SORTIE ────────────────────────────────────────
export function VideAvecSortie({ texte, libelleSortie, onSortie }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 16px', borderRadius: 16, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 14, lineHeight: '20px', fontWeight: 600, color: S.ink }}>{texte}</div>
      {onSortie && (
        <button type="button" className="sk-btn sk-presse" onClick={onSortie}
          style={{ height: 40, padding: '0 16px', border: `1px solid ${S.border}`, borderRadius: 12, background: '#FFFFFF', color: S.ink, fontSize: 13, fontWeight: 700 }}>
          {libelleSortie}
        </button>
      )}
    </div>
  );
}
