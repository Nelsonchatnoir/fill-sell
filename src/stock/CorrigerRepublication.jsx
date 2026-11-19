// ═══════════════════════════════════════════════════════════════════════════
// FEUILLE DE REPUBLICATION › CORRIGER UN ARTICLE AVANT QU'IL REPARTE (19/11/2026, maquettes lot-1911 validées par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « Le même principe en republication » : la liste de ce qui repart ; toucher un article ouvre ce qui part sur chaque
// plateforme (titre, description, prix, état, marque, taille, couleur, matière, poids), et tout se corrige — pour
// toutes ses plateformes (défaut) ou seulement pour l'une. La fiche reçoit la correction au geste ; la tâche la porte à
// l'envoi (./correctionsRepublication.js). Un accès EN PLUS, replié, jamais une étape : sans rien toucher, chaque annonce
// repart comme avant.
// Même patron que PhotosRepublicationLot (une ligne de 56 px par article, un seul article ouvert à la fois).
import { useState } from 'react';
import { ChevronRight, ChevronLeft, PenLine, Check } from 'lucide-react';
import { LIBELLE_PLATEFORME as NOMS } from '../utils/stockFiltres';
import GalleryPhoto from '../components/GalleryPhoto';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { urlsDeLaFiche } from './photosRepublication';
import { PORTEE_TOUTES, ETATS_ARTICLE, plateformeSansTitre } from '../publication/lot/corrections';
import {
  CHAMPS_REPUBLICATION, valeurDeLaFiche, valeurQuiRepart, avecCorrection, champsCorriges, patchFicheRepublication,
} from './correctionsRepublication';

const T = { border: '#E7E3D8', chip: '#F6F5F1', ink: '#10201B', mute2: '#5C6560', tealDeep: '#1B6E62', teal: '#2F9E90', tealFond: '#E7F3F0', ambre: '#8A6100', ambreFond: '#FFF6E3' };
const LIB = {
  fr: { titre: 'Titre', description: 'Description', prix: 'Prix', etat: 'État', marque: 'Marque', taille: 'Taille', couleur: 'Couleur', matiere: 'Matière', poids: 'Poids' },
  en: { titre: 'Title', description: 'Description', prix: 'Price', etat: 'Condition', marque: 'Brand', taille: 'Size', couleur: 'Colour', matiere: 'Material', poids: 'Weight' },
};
// Ce que la republication fait de la correction, plateforme par plateforme — dit tel quel, jamais une promesse.
const NOTE_PF = {
  fr: {
    vinted: 'Vinted recrée l’annonce telle qu’elle est en ligne : ta correction est gardée sur ta fiche, et part sur Vinted dès que FillSell sait la poser sur l’annonce recréée (bientôt).',
    autre: 'La correction est gardée sur ta fiche et posée sur la republication.',
  },
  en: {
    vinted: 'Vinted recreates the listing as it is online: your correction is kept on your item, and goes to Vinted as soon as FillSell can apply it to the recreated listing (soon).',
    autre: 'The correction is kept on your item and set on the repost.',
  },
};

const montrer = (cle, v, fr) => {
  if (v == null || String(v).trim() === '') return fr ? 'À ajouter' : 'To add';
  if (cle === 'prix') { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? (fr ? `${String(n).replace('.', ',')} €` : `€${n}`) : String(v); }
  if (cle === 'poids') { const g = Number(v); return Number.isFinite(g) ? (g < 1000 ? `${g} g` : `${String(Math.round(g / 100) / 10).replace('.', fr ? ',' : '.')} kg`) : String(v); }
  return String(v);
};

