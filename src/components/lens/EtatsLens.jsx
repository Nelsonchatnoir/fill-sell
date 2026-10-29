import { Check } from 'lucide-react';
import BarreProgression from '../BarreProgression';
import { LENS_PHOTOS_LUES } from '../../utils/photos';
import { useTranslation } from '../../i18n/useTranslation';
import { motifEchec } from './motifEchec';

// ═══════════════════════════════════════════════════════════════════════════
// LES ÉTATS DU VISEUR LENS : pendant l'analyse, échec, quota atteint (29/10, lot B 1.5)
// ═══════════════════════════════════════════════════════════════════════════
// Maquette LensEtats du 29/10. Trois cartes, rien d'autre : aucune ne lit ni
// n'écrit quoi que ce soit, elles reçoivent l'état et les gestes de LensTab.

// ── Pendant l'analyse ───────────────────────────────────────────────────────
// LA barre (BarreProgression, 01/10) sur les étapes RÉELLES relevées par
// analyzeLens (lensProgres : les photos montées une à une, puis l'analyse),
// et la liste de ces mêmes étapes en clair. Deux étapes, pas trois : le
// serveur lit l'objet ET le marché dans le même appel, sans dire où il en est
// — une troisième ligne « Prix de revente » qui s'allumerait à une heure
// inventée serait une fausse étape.
export function ProgressionScan({ lang, photo, titre, nbPhotos, lensProgres, enCours, reprise, onFini }) {
  const { t, tpl } = useTranslation(lang);
  const fr = lang !== 'en';
  const n = Math.max(1, lensProgres?.total ?? nbPhotos ?? 1);
  const enEnvoi = Boolean(lensProgres) && lensProgres.etape !== 'analyse';
  const faites = enEnvoi ? Math.min(n, lensProgres.faites ?? 0) : n;
  const etapes = [
    ...Array.from({ length: n }, (_, i) => ({
      cle: `photo${i + 1}`,
      texte: fr ? `Envoi des photos (${i + 1} sur ${n})…` : `Sending photos (${i + 1} of ${n})…`,
      duree: i < LENS_PHOTOS_LUES ? 3 : 1,
    })),
    { cle: 'analyse', texte: t('lensEtapeLecture'), duree: 20 },
  ];
  const etape = enEnvoi ? `photo${Math.min(n, faites + 1)}` : 'analyse';
  const etatEnvoi = !enCours || !enEnvoi ? 'fait' : 'encours';
  const etatLecture = !enCours ? 'fait' : (enEnvoi ? 'attente' : 'encours');
  const signe = (e) => (e === 'fait'
    ? <Check size={15} strokeWidth={2.6} color="#1B6E62" aria-hidden="true" />
    : e === 'encours' ? <span className="lns-tourne" aria-hidden="true" /> : <span className="lns-rond" aria-hidden="true" />);
  return (
    <div className="lns-carte lns-carte--s">
      <BarreProgression
        lang={lang}
        article={{
          photo: photo ?? null,
          titre: String(titre ?? '').trim() || t('lensTonArticle'),
          sousTitre: tpl('lensAnalyseNPhotos', { n: nbPhotos || n }),
        }}
        etapes={etapes}
        etape={etape}
        etat={enCours ? 'en_cours' : 'termine'}
        phrase={t('lensChangerOnglet')}
        phraseFin={t('lensAnalyseTerminee')}
        onFini={onFini ?? undefined}
      />
      <ul className="lns-etapes">
        <li className="lns-etape" data-etat={etatEnvoi}>
          <span className="lns-etape-signe">{signe(etatEnvoi)}</span>
          <span>{tpl('lensEtapeEnvoi', { a: faites, n })}</span>
        </li>
        <li className="lns-etape" data-etat={etatLecture}>
          <span className="lns-etape-signe">{signe(etatLecture)}</span>
          <span>{t('lensEtapeLecture')}</span>
        </li>
      </ul>
      {/* REPRISE D'UN SCAN INTERROMPU (2026-09-13) — le dire, sinon cette
          attente ressemble à un nouveau scan, donc à une facturation de plus. */}
      {reprise && <div className="lns-bandeau lns-bandeau--info">{t('lensRepriseScan')}</div>}
    </div>
  );
}

