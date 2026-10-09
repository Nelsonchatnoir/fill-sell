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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, ChevronRight, X, Check, CircleAlert, CircleCheck, Info, Laptop, RotateCcw } from 'lucide-react';
import PlatformLogo from '../components/platform-logos/PlatformLogo';
import OplaAutorisationModal from '../components/OplaAutorisationModal';
import InstallExtensionCta from '../components/InstallExtensionCta';
import { LABEL_RELEVE } from '../utils/syncPlateformes';
import { useReleveAnnonces } from '../annonces/useReleveAnnonces';
import { etatTuile, lireVague, lireBilan, ilYA, murConnexionReleve, arretTechniqueReleve, texteSituation } from '../annonces/etatReleve';
import { textesAnnonces } from '../annonces/textes';
import { A, CSS_ANNONCES } from '../annonces/theme';
import ConstellationReleve from '../annonces/ConstellationReleve';
import EcranRattachement from '../annonces/EcranRattachement';
import EcranDoublons from '../annonces/EcranDoublons';
import BoutonMeConnecter from '../components/BoutonMeConnecter';
import { pairesAffichables, estQuestionDejaVendu, lireQuestionsAVerifier, pairesAVerifier, orphelinsAVerifier } from '../utils/doublons';
import Feuille from './Feuille';
import { S, OMBRE, DEGRADE, DEGRADE_TUILE } from './jetons';
import { nombreFr } from './regles';
import { lireNavigateurExtension, navigateurDeLApp, noteNavigateur } from '../utils/navigateurExtension';

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
  alertes = [], aFaire = null, onResume = null, onARattacher = null, itemsAVerifier = [],
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
  // (07/10, rattachement avant stock) La synchro n'est finie qu'une fois le
  // rapprochement serveur terminé : jusque-là, les annonces des autres
  // plateformes n'entrent pas dans le stock, et le bloc reste « en cours ».
  // Seulement après une synchro DEMANDÉE (relevés-gestes des 2 dernières
  // heures) : un passage de veille ne s'affiche jamais (règle du 05/10).
  const av = r.avancement ?? null;
  const rap = av?.rapprochement ?? null;
  const rapActif = !!rap && rap.etat !== 'termine' && Array.isArray(av?.releves) && av.releves.length > 0;
  const actifGlobal = vague.active || rapActif;
  const [vagueAvant, setVagueAvant] = useState(actifGlobal);
  if (actifGlobal !== vagueAvant) {
    setVagueAvant(actifGlobal);
    // (05/10, Marine) « 0 annonce à jour · sur 0 plateforme », coche verte,
    // après un relevé ARRÊTÉ : le résumé ne s'ouvre que si au moins une
    // plateforme a vraiment fini. Sinon le bloc reste, avec ses points.
    setResume(!actifGlobal && tuiles.some((t) => t.e.phase === 'fait' && !t.vide));
  }
  useEffect(() => { onResume?.(resume); }, [resume, onResume]);
  // « Annonces à vérifier » : les ARTICLES à vérifier (07/10 — hors du stock
  // affiché, avec leur question « Est-ce le même article ? ») et les annonces
  // proposées d'avant (écran de rattachement). StockTab les compte dans
  // « À régler » et les ouvre d'ici : d'abord les articles, puis les annonces.
  const idsAVerifier = useMemo(() => itemsAVerifier.map((i) => i.id), [itemsAVerifier]);
  const cleAVerifier = idsAVerifier.join(',');
  const [questionsAVerifier, setQuestionsAVerifier] = useState([]);
  useEffect(() => {
    if (!r.userId || !cleAVerifier) { setQuestionsAVerifier([]); return undefined; }
    let annule = false;
    lireQuestionsAVerifier(r.userId, cleAVerifier.split(','))
      .then((q) => { if (!annule) setQuestionsAVerifier(q); })
      .catch(() => { /* on garde la liste d'avant */ });
    return () => { annule = true; };
  }, [r.userId, cleAVerifier]);
  const tousItems = useMemo(() => [...items, ...itemsAVerifier], [items, itemsAVerifier]);
  const pairesAV = useMemo(() => pairesAVerifier(questionsAVerifier, tousItems, idsAVerifier), [questionsAVerifier, tousItems, idsAVerifier]);
  const orphelinsAV = useMemo(() => orphelinsAVerifier(itemsAVerifier, pairesAV), [itemsAVerifier, pairesAV]);
  const [ecranAVerifier, setEcranAVerifier] = useState(false);
  const nbArticlesAVerifier = itemsAVerifier.length;
  const nbAVerifier = nbArticlesAVerifier + r.aRattacher.length;
  const ouvrirAVerifierRef = useRef(null);
  ouvrirAVerifierRef.current = () => (nbArticlesAVerifier > 0 ? setEcranAVerifier(true) : setEcran(true));
  const ouvrirAVerifier = useCallback(() => ouvrirAVerifierRef.current?.(), []);
  useEffect(() => { onARattacher?.({ n: nbAVerifier, ouvrir: ouvrirAVerifier }); }, [nbAVerifier, onARattacher, ouvrirAVerifier]);
  // (09/10, Marta) Le navigateur où tourne l'extension : UNE lecture par
  // ouverture du bloc, jamais en boucle. Il n'est nommé que s'il n'est pas
  // celui de l'app (ou pas Chrome) — cf. utils/navigateurExtension.js.
  const [navExt, setNavExt] = useState(null);
  useEffect(() => {
    if (!ouvert || !r.userId) return undefined;
    let vivant = true;
    lireNavigateurExtension(r.userId).then((n) => { if (vivant) setNavExt(n); }).catch(() => {});
    return () => { vivant = false; };
  }, [ouvert, r.userId]);
  const navApp = useMemo(() => navigateurDeLApp(), []);
  const noteNav = (plateforme) => noteNavigateur({ ext: navExt, app: navApp, plateforme, lang });

  if (!ouvert || !r.userId) return ligneVinted ? <div aria-hidden="true" style={{ display: 'none' }}>{ligneVinted}</div> : null;

  const extVue = Number.isFinite(Date.parse(extensionStatus?.lastSeenAt ?? ''));
  const nbARattacher = r.aRattacher.length;
  const nomsRangement = Object.keys(r.rangement?.parPlateforme ?? {}).map((p) => LABEL_RELEVE[p] ?? p).join(', ');
  // « Déjà vendu ? » vit dans « À régler » (ventes) : ici, les AUTRES paires —
  // même forme que BandeauDejaVendu passe à EcranDoublons (paires hydratées).
  const pairesDoublons = pairesAffichables(r.doublons, items).filter((d) => !estQuestionDejaVendu(d));
  const nbDoublons = pairesDoublons.length;
  const enCours = actifGlobal;
  // ── LA BARRE, LE TEMPS RESTANT, L'AVANCEMENT PAR PLATEFORME (07/10) ──────
  // Calculés en base (synchro_avancement : volume annoncé par chaque
  // plateforme, vitesses mesurées) ; sans eux, la barre d'avant (plateformes
  // terminées sur le total de la vague).
  const pctAvancement = Math.round(100 * Math.max(0, Math.min(1, Number.isFinite(Number(av?.avancement)) ? Number(av.avancement) : vague.avancement)));
  const tempsRestant = enCours && av ? T.tempsRestant(Number(av.secondes_restantes)) : '';
  const lignesAvancement = enCours && av ? [
    ...(av.releves ?? []).map((x) => {
      const fini = x.status === 'done' || x.status === 'incomplete';
      const aConnecter = x.status === 'absente' || x.status === 'failed' || x.status === 'expired';
      return {
        cle: `pf-${x.platform}`, platform: x.platform, nom: LABEL_RELEVE[x.platform] ?? x.platform,
        actif: x.status === 'running',
        ton: fini ? 'fait' : aConnecter ? 'regler' : 'neutre',
        etat: x.status === 'queued' ? T.ligneAttente
          : x.status === 'running' ? (Number(x.lues) > 0 ? T.ligneLues(Number(x.lues), x.annoncees ?? null) : T.ligneEnCours)
          : fini ? (Number(x.lues) > 0 ? T.ligneLues(Number(x.lues), null) : T.ligneFini)
          : aConnecter ? T.ligneAConnecter : T.ligneFini,
      };
    }),
    ...(rap && (av.releves ?? []).length ? [{
      cle: 'rapprochement', platform: null, nom: T.ligneRapprochement,
      actif: rapActif && !vague.active,
      ton: rap.etat === 'termine' ? 'fait' : 'neutre',
      etat: rap.etat === 'termine' ? T.ligneFini
        : (rap.etat === 'attente_releves' || vague.active) ? T.ligneAttente
        : ((rap.en_attente ?? 0) + (rap.nouvelles ?? 0) > 0 ? T.ligneLues(Number(rap.traitees ?? 0), Number(rap.traitees ?? 0) + Number(rap.en_attente ?? 0) + Number(rap.nouvelles ?? 0)) : T.ligneEnCours),
    }] : []),
  ] : [];
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
  // « Ton ordinateur n'a pas répondu » : seulement les demandes que
  // l'ordinateur n'a JAMAIS prises (Chrome fermé). Une demande annulée par la
  // cadence n'est pas un point à régler.
  const expirees = tuiles.filter((t) => t.e.phase === 'expire' && t.e.situation === 'pas_prise');
  const signaux = [
    ...tuiles.filter((t) => t.vide).map((t) => ({ cle: `vide-${t.p}`, platform: t.p, titre: T.titrePointVide(t.nom), texte: T.signalVideRepete(t.nom), bouton: synchroDe(t) })),
    ...tuiles.filter((t) => t.e.phase === 'absente' && !murDe.has(t.p) && !(t.p === 'opla' && t.e.opla && oplaAutorisee))
      .map((t) => ({ cle: t.p, platform: t.p, titre: t.e.opla ? T.titrePointOpla : T.titrePointNonConnecte(t.nom), texte: t.e.opla ? T.signalOpla : [T.signalNonConnecte(t.nom), noteNav(t.nom)].filter(Boolean).join(' ') })),
    ...tuiles.filter((t) => t.e.phase === 'echec' && !murDe.has(t.p)).map((t) => {
      // (06/10) Vinted arrêté sur une boutique pas encore suivie : le geste est
      // « Choisir ma boutique » — il ouvre la confirmation (« Ajouter @x » /
      // « Ce n'est pas ma boutique »), plus jamais un « Réessayer » refusé.
      if (t.p === 'vinted' && etatVinted?.questionBoutique) {
        return {
          cle: 'vinted-boutique',
          platform: 'vinted',
          titre: T.titrePointBoutique,
          texte: T.finBoutiqueAConfirmer(etatVinted.questionBoutique.login ?? null),
          bouton: { libelle: T.ctaChoisirBoutique, icone: RefreshCw, onTap: () => { setFeuille(false); r.lancer('vinted'); }, desactive: occupeLancer },
        };
      }
      const technique = t.p !== 'vinted' && arretTechniqueReleve(r.runs[t.p] ?? null);
      // (05/10) Plus jamais le texte brut du relevé à l'écran (codes HTTP,
      // pages, minutes) : la situation, dite en clair, et le geste.
      return {
        cle: t.p,
        platform: t.p,
        titre: technique ? T.titrePointTechnique(t.nom) : T.titrePointArret(t.nom),
        texte: technique ? T.signalTechnique(t.nom) : [texteSituation(t.e.situation, t.nom, T), t.e.situation === 'pas_connecte' ? noteNav(t.nom) : null].filter(Boolean).join(' '),
        bouton: reessayer(t),
      };
    }),
    // (05/10) Un relevé ARRÊTÉ avant la fin n'est pas « ton ordinateur n'a pas
    // répondu » : il a commencé. On le dit tel quel, plateforme par plateforme.
    ...tuiles.filter((t) => t.e.phase === 'expire' && t.e.situation === 'arret' && !murDe.has(t.p))
      .map((t) => ({ cle: `arret-${t.p}`, platform: t.p, titre: T.titrePointArretFin(t.nom), texte: T.finArret(t.nom), bouton: synchroDe(t) })),
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

  // ── LE RETOUR D'UN APPUI SUR VINTED (06/10) ───────────────────────────────
  // La ligne Vinted est montée cachée : tout ce qu'elle disait après un appui
  // (ordinateur muet, demande déjà en attente, refus de la file, suivi
  // arrêté…) n'arrivait nulle part. Il remonte (etatVinted.message) : un refus
  // devient un point à régler, une information (cadence) s'écrit sous les
  // pastilles. Jamais un appui sans réponse.
  const msgVinted = etatVinted?.message?.texte ? etatVinted.message : null;
  const msgVintedPoint = msgVinted && msgVinted.ton !== 'vert' ? msgVinted : null;
  const msgVintedInfo = msgVinted && msgVinted.ton === 'vert' ? msgVinted : null;

  // ── LES POINTS À RÉGLER, COMPTÉS UNE FOIS ─────────────────────────────────
  const alertesComptees = alertes.filter((a) => a.compte !== false);
  const nbPoints = murs.length + signaux.length + (r.message ? 1 : 0) + (msgVintedPoint ? 1 : 0) + (nbARattacher > 0 ? 1 : 0) + (nbArticlesAVerifier > 0 ? 1 : 0)
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
                <div style={{ fontSize: 20, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em', color: S.ink }}>
                  {T.stockPret}
                </div>
                <div className="sk-chiffres" style={{ fontSize: 13, lineHeight: '20px', fontWeight: 500, color: S.ink2 }}>
                  {fr ? `${nombreFr(bilan.total ?? 0, lang)} annonce${(bilan.total ?? 0) > 1 ? 's' : ''} à jour sur ${plateformesOk} plateforme${plateformesOk > 1 ? 's' : ''}${quand ? ` · ${quand}` : ''}` : `${bilan.total ?? 0} listing${(bilan.total ?? 0) > 1 ? 's' : ''} up to date on ${plateformesOk} platform${plateformesOk > 1 ? 's' : ''}${quand ? ` · ${quand}` : ''}`}
                </div>
              </div>
              <button type="button" className="sk-btn" onClick={() => setResume(false)} aria-label={fr ? 'Fermer le résumé' : 'Close the summary'}
                style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: '50%', background: 'transparent', color: S.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {pastilles(true)}
            {/* (08/10) Une plateforme pas connectée se dit TOUT DE SUITE, avec son
                geste — plus jamais une pastille « à connecter » sans rien derrière
                (vtvente48, 07/10 : Leboncoin et Beebs « absente », aucun geste). */}
            {murs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {murs.map((m) => (
                  <div key={`resume-mur-${m.platform}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: '#FFFFFF', boxShadow: `inset 0 0 0 1px ${S.border}` }}>
                    <PlatformLogo platform={m.platform} size={18} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: '16px', fontWeight: 700, color: S.ambreEncre }}>
                      {m.motif === 'autoriser_opla' ? T.titrePointOpla : T.titrePointNonConnecte(m.nom)}
                    </span>
                    <BoutonMeConnecter userId={r.userId} platform={m.platform} motif={m.motif} lang={lang} variante="ligne" onOuverte={r.recharger} />
                  </div>
                ))}
                {noteNav(murs.map((m) => m.nom).join(', ')) && (
                  <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: S.ambreEncre }}>{noteNav(murs.map((m) => m.nom).join(', '))}</span>
                )}
              </div>
            )}
            {nbAVerifier > 0 && (
              // (07/10) Les doutes vivent HORS du stock : on le dit dès la fin, avec le geste.
              <button type="button" className="sk-btn" onClick={ouvrirAVerifier}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 40, marginTop: 8, padding: 0, border: 'none', background: 'transparent', boxShadow: `inset 0 1px 0 ${S.mentheBord}`, color: S.ambreEncre, fontSize: 13, fontWeight: 700, textAlign: 'left' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: S.ambrePoint, flexShrink: 0 }} />
                <span className="sk-une-ligne" style={{ flex: 1, minWidth: 0 }}>{T.aVerifierTitre(nbAVerifier)}</span>
                <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              </button>
            )}
            {/* Les annonces à vérifier ont leur ligne juste au-dessus : pas deux fois. */}
            {nbPoints - (nbAVerifier > 0 ? 1 : 0) > 0 && <LignePoints lang={lang} nombre={nbPoints - (nbAVerifier > 0 ? 1 : 0)} onOuvrir={() => setFeuille(true)} />}
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
                {enCours ? (vague.active ? T.sousEnCours(vague.faites.length, vague.total) : T.rapprochementEnCours) : (quand ? T.nAnnonces(bilan.total ?? 0) : (etatVinted?.cadenceTexte ?? ''))}
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
          {!enCours && msgVintedInfo && (
            <p role="status" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: '16px', fontWeight: 600, color: S.ink2 }}>
              <PlatformLogo platform="vinted" size={12} /> {msgVintedInfo.texte}
            </p>
          )}

          {enCours && (
            <div className="rv-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 152, marginTop: 16 }}>
                {/* L'ANIMATION ACTUELLE, À L'IDENTIQUE — le composant d'origine
                    et ses props d'origine (les plateformes du compte, pas les
                    membres de la vague : cf. CarteAnnoncesEnLigne). */}
                <ConstellationReleve plateformes={r.plateformes} faites={vague.faites} enCours={vague.enCours} empechees={empechees} labels={LABEL_RELEVE} />
              </div>
              <div style={{ marginTop: 16, fontSize: 13, lineHeight: '20px', fontWeight: 700, color: S.ink, textAlign: 'center' }}>
                {vague.enCours ? T.enCoursDe(LABEL_RELEVE[vague.enCours] ?? vague.enCours)
                  : rapActif ? T.rapprochementEnCours
                  : (vague.faites.length === vague.total ? T.enCoursRange : T.enCoursAttente)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: 8, marginTop: 8, padding: '0 16px', boxSizing: 'border-box' }}>
                <div role="progressbar" aria-label={fr ? 'Progression de la synchronisation' : 'Sync progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctAvancement}
                  style={{ position: 'relative', flex: 1, height: 6, borderRadius: 999, background: S.disabled, overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: DEGRADE, transformOrigin: 'left', transform: `scaleX(${pctAvancement / 100})`, transition: 'transform .5s cubic-bezier(.22,.61,.36,1)' }} />
                  {(vague.enCours || rapActif) && <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, width: '28%', background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent)', animation: 'rvBalaye 1.7s ease-in-out infinite' }} />}
                </div>
              </div>
              {tempsRestant && (
                <div role="status" className="sk-chiffres" style={{ marginTop: 8, fontSize: 13, lineHeight: '20px', fontWeight: 700, color: S.tealDeep, textAlign: 'center' }}>{tempsRestant}</div>
              )}
              <div style={{ marginTop: tempsRestant ? 0 : 8, fontSize: 12, lineHeight: '20px', fontWeight: 500, color: S.ink2, textAlign: 'center' }}>
                {rapActif && !vague.active ? T.rapprochementSous((rap?.en_attente ?? 0) + (rap?.nouvelles ?? 0)) : T.enCoursSous}
              </div>
              {lignesAvancement.length > 0 && (
                <ul aria-label={fr ? 'Avancement par plateforme' : 'Progress by platform'} style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {lignesAvancement.map((l) => (
                    <li key={l.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28, padding: '0 8px', borderRadius: 10, background: l.actif ? S.menthe : 'transparent' }}>
                      {l.platform ? <PlatformLogo platform={l.platform} size={16} desature={l.ton === 'hors'} /> : <RefreshCw size={14} color={S.tealDeep} aria-hidden="true" />}
                      <span className="sk-une-ligne" style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: '16px', fontWeight: 700, color: S.ink }}>{l.nom}</span>
                      <span className="sk-chiffres" style={{ flexShrink: 0, fontSize: 12, lineHeight: '16px', fontWeight: 600, color: l.ton === 'regler' ? S.ambreEncre : l.ton === 'fait' ? S.tealDeep : S.ink2 }}>
                        {l.ton === 'fait' && <Check size={12} strokeWidth={2.6} aria-hidden="true" style={{ marginRight: 4, verticalAlign: '-1px' }} />}{l.etat}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
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
                  {noteNav(m.nom) && <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: S.ambreEncre }}>{noteNav(m.nom)}</span>}
                  <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: S.ink2 }}>{T.murReprise}</span>
                </div>
              )} />
          ))}
          {signaux.map((sg) => (
            <CartePoint key={sg.cle} platform={sg.platform ?? null} icone={sg.icone ?? null} titre={sg.titre} texte={sg.texte} bouton={sg.bouton ?? null} />
          ))}
          {nbArticlesAVerifier > 0 && (
            <CartePoint titre={T.aVerifierTitre(nbArticlesAVerifier)} texte={T.aVerifierTexte}
              bouton={{ libelle: T.aVerifierCta, onTap: () => setEcranAVerifier(true) }} />
          )}
          {nbARattacher > 0 && (
            <CartePoint titre={T.aVerifierTitre(nbARattacher)} texte={T.aVerifierTexte}
              bouton={{ libelle: T.aVerifierCta, onTap: () => setEcran(true) }} />
          )}
          {nbDoublons > 0 && (
            <CartePoint titre={fr ? 'Est-ce le même article ?' : 'Is it the same item?'} texte={T.doublons(nbDoublons)}
              bouton={{ libelle: T.doublonsCta, onTap: () => setEcranDoublons(true) }} />
          )}
          {r.message && <CartePoint titre={fr ? 'Synchronisation refusée' : 'Sync refused'} texte={r.message.texte} />}
          {msgVintedPoint && <CartePoint platform="vinted" titre={T.titrePointVinted} texte={msgVintedPoint.texte} />}
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
      {ecranAVerifier && (
        <EcranDoublons lang={lang} items={tousItems} doublons={[]} mode="a_verifier" userId={r.userId}
          paires={pairesAV} orphelins={orphelinsAV}
          onClose={() => setEcranAVerifier(false)}
          onDecision={() => { r.recharger(); if (typeof onRattache === 'function') onRattache(); }} />
      )}
      {r.oplaModale && <OplaAutorisationModal lang={lang} contexte="releve" userId={r.userId} onClose={r.fermerOplaModale} />}
    </div>
  );
}
