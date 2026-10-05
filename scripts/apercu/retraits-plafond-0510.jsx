/* eslint-disable react-refresh/only-export-components --
   Point d'entrée d'aperçu, pas un module de composants. */
// ═══════════════════════════════════════════════════════════════════════════
// APERÇU — retraits bloqués par une connexion + limite du jour (05/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil de RELECTURE, jamais livré. RÉUTILISE le harnais du Stock tel quel
// (stock-refonte.jsx : la coquille d'App.jsx et le VRAI StockTab, servi par
// vite-stock-refonte.config.mjs avec le FAUX client Supabase). Deux greffes,
// posées AVANT de charger le harnais :
//   1. ses données (/build/apercu-stock/donnees.json) sont remplacées par les
//      données FICTIVES de retraits-plafond-0510-donnees.js — aucun compte réel ;
//   2. supabase.functions.invoke('get-pending-jobs', {plafond_only:true}) rend
//      l'état du plafond (limite 50, 45 faites) ; toute autre fonction garde le
//      refus du faux client. Rien ne part, rien ne s'écrit.
//
//   node scripts/apercu/capture-retraits-plafond-0510.mjs
import { supabase } from '../../src/lib/supabase.js';
import { donneesFictives, reponsePlafond } from './retraits-plafond-0510-donnees.js';

const params = new URLSearchParams(location.search);
const limite = Number(params.get('limite') ?? 50);
const faits = Number(params.get('faits') ?? 45);
const DONNEES = donneesFictives(Date.now());
window.__donneesFictives = DONNEES;

const fetchOrigine = window.fetch.bind(window);
window.fetch = (entree, init) => {
  const u = typeof entree === 'string' ? entree : entree?.url;
  if (u && u.includes('/build/apercu-stock/donnees.json')) {
    return Promise.resolve(new Response(JSON.stringify(DONNEES), { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return fetchOrigine(entree, init);
};

const invokeOrigine = supabase.functions.invoke;
supabase.functions.invoke = async (nom, opts) => {
  if (nom === 'get-pending-jobs' && opts?.body?.plafond_only === true) {
    (window.__supabaseJournal ||= []).push({ fonction: nom, plafond_only: true, servie: true });
    return { data: reponsePlafond(Date.now(), { limite, faits }), error: null };
  }
  return invokeOrigine(nom, opts);
};

await import('./stock-refonte.jsx');
