// ═════════════════════════════════════════════════════════════════════════════
// RELEVÉ DES ANNONCES PAR PLATEFORME — bloc du Stock + écran de rattachement
// (2026-09-17, sync multiplateforme lot 2). docs/SYNC_MULTIPLATEFORME_CONCEPTION.md
// ═════════════════════════════════════════════════════════════════════════════
// Rendu SEULEMENT si l'interrupteur serveur est ouvert (prop `ouvert`, lue par
// StockTab via lireSyncMultiOuverte — fail-closed). Tant qu'il est fermé, rien
// de ce bloc n'existe à l'écran et aucun texte n'annonce le relevé.
//
// Deux surfaces :
//   1. le BLOC (sous la carte de relevé Vinted) : une ligne par plateforme —
//      logo, dernier relevé (quand, combien), « à rattacher », bouton Relever ;
//   2. l'ÉCRAN de rattachement : les annonces relevées que le moteur n'a pas
//      pu rattacher SEUL. Trois bandes côté serveur : certain → déjà fait,
//      invisible ici ; incertain → PROPOSÉ (« C'est peut-être … ») et c'est
//      SON bouton ; improbable → aucune proposition, trois gestes :
//      « Choisir l'article », « Importer », « Ignorer ». Une décision reste
//      réversible (détacher, depuis la fiche — lot suivant : ici on n'expose
//      que les décisions d'entrée).
// ⛔ Aucune de ces décisions ne retire une annonce ni ne déclare une vente.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import PlatformLogo from './platform-logos/PlatformLogo';
import OplaAutorisationModal from './OplaAutorisationModal';
import { useOplaAcces } from '../utils/oplaAcces';
import { track } from '../analytics/analytics';
import { jumeauProbable } from '../utils/rapprochementJumeau';
import {
  PLATEFORMES_RELEVE, LABEL_RELEVE, demanderRelevePlateforme, lireDerniersRunsReleve,
  lireAnnoncesARattacher, compterAnnoncesParPlateforme, deciderRapprochement, texteRefusReleve,
  lireDernierRunVinted,
} from '../utils/syncPlateformes';

// Âge d'un relevé, en DEUX caractères : « 12 min », « 9 h », « 2 j ». La
// tuile d'une plateforme n'a pas la place de la phrase complète d'ilYA, et
// n'en a pas besoin — la phrase reste dans le repli.
const depuisCourt = (iso, fr) => {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return fr ? `${Math.round(h / 24)} j` : `${Math.round(h / 24)} d`;
};

const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute: '#8A8578', mute2: '#5C6560',
  teal: '#2F9E90', tealDeep: '#1B6E62', amberBg: '#FFF6E3', amberBd: '#EED9A6', amberInk: '#8A6100',
  // Ajoutés le 19/09 avec les tuiles de plateforme : un filet INTÉRIEUR plus
  // clair que la bordure de carte (sinon la carte se lit comme un tableau),
  // et les trois tons des pastilles d'état. Mêmes valeurs que le reste de
  // l'app — aucune seconde palette.
  borderSoft: '#EFECE3', pipOk: '#2F9E90', pipWarn: '#E0A53C', pipBad: '#D4544F',
};

// ── UNE PLATEFORME ABSENTE N'EST PAS UN RELEVÉ RATÉ (2026-09-18) ────────────
// Constat Nico : Leo-paul Hug a pris QUATRE runs `failed` en une matinée —
// « accès Opla non accordé », « session ebay : page de connexion », idem
// Beebs — alors qu'il n'a de compte sur AUCUNE des trois. Son journal était
// plein d'échecs qui n'en étaient pas.
//
// DEUX PORTES, et c'est délibéré :
//   · `status === 'absente'` — ce que l'extension écrira à partir de la 0.6.43 ;
//   · à défaut, la SIGNATURE de l'échec sur un run `failed` sans une seule
//     annonce vue. C'est ce qui éteint le bruit DÈS AUJOURD'HUI, pour tout le
//     parc et pour les runs DÉJÀ enregistrés, sans réécrire une seule ligne
//     en base — aucun compte n'est réparé à la main.
// ⛔ La condition `items_vus === 0` n'est pas décorative : un mur de connexion
//    rencontré en page 3 d'un relevé qui marchait reste un vrai incident.
// Les deux motifs sont les messages que l'extension écrit elle-même
// (background.js, releverAnnoncesPlateforme) — couplage étroit, assumé, et la
// porte par statut le rendra inutile quand tout le parc sera à jour.
function absenceDePlateforme(run) {
  if (!run) return false;
  if (run.status === 'absente') return true;
  if (run.status !== 'failed' || (run.items_vus ?? 0) > 0) return false;
  return /accès opla non accordé|page de connexion/i.test(String(run.erreur ?? ''));
}

function ilYA(iso, fr) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return fr ? 'à l’instant' : 'just now';
  if (min < 60) return fr ? `il y a ${min} min` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return fr ? `il y a ${h} h` : `${h} h ago`;
  const j = Math.round(h / 24);
  return fr ? `il y a ${j} j` : `${j} d ago`;
}

