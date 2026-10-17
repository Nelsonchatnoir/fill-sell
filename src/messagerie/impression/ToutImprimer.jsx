// ═══════════════════════════════════════════════════════════════════════════
// « TOUT IMPRIMER » : LES BORDEREAUX PRÊTS EN UN SEUL PDF (bêta, 16/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Une feuille : format « Étiquettes 10 × 15 » (une étiquette par page, le
// recadrage retenu pour chaque transporteur, sinon la détection) ou « Format
// d'origine » (toutes les pages telles quelles), l'aperçu de la première page,
// le compte (bordereaux, pages), puis partager / télécharger / imprimer.
// Un bordereau illisible est DIT (jamais sauté en silence).
import { useEffect, useRef, useState } from 'react';
// (17/10) Une Couche (../Couche.jsx) : portail sur document.body, barre du bas
// masquée, Échap et retour Android — sur iPhone, une couche rendue dans l'app
// passait sous l'en-tête et la barre du bas.
import { UI } from '../../components/ui';
import Couche from '../Couche';
import Icone from '../../ecrans/Icone';
import PlatformLogo from '../../components/platform-logos/PlatformLogo';
import { chargerCopieBordereau, recadrageRetenu } from './copies';
import { fichier, imprimer, partager, telechargerFichier } from './partage';
import { Bouton, Note, Segments } from './ui';
import { ENCRE2, LIGNE, POLICE } from './style';
import { libellesActions } from './actions';

const chargerMoteur = () => import('./moteur.js');
const CLE_FORMAT = 'fillsell.bordereau.format';
const formatRetenu = () => { try { return window.localStorage.getItem(CLE_FORMAT) === 'origine' ? 'origine' : '10x15'; } catch { return '10x15'; } };

/** Le bouton (rien sous `minimum` copies prêtes) et sa feuille. */
export function BoutonToutImprimer({ copies, supabase, lang = 'fr', minimum = 2 }) {
  const fr = lang !== 'en';
  const [ouvert, setOuvert] = useState(false);
  const n = (copies ?? []).length;
  if (n < minimum) return null;
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} aria-label={fr ? `Tout imprimer, ${n} bordereaux` : `Print all, ${n} labels`}
        style={{ minHeight: 44, padding: '0 14px', borderRadius: 14, border: `1px solid ${UI.border}`, background: '#FFFFFF', color: UI.ink, fontFamily: POLICE, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <Icone nom="recu" taille={17} couleur={UI.tealDeep} epaisseur={2.2} />{fr ? `Tout imprimer · ${n}` : `Print all · ${n}`}
      </button>
      {ouvert && <ToutImprimer ouvert copies={copies} supabase={supabase} lang={lang} onFermer={() => setOuvert(false)} />}
    </>
  );
}

/**
 * Props : ouvert, copies [{chemin?|octets?|url?, platform, transporteur?,
 * commande_ref?}], supabase, lang, onFermer.
 */
