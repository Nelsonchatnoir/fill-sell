import { calculateDealScore } from './dealScore.js';

const norm = s =>
  s?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim() ?? "";

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
  console.log("[handleLot] start", { lotTotal, items });
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lot-distribute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lotTotal, items, lang: context.lang }),
    }
  );
  if (!res.ok) { console.error("[handleLot] fetch failed", res.status); throw new Error("lot-distribute failed"); }
  const distributed = await res.json();
  console.log("[handleLot] distributed", distributed);
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
  const { brand, categorie, status, query, date_from, date_to, min_price, max_price } =
    task.data;
  let filtered = [...context.items];

  if (brand)
    filtered = filtered.filter(i => norm(i.marque).includes(norm(brand)));
  if (categorie) {
    const normCat = norm(categorie);
    filtered = filtered.filter(i =>
      norm(i.categorie || "") === normCat || norm(i.type || "") === normCat
    );
  }
  if (status === "stock")
    filtered = filtered.filter(i => i.statut !== "vendu" && i.statut !== "sold");
  else if (status === "sold")
    filtered = filtered.filter(i => i.statut === "vendu" || i.statut === "sold");
  if (query) {
    const q = norm(query);
    filtered = filtered.filter(
      i =>
        norm(i.titre || i.nom).includes(q) ||
        norm(i.marque).includes(q) ||
        norm(i.type).includes(q)
    );
  }
  if (date_from) {
    const df = new Date(date_from);
    filtered = filtered.filter(
      i => new Date(i.date_achat || i.date || i.created_at) >= df
    );
  }
  if (date_to) {
    const dt = new Date(date_to);
    filtered = filtered.filter(
      i => new Date(i.date_achat || i.date || i.created_at) <= dt
    );
  }
  if (min_price != null)
    filtered = filtered.filter(i => (i.prix_achat ?? 0) >= min_price);
  if (max_price != null)
    filtered = filtered.filter(i => (i.prix_achat ?? 0) <= max_price);

  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: { items: filtered },
    message:
      context.lang === "en"
        ? `${filtered.length} item(s) found`
        : `${filtered.length} article(s) trouvé(s)`,
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
  const { date, type = "all" } = task.data;
  if (!date) {
    return {
      intent: task.intent,
      taskData: task.data,
      status: "error",
      data: {},
      message: context.lang === "en" ? "Date required" : "Date requise",
    };
  }
  const target = date.slice(0, 10);
  let items = [];

  if (type === "bought" || type === "all") {
    const bought = context.items
      .filter(
        i => (i.date_achat || i.date || i.created_at || "").slice(0, 10) === target
      )
      .map(i => ({ ...i, _type: "bought" }));
    items = [...items, ...bought];
  }
  if (type === "sold" || type === "all") {
    const sold = context.sales
      .filter(s => (s.date || s.created_at || "").slice(0, 10) === target)
      .map(s => ({ ...s, _type: "sold" }));
    items = [...items, ...sold];
  }

  const boughtItems = items.filter(i => i._type === "bought");
  const soldItems = items.filter(i => i._type === "sold");
  const summary = {
    count: items.length,
    totalSpend: boughtItems.reduce((a, i) => a + getPrixAchat(i), 0),
    totalRevenue: soldItems.reduce((a, s) => a + getPrixVente(s), 0),
  };

  return {
    intent: task.intent,
    taskData: task.data,
    status: "success",
    data: { items, summary },
    message:
      context.lang === "en"
        ? `${items.length} item(s) on ${target}`
        : `${items.length} article(s) le ${target}`,
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
    default:
      return { intent: task.intent, taskData: task.data, status: "error", data: {}, message: context.lang === "en" ? "Unknown metric" : "Métrique inconnue" };
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
          if (!task.requiresConfirmation) {
            const q = norm(task.data.nom || "");
            const fromMap = q ? executedResultsMap[q] : null;
            const matched = fromMap || (q
              ? context.items.find(i =>
                  norm(i.title || i.titre || i.nom || "").includes(q) ||
                  q.includes(norm(i.title || i.titre || i.nom || ""))
                )
              : null);
            if (matched) {
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
              result = {
                intent: task.intent,
                taskData: task.data,
                status: "success",
                data: task.data,
                message: context.lang === "en" ? "Sale registered" : "Vente enregistrée",
              };
            } else {
              result = {
                intent: task.intent,
                taskData: task.data,
                status: "pending_confirmation",
                data: task.data,
                message: context.lang === "en" ? "Confirm sale?" : "Confirmer la vente ?",
              };
            }
          } else {
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
        case "deal_score": {
          const pA = parseNum(task.data.prix_achat);
          const pV = parseNum(task.data.prix_vente);
          const pF = parseNum(task.data.frais);
          if (!pA || !pV) {
            result = {
              intent: task.intent,
              taskData: task.data,
              status: "error",
              data: {},
              message: context.lang === "en" ? "Need buy and sell prices" : "Prix achat et vente requis",
            };
            break;
          }
          const historique = context.sales.map(s => ({
            prix_vente: getPrixVente(s),
            prix_achat: getPrixAchat(s),
            frais: getFrais(s),
            categorie: s.categorie ?? s.category ?? null,
            marque: s.marque ?? s.brand ?? null,
            date_achat: s.date_achat ?? s.createdAt ?? null,
            date_vente: s.date_vente ?? s.date ?? null,
          }));
          const ds = calculateDealScore({
            prixAchat: pA,
            prixVente: pV,
            frais: pF,
            lang: context.lang,
            historique,
          });
          result = {
            intent: task.intent,
            taskData: task.data,
            status: "success",
            data: {
              score: ds.score,
              label: ds.label,
              profitNet: ds.context.profitNet,
              margePercent: ds.context.margePercent,
              dimensions: ds.dimensions,
              pills: ds.pills,
              confidence: ds.confidence,
              dataQuality: ds.dataQuality,
            },
            message: `${ds.label} · ${ds.score}/10`,
          };
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
