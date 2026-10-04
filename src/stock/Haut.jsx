// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LE HAUT DE PAGE (planche : écrans 01, 04, 05, 06)
// ═══════════════════════════════════════════════════════════════════════════
// Le titre et la boutique, les trois gestes, la republication automatique, et
// l'entrée unique « Ajouter un article ». Présentation pure : les nombres et
// les gestes viennent de StockTab (mêmes calculs qu'avant la refonte).
import { useState } from 'react';
import { ChevronDown, ChevronRight, Upload, ChevronsUp, CircleAlert, CalendarClock, Plus, X, Check, PenLine, Mic, ClipboardList, FileUp, FileDown } from 'lucide-react';
import { ProBadge } from '../components/PlanBadge';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import Feuille from './Feuille';
import { LigneAction } from './MenuArticle';
import { S, OMBRE, DEGRADE_TUILE, DEGRADE } from './jetons';
import { nombreFr } from './regles';
import { phraseBoutiqueActive, lignesAttenteBoutique, phraseRassurance } from '../utils/attenteBoutique';

// ── TITRE + BOUTIQUE VINTED ACTIVE ──────────────────────────────────────────
// La boutique « active » est celle que Chrome porte (relevée par l'extension) ;
// la pastille dit laquelle on REGARDE. Le tap ouvre le choix — qui ne fait
// que filtrer (la boutique active se change sur vinted.fr, dans Chrome), et
// qui dit ce qui attend une autre boutique (utils/attenteBoutique).
function boutiqueAffichee({ boutiques = [], boutiqueConnectee = null, filterBoutique = 'Toutes', lang = 'fr' }) {
  const fr = lang !== 'en';
  if (filterBoutique === 'sans_origine') return fr ? 'Sans boutique' : 'No shop';
  const parId = (id) => boutiques.find((b) => String(b.user_id) === String(id)) ?? null;
  if (filterBoutique && filterBoutique !== 'Toutes') {
    const b = parId(filterBoutique);
    if (b?.login) return `@${b.login}`;
  }
  if (boutiques.length > 1) return fr ? 'Toutes les boutiques' : 'All shops';
  const c = boutiqueConnectee?.userId ? (parId(boutiqueConnectee.userId) ?? { login: boutiqueConnectee.login }) : null;
  if (c?.login) return `@${c.login}`;
  if (boutiques.length === 1 && boutiques[0]?.login) return `@${boutiques[0].login}`;
  return null;
}

export function TitreStock({ lang = 'fr', boutiques = [], boutiqueConnectee = null, filterBoutique = 'Toutes', setFilterBoutique, attenteBoutique = null }) {
  const fr = lang !== 'en';
  const [ouverte, setOuverte] = useState(false);
  const libelle = boutiqueAffichee({ boutiques, boutiqueConnectee, filterBoutique, lang });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 48 }}>
      <h1 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink, whiteSpace: 'nowrap' }}>
        {fr ? 'Mon stock' : 'My stock'}
      </h1>
      {libelle && (
        <button type="button" className="sk-btn" onClick={() => setOuverte(true)}
          aria-label={fr ? `Boutique Vinted : ${libelle}. Changer de boutique` : `Vinted shop: ${libelle}. Change shop`}
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 0, padding: 0, border: 'none', background: 'transparent' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, minWidth: 0, padding: '0 8px 0 12px', boxSizing: 'border-box',
            borderRadius: 999, background: '#FFFFFF', border: `1px solid ${S.border}`, boxShadow: '0 1px 2px rgba(16,32,27,0.04)',
            fontSize: 13, fontWeight: 600, color: S.ink, whiteSpace: 'nowrap',
          }}>
            <PlatformLogo platform="vinted" size={16} />
            <span className="sk-une-ligne" style={{ maxWidth: 160 }}>{libelle}</span>
            <ChevronDown size={16} color={S.ink2} aria-hidden="true" />
          </span>
        </button>
      )}
      {ouverte && (
        <FeuilleBoutique lang={lang} boutiques={boutiques} boutiqueConnectee={boutiqueConnectee}
          filterBoutique={filterBoutique} attenteBoutique={attenteBoutique}
          onChoisir={(v) => { setFilterBoutique?.(v); setOuverte(false); }}
          onFermer={() => setOuverte(false)} />
      )}
    </div>
  );
}