// `plateformes` : la liste du COMPTE (plateformesDuCompte, StockTab) — le même
// jeu que les cartes, les chips et la modale de retrait. Sans elle, le plafond.
// `integre` (refonte du 17/09 soir) : le bloc unique « Mes annonces en ligne »
// du Stock — sans cadre propre (le parent le pose), Vinted en PREMIÈRE ligne
// (`ligneVinted`, même format que les quatre autres), « Tout relever » en bas
// (`lancerVinted` + les relevés des autres plateformes, à la suite).
//
// ── UNE SEULE LIGNE PAR DÉFAUT (refonte du 18/09, constat Nico) ─────────────
// L'état précédent : CINQ lignes identiques, chacune avec son bouton, plus un
// « Tout relever », plus deux paragraphes. Le bloc le plus chargé de l'écran
// Stock, pour un geste qui est le même cinq fois.
// Désormais :
//   · UN bouton principal, « Tout relever » — il relève tout ;
//   · SOUS lui, une ligne d'état courte, toutes plateformes confondues
//     (dernier relevé + nombre d'annonces vues) ;
//   · le détail par plateforme derrière un repli FERMÉ par défaut, qui garde
//     les boutons individuels, les motifs et les délais ;
//   · UNE phrase d'explication, pas deux. Le rappel « un relevé ne compte ni
//     comme une publication ni comme une republication » descend dans le repli.
// ⛔ UN SEUL VERBE : « Relever ». Pas de « Synchroniser », pas d'« Actualiser »,
//    pas de « Scanner » — ni ici, ni dans la ligne Vinted, ni dans les refus.
// ⛔ CE QUI NE PEUT PAS DISPARAÎTRE DANS LE REPLI :
//    · une plateforme non connectée / sans session garde sa ligne et SON MOTIF
//      dans le repli (elle n'est jamais retirée de la liste) ;
//    · un délai de cadence qui EMPÊCHE de relever se dit sur la ligne
//      principale, replié ou non (`cadenceBloquante`).
// ⛔ Le moteur de relevé n'est pas touché : `lancer`, `toutRelever`,
//    `demanderRelevePlateforme` et les refus sont ceux d'avant, au mot près.
export default function RelevesPlateformes({ lang, user, items = [], ouvert = false, extensionStatus = null, onRattache = null, plateformes = null, integre = false, ligneVinted = null, lancerVinted = null, etatVinted = null }) {
  const listePlateformes = Array.isArray(plateformes) ? plateformes.filter((p) => PLATEFORMES_RELEVE.includes(p)) : PLATEFORMES_RELEVE;
  const fr = lang !== 'en';
  const [runs, setRuns] = useState({});
  const [runVinted, setRunVinted] = useState(null);
  const [compte, setCompte] = useState({});
  const [aRattacher, setARattacher] = useState([]);
  const [busy, setBusy] = useState(null);      // plateforme en cours de demande
  const [message, setMessage] = useState(null);
  const [detail, setDetail] = useState(false); // le repli — FERMÉ par défaut
  const [ecran, setEcran] = useState(false);
  // `tick` : un relevé demandé ou une décision prise relance la lecture sans
  // attendre le poll de 30 s (le run et les annonces rendent compte en base —
  // c'est la base qu'on relit, jamais l'extension).
  const [tick, setTick] = useState(0);
  const recharger = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!ouvert || !user?.id) return undefined;
    let annule = false;
    const uid = user.id;
    const charger = async () => {
      const [r, c, a, v] = await Promise.all([
        lireDerniersRunsReleve(uid), compterAnnoncesParPlateforme(uid), lireAnnoncesARattacher(uid),
        lireDernierRunVinted(uid),
      ]);
      if (annule) return;
      setRuns(r); setCompte(c); setARattacher(a); setRunVinted(v);
    };
    const t0 = setTimeout(charger, 0);
    const t = setInterval(charger, 30000);
    return () => { annule = true; clearTimeout(t0); clearInterval(t); };
  }, [ouvert, user?.id, tick]);

  // ── OPLA : la question au moment du clic (18/09/2026) ────────────────────
  // Relever Opla sans l’autorisation d’hôte ne rend RIEN (la sonde ne part
  // même pas). On le dit sur place, avec le geste, plutôt que de laisser
  // repartir un run vide. Pas d’autorisation connue → pas de modale : on ne
  // harcèle pas sur un « je ne sais pas ».
  const { acces: oplaAcces, relire: relireOplaAcces } = useOplaAcces({ userId: user?.id });
  const [oplaModale, setOplaModale] = useState(false);
  const lancer = async (platform) => {
    if (busy) return;
    if (platform === 'opla' && oplaAcces === false) { setOplaModale(true); return; }
    setBusy(platform); setMessage(null);
    const r = await demanderRelevePlateforme(platform).catch((e) => ({ ok: false, reason: 'erreur', message: String(e?.message ?? e) }));
    setBusy(null);
    if (!r?.ok) { setMessage({ ton: 'orange', texte: texteRefusReleve(r, lang, platform) }); return; }
    track('releve_plateforme_demande', { platform, reason: r.reason });
    recharger();
  };
  // « Tout relever » : Vinted d'abord (son propre chemin), puis chaque
  // plateforme à la suite. Les refus (cadence, relevé déjà en cours…) sont
  // réunis en UN message ; ce qui part, part.
  const [toutBusy, setToutBusy] = useState(false);
  const toutRelever = async () => {
    if (busy || toutBusy) return;
    setToutBusy(true); setMessage(null);
    try { if (typeof lancerVinted === 'function') lancerVinted(); } catch { /* la ligne Vinted dit le refus */ }
    const refus = [];
    for (const p of listePlateformes) {
      const run = runs[p] ?? null;
      if (run && (run.status === 'queued' || run.status === 'running')) continue;
      // Opla sans autorisation : sautée, avec son motif. Un geste GLOBAL ne
      // doit pas faire surgir une modale — le bouton « Relever » d’Opla, lui,
      // la pose (c’est le clic qui la vise).
      if (p === 'opla' && oplaAcces === false) {
        refus.push(fr ? 'Opla : autorisation à donner dans l’extension.' : 'Opla: permission to grant in the extension.');
        continue;
      }
      const r = await demanderRelevePlateforme(p).catch((e) => ({ ok: false, reason: 'erreur', message: String(e?.message ?? e) }));
      if (!r?.ok) { refus.push(`${LABEL_RELEVE[p]} : ${texteRefusReleve(r, lang, p)}`); continue; }
      track('releve_plateforme_demande', { platform: p, reason: r.reason, depuis: 'tout_relever' });
    }
    setToutBusy(false);
    if (refus.length) setMessage({ ton: 'orange', texte: refus.join(' · ') });
    recharger();
  };

  if (!ouvert || !user?.id) return null;

  const extVue = Number.isFinite(Date.parse(extensionStatus?.lastSeenAt ?? ''));
  const nbARattacher = aRattacher.length;

  // ── LA LIGNE D'ÉTAT UNIQUE — toutes plateformes confondues ────────────────
  // Le « dernier relevé », c'est le PLUS RÉCENT des relevés réussis (Vinted
  // compris) ; le nombre, c'est la SOMME de ce que chaque dernier relevé
  // réussi a vu. Une plateforme jamais relevée n'ajoute rien et ne retire
  // rien — elle a sa ligne et son motif dans le repli.
  const relevesReussis = [
    ...(runVinted?.finished_at ? [{ fini: Date.parse(runVinted.finished_at), vus: Number(runVinted.items_vus ?? 0) }] : []),
    ...listePlateformes
      .map((p) => runs[p])
      .filter((r) => r?.status === 'done' && r.finished_at)
      .map((r) => ({ fini: Date.parse(r.finished_at), vus: Number(r.items_vus ?? 0) })),
  ].filter((r) => Number.isFinite(r.fini));
  const dernierFini = relevesReussis.length ? Math.max(...relevesReussis.map((r) => r.fini)) : null;
  const totalVus = relevesReussis.reduce((t, r) => t + (Number.isFinite(r.vus) ? r.vus : 0), 0);
  const enCoursQuelquePart = !!etatVinted?.enCours
    || listePlateformes.some((p) => runs[p] && (runs[p].status === 'queued' || runs[p].status === 'running'));
  // Le délai de cadence ne se cache PAS dans le repli : s'il empêche de
  // relever, il se lit sur la ligne principale. Vinted le remonte (etatVinted),
  // les autres plateformes ne l'exposent qu'au refus — leur cadence sort donc
  // dans `message`, à la même place.
  const cadenceBloquante = etatVinted?.cadenceTexte ?? null;
  const ligneEtat = (() => {
    if (enCoursQuelquePart) return fr ? 'Relevé en cours…' : 'Scan running…';
    if (cadenceBloquante) return cadenceBloquante;
    if (dernierFini == null) return fr ? 'Jamais relevé' : 'Never scanned';
    return fr
      ? `Relevé ${ilYA(new Date(dernierFini).toISOString(), fr)} · ${totalVus} annonce${totalVus > 1 ? 's' : ''}`
      : `Scanned ${ilYA(new Date(dernierFini).toISOString(), fr)} · ${totalVus} listing${totalVus > 1 ? 's' : ''}`;
  })();
  // ── L'ÉTAT D'UNE TUILE (2026-09-19) ───────────────────────────────────────
  // Trois choses, pas une de plus : combien d'annonces, l'état en UN mot, la
  // couleur de la pastille. Aucune nouvelle lecture — tout vient de ce que le
  // composant lit déjà (runs, runVinted, compte, etatVinted).
  // Vinted passe par son propre run (elle a son chemin depuis toujours) ; les
  // quatre autres par `runs`. Le nombre affiché est celui du DERNIER relevé
  // réussi — pas le stock, pas une estimation.
  const etatTuile = (p) => {
    const vinted = p === 'vinted';
    const run = vinted ? runVinted : (runs[p] ?? null);
    const enCours = vinted
      ? !!etatVinted?.enCours
      : !!(run && (run.status === 'queued' || run.status === 'running'));
    if (enCours) return { n: '·', mot: fr ? 'en cours…' : 'running…', pip: P.pipOk, enCours: true };
    // Vinted : `lireDernierRunVinted` ne rend que des runs finis, son
    // `finished_at` suffit. Les autres portent un `status`.
    const fini = vinted ? run?.finished_at : (run?.status === 'done' ? run.finished_at : null);
    if (fini) {
      const n = Number(run.items_vus ?? 0);
      return { n: Number.isFinite(n) ? n : 0, mot: depuisCourt(fini, fr) ?? (fr ? 'relevé' : 'scanned'), pip: P.pipOk, enCours: false };
    }
    // Pas de session chez la plateforme : ce n'est PAS un échec (cf. l'en-tête
    // de ce fichier, dossier Leo-paul Hug) — la tuile le dit en un mot, sans
    // pastille rouge et sans compter d'annonces.
    if (!vinted && absenceDePlateforme(run)) {
      return {
        n: '—',
        mot: /opla/i.test(String(run?.erreur ?? '')) ? (fr ? 'à autoriser' : 'to allow') : (fr ? 'à connecter' : 'to connect'),
        pip: P.pipWarn, enCours: false,
      };
    }
    if (run?.status === 'failed') return { n: '—', mot: fr ? 'échec' : 'failed', pip: P.pipBad, enCours: false };
    if (run?.status === 'expired' || run?.status === 'cancelled') {
      return { n: '—', mot: fr ? 'expiré' : 'expired', pip: P.pipWarn, enCours: false };
    }
    return { n: '—', mot: fr ? 'jamais' : 'never', pip: P.mute, enCours: false };
  };

  return (
    <div style={integre
      ? { display: 'flex', flexDirection: 'column', gap: 10 }
      : { background: '#fff', border: `1px solid ${P.border}`, borderRadius: 20, padding: '14px 16px', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── L'EN-TÊTE : le titre, la date du dernier relevé, et LE geste ─────
          « Tout relever » était un pavé teal pleine largeur SOUS trois lignes
          d'explication : il mangeait la carte et lui donnait un air de
          formulaire, alors que l'information qu'on vient chercher — mes
          annonces, plateforme par plateforme — était enfermée dans le repli.
          Il redevient un bouton, à côté de l'état, et ce sont les PLATEFORMES
          qui occupent la carte (refonte du 19/09). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: P.ink, letterSpacing: '-0.01em' }}>
            {integre
              ? (fr ? 'Mes annonces en ligne' : 'My listings online')
              : (fr ? 'Mes annonces sur les autres plateformes' : 'My listings on the other platforms')}
          </div>
          {integre && (
            <div style={{ fontSize: 11.5, color: P.mute, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{ligneEtat}</div>
          )}
        </div>
        {integre && (
          <button type="button" disabled={!!busy || toutBusy || !extVue} onClick={toutRelever}
            title={!extVue ? (fr ? "Il faut l'extension Chrome sur un ordinateur." : 'The Chrome extension on a computer is needed.') : undefined}
            style={{
              flexShrink: 0, padding: '9px 14px', borderRadius: 999, border: 'none',
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
              background: (busy || toutBusy || !extVue) ? '#E7E3D8' : `linear-gradient(120deg,${P.teal},${P.tealDeep})`,
              color: (busy || toutBusy || !extVue) ? P.mute : '#fff',
              cursor: (busy || toutBusy || !extVue) ? 'default' : 'pointer',
            }}>
            {toutBusy ? (fr ? 'Envoi…' : 'Sending…') : (fr ? 'Tout relever' : 'Scan all')}
          </button>
        )}
        {!integre && nbARattacher > 0 && (
          <button type="button" onClick={() => setEcran(true)}
            style={{ padding: '7px 12px', borderRadius: 999, border: 'none', background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            {fr ? `Rattacher ${nbARattacher} annonce${nbARattacher > 1 ? 's' : ''}` : `Match ${nbARattacher} listing${nbARattacher > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* ── LES CINQ PLATEFORMES, À L'ÉCRAN ──────────────────────────────────
          Le logo, ce qui a été relevé, et l'état en un mot. Une plateforme à
          connecter ou à autoriser le DIT ici : plus besoin de déplier pour
          comprendre pourquoi eBay ne remonte rien. Un tap relève cette
          plateforme-là — le bouton par ligne du repli reste, pour qui l'ouvre. */}
      {integre && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 6 }}>
          {['vinted', ...listePlateformes].map((p) => {
            const t = etatTuile(p);
            const cliquable = !busy && !toutBusy && extVue && !t.enCours;
            return (
              <button key={p} type="button" disabled={!cliquable}
                onClick={() => { if (p === 'vinted') { try { lancerVinted?.(); } catch { /* la ligne Vinted dit le refus */ } } else lancer(p); }}
                aria-label={`${LABEL_RELEVE[p] ?? p} — ${t.mot}`}
                style={{
                  position: 'relative', background: P.paper, border: `1px solid ${P.borderSoft}`, borderRadius: 13,
                  padding: '9px 3px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  fontFamily: 'inherit', cursor: cliquable ? 'pointer' : 'default', minWidth: 0,
                }}>
                <span aria-hidden="true" style={{
                  position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 999,
                  border: '1.5px solid #fff', background: t.pip,
                }} />
                <PlatformLogo platform={p} size={22} desature={t.pip === P.mute} />
                <span style={{ fontSize: 13, fontWeight: 700, color: P.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{t.n}</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: P.mute, textAlign: 'center', lineHeight: 1.25, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.mot}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Ce qui reste à trancher — en pied de carte, et SEULEMENT s'il y a
          vraiment quelque chose à rattacher. */}
      {integre && nbARattacher > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: `1px solid ${P.borderSoft}` }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: P.mute2, lineHeight: 1.45 }}>
            {fr
              ? `${nbARattacher} annonce${nbARattacher > 1 ? 's relevées ne sont' : ' relevée n’est'} rattachée${nbARattacher > 1 ? 's' : ''} à aucun article.`
              : `${nbARattacher} scanned listing${nbARattacher > 1 ? 's are' : ' is'} not matched to any item.`}
          </div>
          <button type="button" onClick={() => setEcran(true)}
            style={{ flexShrink: 0, padding: '8px 13px', borderRadius: 999, border: `1px solid ${P.border}`, background: 'transparent', color: P.tealDeep, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {fr ? 'Rattacher' : 'Match'}
          </button>
        </div>
      )}

      {/* Hors bloc intégré, la phrase d'explication reste sous le titre — c'est
          le seul endroit où elle est encore lue à froid. Dans le Stock, elle a
          rejoint le repli (elle y est en entier). */}
      {!integre && (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: P.mute2 }}>
          {fr
            ? 'FillSell relit « Mes annonces » sur chaque plateforme et rattache ce qu’il reconnaît à ton stock — un même article, une seule fiche. Le reste, tu le tranches. Rien n’est publié, modifié ni retiré.'
            : 'FillSell re-reads “My listings” on each platform and matches what it recognises to your stock — one item, one card. You decide the rest. Nothing is published, edited or removed.'}
        </div>
      )}
      {integre && !extVue && (
        <div style={{ fontSize: 11.5, color: P.mute, lineHeight: 1.45 }}>
          {fr ? "Il faut l'extension Chrome ouverte sur un ordinateur." : 'The Chrome extension must be open on a computer.'}
        </div>
      )}
      {/* ── LE DÉTAIL, REPLIÉ ─────────────────────────────────────────────────
          Fermé par défaut. Il garde TOUT ce qui était à l'écran avant : la
          ligne de chaque plateforme (Vinted comprise), son état complet, son
          motif quand elle ne peut pas être relevée, son bouton, et le rappel
          « un relevé ne publie rien ». Une plateforme sans session n'est pas
          retirée de la liste — elle reste visible ici, avec sa raison. */}
      {integre && (
        <button type="button" onClick={() => setDetail((d) => !d)} aria-expanded={detail}
          style={{ alignSelf: 'flex-start', padding: '4px 0', border: 'none', background: 'none', color: P.tealDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {detail
            ? (fr ? '▾ Masquer le détail par plateforme' : '▾ Hide the per-platform detail')
            : (fr ? `▸ Détail par plateforme (${listePlateformes.length + 1})` : `▸ Per-platform detail (${listePlateformes.length + 1})`)}
        </button>
      )}
      <div style={{ display: integre && !detail ? 'none' : 'flex', flexDirection: 'column', gap: 6 }}>
        {integre && ligneVinted}
        {listePlateformes.map((p) => {
          const run = runs[p] ?? null;
          const c = compte[p] ?? null;
          const enCours = run && (run.status === 'queued' || run.status === 'running');
          let etat;
          if (enCours) etat = run.status === 'running' ? (fr ? 'Relevé en cours…' : 'Scanning…') : (fr ? 'Demande en attente de ton ordinateur' : 'Waiting for your computer');
          else if (run?.status === 'done') etat = fr
            ? `Relevé ${ilYA(run.finished_at, fr) ?? ''} · ${run.items_vus ?? 0} annonce${(run.items_vus ?? 0) > 1 ? 's' : ''}${c?.aRattacher ? ` · ${c.aRattacher} à rattacher` : ''}`
            : `Scanned ${ilYA(run.finished_at, fr) ?? ''} · ${run.items_vus ?? 0} listing${(run.items_vus ?? 0) > 1 ? 's' : ''}${c?.aRattacher ? ` · ${c.aRattacher} to match` : ''}`;
          else if (absenceDePlateforme(run)) etat = /opla/i.test(String(run.erreur ?? ''))
            ? (fr ? "Opla n'est pas encore autorisée dans l'extension — rien à relever."
                  : 'Opla is not authorised in the extension yet — nothing to scan.')
            : (fr ? `Pas connecté à ${LABEL_RELEVE[p]} dans Chrome — rien à relever.`
                  : `Not signed in to ${LABEL_RELEVE[p]} in Chrome — nothing to scan.`);
          else if (run?.status === 'failed') etat = fr ? `Dernier relevé en échec — ${String(run.erreur ?? '').replace(/^\[incomplet\]\s*/, '').slice(0, 90) || 'réessaie'}` : `Last scan failed — ${String(run.erreur ?? '').slice(0, 90) || 'try again'}`;
          else if (run?.status === 'expired' || run?.status === 'cancelled') etat = fr ? 'Dernière demande expirée (ordinateur éteint)' : 'Last request expired (computer off)';
          else etat = fr ? 'Jamais relevée' : 'Never scanned';
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: P.paper, border: `1px solid ${P.border}` }}>
              <PlatformLogo platform={p} size={20} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: P.ink }}>{LABEL_RELEVE[p]}</div>
                <div style={{ fontSize: 11.5, color: P.mute2, lineHeight: 1.4 }}>{etat}</div>
              </div>
              <button type="button" disabled={!!busy || enCours || !extVue} onClick={() => lancer(p)}
                title={!extVue ? (fr ? "Il faut l'extension Chrome sur un ordinateur." : 'The Chrome extension on a computer is needed.') : undefined}
                style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${P.border}`, background: '#fff', color: (busy || enCours || !extVue) ? P.mute : P.tealDeep, fontSize: 12.5, fontWeight: 700, cursor: (busy || enCours || !extVue) ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                {busy === p ? (fr ? 'Envoi…' : 'Sending…') : enCours ? (fr ? 'En cours' : 'Running') : (run ? (fr ? 'Relever' : 'Scan') : (fr ? 'Relever' : 'Scan'))}
              </button>
            </div>
          );
        })}
        {/* Le rappel descend DANS le repli (exigence du 18/09) : il est vrai,
            il rassure, mais il n'a pas à peser sur l'écran à chaque ouverture
            du Stock. Hors bloc intégré, il reste à sa place, sous les lignes. */}
        <div style={{ fontSize: 11.5, color: P.mute, lineHeight: 1.5, marginTop: 2 }}>
          {fr ? 'Un relevé ne compte ni comme une publication ni comme une republication. Une annonce importée reste en lecture seule tant que FillSell ne l’a pas déposée.'
            : 'A scan never counts as a publication or a repost. An imported listing stays read-only until FillSell has published it.'}
        </div>
      </div>
      {/* ⛔ Les lignes ne sont pas DÉMONTÉES quand le repli est fermé, elles
          sont masquées (display:none). `ligneVinted` est le composant qui
          porte l'état du relevé Vinted et qui publie `lancer` au parent
          (registerLancer) : le démonter reviendrait à casser « Tout relever »
          et à perdre le suivi en cours au premier repli. */}
      {!integre && (
        <button type="button" disabled={!!busy || toutBusy || !extVue} onClick={toutRelever}
          title={!extVue ? (fr ? "Il faut l'extension Chrome sur un ordinateur." : 'The Chrome extension on a computer is needed.') : undefined}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 999, border: `1px solid ${P.border}`, background: '#fff', color: (busy || toutBusy || !extVue) ? P.mute : P.tealDeep, fontSize: 13, fontWeight: 700, cursor: (busy || toutBusy || !extVue) ? 'default' : 'pointer', fontFamily: 'inherit' }}>
          {toutBusy ? (fr ? 'Envoi…' : 'Sending…') : (fr ? 'Tout relever' : 'Scan all')}
        </button>
      )}
      {/* Les refus (cadence d'une plateforme, relevé déjà en cours, session
          absente) restent sur la ligne PRINCIPALE, jamais dans le repli. */}
      {message && (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: message.ton === 'orange' ? P.amberInk : P.mute2, background: message.ton === 'orange' ? P.amberBg : 'transparent', border: message.ton === 'orange' ? `1px solid ${P.amberBd}` : 'none', borderRadius: 10, padding: message.ton === 'orange' ? '8px 10px' : 0 }}>
          {message.texte}
        </div>
      )}
      {ecran && (
        <EcranRattachement lang={lang} items={items} annonces={aRattacher}
          onClose={() => setEcran(false)}
          onDecision={async () => { await recharger(); if (typeof onRattache === 'function') onRattache(); }} />
      )}
      {/* La modale Opla — au clic sur « Relever », sur place. À sa fermeture
          on relit l’autorisation : la personne vient peut-être de l’accorder. */}
      {oplaModale && (
        <OplaAutorisationModal
          lang={lang}
          contexte="releve"
          onClose={() => { setOplaModale(false); relireOplaAcces().catch(() => {}); }}
        />
      )}
    </div>
  );
}

