// ═══════════════════════════════════════════════════════════════════════════
// MES ANNONCES EN LIGNE — LES DONNÉES ET LES GESTES (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Sorti tel quel de components/RelevesPlateformes.jsx : les lectures, le poll
// de 30 s, `lancer`, `toutRelever`, la modale Opla et les refus sont ceux
// d'avant, AU MOT PRÈS. Ce lot redessine la carte, il ne touche pas au moteur.
//
// ⛔ CE QUI N'EST PAS TOUCHÉ, ET NE DOIT PAS L'ÊTRE :
//   · ce qui est relevé, comment, et la pagination — c'est l'extension et le
//     serveur qui décident, ici on met en file et on relit la base ;
//   · la cadence, les doublons, la version minimale d'extension : le serveur
//     tranche (`demander_sync_plateforme`), on rapporte son refus ;
//   · le rattachement AUTOMATIQUE : on n'ajoute que la sortie manuelle pour ce
//     qu'il n'a pas su trancher (deciderRapprochement, déjà là).
// ⛔ UN RELEVÉ N'EST PAS UNE PUBLICATION. Aucun quota, aucun palier, aucun
//    coin_ledger : le chemin passe par les deux RPC de relevé et par rien
//    d'autre (cf. utils/syncPlateformes.js).
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '../analytics/analytics';
import { demarrerRelecture } from '../utils/relectureBornee';
import { useOplaAcces } from '../utils/oplaAcces';
import {
  PLATEFORMES_RELEVE, LABEL_RELEVE, demanderRelevePlateforme, lireDerniersRunsReleve,
  lireAnnoncesARattacher, compterAnnoncesParPlateforme, texteRefusReleve, lireDernierRunVinted,
  lireRelevesVides, lireAnnoncesEnRangement, lireChoixEtSessions,
} from '../utils/syncPlateformes';
import { ciblesReleve } from './synchroniser.js';
import { avecDernierReleveVide } from './releveVide';
import { lireDoublonsProposes } from '../utils/doublons';

// Le poll : la base rend compte, jamais l'extension.
// (04/10, incident CPU 99 %) Sept requêtes par tour, dont releves_vides_signales
// (7 961 appels en une demi-journée) : 30 s fixes, onglet caché compris, sans
// ralentir quand la base peinait. Désormais relectureBornee : onglet visible
// seulement, 60 s au repos, attente doublée sur erreur ou lenteur.
const POLL_MS = 60000;
// (01/10) Pendant un rangement (empreinte photo, quelques minutes) ou un relevé
// en cours, on relit plus souvent : le stock doit se remplir sous les yeux.
// 15 s (10 s avant le 04/10).
const POLL_ACTIF_MS = 15000;
const actif = (runs) => Object.values(runs ?? {}).some((r) => r && (r.status === 'queued' || r.status === 'running'));