function FeuilleBoutique({ lang, boutiques, boutiqueConnectee, filterBoutique, attenteBoutique, onChoisir, onFermer }) {
  const fr = lang !== 'en';
  const options = [];
  if (boutiques.length > 1) options.push({ cle: 'Toutes', libelle: fr ? 'Toutes les boutiques' : 'All shops' });
  for (const b of boutiques) {
    const connectee = boutiqueConnectee?.userId && String(boutiqueConnectee.userId) === String(b.user_id);
    options.push({ cle: String(b.user_id), libelle: b.login ? `@${b.login}` : (fr ? 'Boutique' : 'Shop'), detail: connectee ? (fr ? 'Connectée dans Chrome en ce moment' : 'Signed in in Chrome right now') : null });
  }
  if (boutiques.length > 1) options.push({ cle: 'sans_origine', libelle: fr ? 'Sans boutique' : 'No shop', detail: fr ? 'Articles ajoutés à la main' : 'Items added by hand' });
  const autre = boutiqueConnectee?.userId && filterBoutique !== 'Toutes' && filterBoutique !== 'sans_origine' && String(filterBoutique) !== String(boutiqueConnectee.userId);
  return (
    <Feuille lang={lang} titre={fr ? 'Boutique Vinted' : 'Vinted shop'} onFermer={onFermer}>
      <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ink }}>{phraseBoutiqueActive(boutiqueConnectee, lang)}</div>
      {options.length > 0 && (
        <div role="radiogroup" aria-label={fr ? 'Boutique affichée' : 'Shop shown'} style={{ borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
          {options.map((o) => {
            const actif = String(filterBoutique ?? 'Toutes') === o.cle || (boutiques.length === 1 && o.cle === String(boutiques[0].user_id) && filterBoutique === 'Toutes');
            return (
              <LigneAction key={o.cle} icone={null} libelle={o.libelle} detail={o.detail}
                onTap={() => onChoisir(boutiques.length === 1 ? 'Toutes' : o.cle)}
                droite={actif ? <Check size={20} color={S.tealDeep} strokeWidth={2.4} aria-hidden="true" /> : <span />} />
            );
          })}
        </div>
      )}
      {autre && (
        <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ambreEncre }}>
          {fr ? 'Tu regardes une autre boutique : ses republications et ses retraits attendront que tu la connectes sur vinted.fr.'
            : 'You are viewing another shop: its reposts and removals will wait until you sign in to it on vinted.fr.'}
        </div>
      )}
      {attenteBoutique && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, borderRadius: 12, background: S.ambreFond, border: `1px solid ${S.ambreBord}` }}>
          {lignesAttenteBoutique(attenteBoutique, lang).map((l, i) => <div key={i} style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: S.ambreEncre }}>{l}</div>)}
          <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{phraseRassurance(lang)}</div>
        </div>
      )}
      <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>
        {fr ? 'Pour changer de boutique active, connecte-toi à l’autre boutique sur vinted.fr, dans Chrome, sur ton ordinateur.'
          : 'To change the active shop, sign in to the other shop on vinted.fr, in Chrome, on your computer.'}
      </div>
    </Feuille>
  );
}

