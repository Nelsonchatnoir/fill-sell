import { supabaseUrl, supabaseAnonKey } from '../lib/supabase.js';

const norm = s =>
  s?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() ?? "";

const STOP_WORDS = new Set([
  "a","à","au","aux","de","du","des","le","la","les","l","un","une","d","en","et","ou",
  "est","il","elle","je","j","me","mon","ma","mes","ce","qui","que","qu","se","sa","ses",
  "si","on","y","là","par","sur","sous","dans","avec","pour","comme","mais","donc","car",
  "ni","or","the","an","of","in","at","to","for","with","is","it","i","my","and","but",
]);

const parseNum = v => parseFloat(String(v ?? 0).replace(",", ".")) || 0;

const getPrixVente = s => s.prix_vente ?? s.sell ?? s.selling_price ?? 0;
const getPrixAchat = s => s.prix_achat ?? s.buy ?? s.purchase_price ?? 0;
const getFrais     = s => s.frais ?? s.sellingFees ?? s.selling_fees ?? 0;
const getMargin    = s => {
  const m = s.margin ?? s.benefice ?? s.profit;
  return m != null ? m : getPrixVente(s) - getPrixAchat(s) - getFrais(s);
};

function getPeriodDates(periode, date_from, date_to) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (periode === "today")
    return { from: today, to: new Date(today.getTime() + 86400000) };
  if (periode === "week")
    return { from: new Date(today.getTime() - 7 * 86400000), to: null };
  if (periode === "month")
    return { from: new Date(today.getTime() - 30 * 86400000), to: null };
  if (periode === "year")
    return { from: new Date(today.getTime() - 365 * 86400000), to: null };
  if (periode === "custom" && date_from)
    return { from: new Date(date_from), to: date_to ? new Date(date_to) : null };
  return { from: null, to: null }; // "all"
}

function filterByPeriod(records, periode, date_from, date_to) {
  const { from, to } = getPeriodDates(periode, date_from, date_to);
  if (!from && !to) return records;
  return records.filter(r => {
    const d = new Date(r.date || r.created_at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// ─── handlers ────────────────────────────────────────────────────────────────

async function handleAdd(task, context) {
  console.log("[handleAdd] task.data complet:", JSON.stringify(task.data));
  const added = await context.actions.addItem(task.data);
  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: added || { nom: task.data.nom, prix_achat: task.data.prix_achat },
    message: context.lang === "en" ? "Item added" : "Article ajouté",
  };
}

async function handleLot(task, context) {
  const { lotTotal, items } = task.data;
  const res = await fetch(
    `${supabaseUrl}/functions/v1/lot-distribute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${context.token}`, "apikey": supabaseAnonKey },
      body: JSON.stringify({ lotTotal, items, lang: context.lang }),
    }
  );
  if (!res.ok) throw new Error("lot-distribute failed");
  const distributed = await res.json();
  if (distributed.error) throw new Error(distributed.error);
  return {
    intent: task.intent,
    taskData: task.data,
    status: "pending_confirmation",
    data: { lotTotal, items: distributed.items },
    message: context.lang === "en" ? "Confirm lot?" : "Confirmer le lot ?",
  };
}

function handleSearch(task, context) {
  const { brand, categorie, status, date_from, date_to, min_price, max_price, nom, marque: taskMarque, type: taskType, description: taskDesc } =
    task.data;
  // Always combine all text fields so "robe" + query "rose" → "robe rose" → threshold 2
  const query = [nom, taskMarque, taskType, taskDesc, task.data.query].filter(Boolean).join(" ") || null;
  let filtered = [...context.items];

  // Status filter always applied first — sets the pool before scoring
  if (status === "stock")
    filtered = filtered.filter(i => i.statut !== "vendu" && i.statut !== "sold");
  else if (status === "sold")
    filtered = filtered.filter(i => i.statut === "vendu" || i.statut === "sold");

  if (brand)
    filtered = filtered.filter(i => norm(i.marque).includes(norm(brand)));
  if (categorie) {
    const normCat = norm(categorie);
    filtered = filtered.filter(i =>
      norm(i.categorie || "") === normCat || norm(i.type || "") === normCat
    );
  }
  if (query) {
    const words = norm(query).split(/\s+/).filter(w => w && !STOP_WORDS.has(w));
    if (words.length > 0) {
      // majority = more than half → for n words, need floor(n/2)+1 matches
      const threshold = Math.floor(words.length / 2) + 1;
      const scored = filtered.map(i => {
        const haystack = [
          norm(i.titre || i.nom || i.title || ""),
          norm(i.marque || ""),
          norm(i.type || ""),
          norm(i.description || ""),
        ].join(" ");
        const matchCount = words.filter(w => haystack.includes(w)).length;
        return { item: i, score: matchCount };
      });
      console.log("[VoiceSearch]", { query, words, threshold });
      console.log("[VoiceSearch] scores:", scored.map(s => ({ title: s.item.title || s.item.titre, score: s.score })));
      filtered = scored
        .filter(s => s.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .map(s => s.item);
    }
  }
  if (date_from) {
    const df = new Date(date_from);
    filtered = filtered.filter(
      i => new Date(i.date_ajout || i.date_achat || i.date || i.created_at) >= df
    );
  }
  if (date_to) {
    const dt = new Date(date_to);
    filtered = filtered.filter(
      i => new Date(i.date_ajout || i.date_achat || i.date || i.created_at) <= dt
    );
  }
  if (min_price != null)
    filtered = filtered.filter(i => (i.prix_achat ?? 0) >= min_price);
  if (max_price != null)
    filtered = filtered.filter(i => (i.prix_achat ?? 0) <= max_price);

  // Enrich sold items with sale date from ventes (match by title)
  const enriched = filtered.map(item => {
    const isSold = item.statut === "vendu" || item.statut === "sold";
    if (isSold && !item.date_vente) {
      const normTitle = norm(item.title || item.titre || "");
      const match = normTitle
        ? context.sales.find(s => norm(s.title || s.titre || "") === normTitle)
        : null;
      if (match) return { ...item, date_vente: match.date_vente || match.date };
    }
    return item;
  });

  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: { items: enriched },
    message:
      context.lang === "en"
        ? `${enriched.length} item(s) found`
        : `${enriched.length} article(s) trouvé(s)`,
  };
}

function handleAnalyticsQuery(task, context) {
  const { type, periode = "all", date_from, date_to, categorie, brand } = task.data;
  let filtered = filterByPeriod(context.sales, periode, date_from, date_to);

  if (categorie)
    filtered = filtered.filter(s => s.categorie === categorie || s.type === categorie);
  if (brand)
    filtered = filtered.filter(s => norm(s.marque).includes(norm(brand)));

  let value = 0;
  let label = "";

  switch (type) {
    case "profit":
      value = filtered.reduce((a, s) => { const m=getMargin(s); return a+(isNaN(m)?0:m); }, 0);
      label = context.lang === "en" ? "Total profit" : "Bénéfice total";
      break;
    case "revenue":
      value = filtered.reduce((a, s) => a + getPrixVente(s), 0);
      label = context.lang === "en" ? "Total revenue" : "Chiffre d'affaires";
      break;
    case "count":
      value = filtered.length;
      label = context.lang === "en" ? "Sales count" : "Nombre de ventes";
      break;
    case "avg_margin":
      if (filtered.length) {
        const sum = filtered.reduce((a, s) => {
          const mp =
            s.margin_pct ??
            ((getPrixVente(s) - getPrixAchat(s) - getFrais(s)) / Math.max(getPrixAchat(s), 1)) * 100;
          return a + (isNaN(mp) ? 0 : mp);
        }, 0);
        value = sum / filtered.length;
      }
      label = context.lang === "en" ? "Avg margin %" : "Marge moyenne %";
      break;
    case "avg_roi":
      if (filtered.length) {
        const sum = filtered.reduce((a, s) => {
          const roi = (getPrixVente(s) - getPrixAchat(s)) / Math.max(getPrixAchat(s), 1);
          return a + (isNaN(roi) ? 0 : roi);
        }, 0);
        value = sum / filtered.length;
      }
      label = context.lang === "en" ? "Avg ROI" : "ROI moyen";
      break;
    case "spend":
      value = filtered.reduce((a, s) => a + getPrixAchat(s), 0);
      label = context.lang === "en" ? "Total spend" : "Total dépensé";
      break;
    default:
      value = filtered.reduce((a, s) => { const m=getMargin(s); return a+(isNaN(m)?0:m); }, 0);
      label = context.lang === "en" ? "Total profit" : "Bénéfice total";
  }

  const rounded = Math.round(value * 100) / 100;
  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: { value: rounded, label, periode },
    message: `${label} : ${rounded}`,
  };
}