export function useReleveAnnonces({ lang, user, ouvert, plateformes, lancerVinted, etatVinted }) {
  const fr = lang !== 'en';
  const userId = user?.id ?? null;
  // Le plafond reste `plateformesDuCompte` (calculé par StockTab) filtré sur
  // ce qui est relevable : jamais une troisième liste.
  const autres = (Array.isArray(plateformes) ? plateformes : PLATEFORMES_RELEVE)
    .filter((p) => PLATEFORMES_RELEVE.includes(p));
  const cle = autres.join(',');

  const [runs, setRuns] = useState({});
  // (24/09) Plateformes à relevés vides d'affilée, tranchées par le serveur
  // (releves_vides_signales) — {} pour tout compte qui n'est pas concerné.
  const [vides, setVides] = useState({});
  const [runVinted, setRunVinted] = useState(null);
  const [compte, setCompte] = useState({});
  const [aRattacher, setARattacher] = useState([]);
  // (25/09) Les paires de fiches PROBABLES : la question « Est-ce le même
  // article ? » (inventaire_doublons). [] tant que rien n'est proposé.
  const [doublons, setDoublons] = useState([]);
  // (01/10) Annonces relevées en attente de l'empreinte de leur photo :
  // « X annonces trouvées, rangement en cours ». Jamais « à rattacher ».
  const [rangement, setRangement] = useState({ total: 0, parPlateforme: {}, ids: new Set() });
  const [busy, setBusy] = useState(null);        // plateforme en cours de demande
  const [toutBusy, setToutBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [oplaModale, setOplaModale] = useState(false);
  // `tick` : un relevé demandé ou une décision prise relance la lecture sans
  // attendre le poll — c'est la base qu'on relit, jamais l'extension.
  const [tick, setTick] = useState(0);
  const recharger = useCallback(() => setTick((t) => t + 1), []);

  // (24/09) Verdict SERVEUR (utils/oplaAcces) : `acces === false` = refus
  // CONNU seulement. « Je ne sais pas » ne retient plus le relevé — c'est
  // justement lui qui prouvera l'accès (ou dira « non accordé »).
  const { acces: oplaAcces, verdict: oplaVerdict, relire: relireOplaAcces } = useOplaAcces({ userId });

  const relectureRef = useRef(null);
  useEffect(() => {
    if (!ouvert || !userId) return undefined;
    let annule = false;
    const charger = async () => {
      const [r, c, a, v, vv, dd, rg] = await Promise.all([
        lireDerniersRunsReleve(userId), compterAnnoncesParPlateforme(userId),
        lireAnnoncesARattacher(userId), lireDernierRunVinted(userId), lireRelevesVides(userId),
        lireDoublonsProposes(userId).catch(() => []),
        lireAnnoncesEnRangement(userId),
      ]);
      if (annule) return true;
      // Une plateforme signalée affiche son relevé vide le plus récent : la
      // tuile ne peut pas dire « 528 » sous une bande qui dit « aucune annonce ».
      setRuns(avecDernierReleveVide(r, vv)); setVides(vv);
      // Une annonce en rangement n'est pas « à rattacher » : elle arrive seule.
      setCompte(c); setARattacher(a.filter((x) => !rg.ids.has(x.id))); setRunVinted(v); setDoublons(dd);
      setRangement(rg);
      // La cadence suit ce qui se passe : un relevé en cours ou un rangement
      // se suit de près, un compte au repos se relit à la minute.
      relectureRef.current?.changerIntervalle(rg.total > 0 || actif(r) ? POLL_ACTIF_MS : POLL_MS);
      return true;
    };
    // Une lecture ratée garde les derniers compteurs complets, et ralentit le
    // tour suivant (relectureBornee) au lieu de le répéter.
    const relecture = demarrerRelecture(charger, { intervalleMs: POLL_MS, maxMs: 10 * 60_000, lentMs: 5000 });
    relectureRef.current = relecture;
    return () => { annule = true; relecture.arreter(); if (relectureRef.current === relecture) relectureRef.current = null; };
  }, [ouvert, userId, tick]);

  // ── OPLA : la question au moment du clic (18/09/2026) ─────────────────────
  // Relever Opla sans l'autorisation d'hôte ne rend RIEN (la sonde ne part même
  // pas). On le dit sur place, avec le geste, plutôt que de laisser repartir un
  // run vide. Pas d'autorisation connue → pas de modale : on ne harcèle pas sur
  // un « je ne sais pas ».
  const lancer = useCallback(async (platform) => {
    if (busy || toutBusy) return;
    if (platform === 'vinted') { try { lancerVinted?.(); } catch { /* la ligne Vinted dit le refus */ } return; }
    if (platform === 'opla' && oplaAcces === false) { setOplaModale(true); return; }
    setBusy(platform); setMessage(null);
    const r = await demanderRelevePlateforme(platform)
      .catch((e) => ({ ok: false, reason: 'erreur', message: String(e?.message ?? e) }));
    setBusy(null);
    if (!r?.ok) { setMessage({ ton: 'orange', texte: texteRefusReleve(r, lang, platform) }); return; }
    track('releve_plateforme_demande', { platform, reason: r.reason });
    recharger();
  }, [busy, toutBusy, lancerVinted, oplaAcces, lang, recharger]);

  // « Tout relever » : chaque plateforme à la suite, Vinted par son propre
  // chemin. Les refus (cadence, relevé déjà en cours…) sont réunis en UN
  // message ; ce qui part, part.
  // (06/10, cas Laura) Seulement les plateformes CHOISIES (« Où tu vends ? »),
  // connectées ou déjà relevées — les choisies d'abord. Elle n'avait choisi
  // que Vinted : Leboncoin, Beebs et eBay partaient quand même, trois
  // « absente » sur des plateformes qu'elle n'utilise pas.
  const toutRelever = useCallback(async () => {
    if (busy || toutBusy) return;
    setToutBusy(true); setMessage(null);
    let choix = null;
    try { choix = await lireChoixEtSessions(userId); } catch { /* rien de connu : tout, comme avant */ }
    const dejaRelevees = [
      ...Object.entries(compte ?? {}).filter(([, c]) => (c?.total ?? 0) > 0).map(([p]) => p),
      ...(runVinted ? ['vinted'] : []),
    ];
    const cibles = ciblesReleve({
      plateformes: ['vinted', ...(cle ? cle.split(',') : [])],
      choisies: choix?.choisies ?? null, sessions: choix?.sessions ?? null, dejaRelevees,
    });
    track('releve_tout_cibles', { cibles: cibles.join(','), choisies: (choix?.choisies ?? []).join(',') });
    const refus = [];
    for (const p of cibles) {
      if (p === 'vinted') {
        try { if (typeof lancerVinted === 'function') lancerVinted(); } catch { /* la ligne Vinted dit le refus */ }
        continue;
      }
      const run = runs[p] ?? null;
      if (run && (run.status === 'queued' || run.status === 'running')) continue;
      // Opla sans autorisation : sautée, avec son motif. Un geste GLOBAL ne
      // doit pas faire surgir une modale — le bouton de SA tuile, lui, la pose
      // (c'est le clic qui la vise).
      if (p === 'opla' && oplaAcces === false) {
        refus.push(fr ? 'Opla : autorisation à donner dans l’extension.' : 'Opla: permission to grant in the extension.');
        continue;
      }
      const r = await demanderRelevePlateforme(p)
        .catch((e) => ({ ok: false, reason: 'erreur', message: String(e?.message ?? e) }));
      if (!r?.ok) { refus.push(`${LABEL_RELEVE[p]} : ${texteRefusReleve(r, lang, p)}`); continue; }
      track('releve_plateforme_demande', { platform: p, reason: r.reason, depuis: 'tout_relever' });
    }
    setToutBusy(false);
    if (refus.length) setMessage({ ton: 'orange', texte: refus.join(' · ') });
    recharger();
  }, [busy, toutBusy, lancerVinted, cle, runs, oplaAcces, fr, lang, recharger, userId, compte, runVinted]);

  return {
    fr, lang, userId,
    // Vinted en tête : c'est l'ordre des tuiles, et celui du reste du Stock.
    plateformes: ['vinted', ...(cle ? cle.split(',') : [])],
    runs, runVinted, compte, aRattacher, vides, doublons, rangement,
    busy, toutBusy, message, setMessage,
    etatVinted,
    lancer, toutRelever, recharger,
    oplaVerdict,
    oplaModale, fermerOplaModale: () => { setOplaModale(false); relireOplaAcces().catch(() => {}); },
  };
}