function Ligne({ cle, valeur, marque, ouvert, onToucher, fr, children }) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}` }}>
      <button type="button" onClick={onToucher} aria-expanded={ouvert}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', minHeight: 44, padding: '10px 10px', border: 'none', background: 'transparent', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
        <span style={{ width: 82, flexShrink: 0, fontSize: 12.5, color: T.mute2 }}>{LIB[fr ? 'fr' : 'en'][cle]}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: T.ink, overflowWrap: 'anywhere', whiteSpace: cle === 'description' ? 'pre-wrap' : 'normal' }}>
          {montrer(cle, valeur, fr)}
          {marque ? <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: T.tealDeep, background: T.tealFond, borderRadius: 999, padding: '1px 7px' }}>{marque}</span> : null}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.tealDeep }}>{fr ? 'Modifier' : 'Edit'}</span>
      </button>
      {ouvert ? <div style={{ padding: '0 10px 12px' }}>{children}</div> : null}
    </div>
  );
}

function Editeur({ cle, valeur, plateforme, plateformes, fr, onGarder }) {
  const multi = plateforme && plateformes.length > 1;
  const [portee, setPortee] = useState(PORTEE_TOUTES);
  const [v, setV] = useState(valeur ?? '');
  const toutes = portee === PORTEE_TOUTES;
  const bouton = (on) => ({ flex: 1, minWidth: 140, textAlign: 'left', padding: '8px 10px', borderRadius: 12, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${on ? T.teal : T.border}`, background: on ? T.tealFond : '#fff' });
  const garder = (x = v) => { if (cle !== 'description' && !String(x ?? '').trim()) return; onGarder(x, toutes ? PORTEE_TOUTES : plateforme); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {multi && cle !== 'poids' ? (
        <div role="radiogroup" aria-label={fr ? "S'applique à" : 'Applies to'} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" role="radio" aria-checked={toutes} onClick={() => setPortee(PORTEE_TOUTES)} style={bouton(toutes)}>
            <b style={{ fontSize: 12.5, color: T.ink }}>{fr ? 'Toutes ses plateformes' : 'All its platforms'}</b>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: T.mute2, marginTop: 2 }}>
              {plateformes.map((p) => <PlatformLogo key={p} platform={p} size={12} />)}{fr ? ' gardé sur la fiche' : ' kept on the item'}
            </span>
          </button>
          <button type="button" role="radio" aria-checked={!toutes} onClick={() => setPortee(plateforme)} style={bouton(!toutes)}>
            <b style={{ fontSize: 12.5, color: T.ink }}>{fr ? `Seulement sur ${NOMS[plateforme] ?? plateforme}` : `Only on ${NOMS[plateforme] ?? plateforme}`}</b>
            <span style={{ display: 'block', fontSize: 11, color: T.mute2, marginTop: 2 }}>{fr ? 'les autres ne changent pas' : "the others don't change"}</span>
          </button>
        </div>
      ) : null}
      {cle === 'etat' ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ETATS_ARTICLE.map((x) => (
            <button key={x} type="button" onClick={() => garder(x)}
              style={{ padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${x === v ? T.teal : T.border}`, background: x === v ? T.tealFond : '#fff', color: x === v ? T.tealDeep : T.ink }}>
              {x === v ? '✓ ' : ''}{x}
            </button>
          ))}
        </div>
      ) : cle === 'description' ? (
        <textarea value={v} onChange={(e) => setV(e.target.value)} rows={6} aria-label={LIB[fr ? 'fr' : 'en'][cle]}
          style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.45, resize: 'vertical' }} />
      ) : (
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); garder(); } }}
          inputMode={cle === 'prix' || cle === 'poids' ? 'decimal' : undefined} aria-label={LIB[fr ? 'fr' : 'en'][cle]}
          placeholder={cle === 'poids' ? (fr ? 'en grammes, ex. 650' : 'in grams, e.g. 650') : ''}
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit' }} />
      )}
      {cle !== 'etat' ? (
        <button type="button" onClick={() => garder()} disabled={cle !== 'description' && !String(v ?? '').trim()}
          style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 999, border: 'none', background: T.teal, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          {fr ? 'Garder' : 'Save'}
        </button>
      ) : null}
      {cle === 'poids' ? <span style={{ fontSize: 11.5, color: T.mute2 }}>{fr ? 'Le poids de l’article : Leboncoin et Beebs s’en servent.' : 'The item’s weight: Leboncoin and Beebs use it.'}</span> : null}
    </div>
  );
}

/**
 * @param {object} p
 *   p.items [{item, plateformes}] — les articles de la feuille et leurs plateformes republiables
 *   p.cochees (p) → la plateforme est-elle cochée dans la feuille ?
 *   p.corrections / p.setCorrections — { [itemId]: { toutes, parPf } }
 *   p.supabase, p.userId — l'écriture sur la fiche, le journal
 */
export default function CorrigerRepublication({ lang = 'fr', items = [], cochees = () => true, corrections, setCorrections, supabase = null, userId = null }) {
  const fr = lang !== 'en';
  const solo = items.length === 1;
  const [ouvert, setOuvert] = useState(false); // replié : le chemin rapide reste celui d'avant
  const [articleId, setArticleId] = useState(null);
  const [onglet, setOnglet] = useState('article');
  const [ligne, setLigne] = useState(null);
  const plateformesDe = (it) => (items.find((x) => String(x.item?.id) === String(it?.id))?.plateformes ?? ['vinted']).filter(cochees);
  const modifies = items.filter(({ item }) => champsCorriges(corrections?.[String(item.id)]).length > 0).length;
  const courant = articleId != null ? items.find((x) => String(x.item?.id) === String(articleId))?.item ?? null : (solo ? items[0]?.item ?? null : null);
  const pfs = courant ? plateformesDe(courant) : [];
  const ongletVu = onglet === 'article' || pfs.includes(onglet) ? onglet : 'article';
  const c = courant ? corrections?.[String(courant.id)] ?? null : null;

  const garder = (cle, valeur, portee) => {
    if (!courant) return;
    setCorrections((prev) => ({ ...prev, [String(courant.id)]: avecCorrection(prev?.[String(courant.id)], { cle, valeur, portee }) }));
    const { colonnes, attributs } = patchFicheRepublication({ item: courant, cle, valeur, portee });
    const maj = { ...colonnes, ...(Object.keys(attributs).length ? { attributs } : {}) };
    if (supabase && userId && Object.keys(maj).length) {
      supabase.from('inventaire').update(maj).eq('id', courant.id).eq('user_id', userId).select('id')
        .then(({ error }) => { if (error) console.warn('[republication] correction non gardée sur la fiche :', error.message); }, () => {});
    }
    if (supabase && userId) {
      supabase.from('usage_logs').insert({ user_id: userId, feature: 'republication_correction', metadata: {
        champ: cle, portee: portee === PORTEE_TOUTES ? 'toutes' : 'plateforme', plateforme: portee === PORTEE_TOUTES ? null : portee, plateformes: pfs.length,
      } }).then(() => {}, () => {});
    }
    setLigne(null);
  };

  const ligneArticle = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '6px 8px', boxSizing: 'border-box', border: 'none', background: 'transparent', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' };
  const champs = ongletVu === 'article' ? CHAMPS_REPUBLICATION : CHAMPS_REPUBLICATION.filter((k) => k !== 'poids' && !(k === 'titre' && plateformeSansTitre(ongletVu)));
  return (
    <div data-corriger-republication="" style={{ marginBottom: 12, border: `1px solid ${T.border}`, borderRadius: 14, background: T.chip }}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} style={{ ...ligneArticle, padding: '10px 12px', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <PenLine size={15} aria-hidden="true" />{fr ? 'Ce qui repart · corriger un article' : 'What goes out · correct an item'}
          <span style={{ fontWeight: 500, color: T.mute2 }}>{fr ? ' · facultatif' : ' · optional'}</span>
          {modifies > 0 && <span style={{ fontWeight: 700, color: T.tealDeep }}>{' · '}{fr ? `${modifies} modifié${modifies > 1 ? 's' : ''}` : `${modifies} changed`}</span>}
        </span>
        <ChevronRight size={16} color={T.mute2} style={{ transform: ouvert ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
      </button>
      {ouvert && (
        <div style={{ padding: '0 8px 10px' }}>
          {!courant && (
            <>
              <div style={{ fontSize: 11.5, color: T.mute2, lineHeight: 1.45, padding: '0 4px 8px' }}>
                {fr ? 'Sans rien toucher, chaque annonce repart comme avant. Touche un article pour corriger ce qui repart (taille, couleur, prix…), sur toutes ses plateformes ou une seule.'
                  : 'Leave it as is and each listing goes out as before. Tap an item to correct what goes out (size, colour, price…), on all its platforms or just one.'}
              </div>
              <div role="list">
                {items.map(({ item }) => {
                  const corr = champsCorriges(corrections?.[String(item.id)]);
                  return (
                    <button key={item.id} type="button" role="listitem" onClick={() => { setArticleId(item.id); setOnglet('article'); setLigne(null); }} style={ligneArticle}>
                      <span style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#fff' }}>
                        <GalleryPhoto url={urlsDeLaFiche(item.photos)[0]} alt="" fallback={<span />} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.ink, overflowWrap: 'anywhere' }}>{item.title}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                          {plateformesDe(item).map((p) => <PlatformLogo key={p} platform={p} size={12} />)}
                          {corr.length > 0 && (
                            <span data-article-corrige="" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: T.tealDeep, marginLeft: 4 }}>
                              <Check size={12} strokeWidth={3} aria-hidden="true" />{fr ? 'modifié : ' : 'changed: '}{corr.map((k) => LIB[fr ? 'fr' : 'en'][k]?.toLowerCase() ?? k).join(', ')}
                            </span>
                          )}
                        </span>
                      </span>
                      <ChevronRight size={16} color={T.mute2} style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {courant && (
            <div>
              {!solo && (
                <button type="button" onClick={() => { setArticleId(null); setLigne(null); }} style={{ ...ligneArticle, minHeight: 40, color: T.tealDeep, fontSize: 13, fontWeight: 700 }}>
                  <ChevronLeft size={16} />{fr ? 'Tous les articles' : 'All items'}
                </button>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, padding: '4px 4px 8px', overflowWrap: 'anywhere' }}>{courant.title}</div>
              <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 4px 10px' }}>
                {['article', ...pfs].map((p) => {
                  const actif = p === ongletVu;
                  return (
                    <button key={p} type="button" role="tab" aria-selected={actif} onClick={() => { setOnglet(p); setLigne(null); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${actif ? T.teal : T.border}`, background: actif ? T.tealFond : '#fff', color: actif ? T.tealDeep : T.ink }}>
                      {p === 'article' ? (fr ? "L'article" : 'The item') : <><PlatformLogo platform={p} size={13} />{NOMS[p] ?? p}</>}
                    </button>
                  );
                })}
              </div>
              {ongletVu !== 'article' && (
                <div style={{ fontSize: 11.5, color: ongletVu === 'vinted' ? T.ambre : T.mute2, background: ongletVu === 'vinted' ? T.ambreFond : 'transparent', borderRadius: 10, padding: ongletVu === 'vinted' ? '8px 10px' : '0 4px 6px', lineHeight: 1.45, marginBottom: 6 }}>
                  {NOTE_PF[fr ? 'fr' : 'en'][ongletVu === 'vinted' ? 'vinted' : 'autre']}
                </div>
              )}
              <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {champs.map((cle) => {
                  const p = ongletVu === 'article' ? null : ongletVu;
                  const v = p ? valeurQuiRepart(courant, c, p, cle) : (c?.toutes?.[cle] ?? valeurDeLaFiche(courant, cle));
                  const aPart = p && c?.parPf?.[p]?.[cle] != null;
                  return (
                    <Ligne key={`${ongletVu}:${cle}`} cle={cle} valeur={v} fr={fr} ouvert={ligne === cle} onToucher={() => setLigne((l) => (l === cle ? null : cle))}
                      marque={aPart ? (fr ? `pour ${NOMS[p] ?? p} seulement` : `only on ${NOMS[p] ?? p}`) : null}>
                      <Editeur cle={cle} valeur={v} plateforme={p} plateformes={pfs} fr={fr} onGarder={(x, portee) => garder(cle, x, portee)} />
                    </Ligne>
                  );
                })}
              </div>
              {pfs.length === 0 && (
                <div style={{ fontSize: 12, color: T.mute2, padding: '6px 4px' }}>{fr ? 'Aucune plateforme cochée pour cet article.' : 'No platform ticked for this item.'}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