function handleAnalyticsBest(task, context) {
  const { metric = "profit", categorie, brand, periode, groupBy } = task.data;
  let filtered = [...context.sales];

  if (periode) filtered = filterByPeriod(filtered, periode, null, null);
  if (categorie)
    filtered = filtered.filter(s => s.categorie === categorie || s.type === categorie);
  if (brand)
    filtered = filtered.filter(s => norm(s.marque).includes(norm(brand)));

  if (groupBy === "categorie") {
    const byCategory = {};
    const cats = [...new Set(filtered.map(s => s.categorie).filter(Boolean))];
    for (const cat of cats) {
      const top = filtered
        .filter(s => s.categorie === cat)
        .map(s => ({
          ...s,
          _sortVal:
            metric === "margin"
              ? (s.margin_pct ??
                  ((getPrixVente(s) - getPrixAchat(s) - getFrais(s)) / Math.max(getPrixAchat(s), 1)) * 100)
              : getMargin(s),
        }))
        .filter(s => !isNaN(s._sortVal))
        .sort((a, b) => b._sortVal - a._sortVal)[0];
      if (top) byCategory[cat] = top;
    }
    return {
      intent: task.intent,
      taskData: task.data,
      status: "success",
      data: { byCategory },
      message: context.lang === "en" ? "Best by category" : "Meilleur par catégorie",
    };
  }

  const lim = task.data.limit ? Math.max(1, parseInt(task.data.limit)) : 5;
  const topN = filtered
    .map(s => ({
      ...s,
      _sortVal:
        metric === "margin"
          ? (s.margin_pct ??
              ((s.prix_vente - s.prix_achat - (s.frais ?? s.sellingFees ?? 0)) / Math.max(s.prix_achat, 1)) * 100)
          : (s.margin ?? s.benefice ?? s.prix_vente - s.prix_achat),
    }))
    .filter(s => !isNaN(s._sortVal))
    .sort((a, b) => b._sortVal - a._sortVal)
    .slice(0, lim);

  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: { items: topN, limit: lim },
    message:
      context.lang === "en"
        ? `Top ${lim} by ${metric}`
        : `Top ${lim} par ${metric}`,
  };
}

