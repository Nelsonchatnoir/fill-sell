// ── LA carte de résultat vocal — source unique de vérité ─────────────────────
// Avant le 2026-07-14, ce rendu existait EN DOUBLE : une fois dans le drawer
// d'App.jsx (~1700 lignes) et une fois dans la zone vocale inline de StockTab
// (~570 lignes), avec des styles divergents pour les mêmes intentions. Les deux
// surfaces montent désormais ce composant.
//
// ⚠️ La LOGIQUE est portée à l'identique depuis App.jsx (ordre des branches
// compris — il est significatif : deal_score sans prix sort en premier, la file
// FIFO des ventes se teste avant la carte de vente, etc.). Seule la PRÉSENTATION
// change. Ne pas réordonner les branches.
//
// Le contexte (ctx) est fourni par l'hôte :
//   lang, currency, items, actions, replaceResult(idx, patch), edits, setEdits
// setEdits est un setState de la forme { [idx]: {...} } — identique à vaEdits
// dans App.jsx et à zoneEdits dans StockTab.

import { V } from './tokens';
import {
  VoiceCard, EntityPills, Pill, TextField, PriceField, SelectField,
  StatDuo, StatBig, ListRows, ListRow, ProseBlock, ScoreGauge,
  Btn, LinkBtn, ConfirmBar, QuietNote,
} from './VoiceKit';
import {
  formatCurrency, fmtp, CURRENCY_SYMBOLS,
  getTypeStyle, typeLabel, normalizeMarque, parseLocDesc, detectType, detectObjectIcon,
} from '../../utils/shared';

const CATS = ["Mode","High-Tech","Maison","Électroménager","Luxe","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"];