// ── LES TROIS GESTES ────────────────────────────────────────────────────────
// Variante A (tuiles, la planche principale) ; B (boutons larges) ; « lignes »
// pour l'écran d'arrivée après une synchronisation (« À faire maintenant »).
function definitions(lang) {
  const fr = lang !== 'en';
  return {
    publier: { icone: Upload, titre: fr ? 'Publier' : 'Publish', court: fr ? 'pas encore partout' : 'not everywhere yet', long: (n) => fr ? `${n > 1 ? 'articles' : 'article'} pas encore partout` : `${n > 1 ? 'items' : 'item'} not everywhere yet`, aria: (n) => fr ? `Publier : ${n} ${n > 1 ? 'articles' : 'article'} pas encore partout` : `Publish: ${n} not everywhere yet` },
    remonter: { icone: ChevronsUp, titre: fr ? 'Remonter' : 'Bump', titreLong: fr ? 'Remonter mes annonces' : 'Bump my listings', court: fr ? 'perdent en visibilité' : 'losing visibility', long: (n) => fr ? `${n > 1 ? 'annonces perdent' : 'annonce perd'} en visibilité` : `${n > 1 ? 'listings' : 'listing'} losing visibility`, aria: (n) => fr ? `Remonter mes annonces : ${n} ${n > 1 ? 'annonces perdent' : 'annonce perd'} en visibilité` : `Bump my listings: ${n} losing visibility` },
    aRegler: { icone: CircleAlert, titre: fr ? 'À régler' : 'To fix', court: fr ? 'ventes, infos à compléter' : 'sales, info to complete', long: () => fr ? 'ventes et infos à compléter' : 'sales and info to complete', aria: (n) => fr ? `À régler : ${n} ventes et infos à compléter` : `To fix: ${n} sales and info to complete` },
  };
}

const PASTILLE_ICONE = {
  publier: { fond: 'rgba(255,255,255,0.18)', encre: '#FFFFFF' },
  remonter: { fond: S.menthe, encre: S.tealDeep },
  aRegler: { fond: S.ambreFond, encre: S.ambreEncre },
};

