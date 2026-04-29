function safeDiv(a, b, fallback = 0) {
  if (b === 0 || !isFinite(b) || isNaN(b)) return fallback;
  const r = a / b;
  return isFinite(r) && !isNaN(r) ? r : fallback;
}

function clamp(val, min = 0, max = 10) {
  return Math.min(max, Math.max(min, val));
}

function profitPotentielScore(margePercent) {
  if (margePercent < 15) return 2;
  if (margePercent < 25) return 4;
  if (margePercent < 40) return 6;
  if (margePercent < 55) return 8;
  return 9.5;
}

// Si moyenneAchat > 0 → comparaison relative, sinon scale absolue
function capitalScore(prixAchat, moyenneAchat) {
  if (moyenneAchat > 0) {
    const ratio = safeDiv(prixAchat, moyenneAchat, 1);
    if (ratio < 0.5)  return 9;
    if (ratio < 0.75) return 7;
    if (ratio < 1.25) return 5;
    return 3;
  }
  if (prixAchat < 20)  return 9;
  if (prixAchat < 50)  return 7;
  if (prixAchat < 100) return 5;
  return 3;
}

function getConfidence(nSoldees) {
  if (nSoldees === 0)  return 35;
  if (nSoldees <= 4)   return 50;
  if (nSoldees <= 19)  return 72;
  if (nSoldees <= 49)  return 88;
  return 97;
}

function getLabel(score, lang) {
  if (lang === 'en') {
    if (score >= 8)   return 'Excellent deal';
    if (score >= 6.5) return 'Good deal';
    if (score >= 5)   return 'Average deal';
    return 'Risky deal';
  }
  if (score >= 8)   return 'Excellent deal';
  if (score >= 6.5) return 'Bon deal';
  if (score >= 5)   return 'Deal moyen';
  return 'Deal risqué';
}

export function calculateDealScore({
  prixAchat = 0,
  prixVente = 0,
  frais = 0,
  lang = 'fr',
  historique = [],
} = {}) {
  const _achat = Number(prixAchat) || 0;
  const _vente = Number(prixVente) || 0;
  const _frais = Number(frais) || 0;
  const _lang  = lang === 'en' ? 'en' : 'fr';
  const _hist  = Array.isArray(historique) ? historique : [];

  // ── Calculs de base ──
  const profitNet    = _vente - _achat - _frais;
  const margePercent = safeDiv(profitNet, _vente, 0) * 100;

  // Ventes soldées uniquement (liquidite, upside, vsMoyenne, topPercent)
  const soldees = _hist.filter(h => h.date_vente != null);

  // ── profitPotentiel ──
  const ppScore = profitPotentielScore(margePercent);

  // ── liquidite ──
  let liquiditeScore = 5;
  let dureeMoyenne   = null;

  if (soldees.length > 0) {
    const durees = soldees
      .map(h => {
        const d = (new Date(h.date_vente) - new Date(h.date_achat)) / 86400000;
        return isFinite(d) && d >= 0 ? d : null;
      })
      .filter(d => d !== null);

    if (durees.length > 0) {
      dureeMoyenne = safeDiv(durees.reduce((s, d) => s + d, 0), durees.length, null);
      if (dureeMoyenne !== null) {
        if (dureeMoyenne < 7)       liquiditeScore = 9;
        else if (dureeMoyenne < 14) liquiditeScore = 7;
        else if (dureeMoyenne < 30) liquiditeScore = 5;
        else                        liquiditeScore = 3;
      }
    }
  }

  // ── safety ──
  const moyenneAchatHist = _hist.length > 0
    ? safeDiv(_hist.reduce((s, h) => s + (Number(h.prix_achat) || 0), 0), _hist.length, 0)
    : 0;
  const safetyScore = clamp(
    ppScore * 0.40 + capitalScore(_achat, moyenneAchatHist) * 0.35 + liquiditeScore * 0.25
  );

  // ── profits soldées ──
  const profitsSoldees = soldees.map(
    h => (Number(h.prix_vente) || 0) - (Number(h.prix_achat) || 0) - (Number(h.frais) || 0)
  );
  const moyenneProfit = profitsSoldees.length > 0
    ? safeDiv(profitsSoldees.reduce((s, p) => s + p, 0), profitsSoldees.length, 0)
    : null;

  // ── upside ──
  let upsideScore;
  if (soldees.length < 5 || moyenneProfit === null || moyenneProfit <= 0) {
    upsideScore = ppScore;
  } else {
    const ratio = safeDiv(profitNet, moyenneProfit, 1);
    if (ratio > 1.3)       upsideScore = 9;
    else if (ratio > 1.1)  upsideScore = 7.5;
    else if (ratio > 0.9)  upsideScore = 6;
    else                   upsideScore = 4;
  }

  // ── score global ──
  const rawScore = ppScore * 0.35 + liquiditeScore * 0.25 + safetyScore * 0.20 + upsideScore * 0.20;
  const score = Math.min(10, Math.max(0, parseFloat(rawScore.toFixed(1))));

  // ── confidence & dataQuality ──
  const confidence  = getConfidence(soldees.length);
  const dataQuality = confidence < 55 ? 'low' : confidence < 80 ? 'medium' : 'high';

  // ── context ──
  const vsMoyenne = moyenneProfit !== null ? profitNet - moyenneProfit : null;

  let topPercent = null;
  if (soldees.length >= 20) {
    const sorted = [...profitsSoldees].sort((a, b) => a - b);
    topPercent = Math.round(
      safeDiv(sorted.filter(p => p < profitNet).length, sorted.length, 0) * 100
    );
  }

  // ── pills ──
  let topCategory = null;
  if (soldees.length > 0) {
    const counts = {};
    soldees.forEach(h => {
      if (h.categorie) counts[h.categorie] = (counts[h.categorie] || 0) + 1;
    });
    const best = Object.entries(counts)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])[0];
    if (best) topCategory = best[0];
  }

  const pills = [];
  if (margePercent > 45)
    pills.push(_lang === 'en' ? 'High margin' : 'Forte marge');
  if (vsMoyenne !== null && vsMoyenne > 0)
    pills.push(_lang === 'en' ? 'Above your average' : 'Au-dessus de ta moyenne');
  if (topCategory)
    pills.push(_lang === 'en' ? `${topCategory} perform well for you` : `${topCategory} performent bien chez toi`);
  if (dureeMoyenne !== null && dureeMoyenne < 10)
    pills.push(_lang === 'en' ? 'Quick sale likely' : 'Vente rapide probable');
  if (safetyScore > 7.5)
    pills.push(_lang === 'en' ? 'Low risk' : 'Faible risque');
  if (upsideScore > 8)
    pills.push(_lang === 'en' ? 'Excellent potential' : 'Excellent potentiel');
  pills.splice(4);

  return {
    score,
    label: getLabel(score, _lang),
    confidence,
    dataQuality,
    dimensions: {
      profitPotentiel: parseFloat(ppScore.toFixed(1)),
      liquidite:       parseFloat(liquiditeScore.toFixed(1)),
      safety:          parseFloat(safetyScore.toFixed(1)),
      upside:          parseFloat(upsideScore.toFixed(1)),
    },
    pills,
    context: {
      margePercent: parseFloat(margePercent.toFixed(1)),
      profitNet:    parseFloat(profitNet.toFixed(2)),
      vsMoyenne:    vsMoyenne !== null ? parseFloat(vsMoyenne.toFixed(2)) : null,
      topPercent,
    },
  };
}