// ── L'analyse n'a pas abouti ────────────────────────────────────────────────
// « Cette tentative ne compte pas dans ton quota » est VÉRIFIÉ (29/10) : le
// scan de l'app part en mode 'annonce' (unifié) ; la ligne usage_logs 'lens'
// porte unifie:true et n'entre pas dans quota_annonces_consommees (lu en
// prod) — l'unité est la ligne 'generate_listing', posée par lens-analysis
// SEULEMENT après une rédaction livrée. Un échec passe par le catch final
// (aucune ligne generate_listing, unités rendues par releaseAttempt) ; un
// envoi de photos raté n'a jamais atteint le débit.
export function EchecAnalyse({ lang, erreur, onReessayer, onSansAnalyse, occupe = false, peutReessayer = true }) {
  const { t } = useTranslation(lang);
  const motif = motifEchec(erreur, lang);
  if (motif.type === 'photo') {
    return (
      <div className="lns-alerte lns-alerte--echec" role="alert">
        <div className="lns-alerte-tete">
          <IconeAlerte />
          <div className="lns-alerte-txt">
            <span className="lns-alerte-titre">{t('lensPhotoIlliseTitre')}</span>
            <p className="lns-alerte-corps">{motif.detail}</p>
          </div>
        </div>
      </div>
    );
  }
  const cause = motif.type === 'indispo' ? t('lensEchecIndispo')
    : motif.type === 'connexion' ? t('lensEchecConnexion')
      : motif.type === 'serveur' ? t('lensEchecServeur') : null;
  return (
    <div className="lns-alerte lns-alerte--echec" role="alert">
      <div className="lns-alerte-tete">
        <IconeAlerte />
        <div className="lns-alerte-txt">
          <span className="lns-alerte-titre">{t('lensEchecTitre')}</span>
          <p className="lns-alerte-corps">{cause ? `${cause} ` : ''}{t('lensEchecPasQuota')}</p>
          {motif.detail && <p className="lns-alerte-detail">{motif.detail}</p>}
        </div>
      </div>
      {onReessayer && (
        <button type="button" className="lns-bouton-plein" onClick={onReessayer} disabled={occupe || !peutReessayer}>
          {t('lensReessayer')}
        </button>
      )}
      {onSansAnalyse && (
        <button type="button" className="lns-bouton-blanc" onClick={onSansAnalyse} disabled={occupe}>
          {t('lensSansAnalyse')}
        </button>
      )}
    </div>
  );
}

// ── Le quota du mois est atteint ────────────────────────────────────────────
// ⛔ Pas de « ton forfait repart le 1er » : le cycle part du dernier crédit
//    mensuel du compte (debut_cycle_quotas, lu en prod le 29/10), pas du 1er.
// ⛔ « Créer à la main » ne passe PAS par l'écran de publication : sa rédaction
//    compte dans le même quota et serait refusée. Il ouvre l'ajout à la main
//    du Stock (« un article manuel ne consomme aucun quota »), photos du
//    viseur comprises — l'annonce se fera au cycle suivant.
export function QuotaAtteint({ lang, plafond, onCreerALaMain, onVoirForfaits }) {
  const { t, tpl } = useTranslation(lang);
  return (
    <div className="lns-alerte lns-alerte--quota" role="status">
      <span className="lns-alerte-titre">{t('lensQuotaTitre')}</span>
      <p className="lns-alerte-corps">
        {plafond != null ? tpl('lensQuotaTexte', { n: plafond }) : t('lensQuotaTexteSansN')}
      </p>
      <div className="lns-duo">
        {onCreerALaMain && (
          <button type="button" className="lns-bouton-contour" onClick={onCreerALaMain}>{t('lensCreerMain')}</button>
        )}
        {onVoirForfaits && (
          <button type="button" className="lns-bouton-nuit" onClick={onVoirForfaits}>{t('lensVoirForfaits')}</button>
        )}
      </div>
    </div>
  );
}

function IconeAlerte() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9B5148" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.5" />
    </svg>
  );
}