export function Gestes({ lang = 'fr', variante = 'tuiles', publier, remonter, aRegler }) {
  const D = definitions(lang);
  const gestes = [['publier', publier], ['remonter', remonter], ['aRegler', aRegler]].filter(([, g]) => g);
  if (variante === 'lignes') {
    return (
      <div>
        {gestes.map(([cle, g], k) => {
          const d = D[cle]; const I = d.icone; const pi = PASTILLE_ICONE[cle];
          return (
            <button key={cle} type="button" className="sk-btn" onClick={g.onOuvrir} aria-label={d.aria(g.n)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: 0, border: 'none', textAlign: 'left', color: S.ink,
                background: k < gestes.length - 1 ? `linear-gradient(${S.borderSoft},${S.borderSoft}) 52px 100% / calc(100% - 52px) 1px no-repeat` : 'transparent',
              }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cle === 'publier' ? DEGRADE_TUILE : pi.fond, color: cle === 'publier' ? '#FFFFFF' : pi.encre }}>
                <I size={20} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="sk-chiffres" style={{ minWidth: 32, flexShrink: 0, fontSize: 24, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.03em' }}>{nombreFr(g.n, lang)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700 }}>{d.titreLong ?? d.titre}</span>
                <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{d.long(g.n)}</span>
              </span>
              <ChevronRight size={20} color={S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    );
  }
  if (variante === 'boutons') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {gestes.map(([cle, g]) => {
          const d = D[cle]; const I = d.icone; const pi = PASTILLE_ICONE[cle]; const plein = cle === 'publier';
          return (
            <button key={cle} type="button" className="sk-btn sk-presse" onClick={g.onOuvrir} aria-label={d.aria(g.n)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '0 16px', boxSizing: 'border-box', borderRadius: 16, textAlign: 'left',
                border: plein ? 'none' : `1px solid ${S.border}`, background: plein ? DEGRADE : '#FFFFFF', color: plein ? '#FFFFFF' : S.ink,
                boxShadow: plein ? OMBRE.tuile : OMBRE.carte,
              }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: pi.fond, color: pi.encre }}>
                <I size={20} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700 }}>{d.titreLong ?? d.titre}</span>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: '20px', fontWeight: 500, color: plein ? 'rgba(255,255,255,0.92)' : S.ink2 }}>
                  <strong className="sk-chiffres" style={{ fontWeight: 700, color: plein ? '#FFFFFF' : S.ink }}>{nombreFr(g.n, lang)}</strong> {d.long(g.n)}
                </span>
              </span>
              <ChevronRight size={20} color={plein ? '#FFFFFF' : S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gestes.length},minmax(0,1fr))`, gap: 8 }}>
      {gestes.map(([cle, g]) => {
        const d = D[cle]; const I = d.icone; const pi = PASTILLE_ICONE[cle]; const plein = cle === 'publier';
        return (
          <button key={cle} type="button" className="sk-btn sk-presse" onClick={g.onOuvrir} aria-label={d.aria(g.n)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'stretch', minWidth: 0, height: 128, padding: 16, boxSizing: 'border-box', borderRadius: 16,
              border: 'none', textAlign: 'left', background: plein ? DEGRADE_TUILE : '#FFFFFF', color: plein ? '#FFFFFF' : S.ink,
              boxShadow: plein ? OMBRE.tuile : `${OMBRE.carte}, inset 0 0 0 1px ${S.border}`,
            }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 32 }}>
              <span className="sk-chiffres" style={{ fontSize: 28, lineHeight: '32px', fontWeight: 700, letterSpacing: '-0.03em' }}>{nombreFr(g.n, lang)}</span>
              <span style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: pi.fond, color: pi.encre, flexShrink: 0 }}>
                <I size={16} strokeWidth={2.2} aria-hidden="true" />
              </span>
            </span>
            <span style={{ marginTop: 8, fontSize: 14, lineHeight: '20px', fontWeight: 700 }}>{d.titre}</span>
            <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: plein ? 600 : 500, color: plein ? 'rgba(255,255,255,0.92)' : S.ink2 }}>{d.court}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── REPUBLICATION AUTOMATIQUE — une ligne de 72 px ─────────────────────────
// Pro : interrupteur (le MÊME geste que l'interrupteur des Réglages —
// pauseGenerale), un tap sur la ligne ouvre les réglages. Sans Pro : liseré
// doré et badge Pro EXACT (ProBadge de PlanBadge.jsx), toute la ligne ouvre
// les offres. Jamais cachée : c'est un déclencheur d'abonnement.
export function LigneRepublicationAuto({ lang = 'fr', autorise = false, actif = false, pauseMemorisee = false, busy = false, nomsActifs = [], onBasculer, onOuvrirReglages, onOffres }) {
  const fr = lang !== 'en';
  const titre = fr ? 'Republication automatique' : 'Automatic reposting';
  const sous = autorise && actif && nomsActifs.length
    ? (fr ? `Active sur ${nomsActifs.length > 1 ? `${nomsActifs.slice(0, -1).join(', ')} et ${nomsActifs[nomsActifs.length - 1]}` : nomsActifs[0]}` : `On for ${nomsActifs.join(', ')}`)
    : (fr ? 'Chaque jour, sans y penser' : 'Every day, without thinking about it');
  const icone = (
    <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.menthe, color: S.tealDeep }}>
      <CalendarClock size={20} strokeWidth={2} aria-hidden="true" />
    </span>
  );
  const textes = (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="sk-une-ligne" style={{ display: 'block', fontSize: 14, lineHeight: '20px', fontWeight: 700, color: S.ink }}>{titre}</span>
      <span className="sk-une-ligne" style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{sous}</span>
    </span>
  );
  if (!autorise) {
    return (
      <button type="button" className="sk-btn sk-presse" onClick={onOffres}
        aria-label={fr ? 'Republication automatique, incluse dans le plan Pro. Voir l’offre Pro' : 'Automatic reposting, included in the Pro plan. See the Pro plan'}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 72, padding: '0 16px', boxSizing: 'border-box', borderRadius: 16, textAlign: 'left',
          background: '#FFFFFF', border: `1px solid ${S.orBord}`, boxShadow: `${OMBRE.carte}, 0 0 16px -8px rgba(214,178,96,0.55)`, color: S.ink,
        }}>
        {icone}{textes}
        <span style={{ display: 'flex', flexShrink: 0 }}><ProBadge size="sm" /></span>
      </button>
    );
  }
  // Interrupteur : allumé = au moins une plateforme active. Éteint avec une
  // pause mémorisée → reprise générale. Jamais réglé → les réglages (on ne
  // choisit pas les plateformes et les créneaux à la place de la personne).
  const basculer = (e) => {
    e.stopPropagation();
    if (busy) return;
    if (actif) onBasculer?.(false);
    else if (pauseMemorisee) onBasculer?.(true);
    else onOuvrirReglages?.();
  };
  return (
    <div role="button" tabIndex={0} className="sk-btn sk-focus" onClick={onOuvrirReglages}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOuvrirReglages?.(); } }}
      aria-label={fr ? 'Republication automatique — réglages' : 'Automatic reposting — settings'}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, minHeight: 72, padding: '0 16px', boxSizing: 'border-box', borderRadius: 16,
        background: '#FFFFFF', border: `1px solid ${S.border}`, boxShadow: OMBRE.carte,
      }}>
      {icone}{textes}
      <button type="button" role="switch" aria-checked={actif} aria-label={titre} disabled={busy} onClick={basculer} className="sk-btn"
        style={{ width: 52, height: 44, padding: '9px 4px', margin: '0 -4px', boxSizing: 'border-box', border: 'none', background: 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
        <span style={{ display: 'flex', width: 44, height: 26, padding: 3, boxSizing: 'border-box', borderRadius: 999, background: actif ? S.teal : S.switchOff, justifyContent: actif ? 'flex-end' : 'flex-start', transition: 'background .15s ease-out' }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
        </span>
      </button>
    </div>
  );
}

// ── AJOUTER UN ARTICLE — UNE seule entrée ──────────────────────────────────
export function EntreeAjouter({ lang = 'fr', ouvert = false, onOuvrir, onFermer }) {
  const fr = lang !== 'en';
  return (
    <button type="button" className="sk-btn sk-presse" onClick={ouvert ? onFermer : onOuvrir} aria-expanded={ouvert}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '0 16px', boxSizing: 'border-box', borderRadius: 16,
        background: '#FFFFFF', border: `1px solid ${S.border}`, boxShadow: OMBRE.carte, color: S.ink, textAlign: 'left',
      }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.menthe, color: S.tealDeep }}>
        <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, lineHeight: '20px', fontWeight: 700 }}>{fr ? 'Ajouter un article' : 'Add an item'}</span>
        <span style={{ display: 'block', fontSize: 12.5, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>{fr ? 'Écris, parle ou remplis à la main' : 'Write, speak or fill in by hand'}</span>
      </span>
      {ouvert
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: S.ink2, flexShrink: 0 }}><X size={18} aria-hidden="true" />{fr ? 'Fermer' : 'Close'}</span>
        : <ChevronRight size={20} color={S.chevron} aria-hidden="true" style={{ flexShrink: 0 }} />}
    </button>
  );
}

export function FeuilleAjouter({ lang = 'fr', onEcrire, onParler, onManuel, onImporter, onExporter, messageImport = null, onFermer }) {
  const fr = lang !== 'en';
  const choisir = (f) => () => { onFermer?.(); f?.(); };
  return (
    <Feuille lang={lang} titre={fr ? 'Ajouter un article' : 'Add an item'} onFermer={onFermer}>
      <div style={{ borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
        <LigneAction icone={PenLine} libelle={fr ? 'Écrire' : 'Write'} detail={fr ? 'Décris ton article, la fiche se remplit' : 'Describe your item, the form fills itself'} onTap={choisir(onEcrire)} />
        <LigneAction icone={Mic} libelle={fr ? 'Parler' : 'Speak'} detail={fr ? 'Dicte, c’est noté' : 'Dictate, it gets written down'} onTap={choisir(onParler)} />
        <LigneAction icone={ClipboardList} libelle={fr ? 'Remplir à la main' : 'Fill in by hand'} detail={fr ? 'Un article ou un lot' : 'One item or a lot'} onTap={choisir(onManuel)} />
      </div>
      {(onImporter || onExporter) && (
        <div style={{ borderRadius: 16, overflow: 'hidden', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
          {onImporter && <LigneAction icone={FileUp} libelle={fr ? 'Importer un fichier Excel' : 'Import an Excel file'} detail={fr ? 'Ton stock depuis un tableau (.xlsx, .csv)' : 'Your stock from a sheet (.xlsx, .csv)'} onTap={onImporter} />}
          {onExporter && <LigneAction icone={FileDown} libelle={fr ? 'Exporter mon stock' : 'Export my stock'} detail={fr ? 'Un fichier Excel de tous tes articles' : 'An Excel file of all your items'} onTap={onExporter} />}
        </div>
      )}
      {messageImport && <div role="status" style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: S.tealDeep }}>{messageImport}</div>}
    </Feuille>
  );
}
