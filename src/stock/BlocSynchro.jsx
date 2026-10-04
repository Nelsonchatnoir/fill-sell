// ═══════════════════════════════════════════════════════════════════════════
// STOCK — LE BLOC DE SYNCHRONISATION (planche : écrans 01, 04, 05, 08)
// ═══════════════════════════════════════════════════════════════════════════
// Remplace, DANS LE STOCK, la carte « Mes annonces en ligne »
// (annonces/CarteAnnoncesEnLigne.jsx — qui reste dans le dépôt, intacte). Même
// moteur, mêmes données, mêmes gestes : useReleveAnnonces, lireVague,
// lireBilan, etatTuile, murConnexionReleve, BoutonMeConnecter, EcranRattachement,
// EcranDoublons. Ce qui change, c'est la PRÉSENTATION :
//   · AU REPOS   « Synchronisé il y a X · N annonces », LE bouton
//                « Synchroniser », une pastille par plateforme (logo, nombre,
//                point d'état), et UNE ligne « N points à régler › » qui ouvre
//                une feuille avec le détail. Plus de paragraphes ambre sur la
//                page, plus de phrase d'explication.
//   · EN COURS   l'animation ACTUELLE (ConstellationReleve, + CSS_ANNONCES),
//                réutilisée telle quelle, la plateforme réellement en cours et
//                la barre branchée sur les plateformes terminées.
//   · APRÈS      un résumé positif (« 41 annonces à jour ») et « À faire
//                maintenant » (les trois gestes, chiffres frais, fournis par
//                StockTab) ; la croix ramène au bloc.
// ⛔ La ligne Vinted (VintedDressingSync) reste MONTÉE, cachée : c'est elle qui
//    porte l'état du relevé Vinted et son `lancer` (cf. la carte d'origine).
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ChevronRight, X, Check, CircleAlert, CircleCheck, Info, Laptop, RotateCcw } from 'lucide-react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import OplaAutorisationModal from '../components/OplaAutorisationModal';
import InstallExtensionCta from '../components/InstallExtensionCta';
import { LABEL_RELEVE } from '../utils/syncPlateformes';
import { useReleveAnnonces } from '../annonces/useReleveAnnonces';
import { etatTuile, lireVague, lireBilan, ilYA, murConnexionReleve, arretTechniqueReleve } from '../annonces/etatReleve';
import { textesAnnonces } from '../annonces/textes';
import { A, CSS_ANNONCES } from '../annonces/theme';
import ConstellationReleve from '../annonces/ConstellationReleve';
import EcranRattachement from '../annonces/EcranRattachement';
import EcranDoublons from '../annonces/EcranDoublons';
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import { pairesAffichables, estQuestionDejaVendu } from '../utils/doublons';
import Feuille from './Feuille';
import { S, OMBRE, DEGRADE, DEGRADE_TUILE } from './jetons';
import { nombreFr } from './regles';

// Le point d'une pastille de plateforme : teal = à jour ; ambre = à reprendre
// ou un geste attend ; gris = jamais synchronisée / pas de compte.
function pointDe(t) {
  const ph = t.e.phase;
  if (t.vide) return S.ambrePoint;
  if (ph === 'fait') return S.teal;
  if (ph === 'en_cours') return S.teal;
  if (ph === 'jamais') return S.horsPoint;
  return S.ambrePoint;
}