function handleAnalyticsDormant(task, context) {
  const { days = 30 } = task.data;
  const cutoff = new Date(Date.now() - days * 86400000);
  const dormant = context.items.filter(i => {
    if (i.statut === "vendu" || i.statut === "sold") return false;
    const d = new Date(i.date_achat || i.created_at || i.date);
    return d < cutoff;
  });

  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: { items: dormant },
    message:
      context.lang === "en"
        ? `${dormant.length} dormant item(s) > ${days} days`
        : `${dormant.length} article(s) dormant(s) > ${days} jours`,
  };
}

function handleAnalyticsDate(task, context) {
  const { date, date_to, type = "all" } = task.data;
  if (!date) {
    return {
      intent: task.intent,
      taskData: task.data,
      status: "error",
      data: {},
      message: context.lang === "en" ? "Date required" : "Date requise",
    };
  }
  const from = date.slice(0, 10);
  // date_to optionnel : si absent → filtre sur le jour exact (rétrocompatibilité)
  const to = date_to ? date_to.slice(0, 10) : from;
  const isRange = to !== from;

  let items = [];
  if (type === "bought" || type === "all") {
    const bought = context.items
      .filter(i => {
        const d = (i.date_achat || i.date || i.created_at || "").slice(0, 10);
        return d >= from && d <= to;
      })
      .map(i => ({ ...i, _type: "bought" }));
    items = [...items, ...bought];
  }
  if (type === "sold" || type === "all") {
    const sold = context.sales
      .filter(s => {
        const d = (s.date || s.created_at || "").slice(0, 10);
        return d >= from && d <= to;
      })
      .map(s => ({ ...s, _type: "sold" }));
    items = [...items, ...sold];
  }

  const boughtItems = items.filter(i => i._type === "bought");
  const soldItems   = items.filter(i => i._type === "sold");
  const summary = {
    count: items.length,
    totalSpend:   boughtItems.reduce((a, i) => a + getPrixAchat(i), 0),
    totalRevenue: soldItems.reduce((a, s) => a + getPrixVente(s), 0),
  };

  // Message : "du X au Y" pour une plage, "le X" pour un jour exact
  const message = context.lang === "en"
    ? `${items.length} item(s) ${isRange ? `from ${from} to ${to}` : `on ${from}`}`
    : `${items.length} article(s) ${isRange ? `du ${from} au ${to}` : `le ${from}`}`;

  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: { items, summary },
    message,
  };
}

