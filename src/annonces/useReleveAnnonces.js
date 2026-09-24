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
import { useCallback, useEffect, useState } from 'react';
import { track } from '../analytics/analytics';
import { useOplaAcces } from '../utils/oplaAcces';
import {
  PLATEFORMES_RELEVE, LABEL_RELEVE, demanderRelevePlateforme, lireDerniersRunsReleve,
  lireAnnoncesARattacher, compterAnnoncesParPlateforme, texteRefusReleve, lireDernierRunVinted,
} from '../utils/syncPlateformes';

// Le poll : la base rend compte, jamais l'extension. 30 s — inchangé.
const POLL_MS = 30000;

export function useReleveAnnonces({ lang, user, ouvert, plateformes, lancerVinted, etatVinted }) {
  const fr = lang !== 'en';
  const userId = user?.id ?? null;
  // Le plafond reste `plateformesDuCompte` (calculé par StockTab) filtré sur
  // ce qui est relevable : jamais une troisième liste.
  const autres = (Array.isArray(plateformes) ? plateformes : PLATEFORMES_RELEVE)
    .filter((p) => PLATEFORMES_RELEVE.includes(p));
  const cle = autres.join(',');

  const [runs, setRuns] = useState({});
  const [runVinted, setRunVinted] = useState(null);
  const [compte, setCompte] = useState({});
  const [aRattacher, setARattacher] = useState([]);
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

  useEffect(() => {
    if (!ouvert || !userId) return undefined;
    let annule = false;
    const charger = async () => {
      const [r, c, a, v] = await Promise.all([
        lireDerniersRunsReleve(userId), compterAnnoncesParPlateforme(userId),
        lireAnnoncesARattacher(userId), lireDernierRunVinted(userId),
      ]);
      if (annule) return;
      setRuns(r); setCompte(c); setARattacher(a); setRunVinted(v);
    };
    const t0 = setTimeout(charger, 0);
    const t = setInterval(charger, POLL_MS);
    return () => { annule = true; clearTimeout(t0); clearInterval(t); };
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

  // « Tout relever » : Vinted d'abord (son propre chemin), puis chaque
  // plateforme à la suite. Les refus (cadence, relevé déjà en cours…) sont
  // réunis en UN message ; ce qui part, part.
  const toutRelever = useCallback(async () => {
    if (busy || toutBusy) return;
    setToutBusy(true); setMessage(null);
    try { if (typeof lancerVinted === 'function') lancerVinted(); } catch { /* la ligne Vinted dit le refus */ }
    const refus = [];
    for (const p of cle ? cle.split(',') : []) {
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
  }, [busy, toutBusy, lancerVinted, cle, runs, oplaAcces, fr, lang, recharger]);

  return {
    fr, lang, userId,
    // Vinted en tête : c'est l'ordre des tuiles, et celui du reste du Stock.
    plateformes: ['vinted', ...(cle ? cle.split(',') : [])],
    runs, runVinted, compte, aRattacher,
    busy, toutBusy, message, setMessage,
    etatVinted,
    lancer, toutRelever, recharger,
    oplaVerdict,
    oplaModale, fermerOplaModale: () => { setOplaModale(false); relireOplaAcces().catch(() => {}); },
  };
}
