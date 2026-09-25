// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRAN DE RAPPROCHEMENT — UNE ANNONCE À LA FOIS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// N'arrivent ici que les annonces relevées dont le rapprochement N'EST PAS
// SÛR : ce que le moteur a reconnu avec certitude est déjà rattaché et ne
// passe jamais par cet écran. C'est un arbitrage, et seul l'utilisateur peut
// le trancher.
//
// ⛔ LE RATTACHEMENT AUTOMATIQUE N'EST PAS TOUCHÉ. On ajoute la sortie
//    MANUELLE pour ce qu'il n'a pas su trancher, rien d'autre : ses règles,
//    ses seuils et son ordre restent en base (rapprocher_classer).
// ⛔ UN SEUL CHEMIN D'ÉCRITURE : `deciderRapprochement`, la fonction qui
//    servait déjà. Aucun second chemin n'est écrit ici — c'est la garantie
//    qu'un rattachement ne peut pas créer de doublon dans le stock, et rien
//    n'est jamais envoyé à la plateforme (l'annonce en ligne n'est pas
//    touchée : on range une fiche, on ne publie pas).
// ⛔ « IGNORER » NE SUPPRIME RIEN. La décision pose `annonces_plateforme.
//    ignoree_le` ; `lireAnnoncesARattacher` filtre sur `ignoree_le IS NULL`.
//    L'annonce sort donc de cette file et n'y revient pas au relevé suivant,
//    sans qu'une ligne soit détruite nulle part.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import { premierePhoto } from '../components/GalleryPhoto';
import { track } from '../analytics/analytics';
import { LABEL_RELEVE, deciderRapprochement } from '../utils/syncPlateformes';
import { classerCandidats, chercherDansStock } from './candidats';
import { motifProposition } from './etatReleve';
import { textesAnnonces } from './textes';
import { A, DEGRADE, CSS_ANNONCES } from './theme';

const prixLisible = (v, fr) => (v == null || v === '' || !Number.isFinite(Number(v))
  ? null
  : `${Number(v).toLocaleString(fr ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`);

const photoDe = (item) => {
  try { return premierePhoto(item?.photos) ?? null; } catch { return null; }
};