// ── POURQUOI LE MOTEUR HÉSITE, en une demi-phrase ────────────────────────────
// `faisceau` (2026-09-18) : le titre exact n'a rien donné, et la proposition
// vient du SECOND TOUR — recouvrement des mots du titre, marque, prix, taille
// (rapprocher_classer, migration 20260918091000). Elle n'est JAMAIS un
// rattachement automatique : c'est une présomption, l'utilisateur tranche.
// On nomme les signaux qui ont vraiment joué, pas le score : « 0,73 » ne dit
// rien à personne, « le prix et la marque correspondent » se vérifie d'un œil.
function motifProposition(prop, fr) {
  const m = prop?.motif;
  if (m === 'prix_inconnu') return fr ? ' — le prix n’a pas pu être lu' : ' — the price could not be read';
  if (m === 'prix_different') return fr ? ' — le prix diffère' : ' — the price differs';
  if (m === 'homonymes') return fr ? ' — plusieurs articles portent ce titre' : ' — several items share this title';
  if (m === 'plusieurs_candidats') return fr ? ' — plusieurs candidats' : ' — several candidates';
  // 'homonymes_tranches' (2026-09-18, A3) : N articles STRICTEMENT identiques
  // (même titre, même prix). Le choix est arbitraire de toute façon — le
  // moteur en prend un selon une règle explicite et on le DIT, plutôt que de
  // poser une question dont aucune réponse ne serait plus juste qu'une autre.
  if (m === 'homonymes_tranches') {
    const n = Number(prop.choix_arbitraire?.total ?? prop.candidats_total ?? 0);
    return fr ? ` — tu as ${n || 'plusieurs'} articles identiques, on a pris le plus ancien`
              : ` — you have ${n || 'several'} identical items, we took the oldest`;
  }
  // 'titre_inclus' (2026-09-20, 4-e) : un titre est contenu dans l'autre, aux
  // frontières de mots. C'est le cas des préfixes de référence (« FIG001 - »)
  // et des compléments (« tome 3 » / « tome 3 l'invité fantôme ») — le
  // recouvrement mot à mot tombait sous la barre et l'annonce partait en
  // création d'une deuxième ligne, sans que personne ne la voie passer.
  if (m === 'titre_inclus') return fr ? ' — l’un des deux titres est écrit plus court' : ' — one of the two titles is written shorter';
  if (m !== 'faisceau') return '';
  const s = prop.signaux && typeof prop.signaux === 'object' ? prop.signaux : {};
  const preuves = [];
  if (s.prix === 'exact') preuves.push(fr ? 'le prix' : 'the price');
  else if (s.prix === 'proche') preuves.push(fr ? 'le prix, à peu près' : 'roughly the price');
  if (s.marque) preuves.push(fr ? 'la marque' : 'the brand');
  if (s.taille) preuves.push(fr ? 'la taille' : 'the size');
  const base = fr ? ' — le titre est écrit autrement' : ' — the title is worded differently';
  if (!preuves.length) return base;
  return fr ? `${base}, mais ${preuves.join(' et ')} correspond${preuves.length > 1 ? 'ent' : ''}`
            : `${base}, but ${preuves.join(' and ')} match${preuves.length > 1 ? '' : 'es'}`;
}

