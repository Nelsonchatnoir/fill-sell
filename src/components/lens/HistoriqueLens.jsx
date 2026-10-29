import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, Image as IconeImage } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

// ═══════════════════════════════════════════════════════════════════════════
// L'HISTORIQUE DES SCANS LENS (29/10, lot B 1.5 — bouton « Historique » du viseur)
// ═══════════════════════════════════════════════════════════════════════════
// Une feuille, tes 20 derniers scans : photo, titre reconnu, date (heure de
// Paris), et UN geste par ligne :
//   · le résultat est gardé en base (lens_scans.resultat, statut termine) → il
//     se ROUVRE à l'écran de résultat (onRouvrir, App.jsx : une lecture, aucun
//     débit — exactement ce que fait la reprise d'un scan terminé) ;
//   · sinon, la fiche de l'article dans le Stock (inventaire_id), par le chemin
//     d'ouverture d'un article depuis une notification (onOuvrirArticle).
// Exceptions, dites sur la ligne :
//   · un échec ne rouvre rien (rien à montrer ; rien n'a été décompté) ;
//   · un article déclaré VENDU par le scan ne se rouvre pas : son seul geste est
//     « Enregistrer la vente », et rien ne dit qu'elle ne l'a pas déjà été —
//     la rouvrir, c'était tendre un bouton qui la doublerait.
// Lecture (règles RLS lues en base le 29/10 : SELECT sur ses propres scans,
// aucune écriture cliente) : UNE requête à l'ouverture de la feuille, bornée à
// 20 lignes, filtrée sur user_id (index lens_scans_user_created_idx), colonnes
// légères seulement — la photo de tête et le titre sont extraits du jsonb par
// PostgREST ; le résultat complet n'est lu qu'au tap, pour UNE ligne. Jamais
// de relecture en boucle.

const LIMITE = 20;

function dateParis(iso, lang) {
  try {
    const d = new Date(iso);
    const jour = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(d);
    const heure = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d);
    return { jour, heure };
  } catch { return { jour: '', heure: '' }; }
}

function Vignette({ url }) {
  const [cassee, setCassee] = useState(false);
  return (
    <span className="lns-histo-photo" aria-hidden="true">
      {url && !cassee
        ? <img src={url} alt="" loading="lazy" onError={() => setCassee(true)} />
        : <IconeImage size={18} strokeWidth={1.8} />}
    </span>
  );
}

export default function HistoriqueLens({ open, onClose, supabase, userId, lang, onRouvrir, onOuvrirArticle, remplacePhotos = false }) {
  const { t, tpl } = useTranslation(lang);
  const [etat, setEtat] = useState({ chargement: false, erreur: false, lignes: [] });
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !userId || !supabase) return undefined;
    let vivant = true;
    setEtat({ chargement: true, erreur: false, lignes: [] });
    setMessage('');
    supabase.from('lens_scans')
      .select('scan_id,statut,created_at,photo:photos->>0,titre:resultat->>titre,marque:resultat->>marque,inventaire_id:resultat->inventaire_id,est_vendu:resultat->est_vendu')
      .eq('user_id', userId)
      .in('statut', ['termine', 'echec', 'en_cours'])
      .order('created_at', { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (!vivant) return;
        setEtat({ chargement: false, erreur: Boolean(error), lignes: error ? [] : (data ?? []) });
      }, () => { if (vivant) setEtat({ chargement: false, erreur: true, lignes: [] }); });
    return () => { vivant = false; };
  }, [open, userId, supabase]);

  if (!open) return null;

  async function choisir(l) {
    if (enCours) return;
    setMessage('');
    if (l.statut === 'termine') {
      setEnCours(l.scan_id);
      try {
        const { data, error } = await supabase.from('lens_scans')
          .select('resultat,photos').eq('scan_id', l.scan_id).eq('user_id', userId).maybeSingle();
        if (!error && data?.resultat && typeof data.resultat === 'object') {
          onRouvrir?.({ resultat: data.resultat, photos: Array.isArray(data.photos) ? data.photos : [] });
          onClose?.();
          return;
        }
      } catch { /* on tente la fiche, plus bas */ }
      finally { setEnCours(null); }
    }
    if (l.inventaire_id != null && onOuvrirArticle?.(l.inventaire_id)) { onClose?.(); return; }
    setMessage(t('lensHistoIntrouvable'));
  }

  const { chargement, erreur, lignes } = etat;
  return createPortal(
    <div className="lns-feuille-voile" onClick={onClose}>
      <div className="lns-feuille" role="dialog" aria-modal="true" aria-labelledby="lns-histo-titre" onClick={(e) => e.stopPropagation()}>
        <div className="lns-feuille-poignee" />
        <div className="lns-feuille-tete">
          <h2 id="lns-histo-titre" className="lns-feuille-titre">{t('lensHistoTitre')}</h2>
          <button type="button" className="lns-fermer" onClick={onClose} aria-label={t('lensFermer')}>
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
        {remplacePhotos && lignes.length > 0 && <p className="lns-aide">{t('lensHistoRemplace')}</p>}
        {message && <div className="lns-bandeau lns-bandeau--attention">{message}</div>}
        {chargement ? (
          <p className="lns-feuille-msg">{t('lensHistoChargement')}</p>
        ) : erreur ? (
          <p className="lns-feuille-msg">{t('lensHistoErreur')}</p>
        ) : !lignes.length ? (
          <p className="lns-feuille-msg">{t('lensHistoVide')}</p>
        ) : (
          <ul className="lns-feuille-liste">
            {lignes.map((l) => {
              const { jour, heure } = dateParis(l.created_at, lang);
              const quand = tpl('lensLeAt', { d: jour, h: heure });
              const vendu = l.est_vendu === true || l.est_vendu === 'true';
              const ouvrable = l.statut === 'termine' && !vendu;
              const titre = l.statut === 'echec' ? t('lensHistoEchec')
                : l.statut === 'en_cours' ? t('lensHistoEnCours')
                  : (l.titre || t('lensArticle'));
              const sous = l.statut === 'echec' ? `${quand} · ${t('lensHistoEchecSous')}`
                : vendu ? `${quand} · ${t('lensHistoVendu')}`
                  : (l.marque && l.statut === 'termine' ? `${l.marque} · ${quand}` : quand);
              return (
                <li key={l.scan_id}>
                  <button type="button" className="lns-histo" data-statut={l.statut}
                    disabled={!ouvrable || enCours != null} onClick={() => choisir(l)}>
                    <Vignette url={l.photo} />
                    <span className="lns-histo-txt">
                      <span className="lns-histo-titre">{titre}</span>
                      <span className="lns-histo-sous">{sous}</span>
                    </span>
                    {ouvrable && (enCours === l.scan_id
                      ? <span className="lns-tourne" aria-hidden="true" />
                      : <ChevronRight className="lns-histo-chevron" size={18} strokeWidth={2.2} aria-hidden="true" />)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