// Une vignette carrée : la photo si on en a une, le logo de la plateforme ou
// une pastille neutre sinon. Jamais un cadre vide.
function Vignette({ url, taille = 44, plateforme = null, arrondi = 12 }) {
  if (url) {
    return (
      <div style={{
        width: taille, height: taille, borderRadius: arrondi, flexShrink: 0,
        backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center',
        border: `1px solid ${A.border}`,
      }} />
    );
  }
  return (
    <div style={{
      width: taille, height: taille, borderRadius: arrondi, flexShrink: 0, background: A.paper,
      border: `1px solid ${A.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {plateforme ? <PlatformLogo platform={plateforme} size={Math.round(taille * 0.45)} /> : null}
    </div>
  );
}

export default function EcranRattachement({ lang, items, annonces, onClose, onDecision }) {
  const T = useMemo(() => textesAnnonces(lang), [lang]);
  const fr = lang !== 'en';
  const [busy, setBusy] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);       // texte du résultat de la décision qu'on vient de prendre
  // Les annonces tranchées DANS CETTE SESSION d'écran : la liste `annonces`
  // vient du parent et ne se rafraîchit qu'au poll — sans ça, une annonce
  // déjà rattachée repasserait sous les yeux.
  const [traitees, setTraitees] = useState(() => new Set());

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const file = useMemo(
    () => (Array.isArray(annonces) ? annonces.filter((a) => !traitees.has(a.id)) : []),
    [annonces, traitees],
  );
  // Toujours la PREMIÈRE de la file : une décision retire son annonce de
  // `file`, la suivante prend sa place. Pas de curseur à tenir, donc pas de
  // curseur qui puisse pointer à côté.
  const annonce = file[0] ?? null;

  const candidats = useMemo(() => (annonce ? classerCandidats(annonce, items) : []), [annonce, items]);
  const resultats = useMemo(
    () => (recherche.trim() ? chercherDansStock(items, recherche) : []),
    [items, recherche],
  );

  const titreDe = (invId) => items.find((i) => String(i.id) === String(invId))?.title ?? null;

  const decider = async (decision, inventaireId = null) => {
    if (!annonce || busy) return;
    setBusy(true); setErreur(null);
    const r = await deciderRapprochement(annonce.id, decision, inventaireId)
      .catch((e) => ({ ok: false, message: String(e?.message ?? e) }));
    setBusy(false);
    if (!r?.ok) { setErreur(r?.message ?? r?.reason ?? T.ratErreur); return; }
    track('rapprochement_decision', { platform: annonce.platform, decision });
    setFait(
      decision === 'attache' ? T.ratFaitAttache(titreDe(inventaireId ?? r.inventaire_id) ?? '—')
        : decision === 'import' ? T.ratFaitImport
          : T.ratFaitIgnore,
    );
    setTraitees((v) => new Set([...v, annonce.id]));
    setRecherche('');
    onDecision?.();
  };

  // ── FILE VIDE : on dit que tout est rattaché, on ne laisse pas un écran mort.
  const vide = !annonce;

  const prop = annonce?.proposition && typeof annonce.proposition === 'object' ? annonce.proposition : null;
  const motif = prop ? motifProposition(prop, T, fr) : '';

  // (26/09) Le badge « Le plus probable » ne se pose que sur un candidat FORT
  // (titre exact côté serveur, quasi exact, même ISBN) — jamais sur un voisin
  // au mot près (labouquinerie85 : deux livres différents badgés « probable »).
  // Le motif du serveur reste lu sur le premier ; cadre vert et badge
  // demandent en plus `c.fort`.
  const ligneCandidat = (c, k) => {
    const item = c.item;
    const prix = prixLisible(item.sell, fr);
    const premier = k === 0;
    const probable = premier && c.fort === true;
    return (
      <button
        key={item.id}
        type="button"
        className="rv-up rv-focus"
        disabled={busy}
        onClick={() => decider('attache', item.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
          textAlign: 'left', padding: '9px 11px', borderRadius: 14, fontFamily: 'inherit',
          background: A.card, cursor: busy ? 'default' : 'pointer',
          border: `1px solid ${probable ? A.mentheBord : A.border}`,
          animationDelay: `${k * 35}ms`,
        }}
      >
        <Vignette url={photoDe(item)} taille={38} arrondi={11} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title ?? '—'}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: A.texteSecondaire }}>
            {prix ?? '—'}
            {premier && c.source === 'serveur' && motif ? ` · ${motif}` : ''}
          </span>
        </span>
        {probable && (
          <span style={{
            flexShrink: 0, padding: '4px 9px', borderRadius: 999, background: A.menthe,
            border: `1px solid ${A.mentheBord}`, color: A.tealDeep, fontSize: 10.5, fontWeight: 700,
          }}>{T.ratProbable}</span>
        )}
      </button>
    );
  };

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: A.canvas, borderRadius: '26px 26px 0 0',
          maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '18px 18px calc(env(safe-area-inset-bottom,0px) + 24px)',
          boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      >
        <style>{CSS_ANNONCES}</style>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: A.ink }}>{T.ratTitre}</div>
            {!vide && (
              <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 500, color: A.texteSecondaire, fontVariantNumeric: 'tabular-nums' }}>
                {T.ratPosition(1, file.length)}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={T.ratFermer} className="rv-focus"
            style={{ border: 'none', background: 'transparent', fontSize: 20, color: A.texteSecondaire, cursor: 'pointer', lineHeight: 1, minWidth: 44, minHeight: 44 }}>
            ✕
          </button>
        </div>

        {fait && (
          <div className="rv-up" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 12px', padding: '10px 12px', borderRadius: 12, background: A.menthe, border: `1px solid ${A.mentheBord}` }}>
            <span aria-hidden="true" style={{ color: A.tealDeep, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.45, color: A.ink }}>{fait}</span>
          </div>
        )}

        {erreur && (
          <div style={{ margin: '6px 0 12px', padding: '10px 12px', borderRadius: 12, background: '#FDECEA', border: '1px solid #F3C7C2', fontSize: 12, lineHeight: 1.45, color: A.rougeTexte }}>
            {erreur}
          </div>
        )}

        {vide ? (
          // ── FILE VIDE — jamais un écran mort ──────────────────────────────
          <div className="rv-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 8px 10px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: DEGRADE, color: '#FFFFFF', fontSize: 24, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: A.ink }}>{T.ratVideTitre}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: A.texteSecondaire, maxWidth: 340 }}>{T.ratVideTexte}</div>
            <button type="button" onClick={onClose} className="rv-cta rv-focus"
              style={{ marginTop: 4, minHeight: 44, padding: '0 22px', borderRadius: 999, border: 'none', background: DEGRADE, color: '#FFFFFF', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              {T.ratVideCta}
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: A.texteSecondaire, lineHeight: 1.5, marginBottom: 12 }}>{T.ratIntro}</div>

            {/* ── L'ANNONCE À TRANCHER ───────────────────────────────────── */}
            <div className="rv-up" style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 16, padding: '12px 13px', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <Vignette url={annonce.photo_url} taille={56} plateforme={annonce.platform} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <PlatformLogo platform={annonce.platform} size={15} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: A.texteSecondaire }}>
                    {LABEL_RELEVE[annonce.platform] ?? annonce.platform}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: A.ink, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {annonce.titre || T.ratSansTitre(annonce.listing_id)}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: A.texteSecondaire, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {prixLisible(annonce.prix, fr) && <span style={{ fontWeight: 700, color: A.ink }}>{prixLisible(annonce.prix, fr)}</span>}
                  {annonce.statut_plateforme === 'en_verification' && <span>{T.ratEnVerification}</span>}
                  {annonce.url && (
                    <a href={annonce.url} target="_blank" rel="noreferrer" style={{ color: A.tealDeep, fontWeight: 600 }}>
                      {T.ratVoirAnnonce}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ── EN FACE : LES ARTICLES LES PLUS PROCHES ────────────────── */}
            <div style={{ margin: '16px 0 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: A.texteSecondaire }}>
              {/* (25/09) Une proposition du SERVEUR (reconnaissance probable) se
                  pose en question : « Est-ce le même article ? » — un toucher
                  sur la fiche la rattache. Sans proposition : la liste d'avant. */}
              {candidats[0]?.source === 'serveur' ? T.ratQuestion : T.ratProches}
            </div>
            {/* (26/09) L'import a reconnu un article VENDU du même titre
                (homonyme_vendu) : on ne propose pas de rattacher une annonce
                en ligne à un article vendu, on DIT ce qu'on a vu. La personne
                sait si c'est un autre exemplaire (« Créer ») ou le même,
                vendu, dont l'annonce traîne (« Ignorer », puis la retirer). */}
            {prop?.motif === 'homonyme_vendu' && (
              <div style={{ margin: '0 0 10px', padding: '10px 12px', borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA', fontSize: 12, lineHeight: 1.5, color: '#7C2D12' }}>
                {T.ratHomonymeVendu(prop.titre_fiche || annonce.titre || '')}
              </div>
            )}
            {candidats.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {candidats.map(ligneCandidat)}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: A.texteSecondaire, padding: '2px 2px 6px' }}>{T.ratAucunCandidat}</div>
            )}

            {/* ── LA RECHERCHE LIBRE : pour quand aucune proposition ne va ── */}
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={T.ratChercher}
              aria-label={T.ratChercher}
              className="rv-focus"
              style={{
                marginTop: 10, width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 13px',
                borderRadius: 14, border: `1px solid ${A.border}`, background: A.card,
                fontFamily: 'inherit', fontSize: 16, color: A.ink, outline: 'none',
              }}
            />
            {recherche.trim() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
                {resultats.length
                  ? resultats.map((item, k) => ligneCandidat({ item, source: 'recherche' }, k + 100))
                  : <div style={{ fontSize: 12.5, color: A.texteSecondaire, padding: '4px 2px' }}>{T.ratAucunResultat}</div>}
              </div>
            )}

            {/* ── LES DEUX AUTRES ISSUES ─────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${A.borderSoft}` }}>
              <button type="button" disabled={busy} onClick={() => decider('import')} className="rv-focus"
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: 46, borderRadius: 999,
                  border: `1px solid ${A.border}`, background: A.card, color: A.ink,
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
                }}>
                {T.ratCtaCreer}
              </button>
              <button type="button" disabled={busy} onClick={() => decider('ignore')} className="rv-focus"
                style={{
                  width: '100%', boxSizing: 'border-box', minHeight: 44, borderRadius: 999,
                  border: 'none', background: 'transparent', color: A.texteSecondaire,
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
                }}>
                {T.ratCtaIgnorer}
              </button>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: A.texteSecondaire, textAlign: 'center' }}>{T.ratIgnorerNote}</div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
