// ═══════════════════════════════════════════════════════════════════════════
// STOCK — DEPUIS QUAND L'ANNONCE EST EN LIGNE, PLATEFORME PAR PLATEFORME (31/10, lot H — XEWER)
// ═══════════════════════════════════════════════════════════════════════════
// Ouverte par un appui sur la pastille « En ligne » d'une carte, une des lignes « En ligne sur … » du menu « … »
// (une par plateforme) ou le bloc « En ligne » de la fiche de l'article (ResumeDatesEnLigne, 31/10) :
// pour chaque plateforme, l'état, depuis quand l'annonce actuelle est en ligne et ce que FillSell en a fait (publiée,
// republiée, importée), puis l'historique de ses mises en ligne. Composant de PRÉSENTATION : les lignes viennent de
// datesParPlateforme (_shared/mise-en-ligne.js, la règle de l'éligibilité à la republication automatique) ; il ne
// lit rien et n'écrit rien.
// ⛔ Aucun émoji, icônes Lucide ; les jetons de src/stock/jetons.js, la coque Feuille (portail, Échap, retour Android).
import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import Feuille, { IntituleSection } from './Feuille';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { PastilleEtat } from './Carte';
import { S } from './jetons';
import { LIBELLE_PLATEFORME } from '../utils/stockFiltres';

// Le nom vient de la configuration des plateformes (stockFiltres), jamais d'une liste écrite ici.
const nom = (p) => LIBELLE_PLATEFORME[p] ?? p;

/** « 21 oct. 2026 à 16:52 », à l'heure de Paris (null si la date est absente). */
function dateLongue(iso, lang = 'fr') {
  const x = Date.parse(iso ?? '');
  if (!Number.isFinite(x)) return null;
  try {
    const fr = lang !== 'en';
    const jour = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(x));
    const heure = new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(x));
    return fr ? `${jour} à ${heure}` : `${jour}, ${heure}`;
  } catch { return null; }
}

/** Ce que FillSell a fait de l'annonce, en un mot. */
function libelleNature(nature, lang = 'fr') {
  const fr = lang !== 'en';
  return {
    publiee: fr ? 'Publiée par FillSell' : 'Listed by FillSell',
    republiee: fr ? 'Republiée par FillSell' : 'Reposted by FillSell',
    importee: fr ? 'Importée (déjà sur la plateforme)' : 'Imported (already on the marketplace)',
  }[nature] ?? '';
}

/** Le mot court de l'historique. */
function libelleNatureCourt(nature, lang = 'fr') {
  const fr = lang !== 'en';
  return { publiee: fr ? 'Publiée' : 'Listed', republiee: fr ? 'Republiée' : 'Reposted', importee: fr ? 'Importée' : 'Imported' }[nature] ?? '';
}

/** « depuis 10 j », « depuis aujourd'hui » (null si inconnu). */
function texteDepuis(jours, lang = 'fr') {
  const fr = lang !== 'en';
  if (jours == null) return null;
  if (jours === 0) return fr ? "depuis aujourd'hui" : 'since today';
  return fr ? `depuis ${jours} j` : `for ${jours} d`;
}