function handleQueryStats(task, context) {
  const { metric, limit, periode, date_from, date_to } = task.data;
  const lim = limit ? Math.max(1, parseInt(limit)) : 5;

  switch (metric) {
    case "best_sales": {
      let filtered = [...context.sales];
      if (periode) filtered = filterByPeriod(filtered, periode, date_from, date_to);
      const top = filtered
        .map(s => ({ ...s, _sortVal: getMargin(s) }))
        .filter(s => !isNaN(s._sortVal))
        .sort((a, b) => b._sortVal - a._sortVal)
        .slice(0, lim);
      const label = lim === 1
        ? (context.lang === "en" ? "Best sale" : "Meilleure vente")
        : (context.lang === "en" ? `Top ${lim} sales` : `Top ${lim} ventes`);
      return { intent: task.intent, taskData: task.data, status: "success", data: { items: top, metric, limit: lim }, message: label };
    }
    case "worst_sales": {
      let filtered = [...context.sales];
      if (periode) filtered = filterByPeriod(filtered, periode, date_from, date_to);
      const bottom = filtered
        .map(s => ({ ...s, _sortVal: getMargin(s) }))
        .filter(s => !isNaN(s._sortVal))
        .sort((a, b) => a._sortVal - b._sortVal)
        .slice(0, lim);
      const label = lim === 1
        ? (context.lang === "en" ? "Worst sale" : "Pire vente")
        : (context.lang === "en" ? `${lim} worst sales` : `${lim} pires ventes`);
      return { intent: task.intent, taskData: task.data, status: "success", data: { items: bottom, metric, limit: lim }, message: label };
    }
    case "profit_mois": {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthSales = context.sales.filter(s => new Date(s.date || s.created_at) >= startOfMonth);
      const total = monthSales.reduce((a, s) => { const m = getMargin(s); return a + (isNaN(m) ? 0 : m); }, 0);
      const monthName = now.toLocaleString(context.lang === "en" ? "en-US" : "fr-FR", { month: "long" });
      return { intent: task.intent, taskData: task.data, status: "success", data: { value: Math.round(total * 100) / 100, metric, monthName }, message: `${Math.round(total * 100) / 100}€` };
    }
    case "marge_moyenne": {
      let filtered = [...context.sales];
      if (periode) filtered = filterByPeriod(filtered, periode, date_from, date_to);
      const avg = filtered.length
        ? filtered.reduce((a, s) => {
            const mp = s.margin_pct ?? ((getPrixVente(s) - getPrixAchat(s) - getFrais(s)) / Math.max(getPrixAchat(s), 1)) * 100;
            return a + (isNaN(mp) ? 0 : mp);
          }, 0) / filtered.length
        : 0;
      return { intent: task.intent, taskData: task.data, status: "success", data: { value: Math.round(avg * 10) / 10, metric }, message: `${Math.round(avg * 10) / 10}%` };
    }
    case "stock_immobilise": {
      const stock = context.items.filter(i => i.statut !== "vendu" && i.statut !== "sold");
      const total = stock.reduce((a, i) => a + getPrixAchat(i) * Math.max(1, i.quantite || 1), 0);
      return { intent: task.intent, taskData: task.data, status: "success", data: { value: Math.round(total * 100) / 100, metric, count: stock.length }, message: `${Math.round(total * 100) / 100}€` };
    }
    case "stock_count": {
      const stock = context.items.filter(i => i.statut !== "vendu" && i.statut !== "sold");
      return { intent: task.intent, taskData: task.data, status: "success", data: { value: stock.length, metric, count: stock.length }, message: `${stock.length}` };
    }
    case "stock_by_period": {
      const { from, to } = getPeriodDates(periode || "all", date_from, date_to);
      let stock = context.items.filter(i => i.statut !== "vendu" && i.statut !== "sold");
      if (from || to) {
        stock = stock.filter(i => {
          const d = new Date(i.date_ajout || i.date_achat || i.date || i.created_at);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }
      return {
        intent: task.intent, taskData: task.data, status: "success",
        data: { items: stock, count: stock.length, metric, periode: periode || "all" },
        message: context.lang === "en" ? `${stock.length} item(s) in stock` : `${stock.length} article(s) en stock`,
      };
    }
    default:
      return { intent: task.intent, taskData: task.data, status: "error", data: {}, message: context.lang === "en" ? "Unknown metric" : "Métrique inconnue" };
  }
}

async function handleBusinessAdvice(task, context) {
  const { items = [], sales = [], lang, supabaseUrl, token } = context;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Ventes du mois courant et du mois précédent
  const salesMonth = sales.filter(s => new Date(s.date || s.date_vente || 0) >= monthStart);
  const salesPrev  = sales.filter(s => {
    const d = new Date(s.date || s.date_vente || 0);
    return d >= prevMonthStart && d < monthStart;
  });

  // Chiffres globaux mois courant
  const profit    = salesMonth.reduce((a, s) => a + (s.margin ?? s.benefice ?? 0), 0);
  const ventes    = salesMonth.length;
  const ca        = salesMonth.reduce((a, s) => a + getPrixVente(s), 0);
  const avgMargin = ventes > 0
    ? salesMonth.reduce((a, s) => {
        const pv = getPrixVente(s);
        return a + (pv > 0 ? ((s.margin ?? s.benefice ?? 0) / pv) * 100 : 0);
      }, 0) / ventes
    : 0;

  // Chiffres mois précédent
  const profitPrev = salesPrev.reduce((a, s) => a + (s.margin ?? s.benefice ?? 0), 0);
  const ventesPrev = salesPrev.length;

  // Top 3 catégories par bénéfice (sur toutes les ventes)
  const catData = {};
  for (const s of sales) {
    const c = s.type || s.categorie || "Autre";
    if (!catData[c]) catData[c] = { profit: 0, ca: 0, count: 0 };
    catData[c].profit += s.margin ?? s.benefice ?? 0;
    catData[c].ca     += getPrixVente(s);
    catData[c].count  += 1;
  }
  const categories_top3 = Object.entries(catData)
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 3)
    .map(([cat, d]) => ({
      cat,
      profit: Math.round(d.profit),
      marge_pct: d.ca > 0 ? Math.round((d.profit / d.ca) * 100) : 0,
    }));

  // Top 3 marques par bénéfice
  const marqueData = {};
  for (const s of sales) {
    const m = s.marque || "Sans marque";
    if (m === "Sans marque") continue;
    marqueData[m] = (marqueData[m] || 0) + (s.margin ?? s.benefice ?? 0);
  }
  const marques_top3 = Object.entries(marqueData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([marque, p]) => ({ marque, profit: Math.round(p) }));

  // Meilleur article
  const bestSale = [...sales].sort((a, b) => (b.margin ?? b.benefice ?? 0) - (a.margin ?? a.benefice ?? 0))[0];

  // Articles lents (>30j en stock, non vendus)
  const slowItems = items.filter(i => {
    if (i.statut === "vendu" || i.statut === "sold") return false;
    const d = new Date(i.date_ajout || i.date || i.created_at || 0);
    return (now - d) > 30 * 24 * 60 * 60 * 1000;
  });
  // Top 3 articles les plus anciens pour les détails
  const articles_lents_details = [...slowItems]
    .sort((a, b) => new Date(a.date_ajout || a.date || a.created_at || 0) - new Date(b.date_ajout || b.date || b.created_at || 0))
    .slice(0, 3)
    .map(i => ({
      nom: i.title || i.titre || i.nom || "Article",
      jours: Math.floor((now - new Date(i.date_ajout || i.date || i.created_at || 0)) / (24 * 60 * 60 * 1000)),
    }));

  const stock_total = items.filter(i => i.statut !== "vendu" && i.statut !== "sold").length;

  if (!supabaseUrl) {
    return { intent: "business_advice", taskData: task.data, status: "error", data: {}, message: lang === "en" ? "Service unavailable" : "Service indisponible" };
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/stats-analysis`, {
      method: "POST",
      // Transmettre le JWT de l'utilisateur — requis par stats-analysis
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        periode: lang === "en" ? "this month" : "ce mois",
        profit: Math.round(profit),
        profit_prev: Math.round(profitPrev),
        ventes,
        ventes_prev: ventesPrev,
        marge: Math.round(avgMargin * 10) / 10,
        ca: Math.round(ca),
        categories_top3,
        marques_top3,
        meilleur_article: bestSale ? (bestSale.title || bestSale.titre || "") : "",
        meilleur_article_profit: bestSale ? Math.round(bestSale.margin ?? bestSale.benefice ?? 0) : 0,
        articles_lents: slowItems.length,
        articles_lents_details,
        stock_total,
        lang,
        question: task.data?.originalText || "",
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const analysis = d?.analysis || (lang === "en" ? "No data available yet." : "Pas encore assez de données.");
    return { intent: "business_advice", taskData: task.data, status: "success", data: { analysis }, message: analysis };
  } catch (e) {
    return { intent: "business_advice", taskData: task.data, status: "error", data: {}, message: lang === "en" ? "Analysis failed" : "Analyse échouée" };
  }
}

// ─── main export ──────────────────────────────────────────────────────────────

export async function executeVoiceTasks(tasks, context) {
  const results = [];
  const executedResultsMap = {};
  let hadMutation = false;

  for (const task of tasks) {
    let result;
    try {
      switch (task.intent) {
        case "inventory_add":
          if (task.requiresConfirmation) {
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "pending_confirmation",
              data: task.data,
              message: context.lang === "en" ? "Confirm add?" : "Confirmer l'ajout ?",
            };
          } else {
            console.log("[inventory_add] quantite reçu:", task.data.quantite);
            result = await handleAdd(task, context);
            if (result.status === "success") {
              executedResultsMap[norm(task.data.nom || "")] = result.data || task.data;
              hadMutation = true;
            }
          }
          break;
        case "inventory_lot":
          result = await handleLot(task, context);
          break;
        case "inventory_sell": {
          // Cas no_match : l'IA a explicitement indiqué qu'aucun article ne correspond
          if (task.data.no_match) {
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "pending_confirmation", // rendu géré côté App.jsx via taskData.no_match
              data: task.data,
              message: context.lang === "en" ? "Item not found in stock" : "Article non trouvé dans le stock",
            };
            break;
          }

          if (!task.requiresConfirmation) {
            // Priorité au matched_id fourni par l'IA (matching sémantique).
            // Comparaison en string car l'IA retourne parfois l'id bigint en string
            // alors que Supabase le retourne en number — String() normalise les deux.
            let matched = task.data.matched_id
              ? context.items.find(i => String(i.id) === String(task.data.matched_id) && i.statut !== "vendu")
              : null;

            // Fallback : keyword matching si l'IA n'a pas fourni de matched_id
            // (rétrocompatibilité pour le flux buy+sell simultané via executedResultsMap)
            if (!matched) {
              const q = norm(task.data.nom || "");
              const fromMap = q ? executedResultsMap[q] : null;
              matched = fromMap || (q
                ? context.items.find(i =>
                    i.statut !== "vendu" && (
                      norm(i.title || i.titre || i.nom || "").includes(q) ||
                      q.includes(norm(i.title || i.titre || i.nom || ""))
                    )
                  )
                : null);
            }

            if (matched) {
              // Article trouvé avec certitude → exécution directe
              if (context.actions.confirmSellDirect) {
                await context.actions.confirmSellDirect(
                  matched, parseNum(task.data.prix_vente), parseNum(task.data.frais), task.data.quantite_vendue || 1
                );
              } else {
                await context.actions.markSold({
                  ...matched,
                  prix_vente: parseNum(task.data.prix_vente),
                  frais: parseNum(task.data.frais),
                });
              }
              hadMutation = true;
              const _pa = task.data.prix_achat ?? matched.buy ?? matched.prix_achat ?? 0;
              result = {
                intent: task.intent,
                taskData: { ...task.data, prix_achat: _pa },
                status: "success",
                data: { ...task.data, prix_achat: _pa },
                message: context.lang === "en" ? "Sale registered" : "Vente enregistrée",
              };
            } else if (task.data.candidates?.length > 0) {
              // Ambiguïté : l'utilisateur doit choisir parmi les candidats dans le drawer
              result = {
                intent: task.intent,
                taskData: task.data,
                status: "pending_confirmation",
                data: task.data,
                message: context.lang === "en" ? "Which item do you mean?" : "Quel article veux-tu dire ?",
              };
            } else {
              // Ni match ni candidats : confirmation manuelle
              result = {
                intent: task.intent,
                taskData: task.data,
                status: "pending_confirmation",
                data: task.data,
                message: context.lang === "en" ? "Confirm sale?" : "Confirmer la vente ?",
              };
            }
          } else {
            // requiresConfirmation: true → toujours afficher le drawer de confirmation
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "pending_confirmation",
              data: task.data,
              message: context.lang === "en" ? "Confirm sale?" : "Confirmer la vente ?",
            };
          }
          break;
        }
        case "inventory_delete":
          result = {
            intent: task.intent,
            taskData: task.data,
            status: "pending_confirmation",
            data: task.data,
            message:
              context.lang === "en" ? "Confirm delete?" : "Confirmer la suppression ?",
          };
          break;
        case "inventory_update":
          result = {
            intent: task.intent,
            taskData: task.data,
            status: "pending_confirmation",
            data: task.data,
            message:
              context.lang === "en" ? "Confirm update?" : "Confirmer la modification ?",
          };
          break;
        case "inventory_search":
          result = handleSearch(task, context);
          break;
        case "analytics_query":
          result = handleAnalyticsQuery(task, context);
          break;
        case "analytics_best":
          result = handleAnalyticsBest(task, context);
          break;
        case "analytics_dormant":
          result = handleAnalyticsDormant(task, context);
          break;
        case "analytics_date":
          result = handleAnalyticsDate(task, context);
          break;
        case "query_stats":
          result = handleQueryStats(task, context);
          break;
        case "price_advice": {
          const { nom, marque, prix_achat, description, categorie } = task.data;
          try {
            const itemLabel = [nom, marque].filter(Boolean).join(" ");
            const lines = [];
            const cur = context.currency || "EUR";
            if (context.lang === "en") {
              lines.push(`Item: ${itemLabel}`);
              if (description) lines.push(`Condition/details: ${description}`);
              if (prix_achat) lines.push(`Purchase price: ${prix_achat} ${cur}`);
              if (categorie) lines.push(`Category: ${categorie}`);
            } else {
              lines.push(`Article : ${itemLabel}`);
              if (description) lines.push(`État/détails : ${description}`);
              if (prix_achat) lines.push(`Prix d'achat : ${prix_achat} ${cur}`);
              if (categorie) lines.push(`Catégorie : ${categorie}`);
            }
            // Enrich with past similar sales
            const normQ = norm(itemLabel);
            const similar = context.sales.filter(s => {
              const t = norm(s.titre || s.title || s.nom || "");
              const m = norm(s.marque || "");
              return (normQ && (t.includes(normQ) || normQ.includes(t) || m.includes(norm(marque || ""))));
            }).slice(0, 3);
            if (similar.length) {
              const avgSell = similar.reduce((a, s) => a + getPrixVente(s), 0) / similar.length;
              const avgMargin = similar.reduce((a, s) => a + getMargin(s), 0) / similar.length;
              lines.push(context.lang === "en"
                ? `Your past sales of similar items: avg sell price ${Math.round(avgSell)} ${cur}, avg margin ${Math.round(avgMargin)} ${cur}`
                : `Tes ventes passées similaires : prix vente moyen ${Math.round(avgSell)} ${cur}, marge moyenne ${Math.round(avgMargin)} ${cur}`);
            }
            const priceAdvice = lines.join("\n");
            const res = await fetch(`${supabaseUrl}/functions/v1/deal-analysis`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${context.token}`, "apikey": supabaseAnonKey },
              body: JSON.stringify({ priceAdvice, lang: context.lang, currency: cur, country: context.country || null }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            const analysis = d?.analysis || (context.lang === "en" ? "No analysis available." : "Analyse non disponible.");
            result = { intent: task.intent, taskData: task.data, status: "success", data: { analysis }, message: analysis };
          } catch (e) {
            result = { intent: task.intent, taskData: task.data, status: "error", data: {}, message: context.lang === "en" ? "Analysis failed" : "Analyse échouée" };
          }
          break;
        }
        case "buy_advice": {
          const { nom, marque, prix_propose, etat, plateforme_source, categorie } = task.data;
          try {
            const itemLabel = [nom, marque].filter(Boolean).join(" ");
            const lines = [];
            const cur = context.currency || "EUR";
            if (context.lang === "en") {
              lines.push(`Item: ${itemLabel}`);
              if (etat) lines.push(`Condition: ${etat}`);
              if (prix_propose) lines.push(`Proposed price: ${prix_propose} ${cur}`);
              if (plateforme_source) lines.push(`Source platform: ${plateforme_source}`);
              if (categorie) lines.push(`Category: ${categorie}`);
            } else {
              lines.push(`Article : ${itemLabel}`);
              if (etat) lines.push(`État : ${etat}`);
              if (prix_propose) lines.push(`Prix proposé : ${prix_propose} ${cur}`);
              if (plateforme_source) lines.push(`Plateforme : ${plateforme_source}`);
              if (categorie) lines.push(`Catégorie : ${categorie}`);
            }
            // Enrich with past similar sales
            const normQ = norm(itemLabel);
            const similar = context.sales.filter(s => {
              const t = norm(s.titre || s.title || s.nom || "");
              const m = norm(s.marque || "");
              return normQ && (t.includes(normQ) || normQ.includes(t) || m.includes(norm(marque || "")));
            }).slice(0, 3);
            if (similar.length) {
              const avgSell = similar.reduce((a, s) => a + getPrixVente(s), 0) / similar.length;
              const avgMargin = similar.reduce((a, s) => a + getMargin(s), 0) / similar.length;
              lines.push(context.lang === "en"
                ? `Your past sales of similar items: avg sell price ${Math.round(avgSell)} ${cur}, avg margin ${Math.round(avgMargin)} ${cur}`
                : `Tes ventes passées similaires : prix vente moyen ${Math.round(avgSell)} ${cur}, marge moyenne ${Math.round(avgMargin)} ${cur}`);
            }
            const buyAdvice = lines.join("\n");
            const res = await fetch(`${supabaseUrl}/functions/v1/deal-analysis`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${context.token}`, "apikey": supabaseAnonKey },
              body: JSON.stringify({ buyAdvice, lang: context.lang, currency: cur, country: context.country || null }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            const analysis = d?.analysis || (context.lang === "en" ? "No analysis available." : "Analyse non disponible.");
            result = { intent: task.intent, taskData: task.data, status: "success", data: { analysis }, message: analysis };
          } catch (e) {
            result = { intent: task.intent, taskData: task.data, status: "error", data: {}, message: context.lang === "en" ? "Analysis failed" : "Analyse échouée" };
          }
          break;
        }
        case "price_question": {
          const { nom, marque, prix_achat, description, categorie } = task.data;
          try {
            const itemLabel = [nom, marque].filter(Boolean).join(" ");
            const descPart = description ? ` (${description})` : "";
            const cur = context.currency || "EUR";
            const pricePart = prix_achat
              ? (context.lang === "en" ? `, bought for ${prix_achat} ${cur}` : `, acheté ${prix_achat} ${cur}`)
              : "";
            const catPart = categorie ? (context.lang === "en" ? `, category: ${categorie}` : `, catégorie : ${categorie}`) : "";
            const question = context.lang === "en"
              ? `How much can I resell this item: ${itemLabel}${descPart}${pricePart}${catPart}? Provide: 💰 recommended sell price range, 📈 estimated margin, 📦 best platform for this market. Factor in the condition if mentioned.`
              : `À combien puis-je revendre cet article : ${itemLabel}${descPart}${pricePart}${catPart} ? Donne : 💰 fourchette de prix de revente recommandée, 📈 marge estimée, 📦 meilleure plateforme pour ce marché. Tiens compte de l'état si mentionné.`;
            const res = await fetch(`${supabaseUrl}/functions/v1/deal-analysis`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${context.token}`, "apikey": supabaseAnonKey },
              body: JSON.stringify({ question, lang: context.lang, currency: cur, country: context.country || null }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            const analysis = d?.analysis || (context.lang === "en" ? "No analysis available." : "Analyse non disponible.");
            const addPrompt = context.lang === "en"
              ? "\n\nWant me to add it to your stock?"
              : "\n\nVeux-tu que je l'ajoute à ton stock ?";
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "success",
              data: { analysis, hasAddPrompt: true },
              message: analysis + addPrompt,
            };
          } catch (e) {
            result = { intent: task.intent, taskData: task.data, status: "error", data: {}, message: context.lang === "en" ? "Analysis failed" : "Analyse échouée" };
          }
          break;
        }
        case "inventory_move": {
          const { matched_ids, article, emplacement, no_match } = task.data;

          // Article non trouvé par l'IA ou emplacement manquant
          if (no_match || !emplacement) {
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "pending_confirmation",
              data: { notFound: true },
              message: context.lang === "en"
                ? `"${article}" not found in your stock`
                : `"${article}" introuvable dans ton stock`,
            };
            break;
          }

          // Pas de matched_ids retournés par l'IA → essai fallback keyword
          if (!Array.isArray(matched_ids) || matched_ids.length === 0) {
            const normQ = norm(article || "");
            const words = normQ.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
            const fallbackItems = context.items.filter(i => {
              if (i.statut === "vendu" || i.statut === "sold") return false;
              const hay = [norm(i.title || ""), norm(i.marque || ""), norm(i.type || ""), norm(i.description || "")].join(" ");
              return words.length > 0 && words.every(w => hay.includes(w));
            });
            if (fallbackItems.length === 0) {
              result = {
                intent: task.intent,
                taskData: task.data,
                status: "pending_confirmation",
                data: { notFound: true },
                message: context.lang === "en"
                  ? `"${article}" not found in your stock`
                  : `"${article}" introuvable dans ton stock`,
              };
              break;
            }
            // Vérifier si déjà au bon emplacement
            const allAlready = fallbackItems.every(i => (i.emplacement || "").toLowerCase() === emplacement.toLowerCase());
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "pending_confirmation",
              data: { items: fallbackItems, emplacement, alreadyHere: allAlready },
              message: context.lang === "en" ? "Store here?" : "Ranger ici ?",
            };
            break;
          }

          // Résoudre les IDs en articles du contexte local
          const matchedItems = matched_ids
            .map(id => context.items.find(i => String(i.id) === String(id) && i.statut !== "vendu" && i.statut !== "sold"))
            .filter(Boolean);

          if (matchedItems.length === 0) {
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "pending_confirmation",
              data: { notFound: true },
              message: context.lang === "en"
                ? `"${article}" not found in your stock`
                : `"${article}" introuvable dans ton stock`,
            };
            break;
          }

          // Vérifier si tous les articles sont déjà au bon emplacement
          const allAlreadyHere = matchedItems.every(
            i => (i.emplacement || "").toLowerCase() === emplacement.toLowerCase()
          );

          result = {
            intent: task.intent,
            taskData: task.data,
            status: "pending_confirmation",
            data: { items: matchedItems, emplacement, alreadyHere: allAlreadyHere },
            message: context.lang === "en" ? "Store here?" : "Ranger ici ?",
          };
          break;
        }
        case "inventory_location": {
          const locNom = norm(task.data.nom || "");
          const locMarque = norm(task.data.marque || "");
          const locMatches = context.items.filter(item => {
            const t = norm(item.title || "");
            const m = norm(item.marque || "");
            if (locNom && t.includes(locNom)) return true;
            if (locMarque && m.includes(locMarque)) return true;
            if (locNom) {
              const words = locNom.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
              return words.length > 0 && words.every(w => t.includes(w));
            }
            return false;
          });
          if (locMatches.length === 0) {
            result = {
              intent: task.intent, taskData: task.data, status: "error", data: {},
              message: context.lang === "en"
                ? `No item matching "${task.data.nom || task.data.marque}" found in your inventory`
                : `Aucun article "${task.data.nom || task.data.marque}" trouvé dans ton inventaire`,
            };
          } else {
            const hit = locMatches[0];
            result = {
              intent: task.intent, taskData: task.data, status: "success",
              data: {
                title: hit.title,
                emplacement: hit.emplacement || null,
                marque: hit.marque || null,
                type: hit.type || hit.categorie || null,
                description: hit.description || null,
                ville: hit.ville || null,
                quantite: hit.quantite || hit.qty || null,
              },
              message: hit.emplacement
                ? (context.lang === "en"
                  ? `📦 ${hit.title} → ${hit.emplacement}`
                  : `📦 ${hit.title} → ${hit.emplacement}`)
                : (context.lang === "en"
                  ? `No storage location recorded for ${hit.title}`
                  : `Aucun emplacement enregistré pour ${hit.title}`),
            };
          }
          break;
        }
        case "location_items": {
          const locEmp = norm(task.data.emplacement || "");
          if (!locEmp) {
            result = {
              intent: task.intent, taskData: task.data, status: "error", data: {},
              message: context.lang === "en" ? "No location specified" : "Aucun emplacement spécifié",
            };
            break;
          }

          // Normalise en supprimant aussi la ponctuation pour comparer des emplacements
          const normLoc = s => norm(s).replace(/[,;:.!?()/\\]/g, " ").replace(/\s+/g, " ").trim();
          // Mots significatifs d'une phrase d'emplacement (longueur > 2, hors mots vides)
          const locWords = s => normLoc(s).split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

          // Calcule un score de correspondance entre la phrase vocale et un emplacement stocké :
          // 3 = sous-chaîne exacte normalisée
          // 2 = tous les mots-clés significatifs de la phrase sont présents dans l'emplacement
          // 1 = au moins 60 % des mots-clés significatifs correspondent
          // 0 = aucune correspondance
          const empScore = (vocale, stockEmp) => {
            const nv = normLoc(vocale);
            const ne = normLoc(stockEmp);
            if (!ne) return 0;
            if (ne.includes(nv) || nv.includes(ne)) return 3;
            const words = locWords(nv);
            if (words.length === 0) return 0;
            const matched = words.filter(w => ne.includes(w)).length;
            if (matched === words.length) return 2;
            if (matched / words.length >= 0.6) return 1;
            return 0;
          };

          // Scorer tous les articles ayant un emplacement, garder le meilleur niveau
          const scored = context.items
            .filter(item => item.emplacement)
            .map(item => ({ item, score: empScore(locEmp, item.emplacement) }))
            .filter(s => s.score > 0);
          const bestScore = scored.length ? Math.max(...scored.map(s => s.score)) : 0;
          const empMatches = scored.filter(s => s.score === bestScore).map(s => s.item);

          // Emplacement affiché : préférer la valeur stockée du premier match si niveau > 1
          const displayEmp = bestScore >= 2 && empMatches[0]?.emplacement
            ? empMatches[0].emplacement
            : task.data.emplacement;

          if (empMatches.length === 0) {
            result = {
              intent: task.intent, taskData: task.data, status: "error", data: {},
              message: context.lang === "en"
                ? `No items found at location "${task.data.emplacement}"`
                : `Aucun article à l'emplacement "${task.data.emplacement}"`,
            };
          } else {
            result = {
              intent: task.intent, taskData: task.data, status: "success",
              data: { items: empMatches, emplacement: displayEmp },
              message: context.lang === "en"
                ? `${empMatches.length} item(s) at ${displayEmp}`
                : `${empMatches.length} article(s) à l'emplacement ${displayEmp}`,
            };
          }
          break;
        }
        case "off_topic":
          result = {
            intent: "off_topic",
            taskData: task.data,
            status: "success",
            data: {},
            message: context.lang === "en"
              ? "I'm only here to help with your resale business 😊 You can ask me about your stats, inventory, sales, or add an item."
              : "Je suis uniquement disponible pour t'aider avec ton business d'achat-revente 😊 Tu peux me demander tes stats, tes articles, tes ventes, ou ajouter un article.",
          };
          break;
        case "business_advice": {
          result = await handleBusinessAdvice(task, context);
          break;
        }
        case "unknown":
        default:
          result = {
            intent: task.intent,
            taskData: task.data,
            status: "error",
            data: {},
            message:
              context.lang === "en"
                ? "I didn't understand, try again"
                : "Je n'ai pas compris, réessaie",
          };
      }
    } catch (e) {
      result = {
        intent: task.intent,
        taskData: task.data,
        status: "error",
        data: {},
        message: e.message || "Unexpected error",
      };
    }
    results.push(result);
  }

  if (hadMutation) {
    try { await context.actions.fetchAll(); } catch {}
  }

  console.group("[VoiceEngine]");
  console.log("tasks", tasks);
  console.log("results", results);
  console.groupEnd();
  return { results };
}