export default function VoiceResultCard({ result, idx, allResults = [], ctx }) {
  const { lang = 'fr', currency = 'EUR', items = [], actions, replaceResult, edits = {}, setEdits } = ctx || {};
  const { intent, status, data, message, taskData } = result || {};

  const fmt = (amount, dec = null) => formatCurrency(amount, currency, dec);
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  const en = lang === 'en';
  const catEmoji = (c) => (c && c !== 'Autre' ? getTypeStyle(c).emoji : null);
  const catPill = (c) => (c && c !== 'Autre' ? typeLabel(c, lang) : null);
  const icoFor = (titre, desc, type) => detectObjectIcon(titre, desc, type);
  const cancel = () => replaceResult(idx, { ...result, status: 'error', message: en ? 'Cancelled' : 'Annulé' });

  // ═════ deal_score sans prix de vente : rien à montrer (comportement d'origine)
  if (intent === 'deal_score' && !taskData?.prix_vente) return null;

  // ═════ Erreur / non compris
  if (status === 'error' || intent === 'unknown') {
    if (message?.startsWith('SESSION_EXPIRED:')) {
      return (
        <VoiceCard tone="danger"
          eyebrow={en ? 'Session expired' : 'Session expirée'}
          sub={en ? 'Reload the app and try again — your sentence was not lost.' : "Recharge l'app pour réessayer — ta phrase n'est pas perdue."}>
          <ConfirmBar>
            <Btn kind="danger" onClick={() => window.location.reload()}>{en ? 'Reload' : 'Recharger'}</Btn>
          </ConfirmBar>
        </VoiceCard>
      );
    }
    return (
      <QuietNote>
        <span>🤔</span>
        <span>{message || (en ? "Didn't understand, try again" : "Je n'ai pas compris, réessaie")}</span>
      </QuietNote>
    );
  }

  // ═════ Article ajouté (succès)
  if (status === 'success' && intent === 'inventory_add') {
    const cat = data?.type || taskData?.categorie || taskData?.type;
    const qAdded = (data?.quantite || taskData?.quantite) > 1 ? (data?.quantite || taskData?.quantite) : null;
    const marque = normalizeMarque(data?.marque || taskData?.marque || null) || null;
    const nom = data?.title || data?.nom || taskData?.nom;
    // taskData.prix_achat est propre à cette tâche (data peut référencer un article
    // déjà ajouté plus tôt dans le même batch) — on le priorise, data en repli.
    const prix = taskData?.prix_achat ?? data?.buy ?? data?.prix_achat;
    const desc = data?.description || taskData?.description || null;
    return (
      <VoiceCard tone="done"
        eyebrow={en ? 'Item added' : 'Article ajouté'}
        title={`${nom}${prix ? ` · ${fmt(prix)}` : ''}`}
        sub={desc || null}>
        <EntityPills brand={marque} cat={catPill(cat)} catEmoji={catEmoji(cat)}
          platform={data?.plateforme || taskData?.plateforme || null} qty={qAdded || 1} />
      </VoiceCard>
    );
  }

  // ═════ Recherche d'articles (avec formulaires inline vendre / éditer / supprimer)
  if (status === 'success' && intent === 'inventory_search') {
    const found = data?.items || [];
    const anyFormOpen = edits[idx]?.sellOpen != null || edits[idx]?.deleteOpen != null || edits[idx]?.editOpen != null;
    const fmtDate = d => d ? new Date(d).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    return (
      <VoiceCard tone="info" eyebrow={`${en ? 'Search' : 'Résultats'} (${found.length})`}>
        {found.length === 0 ? (
          <div style={{ fontSize:13, color:V.mute, fontStyle:'italic' }}>{en ? 'No items found' : 'Aucun article trouvé'}</div>
        ) : (
          <ListRows>
            {found.map((item, i) => {
              const isSellOpen = edits[idx]?.sellOpen === i;
              const sellPrice  = edits[idx]?.sellPrice ?? '';
              const sellFees   = edits[idx]?.sellFees ?? '';
              const sellQty    = edits[idx]?.sellQty ?? 1;
              const sellPrixMode = edits[idx]?.sellPrixMode ?? 'total';
              const sellFeesMode = edits[idx]?.sellFeesMode ?? 'total';
              const isDeleteOpen = edits[idx]?.deleteOpen === i;
              const isEditOpen   = edits[idx]?.editOpen === i;
              const ef = edits[idx]?.editFields || {};
              const isSold = item.statut === 'vendu' || item.statut === 'sold';
              const nom = item.titre || item.title || item.nom || '';
              const cat = item.type || item.categorie || null;
              const days = item.date_ajout ? Math.floor((Date.now() - new Date(item.date_ajout)) / 86400000) : null;
              return (
                <div key={i} style={{ borderTop: i > 0 ? `1px solid ${V.border}` : 'none', paddingTop: i > 0 ? 4 : 0 }}>
                  <ListRow
                    first
                    icon={icoFor(nom, item.description, cat)}
                    title={nom}
                    pills={
                      <div style={{ marginTop:4 }}>
                        <EntityPills brand={item.marque} cat={catPill(cat)} catEmoji={catEmoji(cat)}
                          location={item.emplacement} platform={item.plateforme} qty={item.quantite || item.qty || 1} />
                      </div>
                    }
                    description={item.description || item.desc || null}
                    meta={
                      isSold
                        ? (item.date_vente ? `${en ? 'sold on ' : 'vendu le '}${fmtDate(item.date_vente)}` : null)
                        : (item.date_ajout ? `${en ? 'in stock since ' : 'en stock depuis le '}${fmtDate(item.date_ajout)}${days !== null ? ` (${days}${en ? 'd' : 'j'})` : ''}` : null)
                    }
                    value={isSold ? ((item.sell || item.prix_vente) ? fmt(item.sell || item.prix_vente) : '?') : fmt(item.buy || item.prix_achat || 0)}
                    valueTone={isSold ? 'pos' : 'amber'}
                    valueHint={isSold ? fmt(item.buy || item.prix_achat || 0) : null}
                  />

                  {!anyFormOpen && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end', paddingBottom:8 }}>
                      {!isSold && (
                        <button onClick={() => setEdits(prev => ({ ...prev, [idx]: { sellOpen:i, sellPrice:'', sellFees:'', sellQty:1, sellPrixMode:'total', sellFeesMode:'total' } }))}
                          style={{ fontSize:11, fontWeight:700, color:V.tealDeep, border:`1px solid ${V.border}`, background:V.paper,
                            borderRadius:8, padding:'5px 10px', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                          {en ? 'Mark as sold' : 'Marquer vendu'}
                        </button>
                      )}
                      {isSold && <Pill kind="brand">{en ? '✓ sold' : '✓ vendu'}</Pill>}
                      <button onClick={() => setEdits(prev => ({ ...prev, [idx]: { editOpen:i, editFields:{ nom, prix_achat:item.prix_achat || item.buy || '', marque:item.marque || item.brand || '', type:item.type || item.categorie || '' } } }))}
                        style={{ fontSize:11, fontWeight:700, color:V.mute2, border:`1px solid ${V.border}`, background:V.paper,
                          borderRadius:8, padding:'5px 10px', cursor:'pointer', fontFamily:'inherit' }}>✏️</button>
                      <button onClick={() => setEdits(prev => ({ ...prev, [idx]: { deleteOpen:i } }))}
                        style={{ fontSize:11, fontWeight:700, color:V.negative, border:`1px solid rgba(176,100,90,0.3)`, background:'rgba(176,100,90,0.08)',
                          borderRadius:8, padding:'5px 10px', cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                    </div>
                  )}

                  {/* Formulaire de vente inline */}
                  {isSellOpen && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'4px 0 10px' }}>
                      {(item.quantite || 1) > 1 && (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:12, color:V.mute, flex:1 }}>{en ? 'Qty to sell' : 'Qté à vendre'}</span>
                          <input type="number" min={1} max={item.quantite} value={sellQty}
                            onFocus={e => e.target.select()}
                            onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], sellQty: Math.max(1, Math.min(parseInt(e.target.value) || 1, item.quantite)) } }))}
                            style={{ width:64, fontSize:14, fontWeight:600, border:`1px solid ${V.border}`, borderRadius:10, padding:'7px 8px',
                              textAlign:'center', fontFamily:'inherit', background:V.paper, color:V.ink, outline:'none' }} />
                          <span style={{ fontSize:12, color:V.mute }}>/ {item.quantite}</span>
                        </div>
                      )}
                      {sellQty > 1 && (
                        <>
                          <div style={{ display:'flex', gap:6 }}>
                            {['total','unit'].map(m => (
                              <button key={m} onClick={() => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], sellPrixMode:m } }))}
                                style={{ flex:1, padding:'6px 0', fontSize:11, fontWeight:700, borderRadius:9,
                                  border:`1px solid ${sellPrixMode === m ? V.tealDeep : V.border}`,
                                  background: sellPrixMode === m ? V.tealDeep : 'transparent',
                                  color: sellPrixMode === m ? '#fff' : V.mute2, cursor:'pointer', fontFamily:'inherit' }}>
                                {m === 'total' ? (en ? 'Total price' : 'Prix total') : (en ? 'Per unit' : 'Par unité')}
                              </button>
                            ))}
                          </div>
                          <div style={{ display:'flex', gap:6 }}>
                            {['total','unit'].map(m => (
                              <button key={m} onClick={() => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], sellFeesMode:m } }))}
                                style={{ flex:1, padding:'6px 0', fontSize:11, fontWeight:700, borderRadius:9,
                                  border:`1px solid ${sellFeesMode === m ? V.amber : V.border}`,
                                  background: sellFeesMode === m ? V.amber : 'transparent',
                                  color: sellFeesMode === m ? '#fff' : V.mute2, cursor:'pointer', fontFamily:'inherit' }}>
                                {m === 'total' ? (en ? 'Fees on total' : 'Frais total') : (en ? 'Fees/unit' : 'Frais/unité')}
                              </button>
                            ))}
                          </div>
                          {parseFloat(sellPrice) > 0 && (
                            <div style={{ fontSize:11, color:V.mute, textAlign:'center' }}>
                              {sellPrixMode === 'total'
                                ? `= ${fmt(parseFloat(sellPrice) / sellQty)}/${en ? 'unit' : 'unité'}`
                                : `= ${fmt(parseFloat(sellPrice) * sellQty)} total`}
                            </div>
                          )}
                        </>
                      )}
                      <div style={{ display:'flex', gap:8 }}>
                        <PriceField style={{ flex:2 }} value={sellPrice} autoFocus
                          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], sellPrice: e.target.value } }))}
                          placeholder={en ? 'Sale price' : 'Prix de vente'} suffix={sym} />
                        <PriceField style={{ flex:1 }} value={sellFees}
                          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], sellFees: e.target.value } }))}
                          placeholder={en ? 'Fees' : 'Frais'} suffix={sym} />
                      </div>
                      <ConfirmBar>
                        <Btn kind="primary" onClick={async () => {
                          const pv = parseFloat(sellPrice) || 0;
                          const pf = parseFloat(sellFees) || 0;
                          const qty = Math.max(1, Math.min(parseInt(sellQty) || 1, item.quantite || 1));
                          const svUnit = sellPrixMode === 'total' && qty > 1 ? pv / qty : pv;
                          const sfUnit = sellFeesMode === 'total' && qty > 1 ? pf / qty : pf;
                          if (svUnit > 0) {
                            await actions.confirmSellDirect(item, svUnit, sfUnit, qty);
                            await actions.fetchAll();
                          }
                          setEdits(prev => ({ ...prev, [idx]: { sellOpen:null, sellPrice:'', sellFees:'', sellQty:1, sellPrixMode:'total', sellFeesMode:'total' } }));
                        }}>{en ? 'Mark as sold' : 'Enregistrer la vente'}</Btn>
                        <Btn kind="ghost" onClick={() => setEdits(prev => ({ ...prev, [idx]: { sellOpen:null, sellPrice:'', sellFees:'', sellQty:1, sellPrixMode:'total', sellFeesMode:'total' } }))}>
                          {en ? 'Cancel' : 'Annuler'}
                        </Btn>
                      </ConfirmBar>
                    </div>
                  )}

                  {/* Confirmation de suppression inline */}
                  {isDeleteOpen && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'4px 0 10px' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:V.ink }}>
                        {en ? `Delete "${nom}"?` : `Supprimer « ${nom} » ?`}
                      </div>
                      <ConfirmBar>
                        <Btn kind="danger" onClick={() => {
                          actions.deleteItem(item.id);
                          replaceResult(idx, { ...result, data: { ...data, items: data.items.filter((_, j) => j !== i) } });
                          setEdits(prev => ({ ...prev, [idx]: { deleteOpen:null } }));
                        }}>{en ? 'Delete' : 'Supprimer'}</Btn>
                        <Btn kind="ghost" onClick={() => setEdits(prev => ({ ...prev, [idx]: { deleteOpen:null } }))}>
                          {en ? 'Cancel' : 'Annuler'}
                        </Btn>
                      </ConfirmBar>
                    </div>
                  )}

                  {/* Édition inline */}
                  {isEditOpen && (
                    <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'4px 0 10px' }}>
                      <div style={{ display:'flex', gap:8 }}>
                        <TextField style={{ flex:2 }} value={ef.nom ?? nom} placeholder={en ? 'Name' : 'Nom'}
                          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], editFields: { ...ef, nom: e.target.value } } }))} />
                        <PriceField style={{ flex:1 }} value={ef.prix_achat ?? item.prix_achat ?? item.buy ?? ''} suffix={sym}
                          placeholder={en ? 'Price' : 'Prix'}
                          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], editFields: { ...ef, prix_achat: e.target.value } } }))} />
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <TextField style={{ flex:1 }} value={ef.marque ?? item.marque ?? item.brand ?? ''} placeholder={en ? 'Brand' : 'Marque'}
                          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], editFields: { ...ef, marque: e.target.value } } }))} />
                        <SelectField style={{ flex:1 }} value={ef.type ?? item.type ?? item.categorie ?? ''}
                          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], editFields: { ...ef, type: e.target.value } } }))}>
                          <option value="">{en ? 'Category' : 'Catégorie'}</option>
                          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                        </SelectField>
                      </div>
                      <ConfirmBar>
                        <Btn kind="primary" onClick={async () => {
                          try {
                            const fields = {
                              titre: ef.nom != null ? ef.nom : nom,
                              prix_achat: parseFloat(ef.prix_achat) || item.prix_achat || 0,
                              marque: ef.marque != null ? (ef.marque || null) : (item.marque || null),
                              type: ef.type || item.type || null,
                            };
                            await actions.updateItem(item.id, fields);
                            replaceResult(idx, { ...result, data: { ...data, items: data.items.map((it, j) => j === i ? { ...it, ...fields } : it) } });
                            actions.fetchAll();
                            setEdits(prev => ({ ...prev, [idx]: { editOpen:null, editFields:{} } }));
                          } catch (e) {
                            setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], editError: e.message } }));
                          }
                        }}>{en ? 'Save' : 'Enregistrer'}</Btn>
                        <Btn kind="ghost" onClick={() => setEdits(prev => ({ ...prev, [idx]: { editOpen:null, editFields:{} } }))}>
                          {en ? 'Cancel' : 'Annuler'}
                        </Btn>
                      </ConfirmBar>
                      {edits[idx]?.editError && <div style={{ fontSize:11.5, color:V.negative }}>{edits[idx].editError}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </ListRows>
        )}
      </VoiceCard>
    );
  }

  // ═════ Analytics : chiffre du jour / de la période
  if (status === 'success' && intent === 'analytics_query') {
    const aqIsProfit = taskData?.type === 'profit';
    const aqV = data?.value ?? 0;
    const aqGran = (() => {
      const p = data?.periode;
      if (p === 'week') return 'week';
      if (p === 'month') return 'month';
      if (p === 'custom') {
        const df = taskData?.date_from, dt = taskData?.date_to;
        if (df && dt) {
          if (df === dt) return 'day';
          const diffDays = Math.round((new Date(dt) - new Date(df)) / 86400000);
          if (diffDays <= 7) return 'week';
          if (diffDays <= 31) return 'month';
          return 'period';
        }
      }
      return 'day';
    })();
    const aqComment = aqIsProfit ? (() => {
      const v = aqV;
      if (aqGran === 'week') {
        if (v > 50) return en ? 'Great week 🔥' : 'Super semaine 🔥';
        if (v > 10) return en ? 'Good week 👍' : 'Bonne semaine 👍';
        if (v > 0)  return en ? 'Slow week 😊' : 'Petite semaine 😊';
        if (v === 0) return en ? 'Empty week 💪' : 'Semaine blanche 💪';
        return en ? 'Week in the red 😬' : 'Semaine dans le rouge 😬';
      }
      if (aqGran === 'month') {
        if (v > 50) return en ? 'Great month 🔥' : 'Super mois 🔥';
        if (v > 10) return en ? 'Good month 👍' : 'Bon mois 👍';
        if (v > 0)  return en ? 'Slow month 😊' : 'Petit mois 😊';
        if (v === 0) return en ? 'Empty month 💪' : 'Mois blanc 💪';
        return en ? 'Month in the red 😬' : 'Mois dans le rouge 😬';
      }
      if (aqGran === 'period') {
        if (v > 50) return en ? 'Great period 🔥' : 'Belle période 🔥';
        if (v > 10) return en ? 'Good period 👍' : 'Bonne période 👍';
        if (v > 0)  return en ? 'Slow period 😊' : 'Petite période 😊';
        if (v === 0) return en ? 'Empty period 💪' : 'Période blanche 💪';
        return en ? 'Period in the red 😬' : 'Période dans le rouge 😬';
      }
      if (v > 50) return en ? 'Great day 🔥' : 'Bonne journée 🔥';
      if (v > 10) return en ? 'Not bad 👍' : 'Pas mal du tout 👍';
      if (v > 0)  return en ? 'Small win 😊' : 'Petit gain 😊';
      if (v === 0) return en ? 'Nothing today 💪' : "Rien aujourd'hui 💪";
      return en ? 'In the red 😬' : 'Dans le rouge 😬';
    })() : null;
    const aqPeriode = (() => {
      const p = data?.periode;
      if (!p || p === 'all') return null;
      if (p === 'today') return en ? 'Today' : "Aujourd'hui";
      if (p === 'week')  return en ? 'Last 7 days' : '7 derniers jours';
      if (p === 'month') return en ? 'Last 30 days' : '30 derniers jours';
      if (p === 'year')  return en ? 'This year' : 'Cette année';
      if (p === 'custom') {
        const df = taskData?.date_from, dt = taskData?.date_to;
        const fD = d => d ? new Date(d).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit' }) : '';
        if (df && dt && df === dt) return fD(df);
        if (df && dt) return `${fD(df)} – ${fD(dt)}`;
        return null;
      }
      return p;
    })();
    return (
      <VoiceCard tone="info">
        <StatBig label={data?.label} value={fmt(aqV)} tone={aqV < 0 ? 'neg' : 'pos'} hint={aqPeriode} comment={aqComment} />
      </VoiceCard>
    );
  }

  // ═════ Analytics : meilleur par catégorie
  if (status === 'success' && intent === 'analytics_best' && data?.byCategory) {
    const entries = Object.entries(data.byCategory);
    return (
      <VoiceCard tone="info" eyebrow={en ? 'Best by category' : 'Meilleur par catégorie'}>
        <ListRows>
          {entries.map(([cat, s], i) => (
            <ListRow key={i} first={i === 0}
              icon={catEmoji(cat) || '📦'}
              title={s.title || s.titre}
              meta={typeLabel(cat, lang)}
              value={`+${fmt(Math.round((s.margin ?? s.benefice ?? (s.prix_vente - s.prix_achat)) * 100) / 100)}`}
              valueTone="pos" />
          ))}
        </ListRows>
      </VoiceCard>
    );
  }

  // ═════ Analytics : top
  if (status === 'success' && intent === 'analytics_best') {
    const top = data?.items || [];
    return (
      <VoiceCard tone="info" eyebrow="Top">
        <ListRows>
          {top.map((s, i) => (
            <ListRow key={i} first={i === 0}
              icon={`${i + 1}`}
              title={s.title || s.titre}
              value={fmt(Math.round((s.margin || s.benefice || 0) * 100) / 100)}
              valueTone="pos"
              valueHint={`${Math.round((s.marginPct || s.margin_pct || 0) * 10) / 10}%`} />
          ))}
        </ListRows>
      </VoiceCard>
    );
  }

  // ═════ Analytics : dormants
  if (status === 'success' && intent === 'analytics_dormant') {
    const dormant = data?.items || [];
    return (
      <VoiceCard tone="info" eyebrow={`${en ? 'Dormant' : 'Dormants'} (${dormant.length})`}>
        <ListRows>
          {dormant.slice(0, 6).map((item, i) => {
            const d = Math.floor((Date.now() - new Date(item.date_achat || item.created_at || item.date)) / 86400000);
            return (
              <ListRow key={i} first={i === 0}
                icon={icoFor(item.title || item.titre, item.description, item.type)}
                title={item.title || item.titre}
                right={<Pill kind="warn">{d}{en ? 'd' : 'j'}</Pill>} />
            );
          })}
        </ListRows>
        {dormant.length > 6 && (
          <div style={{ fontSize:11.5, color:V.mute, textAlign:'center' }}>+{dormant.length - 6} {en ? 'more' : 'autres'}</div>
        )}
      </VoiceCard>
    );
  }

  // ═════ Analytics : par date
  if (status === 'success' && intent === 'analytics_date') {
    const dateItems = data?.items || [];
    const adType = taskData?.type || 'all';
    const adDate = taskData?.date || '';
    const fmtDs = d => d ? new Date(d).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit' }) : '';
    const dateLabel = fmtDs(adDate);
    const n = dateItems.length;
    const adHeader = adType === 'bought'
      ? (en ? `Bought on ${dateLabel} (${n})` : `Acheté le ${dateLabel} (${n})`)
      : adType === 'sold'
        ? (en ? `Sold on ${dateLabel} (${n})` : `Vendu le ${dateLabel} (${n})`)
        : (en ? `On ${dateLabel} (${n})` : `Le ${dateLabel} (${n})`);
    const adEmpty = adType === 'bought'
      ? (en ? 'Nothing bought that day 🙂' : 'Rien acheté ce jour-là 🙂')
      : adType === 'sold'
        ? (en ? 'Nothing sold that day 🙂' : 'Rien vendu ce jour-là 🙂')
        : (en ? 'Nothing recorded that day 🙂' : 'Rien enregistré ce jour-là 🙂');
    return (
      <VoiceCard tone="info" eyebrow={adHeader}>
        {dateItems.length === 0 ? (
          <div style={{ fontSize:13, color:V.mute, fontStyle:'italic' }}>{adEmpty}</div>
        ) : (
          <ListRows>
            {dateItems.map((item, i) => {
              const isSold = item._type === 'sold';
              const nomItem = item.title || item.titre || '—';
              const catItem = item.type || item.categorie || 'Autre';
              const prixA = item.buy || item.prix_achat || 0;
              const prixV = item.sell || item.prix_vente || 0;
              const ben = item.margin ?? item.benefice ?? 0;
              return (
                <ListRow key={i} first={i === 0}
                  icon={icoFor(nomItem, item.description, catItem)}
                  title={nomItem}
                  pills={
                    <div style={{ marginTop:4 }}>
                      <EntityPills brand={item.marque} cat={catPill(catItem)} catEmoji={catEmoji(catItem)} place={item.emplacement} />
                    </div>
                  }
                  value={isSold ? fmt(prixV) : fmt(prixA)}
                  valueTone={isSold ? 'pos' : 'amber'}
                  valueHint={isSold ? `${ben >= 0 ? '+' : ''}${fmt(Math.round(ben * 100) / 100)}` : null} />
              );
            })}
          </ListRows>
        )}
      </VoiceCard>
    );
  }

  // ═════ Vente de lot (prix groupé) — FIFO puis appariement puis récap
  if (status === 'pending_confirmation' && intent === 'inventory_sell_lot') {
    const hasEarlierPendingLot = allResults.slice(0, idx).some(
      r => (r?.intent === 'inventory_sell' || r?.intent === 'inventory_sell_lot') && r?.status === 'pending_confirmation'
    );
    if (hasEarlierPendingLot) {
      return <QuietNote dim><span>⏳</span><span>{en ? 'Waiting for previous sale confirmation…' : 'En attente de la confirmation précédente…'}</span></QuietNote>;
    }

    const lotItems = taskData?.items || [];
    const lotTotal = taskData?.lotTotal || 0;
    const pendingI = lotItems.findIndex(it => it.resolution === null);
    const lotPhase = pendingI === -1 ? 'recap' : 'matching';

    if (lotPhase === 'matching') {
      const cur = lotItems[pendingI];
      const mi = cur?.matchedItem;
      return (
        <VoiceCard tone="confirm"
          eyebrow={en ? `Lot sale · item ${pendingI + 1} of ${lotItems.length}` : `Vente de lot · article ${pendingI + 1} sur ${lotItems.length}`}
          title={cur?.nom || 'Article'}
          sub={mi ? (en ? 'Found in your stock — is this the one?' : 'Trouvé dans ton stock — est-ce bien celui-ci ?')
                  : (en ? 'No match in stock — will be created as a new item' : 'Aucun article correspondant en stock — sera créé comme nouvel article')}>
          {cur?.marque && <EntityPills brand={cur.marque} />}
          {mi && (
            <ListRows style={{ background:V.paper, border:`1px solid ${V.border}`, borderRadius:14, padding:'6px 12px' }}>
              <ListRow first
                icon={icoFor(mi.title, mi.description, mi.type)}
                title={mi.title}
                pills={<div style={{ marginTop:4 }}><EntityPills brand={mi.marque} cat={catPill(mi.type)} catEmoji={catEmoji(mi.type)} /></div>}
                meta={`${en ? 'Bought' : 'Achat'} ${fmt(mi.buy + (mi.purchaseCosts || 0))}`} />
            </ListRows>
          )}
          <ConfirmBar>
            <Btn kind="primary" onClick={() => {
              const next = lotItems.map((it, i) => i === pendingI ? { ...it, resolution: { source:'stock', item: mi } } : it);
              replaceResult(idx, { ...result, taskData: { ...taskData, items: next } });
            }}>{en ? "That's the one" : "C'est celui-ci"}</Btn>
            <Btn kind="ghost" onClick={() => {
              const next = lotItems.map((it, i) => i === pendingI ? { ...it, resolution: { source:'new' } } : it);
              replaceResult(idx, { ...result, taskData: { ...taskData, items: next } });
            }}>{en ? 'New item' : 'Nouvel article'}</Btn>
          </ConfirmBar>
          <LinkBtn onClick={cancel}>{en ? 'Cancel lot' : 'Annuler le lot'}</LinkBtn>
        </VoiceCard>
      );
    }

    // Phase récap : ventilation du prix ligne par ligne
    const defaultPrice = lotItems.length ? Math.round((lotTotal / lotItems.length) * 100) / 100 : 0;
    const linePrice = (i) => {
      const v = edits[idx]?.lotPrices?.[i];
      return (v != null && v !== '') ? (parseFloat(v) || 0) : defaultPrice;
    };
    const liveTotal = lotItems.reduce((sum, _it, i) => sum + linePrice(i), 0);
    const fromStock = lotItems.filter(it => it.resolution?.source === 'stock').length;
    return (
      <VoiceCard tone="confirm"
        eyebrow={en ? `Lot of ${lotItems.length} item${lotItems.length > 1 ? 's' : ''} sold · ${fmt(lotTotal)}` : `Lot de ${lotItems.length} article${lotItems.length > 1 ? 's' : ''} vendu${lotItems.length > 1 ? 's' : ''} · ${fmt(lotTotal)}`}
        sub={`${en ? 'Current total' : 'Total actuel'} : ${fmt(liveTotal)}`}>
        {lotItems.map((it, i) => {
          const label = it.resolution?.source === 'stock' ? (it.resolution.item?.title || it.nom) : it.nom;
          return (
            <div key={i} style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ flex:1, minWidth:0, fontSize:13.5, fontWeight:600, color:V.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
                <EntityPills brand={it.marque} cat={catPill(it.categorie)} catEmoji={catEmoji(it.categorie)} />
              </div>
              <PriceField suffix={sym} value={edits[idx]?.lotPrices?.[i] ?? defaultPrice}
                onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], lotPrices: { ...prev[idx]?.lotPrices, [i]: e.target.value } } }))} />
            </div>
          );
        })}
        <EntityPills>
          <Pill kind="brand">{fromStock} {en ? 'from stock' : 'du stock'}</Pill>
          {lotItems.length - fromStock > 0 && <Pill kind="cat">{lotItems.length - fromStock} {en ? 'new' : 'nouveau(x)'}</Pill>}
        </EntityPills>
        <ConfirmBar>
          <Btn kind="primary" onClick={async () => {
            try {
              for (let i = 0; i < lotItems.length; i++) {
                const it = lotItems[i];
                const price = linePrice(i);
                if (it.resolution?.source === 'stock' && it.resolution.item) {
                  await actions.confirmSellDirect(it.resolution.item, price, 0, 1, it.plateforme || null);
                } else {
                  await actions.addDirectSale({ nom: it.nom, marque: it.marque, type: it.categorie, description: it.description, prix_vente: price, prix_achat: null, quantite_vendue: 1, plateforme: it.plateforme || null });
                }
              }
              replaceResult(idx, { ...result, status:'success', message: en ? `Lot of ${lotItems.length} items sold` : `Lot de ${lotItems.length} articles vendu` });
            } catch (e) {
              replaceResult(idx, { ...result, status:'error', message: e.message });
            }
          }}>{en ? 'Confirm lot' : 'Confirmer le lot'}</Btn>
          <Btn kind="ghost" onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</Btn>
        </ConfirmBar>
      </VoiceCard>
    );
  }

  // ═════ Vente (toutes ses variantes)
  if (status === 'pending_confirmation' && intent === 'inventory_sell') {
    // File FIFO : une seule vente confirmable à la fois.
    const hasEarlierPending = allResults.slice(0, idx).some(
      r => (r?.intent === 'inventory_sell' || r?.intent === 'inventory_sell_lot') && r?.status === 'pending_confirmation'
    );
    if (hasEarlierPending) {
      return <QuietNote dim><span>⏳</span><span>{en ? 'Waiting for previous sale confirmation…' : 'En attente de la confirmation précédente…'}</span></QuietNote>;
    }

    // ── Vente directe : article absent du stock
    if (taskData?.no_match && !taskData?.price_ambiguous) {
      const pvDirect = parseFloat(taskData?.prix_vente) || 0;
      const dmCat = taskData?.categorie || taskData?.type || null;
      const dmDesc = taskData?.description || null;
      const { loc: dmLoc, rest: dmDescRest } = parseLocDesc(dmDesc);
      return (
        <VoiceCard tone="confirm"
          eyebrow={en ? 'Sale to confirm' : 'Vente à confirmer'}
          title={taskData?.nom || 'Article'}
          sub={dmDescRest || null}>
          <EntityPills brand={taskData?.marque} cat={catPill(dmCat)} catEmoji={catEmoji(dmCat)} place={dmLoc}
            extra={<Pill kind="warn">{en ? 'Direct sale' : 'Vente directe'}</Pill>} />
          <StatDuo
            left={{ label: en ? 'Cost' : 'Achat', value: '—', tone:'mute' }}
            right={{ label: en ? 'Sale' : 'Vente', value: pvDirect > 0 ? fmt(pvDirect) : '—', tone:'pos' }} />
          <ConfirmBar>
            <Btn kind="primary" onClick={() => {
              actions.addDirectSale({ nom: taskData?.nom, marque: taskData?.marque, type: dmCat, description: dmDesc, prix_vente: taskData?.prix_vente, quantite_vendue: taskData?.quantite_vendue, plateforme: taskData?.plateforme || null })
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale recorded' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? 'Add sale' : 'Enregistrer la vente'}</Btn>
            <Btn kind="ghost" onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</Btn>
          </ConfirmBar>
        </VoiceCard>
      );
    }

    // ── Conflit : marque correcte mais type d'article différent
    if (taskData?.conflict && taskData?.candidates?.length > 0) {
      const cfItem = items.find(i => String(i.id) === String(taskData.candidates[0]?.id) && i.statut !== 'vendu');
      const cfPv = parseFloat(taskData?.prix_vente) || 0;
      return (
        <VoiceCard tone="confirm"
          eyebrow={en ? 'Similar item — not identical' : 'Article similaire — pas identique'}
          sub={en ? 'Is this the right item?' : "C'est bien cet article ?"}>
          {cfItem && (
            <ListRows style={{ background:V.paper, border:`1px solid ${V.border}`, borderRadius:14, padding:'6px 12px' }}>
              <ListRow first
                icon={icoFor(cfItem.title, cfItem.description, cfItem.type)}
                title={cfItem.title}
                pills={<div style={{ marginTop:4 }}><EntityPills brand={cfItem.marque} cat={catPill(cfItem.type)} catEmoji={catEmoji(cfItem.type)} /></div>}
                meta={`${en ? 'Bought' : 'Achat'} ${fmt(cfItem.buy + (cfItem.purchaseCosts || 0))}`} />
            </ListRows>
          )}
          <ConfirmBar>
            <Btn kind="primary" onClick={() => {
              if (!cfItem) { replaceResult(idx, { ...result, status:'error', message: en ? 'Item not found' : 'Article non trouvé' }); return; }
              actions.confirmSellDirect(cfItem, cfPv, taskData?.frais || 0, taskData?.quantite_vendue || 1, taskData?.plateforme || null)
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale registered' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? "Yes, that's it" : "Oui, c'est ça"}</Btn>
            <Btn kind="ghost" onClick={() => {
              const dmCatCf = taskData?.categorie || taskData?.type || null;
              actions.addDirectSale({ nom: taskData?.nom, marque: taskData?.marque, type: dmCatCf, description: taskData?.description, prix_vente: taskData?.prix_vente, quantite_vendue: taskData?.quantite_vendue, plateforme: taskData?.plateforme || null })
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale recorded' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? 'No, direct sale' : 'Non, vente directe'}</Btn>
          </ConfirmBar>
        </VoiceCard>
      );
    }

    // ── Conflit de prix d'achat : article trouvé mais prix dicté différent
    if (taskData?.price_conflict && taskData?.candidates?.length > 0) {
      const pcItem = items.find(i => String(i.id) === String(taskData.candidates[0]?.id) && i.statut !== 'vendu');
      const pcPv = parseFloat(taskData?.prix_vente) || 0;
      const pcPa = parseFloat(taskData?.prix_achat) || 0;
      return (
        <VoiceCard tone="confirm"
          eyebrow={en ? 'Similar item — different purchase price' : "Article similaire — prix d'achat différent"}
          sub={en ? 'Is this the right item?' : "C'est bien cet article ?"}>
          {pcItem && (
            <>
              <ListRows style={{ background:V.paper, border:`1px solid ${V.border}`, borderRadius:14, padding:'6px 12px' }}>
                <ListRow first
                  icon={icoFor(pcItem.title, pcItem.description, pcItem.type)}
                  title={pcItem.title}
                  pills={<div style={{ marginTop:4 }}><EntityPills brand={pcItem.marque} cat={catPill(pcItem.type)} catEmoji={catEmoji(pcItem.type)} /></div>} />
              </ListRows>
              <StatDuo
                left={{ label: en ? 'In stock' : 'En stock', value: fmt(pcItem.buy + (pcItem.purchaseCosts || 0)), tone:'mute' }}
                right={{ label: en ? 'Just said' : 'Prix dicté', value: fmt(pcPa) }} />
            </>
          )}
          <ConfirmBar>
            <Btn kind="primary" onClick={() => {
              if (!pcItem) { replaceResult(idx, { ...result, status:'error', message: en ? 'Item not found' : 'Article non trouvé' }); return; }
              // Oui : c'est l'article du stock — on garde SON prix d'achat réel
              actions.confirmSellDirect(pcItem, pcPv, taskData?.frais || 0, taskData?.quantite_vendue || 1, taskData?.plateforme || null)
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale registered' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? "Yes, that's it" : "Oui, c'est ça"}</Btn>
            <Btn kind="ghost" onClick={() => {
              const dmCatPc = taskData?.categorie || taskData?.type || null;
              actions.addDirectSale({ nom: taskData?.nom, marque: taskData?.marque, type: dmCatPc, description: taskData?.description || null, prix_vente: taskData?.prix_vente, prix_achat: taskData?.prix_achat, quantite_vendue: taskData?.quantite_vendue, plateforme: taskData?.plateforme || null })
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale recorded' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? 'No, direct sale' : 'Non, vente directe'}</Btn>
          </ConfirmBar>
        </VoiceCard>
      );
    }

    // ── Ambiguïté : plusieurs candidats, l'utilisateur choisit
    if (taskData?.candidates?.length > 0) {
      return (
        <VoiceCard tone="confirm"
          eyebrow={en ? 'Which item do you mean?' : 'Quel article veux-tu dire ?'}
          title={taskData?.prix_vente != null ? `${en ? 'Sale' : 'Vendu'} ${fmt(taskData.prix_vente)}` : null}>
          <ListRows>
            {taskData.candidates.map((c, ci) => {
              const cItem = items.find(i => String(i.id) === String(c.id));
              if (!cItem) return null;
              return (
                <ListRow key={ci} first={ci === 0}
                  icon={icoFor(cItem.title, cItem.description, cItem.type)}
                  title={cItem.title}
                  pills={<div style={{ marginTop:4 }}><EntityPills brand={cItem.marque} cat={catPill(cItem.type)} catEmoji={catEmoji(cItem.type)} location={cItem.emplacement} /></div>}
                  description={cItem.description || null}
                  value={cItem.buy > 0 ? fmt(cItem.buy) : null}
                  valueTone="amber"
                  onClick={() => replaceResult(idx, { ...result, taskData: { ...taskData, candidates: null, matched_id: c.id } })} />
              );
            })}
          </ListRows>
          <ConfirmBar>
            <Btn kind="soft" align="left" onClick={() => {
              const anyMatchCat = taskData?.categorie || taskData?.type || null;
              actions.addDirectSale({ nom: taskData?.nom, marque: taskData?.marque, type: anyMatchCat, description: taskData?.description, prix_vente: taskData?.prix_vente, quantite_vendue: taskData?.quantite_vendue, plateforme: taskData?.plateforme || null })
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale recorded' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? 'None of these — create sale anyway' : 'Aucun — créer la vente quand même'}</Btn>
          </ConfirmBar>
          <LinkBtn onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</LinkBtn>
        </VoiceCard>
      );
    }

    // ── Ambiguïté de prix : total vs unitaire
    if (taskData?.price_ambiguous && taskData?.prix_mentionne > 0 && taskData?.quantite_vendue > 1) {
      const pm = parseFloat(taskData.prix_mentionne) || 0;
      const qva = taskData.quantite_vendue;
      const unitIfTotal = taskData._unitIfTotal ?? Math.round((pm / qva) * 100) / 100;
      const totalIfUnit = taskData._totalIfUnit ?? Math.round(pm * qva * 100) / 100;
      const artLabel = (taskData.nom || 'article') + (taskData.marque ? ' ' + taskData.marque : '');
      const _ambById = taskData?.matched_id ? items.find(i => String(i.id) === String(taskData.matched_id) && i.statut !== 'vendu') : null;
      const foundAmb = taskData?.no_match ? null : (_ambById || (() => {
        const q = (taskData?.nom || '').toLowerCase().trim();
        const mb = (taskData?.marque || '').toLowerCase().trim();
        return q ? items.find(i => {
          if (i.statut === 'vendu') return false;
          const t = (i.title || '').toLowerCase().trim();
          const im = (i.marque || '').toLowerCase().trim();
          if (mb && im && im !== mb) return false;
          return t.includes(q) || q.includes(t);
        }) : null;
      })());
      const resolve = (uPrice) => {
        if (foundAmb) {
          actions.confirmSellDirect(foundAmb, uPrice, taskData?.frais || 0, qva, taskData?.plateforme || null)
            .then(() => replaceResult(idx, { ...result, status:'success', _resolvedPrix: uPrice, taskData: { ...result.taskData, prix_vente: uPrice }, data: { ...result.data, prix_vente: uPrice }, message: en ? 'Sale registered' : 'Vente enregistrée' }))
            .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
        } else {
          const dmC = taskData?.categorie || taskData?.type || null;
          actions.addDirectSale({ nom: taskData?.nom, marque: taskData?.marque, type: dmC, description: taskData?.description || null, prix_vente: uPrice, quantite_vendue: qva, plateforme: taskData?.plateforme || null })
            .then(() => replaceResult(idx, { ...result, status:'success', _resolvedPrix: uPrice, taskData: { ...result.taskData, prix_vente: uPrice }, data: { ...result.data, prix_vente: uPrice }, message: en ? 'Sale recorded' : 'Vente enregistrée' }))
            .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
        }
      };
      return (
        <VoiceCard tone="confirm"
          eyebrow={en ? `${qva}× ${artLabel} — total or each?` : `${qva}× ${artLabel} — total ou pièce ?`}
          sub={en ? `You mentioned ${fmt(pm)}. How should it be recorded?` : `Tu as mentionné ${fmt(pm)}. Comment enregistrer ?`}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <Btn kind="primary" align="left" onClick={() => resolve(unitIfTotal)}>
              {en ? `${fmt(pm)} total → ${fmt(unitIfTotal)}/item` : `${fmt(pm)} au total → ${fmt(unitIfTotal)}/pièce`}
            </Btn>
            <Btn kind="soft" align="left" onClick={() => resolve(pm)}>
              {en ? `${fmt(pm)}/item → ${fmt(totalIfUnit)} total` : `${fmt(pm)}/pièce → ${fmt(totalIfUnit)} au total`}
            </Btn>
          </div>
          <LinkBtn onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</LinkBtn>
        </VoiceCard>
      );
    }

    // ── Cas normal : article identifié (matched_id) ou à confirmer
    const sellPv = edits[idx]?.prix_vente ?? taskData?.prix_vente ?? null;
    const qv = taskData?.quantite_vendue || 1;
    const found = taskData?.matched_id
      ? items.find(i => String(i.id) === String(taskData.matched_id) && i.statut !== 'vendu')
      : items.find(i => {
          if (i.statut === 'vendu') return false;
          const q = (taskData?.nom || '').toLowerCase().trim();
          const t = (i.title || '').toLowerCase().trim();
          return q && (t.includes(q) || q.includes(t));
        });
    const pv = parseFloat(sellPv) || 0;
    const sf = parseFloat(taskData?.frais) || 0;
    // Le prix d'achat dicté prime sur celui de l'article stock matché (aligné sur voiceEngine).
    const dictatedPa = taskData?.prix_achat != null && taskData?.prix_achat !== '' ? parseFloat(taskData.prix_achat) : null;
    const buyU = dictatedPa != null && !isNaN(dictatedPa) ? dictatedPa : (found ? (found.buy + (found.purchaseCosts || 0)) : 0);
    const mgU = pv - buyU - sf;
    const mgpU = pv > 0 ? (mgU / pv) * 100 : 0;
    const dCat = !found ? (taskData?.categorie || detectType(taskData?.nom || '', taskData?.marque || '')) : null;
    const daysInStock = found && (found.date_ajout || found.date)
      ? Math.floor((Date.now() - new Date(found.date_ajout || found.date).getTime()) / 86400000)
      : null;
    return (
      <VoiceCard tone="confirm"
        eyebrow={en ? 'Sale to confirm' : 'Vente à confirmer'}
        title={found?.title || taskData?.nom || 'Article'}
        sub={found?.description || null}>
        <EntityPills
          qty={qv}
          brand={found?.marque || (taskData?.marque ? normalizeMarque(taskData.marque) : null)}
          cat={catPill(found?.type || dCat)}
          catEmoji={catEmoji(found?.type || dCat)}
          extra={daysInStock !== null ? <Pill kind="cat">{daysInStock}{en ? 'd in stock' : 'j en stock'}</Pill> : null} />
        <StatDuo
          left={{ label: en ? 'Bought' : 'Achat', value: fmt(buyU), tone:'mute' }}
          right={pv > 0
            ? { label: en ? 'Sell' : 'Vente', value: fmt(pv), tone:'pos', hint: `${mgU >= 0 ? '+' : ''}${fmt(mgU)} · ${fmtp(mgpU)}` }
            : { label: en ? 'Sell' : 'Vente', value: en ? 'To confirm' : 'À confirmer', tone:'mute' }} />
        {!taskData?.prix_vente && (
          <PriceField suffix={sym} value={edits[idx]?.prix_vente ?? ''}
            placeholder={en ? 'Sell price' : 'Prix de vente'}
            onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], prix_vente: parseFloat(e.target.value) || 0 } }))} />
        )}
        {found ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontSize:12.5, color:V.mute, fontWeight:600 }}>{en ? 'Is this the right item?' : "C'est bien cet article ?"}</div>
            <Btn kind="primary" align="left" onClick={() => {
              actions.confirmSellDirect(found, sellPv, taskData?.frais || 0, qv, taskData?.plateforme || null)
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale registered' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? `Yes — confirm sale of ${found.title}` : `Oui — confirmer la vente de ${found.title}`}</Btn>
            <Btn kind="soft" align="left" onClick={() => {
              const dmCatN = taskData?.categorie || taskData?.type || null;
              actions.addDirectSale({ nom: taskData?.nom, marque: taskData?.marque, type: dmCatN, description: taskData?.description || null, prix_vente: sellPv || taskData?.prix_vente, prix_achat: taskData?.prix_achat, quantite_vendue: taskData?.quantite_vendue, plateforme: taskData?.plateforme || null })
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale recorded' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? 'No — create a separate sale' : 'Non — créer une vente séparée'}</Btn>
            <LinkBtn onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</LinkBtn>
          </div>
        ) : (
          <ConfirmBar>
            <Btn kind="primary" onClick={() => {
              const dmCatN = taskData?.categorie || taskData?.type || null;
              actions.addDirectSale({ nom: taskData?.nom, marque: taskData?.marque, type: dmCatN, description: taskData?.description || null, prix_vente: sellPv || taskData?.prix_vente, quantite_vendue: taskData?.quantite_vendue, plateforme: taskData?.plateforme || null })
                .then(() => replaceResult(idx, { ...result, status:'success', message: en ? 'Sale recorded' : 'Vente enregistrée' }))
                .catch(e => replaceResult(idx, { ...result, status:'error', message: e.message }));
            }}>{en ? 'Confirm sale' : 'Confirmer la vente'}</Btn>
            <Btn kind="ghost" onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</Btn>
          </ConfirmBar>
        )}
      </VoiceCard>
    );
  }

  // ═════ Suppression
  if (status === 'pending_confirmation' && intent === 'inventory_delete') {
    const _dq = (taskData?.nom || '').toLowerCase();
    const _dItem = items.find(i => (i.title || '').toLowerCase().includes(_dq) && _dq);
    const _dCat = _dItem ? (_dItem.type || _dItem.categorie) : null;
    const _dDesc = (_dItem?.description || _dItem?.desc || '').trim();
    return (
      <VoiceCard tone="danger"
        eyebrow={en ? 'Delete permanently' : 'Supprimer définitivement'}
        title={_dItem ? _dItem.title : (taskData?.nom || '?')}
        sub={en ? 'This item and its history will be lost.' : "Cet article et son historique seront perdus."}>
        {_dItem && (
          <EntityPills brand={_dItem.marque} cat={catPill(_dCat)} catEmoji={catEmoji(_dCat)} location={_dItem.emplacement}
            extra={_dDesc ? <Pill kind="cat">{_dDesc.slice(0, 30)}{_dDesc.length > 30 ? '…' : ''}</Pill> : null} />
        )}
        <ConfirmBar>
          <Btn kind="danger" onClick={async () => {
            const _f = items.find(i => (i.title || '').toLowerCase().includes((taskData?.nom || '').toLowerCase()) && taskData?.nom);
            if (_f) {
              await actions.deleteItemForce(_f.id);
              replaceResult(idx, { ...result, status:'success', message: en ? 'Deleted' : 'Supprimé' });
            } else {
              replaceResult(idx, { ...result, status:'error', message: en ? 'Item not found' : 'Article non trouvé' });
            }
          }}>{en ? 'Delete' : 'Supprimer'}</Btn>
          <Btn kind="ghost" onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</Btn>
        </ConfirmBar>
      </VoiceCard>
    );
  }

  // ═════ Ajout d'article (à confirmer)
  if (status === 'pending_confirmation' && intent === 'inventory_add') {
    const confMarque = taskData?.marque || null;
    const rawNom = taskData?.nom ?? '';
    const nomSansMar = confMarque && rawNom
      ? rawNom.replace(new RegExp('(^|\\s)' + confMarque.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'gi'), ' ').replace(/\s+/g, ' ').trim()
      : rawNom;
    const editNom = edits[idx]?.nom ?? nomSansMar;
    const editPrix = edits[idx]?.prix ?? taskData?.prix_achat ?? '';
    const confCat = taskData?.categorie || null;
    const confDesc = taskData?.description || null;
    const confEmplacement = taskData?.emplacement || null;
    const { loc: confLoc, rest: confDescRest } = parseLocDesc(confDesc);
    return (
      <VoiceCard tone="confirm"
        eyebrow={en ? 'New item' : 'Nouvel article'}
        sub={confDescRest || null}>
        <EntityPills brand={confMarque} cat={catPill(confCat)} catEmoji={catEmoji(confCat)}
          place={confLoc} location={confEmplacement} />
        <TextField value={editNom} placeholder={en ? 'Name' : 'Nom'}
          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], nom: e.target.value } }))} />
        <PriceField suffix={sym} value={editPrix} placeholder={en ? 'Buy price' : "Prix d'achat"}
          onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], prix: parseFloat(e.target.value) || 0 } }))} />
        <ConfirmBar>
          <Btn kind="primary" onClick={async () => {
            try {
              await actions.addItem({ ...taskData, nom: editNom, prix_achat: editPrix || taskData?.prix_achat });
              replaceResult(idx, { ...result, status:'success',
                data: { nom: editNom, prix_achat: editPrix, marque: confMarque, type: confCat, description: confDesc },
                message: en ? 'Item added' : 'Article ajouté' });
            } catch (e) {
              replaceResult(idx, { ...result, status:'error', message: e.message });
            }
          }}>{en ? 'Add to stock' : 'Ajouter au stock'}</Btn>
          <Btn kind="ghost" onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</Btn>
        </ConfirmBar>
      </VoiceCard>
    );
  }

  // ═════ Création de lot (achat groupé)
  if (status === 'pending_confirmation' && intent === 'inventory_lot') {
    const lotItems = data?.items || [];
    const lotTotal = data?.lotTotal || 0;
    const prixMoyen = lotItems.length > 0 ? lotTotal / lotItems.length : 0;
    return (
      <VoiceCard tone="confirm"
        eyebrow={en ? `Lot of ${lotItems.length} item${lotItems.length > 1 ? 's' : ''} · ${fmt(lotTotal)}` : `Lot de ${lotItems.length} article${lotItems.length > 1 ? 's' : ''} · ${fmt(lotTotal)}`}
        sub={lotItems.length > 1 ? `${en ? 'Avg.' : 'Moy.'} ${fmt(prixMoyen)} ${en ? '/ item' : '/ article'}` : null}>
        {lotItems.map((item, i) => {
          const editNom = edits[idx]?.[i]?.nom ?? item.nom;
          const editPrix = edits[idx]?.[i]?.prix ?? item.prix_estime_lot;
          const { loc: itemLoc, rest: itemDescRest } = parseLocDesc(item.description || null);
          return (
            <div key={i} style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <EntityPills brand={item.marque} cat={catPill(item.categorie)} catEmoji={catEmoji(item.categorie)}
                place={itemLoc} location={item.emplacement} platform={item.plateforme} />
              {itemDescRest && <div style={{ fontSize:11.5, color:V.mute, fontStyle:'italic', lineHeight:1.4 }}>{itemDescRest}</div>}
              <TextField value={editNom} placeholder={en ? 'Name' : 'Nom'}
                onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], [i]: { ...prev[idx]?.[i], nom: e.target.value } } }))} />
              <PriceField suffix={sym} value={editPrix} placeholder={en ? 'Buy price' : "Prix d'achat"}
                onChange={e => setEdits(prev => ({ ...prev, [idx]: { ...prev[idx], [i]: { ...prev[idx]?.[i], prix: parseFloat(e.target.value) || 0 } } }))} />
            </div>
          );
        })}
        <ConfirmBar>
          <Btn kind="primary" onClick={async () => {
            try {
              const toAdd = lotItems.map((item, i) => ({
                ...item,
                nom: edits[idx]?.[i]?.nom ?? item.nom,
                prix_achat: edits[idx]?.[i]?.prix ?? item.prix_estime_lot,
                marque: item.marque || null,
                description: item.description || null,
                emplacement: item.emplacement || null,
                plateforme: item.plateforme || null,
              }));
              for (const item of toAdd) await actions.addItem(item);
              replaceResult(idx, { ...result, status:'success', message: en ? `${toAdd.length} items added` : `${toAdd.length} articles ajoutés` });
            } catch (e) {
              replaceResult(idx, { ...result, status:'error', message: e.message });
            }
          }}>{en ? `Add ${lotItems.length} items` : `Ajouter les ${lotItems.length} articles`}</Btn>
          <Btn kind="ghost" onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</Btn>
        </ConfirmBar>
      </VoiceCard>
    );
  }

  // ═════ Ranger dans un emplacement
  if (status === 'pending_confirmation' && intent === 'inventory_move') {
    const moveItems = data?.items || [];
    const moveEmp = data?.emplacement || taskData?.emplacement || '';
    const moveArticle = taskData?.article || '';

    if (data?.notFound) {
      return (
        <VoiceCard tone="info"
          eyebrow={en ? 'Item not found' : 'Article introuvable'}
          sub={en ? `I couldn't find "${moveArticle}" in your stock.` : `Je n'ai pas trouvé « ${moveArticle} » dans ton stock.`}>
          <ConfirmBar>
            <Btn kind="ghost" style={{ flex:1 }} onClick={cancel}>{en ? 'Close' : 'Fermer'}</Btn>
          </ConfirmBar>
        </VoiceCard>
      );
    }

    if (data?.alreadyHere) {
      const n = moveItems[0] ? (moveItems[0].title || moveItems[0].titre || moveItems[0].nom || '') : '';
      return (
        <VoiceCard tone="done"
          eyebrow={en ? 'Already stored here' : 'Déjà rangé ici'}
          sub={`${n ? n + ' ' : ''}${en ? `is already at ${moveEmp}.` : `est déjà sur ${moveEmp}.`}`}>
          <ConfirmBar>
            <Btn kind="ghost" style={{ flex:1 }} onClick={cancel}>{en ? 'Close' : 'Fermer'}</Btn>
          </ConfirmBar>
        </VoiceCard>
      );
    }

    const _multiMove = moveItems.length > 1;
    const _selIds = data?.selectedIds || (moveItems.map(i => i.id));
    return (
      <VoiceCard tone="confirm"
        eyebrow={_multiMove ? (en ? `Store ${_selIds.length} items` : `Ranger ${_selIds.length} articles`) : (en ? 'Store here?' : 'Ranger ici ?')}
        title={`→ ${moveEmp}`}>
        <ListRows>
          {moveItems.map((item, i) => {
            const _cat = item.type || item.categorie || null;
            const prevEmp = item.emplacement || null;
            const itemName = item.title || item.titre || item.nom || '';
            const _checked = _selIds.includes(item.id);
            return (
              <ListRow key={i} first={i === 0}
                selectable={_multiMove}
                selected={_checked}
                dim={_multiMove && !_checked}
                icon={_multiMove ? null : icoFor(itemName, item.description, _cat)}
                title={itemName}
                pills={
                  <div style={{ marginTop:4 }}>
                    <EntityPills brand={item.marque} cat={catPill(_cat)} catEmoji={catEmoji(_cat)} />
                  </div>
                }
                description={item.description || null}
                meta={`📦 ${prevEmp || (en ? 'None' : 'Aucun')} → ${moveEmp}`}
                onClick={_multiMove ? () => {
                  const next = _checked ? _selIds.filter(id => id !== item.id) : [..._selIds, item.id];
                  replaceResult(idx, { ...result, data: { ...data, selectedIds: next } });
                } : undefined} />
            );
          })}
        </ListRows>
        <ConfirmBar>
          <Btn kind="primary" onClick={async () => {
            try {
              const _toMove = _multiMove ? moveItems.filter(i => _selIds.includes(i.id)) : moveItems;
              if (_toMove.length === 0) { cancel(); return; }
              const ids = _toMove.map(i => i.id);
              await actions.moveToLocation(ids, moveEmp);
              replaceResult(idx, { ...result, status:'success', message:
                en ? `✅ Stored! ${_toMove.map(i => i.title || i.titre || i.nom).join(', ')} → ${moveEmp}`
                   : `✅ Rangé ! ${_toMove.map(i => i.title || i.titre || i.nom).join(', ')} → ${moveEmp}` });
            } catch (e) {
              replaceResult(idx, { ...result, status:'error', message: e.message });
            }
          }}>
            {en ? 'Store' : 'Ranger'}{_multiMove && _selIds.length < moveItems.length ? ` (${_selIds.length})` : ''}
          </Btn>
          <Btn kind="ghost" onClick={cancel}>{en ? 'Cancel' : 'Annuler'}</Btn>
        </ConfirmBar>
      </VoiceCard>
    );
  }

  // ═════ Mise à jour d'un champ (informatif — comportement d'origine conservé)
  if (status === 'pending_confirmation' && intent === 'inventory_update') {
    return (
      <VoiceCard tone="info"
        eyebrow={en ? 'Update' : 'Mise à jour'}
        title={`${taskData?.nom} · ${taskData?.field} → ${taskData?.value}`}
        sub={en ? 'Manual update required' : 'Mise à jour manuelle requise'} />
    );
  }

  // ═════ Note du deal
  if (status === 'success' && intent === 'deal_score') {
    const { score, label, profitNet, margePercent, pills, dataQuality } = data || {};
    return (
      <VoiceCard tone="info" eyebrow={en ? 'Deal analysis' : 'Analyse du deal'}>
        <ScoreGauge score={score} label={label} lang={lang} />
        <StatDuo
          left={{ label: en ? 'Net profit' : 'Bénéfice net', value: `${profitNet > 0 ? '+' : ''}${fmt(profitNet)}`, tone: profitNet >= 0 ? 'pos' : 'neg' }}
          right={{ label: en ? 'Margin' : 'Marge', value: `${margePercent}%` }} />
        {pills?.length > 0 && (
          <EntityPills>
            {pills.slice(0, 2).map((p, i) => <Pill key={i} kind="brand">{p}</Pill>)}
          </EntityPills>
        )}
        {dataQuality === 'low' && (
          <div style={{ fontSize:11, color:V.mute, fontStyle:'italic' }}>{en ? 'Based on limited data' : 'Basé sur peu de données'}</div>
        )}
      </VoiceCard>
    );
  }

  // ═════ Vente enregistrée (succès)
  if (status === 'success' && intent === 'inventory_sell') {
    const svUnit = parseFloat(String(result._resolvedPrix ?? data?.prix_vente ?? taskData?.prix_vente ?? 0).replace(',', '.')) || 0;
    const sfUnit = parseFloat(String(taskData?.frais ?? 0).replace(',', '.')) || 0;
    const qv = Math.max(1, (data?.quantite_vendue || taskData?.quantite_vendue || 1));
    const nom = data?.nom || taskData?.nom || '';
    const soldItem = taskData?.matched_id ? items.find(i => String(i.id) === String(taskData.matched_id)) : null;
    const marque = normalizeMarque(soldItem?.marque || data?.marque || taskData?.marque || null) || null;
    const type = soldItem?.type || data?.categorie || taskData?.categorie || detectType(nom, data?.marque || taskData?.marque || '') || null;
    const cogs = soldItem ? (soldItem.buy + (soldItem.purchaseCosts || 0)) : parseFloat(String(data?.prix_achat ?? taskData?.prix_achat ?? 0).replace(',', '.')) || 0;
    const mgUnit = svUnit > 0 ? svUnit - cogs - sfUnit : null;
    const mgpUnit = svUnit > 0 && cogs > 0 && mgUnit != null ? (mgUnit / cogs) * 100 : null;
    const totalSell = svUnit * qv;
    const benefUnit = svUnit - cogs;
    const totalBenef = benefUnit * qv;
    return (
      <VoiceCard tone="done"
        eyebrow={en ? 'Sale registered' : 'Vente enregistrée'}
        title={nom || 'Article'}>
        <EntityPills qty={qv} brand={marque} cat={catPill(type)} catEmoji={catEmoji(type)}
          platform={taskData?.plateforme || data?.plateforme || soldItem?.plateforme || null} />
        <StatDuo
          left={{ label: en ? 'Sold for' : 'Prix de vente', value: fmt(totalSell) }}
          right={cogs > 0
            ? { label: en ? 'Net profit' : 'Profit net', value: `${totalBenef > 0 ? '+' : ''}${fmt(totalBenef)}`,
                tone: totalBenef >= 0 ? 'pos' : 'neg', hint: mgpUnit != null ? fmtp(mgpUnit) : null }
            : null} />
      </VoiceCard>
    );
  }

  // ═════ query_stats : meilleures / pires ventes
  if (status === 'success' && intent === 'query_stats' && (data?.metric === 'best_sales' || data?.metric === 'worst_sales')) {
    const sItems = data?.items || [];
    const isWorst = data?.metric === 'worst_sales';
    const lim = data?.limit ?? sItems.length;
    const title = isWorst
      ? (lim === 1 ? (en ? 'Worst sale' : 'Pire vente') : (en ? `${lim} worst sales` : `${lim} pires ventes`))
      : (lim === 1 ? (en ? 'Best sale' : 'Meilleure vente') : (en ? `Top ${lim} sales` : `Top ${lim} ventes`));
    return (
      <VoiceCard tone="info" eyebrow={title}>
        {sItems.length === 0 ? (
          <div style={{ fontSize:13, color:V.mute, fontStyle:'italic' }}>{en ? 'No sales yet' : 'Aucune vente'}</div>
        ) : (
          <ListRows>
            {sItems.map((s, i) => {
              const profit = Math.round((s._sortVal ?? s.margin ?? s.benefice ?? 0) * 100) / 100;
              const nom = s.title || s.titre || s.nom;
              return (
                <ListRow key={i} first={i === 0}
                  icon={icoFor(nom, s.description, s.type || s.categorie)}
                  title={`${lim > 1 ? `${i + 1}. ` : ''}${nom}`}
                  value={`${profit > 0 ? '+' : ''}${fmt(profit)}`}
                  valueTone={profit >= 0 ? 'pos' : 'neg'} />
              );
            })}
          </ListRows>
        )}
      </VoiceCard>
    );
  }

  // ═════ query_stats : stock sur une période
  if (status === 'success' && intent === 'query_stats' && data?.metric === 'stock_by_period') {
    const sbpItems = data?.items || [];
    const fmtDate = d => d ? new Date(d).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    return (
      <VoiceCard tone="info" eyebrow={`${en ? 'In stock' : 'En stock'} (${data?.count ?? sbpItems.length})`}>
        {sbpItems.length === 0 ? (
          <div style={{ fontSize:13, color:V.mute, fontStyle:'italic' }}>{en ? 'No items' : 'Aucun article'}</div>
        ) : (
          <ListRows>
            {sbpItems.map((item, i) => {
              const days = item.date_ajout ? Math.floor((Date.now() - new Date(item.date_ajout)) / 86400000) : null;
              const nom = item.title || item.titre;
              return (
                <ListRow key={i} first={i === 0}
                  icon={icoFor(nom, item.description, item.type || item.categorie)}
                  title={nom}
                  meta={item.date_ajout ? `${en ? 'since ' : 'depuis le '}${fmtDate(item.date_ajout)}${days !== null ? ` (${days}${en ? 'd' : 'j'})` : ''}` : null}
                  value={fmt(item.buy || item.prix_achat || 0)}
                  valueTone="amber" />
              );
            })}
          </ListRows>
        )}
      </VoiceCard>
    );
  }

  // ═════ query_stats : métriques simples
  if (status === 'success' && intent === 'query_stats' && ['profit_mois','marge_moyenne','stock_immobilise','stock_count'].includes(data?.metric)) {
    const metricTitle = {
      profit_mois: en ? `Profit – ${data?.monthName}` : `Bénéfice – ${data?.monthName}`,
      marge_moyenne: en ? 'Avg margin' : 'Marge moyenne',
      stock_immobilise: en ? 'Locked capital' : 'Stock immobilisé',
      stock_count: en ? 'Items in stock' : 'Articles en stock',
    };
    const isCurrency = data?.metric !== 'marge_moyenne' && data?.metric !== 'stock_count';
    const suffix = isCurrency ? '' : data?.metric === 'stock_count' ? '' : '%';
    const val = data?.value ?? 0;
    const tone = data?.metric === 'stock_immobilise' ? 'amber' : val >= 0 ? 'pos' : 'neg';
    const displayVal = isCurrency ? (val > 0 ? '+' : '') + fmt(val) : val + suffix;
    const qsComment = data?.metric === 'profit_mois'
      ? (val > 50 ? (en ? 'Great month 🔥' : 'Super mois 🔥')
        : val > 10 ? (en ? 'Good month 👍' : 'Bon mois 👍')
        : val > 0 ? (en ? 'Slow month 😊' : 'Petit mois 😊')
        : val === 0 ? (en ? 'Empty month 💪' : 'Mois blanc 💪')
        : (en ? 'Month in the red 😬' : 'Mois dans le rouge 😬'))
      : null;
    return (
      <VoiceCard tone="info">
        <StatBig label={metricTitle[data?.metric]} value={displayVal} tone={tone}
          hint={data?.metric === 'stock_immobilise' ? `${data?.count} ${en ? 'item(s) in stock' : 'article(s) en stock'}` : null}
          comment={qsComment} />
      </VoiceCard>
    );
  }

  // ═════ Stats par plateforme
  if (status === 'success' && intent === 'platform_stats') {
    const metric = data?.metric;
    if (data?.empty) {
      return <QuietNote><span>🏪</span><span>{message}</span></QuietNote>;
    }
    const isStock = metric === 'most_invest';
    const medals = ['🥇','🥈','🥉'];
    const metricLabel = {
      best_sell: en ? 'Best platform' : 'Meilleure plateforme',
      worst_sell: en ? 'Worst platform' : 'Pire plateforme',
      by_name: en ? 'Platform stats' : 'Stats plateforme',
      most_invest: en ? 'Most invested' : 'Plus investi',
      ranking: en ? 'Platform ranking' : 'Classement plateformes',
    }[metric] || (en ? 'Platforms' : 'Plateformes');
    const highlight = isStock ? data?.most : data?.best || data?.worst || data?.found || null;
    const ranked = data?.ranked || null;
    const fmtP = n => `${(Math.round((n || 0) * 10) / 10).toFixed(1)}%`;
    return (
      <VoiceCard tone="info" eyebrow={metricLabel}
        title={highlight && metric !== 'ranking' ? `🏪 ${highlight.plateforme}` : null}
        sub={highlight && metric !== 'ranking'
          ? (isStock
              ? `${highlight.count} ${en ? (highlight.count > 1 ? 'items' : 'item') : (highlight.count > 1 ? 'articles' : 'article')} · ${fmt(highlight.invested)}`
              : `${highlight.count} ${en ? (highlight.count > 1 ? 'sales' : 'sale') : (highlight.count > 1 ? 'ventes' : 'vente')} · ${fmt(highlight.revenue)} ${en ? 'revenue' : 'CA'} · ${fmtP(highlight.avgMargin)} ${en ? 'margin' : 'marge'}`)
          : null}>
        {metric === 'by_name' && data?.found && (
          <StatDuo
            left={{ label: en ? 'Revenue' : 'CA', value: fmt(data.found.revenue) }}
            right={{ label: en ? 'Profit' : 'Bénéfice', value: fmt(data.found.profit), tone:'pos', hint: fmtP(data.found.avgMargin) }} />
        )}
        {metric === 'ranking' && ranked && ranked.length > 0 && (
          <ListRows>
            {ranked.slice(0, 5).map((p, i) => (
              <ListRow key={p.plateforme} first={i === 0}
                icon={medals[i] || `#${i + 1}`}
                title={p.plateforme}
                meta={`${p.count} ${en ? (p.count > 1 ? 'sales' : 'sale') : (p.count > 1 ? 'ventes' : 'vente')}`}
                value={fmt(p.profit)}
                valueTone="pos" />
            ))}
          </ListRows>
        )}
      </VoiceCard>
    );
  }

  // ═════ Hors sujet
  if (status === 'success' && intent === 'off_topic') {
    return <QuietNote><span>💬</span><span>{message}</span></QuietNote>;
  }

  // ═════ Contenu d'un emplacement
  if (status === 'success' && intent === 'location_items') {
    const locItems = data?.items || [];
    const locEmp = data?.emplacement || taskData?.emplacement || '';
    // Agrège les articles identiques (même titre + marque)
    const locGrouped = (() => {
      const map = new Map();
      for (const item of locItems) {
        const key = `${(item.title || '').toLowerCase()}||${(item.marque || '').toLowerCase()}`;
        if (map.has(key)) {
          const g = map.get(key);
          g.qty += (item.quantite || 1);
          g.totalVal += (item.quantite || 1) * (item.prix_achat || item.buy || 0);
        } else {
          map.set(key, { ...item, qty: (item.quantite || 1), totalVal: (item.quantite || 1) * (item.prix_achat || item.buy || 0) });
        }
      }
      return [...map.values()];
    })();
    const totalQty = locGrouped.reduce((s, g) => s + g.qty, 0);
    return (
      <VoiceCard tone="info"
        eyebrow={en ? 'Location' : 'Emplacement'}
        title={`📦 ${locEmp} — ${totalQty} ${en ? 'item(s)' : 'article(s)'}`}>
        {locGrouped.length === 0 ? (
          <div style={{ fontSize:13, color:V.mute, fontStyle:'italic' }}>{en ? 'No items found' : 'Aucun article trouvé'}</div>
        ) : (
          <ListRows>
            {locGrouped.map((item, i) => (
              <ListRow key={i} first={i === 0}
                icon={icoFor(item.title, item.description, item.type)}
                title={`${item.title}${item.qty > 1 ? ` ×${item.qty}` : ''}`}
                pills={
                  <div style={{ marginTop:4 }}>
                    <EntityPills brand={item.marque} cat={catPill(item.type)} catEmoji={catEmoji(item.type)} />
                  </div>
                }
                value={fmt(item.totalVal)}
                valueTone="amber"
                valueHint={item.qty > 1 ? (en ? 'tied up' : 'immobilisés') : null} />
            ))}
          </ListRows>
        )}
      </VoiceCard>
    );
  }

  // ═════ « Où j'ai rangé X »
  if (status === 'success' && intent === 'inventory_location') {
    const locTitle = data?.title || taskData?.nom || '';
    const locEmp = data?.emplacement || null;
    const locMarque = data?.marque || null;
    const locType = data?.type || null;
    const locDesc = data?.description || null;
    const locVille = data?.ville || null;
    const locQte = data?.quantite || null;
    return (
      <VoiceCard tone="info"
        eyebrow={en ? 'Stored here' : 'Rangé ici'}
        title={locTitle}
        sub={locDesc || null}>
        <EntityPills brand={locMarque} cat={catPill(locType)} catEmoji={catEmoji(locType)}
          location={locEmp} place={locVille} qty={locQte || 1} />
        {!locEmp && (
          <div style={{ fontSize:13, color:V.mute, fontStyle:'italic' }}>
            {en ? 'No location saved 🙂' : 'Aucun emplacement enregistré 🙂'}
          </div>
        )}
      </VoiceCard>
    );
  }

  // ═════ Analyse du business
  if (status === 'success' && intent === 'business_advice') {
    const raw = data?.analysis || message || '';
    return (
      <VoiceCard tone="info" eyebrow={en ? 'Business analysis' : 'Analyse de ton business'}>
        <ProseBlock text={raw} />
      </VoiceCard>
    );
  }

  // ═════ Conseil prix / analyse d'achat
  if (status === 'success' && (intent === 'price_advice' || intent === 'price_question' || intent === 'buy_advice')) {
    const label = intent === 'buy_advice'
      ? (en ? 'Buy analysis' : 'Analyse achat')
      : (en ? 'Price advice' : 'Conseil prix');
    const raw = data?.analysis || taskData?.reply || message || '';
    return (
      <VoiceCard tone="info" eyebrow={label}>
        <ProseBlock text={String(raw).replace(/\*\*/g, '').replace(/\*/g, '')} />
      </VoiceCard>
    );
  }

  // ═════ Succès générique
  if (status === 'success') {
    return (
      <VoiceCard tone="done" eyebrow={en ? 'Done' : 'Fait'} title={message} />
    );
  }

  return null;
}
