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
import { track } from '../analytics/analytics';
import {
  PLATEFORMES_RELEVE, LABEL_RELEVE, demanderRelevePlateforme, lireDerniersRunsReleve,
  lireAnnoncesARattacher, compterAnnoncesParPlateforme, deciderRapprochement, texteRefusReleve,
  lireDernierRunVinted,
} from '../utils/syncPlateformes';

const P = {
  ink: '#10201B', paper: '#F6F5F1', border: '#E7E3D8', mute: '#8A8578', mute2: '#5C6560',
  teal: '#2F9E90', tealDeep: '#1B6E62', amberBg: '#FFF6E3', amberBd: '#EED9A6', amberInk: '#8A6100',
};

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

  const lancer = async (platform) => {
    if (busy) return;
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

  return (
    <div style={integre
      ? { display: 'flex', flexDirection: 'column', gap: 10 }
      : { background: '#fff', border: `1px solid ${P.border}`, borderRadius: 20, padding: '14px 16px', marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: P.ink }}>
          {integre
            ? (fr ? 'Mes annonces en ligne' : 'My listings online')
            : (fr ? 'Mes annonces sur les autres plateformes' : 'My listings on the other platforms')}
        </div>
        <span style={{ flex: 1 }} />
        {nbARattacher > 0 && (
          <button type="button" onClick={() => setEcran(true)}
            style={{ padding: '7px 12px', borderRadius: 999, border: 'none', background: `linear-gradient(120deg,${P.teal},${P.tealDeep})`, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {fr ? `Rattacher ${nbARattacher} annonce${nbARattacher > 1 ? 's' : ''}` : `Match ${nbARattacher} listing${nbARattacher > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
      {/* UNE phrase — pas deux paragraphes. Ce qui a été retiré d'ici
          (« un même article, une seule fiche », « le reste, tu le tranches »,
          et le rappel sur la publication) vit dans le repli, en entier. */}
      <div style={{ fontSize: 12, lineHeight: 1.5, color: P.mute2 }}>
        {integre
          ? (fr
            ? 'FillSell relit « Mes annonces » sur chaque plateforme et rattache ce qu’il reconnaît à ton stock — rien n’est publié, modifié ni retiré.'
            : 'FillSell re-reads “My listings” on each platform and matches what it recognises to your stock — nothing is published, edited or removed.')
          : (fr
            ? 'FillSell relit « Mes annonces » sur chaque plateforme et rattache ce qu’il reconnaît à ton stock — un même article, une seule fiche. Le reste, tu le tranches. Rien n’est publié, modifié ni retiré.'
            : 'FillSell re-reads “My listings” on each platform and matches what it recognises to your stock — one item, one card. You decide the rest. Nothing is published, edited or removed.')}
      </div>
      {/* ── LE GESTE PRINCIPAL, puis son état. Un seul bouton, un seul verbe. ── */}
      {integre && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" disabled={!!busy || toutBusy || !extVue} onClick={toutRelever}
            title={!extVue ? (fr ? "Il faut l'extension Chrome sur un ordinateur." : 'The Chrome extension on a computer is needed.') : undefined}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 999, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              background: (busy || toutBusy || !extVue) ? '#E7E3D8' : `linear-gradient(120deg,${P.teal},${P.tealDeep})`,
              color: (busy || toutBusy || !extVue) ? P.mute : '#fff',
              cursor: (busy || toutBusy || !extVue) ? 'default' : 'pointer',
            }}>
            {toutBusy ? (fr ? 'Envoi…' : 'Sending…') : (fr ? 'Tout relever' : 'Scan all')}
          </button>
          <div style={{ fontSize: 12, color: P.mute2, lineHeight: 1.45, textAlign: 'center' }}>{ligneEtat}</div>
          {!extVue && (
            <div style={{ fontSize: 11.5, color: P.mute, lineHeight: 1.45, textAlign: 'center' }}>
              {fr ? "Il faut l'extension Chrome ouverte sur un ordinateur." : 'The Chrome extension must be open on a computer.'}
            </div>
          )}
        </div>
      )}
      {/* ── LE DÉTAIL, REPLIÉ ─────────────────────────────────────────────────
          Fermé par défaut. Il garde TOUT ce qui était à l'écran avant : la
          ligne de chaque plateforme (Vinted comprise), son état, son motif
          quand elle ne peut pas être relevée, et son bouton. Une plateforme
          qui n'a pas de session n'est pas retirée de la liste — elle reste
          visible ici, avec sa raison. */}
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
                const prop = a.proposition && typeof a.proposition === 'object' ? a.proposition : null;
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
                              <button type="button" disabled={busy === a.id} onClick={() => decider(a, 'refus_proposition')}
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