export default function ToutImprimer({ ouvert = true, copies, supabase, lang = 'fr', onFermer }) {
  const fr = lang !== 'en';
  const [format, setFormat] = useState(formatRetenu);
  const [sources, setSources] = useState(null);
  const [lus, setLus] = useState(0);
  const [illisibles, setIllisibles] = useState([]);
  const [resultat, setResultat] = useState(null);
  const [image, setImage] = useState(null);
  const [travail, setTravail] = useState(false);
  const [note, setNote] = useState(null);
  const jeton = useRef(0);
  const liste = copies ?? [];

  // 1. Lire chaque copie (une à la fois), en comptant.
  useEffect(() => {
    if (!ouvert) return undefined;
    let vivant = true;
    (async () => {
      const M = await chargerMoteur().catch(() => null);
      if (!M) { if (vivant) setSources([]); return; }
      const out = []; const ko = [];
      for (let i = 0; i < liste.length; i++) {
        try {
          const { octets } = await chargerCopieBordereau(liste[i], supabase);
          out.push({ copie: liste[i], source: await M.ouvrirSource(octets) });
        } catch { ko.push(liste[i]); }
        if (vivant) setLus(i + 1);
      }
      if (vivant) { setSources(out); setIllisibles(ko); }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique à l'ouverture
  }, [ouvert]);

  // 2. Réunir, à chaque changement de format.
  useEffect(() => {
    if (!sources) return;
    const n = ++jeton.current;
    (async () => {
      setTravail(true); setNote(null);
      try {
        const M = await chargerMoteur();
        const r = await M.fusionner(sources.map((s) => s.source), { format, choix: sources.map((s) => ({ recadrage: recadrageRetenu(s.copie) })) });
        const a = r.pages ? await M.apercu(r.octets, { largeurPx: 640 }) : null;
        if (n !== jeton.current) return;
        setResultat({ ...r, format });
        setImage(a?.url ?? null);
      } catch {
        if (n === jeton.current) { setResultat(null); setNote({ ton: 'rouge', texte: fr ? 'Les bordereaux n’ont pas pu être réunis : imprime-les un par un.' : 'The labels could not be combined: print them one by one.' }); }
      } finally {
        if (n === jeton.current) setTravail(false);
      }
    })();
  }, [sources, format, fr]);

  if (!ouvert) return null;
  const pret = resultat && resultat.format === format && resultat.pages > 0 && !travail;
  const nom = `bordereaux-${format === '10x15' ? '10x15-' : ''}${new Date().toISOString().slice(0, 10)}.pdf`;
  const f = pret ? fichier(resultat.octets, nom, 'application/pdf') : null;
  const actions = libellesActions(f, format === '10x15' ? '10x15' : 'origine', lang);
  const agir = async (quoi) => {
    if (!pret) return;
    setNote(null);
    const p = { octets: resultat.octets, nom, type: 'application/pdf', titre: fr ? 'Bordereaux' : 'Shipping labels', supabase };
    const r = quoi === 'imprimer' ? await imprimer(p) : quoi === 'telecharger' ? await telechargerFichier(p) : await partager(p);
    if (!r?.ok && !r?.annule) setNote({ ton: 'rouge', texte: r?.motif === 'session' ? (fr ? 'Ta session a expiré : reconnecte-toi, puis réessaie.' : 'Your session expired: sign in again, then retry.') : (fr ? 'Le fichier n’a pas pu être préparé pour l’ouverture : réessaie.' : 'The file could not be prepared for opening: try again.') });
  };
  const sautes = (resultat?.sautes ?? []).map((s) => sources?.[s.index]?.copie).filter(Boolean);
  const aDire = [...illisibles, ...sautes];

  return (
    <Couche onFermer={onFermer}>
    <div role="dialog" aria-modal="true" aria-label={fr ? 'Tout imprimer' : 'Print all'}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: '#FAFBFB', display: 'flex', flexDirection: 'column', fontFamily: POLICE, color: UI.ink, paddingTop: 'env(safe-area-inset-top,0px)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${LIGNE}`, background: '#FFFFFF' }}>
        <button type="button" onClick={onFermer} aria-label={fr ? 'Fermer' : 'Close'}
          style={{ width: 44, height: 44, border: 'none', borderRadius: 12, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <Icone nom="retour" taille={20} couleur={UI.ink} epaisseur={2.2} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fr ? 'Tout imprimer' : 'Print all'}</div>
          <div style={{ fontSize: 12.5, color: ENCRE2 }}>{fr ? `${liste.length} bordereau${liste.length > 1 ? 'x' : ''} prêt${liste.length > 1 ? 's' : ''}` : `${liste.length} label${liste.length > 1 ? 's' : ''} ready`}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Segments valeur={format} onChange={(v) => { setFormat(v); try { window.localStorage.setItem(CLE_FORMAT, v); } catch { /* sans conséquence */ } }}
          options={[['10x15', fr ? 'Étiquettes 10 × 15' : '10 × 15 labels'], ['origine', fr ? 'Format d’origine' : 'Original format']]} />
        {!sources && <p style={{ margin: 0, fontSize: 13.5, color: ENCRE2 }}>{fr ? `Lecture des bordereaux : ${lus} sur ${liste.length}` : `Reading the labels: ${lus} of ${liste.length}`}</p>}
        {sources && (
          <div data-tout-imprimer style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: format === '10x15' ? 'min(100%, 240px)' : '100%', aspectRatio: format === '10x15' ? '2 / 3' : undefined, minHeight: format === '10x15' ? undefined : 200, border: `1px solid ${LIGNE}`, borderRadius: 6, boxShadow: '0 2px 10px rgba(16,32,27,.10)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
              {image && pret
                ? <img src={image} alt={fr ? 'Aperçu de la première page' : 'First page preview'} style={{ width: '100%', height: format === '10x15' ? '100%' : 'auto', objectFit: 'contain', display: 'block' }} />
                : <span style={{ fontSize: 13, color: ENCRE2, padding: 20, textAlign: 'center' }}>{fr ? 'Préparation du fichier…' : 'Preparing the file…'}</span>}
            </div>
            {pret && (
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                {fr ? `${sources.length - sautes.length} bordereau${sources.length - sautes.length > 1 ? 'x' : ''} · ${resultat.pages} page${resultat.pages > 1 ? 's' : ''}` : `${sources.length - sautes.length} label${sources.length - sautes.length > 1 ? 's' : ''} · ${resultat.pages} page${resultat.pages > 1 ? 's' : ''}`}
              </div>
            )}
          </div>
        )}
        {sources && sources.length > 0 && (
          <div style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 20, overflow: 'hidden' }}>
            {sources.map((s, i) => (
              <div key={`${s.copie.platform}-${s.copie.commande_ref ?? i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? `1px solid ${LIGNE}` : 'none' }}>
                <PlatformLogo platform={s.copie.platform} size={22} />
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.copie.commande_ref ? `${fr ? 'Commande' : 'Order'} ${s.copie.commande_ref}` : (fr ? 'Bordereau' : 'Label')}
                </span>
                <span style={{ fontSize: 12, color: ENCRE2 }}>{s.source.genre === 'pdf' ? 'PDF' : (fr ? 'code' : 'code')}</span>
              </div>
            ))}
          </div>
        )}
        {aDire.length > 0 && (
          <Note ton="ambre">
            {fr ? `${aDire.length} bordereau${aDire.length > 1 ? 'x n’ont' : ' n’a'} pas pu être lu${aDire.length > 1 ? 's' : ''} ici (${aDire.map((c) => c.commande_ref ?? c.platform).join(', ')}) : ouvre-le${aDire.length > 1 ? 's' : ''} un par un.` : `${aDire.length} label${aDire.length > 1 ? 's' : ''} could not be read here (${aDire.map((c) => c.commande_ref ?? c.platform).join(', ')}): open ${aDire.length > 1 ? 'them' : 'it'} one by one.`}
          </Note>
        )}
        {note && <Note ton={note.ton}>{note.texte}</Note>}
      </div>
      <div style={{ borderTop: `1px solid ${LIGNE}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#FFFFFF' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {actions.unique ? (
            <Bouton principal plein desactive={!pret} onClick={() => agir('partager')} ariaLabel={actions.principal}>
              <Icone nom="envoi" taille={18} couleur={pret ? '#FFFFFF' : '#8A8578'} epaisseur={2.2} />{actions.principal}
            </Bouton>
          ) : (
            <>
              <Bouton desactive={!pret} onClick={() => agir('telecharger')} ariaLabel={actions.principal}>{actions.principal}</Bouton>
              <Bouton principal desactive={!pret} onClick={() => agir('imprimer')} ariaLabel={actions.second}>
                <Icone nom="recu" taille={18} couleur={pret ? '#FFFFFF' : '#8A8578'} epaisseur={2.2} />{actions.second}
              </Bouton>
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: ENCRE2, lineHeight: 1.45 }}>{actions.aide}</div>
      </div>
    </div>
    </Couche>
  );
}