function PastillePlateforme({ t, fr, cliquable, onTap, tonResume = false }) {
  const n = typeof t.e.n === 'number' ? t.e.n : null;
  const etat = t.e.phase === 'fait' && !t.vide ? (fr ? 'à jour' : 'up to date') : t.e.mot;
  const aria = `${t.nom} : ${n != null ? `${n} ${fr ? 'annonces' : 'listings'}, ` : ''}${etat}`;
  const contenu = (
    <>
      <span style={{ position: 'relative', display: 'flex' }}>
        <PlatformLogo platform={t.p} size={20} desature={t.e.phase === 'absente' || t.e.phase === 'jamais'} />
        <span aria-hidden="true" className={t.e.phase === 'en_cours' ? 'sk-pouls' : undefined} style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, boxSizing: 'border-box', borderRadius: '50%', background: pointDe(t), border: '1.5px solid #FFFFFF' }} />
      </span>
      <span className="sk-chiffres" style={{ fontSize: 13, fontWeight: 700, color: S.ink }}>{n != null ? nombreFr(n, fr ? 'fr' : 'en') : '—'}</span>
    </>
  );
  const style = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, minWidth: 0, padding: 0, boxSizing: 'border-box', borderRadius: 999,
    background: tonResume ? '#FFFFFF' : S.paper, border: `1px solid ${tonResume ? S.mentheBord : S.borderSoft}`,
  };
  if (!onTap) return <span role="img" aria-label={aria} title={t.e.depuis ? `${t.nom} · ${t.e.depuis}` : t.nom} style={style}>{contenu}</span>;
  return (
    <button type="button" className="sk-btn" disabled={!cliquable} onClick={onTap} aria-label={aria}
      title={t.e.depuis ? `${t.nom} · ${t.e.depuis}` : t.nom} style={style}>{contenu}</button>
  );
}

function LignePoints({ lang, nombre, info, onOuvrir }) {
  const fr = lang !== 'en';
  const texte = nombre > 0
    ? (fr ? `${nombre} point${nombre > 1 ? 's' : ''} à régler` : `${nombre} thing${nombre > 1 ? 's' : ''} to fix`)
    : info;
  if (!texte) return null;
  return (
    <button type="button" className="sk-btn" onClick={onOuvrir}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 40, marginTop: 8, padding: 0, border: 'none', background: 'transparent', boxShadow: `inset 0 1px 0 ${S.borderSoft}`, color: nombre > 0 ? S.ambreEncre : S.ink2, fontSize: 13, fontWeight: 700, textAlign: 'left' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: nombre > 0 ? S.ambrePoint : S.horsPoint, flexShrink: 0 }} />
      <span className="sk-une-ligne" style={{ flex: 1, minWidth: 0 }}>{texte}</span>
      <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
    </button>
  );
}

