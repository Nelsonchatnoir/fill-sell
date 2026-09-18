// ═══════════════════════════════════════════════════════════════════════════
// « C'EST LE MÊME QU'UN ARTICLE DE MON STOCK » (2026-09-18, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// Trois temps, dans cet ordre, parce que c'est l'ordre dans lequel la question
// se pose : 1. lequel ? · 2. lequel des deux je garde ? · 3. voilà ce qui se
// passe, je confirme.
//
// ⛔ LEQUEL EST GARDÉ N'EST JAMAIS PRÉSÉLECTIONNÉ. C'est un choix, pas un
//    défaut : les deux cartes partent à égalité, le bouton reste inerte tant
//    qu'on n'a pas tranché. Un défaut ici deviendrait le choix de tout le
//    monde, et ce n'est pas à nous de décider quelle fiche survit.
// ⛔ ON DIT AVANT DE CONFIRMER que les annonces en ligne des DEUX articles
//    restent en ligne et se retrouvent sur l'article gardé. Rien n'est retiré,
//    rien n'est déclaré vendu. C'est la phrase qui évite qu'on lise « fusion »
//    comme « suppression ».
// ⛔ L'APERÇU vient des lignes de la BASE (lireCouple), pas des objets en
//    mémoire : `mapItem` ne transporte pas `attributs`. Cf. fusionArticles.js.
// ⛔ Une fusion ne part pas sur un article déjà absorbé (`fusionne_dans` non
//    nul) ni sur lui-même — vérifié ici ET dans la RPC.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFondFige } from '../utils/modale';
import { lireCouple, apercuReprise, fusionnerArticles } from '../utils/fusionArticles';

const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute: '#8A8578', mute2: '#5C6560',
  teal: '#2F9E90', tealDeep: '#1B6E62', amberBg: '#FFF6E3', amberBd: '#EED9A6', amberInk: '#8A6100',
};
const VOILE = {
  position: 'fixed', inset: 0, background: 'rgba(16,32,27,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: 16, overflowY: 'auto', overscrollBehavior: 'contain',
};
const CARTE = {
  background: '#F6F5F1', borderRadius: 16, border: `1px solid ${P.border}`,
  width: '100%', maxWidth: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  fontFamily: 'inherit', margin: 'auto',
  maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column',
};

const premierePhoto = (photos) => (Array.isArray(photos) && photos.length
  ? (typeof photos[0] === 'string' ? photos[0] : photos[0]?.url ?? null) : null);

