// ═══════════════════════════════════════════════════════════════════════════
// L'APERÇU D'UN BORDEREAU : ORIGINAL OU 10 × 15, PARTAGER, IMPRIMER (bêta)
// ═══════════════════════════════════════════════════════════════════════════
// S'ouvre sur UNE copie ({chemin} du dossier privé, {octets} ou {url}) :
//   · PDF : bascule « 10 × 15 » / « Original » (le dernier format choisi est
//     retenu sur l'appareil) ; en 10 × 15, l'étiquette est trouvée dans la page,
//     tournée, et « Ajuster le recadrage » propose les secours (moitiés,
//     quarts) — le choix est retenu par transporteur, sur cet appareil ;
//   · image (code de dépôt sans papier) : le code EN GRAND, plein écran ; il
//     s'imprime aussi en 10 × 15 ;
//   · partager / télécharger / imprimer selon l'appareil (partage.js) — le
//     fichier est fabriqué AVANT l'appui (navigator.share exige le geste).
// Le moteur (pdf.js, pdf-lib) n'est chargé qu'ici, à l'ouverture.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UI } from '../../components/ui';
import Icone from '../../ecrans/Icone';
import PlatformLogo from '../../components/platform-logos/PlatformLogo';
import { ORDRE_RECADRAGES, libelleRecadrage, nomFichier } from './geometrie';
import { chargerCopieBordereau, recadrageRetenu, retenirRecadrage } from './copies';
import { fichier, imprimer, partager, telechargerFichier } from './partage';
import CodeDepot from './CodeDepot';
import { libelleTransporteur } from '../vue';
import { Bouton, Note, Segments } from './ui';
import { ENCRE2, LIGNE, MENTHE, POLICE } from './style';
import { libellesActions } from './actions';