// ── L'écran : une annonce par ligne, la proposition du moteur quand il y en a ─
function EcranRattachement({ lang, items, annonces, onClose, onDecision }) {
  const fr = lang !== 'en';
  const [busy, setBusy] = useState(null);       // annonce id en cours
  const [picker, setPicker] = useState(null);   // annonce id dont on choisit l'article
  const [recherche, setRecherche] = useState('');
  const [fait, setFait] = useState({});         // annonce id → texte de résultat
  const [erreur, setErreur] = useState(null);
  // Les suggestions LOCALES (un jumeau vu par l'écran, sans proposition du
  // serveur) qu'on vient d'écarter : rien à écrire en base — la ligne reste
  // importable exactement comme avant, on a seulement rangé la phrase.
  const [jumeauxEcartes, setJumeauxEcartes] = useState(() => new Set());

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parPlateforme = useMemo(() => {
    const g = {};
    for (const a of annonces) (g[a.platform] ??= []).push(a);
    return g;
  }, [annonces]);
  const titreDe = (invId) => items.find((i) => String(i.id) === String(invId))?.title ?? null;
  const candidats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = items.filter((i) => i.statut !== 'vendu');
    if (!q) return liste.slice(0, 12);
    return liste.filter((i) => String(i.title ?? '').toLowerCase().includes(q)).slice(0, 12);
  }, [items, recherche]);

  const decider = async (a, decision, inventaireId = null) => {
    if (busy) return;
    setBusy(a.id); setErreur(null);
    const r = await deciderRapprochement(a.id, decision, inventaireId).catch((e) => ({ ok: false, message: String(e?.message ?? e) }));
    setBusy(null);
    if (!r?.ok) { setErreur(r?.message ?? r?.reason ?? (fr ? 'Décision non enregistrée.' : 'Decision not saved.')); return; }
    setPicker(null);
    const txt = decision === 'attache' ? (fr ? `Rattachée à « ${titreDe(inventaireId ?? r.inventaire_id) ?? 'ton article'} »` : `Matched to “${titreDe(inventaireId ?? r.inventaire_id) ?? 'your item'}”`)
      : decision === 'import' ? (fr ? 'Importée comme nouvel article (lecture seule)' : 'Imported as a new item (read-only)')
      : decision === 'ignore' ? (fr ? 'Ignorée' : 'Ignored')
      : (fr ? 'Proposition écartée' : 'Suggestion dismissed');
    setFait((f) => ({ ...f, [a.id]: txt }));
    track('rapprochement_decision', { platform: a.platform, decision });
    if (decision !== 'refus_proposition') onDecision();
  };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(16,32,27,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: '#EDEAE0', borderRadius: '26px 26px 0 0', maxHeight: '92vh', overflowY: 'auto', padding: '18px 18px 24px', boxSizing: 'border-box', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: P.ink }}>{fr ? 'Annonces à rattacher' : 'Listings to match'}</div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label={fr ? 'Fermer' : 'Close'} style={{ border: 'none', background: 'transparent', fontSize: 20, color: P.mute2, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 12.5, color: P.mute2, lineHeight: 1.5, marginBottom: 12 }}>
          {fr ? 'Ce que FillSell a reconnu avec certitude est déjà rattaché. Ici, il propose quand il hésite, et te laisse choisir sinon. Aucun geste ici ne retire une annonce ni ne déclare une vente.'
            : 'What FillSell recognised for sure is already matched. Here it suggests when unsure, and lets you choose otherwise. Nothing here removes a listing or records a sale.'}
        </div>
        {erreur && <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>{erreur}</div>}
        {annonces.length === 0 && <div style={{ fontSize: 13, color: P.mute2, padding: '14px 0' }}>{fr ? 'Rien à rattacher.' : 'Nothing to match.'}</div>}
        {Object.entries(parPlateforme).map(([p, liste]) => (
          <div key={p} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: P.ink, margin: '6px 0 8px' }}>
              <PlatformLogo platform={p} size={16} />{LABEL_RELEVE[p]} · {liste.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {liste.map((a) => {
                const propBase = a.proposition && typeof a.proposition === 'object' ? a.proposition : null;
                // ── LE JUMEAU VU DEPUIS L'ÉCRAN (2026-09-20, point 6-a) ─────
                // Quand le serveur n'a rien proposé, on regarde nous-mêmes si
                // un article du stock porte visiblement le même objet. Même
                // règle qu'en base (utils/rapprochementJumeau), donc l'écran
                // et le serveur ne peuvent pas se contredire.
                // ⛔ On PRÉVIENT : le bouton « Importer comme nouvel article »
                //    reste là, actif, au même endroit.
                const jumeau = (propBase || jumeauxEcartes.has(a.id)) ? null : jumeauProbable(a.titre, items);
                const prop = propBase ?? (jumeau ? { inventaire_id: jumeau.id, motif: 'titre_inclus' } : null);
                const propTitre = prop?.inventaire_id != null ? titreDe(prop.inventaire_id) : null;
                const done = fait[a.id];
                return (
                  <div key={a.id} style={{ background: '#fff', border: `1px solid ${P.border}`, borderRadius: 14, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, opacity: done ? 0.75 : 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      {a.photo_url
                        ? <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, backgroundImage: `url(${a.photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                        : <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: P.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PlatformLogo platform={p} size={18} /></div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: P.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titre || (fr ? `Annonce ${a.listing_id}` : `Listing ${a.listing_id}`)}</div>
                        <div style={{ fontSize: 12, color: P.mute2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {a.prix != null && <span>{a.prix} €</span>}
                          {a.statut_plateforme === 'en_verification' && <span>{fr ? 'en vérification' : 'under review'}</span>}
                          {a.url && <a href={a.url} target="_blank" rel="noreferrer" style={{ color: P.tealDeep, fontWeight: 600 }}>{fr ? 'Voir l’annonce' : 'View listing'}</a>}
                        </div>
                      </div>
                    </div>
                    {done ? (
                      <div style={{ fontSize: 12, color: P.tealDeep, fontWeight: 600 }}>✓ {done}</div>
                    ) : (
                      <>
                        {prop && (
                          <div style={{ background: P.amberBg, border: `1px solid ${P.amberBd}`, borderRadius: 10, padding: '8px 10px', fontSize: 12.5, color: P.amberInk, lineHeight: 1.5 }}>
                            {fr ? <>C’est peut-être <strong>« {propTitre ?? (prop.job_id ? 'une de tes annonces' : 'un article de ton stock')} »</strong>{motifProposition(prop, true)}.</>
                                : <>This may be <strong>“{propTitre ?? (prop.job_id ? 'one of your listings' : 'an item in your stock')}”</strong>{motifProposition(prop, false)}.</>}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              <button type="button" disabled={busy === a.id} onClick={() => decider(a, 'attache', prop.inventaire_id ?? null)}
                                style={{ padding: '7px 12px', borderRadius: 999, border: 'none', background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {fr ? 'Oui, c’est cet article' : 'Yes, that’s the item'}
                              </button>
                              <button type="button" disabled={busy === a.id} onClick={() => (propBase ? decider(a, 'refus_proposition') : setJumeauxEcartes((v) => new Set([...v, a.id])))}
                                style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${P.amberBd}`, background: '#fff', color: P.amberInk, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {fr ? 'Non' : 'No'}
                              </button>
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" disabled={busy === a.id} onClick={() => { setPicker(picker === a.id ? null : a.id); setRecherche(''); }}
                            style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${P.border}`, background: '#fff', color: P.tealDeep, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {fr ? 'Choisir l’article' : 'Pick the item'}
                          </button>
                          <button type="button" disabled={busy === a.id} onClick={() => decider(a, 'import')}
                            style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${P.border}`, background: '#fff', color: P.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {fr ? 'Importer comme nouvel article' : 'Import as a new item'}
                          </button>
                          <button type="button" disabled={busy === a.id} onClick={() => decider(a, 'ignore')}
                            style={{ padding: '7px 12px', borderRadius: 999, border: 'none', background: 'transparent', color: P.mute2, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {fr ? 'Ignorer' : 'Ignore'}
                          </button>
                        </div>
                        {picker === a.id && (
                          <div style={{ background: P.paper, border: `1px solid ${P.border}`, borderRadius: 12, padding: 10 }}>
                            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={fr ? 'Chercher dans ton stock…' : 'Search your stock…'}
                              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: `1px solid ${P.border}`, fontSize: 13, fontFamily: 'inherit', marginBottom: 8 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                              {candidats.map((i) => (
                                <button key={i.id} type="button" disabled={busy === a.id} onClick={() => decider(a, 'attache', i.id)}
                                  style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 10, border: `1px solid ${P.border}`, background: '#fff', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', color: P.ink }}>
                                  {i.title ?? '—'}{i.sell != null ? <span style={{ color: P.mute2 }}> · {i.sell} €</span> : null}
                                </button>
                              ))}
                              {candidats.length === 0 && <div style={{ fontSize: 12, color: P.mute2 }}>{fr ? 'Aucun article.' : 'No item.'}</div>}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