function Vignette({ item, taille = 40 }) {
  const url = premierePhoto(item?.photos);
  return url
    ? <div style={{ width: taille, height: taille, borderRadius: 9, flexShrink: 0, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
    : <div style={{ width: taille, height: taille, borderRadius: 9, flexShrink: 0, background: '#E7E3D8' }} />;
}

export default function FusionArticleModal({ lang, user, item, items = [], onClose, onFait }) {
  const fr = lang !== 'en';
  useFondFige(true);
  const [recherche, setRecherche] = useState('');
  const [autre, setAutre] = useState(null);     // l'article choisi comme partenaire
  const [garde, setGarde] = useState(null);     // id de celui qu'on garde — JAMAIS pré-rempli
  const [couple, setCouple] = useState(null);   // les deux lignes relues en base
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const surTouche = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onClose]);

  // Les deux lignes de la base, dès que le partenaire est choisi.
  // ⚠️ Pas de setState synchrone ici : la remise à zéro se fait au geste qui
  //    change de partenaire (setAutre), pas dans l effet. Un setState dans le
  //    corps d un effet enchaîne les rendus — et le lint du projet le refuse.
  useEffect(() => {
    let annule = false;
    const idAutre = autre?.id, idMoi = item?.id, uid = user?.id;
    if (idAutre == null || idMoi == null || !uid) return undefined;
    lireCouple(uid, idMoi, idAutre).then((l) => { if (!annule) setCouple(l); }).catch(() => {});
    return () => { annule = true; };
  }, [autre?.id, item?.id, user?.id]);

  const candidats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const base = items.filter((i) => String(i.id) !== String(item.id) && i.statut !== 'vendu');
    if (!q) return base.slice(0, 15);
    return base.filter((i) => String(i.title ?? '').toLowerCase().includes(q)).slice(0, 15);
  }, [items, item.id, recherche]);

  const ligne = (id) => (couple ?? []).find((l) => String(l.id) === String(id)) ?? null;
  const ligneGarde = garde ? ligne(garde) : null;
  const ligneAbsorbe = garde ? ligne(String(garde) === String(item.id) ? autre?.id : item.id) : null;
  const apercu = useMemo(() => apercuReprise(ligneGarde, ligneAbsorbe, fr), [ligneGarde, ligneAbsorbe, fr]);
  // Garde de forme, doublée côté base : ni soi-même, ni un article déjà absorbé.
  const dejaAbsorbe = (couple ?? []).find((l) => l.fusionne_dans != null) ?? null;
  const peutPartir = !!garde && !!ligneGarde && !!ligneAbsorbe && !dejaAbsorbe && !busy;

  const confirmer = async () => {
    if (!peutPartir) return;
    setBusy(true); setErr(null);
    const r = await fusionnerArticles(Number(ligneGarde.id), Number(ligneAbsorbe.id));
    setBusy(false);
    if (!r?.ok) {
      setErr(r?.message ?? ({
        articles_identiques: fr ? "C'est le même article." : 'Same item.',
        article_introuvable: fr ? 'Article introuvable.' : 'Item not found.',
        deja_fusionne: fr ? "L'un des deux a déjà été fusionné." : 'One of them is already merged.',
      }[r?.reason] ?? (fr ? 'Fusion impossible.' : 'Merge failed.')));
      return;
    }
    onFait?.(r);
  };

  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose} style={VOILE}>
      <div onClick={(e) => e.stopPropagation()} style={CARTE}>
        <div style={{ padding: 20, overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ flex: 1, fontSize: 15.5, fontWeight: 700, color: P.ink }}>
              {fr ? "C'est le même article" : "It's the same item"}
            </div>
            <button type="button" onClick={onClose} aria-label={fr ? 'Fermer' : 'Close'}
              style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, border: `1px solid ${P.border}`, background: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: P.mute2, fontFamily: 'inherit' }}>×</button>
          </div>
          <div style={{ fontSize: 12.5, color: P.mute2, lineHeight: 1.5, marginBottom: 14 }}>
            {fr ? "Les deux fiches n'en feront plus qu'une. Tout l'historique de celle qui est absorbée — ventes, prix d'achat, annonces, publications — passe sur celle que tu gardes."
                : 'The two items become one. All the history of the absorbed one — sales, purchase price, listings, publications — moves onto the one you keep.'}
          </div>

          {/* 1. LEQUEL ─────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 12, background: '#fff', border: `1px solid ${P.border}`, marginBottom: 10 }}>
            <Vignette item={item} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: P.mute, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{fr ? 'Cet article' : 'This item'}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: P.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
            </div>
          </div>

          {!autre ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: P.mute, marginBottom: 6 }}>
                {fr ? 'Avec lequel de ton stock ?' : 'With which item in your stock?'}
              </div>
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus
                placeholder={fr ? 'Chercher un article…' : 'Search an item…'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${P.border}`, background: '#fff', fontSize: 14, color: P.ink, fontFamily: 'inherit', marginBottom: 8 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {candidats.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setAutre(c); setGarde(null); setCouple(null); setErr(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: '#fff', border: `1px solid ${P.border}`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    <Vignette item={c} taille={34} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: P.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                    {c.sell != null && <span style={{ fontSize: 12, color: P.mute2, flexShrink: 0 }}>{c.sell} €</span>}
                  </button>
                ))}
                {candidats.length === 0 && (
                  <div style={{ fontSize: 12.5, color: P.mute }}>{fr ? 'Aucun article ne correspond.' : 'No item matches.'}</div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* 2. LEQUEL EST GARDÉ — aucun des deux n'est coché d'avance. */}
              <div style={{ fontSize: 11, fontWeight: 600, color: P.mute, marginBottom: 6 }}>
                {fr ? 'Laquelle des deux fiches gardes-tu ?' : 'Which of the two do you keep?'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {[item, autre].map((c) => {
                  const choisi = String(garde ?? '') === String(c.id);
                  const l = ligne(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => { setGarde(c.id); setErr(null); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        background: choisi ? '#F0FDFB' : '#fff', border: `1px solid ${choisi ? P.teal : P.border}` }}>
                      <span style={{ width: 16, height: 16, borderRadius: 999, flexShrink: 0, border: `2px solid ${choisi ? P.tealDeep : P.border}`, background: choisi ? P.tealDeep : '#fff' }} />
                      <Vignette item={c} taille={34} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: P.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: P.mute2 }}>
                          {l?.origine?.startsWith('releve_') ? (fr ? 'venu d’un relevé' : 'from a scan') : (fr ? 'fiche de ton stock' : 'item in your stock')}
                          {l?.prix_vente != null ? ` · ${l.prix_vente} €` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {dejaAbsorbe && (
                <div style={{ fontSize: 12.5, color: P.amberInk, background: P.amberBg, border: `1px solid ${P.amberBd}`, borderRadius: 10, padding: '9px 11px', marginBottom: 12, lineHeight: 1.5 }}>
                  {fr ? '« ' + dejaAbsorbe.titre + ' » a déjà été fusionné avec un autre article. Défais d’abord cette fusion-là.'
                      : '“' + dejaAbsorbe.titre + '” has already been merged with another item. Undo that merge first.'}
                </div>
              )}

              {/* 3. CE QUI SE PASSE ─────────────────────────────────────── */}
              {garde && couple && !dejaAbsorbe && (
                <div style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 12, padding: '11px 12px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: P.mute, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    {fr ? 'Ce qui sera repris' : 'What will be taken over'}
                  </div>
                  {apercu.repris.length ? apercu.repris.map((r) => (
                    <div key={r.cle} style={{ fontSize: 12.5, color: P.ink, lineHeight: 1.6 }}>
                      · {r.libelle} <span style={{ color: P.mute2 }}>— {r.valeur}</span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 12.5, color: P.mute2 }}>{fr ? 'Rien à reprendre : la fiche gardée est déjà complète.' : 'Nothing to take over: the kept item is already complete.'}</div>
                  )}
                  {apercu.conserves.length > 0 && (
                    <div style={{ fontSize: 11.5, color: P.mute, lineHeight: 1.6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${P.border}` }}>
                      {fr ? 'Ne bouge pas (déjà renseigné sur la fiche gardée) : ' : 'Unchanged (already set on the kept item): '}
                      {apercu.conserves.map((c) => c.libelle).join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {/* LA PHRASE QUI DOIT ÊTRE LUE AVANT DE CONFIRMER. */}
              <div style={{ fontSize: 12, color: P.mute2, lineHeight: 1.55, background: P.paper, border: `1px solid ${P.border}`, borderRadius: 10, padding: '10px 11px', marginBottom: 12 }}>
                {fr ? 'Les annonces en ligne des DEUX articles restent en ligne et se retrouvent sur l’article gardé. Rien n’est retiré d’une plateforme, rien n’est déclaré vendu. Tu peux défaire cette fusion à tout moment.'
                    : 'The live listings of BOTH items stay online and end up on the item you keep. Nothing is removed from any platform, nothing is recorded as sold. You can undo this merge at any time.'}
              </div>

              {err && <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{err}</div>}
            </>
          )}
        </div>

        <div style={{ padding: '12px 20px 16px', borderTop: `1px solid ${P.border}`, background: '#F6F5F1', borderRadius: '0 0 16px 16px', flex: '0 0 auto', display: 'flex', gap: 10 }}>
          {autre && (
            <button type="button" disabled={!peutPartir} onClick={confirmer}
              style={{ flex: 1.4, padding: '12px 0', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                background: peutPartir ? `linear-gradient(120deg,${P.teal},${P.tealDeep})` : '#B9C4C0',
                color: '#fff', cursor: peutPartir ? 'pointer' : 'default' }}>
              {busy ? (fr ? 'Fusion…' : 'Merging…') : (fr ? 'Fusionner' : 'Merge')}
            </button>
          )}
          <button type="button" onClick={autre ? () => { setAutre(null); setGarde(null); setCouple(null); setErr(null); } : onClose}
            style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: `1px solid ${P.border}`, background: '#fff', color: P.mute2, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {autre ? (fr ? 'Changer d’article' : 'Change item') : (fr ? 'Annuler' : 'Cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