// Une carte de la feuille « points à régler » : ce qui se passe, ce qu'il faut
// faire, et un seul bouton.
export function CartePoint({ icone = null, platform = null, titre, texte = null, ton = 'regler', bouton = null, enfant = null }) {
  const I = icone ?? (ton === 'info' ? Info : CircleAlert);
  return (
    <article style={{ padding: 16, borderRadius: 16, background: '#FFFFFF', boxShadow: `${OMBRE.carte}, inset 0 0 0 1px ${S.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40 }}>
        {platform ? (
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
            <PlatformLogo platform={platform} size={24} />
          </span>
        ) : (
          <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ton === 'info' ? S.paper : S.ambreFond, color: ton === 'info' ? S.ink2 : S.ambreEncre }}>
            {typeof I === 'function' || typeof I === 'object' ? <I size={20} strokeWidth={2} aria-hidden="true" /> : I}
          </span>
        )}
        <h3 style={{ margin: 0, fontSize: 15, lineHeight: '20px', fontWeight: 700, color: S.ink }}>{titre}</h3>
      </div>
      {texte && <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>{texte}</p>}
      {enfant && <div style={{ marginTop: 16 }}>{enfant}</div>}
      {bouton && (
        <button type="button" className="sk-btn sk-presse" onClick={bouton.onTap} disabled={bouton.desactive}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 40, marginTop: 16, padding: 0, boxSizing: 'border-box', borderRadius: 12, background: '#FFFFFF', border: `1px solid ${S.border}`, color: S.ink, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', opacity: bouton.desactive ? 0.55 : 1 }}>
          {bouton.icone ? <bouton.icone size={16} strokeWidth={2.2} aria-hidden="true" /> : null}{bouton.libelle}
        </button>
      )}
    </article>
  );
}

/**
 * @param {object} p
 *   p.alertes [{cle, titre, texte, ton, bouton?, compte}] — les alertes de
 *     compte que StockTab affichait en bandeaux (extension, horloge,
 *     maintenance, pause) : elles entrent dans la feuille des points.
 *   p.aFaire — l'élément « À faire maintenant » (Gestes variante lignes)
 *   p.onResume(bool) — prévient StockTab que le résumé occupe la place des gestes
 */
export default function BlocSynchro({
  lang, user, isNative = false, items = [], ouvert = false, extensionStatus = null, plateformes = null,
  onRattache = null, lancerVinted = null, etatVinted = null, ligneVinted = null,
  alertes = [], aFaire = null, onResume = null,
}) {
  const T = useMemo(() => textesAnnonces(lang), [lang]);
  const r = useReleveAnnonces({ lang, user, ouvert, plateformes, lancerVinted, etatVinted });
  const [ecran, setEcran] = useState(false);
  const [ecranDoublons, setEcranDoublons] = useState(false);
  const [feuille, setFeuille] = useState(false);
  const [resume, setResume] = useState(false);
  const { fr } = r;

  const vague = useMemo(
    () => lireVague({ plateformes: r.plateformes, runs: r.runs, runVinted: r.runVinted, etatVinted }),
    [r.plateformes, r.runs, r.runVinted, etatVinted],
  );
  const bilan = useMemo(
    () => lireBilan({ plateformes: r.plateformes, runs: r.runs, runVinted: r.runVinted }),
    [r.plateformes, r.runs, r.runVinted],
  );
  const tuiles = useMemo(() => r.plateformes.map((p) => {
    const e = etatTuile({ run: p === 'vinted' ? r.runVinted : (r.runs[p] ?? null), vinted: p === 'vinted', etatVinted, T, fr, pip: A });
    const vide = p !== 'vinted' && !!r.vides?.[p] && e.phase === 'fait';
    return { p, nom: LABEL_RELEVE[p] ?? p, e, vide };
  }), [r.plateformes, r.runs, r.runVinted, r.vides, etatVinted, T, fr]);

  // Le rangement avance : le stock se relit sans attendre un geste (même règle
  // que la carte d'origine).
  const nbRangement = r.rangement?.total ?? 0;
  const rangementAvant = useRef(nbRangement);
  useEffect(() => {
    if (nbRangement < rangementAvant.current && typeof onRattache === 'function') onRattache();
    rangementAvant.current = nbRangement;
  }, [nbRangement, onRattache]);

  // ── L'ÉCRAN D'ARRIVÉE : une vague VUE en cours, puis terminée ─────────────
  // Lu au rendu, sur la bascule de `vague.active` (motif « ajuster un état
  // quand une prop change » de React) : en cours → le résumé se ferme ;
  // en cours puis plus en cours → le résumé s'ouvre. Rien au montage.
  const [vagueAvant, setVagueAvant] = useState(vague.active);
  if (vague.active !== vagueAvant) {
    setVagueAvant(vague.active);
    setResume(!vague.active);
  }
  useEffect(() => { onResume?.(resume); }, [resume, onResume]);

  if (!ouvert || !r.userId) return ligneVinted ? <div aria-hidden="true" style={{ display: 'none' }}>{ligneVinted}</div> : null;

  const extVue = Number.isFinite(Date.parse(extensionStatus?.lastSeenAt ?? ''));
  const nbARattacher = r.aRattacher.length;
  const nomsRangement = Object.keys(r.rangement?.parPlateforme ?? {}).map((p) => LABEL_RELEVE[p] ?? p).join(', ');
  // « Déjà vendu ? » vit dans « À régler » (ventes) : ici, les AUTRES paires —
  // même forme que BandeauDejaVendu passe à EcranDoublons (paires hydratées).
  const pairesDoublons = pairesAffichables(r.doublons, items).filter((d) => !estQuestionDejaVendu(d));
  const nbDoublons = pairesDoublons.length;
  const enCours = vague.active;
  const occupe = !!r.busy || r.toutBusy;
  const occupeLancer = occupe || enCours;

  // ── MURS ET SIGNAUX : la MÊME lecture que la carte d'origine ──────────────
  const empechees = tuiles.filter((t) => t.e.phase === 'absente').map((t) => t.p);
  const oplaAutorisee = r.oplaVerdict === 'autorise';
  const murOplaDepasse = (t) => t.platform === 'opla' && oplaAutorisee;
  const murs = [
    ...(etatVinted?.murVinted && r.plateformes.includes('vinted') ? [{ platform: 'vinted', nom: LABEL_RELEVE.vinted, motif: etatVinted.murVinted }] : []),
    ...tuiles
      .filter((t) => t.p !== 'vinted' && t.e.phase !== 'fait' && t.e.phase !== 'en_cours')
      .map((t) => ({ platform: t.p, nom: t.nom, motif: murConnexionReleve(r.runs[t.p] ?? null, t.p) }))
      .filter((t) => !!t.motif && !(murOplaDepasse(t) && t.motif === 'autoriser_opla')),
  ];
  const murDe = new Set(murs.map((m) => m.platform));
  // MÊMES conditions qu'avant ; chaque point porte en plus sa plateforme, un
  // titre court et son geste (planche 08). Le verrou des gestes est celui du
  // bouton principal : une demande à la fois, jamais pendant une vague.
  const synchroDe = (t) => ({ libelle: T.ctaPointSynchro(t.nom), icone: RefreshCw, onTap: () => r.lancer(t.p), desactive: occupeLancer });
  const reessayer = (t) => ({ libelle: T.ctaPointReessayer, icone: RotateCcw, onTap: () => r.lancer(t.p), desactive: occupeLancer });
  const expirees = tuiles.filter((t) => t.e.phase === 'expire');
  const signaux = [
    ...tuiles.filter((t) => t.vide).map((t) => ({ cle: `vide-${t.p}`, platform: t.p, titre: T.titrePointVide(t.nom), texte: T.signalVideRepete(t.nom), bouton: synchroDe(t) })),
    ...tuiles.filter((t) => t.e.phase === 'absente' && !murDe.has(t.p) && !(t.p === 'opla' && t.e.opla && oplaAutorisee))
      .map((t) => ({ cle: t.p, platform: t.p, titre: t.e.opla ? T.titrePointOpla : T.titrePointNonConnecte(t.nom), texte: t.e.opla ? T.signalOpla : T.signalNonConnecte(t.nom) })),
    ...tuiles.filter((t) => t.e.phase === 'echec' && !murDe.has(t.p)).map((t) => {
      const technique = arretTechniqueReleve(r.runs[t.p] ?? null);
      return {
        cle: t.p,
        platform: t.p,
        titre: technique ? T.titrePointTechnique(t.nom) : T.titrePointArret(t.nom),
        texte: technique
          ? T.signalTechnique(t.nom)
          : T.signalEchec(t.nom, String((r.runs[t.p]?.erreur) ?? '').replace(/^\[incomplet\]\s*/, '').slice(0, 90) || null),
        bouton: reessayer(t),
      };
    }),
    ...tuiles.filter((t) => t.e.phase === 'hors_compte')
      .map((t) => ({ cle: `hors-compte-${t.p}`, platform: t.p, titre: T.titrePointHorsCompte(t.nom), texte: T.signalHorsCompteEbay(t.e.horsCompte?.chrome ?? null, t.e.horsCompte?.relie ?? null), bouton: synchroDe(t) })),
    ...tuiles.filter((t) => t.e.phase === 'incomplet' && !murDe.has(t.p))
      .map((t) => ({ cle: `incomplet-${t.p}`, platform: t.p, titre: T.titrePointIncomplet(t.nom), texte: T.signalIncomplet(t.nom, t.e.lus ?? 0, t.e.annonce ?? null), bouton: synchroDe(t) })),
    ...(expirees.length ? [{
      cle: '_expire',
      icone: Laptop,
      titre: T.titreEndormie,
      texte: T.texteEndormie(expirees.map((t) => t.nom).join(', ')),
      bouton: { libelle: T.ctaPointReessayer, icone: RotateCcw, onTap: () => r.toutRelever(), desactive: occupeLancer },
    }] : []),
  ];
  // La ligne verte de la feuille (planche 08) : les plateformes à jour, nommées.
  const reussite = (() => {
    const noms = tuiles.filter((t) => t.e.phase === 'fait' && !r.rangement?.parPlateforme?.[t.p] && !t.vide).map((t) => t.nom);
    if (!noms.length) return null;
    return fr
      ? `${noms.slice(0, -1).join(', ')}${noms.length > 1 ? ' et ' : ''}${noms[noms.length - 1]} ${noms.length > 1 ? 'sont' : 'est'} à jour`
      : `${noms.join(', ')} ${noms.length > 1 ? 'are' : 'is'} up to date`;
  })();

  // ── LES POINTS À RÉGLER, COMPTÉS UNE FOIS ─────────────────────────────────
  const alertesComptees = alertes.filter((a) => a.compte !== false);
  const nbPoints = murs.length + signaux.length + (r.message ? 1 : 0) + (nbARattacher > 0 ? 1 : 0)
    + (nbDoublons > 0 ? 1 : 0) + (!extVue ? 1 : 0) + alertesComptees.length;
  const infoSansPoint = nbPoints === 0
    ? (nbRangement > 0 ? T.rangement(nbRangement, nomsRangement) : (alertes[0]?.titre ?? null))
    : null;

  const plateformesOk = tuiles.filter((t) => t.e.phase === 'fait' && !t.vide).length;
  const quand = bilan.dernierFini != null ? ilYA(new Date(bilan.dernierFini).toISOString(), fr) : null;
  const ctaTexte = enCours ? T.ctaEnCours : r.toutBusy ? T.ctaEnvoi : extVue ? T.ctaTout : T.ctaExtension;
  const ctaInactif = enCours || occupe || !extVue;

  const pastilles = (tonResume) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, tuiles.length)},minmax(0,1fr))`, gap: 8, marginTop: 16 }}>
      {tuiles.map((t) => (
        <PastillePlateforme key={t.p} t={t} fr={fr} tonResume={tonResume}
          cliquable={!occupe && extVue && t.e.phase !== 'en_cours'}
          onTap={tonResume ? null : () => r.lancer(t.p)} />
      ))}
    </div>
  );

  return (
    <div className="sk-racine">
      <style>{CSS_ANNONCES}</style>

      {resume && !enCours ? (
        // ── APRÈS : le résumé, puis « À faire maintenant » ────────────────────
        <section aria-label={fr ? 'Synchronisation terminée' : 'Sync finished'} className="sk-entre" style={{ borderRadius: 20, overflow: 'hidden', background: '#FFFFFF', outline: `1px solid ${S.mentheBord}`, outlineOffset: -1, boxShadow: '0 16px 32px -20px rgba(27,110,98,0.45)' }}>
          <div style={{ padding: 16, background: S.menthe }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 48 }}>
              <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: '50%', background: DEGRADE_TUILE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', flexShrink: 0, boxShadow: '0 0 0 6px rgba(47,158,144,0.16), 0 8px 18px -8px rgba(27,110,98,0.8)' }}>
                <Check size={24} strokeWidth={2.6} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sk-chiffres" style={{ fontSize: 20, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>
                  {fr ? `${nombreFr(bilan.total ?? 0, lang)} annonce${(bilan.total ?? 0) > 1 ? 's' : ''} à jour` : `${bilan.total ?? 0} listing${(bilan.total ?? 0) > 1 ? 's' : ''} up to date`}
                </div>
                <div style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
                  {fr ? `sur ${plateformesOk} plateforme${plateformesOk > 1 ? 's' : ''}${quand ? ` · ${quand}` : ''}` : `on ${plateformesOk} platform${plateformesOk > 1 ? 's' : ''}${quand ? ` · ${quand}` : ''}`}
                </div>
              </div>
              <button type="button" className="sk-btn" onClick={() => setResume(false)} aria-label={fr ? 'Fermer le résumé' : 'Close the summary'}
                style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: '50%', background: 'transparent', color: S.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {pastilles(true)}
            {nbPoints > 0 && <LignePoints lang={lang} nombre={nbPoints} onOuvrir={() => setFeuille(true)} />}
          </div>
          {aFaire && (
            <div style={{ padding: '16px 16px 8px' }}>
              <div style={{ fontSize: 11, lineHeight: '16px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: S.ink2 }}>{fr ? 'À faire maintenant' : 'To do now'}</div>
              <div style={{ marginTop: 8 }}>{aFaire}</div>
            </div>
          )}
        </section>
      ) : (
        <section aria-label={fr ? 'Synchronisation des annonces' : 'Listings sync'} style={{ padding: enCours ? 16 : '16px 16px 0', boxSizing: 'border-box', borderRadius: 20, background: '#FFFFFF', boxShadow: `${OMBRE.synchro}, inset 0 0 0 1px ${S.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sk-une-ligne" style={{ fontSize: 14, lineHeight: '20px', fontWeight: 700, color: S.ink }}>
                {enCours ? T.titreEnCours : (etatVinted?.cadenceTexte && !quand ? etatVinted.cadenceTexte : (quand ? T.synchronise(quand) : T.sousJamais))}
              </div>
              <div className="sk-une-ligne sk-chiffres" style={{ fontSize: 12, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
                {enCours ? T.sousEnCours(vague.faites.length, vague.total) : (quand ? T.nAnnonces(bilan.total ?? 0) : (etatVinted?.cadenceTexte ?? ''))}
              </div>
            </div>
            <button type="button" className="sk-btn sk-presse" onClick={() => { if (!ctaInactif) r.toutRelever(); }} disabled={ctaInactif}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', border: 'none', borderRadius: 999,
                background: ctaInactif ? S.disabled : DEGRADE, color: ctaInactif ? S.ink2 : '#FFFFFF', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                boxShadow: ctaInactif ? 'none' : OMBRE.primaire,
              }}>
              {!ctaInactif && <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />}
              {ctaTexte}
            </button>
          </div>

          {!enCours && pastilles(false)}

          {enCours && (
            <div className="rv-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 152, marginTop: 16 }}>
                {/* L'ANIMATION ACTUELLE, À L'IDENTIQUE — le composant d'origine
                    et ses props d'origine (les plateformes du compte, pas les
                    membres de la vague : cf. CarteAnnoncesEnLigne). */}
                <ConstellationReleve plateformes={r.plateformes} faites={vague.faites} enCours={vague.enCours} empechees={empechees} labels={LABEL_RELEVE} />
              </div>
              <div style={{ marginTop: 16, fontSize: 13, lineHeight: '20px', fontWeight: 700, color: S.ink, textAlign: 'center' }}>
                {vague.enCours ? T.enCoursDe(LABEL_RELEVE[vague.enCours] ?? vague.enCours) : (vague.faites.length === vague.total ? T.enCoursRange : T.enCoursAttente)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 8, marginTop: 8, padding: '0 16px', boxSizing: 'border-box' }}>
                <div role="progressbar" aria-label={fr ? 'Progression de la synchronisation' : 'Sync progress'} aria-valuemin={0} aria-valuemax={vague.total} aria-valuenow={vague.faites.length}
                  style={{ position: 'relative', flex: 1, height: 6, borderRadius: 999, background: S.disabled, overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: DEGRADE, transformOrigin: 'left', transform: `scaleX(${vague.avancement})`, transition: 'transform .5s cubic-bezier(.22,.61,.36,1)' }} />
                  {vague.enCours && <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, width: '28%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent)', animation: 'rvBalaye 1.7s ease-in-out infinite' }} />}
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: '20px', fontWeight: 500, color: S.ink2, textAlign: 'center' }}>{T.enCoursSous}</div>
            </div>
          )}

          {!enCours && <LignePoints lang={lang} nombre={nbPoints} info={infoSansPoint} onOuvrir={() => setFeuille(true)} />}
          {!enCours && !nbPoints && !infoSansPoint && <div style={{ height: 16 }} />}
        </section>
      )}

      {/* La ligne Vinted : MONTÉE, pas affichée (cf. l'en-tête). */}
      {ligneVinted && <div aria-hidden="true" style={{ display: 'none' }}>{ligneVinted}</div>}

      {feuille && (
        <Feuille lang={lang} titre={nbPoints > 0 ? (fr ? `${nbPoints} point${nbPoints > 1 ? 's' : ''} à régler` : `${nbPoints} thing${nbPoints > 1 ? 's' : ''} to fix`) : (fr ? 'Synchronisation' : 'Sync')}
          actif={!ecran && !ecranDoublons && !r.oplaModale} onFermer={() => setFeuille(false)}>
          {reussite && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '8px 16px', boxSizing: 'border-box', borderRadius: 14, background: S.menthe, boxShadow: `inset 0 0 0 1px ${S.mentheBord}` }}>
              <CircleCheck size={20} color={S.tealDeep} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, lineHeight: '20px', fontWeight: 600, color: S.ink }}>{reussite}</span>
            </div>
          )}
          {alertes.map((a) => <CartePoint key={a.cle} icone={a.icone} titre={a.titre} texte={a.texte} ton={a.ton} bouton={a.bouton} enfant={a.enfant} />)}
          {/* Murs de connexion : la phrase et le bouton « Me connecter » restent
              ceux de BoutonMeConnecter (UN endroit), posés dans la carte. */}
          {murs.map((m) => (
            <CartePoint key={`mur-${m.platform}`} platform={m.platform}
              titre={m.motif === 'autoriser_opla' ? T.titrePointOpla : T.titrePointMur(m.nom)}
              enfant={(
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <BoutonMeConnecter userId={r.userId} platform={m.platform} motif={m.motif} lang={lang} variante="ligne" onOuverte={r.recharger} />
                  <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{T.murReprise}</span>
                </div>
              )} />
          ))}
          {signaux.map((sg) => (
            <CartePoint key={sg.cle} platform={sg.platform ?? null} icone={sg.icone ?? null} titre={sg.titre} texte={sg.texte} bouton={sg.bouton ?? null} />
          ))}
          {nbARattacher > 0 && (
            <CartePoint titre={fr ? 'Annonces à rattacher' : 'Listings to match'} texte={T.anomalie(nbARattacher)}
              bouton={{ libelle: T.anomalieCta, onTap: () => setEcran(true) }} />
          )}
          {nbDoublons > 0 && (
            <CartePoint titre={fr ? 'Est-ce le même article ?' : 'Is it the same item?'} texte={T.doublons(nbDoublons)}
              bouton={{ libelle: T.doublonsCta, onTap: () => setEcranDoublons(true) }} />
          )}
          {r.message && <CartePoint titre={fr ? 'Synchronisation refusée' : 'Sync refused'} texte={r.message.texte} />}
          {!extVue && (
            <CartePoint titre={fr ? 'Extension Chrome' : 'Chrome extension'} texte={null}
              enfant={<InstallExtensionCta lang={lang} isNative={isNative} userId={r.userId} userEmail={user?.email ?? null} source="stock_annonces" message={T.extensionAbsente} />} />
          )}
          {nbRangement > 0 && <CartePoint ton="info" titre={fr ? 'Rangement en cours' : 'Filing in progress'} texte={T.rangement(nbRangement, nomsRangement)} />}
          <p style={{ margin: 0, fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{T.note}</p>
        </Feuille>
      )}

      {ecran && (
        <EcranRattachement lang={lang} items={items} annonces={r.aRattacher}
          onClose={() => setEcran(false)}
          onDecision={() => { r.recharger(); if (typeof onRattache === 'function') onRattache(); }} />
      )}
      {ecranDoublons && (
        <EcranDoublons lang={lang} items={items} doublons={pairesDoublons}
          onClose={() => setEcranDoublons(false)}
          onDecision={() => { r.recharger(); if (typeof onRattache === 'function') onRattache(); }} />
      )}
      {r.oplaModale && <OplaAutorisationModal lang={lang} contexte="releve" userId={r.userId} onClose={r.fermerOplaModale} />}
    </div>
  );
}