const chargerMoteur = () => import('./moteur.js');
const CLE_FORMAT = 'fillsell.bordereau.format';
const formatRetenu = () => { try { return window.localStorage.getItem(CLE_FORMAT) === 'origine' ? 'origine' : '10x15'; } catch { return '10x15'; } };
const retenirFormat = (f) => { try { window.localStorage.setItem(CLE_FORMAT, f); } catch { /* sans conséquence */ } };
const TYPES = Object.freeze({ pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg' });
const EXT = Object.freeze({ pdf: 'pdf', png: 'png', jpeg: 'jpg' });
const NOMS = Object.freeze({ vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', depop: 'Depop', ebay: 'eBay' });

function motifEnClair(motif, fr) {
  if (motif === 'session') return fr ? 'Ta session a expiré : reconnecte-toi, puis réessaie.' : 'Your session expired: sign in again, then retry.';
  if (motif === 'depot' || motif === 'adresse') return fr ? 'Le fichier n’a pas pu être préparé pour l’ouverture : réessaie.' : 'The file could not be prepared for opening: try again.';
  return fr ? 'L’action n’a pas abouti : réessaie.' : 'That did not work: try again.';
}

/**
 * Props : ouvert, copie {chemin?|octets?|url?, platform, transporteur?,
 * commande_ref?}, supabase, lang, onFermer.
 */
export default function ApercuBordereau({ ouvert = true, copie, supabase, lang = 'fr', onFermer }) {
  const fr = lang !== 'en';
  const [phase, setPhase] = useState('chargement');
  const [source, setSource] = useState(null);
  const [format, setFormat] = useState(formatRetenu);
  const [recadrage, setRecadrage] = useState(() => recadrageRetenu(copie));
  const [reglages, setReglages] = useState(false);
  const [sortie, setSortie] = useState(null);
  const [apercus, setApercus] = useState({});
  const [travail, setTravail] = useState(false);
  const [note, setNote] = useState(null);
  const [echec, setEchec] = useState(null); // le recadrage dont le 10 × 15 a échoué (jamais refait en boucle)
  const jeton = useRef(0);
  const urlsARevoquer = useRef([]);
  // La copie change quand son contenu change, pas quand l'objet est recréé.
  const cleCopie = copie?.octets ?? copie?.chemin ?? copie?.url ?? null;

  // 1. Charger la copie, puis l'aperçu de l'original.
  useEffect(() => {
    if (!ouvert || !cleCopie) return undefined;
    let vivant = true;
    (async () => {
      setPhase('chargement'); setNote(null);
      try {
        const { octets, genre } = await chargerCopieBordereau(copie, supabase);
        const M = await chargerMoteur();
        const src = await M.ouvrirSource(octets);
        if (!vivant) return;
        const a = await M.apercu(octets, { largeurPx: 900 });
        if (!vivant) return;
        if (a.revoquer && a.url) urlsARevoquer.current.push(a.url);
        setSource(src);
        setApercus({ origine: a.url });
        if (genre !== 'pdf') setFormat('code');
        setPhase('pret');
      } catch {
        if (vivant) setPhase('erreur');
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `copie` est lue par sa clé (cleCopie)
  }, [ouvert, cleCopie, supabase]);

  useEffect(() => () => { for (const u of urlsARevoquer.current) { try { URL.revokeObjectURL(u); } catch { /* déjà libérée */ } } }, []);

  // 2. Le 10 × 15 (et son aperçu), refait quand le recadrage change.
  const fabriquer = useCallback(async (src, rec) => {
    const n = ++jeton.current;
    setTravail(true);
    try {
      const M = await chargerMoteur();
      const s = await M.fabriquer10x15(src, { recadrage: rec });
      const a = await M.apercu(s.octets, { largeurPx: 640 });
      if (n !== jeton.current) return;
      setSortie({ ...s, demande: rec });
      setApercus((x) => ({ ...x, '10x15': a.url }));
    } catch {
      if (n === jeton.current) { setEchec(rec); setNote({ ton: 'rouge', texte: fr ? 'Le format 10 × 15 n’a pas pu être fabriqué : imprime l’original.' : 'The 10 × 15 format could not be made: print the original.' }); }
    } finally {
      if (n === jeton.current) setTravail(false);
    }
  }, [fr]);

  useEffect(() => {
    if (phase !== 'pret' || !source || format !== '10x15' || travail) return;
    if ((sortie && sortie.demande === recadrage) || echec === recadrage) return;
    fabriquer(source, recadrage);
  }, [phase, source, format, recadrage, sortie, echec, travail, fabriquer]);

  const choisirFormat = (f) => { setFormat(f); setNote(null); if (f !== 'code') retenirFormat(f); };
  const choisirRecadrage = (nom) => { setRecadrage(nom); setEchec(null); setNote(null); retenirRecadrage(copie, nom); };

  // Le fichier de l'action, PRÊT avant l'appui.
  const courant = useMemo(() => {
    if (!source) return null;
    if (format === '10x15') return sortie && sortie.demande === recadrage ? { octets: sortie.octets, genre: 'pdf', suffixe: '10x15' } : null;
    return { octets: source.octets, genre: source.genre, suffixe: format === 'code' ? 'code' : '', chemin: copie?.chemin ?? null };
  }, [source, sortie, format, recadrage, copie]);
  const nom = courant ? nomFichier({ platform: copie?.platform, commande_ref: copie?.commande_ref, suffixe: courant.suffixe, extension: EXT[courant.genre] }) : 'bordereau.pdf';
  const f = courant ? fichier(courant.octets, nom, TYPES[courant.genre]) : null;
  const actions = libellesActions(f, format, lang);

  const agir = async (quoi) => {
    if (!courant) return;
    setNote(null);
    const p = { octets: courant.octets, nom, type: TYPES[courant.genre], titre: fr ? 'Bordereau' : 'Shipping label', supabase, chemin: courant.chemin ?? undefined };
    const r = quoi === 'imprimer' ? await imprimer(p) : quoi === 'telecharger' ? await telechargerFichier(p) : await partager(p);
    if (!r?.ok && !r?.annule) setNote({ ton: 'rouge', texte: motifEnClair(r?.motif, fr) });
  };

  if (!ouvert) return null;
  const pf = NOMS[copie?.platform] ?? '';
  const transporteur = libelleTransporteur(copie?.transporteur);
  const sousTitre = [pf, copie?.commande_ref ? `${fr ? 'commande' : 'order'} ${copie.commande_ref}` : null, transporteur].filter(Boolean).join(' · ');
  const estPdf = source?.genre === 'pdf';
  const confianceFaible = format === '10x15' && sortie && recadrage === 'auto' && sortie.confiance !== 'haute';
  const retenuAilleurs = format === '10x15' && recadrage !== 'auto';
  const imageCourante = format === '10x15' ? apercus['10x15'] : apercus.origine;

  return (
    <div role="dialog" aria-modal="true" aria-label={fr ? 'Bordereau' : 'Shipping label'}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: '#FAFBFB', display: 'flex', flexDirection: 'column', fontFamily: POLICE, color: UI.ink, paddingTop: 'env(safe-area-inset-top,0px)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${LIGNE}`, background: '#FFFFFF' }}>
        <button type="button" onClick={onFermer} aria-label={fr ? 'Fermer' : 'Close'}
          style={{ width: 44, height: 44, border: 'none', borderRadius: 12, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
          <Icone nom="retour" taille={20} couleur={UI.ink} epaisseur={2.2} />
        </button>
        {copie?.platform ? <span style={{ flex: 'none', display: 'flex' }}><PlatformLogo platform={copie.platform} size={28} /></span> : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{format === 'code' ? (fr ? 'Code de dépôt' : 'Drop-off code') : (fr ? 'Bordereau' : 'Shipping label')}</div>
          {sousTitre && <div style={{ fontSize: 12.5, color: ENCRE2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sousTitre}</div>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {phase === 'chargement' && <p style={{ margin: 0, fontSize: 13.5, color: ENCRE2 }}>{fr ? 'Ouverture du bordereau…' : 'Opening the label…'}</p>}
        {phase === 'erreur' && <Note ton="rouge">{fr ? 'Le bordereau n’a pas pu être lu ici. Ouvre-le sur la plateforme.' : 'The label could not be read here. Open it on the platform.'}</Note>}
        {phase === 'pret' && (
          <>
            <Segments valeur={format} onChange={choisirFormat}
              options={estPdf
                ? [['10x15', fr ? 'Étiquette 10 × 15' : '10 × 15 label'], ['origine', fr ? 'Original' : 'Original']]
                : [['code', fr ? 'Code' : 'Code'], ['10x15', fr ? 'Étiquette 10 × 15' : '10 × 15 label']]} />

            {format === 'code' && <CodeDepot url={apercus.origine} genre={source?.genre} lang={lang} />}

            {format !== 'code' && (
              <div data-apercu={format} style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 20, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: format === '10x15' ? (reglages ? 'min(100%, 220px)' : 'min(100%, 280px)') : '100%', aspectRatio: format === '10x15' ? '2 / 3' : undefined, background: '#FFFFFF', border: `1px solid ${LIGNE}`, borderRadius: 6, boxShadow: '0 2px 10px rgba(16,32,27,.10)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: format === '10x15' ? undefined : 200 }}>
                  {imageCourante && !(format === '10x15' && travail)
                    ? <img src={imageCourante} alt={format === '10x15' ? (fr ? 'Aperçu de l’étiquette 10 × 15' : '10 × 15 label preview') : (fr ? 'Aperçu du bordereau' : 'Label preview')} style={{ width: '100%', height: format === '10x15' ? '100%' : 'auto', objectFit: 'contain', display: 'block' }} />
                    : <span style={{ fontSize: 13, color: ENCRE2, padding: 20, textAlign: 'center' }}>{fr ? 'Préparation de l’étiquette…' : 'Preparing the label…'}</span>}
                </div>
                <div style={{ fontSize: 12, color: ENCRE2 }}>
                  {format === '10x15' ? (fr ? '100 × 150 mm, prête pour une imprimante d’étiquettes' : '100 × 150 mm, ready for a label printer') : (fr ? `Tel que fourni par ${pf || 'la plateforme'}${source?.nbPages > 1 ? ` · ${source.nbPages} pages` : ''}` : `As provided by ${pf || 'the platform'}${source?.nbPages > 1 ? ` · ${source.nbPages} pages` : ''}`)}
                </div>
              </div>
            )}

            {format === '10x15' && estPdf && (
              <div style={{ background: '#FFFFFF', border: `1px solid ${UI.border}`, borderRadius: 20, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: ENCRE2 }}>{fr ? 'Recadrage' : 'Crop'}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{libelleRecadrage(recadrage, lang)}</div>
                  </div>
                  <button type="button" onClick={() => setReglages((v) => !v)} aria-expanded={reglages}
                    style={{ minHeight: 44, padding: '0 14px', borderRadius: 12, border: `1px solid ${UI.border}`, background: reglages ? MENTHE : '#FFFFFF', color: UI.ink, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', flex: 'none' }}>
                    {fr ? 'Ajuster le recadrage' : 'Adjust the crop'}
                  </button>
                </div>
                {reglages && (
                  <div role="radiogroup" aria-label={fr ? 'Recadrage' : 'Crop'} style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 6, paddingBottom: 2, scrollbarWidth: 'thin' }}>
                    {ORDRE_RECADRAGES.map((k) => {
                      const on = k === recadrage;
                      return (
                        <button key={k} type="button" role="radio" aria-checked={on} onClick={() => choisirRecadrage(k)}
                          style={{ flex: 'none', minHeight: 44, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? UI.tealDeep : UI.border}`, background: on ? MENTHE : '#FFFFFF', color: UI.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {libelleRecadrage(k, lang)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {retenuAilleurs && <div style={{ fontSize: 12, color: ENCRE2 }}>{fr ? `Ce recadrage est retenu sur cet appareil pour les prochains bordereaux ${pf}${transporteur ? ` (${transporteur})` : ''}.` : `This crop is kept on this device for the next ${pf} labels${transporteur ? ` (${transporteur})` : ''}.`}</div>}
              </div>
            )}
            {confianceFaible && <Note ton="ambre">{fr ? 'Vérifie l’aperçu : si une partie du bordereau manque ou dépasse, choisis un autre recadrage.' : 'Check the preview: if part of the label is missing or extra, pick another crop.'}</Note>}
            {note && <Note ton={note.ton}>{note.texte}</Note>}
          </>
        )}
      </div>

      {phase === 'pret' && (
        <div style={{ borderTop: `1px solid ${LIGNE}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#FFFFFF' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {actions.unique ? (
              <Bouton principal plein desactive={!courant || travail} onClick={() => agir('partager')} ariaLabel={actions.principal}>
                <Icone nom="envoi" taille={18} couleur={!courant || travail ? '#8A8578' : '#FFFFFF'} epaisseur={2.2} />{actions.principal}
              </Bouton>
            ) : (
              <>
                <Bouton desactive={!courant || travail} onClick={() => agir('telecharger')} ariaLabel={actions.principal}>{actions.principal}</Bouton>
                <Bouton principal desactive={!courant || travail} onClick={() => agir('imprimer')} ariaLabel={actions.second}>
                  <Icone nom="recu" taille={18} couleur={!courant || travail ? '#8A8578' : '#FFFFFF'} epaisseur={2.2} />{actions.second}
                </Bouton>
              </>
            )}
          </div>
          <div style={{ fontSize: 12, color: ENCRE2, lineHeight: 1.45 }}>{actions.aide}</div>
        </div>
      )}
    </div>
  );
}