function Historique({ lang, lignes }) {
  const fr = lang !== 'en';
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {lignes.map((h, k) => (
        <li key={`${h.numero}-${h.date}-${k}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 32, padding: '6px 0', boxShadow: k ? `inset 0 1px 0 ${S.borderSoft}` : 'none' }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, transform: 'translateY(-1px)', background: h.actuelle ? S.teal : S.horsPoint }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, lineHeight: '18px', fontWeight: 600, color: S.ink }}>
              {libelleNatureCourt(h.nature, lang)}
              {h.actuelle ? (fr ? ' · en ligne' : ' · live') : (fr ? ' · remplacée' : ' · replaced')}
            </span>
            <span className="sk-chiffres" style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, overflowWrap: 'anywhere' }}>
              {dateLongue(h.date, lang) ?? (fr ? 'date inconnue' : 'unknown date')}{h.numero ? ` · n° ${h.numero}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function BlocPlateforme({ lang, ligne }) {
  const fr = lang !== 'en';
  const [ouvert, setOuvert] = useState(false);
  const depuis = texteDepuis(ligne.jours, lang);
  const actuelle = ligne.enLigne ? ligne.numero : null;
  const iActuelle = actuelle ? ligne.historique.findIndex((x) => x.numero === actuelle) : -1;
  const histo = ligne.historique.map((h, k) => ({ ...h, actuelle: k === iActuelle }));
  const republications = ligne.historique.filter((h) => h.nature === 'republiee').length;
  return (
    <section aria-label={nom(ligne.platform)} style={{ background: '#FFFFFF', borderRadius: 16, boxShadow: `inset 0 0 0 1px ${S.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <PlatformLogo platform={ligne.platform} size={28} desature={!ligne.enLigne} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: '20px', fontWeight: 700, color: S.ink }}>{nom(ligne.platform)}</span>
        <PastilleEtat texte={ligne.enLigne ? (fr ? 'En ligne' : 'Live') : (fr ? 'Plus en ligne' : 'Not live')} ton={ligne.enLigne ? 'ok' : 'hors'} />
      </div>
      {ligne.enLigne ? (
        <div style={{ fontSize: 13, lineHeight: '18px', color: S.ink }}>
          <span style={{ fontWeight: 700 }}>{depuis ? (fr ? `En ligne ${depuis}` : `Live ${depuis}`) : (fr ? 'En ligne, date inconnue' : 'Live, unknown date')}</span>
          {ligne.date && <span className="sk-chiffres" style={{ color: S.ink2 }}> · {dateLongue(ligne.date, lang)}</span>}
          <span style={{ display: 'block', color: S.ink2, fontWeight: 500 }}>{libelleNature(ligne.nature, lang)}</span>
        </div>
      ) : (
        <div style={{ fontSize: 13, lineHeight: '18px', color: S.ink2, fontWeight: 500 }}>
          {fr ? 'Aucune annonce en ligne sur cette plateforme aujourd’hui.' : 'No live listing on this marketplace today.'}
        </div>
      )}
      {histo.length > 0 && (
        <>
          <button type="button" className="sk-btn" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, margin: '0 -8px', padding: '0 8px', border: 'none', borderRadius: 10, background: 'transparent', color: S.tealDeep, fontSize: 13, fontWeight: 700, textAlign: 'left' }}>
            {ouvert ? <ChevronUp size={16} strokeWidth={2.2} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />}
            {fr
              ? `Historique · ${histo.length} mise${histo.length > 1 ? 's' : ''} en ligne${republications ? ` dont ${republications} republication${republications > 1 ? 's' : ''}` : ''}`
              : `History · ${histo.length} listing${histo.length > 1 ? 's' : ''}${republications ? `, ${republications} repost${republications > 1 ? 's' : ''}` : ''}`}
          </button>
          {ouvert && <Historique lang={lang} lignes={histo} />}
        </>
      )}
    </section>
  );
}

/**
 * (31/10, retour de Nico) Le même détail, en bref, dans la FICHE de l'article (« Modifier l'article ») : une ligne par
 * plateforme en ligne — depuis quand, et ce que FillSell en a fait — ; un appui ouvre la feuille complète (historique).
 * Mêmes lignes que la feuille (datesParPlateforme), lues à l'ouverture de la fiche. Rien si l'article n'est en ligne
 * nulle part et n'a aucun historique.
 * @param {object} p   p.lignes — datesParPlateforme(...)   p.onDetail — ouvre la feuille « En ligne depuis »
 */
export function ResumeDatesEnLigne({ lang = 'fr', lignes = [], onDetail }) {
  const fr = lang !== 'en';
  const enLigne = lignes.filter((l) => l.enLigne);
  const horsLigne = lignes.length - enLigne.length;
  if (!lignes.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {enLigne.map((l) => {
        const depuis = texteDepuis(l.jours, lang);
        return (
          <button key={l.platform} type="button" onClick={onDetail}
            title={fr ? 'Voir le détail et l’historique' : 'See details and history'}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '6px 10px', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${S.border}`, background: '#FFFFFF', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
            <PlatformLogo platform={l.platform} size={22} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, lineHeight: '18px', fontWeight: 700, color: S.ink }}>
                {nom(l.platform)}{' '}
                <span style={{ fontWeight: 600 }}>{depuis ? (fr ? `· en ligne ${depuis}` : `· live ${depuis}`) : (fr ? '· en ligne, date inconnue' : '· live, unknown date')}</span>
              </span>
              <span className="sk-chiffres" style={{ display: 'block', fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2, overflowWrap: 'anywhere' }}>
                {[dateLongue(l.date, lang), libelleNature(l.nature, lang)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0, color: S.ink2 }} />
          </button>
        );
      })}
      {!enLigne.length && (
        <div style={{ fontSize: 12.5, lineHeight: '18px', color: S.ink2 }}>{fr ? 'En ligne nulle part aujourd’hui.' : 'Not live anywhere today.'}</div>
      )}
      <button type="button" onClick={onDetail}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '0 2px', border: 'none', background: 'transparent', color: S.tealDeep, fontSize: 12.5, fontWeight: 700, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
        {horsLigne > 0
          ? (fr ? `Détail par plateforme et historique (dont ${horsLigne} plus en ligne)` : `Details per platform and history (${horsLigne} no longer live)`)
          : (fr ? 'Détail par plateforme et historique' : 'Details per platform and history')}
        <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * @param {object} p
 *   p.titre — le titre de l'article   p.lignes — datesParPlateforme(...)   p.plateformeFiltree — « En ligne sur X »
 *   p.onFermer
 */
export default function DatesEnLigne({ lang = 'fr', titre, lignes = [], plateformeFiltree = null, onFermer }) {
  const fr = lang !== 'en';
  const enLigne = lignes.filter((l) => l.enLigne);
  const horsLigne = lignes.filter((l) => !l.enLigne);
  return (
    <Feuille lang={lang} titre={fr ? 'En ligne depuis' : 'Live since'} onFermer={onFermer}
      etiquette={fr ? `Dates de mise en ligne de ${titre}` : `Listing dates for ${titre}`}>
      <div className="sk-deux-lignes" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ink2, overflowWrap: 'anywhere' }}>{titre}</div>
      {plateformeFiltree && (
        <div style={{ fontSize: 12, lineHeight: '16px', color: S.ink2 }}>
          {fr ? `Filtre actif : la carte montre la date de ${nom(plateformeFiltree)}.` : `Filter on: the card shows the ${nom(plateformeFiltree)} date.`}
        </div>
      )}
      {enLigne.length > 0 && <IntituleSection>{fr ? 'En ligne' : 'Live'}</IntituleSection>}
      {enLigne.map((l) => <BlocPlateforme key={l.platform} lang={lang} ligne={l} />)}
      {horsLigne.length > 0 && <IntituleSection>{fr ? 'Plus en ligne' : 'Not live'}</IntituleSection>}
      {horsLigne.map((l) => <BlocPlateforme key={l.platform} lang={lang} ligne={l} />)}
      {!lignes.length && (
        <div style={{ fontSize: 13, lineHeight: '20px', color: S.ink2 }}>{fr ? 'Aucune mise en ligne connue pour cet article.' : 'No known listing for this item.'}</div>
      )}
      <div style={{ fontSize: 12, lineHeight: '16px', color: S.ink2 }}>
        {fr
          ? 'Ces dates sont celles que suit la republication automatique : la dernière publication ou republication de chaque plateforme ; pour une annonce importée, sa date de mise en ligne lue sur la plateforme.'
          : 'These are the dates automatic reposting follows: the latest listing or repost on each marketplace; for an imported listing, its date read on the marketplace.'}
      </div>
    </Feuille>
  );
}
