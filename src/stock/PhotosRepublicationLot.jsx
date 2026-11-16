// ═══════════════════════════════════════════════════════════════════════════
// FEUILLE DE REPUBLICATION › LES PHOTOS, PAR ARTICLE ET PAR PLATEFORME (16/11/2026, point 7 — Marc)
// ═══════════════════════════════════════════════════════════════════════════
// Un accès EN PLUS, jamais une étape : replié par défaut (une ligne), rien n'est écrit sans un geste. Déplié : la liste
// des articles de la feuille (photo, titre, repère « photos modifiées ») ; un article ouvert : un onglet par plateforme
// cochée qui le concerne, et dessous le composant de la publication, tel quel (publication/PhotosPlateforme.jsx).
// Pensé pour des dizaines d'articles sur téléphone : une ligne de 56 px par article, un seul article ouvert à la fois.
// Règles : ./photosRepublication.js.
import { useState } from 'react';
import { Check, ChevronRight, ChevronLeft, Camera } from 'lucide-react';
import { LIBELLE_PLATEFORME as NOMS } from '../utils/stockFiltres';
import PhotosPlateforme from '../publication/PhotosPlateforme';
import GalleryPhoto from '../components/GalleryPhoto';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { urlsDeLaFiche, poserChoix, choixPour, articlesModifies } from './photosRepublication';

// La palette que PhotosPlateforme attend (mêmes teintes que la feuille de republication).
const T = { border: '#E7E3D8', chip: '#F6F5F1', ink: '#10201B', mute2: '#5C6560', tealDeep: '#1B6E62' };

/**
 * @param {object} p
 *   p.items [{item, plateformes}] — les articles de la feuille et leurs plateformes republiables
 *   p.cochees (p) → la plateforme est-elle cochée dans la feuille ?
 *   p.etat / p.setEtat — les choix, { [itemId]: { [plateforme]: urls } }
 */
export default function PhotosRepublicationLot({ lang = 'fr', items = [], cochees = () => true, etat, setEtat }) {
  const fr = lang !== 'en';
  const [ouvert, setOuvert] = useState(false);
  const [articleId, setArticleId] = useState(null);
  const [onglet, setOnglet] = useState(null);
  const plateformesDe = (it) => (items.find((x) => String(x.item?.id) === String(it?.id))?.plateformes ?? ['vinted']).filter(cochees);
  // Quelques dizaines d'articles × 5 plateformes au plus : recalculé à chaque rendu, sans mémoïsation.
  const modifies = articlesModifies(etat, items.map((x) => x.item), plateformesDe);
  const avecPhotos = items.filter(({ item }) => urlsDeLaFiche(item?.photos).length >= 2);
  if (!avecPhotos.length) return null; // aucune photo à choisir (une seule par article) : rien à montrer

  const ligne = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '6px 8px', boxSizing: 'border-box', border: 'none', background: 'transparent', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' };
  const solo = items.length === 1;
  const courant = articleId != null ? items.find((x) => String(x.item?.id) === String(articleId))?.item ?? null : (solo ? items[0].item : null);
  const pfsCourant = courant ? plateformesDe(courant) : [];
  const ongletVu = pfsCourant.includes(onglet) ? onglet : pfsCourant[0] ?? null;

  return (
    <div data-photos-republication="" style={{ marginBottom: 12, border: `1px solid ${T.border}`, borderRadius: 14, background: T.chip }}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} style={{ ...ligne, padding: '10px 12px', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Camera size={15} aria-hidden="true" />{fr ? 'Photos par plateforme' : 'Photos per platform'}
          <span style={{ fontWeight: 500, color: T.mute2 }}>{fr ? ' · facultatif' : ' · optional'}</span>
          {modifies.size > 0 && (
            <span style={{ fontWeight: 700, color: T.tealDeep }}>
              {' · '}{fr ? `${modifies.size} article${modifies.size > 1 ? 's' : ''} modifié${modifies.size > 1 ? 's' : ''}` : `${modifies.size} item${modifies.size > 1 ? 's' : ''} changed`}
            </span>
          )}
        </span>
        <ChevronRight size={16} color={T.mute2} style={{ transform: ouvert ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
      </button>
      {ouvert && (
        <div style={{ padding: '0 8px 10px' }}>
          <div style={{ fontSize: 11.5, color: T.mute2, lineHeight: 1.45, padding: '0 4px 8px' }}>
            {fr ? 'Sans rien toucher, chaque annonce repart avec ses photos. Choisis, retire, ajoute ou réordonne ici les photos de ta fiche, plateforme par plateforme.'
              : 'Leave it as is and each listing goes out with its photos. Choose, remove, add or reorder your item’s photos here, platform by platform.'}
          </div>
          {!courant && (
            <div role="list">
              {avecPhotos.map(({ item }) => {
                const modif = modifies.has(String(item.id));
                return (
                  <button key={item.id} type="button" role="listitem" onClick={() => { setArticleId(item.id); setOnglet(null); }} style={ligne}
                    aria-label={`${item.title}${modif ? (fr ? ' — photos modifiées' : ' — photos changed') : ''}`}>
                    <span style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#fff' }}>
                      <GalleryPhoto url={urlsDeLaFiche(item.photos)[0]} alt="" fallback={<span />} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        {plateformesDe(item).map((p) => <PlatformLogo key={p} platform={p} size={12} />)}
                        {modif && (
                          <span data-photos-modifiees="" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: T.tealDeep, marginLeft: 4 }}>
                            <Check size={12} strokeWidth={3} aria-hidden="true" />{fr ? 'photos modifiées' : 'photos changed'}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={16} color={T.mute2} style={{ flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
          {courant && (
            <div>
              {!solo && (
                <button type="button" onClick={() => setArticleId(null)} style={{ ...ligne, minHeight: 40, color: T.tealDeep, fontSize: 13, fontWeight: 700 }}>
                  <ChevronLeft size={16} />{fr ? 'Tous les articles' : 'All items'}
                </button>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, padding: '4px 4px 8px' }}>{courant.title}</div>
              {pfsCourant.length > 1 && (
                <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 4px 10px' }}>
                  {pfsCourant.map((p) => {
                    const actif = p === ongletVu;
                    const modif = Boolean(choixPour(etat, courant, p));
                    return (
                      <button key={p} type="button" role="tab" aria-selected={actif} onClick={() => setOnglet(p)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                          border: `1px solid ${actif ? '#2F9E90' : T.border}`, background: actif ? '#E7F3F0' : '#fff', color: actif ? T.tealDeep : T.ink }}>
                        <PlatformLogo platform={p} size={13} />{NOMS[p] ?? p}{modif ? ' ✓' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
              {ongletVu && (
                <div style={{ padding: '0 4px' }}>
                  <PhotosPlateforme
                    key={`${courant.id}|${ongletVu}`}
                    platform={ongletVu}
                    toutes={urlsDeLaFiche(courant.photos)}
                    choix={etat?.[String(courant.id)]?.[ongletVu] ?? null}
                    onChange={(urls) => setEtat((prev) => poserChoix(prev, courant.id, ongletVu, urls))}
                    T={T}
                    lang={lang}
                  />
                </div>
              )}
              {!pfsCourant.length && (
                <div style={{ fontSize: 12, color: T.mute2, padding: '0 4px' }}>{fr ? 'Aucune plateforme cochée pour cet article.' : 'No platform ticked for this item.'}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
