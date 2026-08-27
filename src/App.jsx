import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarChart3, Bot, Aperture, ClipboardList, LineChart, X, Eye, EyeOff } from 'lucide-react';
const AppleSignIn = registerPlugin('AppleSignIn');
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { initIAP, purchasePremium, restorePurchases, listenCoinTransactionUpdates, recoverAndroidCoinPurchases, findActivePlayPremiumSub, PRODUCT_IDS } from './lib/iap';
import { paiementsAndroidCoupes, messagePaiementAndroidCoupe } from './utils/androidPayments';
import { track } from './analytics/analytics';
import { trackTikTokEvent } from './lib/tiktok';
import { useNavigate, useSearchParams } from "react-router-dom";
const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
// BUILD_ID de CE build web, injecté par Vite (define, cf. vite.config.js) —
// même computeBuildId que le zip public de l'extension. Sert à la bannière
// « extension obsolète » : profiles.extension_build (stampé par get-pending-jobs
// à chaque poll de l'extension) comparé à cet id. Les deux commencent par un
// horodatage ISO triable — on ne compare QUE ce préfixe (le hash git ne
// s'ordonne pas). Un id sans préfixe ISO (« SOURCE non-buildé » en dev) n'est
// jamais flaggé.
const APP_BUILD_ID = typeof __FILLSELL_APP_BUILD__ !== 'undefined' ? __FILLSELL_APP_BUILD__ : null;
// Build extension MINIMAL requis (injecté par Vite depuis scripts/build-id.mjs,
// bumpé à chaque commit touchant chrome-extension/ — garde-fou au build).
// C'est LUI que la bannière « extension obsolète » compare au build installé,
// PAS APP_BUILD_ID : ce dernier avance à chaque déploiement web et re-flaggait
// mécaniquement toutes les extensions à jour (faux positif confirmé 23/07 sur
// le build parti en review Chrome Web Store).
const EXT_MIN_BUILD = typeof __FILLSELL_EXT_MIN_BUILD__ !== 'undefined' ? __FILLSELL_EXT_MIN_BUILD__ : null;
const buildIdTimestamp = (id) => {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(String(id ?? ''));
  return m ? Date.parse(m[1]) : null;
};
import { supabase, supabaseUrl, supabaseAnonKey } from './lib/supabase';
import { consumePostLoginTarget } from './lib/postLoginRedirect';
import { FREE_STOCK_LIMIT_FALLBACK, compteArticlesQuota } from './utils/stockLimit';
import { sonderAnnonceVinted } from './utils/vintedSync';
import { plateformesReserveesParRepublication } from './utils/publicationState';
import Toast from './components/Toast';
import ConversionModal, { COIN_CONFIG_FALLBACK } from './components/ConversionModal';
import { businessOfferVisible } from './config/businessOffer';
import StatsPage from './pages/StatsPage';
import { useTranslation } from './i18n/useTranslation';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { executeVoiceTasks, groupSellLots } from './utils/voiceEngine';
// detectType + normalizeMarque : source de vérité UNIQUE dans utils/shared.js
// (l'ancienne copie locale a fait survivre le bug Ralph Lauren→Luxe ; unifié 2026-07-17).
import { detectType, normalizeMarque } from './utils/shared';
import { prixAchatConnu, comptabilisables, nbSansPrixAchat, totalInvesti, totalMarge, totalCA, margeUnitaire } from './utils/comptabilite';
import StockTab from './tabs/StockTab';
import LensTab from './tabs/LensTab';
import VentesTab from './tabs/VentesTab';
import StatsTab from './tabs/StatsTab';
import DashboardTab from './tabs/DashboardTab';
import { UI, Eyebrow, PrimaryButton, PremiumButton, SecondaryButton, IconButton, Loader, SegmentedPills } from './components/ui';
import CoinStoreModal from './components/CoinStoreModal';
import PepiteIcon from './components/PepiteIcon';
import PepiteAmount from './components/PepiteAmount';
import PlatformLogo from './components/platform-logos/PlatformLogo';
import PlanBadge from './components/PlanBadge';
import OnboardingFlow, { ONBOARD_DONE_KEY } from './components/OnboardingFlow';
import ExtensionPitchScreen from './components/ExtensionPitchScreen';
import PlanDetailsModal from './components/PlanDetailsModal';
import { useIsMobile } from './hooks/useIsMobile';
import BrandMark from './components/BrandMark';
import { VoiceSheet, VoiceThinking, FloatingBubble } from './components/voice/VoiceKit';
import { VOICE_KIT_CSS } from './components/voice/tokens';
import VoiceResultCard from './components/voice/VoiceResultCard';
// Avertissement « encore en ligne » — MÊME composant que la carte vocale
// inventory_sell. Les deux chemins de vente disent la même chose, une seule fois.
import AvertissementAnnoncesEnLigne from './components/AvertissementAnnoncesEnLigne';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);
ChartJS.defaults.font.family = "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif";
import './App.css';
import './App.redesign.css';

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// 50/jour Free depuis le 2026-07-23 (aligné sur voice-transcribe et
// voice-intent — Premium/Pro sont désormais illimités côté serveur).
const VOICE_FREE_LIMIT = 50;

const C = {
  // Design tokens FillSell
  primary:"#1D9E75",
  dark:"#0F6E56",
  soft:"#5DCAA5",
  muted:"#A3A9A6",
  bg:"#F5F6F5",
  // Couleurs d'UI
  teal:"#4ECDC4", tealLight:"#E8F5F0",
  peach:"#F9A26C",
  white:"#FFFFFF",
  text:"#0D0D0D", sub:"#6B7280", label:"#A3A9A6",
  border:"rgba(0,0,0,0.06)",
  red:"#E53E3E", redLight:"#FFF5F5",
  green:"#1D9E75", greenLight:"#E8F5F0",
  orange:"#F9A26C", orangeLight:"#FFF4EE",
  rowBg:"#F5F6F5", rowHover:"#EAEBEA",
};

function useCounter(target, duration = 1200, deps = []) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, deps);
  return val;
}

function Sparkline({ data, color = '#2DB89A', width = 80, height = 28 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  if (data.length === 1) {
    const y = height - ((data[0] - min) / range) * height;
    return (
      <svg width={width} height={height} style={{display:'block'}}>
        <circle cx={width / 2} cy={y} r="2.5" fill={color} />
      </svg>
    );
  }
  const points = data.map((v, i) => {
    const x = (width * i) / (data.length - 1);
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  const last = data.map((v, i) => [(width * i) / (data.length - 1), height - ((v - min) / range) * height]).pop();
  return (
    <svg width={width} height={height} style={{display:'block'}}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

const CURRENCY_DATA=[
  // Europe
  {code:'EUR',sym:'€',loc:'fr-FR',dec:2,reg:'Europe',name:'Euro'},
  {code:'GBP',sym:'£',loc:'en-GB',dec:2,reg:'Europe',name:'Pound'},
  {code:'CHF',sym:'Fr',loc:'de-CH',dec:2,reg:'Europe',name:'Franc'},
  {code:'SEK',sym:'kr',loc:'sv-SE',dec:2,reg:'Europe',name:'Krona SE'},
  {code:'NOK',sym:'kr',loc:'nb-NO',dec:2,reg:'Europe',name:'Krone NO'},
  {code:'DKK',sym:'kr',loc:'da-DK',dec:2,reg:'Europe',name:'Krone DK'},
  {code:'PLN',sym:'zł',loc:'pl-PL',dec:2,reg:'Europe',name:'Złoty'},
  {code:'CZK',sym:'Kč',loc:'cs-CZ',dec:2,reg:'Europe',name:'Koruna'},
  {code:'HUF',sym:'Ft',loc:'hu-HU',dec:0,reg:'Europe',name:'Forint'},
  {code:'RON',sym:'lei',loc:'ro-RO',dec:2,reg:'Europe',name:'Leu RO'},
  {code:'HRK',sym:'kn',loc:'hr-HR',dec:2,reg:'Europe',name:'Kuna'},
  {code:'BGN',sym:'лв',loc:'bg-BG',dec:2,reg:'Europe',name:'Lev'},
  {code:'RSD',sym:'din',loc:'sr-RS',dec:0,reg:'Europe',name:'Dinar RS'},
  {code:'ISK',sym:'kr',loc:'is-IS',dec:0,reg:'Europe',name:'Króna'},
  {code:'ALL',sym:'L',loc:'sq-AL',dec:0,reg:'Europe',name:'Lek'},
  {code:'MKD',sym:'ден',loc:'mk-MK',dec:0,reg:'Europe',name:'Denar'},
  {code:'BAM',sym:'KM',loc:'bs-BA',dec:2,reg:'Europe',name:'Mark BA'},
  {code:'MDL',sym:'L',loc:'ro-MD',dec:2,reg:'Europe',name:'Leu MD'},
  {code:'UAH',sym:'₴',loc:'uk-UA',dec:2,reg:'Europe',name:'Hryvnia'},
  {code:'GEL',sym:'₾',loc:'ka-GE',dec:2,reg:'Europe',name:'Lari'},
  {code:'AMD',sym:'֏',loc:'hy-AM',dec:0,reg:'Europe',name:'Dram'},
  {code:'AZN',sym:'₼',loc:'az-AZ',dec:2,reg:'Europe',name:'Manat AZ'},
  {code:'BYN',sym:'Br',loc:'be-BY',dec:2,reg:'Europe',name:'Rouble BY'},
  {code:'RUB',sym:'₽',loc:'ru-RU',dec:2,reg:'Europe',name:'Rouble'},
  {code:'TRY',sym:'₺',loc:'tr-TR',dec:2,reg:'Europe',name:'Lira'},
  // America
  {code:'USD',sym:'$',loc:'en-US',dec:2,reg:'America',name:'Dollar'},
  {code:'CAD',sym:'CA$',loc:'en-CA',dec:2,reg:'America',name:'Dollar CA'},
  {code:'AUD',sym:'A$',loc:'en-AU',dec:2,reg:'America',name:'Dollar AU'},
  {code:'NZD',sym:'NZ$',loc:'en-NZ',dec:2,reg:'America',name:'Dollar NZ'},
  {code:'MXN',sym:'$',loc:'es-MX',dec:2,reg:'America',name:'Peso MX'},
  {code:'BRL',sym:'R$',loc:'pt-BR',dec:2,reg:'America',name:'Real'},
  {code:'ARS',sym:'$',loc:'es-AR',dec:2,reg:'America',name:'Peso AR'},
  {code:'CLP',sym:'$',loc:'es-CL',dec:0,reg:'America',name:'Peso CL'},
  {code:'COP',sym:'$',loc:'es-CO',dec:0,reg:'America',name:'Peso CO'},
  {code:'PEN',sym:'S/',loc:'es-PE',dec:2,reg:'America',name:'Sol'},
  {code:'UYU',sym:'$U',loc:'es-UY',dec:2,reg:'America',name:'Peso UY'},
  {code:'PYG',sym:'₲',loc:'es-PY',dec:0,reg:'America',name:'Guaraní'},
  {code:'BOB',sym:'Bs.',loc:'es-BO',dec:2,reg:'America',name:'Boliviano'},
  {code:'VES',sym:'Bs.S',loc:'es-VE',dec:2,reg:'America',name:'Bolívar'},
  {code:'GTQ',sym:'Q',loc:'es-GT',dec:2,reg:'America',name:'Quetzal'},
  {code:'HNL',sym:'L',loc:'es-HN',dec:2,reg:'America',name:'Lempira'},
  {code:'NIO',sym:'C$',loc:'es-NI',dec:2,reg:'America',name:'Córdoba'},
  {code:'CRC',sym:'₡',loc:'es-CR',dec:0,reg:'America',name:'Colón'},
  {code:'PAB',sym:'B/.',loc:'es-PA',dec:2,reg:'America',name:'Balboa'},
  {code:'DOP',sym:'RD$',loc:'es-DO',dec:2,reg:'America',name:'Peso DO'},
  {code:'CUP',sym:'$',loc:'es-CU',dec:2,reg:'America',name:'Peso CU'},
  {code:'JMD',sym:'J$',loc:'en-JM',dec:2,reg:'America',name:'Dollar JM'},
  {code:'TTD',sym:'TT$',loc:'en-TT',dec:2,reg:'America',name:'Dollar TT'},
  {code:'BBD',sym:'Bds$',loc:'en-BB',dec:2,reg:'America',name:'Dollar BB'},
  {code:'BSD',sym:'B$',loc:'en-BS',dec:2,reg:'America',name:'Dollar BS'},
  {code:'HTG',sym:'G',loc:'fr-HT',dec:2,reg:'America',name:'Gourde'},
  {code:'XCD',sym:'EC$',loc:'en-AG',dec:2,reg:'America',name:'Dollar EC'},
  // Africa
  {code:'ZAR',sym:'R',loc:'en-ZA',dec:2,reg:'Africa',name:'Rand'},
  {code:'NGN',sym:'₦',loc:'en-NG',dec:2,reg:'Africa',name:'Naira'},
  {code:'EGP',sym:'£',loc:'ar-EG',dec:2,reg:'Africa',name:'Livre EG'},
  {code:'MAD',sym:'DH',loc:'ar-MA',dec:2,reg:'Africa',name:'Dirham MA'},
  {code:'TND',sym:'DT',loc:'ar-TN',dec:3,reg:'Africa',name:'Dinar TN'},
  {code:'DZD',sym:'دج',loc:'ar-DZ',dec:2,reg:'Africa',name:'Dinar DZ'},
  {code:'KES',sym:'KSh',loc:'sw-KE',dec:2,reg:'Africa',name:'Shilling KE'},
  {code:'GHS',sym:'GH₵',loc:'en-GH',dec:2,reg:'Africa',name:'Cedi'},
  {code:'ETB',sym:'Br',loc:'am-ET',dec:2,reg:'Africa',name:'Birr'},
  {code:'TZS',sym:'TSh',loc:'sw-TZ',dec:0,reg:'Africa',name:'Shilling TZ'},
  {code:'UGX',sym:'USh',loc:'en-UG',dec:0,reg:'Africa',name:'Shilling UG'},
  {code:'RWF',sym:'RF',loc:'rw-RW',dec:0,reg:'Africa',name:'Franc RW'},
  {code:'BIF',sym:'Fr',loc:'fr-BI',dec:0,reg:'Africa',name:'Franc BI'},
  {code:'XOF',sym:'CFA',loc:'fr-SN',dec:0,reg:'Africa',name:'Franc XOF'},
  {code:'XAF',sym:'FCFA',loc:'fr-CM',dec:0,reg:'Africa',name:'Franc XAF'},
  {code:'MZN',sym:'MT',loc:'pt-MZ',dec:2,reg:'Africa',name:'Metical'},
  {code:'ZMW',sym:'ZK',loc:'en-ZM',dec:2,reg:'Africa',name:'Kwacha ZM'},
  {code:'MWK',sym:'MK',loc:'en-MW',dec:2,reg:'Africa',name:'Kwacha MW'},
  {code:'NAD',sym:'N$',loc:'en-NA',dec:2,reg:'Africa',name:'Dollar NA'},
  {code:'BWP',sym:'P',loc:'en-BW',dec:2,reg:'Africa',name:'Pula'},
  {code:'SCR',sym:'₨',loc:'en-SC',dec:2,reg:'Africa',name:'Roupie SC'},
  {code:'MUR',sym:'₨',loc:'en-MU',dec:2,reg:'Africa',name:'Roupie MU'},
  {code:'MGA',sym:'Ar',loc:'fr-MG',dec:0,reg:'Africa',name:'Ariary'},
  {code:'SDG',sym:'ج.س',loc:'ar-SD',dec:2,reg:'Africa',name:'Livre SD'},
  {code:'LYD',sym:'LD',loc:'ar-LY',dec:3,reg:'Africa',name:'Dinar LY'},
  {code:'GMD',sym:'D',loc:'en-GM',dec:2,reg:'Africa',name:'Dalasi'},
  {code:'SLE',sym:'Le',loc:'en-SL',dec:2,reg:'Africa',name:'Leone'},
  {code:'LRD',sym:'L$',loc:'en-LR',dec:2,reg:'Africa',name:'Dollar LR'},
  {code:'SOS',sym:'Sh',loc:'so-SO',dec:0,reg:'Africa',name:'Shilling SO'},
  {code:'DJF',sym:'Fr',loc:'fr-DJ',dec:0,reg:'Africa',name:'Franc DJ'},
  {code:'KMF',sym:'Fr',loc:'fr-KM',dec:0,reg:'Africa',name:'Franc KM'},
  {code:'STN',sym:'Db',loc:'pt-ST',dec:2,reg:'Africa',name:'Dobra'},
  {code:'CVE',sym:'Esc',loc:'pt-CV',dec:2,reg:'Africa',name:'Escudo'},
  {code:'MRU',sym:'UM',loc:'ar-MR',dec:2,reg:'Africa',name:'Ouguiya'},
  {code:'ERN',sym:'Nfk',loc:'ti-ER',dec:2,reg:'Africa',name:'Nakfa'},
  {code:'SSP',sym:'£',loc:'en-SS',dec:2,reg:'Africa',name:'Livre SS'},
  {code:'CDF',sym:'Fr',loc:'fr-CD',dec:2,reg:'Africa',name:'Franc CD'},
  {code:'SZL',sym:'L',loc:'en-SZ',dec:2,reg:'Africa',name:'Lilangeni'},
  {code:'LSL',sym:'L',loc:'en-LS',dec:2,reg:'Africa',name:'Loti'},
  // Asia/Pacific
  {code:'JPY',sym:'¥',loc:'ja-JP',dec:0,reg:'Asia/Pacific',name:'Yen'},
  {code:'CNY',sym:'¥',loc:'zh-CN',dec:2,reg:'Asia/Pacific',name:'Yuan'},
  {code:'HKD',sym:'HK$',loc:'zh-HK',dec:2,reg:'Asia/Pacific',name:'Dollar HK'},
  {code:'TWD',sym:'NT$',loc:'zh-TW',dec:0,reg:'Asia/Pacific',name:'Dollar TW'},
  {code:'KRW',sym:'₩',loc:'ko-KR',dec:0,reg:'Asia/Pacific',name:'Won'},
  {code:'SGD',sym:'S$',loc:'en-SG',dec:2,reg:'Asia/Pacific',name:'Dollar SG'},
  {code:'MYR',sym:'RM',loc:'ms-MY',dec:2,reg:'Asia/Pacific',name:'Ringgit'},
  {code:'THB',sym:'฿',loc:'th-TH',dec:2,reg:'Asia/Pacific',name:'Baht'},
  {code:'IDR',sym:'Rp',loc:'id-ID',dec:0,reg:'Asia/Pacific',name:'Rupiah'},
  {code:'PHP',sym:'₱',loc:'fil-PH',dec:2,reg:'Asia/Pacific',name:'Peso PH'},
  {code:'VND',sym:'₫',loc:'vi-VN',dec:0,reg:'Asia/Pacific',name:'Dong'},
  {code:'INR',sym:'₹',loc:'hi-IN',dec:2,reg:'Asia/Pacific',name:'Roupie IN'},
  {code:'PKR',sym:'₨',loc:'ur-PK',dec:2,reg:'Asia/Pacific',name:'Roupie PK'},
  {code:'BDT',sym:'৳',loc:'bn-BD',dec:2,reg:'Asia/Pacific',name:'Taka'},
  {code:'LKR',sym:'₨',loc:'si-LK',dec:2,reg:'Asia/Pacific',name:'Roupie LK'},
  {code:'NPR',sym:'₨',loc:'ne-NP',dec:2,reg:'Asia/Pacific',name:'Roupie NP'},
  {code:'MMK',sym:'K',loc:'my-MM',dec:0,reg:'Asia/Pacific',name:'Kyat'},
  {code:'KHR',sym:'៛',loc:'km-KH',dec:0,reg:'Asia/Pacific',name:'Riel'},
  {code:'LAK',sym:'₭',loc:'lo-LA',dec:0,reg:'Asia/Pacific',name:'Kip'},
  {code:'MNT',sym:'₮',loc:'mn-MN',dec:0,reg:'Asia/Pacific',name:'Tögrög'},
  {code:'KZT',sym:'₸',loc:'kk-KZ',dec:2,reg:'Asia/Pacific',name:'Tenge'},
  {code:'UZS',sym:"so'm",loc:'uz-UZ',dec:0,reg:'Asia/Pacific',name:'Som UZ'},
  {code:'KGS',sym:'som',loc:'ky-KG',dec:2,reg:'Asia/Pacific',name:'Som KG'},
  {code:'TJS',sym:'SM',loc:'tg-TJ',dec:2,reg:'Asia/Pacific',name:'Somoni'},
  {code:'TMT',sym:'T',loc:'tk-TM',dec:2,reg:'Asia/Pacific',name:'Manat TM'},
  {code:'AFN',sym:'؋',loc:'ps-AF',dec:2,reg:'Asia/Pacific',name:'Afghani'},
  {code:'IQD',sym:'ع.د',loc:'ar-IQ',dec:0,reg:'Asia/Pacific',name:'Dinar IQ'},
  {code:'IRR',sym:'﷼',loc:'fa-IR',dec:0,reg:'Asia/Pacific',name:'Rial IR'},
  {code:'SAR',sym:'﷼',loc:'ar-SA',dec:2,reg:'Asia/Pacific',name:'Riyal SA'},
  {code:'AED',sym:'د.إ',loc:'ar-AE',dec:2,reg:'Asia/Pacific',name:'Dirham AE'},
  {code:'QAR',sym:'ر.ق',loc:'ar-QA',dec:2,reg:'Asia/Pacific',name:'Riyal QA'},
  {code:'KWD',sym:'KD',loc:'ar-KW',dec:3,reg:'Asia/Pacific',name:'Dinar KW'},
  {code:'BHD',sym:'BD',loc:'ar-BH',dec:3,reg:'Asia/Pacific',name:'Dinar BH'},
  {code:'OMR',sym:'ر.ع',loc:'ar-OM',dec:3,reg:'Asia/Pacific',name:'Rial OM'},
  {code:'JOD',sym:'JD',loc:'ar-JO',dec:3,reg:'Asia/Pacific',name:'Dinar JO'},
  {code:'LBP',sym:'ل.ل',loc:'ar-LB',dec:0,reg:'Asia/Pacific',name:'Livre LB'},
  {code:'SYP',sym:'£S',loc:'ar-SY',dec:0,reg:'Asia/Pacific',name:'Livre SY'},
  {code:'YER',sym:'﷼',loc:'ar-YE',dec:0,reg:'Asia/Pacific',name:'Rial YE'},
  {code:'ILS',sym:'₪',loc:'he-IL',dec:2,reg:'Asia/Pacific',name:'Shekel'},
];
const CURRENCY_LOCALES=Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.loc]));
const CURRENCY_SYMBOLS=Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.sym]));
const CURRENCY_DECIMALS=Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.dec]));
const CURRENCIES_LIST=CURRENCY_DATA.map(c=>({...c,label:`${c.code} ${c.sym}`}));
function getCountryFallback(){
  const nl=(navigator.language||'').toLowerCase();
  const m=nl.match(/^[a-z]{2}-([a-z]{2})$/);
  if(m) return m[1].toUpperCase();
  const map={fr:'FR',en:'US',ja:'JP',ko:'KR',zh:'CN',th:'TH',vi:'VN',id:'ID',ms:'MY',hi:'IN',tr:'TR',ru:'RU',uk:'UA',ar:'SA',he:'IL',pl:'PL',cs:'CZ',hu:'HU',ro:'RO',hr:'HR',bg:'BG',sv:'SE',no:'NO',da:'DK',pt:'PT',es:'ES',de:'DE',it:'IT',nl:'NL'};
  return map[nl.split('-')[0]]??null;
}
function formatCurrency(amount,currency='EUR',decimals=null){
  const n=Math.round((amount||0)*100)/100;
  const dec=decimals!==null?decimals:(CURRENCY_DECIMALS[currency]??2);
  try{
    return new Intl.NumberFormat(CURRENCY_LOCALES[currency]||'fr-FR',{style:'currency',currency,minimumFractionDigits:dec,maximumFractionDigits:dec}).format(n);
  }catch{
    const sym=CURRENCY_SYMBOLS[currency]||currency;
    return sym+' '+n.toFixed(dec);
  }
}
// Capitalize after spaces and apostrophes to handle "L'Oréal", "Louis Vuitton", etc.
const fmtp = n=>(Math.round(n*10)/10).toFixed(1)+"%";
const getMargeColor = pct => pct>=40?"#1D9E75":pct>=20?"#5DCAA5":pct>=5?"#F9A26C":"#E53E3E";
const getCatBorder = type => getTypeStyle(type).border;

// Location detection: `\b` after accented `à` fails in JS (non-ASCII), so use `\s` instead.
// "bought at" added alongside "bought in" for broader EN coverage.
const LOC_RE = /^(acheté[e]?\s+(?:à|en|au|aux)\s|bought\s+(?:in|at)\s)/i;
function parseLocDesc(desc) {
  if (!desc) return { loc: null, rest: null };
  const parts = desc.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  const loc = parts.filter(p => LOC_RE.test(p)).join(", ") || null;
  const rest = parts.filter(p => !LOC_RE.test(p)).join(", ") || null;
  return { loc, rest };
}

function SwipeRow({onDelete, onEdit, children, style}){
  const isMobile = window.innerWidth < 768;
  const innerRef=useRef(null);
  const bgRef=useRef(null);
  const startX=useRef(0);
  const isDragging=useRef(false);
  const startY=useRef(0);
  const currentDx=useRef(0);
  const isScrolling=useRef(false);
  const THRESHOLD=70;
  // ⚠️ rules-of-hooks : TOUS les hooks doivent être appelés avant le return
  // conditionnel desktop ci-dessous. Sinon le nombre de hooks change quand
  // isMobile bascule (resize navigateur web à travers 768px, rotation tablette)
  // → « Rendered fewer hooks than expected » = crash de la liste. L'effet
  // s'auto-garde sur desktop (window.innerWidth>=768) et innerRef n'y est jamais
  // attaché → il no-op, aucun effet de bord.
  useEffect(()=>{
    if(window.innerWidth>=768||!innerRef.current)return;
    const el=innerRef.current;
    function handleTouchStart(e){
      startX.current=e.touches[0].clientX;
      startY.current=e.touches[0].clientY;
      isDragging.current=true;
      isScrolling.current=false;
      currentDx.current=0;
      el.style.transition='none';
    }
    function handleTouchMove(e){
      if(!isDragging.current)return;
      const dx=e.touches[0].clientX-startX.current;
      const dy=e.touches[0].clientY-startY.current;
      if(!isScrolling.current&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>5){
        isScrolling.current=true;
        isDragging.current=false;
        currentDx.current=0;
        el.style.transform='translateX(0)';
        bgRef.current.style.opacity='0';
        bgRef.current.style.pointerEvents='none';
        return;
      }
      if(isScrolling.current)return;
      if(dx>=0){currentDx.current=0;el.style.transform='translateX(0)';bgRef.current.style.opacity='0';bgRef.current.style.pointerEvents='none';return;}
      currentDx.current=dx;
      el.style.transform=`translateX(${Math.max(dx,-(THRESHOLD+30))}px)`;
      bgRef.current.style.right='0px';bgRef.current.style.opacity='1';bgRef.current.style.pointerEvents='auto';
    }
    function handleTouchEnd(){
      isDragging.current=false;
      el.style.transition='transform 0.25s ease';
      if(currentDx.current<=-THRESHOLD){el.style.transform=`translateX(-${THRESHOLD}px)`;bgRef.current.style.right='0px';bgRef.current.style.opacity='1';bgRef.current.style.pointerEvents='auto';}
      else{el.style.transform='translateX(0)';bgRef.current.style.opacity='0';bgRef.current.style.pointerEvents='none';bgRef.current.style.right='-80px';}
      currentDx.current=0;
    }
    el.addEventListener('touchstart',handleTouchStart,{passive:true});
    el.addEventListener('touchmove',handleTouchMove,{passive:true});
    el.addEventListener('touchend',handleTouchEnd,{passive:true});
    return()=>{
      el.removeEventListener('touchstart',handleTouchStart);
      el.removeEventListener('touchmove',handleTouchMove);
      el.removeEventListener('touchend',handleTouchEnd);
    };
  },[]);

  if(!isMobile){
    return(
      <div style={{position:"relative",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#fff",borderRadius:12,border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",transition:"background 0.15s",marginBottom:0,...style}}
        onMouseEnter={e=>{e.currentTarget.style.background="#F9FAFB";e.currentTarget.querySelector('.delx').style.opacity='1';if(onEdit)e.currentTarget.querySelector('.editx').style.opacity='1';}}
        onMouseLeave={e=>{e.currentTarget.style.background="#fff";e.currentTarget.querySelector('.delx').style.opacity='0';if(onEdit)e.currentTarget.querySelector('.editx').style.opacity='0';}}
      >
        {children}
        {onEdit&&(
          <button className="editx" onClick={()=>onEdit()}
            style={{opacity:0,background:"transparent",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF",padding:"4px 8px",borderRadius:6,transition:"all 0.15s",flexShrink:0,marginLeft:4}}
            onMouseEnter={e=>{e.currentTarget.style.background="#EBF8FF";e.currentTarget.style.color="#3B82F6";}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9CA3AF";}}
          >✏️</button>
        )}
        <button className="delx" onClick={onDelete}
          style={{opacity:0,background:"transparent",border:"none",cursor:"pointer",fontSize:15,color:"#9CA3AF",padding:"4px 8px",borderRadius:6,transition:"all 0.15s",flexShrink:0,marginLeft:4}}
          onMouseEnter={e=>{e.currentTarget.style.background="#FEE2E2";e.currentTarget.style.color="#E53E3E";}}
          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#9CA3AF";}}
        >✕</button>
      </div>
    );
  }

  function handleDelClick(){
    innerRef.current.style.transition='transform 0.2s ease,opacity 0.2s ease';
    innerRef.current.style.transform='translateX(-120%)';innerRef.current.style.opacity='0';
    setTimeout(()=>onDelete(),200);
  }
  return(
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",maxWidth:"100%",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",touchAction:"pan-y",...style}}>
      <div ref={bgRef} onClick={handleDelClick} style={{position:"absolute",right:-80,top:0,bottom:0,width:80,background:"linear-gradient(135deg,#FF6B6B,#E53E3E)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",opacity:0,pointerEvents:"none"}}>
        <span style={{fontSize:22}}>🗑️</span>
      </div>
      <div ref={innerRef} style={{position:"relative",zIndex:1,width:"100%",display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"#fff",borderRadius:12,touchAction:"pan-y"}}>
        {onEdit&&(
          <button onClick={e=>{e.stopPropagation();onEdit();}}
            style={{background:"#EBF8FF",color:"#3B82F6",border:"none",borderRadius:6,padding:"5px 7px",fontSize:12,cursor:"pointer",flexShrink:0,lineHeight:1}}>
            ✏️
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

async function checkAndResetDaily(supabase, userId, field_count, field_date) {
  const today = new Date().toISOString().split('T')[0];
  const { data: profile } = await supabase
    .from('profiles')
    .select(`${field_count}, ${field_date}`)
    .eq('id', userId)
    .single();
  const currentCount = profile?.[field_date] === today ? (profile?.[field_count] ?? 0) : 0;
  if (profile?.[field_date] !== today) {
    // Règle projet « profiles-rls-update-policy » : toute écriture client sur
    // profiles est suivie d'un .select() et d'un test d'erreur. Sans lui, un
    // refus de GRANT colonne est silencieux — c'est exactement ce qui a laissé
    // le chemin d'achat Google mentir pendant des mois. Ici l'échec n'est pas
    // bloquant (compteur du jour), donc on journalise sans lever.
    const { error } = await supabase.from('profiles')
      .update({ [field_count]: 0, [field_date]: today })
      .eq('id', userId)
      .select(field_count);
    if (error) console.warn(`[quota] remise à zéro ${field_count} refusée:`, error.message);
  }
  return currentCount;
}

// Libellés des mouvements du ledger de Pépites (Settings)
const COIN_KIND_LABELS={
  grant_monthly:{fr:'Pépites du mois',en:'Monthly Nuggets'},
  purchase:{fr:'Pack acheté',en:'Pack purchased'},
  spend_publish:{fr:'Publication',en:'Publish'},
  spend_lens:{fr:'Analyse Lens',en:'Lens scan'},
  spend_generate:{fr:"Génération d'annonce",en:'Listing generation'},
  refund_generate:{fr:'Génération remboursée (échec)',en:'Generation refunded (failed)'},
  release_publish:{fr:'Pépites rendues (non publié)',en:'Nuggets returned (not published)'},
  refund:{fr:'Remboursement',en:'Refund'},
  admin:{fr:'Ajustement',en:'Adjustment'},
};

// ── Libellé UNIQUE des points d'entrée vers la modale de plans (2026-08-09) ──
// « Passer Pro » nommait un palier alors que le bouton ouvre le CHOIX des
// paliers : on cliquait « Passer Pro » et la feuille Apple annonçait
// « FillSell Premium — 12,99 € ». Même piège avec « Passer Premium », et avec
// les sous-titres qui affichaient 12,99 €/mois sous un bouton menant à trois
// prix. Une seule formulation dans toute l'app, neutre, et assez courte pour
// tenir dans l'en-tête sur mobile (nowrap, 12,5 px / 700).
// ⚠️ Les CTA situés À L'INTÉRIEUR de la modale gardent, eux, le nom du palier
// (« Passer Pro » sur la carte Pro) : là, l'utilisateur choisit vraiment un
// produit, et le nommer est la seule chose honnête à faire.
const CTA_OFFRES = (lang) => (lang === 'en' ? 'See plans' : 'Voir les offres');

function PremiumBanner({ userEmail, compact=false, source='banner', onOpenModal=null, label=null }){
  const [loading, setLoading] = useState(false);
  const lang = localStorage.getItem('fs_lang') || 'fr';
  const { t: tb } = useTranslation(lang);

  async function handleCheckout(){
    track('premium_click', { source });
    setLoading(true);
    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ email: userEmail }),
        }
      );
      const { url, error } = await res.json();
      if(error) throw new Error(error);
      window.location.href = url;
    } catch(e) {
      // Même mapping que triggerCheckout : pas d'erreur Stripe brute (26/07).
      console.error('[checkout] error:', e);
      alert(e.message==='payment_unavailable'
        ?(lang==='en'?"Payment is temporarily unavailable. We're on it — please try again shortly.":"Le paiement est momentanément indisponible. On est prévenus — réessaie dans quelques minutes.")
        :(lang==='en'?"Could not open checkout. Please try again.":"Impossible d'ouvrir le paiement. Réessaie dans un instant."));
      setLoading(false);
    }
  }

  if(compact){
    // « Passer Pro » (2026-08-05) : seul mot anglais de l'interface remplacé,
    // et le bouton fait désormais face au pill « Pro » des abonnés — même
    // gabarit visuel (SIZES.sm de PlanBadge : padding 7px 12px, rayon 999,
    // texte 12.5/700). La zone tactile de 44 px est portée par le <button>
    // transparent qui entoure le pill — le visuel, lui, garde la hauteur du
    // pill Pro. Un seul libellé, jamais coupé (nowrap) : plus de variantes
    // premium-short/premium-full.
    const bg=loading?"#E5E7EB":"linear-gradient(120deg,#2F9E90,#1B6E62)";
    return(
      <button onClick={onOpenModal??handleCheckout} disabled={loading}
        style={{background:"transparent",border:"none",padding:0,minHeight:44,display:"inline-flex",alignItems:"center",cursor:loading?"not-allowed":"pointer",flexShrink:0,fontFamily:"inherit"}}
      >
        <span style={{display:"inline-flex",alignItems:"center",padding:"7px 12px",borderRadius:999,background:bg,color:"#fff",fontSize:12.5,fontWeight:700,letterSpacing:"0.01em",whiteSpace:"nowrap",transition:"filter 0.15s"}}
          onMouseEnter={e=>{if(!loading)e.currentTarget.style.filter="brightness(0.92)";}}
          onMouseLeave={e=>{e.currentTarget.style.filter="none";}}
        >
          {loading ? "..." : CTA_OFFRES(lang)}
        </span>
      </button>
    );
  }

  return(
    <div style={{background:"linear-gradient(135deg,#2F9E9008,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <CtaPremium
        onClick={onOpenModal??handleCheckout}
        label={loading ? tb('redirection') : (label ?? CTA_OFFRES(lang))}
        disabled={loading}
        sub={lang==='fr'?'Sans engagement · Résiliable en 1 clic':'No commitment · Cancel anytime in 1 click'}
      />
    </div>
  );
}

// iapProduct retiré de la signature le 2026-08-09 : le sous-titre était son
// seul lecteur, et il y affichait le prix du produit Premium sous un bouton
// qui ouvre trois tarifs.
function IAPUpgradeBlock({ lang, iapLoading, onPurchase, onRestore, label=null }) {
  return (
    <div style={{background:"linear-gradient(135deg,#2F9E9008,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:11,fontWeight:700,background:"rgba(47,158,144,0.08)",color:"#1B6E62",borderRadius:99,padding:"4px 12px",border:"1px solid rgba(47,158,144,0.18)"}}>
        ✨ {lang==='fr'?'Stock illimité · IA vocale · Stats':'Unlimited stock · Voice AI · Stats'}
      </div>
      <CtaPremium
        onClick={onPurchase}
        label={iapLoading?(lang==='fr'?'Chargement...':'Loading...'):(label ?? CTA_OFFRES(lang))}
        disabled={iapLoading}
        // Le prix a disparu d'ici (2026-08-09) : ce bloc ouvre la modale de
        // CHOIX (onPurchase = openUpgradeModal), pas un achat Premium. Il
        // annonçait iapProduct.priceString — le prix du produit Premium — sous
        // un bouton qui mène à trois tarifs. Le prix se lit désormais là où on
        // choisit, sur la carte du palier.
        sub={lang==='fr'?'Sans engagement · Résiliable en 1 clic':'No commitment · Cancel anytime in 1 click'}
      />
      <button
        onClick={onRestore}
        disabled={iapLoading}
        style={{background:"transparent",border:"none",color:UI.mute,fontSize:12,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}
      >
        {lang==='fr'?'Restaurer mes achats':'Restore purchases'}
      </button>
    </div>
  );
}

// Défaut NEUTRE (2026-08-09) : les deux appelants passent toujours un label,
// mais un défaut nommant un palier n'attend qu'un troisième appelant distrait
// pour réintroduire « Passer Premium » devant un choix de trois plans.
function CtaPremium({ onClick, label = "Voir les offres", disabled, sub }) {
  return (
    <>
      <PremiumButton onClick={onClick} disabled={disabled}>
        {label}
      </PremiumButton>
      <div style={{fontSize:12,color:UI.mute,fontWeight:500,marginTop:2}}>
        {sub || "12,99 €/mois — annulable à tout moment"}
      </div>
    </>
  );
}

const Tip=({active,payload,label})=>active&&payload?.length?(
  <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 14px",fontSize:12,boxShadow:"0 10px 30px rgba(0,0,0,0.1)"}}>
    <div style={{color:C.sub,marginBottom:4,fontWeight:600}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color,fontWeight:700}}>{p.name}: {p.name==="Marge %"?fmtp(p.value):formatCurrency(p.value)}</div>)}
  </div>
):null;

const Empty=({text="Aucune donnée"})=>(
  <div style={{height:130,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.label,gap:8}}>
    <div style={{fontSize:28}}>📭</div>
    <div style={{fontSize:12,fontWeight:500}}>{text}</div>
  </div>
);

const Kpi=({label,value,sub,color,icon})=>(
  <div className="kpi" style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
    {icon&&<div style={{fontSize:18,marginBottom:4}}>{icon}</div>}
    <div style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
    <div style={{fontSize:22,fontWeight:700,color:"#0D0D0D",letterSpacing:"-0.03em",lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:10,fontWeight:700,color:color||"#6B7280",marginTop:4}}>{sub}</div>}
  </div>
);

const Field=({label,value,set,placeholder,type="text",icon,suffix})=>(
  <div className="inp" style={{
    background:C.white,borderRadius:14,
    padding:"0 16px",height:58,
    border:value?`1px solid ${C.teal}55`:`1px solid rgba(0,0,0,0.08)`,
    display:"flex",alignItems:"center",gap:12,
    boxShadow:value?`0 0 0 3px ${C.teal}11`:"0 2px 8px rgba(0,0,0,0.04)",
    transition:"all 0.2s"
  }}>
    <span style={{fontSize:20,flexShrink:0,opacity:0.7}}>{icon}</span>
    <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:2}}>
      <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <input type={type} value={value} onChange={e=>set(e.target.value)} placeholder={placeholder}
          inputMode={type==="number"?"decimal":undefined}
          style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:16,fontWeight:600,width:"100%",fontFamily:"inherit"}}/>
        {suffix&&<span style={{color:C.label,fontSize:13,fontWeight:600,flexShrink:0}}>{suffix}</span>}
      </div>
    </div>
  </div>
);

const Btn=({onClick,disabled,children,color,full=false})=>(
  <button className="btn" onClick={onClick} disabled={disabled} style={{
    width:full?"100%":"auto",padding:"15px 20px",
    background:disabled?"#E5E7EB":color,
    color:disabled?C.sub:C.white,
    border:"none",borderRadius:14,fontSize:15,fontWeight:700,
    boxShadow:disabled?"none":`0 4px 16px rgba(0,0,0,0.14)`,
    opacity:disabled?0.6:1,
    cursor:disabled?"not-allowed":"pointer",
    transition:"all 0.3s ease",
    transform:"scale(1)",
  }}
    onMouseEnter={e=>{if(!disabled){e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.18)";}}}
    onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=disabled?"none":"0 4px 16px rgba(0,0,0,0.14)";}}
    onMouseDown={e=>{if(!disabled)e.currentTarget.style.transform="scale(0.97)";}}
    onMouseUp={e=>{if(!disabled)e.currentTarget.style.transform="scale(1.03)";}}
  >{children}</button>
);

function getMargeMessage(marginPct,marginEur,lang='fr'){
  const msgs={
    fr:[
      {msg:"Jackpot 💎",color:"#1D9E75"},{msg:"Grosse affaire 🤑",color:"#1D9E75"},
      {msg:"Très belle vente 🚀",color:"#1D9E75"},{msg:"Belle marge 💪",color:"#1D9E75"},
      {msg:"Affaire en or 🏆",color:"#1D9E75"},{msg:"Excellent deal 🔥",color:"#1D9E75"},
      {msg:"Très bon deal ✅",color:"#1D9E75"},{msg:"Pas mal 👍",color:"#5DCAA5"},
      {msg:"Moyen, à toi de voir 🤔",color:"#F9A26C"},{msg:"Marge très faible ⚠️",color:"#F9A26C"},
      {msg:"Aucun bénéfice",color:"#6B7280"},{msg:"Légère perte 😬",color:"#E53E3E"},
      {msg:"Perte significative ❌",color:"#E53E3E"},{msg:"Grosse perte, évite 🚨",color:"#E53E3E"},
    ],
    en:[
      {msg:"Jackpot 💎",color:"#1D9E75"},{msg:"Big win 🤑",color:"#1D9E75"},
      {msg:"Great sale 🚀",color:"#1D9E75"},{msg:"Nice margin 💪",color:"#1D9E75"},
      {msg:"Golden deal 🏆",color:"#1D9E75"},{msg:"Excellent deal 🔥",color:"#1D9E75"},
      {msg:"Very good deal ✅",color:"#1D9E75"},{msg:"Not bad 👍",color:"#5DCAA5"},
      {msg:"Average, up to you 🤔",color:"#F9A26C"},{msg:"Very low margin ⚠️",color:"#F9A26C"},
      {msg:"No profit",color:"#6B7280"},{msg:"Slight loss 😬",color:"#E53E3E"},
      {msg:"Significant loss ❌",color:"#E53E3E"},{msg:"Big loss, avoid 🚨",color:"#E53E3E"},
    ]
  };
  const m=msgs[lang]||msgs.fr;
  if(marginEur>=500) return m[0];
  if(marginEur>=200) return m[1];
  if(marginEur>=100) return m[2];
  if(marginEur>=50)  return m[3];
  if(marginPct>=50)  return m[4];
  if(marginPct>=35)  return m[5];
  if(marginPct>=25)  return m[6];
  if(marginPct>=15)  return m[7];
  if(marginPct>=8)   return m[8];
  if(marginPct>=1)   return m[9];
  if(marginPct===0)  return m[10];
  if(marginPct>=-10) return m[11];
  if(marginPct>=-30) return m[12];
  return m[13];
}
// ⚠️ prix_achat_inconnu / origine / vinted_* doivent traverser ce mapping :
// la règle de comptabilisation les lit (prixAchatConnu), et l'UI s'en sert pour
// marquer « prix d'achat à compléter » sur les articles importés du dressing.
// Un champ oublié ici est un champ invisible pour toute l'app.
function mapItem(v){return{id:v.id,title:v.titre,prix_achat:v.prix_achat,buy:v.prix_achat,prix_achat_inconnu:v.prix_achat_inconnu===true,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date,date_ajout:v.created_at||v.date_achat||v.date,marque:v.marque||"",description:v.description||"",type:v.type||"Autre",
  // `type` garde son repli « Autre » : il pilote l'icône, la couleur de tuile
  // et les filtres, qui ont tous besoin d'une valeur. Mais ce repli EFFACE la
  // différence entre « non classé » et « classé Autre par l'utilisateur » —
  // or 27 articles importés du dressing ont type=NULL en base. `typeConnu`
  // conserve cette distinction pour l'AFFICHAGE, sans toucher au reste.
  typeConnu:v.type!=null&&String(v.type).trim()!=="",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,quantite:v.quantite||1,emplacement:v.emplacement||null,plateforme:v.plateforme||null,origine:v.origine||null,photos:Array.isArray(v.photos)?v.photos:null,vinted_item_id:v.vinted_item_id||null,vinted_catalog_id:v.vinted_catalog_id??null,disparu_le:v.disparu_le||null,vinted_status:v.vinted_status||null,vinted_view_count:v.vinted_view_count??null,vinted_favourite_count:v.vinted_favourite_count??null,listed_at_guess:v.listed_at_guess||null};}

function stripMarque(nom,marque){
  if(!marque)return nom;
  const escaped=marque.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const cleaned=nom.replace(new RegExp(`\\b${escaped}\\b`,'gi'),'').replace(/\s+/g,' ').trim();
  return cleaned||nom;
}
function getTypeStyle(type){
  const s={
    'Mode':          {bg:'#FDF2F8',color:'#9D174D',border:'#F9A8D4',emoji:'👗'},
    'High-Tech':     {bg:'#EFF6FF',color:'#1D4ED8',border:'#93C5FD',emoji:'📱'},
    'Maison':        {bg:'#F0FDF4',color:'#166534',border:'#86EFAC',emoji:'🏠'},
    'Jouets':        {bg:'#FFFBEB',color:'#92400E',border:'#FCD34D',emoji:'🧸'},
    'Livres':        {bg:'#FFF7ED',color:'#9A3412',border:'#FDBA74',emoji:'📚'},
    'Sport':         {bg:'#F0F9FF',color:'#0C4A6E',border:'#7DD3FC',emoji:'⚽'},
    'Auto-Moto':     {bg:'#F8FAFC',color:'#334155',border:'#94A3B8',emoji:'🚗'},
    'Beauté':        {bg:'#FFF1F2',color:'#9F1239',border:'#FDA4AF',emoji:'💄'},
    'Musique':       {bg:'#F5F3FF',color:'#5B21B6',border:'#C4B5FD',emoji:'🎵'},
    'Collection':    {bg:'#FEFCE8',color:'#854D0E',border:'#FDE047',emoji:'🏆'},
    'Électroménager':{bg:'#ECFDF5',color:'#065F46',border:'#6EE7B7',emoji:'⚡'},
    'Luxe':          {bg:'#FDF8F0',color:'#92400E',border:'#F59E0B',emoji:'💎'},
    'Multimédia':    {bg:'#F3E8FF',color:'#6B21A8',border:'#D8B4FE',emoji:'📺'},
    'Jardin':        {bg:'#ECFDF5',color:'#14532D',border:'#4ADE80',emoji:'🌿'},
    'Bricolage':     {bg:'#FFF7ED',color:'#C2410C',border:'#FB923C',emoji:'🔧'},
    'Autre':         {bg:'#F9FAFB',color:'#6B7280',border:'#D1D5DB',emoji:'📦'},
  };
  if(s[type]) return s[type];
  const key=Object.keys(s).find(k=>k.toLowerCase()===(type||"").toLowerCase());
  return key?s[key]:s['Autre'];
}
const TYPE_LABELS_EN={'High-Tech':'High-Tech','Mode':'Fashion','Luxe':'Luxury','Maison':'Home','Électroménager':'Appliances','Jouets':'Toys','Livres':'Books','Sport':'Sport','Auto-Moto':'Vehicles','Beauté':'Beauty','Musique':'Music','Collection':'Collection','Multimédia':'Multimedia','Jardin':'Garden','Bricolage':'DIY','Autre':'Other'};
function typeLabel(type,lang){return lang==='en'?(TYPE_LABELS_EN[type]||type):type;}
function marqueLabel(m,lang){return(lang==='en'&&m?.toLowerCase()==='sans marque')?'Unbranded':m;}

const DEAL_PLACEHOLDERS_FR = [
  "C'est quoi la marge si j'achète un iPhone 13 85€ et je le revends 150€ ?",
  "J'ai trouvé une perceuse Makita à 45€, bon deal ?",
  "À combien je devrais vendre ce sac Zara acheté 12€ ?",
  "Vaut mieux vendre sur Vinted ou eBay pour du High-Tech ?",
  "J'ai acheté 20 paquets Pokémon 8€, je les revends 3€ chacun, c'est rentable ?",
];
const DEAL_PLACEHOLDERS_EN = [
  "What's my margin if I buy an iPhone 13 for €85 and sell it for €150?",
  "Found a Makita drill for €45, good deal?",
  "How much should I sell this Zara bag I bought for €12?",
  "Better to sell on Vinted or eBay for electronics?",
  "I bought 20 Pokémon packs for €8, selling them at €3 each — profitable?",
];

const LENS_PLACEHOLDERS_FR = [
  "Taille M, bon état, quelques traces d'usure...",
  "Neuf avec étiquette, jamais porté...",
  "Écran fissuré, fonctionne parfaitement...",
  "Lot de 3, emballage d'origine...",
  "Vintage années 90, couleur originale...",
  "Acheté 150€, porté 2 fois...",
  "Manque le chargeur, batterie 85%...",
  "Taille unique, coloris rare...",
];
const LENS_PLACEHOLDERS_EN = [
  "Size M, good condition, some signs of wear...",
  "Brand new with tag, never worn...",
  "Cracked screen, works perfectly...",
  "Lot of 3, original packaging...",
  "Vintage 90s, original color...",
  "Bought for €150, worn twice...",
  "Missing charger, battery 85%...",
  "One size, rare colorway...",
];

const VOICE_EXAMPLES_FR_RAW = [
  { text: "Ajoute une veste Zara noire taille M à 15€",          tag: "Ajouter", cls: "add"   },
  { text: "Nouveau article : iPhone 13 128Go, payé 320€",        tag: "Ajouter", cls: "add"   },
  { text: "J'ai acheté un sac Longchamp beige pour 25€",         tag: "Ajouter", cls: "add"   },
  { text: "Ajoute un MacBook Air 2020 à 450€",                   tag: "Ajouter", cls: "add"   },
  { text: "J'ai vendu mon jean Levi's 501 à 40€",                tag: "Vendre",  cls: "sell"  },
  { text: "Vendu l'iPhone 12 à 280€ sur Leboncoin",              tag: "Vendre",  cls: "sell"  },
  { text: "Ajoute un lot de 5 t-shirts à 3€ pièce",             tag: "Ajouter", cls: "add"   },
  { text: "Déplace le MacBook dans le carton salon",             tag: "Stock",   cls: "query" },
  { text: "Combien j'ai vendu ce mois-ci ?",                     tag: "Stats",   cls: "query" },
  { text: "Quel est mon bénéfice total ?",                       tag: "Stats",   cls: "query" },
];
// Seule la liste FR sert encore : elle alimente TEXTAREA_PLACEHOLDERS (rotation du
// placeholder de la zone vocale). Le pendant EN et le getRotatingExamples local ne
// servaient qu'au VoiceTicker de l'ancien état vide — StockTab utilise, lui, le
// getRotatingExamples exporté par utils/shared.js.
const VOICE_EXAMPLES = VOICE_EXAMPLES_FR_RAW;

function getRotatingDealPlaceholders(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? DEAL_PLACEHOLDERS_EN : DEAL_PLACEHOLDERS_FR;
  if (sym === '€') return raw;
  return raw.map(t => t.replace(/€/g, sym));
}
function getRotatingLensPlaceholders(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? LENS_PLACEHOLDERS_EN : LENS_PLACEHOLDERS_FR;
  if (sym === '€') return raw;
  return raw.map(t => t.replace(/€/g, sym));
}

const SKELETON_ITEMS=[
  {title:'Veste Zara oversize',  type:'Mode',       marque:'Zara',    buy:12,  qty:1,  days:2},
  {title:'Lot Pokémon x20',      type:'Collection', marque:'Pokémon', buy:8,   qty:20, days:null},
  {title:'iPhone 12 64Go',       type:'High-Tech',  marque:'Apple',   buy:180, qty:1,  days:5},
  {title:'Sac Kelly Hermès',     type:'Mode',       marque:'Hermès',  buy:125, qty:1,  days:1},
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15,  qty:1,  days:null},
];
const SKELETON_SOLD=[
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15, sell:38, margin:23, marginPct:61},
  {title:'Perceuse Makita 18V',  type:'High-Tech',  marque:'Makita',  buy:45, sell:89, margin:44, marginPct:49},
  {title:'Paquet Pokémon ×5',    type:'Collection', marque:'Pokémon', buy:2,  sell:15, margin:13, marginPct:87},
];
const TEXTAREA_PLACEHOLDERS=VOICE_EXAMPLES.map(e=>e.text);
// ⚠️ marginPct : `(v.benefice/v.prix_vente)*100` avec un benefice NULL rendait
// **0**, pas null — en JS `null/250` vaut 0. Une vente au prix d'achat inconnu
// sortait donc avec « 0 % de marge », un chiffre que rien n'a jamais calculé, et
// qui tirait vers le bas toutes les moyennes qui lisent marginPct (les quatre
// agrégations de graphe plus bas le faisaient). `margin` était déjà correct
// (null tel quel), c'est le pourcentage qui mentait. Corrigé le 11/08.
function mapSale(v){return{id:v.id,title:v.titre,prix_vente:v.prix_vente,buy:v.prix_achat,sell:v.prix_vente,inventaire_id:v.inventaire_id??null,ship:0,margin:v.benefice,marginPct:(v.benefice==null||!(v.prix_vente>0))?null:(v.benefice/v.prix_vente)*100,date:v.date,date_vente:v.date||v.created_at,marque:v.marque||"",type:v.type||"",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,description:v.description||null,emplacement:v.emplacement||null,plateforme:v.plateforme||null,quantite:v.quantite||null};}

// Groups consecutive rows with same title+date+sell price into one display row
function groupSales(arr){
  const groups=[];
  for(const s of arr){
    if(s.quantite!=null){
      groups.push({...s,_qty:s.quantite});
      continue;
    }
    const last=groups[groups.length-1];
    if(last&&last.quantite==null&&last.title===s.title&&last.marque===s.marque&&last.date===s.date&&Math.abs((last.sell||0)-(s.sell||0))<0.01){
      last._qty=(last._qty||1)+1;
      // Regrouper N ventes identiques ne doit pas FABRIQUER une marge : si l'une
      // des lignes n'a pas de prix d'achat, la marge du groupe est inconnue
      // (l'ancien `(last.margin||0)+(s.margin||0)` la transformait en somme
      // partielle présentée comme un total).
      const marges=[last.margin,s.margin];
      last.margin=marges.some(m=>m==null)?null:marges.reduce((a,m)=>a+m,0);
      last.marginPct=last.margin!=null&&(last.sell||0)>0?(last.margin/(last.sell*last._qty))*100:null;
    }else{
      groups.push({...s,_qty:1});
    }
  }
  return groups;
}

function getFilteredData_unused(range, salesData){
  const now=new Date();
  const hasSales=salesData.length>0;

  // ── helpers réels ──
  // Agrégat d'un seau de ventes (2026-08-11). Les quatre fonctions ci-dessous
  // faisaient toutes `ds.reduce((a,s)=>a+s.margin,0)` et
  // `ds.reduce((a,s)=>a+s.marginPct,0)/ds.length` sur TOUTES les ventes du seau.
  // Deux erreurs distinctes :
  //   · `a + null` vaut a en JS : une marge inconnue passait pour 0 € ;
  //   · le dénominateur restait `ds.length`, donc les ventes sans prix d'achat
  //     comptaient au diviseur sans rien apporter au numérateur — la marge
  //     moyenne du jour tombait mécaniquement à chaque vente non complétée.
  // On agrège désormais sur les seules ventes comptabilisables. `count` reste
  // le nombre TOTAL de ventes du seau : une vente sans prix d'achat est bien
  // une vente, elle compte au volume, pas à la marge.
  function agregeSeau(liste,nom){
    const retenues=comptabilisables(liste);
    return{
      name:nom,
      profit:retenues.reduce((a,s)=>a+(s.margin||0),0),
      'Marge %':retenues.length?retenues.reduce((a,s)=>a+(s.marginPct||0),0)/retenues.length:null,
      count:liste.length,
    };
  }
  function dayBucket(days){
    return Array.from({length:days},(_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-days+1+i);
      const dayStr=d.toISOString().split('T')[0];
      const ds=salesData.filter(s=>(s.date||'').startsWith(dayStr));
      return agregeSeau(ds,`${d.getDate()}/${d.getMonth()+1}`);
    });
  }
  function weekBucket(totalDays,numWeeks){
    const cutoff=new Date(now); cutoff.setDate(now.getDate()-totalDays+1);
    const filtered=salesData.filter(s=>new Date(s.date)>=cutoff);
    return Array.from({length:numWeeks},(_,i)=>{
      const start=new Date(cutoff); start.setDate(cutoff.getDate()+i*7);
      const end=new Date(start); end.setDate(start.getDate()+6);
      const ws=filtered.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
      return agregeSeau(ws,`S${i+1}`);
    });
  }
  function monthBucket(pts){
    return Array.from({length:pts},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(pts-1-i),1);
      const m=d.getMonth(); const y=d.getFullYear();
      const ms=salesData.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
      return agregeSeau(ms,MONTHS_FR[m]);
    });
  }
  function ytdBucket(){
    const n=now.getMonth()+1;
    return Array.from({length:n},(_,i)=>{
      const ms=salesData.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===i&&sd.getFullYear()===now.getFullYear();});
      return agregeSeau(ms,MONTHS_FR[i]);
    });
  }

  // ── données réelles ──
  if(hasSales){
    switch(range){
      case '7j':  return dayBucket(7);
      case '1M':  return dayBucket(30);
      case '3M':  return weekBucket(91,13);
      case '6M':  return monthBucket(6);
      case 'YTD': return ytdBucket();
      default:    return monthBucket(6);
    }
  }

  // ── mock réaliste si aucune vente ──
  const sin=(i,a,b,p)=>Math.round((a+Math.sin(i/p*Math.PI*2)*b)*10)/10;
  switch(range){
    case '7j': return Array.from({length:7},(_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-6+i);
      const p=[0,4.5,0,6.8,2.5,0,9.2][i];
      return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:p,'Marge %':p?[null,34,null,30,38,null,43][i]:null,count:p?1:0};
    });
    case '1M': return Array.from({length:30},(_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-29+i);
      const p=i%4===0?0:Math.max(0,sin(i,12,9,30)+i*0.4);
      return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:Math.round(p*10)/10,'Marge %':p?Math.round(32+Math.sin(i/5)*8):null,count:p?1:0};
    });
    case '3M': return Array.from({length:13},(_,i)=>({
      name:`S${i+1}`,
      profit:Math.round((14+Math.sin(i/3)*10+i*2.2)*10)/10,
      'Marge %':Math.round(31+Math.sin(i/2.5)*9+i*0.8),
      count:Math.ceil((i+1)/3),
    }));
    case '6M': return Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
      return{name:MONTHS_FR[d.getMonth()],profit:[22,18,35,28,44,52][i],'Marge %':[33,29,38,35,42,47][i],count:[3,2,4,3,5,6][i]};
    });
    case 'YTD': {
      const n=now.getMonth()+1;
      const ps=[18,25,32,28,41,35,48,38,55,44,60,52];
      const ms=[30,34,38,35,42,39,45,41,48,44,51,47];
      return Array.from({length:n},(_,i)=>({name:MONTHS_FR[i],profit:ps[i],'Marge %':ms[i],count:i+2}));
    }
    default: return Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
      return{name:MONTHS_FR[d.getMonth()],profit:[22,18,35,28,44,52][i],'Marge %':[33,29,38,35,42,47][i],count:[3,2,4,3,5,6][i]};
    });
  }
}

function renderMd(text){
  const html=text
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br/>');
  return{__html:html};
}



function DonutChart({segments, totalLabel, totalValue}){
  const r = 56, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  const GAP = 2;
  let offset = 0;
  return (
    <div className="donut-svg">
      <svg width={140} height={140} viewBox="0 0 140 140">
        <g transform="rotate(-90 70 70)">
          <circle className="track" cx={cx} cy={cy} r={r} />
          {segments.map((s, i) => {
            const dash = Math.max(0, (s.pct / 100) * circ - GAP);
            const gap = circ - dash;
            const el = (
              <circle
                key={i}
                className="seg"
                cx={cx}
                cy={cy}
                r={r}
                stroke={s.color}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                style={{ animation: `legendGrow 0.9s cubic-bezier(0.65,0,0.35,1) ${0.1 + i * 0.08}s both` }}
              />
            );
            offset += dash + GAP;
            return el;
          })}
        </g>
      </svg>
      {totalValue !== undefined && (
        <div className="center-stack" style={{overflow:'hidden'}}>
          <div className="lbl">{totalLabel || 'Total'}</div>
          <div className="v" style={{
            fontSize:String(totalValue).length<=8?'1.1rem':String(totalValue).length<=11?'0.85rem':String(totalValue).length<=14?'0.7rem':'0.58rem',
            wordBreak:'break-all',overflow:'hidden',lineHeight:1.1,textAlign:'center',maxWidth:'90%'
          }}>{totalValue}</div>
        </div>
      )}
    </div>
  );
}

function ActivityCurve({sales, lang, currency='EUR'}){
  const [hover, setHover] = useState(null);
  const W = 320, H = 130, P = 8;

  const days = useMemo(() => {
    const now = new Date();
    return Array.from({length: 84}, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (83 - i));
      const key = d.toISOString().slice(0, 10);
      const dayProfit = sales
        .filter(s => (s.created_at || s.date || '').slice(0,10) === key)
        .reduce((a, s) => a + (s.margin || 0), 0);
      return { date: d, key, profit: dayProfit };
    });
  }, [sales]);

  const max = Math.max(1, ...days.map(d => d.profit));
  const min = Math.min(0, ...days.map(d => d.profit));
  const total = days.reduce((a, d) => a + d.profit, 0);

  const pts = days.map((d, i) => [
    P + (i / (days.length - 1)) * (W - 2*P),
    H - P - ((d.profit - min) / (max - min || 1)) * (H - 2*P)
  ]);
  const path = pts.reduce((acc, [x,y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i-1];
    const cx = (px + x) / 2;
    return `${acc} Q${px},${py} ${cx},${(py+y)/2} T${x},${y}`;
  }, '');
  const area = `${path} L${pts[pts.length-1][0]},${H-P} L${pts[0][0]},${H-P} Z`;

  const fmtDate = d => d.toLocaleDateString(lang==='en'?'en-US':'fr-FR', {day:'numeric',month:'short'});
  const fmtMoney = n => formatCurrency(n, currency);

  const handleMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(0, Math.min(days.length-1,
      Math.round(((x - P) / (W - 2*P)) * (days.length - 1))));
    setHover({idx, ...days[idx], px: pts[idx][0], py: pts[idx][1]});
  };

  return (
    <div className="activity-curve-card">
      <div className="activity-curve-head">
        <div>
          <div className="t">{lang==='en'?'Activity':'Activité'}</div>
          <div className="sub">{lang==='en'?'Last 84 days':'84 derniers jours'}</div>
        </div>
        <div className="total">{fmtMoney(total)}</div>
      </div>
      <div style={{position:'relative'}}>
        <svg
          className="activity-curve-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={handleMove}
          onMouseLeave={()=>setHover(null)}
        >
          <defs>
            <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1D9E75" stopOpacity="0.30"/>
              <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path className="ac-area" d={area}/>
          <path className="ac-line" d={path}/>
          {hover && (
            <>
              <line className="ac-crosshair" x1={hover.px} y1={P} x2={hover.px} y2={H-P}/>
              <circle className="ac-dot" cx={hover.px} cy={hover.py} r={5}/>
            </>
          )}
        </svg>
        {hover && (
          <div className="ac-tooltip" style={{left: `${(hover.px/W)*100}%`, top: `${(hover.py/H)*100}%`}}>
            <div className="v">{fmtMoney(hover.profit)}</div>
            <div className="d">{fmtDate(hover.date)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function AvgDaysChart({filtered, items, lang}) {
  const itemDateMap = useMemo(() => {
    const m = {};
    items.forEach(i => { if (i.title && (i.date_ajout || i.created_at)) m[i.title.toLowerCase().trim()] = i.date_ajout || i.created_at; });
    return m;
  }, [items]);

  const catDays = useMemo(() => {
    const acc = {};
    filtered.forEach(s => {
      const key = s.title?.toLowerCase().trim();
      const purchaseDate = key && itemDateMap[key];
      if (!purchaseDate || !s.date) return;
      const diff = Math.max(0, Math.round((new Date(s.date) - new Date(purchaseDate)) / 86400000));
      const cat = normalizeCat(s.type || s.categorie || '');
      if (!acc[cat]) acc[cat] = {total:0, count:0};
      acc[cat].total += diff;
      acc[cat].count++;
    });
    return Object.entries(acc)
      .map(([cat, {total, count}]) => ({cat, avg: Math.round(total / count)}))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 7);
  }, [filtered, itemDateMap]);

  const maxAvg = Math.max(...catDays.map(d => d.avg), 1);
  const card = {background:'#fff',borderRadius:14,padding:'16px',border:'1px solid rgba(0,0,0,0.06)',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'};

  return (
    <div style={card}>
      <div style={{fontSize:12,fontWeight:700,color:'#0D0D0D',marginBottom:14}}>
        {lang==='en'?'⏱ Avg. days to sell by category':'⏱ Délai moy. vente par catégorie'}
      </div>
      {catDays.length===0?(
        <div style={{fontSize:12,color:'#A3A9A6',fontWeight:600,fontStyle:'italic',textAlign:'center',padding:'12px 0'}}>
          {lang==='en'?'Will appear after your first sales':'Apparaîtra après tes premières ventes'}
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {catDays.map(({cat, avg}) => {
            const ts = getTypeStyle(cat);
            const pct = (avg / maxAvg) * 100;
            return (
              <div key={cat} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:82,flexShrink:0,fontSize:11,fontWeight:700,color:ts.color,textAlign:'right',whiteSpace:'nowrap'}}>
                  {ts.emoji} {cat}
                </div>
                <div style={{flex:1,height:8,background:'#F3F4F6',borderRadius:99,overflow:'hidden'}}>
                  <div style={{width:`${pct}%`,height:'100%',background:ts.color,borderRadius:99,transition:'width 0.6s cubic-bezier(0.4,0,0.2,1)'}}/>
                </div>
                <div style={{width:32,flexShrink:0,fontSize:11,fontWeight:700,color:'#0D0D0D',textAlign:'right'}}>
                  {avg}{lang==='en'?'d':'j'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// État vide du Dashboard — design Claude Design « Dashboard Empty State »
// (projet e47b36df, 2026-07-14). Header / FAB / nav bar restent ceux de l'app.
// Logos plateformes : PlatformLogo (vraies icônes d'app), pas les pastilles
// lettrées de la maquette. Le bloc Lens navigue vers l'onglet Lens (tab 2)
// via le même mécanisme que la nav bar (onOpenLens branché sur setTab).
function EmptyStateDashboard({ lang, onImport, onOpenLens, extensionAbsente = false, onExtensionInfo = null }) {
  const fr = lang !== 'en';
  const MicSvg = ({ size=34, stroke="#fff" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
  );
  const CARDS = [
    {
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6"/><path d="M16 12h-6"/><path d="M12 16h-2"/></svg>,
      titleFr:"Enregistre tes ventes", titleEn:"Log your sales",
      descFr:"Dis « vendu 25 € », ta marge se calcule toute seule.", descEn:"Say “sold for €25” — your margin computes itself.",
    },
    {
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,
      titleFr:"Suis tes stats", titleEn:"Track your stats",
      descFr:"Profit net, marges et évolution du mois, en un coup d'œil.", descEn:"Net profit, margins and monthly trend, at a glance.",
    },
    {
      icon:<MicSvg size={20} stroke="currentColor"/>,
      titleFr:"Ajoute ton stock à la voix", titleEn:"Add your stock by voice",
      descFr:"Dis « pull Zara taille M, 15 € », c'est ajouté et classé.", descEn:"Say “Zara sweater size M, €15” — added and sorted.",
    },
    {
      icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>,
      // Lot 2 : le retrait n'est jamais « tout seul » — détection automatique,
      // retrait SUR CONFIRMATION (pending_removal + bandeau). Même discours
      // que la landing depuis le lot 1.
      titleFr:"Vendu quelque part ? Tu retires les autres en un tap", titleEn:"Sold somewhere? Remove the others in one tap",
      descFr:"Vendu sur Vinted ? FillSell te prévient — tu retires Leboncoin, eBay et Beebs en un tap.", descEn:"Sold on Vinted? FillSell lets you know — you remove Leboncoin, eBay and Beebs in one tap.",
    },
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,fontFamily:"'Space Grotesk',sans-serif"}}>
      <style>{`
        @keyframes fsPulse{0%{transform:scale(1);opacity:.4}100%{transform:scale(2.05);opacity:0}}
        @keyframes fsScan{0%,100%{transform:translateY(-44px)}50%{transform:translateY(44px)}}
      `}</style>

      {/* Hero micro — badge stock vide + exemple + mini-input vocal */}
      <section style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:26,padding:"30px 22px 22px",textAlign:"center",position:"relative",overflow:"hidden",boxShadow:"0 1px 3px rgba(16,32,27,0.04), 0 12px 30px rgba(16,32,27,0.05)"}}>
        <div style={{position:"absolute",top:-46,left:"50%",transform:"translateX(-50%)",width:240,height:190,background:"radial-gradient(ellipse at center,rgba(47,158,144,0.14),transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 11px",borderRadius:999,background:"rgba(232,149,109,0.16)",marginBottom:18}}>
            <span style={{width:6,height:6,borderRadius:99,background:UI.amber}}/>
            <span style={{fontWeight:700,fontSize:10.5,letterSpacing:"0.1em",color:"#C46A3E",whiteSpace:"nowrap"}}>{fr?"STOCK VIDE · À TOI DE JOUER":"EMPTY STOCK · YOUR MOVE"}</span>
          </div>
          {/* Lot 2 : le hero dit CE QUE FAIT le produit et propose les deux
              premiers gestes (importer / ajouter par photo). Le vocal reste
              accessible par le FAB micro et la carte plus bas — mais ce n'est
              plus lui, l'entrée en matière. */}
          <div style={{position:"relative",width:80,height:80,margin:"0 auto 20px"}}>
            <span style={{position:"absolute",inset:0,borderRadius:24,background:"rgba(47,158,144,0.28)",animation:"fsPulse 2.6s ease-out infinite"}}/>
            <span style={{position:"absolute",inset:0,borderRadius:24,background:"rgba(47,158,144,0.28)",animation:"fsPulse 2.6s ease-out infinite",animationDelay:"1.3s"}}/>
            <div style={{position:"relative",width:80,height:80,borderRadius:24,background:`linear-gradient(150deg,${UI.teal},${UI.tealDeep})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 10px 24px rgba(27,110,98,0.35)"}}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>
            </div>
          </div>
          {/* Titre remis à jour le 2026-08-09. L'ancien (« Publie tes articles
              sur Vinted, Leboncoin, eBay et Beebs sans les saisir quatre
              fois. ») disait mot pour mot ce que le bandeau « PUBLIÉ
              AUTOMATIQUEMENT SUR » + les quatre logos disent déjà, à deux
              centimètres en dessous : le premier écran vendait donc une seule
              chose, deux fois. Il vend maintenant les deux promesses qui
              n'étaient nulle part — la synchro du dressing Vinted (le premier
              geste, celui du bouton juste dessous) et la marge (la raison pour
              laquelle on tient un stock). Le cross-posting reste vendu par le
              bandeau, avec ses logos. */}
          <h1 style={{margin:0,fontWeight:700,fontSize:25,lineHeight:1.2,letterSpacing:"-0.02em",color:UI.ink}}>
            {fr?"Ton dressing Vinted arrive ici en un clic — et tu sais enfin ce que chaque vente te rapporte.":"Your Vinted closet lands here in one click — and you finally know what each sale earns you."}
          </h1>
          <button
            onClick={onImport}
            style={{marginTop:20,width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:9,padding:15,border:"none",borderRadius:16,background:`linear-gradient(135deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontWeight:700,fontSize:15,fontFamily:"inherit",boxShadow:"0 8px 20px rgba(27,110,98,0.3)",cursor:"pointer"}}
          >
            {/* Le MÊME libellé que la carte de la page Stock, où ce bouton
                envoie (2026-08-09) : trois mots différents pour une seule
                action — importer / synchroniser / actualiser — faisaient
                croire à trois fonctions. Partout : « synchroniser ». */}
            {fr?"Synchroniser mon dressing Vinted":"Sync my Vinted closet"}
          </button>
          <button
            onClick={onOpenLens}
            style={{marginTop:10,width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:9,padding:14,borderRadius:16,background:UI.canvas,border:`1px solid ${UI.border}`,color:UI.ink,fontWeight:700,fontSize:14,fontFamily:"inherit",cursor:"pointer"}}
          >
            {fr?"Ajouter mon premier article":"Add my first item"}
          </button>
        </div>
      </section>

      {/* Bandeau plateformes — vraies icônes d'app (PlatformLogo) */}
      <div style={{textAlign:"center",padding:"2px 4px 0"}}>
        <p style={{margin:0,fontWeight:700,fontSize:10.5,letterSpacing:"0.14em",color:"#A39D8E"}}>{fr?"PUBLIÉ AUTOMATIQUEMENT SUR":"AUTOMATICALLY PUBLISHED ON"}</p>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:12,marginTop:14}}>
          {["vinted","leboncoin","ebay","beebs"].map(p=>(
            <span key={p} style={{display:"inline-flex",borderRadius:10,boxShadow:"0 2px 6px rgba(16,32,27,0.09)"}}>
              <PlatformLogo platform={p} size={36}/>
            </span>
          ))}
        </div>
        <p style={{margin:"12px auto 0",maxWidth:288,fontSize:12.5,lineHeight:1.45,color:UI.mute,fontWeight:400}}>
          {fr?"Une annonce, publiée partout. Dès que tu confirmes une vente, ton stock, tes ventes et tes marges se mettent à jour.":"One listing, published everywhere. As soon as you confirm a sale, your stock, sales and margins are updated."}
        </p>
      </div>

      {/* Bloc Lens — cliquable, navigue vers l'onglet Lens (même mécanisme que la nav) */}
      <section
        onClick={onOpenLens}
        role="button"
        style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:26,overflow:"hidden",boxShadow:"0 1px 3px rgba(16,32,27,0.04), 0 12px 30px rgba(16,32,27,0.05)",cursor:"pointer"}}
      >
        <div style={{position:"relative",height:152,background:"linear-gradient(150deg,#123027,#1B6E62)",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{position:"absolute",top:12,left:12,display:"flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:8,background:"rgba(255,255,255,0.16)",fontWeight:700,fontSize:10,letterSpacing:"0.12em",color:"#fff"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="14.31" y1="8" x2="20.05" y2="17.94"/><line x1="9.69" y1="8" x2="21.17" y2="8"/><line x1="7.38" y1="12" x2="13.12" y2="2.06"/><line x1="9.69" y1="16" x2="3.95" y2="6.06"/><line x1="14.31" y1="16" x2="2.83" y2="16"/><line x1="16.62" y1="12" x2="10.88" y2="21.94"/></svg>
            LENS
          </span>
          <div style={{position:"relative",width:104,height:104}}>
            <span style={{position:"absolute",top:0,left:0,width:22,height:22,borderTop:"3px solid #8CE0D4",borderLeft:"3px solid #8CE0D4",borderTopLeftRadius:8}}/>
            <span style={{position:"absolute",top:0,right:0,width:22,height:22,borderTop:"3px solid #8CE0D4",borderRight:"3px solid #8CE0D4",borderTopRightRadius:8}}/>
            <span style={{position:"absolute",bottom:0,left:0,width:22,height:22,borderBottom:"3px solid #8CE0D4",borderLeft:"3px solid #8CE0D4",borderBottomLeftRadius:8}}/>
            <span style={{position:"absolute",bottom:0,right:0,width:22,height:22,borderBottom:"3px solid #8CE0D4",borderRight:"3px solid #8CE0D4",borderBottomRightRadius:8}}/>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.32)"}}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>
            </div>
            <span style={{position:"absolute",left:-12,right:-12,top:"50%",height:2,background:"linear-gradient(90deg,transparent,#8CE0D4,transparent)",boxShadow:"0 0 12px #8CE0D4",animation:"fsScan 2.8s ease-in-out infinite"}}/>
          </div>
          <span style={{position:"absolute",bottom:12,left:0,right:0,textAlign:"center",fontWeight:600,fontSize:11,color:"rgba(255,255,255,0.68)",letterSpacing:"0.03em"}}>{fr?"Vise un article à analyser":"Point at an item to analyze"}</span>
        </div>
        <div style={{padding:"20px 22px 22px"}}>
          <h2 style={{margin:0,fontWeight:700,fontSize:20,letterSpacing:"-0.01em",color:UI.ink}}>{fr?"Bon deal ou pas ? Lens tranche.":"Good deal or not? Lens decides."}</h2>
          <p style={{margin:"10px 0 0",fontSize:14.5,lineHeight:1.55,color:UI.mute,fontWeight:400}}>
            {fr
              // Lot 2 : plus de « note sur 10 » — le deal score a été retiré de
              // Lens (AnalyseMarche.jsx), le verdict réel est prix + plateforme.
              ? <>Prends un article en photo : l'IA l'identifie, estime <span style={{color:UI.tealDeep,fontWeight:600}}>son prix de revente</span> et la meilleure plateforme pour le revendre.</>
              : <>Snap a photo of an item: the AI identifies it, estimates <span style={{color:UI.tealDeep,fontWeight:600}}>its resale price</span> and the best marketplace to sell it on.</>
            }
          </p>
          <button
            onClick={(e)=>{e.stopPropagation();onOpenLens?.();}}
            style={{marginTop:18,width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:9,padding:15,border:"none",borderRadius:16,background:`linear-gradient(135deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontWeight:700,fontSize:15,fontFamily:"inherit",boxShadow:"0 8px 20px rgba(27,110,98,0.3)",cursor:"pointer"}}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9z"/><path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>
            {fr?"Analyser avec l'IA":"Analyze with AI"}
          </button>
        </div>
      </section>

      {/* Grille 2x2 — 4 promesses produit */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {CARDS.map((c,i)=>(
          <div key={i} style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:20,padding:16,boxShadow:"0 1px 3px rgba(16,32,27,0.04)"}}>
            <div style={{width:38,height:38,borderRadius:12,background:"rgba(47,158,144,0.12)",display:"flex",alignItems:"center",justifyContent:"center",color:UI.tealDeep,marginBottom:12}}>
              {c.icon}
            </div>
            <h3 style={{margin:0,fontWeight:700,fontSize:14.5,color:UI.ink}}>{fr?c.titleFr:c.titleEn}</h3>
            <p style={{margin:"6px 0 0",fontSize:12.5,lineHeight:1.45,color:UI.mute,fontWeight:400}}>{fr?c.descFr:c.descEn}</p>
          </div>
        ))}
      </div>

      {/* Ligne discrète, non bloquante (lot 2) : l'extension n'a jamais été vue
          sur ce compte — on le dit sans en faire un mur, avec le lien qui va bien. */}
      {extensionAbsente&&(
        <p style={{margin:"2px 4px 0",fontSize:12,lineHeight:1.5,color:UI.mute,fontWeight:500,textAlign:"center"}}>
          {fr
            ?"L'extension n'est pas encore installée sur ton ordinateur — c'est elle qui publie pour toi. "
            :"The extension isn't installed on your computer yet — it's what publishes for you. "}
          <button onClick={onExtensionInfo} style={{background:"none",border:"none",padding:0,fontSize:12,fontWeight:700,color:UI.tealDeep,textDecoration:"underline",cursor:"pointer",fontFamily:"inherit"}}>
            {fr?"Installer":"Install"}
          </button>
        </p>
      )}
    </div>
  );
}

// tier : la MÊME modale sert aux TROIS paliers (setShowPremiumWelcome est
// appelé pour Premium, Pro et Business). Tant qu'elle n'affichait aucun
// chiffre, la confusion était sans conséquence ; depuis qu'elle annonce un
// nombre de Pépites, elle DOIT savoir lequel a été acheté.
function PremiumWelcomeModal({ lang, onClose, tier = 'premium' }) {
  const pro = tier === 'pro';
  const business = tier === 'business';
  // Montants pris dans COIN_CONFIG_FALLBACK, la MÊME constante de repli que les
  // cartes de plan (ConversionModal) — et non plus deux nombres écrits à la
  // main ici. Ils y étaient restés à 150/600 alors que coin_config vaut
  // 400/1200 depuis la grille du 2026-08-08 : cette modale annonçait donc, à
  // chaque achat, moins de Pépites que ce qui était réellement crédité.
  // ⚠️ coin_config reste la SOURCE. Ce composant s'affiche dans la seconde qui
  // suit l'achat, sans requête — d'où la constante partagée plutôt qu'une
  // lecture réseau ; toute divergence se corrige DANS COIN_CONFIG_FALLBACK,
  // jamais ici.
  const pepites = business
    ? COIN_CONFIG_FALLBACK.monthly_grant_business
    : pro ? COIN_CONFIG_FALLBACK.monthly_grant_pro : COIN_CONFIG_FALLBACK.monthly_grant_premium;
  const PERKS = lang === 'en'
    ? [
        { icon: '🎙️', label: 'AI Voice — Unlimited' },
        { icon: '🪙', label: `${pepites} Nuggets included every month` },
        { icon: '📸', label: 'AI Lens — 6 Nuggets per scan · live market price' },
        { icon: '📦', label: 'Unlimited stock' },
        { icon: '📊', label: 'Advanced AI-powered stats' },
        { icon: '📤', label: 'Import / Export Excel' },
      ]
    : [
        { icon: '🎙️', label: 'IA vocale — Illimité' },
        { icon: '🪙', label: `${pepites} Pépites offertes chaque mois` },
        { icon: '📸', label: 'Lens IA — 6 Pépites par scan · prix marché en direct' },
        { icon: '📦', label: 'Stock illimité' },
        { icon: '📊', label: 'Stats avancées analysées par IA' },
        { icon: '📤', label: 'Import / Export Excel' },
      ];
  // ⚠️ Business testé AVANT Pro (flags cumulatifs) — sinon un achat Business
  // affiche « Bienvenue dans FillSell Pro » juste après le paiement.
  const nomPalier = business ? 'Business' : pro ? 'Pro' : 'Premium';
  const title = lang === 'en'
    ? `Welcome to FillSell ${nomPalier}`
    : `Bienvenue dans FillSell ${nomPalier}`;
  const subtitle = lang === 'en'
    ? 'Your benefits are active right now'
    : 'Tes avantages sont actifs dès maintenant';
  const cta = lang === 'en' ? '🚀 Start selling' : '🚀 Commencer à vendre';
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:10100,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',animation:'fadeInOverlay 0.25s ease'}}>
      <style>{`
        @keyframes fadeInOverlay{from{opacity:0}to{opacity:1}}
        @keyframes welcomeCardIn{from{opacity:0;transform:scale(0.82) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes crownPop{0%{transform:scale(0) rotate(-15deg)}60%{transform:scale(1.2) rotate(6deg)}100%{transform:scale(1) rotate(0deg)}}
      `}</style>
      <div onClick={e=>e.stopPropagation()} style={{background:'#F2F2EE',borderRadius:28,width:'100%',maxWidth:360,overflow:'hidden',boxShadow:'0 24px 60px rgba(0,0,0,0.25)',animation:'welcomeCardIn 0.35s cubic-bezier(0.22,1,0.36,1)'}}>
        <div style={{background:'linear-gradient(135deg,#2F9E90,#E8956D)',padding:'32px 24px 28px',textAlign:'center',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 20% 0%,rgba(255,255,255,0.2),transparent 55%)',pointerEvents:'none'}}/>
          <div style={{fontSize:44,lineHeight:1,marginBottom:12,display:'inline-block',animation:'crownPop 0.5s cubic-bezier(0.22,1,0.36,1) 0.2s both'}}>
            ⭐
          </div>
          <div style={{fontSize:22,fontWeight:600,color:'#fff',letterSpacing:'-0.03em',lineHeight:1.25,marginBottom:8}}>{title}</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.88)',fontWeight:600}}>{subtitle}</div>
        </div>
        <div style={{padding:'20px 20px 0',display:'flex',flexDirection:'column',gap:8}}>
          {PERKS.map(({icon,label},i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',background:'#fff',borderRadius:14,border:'1px solid rgba(47,158,144,0.15)',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <span style={{fontSize:18,flexShrink:0}}>{icon}</span>
              <span style={{fontSize:13,fontWeight:700,color:UI.ink,lineHeight:1.3,flex:1}}>{label}</span>
              <span style={{flexShrink:0,display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:'linear-gradient(120deg,#2F9E90,#1B6E62)',color:'#fff',fontSize:10,fontWeight:700}}>✓</span>
            </div>
          ))}
        </div>
        <div style={{padding:20}}>
          <PremiumButton onClick={onClose}>{cta}</PremiumButton>
        </div>
      </div>
    </div>
  );
}

// ── FAB vocal flottant : RETIRÉ DE L'INTERFACE (2026-08-11, décision Nico) ───
// Doublon du micro de l'onglet Stock IA, qui fait déjà tout le travail, et gêne
// visuellement. Vérifié avant de le masquer :
//   · même chaîne pour les deux entrées — voice-intent → executeVoiceTasks →
//     VoiceResultCard, avec les MÊMES vaActions ;
//   · le Stock IA couvre TOUS les intents (aucun filtre dans callVoiceParse) —
//     rien n'était joignable par le FAB seul.
//
// ⚠️ ON MASQUE LE BOUTON, ON NE DÉMONTE RIEN. Le mode « Parler » du Stock IA
// appelle fabTriggerRef.current(), qui EST le handler du FAB (assigné hors du
// rendu conditionnel, cf. `if(triggerRef)triggerRef.current=handleFabClick`).
// Démonter VoiceAssistant — ou supprimer FabVocal — tuerait le micro du Stock
// IA et le drawer de résultats. Tout le socle reste en place et fonctionnel :
// voiceEngine, VoiceResultCard, les intents, le filtre voice_add_guard (2.4.41).
//
// POUR LE REMETTRE : repasser cette constante à false. Une ligne, rien d'autre.
const FAB_VOCAL_MASQUE = true;

function FabVocal({ onClick, isRec, isThink, isRes, lang }) {
  if (isRes) return null;
  return (
    <div className="fab-new">
      <span className="pulse-ring"/>
      <span className="pulse-ring"/>
      <span className="pulse-ring"/>
      {isThink && (
        <div className="fab-think-toast">
          {lang === 'en' ? 'Thinking' : 'Je réfléchis'}
          <span className="fab-think-dots"><span/><span/><span/></span>
        </div>
      )}
      <button
        className={"fab-new-btn" + (isRec ? " listening" : "") + (isThink ? " thinking" : "")}
        onClick={onClick}
        disabled={isThink}
        aria-label="Parler à l'IA"
        style={{touchAction:'manipulation'}}
      >
        {isThink
          ? <span style={{fontSize:19}}>⏳</span>
          : isRec
            ? <span className="fab-icon-blink">🎙️</span>
            : <span>🎙️</span>
        }
      </button>
    </div>
  );
}

function normalizeCat(raw){
  if(!raw) return 'Autre';
  const v=raw.toLowerCase()
    .replace(/[éèêë]/g,'e').replace(/[àâ]/g,'a').replace(/[ùû]/g,'u').replace(/[îï]/g,'i').replace(/[ôö]/g,'o')
    .replace(/[^a-z]/g,'');
  if(v==='mode'||v==='fashion') return 'Mode';
  if(v==='hightech'||v==='tech'||v==='hitech') return 'High-Tech';
  if(v==='luxe'||v==='luxury') return 'Luxe';
  if(v==='maison'||v==='home') return 'Maison';
  if(v==='sport') return 'Sport';
  if(v==='musique'||v==='music') return 'Musique';
  if(v==='beaute'||v==='beauty') return 'Beauté';
  if(v==='collection') return 'Collection';
  if(v==='livres'||v==='books') return 'Livres';
  if(v==='automoto'||v==='auto') return 'Auto-Moto';
  if(v==='electromenager'||v==='electro') return 'Électroménager';
  if(v==='jouets'||v==='toys') return 'Jouets';
  // Bricolage / Jardin / Multimédia : trois types que le sélecteur d'article
  // propose et que detectType() sait produire, mais qui retombaient ici en
  // « Autre » — le délai de vente moyen par catégorie les fondait donc tous
  // dans le même sac. Ajoutés le 11/08 en même temps que l'ouverture du Lens
  // à Bricolage et Jardin, qui va enfin en produire.
  if(v==='bricolage'||v==='diy') return 'Bricolage';
  if(v==='jardin'||v==='garden') return 'Jardin';
  if(v==='multimedia') return 'Multimédia';
  return 'Autre';
}

const CAT_COLORS_MAP={
  'Mode':'#DB2777','High-Tech':'#2563EB','Luxe':'#D97706','Maison':'#16A34A',
  'Sport':'#7C3AED','Musique':'#9333EA','Beauté':'#EC4899','Collection':'#F59E0B',
  'Livres':'#84CC16','Auto-Moto':'#EF4444','Électroménager':'#06B6D4','Jouets':'#F97316',
  'Autre':'#6B7280',
};


function VoiceAssistant({items,sales,lang,currency='EUR',userCountry,actions,vaStep,setVaStep,vaResults,setVaResults,vaError,setVaError,markSold,deleteItem,triggerRef,isPremium=false,user=null,voiceUsedToday=0,setVoiceUsedToday,ouvrirModalePlafondVoix,hideFab=false}){
  const vaMediaRef=useRef(null);
  const vaChunksRef=useRef([]);
  const vaStreamRef=useRef(null);
  const voiceAutoStopRef=useRef(null);
  const autoCloseRef=useRef(null);
  const drawerRef=useRef(null);
  const swipeRef=useRef({startY:0,active:false});
  const [vaEdits,setVaEdits]=useState({});
  const [lastPriceAdviceData,setLastPriceAdviceData]=useState(null);
  const [voiceToast,setVoiceToast]=useState('');
  // Phrase transcrite, affichée en tête du drawer (« J'ai entendu … »). Elle
  // existait déjà côté client mais n'était jamais montrée : c'est ce qui rend
  // l'IA lisible quand elle se trompe. Aucun coût serveur.
  const [vaTranscript,setVaTranscript]=useState('');
  const showVoiceToast=(msg)=>{setVoiceToast(msg);setTimeout(()=>setVoiceToast(''),2000);};
  const SURL=supabaseUrl;

  useEffect(()=>{
    const onVisibility=()=>{
      if(!document.hidden)return;
      try{if(vaMediaRef.current&&vaMediaRef.current.state!=="inactive")vaMediaRef.current.stop();}catch{}
      vaStreamRef.current?.getTracks().forEach(t=>t.stop());
      vaStreamRef.current=null;
    };
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{
      document.removeEventListener('visibilitychange',onVisibility);
      vaStreamRef.current?.getTracks().forEach(t=>t.stop());
      vaStreamRef.current=null;
    };
  },[]);
  // Le formatage monétaire et le rendu des cartes vivent désormais dans
  // components/voice/VoiceResultCard — VoiceAssistant ne garde que la capture
  // audio, l'appel IA et l'état du drawer.

  function resetVA(){
    clearTimeout(autoCloseRef.current);
    clearTimeout(voiceAutoStopRef.current);
    try{if(vaMediaRef.current&&vaMediaRef.current.state!=="inactive")vaMediaRef.current.stop();}catch{}
    vaMediaRef.current=null;vaChunksRef.current=[];
    vaStreamRef.current?.getTracks().forEach(t=>t.stop());
    vaStreamRef.current=null;
    setVaStep("");setVaResults([]);setVaError(null);setVaEdits({});setVaTranscript('');
  }

  useEffect(()=>{
    if(!vaError)return;
    // 4 s et pas 2 : depuis le filtre hallucinations (03/08), le serveur rend
    // une vraie phrase (« Aucune parole détectée — réessayez… ») qui doit
    // avoir le temps d'être lue — à 2 s le vocal semblait ne « rien faire ».
    const t=setTimeout(()=>setVaError(null),4000);
    return()=>clearTimeout(t);
  },[vaError]);

  async function handleFabClick(){
    if(vaStep==="thinking")return;
    if(vaStep==="recording"){
      clearTimeout(voiceAutoStopRef.current);
      vaMediaRef.current?.stop();
      return;
    }
    if(vaStep==="results"){resetVA();return;}
    // Use cached stream only if all audio tracks are live; re-request otherwise (iOS suspended/ended)
    let stream=vaStreamRef.current;
    const tracksLive=stream&&stream.getAudioTracks().length>0&&stream.getAudioTracks().every(t=>t.readyState==='live');
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      setVaError(lang==="en"?"Microphone unavailable. Check permissions in Settings > FillSell.":"Microphone non disponible. Vérifiez les permissions dans Réglages > FillSell.");setVaStep("");return;
    }
    if(!tracksLive){
      try{stream=await navigator.mediaDevices.getUserMedia({audio:true});vaStreamRef.current=stream;}
      catch(e){setVaError(e.message||(lang==="en"?"Microphone unavailable":"Micro non disponible"));setVaStep("");return;}
    }
    const recorder=new MediaRecorder(stream);
    // Start recording immediately — push-to-stop model
    vaChunksRef.current=[];
    vaMediaRef.current=recorder;
    recorder.ondataavailable=e=>{if(e.data.size>0)vaChunksRef.current.push(e.data);};
    recorder.onstop=async()=>{
      clearTimeout(voiceAutoStopRef.current);
      // Release stream immediately so iOS clears the mic indicator
      vaStreamRef.current?.getTracks().forEach(t=>t.stop());
      vaStreamRef.current=null;
      const mimeType=(recorder.mimeType||"audio/webm").split(";")[0];
      const blob=new Blob(vaChunksRef.current,{type:mimeType});
      // Gate check before Whisper — use in-memory state, no Supabase read
      if(!isPremium&&user?.id){
        if(voiceUsedToday>=VOICE_FREE_LIMIT){
          ouvrirModalePlafondVoix();
          setVaStep("");
          return;
        }
        // Incrément avant le fetch pour qu'Android accumule le compteur même si le réseau coupe
        const nextCount=voiceUsedToday+1;
        if(setVoiceUsedToday)setVoiceUsedToday(nextCount);
        supabase.from('profiles').update({voice_count_today:nextCount,voice_count_date:new Date().toISOString().split('T')[0]}).eq('id',user.id)
          .select('voice_count_today')
          .then(({error})=>{if(error)console.warn('[quota] compteur vocal non enregistré:',error.message);});
      }
      setVaStep("thinking");
        try{
          const{data:{session:vaSess}}=await supabase.auth.getSession();
          const vaToken=vaSess?.access_token;
          if(!vaToken)throw new Error(lang==="en"?"Session expired, please reconnect.":"Session expirée, reconnectez-vous.");
          const fd=new FormData();
          const ext=mimeType.includes("mp4")?"mp4":mimeType.includes("aac")?"aac":"webm";
          fd.append("audio",blob,`audio.${ext}`);fd.append("lang",lang);
          const tRes=await fetch(`${SURL}/functions/v1/voice-transcribe`,{method:"POST",headers:{"Authorization":`Bearer ${vaToken}`,"apikey":supabaseAnonKey},body:fd});
          if(!tRes.ok){const tErrJson=await tRes.json().catch(()=>({}));if(tErrJson?.error==='ai_unavailable'||tRes.status===503){setVoiceToast(lang==='fr'?'⏳ IA temporairement indisponible. Réessaie dans 30 secondes.':'⏳ AI temporarily unavailable. Please retry in 30 seconds.');setTimeout(()=>setVoiceToast(''),5000);setVaStep("");return;}if(tRes.status===429||tErrJson?.error==='quota_exceeded'){ouvrirModalePlafondVoix();setVaStep("");return;}throw new Error(lang==="en"?"Transcription failed":"Transcription échouée");}
          let tJson;try{tJson=await tRes.json();}catch{throw new Error(lang==="en"?"Invalid server response":"Réponse serveur invalide");}
          const{text,error:tErr}=tJson;
          if(tErr)throw new Error(tErr);
          if(!text?.trim())throw new Error(lang==="en"?"No speech detected":"Aucune parole détectée");
          setVaTranscript(text.trim());
          // Follow-up "ajoute le au stock" after a price_advice
          const tlFU=text.toLowerCase();
          const ADD_FU=lang==="en"
            ?["add it","yes add","add it to my stock","add it anyway","add to stock","go ahead add","add that"]
            :["ajoute le","ajoute la","ajoute-le","ajoute-la","mets le","mets la","ok ajoute","oui ajoute","ajoute quand même","ajoute le quand même","ajoute la quand même","mets le dans mon stock","mets la dans mon stock","ajoute dans mon stock","ajoute-le quand même","ajoute-la quand même"];
          const isFollowupAdd=!!lastPriceAdviceData&&ADD_FU.some(p=>tlFU.includes(p));
          if(isFollowupAdd){
            const addTask={intent:"inventory_add",confidence:0.99,requiresConfirmation:false,ambiguous:false,data:{nom:lastPriceAdviceData.nom,marque:lastPriceAdviceData.marque,prix_achat:lastPriceAdviceData.prix_achat,categorie:lastPriceAdviceData.categorie,description:lastPriceAdviceData.description,quantite:1}};
            setLastPriceAdviceData(null);
            const{results:fuResults}=await executeVoiceTasks([addTask],{items,sales,lang,currency,country:userCountry?.code??getCountryFallback(),actions,supabaseUrl:SURL,token:vaToken});
            setVaResults(fuResults);setVaStep("results");
            return;
          }
          // Snapshot du stock (articles non vendus) transmis à la edge function pour le matching IA
          const stockSnap=items.filter(i=>i.statut!=="vendu").map(i=>({id:i.id,nom:i.title||i.nom||"",marque:i.marque||null,type:i.type||null,description:i.description||null,emplacement:i.emplacement||null,quantite:i.quantite||1,prix_achat:i.buy??i.prix_achat??null}));
          const iRes=await fetch(`${SURL}/functions/v1/voice-intent`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${vaToken}`,"apikey":supabaseAnonKey},body:JSON.stringify({text,lang,currency,items:stockSnap})});
          if(!iRes.ok){const iErrJson=await iRes.json().catch(()=>({}));if(iErrJson?.error==='ai_unavailable'||iRes.status===503){setVoiceToast(lang==='fr'?'⏳ IA temporairement indisponible. Réessaie dans 30 secondes.':'⏳ AI temporarily unavailable. Please retry in 30 seconds.');setTimeout(()=>setVoiceToast(''),5000);setVaStep("");return;}if(iRes.status===429||iErrJson?.error==='quota_exceeded'){/* 50/j Free (2026-07-23), Premium/Pro illimités : un 429 ne peut venir que d'un Free au plafond journalier */ouvrirModalePlafondVoix();setVaStep("");return;}throw new Error(lang==="en"?"Intent failed":"Erreur intention");}
          let iJson;try{iJson=await iRes.json();}catch{throw new Error(lang==="en"?"Invalid server response":"Réponse serveur invalide");}
          const{tasks,error:iErr}=iJson;
          if(iErr)throw new Error(iErr);
          if(!Array.isArray(tasks)||!tasks.length)throw new Error(lang==="en"?"Nothing understood":"Rien compris");
          // Client-side guard: price question patterns → price_advice first; explicit add → also inventory_add
          const tl=text.toLowerCase();
          const isPriceQ=lang==="en"
            ?["how much can i sell","how much can i resell","how much do you think i can","how much is it worth","how much can i get","what's it worth"].some(p=>tl.includes(p))
            :(tl.includes("combien")&&tl.includes("revendr"))||(tl.includes("combien")&&tl.includes("vendre"))||tl.includes("ça vaut combien")||tl.includes("combien ça vaut")||tl.includes("en tirer combien");
          const BUY_SIGNALS=lang==="en"
            ?["should i buy","is it a good deal","worth buying","should i get it","is it worth it"]
            :["devrais l'acheter","je devrais acheter","ça vaut le coup","c'est une bonne affaire","bonne affaire","vaut le coup","devrais-je acheter"];
          const isBuyQ=!isPriceQ&&BUY_SIGNALS.some(p=>tl.includes(p));
          const EXPLICIT_ADD_SIGNALS=lang==="en"
            ?["add it anyway","and add it","add it to my stock","add it as well","also add it","add it too"]
            :["ajoute le quand même","ajoute la quand même","et ajoute le","et ajoute la","mets le dans mon stock","mets la dans mon stock","ajoute le aussi","ajoute la aussi","ajoute quand même","ajoute-le quand même","ajoute-la quand même"];
          const hasExplicitAdd=EXPLICIT_ADD_SIGNALS.some(p=>tl.includes(p));
          let finalTasks=tasks;
          if(isBuyQ&&!tasks.some(t=>t.intent==="buy_advice")){
            const existing=tasks.find(t=>t.intent==="inventory_add"||t.intent==="business_advice");
            const src=existing?.data||{};
            finalTasks=[{intent:"buy_advice",confidence:0.95,requiresConfirmation:false,ambiguous:false,data:{nom:src.nom||null,marque:src.marque||null,prix_propose:src.prix_propose||src.prix_achat||null,etat:src.etat||src.description||null,plateforme_source:src.plateforme_source||null,categorie:src.categorie||null}}];
          } else if(isPriceQ){
            const existingPA=tasks.find(t=>t.intent==="price_advice");
            const existingAdd=tasks.find(t=>t.intent==="inventory_add");
            const src=existingPA?.data||existingAdd?.data||{};
            const paTask=existingPA||{intent:"price_advice",confidence:0.97,requiresConfirmation:false,ambiguous:false,data:{nom:src.nom||null,marque:src.marque||null,prix_achat:src.prix_achat||null,categorie:src.categorie||null,description:src.description||null}};
            if(hasExplicitAdd){
              const addTask=existingAdd||{intent:"inventory_add",confidence:0.97,requiresConfirmation:false,ambiguous:false,data:{nom:src.nom||null,marque:src.marque||null,prix_achat:src.prix_achat||null,categorie:src.categorie||null,description:src.description||null,quantite:1}};
              finalTasks=[paTask,addTask];
            }else{
              finalTasks=[paTask];
            }
          }
          const{results}=await executeVoiceTasks(finalTasks,{items,sales,lang,currency,country:userCountry?.code??getCountryFallback(),actions,supabaseUrl:SURL,token:vaToken,userId:user?.id??null});
          // Vente directe auto si article non trouvé en stock (no_match)
          const resolvedResults=await Promise.all(results.map(async r=>{
            if(r.status==="pending_confirmation"&&r.intent==="inventory_sell"&&r.taskData?.no_match&&!r.taskData?.price_ambiguous){
              try{
                const dmCat=r.taskData?.categorie||r.taskData?.type||null;
                await actions.addDirectSale({nom:r.taskData?.nom,marque:r.taskData?.marque,type:dmCat,description:r.taskData?.description||null,prix_vente:r.taskData?.prix_vente,prix_achat:r.taskData?.prix_achat,quantite_vendue:r.taskData?.quantite_vendue,plateforme:r.taskData?.plateforme||null});
                return{...r,status:"success",message:lang==="en"?"Sale recorded":"Vente enregistrée"};
              }catch(e){return{...r,status:"error",message:e.message};}
            }
            return r;
          }));
          // Store price_advice data for potential follow-up "ajoute le au stock"
          const paRes=resolvedResults.find(r=>r.intent==="price_advice"&&r.status==="success");
          if(paRes?.taskData)setLastPriceAdviceData(paRes.taskData);
          else setLastPriceAdviceData(null);
          const groupedResults=groupSellLots(resolvedResults,items);
          setVaResults(groupedResults);setVaStep("results");
          const QUICK_INTENTS=new Set(["inventory_add","inventory_sell","inventory_delete","inventory_update","inventory_lot"]);
          const isQuickOnly=resolvedResults.every(r=>r.status==="success"&&QUICK_INTENTS.has(r.intent));
        }catch(e){setVaError(e.message||"Error");setVaStep("");}
      };
      recorder.start();
      setVaStep("recording");
      // 60s safety auto-stop
      voiceAutoStopRef.current=setTimeout(()=>{vaMediaRef.current?.stop();},60000);
  }
  if(triggerRef)triggerRef.current=handleFabClick;

  function replaceResult(idx,patch){setVaResults(prev=>prev.map((r,i)=>i===idx?{...r,...patch}:r));}

  const fabSize=56;
  const isIdle=vaStep==="";
  const isRec=vaStep==="recording";
  const isThink=vaStep==="thinking";
  const isRes=vaStep==="results";

  // ── Rendu ────────────────────────────────────────────────────────────────
  // Le drawer s'ouvre À LA FIN de l'enregistrement (état "thinking"), pas à
  // l'appui micro : pendant que l'utilisateur parle, le FAB reste seul maître
  // (inchangé). Le même sheet se remplit ensuite de cartes — aucune fermeture
  // /réouverture entre les deux (design validé 2026-07-14).
  const drawerOpen = isThink || vaResults.length > 0;
  const voiceLeft = VOICE_FREE_LIMIT - voiceUsedToday;

  const ctx = {
    lang, currency, items, actions,
    replaceResult,
    edits: vaEdits,
    setEdits: setVaEdits,
  };

  return(
    <>
      <style>{VOICE_KIT_CSS}</style>

      {/* FAB — hors périmètre du redesign, comportement inchangé */}
      {!hideFab && <FabVocal onClick={handleFabClick} isRec={isRec} isThink={isThink} isRes={isRes} lang={lang} />}

      {/* Pastille de quota (Free, 1-2 vocaux restants) */}
      {!isPremium&&!isRec&&!isThink&&!isRes&&voiceLeft<=2&&voiceLeft>0&&(
        <FloatingBubble tone={voiceLeft===1?'negative':'amber'}>
          {voiceLeft===1
            ?(lang==='fr'?'⚠️ Dernier vocal du jour !':'⚠️ Last voice today!')
            :(lang==='fr'?`🎙️ ${voiceLeft} vocaux restants`:`🎙️ ${voiceLeft} voices left`)}
        </FloatingBubble>
      )}

      {/* Toast (IA indisponible, quota) */}
      {voiceToast&&<FloatingBubble tone="ink" bottom={90}>{voiceToast}</FloatingBubble>}

      {/* Erreur micro / transcription */}
      {vaError&&vaStep===""&&(
        <FloatingBubble tone="danger">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>
          {vaError}
        </FloatingBubble>
      )}

      {/* Drawer — traitement puis résultats, dans le même sheet */}
      {drawerOpen&&(
        <VoiceSheet
          lang={lang}
          transcript={vaResults.length>0?vaTranscript:null}
          onClose={vaResults.length>0?resetVA:null}
          sheetRef={drawerRef}
          swipeHandlers={vaResults.length>0?{
            onTouchStart:e=>{
              swipeRef.current.startY=e.touches[0].clientY;
              swipeRef.current.active=(drawerRef.current?.scrollTop??0)===0;
            },
            onTouchMove:e=>{
              if(!swipeRef.current.active)return;
              const dy=e.touches[0].clientY-swipeRef.current.startY;
              if(dy>0&&drawerRef.current){drawerRef.current.style.transition="none";drawerRef.current.style.transform=`translateY(${dy}px)`;}
            },
            onTouchEnd:e=>{
              if(!swipeRef.current.active)return;
              const dy=e.changedTouches[0].clientY-swipeRef.current.startY;
              if(dy>60){resetVA();}
              else if(drawerRef.current){drawerRef.current.style.transition="transform 0.2s ease";drawerRef.current.style.transform="translateY(0)";}
            },
          }:{}}
        >
          {vaResults.length===0
            ?<VoiceThinking lang={lang}/>
            :vaResults.map((result,idx)=>(
              <VoiceResultCard
                key={idx}
                result={result}
                idx={idx}
                allResults={vaResults}
                ctx={ctx}
              />
            ))
          }
        </VoiceSheet>
      )}
    </>
  );
}

export default function App({ loginOnly = false }){
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Splash natif : hide() au premier render = durée exacte du splash ;
  // launchShowDuration (2000 ms) ne sert plus que de PLAFOND de sécurité si ce
  // render n'arrive jamais. Sur Android 12+ le fondu vient de
  // launchFadeOutDuration (capacitor.config.ts) et ce paramètre est ignoré
  // (warning logcat bénin) ; iOS l'utilise.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide({ fadeOutDuration: 350 }).catch(() => {});
    }
  }, []);
  const [authMode, setAuthMode] = useState(() => searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [tab,setTab]=useState(()=>{const s=parseInt(localStorage.getItem('tab')||'0');return s===4?0:s;});
  const [items,setItems]=useState([]);
  const [sales,setSales]=useState([]);
  const [loading,setLoading]=useState(true);
  const [appLoading,setAppLoading]=useState(true);
  const [iTitle,setITitle]=useState("");
  const [iBuy,setIBuy]=useState("");
  const [iSell,setISell]=useState("");
  const [iMarque,setIMarque]=useState("");
  const [iType,setIType]=useState("");
  const [iDesc,setIDesc]=useState("");
  const [iPurchaseCosts,setIPurchaseCosts]=useState("");
  const [iSellingFees,setISellingFees]=useState(()=>localStorage.getItem('savedFees')||"");
  const [iRememberSellingFees,setIRememberSellingFees]=useState(()=>!!localStorage.getItem('savedFees'));
  const [iAlreadySold,setIAlreadySold]=useState(false);
  const [iQuantite,setIQuantite]=useState(1);
  const [iSaved,setISaved]=useState(false);
  const [iEmplacement,setIEmplacement]=useState("");
  const [iPlateforme,setIPlateforme]=useState("");
  const [filterMarque,setFilterMarque]=useState("Toutes");
  const [filterMarqueSold,setFilterMarqueSold]=useState("Toutes");
  const [pillsExpandedStock,setPillsExpandedStock]=useState(false);
  const [pillsExpandedSold,setPillsExpandedSold]=useState(false);
  const [filterType,setFilterType]=useState("Tous");
  const [soldShowAll,setSoldShowAll]=useState(false);
  const [showAllStock,setShowAllStock]=useState(false);
  const [expandedStockId,setExpandedStockId]=useState(null);
  const [showAllSales,setShowAllSales]=useState(false);
  const [search,setSearch]=useState("");
  const [searchHistory,setSearchHistory]=useState("");
  const [toast,setToast]=useState({visible:false,message:""});
  const [cTitle,setCTitle]=useState("");
  const [cBuy,setCBuy]=useState("");
  const [cSell,setCSell]=useState("");
  const [cShip,setCShip]=useState("");
  const [cSaved,setCSaved]=useState(false);
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const emailRef=useRef(null);
  const passwordRef=useRef(null);
  const [isSigningIn,setIsSigningIn]=useState(false);
  const [isSigningUp,setIsSigningUp]=useState(false);
  const [isSendingReset,setIsSendingReset]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [emailConfirm,setEmailConfirm]=useState("");
  const [loginError,setLoginError]=useState("");
  const [resetStep,setResetStep]=useState(0);
  const [forgotMode,setForgotMode]=useState(false);
  const [forgotMsg,setForgotMsg]=useState("");
  const [isPremium,setIsPremium]=useState(false);
  const [isPro,setIsPro]=useState(false);
  // Flags CUMULATIFS : un Business porte AUSSI is_pro et is_premium. isBusiness
  // n'ouvre donc aucun droit de plus (les gates isPro le couvrent d'office) —
  // il sert à NOMMER le palier, et doit être testé avant isPro partout où un
  // libellé est choisi (badge, « ton plan actuel », modales). 2026-08-09.
  const [isBusiness,setIsBusiness]=useState(false);
  const [lensInventaireId,setLensInventaireId]=useState(null);
  const [listingStepperOpen,setListingStepperOpen]=useState(false);
  const [aiCache,setAiCache]=useState({});
  // iapProduct : renseigné par initIAP (prix affiché par le store). Depuis le
  // 2026-08-09 plus aucun écran ne l'affiche — le prix se lit sur la carte du
  // palier, dans la modale. L'état RESTE : c'est la seule preuve que la
  // connexion au store a abouti, et le retirer toucherait le chemin IAP pour
  // une raison cosmétique. Il n'est simplement plus descendu aux onglets.
  // Underscore volontaire : la config eslint du projet tolère les non-lus en
  // /^[A-Z_]/ — c'est la façon idiomatique ici de dire « posé exprès, non lu ».
  const [_iapProduct,setIapProduct]=useState(null);
  const [iapLoading,setIapLoading]=useState(false);
  const [lang,setLang]=useState(()=>{
    const saved=localStorage.getItem('fs_lang');
    if(saved) return saved;
    const bl=(navigator.language||navigator.userLanguage||'fr').toLowerCase().split('-')[0];
    return bl==='fr'?'fr':'en';
  });
  const [currency,setCurrency]=useState(()=>localStorage.getItem('fs_currency')||'EUR');
  // Pseudo à demander : uniquement quand ni profiles.username ni le provider
  // OAuth ne donnent de nom. Consommé par OnboardingFlow, qui le demande en
  // fin de parcours — jamais dans une modale avant l'écran de choix (lot 5).
  const [demanderPseudo,setDemanderPseudo]=useState(false);
  // Onboarding « Tu vends déjà sur Vinted ? » (lot 2) : ouvert à la fermeture
  // de la modale devise+pseudo (comptes NEUFS uniquement), et REPRIS au
  // chargement si l'utilisateur était resté sur l'écran d'attente de
  // l'extension (état persisté par OnboardingFlow).
  const [showOnboardingFlow,setShowOnboardingFlow]=useState(false);
  // Onboarding terminé dans CETTE session (cf. garde dans fetchAll).
  const onboardingFiniRef=useRef(false);
  // Accroche extension ouverte depuis les lignes discrètes des états vides
  // (« L'extension n'est pas encore installée… ») — même écran que partout.
  const [showExtensionInfo,setShowExtensionInfo]=useState(false);
  // (La reprise de l'attente d'extension n'a plus d'effet dédié : le
  // déclencheur vit désormais dans fetchAll, sur profiles.onboarded_at. Si le
  // compte n'est pas onboardé et que le cache local porte encore
  // 'attente_extension', OnboardingFlow rouvre directement sur l'écran
  // d'attente — la détection puis la sync s'enchaînent sans aucun clic.)
  const [username,setUsername]=useState('');
  // Bandeau retrait cross-plateforme (Phase B, 2026-07-11) : jobs frères d'un
  // article VENDU encore en ligne ailleurs — flag platform_fields.
  // pending_removal posé par l'orchestration serveur (sale-orchestration.ts).
  // Le clic "Retirer" arme des jobs action='delete' (semi-auto : jamais de
  // suppression sans ce clic).
  const [pendingRemovals,setPendingRemovals]=useState([]);
  // Annonces constatées HORS LIGNE sans preuve de vente (Phase B, 2026-07-12) :
  // le doute n'est jamais écrit en base — l'utilisateur confirme ou infirme.
  const [unavailableListings,setUnavailableListings]=useState([]);
  const [confirmingSale,setConfirmingSale]=useState(null);
  // (Bandeau « vérification impossible » SUPPRIMÉ le 2026-08-15 — décision
  // produit : seul un bandeau de VENTE détectée parle à l'utilisateur. Le
  // mécanisme extension — check_unresolved, retentative quotidienne — continue
  // de tourner et se répare tout seul ; cette suppression est purement de
  // l'affichage, rien n'est écrit ni modifié en base.)
  // Prix de vente confirmé par l'utilisateur, par job (pré-rempli avec le prix
  // de mise en ligne, MODIFIABLE : la vente a pu être négociée).
  const [salePriceDraft,setSalePriceDraft]=useState({});
  // Prix d'ACHAT saisi dans le bandeau de vente détectée (par job).
  const [buyPriceDraft,setBuyPriceDraft]=useState({});
  // ── Disparus du dressing : revue GROUPÉE (2026-08-24, chantier détection
  // des ventes). La sync Vinted date `inventaire.disparu_le` en bloc au moment
  // où un run complet passe (174 articles marqués à la même minute constatés
  // en base) : un bandeau PAR article aurait déversé 174 bandeaux le même
  // matin. UN bandeau de synthèse ouvre une modale de revue ; chaque article
  // y est tranché par l'utilisateur (vendu à tel prix / pas vendu), jamais
  // automatiquement, et AUCUN ne sort de la file sans décision — la file ne
  // se vide que par les choix, pas par l'ancienneté.
  const [disparusModal,setDisparusModal]=useState(false);
  const [disparusPrix,setDisparusPrix]=useState({});         // item.id -> prix de vente saisi
  const [disparusAchat,setDisparusAchat]=useState({});       // item.id -> prix d'achat saisi
  const [disparusSel,setDisparusSel]=useState(()=>new Set());// sélection pour « pas vendues » en lot
  const [disparusBusy,setDisparusBusy]=useState(null);       // item.id | 'lot' pendant une écriture
  const [disparusPropositions,setDisparusPropositions]=useState({}); // vinted_item_id -> dernier prix affiché (relevés)
  const [disparusRendu,setDisparusRendu]=useState(40);       // fenêtre de rendu (volume : jusqu'à ~174/compte)
  // Articles avec une republication VIVANTE (pending/processing/needs_user) :
  // entre suppression et recréation, l'absence de l'annonce est VOULUE — le
  // bandeau « Vendue ? » ne doit JAMAIS s'afficher dessus (garde-fou A du
  // chantier 24/08 ; le critère job existant est le message « Annonce en cours
  // de republication — pas une vente », posé par cancelPublishAfterDelete).
  const [republishActifsInv,setRepublishActifsInv]=useState(()=>new Set());
  const [firstItemAdded,setFirstItemAdded]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [coinWallet,setCoinWallet]=useState(null);
  const [coinHistory,setCoinHistory]=useState([]);
  const [showPremiumModal,setShowPremiumModal]=useState(false);
  // Viewport mobile (réactif, breakpoint 768 partagé) : sert à masquer ce qui
  // n'a pas de sens sur téléphone, ex. l'installation de l'extension Chrome.
  const isMobileViewport=useIsMobile();
  // Bannière « extension obsolète » (2026-07-19, refonte 2026-07-23) :
  // télémétrie stampée par get-pending-jobs. Conditions : extension vue dans
  // les 30 derniers jours (au-delà, l'utilisateur ne s'en sert plus — pas de
  // nag) ET build extension strictement antérieur à EXT_MIN_BUILD (dernier
  // commit touchant chrome-extension/). L'ancienne comparaison au build de
  // l'app re-flaggait toutes les extensions à chaque déploiement web — faux
  // positif systématique dès que le web bougeait sans l'extension.
  const [extensionBuild,setExtensionBuild]=useState(null);
  const [extensionLastSeenAt,setExtensionLastSeenAt]=useState(null);
  // Le profil a répondu au moins une fois : différencie « extension jamais vue »
  // (extension_last_seen_at NULL, profil chargé) de « on ne sait pas encore »
  // (fetch en cours). La garde de publication (2026-08-04) ne bloque côté UI
  // que sur le premier cas — le RPC tranche de toute façon côté serveur.
  const [extensionSeenLoaded,setExtensionSeenLoaded]=useState(false);
  // Tri-état passé aux tabs : true = jamais vue, false = déjà vue, null = inconnu.
  const extensionNeverSeen=extensionSeenLoaded?(extensionLastSeenAt==null):null;
  // Renvoi de la bannière mémorisé par couple (build installé | build minimal
  // requis) : elle revient si l'extension change de build en restant obsolète,
  // OU si un nouveau commit extension bumpe l'exigence — jamais pour rien.
  const [extBannerDismissedFor,setExtBannerDismissedFor]=useState(()=>{try{return localStorage.getItem('fs_ext_banner_dismissed');}catch{return null;}});
  const extensionOutdated=(()=>{
    if(isNative||isMobileViewport)return false;
    const seen=Date.parse(extensionLastSeenAt??'');
    if(!Number.isFinite(seen)||Date.now()-seen>30*24*60*60*1000)return false;
    const ext=buildIdTimestamp(extensionBuild);
    const min=Date.parse(EXT_MIN_BUILD??'');
    return ext!=null&&Number.isFinite(min)&&ext<min;
  })();
  const extBannerKey=`${extensionBuild}|${EXT_MIN_BUILD}`;
  // Source UNIQUE de « la bannière est à l'écran » : lue par le rendu ET par
  // le rafraîchissement ci-dessous, pour qu'ils ne puissent pas diverger.
  const extBannerVisible=extensionOutdated&&extBannerDismissedFor!==extBannerKey;
  // ── Rafraîchissement pendant que la bannière est affichée (2026-08-09) ──────
  // extensionBuild n'était écrit QUE par fetchAll. Or la sonde des jobs
  // (plus bas) ne rappelle fetchAll que si l'empreinte des jobs a CHANGÉ, et
  // le listener visibilitychange exige de quitter l'onglet puis d'y revenir.
  // Un utilisateur qui met son extension à jour et RESTE sur la page gardait
  // donc la bannière indéfiniment, alors que la base portait déjà le bon
  // build (3 comptes dans ce cas le 09/08, tous en 0.5.6).
  // Ce timer ne tourne QUE tant que la bannière est affichée : un compte à
  // jour (extensionOutdated=false) n'en démarre AUCUN, et il s'arrête de
  // lui-même dès que la bannière s'éteint — l'effet se re-exécute alors avec
  // extBannerVisible=false et le cleanup a déjà tout démonté.
  // SELECT ciblé sur les deux seules colonnes qui pilotent la bannière : un
  // fetchAll complet relirait ventes + inventaire toutes les 30 s pour rien.
  useEffect(()=>{
    if(!extBannerVisible||!user?.id) return;
    let arret=false,timer=null;
    const relire=async()=>{
      const {data,error}=await supabase.from('profiles')
        .select('extension_build,extension_last_seen_at').eq('id',user.id).maybeSingle();
      if(arret||error||!data) return;
      setExtensionBuild(data.extension_build??null);
      setExtensionLastSeenAt(data.extension_last_seen_at??null);
    };
    const demarrer=()=>{ if(timer===null) timer=setInterval(relire,30_000); };
    const arreter=()=>{ if(timer!==null){ clearInterval(timer); timer=null; } };
    // Onglet caché : on ARRÊTE l'intervalle (pas seulement une lecture sautée)
    // — rien à rafraîchir pour un écran que personne ne regarde. Au retour, une
    // lecture immédiate, puis la cadence reprend.
    const onVisibilite=()=>{
      if(document.visibilityState==='visible'){ relire(); demarrer(); }
      else arreter();
    };
    if(document.visibilityState==='visible') demarrer();
    document.addEventListener('visibilitychange',onVisibilite);
    return()=>{arret=true;arreter();document.removeEventListener('visibilitychange',onVisibilite);};
  },[extBannerVisible,user?.id]);
  // ── Bundle périmé (2026-07-19, classe de bug c5fe1414) ────────────────────
  // Un onglet SPA longue vie garde son bundle en mémoire tant que personne ne
  // fait F5 : un job créé par cet onglet après un déploiement part avec les
  // données d'AVANT (vécu : ebayAspects absent alors que l'encart requis était
  // déployé). On poll /build.json (émis au build avec le même computeBuildId,
  // no-store côté Vercel) au retour sur l'onglet + toutes les 5 min, et on
  // compare au APP_BUILD_ID EMBARQUÉ dans le bundle qui tourne.
  // Mismatch → reload AUTO seulement si aucune interaction en cours (stepper
  // fermé — sessionStorage fs_stepper_host, source de vérité cross-composant —,
  // aucune saisie clavier active, aucun dialog ouvert) ; sinon bandeau
  // persistant « Recharger » : on ne jette JAMAIS une saisie en cours.
  // Natif exclu : les assets sont embarqués dans l'app (capacitor://), un
  // reload n'irait rien chercher sur Vercel. Dev exclu : APP_BUILD_ID null.
  const [newVersionAvailable,setNewVersionAvailable]=useState(false);
  useEffect(()=>{
    if(isNative||!APP_BUILD_ID)return;
    let stop=false;
    const check=async()=>{
      try{
        const res=await fetch('/build.json',{cache:'no-store'});
        if(!res.ok)return;
        const data=await res.json().catch(()=>null);
        const remote=String(data?.build??'');
        if(stop||!remote||remote===APP_BUILD_ID)return;
        const stepperOpen=(()=>{try{return Boolean(sessionStorage.getItem('fs_stepper_host'));}catch{return false;}})();
        const el=document.activeElement;
        const typing=Boolean(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.isContentEditable));
        const dialogOpen=Boolean(document.querySelector('[role="dialog"]'));
        if(stepperOpen||typing||dialogOpen){setNewVersionAvailable(true);return;}
        window.location.reload();
      }catch{/* offline/CDN indisponible : silencieux, on retentera */}
    };
    const onVisible=()=>{if(document.visibilityState==='visible')check();};
    document.addEventListener('visibilitychange',onVisible);
    const timer=setInterval(check,5*60*1000);
    check();
    return ()=>{stop=true;document.removeEventListener('visibilitychange',onVisible);clearInterval(timer);};
  },[]);
  const [showPremiumWelcome,setShowPremiumWelcome]=useState(false);
  const [conversionModal,setConversionModal]=useState({open:false,trigger:'generic'});
  const [coinStoreOpen,setCoinStoreOpen]=useState(false);
  const [settingsPseudoInput,setSettingsPseudoInput]=useState('');
  // Adresse de remise Leboncoin (profiles.platform_settings.leboncoin) :
  // requise par le wizard LBC à chaque dépôt (champ "À quelle adresse se trouve
  // le bien ?", non pré-rempli depuis le compte LBC — vérifié), saisie une fois
  // ici. Stockée en 3 champs structurés (rue / code_postal / ville) et recomposée
  // en une string unique `adresse` (espaces, sans virgule — cf. fillAddress dans
  // content-scripts/leboncoin.js) injectée dans platform_fields.adresse des jobs.
  const [settingsLbcRue,setSettingsLbcRue]=useState('');
  const [settingsLbcCp,setSettingsLbcCp]=useState('');
  const [settingsLbcVille,setSettingsLbcVille]=useState('');
  const [settingsLbcAddressSaving,setSettingsLbcAddressSaving]=useState(false);
  // Vérification BAN de l'adresse (2026-08-13, item 3 du chantier LBC) :
  // null = rien à afficher ; {kind:'proposition', rue,cp,ville,label} = la BAN
  // propose une forme normalisée différente de la saisie ; {kind:'introuvable'}
  // = aucune correspondance BAN (rue neuve, lieu-dit, outre-mer…) — on N'EMPÊCHE
  // JAMAIS l'enregistrement (décision Nico 13/08), on avertit et on laisse
  // forcer. Remis à null dès que la saisie change.
  const [settingsLbcBan,setSettingsLbcBan]=useState(null);
  const [settingsPseudoSaving,setSettingsPseudoSaving]=useState(false);
  const [showBugReport,setShowBugReport]=useState(false);
  const [bugMessage,setBugMessage]=useState("");
  const [bugSending,setBugSending]=useState(false);
  const [selectedRange,setSelectedRange]=useState('6M');
  const [cancelStep,setCancelStep]=useState(0);
  const [cancelLoading,setCancelLoading]=useState(false);
  const [cancelMsg,setCancelMsg]=useState("");
  const [cancelAtPeriodEnd,setCancelAtPeriodEnd]=useState(false);
  const [cancelPeriodEnd,setCancelPeriodEnd]=useState(null);
  const [deleteStep,setDeleteStep]=useState(0);
  const [deleteLoading,setDeleteLoading]=useState(false);
  const [importModal,setImportModal]=useState(null); // {rows, mapping, preview}
  const [importLoading,setImportLoading]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const importRef=useRef(null);
  const titleInputRef=useRef(null);
  const listRef=useRef(null);
  const scrollRef=useRef(null);
  const [editItem,setEditItem]=useState(null);
  const [sellModal,setSellModal]=useState(null); // {item,sellPrice:'',sellingFees:'',rememberFees:false}
  const [deleteConfirm,setDeleteConfirm]=useState(null); // {type:'soldItem'|'sale', item?, sale?}
  // Sonde d'avant-suppression (2026-08-10) : état de l'annonce Vinted du plan de
  // suppression. {jobId, statut:'encours'|'hors_ligne'|'muette', signal, prix}
  // 'muette' = active, indéterminée, sans extension, ou hors délai — dans TOUS
  // ces cas la modale reste exactement celle d'avant.
  const [sondeSuppression,setSondeSuppression]=useState(null);
  // prix/achat à NULL et non '' : `??` laisse alors l'utilisateur VIDER le champ
  // (une chaîne vide est une saisie, pas une absence de saisie) — même contrat
  // que salePriceDraft/buyPriceDraft côté bandeau.
  const [venteSuppr,setVenteSuppr]=useState({prix:null,achat:null,busy:false,err:null});
  const [dealIADesc,setDealIADesc]=useState("");
  const [dealIAResult,setDealIAResult]=useState(null);
  const [dealIALoading,setDealIALoading]=useState(false);
  const [dealMicActive,setDealMicActive]=useState(false);
  const dealMicRef=useRef(null);
  const [dealPlaceholderIdx,setDealPlaceholderIdx]=useState(0);
  useEffect(()=>{
    const t=setInterval(()=>setDealPlaceholderIdx(i=>(i+1)%DEAL_PLACEHOLDERS_FR.length),4000);
    return()=>clearInterval(t);
  },[]);
  // Lens tab
  const [userCountry,setUserCountry]=useState(null); // {code,name}
  const [lensPhotos,setLensPhotos]=useState([]); // [{preview,base64,mime}]
  const [lensDesc,setLensDesc]=useState("");
  const [lensBuy,setLensBuy]=useState("");
  const [lensResult,setLensResult]=useState(null); // {analysis, itemData}
  const [lensLoading,setLensLoading]=useState(false);
  const [lensAdded,setLensAdded]=useState(false);
  const [lensMicActive,setLensMicActive]=useState(false);
  const [lensMicLoading,setLensMicLoading]=useState(false);
  const lensMicRef=useRef(null);
  const lensFileRef=useRef(null);
  useEffect(()=>{
    if(tab==='lens')return;
    if(lensMicRef.current?.stop)lensMicRef.current.stop();
    else if(lensMicRef.current?.abort)lensMicRef.current.abort();
    lensMicRef.current=null;
    setLensMicActive(false);
  },[tab]);
  const [lensPlaceholderIdx,setLensPlaceholderIdx]=useState(0);
  const [lensPlaceholderFade,setLensPlaceholderFade]=useState(true);
  const [voiceUsedToday,setVoiceUsedToday]=useState(0);
  // Plus aucun quota Lens côté client (payant-par-scan 2026-07-23) : chaque
  // analyse coûte 6 Pépites côté serveur, il n'y a plus de compteur mensuel.
  useEffect(()=>{
    const _id=setInterval(()=>{
      setLensPlaceholderFade(false);
      setTimeout(()=>{setLensPlaceholderIdx(i=>(i+1)%LENS_PLACEHOLDERS_FR.length);setLensPlaceholderFade(true);},300);
    },3000);
    return()=>clearInterval(_id);
  },[]);
  useEffect(()=>{
    fetch("https://ipapi.co/json/")
      .then(r=>r.ok?r.json():Promise.reject(r.status))
      .then(d=>{if(d?.country_code)setUserCountry({code:d.country_code,name:d.country_name});})
      .catch(()=>{
        fetch("https://ip-api.com/json/?fields=countryCode,country")
          .then(r=>r.ok?r.json():null)
          .then(d=>{if(d?.countryCode)setUserCountry({code:d.countryCode,name:d.country});})
          .catch(()=>{});
      });
  },[]);
  const [voiceText,setVoiceText]=useState("");
  const [voicePlaceholderIdx,setVoicePlaceholderIdx]=useState(0);
  const [voiceLoading,setVoiceLoading]=useState(false);
  const [voiceStep,setVoiceStep]=useState("");
  const [voiceParsed,setVoiceParsed]=useState(null);
  const [voiceError,setVoiceError]=useState(null);
  const [voiceZoneResults,setVoiceZoneResults]=useState([]);
  // REPLIÉE PAR DÉFAUT depuis le 2026-08-09. Le drapeau existait depuis
  // toujours mais valait `true` sans qu'aucun bouton ne le bascule : la zone de
  // saisie IA (onglets Écrire/Parler + zone de texte + Analyser + exemples +
  // ajout manuel) occupait tout le premier écran de l'onglet Stock, et
  // repoussait sous la ligne de flottaison la carte de synchro Vinted comme la
  // liste des articles. Une ligne suffit à la rouvrir.
  const [voiceZoneOpen,setVoiceZoneOpen]=useState(false);
  useEffect(()=>{if(!voiceError)return;const t=setTimeout(()=>{setVoiceError(null);setVoiceStep("");},4000);return()=>clearTimeout(t);},[voiceError]);
  const [showManualForm,setShowManualForm]=useState(false);
  useEffect(()=>{
    const t=setInterval(()=>setVoicePlaceholderIdx(i=>(i+1)%TEXTAREA_PLACEHOLDERS.length),4000);
    return()=>clearInterval(t);
  },[]);
  const [manualMode,setManualMode]=useState("single");
  const [lotManualTotal,setLotManualTotal]=useState("");
  const [lotManualItems,setLotManualItems]=useState([{nom:""},{nom:""}]);
  const [lotDistributed,setLotDistributed]=useState(null);
  const [lotDistributing,setLotDistributing]=useState(false);
  const [vaStep,setVaStep]=useState("");
  const [vaResults,setVaResults]=useState([]);
  const [vaError,setVaError]=useState(null);
  const fabTriggerRef=useRef(null);

  const {t}=useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  useEffect(()=>{localStorage.setItem('fs_lang',lang);},[lang]);
  useEffect(()=>{localStorage.setItem('fs_currency',currency);},[currency]);
  useEffect(()=>{if(!localStorage.getItem('fs_lang'))localStorage.setItem('fs_lang',lang);},[]);
  async function saveCurrency(code){
    setCurrency(code);
    localStorage.setItem('fs_currency',code);
    if(user?.id) await supabase.rpc('set_profile_currency',{p_currency:code});
  }
  // product : undefined → abonnement Premium standard ; 'pro' → Pro 29,99 € ;
  // 'business' → Business 59,99 € (2026-08-09). Le serveur
  // (create-checkout-session) résout le price ID depuis un secret par palier et
  // bascule l'abonnement EXISTANT quand il y en a un (upgrade in situ, prorata
  // facturé) — le client n'a donc à connaître ni prix ni price ID.
  async function triggerCheckout(product,origine='non_precisee'){
    const prixAffiche=product==='business'?59.99:product==='pro'?29.99:12.99;
    const tierLog=product??'premium';
    try{
      let{data:{session}}=await supabase.auth.getSession();
      if(!session){
        const{data:refreshed}=await supabase.auth.refreshSession();
        session=refreshed?.session??null;
      }
      if(!session){
        setToast({visible:true,message:lang==='en'?"Please sign in to continue.":"Reconnectez-vous pour continuer."});
        setTimeout(()=>setToast({visible:false,message:""}),4000);
        return;
      }
      const token=session.access_token;
      // ...(product?{product}:{}) et non plus le seul cas 'pro' : sans ça,
      // triggerCheckout('business') serait parti en checkout PREMIUM (12,99 €)
      // — le produit était simplement omis du corps.
      const res=await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':supabaseAnonKey},body:JSON.stringify({email:user.email,...(product?{product}:{})})});
      const body=await res.json();
      const{url,error,upgraded,already_pro,tier}=body;
      if(error)throw new Error(error);
      // Upgrade in situ (2026-07-23, généralisé aux paliers le 2026-08-09) :
      // l'abonnement Stripe existant a été basculé sur le price du palier visé
      // côté serveur (proration facturée) — pas de session Checkout, donc pas
      // de redirection. already_pro = défensif (double clic / flag client
      // désynchronisé), on aligne juste l'état. `tier` est rendu par le serveur
      // et fait foi : l'état local ne doit jamais se déduire du paramètre
      // d'appel, qui ne dit pas ce que le serveur a réellement fait.
      if(upgraded||already_pro){
        const cible=tier??product??'standard';
        setIsPremium(true);setIsPro(true);
        if(cible==='business') setIsBusiness(true);
        if(upgraded){
          track('purchase',{currency:'EUR',value:prixAffiche});
          setShowPremiumWelcome(true);
        }
        if(user?.id)fetchAll(user.id,{silencieux:true});
        return;
      }
      track('begin_checkout', { currency: 'EUR', value: prixAffiche });
      // ── checkout_open (2026-08-09) ─────────────────────────────────────
      // La feuille de paiement s'ouvre POUR DE BON : Stripe a rendu une URL
      // de session et on y part. AWAIT volontaire — la redirection tue
      // l'onglet et emporterait la requête en vol ; c'est la seule ligne du
      // tunnel qu'on attend, elle vaut le quart de seconde.
      // Le contexte est aussi déposé en localStorage : après la redirection
      // il n'existe plus aucun état React, et /cancel (page hors de l'app,
      // sans user ni props) n'aurait sinon rien à journaliser.
      try{localStorage.setItem('fs_checkout_ctx',JSON.stringify({canal:'stripe',tier:tierLog,origine,at:Date.now()}));}catch{/* mode privé : on perdra l'abandon, pas l'achat */}
      await logTunnel('checkout_open',{canal:'stripe',tier:tierLog,origine});
      console.log('[checkout] redirecting to:', url);
      window.location.href=url;
    }catch(e){
      // Jamais l'erreur Stripe brute en anglais à l'utilisateur (vécu le 26/07 :
      // « The price specified is inactive » affiché tel quel, 7 clics sans
      // conversion). payment_unavailable = price archivé/absent détecté par le
      // garde-fou serveur ; le détail technique reste en console.
      console.error('[checkout] error:', e);
      alert(e.message==='payment_unavailable'
        ?(lang==='en'?"Payment is temporarily unavailable. We're on it — please try again shortly.":"Le paiement est momentanément indisponible. On est prévenus — réessaie dans quelques minutes.")
        :(lang==='en'?"Could not open checkout. Please try again.":"Impossible d'ouvrir le paiement. Réessaie dans un instant."));
    }
  }

  // ── Confirmation SERVEUR d'un droit payant (2026-08-05) ──────────────────
  // Aucun écran de succès ne s'affiche sans que le SERVEUR ait porté le droit.
  // Avant, seul iOS attendait (le webhook Apple écrivait) ; Android écrivait
  // lui-même profiles et affichait « Bienvenue dans Premium » sur une écriture
  // que Postgres avait refusée (42501). Les deux plateformes passent désormais
  // par ici — factorisé exprès pour que l'asymétrie ne puisse pas revenir.
  //
  // Premier essai IMMÉDIAT : sur Android, validate-google-purchase a déjà
  // écrit quand elle rend la main, donc la confirmation est instantanée. Sur
  // iOS le webhook met quelques secondes, d'où les relances.
  //
  // essais = 11, PAS 10 (2026-08-05). La boucle iOS d'origine dormait AVANT
  // chaque lecture : 10 tours = lectures à 2,4,…,20 s, soit 20 s d'attente.
  // Ici le 1er tour ne dort pas (pour l'instantané Android) : à 10 tours la
  // dernière lecture tomberait à 18 s et on RÉDUIRAIT la fenêtre iOS de 2 s
  // sur un chemin qui, lui, marchait. 11 tours → lectures à 0,2,…,20 s : la
  // fenêtre iOS est conservée à l'identique, l'instantané Android aussi.
  async function attendreConfirmationServeur(userId,{pro=false,business=false,essais=11,delaiMs=2000}={}){
    for(let i=0;i<essais;i++){
      if(i>0) await new Promise(r=>setTimeout(r,delaiMs));
      const{data,error}=await supabase.from('profiles').select('is_premium,is_pro,is_business').eq('id',userId).maybeSingle();
      if(error){console.warn('[IAP] relecture profil:',error.message);continue;}
      if(data?.is_premium===true&&(!pro||data?.is_pro===true)&&(!business||data?.is_business===true))return data;
    }
    return null;
  }

  // tier : 'pro' → abonnement Pro (app.fillsell.pro2.sub sur iOS,
  // app.fillsell.pro.sub sur Google Play — cf. PRODUCT_IDS) ; 'business' →
  // Business (app.fillsell.business.sub, même id sur les deux stores) ; toute
  // autre valeur (undefined, event de clic…) → Premium standard. Comparaison
  // stricte voulue. Flags cumulatifs : un Business obtient aussi is_pro côté
  // serveur — l'état client isPro suit.
  async function handleIAPPurchase(tier,origine='non_precisee'){
    const isBusinessPurchase=tier==='business';
    const isProPurchase=tier==='pro';
    const tierLog=isBusinessPurchase?'business':isProPurchase?'pro':'premium';
    const canal=platform==='ios'?'apple':platform==='android'?'google':platform;
    console.log('[IAP] handleIAPPurchase started — platform:',platform,'tier:',isBusinessPurchase?'business':isProPurchase?'pro':'premium');
    // Coupe-circuit 07/08 : validate-google-purchase en 500 = débit sans
    // crédit. Tant que coin_config.android_payments_enabled vaut 0, on ne
    // lance PAS le flux Google — message honnête à la place. Web/iOS jamais
    // concernés (cf. src/utils/androidPayments.js).
    if(platform==='android'&&await paiementsAndroidCoupes(supabase)){
      setToast({visible:true,message:messagePaiementAndroidCoupe(lang)});
      setTimeout(()=>setToast({visible:false,message:''}),10000);
      return;
    }
    // ── Upgrade Premium→Pro Android (2026-07-27, remplace la garde du 23/07) ──
    // L'ancienne garde bloquait TOUT Premium Android — y compris les comped/
    // promus à la main qui n'ont AUCUN abonnement à doublonner. On regarde
    // désormais la source réelle :
    //  - abo Premium Google Play actif (interrogé en direct via getPurchases,
    //    jamais les colonnes locales seules) → upgrade EN PLACE : oldPurchaseToken
    //    + prorata via le plugin patché (patches/@capgo+native-purchases)
    //  - sinon client Stripe → l'upgrade se fait sur fillsell.app (pas de
    //    paiement carte déclenché depuis l'app : règles Play)
    //  - sinon (comped/manuel) → achat Pro normal, rien à doublonner.
    // Trou restant assumé : Premium Apple actif utilisé sur Android (rare).
    let upgradeOldToken=null;
    // Business : upgrade en place depuis Premium OU Pro (paliers inférieurs) ;
    // Pro : depuis Premium seulement, comme avant.
    const besoinUpgrade=platform==='android'&&isPremium&&
      ((isProPurchase&&!isPro)||isBusinessPurchase);
    if(besoinUpgrade){
      setIapLoading(true);
      const lowerIds=isBusinessPurchase
        ?[PRODUCT_IDS.sub,PRODUCT_IDS.standard,PRODUCT_IDS.pro]
        :undefined; // défaut de findActivePlayPremiumSub = les Premium
      try{upgradeOldToken=await findActivePlayPremiumSub(lowerIds);}
      catch(e){console.warn('[IAP] lecture abos Play:',e?.message);}
      if(!upgradeOldToken){
        let prof=null;
        try{const{data}=await supabase.from('profiles').select('stripe_customer_id,google_purchase_token,google_product_id').eq('id',user.id).single();prof=data;}catch{}
        const cibleId=isBusinessPurchase?PRODUCT_IDS.business:PRODUCT_IDS.pro;
        if(prof?.google_purchase_token&&prof?.google_product_id!==cibleId){
          // Repli si getPurchases est muet (autre compte Google sur l'appareil…) :
          // on tente l'upgrade avec le token connu — si l'abo est mort, Google
          // refuse le flow proprement, jamais de double facturation.
          upgradeOldToken=prof.google_purchase_token;
        }else if(prof?.stripe_customer_id){
          setIapLoading(false);
          setToast({visible:true,message:lang==='fr'
            ?"Ton Premium est payé par carte : passe Pro sur fillsell.app, l'upgrade y est automatique (prorata inclus)."
            :"Your Premium is billed by card: upgrade to Pro on fillsell.app — it's automatic there (prorated)."});
          setTimeout(()=>setToast({visible:false,message:''}),8000);
          return;
        }
      }
    }
    setIapLoading(true);
    // Programme Founder fermé aux nouveaux (2026-07) : jamais PRODUCT_IDS.sub ici.
    // Il reste référencé dans restorePurchases pour les Founders existants.
    const productId=isBusinessPurchase?PRODUCT_IDS.business:isProPurchase?PRODUCT_IDS.pro:PRODUCT_IDS.standard;
    try{
      // ── checkout_open / checkout_abandon (2026-08-09) ──────────────────
      // On journalise juste AVANT de demander la feuille au store : c'est le
      // dernier instant que le code observe. purchasePremium ne rend la main
      // qu'une fois la feuille fermée — impossible de savoir plus finement
      // si elle s'est affichée, et prétendre le contraire serait faux.
      // `cancelled` est le retour explicite du plugin quand l'utilisateur
      // ferme la feuille ou touche « Annuler » : c'est l'abandon, le trou
      // exact entre le clic et l'achat qu'on ne voyait pas.
      logTunnel('checkout_open',{canal,tier:tierLog,origine});
      const {cancelled,purchaseToken}=await purchasePremium(productId,user.id,{oldPurchaseToken:upgradeOldToken});
      if(cancelled){logTunnel('checkout_abandon',{canal,tier:tierLog,origine,motif:'annule'});return;}
      if(platform==='android'){
        // ⛔ NE JAMAIS réintroduire ici un supabase.from('profiles').update(...).
        // Ce bloc a contenu, du lancement au 2026-08-05, une écriture directe
        // de is_premium / is_pro / google_purchase_token / google_product_id
        // avec le JWT utilisateur. Ces colonnes ne sont pas — et ne doivent
        // pas être — dans le GRANT UPDATE de `authenticated` : le refus 42501
        // est la seule chose qui empêche un utilisateur de se passer Premium
        // seul. L'écriture appartient au serveur, en service_role.
        if(!purchaseToken) throw new Error(lang==='fr'
          ?"Achat sans jeton Google : impossible à valider."
          :'Purchase without a Google token: cannot be validated.');
        const{data:vg,error:vgErr}=await supabase.functions.invoke('validate-google-purchase',{
          body:{productId,purchaseToken,userId:user.id},
        });
        if(vgErr||!vg?.is_premium) throw new Error(vgErr?.message||vg?.error||'Google purchase not confirmed by server');
      }
      // iOS : le droit vient d'apple-iap-webhook. Android : de la fonction
      // ci-dessus. Dans les deux cas on ne croit que le serveur.
      const confirme=await attendreConfirmationServeur(user.id,{pro:isProPurchase||isBusinessPurchase,business:isBusinessPurchase});
      if(!confirme) throw new Error('Premium not confirmed by server');
      setIsPremium(true);
      if(isProPurchase||isBusinessPurchase) setIsPro(true); // cumulatif : Business ⊇ Pro
      if(isBusinessPurchase) setIsBusiness(true);
      setShowPremiumWelcome(true);
    }catch(e){
      console.error('[IAP] purchase failed:',e);
      // Filet DURCI (2026-08-05). L'ancienne version se contentait d'un
      // is_premium=true pour afficher le succès : un is_comped, un abonné
      // Stripe ou un ex-premium Apple voyait donc « Bienvenue dans Premium »
      // après un achat Google qui venait d'échouer — et un achat Pro raté
      // affichait un écran Premium. On n'accepte plus que l'état serveur
      // portant EXACTEMENT le droit qui vient d'être acheté.
      try{
        const{data,error}=await supabase.from('profiles')
          .select('is_premium,is_pro,is_business,google_product_id').eq('id',user.id).maybeSingle();
        if(error)console.warn('[IAP] relecture après échec:',error.message);
        const droitAcquis=data?.is_premium===true
          &&(!isProPurchase||data?.is_pro===true)
          &&(!isBusinessPurchase||data?.is_business===true)
          &&(platform!=='android'||data?.google_product_id===productId);
        if(droitAcquis){
          setIsPremium(true);
          if(isProPurchase||isBusinessPurchase) setIsPro(true);
          if(isBusinessPurchase) setIsBusiness(true);
          setShowPremiumWelcome(true);
          return;
        }
      }catch(err){console.warn('[IAP] relecture après échec:',err?.message);}
      const errMsg=e?.message||e?.code||String(e);
      setToast({visible:true,message:`❌ ${errMsg}`});
      setTimeout(()=>setToast({visible:false,message:''}),8000);
    }finally{setIapLoading(false);}
  }

  async function handleIAPRestore(){
    setIapLoading(true);
    try{
      // `restaure` et non `isPremium` : le nom d'origine masquait l'état du
      // composant à l'intérieur de tout le bloc.
      const {isPremium:restaure,receipt,purchaseToken,productId}=await restorePurchases('button');
      if(restaure){
        const estBusiness=productId===PRODUCT_IDS.business;
        const estPro=productId===PRODUCT_IDS.pro||estBusiness; // cumulatif
        if(receipt&&platform==='ios'){
          const{data:fnData,error:fnErr}=await supabase.functions.invoke('validate-apple-receipt',{body:{receipt,userId:user.id}});
          if(fnErr||!fnData?.is_premium) throw new Error(fnErr?.message||'Receipt validation failed');
        } else if(platform==='android'){
          // ⛔ Même interdit qu'à l'achat : jamais d'écriture client ici.
          // La restauration Android était cassée à l'identique — elle ne
          // pouvait donc même pas réparer un abonnement payé.
          if(!purchaseToken||!productId) throw new Error(lang==='fr'
            ?"Abonnement Google incomplet : impossible à restaurer."
            :'Incomplete Google subscription: cannot restore.');
          const{data:vg,error:vgErr}=await supabase.functions.invoke('validate-google-purchase',{
            body:{productId,purchaseToken,userId:user.id},
          });
          if(vgErr||!vg?.is_premium) throw new Error(vgErr?.message||vg?.error||'Google purchase not confirmed by server');
        }
        const confirme=await attendreConfirmationServeur(user.id,{pro:estPro,business:estBusiness});
        if(!confirme) throw new Error('Premium not confirmed by server');
        setIsPremium(true);
        if(estPro) setIsPro(true);
        if(estBusiness) setIsBusiness(true);
        setShowPremiumWelcome(true);
      }else{
        setToast({visible:true,message:lang==='fr'?'Aucun achat actif trouvé':'No active purchase found'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }
    }catch(e){
      console.error('[IAP] restore failed:',e);
      // Même durcissement qu'à l'achat : un is_premium venu d'ailleurs
      // (comped, Stripe, Apple) ne vaut pas restauration réussie.
      try{
        const{data,error}=await supabase.from('profiles')
          .select('is_premium,is_pro,is_business').eq('id',user.id).maybeSingle();
        if(error)console.warn('[IAP] relecture après échec restore:',error.message);
        if(data?.is_premium===true){
          setIsPremium(true);
          if(data?.is_pro===true) setIsPro(true);
          if(data?.is_business===true) setIsBusiness(true);
          setShowPremiumWelcome(true);
          return;
        }
      }catch(err){console.warn('[IAP] relecture après échec restore:',err?.message);}
      setToast({visible:true,message:lang==='fr'?'❌ Erreur lors de la restauration':'❌ Restore failed'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }finally{setIapLoading(false);}
  }

  // Checkout direct d'un tier ('premium'|'pro'|'business') : log + tracking +
  // IAP/Stripe. Business part désormais en Stripe sur le web (2026-08-09) :
  // le canal web évite la commission des stores (~3 €/mois/abonné à 59,99 €).
  // ⚠️ GARDE DE MASQUAGE : hors liste blanche et drapeau faux, aucun checkout
  // Business ne part — d'où qu'il soit demandé. C'est le filet du
  // filet : l'UI ne propose déjà rien (ConversionModal, PlanDetailsModal), mais
  // un appel resté branché quelque part ferait un CTA mort sur iOS (produit en
  // review = « produit introuvable ») ou vendrait sur le web un palier que
  // l'app mobile ne sait pas encore vendre.
  // ══ TUNNEL D'ABONNEMENT : journal (2026-08-09) ═══════════════════════════
  // Avant, `premium_cta_click` partait NU. Deux gestes très différents
  // tombaient donc dans le même compteur — « il a cliqué sur le bouton
  // d'en-tête pour s'abonner » et « l'app lui a ouvert la modale parce qu'il
  // n'avait plus de Pépites » — et les ouvertures automatiques (plafonds voix
  // / stock / Pépites) ne laissaient, elles, AUCUNE trace. Le nom de la
  // feature ne change pas (les relevés existants restent lisibles) ; tout le
  // détail vit dans `metadata` :
  //   · origine     — le point d'entrée EXACT (liste ORIGINES ci-dessous) ;
  //   · declencheur — 'clic' (geste de l'utilisateur) ou 'automatique'
  //                   (l'app a ouvert la modale sur un plafond atteint).
  //                   C'est CE champ qui sépare les deux populations en une
  //                   seule clause, sans avoir à connaître la liste des
  //                   origines par cœur.
  // Best-effort assumé : la télémétrie ne doit jamais bloquer ni ralentir un
  // paiement. Seule exception, `checkout_open` sur le web, qui est ATTENDU —
  // la redirection Stripe tue l'onglet et donc la requête en vol.
  //
  // ORIGINES (une valeur par point d'entrée, jamais deux points pour une) :
  //   entete                    bouton d'en-tête (web et natif)
  //   banniere_stock            bannière/bloc d'abonnement de l'onglet Stock
  //   banniere_ventes           bloc d'abonnement de l'onglet Ventes
  //   dashboard_stock_presque   carte « limite du plan gratuit » du dashboard
  //   stock_quota_atteint       bouton sous le compteur d'articles
  //   stock_republication_auto  bloc « Republication automatique » (Pro)
  //   stepper_publication       CTA « inventaire plein » du stepper (Stock/Lens)
  //   plafond_voix              50 analyses vocales/jour atteintes  (auto)
  //   plafond_stock             limite d'articles du plan gratuit   (auto)
  //   plafond_pepites_lens      Pépites insuffisantes — scan Lens    (auto)
  //   plafond_pepites_publi     Pépites insuffisantes — publication  (auto)
  //   modale_plan               carte de plan CHOISIE dans la modale
  const logTunnel=(feature,metadata={})=>{
    if(!user?.id) return Promise.resolve();
    return supabase.from('usage_logs').insert({user_id:user.id,feature,metadata})
      .then(({error})=>{if(error)console.warn(`[tunnel] ${feature} non journalisé :`,error.message);})
      .catch((e)=>{console.warn(`[tunnel] ${feature} non journalisé :`,e?.message??e);});
  };

  // Ouverture AUTOMATIQUE de la modale : l'utilisateur n'a rien demandé, il a
  // buté sur un plafond. Passe par ici pour que la ligne soit journalisée —
  // un setConversionModal nu ne laisse aucune trace.
  function ouvrirModalePlafond(origine,etat={}){
    logTunnel('premium_cta_click',{origine,declencheur:'automatique'});
    setConversionModal({open:true,origine,...etat});
  }

  function startTierCheckout(tier,origine='modale_plan'){
    const business=tier==='business';
    const pro=tier==='pro';
    if(business&&!businessOfferVisible(user?.id)){
      console.warn('[checkout] offre Business masquée (drapeau faux, compte hors liste blanche) — checkout non déclenché');
      return;
    }
    logTunnel(business?'business_cta_click':pro?'pro_cta_click':'premium_cta_click',{origine,declencheur:'clic',tier:business?'business':pro?'pro':'premium'});
    trackTikTokEvent("InitiateCheckout",user?.email,business?59.99:pro?29.99:12.99);
    if(business){isNative?handleIAPPurchase('business',origine):triggerCheckout('business',origine);}
    else if(pro){isNative?handleIAPPurchase('pro',origine):triggerCheckout('pro',origine);}
    else{isNative?handleIAPPurchase(undefined,origine):triggerCheckout(undefined,origine);}
  }
  // Ex-UpgradeModal, fusionnée dans ConversionModal : un tier explicite part
  // directement en checkout, sans tier on ouvre la modale de conversion.
  // `origine` : d'OÙ vient le geste — obligatoire en pratique, un appel qui
  // l'oublie se voit en base ('non_precisee') au lieu de se fondre dans la
  // masse.
  function openUpgradeModal(tier,origine='non_precisee',trigger='generic'){
    if(tier==='pro'||tier==='premium'||tier==='business'){startTierCheckout(tier,origine);return;}
    logTunnel('premium_cta_click',{origine,declencheur:'clic'});
    setConversionModal({open:true,trigger,origine});
  }

  // silencieux (2026-07-13) : les rafraîchissements d'ARRIÈRE-PLAN (retour de
  // visibilité, poll sentinelle) ne doivent pas faire clignoter le spinner —
  // les données se remplacent en place, sans état de chargement visible.
  async function fetchAll(uid,{silencieux=false}={}){
    // GARDE (2026-07-13) : sans uid, chaque requête ci-dessous part en
    // `user_id=eq.undefined` et revient en 400 — une dizaine d'erreurs, un
    // refetch entièrement raté, et des états (bandeaux, stock, profil) qui
    // restent silencieusement vides. Vécu sur confirmSaleFromBanner, qui
    // appelait `fetchAll()` sans argument. On échoue BRUYAMMENT plutôt que de
    // marteler la base avec des UUID invalides.
    if(!uid){
      console.error("[fetchAll] appelé sans user id — refetch annulé (aucune requête envoyée). C'est un bug d'appelant.");
      setLoading(false);
      return;
    }
    if(!silencieux) setLoading(true);
    const [v,i,p]=await Promise.all([
      // ⚠️ Tiebreaker `id` OBLIGATOIRE derrière created_at (06/08) : la sync
      // du dressing insère par tranches de 8 → jusqu'à 8 lignes partagent le
      // MÊME created_at à la milliseconde (mesuré en prod : groupes de 4 à 8).
      // Sans tiebreaker, Postgres rend les ex æquo dans un ordre ARBITRAIRE
      // qui change quand un UPDATE réécrit le tuple — or une republication
      // Vinted en fait plusieurs (vinted_item_id, listed_at_guess, prix…) et
      // la sonde jobs relance fetchAll à chaque changement de statut : la
      // carte de l'article SAUTAIT dans la liste plusieurs fois pendant les
      // ~10 min de l'opération, précisément quand l'utilisateur la suit.
      // `id` n'est jamais réécrit → ordre total stable, ici ET côté ventes
      // (même motif latent sur les insertions par lot).
      // ⚠️ Plafond relevé de 500 à 3000 (11/08), aligné sur `inventaire`.
      // Il était sur le point de casser : l'enregistrement groupé des ventes
      // Vinted importées (VentesTab) permet désormais d'écrire ~2 000 lignes
      // `ventes` d'un coup. Avec un plafond à 500, le fetchAll suivant n'en
      // relisait que 500 → `ventesInvIds` (App.jsx) en ignorait ~1 500 → les
      // articles correspondants RÉAPPARAISSAIENT dans « ventes Vinted à
      // enregistrer », déjà enregistrés. La bannière aurait redemandé un travail
      // déjà fait, et un second enregistrement aurait créé des doublons
      // (`ventes` n'a aucune contrainte d'unicité sur inventaire_id).
      supabase.from('ventes').select('*').eq('user_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(3000),
      // ⚠️ Plafond relevé de 500 à 3000 (03/08). Il était DÉJÀ atteint (800
      // lignes sur le compte de test) : au-delà, l'inventaire était tronqué en
      // silence et tous les totaux — investi, valeur du stock, bénéfices —
      // portaient sur une partie des données sans que rien ne le signale. La
      // sync du dressing, qui importe des centaines d'annonces d'un coup, en
      // faisait un problème quotidien.
      supabase.from('inventaire').select('*').eq('user_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(3000),
      supabase.from('profiles').select('is_premium,is_pro,is_business,is_comped,is_founder,apple_original_transaction_id,google_purchase_token,subscription_cancel_at_period_end,subscription_period_end,currency,username,platform_settings,extension_last_seen_at,extension_build,onboarded_at').eq('id',uid).maybeSingle(),
    ]);
    if(!v.error) setSales((v.data||[]).map(mapSale));
    if(!i.error) setItems((i.data||[]).map(mapItem));
    // Expression premium canonique (2026-07-25, cf. CLAUDE.md) : is_premium/is_pro
    // = source de vérité maintenue par les flux de paiement (Stripe/Apple/Google),
    // is_comped = comptes offerts. is_founder et les ids Apple/Google résiduels
    // ne valent PLUS statut premium — un abonnement résilié/expiré = free.
    let premiumValue=!!(p.data?.is_premium||p.data?.is_pro||p.data?.is_comped);
    console.log('[fetchAll] premium fields from Supabase:', {is_premium:p.data?.is_premium,is_pro:p.data?.is_pro,is_comped:p.data?.is_comped}, '→ resolved:', premiumValue, p.error?'ERROR:'+p.error.message:'');
    if(!p.error){
      setIsPremium(premiumValue);
      setIsPro(p.data?.is_pro===true);
      // is_business n'entre PAS dans premiumValue : l'expression canonique du
      // 2026-07-25 (CLAUDE.md) est identique partout et un Business porte de
      // toute façon is_premium ET is_pro. Il ne sert qu'à nommer le palier.
      setIsBusiness(p.data?.is_business===true);
      setUsername(p.data?.username||'');
      setSettingsLbcRue(p.data?.platform_settings?.leboncoin?.rue||'');
      setSettingsLbcCp(p.data?.platform_settings?.leboncoin?.code_postal||'');
      setSettingsLbcVille(p.data?.platform_settings?.leboncoin?.ville||'');
      setCancelAtPeriodEnd(p.data?.subscription_cancel_at_period_end===true);
      setCancelPeriodEnd(p.data?.subscription_period_end||null);
      setExtensionBuild(p.data?.extension_build??null);
      setExtensionLastSeenAt(p.data?.extension_last_seen_at??null);
      setExtensionSeenLoaded(true);
      // ── Onboarding : déclencheur PAR COMPTE (lot 2b, 2026-08-09) ───────────
      // AVANT : l'écran de choix était branché sur la confirmation de la modale
      // devise, elle-même gatée sur « profiles.currency est vide ». Or currency
      // porte un DÉFAUT EN BASE 'EUR' : la colonne n'est jamais vide à la
      // création d'un compte, la modale ne s'ouvrait donc JAMAIS et l'écran
      // était inerte pour 100 % des nouveaux inscrits (constat prod du 09/08 :
      // 6 derniers inscrits tous en currency='EUR', aucun n'a vu l'écran).
      // MAINTENANT : profiles.onboarded_at NULL = onboarding à faire. C'est un
      // fait de COMPTE et non d'appareil — un second téléphone ne refait pas
      // l'onboarding, et un compte neuf sur un appareil déjà utilisé ne le
      // saute pas. Le localStorage n'est plus qu'un cache anti-clignotement.
      // Garde de session : fetchAll rejoue à chaque refocus (SIGNED_IN). Si
      // l'écriture d'onboarded_at avait échoué, l'écran se rouvrirait à CHAQUE
      // retour sur l'app. On ne le rouvre donc pas dans la session où il vient
      // d'être terminé — un rechargement complet le remontrera, ce qui reste
      // le signal voulu si la base n'a pas été écrite.
      if(p.data?.onboarded_at==null&&!onboardingFiniRef.current){
        setShowOnboardingFlow(true);
        try{localStorage.removeItem(ONBOARD_DONE_KEY);}catch{/* cache seul */}
      }else if(p.data?.onboarded_at!=null){
        // La base fait autorité : un compte marqué onboardé ne doit pas voir
        // l'écran, même si le cache local d'un ancien appareil dit l'inverse.
        setShowOnboardingFlow(false);
        try{localStorage.setItem(ONBOARD_DONE_KEY,'1');}catch{/* cache seul */}
      }
      // ── Devise : lue du profil, jamais demandée (lot 5, décision Nico) ─────
      // La modale de choix à l'inscription est SUPPRIMÉE : le défaut 'EUR' en
      // base est le bon pour le marché, et demander la devise avant d'avoir
      // rendu le moindre service est une question administrative. Le réglage
      // reste dans les Paramètres (liste complète, section « Devise »), seule
      // porte d'entrée désormais. Elle était de toute façon INERTE — gatée sur
      // « currency vide », impossible avec un défaut en base.
      if(p.data?.currency){
        setCurrency(p.data.currency);
        try{localStorage.setItem('fs_currency',p.data.currency);}catch{/* cache seul */}
      }
      if(!p.data?.username){
        // Nom fourni par le provider OAuth (Google le renvoie à chaque connexion,
        // Apple seulement à la toute première) : Supabase le garde dans
        // user_metadata — on le PERSISTE dans profiles à la première entrée pour
        // ne plus jamais dépendre de la réponse du provider, et on ne demande
        // alors RIEN. getSession = lecture locale, pas d'appel réseau.
        const{data:{session:authSession}}=await supabase.auth.getSession();
        const meta=authSession?.user?.user_metadata||{};
        const providerName=String(meta.full_name||meta.name||'').trim().slice(0,30);
        if(providerName){
          const{error:unErr}=await supabase.rpc('set_profile_username',{p_username:providerName});
          if(!unErr)setUsername(providerName);
        } else {
          // Aucun nom nulle part (inscription e-mail) : la question est posée
          // DANS l'onboarding, à la fin. Plus de modale séparée qui s'ouvrait
          // au deuxième chargement — elle attendait fs_currency_confirmed,
          // posé au chargement précédent : personne ne la voyait au bon moment.
          setDemanderPseudo(true);
        }
      }
    }
    // Annonces à retirer (article vendu, frères encore live) — voir le bandeau.
    // ⚠️ REVERT 09/08 : l'élargissement à action='republish' (commit 7ace830)
    // a affiché 5 FAUX bandeaux « plus en ligne » (jobs republish au
    // platform_listing_id périmé, drapeautés à tort par le poll). Retour à
    // publish seul tant que la cause racine n'est pas corrigée.
    const{data:pendingRem}=await supabase.from('cross_post_jobs')
      .select('id, platform, title, inventaire_id, listing_url, platform_fields')
      .eq('user_id',uid).eq('status','cancelled').eq('action','publish')
      .contains('platform_fields',{pending_removal:true});
    setPendingRemovals(pendingRem||[]);

    // Annonces DISPARUES sans preuve de vente (2026-07-12) : le poll de
    // l'extension a constaté qu'elles ne sont plus en ligne, mais AUCUNE preuve
    // de vente n'a été trouvée (supprimée ? expirée ? vendue sans validation sur
    // la plateforme ?). Rien n'a été écrit en compta : c'est l'utilisateur qui
    // tranche via le bandeau. Une disparition n'est jamais une vente.
    // ── republish RÉOUVERT (2026-08-24, chantier détection des ventes) ──────
    // Le revert du 09/08 (publish seul) répondait à 5 faux bandeaux posés par
    // des jobs republish au platform_listing_id périmé. La cause racine est
    // corrigée depuis la 0.5.4 : le poll confronte l'id de listing_url à
    // inventaire.vinted_item_id et CLOT les jobs périmés (superseded_listing)
    // avant tout drapeau — et tout le parc est ≥ 0.6.1 (CWS). Laisser publish
    // seul rendait INVISIBLE toute vente d'une annonce republiée : le drapeau
    // était posé, personne ne le montrait. Ceinture supplémentaire ci-dessous :
    // un article dont une republication est VIVANTE n'affiche jamais ce bandeau.
    const{data:unavail}=await supabase.from('cross_post_jobs')
      .select('id, platform, title, price, inventaire_id, listing_url, platform_fields')
      .eq('user_id',uid).eq('status','published').in('action',['publish','republish'])
      .not('platform_fields->>unavailable_since','is',null);
    setUnavailableListings(unavail||[]);

    // Republications VIVANTES (pending/processing/needs_user) : leurs articles
    // sont EXCLUS de tout bandeau « Vendue ? » et de la revue des disparus —
    // c'est notre suppression (recréation en cours), pas une vente (garde A).
    const{data:repubActifs}=await supabase.from('cross_post_jobs')
      .select('inventaire_id')
      .eq('user_id',uid).eq('action','republish')
      .in('status',['pending','processing','needs_user'])
      .not('inventaire_id','is',null);
    setRepublishActifsInv(new Set((repubActifs||[]).map(r=>String(r.inventaire_id))));

    // (Les annonces invérifiables — platform_fields.check_unresolved — ne sont
    // plus lues ni affichées : bandeau supprimé le 2026-08-15, cf. plus haut.)
    setLoading(false);
    setAppLoading(false);
    const voiceCount=await checkAndResetDaily(supabase,uid,'voice_count_today','voice_count_date');
    setVoiceUsedToday(voiceCount);
  }

  // Solde + derniers mouvements de pièces, rechargés à chaque ouverture des
  // réglages ET de la modale de conversion : celle-ci affiche le vrai solde
  // (« Tu es en Free · X Pépites »), il ne doit jamais être vide faute d'avoir
  // ouvert les réglages avant. L'historique ne sert qu'aux réglages.
  useEffect(()=>{
    const ouvert=showSettings||conversionModal.open;
    if(!ouvert||!user)return;
    (async()=>{
      const{data:w}=await supabase.from('coin_wallets').select('included_balance,purchased_balance,reserved_balance').eq('user_id',user.id).maybeSingle();
      setCoinWallet(w??{included_balance:0,purchased_balance:0,reserved_balance:0});
      if(!showSettings)return;
      // 25 lignes et non plus 5 (2026-08-05) : release_publish (rendu par
      // plateforme échouée) et spend/refund_generate multiplient les lignes —
      // à 5, les remboursements automatiques étaient invisibles pour ceux
      // qu'ils concernent. Conteneur scrollable côté rendu.
      const{data:h}=await supabase.from('coin_ledger').select('delta,kind,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(25);
      setCoinHistory(h??[]);
    })();
  },[showSettings,conversionModal.open,user]);

  // Session déjà vue dans CE chargement de page : supabase-js ré-émet
  // SIGNED_IN au retour de focus d'onglet (session rafraîchie/restaurée) — sans
  // cette garde, le setTab(0) ci-dessous renvoyait l'utilisateur au Dashboard à
  // chaque retour sur l'onglet, en pleine publication (bug stepper 2026-07-18).
  const dejaConnecteRef=useRef(false);
  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data:{session}})=>{
      const u=session?.user??null;
      if(u){ dejaConnecteRef.current=true; setUser(u); fetchAll(u.id); setAuthLoading(false); }
      else setLoading(false);
    });
    if(isNative){
      initIAP().then(product=>{ if(mounted) setIapProduct(product); });
    }
    // Filet de rattrapage achat interrompu (iOS) : Transaction.updates relivre
    // au lancement les consumables payés mais jamais validés (app tuée entre
    // purchaseProduct et validate-coin-purchase). On rejoue la validation —
    // idempotente côté RPC — avant de finish. Session pas encore restaurée →
    // on jette : la transaction reste en file pour le prochain lancement.
    let coinRecoveryHandle=null;
    if(isNative&&Capacitor.getPlatform()==='ios'){
      listenCoinTransactionUpdates(async(tx)=>{
        const{data:{session:rcSess}}=await supabase.auth.getSession();
        const rcToken=rcSess?.access_token;
        if(!rcToken) throw new Error('session absente — nouvel essai au prochain lancement');
        const r=await fetch(`${supabaseUrl}/functions/v1/validate-coin-purchase`,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${rcToken}`,'apikey':supabaseAnonKey},
          body:JSON.stringify({platform:'ios',productId:tx.productIdentifier,receipt:tx.receipt,jwsRepresentation:tx.jwsRepresentation}),
        });
        const body=await r.json().catch(()=>({}));
        if(!r.ok||body.error) throw new Error(body.error||`HTTP ${r.status}`);
      }).then(h=>{coinRecoveryHandle=h;}).catch(e=>console.error('[IAP] listener rattrapage:',e?.message));
    }
    // Filet de rattrapage Android (2026-07-27) : pas de Transaction.updates ici,
    // on interroge Play directement au lancement (achats inapp non consommés)
    // et on rejoue la validation idempotente AVANT de consumer. Vécu le 27/07 :
    // pack de Pépites débité (achat probablement passé PENDING pendant la
    // feuille Google) jamais crédité, zéro appel serveur.
    if(isNative&&platform==='android'){
      supabase.auth.getSession().then(async({data:{session:rcSess}})=>{
        const rcToken=rcSess?.access_token;
        if(!rcToken) return; // session pas encore restaurée → prochain lancement
        const recovered=await recoverAndroidCoinPurchases(async(p)=>{
          // validate-google-purchase depuis le 2026-08-05 : la branche android
          // de validate-coin-purchase a été retirée le même jour. Oublier ce
          // filet dans la bascule aurait rendu irrécupérable exactement l'achat
          // qu'il existe pour rattraper.
          const r=await fetch(`${supabaseUrl}/functions/v1/validate-google-purchase`,{
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${rcToken}`,'apikey':supabaseAnonKey},
            body:JSON.stringify({productId:p.productIdentifier,purchaseToken:p.purchaseToken,userId:rcSess.user.id}),
          });
          const body=await r.json().catch(()=>({}));
          if(!r.ok||body.error) throw new Error(body.error||`HTTP ${r.status}`);
        });
        if(recovered>0&&rcSess?.user?.id) fetchAll(rcSess.user.id,{silencieux:true});
      }).catch(e=>console.error('[IAP] rattrapage Android:',e?.message));
    }
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      const u=session?.user??null;
      setUser(u);
      if(event==='INITIAL_SESSION') setAuthLoading(false);
      if(u){
        // Retour au Dashboard UNIQUEMENT sur une connexion réelle (aucune
        // session vue jusqu'ici), pas sur les SIGNED_IN de refocus d'onglet.
        if(event==='SIGNED_IN'){
          setIsSigningIn(false);
          if(!dejaConnecteRef.current){ setTab(0); localStorage.setItem('tab','0'); }
        }
        dejaConnecteRef.current=true;
        fetchAll(u.id);
      }else{dejaConnecteRef.current=false;setSales([]);setItems([]);setLoading(false);setAppLoading(false);}
    });
    return()=>{ mounted=false; subscription.unsubscribe(); coinRecoveryHandle?.remove?.(); };
  },[]);

  // ── Refetch au retour de visibilité (2026-07-13) ────────────────────────────
  // L'extension écrit en base pendant que l'app est OUVERTE (retraits
  // cross-plateforme terminés, sale_signal posés, statuts de jobs) et rien ne
  // relisait ces états tant que l'utilisateur n'agissait pas : les bandeaux
  // n'apparaissaient qu'après un F5 manuel (vécu : vente Vinted confirmée,
  // retraits eBay/LBC réussis en tâche de fond, app muette). Revenir sur
  // l'onglet/la fenêtre déclenche désormais un fetchAll silencieux (aucun
  // spinner), au plus un toutes les 30 s.
  const derniereVisibiliteRef=useRef(0);
  useEffect(()=>{
    if(!user?.id) return;
    const onVisible=()=>{
      if(document.visibilityState!=='visible') return;
      const maintenant=Date.now();
      if(maintenant-derniereVisibiliteRef.current<30_000) return;
      derniereVisibiliteRef.current=maintenant;
      fetchAll(user.id,{silencieux:true});
    };
    document.addEventListener('visibilitychange',onVisible);
    return()=>document.removeEventListener('visibilitychange',onVisible);
  },[user?.id]);

  // ── Poll sentinelle des jobs (2026-07-13) ───────────────────────────────────
  // Pendant que l'app est VISIBLE : une seule petite requête toutes les 45 s
  // sur cross_post_jobs (statuts + marqueurs de bandeaux extraits du JSON) ;
  // fetchAll complet UNIQUEMENT si l'empreinte a changé — zéro martèlement
  // quand rien ne bouge, et le bandeau de retrait apparaît en ≤ 45 s quand
  // l'extension termine un retrait en tâche de fond, sans F5 ni changement
  // d'onglet. ⚠️ Pas de colonne updated_at sur cross_post_jobs (vérifié en
  // base, aucun trigger non plus) : l'empreinte porte sur les champs qui
  // pilotent réellement les bandeaux et les chips, pas sur un horodatage.
  const empreinteJobsRef=useRef(null);
  useEffect(()=>{
    if(!user?.id) return;
    empreinteJobsRef.current=null; // nouvel utilisateur = nouvelle référence
    let arret=false;
    const sonde=async()=>{
      if(document.visibilityState!=='visible') return;
      const {data,error}=await supabase.from('cross_post_jobs')
        .select('id,status,last_checked_at,sale_signal:platform_fields->>sale_signal,unavailable_since:platform_fields->>unavailable_since,pending_removal:platform_fields->>pending_removal,check_unresolved_since:platform_fields->>check_unresolved_since')
        .eq('user_id',user.id)
        .order('created_at',{ascending:false})
        .limit(80);
      if(arret||error||!data) return;
      const empreinte=JSON.stringify(data);
      if(empreinteJobsRef.current===null){ empreinteJobsRef.current=empreinte; return; } // 1re lecture = référence, pas de refetch
      if(empreinte!==empreinteJobsRef.current){
        empreinteJobsRef.current=empreinte;
        fetchAll(user.id,{silencieux:true});
      }
    };
    sonde();
    const t=setInterval(sonde,45_000);
    return()=>{arret=true;clearInterval(t);};
  },[user?.id]);


  const buy=parseFloat(cBuy)||0;
  const sell=parseFloat(cSell)||0;
  const ship=parseFloat(cShip)||0;
  const margin=sell-buy-ship;
  const marginPct=sell>0?(margin/sell)*100:0;
  const isValid=sell>0&&buy>=0;
  const mc=margin<0?C.red:C.green;

  const calcWasComplete = useRef(false);
  useEffect(()=>{
    const complete = Boolean(cBuy && cSell && cShip);
    if(complete && !calcWasComplete.current){
      track('use_calculator', { has_result: true, is_positive: margin > 0 });
    }
    calcWasComplete.current = complete;
  },[cBuy, cSell, cShip, margin]);

  const now=new Date();

  // KPI mois courant — indépendant du filtre
  const currentMonthSales=sales.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===now.getMonth()&&sd.getFullYear()===now.getFullYear();});
  // `reduce((a,s)=>a+s.margin,0)` additionnait les marges null comme des 0 : le
  // « bénéfice du mois » du dashboard était donc juste seulement si TOUTES les
  // ventes du mois avaient un prix d'achat. `count` reste le nombre RÉEL de
  // ventes ; `sansAchat` dit combien d'entre elles ne sont pas comptabilisées.
  const _tmMarge=totalMarge(currentMonthSales);
  const tm={profit:_tmMarge.total,count:currentMonthSales.length,retenues:_tmMarge.retenues,sansAchat:_tmMarge.exclus};

  function buildChartData(salesArr,range){
    const byMonth=(n)=>Array.from({length:n},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(n-1)+i,1);
      const m=d.getMonth();const y=d.getFullYear();
      const ms=salesArr.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
      const MONTHS=lang==='en'?MONTHS_EN:MONTHS_FR;
      return{name:MONTHS[m],profit:ms.reduce((a,s)=>a+s.margin,0),"Marge %":ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:0};
    });
    if(range==='7j'){
      return Array.from({length:7},(_,i)=>{
        const d=new Date(now);d.setDate(d.getDate()-6+i);
        const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd.toDateString()===d.toDateString();});
        return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:ds.reduce((a,s)=>a+s.margin,0),"Marge %":ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:0};
      });
    }
    if(range==='1M'){
      return Array.from({length:4},(_,i)=>{
        const end=new Date(now);end.setDate(end.getDate()-i*7);
        const start=new Date(end);start.setDate(start.getDate()-6);
        const ds=salesArr.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
        return{name:`S${4-i}`,profit:ds.reduce((a,s)=>a+s.margin,0),"Marge %":ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:0};
      }).reverse();
    }
    if(range==='1A') return byMonth(12);
    if(range==='YTD') return byMonth(now.getMonth()+1);
    return byMonth(6); // 6M default
  }

  const mData=buildChartData(sales,selectedRange);
  const hasData=sales.length>0;

  const _f={family:"'Space Grotesk', -apple-system, sans-serif",size:11};
  const _tip={backgroundColor:'#ffffff',titleColor:'#A3A9A6',borderColor:'rgba(0,0,0,0.08)',borderWidth:1,padding:12,cornerRadius:10,displayColors:false,titleFont:{..._f,size:11,weight:'700'},bodyFont:{..._f,size:14,weight:'700'}};
  const _scales=(unit)=>({
    x:{grid:{display:false},border:{display:false},ticks:{color:'#A3A9A6',font:_f}},
    y:{grid:{color:'#E5E7EB',drawTicks:false},border:{display:false},ticks:{color:'#A3A9A6',font:_f,padding:8,callback:unit==='€'?v=>fmt(v,0):v=>v+unit}},
  });
  const barChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d.profit),
      backgroundColor:'#1D9E75',
      hoverBackgroundColor:'#0F6E56',
      borderRadius:8,
      borderSkipped:false,
    }],
  };
  const lineChartData={
    labels:mData.map(d=>d.name),
    datasets:[{
      data:mData.map(d=>d['Marge %']),
      borderColor:'#F9A26C',
      backgroundColor:'rgba(249,162,108,0.10)',
      borderWidth:3,
      tension:0.4,
      pointBackgroundColor:'#F9A26C',
      pointBorderColor:'#ffffff',
      pointBorderWidth:2,
      pointRadius:4,
      pointHoverRadius:6,
      fill:true,
    }],
  };
  const barOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#1D9E75',callbacks:{title:([i])=>i.label,label:ctx=>fmt(ctx.raw||0)}}},
    scales:_scales('€'),
  };
  const lineOpts={
    responsive:true,maintainAspectRatio:false,
    animation:{duration:700,easing:'easeOutQuart'},
    plugins:{legend:{display:false},tooltip:{..._tip,bodyColor:'#F9A26C',callbacks:{title:([i])=>i.label,label:ctx=>`${(ctx.raw||0).toFixed(1)} %`}}},
    scales:_scales('%'),
  };
  // ── KPIs du dashboard : GLOBAUX, plus jamais fenêtrés (2026-08-03 soir) ──
  // « Profit net », « Revenu brut · total encaissé » et le compteur de ventes
  // passaient par filterSalesByRange (défaut 6 mois) alors que leurs libellés
  // affirment un TOTAL : le sélecteur de période ne pilote désormais que les
  // graphes (buildChartData), comme le disait déjà son commentaire côté
  // DashboardTab. Conséquence voulue : une vente SANS date (import dressing,
  // « date : je ne sais plus ») compte dans ces totaux — avec une date, elle
  // tombait en janvier 1970 via new Date(null) et sortait de TOUTES les
  // fenêtres : la saisie semblait n'avoir servi à rien. Les compteurs de
  // PÉRIODE (tm « ce mois », courbes) continuent, eux, de l'ignorer : c'est
  // leur définition.
  const salesForKpis=sales;
  // RÈGLE DE COMPTABILISATION (03/08) : une vente sans prix d'achat connu
  // n'entre dans AUCUN total de bénéfice. `reduce((a,s)=>a+s.margin,0)` lisait
  // un null comme 0 : le bénéfice n'était pas faux de peu, il était calculé sur
  // un dénominateur (le CA) qui, lui, incluait ces ventes → marge moyenne
  // écrasée. Le CA reste calculé sur TOUTES les ventes : il est vrai, lui.
  const {total:totalM,exclus:ventesSansAchat}=totalMarge(salesForKpis);
  const totalR=totalCA(salesForKpis);
  const caComptabilise=totalCA(comptabilisables(salesForKpis));
  const avgM=caComptabilise>0?(totalM/caComptabilise)*100:0;
  const stock=useMemo(()=>items.filter(i=>i.statut==="stock"),[items]);
  const sold=useMemo(()=>items.filter(i=>i.statut==="vendu"),[items]);
  // Vendus importés du dressing SANS ligne `ventes` : Vinted ne communique ni
  // la date de vente ni le prix réellement payé — la ligne de vente n'est
  // écrite QUE quand l'utilisateur complète (VentesTab, mode dédié). Le lien
  // se fait par ventes.inventaire_id, posé par ce flux d'enregistrement.
  const ventesInvIds=useMemo(()=>new Set(sales.map(s=>s.inventaire_id).filter(v=>v!=null).map(String)),[sales]);
  const vendusAEnregistrer=useMemo(
    ()=>sold.filter(i=>i.origine==='vinted_sync'&&!ventesInvIds.has(String(i.id))),
    [sold,ventesInvIds]);
  // Photos par ligne d'inventaire (2026-08-27, vignettes de l'onglet Ventes) :
  // la table `ventes` ne porte AUCUNE photo, mais chaque vente pointe son
  // article via ventes.inventaire_id — la vignette se lit donc ici, dans les
  // lignes inventaire déjà chargées. Lookup pur, aucune requête ajoutée.
  const photosParInventaire=useMemo(()=>{
    const m={};
    for(const i of items){ if(Array.isArray(i.photos)&&i.photos.length) m[i.id]=i.photos; }
    return m;
  },[items]);
  // origine : chaque écran qui monte la bannière dit d'où vient le clic.
  // Sans elle, StockTab et VentesTab seraient indiscernables en base.
  const BoundPremiumBanner=useMemo(()=>{const C=(props)=><PremiumBanner {...props} onOpenModal={()=>openUpgradeModal(null,props.origine??'banniere')}/>;return C;},[user]);
  function searchMatch(item,query){
    if(!query.trim())return true;
    const q=query.toLowerCase().trim();
    return item.title?.toLowerCase().includes(q)||item.marque?.toLowerCase().includes(q)||item.description?.toLowerCase().includes(q)||item.type?.toLowerCase().includes(q);
  }
  // ── Tri du Stock en DEUX groupes (2026-08-07, validé Nico) ────────────────
  // Groupe 1 : articles SANS annonce Vinted en ligne — ordre d'origine
  // (créé récemment d'abord) : c'est le flux « je viens de l'ajouter, je
  // publie », il ne bouge pas. Groupe 2 : articles EN LIGNE, du plus VIEUX
  // listed_at_guess au plus récent — la pile à republier. Les dates
  // inconnues (NULL) ferment le groupe 2 : on ne prétend pas vieux ce qu'on
  // ne sait pas dater. Départage par position d'origine : deux dates égales
  // ne permutent jamais (l'acquis anti-saut de 1544c38 tient).
  // ⚠️ Le tri vit ICI (avant le slice de stockVisible) : trié après coupe,
  // les 10 premiers seraient les 10 de l'ancien ordre.
  const stockFiltre=useMemo(()=>{
    const filtres=stock
      .filter(i=>filterType==="Tous"||i.type===filterType)
      .filter(i=>filterMarque==="Toutes"||(i.marque?.toLowerCase()===filterMarque.toLowerCase()))
      .filter(i=>searchMatch(i,search));
    const enLigneVinted=(i)=>!!i.vinted_item_id&&!i.disparu_le;
    const g1=filtres.filter(i=>!enLigneVinted(i));
    const g2=filtres.map((i,k)=>[i,k]).filter(([i])=>enLigneVinted(i))
      .sort((a,b)=>{
        const ta=Date.parse(a[0].listed_at_guess??'');
        const tb=Date.parse(b[0].listed_at_guess??'');
        const va=Number.isFinite(ta)?ta:Infinity;
        const vb=Number.isFinite(tb)?tb:Infinity;
        if(va!==vb)return va<vb?-1:1;
        return a[1]-b[1];
      })
      .map(([i])=>i);
    return [...g1,...g2];
  },[stock,filterType,filterMarque,search]);
  const soldFiltre=useMemo(()=>sold
    .filter(i=>filterType==="Tous"||i.type===filterType)
    .filter(i=>filterMarqueSold==="Toutes"||(i.marque?.toLowerCase()===filterMarqueSold.toLowerCase()))
    .filter(i=>searchMatch(i,search)),[sold,filterType,filterMarqueSold,search]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(filterMarque!=="Toutes"&&!stock.some(i=>i.marque===filterMarque))setFilterMarque("Toutes");},[stock,filterMarque]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(filterMarqueSold!=="Toutes"&&!sold.some(i=>i.marque===filterMarqueSold))setFilterMarqueSold("Toutes");},[sold,filterMarqueSold]);
  useEffect(()=>{setSoldShowAll(false);},[filterMarqueSold]);
  useEffect(()=>{setShowAllStock(false);},[filterMarque]);
  useEffect(()=>{setSoldShowAll(false);setShowAllStock(false);},[search]);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=0;},[tab]);
  useEffect(()=>{setSoldShowAll(false);setShowAllStock(false);setFilterMarque("Toutes");setFilterMarqueSold("Toutes");},[filterType]);
  const soldVisible=useMemo(()=>soldShowAll?soldFiltre:soldFiltre.slice(0,10),[soldFiltre,soldShowAll]);
  const stockVisible=useMemo(()=>showAllStock?stockFiltre:stockFiltre.slice(0,10),[stockFiltre,showAllStock]);
  // ── « Je ne sais plus » qui TIENT au rechargement (2026-08-11) ────────────
  // Le drapeau prix_achat_inconnu vit sur `inventaire`, jamais sur `ventes`
  // (schéma vérifié le 03/08). Conséquence assumée jusqu'ici : la décision ne
  // tenait « que le temps de l'écran », et au prochain fetchAll les ventes
  // marquées revenaient dans « à compléter ». Tolérable sur 3 lignes ; pas sur
  // 1 982 — l'utilisateur referait le geste à chaque ouverture, indéfiniment.
  // On recolle donc le drapeau côté client par ventes.inventaire_id, sans
  // migration ni colonne nouvelle. comptabilisable() lit déjà
  // `prix_achat_inconnu` sur l'objet vente : il suffit qu'il y soit.
  const invPrixInconnu=useMemo(
    ()=>new Set(items.filter(i=>i.prix_achat_inconnu===true).map(i=>String(i.id))),
    [items]);
  const salesAvecInconnu=useMemo(()=>{
    if(!invPrixInconnu.size) return sales;
    return sales.map(s=>(s.inventaire_id!=null&&invPrixInconnu.has(String(s.inventaire_id))&&s.buy==null)
      ?{...s,prix_achat_inconnu:true}
      :s);
  },[sales,invPrixInconnu]);
  const groupedSales=useMemo(()=>groupSales(salesAvecInconnu),[salesAvecInconnu]);
  const visibleSales=useMemo(()=>(showAllSales?groupedSales:groupedSales.slice(0,10)).filter(s=>searchMatch(s,searchHistory)),[groupedSales,showAllSales,searchHistory]);
  // Total investi / valeur du stock : les articles sans prix d'achat sont
  // ÉCARTÉS. L'ancien reduce n'avait même pas de `||0` — un buy null comptait 0
  // et un undefined produisait un NaN qui contaminait tout le total affiché.
  const invested=useMemo(()=>totalInvesti(items),[items]);
  const stockVal=useMemo(()=>totalInvesti(stock),[stock]);
  const stockSansPrixAchat=useMemo(()=>nbSansPrixAchat(stock),[stock]);
  const stockQty=useMemo(()=>stock.reduce((a,i)=>a+(i.quantite||1),0),[stock]);
  const soldQty=useMemo(()=>sold.reduce((a,i)=>a+(i.quantite||1),0),[sold]);
  const recovered=sales.reduce((a,s)=>a+s.sell,0);

  function resetVoiceFlow(){
    setVoiceText("");setVoiceLoading(false);setVoiceStep("");
    setVoiceParsed(null);setVoiceError(null);
    setVoiceZoneResults([]);
  }

  async function callVoiceParse(text){
    // Quota check — vocal free 5/jour
    if(!isPremium){
      const count=await checkAndResetDaily(supabase,user.id,'voice_count_today','voice_count_date');
      if(count>=VOICE_FREE_LIMIT){
        ouvrirModalePlafond('plafond_voix',{trigger:'voice'});
        setVoiceStep("");return;
      }
      {const{error:qErr}=await supabase.from('profiles').update({voice_count_today:count+1,voice_count_date:new Date().toISOString().split('T')[0]}).eq('id',user.id).select('voice_count_today');
       if(qErr)console.warn('[quota] compteur vocal non enregistré:',qErr.message);}
      supabase.from('usage_logs').insert({user_id:user.id,feature:'voice'}).then(()=>{});
      setVoiceUsedToday(count+1);
    }
    setVoiceStep("parsing");setVoiceLoading(true);
    try{
      const{data:{session:vpSess}}=await supabase.auth.getSession();
      const vpToken=vpSess?.access_token;
      if(!vpToken)throw new Error(lang==="en"?"Session expired, please reconnect.":"Session expirée, reconnectez-vous.");
      // Snapshot du stock — identique au FAB vocal
      const stockSnap=items.filter(i=>i.statut!=="vendu").map(i=>({id:i.id,nom:i.title||i.nom||"",marque:i.marque||null,type:i.type||null,description:i.description||null,emplacement:i.emplacement||null,quantite:i.quantite||1,prix_achat:i.buy??i.prix_achat??null}));
      const iRes=await fetch(`${supabaseUrl}/functions/v1/voice-intent`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${vpToken}`,"apikey":supabaseAnonKey},body:JSON.stringify({text,lang,currency,items:stockSnap})});
      if(!iRes.ok){
        const iErrJson=await iRes.json().catch(()=>({}));
        if(iErrJson?.error==='ai_unavailable'||iRes.status===503){setToast({visible:true,message:lang==='fr'?'⏳ IA temporairement indisponible. Réessaie dans 30 secondes.':'⏳ AI temporarily unavailable. Please retry in 30 seconds.'});setTimeout(()=>setToast({visible:false,message:''}),5000);setVoiceStep("");setVoiceLoading(false);return;}
        if(iRes.status===429||iErrJson?.error==='quota_exceeded'){/* 50/j Free (2026-07-23), Premium/Pro illimités */ouvrirModalePlafond('plafond_voix',{trigger:'voice'});setVoiceStep("");setVoiceLoading(false);return;}
        throw new Error(lang==="en"?"Intent failed":"Erreur intention");
      }
      let iJson;try{iJson=await iRes.json();}catch{throw new Error(lang==="en"?"Invalid server response":"Réponse serveur invalide");}
      const{tasks,error:iErr}=iJson;
      if(iErr)throw new Error(iErr);
      if(!Array.isArray(tasks)||!tasks.length)throw new Error(lang==="en"?"Nothing understood":"Rien compris");
      const{results}=await executeVoiceTasks(tasks,{items,sales,lang,currency,country:userCountry?.code??getCountryFallback(),actions:vaActions,supabaseUrl,token:vpToken,userId:user?.id??null});
      // Vente directe auto si article non trouvé en stock (no_match) — identique au FAB
      const resolvedResults=await Promise.all(results.map(async r=>{
        if(r.status==="pending_confirmation"&&r.intent==="inventory_sell"&&r.taskData?.no_match&&!r.taskData?.price_ambiguous){
          try{const dmCat=r.taskData?.categorie||r.taskData?.type||null;await vaActions.addDirectSale({nom:r.taskData?.nom,marque:r.taskData?.marque,type:dmCat,description:r.taskData?.description||null,prix_vente:r.taskData?.prix_vente,prix_achat:r.taskData?.prix_achat,quantite_vendue:r.taskData?.quantite_vendue,plateforme:r.taskData?.plateforme||null});return{...r,status:"success",message:lang==="en"?"Sale recorded":"Vente enregistrée"};}
          catch(e){return{...r,status:"error",message:e.message};}
        }
        return r;
      }));
      const groupedResults=groupSellLots(resolvedResults,items);
      setVoiceZoneResults(groupedResults);setVoiceStep("done");
    }catch(e){
      setVoiceError(e.message||"Erreur analyse");setVoiceStep("error");
    }
    setVoiceLoading(false);
  }

  async function addItemsFromVoice(){
    if(!voiceParsed?.items?.length)return;
    let idBase=Date.now();
    // Même assiette que le trigger serveur : non vendus, HORS dressing
    // synchronisé (compteArticlesQuota). Limite = miroir 200 partagé.
    let insertedCount=compteArticlesQuota(items);
    const{data:{session:avSess}}=await supabase.auth.getSession();
    const avToken=avSess?.access_token;
    for(const item of voiceParsed.items){
      if(!isPremium&&insertedCount>=FREE_STOCK_LIMIT_FALLBACK){try{ouvrirModalePlafond('plafond_stock',{trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?`${FREE_STOCK_LIMIT_FALLBACK} item limit reached. Upgrade to Premium for unlimited stock.`:`Limite de ${FREE_STOCK_LIMIT_FALLBACK} articles atteinte. Passez Premium pour un stock illimité.`});setTimeout(()=>setToast({visible:false,message:""}),4000);}break;}
      const qty=Math.max(1,item.quantite||1);
      const isVente=voiceParsed.action==='vente';
      const bRaw=voiceParsed.isLot?(parseFloat(item.prix_estime_lot)||0)/qty:(parseFloat(item.prix_achat)||0);
      const s=voiceParsed.isLot?0:(parseFloat(item.prix_vente)||0);
      // Résoudre les frais — priorité : absolu total (frais_global/frais_montant) > pourcentage > unitaire
      const fraisG=parseFloat(item.frais_global)||parseFloat(item.frais_montant)||0;
      const fraisPct=parseFloat(item.frais_pourcentage)||0;
      const fraisU=fraisG>0?fraisG/qty:fraisPct>0?(isVente?s:bRaw)*fraisPct/100:(parseFloat(item.frais_unitaire)||0);
      // Pour achat non-lot : l'IA a inclus fraisU dans prix_achat → on sépare prix de base et frais
      // Pour lot achat : prix_estime_lot ne contient pas de frais → fraisU va dans purchase_costs
      // Pour vente : fraisU sont des frais de vente → selling_fees (ne pas toucher prix_achat)
      const b=(!isVente&&!voiceParsed.isLot)?(bRaw-fraisU):bRaw;
      const pc=isVente?0:fraisU;
      const sf=isVente?fraisU:0;
      const hasS=s>0;
      const cogs=b+pc;
      const mg=hasS?s-cogs-sf:0;
      const mgp=hasS?(mg/s)*100:0;
      const marqueNorm=normalizeMarque(item.marque);
      const _td1=detectType(item.nom||"",marqueNorm);const typeAuto=(item.categorie&&item.categorie!=='Luxe')?item.categorie:_td1;
      let nomNorm=item.nom||"Article";
      if(avToken&&(qty>1||voiceParsed.isLot)){try{const nRes=await fetch(`${supabaseUrl}/functions/v1/normalize-title`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${avToken}`,"apikey":supabaseAnonKey},body:JSON.stringify({titre:nomNorm})});if(nRes.ok){const nJson=await nRes.json();if(nJson?.nom)nomNorm=nJson.nom;}}catch{}}
      const row={id:idBase++,user_id:user.id,titre:stripMarque(nomNorm,marqueNorm),prix_achat:b,prix_vente:hasS?s:null,margin:hasS?mg:null,margin_pct:hasS?mgp:null,statut:hasS?"vendu":"stock",date:item.date?new Date(item.date).toISOString():new Date().toISOString(),marque:marqueNorm,description:item.description||null,type:typeAuto,purchase_costs:pc,selling_fees:hasS?sf:0,quantite:qty,emplacement:item.emplacement||null,plateforme:item.plateforme||null};
      const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(!error){
        if(!hasS) insertedCount++;
        setItems(prev=>[mapItem(data),...prev]);
        if(hasS){
          const srow={id:idBase++,user_id:user.id,titre:stripMarque(nomNorm,marqueNorm),prix_achat:b,prix_vente:s,benefice:mg,marque:marqueNorm||null,type:typeAuto||null,description:item.description||null,emplacement:item.emplacement||null,date:item.date||new Date().toISOString().split('T')[0],selling_fees:sf,purchase_costs:pc,plateforme:item.plateforme||null};
          const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
          if(sd)setSales(prev=>[mapSale(sd),...prev]);
        }
      }
    }
    const n=voiceParsed.items.length;
    setToast({visible:true,message:lang==='fr'?`✅ ${n} article${n>1?"s":""} ajouté${n>1?"s":""} !`:`✅ ${n} item${n>1?"s":""} added!`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    resetVoiceFlow();
  }

  async function handleLotDistribute(){
    if(!lotManualTotal||lotManualItems.some(i=>!i.nom.trim()))return;
    setLotDistributing(true);
    try{
      const res=await fetch("https://tojihnuawsoohlolangc.supabase.co/functions/v1/lot-distribute",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({lotTotal:parseFloat(lotManualTotal),items:lotManualItems.filter(i=>i.nom.trim()),lang}),
      });
      if(!res.ok)throw new Error("Distribution failed");
      const result=await res.json();
      if(result.error)throw new Error(result.error);
      setLotDistributed(result);
    }catch(e){
      setToast({visible:true,message:"❌ "+(e.message||"Erreur répartition")});
      setTimeout(()=>setToast({visible:false,message:""}),3000);
    }
    setLotDistributing(false);
  }

  async function addLotToInventory(){
    if(!lotDistributed?.items?.length)return;
    let idBase=Date.now();
    let insertedCount=compteArticlesQuota(items);
    const{data:{session:ntSess}}=await supabase.auth.getSession();
    const ntToken=ntSess?.access_token;
    for(const item of lotDistributed.items){
      if(!isPremium&&insertedCount>=FREE_STOCK_LIMIT_FALLBACK){try{ouvrirModalePlafond('plafond_stock',{trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?`${FREE_STOCK_LIMIT_FALLBACK} item limit reached. Upgrade to Premium for unlimited stock.`:`Limite de ${FREE_STOCK_LIMIT_FALLBACK} articles atteinte. Passez Premium pour un stock illimité.`});setTimeout(()=>setToast({visible:false,message:""}),4000);}break;}
      const b=parseFloat(item.prix_estime_lot)||0;
      const marqueNorm=normalizeMarque(item.marque);
      const _td2=detectType(item.nom||"",marqueNorm);const typeAuto=(item.categorie&&item.categorie!=='Luxe')?item.categorie:_td2;
      // Récupérer les frais d'achat depuis voiceParsed si disponibles (même frais_global pour tout le lot)
      const lotFraisG=parseFloat(voiceParsed?.items?.[0]?.frais_global)||0;
      const lotFraisU=lotFraisG>0?lotFraisG/(voiceParsed?.items?.length||1):(parseFloat(voiceParsed?.items?.[0]?.frais_unitaire)||0);
      let nomNorm=item.nom||"Article";
      if(ntToken){try{const nRes=await fetch(`${supabaseUrl}/functions/v1/normalize-title`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${ntToken}`,"apikey":supabaseAnonKey},body:JSON.stringify({titre:nomNorm})});if(nRes.ok){const nJson=await nRes.json();if(nJson?.nom)nomNorm=nJson.nom;}}catch{}}
      const row={id:idBase++,user_id:user.id,titre:stripMarque(nomNorm,marqueNorm),prix_achat:b,prix_vente:null,margin:null,margin_pct:null,statut:"stock",date:new Date().toISOString(),marque:marqueNorm,description:item.description||null,type:typeAuto,purchase_costs:lotFraisU,selling_fees:0,quantite:1,plateforme:voiceParsed?.items?.[0]?.plateforme||null};
      const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(!error){insertedCount++;setItems(prev=>[mapItem(data),...prev]);}
    }
    const n=lotDistributed.items.length;
    setToast({visible:true,message:lang==='fr'?`✅ ${n} article${n>1?"s":""} ajouté${n>1?"s":""} !`:`✅ ${n} item${n>1?"s":""} added!`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    setLotDistributed(null);setLotManualItems([{nom:""},{nom:""}]);setLotManualTotal("");setManualMode("single");
  }

  async function addItem(){
    if(!iTitle||!iBuy)return;
    if(!isPremium&&compteArticlesQuota(items)>=FREE_STOCK_LIMIT_FALLBACK){try{ouvrirModalePlafond('plafond_stock',{trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?`${FREE_STOCK_LIMIT_FALLBACK} item limit reached. Upgrade to Premium for unlimited stock.`:`Limite de ${FREE_STOCK_LIMIT_FALLBACK} articles atteinte. Passez Premium pour un stock illimité.`});setTimeout(()=>setToast({visible:false,message:""}),4000);}return;}
    const b=parseFloat(iBuy)||0;const pc=parseFloat(iPurchaseCosts)||0;const s=iAlreadySold?(parseFloat(iSell)||0):0;const sf=iAlreadySold?(parseFloat(iSellingFees)||0):0;const hasS=iAlreadySold&&s>0;
    const cogs=b+pc;const mg=hasS?s-cogs-sf:0;const mgp=hasS?(mg/s)*100:0;
    const marqueNormalized=normalizeMarque(iMarque);
    const typeAuto=iType||detectType(iTitle,marqueNormalized);
    const row={id:Date.now(),user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:hasS?s:null,margin:hasS?mg:null,margin_pct:hasS?mgp:null,statut:hasS?"vendu":"stock",date:new Date().toISOString(),marque:marqueNormalized,description:iDesc||null,type:typeAuto,purchase_costs:pc,selling_fees:hasS?sf:0,quantite:iQuantite||1,emplacement:iEmplacement||null,plateforme:iPlateforme||null};
    const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
    if(!error){
      track('add_item', { purchase_price: b, has_sell_price: hasS });
      setItems(prev=>[mapItem(data),...prev]);
      if(hasS){
        const srow={id:Date.now()+1,user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:s,benefice:mg,marque:marqueNormalized||null,type:typeAuto||null,description:iDesc||null,emplacement:iEmplacement||null,date:new Date().toISOString().split('T')[0],plateforme:iPlateforme||null};
        const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
        if(sd) setSales(prev=>[mapSale(sd),...prev]);
      }
    }
    if(items.length===0) setFirstItemAdded(true);
    setISaved(true);setTimeout(()=>setISaved(false),1600);
    setToast({visible:true,message:hasS?`${t('articleAjoute')} · +${fmt(mg)} ${t('dansTonSuivi')}`:`${t('articleAjoute')} · ${lang==='fr'?'Investi':'Invested'} ${fmt(cogs)}`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    if(hasS&&iRememberSellingFees) localStorage.setItem('savedFees',String(sf));
    setITitle("");setIBuy("");setIPurchaseCosts("");setISell("");if(!iRememberSellingFees)setISellingFees("");setIAlreadySold(false);setIMarque("");setIType("");setIDesc("");setIQuantite(1);setIEmplacement("");setIPlateforme("");
    setTimeout(()=>{if(listRef.current)listRef.current.scrollIntoView({behavior:"smooth"});},300);
  }

  // ── Retrait cross-plateforme (Phase B, 2026-07-11) ─────────────────────────
  // Arme les jobs action='delete' pour les annonces frères encore en ligne
  // d'un article vendu (insert direct : RLS "Users manage own cross_post_jobs",
  // aucune Pépite débitée — ce n'est pas une publication). Le flag
  // pending_removal est levé pour que le bandeau disparaisse ; l'extension
  // exécutera les suppressions à son prochain cycle (30 min max), en
  // DELETE_DRY_RUN tant que les 3 validations réelles n'ont pas eu lieu.
  async function armRemovals(group){
    if(!group.length)return;
    // removal_url_missing propagé au job delete (2026-07-22) : sans URL captée,
    // l'extension cible l'annonce par son TITRE dans « Mes annonces ». Le
    // drapeau ne pilote rien — il rend la trace lisible quand on relit un job
    // après coup, au lieu de laisser deviner pourquoi listing_url est vide.
    const rows=group.map(j=>({
      user_id:user.id,inventaire_id:j.inventaire_id,platform:j.platform,
      action:'delete',status:'pending',photo_option:'original',
      title:j.title,listing_url:j.listing_url,
      platform_fields:j.listing_url?{}:{removal_url_missing:true},
    }));
    const{error}=await supabase.from('cross_post_jobs').insert(rows);
    if(error){console.error('[armRemovals] insert:',error.message);return;}
    for(const j of group){
      // .select() après update : les updates silencieusement bloqués par RLS
      // ont déjà été vécus sur profiles — on vérifie que la ligne revient.
      await supabase.from('cross_post_jobs')
        .update({platform_fields:{...(j.platform_fields||{}),pending_removal:false}})
        .eq('id',j.id).select('id');
    }
    setPendingRemovals(prev=>prev.filter(p=>!group.some(g=>g.id===p.id)));
    track('arm_removals',{count:group.length});
  }

  // ── Annonce hors ligne : l'utilisateur tranche. TOUJOURS. ──────────────────
  // (Phase B, décision produit 2026-07-12) Le poll ne fait que POSER UN DRAPEAU,
  // sur les 4 plateformes — y compris Vinted, dont la preuve de vente est
  // pourtant fiable. Motif : le prix réel peut différer du prix affiché
  // (négociation), et un vendeur à volume ne repasserait jamais corriger — la
  // marge resterait fausse en silence, pour toujours.
  // CETTE FONCTION EST LE SEUL CHEMIN QUI ÉCRIT UNE VENTE EN BASE
  // (check-listing-status → orchestrateSale : vente, inventaire, marges,
  // annulation des frères, proposition de retrait).
  async function confirmSaleFromBanner(job){
    // Prix confirmé : la saisie de l'utilisateur si elle est valide, sinon le
    // prix pré-rempli. C'est LUI qui devient prix_vente côté serveur
    // (négociation, remise main propre marchandée…).
    const saisi=parseFloat(String(salePriceDraft[job.id]??'').replace(',','.'));
    // Défaut = ce que montre le champ : prix lu sur la page si la plateforme
    // l'expose (Vinted), sinon prix de mise en ligne.
    const defaut=Number(job.platform_fields?.detected_price??job.price)||0;
    const prix=Number.isFinite(saisi)&&saisi>0?saisi:defaut;
    if(!prix){setToast({visible:true,message:lang==='fr'?'Prix de vente requis':'Sale price required'});setTimeout(()=>setToast({visible:false,message:""}),3000);return;}
    setConfirmingSale(job.id);
    // PRIX D'ACHAT DEMANDÉ ICI, ET NULLE PART AILLEURS (2026-08-03).
    // C'est le seul instant où la personne se souvient de ce qu'elle a payé et
    // où elle a une raison de répondre : elle vient de gagner de l'argent.
    // Écrit AVANT l'orchestration serveur, qui lit `inventaire.prix_achat` pour
    // calculer le bénéfice — l'ordre inverse enregistrerait la vente sans marge.
    // Une saisie vide ne remplace JAMAIS le prix par 0 : on n'écrit rien.
    const achatSaisi=parseFloat(String(buyPriceDraft[job.id]??'').replace(',','.'));
    if(job.inventaire_id!=null&&Number.isFinite(achatSaisi)&&achatSaisi>=0){
      await supabase.from('inventaire')
        .update({prix_achat:achatSaisi,prix_achat_inconnu:false})
        .eq('id',job.inventaire_id).eq('user_id',user.id);
    }
    // ⚠️ ANTI-DOUBLE-VENTE (2026-07-17) : un article détecté hors ligne sur
    // PLUSIEURS plateformes affiche un bandeau « Vendue ? » PAR plateforme.
    // Confirmer la vente d'UN retire IMMÉDIATEMENT (avant l'appel réseau) TOUS
    // les bandeaux du MÊME article — sinon un 2e tap sur le bandeau frère
    // enregistrait une 2e vente (les 2 orchestrations serveur lisaient « pas
    // encore vendu »). Le gate atomique de orchestrateSale est le filet serveur ;
    // ceci ferme le chemin UI. Regroupement par inventaire_id (fallback id si absent).
    setUnavailableListings(prev=>prev.filter(j=>
      job.inventaire_id!=null ? j.inventaire_id!==job.inventaire_id : j.id!==job.id));
    try{
      const{error}=await supabase.functions.invoke('check-listing-status',{body:{job_id:job.id,price:prix}});
      if(error)throw error;
      setUnavailableListings(prev=>prev.filter(j=>j.id!==job.id));
      track('confirm_sale_banner',{platform:job.platform});
      // ⚠️ user.id OBLIGATOIRE (2026-07-13). Cet appel était `fetchAll()` — sans
      // argument. fetchAll(uid) prend l'utilisateur en PARAMÈTRE : uid valait donc
      // `undefined`, et TOUTES les requêtes du refetch partaient en
      // `user_id=eq.undefined` → 10 erreurs 400 (« invalid input syntax for type
      // uuid: 'undefined' »), y compris celle qui construit le bandeau de retrait
      // des annonces frères. D'où le bandeau qui n'apparaissait qu'après un F5 :
      // ce n'était pas un défaut de rafraîchissement, c'était le refetch qui
      // échouait entièrement.
      await fetchAll(user.id); // vente + inventaire + bandeau de retrait des frères
    }catch(e){
      console.error('[confirmSaleFromBanner]',e?.message??e);
      setToast({visible:true,message:t('genericError')});
      setTimeout(()=>setToast({visible:false,message:""}),3000);
    }finally{
      setConfirmingSale(null);
    }
  }

  // « Non, je l'ai retirée » : pas une vente. Le job est clos (l'annonce
  // n'existe plus) et le drapeau levé — aucune ligne de vente, aucun inventaire
  // touché. Le bandeau ne réapparaîtra pas.
  async function dismissUnavailable(job){
    const pf={...(job.platform_fields||{})};
    delete pf.unavailable_since;
    const{error}=await supabase.from('cross_post_jobs')
      .update({status:'cancelled',platform_fields:pf,
               error:'Annonce retirée par le vendeur (confirmé dans l\'app) — pas une vente'})
      .eq('id',job.id).select('id');
    if(error){console.error('[dismissUnavailable]',error.message);return;}
    setUnavailableListings(prev=>prev.filter(j=>j.id!==job.id));
    track('dismiss_unavailable',{platform:job.platform});
  }

  // ── Revue des DISPARUS du dressing (2026-08-24, chantier détection des ventes) ──
  // Articles marqués `disparu_le` par la sync Vinted et restés en stock : la
  // carte du Stock affichait « ⚠️ Plus en ligne » mais RIEN ne posait jamais la
  // question « Vendue ? » (673 articles bloqués constatés en base, le plus
  // ancien depuis le 09/08). Le bandeau job (unavailable_since) ne couvre que
  // les annonces publiées via FillSell avec un job encore 'published' — les
  // imports du dressing n'en ont pas.
  // File = disparu_le non nul + statut 'stock' + identité Vinted connue,
  // MOINS : « pas vendue » déjà tranché (vinted_status='closed', témoignage
  // utilisateur aligné sur le statut wardrobe « fermée sans vente »), articles
  // en republication VIVANTE (garde A : notre suppression n'est pas une vente),
  // et articles dont un bandeau job « Vendue sur Vinted 🎉 » (preuve positive)
  // est déjà affiché — il est plus riche, on ne demande pas deux fois.
  const disparusATrancher=useMemo(()=>{
    const soldFlags=new Set(unavailableListings
      .filter(j=>j.platform==='vinted'&&(j.platform_fields||{}).sale_signal==='sold'&&j.inventaire_id!=null)
      .map(j=>String(j.inventaire_id)));
    return items.filter(i=>i.statut==='stock'&&i.disparu_le&&i.vinted_item_id
      &&i.vinted_status!=='closed'
      &&!republishActifsInv.has(String(i.id))
      &&!soldFlags.has(String(i.id)));
  },[items,unavailableListings,republishActifsInv]);

  // Prix pré-rempli de la revue = dernier prix AFFICHÉ sur Vinted (relevés
  // vinted_listing_snapshots), comme dans VentesTab. PROPOSÉ dans un champ
  // éditable, jamais écrit sans le clic « Vendue » de la ligne.
  useEffect(()=>{
    if(!disparusModal||!user?.id)return;
    const ids=disparusATrancher.map(i=>i.vinted_item_id).filter(Boolean).filter(id=>!(id in disparusPropositions));
    if(!ids.length)return;
    let annule=false;
    (async()=>{
      const LOT=400,PAGE=1000;
      const trouves={};
      for(let i=0;i<ids.length&&!annule;i+=LOT){
        const lot=ids.slice(i,i+LOT);
        for(let from=0;!annule;from+=PAGE){
          const{data,error}=await supabase.from('vinted_listing_snapshots')
            .select('vinted_item_id,price')
            .eq('user_id',user.id).in('vinted_item_id',lot)
            .order('captured_at',{ascending:false}).range(from,from+PAGE-1);
          if(error)break;
          for(const r of (data||[])) if(trouves[r.vinted_item_id]==null) trouves[r.vinted_item_id]=r.price;
          if(!data||data.length<PAGE)break;
        }
      }
      if(annule)return;
      setDisparusPropositions(prev=>{
        const n={...prev};
        for(const id of ids) if(!(id in n)) n[id]=null;
        for(const[id,prix]of Object.entries(trouves)) if(n[id]==null) n[id]=prix;
        return n;
      });
    })();
    return()=>{annule=true;};
  },[disparusModal,disparusATrancher,disparusPropositions,user?.id]);

  // « Vendue » sur UNE ligne de la revue. Deux chemins, jamais d'écriture sans
  // ce clic :
  //   · un job Vinted encore 'published' existe → MÊME chemin que le bandeau
  //     (check-listing-status → orchestrateSale : vente, inventaire, marges,
  //     frères annulés, email) — le prix saisi part en priceOverride ;
  //   · aucun job (import pur du dressing) → mêmes écritures que confirmSell :
  //     marge recalculée depuis le prix RÉELLEMENT saisi (margeUnitaire, règle
  //     VIDE ≠ ZÉRO), frais 0 (éditables ensuite), date = date de vente.
  async function confirmerVenteDisparue(item){
    const saisi=parseFloat(String(disparusPrix[item.id]??'').replace(',','.'));
    const defaut=Number(disparusPropositions[item.vinted_item_id]??item.sell)||0;
    const prix=Number.isFinite(saisi)&&saisi>0?saisi:defaut;
    if(!prix){
      setToast({visible:true,message:lang==='fr'?'Prix de vente requis':'Sale price required'});
      setTimeout(()=>setToast({visible:false,message:""}),3000);
      return;
    }
    setDisparusBusy(item.id);
    try{
      // Prix d'achat saisi sur la ligne : écrit AVANT la vente (l'orchestration
      // serveur lit inventaire.prix_achat pour le bénéfice). Vide → rien.
      const achatSaisi=parseFloat(String(disparusAchat[item.id]??'').replace(',','.'));
      let art=item;
      if(Number.isFinite(achatSaisi)&&achatSaisi>=0){
        await supabase.from('inventaire').update({prix_achat:achatSaisi,prix_achat_inconnu:false})
          .eq('id',item.id).eq('user_id',user.id);
        art={...item,buy:achatSaisi,prix_achat:achatSaisi,prix_achat_inconnu:false};
      }
      const{data:jobsVifs}=await supabase.from('cross_post_jobs')
        .select('id').eq('user_id',user.id).eq('platform','vinted')
        .in('action',['publish','republish']).eq('status','published')
        .eq('inventaire_id',item.id).limit(1);
      if(jobsVifs&&jobsVifs.length){
        const{error}=await supabase.functions.invoke('check-listing-status',{body:{job_id:jobsVifs[0].id,price:prix}});
        if(error)throw error;
      }else{
        const{margin:mg,marginPct:mgp}=margeUnitaire({
          prixVente:prix,
          prixAchat:prixAchatConnu(art)?art.buy:null,
          purchaseCosts:art.purchaseCosts||0,
          sellingFees:0,
        });
        const qTotal=art.quantite||1;
        if(qTotal>1){
          // Convention lots de confirmSell : l'article reste en stock amputé
          // d'une unité + une ligne d'historique vendue.
          await supabase.from('inventaire').update({quantite:qTotal-1}).eq('id',art.id).eq('user_id',user.id);
          const soldRow={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:art.title,
            prix_achat:prixAchatConnu(art)?art.buy:null,prix_vente:prix,margin:mg,margin_pct:mgp,
            statut:"vendu",selling_fees:0,purchase_costs:0,quantite:1,marque:art.marque||null,
            type:art.type||null,description:art.description||null,date:new Date().toISOString(),plateforme:'vinted'};
          await supabase.from('inventaire').insert([soldRow]);
        }else{
          await supabase.from('inventaire')
            .update({prix_vente:prix,margin:mg,margin_pct:mgp,selling_fees:0,statut:'vendu',date:new Date().toISOString()})
            .eq('id',art.id).eq('user_id',user.id);
        }
        await supabase.from('ventes').insert([{user_id:user.id,titre:art.title,
          prix_achat:prixAchatConnu(art)?art.buy:null,prix_vente:prix,benefice:mg,
          marque:art.marque||null,type:art.type||null,description:art.description||null,
          emplacement:art.emplacement||null,date:new Date().toISOString().split('T')[0],
          plateforme:'vinted',quantite:1,inventaire_id:art.id,statut:'vendu'}]);
      }
      track('confirm_sale_disparue',{via_job:!!(jobsVifs&&jobsVifs.length)});
      await fetchAll(user.id,{silencieux:true});
    }catch(e){
      console.error('[confirmerVenteDisparue]',e?.message??e);
      setToast({visible:true,message:t('genericError')});
      setTimeout(()=>setToast({visible:false,message:""}),3000);
    }finally{
      setDisparusBusy(null);
    }
  }

  // « Pas vendue(s) » — une ligne ou la sélection. L'article RESTE en stock,
  // la décision est mémorisée par vinted_status='closed' (fermée sans vente,
  // le vocabulaire du wardrobe Vinted) : la file ne reposera plus la question,
  // et si l'annonce RÉAPPARAÎT au dressing, la sync réécrit vinted_status et
  // efface disparu_le — la vérité de la plateforme reprend la main. Les jobs
  // Vinted encore 'published' sur ces articles sont clos comme le fait
  // dismissUnavailable (l'annonce n'existe plus, confirmé par l'utilisateur).
  async function marquerDisparusNonVendus(cibles){
    if(!cibles.length)return;
    setDisparusBusy('lot');
    try{
      const ids=cibles.map(i=>i.id);
      const{error}=await supabase.from('inventaire')
        .update({vinted_status:'closed'}).in('id',ids).eq('user_id',user.id);
      if(error)throw error;
      const{data:jobsVifs}=await supabase.from('cross_post_jobs')
        .select('id,platform_fields').eq('user_id',user.id).eq('platform','vinted')
        .in('action',['publish','republish']).eq('status','published').in('inventaire_id',ids);
      for(const j of jobsVifs||[]){
        const pf={...(j.platform_fields||{})};
        delete pf.unavailable_since;
        delete pf.sale_signal;
        delete pf.detected_price;
        delete pf.unavailable_pending_since;
        await supabase.from('cross_post_jobs')
          .update({status:'cancelled',platform_fields:pf,
                   error:'Annonce retirée par le vendeur (confirmé dans l\'app) — pas une vente'})
          .eq('id',j.id);
      }
      setItems(prev=>prev.map(i=>ids.includes(i.id)?{...i,vinted_status:'closed'}:i));
      setDisparusSel(new Set());
      track('dismiss_disparus',{count:ids.length});
      await fetchAll(user.id,{silencieux:true});
    }catch(e){
      console.error('[marquerDisparusNonVendus]',e?.message??e);
      setToast({visible:true,message:t('genericError')});
      setTimeout(()=>setToast({visible:false,message:""}),3000);
    }finally{
      setDisparusBusy(null);
    }
  }

  function markSold(item){
    const saved=localStorage.getItem('savedFees')||'';
    setSellModal({item,sellPrice:'',sellingFees:saved,rememberFees:!!saved,sellQty:1,prixMode:'total',feesMode:'total',plateforme:item.plateforme||''});
  }

  async function confirmSell(){
    if(!sellModal)return;
    const sv=parseFloat(sellModal.sellPrice)||0;
    if(!sv||sv<=0)return;
    const sf=parseFloat(sellModal.sellingFees)||0;
    if(sellModal.rememberFees)localStorage.setItem('savedFees',String(sf));
    const{item}=sellModal;
    const qTotal=item.quantite||1;
    const qVendue=Math.max(1,Math.min(parseInt(sellModal.sellQty)||1,qTotal));
    // Compute per-unit values based on selected price/fees mode
    const svUnit=sellModal.prixMode==="unit"||qVendue<=1?sv:sv/qVendue;
    const sfUnit=sellModal.feesMode==="unit"||qVendue<=1?sf:sf/qVendue;
    // VIDE ≠ ZÉRO (03/08) : `item.buy` à null donnait cogsUnit=0, donc une
    // marge égale au prix de vente entier, ÉCRITE EN BASE. margeUnitaire rend
    // null quand le prix d'achat est inconnu — la vente est enregistrée, le
    // bénéfice reste vide jusqu'à ce que l'utilisateur le complète.
    const {margin:mgUnit,marginPct:mgpUnit}=margeUnitaire({
      prixVente:svUnit,
      prixAchat:prixAchatConnu(item)?item.buy:null,
      purchaseCosts:item.purchaseCosts||0,
      sellingFees:sfUnit,
    });
    const remaining=qTotal-qVendue;
    if(remaining>0){
      await supabase.from('inventaire').update({quantite:remaining}).eq('id',item.id);
      setItems(prev=>prev.map(i=>i.id===item.id?{...i,quantite:remaining}:i));
      const soldRow={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:svUnit,margin:mgUnit,margin_pct:mgpUnit,statut:"vendu",selling_fees:sfUnit,purchase_costs:0,quantite:qVendue,marque:item.marque||null,type:item.type||null,description:item.description||null,date:new Date().toISOString(),plateforme:sellModal.plateforme||null};
      const{data:si,error:siErr}=await supabase.from('inventaire').insert([soldRow]).select().single();
      if(siErr)console.error("[confirmSell] soldRow insert failed:",siErr.message);
      if(si)setItems(prev=>[mapItem(si),...prev]);
    }else{
      // `date` AUSSI (2026-08-24, point C du chantier détection des ventes) :
      // cette branche laissait la date de l'article inchangée (souvent NULL
      // pour un import du dressing) — une vente confirmée sans date, illisible
      // dans les stats et indistinguable d'un marquage automatique. Convention
      // des lignes vendues (soldRow, consume_one_unit) : date = date de vente.
      await supabase.from('inventaire').update({prix_vente:svUnit,margin:mgUnit,margin_pct:mgpUnit,statut:"vendu",selling_fees:sfUnit,date:new Date().toISOString()}).eq('id',item.id);
      setItems(prev=>prev.map(i=>i.id===item.id?{...i,sell:svUnit,margin:mgUnit,marginPct:mgpUnit,statut:"vendu"}:i));
    }
    for(let q=0;q<qVendue;q++){
      const srow={user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:svUnit,benefice:mgUnit,marque:item.marque||null,type:item.type||null,description:item.description||null,emplacement:item.emplacement||null,date:new Date().toISOString().split('T')[0],plateforme:sellModal.plateforme||null};
      const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
      if(sd){
        if(q===0)track('mark_sold',{profit:mgUnit*qVendue,margin_pct:Math.round(mgpUnit*10)/10});
        setSales(prev=>[mapSale(sd),...prev]);
      }
    }
    setSellModal(null);
    await fetchAll(user.id);
  }

  // ── Suppression d'un article : retrait des annonces AVANT le delete ─────────
  // (2026-07-20) TROU CORRIGÉ : les 4 chemins de suppression faisaient un
  // `delete` NU sur inventaire. Rien n'était retiré des plateformes, aucun job
  // n'était annulé — et la FK cross_post_jobs_inventaire_id_fkey est en
  // ON DELETE **SET NULL** (relevé en base) : le lien inventaire_id→jobs est
  // EFFACÉ par le delete. D'où deux conséquences vécues comme un trou :
  //   · les annonces restaient EN LIGNE et devenaient inatteignables depuis
  //     l'app (la ligne de stock n'existe plus, le lien vers ses jobs non plus) ;
  //   · un job 'pending' survivait et était re-distribué par get-pending-jobs
  //     (index.ts:89-92 ne filtre QUE sur status) → une annonce pouvait être
  //     CRÉÉE après la suppression de l'article.
  // ⚠️ L'ORDRE EST IMPOSÉ par ce SET NULL : tout ce qui dépend de inventaire_id
  // se fait AVANT le delete. Après, les jobs concernés sont introuvables.
  // Inventaire EXHAUSTIF des statuts — contrainte cross_post_jobs_status_check
  // relevée en base, 9 valeurs, aucune autre possible :
  //   pending · processing · needs_user   -> non terminaux, annulés ici
  //   published                            -> l'annonce vit : on arme un retrait
  //   sold · failed · cancelled · deleted  -> terminaux, rien à faire
  //   dry_run_completed                    -> TERMINAL par conception
  //     (background.js:1010-1020 : « statut TERMINAL, PAS de ré-armement en
  //      pending » — sinon le job repartait à chaque cron)
  // EN VOL = distribué ou en cours d'exécution. Sert à repérer un retrait déjà
  // lancé (un job needs_user, lui, n'avance pas tout seul).
  const ACTIVE_JOB_STATUSES=['pending','processing'];
  // À ANNULER = tout ce qui n'est pas terminal. needs_user inclus (2026-07-20) :
  // il ne peut rien publier seul (get-pending-jobs ne distribue que 'pending'),
  // mais l'article supprimé emporte la ligne de Stock qui portait le bouton de
  // réponse — le job deviendrait une ligne morte que PLUS PERSONNE ne peut
  // résoudre. On le clôt proprement plutôt que de le laisser en suspens.
  const CANCELLABLE_JOB_STATUSES=['pending','processing','needs_user'];
  // Lit l'état cross-post d'un article. N'écrit RIEN.
  async function buildDeletePlan(id){
    // `price` ajouté le 2026-08-10 : c'est le prix de mise en ligne, valeur par
    // défaut du champ « prix de vente » quand la sonde révèle une annonce hors
    // ligne (même repli que le bandeau, cf. confirmSaleFromBanner).
    const{data,error}=await supabase.from('cross_post_jobs')
      .select('id, platform, action, status, listing_url, title, price, created_at, platform_fields')
      .eq('user_id',user.id).eq('inventaire_id',id);
    if(error)throw new Error(error.message);
    const jobs=data??[];
    // Un retrait déjà armé fait DÉJÀ le travail : ne pas le ré-armer, ne pas
    // l'annuler (l'annuler laisserait l'annonce en ligne).
    const retraitsEnCours=new Set(jobs.filter(j=>j.action==='delete'&&ACTIVE_JOB_STATUSES.includes(j.status)).map(j=>j.platform));
    // Annonce en ligne = job publish 'published' LE PLUS RÉCENT de la
    // plateforme, avec SON PROPRE listing_url (leçon listing_url croisée :
    // jamais de delete sur l'URL d'un autre job).
    const parPlateforme={};
    for(const j of jobs){
      if(j.action!=='publish'||j.status!=='published'||!j.listing_url)continue;
      if(retraitsEnCours.has(j.platform))continue;
      const prec=parPlateforme[j.platform];
      if(!prec||Date.parse(j.created_at||0)>Date.parse(prec.created_at||0))parPlateforme[j.platform]=j;
    }
    // À annuler : les PUBLISH non terminaux, needs_user compris. Les delete
    // actifs restent épargnés (cf. ci-dessus : les annuler laisserait l'annonce
    // en ligne).
    const aAnnuler=jobs.filter(j=>j.action==='publish'&&CANCELLABLE_JOB_STATUSES.includes(j.status));
    // republishEnVol (2026-08-10) : entre la suppression et la recréation d'une
    // republication, l'annonce est LÉGITIMEMENT hors ligne. La sonde d'avant-
    // suppression doit se taire dans cette fenêtre — sinon on demanderait
    // « vendue ? » sur une annonce qu'on est en train de republier, exactement
    // le faux signal que la garde É4 de la sync évite déjà (background.js).
    // Calculé ici parce que `jobs` porte déjà les republish : aucune requête de
    // plus, et un seul calcul partagé avec le Stock (publicationState.js).
    const republishEnVol=plateformesReserveesParRepublication(jobs);
    return{online:Object.values(parPlateforme),aAnnuler,retraitsEnCours:[...retraitsEnCours],republishEnVol};
  }
  // Exécute le plan PUIS supprime. Unique point d'écriture — les 4 chemins de
  // suppression passent tous par ici, aucune logique dupliquée.
  async function performItemDeletion(item,plan,{alsoDeleteSale=false}={}){
    const p=plan??{online:[],aAnnuler:[]};
    // 1. Armer les retraits — MÊME insert que le retrait ciblé du Stock
    //    (StockTab.jsx:752-756), y compris listing_url venu du job publish
    //    lui-même. Ces jobs delete perdront leur inventaire_id au delete
    //    (SET NULL) : sans conséquence, l'extension ne lit que platform +
    //    listing_url (DELETE_TARGETS, background.js).
    if(p.online.length){
      const rows=p.online.map(pub=>({
        user_id:user.id,inventaire_id:item.id,platform:pub.platform,
        action:'delete',status:'pending',photo_option:'original',
        title:pub.title||item.title,listing_url:pub.listing_url,platform_fields:{},
      }));
      const{error}=await supabase.from('cross_post_jobs').insert(rows);
      if(error)throw new Error(error.message);
    }
    // 2. Annuler les publish encore actifs. 'cancelled' = statut d'annulation
    //    déjà utilisé ailleurs (cancelPublishAfterDelete, flux vente) — pas un
    //    nouveau vocabulaire. Ciblage par ids relevés AVANT l'insert ci-dessus :
    //    les retraits qu'on vient d'armer ne sont jamais annulés par ce update.
    if(p.aAnnuler.length){
      const{error}=await supabase.from('cross_post_jobs')
        .update({status:'cancelled',error:lang==='fr'?"Annulé : l'article a été supprimé du stock":'Cancelled: the item was deleted from stock'})
        .in('id',p.aAnnuler.map(j=>j.id));
      if(error)throw new Error(error.message);
    }
    // 3. SEULEMENT MAINTENANT — et les ventes liées AVANT la ligne inventaire :
    // la FK ventes_inventaire_id_fkey est en NO ACTION (vérifié en prod le
    // 03/08) — supprimer un article encore référencé par une vente est REJETÉ
    // par la base, et l'ancien code avalait cette erreur : l'article
    // « supprimé » réapparaissait au fetchAll suivant.
    if(alsoDeleteSale){
      // Lien PAR ID (ventes.inventaire_id), jamais par titre (2026-08-03 soir) :
      // avec l'import du dressing les homonymes deviennent la norme (titres
      // Vinted génériques) — l'ancien sales.find(title===…) pouvait supprimer
      // la vente d'un AUTRE article, même classe de bug que la cible d'édition
      // (692f873). Delete directement en base sur inventaire_id : couvre aussi
      // les ventes au-delà du cap de 500 lignes chargées côté client, et les
      // ventes multiples du même article (ventes partielles). Une vente SANS
      // inventaire_id (lignes historiques, flux qui ne posent pas le lien)
      // n'est PAS touchée : jamais de suppression devinée.
      const{error:vErr}=await supabase.from('ventes').delete()
        .eq('inventaire_id',item.id).eq('user_id',user.id);
      if(vErr)throw new Error(vErr.message);
    }else{
      // « Supprimer l'article uniquement » : la vente reste dans le tableau de
      // bord, mais la FK (NO ACTION) interdit de supprimer un article encore
      // référencé — on détache le lien, la vente garde tous ses montants.
      const{error:dErr}=await supabase.from('ventes')
        .update({inventaire_id:null}).eq('inventaire_id',item.id).eq('user_id',user.id);
      if(dErr)throw new Error(dErr.message);
    }
    const{error:iErr}=await supabase.from('inventaire').delete().eq('id',item.id);
    if(iErr)throw new Error(iErr.message);
    await fetchAll(user.id);
  }

  // ── SONDE D'AVANT-SUPPRESSION (2026-08-10) ─────────────────────────────────
  // POURQUOI. Cas Sam, 10/08 : annonce Vinted disparue entre deux syncs, article
  // supprimé dans FillSell 2 h 39 plus tard. Le poll de l'extension exige DEUX
  // lectures « hors ligne » espacées d'un cycle (≥ 2 h) avant de poser le
  // bandeau — durcissement du 09/08 contre les 404 transitoires. La suppression
  // est arrivée AVANT la 2e lecture : aucun bandeau, aucune ligne `ventes`,
  // CA perdu sans trace. C'est le geste de l'utilisateur qui va plus vite que la
  // machine ; on lui pose donc la question à CE moment-là, pendant qu'il est
  // devant l'écran et qu'il se souvient du prix.
  //
  // CE QUE ÇA N'EST PAS. Aucun bandeau n'est créé, aucun drapeau posé, aucune
  // vente écrite automatiquement. La sonde ne fait qu'AUTORISER une question.
  // Garde-fou du 09/08 (5 faux bandeaux chez Ornella) : ici, la seule chose
  // qu'une lecture puisse produire, c'est du texte à l'écran.
  //
  // QUATRE VERROUS avant de demander quoi que ce soit — chacun ferme une classe
  // de faux positif déjà vécue :
  //   1. une annonce Vinted du plan, avec SON PROPRE listing_url (jamais un
  //      repli — leçon listing_url croisée) ;
  //   2. aucune republication en vol sur Vinted : entre suppression et
  //      recréation l'annonce est hors ligne À DESSEIN (garde É4 de la sync) ;
  //   3. l'id de listing_url doit CONCORDER avec inventaire.vinted_item_id
  //      quand l'article en porte un — c'est le mensonge n°1 du 09/08 (job
  //      périmé pointant l'annonce d'avant une republication : 404 éternel sur
  //      un article bel et bien en ligne). Article sans id Vinted (publié via
  //      FillSell, jamais synchronisé) : rien à confronter, on laisse passer —
  //      le job est alors la seule source, la même que celle du bandeau ;
  //   4. la sonde doit répondre « sold » ou « unavailable ». 'active',
  //      'unknown', pas d'extension, hors délai → on ne demande RIEN.
  useEffect(()=>{
    if(deleteConfirm?.type!=='itemListings'){setSondeSuppression(null);return;}
    const item=deleteConfirm.item,plan=deleteConfirm.plan;
    const job=(plan?.online??[]).find(j=>j.platform==='vinted'&&j.listing_url);
    if(!job){setSondeSuppression(null);return;}
    if((plan?.republishEnVol??[]).includes('vinted')){setSondeSuppression(null);return;}
    const idJob=String(job.listing_url).match(/\/items\/(\d+)/)?.[1]??null;
    const idArticle=item?.vinted_item_id!=null?String(item.vinted_item_id):null;
    if(idArticle&&idJob&&idArticle!==idJob){
      console.log(`[sonde-suppression] job ${job.id} pointe l'annonce ${idJob} alors que l'article vit sur ${idArticle} — job périmé, aucune question`);
      setSondeSuppression(null);return;
    }
    let vivant=true;
    setSondeSuppression({jobId:job.id,statut:'encours',signal:null,prix:null});
    setVenteSuppr({prix:null,achat:null,busy:false,err:null});
    sonderAnnonceVinted(job.listing_url).then(rep=>{
      if(!vivant)return;
      const etat=rep?.success?rep.state:null;
      if(etat!=='sold'&&etat!=='unavailable'){
        // 'active' = toujours en ligne. 'unknown'/échec = on n'a rien lu. Dans
        // les deux cas la modale reste celle d'avant, à l'identique.
        console.log(`[sonde-suppression] ${job.listing_url} → ${etat??rep?.error??'sans réponse'} : aucune question posée`);
        setSondeSuppression({jobId:job.id,statut:'muette',signal:null,prix:null});
        return;
      }
      setSondeSuppression({jobId:job.id,statut:'hors_ligne',signal:etat,prix:rep?.price??null});
    });
    return()=>{vivant=false;};
  },[deleteConfirm]);

  // « Vendue » depuis la modale de suppression : MÊME CHEMIN que le bandeau
  // (check-listing-status → orchestrateSale). Aucune écriture de vente locale —
  // c'est la fonction serveur qui pose la vente, l'inventaire, les marges,
  // annule les frères et propose leur retrait. Un seul chemin d'écriture de
  // vente dans toute l'app, c'est la doctrine du 12/07 et elle ne bouge pas.
  //
  // ORDRE IMPOSÉ : la vente AVANT la suppression. orchestrateSale lit
  // `inventaire` (prix d'achat, marges) via job.inventaire_id — or la FK
  // cross_post_jobs_inventaire_id_fkey est en ON DELETE SET NULL : supprimer
  // d'abord, ce serait orchestrer une vente sur un article qui n'existe plus.
  async function confirmerVenteAvantSuppression(item,job){
    if(venteSuppr.busy)return;
    const saisi=parseFloat(String(venteSuppr.prix??'').replace(',','.'));
    const defaut=Number(sondeSuppression?.prix??job.price)||0;
    const prix=Number.isFinite(saisi)&&saisi>0?saisi:defaut;
    if(!prix){
      setVenteSuppr(v=>({...v,err:lang==='fr'?'Prix de vente requis':'Sale price required'}));
      return;
    }
    setVenteSuppr(v=>({...v,busy:true,err:null}));
    try{
      // PRIX D'ACHAT : même règle qu'au bandeau (App.jsx, confirmSaleFromBanner).
      // Écrit AVANT l'orchestration, qui le lit pour calculer le bénéfice. Une
      // saisie vide ne devient JAMAIS 0 — VIDE ≠ ZÉRO.
      const achat=parseFloat(String(venteSuppr.achat??'').replace(',','.'));
      if(Number.isFinite(achat)&&achat>=0){
        await supabase.from('inventaire')
          .update({prix_achat:achat,prix_achat_inconnu:false})
          .eq('id',item.id).eq('user_id',user.id);
      }
      const{error}=await supabase.functions.invoke('check-listing-status',{body:{job_id:job.id,price:prix}});
      if(error)throw error;
      track('confirm_sale_delete_modal',{platform:'vinted',signal:sondeSuppression?.signal??null});
      // PLAN RECONSTRUIT : après l'orchestration, le job Vinted est 'sold' et les
      // frères encore live sont 'cancelled' + pending_removal. Les uns et les
      // autres sortent donc de `online` — on n'arme plus de retrait sur une
      // annonce déjà vendue, et le retrait des frères repasse par le bandeau
      // dédié (clic utilisateur), comme pour toute autre vente.
      let plan2=null;
      try{plan2=await buildDeletePlan(item.id);}
      catch(e){console.warn('[confirmerVenteAvantSuppression] replan:',e.message);}
      // alsoDeleteSale reste FAUX : la vente qu'on vient d'enregistrer doit
      // survivre à la suppression de l'article (ventes.inventaire_id détaché,
      // montants conservés) — c'est tout l'objet de la manœuvre.
      await performItemDeletion(item,plan2);
      setDeleteConfirm(null);
      setToast({visible:true,message:lang==='fr'?'✅ Vente enregistrée':'✅ Sale recorded'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }catch(e){
      console.error('[confirmerVenteAvantSuppression]',e?.message??e);
      // RIEN n'est supprimé si l'enregistrement échoue : l'utilisateur retente,
      // ou choisit « Retirée ». Perdre l'article ET la vente serait le pire des
      // deux mondes.
      setVenteSuppr(v=>({...v,busy:false,err:t('genericError')}));
      return;
    }
    setVenteSuppr({prix:null,achat:null,busy:false,err:null});
  }

  // Encart « ce qui va se passer », partagé par les deux modales de suppression
  // — la liste exacte des plateformes retirées et le nombre de jobs annulés.
  const PLATEFORME_LABELS={vinted:'Vinted',leboncoin:'Leboncoin',ebay:'eBay',beebs:'Beebs'};
  function renderCrossPostConsequences(plan){
    if(!plan||(!plan.online?.length&&!plan.aAnnuler?.length&&!plan.retraitsEnCours?.length))return null;
    const n=plan.aAnnuler?.length??0;
    return(
      <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:14,padding:"12px 14px",marginBottom:16,fontSize:12.5,lineHeight:1.5,color:"#7C2D12"}}>
        {plan.online?.length>0&&(
          <div style={{marginBottom:plan.aAnnuler?.length?6:0}}>
            {lang==='fr'?'Annonces en ligne qui seront retirées :':'Live listings that will be removed:'}
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>
              {plan.online.map(p=>(
                <span key={p.platform} style={{background:"#fff",border:"1px solid #FED7AA",borderRadius:99,padding:"3px 9px",fontWeight:700}}>
                  {PLATEFORME_LABELS[p.platform]||p.platform}
                </span>
              ))}
            </div>
          </div>
        )}
        {n>0&&(()=>{
          // Plateformes des jobs annulés — nommées, pas juste comptées : un
          // « 2 publications annulées » sans dire OÙ n'aide pas à décider.
          const noms=[...new Set(plan.aAnnuler.map(j=>PLATEFORME_LABELS[j.platform]||j.platform))];
          return(
            <div>{lang==='fr'
              ?`${n} publication${n>1?'s':''} en cours ou en attente ${n>1?'seront annulées':'sera annulée'} (${noms.join(', ')}).`
              :`${n} publication${n>1?'s':''} in progress or awaiting input will be cancelled (${noms.join(', ')}).`}</div>
          );
        })()}
        {plan.retraitsEnCours?.length>0&&(
          <div style={{marginTop:6,opacity:0.85}}>{lang==='fr'
            ?`Retrait déjà en cours sur ${plan.retraitsEnCours.map(p=>PLATEFORME_LABELS[p]||p).join(', ')} — laissé tel quel.`
            :`Removal already running on ${plan.retraitsEnCours.map(p=>PLATEFORME_LABELS[p]||p).join(', ')} — left as is.`}</div>
        )}
      </div>
    );
  }
  // Porte d'entrée COMMUNE aux 4 chemins. Décide : suppression directe (aucune
  // annonce, aucun job actif — comportement d'avant, inchangé) ou confirmation.
  async function delItem(id){
    const item=items.find(i=>i.id===id);
    if(!item){await supabase.from('inventaire').delete().eq('id',id);await fetchAll(user.id);return;}
    let plan=null;
    try{plan=await buildDeletePlan(id);}
    catch(e){
      // Lecture impossible : on ne supprime PAS à l'aveugle (ce serait
      // re-créer le trou). L'utilisateur retentera.
      console.error('[delItem] plan:',e.message);
      setDeleteConfirm({type:'planError',item});
      return;
    }
    const aDesConsequences=plan.online.length>0||plan.aAnnuler.length>0;
    const estVendu=item.statut==='vendu'||item.sell!=null;
    if(estVendu){setDeleteConfirm({type:'soldItem',item,plan});return;}
    if(aDesConsequences){setDeleteConfirm({type:'itemListings',item,plan});return;}
    await performItemDeletion(item,plan);
  }

  async function addSale(){
    if(!isValid)return;
    const saleDate=new Date();
    const row={id:Date.now(),user_id:user.id,titre:cTitle||"Article",prix_achat:buy,prix_vente:sell,benefice:margin,date:saleDate.toISOString().split('T')[0]};
    const{data,error}=await supabase.from('ventes').insert([row]).select().single();
    if(!error) setSales(prev=>[mapSale(data),...prev]);
    else console.error('[Supabase] Erreur insert:',error.message);
    setCSaved(true);setTimeout(()=>setCSaved(false),1600);
    setCTitle("");setCBuy("");setCSell("");setCShip("");
  }

  function delSale(id){
    const sale=sales.find(s=>s.id===id);
    setDeleteConfirm({type:'sale',sale:{...sale,id}});
  }

  async function handleReset(){
    if(resetStep===0){setResetStep(1);return;}
    if(resetStep===1){
      await Promise.all([
        supabase.from('ventes').delete().eq('user_id',user.id),
        supabase.from('inventaire').delete().eq('user_id',user.id),
      ]);
      setSales([]);setItems([]);setResetStep(0);
    }
  }

  async function handleEditSave(){
    if(!editItem)return;
    const qty=Math.max(1,parseInt(editItem.quantite)||1);
    // VIDE ≠ ZÉRO : un prix d'achat laissé VIDE reste NULL. L'ancien
    // `parseFloat(...)||0` transformait chaque sauvegarde d'un article importé
    // du dressing (prix inconnu) en « gratuit assumé » — marge de 100 % sur du
    // vent, indétectable ensuite. Un vrai 0 tapé reste un 0 valide.
    const buyVide=String(editItem.buy??'').trim()==='';
    const rawB=buyVide?null:(parseFloat(String(editItem.buy).replace(',','.'))||0);
    const b=rawB==null?null:((editItem.priceMode==="total"&&qty>1)?rawB/qty:rawB);
    const s=parseFloat(editItem.sell)||0;
    const f=parseFloat(editItem.frais)||0;
    const hasS=s>0;
    const mg=hasS&&b!=null?s-b-f:null;
    const mgp=hasS&&mg!=null?(mg/s)*100:null;
    const typeAuto=editItem.type||detectType(editItem.title,editItem.marque);
    const marqueNorm=editItem.marque?.trim()?editItem.marque.trim().charAt(0).toUpperCase()+editItem.marque.trim().slice(1).toLowerCase():null;
    if(editItem._isNew){
      const{data:{session:sess}}=await supabase.auth.getSession();
      const uid=sess?.user?.id??user?.id;
      if(!uid){
        setToast({visible:true,message:lang==='fr'?'⚠️ Session expirée, rechargez la page':'⚠️ Session expired, please reload'});
        setTimeout(()=>setToast({visible:false,message:''}),4000);
        return;
      }
      const row={id:Date.now()+Math.floor(Math.random()*10000),user_id:uid,titre:stripMarque(editItem.title||"Article",marqueNorm),marque:marqueNorm,type:typeAuto,prix_achat:b,prix_vente:hasS?s:null,margin:mg,margin_pct:mgp,statut:"stock",date:new Date().toISOString(),description:editItem.description||null,purchase_costs:0,selling_fees:0,quantite:qty,emplacement:editItem.emplacement?.trim()||null,plateforme:null};
      const{data:d,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(!error){
        setItems(prev=>[mapItem({...d,quantite:d.quantite??qty}),...prev]);
        setEditItem(null);
        setLensAdded(true);
        setToast({visible:true,message:lang==='fr'?'✓ Article ajouté au stock':'✓ Item added to stock'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }else{
        setToast({visible:true,message:`⚠️ ${error.message}`});
        setTimeout(()=>setToast({visible:false,message:''}),5000);
      }
      return;
    }
    // ── Cible d'écriture : EXPLICITE, jamais devinée (2026-08-03 soir) ──
    // `ventes.id` et `inventaire.id` sont deux espaces d'ids DISJOINTS mais qui
    // se CHEVAUCHENT (les deux dérivent du temps). Ce handler écrivait toujours
    // dans `inventaire` avec l'id reçu — or VentesTab ouvre cette modale avec
    // une ligne de `ventes` : l'UPDATE ratait en silence (id inexistant)… et le
    // jour où un id de vente aurait coïncidé avec un id d'inventaire, éditer
    // une vente aurait ÉCRASÉ un article. Chaque ouvreur pose donc `_table`
    // (VentesTab → 'ventes', StockTab/Lens → 'inventaire') ; sans ce marqueur,
    // on refuse d'écrire et on le DIT — jamais d'écriture au petit bonheur.
    if(editItem._table==='ventes'){
      const {margin:benef}=margeUnitaire({prixVente:hasS?s:null,prixAchat:b,sellingFees:f});
      const{data:updRows,error}=await supabase.from('ventes').update({
        titre:editItem.title,
        marque:marqueNorm,
        type:typeAuto,
        prix_achat:b,
        prix_vente:hasS?s:null,
        benefice:benef,
        // Frais PERSISTÉS (2026-08-14, option B — cas RoCotCot) : ils entraient
        // dans le calcul de `benefice` sans être écrits nulle part, et
        // l'ouvreur reposait 0 en dur — une ré-édition sans les retaper les
        // évaporait du bénéfice. Colonne posée par la migration 20260814130000
        // (la même qui crée la policy UPDATE sans laquelle CE bloc entier n'a
        // jamais écrit une seule ligne depuis le 03/08).
        selling_fees:f,
        description:editItem.description||null,
        // Convention des lignes `ventes` : quantite NULL sauf lot (cf. srow).
        quantite:qty>1?qty:null,
        emplacement:editItem.emplacement?.trim()||null,
        // ⚠️ pas de prix_achat_inconnu ici : la colonne n'existe pas sur
        // `ventes` (schéma vérifié le 03/08), le drapeau vit sur l'article lié.
      }).eq('id',editItem.id).eq('user_id',user.id).select('id');
      if(!error&&updRows?.length){
        setSales(prev=>prev.map(v=>v.id===editItem.id?{...v,title:editItem.title,marque:marqueNorm||"",type:typeAuto,buy:b,prix_achat:b,sell:hasS?s:null,prix_vente:hasS?s:null,margin:benef,marginPct:benef!=null&&hasS&&s>0?(benef/s)*100:null,sellingFees:f,description:editItem.description||null,quantite:qty>1?qty:null,emplacement:editItem.emplacement?.trim()||null}:v));
        setEditItem(null);
        setToast({visible:true,message:lang==='fr'?'✓ Vente modifiée':'✓ Sale updated'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }else{
        setToast({visible:true,message:`⚠️ ${error?.message||(lang==='fr'?'Vente introuvable — rien n’a été modifié':'Sale not found — nothing was changed')}`});
        setTimeout(()=>setToast({visible:false,message:''}),5000);
      }
      return;
    }
    if(editItem._table!=='inventaire'){
      // Cible indéterminée : on échoue BRUYAMMENT plutôt que d'écrire dans la
      // mauvaise table. Si ce message sort, un appelant de setEditItem n'a pas
      // posé `_table` — c'est un bug à corriger, pas à contourner.
      console.error('[handleEditSave] _table absent ou inconnu:',editItem._table,editItem.id);
      setToast({visible:true,message:lang==='fr'?'⚠️ Modification impossible : origine de la fiche inconnue. Rien n’a été modifié.':'⚠️ Cannot save: unknown record origin. Nothing was changed.'});
      setTimeout(()=>setToast({visible:false,message:''}),5000);
      return;
    }
    // `.select('id')` : un id qui ne matche AUCUNE ligne (article supprimé
    // entre-temps) doit se voir, pas réussir en silence.
    const{data:updRows,error}=await supabase.from('inventaire').update({
      titre:editItem.title,
      marque:marqueNorm,
      type:typeAuto,
      prix_achat:b,
      prix_vente:hasS?s:null,
      margin:mg,
      margin_pct:mgp,
      // Un prix saisi lève le drapeau « je ne sais plus » — la réponse a changé.
      ...(b!=null?{prix_achat_inconnu:false}:{}),
      description:editItem.description||null,
      quantite:qty,
      // Même colonne que l'intention vocale inventory_move (moveToLocation).
      emplacement:editItem.emplacement?.trim()||null,
    }).eq('id',editItem.id).eq('user_id',user.id).select('id');
    if(!error&&updRows?.length){
      setItems(prev=>prev.map(i=>i.id===editItem.id?{...i,title:editItem.title,marque:editItem.marque,type:typeAuto,buy:b,prix_achat:b,...(b!=null?{prix_achat_inconnu:false}:{}),sell:s,margin:mg,marginPct:mgp,description:editItem.description,quantite:qty,emplacement:editItem.emplacement?.trim()||null}:i));
      setEditItem(null);
      setToast({visible:true,message:lang==='fr'?'✓ Article modifié':'✓ Item updated'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }else{
      setToast({visible:true,message:`⚠️ ${error?.message||(lang==='fr'?'Article introuvable — rien n’a été modifié':'Item not found — nothing was changed')}`});
      setTimeout(()=>setToast({visible:false,message:''}),5000);
    }
  }

  async function handleCancelSubscription(){
    setCancelLoading(true);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      const res=await fetch(
        `${supabaseUrl}/functions/v1/cancel-subscription`,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${session?.access_token}`,
            "apikey":supabaseAnonKey,
          },
        }
      );
      const json=await res.json();
      if(json.error) throw new Error(json.error);
      // is_premium reste true jusqu'à la fin de la période — le webhook customer.subscription.deleted le passera à false
      const msg=json.period_end
        ? (lang==='fr'
            ? `Abonnement annulé. Tu gardes l'accès premium jusqu'au ${json.period_end}.`
            : `Subscription cancelled. You keep premium access until ${json.period_end}.`)
        : (lang==='fr'
            ? "Abonnement annulé. Tu gardes l'accès premium jusqu'à la fin de la période."
            : "Subscription cancelled. You keep premium access until the end of the period.");
      setCancelMsg(msg);
      setCancelAtPeriodEnd(true);
      setCancelPeriodEnd(json.period_end||null);
      setCancelStep(0);
    }catch(e){
      setCancelMsg("Erreur : "+e.message);
    }finally{
      setCancelLoading(false);
    }
  }

  // ── Détection automatique des colonnes (v2) ─────────────────────────────
  // ── ÉTAPE 2 : Détection des colonnes ────────────────────────────────────
  function detectColumns(headers, rows){
    const TITRE_RE=/nom|titre|article|produit|désign|libell[eé]|description|objet|item|cat[eé]gorie|notes?|taille|name|title|product|label|object/i;
    const ACHAT_RE=/achat|achet[eé]|PA\b|prix.?achat|co[uû]t|invest|d[eé]pense|d[eé]bours|purchase|bought|buy\b|paid|spend/i;
    const VENTE_RE=/PV\b|prix.?vente|prix.?de.?vente|revente|cession|recette|encaiss|sale\b|sold\b|sell\b|revenue|income|receipt/i;
    const STATUT_RE=/statut|status|[eé]tat|available|listed/i;
    const DATE_VENTE_RE=/date.?vente|date.?de.?vente|vendu.?le|sold.?at|sold.?on|sale.?date|date.?sold/i;
    const DATE_RE=/\bdate\b|jour|day|purchase.?date|bought.?on/i;
    const MARQUE_RE=/marque|brand|make|fabricant/i;
    const mapping={titres:[],prix_achat:null,prix_vente:null,statut:null,date:null,marque_col:null};

    for(const h of headers){
      const s=String(h).trim();
      if(MARQUE_RE.test(s)&&!mapping.marque_col) mapping.marque_col=h;
      else if(TITRE_RE.test(s)) mapping.titres.push(h);
      if(!mapping.prix_achat && ACHAT_RE.test(s)) mapping.prix_achat=h;
      else if(!mapping.prix_vente && VENTE_RE.test(s)) mapping.prix_vente=h;
      else if(!mapping.statut && STATUT_RE.test(s)) mapping.statut=h;
      if(DATE_VENTE_RE.test(s)) mapping.date=h;
      else if(!mapping.date && DATE_RE.test(s)) mapping.date=h;
    }
    console.log('[Import] detectColumns — headers:',headers,'→',mapping);

    // ÉTAPE 3 : Fallback numérique 80% sur 20 premières lignes
    const sample=rows.slice(0,20);
    const assigned=new Set([...mapping.titres,mapping.prix_achat,mapping.prix_vente,mapping.statut,mapping.date,mapping.marque_col].filter(Boolean));
    const numCols=headers.filter(h=>{
      if(assigned.has(h)) return false;
      const vals=sample.map(r=>String(r[h]??'').replace(',','.').trim()).filter(v=>v!=='');
      if(!vals.length) return false;
      return vals.filter(v=>!isNaN(parseFloat(v))).length/vals.length>=0.8;
    });
    if(!mapping.prix_achat && numCols[0]){mapping.prix_achat=numCols[0];assigned.add(numCols[0]);}
    if(!mapping.prix_vente && numCols[1]) mapping.prix_vente=numCols[1];
    console.log('[Import] after numeric fallback:',mapping);

    return mapping;
  }

  // ── Filtre lignes parasites ───────────────────────────────────────────────
  // Retourne null si la ligne est valide, sinon la catégorie de raison
  function classifyParasite(row, mapping){
    const PARASITE_RE=/total|sous.?total|somme|bilan|virement|re[cç]u|comptabilis|r[eé]sum[eé]|r[eé]cap|moyenne|average|\bnote\b|\binfo\b|NaN|subtotal|sum\b|shipping|refund|return/i;
    const buyStr=String(row[mapping.prix_achat]??'').replace(',','.').trim();
    const buy=parseFloat(buyStr);
    // Prix achat invalide ou nul
    if(!mapping.prix_achat||!buyStr||isNaN(buy)||buy<0) return 'prix manquant';
    // Titre invalide : vide, chiffre pur, trop court, symbole
    const titre=buildTitre(row,mapping.titres);
    if(!titre||titre==='Article importé'||titre.length<2||/^[\d\s.,#*\-=]+$/.test(titre)) return 'titre invalide';
    // Ligne parasite (totaux, résumés, virements…)
    if(PARASITE_RE.test(titre)) return 'totaux/résumés';
    return null;
  }

  // Helper : construit le titre depuis mapping.titres (ÉTAPE 4)
  function buildTitre(r, titresCols){
    if(!titresCols.length) return "Article importé";
    const parts=titresCols.map(col=>String(r[col]??'').trim()).filter(p=>p!=='');
    const nom=parts.join(' - ');
    // Filtre les valeurs invalides
    if(!nom||/^[#\d.,\s]+$/.test(nom)) return "Article importé";
    return nom;
  }

  const MARQUES_CONNUES=["Nike","Adidas","Zara","H&M","Mango","Shein","Primark","Levi's","Levis","Ralph Lauren","Tommy Hilfiger","Lacoste","New Balance","Puma","Reebok","Under Armour","The North Face","Stone Island","Carhartt","Stussy","Supreme","Off-White","Balenciaga","Gucci","Louis Vuitton","Hermès","Hermes","Chanel","Dior","Givenchy","Burberry","Versace","Armani","Boss","Calvin Klein","Diesel","Guess","Michael Kors","Vans","Converse","Jordan","Timberland","UGG","Crocs","Uniqlo","Cos","Sandro","Maje","Ba&sh","Isabel Marant","Kiabi","Jules","Celio","Bershka","Pull&Bear","Stradivarius"];
  const MARQUE_KEEP_CASE=new Set(["H&M","BA&SH","Ba&sh"]);
  function detectMarque(titre,row,mapping){
    if(mapping.marque_col){
      const v=String(row[mapping.marque_col]??'').trim();
      if(v){const n=MARQUE_KEEP_CASE.has(v)?v:v.charAt(0).toUpperCase()+v.slice(1).toLowerCase();return n.trim();}
    }
    const t=String(titre||'');
    for(const m of MARQUES_CONNUES){
      if(new RegExp('\\b'+m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(t)){
        const n=MARQUE_KEEP_CASE.has(m)?m:m.charAt(0).toUpperCase()+m.slice(1).toLowerCase();
        return n.trim();
      }
    }
    return null;
  }

  function parseDate(val){
    if(!val) return null;
    if(!isNaN(val)&&Number(val)>1000){
      const d=new Date((Number(val)-25569)*86400000);
      return isNaN(d)?null:d.toISOString().split('T')[0];
    }
    const s=String(val).trim();
    const m1=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if(m1){const y=m1[3].length===2?"20"+m1[3]:m1[3];return `${y}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;}
    const m2=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    const d=new Date(s);
    return isNaN(d)?null:d.toISOString().split('T')[0];
  }

  // ── Import Excel / CSV ───────────────────────────────────────────────────
  function handleImportFile(e){
    const file=e.target.files?.[0];
    if(!file) return;
    e.target.value="";
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array"});

        const MOIS={janvier:1,février:2,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,août:8,aout:8,septembre:9,octobre:10,novembre:11,décembre:12,decembre:12};
        const IGNORE_RE=/^(listes?|liste|config|param[eè]tres?|r[eé]sum[eé]|summary|dashboard|feuil\d+|sheet\d+)$/i;
        const KEYWORDS=/nom|titre|article|marque|brand|achat|vente|prix|libell[eé]|d[eé]sign|item|statut|cat[eé]gorie|plateforme|b[eé]n[eé]fice|benefice|reception|date|taille|notes?/i;

        const allRows=[];
        const seenHeaders=new Set();
        let sheetsRead=0;

        for(const sheetName of wb.SheetNames){
          const cleanName=sheetName.replace(/\p{Emoji}/gu,'').trim();
          if(IGNORE_RE.test(cleanName)){
            console.log(`[Import] Sheet "${sheetName}" — ignored (config/list sheet)`);
            continue;
          }

          const ws=wb.Sheets[sheetName];
          const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
          console.log(`[Import] Sheet "${sheetName}" — ${matrix.length} rows`);

          // Date déduite du nom de feuille (ex: "Janvier" → 2026-01-01)
          const monthNum=MOIS[sheetName.trim().toLowerCase()];
          const sheetDate=monthNum
            ? new Date(new Date().getFullYear(),monthNum-1,1).toISOString()
            : null;

          // ÉTAPE 1 : Trouver la ligne headers
          let bestRowIdx=-1, bestScore=-1, fallbackIdx=-1;
          for(let i=0;i<Math.min(15,matrix.length);i++){
            const row=matrix[i].map(c=>String(c??'').trim());
            const nonEmpty=row.filter(c=>c!=='');
            const nonNumeric=nonEmpty.filter(c=>isNaN(parseFloat(c.replace(',','.'))));
            if(nonNumeric.length<2) continue;
            if(fallbackIdx<0&&nonEmpty.length>=3) fallbackIdx=i;
            const score=nonNumeric.filter(c=>KEYWORDS.test(c)).length;
            if(score>bestScore){bestScore=score;bestRowIdx=i;}
          }
          const headerRowIdx=bestRowIdx>=0?bestRowIdx:fallbackIdx;
          if(headerRowIdx<0){
            console.log(`[Import] Sheet "${sheetName}" — no headers found, skipping`);
            continue;
          }

          const headerRow=matrix[headerRowIdx].map(c=>String(c??'').trim());
          const rows=matrix.slice(headerRowIdx+1)
            .filter(r=>r.some(c=>String(c??'').trim()!==''))
            .map(r=>{
              const obj={};
              headerRow.forEach((h,ci)=>{if(h) obj[h]=r[ci]??'';});
              if(sheetDate) obj.__sheetDate=sheetDate;
              return obj;
            });

          if(!rows.length){
            console.log(`[Import] Sheet "${sheetName}" — no data rows, skipping`);
            continue;
          }

          // Vérifie que la feuille a au moins une colonne prix
          const sheetHeaders=headerRow.filter(h=>h!=='');
          const sheetMapping=detectColumns(sheetHeaders,rows);
          if(!sheetMapping.prix_achat){
            console.log(`[Import] Sheet "${sheetName}" — no price column detected, skipping`);
            continue;
          }

          sheetsRead++;
          allRows.push(...rows);
          sheetHeaders.forEach(h=>seenHeaders.add(h));
          console.log(`[Import] Sheet "${sheetName}" — added ${rows.length} rows`);
        }

        if(!allRows.length){
          setImportMsg("Aucune donnée valide trouvée dans le fichier.");
          return;
        }

        const allHeaders=[...seenHeaders];
        const mapping=detectColumns(allHeaders,allRows);

        // Filtre lignes parasites et compte par catégorie
        const skipCounts={};
        const cleanRows=allRows.filter(r=>{
          const reason=classifyParasite(r,mapping);
          if(reason){skipCounts[reason]=(skipCounts[reason]||0)+1;return false;}
          return true;
        });
        const ignoredCount=Object.values(skipCounts).reduce((a,b)=>a+b,0);
        console.log('[Import] Filtered:',cleanRows.length,'kept,',ignoredCount,'skipped',skipCounts);

        if(!cleanRows.length){
          const detail=Object.entries(skipCounts).map(([k,v])=>`${v} ${k}`).join(', ');
          setImportMsg(`Aucune ligne valide après filtrage (${detail}).`);
          return;
        }

        setImportModal({rows:cleanRows,mapping,preview:cleanRows.slice(0,3),headers:allHeaders,validCount:cleanRows.length,sheetsRead,ignoredCount,skipCounts});
        setImportMsg("");
      }catch(err){
        console.error('[Import] Error:',err);
        setImportMsg("Erreur lecture fichier : "+err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImportConfirm(){
    if(!importModal) return;
    setImportLoading(true);
    const{rows,mapping}=importModal;
    const now=new Date().toISOString();
    const toInsert=rows.map((r,idx)=>{
      const titre=buildTitre(r,mapping.titres);
      const buy=parseFloat(String(r[mapping.prix_achat]??0).replace(",","."))||0;
      const sell=mapping.prix_vente?parseFloat(String(r[mapping.prix_vente]??0).replace(",","."))||0:0;
      // ÉTAPE 5 : Statut
      const statut=mapping.statut
        ? (/vendu|sold|vend/i.test(String(r[mapping.statut]))?'vendu':'stock')
        : (sell>0?'vendu':'stock');
      const hasSell=sell>0;
      const margin=hasSell?sell-buy:null;
      const marginPct=hasSell?(margin/sell)*100:null;
      const parsedDate=mapping.date?parseDate(r[mapping.date]):null;
      const rowDate=parsedDate?(parsedDate+'T00:00:00.000Z'):(r.__sheetDate||now);
      let marque=null;
      if(mapping.marque_col){
        const v=String(r[mapping.marque_col]??'').trim();
        if(v) marque=MARQUE_KEEP_CASE.has(v)?v:v.charAt(0).toUpperCase()+v.slice(1).toLowerCase();
      } else {
        marque=detectMarque(titre,r,{marque_col:null});
      }
      const typeAuto=detectType(titre,marque);
      return{
        id:Date.now()+idx,
        user_id:user.id,
        titre,
        prix_achat:buy,
        prix_vente:hasSell?sell:null,
        margin,
        margin_pct:marginPct,
        statut,
        date:rowDate,
        marque:marque||"Sans marque",
        type:typeAuto,
        created_at:now,
      };
    }).filter(r=>r.prix_achat>=0&&r.titre!=="Article importé");
    console.log('[Import] Inserting',toInsert.length,'rows — sample:',toInsert[0]);

    const{data,error}=await supabase.from('inventaire').insert(toInsert).select();
    if(error){setImportLoading(false);setImportMsg("Erreur import : "+error.message);return;}

    // Insère aussi dans ventes les lignes "vendu" (depuis data = retour Supabase avec vrais ids)
    const ventesRows=(data||[])
      .filter(row=>row.statut==='vendu'&&row.prix_vente>0)
      .map(row=>({
        user_id:user.id,
        titre:row.titre,
        prix_achat:parseFloat(row.prix_achat)||0,
        prix_vente:parseFloat(row.prix_vente)||0,
        benefice:parseFloat(row.margin)||0,
        date:(row.date?String(row.date):now.toString()).slice(0,10),
        marque:row.marque||"Sans marque",
        type:row.type||null,
        description:row.description||null,
        emplacement:row.emplacement||null,
      }));
    console.log('[Import] ventesRows à insérer:',ventesRows);
    if(ventesRows.length){
      const{error:ve}=await supabase.from('ventes').insert(ventesRows);
      console.log('[Import] erreur ventes:',ve);
      if(ve) console.warn('[Import] ventes insert error:',ve.message);
    }

    // Resync complet depuis Supabase
    await fetchAll(user.id);
    setImportLoading(false);
    setImportModal(null);
    setImportMsg(`✅ ${data?.length||0} article(s) importé(s) avec succès.`);
    setTimeout(()=>setImportMsg(""),4000);
  }

  // ── Export Excel ─────────────────────────────────────────────────────────
  async function handleExport(){
    const today=new Date().toISOString().split("T")[0];
    const wb=XLSX.utils.book_new();
    const FULL_MONTHS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

    const HS={fill:{patternType:"solid",fgColor:{rgb:"1D9E75"}},font:{bold:true,color:{rgb:"FFFFFF"},sz:11},alignment:{horizontal:"center",vertical:"center"}};
    const RS=[{fill:{patternType:"solid",fgColor:{rgb:"FFFFFF"}}},{fill:{patternType:"solid",fgColor:{rgb:"F5F6F5"}}}];
    const TS={fill:{patternType:"solid",fgColor:{rgb:"FFF8EE"}},font:{bold:true}};

    // Group sold inventaire rows by month
    const monthGroups={};
    sold.forEach(item=>{
      const d=new Date(item.date||Date.now());
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label=`${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if(!monthGroups[key])monthGroups[key]={label,rows:[]};
      monthGroups[key].rows.push(item);
    });

    const MONTH_HEADERS=['Nom','Marque','Catégorie','Description','Quantité','Prix achat','Frais','Prix vente','Bénéfice','Marge %','Emplacement','Date vente'];
    const MONTH_COLS=[{wch:28},{wch:14},{wch:14},{wch:28},{wch:9},{wch:12},{wch:10},{wch:12},{wch:12},{wch:10},{wch:14},{wch:12}];
    const summaryData=[];

    Object.keys(monthGroups).sort().forEach(key=>{
      const{label,rows}=monthGroups[key];
      const aoa=[MONTH_HEADERS.map(h=>({v:h,t:'s',s:HS}))];
      let totBuy=0,totSell=0,totMargin=0,totQty=0;

      rows.forEach((item,idx)=>{
        const rs=RS[idx%2];
        const qty=item.quantite||1;
        const buy=(item.buy||0)*qty;
        const fees=(item.sellingFees||0)*qty;
        const sell=(item.sell||0)*qty;
        const margin=(item.margin||0)*qty;
        totBuy+=buy;totSell+=sell;totMargin+=margin;totQty+=qty;
        aoa.push([
          {v:item.title||'',t:'s',s:rs},
          {v:item.marque||'',t:'s',s:rs},
          {v:item.type||'',t:'s',s:rs},
          {v:item.description||'',t:'s',s:rs},
          {v:qty,t:'n',s:rs},
          {v:parseFloat(buy.toFixed(2)),t:'n',s:rs},
          {v:parseFloat(fees.toFixed(2)),t:'n',s:rs},
          {v:parseFloat(sell.toFixed(2)),t:'n',s:rs},
          {v:parseFloat(margin.toFixed(2)),t:'n',s:{...rs,font:{color:{rgb:margin>=0?"1D9E75":"DC2626"}}}},
          {v:parseFloat((item.marginPct||0).toFixed(1)),t:'n',s:rs},
          {v:item.emplacement||'',t:'s',s:rs},
          {v:item.date?new Date(item.date).toLocaleDateString('fr-FR'):'',t:'s',s:rs},
        ]);
      });

      const avgPct=totSell>0?(totMargin/totSell)*100:0;
      aoa.push([
        {v:'TOTAL',t:'s',s:TS},{v:'',t:'s',s:TS},{v:'',t:'s',s:TS},{v:'',t:'s',s:TS},
        {v:totQty,t:'n',s:TS},
        {v:parseFloat(totBuy.toFixed(2)),t:'n',s:TS},
        {v:'',t:'s',s:TS},
        {v:parseFloat(totSell.toFixed(2)),t:'n',s:TS},
        {v:parseFloat(totMargin.toFixed(2)),t:'n',s:{...TS,font:{bold:true,color:{rgb:totMargin>=0?"1D9E75":"DC2626"}}}},
        {v:parseFloat(avgPct.toFixed(1)),t:'n',s:TS},
        {v:'',t:'s',s:TS},
        {v:'',t:'s',s:TS},
      ]);

      const ws=XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols']=MONTH_COLS;
      XLSX.utils.book_append_sheet(wb,ws,label.substring(0,31));
      summaryData.push({label,count:rows.length,totSell,totMargin,avgPct});
    });

    // Récapitulatif
    const RECAP_HEADERS=['Mois','Nb ventes','CA total (€)','Bénéfice total (€)','Marge moyenne (%)'];
    const recapAoa=[RECAP_HEADERS.map(h=>({v:h,t:'s',s:HS}))];
    let gSell=0,gMargin=0,gCount=0;
    summaryData.forEach(({label,count,totSell,totMargin,avgPct},idx)=>{
      const rs=RS[idx%2];
      gSell+=totSell;gMargin+=totMargin;gCount+=count;
      recapAoa.push([
        {v:label,t:'s',s:rs},
        {v:count,t:'n',s:rs},
        {v:parseFloat(totSell.toFixed(2)),t:'n',s:rs},
        {v:parseFloat(totMargin.toFixed(2)),t:'n',s:{...rs,font:{color:{rgb:totMargin>=0?"1D9E75":"DC2626"}}}},
        {v:parseFloat(avgPct.toFixed(1)),t:'n',s:rs},
      ]);
    });
    const gAvgPct=gSell>0?(gMargin/gSell)*100:0;
    recapAoa.push([
      {v:'TOTAL',t:'s',s:TS},{v:gCount,t:'n',s:TS},
      {v:parseFloat(gSell.toFixed(2)),t:'n',s:TS},
      {v:parseFloat(gMargin.toFixed(2)),t:'n',s:{...TS,font:{bold:true,color:{rgb:gMargin>=0?"1D9E75":"DC2626"}}}},
      {v:parseFloat(gAvgPct.toFixed(1)),t:'n',s:TS},
    ]);
    const recapWs=XLSX.utils.aoa_to_sheet(recapAoa);
    recapWs['!cols']=[{wch:18},{wch:10},{wch:14},{wch:18},{wch:16}];
    XLSX.utils.book_append_sheet(wb,recapWs,'Récapitulatif');

    // Inventaire (stock actuel)
    const INV_HEADERS=['Nom','Marque','Catégorie','Description','Quantité','Prix achat unit.','Total investi','Emplacement','Date ajout'];
    const invAoa=[INV_HEADERS.map(h=>({v:h,t:'s',s:HS}))];
    stock.forEach((item,idx)=>{
      const rs=RS[idx%2];
      const qty=item.quantite||1;
      invAoa.push([
        {v:item.title||'',t:'s',s:rs},
        {v:item.marque||'',t:'s',s:rs},
        {v:item.type||'',t:'s',s:rs},
        {v:item.description||'',t:'s',s:rs},
        {v:qty,t:'n',s:rs},
        {v:parseFloat((item.buy||0).toFixed(2)),t:'n',s:rs},
        {v:parseFloat(((item.buy||0)*qty).toFixed(2)),t:'n',s:rs},
        {v:item.emplacement||'',t:'s',s:rs},
        {v:item.date_ajout?new Date(item.date_ajout).toLocaleDateString('fr-FR'):'',t:'s',s:rs},
      ]);
    });
    const invWs=XLSX.utils.aoa_to_sheet(invAoa);
    invWs['!cols']=[{wch:28},{wch:14},{wch:14},{wch:28},{wch:9},{wch:14},{wch:13},{wch:14},{wch:12}];
    XLSX.utils.book_append_sheet(wb,invWs,'Inventaire');

    const filename=`fillsell-export-${today}.xlsx`;
    if(isNative){
      try{
        const wbout=XLSX.write(wb,{bookType:'xlsx',type:'array',cellStyles:true});
        const blob=new Blob([wbout],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        const file=new File([blob],filename,{type:blob.type});
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          await navigator.share({files:[file],title:'Export FillSell'});
        }else{
          alert('Export disponible sur la version web : fillsell.app');
        }
      }catch(e){
        if(e?.name!=='AbortError')alert('Export disponible sur la version web : fillsell.app');
      }
    }else{
      XLSX.writeFile(wb,filename,{cellStyles:true});
    }
  }

  const handleAppleSignIn = async () => {
    // FIX 1 : ne pas re-déclencher si session déjà active
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession) { navigate('/app'); return; }
    try {
      const { identityToken } = await AppleSignIn.signIn();
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
      });
      if (error) throw error;
      if (data?.session) {
        const u = data.session.user;
        setUser(u);
        // Splash pendant le chargement des données — évite le flash d'app vide
        setAppLoading(true);
        await fetchAll(u.id);
        navigate('/app');
      }
    } catch (e) {
      // FIX 2 : annulation silencieuse (code 1001 iOS ou USER_CANCELLED)
      const isCancelled =
        e?.code === 1001 ||
        e?.code === '1001' ||
        e?.message === 'USER_CANCELLED' ||
        e?.message?.includes('1001') ||
        e?.message?.includes('cancel') ||
        e?.message?.includes('Cancel');
      if (!isCancelled) {
        console.error('Apple Sign In error:', e);
        alert('Erreur Sign in with Apple: ' + e.message);
      }
    }
  };

  // OAuth navigateur (Apple web / Google) — flux PKCE, générique par provider.
  // Web/desktop : redirection pleine page vers le provider, retour sur
  //   /auth/callback?code=… (AuthCallback échange le code puis route vers /app).
  // Android natif : skipBrowserRedirect + @capacitor/browser (Custom Tab), le
  //   provider redirige vers app.fillsell.app://callback (intent-filter du
  //   manifest) et l'écouteur appUrlOpen ci-dessous échange le code — dans la
  //   MÊME webview que l'initiation, où vit le code_verifier PKCE.
  // iOS natif n'utilise pas ce chemin : Apple y passe par le plugin natif
  //   AppleSignIn (signInWithIdToken), voir handleAppleSignIn.
  const handleOAuthSignIn = async (provider) => {
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession) { navigate('/app'); return; }
    setLoginError("");
    try {
      if (isNative) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: 'app.fillsell.app://callback', skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (data?.url) await Browser.open({ url: data.url });
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        // Redirection pleine page imminente — rien à faire ici.
      }
    } catch (e) {
      console.error(`OAuth ${provider} error:`, e);
      setLoginError(e.message || 'Erreur de connexion');
    }
  };

  // Retour du deep link OAuth natif (app.fillsell.app://callback?code=…).
  // Android ET iOS (2026-07-12) : @capacitor/app est désormais synchronisé sur
  // les deux plateformes, et le scheme est déclaré côté iOS dans Info.plist
  // (CFBundleURLTypes) comme il l'est côté Android (intent-filter).
  // Ne concerne QUE Google : Sign in with Apple sur iOS reste le plugin natif
  // (handleAppleSignIn, signInWithIdToken) et ne passe jamais par ici — le
  // filtre sur app.fillsell.app://callback ignore de toute façon le reste.
  useEffect(() => {
    if (!isNative) return;
    const subPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url?.startsWith('app.fillsell.app://callback')) return;
      try { await Browser.close(); } catch { /* Custom Tab déjà fermé */ }
      const m = url.match(/[?&]code=([^&#]+)/);
      if (!m) return; // annulation ou erreur provider : on reste sur le login
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(m[1]));
        if (error) throw error;
        if (data?.session) {
          setUser(data.session.user);
          setAppLoading(true); // splash pendant fetchAll, comme handleAppleSignIn
          await fetchAll(data.session.user.id);
          navigate('/app');
        }
      } catch (e) {
        console.error('OAuth deep link error:', e);
        setLoginError(e.message || 'Erreur de connexion');
      }
    });
    return () => { subPromise.then(s => s.remove()).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(){
    if(isSigningIn||isSigningUp)return;
    setLoginError("");
    if(!emailRef.current?.value||!passwordRef.current?.value){setLoginError("Remplis email et mot de passe");return;}
    setIsSigningIn(true);
    try{
      const{error}=await supabase.auth.signInWithPassword({email:emailRef.current?.value,password:passwordRef.current?.value});
      if(error){setLoginError(error.message);return;}
      track('login', { method: 'email' });
      // Splash jusqu'à la fin de fetchAll (lancé par SIGNED_IN) — évite le flash d'app vide
      setAppLoading(true);
      // Cible protégée mémorisée par RequireAuth (ex. /extension depuis le
      // lien e-mail de l'accroche) : elle prime sur /app, une seule fois.
      navigate(consumePostLoginTarget() ?? "/app");
    }catch(e){setLoginError(e.message);}finally{setIsSigningIn(false);}
  }

  async function handleForgot(){
    if(isSendingReset)return;
    const _lt=localStorage.getItem('fs_lang')||((navigator.language||'fr').startsWith('fr')?'fr':'en');
    // Ref en priorité (valeur réelle du champ, couvre l'autofill), state en secours
    const emailVal=(emailRef.current?.value||email).trim();
    if(!emailVal){setForgotMsg(_lt==='en'?"Enter your email above.":"Saisis ton email ci-dessus.");return;}
    setForgotMsg("");
    setIsSendingReset(true);
    try{
      const{error}=await supabase.auth.resetPasswordForEmail(emailVal,{redirectTo:"https://fillsell.app/reset-password"});
      if(error){setForgotMsg(_lt==='en'?`Error: ${error.message}`:`Erreur : ${error.message}`);return;}
      setForgotMsg(_lt==='en'?"📧 Email sent! Check your inbox.":"📧 Email envoyé ! Vérifie ta boîte mail.");
    }catch(e){setForgotMsg(_lt==='en'?`Error: ${e.message}`:`Erreur : ${e.message}`);}finally{setIsSendingReset(false);}
  }

  async function handleSignup(){
    if(isSigningIn||isSigningUp)return;
    const emailVal=emailRef.current?.value;
    const passwordVal=passwordRef.current?.value;
    const _slt=localStorage.getItem('fs_lang')||((navigator.language||'fr').startsWith('fr')?'fr':'en');
    if(!emailVal||!passwordVal){alert(_slt==='en'?"Fill in your email and password":"Remplis email et mot de passe");return;}
    setLoginError("");
    // Double vérification de l'email — bloque avant tout appel Supabase
    if(emailVal.trim()!==emailConfirm.trim()){setLoginError(_slt==='en'?"Emails don't match":"Les emails ne correspondent pas");return;}
    setIsSigningUp(true);
    try{
      const{data,error}=await supabase.auth.signUp({email:emailVal,password:passwordVal});
      if(error){alert(error.message);return;}
      track('sign_up', { method: 'email' });
      trackTikTokEvent("CompleteRegistration", emailVal);
      if(data?.session){
        // Splash jusqu'à la fin de fetchAll — évite le flash d'app vide
        setAppLoading(true);
        navigate("/app");
      }
      else alert(_slt==='en'?"Check your email to confirm your account!":"Vérifie ton email pour confirmer ton compte !");
    }catch(e){alert(e.message);}finally{setIsSigningUp(false);}
  }

  async function handleLogout(){
    await supabase.auth.signOut();
    setUser(null);setSales([]);setItems([]);setResetStep(0);
    navigate("/");
  }

  async function handleDeleteAccount(){
    if(!user) return;
    setDeleteLoading(true);
    try {
      await supabase.from("inventaire").delete().eq("user_id",user.id);
      await supabase.from("ventes").delete().eq("user_id",user.id);
      await supabase.from("profiles").delete().eq("id",user.id);
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/delete-account`,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":`Bearer ${jwt}`,
            "apikey":supabaseAnonKey,
          },
        }
      );
      if(!res.ok){ const e=await res.json(); throw new Error(e.error||(lang==='en'?"Account deletion error":"Erreur suppression compte")); }
      await supabase.auth.signOut();
      setUser(null);setSales([]);setItems([]);
      navigate("/");
    } catch(err){
      alert(lang==='fr'?`Erreur : ${err.message}`:`Error: ${err.message}`);
    } finally {
      setDeleteLoading(false);
      setDeleteStep(0);
    }
  }

  const TABS_MOBILE=[
    {Icon:BarChart3,   label:lang==='fr'?"Tableau":"Board",idx:0},
    {Icon:Bot,         label:lang==='fr'?"Stock IA":"AI Stock",idx:1},
    {Icon:Aperture,    label:"Lens",idx:2},
    {Icon:ClipboardList,label:lang==='fr'?"Ventes":"Sales",idx:3},
    {Icon:LineChart,   label:"Stats",idx:4},
  ];

  const headerStats=[
    {label:t('benefices'),value:fmt(totalM)},
    {label:t('totalInvesti'),value:fmt(invested)},
    {label:t('enStockLabel'),value:`${stockQty} ${lang==='fr'?'art.':'items'} · ${fmt(stockVal)}`},
  ];

  if(authLoading||appLoading)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:UI.canvas,flexDirection:"column",gap:20}}>
      <img src="/icon_1024x1024.png" alt="FillSell" style={{width:64,height:64,borderRadius:16,objectFit:"cover",boxShadow:"0 8px 24px rgba(16,32,27,0.12)"}}/>
      <Loader size={32} thickness={3}/>
    </div>
  );

  const loginLang=localStorage.getItem('fs_lang')||((navigator.language||'fr').startsWith('fr')?'fr':'en');
  const loginTexts=loginLang==='en'?{
    subtitle:"Sign in to continue",login:"Sign in",signup:"Create my account",
    forgot:"Forgot your password?",forgotBtn:"Send reset link",
    forgotMsg:"Enter your email above.",back:"← Back",
    confirmEmail:"Confirm your email"
  }:{
    subtitle:"Connecte-toi pour continuer",login:"Se connecter",signup:"Créer mon compte",
    forgot:"Mot de passe oublié ?",forgotBtn:"Envoyer le lien de réinitialisation",
    forgotMsg:"Saisis ton email ci-dessus.",back:"← Retour",
    confirmEmail:"Confirme ton email"
  };

  if(!authLoading&&(!user||loginOnly))return(
    <div style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:UI.canvas,overflow:"hidden",boxSizing:"border-box"}}>
      <button onClick={()=>navigate("/")} style={{position:"absolute",top:"max(50px, calc(16px + env(safe-area-inset-top)))",left:16,width:36,height:36,borderRadius:"50%",background:UI.card,border:`1px solid ${UI.border}`,color:UI.ink,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>←</button>
      <div style={{background:UI.card,borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:400,border:`1px solid ${UI.border}`,boxShadow:"0 24px 64px rgba(16,32,27,0.10)",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <img src="/logo.png" style={{height:48,marginBottom:14,objectFit:"contain"}} alt="FillSell"/>
          <div style={{fontSize:14.5,color:UI.mute2,fontWeight:500}}>{loginTexts.subtitle}</div>
        </div>
        <div style={{marginBottom:20}}>
          <SegmentedPills
            options={['login','signup']}
            value={authMode}
            onChange={m=>{setAuthMode(m);setLoginError("");}}
            labelFn={m=>m==='login'?loginTexts.login:loginTexts.signup}
          />
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {/* Fournisseurs (maj 2026-07-12) :
              - iOS natif  : Apple via plugin natif (signInWithIdToken) — EN PREMIER,
                             comme l'exige Apple — PUIS Google (OAuth via
                             SFSafariViewController + deep link app.fillsell.app://callback).
                             Guideline 4.8 respectée : Sign in with Apple est proposé.
              - Web/desktop: Apple (OAuth PKCE → /auth/callback) + Google.
              - Android    : Google (OAuth via Custom Tab + même deep link). */}
          <div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
            {isNative&&platform==='ios'&&(
              <button onClick={handleAppleSignIn} style={{width:"100%",backgroundColor:"#000",color:"#fff",border:"none",borderRadius:14,padding:"14px 16px",fontSize:15.5,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:19}}>&#63743;</span>
                {lang==='fr'?'Continuer avec Apple':'Continue with Apple'}
              </button>
            )}
            {!isNative&&(
              <button onClick={()=>handleOAuthSignIn('apple')} style={{width:"100%",backgroundColor:"#000",color:"#fff",border:"none",borderRadius:14,padding:"14px 16px",fontSize:15.5,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:"inherit"}}>
                {/* Logo Apple en SVG inline (comme le G Google) : le glyphe U+F8FF
                    n'existe que dans les fontes Apple — carré vide ailleurs. */}
                <svg width="15" height="18" viewBox="0 0 814 1000" aria-hidden="true">
                  <path fill="#fff" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
                </svg>
                {lang==='fr'?'Continuer avec Apple':'Continue with Apple'}
              </button>
            )}
            {/* Google : web/desktop, Android et iOS. Sur iOS il est rendu APRÈS le
                bouton Apple ci-dessus, qui reste l'option native et prioritaire. */}
            {(
              <button onClick={()=>handleOAuthSignIn('google')} style={{width:"100%",backgroundColor:UI.card,color:UI.ink,border:`1px solid ${UI.border}`,borderRadius:14,padding:"14px 16px",fontSize:15.5,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:10,cursor:"pointer",fontFamily:"inherit"}}>
                {/* Logo Google officiel (G quadricolore) */}
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                {lang==='fr'?'Se connecter avec Google':'Sign in with Google'}
              </button>
            )}
            <div style={{textAlign:"center",color:UI.mute,fontSize:12.5,marginTop:2}}>
              {lang==='fr'?'— ou —':'— or —'}
            </div>
          </div>
          <input type="email" placeholder="Email" ref={emailRef} defaultValue=""
            onChange={e=>setEmail(e.target.value)}
            style={{padding:"13px 16px",borderRadius:14,border:`1px solid ${UI.border}`,fontSize:16,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",background:UI.chip,color:UI.ink}}/>
          {!forgotMode&&authMode==='signup'&&(
            <input type="email" placeholder={loginTexts.confirmEmail} value={emailConfirm}
              onChange={e=>setEmailConfirm(e.target.value)}
              style={{padding:"13px 16px",borderRadius:14,border:`1px solid ${UI.border}`,fontSize:16,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",background:UI.chip,color:UI.ink}}/>
          )}
          {!forgotMode&&(
            <>
              <div style={{position:"relative",width:"100%"}}>
                <input type={showPassword?"text":"password"} placeholder="Mot de passe" ref={passwordRef} defaultValue=""
                  onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                  style={{padding:"13px 16px",paddingRight:46,borderRadius:14,border:`1px solid ${UI.border}`,fontSize:16,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box",background:UI.chip,color:UI.ink}}/>
                <button type="button" onClick={()=>setShowPassword(s=>!s)}
                  aria-label={showPassword?"Masquer le mot de passe":"Afficher le mot de passe"}
                  style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",padding:4,cursor:"pointer",color:UI.mute2,display:"flex",alignItems:"center"}}>
                  {showPassword?<EyeOff size={18}/>:<Eye size={18}/>}
                </button>
              </div>
              <PrimaryButton onClick={authMode==='login'?handleLogin:handleSignup} disabled={isSigningIn||isSigningUp} style={{padding:14}}>
                {(isSigningIn||isSigningUp)?<Loader size={19} thickness={2}/>:(authMode==='login'?loginTexts.login:loginTexts.signup)}
              </PrimaryButton>
              {loginError&&<div style={{fontSize:13,textAlign:"center",color:UI.negative,fontWeight:600}}>{loginError}</div>}
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(true);setForgotMsg("");}} style={{fontSize:13,color:UI.teal,cursor:"pointer",textDecoration:"underline"}}>
                  {loginTexts.forgot}
                </span>
              </div>
            </>
          )}
          {forgotMode&&(
            <>
              <PrimaryButton onClick={handleForgot} disabled={isSendingReset} style={{padding:14}}>
                {isSendingReset?<Loader size={19} thickness={2}/>:loginTexts.forgotBtn}
              </PrimaryButton>
              {forgotMsg&&(
                <div style={{fontSize:13,textAlign:"center",color:forgotMsg.startsWith("📧")?UI.tealDeep:UI.negative,fontWeight:600}}>
                  {forgotMsg}
                </div>
              )}
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(false);setForgotMsg("");}} style={{fontSize:13,color:UI.mute2,cursor:"pointer"}}>
                  {loginTexts.back}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const vaActions={
    addItem:async(data)=>{
      // ⚠️ Les libellés jetés (« Limite gratuite atteinte » / « Free plan limit
      // reached ») sont des MARQUEURS lus par saveLensItemForListing — ne pas
      // les reformuler.
      if(!isPremium&&compteArticlesQuota(items)>=FREE_STOCK_LIMIT_FALLBACK){try{ouvrirModalePlafond('plafond_stock',{trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?`${FREE_STOCK_LIMIT_FALLBACK} item limit reached. Upgrade to Premium for unlimited stock.`:`Limite de ${FREE_STOCK_LIMIT_FALLBACK} articles atteinte. Passez Premium pour un stock illimité.`});setTimeout(()=>setToast({visible:false,message:""}),4000);}throw new Error(lang==='fr'?"Limite gratuite atteinte":"Free plan limit reached");}
      // prix_achat explicitement null (et aucune estimation de lot) = prix réellement inconnu,
      // à ne jamais confondre avec 0€ (payé gratuitement) ni combler par une estimation IA.
      const b=(data.prix_achat===null&&data.prix_estime_lot==null)?null:(parseFloat(String(data.prix_achat??data.prix_estime_lot??0).replace(",","."))||0);
      const marqueNorm=normalizeMarque(data.marque);
      const _td3=detectType(data.nom||"",marqueNorm);const typeAuto=(data.categorie&&data.categorie!=='Luxe')?data.categorie:_td3;
      const _cleanDesc=(desc,nom,marque)=>{if(!desc)return null;let s=desc;const _strip=(w)=>{if(!w)return;s=s.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'gi'),'').trim();};_strip(nom);_strip(marque);s=s.replace(/\s+/g,' ').replace(/^[,\s]+|[,\s]+$/g,'').trim();return s||null;};
      const row={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:stripMarque(data.nom||"Article",marqueNorm),prix_achat:b,prix_vente:null,margin:null,margin_pct:null,statut:"stock",date:new Date().toISOString(),marque:marqueNorm,description:_cleanDesc(data.description,data.nom,marqueNorm),type:typeAuto,purchase_costs:0,selling_fees:0,quantite:data.quantite||1,emplacement:data.emplacement||null,plateforme:data.plateforme||null};
      console.log("[addItem] data reçu:", JSON.stringify(data), "row.quantite:", row.quantite);
      const{data:d,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(error){const isAuth=/jwt|auth|session|not authenticated|authorization/i.test(error.message);throw new Error(isAuth?`SESSION_EXPIRED:${error.message}`:error.message);}
      const mapped=mapItem({...d,quantite:d.quantite??row.quantite});
      setItems(prev=>[mapped,...prev]);
      return mapped;
    },
    markSold:(item)=>markSold(item),
    confirmSellDirect:async(item,prix_vente,frais=0,quantite_vendue=1,plateforme=null)=>{
      const sv=parseFloat(String(prix_vente??0).replace(",","."))||0;
      if(!sv||sv<=0)throw new Error("Prix vente invalide");
      const sf=parseFloat(String(frais??0).replace(",","."))||0;
      // VIDE ≠ ZÉRO (03/08) — même trou que confirmSell : `item.buy` null
      // donnait cogs=0 et un bénéfice égal au prix de vente, écrit en base.
      const {margin:mg,marginPct:mgp}=margeUnitaire({
        prixVente:sv,
        prixAchat:prixAchatConnu(item)?item.buy:null,
        purchaseCosts:item.purchaseCosts||0,
        sellingFees:sf,
      });
      const qTotal=item.quantite||1;
      const qVendue=Math.min(quantite_vendue||1,qTotal);
      const remaining=qTotal-qVendue;
      if(remaining>0){
        // Vente partielle : réduire la quantité du stock d'abord
        const{error:updQtyErr}=await supabase.from('inventaire').update({quantite:remaining}).eq('id',item.id);
        if(updQtyErr)throw new Error(updQtyErr.message);
        setItems(prev=>prev.map(i=>i.id===item.id?{...i,quantite:remaining}:i));
        // Insérer une ligne "vendu" séparée pour la quantité vendue
        const soldRow={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:sv,margin:mg,margin_pct:mgp,statut:"vendu",selling_fees:sf,purchase_costs:0,quantite:qVendue,marque:item.marque||null,type:item.type||null,description:item.description||null,date:new Date().toISOString(),plateforme:plateforme||item.plateforme||null};
        const{data:si,error:siErr}=await supabase.from('inventaire').insert([soldRow]).select().single();
        if(siErr)console.error("[confirmSellDirect] soldRow insert failed:",siErr.message);
        if(si)setItems(prev=>[mapItem(si),...prev]);
      }else{
        // Vente complète : marquer l'article comme vendu dans inventaire
        // .select('id') permet de vérifier que la ligne a bien été mise à jour
        // `date` AUSSI (2026-08-24, point C — même trou que confirmSell) :
        // date = date de vente sur toute ligne qui passe en vendu.
        const{data:updRows,error:updErr}=await supabase.from('inventaire')
          .update({prix_vente:sv,margin:mg,margin_pct:mgp,statut:"vendu",selling_fees:sf,date:new Date().toISOString()})
          .eq('id',item.id)
          .select('id');
        // Lever une erreur si la mise à jour a échoué — on n'insère pas dans ventes si inventaire non modifié
        if(updErr)throw new Error(updErr.message);
        if(!updRows?.length)throw new Error(lang==="fr"?"Article introuvable en inventaire":"Item not found in inventory");
        setItems(prev=>prev.map(i=>i.id===item.id?{...i,sell:sv,margin:mg,marginPct:mgp,statut:"vendu"}:i));
      }
      // Insérer dans ventes uniquement si l'inventaire a bien été mis à jour
      {
        const srow={user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:sv,benefice:mg,marque:item.marque||null,type:item.type||null,description:item.description||null,emplacement:item.emplacement||null,date:new Date().toISOString().split('T')[0],plateforme:plateforme||item.plateforme||null,quantite:qVendue>1?qVendue:null};
        const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
        if(sd)setSales(prev=>[mapSale(sd),...prev]);
      }
      // Resynchroniser depuis la base pour garantir la cohérence (comme confirmSell le fait)
      await fetchAll(user.id);
    },
    deleteItem:(id)=>delItem(id),
    // « Force » = saute la confirmation VENTE (son rôle d'origine, chemin
    // vocal). Ne saute PAS le retrait des annonces : supprimer en silence un
    // article encore en ligne laisserait exactement les annonces orphelines
    // qu'on corrige. Aucune annonce ni job actif → suppression directe, comme
    // avant. Sinon la modale s'ouvre : c'est le seul endroit où l'utilisateur
    // peut décider, et une commande vocale ne peut pas trancher ça seule.
    deleteItemForce:async(id)=>{
      const item=items.find(i=>i.id===id);
      if(!item){await supabase.from('inventaire').delete().eq('id',id);await fetchAll(user.id);return;}
      let plan=null;
      try{plan=await buildDeletePlan(id);}
      catch(e){console.error('[deleteItemForce] plan:',e.message);setDeleteConfirm({type:'planError',item});return;}
      if(plan.online.length||plan.aAnnuler.length){setDeleteConfirm({type:'itemListings',item,plan});return;}
      await performItemDeletion(item,plan);
      setItems(prev=>prev.filter(i=>i.id!==id));
    },
    fetchAll:()=>fetchAll(user.id),
    updateItem:async(id,fields)=>{
      const{error}=await supabase.from('inventaire').update(fields).eq('id',id);
      if(error)throw new Error(error.message);
    },
    // Met à jour l'emplacement physique d'un ou plusieurs articles (intent inventory_move)
    moveToLocation:async(ids,emplacement)=>{
      for(const id of ids){
        const{error}=await supabase.from('inventaire').update({emplacement}).eq('id',id);
        if(error)throw new Error(error.message);
      }
      setItems(prev=>prev.map(i=>ids.map(String).includes(String(i.id))?{...i,emplacement}:i));
      await fetchAll(user.id);
    },
    // Vente directe sans article en stock (intent inventory_sell + no_match).
    // Insère uniquement dans ventes — pas de suppression inventaire.
    addDirectSale:async({nom,marque,type,description,prix_vente,prix_achat,quantite_vendue,plateforme})=>{
      const pv=parseFloat(String(prix_vente??0).replace(",","."))||0;
      // VIDE ≠ ZÉRO (03/08). L'ancien code écrivait `benefice: pa>0 ? pv-pa : pv`
      // — c'est-à-dire : prix d'achat non dicté ⇒ le bénéfice DEVIENT le chiffre
      // d'affaires entier. C'était le fallback le plus faux du dépôt, sur le
      // chemin le plus fréquent (vente dictée d'un article hors stock).
      const paBrut=prix_achat===null||prix_achat===undefined||prix_achat===""
        ?null:parseFloat(String(prix_achat).replace(",","."));
      const pa=Number.isFinite(paBrut)?paBrut:null;
      const qv=Math.max(1,parseInt(quantite_vendue)||1);
      const marqueNorm=normalizeMarque(marque);
      const {margin:benef}=margeUnitaire({prixVente:pv,prixAchat:pa});
      const row={user_id:user.id,titre:nom||"Article",marque:marqueNorm,type:type||null,description:description||null,prix_achat:pa,prix_vente:pv,benefice:benef,date:new Date().toISOString().split('T')[0],plateforme:plateforme||null,quantite:qv>1?qv:null};
      const{data,error}=await supabase.from('ventes').insert([row]).select().single();
      if(error)throw new Error(error.message);
      if(data)setSales(prev=>[mapSale(data),...prev]);
    },
  };

  async function analyzeDealWithIA(){
    if(!dealIADesc.trim())return;
    setDealIALoading(true);setDealIAResult(null);
    try{
      const{data:{session:daSess}}=await supabase.auth.getSession();
      const daToken=daSess?.access_token;
      const r=await fetch(`${supabaseUrl}/functions/v1/deal-analysis`,{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${daToken}`,"apikey":supabaseAnonKey},
        body:JSON.stringify({question:dealIADesc.trim(),lang,currency,country:userCountry?.code??getCountryFallback()}),
      });
      if(!r.ok){
        const errBody=await r.json().catch(()=>({}));
        if(errBody.error==='quota_exceeded'){
          // deal-analysis : Free 10/jour (pas de plafond mensuel), Premium/Pro illimités
          const msg=lang==='fr'?'Limite journalière atteinte. Revenez demain ou passez Premium.':'Daily limit reached. Come back tomorrow or upgrade to Premium.';
          setToast({visible:true,message:`🔒 ${msg}`});
          setTimeout(()=>setToast({visible:false,message:''}),4000);
          setDealIALoading(false);
          return;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      const{analysis,error:iErr}=await r.json();
      if(iErr)throw new Error(iErr);
      setDealIAResult(analysis||(lang==="fr"?"Analyse terminée.":"Analysis complete."));
    }catch(e){
      setDealIAResult(`❌ ${e.message}`);
    }finally{
      setDealIALoading(false);
    }
  }

  function toggleDealMic(){
    if(dealMicActive){
      dealMicRef.current?.stop();
      dealMicRef.current?.abort();
      dealMicRef.current=null;
      setDealMicActive(false);
      return;
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR)return;
    const rec=new SR();
    rec.lang=lang==="en"?"en-US":"fr-FR";
    rec.interimResults=false;
    rec.continuous=false;
    rec.onresult=e=>{
      const transcript=Array.from(e.results).map(r=>r[0].transcript).join(" ");
      setDealIADesc(prev=>(prev?prev+" ":"")+transcript);
      setDealIAResult(null);
    };
    rec.onend=()=>{setDealMicActive(false);dealMicRef.current=null;};
    rec.onerror=()=>{setDealMicActive(false);dealMicRef.current=null;};
    dealMicRef.current=rec;
    rec.start();
    setDealMicActive(true);
  }

  function handleLensPhoto(e){
    const files=Array.from(e.target.files||[]);
    if(!files.length)return;
    setLensResult(null);setLensAdded(false);
    const ALLOWED_MIMES=["image/jpeg","image/png","image/gif","image/webp"];
    files.forEach(file=>{
      if(file.size>8*1024*1024){alert(lang==="fr"?"Image trop lourde (max 8 Mo).":"Image too large (max 8MB).");return;}
      const rawMime=file.type||"image/jpeg";
      // HEIC/HEIF and other iOS formats not supported by Anthropic → declare as jpeg
      const safeMime=ALLOWED_MIMES.includes(rawMime)?rawMime:"image/jpeg";
      const reader=new FileReader();
      reader.onload=ev=>{
        const dataUrl=ev.target.result;
        setLensPhotos(prev=>{
          if(prev.length>=5)return prev; // cap 5 tant que lens-analysis gelé (slice 0,5 déployé) ; passer à (isPro?8:5) EN MÊME TEMPS que le déploiement lens slice(0,8)
          return[...prev,{preview:dataUrl,mime:safeMime}];
        });
      };
      reader.readAsDataURL(file);
    });
    if(lensFileRef.current)lensFileRef.current.value="";
  }

  // Caméra directe native (reprise S5, 2026-07-25) : getPhoto une photo à la
  // fois, comportement caméra normal — le remplacement intégral par pickImages
  // (3b967de) avait supprimé la prise de vue directe, non acceptable. Lens
  // porte désormais DEUX actions distinctes : « Prendre une photo » (ici) et
  // « Photothèque » (handleLensPhotoNative, pickImages multi).
  async function handleLensCameraNative(){
    try{
      let perms;
      try{ perms=await Camera.checkPermissions(); }catch(_){ perms=null; }

      if(perms?.camera==='denied'){
        alert(lang==='fr'
          ?'Accès à la caméra refusé.\n\nVa dans Réglages › FillSell › Active Appareil photo.'
          :'Camera access denied.\n\nGo to Settings › FillSell › Enable Camera.');
        return;
      }
      if(perms?.camera==='prompt'||perms?.camera==='prompt-with-rationale'){
        try{ await Camera.requestPermissions({permissions:['camera']}); }catch(_){}
      }

      const photo=await Camera.getPhoto({
        quality:90,
        allowEditing:false,
        resultType:CameraResultType.DataUrl,
        source:CameraSource.Camera,
      });
      if(!photo.dataUrl)return;
      setLensResult(null);setLensAdded(false);
      setLensPhotos(prev=>{
        if(prev.length>=5)return prev; // cap 5 tant que lens-analysis gelé (slice 0,5 déployé)
        return[...prev,{preview:photo.dataUrl,mime:'image/jpeg'}];
      });
    }catch(e){
      const msg=(e?.message||'').toLowerCase();
      if(msg.includes('cancel'))return;
      if(msg.includes('denied')||msg.includes('permission')){
        alert(lang==='fr'
          ?'Accès à la caméra refusé.\n\nVa dans Réglages › FillSell › Active Appareil photo.'
          :'Camera access denied.\n\nGo to Settings › FillSell › Enable Camera.');
        return;
      }
      // Plugin absent ou erreur interne → fallback vers file input, JAMAIS
      // muet (même diagnostic que le repli pickImages ci-dessous).
      console.error('[lens] getPhoto failed, fallback input', e?.message, e);
      lensFileRef.current?.click();
    }
  }

  // Photothèque native en multi-sélection (2026-07-25, S5) : pickImages —
  // Camera.getPhoto est mono-photo par design, chaque tap n'ajoutait qu'une
  // photo. La prise de vue directe vit dans handleLensCameraNative ci-dessus ;
  // le chemin web (input file multiple) reste le fallback des deux.
  async function handleLensPhotoNative(){
    try{
      // Vérifier l'état des permissions avant d'ouvrir (photos, plus caméra :
      // pickImages ne se sert que de la photothèque)
      let perms;
      try{ perms=await Camera.checkPermissions(); }catch(_){ perms=null; }

      if(perms?.photos==='denied'){
        alert(lang==='fr'
          ?'Accès aux photos refusé.\n\nVa dans Réglages › FillSell › Active Photos.'
          :'Photos access denied.\n\nGo to Settings › FillSell › Enable Photos.');
        return;
      }

      // Si "prompt" (jamais demandé) → demander explicitement avant d'ouvrir
      if(perms?.photos==='prompt'||perms?.photos==='prompt-with-rationale'){
        try{ await Camera.requestPermissions({permissions:['photos']}); }catch(_){}
      }

      const res=await Camera.pickImages({ quality:90, limit:5 });
      const picked=res?.photos??[];
      if(!picked.length)return;
      // pickImages ne fournit pas de DataUrl (contrairement à getPhoto) :
      // conversion webPath → dataUrl, une photo illisible est sautée sans
      // faire échouer les autres.
      const converted=[];
      for(const ph of picked){
        try{
          const blob=await fetch(ph.webPath).then(r=>r.blob());
          const dataUrl=await new Promise((resolve,reject)=>{
            const fr=new FileReader();
            fr.onload=()=>resolve(fr.result);
            fr.onerror=reject;
            fr.readAsDataURL(blob);
          });
          if(dataUrl)converted.push({preview:dataUrl,mime:blob.type||'image/jpeg'});
        }catch(_){/* photo illisible : sautée */}
      }
      if(!converted.length)return;
      setLensResult(null);setLensAdded(false);
      setLensPhotos(prev=>{
        const room=5-prev.length; // cap 5 tant que lens-analysis gelé (slice 0,5 déployé) ; passer à (isPro?8:5) EN MÊME TEMPS que le déploiement lens slice(0,8)
        if(room<=0)return prev;
        return[...prev,...converted.slice(0,room)];
      });
    }catch(e){
      const msg=(e?.message||'').toLowerCase();
      if(msg.includes('cancel'))return;
      if(msg.includes('denied')||msg.includes('permission')){
        alert(lang==='fr'
          ?'Accès aux photos refusé.\n\nVa dans Réglages › FillSell › Active Photos.'
          :'Photos access denied.\n\nGo to Settings › FillSell › Enable Photos.');
        return;
      }
      // Plugin absent ou erreur interne → fallback vers file input, JAMAIS
      // muet : ce log est la preuve (ou l'exclusion) de l'hypothèse « pickImages
      // échoue et retombe sur l'input » du diagnostic multi-select Android.
      console.error('[lens] pickImages failed, fallback input', e?.message, e);
      lensFileRef.current?.click();
    }
  }

  async function toggleLensMic(){
    if(lensMicActive){
      if(lensMicRef.current?.stop){lensMicRef.current.stop();}
      else if(lensMicRef.current?.abort){lensMicRef.current.abort();}
      lensMicRef.current=null;
      setLensMicActive(false);return;
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    // webkitSpeechRecognition exists in WKWebView but doesn't work in Capacitor native context
    if(SR && !isNative){
      const rec=new SR();
      rec.lang=lang==="en"?"en-US":"fr-FR";
      rec.interimResults=false;rec.continuous=true;
      rec.onresult=e=>{const t=Array.from(e.results).map(r=>r[0].transcript).join(" ");setLensDesc(prev=>(prev?prev+" ":"")+t);};
      rec.onend=()=>{setLensMicActive(false);lensMicRef.current=null;};
      rec.onerror=()=>{setLensMicActive(false);lensMicRef.current=null;};
      lensMicRef.current=rec;rec.start();setLensMicActive(true);
      return;
    }
    // iOS WKWebView: SpeechRecognition unavailable — use MediaRecorder + voice-transcribe
    if(!navigator.mediaDevices?.getUserMedia){
      setLensResult({error:lang==='fr'?'❌ Micro non disponible sur cet appareil.':'❌ Microphone not available on this device.'});
      return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      // Do NOT specify mimeType — iOS WKWebView throws when mimeType is explicit
      // even when isTypeSupported() returns true. Let the platform choose its native format.
      const mr=new MediaRecorder(stream);
      const chunks=[];
      mr.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data);};
      mr.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        setLensMicActive(false);setLensMicLoading(true);
        lensMicRef.current=null;
        try{
          // Read the actual MIME type from the recorder (set after start() on all platforms)
          // Fallback to audio/mp4 which iOS uses natively
          const actualMime=(mr.mimeType||"audio/mp4").split(";")[0];
          const blob=new Blob(chunks,{type:actualMime});
          const{data:{session:lmSess}}=await supabase.auth.getSession();
          const lmToken=lmSess?.access_token;
          const fd=new FormData();
          fd.append("audio",blob,`recording.${actualMime.split("/")[1]||"webm"}`);
          fd.append("lang",lang);
          const res=await fetch(`${supabaseUrl}/functions/v1/voice-transcribe`,{
            method:"POST",
            headers:{"Authorization":`Bearer ${lmToken}`,"apikey":supabaseAnonKey},
            body:fd,
          });
          const json=await res.json();
          if(json.text){setLensDesc(prev=>(prev?prev+" ":"")+json.text.trim());}
          else if(json.error){setLensResult({error:`❌ ${json.error}`});}
        }catch(err){
          setLensResult({error:`❌ ${err.message}`});
        }finally{setLensMicLoading(false);}
      };
      lensMicRef.current=mr;
      mr.start();
      setLensMicActive(true);
    }catch(err){
      setLensResult({error:lang==='fr'?'❌ Accès micro refusé.':'❌ Microphone access denied.'});
    }
  }

  async function analyzeLens(){
    if(!lensPhotos.length)return;
    // Facturation (payant-par-scan 2026-07-23) : le serveur débite 6 Pépites
    // par analyse (spend_coins_for_lens, grant mensuel lazy inclus) et
    // rembourse si l'analyse n'est pas livrée. Seul le 402 insufficient_coins
    // remonte ici — plus aucun quota mensuel.
    setLensLoading(true);setLensResult(null);setLensAdded(false);setLensInventaireId(null);
    const allSalesValid=sales.filter(s=>s.sell>0&&s.margin!=null);
    const avgMargin=allSalesValid.length?Math.round(allSalesValid.reduce((a,s)=>a+s.marginPct,0)/allSalesValid.length):null;
    // topCategories SUPPRIMÉ (2026-08-11) : les 3 catégories les plus rentables
    // du vendeur partaient dans le MÊME message que les photos, donc avant toute
    // lecture, et nommaient des catégories à un modèle dont la première décision
    // était de catégoriser. Un a priori de rangement sur une tâche de
    // reconnaissance. Le serveur ignore désormais le champ (lens-analysis
    // index.ts) — on cesse aussi de le calculer ici. avgMargin reste : il sert
    // au conseil de marge, pas à l'identification.
    const uploadedPaths=[];
    try{
      // Upload photos to lens-temp (converts data: URLs to blobs — works on iOS WKWebView)
      const urls=[];
      for(const photo of lensPhotos){
        const blob=await fetch(photo.preview).then(r=>r.blob());
        const ext=(photo.mime||"image/jpeg").split("/")[1]||"jpg";
        const path=`lens/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const{error:upErr}=await supabase.storage.from('lens-temp').upload(path,blob,{contentType:photo.mime||"image/jpeg"});
        if(upErr)throw new Error(upErr.message);
        uploadedPaths.push(path);
        const{data:{publicUrl}}=supabase.storage.from('lens-temp').getPublicUrl(path);
        urls.push(publicUrl);
      }
      const{data:{session:lnSess}}=await supabase.auth.getSession();
      const lnToken=lnSess?.access_token;
      const r=await fetch(`${supabaseUrl}/functions/v1/lens-analysis`,{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${lnToken}`,"apikey":supabaseAnonKey},
        body:JSON.stringify({
          urls,
          description:lensDesc.trim()||null,
          prixAchat:parseFloat(lensBuy)||null,
          lang,
          userCountry,
          userStats:{avgMargin},
        }),
      });
      if(!r.ok){
        const errBody=await r.json().catch(()=>({}));
        // Pas assez de Pépites pour l'analyse : prix et solde réels du serveur
        if(errBody.error==='insufficient_coins'){
          ouvrirModalePlafond('plafond_pepites_lens',{trigger:'lens',coinPrice:errBody.price??6,coinBalance:errBody.balance??0});
          return;
        }
        throw new Error(errBody.error||`HTTP ${r.status}`);
      }
      const result=await r.json();
      if(result.error)throw new Error(result.error);
      setLensResult(result);
    }catch(e){
      setLensResult({error:`❌ ${e.message}`});
    }finally{
      setLensLoading(false);
      if(uploadedPaths.length){
        supabase.storage.from('lens-temp').remove(uploadedPaths).catch(()=>{});
      }
    }
  }

  function openLensEditModal(){
    if(!lensResult)return;
    setEditItem({
      _isNew:true,
      _table:'inventaire',
      title:lensResult.titre||"",
      marque:lensResult.marque||"",
      type:lensResult.categorie||"",
      buy:"",
      sell:"",
      frais:0,
      quantite:1,
      description:lensResult.etat_estime||"",
      priceMode:"unit",
    });
  }

  // `source` (2026-07-28) : le parcours « Créer l'annonce » du viseur passe par
  // le mode identify, dont le résultat vit LOCALEMENT dans LensTab et n'alimente
  // jamais lensResult (qui pilote l'écran de deal). Il se passe donc
  // explicitement ici. Sans paramètre → comportement historique (lensResult).
  async function saveLensItemForListing(prixAchatSaisi, source = null){
    if(lensInventaireId)return lensInventaireId;
    const src=source??lensResult;
    if(!src?.titre||src.est_vendu)return null;
    try{
      // `parseFloat(...)||null` renvoyait null sur une saisie « 0 » — le
      // symétrique du bug ci-dessus : l'utilisateur DIT que c'était gratuit et
      // on enregistre « je ne sais pas », donc l'article sort des calculs de
      // marge au lieu d'y entrer à 100 %. Zéro est une valeur, pas une absence.
      const saisiNum=prixAchatSaisi!=null&&String(prixAchatSaisi).trim()!==""
        ?Number(String(prixAchatSaisi).replace(",","."))
        :NaN;
      const saisi=Number.isFinite(saisiNum)?saisiNum:null;
      const mapped=await vaActions.addItem({
        nom:src.titre||"Article",
        marque:src.marque||null,
        categorie:src.categorie||"Autre",
        description:src.description||(lensDesc.trim()||null),
        // Jamais de fallback sur prix_achat_suggere (estimation marché IA, pas ce que l'user a payé).
        prix_achat:saisi??src.prix_achat_reel??null,
        // null en identify : aucun prix de marché n'est produit. Le prix saisi au
        // stepper est persisté sur la ligne inventaire à la publication.
        prix_vente:src.prix_vente_suggere||null,
        quantite:1,
      });
      setLensInventaireId(mapped.id);
      if(!lensAdded)setLensAdded(true);
      return mapped.id;
    }catch(e){
      console.error('[saveLensItemForListing]',e);
      // ── Limite d'inventaire : on la REMONTE, on ne l'avale pas (2026-07-29) ──
      // Depuis que toute publication crée l'article dans l'inventaire, un compte
      // Free à 20 articles ne peut plus publier du tout — cas qui n'existait pas
      // tant que l'ajout au stock était optionnel. Ce catch retournait null, et
      // l'appelant en faisait un « Une erreur est survenue » : le message le plus
      // inutile possible sur le seul mur qui se franchit en payant.
      // vaActions.addItem ouvre DÉJÀ la ConversionModal Premium ; il ne manquait
      // que le message. On marque l'erreur pour que le stepper la reconnaisse.
      // Les deux libellés sont couverts : la pré-garde client (« Limite gratuite
      // atteinte » / « Free plan limit reached ») ET le trigger serveur
      // check_inventory_limit, qui lève LIMIT_REACHED si la liste locale est
      // périmée. Toute AUTRE erreur garde le comportement historique (null).
      const msg=String(e?.message??"");
      if(/LIMIT_REACHED|Limite gratuite atteinte|Free plan limit reached/i.test(msg)){
        throw new Error("INVENTORY_LIMIT");
      }
      return null;
    }
  }

  // ── Purge du parcours Lens après publication (2026-07-29) ──────────────────
  // Fermer le stepper après un publish réussi ramenait sur l'analyse de
  // l'article qui venait de partir : photos, analyse, description, prix d'achat
  // restaient posés, et « Créer une annonce » permettait de relancer le même
  // article (refusé in extremis par la garde already_published du RPC, mais au
  // bout du tunnel entier). lensInventaireId DOIT être purgé lui aussi : sinon
  // saveLensItemForListing le réutilise tel quel et rattache l'article SUIVANT
  // à la ligne inventaire du précédent.
  function resetLensParcours(){
    setLensPhotos([]);setLensResult(null);setLensAdded(false);
    setLensDesc("");setLensBuy("");setLensInventaireId(null);
  }

  async function addLensItem(){
    if(!lensResult?.titre||lensAdded)return;
    try{
      let nom=lensResult.titre||"Article";
      try{
        const{data:{session:lSess}}=await supabase.auth.getSession();
        const lToken=lSess?.access_token;
        if(lToken){
          const nRes=await fetch(`${supabaseUrl}/functions/v1/normalize-title`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${lToken}`,"apikey":supabaseAnonKey},body:JSON.stringify({titre:lensResult.titre})});
          if(nRes.ok){const nJson=await nRes.json();if(nJson?.nom)nom=nJson.nom;}
        }
      }catch{}
      if(lensResult.est_vendu===true){
        const pv=lensResult.prix_vente_reel||lensResult.prix_vente_suggere||0;
        // ── VIDE ≠ ZÉRO, y compris ici (2026-08-11) ─────────────────────────
        // `prix_achat_reel || 0` écrivait 0 dans ventes.prix_achat dès que
        // l'utilisateur n'avait pas dit ce qu'il avait payé — et benefice
        // valait alors le prix de vente ENTIER, soit 100 % de marge sur du
        // vent. C'est exactement le bug corrigé en 2.4.35 côté inventaire, resté
        // ouvert sur ce chemin-ci ; et c'est `ventes` qui alimente la marge
        // moyenne (mapSale → margin → avgMargin), donc celui des deux qui
        // fausse les chiffres affichés.
        // null = « je ne sais pas » → benefice null → la vente sort du calcul
        // de marge (mapSale met marginPct à null) mais reste comptée au chiffre
        // d'affaires, qui ne se filtre jamais.
        // 0 reste possible et signifie « c'était gratuit » : il vient alors
        // d'une valeur réellement lue, jamais d'un défaut.
        const paBrut=lensResult.prix_achat_reel;
        const pa=paBrut!=null&&Number.isFinite(Number(paBrut))?Number(paBrut):null;
        const marqueNorm=normalizeMarque(lensResult.marque);
        const _td=detectType(nom,marqueNorm);
        const typeAuto=(lensResult.categorie&&lensResult.categorie!=='Luxe')?lensResult.categorie:_td;
        const srow={user_id:user.id,titre:stripMarque(nom,marqueNorm),prix_achat:pa,prix_vente:pv,benefice:pa==null?null:pv-pa,marque:marqueNorm||null,type:typeAuto||null,description:lensResult.description||(lensDesc.trim()||null),emplacement:null,date:new Date().toISOString().split('T')[0]};
        const{data:sd,error:se}=await supabase.from('ventes').insert([srow]).select().single();
        if(se)throw new Error(se.message);
        if(sd)setSales(prev=>[mapSale(sd),...prev]);
      }else{
        const _lensItem=await vaActions.addItem({
          nom,
          marque:lensResult.marque||null,
          categorie:lensResult.categorie||"Autre",
          description:lensResult.description||(lensDesc.trim()||null),
          // Jamais de fallback sur prix_achat_suggere (estimation marché IA, pas ce que l'user a payé).
          prix_achat:lensResult.prix_achat_reel??null,
          prix_vente:lensResult.prix_vente_suggere||null,
          quantite:1,
        });
        setLensInventaireId(_lensItem.id);
      }
      setLensAdded(true);
    }catch(e){
      alert(e.message);
    }
  }

  return(
    <div className="app-root" style={{height:"100dvh",overflowY:"hidden",display:"flex",flexDirection:"column",overflowX:"hidden",maxWidth:"100vw",position:"relative"}}>

      {/* Garde d'orientation (P2) : visible UNIQUEMENT en paysage sur téléphone
          (piloté par la media query .rotate-guard). Couvre l'app pour éviter le
          layout desktop cassé / l'écran blanc en paysage web. */}
      <div className="rotate-guard" aria-hidden="true">
        <div style={{fontSize:44,lineHeight:1}}>📱</div>
        <div style={{fontSize:17,fontWeight:700,color:"#10201B"}}>{t('rotateToPortraitTitle')}</div>
        <div style={{fontSize:13,color:"#6B7A75",maxWidth:280,lineHeight:1.5}}>{t('rotateToPortraitSubtitle')}</div>
      </div>

      <div className="topbar">
        <BrandMark onClick={()=>{setTab(0);localStorage.setItem('tab','0');}}/>
        <div className="header-centre" style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:13,fontWeight:700,color:UI.ink,letterSpacing:"-0.02em",lineHeight:1}}>
            {fmt(tm.profit)}<span style={{opacity:0.55,fontSize:11,fontWeight:700}}> {t('profit')}</span>
          </div>
          <div style={{fontSize:10,fontWeight:700,color:UI.mute,marginTop:2,whiteSpace:"nowrap"}}>
            {tm.count} {t('ventesMonth')}
          </div>
        </div>
        <div className="tb-right">
          {!isPremium&&!isNative?(
            <PremiumBanner userEmail={user?.email} compact source="topbar" onOpenModal={()=>openUpgradeModal(null,'entete')}/>
          ):!isPremium&&isNative?(
            // Même silhouette que le PremiumBanner compact ci-dessus : pill au
            // gabarit du badge Pro, zone tactile 44 px sur le bouton transparent.
            <button onClick={()=>openUpgradeModal(null,'entete')} style={{background:"transparent",border:"none",padding:0,minHeight:44,display:"inline-flex",alignItems:"center",cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>
              <span style={{display:"inline-flex",alignItems:"center",padding:"7px 12px",borderRadius:999,background:"linear-gradient(120deg,#2F9E90,#1B6E62)",color:"#fff",fontSize:12.5,fontWeight:700,letterSpacing:"0.01em",whiteSpace:"nowrap"}}>{CTA_OFFRES(lang)}</span>
            </button>
          ):isPremium?(
            // Business devant Pro devant Premium (PlanBadge tranche dans cet
            // ordre) : les flags sont cumulatifs, isPro vient de profiles.is_pro,
            // isBusiness de profiles.is_business, isPremium de l'expression
            // complète (cf. CLAUDE.md). Aucune logique nouvelle ici.
            <PlanBadge isPremium={isPremium} isPro={isPro} isBusiness={isBusiness} onClick={()=>setShowPremiumModal(true)} />
          ):null}
          <button onClick={()=>{setShowSettings(true);setCancelStep(0);setCancelMsg("");setSettingsPseudoInput(username);}} title="Paramètres" className="tb-icon-btn-light">⚙️</button>
        </div>
      </div>

      <div className="desktop-nav" style={{background:"#fff",borderBottom:"1px solid rgba(0,0,0,0.06)"}}>
        <div className="wrap">
          <div style={{display:"flex",padding:"0 14px",gap:0,overflowX:"auto"}}>
            {[
              lang==='fr'?"Tableau":"Board",
              lang==='fr'?"Stock IA":"AI Stock",
              "Lens",
              lang==='fr'?"Ventes":"Sales",
              "Stats"
            ].map((tabLabel,i)=>(
              <button key={i} onClick={()=>{setTab(i);localStorage.setItem('tab',i);}}
                style={{flex:1,textAlign:"center",padding:"10px 8px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===i?UI.teal:"transparent"}`,color:tab===i?UI.tealDeep:UI.mute,fontSize:13,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer",transition:"all 0.15s ease"}}
                onMouseEnter={e=>{if(i!==tab)e.currentTarget.style.color=UI.teal;}}
                onMouseLeave={e=>{if(i!==tab)e.currentTarget.style.color=UI.mute;}}
              >{tabLabel}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ⚠️ Les bandeaux vivent APRÈS .desktop-nav, jamais avant (fix
          2026-07-25) : .topbar est fixed z-index 200 (App.redesign.css:494) et
          c'est .desktop-nav qui porte la compensation de sa hauteur
          (margin-top 62px). Placés avant la nav, les bandeaux se rendaient à
          y=0 SOUS le header fixe — illisibles derrière le verre dépoli,
          chevauchant le logo (bug constaté en réel). Ici ils s'affichent
          pleine largeur, juste sous la barre d'onglets. */}
      {/* Bandeau « nouvelle version » (2026-07-19, classe c5fe1414) : ne
          s'affiche QUE si le reload auto a été différé (saisie/stepper/dialog
          en cours au moment du constat) — sinon l'onglet s'est déjà rechargé
          tout seul. Persistant jusqu'au clic : recharger est le seul remède. */}
      {newVersionAvailable&&(
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:"#ECFDF5",borderBottom:"1px solid #A7F3D0",fontSize:13,color:"#065F46"}}>
          <span aria-hidden="true">🔄</span>
          <span style={{flex:1,lineHeight:1.4}}>
            {lang==='fr'
              ?"Nouvelle version de FillSell disponible — recharge pour en profiter."
              :"A new version of FillSell is available — reload to get it."}
          </span>
          <button onClick={()=>window.location.reload()} style={{fontWeight:700,color:"#065F46",background:"transparent",border:"1px solid #A7F3D0",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>
            {lang==='fr'?"Recharger":"Reload"}
          </button>
        </div>
      )}

      {/* Bannière « extension obsolète » (2026-07-19 ; dismiss 2026-07-23 ;
          repositionnée + recontrastée 2026-07-25) : desktop seulement — sur
          mobile/natif l'extension ne s'installe pas (cf. e252620), la
          condition extensionOutdated les exclut déjà. Amber PLEIN + texte ink
          (l'ancien fond amber à 12 % était illisible même bien positionné).
          Lien vers /extension — qui promeut désormais le Chrome Web Store
          (publié 2026-07-25, id ooeagobimgoabciggfamljdfpkginhnm) : la page
          porte aussi l'avertissement « supprime l'ancienne version zip »
          nécessaire aux users que CE bandeau cible (installs unpacked).
          Dismissible : clé (build installé | build minimal requis) en
          localStorage, cf. extBannerDismissedFor. */}
      {extBannerVisible&&(
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px 12px 14px",background:UI.amber,borderBottom:"1px solid rgba(16,32,27,0.15)",fontSize:13.5,color:UI.ink,boxShadow:"0 2px 8px rgba(232,149,109,0.35)"}}>
          <span aria-hidden="true" style={{fontSize:18,flexShrink:0}}>🧩</span>
          {/* Deux lignes (2026-08-09) : QUOI, puis COMMENT. L'ancienne version
              disait « certaines publications peuvent échouer » et s'arrêtait là
              — un utilisateur qui cliquait « Mettre à jour » atterrissait sur la
              fiche du Store, y lisait « Ajouter à Chrome » grisé (l'extension
              est déjà installée) et repartait sans rien avoir changé, à attendre
              un cycle de mise à jour Chrome de plusieurs heures.
              ⚠️ chrome://extensions n'est PAS linkable : Chrome refuse toute
              navigation vers un schéma chrome:// depuis une page web. L'adresse
              est donc donnée à recopier, jamais posée dans un <a href>.
              La 1re ligne dit ce que la mise à jour CORRIGE, sans affirmer que
              l'extension de CE lecteur est cassée : le bandeau vise aussi les
              installs 0.5.0→0.5.2, qui n'ont pas le bug de la 0.5.3/0.5.4
              (promotion de MIN_BUILD jamais faite pour ces deux versions). */}
          <div style={{flex:1,lineHeight:1.45,minWidth:0}}>
            <div style={{fontWeight:600}}>
              {lang==='fr'
                ?"Ton extension Chrome FillSell n'est plus à jour. La dernière version corrige un problème qui bloquait la publication et la republication sur Vinted."
                :"Your FillSell Chrome extension is out of date. The latest version fixes an issue that blocked publishing and re-listing on Vinted."}
            </div>
            <div style={{marginTop:4,fontWeight:500,opacity:0.85,fontSize:12.5}}>
              {lang==='fr'
                ?<>Pour l'avoir tout de suite : ouvre <code style={{fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",fontSize:12,background:"rgba(16,32,27,0.10)",borderRadius:4,padding:"1px 5px"}}>chrome://extensions</code>, active <strong>Mode développeur</strong> (en haut à droite) puis clique <strong>Actualiser les extensions</strong>. Sinon Chrome la met à jour tout seul dans les heures qui viennent.</>
                :<>To get it now: open <code style={{fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",fontSize:12,background:"rgba(16,32,27,0.10)",borderRadius:4,padding:"1px 5px"}}>chrome://extensions</code>, turn on <strong>Developer mode</strong> (top right) then click <strong>Update</strong>. Otherwise Chrome will update it on its own within a few hours.</>}
            </div>
          </div>
          <a href="/extension" style={{fontWeight:700,fontSize:12.5,color:"#fff",background:UI.ink,borderRadius:99,padding:"7px 16px",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>
            {lang==='fr'?"Mettre à jour":"Update"}
          </a>
          <button onClick={()=>{setExtBannerDismissedFor(extBannerKey);try{localStorage.setItem('fs_ext_banner_dismissed',extBannerKey);}catch{/* stockage indisponible : dismiss valable pour la session seulement */}}}
            aria-label={lang==='fr'?"Masquer":"Dismiss"} title={lang==='fr'?"Masquer":"Dismiss"}
            style={{background:"transparent",border:"none",color:UI.ink,fontSize:16,lineHeight:1,cursor:"pointer",padding:"4px 6px",opacity:0.7,flexShrink:0,fontFamily:"inherit"}}>✕</button>
        </div>
      )}

      <div ref={scrollRef} className="wrap page-pad" style={{padding:"18px 14px 16px",background:"var(--bg)",flex:"1",overflowY:"auto",WebkitOverflowScrolling:"touch",minHeight:0}}>

        {/* Bandeau retrait cross-plateforme : visible sur tous les onglets tant
            que des annonces d'un article vendu restent en ligne ailleurs.
            "Plus tard" masque localement (le flag reste → réapparaît au
            prochain chargement), "Retirer" arme les jobs delete. */}
        {pendingRemovals.length>0&&Object.entries(
          pendingRemovals.reduce((acc,j)=>{
            const k=String(j.inventaire_id??j.title??j.id);
            (acc[k]=acc[k]||[]).push(j);return acc;
          },{})
        ).map(([k,group])=>{
          const PLAT={vinted:'Vinted',leboncoin:'Leboncoin',beebs:'Beebs',ebay:'eBay',vestiaire:'Vestiaire'};
          const platLabels=group.map(g=>PLAT[g.platform]||g.platform).join(', ');
          return (
            <div key={k} style={{background:UI.paper,border:`1px solid ${UI.amber}55`,borderLeft:`4px solid ${UI.amber}`,borderRadius:16,padding:"14px 16px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:14,color:UI.ink,lineHeight:1.55}}>
                <strong>🎉 {lang==='fr'?'Vendu :':'Sold:'} « {group[0].title||(lang==='fr'?'Article':'Item')} »</strong>
                <br/>
                {lang==='fr'
                  ?<>Encore en ligne sur <strong>{platLabels}</strong> — retirer {group.length>1?`ces ${group.length} annonces`:'cette annonce'} ?</>
                  :<>Still live on <strong>{platLabels}</strong> — remove {group.length>1?`these ${group.length} listings`:'this listing'}?</>}
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>armRemovals(group)}
                  style={{padding:"9px 18px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:13.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {lang==='fr'?`Retirer (${group.length})`:`Remove (${group.length})`}
                </button>
                <button onClick={()=>setPendingRemovals(prev=>prev.filter(p=>!group.some(g=>g.id===p.id)))}
                  style={{padding:"9px 16px",borderRadius:999,border:`1px solid ${UI.border}`,background:UI.card,color:UI.mute2,fontSize:13.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  {lang==='fr'?'Plus tard':'Later'}
                </button>
              </div>
            </div>
          );
        })}

        {/* Annonce hors ligne : on demande TOUJOURS, on n'écrit jamais tout seul.
            Deux libellés selon la force du signal, un seul comportement — le clic
            "Oui" est le SEUL chemin qui écrit en base (vente, inventaire, marges).
            Décision produit 2026-07-12 : même Vinted, dont la preuve de vente est
            fiable, passe par ici — le prix réel peut différer du prix affiché
            (négociation) et un vendeur à volume ne corrigerait jamais après coup. */}
        {unavailableListings.map(job=>{
          const PLAT={vinted:'Vinted',leboncoin:'Leboncoin',beebs:'Beebs',ebay:'eBay',vestiaire:'Vestiaire'};
          const plat=PLAT[job.platform]||job.platform;
          const busy=confirmingSale===job.id;
          const pf=job.platform_fields||{};
          // GARDE A (2026-08-24) : article en REPUBLICATION vivante → l'absence
          // de son annonce Vinted est la nôtre (suppression avant recréation),
          // jamais une vente. Aucun bandeau, la republication suit son cours.
          if(job.platform==='vinted'&&job.inventaire_id!=null&&republishActifsInv.has(String(job.inventaire_id)))return null;
          // Dédup avec la REVUE des disparus : un « plus en ligne » Vinted sans
          // preuve de vente dont l'article est déjà dans la file de revue y est
          // traité là-bas (groupé) — deux questions simultanées sur le même
          // article seraient une invitation à la double confirmation.
          if(job.platform==='vinted'&&pf.sale_signal!=='sold'&&job.inventaire_id!=null
            &&disparusATrancher.some(i=>String(i.id)===String(job.inventaire_id)))return null;
          // Preuve positive de vente (Vinted : is_closed + item_closing_action)
          const vendu=pf.sale_signal==='sold';
          // Prix pré-rempli : celui lu sur la page si la plateforme l'expose,
          // sinon le prix de mise en ligne. Modifiable dans les deux cas.
          const prixDefaut=pf.detected_price??job.price;
          return (
            <div key={job.id} style={{background:UI.paper,border:`1px solid ${vendu?UI.teal+'55':UI.border}`,borderLeft:`4px solid ${vendu?UI.teal:UI.amber}`,borderRadius:16,padding:"14px 16px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:14,color:UI.ink,lineHeight:1.55}}>
                <strong>{vendu
                  ?(lang==='fr'?`🎉 Vendue sur ${plat} !`:`🎉 Sold on ${plat}!`)
                  :(lang==='fr'?'Annonce plus en ligne':'Listing no longer online')}</strong>
                <br/>
                {vendu
                  ?(lang==='fr'
                    ?<>« {job.title||'Article'} » — confirme le prix pour l'enregistrer.</>
                    :<>“{job.title||'Item'}” — confirm the price to record it.</>)
                  :(lang==='fr'
                    ?<>« {job.title||'Article'} » n'est plus en ligne sur <strong>{plat}</strong>. Vendue ?</>
                    :<>“{job.title||'Item'}” is no longer online on <strong>{plat}</strong>. Sold?</>)}
              </div>
              {/* Prix éditable : la vente a pu être négociée (offre acceptée,
                  marchandage en remise main propre) — même sur Vinted, qui
                  n'expose PAS le montant d'une offre acceptée. C'est ce montant
                  qui sera enregistré comme prix_vente. */}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <label style={{fontSize:13,color:UI.mute2,fontWeight:600}}>
                  {lang==='fr'?'Prix de vente':'Sale price'}
                </label>
                <input type="text" inputMode="decimal" disabled={busy}
                  value={salePriceDraft[job.id]??(prixDefaut!=null?String(prixDefaut):'')}
                  onChange={e=>setSalePriceDraft(p=>({...p,[job.id]:e.target.value}))}
                  style={{width:90,padding:"7px 10px",borderRadius:10,border:`1px solid ${UI.border}`,background:UI.card,color:UI.ink,fontSize:14,fontWeight:700,fontFamily:"inherit"}}/>
                <span style={{fontSize:13,color:UI.mute2}}>{currency==='EUR'?'€':currency}</span>
              </div>
              {/* PRIX D'ACHAT — demandé ICI, au seul moment où la personne s'en
                  souvient et où elle veut répondre. Affiché uniquement si
                  l'article est lié à l'inventaire ET que son prix d'achat est
                  encore inconnu (les articles importés du dressing Vinted sont
                  exactement dans ce cas).
                  « Je ne sais plus » est OBLIGATOIRE et pas décoratif : sans
                  porte de sortie, les gens inventent un chiffre pour se
                  débarrasser de la question, et toutes les stats deviennent du
                  bruit indétectable. Marge absente > marge fausse. */}
              {(()=>{
                const art=items.find(i=>String(i.id)===String(job.inventaire_id));
                if(!art||prixAchatConnu(art)||art.prix_achat_inconnu)return null;
                return (
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <label style={{fontSize:13,color:UI.mute2,fontWeight:600}}>
                      {lang==='fr'?"Tu l'avais payé combien ?":'What did you pay for it?'}
                    </label>
                    <input type="text" inputMode="decimal" disabled={busy}
                      value={buyPriceDraft[job.id]??''}
                      onChange={e=>setBuyPriceDraft(p=>({...p,[job.id]:e.target.value}))}
                      style={{width:90,padding:"7px 10px",borderRadius:10,border:`1px solid ${UI.border}`,background:UI.card,color:UI.ink,fontSize:14,fontWeight:700,fontFamily:"inherit"}}/>
                    <span style={{fontSize:13,color:UI.mute2}}>{currency==='EUR'?'€':currency}</span>
                    <button type="button" disabled={busy}
                      onClick={async()=>{
                        // Exclut DÉFINITIVEMENT cet article des calculs de marge
                        // (prix_achat reste NULL) et on ne repose plus la question.
                        setBuyPriceDraft(p=>({...p,[job.id]:''}));
                        if(job.inventaire_id==null)return;
                        await supabase.from('inventaire').update({prix_achat_inconnu:true})
                          .eq('id',job.inventaire_id).eq('user_id',user.id);
                        setItems(prev=>prev.map(i=>String(i.id)===String(job.inventaire_id)?{...i,prix_achat_inconnu:true}:i));
                      }}
                      style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${UI.border}`,background:"transparent",color:UI.mute2,fontSize:12.5,fontWeight:600,cursor:busy?"default":"pointer",fontFamily:"inherit"}}>
                      {lang==='fr'?'Je ne sais plus':"I don't remember"}
                    </button>
                  </div>
                );
              })()}
              <div style={{display:"flex",gap:10}}>
                <button disabled={busy} onClick={()=>confirmSaleFromBanner(job)}
                  style={{padding:"9px 18px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:13.5,fontWeight:700,cursor:busy?"default":"pointer",opacity:busy?.6:1,fontFamily:"inherit"}}>
                  {busy?(lang==='fr'?'…':'…'):(lang==='fr'?'Oui, enregistrer la vente':'Yes, record the sale')}
                </button>
                <button disabled={busy} onClick={()=>dismissUnavailable(job)}
                  style={{padding:"9px 16px",borderRadius:999,border:`1px solid ${UI.border}`,background:UI.card,color:UI.mute2,fontSize:13.5,fontWeight:600,cursor:busy?"default":"pointer",fontFamily:"inherit"}}>
                  {lang==='fr'?"Non, je l'ai retirée":"No, I removed it"}
                </button>
              </div>
            </div>
          );
        })}

        {/* ── Disparus du dressing : UN bandeau de synthèse (2026-08-24) ──
            Jamais un bandeau par article : la sync marque disparu_le en bloc
            (jusqu'à 174 articles à la même minute), la revue se fait dans une
            modale groupée. La file ne se vide QUE par les décisions de
            l'utilisateur — aucun article n'en sort par ancienneté. */}
        {disparusATrancher.length>0&&(
          <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderLeft:`4px solid ${UI.amber}`,borderRadius:16,padding:"14px 16px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:14,color:UI.ink,lineHeight:1.55}}>
              <strong>⚠️ {lang==='fr'
                ?`${disparusATrancher.length} annonce${disparusATrancher.length>1?'s':''} Vinted ${disparusATrancher.length>1?'ne sont plus':'n’est plus'} en ligne`
                :`${disparusATrancher.length} Vinted listing${disparusATrancher.length>1?'s are':' is'} no longer online`}</strong>
              <br/>
              {lang==='fr'
                ?<>Vendues, ou retirées ? Passe-les en revue — rien n'est enregistré sans ton choix, article par article.</>
                :<>Sold, or removed? Review them — nothing is recorded without your choice, item by item.</>}
            </div>
            <div>
              <button onClick={()=>setDisparusModal(true)}
                style={{padding:"9px 18px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:13.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {lang==='fr'?`Passer en revue (${disparusATrancher.length})`:`Review (${disparusATrancher.length})`}
              </button>
            </div>
          </div>
        )}

        {/* ── Modale de revue des disparus ── */}
        {disparusModal&&(
          <>
            <div onClick={()=>disparusBusy==null&&setDisparusModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
            <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"22px",width:"min(94vw,620px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"84vh",overflowY:"auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{fontSize:16,fontWeight:700,color:UI.ink}}>
                  {lang==='fr'?`Annonces plus en ligne (${disparusATrancher.length})`:`Listings no longer online (${disparusATrancher.length})`}
                </div>
                <button onClick={()=>disparusBusy==null&&setDisparusModal(false)} aria-label={lang==='fr'?'Fermer':'Close'}
                  style={{border:"none",background:"transparent",fontSize:20,color:UI.mute2,cursor:"pointer",lineHeight:1}}>✕</button>
              </div>
              <div style={{fontSize:12.5,color:UI.mute2,lineHeight:1.5,marginBottom:12}}>
                {lang==='fr'
                  ?<>Ces annonces ont disparu de ton dressing Vinted sans que Vinted les marque « vendues ». Pour chacune : <strong>Vendue</strong> (confirme le prix réellement reçu) ou <strong>Pas vendue</strong> (retirée, expirée…). Un article en cours de republication n'apparaît jamais ici.</>
                  :<>These listings disappeared from your Vinted wardrobe without Vinted marking them “sold”. For each one: <strong>Sold</strong> (confirm the amount you actually received) or <strong>Not sold</strong> (removed, expired…). An item being republished never shows up here.</>}
              </div>
              {/* Barre de lot : la sélection ne sert qu'au « Pas vendues » —
                  une vente exige un prix confirmé LIGNE PAR LIGNE. */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                <label style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:600,color:UI.mute2,cursor:"pointer"}}>
                  <input type="checkbox"
                    checked={disparusATrancher.length>0&&disparusATrancher.every(i=>disparusSel.has(i.id))}
                    onChange={()=>setDisparusSel(prev=>{
                      if(disparusATrancher.every(i=>prev.has(i.id)))return new Set();
                      return new Set(disparusATrancher.map(i=>i.id));
                    })}
                    style={{width:15,height:15,accentColor:UI.teal}}/>
                  {lang==='fr'?'Tout sélectionner':'Select all'}
                </label>
                <button disabled={disparusBusy!=null||![...disparusSel].length}
                  onClick={()=>marquerDisparusNonVendus(disparusATrancher.filter(i=>disparusSel.has(i.id)))}
                  style={{padding:"7px 14px",borderRadius:999,border:`1px solid ${UI.border}`,background:UI.card,color:UI.mute2,fontSize:12.5,fontWeight:700,cursor:disparusBusy!=null?"default":"pointer",opacity:(disparusBusy!=null||![...disparusSel].length)?.55:1,fontFamily:"inherit"}}>
                  {disparusBusy==='lot'
                    ?(lang==='fr'?'Enregistrement…':'Saving…')
                    :(lang==='fr'?`Pas vendues (${[...disparusSel].filter(id=>disparusATrancher.some(i=>i.id===id)).length})`:`Not sold (${[...disparusSel].filter(id=>disparusATrancher.some(i=>i.id===id)).length})`)}
                </button>
              </div>
              {disparusATrancher.slice(0,disparusRendu).map(item=>{
                const busy=disparusBusy===item.id||disparusBusy==='lot';
                const defaut=disparusPropositions[item.vinted_item_id]??item.sell;
                const dateDisp=item.disparu_le?new Date(item.disparu_le).toLocaleDateString(lang==='fr'?'fr-FR':'en-GB'):null;
                return(
                  <div key={item.id} style={{border:`1px solid ${UI.border}`,borderRadius:12,padding:"10px 12px",marginBottom:8,display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <input type="checkbox" checked={disparusSel.has(item.id)} disabled={busy}
                        onChange={()=>setDisparusSel(prev=>{const n=new Set(prev);if(n.has(item.id))n.delete(item.id);else n.add(item.id);return n;})}
                        style={{width:15,height:15,accentColor:UI.teal,flexShrink:0}}
                        aria-label={lang==='fr'?'Sélectionner':'Select'}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13.5,fontWeight:700,color:UI.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                        {dateDisp&&<div style={{fontSize:11.5,color:UI.mute2}}>{lang==='fr'?`Plus en ligne depuis le ${dateDisp}`:`Offline since ${dateDisp}`}</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <input type="text" inputMode="decimal" disabled={busy}
                        value={disparusPrix[item.id]??(defaut!=null?String(defaut):'')}
                        onChange={e=>setDisparusPrix(p=>({...p,[item.id]:e.target.value}))}
                        placeholder={lang==='fr'?'Prix reçu':'Amount received'}
                        style={{width:92,padding:"7px 10px",borderRadius:10,border:`1px solid ${UI.border}`,background:UI.card,color:UI.ink,fontSize:13.5,fontWeight:700,fontFamily:"inherit"}}
                        aria-label={lang==='fr'?'Prix de vente':'Sale price'}/>
                      <span style={{fontSize:12.5,color:UI.mute2}}>{currency==='EUR'?'€':currency}</span>
                      <button disabled={busy} onClick={()=>confirmerVenteDisparue(item)}
                        style={{padding:"7px 14px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:12.5,fontWeight:700,cursor:busy?"default":"pointer",opacity:busy?.6:1,fontFamily:"inherit"}}>
                        {disparusBusy===item.id?'…':(lang==='fr'?'Vendue ✓':'Sold ✓')}
                      </button>
                      <button disabled={busy} onClick={()=>marquerDisparusNonVendus([item])}
                        style={{padding:"7px 12px",borderRadius:999,border:`1px solid ${UI.border}`,background:UI.card,color:UI.mute2,fontSize:12.5,fontWeight:600,cursor:busy?"default":"pointer",fontFamily:"inherit"}}>
                        {lang==='fr'?'Pas vendue':'Not sold'}
                      </button>
                    </div>
                    {/* Prix d'achat : demandé ICI seulement s'il est inconnu —
                        même contrat que le bandeau (jamais 0 par défaut,
                        « je ne sais plus » disponible sur la carte du Stock). */}
                    {!prixAchatConnu(item)&&!item.prix_achat_inconnu&&(
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <label style={{fontSize:12,color:UI.mute2,fontWeight:600}}>
                          {lang==='fr'?"Payé combien ? (optionnel)":'Paid how much? (optional)'}
                        </label>
                        <input type="text" inputMode="decimal" disabled={busy}
                          value={disparusAchat[item.id]??''}
                          onChange={e=>setDisparusAchat(p=>({...p,[item.id]:e.target.value}))}
                          style={{width:80,padding:"6px 9px",borderRadius:10,border:`1px solid ${UI.border}`,background:UI.card,color:UI.ink,fontSize:13,fontWeight:700,fontFamily:"inherit"}}
                          aria-label={lang==='fr'?"Prix d'achat":'Purchase price'}/>
                        <span style={{fontSize:12.5,color:UI.mute2}}>{currency==='EUR'?'€':currency}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {disparusATrancher.length>disparusRendu&&(
                <button onClick={()=>setDisparusRendu(n=>n+40)}
                  style={{width:"100%",padding:"9px 0",borderRadius:10,border:`1px dashed ${UI.border}`,background:"transparent",color:UI.mute2,fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {lang==='fr'
                    ?`Voir plus (${disparusATrancher.length-disparusRendu} restantes)`
                    :`Show more (${disparusATrancher.length-disparusRendu} left)`}
                </button>
              )}
            </div>
          </>
        )}

        {/* (Bandeau « vérification impossible » SUPPRIMÉ ici le 2026-08-15 —
            décision produit : seule une VENTE détectée produit un bandeau.
            Les échecs de vérification restent visibles en base
            (platform_fields.check_unresolved) et l'extension retente chaque
            jour, mais l'utilisateur n'en voit plus rien.) */}

        {tab===0&&(
          <DashboardTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative} username={username}
            loading={loading} items={items} sales={sales}
            stock={stock} stockVal={stockVal} stockQty={stockQty}
            tm={tm} salesForKpis={salesForKpis} totalM={totalM}
            selectedRange={selectedRange} setSelectedRange={setSelectedRange}
            openUpgradeModal={openUpgradeModal}
            setTab={setTab}
            EmptyStateDashboard={EmptyStateDashboard}
            extensionAbsente={extensionNeverSeen===true}
            onExtensionInfo={()=>setShowExtensionInfo(true)}
          />
        )}

        {tab===1&&(
          <StockTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative} isPro={isPro} isBusiness={isBusiness}
            items={items} user={user} voiceUsedToday={voiceUsedToday}
            extensionStatus={{ lastSeenAt: extensionLastSeenAt, build: extensionBuild, outdated: extensionOutdated }}
            extensionNeverSeen={extensionNeverSeen}
            iapLoading={iapLoading}
            stock={stock} sold={sold}
            stockFiltre={stockFiltre} soldFiltre={soldFiltre}
            stockVisible={stockVisible} soldVisible={soldVisible}
            stockVal={stockVal} stockQty={stockQty} soldQty={soldQty}
            voiceStep={voiceStep} setVoiceStep={setVoiceStep}
            voiceParsed={voiceParsed} setVoiceParsed={setVoiceParsed}
            voiceZoneResults={voiceZoneResults} setVoiceZoneResults={setVoiceZoneResults}
            voiceZoneOpen={voiceZoneOpen} setVoiceZoneOpen={setVoiceZoneOpen}
            vaActions={vaActions} vaStep={vaStep}
            voiceText={voiceText} setVoiceText={setVoiceText}
            voiceLoading={voiceLoading} voicePlaceholderIdx={voicePlaceholderIdx}
            voiceError={voiceError}
            showManualForm={showManualForm} setShowManualForm={setShowManualForm}
            manualMode={manualMode} setManualMode={setManualMode}
            iTitle={iTitle} setITitle={setITitle}
            iQuantite={iQuantite} setIQuantite={setIQuantite}
            iMarque={iMarque} setIMarque={setIMarque}
            iType={iType} setIType={setIType}
            iBuy={iBuy} setIBuy={setIBuy}
            iPurchaseCosts={iPurchaseCosts} setIPurchaseCosts={setIPurchaseCosts}
            iAlreadySold={iAlreadySold} setIAlreadySold={setIAlreadySold}
            iSell={iSell} setISell={setISell}
            iSellingFees={iSellingFees} setISellingFees={setISellingFees}
            iRememberSellingFees={iRememberSellingFees} setIRememberSellingFees={setIRememberSellingFees}
            iDesc={iDesc} setIDesc={setIDesc}
            iEmplacement={iEmplacement} setIEmplacement={setIEmplacement}
            iPlateforme={iPlateforme} setIPlateforme={setIPlateforme}
            iSaved={iSaved} firstItemAdded={firstItemAdded}
            lotManualTotal={lotManualTotal} setLotManualTotal={setLotManualTotal}
            lotManualItems={lotManualItems} setLotManualItems={setLotManualItems}
            lotDistributed={lotDistributed} setLotDistributed={setLotDistributed}
            lotDistributing={lotDistributing}
            filterType={filterType} setFilterType={setFilterType}
            filterMarque={filterMarque} setFilterMarque={setFilterMarque}
            filterMarqueSold={filterMarqueSold} setFilterMarqueSold={setFilterMarqueSold}
            search={search} setSearch={setSearch}
            soldShowAll={soldShowAll} setSoldShowAll={setSoldShowAll}
            showAllStock={showAllStock} setShowAllStock={setShowAllStock}
            expandedStockId={expandedStockId} setExpandedStockId={setExpandedStockId}
            pillsExpandedSold={pillsExpandedSold} setPillsExpandedSold={setPillsExpandedSold}
            pillsExpandedStock={pillsExpandedStock} setPillsExpandedStock={setPillsExpandedStock}
            importMsg={importMsg}
            addItemsFromVoice={addItemsFromVoice}
            resetVoiceFlow={resetVoiceFlow}
            callVoiceParse={callVoiceParse}
            addItem={addItem}
            handleLotDistribute={handleLotDistribute}
            addLotToInventory={addLotToInventory}
            delItem={delItem}
            markSold={markSold}
            setEditItem={setEditItem}
            handleImportFile={handleImportFile}
            handleExport={handleExport}
            handleIAPPurchase={handleIAPPurchase}
            handleIAPRestore={handleIAPRestore}
            triggerCheckout={triggerCheckout}
            importRef={importRef}
            listRef={listRef}
            scrollRef={scrollRef}
            fabTriggerRef={fabTriggerRef}
            PremiumBanner={BoundPremiumBanner}
            IAPUpgradeBlock={IAPUpgradeBlock}
            openUpgradeModal={openUpgradeModal}
            onStepperOpenChange={setListingStepperOpen}
            onAddByPhoto={()=>{setTab(2);localStorage.setItem('tab',2);}}
          />
        )}

        {tab===2&&(
          <LensTab
            lang={lang} currency={currency} userCountry={userCountry}
            isPremium={isPremium} isNative={isNative} user={user}
            iapLoading={iapLoading}
            lensPhotos={lensPhotos} setLensPhotos={setLensPhotos}
            lensResult={lensResult} setLensResult={setLensResult}
            lensAdded={lensAdded} setLensAdded={setLensAdded}
            lensDesc={lensDesc} setLensDesc={setLensDesc}
            lensBuy={lensBuy} setLensBuy={setLensBuy}
            lensLoading={lensLoading} lensMicActive={lensMicActive} lensMicLoading={lensMicLoading}
            lensPlaceholderFade={lensPlaceholderFade} lensPlaceholderIdx={lensPlaceholderIdx}
            lensFileRef={lensFileRef} toggleLensMic={toggleLensMic}
            handleLensPhoto={handleLensPhoto} handleLensPhotoNative={handleLensPhotoNative} handleLensCameraNative={handleLensCameraNative} analyzeLens={analyzeLens} addLensItem={addLensItem} openLensEditModal={openLensEditModal}
            handleIAPPurchase={handleIAPPurchase} handleIAPRestore={handleIAPRestore}
            PremiumBanner={BoundPremiumBanner} IAPUpgradeBlock={IAPUpgradeBlock}
            openUpgradeModal={openUpgradeModal}
            isPro={isPro}
            isBusiness={isBusiness}
            supabase={supabase}
            saveLensItemForListing={saveLensItemForListing}
            lensInventaireId={lensInventaireId}
            resetLensParcours={resetLensParcours}
            onStepperOpenChange={setListingStepperOpen}
            extensionNeverSeen={extensionNeverSeen}
            extensionLastSeenAt={extensionLastSeenAt}
          />
        )}

        {tab===3&&(
          <VentesTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative} user={user}
            sales={salesAvecInconnu} visibleSales={visibleSales} groupedSales={groupedSales}
            salesForKpis={salesForKpis} totalM={totalM}
            searchHistory={searchHistory} setSearchHistory={setSearchHistory}
            showAllSales={showAllSales} setShowAllSales={setShowAllSales}
            iapLoading={iapLoading}
            handleIAPPurchase={handleIAPPurchase} handleIAPRestore={handleIAPRestore}
            extensionAbsente={extensionNeverSeen===true}
            onExtensionInfo={()=>setShowExtensionInfo(true)}
            delSale={delSale} setTab={setTab} setEditItem={setEditItem}
            PremiumBanner={BoundPremiumBanner} IAPUpgradeBlock={IAPUpgradeBlock}
            openUpgradeModal={openUpgradeModal}
            vendusAEnregistrer={vendusAEnregistrer}
            photosParInventaire={photosParInventaire}
            onSaleUpdated={()=>{if(user?.id)fetchAll(user.id,{silencieux:true});}}
          />
        )}
        {/* StatsTab toujours monté — état local préservé entre les onglets */}
        <div style={{display:tab===4?'block':'none'}}>
          <StatsTab sales={sales} items={items} lang={lang} currency={currency} user={user} aiCache={aiCache} setAiCache={setAiCache} setTab={setTab} isActive={tab===4}/>
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {/* ── Modale « Modifier l'article » — REFONTE VISUELLE (2026-08-27) ────
          Alignée sur le thème de la galerie Stock IA (palette canvas/paper/
          ink/teal, SVG au lieu des émojis 🏷️📦🛒💰📬, champs groupés par
          sens : Identité / Argent / Logistique / Description).
          ⛔ REFONTE VISUELLE SEULEMENT : aucun champ ajouté ni retiré, mêmes
          setters (title, marque, type, buy, priceMode, sell, frais, quantite,
          emplacement, description), même handleEditSave, mêmes libellés
          métier (« Vide = en stock » conservé mot pour mot).
          Le NOM passe d'un input mono-ligne (titre long illisible) à un
          textarea de 2 lignes : un titre long se lit et s'édite en entier —
          même valeur écrite, aucun changement de sauvegarde. */}
      {editItem&&(()=>{
        const S={
          eyebrow:{display:"flex",alignItems:"center",gap:7,fontSize:10.5,fontWeight:700,color:"#8A8578",textTransform:"uppercase",letterSpacing:"0.07em"},
          tile:{flexShrink:0,width:22,height:22,borderRadius:7,background:"rgba(47,158,144,0.10)",display:"flex",alignItems:"center",justifyContent:"center",color:"#1B6E62"},
          group:{display:"flex",flexDirection:"column",gap:9,background:"#F6F5F1",border:"1px solid #E7E3D8",borderRadius:14,padding:"11px 12px"},
          label:{fontSize:11,fontWeight:600,color:"#8A8578",marginBottom:4},
          input:{width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:10,border:"1px solid #E7E3D8",background:"#fff",fontSize:14,fontWeight:600,color:"#10201B",fontFamily:"inherit",outline:"none",transition:"border-color 0.15s"},
        };
        const focusTeal=e=>{e.currentTarget.style.borderColor="#2F9E90";};
        const blurBorder=e=>{e.currentTarget.style.borderColor="#E7E3D8";};
        const money={display:"flex",alignItems:"center",gap:6};
        const suffix=<span style={{fontSize:12,fontWeight:600,color:"#8A8578",flexShrink:0}}>{CURRENCY_SYMBOLS[currency]||'€'}</span>;
        return(
        <>
          <div onClick={()=>setEditItem(null)} style={{position:"fixed",inset:0,background:"rgba(16,32,27,0.45)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:18,padding:"20px",width:"min(92vw,480px)",boxShadow:"0 24px 80px rgba(16,32,27,0.25)",maxHeight:"88vh",overflowY:"auto",border:"1px solid #E7E3D8"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:15.5,fontWeight:700,color:"#10201B"}}>{editItem._isNew?(lang==='fr'?"Ajouter au stock":"Add to stock"):(lang==='fr'?"Modifier l'article":"Edit item")}</div>
              <IconButton onClick={()=>setEditItem(null)} icon={X} size={32} bg={UI.chip} iconColor={UI.mute2} />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              {/* ── Identité : nom, marque, catégorie ── */}
              <div style={S.group}>
                <div style={S.eyebrow}>
                  <span style={S.tile}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg></span>
                  {lang==='fr'?"Identité":"Identity"}
                </div>
                <div>
                  <div style={S.label}>{lang==='fr'?"Nom":"Name"}</div>
                  {/* Textarea 2 lignes : les titres longs (dressing importé)
                      étaient tronqués dans l'input mono-ligne — désormais
                      lisibles et éditables en entier. Même valeur écrite. */}
                  <textarea value={editItem.title??""} onChange={e=>setEditItem(p=>({...p,title:e.target.value}))}
                    placeholder="Ex: Air Max 90..." rows={2}
                    style={{...S.input,resize:"none",lineHeight:1.4}}
                    onFocus={focusTeal} onBlur={blurBorder}/>
                </div>
                <div>
                  <div style={S.label}>{lang==='fr'?"Marque (optionnel)":"Brand (optional)"}</div>
                  <input value={editItem.marque||""} onChange={e=>setEditItem(p=>({...p,marque:e.target.value}))}
                    placeholder="Ex: Nike, Zara..." style={S.input}
                    onFocus={focusTeal} onBlur={blurBorder}/>
                </div>
                <div>
                  <div style={S.label}>{lang==='fr'?"Catégorie":"Category"}</div>
                  <select value={editItem.type||""} onChange={e=>setEditItem(p=>({...p,type:e.target.value}))}
                    style={{...S.input,height:42,padding:"0 12px",cursor:"pointer",appearance:"auto",color:editItem.type?"#10201B":"#8A8578"}}>
                    <option value="">{(editItem.title||editItem.marque)?(lang==='fr'?`Détecté : ${detectType(editItem.title,editItem.marque)}`:`Detected: ${typeLabel(detectType(editItem.title,editItem.marque),lang)}`):(lang==='fr'?'Détection automatique':'Auto-detection')}</option>
                    <option value="Mode">{typeLabel('Mode',lang)}</option>
                    <option value="High-Tech">High-Tech</option>
                    <option value="Maison">{typeLabel('Maison',lang)}</option>
                    <option value="Électroménager">{typeLabel('Électroménager',lang)}</option>
                    <option value="Jouets">{typeLabel('Jouets',lang)}</option>
                    <option value="Livres">{typeLabel('Livres',lang)}</option>
                    <option value="Sport">Sport</option>
                    <option value="Auto-Moto">{typeLabel('Auto-Moto',lang)}</option>
                    <option value="Beauté">{typeLabel('Beauté',lang)}</option>
                    <option value="Musique">Musique</option>
                    <option value="Collection">Collection</option>
                    <option value="Multimédia">{typeLabel('Multimédia',lang)}</option>
                    <option value="Jardin">{typeLabel('Jardin',lang)}</option>
                    <option value="Bricolage">{typeLabel('Bricolage',lang)}</option>
                    <option value="Autre">{typeLabel('Autre',lang)}</option>
                  </select>
                </div>
              </div>

              {/* ── Argent : prix d'achat, prix de vente, frais ── */}
              <div style={S.group}>
                <div style={S.eyebrow}>
                  <span style={S.tile}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg></span>
                  {lang==='fr'?"Argent":"Money"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                  <div>
                    <div style={S.label}>{lang==='fr'?"Prix d'achat":"Purchase price"}</div>
                    <div style={money}>
                      <input type="number" inputMode="decimal" value={String(editItem.buy??"")}
                        onChange={e=>setEditItem(p=>({...p,buy:e.target.value}))}
                        placeholder="0,00" style={S.input}
                        onFocus={focusTeal} onBlur={blurBorder}/>
                      {suffix}
                    </div>
                  </div>
                  <div>
                    <div style={S.label}>{lang==='fr'?"Prix de vente (optionnel)":"Sell price (optional)"}</div>
                    <div style={money}>
                      {/* ⛔ Placeholder MÉTIER conservé mot pour mot : un prix
                          de vente vide = l'article reste en stock. */}
                      <input type="number" inputMode="decimal" value={String(editItem.sell??"")}
                        onChange={e=>setEditItem(p=>({...p,sell:e.target.value}))}
                        placeholder={lang==='fr'?"Vide = en stock":"Empty = in stock"} style={S.input}
                        onFocus={focusTeal} onBlur={blurBorder}/>
                      {suffix}
                    </div>
                  </div>
                </div>
                {(parseInt(editItem.quantite)||1)>1&&(
                  <div style={{display:"flex",gap:4,background:"#EDEAE0",borderRadius:10,padding:3}}>
                    {["unit","total"].map(mode=>(
                      <button key={mode} type="button"
                        onClick={()=>setEditItem(p=>({...p,priceMode:mode}))}
                        style={{flex:1,padding:"7px 0",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",touchAction:"manipulation",fontFamily:"inherit",
                          background:(editItem.priceMode??"unit")===mode?"#fff":"transparent",
                          color:(editItem.priceMode??"unit")===mode?"#1B6E62":"#8A8578",
                          boxShadow:(editItem.priceMode??"unit")===mode?"0 1px 4px rgba(16,32,27,0.10)":"none",
                          transition:"all 0.15s"}}>
                        {mode==="unit"?(lang==='fr'?"Par article":"Per item"):(lang==='fr'?"Prix total lot":"Total lot price")}
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <div style={S.label}>{lang==='fr'?"Frais (optionnel)":"Fees (optional)"}</div>
                  <div style={money}>
                    <input type="number" inputMode="decimal" value={String(editItem.frais??"")}
                      onChange={e=>setEditItem(p=>({...p,frais:e.target.value}))}
                      placeholder="0,00" style={S.input}
                      onFocus={focusTeal} onBlur={blurBorder}/>
                    {suffix}
                  </div>
                </div>
              </div>

              {/* ── Logistique : quantité, emplacement ── */}
              <div style={S.group}>
                <div style={S.eyebrow}>
                  <span style={S.tile}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></span>
                  {lang==='fr'?"Logistique":"Logistics"}
                </div>
                <div>
                  <div style={S.label}>{lang==='fr'?"Quantité":"Quantity"}</div>
                  <div style={{display:"flex",alignItems:"center",gap:0,border:"1px solid #E7E3D8",borderRadius:10,overflow:"hidden",background:"#fff",height:42}}>
                    <button type="button" onClick={()=>setEditItem(p=>({...p,quantite:Math.max(1,(parseInt(p.quantite)||1)-1)}))} style={{width:46,height:"100%",border:"none",background:"transparent",fontSize:20,fontWeight:300,color:"#8A8578",cursor:"pointer",touchAction:"manipulation",flexShrink:0,fontFamily:"inherit"}}>−</button>
                    <input type="number" min="1" value={editItem.quantite??1}
                      onChange={e=>setEditItem(p=>({...p,quantite:Math.max(1,parseInt(e.target.value)||1)}))}
                      onFocus={e=>e.target.select()}
                      style={{flex:1,border:"none",outline:"none",textAlign:"center",fontSize:16,fontWeight:700,color:"#10201B",background:"transparent",width:0,MozAppearance:"textfield",fontFamily:"inherit"}}
                    />
                    <button type="button" onClick={()=>setEditItem(p=>({...p,quantite:(parseInt(p.quantite)||1)+1}))} style={{width:46,height:"100%",border:"none",background:"transparent",fontSize:20,fontWeight:300,color:"#8A8578",cursor:"pointer",touchAction:"manipulation",flexShrink:0,fontFamily:"inherit"}}>+</button>
                  </div>
                </div>
                {/* Emplacement — MÊME donnée que le badge 📦 des cartes de stock et
                    que l'intention vocale inventory_move : colonne inventaire.emplacement
                    (cf. vaActions.moveToLocation). Aucun champ parallèle créé. */}
                <div>
                  <div style={S.label}>{lang==='fr'?"Emplacement (optionnel)":"Location (optional)"}</div>
                  <input value={editItem.emplacement||""} onChange={e=>setEditItem(p=>({...p,emplacement:e.target.value}))}
                    placeholder={lang==='fr'?"Ex: Étagère salon, Carton 3...":"Ex: Living room shelf, Box 3..."} style={S.input}
                    onFocus={focusTeal} onBlur={blurBorder}/>
                </div>
              </div>

              {/* ── Description ── */}
              <div style={S.group}>
                <div style={S.eyebrow}>
                  <span style={S.tile}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/></svg></span>
                  {lang==='fr'?"Description (optionnel)":"Description (optional)"}
                </div>
                <div>
                  <textarea value={editItem.description||""} onChange={e=>setEditItem(p=>({...p,description:e.target.value.slice(0,200)}))}
                    placeholder={lang==='fr'?"Ex: Taille M, noir, neuf...":"Ex: Size M, black, new..."}
                    maxLength={200} rows={2}
                    style={{...S.input,resize:"none",lineHeight:1.5,fontWeight:500,fontSize:13}}
                    onFocus={focusTeal} onBlur={blurBorder}
                  />
                  <div style={{fontSize:10,color:"#8A8578",textAlign:"right",marginTop:2}}>{(editItem.description||"").length}/200</div>
                </div>
              </div>

            </div>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <PrimaryButton onClick={handleEditSave} style={{flex:1,width:"auto"}}>
                {lang==='fr'?"Enregistrer":"Save"}
              </PrimaryButton>
              <SecondaryButton onClick={()=>setEditItem(null)} style={{width:"auto",padding:"13px 20px"}}>
                {t('annuler')}
              </SecondaryButton>
            </div>
          </div>
        </>
        );
      })()}

      {/* ── SELL MODAL ── */}
      {sellModal&&(
        <>
          <div onClick={()=>setSellModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(92vw,400px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:C.text}}>💰 {t('marquerVendu')}</div>
              <IconButton onClick={()=>setSellModal(null)} icon={X} size={32} bg={UI.chip} iconColor={UI.mute2} />
            </div>
            <div style={{fontSize:13,fontWeight:600,color:C.sub,marginBottom:16,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sellModal.item.title}</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Field label={t('prixDeVente')} value={sellModal.sellPrice} set={v=>setSellModal(p=>({...p,sellPrice:v}))} placeholder="0,00" type="number" icon="💰" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              {(sellModal.item.quantite||1)>1&&(
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:13,fontWeight:600,color:C.sub,flex:1}}>{lang==='fr'?'Quantité à vendre':'Quantity to sell'}</span>
                  <input type="number" min={1} max={sellModal.item.quantite} value={sellModal.sellQty??1}
                    onFocus={e=>e.target.select()}
                    onChange={e=>setSellModal(p=>({...p,sellQty:Math.max(1,Math.min(parseInt(e.target.value)||1,p.item.quantite))}))}
                    style={{width:70,fontSize:13,fontWeight:700,border:"1px solid rgba(0,0,0,0.15)",borderRadius:8,padding:"8px 10px",textAlign:"center",fontFamily:"inherit"}}/>
                  <span style={{fontSize:12,color:C.sub}}>/ {sellModal.item.quantite}</span>
                </div>
              )}
              {(sellModal.sellQty||1)>1&&(
                <>
                  <div style={{display:"flex",gap:6}}>
                    {["total","unit"].map(m=>(
                      <button key={m} onClick={()=>setSellModal(p=>({...p,prixMode:m}))}
                        style={{flex:1,padding:"7px 0",fontSize:11,fontWeight:700,borderRadius:8,border:`1px solid ${C.teal}`,background:sellModal.prixMode===m?C.teal:"transparent",color:sellModal.prixMode===m?"#fff":C.teal,cursor:"pointer",fontFamily:"inherit"}}>
                        {m==="total"?(lang==='fr'?'Prix total lot':'Total lot price'):(lang==='fr'?'Prix par unité':'Price per unit')}
                      </button>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {["total","unit"].map(m=>(
                      <button key={m} onClick={()=>setSellModal(p=>({...p,feesMode:m}))}
                        style={{flex:1,padding:"7px 0",fontSize:11,fontWeight:700,borderRadius:8,border:"1px solid #F9A26C",background:sellModal.feesMode===m?"#F9A26C":"transparent",color:sellModal.feesMode===m?"#fff":"#F9A26C",cursor:"pointer",fontFamily:"inherit"}}>
                        {m==="total"?(lang==='fr'?'Frais sur le total':'Fees on total'):(lang==='fr'?'Frais par unité':'Fees per unit')}
                      </button>
                    ))}
                  </div>
                  {parseFloat(sellModal.sellPrice)>0&&(
                    <div style={{fontSize:11,color:"#6B7280",textAlign:"center",background:"#F9FAFB",borderRadius:6,padding:"4px 0"}}>
                      {sellModal.prixMode==="total"
                        ?`= ${(parseFloat(sellModal.sellPrice)/(sellModal.sellQty||1)).toFixed(2)}€ ${lang==='fr'?'/ unité':'/ unit'}`
                        :`= ${(parseFloat(sellModal.sellPrice)*(sellModal.sellQty||1)).toFixed(2)}€ total`}
                    </div>
                  )}
                </>
              )}
              <Field label={`${lang==='fr'?'Plateforme de vente':'Resale platform'} (${lang==='fr'?'optionnel':'optional'})`} value={sellModal.plateforme||''} set={v=>setSellModal(p=>({...p,plateforme:v}))} placeholder={lang==='fr'?"Ex: Vinted, eBay, Depop...":"Ex: Vinted, eBay, Depop..."} icon="🏪"/>
              <Field label={`${lang==='fr'?'Frais de vente':'Selling fees'} (${lang==='fr'?'optionnel':'optional'})`} value={sellModal.sellingFees} set={v=>setSellModal(p=>({...p,sellingFees:v}))} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
                <input type="checkbox" checked={sellModal.rememberFees} onChange={e=>setSellModal(p=>({...p,rememberFees:e.target.checked}))} style={{width:16,height:16,accentColor:C.teal,cursor:"pointer",flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,color:C.sub}}>{t('memoriserFrais')}</span>
              </label>
            </div>
            {/* Encore en ligne ? AVANT le bouton, jamais après : confirmer ici
                n'arme aucun retrait (cf. confirmSell). Même composant, même
                texte que la carte vocale inventory_sell. */}
            <AvertissementAnnoncesEnLigne item={sellModal.item} lang={lang} style={{marginTop:16}}/>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <PrimaryButton onClick={confirmSell} disabled={!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0} style={{flex:1,width:"auto"}}>
                {t('confirmer')} ✓
              </PrimaryButton>
              <SecondaryButton onClick={()=>setSellModal(null)} style={{width:"auto",padding:"13px 20px"}}>
                {t('annuler')}
              </SecondaryButton>
            </div>
          </div>
        </>
      )}

      {/* ── IMPORT MODAL ── */}
      {importModal&&(
        <>
          <div onClick={()=>setImportModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(90vw,540px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:C.text}}>📥 {lang==='fr'?"Confirmer l'import":"Confirm import"}</div>
              <IconButton onClick={()=>setImportModal(null)} icon={X} size={32} bg={UI.chip} iconColor={UI.mute2} />
            </div>

            {/* ÉTAPE 6 : Mapping détecté */}
            <div style={{background:C.rowBg,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
                {lang==='fr'?'Correspondance':'Mapping'} — <span style={{color:C.teal}}>{lang==='fr'?`${importModal.sheetsRead} feuille${importModal.sheetsRead>1?"s":""} lue${importModal.sheetsRead>1?"s":""}, ${importModal.validCount} ligne${importModal.validCount>1?"s":""} valide${importModal.validCount>1?"s":""} trouvée${importModal.validCount>1?"s":""}`:`${importModal.sheetsRead} sheet${importModal.sheetsRead>1?"s":""} read, ${importModal.validCount} valid row${importModal.validCount>1?"s":""} found`}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {/* Titre (peut être multiple) */}
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,flexShrink:0}}>🏷️</span>
                  <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?'Titre / Nom * :':'Title / Name * :'}</span>
                  {importModal.mapping.titres.length>0
                    ? <span style={{fontWeight:700,color:C.teal,flex:1}}>{importModal.mapping.titres.map(h=>`« ${h} »`).join(' + ')}</span>
                    : <select value="" onChange={e=>setImportModal(m=>({...m,mapping:{...m.mapping,titres:e.target.value?[e.target.value]:[]}}))}
                        style={{flex:1,fontSize:12,padding:"4px 8px",borderRadius:8,border:"1px solid #CBD5E0",background:"#fff",color:C.text,cursor:"pointer"}}>
                        <option value="">{lang==='fr'?'— Choisir une colonne —':'— Choose a column —'}</option>
                        {importModal.headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                  }
                </div>
                {/* Prix achat */}
                {/* Date + Marque — lignes fixes */}
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,flexShrink:0}}>📅</span>
                  <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?'Date :':'Date:'}</span>
                  <span style={{fontWeight:700,color:importModal.mapping.date?C.teal:"#A3A9A6",flex:1}}>
                    {importModal.mapping.date?`✓ « ${importModal.mapping.date} »`:(lang==='fr'?"— non détectée —":"— not detected —")}
                  </span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,flexShrink:0}}>🏷️</span>
                  <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?'Marque :':'Brand:'}</span>
                  <span style={{fontWeight:700,color:"#A3A9A6",flex:1}}>
                    {importModal.mapping.marque_col?(lang==='fr'?`✓ colonne « ${importModal.mapping.marque_col} »`:`✓ column « ${importModal.mapping.marque_col} »`):(lang==='fr'?"détection automatique par nom":"auto-detection by name")}
                  </span>
                </div>
                {[
                  {key:"prix_achat",labelFr:"Prix d'achat",labelEn:"Purchase price",icon:"🛒",required:true},
                  {key:"prix_vente",labelFr:"Prix de vente",labelEn:"Sell price",icon:"💰",required:false},
                  {key:"statut",labelFr:"Statut",labelEn:"Status",icon:"📌",required:false},
                ].map(({key,labelFr,labelEn,icon})=>(
                  <div key={key} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                    <span style={{color:C.sub,minWidth:106,flexShrink:0}}>{lang==='fr'?labelFr:labelEn} :</span>
                    {importModal.mapping[key]
                      ? <span style={{fontWeight:700,color:C.teal,flex:1}}>✓ « {importModal.mapping[key]} »</span>
                      : <select value="" onChange={e=>setImportModal(m=>({...m,mapping:{...m.mapping,[key]:e.target.value||null}}))}
                          style={{flex:1,fontSize:12,padding:"4px 8px",borderRadius:8,border:"1px solid #CBD5E0",background:"#fff",color:C.text,cursor:"pointer"}}>
                          <option value="">{lang==='fr'?'— Choisir —':'— Choose —'}</option>
                          {importModal.headers.map(h=><option key={h} value={h}>{h}</option>)}
                        </select>
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* Lignes ignorées */}
            {importModal.ignoredCount>0&&(
              <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#92400E",marginBottom:12,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontWeight:700}}>⚠️ {importModal.ignoredCount} ligne{importModal.ignoredCount>1?"s":""} ignorée{importModal.ignoredCount>1?"s":""} :</span>
                {Object.entries(importModal.skipCounts).map(([reason,count])=>(
                  <span key={reason} style={{background:"#FEF3C7",borderRadius:6,padding:"2px 8px",fontWeight:600}}>{count} {reason}</span>
                ))}
              </div>
            )}

            {/* Aperçu 3 premières lignes avec valeurs calculées */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                Aperçu ({importModal.rows.length} ligne{importModal.rows.length>1?"s":""} au total)
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {importModal.preview.map((row,i)=>{
                  const nom=buildTitre(row,importModal.mapping.titres);
                  const buy=importModal.mapping.prix_achat?String(row[importModal.mapping.prix_achat]):"—";
                  const sell=importModal.mapping.prix_vente?String(row[importModal.mapping.prix_vente]):"—";
                  const statVal=importModal.mapping.statut?String(row[importModal.mapping.statut]):(parseFloat(sell)>0?"vendu":"stock");
                  return(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,padding:"8px 12px",background:C.rowBg,borderRadius:10,fontSize:11,alignItems:"center"}}>
                      <span style={{fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nom}</span>
                      <span style={{color:C.sub,whiteSpace:"nowrap"}}>Achat : {buy}</span>
                      <span style={{color:C.sub,whiteSpace:"nowrap"}}>Vente : {sell}</span>
                      <span style={{color:statVal==="vendu"?C.green:C.orange,fontWeight:600,whiteSpace:"nowrap"}}>{statVal}</span>
                    </div>
                  );
                })}
                {importModal.rows.length>3&&<div style={{fontSize:11,color:C.label,textAlign:"center"}}>+ {importModal.rows.length-3} {lang==='fr'?'autre(s)':'more'}</div>}
              </div>
            </div>

            {importModal.mapping.titres.length===0&&(
              <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#92400E",marginBottom:12}}>
                {lang==='fr'?'⚠️ Colonne titre non détectée. Sélectionne-la ci-dessus ou les articles seront importés sans nom.':'⚠️ Title column not detected. Select it above or items will be imported without a name.'}
              </div>
            )}

            {importMsg&&<div style={{fontSize:12,color:C.red,marginBottom:12}}>{importMsg}</div>}

            <div style={{display:"flex",gap:10}}>
              <PrimaryButton onClick={handleImportConfirm} disabled={importLoading} style={{flex:1,width:"auto"}}>
                {importLoading?(lang==='fr'?"Import en cours...":"Importing..."):(lang==='fr'?"Importer les données →":"Import data →")}
              </PrimaryButton>
              <SecondaryButton onClick={()=>setImportModal(null)} style={{width:"auto",padding:"13px 20px"}}>
                {lang==='fr'?'Annuler':'Cancel'}
              </SecondaryButton>
            </div>
          </div>
        </>
      )}

      {/* ── SETTINGS DRAWER ── */}
      {showSettings&&(
        <>
          <div onClick={()=>{setShowSettings(false);setDeleteStep(0);}} style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px",background:"rgba(16,32,27,0.45)",backdropFilter:"blur(2px)",animation:"fadeInBd 0.2s ease"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:UI.card,borderRadius:24,width:"100%",maxWidth:384,padding:24,border:`1px solid ${UI.border}`,boxShadow:"0 24px 64px rgba(16,32,27,0.18)",maxHeight:"90vh",overflowY:"auto",animation:"fadeInBd 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:700,color:UI.ink}}>{t('parametres')}</div>
              <IconButton onClick={()=>{setShowSettings(false);setDeleteStep(0);}} icon={X} size={32} bg={UI.chip} iconColor={UI.mute2} />
            </div>

            {/* Profil */}
            <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <Eyebrow>{t('monCompte')}</Eyebrow>
              <div style={{fontSize:13,fontWeight:600,color:UI.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📧 {user?.email}</div>
              {isPremium&&(
                <div style={{marginTop:8}}>
                  <PlanBadge isPremium={isPremium} isPro={isPro} isBusiness={isBusiness} />
                </div>
              )}
            </div>

            {/* Pépites de publication */}
            <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <Eyebrow>{lang==='fr'?'Mes Pépites':'My Nuggets'}</Eyebrow>
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:22,fontWeight:700,color:UI.ink}}><PepiteAmount value={(coinWallet?.included_balance??0)+(coinWallet?.purchased_balance??0)} size={24} /></span>
                <span style={{fontSize:11,color:UI.mute,fontWeight:600}}>
                  {lang==='fr'
                    ?`${coinWallet?.included_balance??0} incluses · ${coinWallet?.purchased_balance??0} achetées`
                    :`${coinWallet?.included_balance??0} included · ${coinWallet?.purchased_balance??0} purchased`}
                </span>
                {/* Réservation/capture (2026-08-05) : Pépites mises de côté pour
                    des publications en file — capturées à la publication réelle,
                    rendues automatiquement sinon (échec, annulation, 30 j). */}
                {(coinWallet?.reserved_balance??0)>0&&(
                  <span style={{fontSize:11,color:UI.mute,fontWeight:600,width:"100%"}}>
                    {lang==='fr'
                      ?`dont ${coinWallet.reserved_balance} en attente de publication (rendues si la publication n'aboutit pas)`
                      :`${coinWallet.reserved_balance} pending publication (returned if publishing doesn't complete)`}
                  </span>
                )}
              </div>
              {/* Recharger : ouvre la boutique DÉJÀ montée (coinStoreOpen), la même
                  que celle des modales de conversion. Toujours proposée, quel que
                  soit le solde — on n'attend pas d'être bloqué pour recharger. */}
              <button
                onClick={()=>setCoinStoreOpen(true)}
                style={{marginTop:12,width:"100%",padding:"11px 0",borderRadius:999,border:"none",fontFamily:"inherit",fontSize:13.5,fontWeight:600,color:"#fff",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,boxShadow:"0 8px 20px rgba(47,158,144,0.24)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}
              >
                <PepiteIcon size={16} /> {lang==='fr'?'Recharger mes Pépites':'Top up my Nuggets'}
              </button>
              {coinHistory.length>0&&(
                <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${UI.border}`,display:"flex",flexDirection:"column",gap:5,maxHeight:190,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                  {coinHistory.map((h,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:11.5,color:UI.mute2}}>
                      <span>{COIN_KIND_LABELS[h.kind]?.[lang==='fr'?'fr':'en']??h.kind} · {new Date(h.created_at).toLocaleDateString(lang==='fr'?'fr-FR':'en-GB')}</span>
                      <span style={{fontWeight:700,color:h.delta>=0?UI.tealDeep:UI.negative}}>{h.delta>=0?`+${h.delta}`:h.delta}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pseudo */}
            <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <Eyebrow style={{marginBottom:8}}>{lang==='fr'?'Mon pseudo':'My username'}</Eyebrow>
              <div style={{display:"flex",gap:8}}>
                <input
                  value={settingsPseudoInput}
                  onChange={e=>setSettingsPseudoInput(e.target.value.slice(0,30))}
                  placeholder={lang==='fr'?'Prénom ou pseudo…':'First name or nickname…'}
                  style={{flex:1,padding:"8px 12px",borderRadius:10,border:`1px solid ${UI.border}`,fontSize:13,fontWeight:600,color:UI.ink,background:UI.card,outline:"none",fontFamily:"inherit",minWidth:0}}
                />
                <button
                  onClick={async()=>{
                    setSettingsPseudoSaving(true);
                    const val=settingsPseudoInput.trim();
                    // .select() : sans lui, un update filtré par RLS (0 ligne) ne
                    // renvoie PAS d'erreur → faux "✅" (cas vécu : policy UPDATE absente).
                    const{data:upd,error}=await supabase.from('profiles').update({username:val}).eq('id',user.id).select('username');
                    setSettingsPseudoSaving(false);
                    if(error||!upd?.length){
                      setToast({visible:true,message:lang==='fr'?'❌ Erreur lors de la sauvegarde':'❌ Save failed'});
                    }else{
                      setUsername(val);
                      setToast({visible:true,message:lang==='fr'?'✅ Pseudo enregistré !':'✅ Username saved!'});
                    }
                    setTimeout(()=>setToast({visible:false,message:''}),3000);
                  }}
                  disabled={settingsPseudoSaving}
                  style={{padding:"8px 14px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:13,fontWeight:600,cursor:settingsPseudoSaving?"not-allowed":"pointer",opacity:settingsPseudoSaving?0.7:1,transition:"all 0.2s",fontFamily:"inherit",whiteSpace:"nowrap"}}
                >
                  {settingsPseudoSaving?"…":(lang==='fr'?'Enregistrer':'Save')}
                </button>
              </div>
            </div>

            {/* Adresse de remise Leboncoin — requise par le wizard LBC à chaque
                dépôt (non pré-remplie depuis le compte LBC, vérifié) ; l'extension
                la tape dans l'autocomplete et choisit la 1re suggestion. Saisie en
                3 champs (rue / code postal / ville), recomposée en string unique
                à l'enregistrement. */}
            {(()=>{
              const cpValid=/^\d{5}$/.test(settingsLbcCp.trim());
              const cpTouched=settingsLbcCp.trim().length>0;
              const cpError=cpTouched&&!cpValid;
              const inputStyle=(err)=>({width:"100%",boxSizing:"border-box",padding:"8px 12px",borderRadius:10,border:`1px solid ${err?UI.negative:UI.border}`,fontSize:13,fontWeight:600,color:UI.ink,background:UI.card,outline:"none",fontFamily:"inherit",minWidth:0});
              // Écriture effective (lecture-fusion-écriture : platform_settings est
              // partagé entre plateformes, ne jamais écraser les clés des autres).
              // String unique attendue par le handler (content-scripts/leboncoin.js) :
              // jointure par espaces, sans virgule — l'autocomplete LBC (type Google
              // Places) matche mieux "12 rue de la paix 69001 lyon" que la même
              // chaîne ponctuée (cf. commentaire fillAddress).
              const enregistrerAdresseLbc=async(rue,cp,ville)=>{
                const adresse=[rue,cp,ville].filter(Boolean).join(' ');
                const{data:cur}=await supabase.from('profiles').select('platform_settings').eq('id',user.id).maybeSingle();
                const next={...(cur?.platform_settings||{}),leboncoin:{...(cur?.platform_settings?.leboncoin||{}),rue,code_postal:cp,ville,adresse}};
                // .select() : sans lui, un update filtré par RLS (0 ligne) ne
                // renvoie PAS d'erreur → faux "✅" (cas vécu : policy UPDATE absente).
                const{data:upd,error}=await supabase.from('profiles').update({platform_settings:next}).eq('id',user.id).select('platform_settings');
                const failed=error||!upd?.length;
                if(!failed){setSettingsLbcRue(rue);setSettingsLbcCp(cp);setSettingsLbcVille(ville);setSettingsLbcBan(null);}
                setToast({visible:true,message:failed?(lang==='fr'?'❌ Erreur lors de la sauvegarde':'❌ Save failed'):(lang==='fr'?'✅ Adresse enregistrée !':'✅ Address saved!')});
                setTimeout(()=>setToast({visible:false,message:''}),3000);
              };
              // Vérification BAN au clic Enregistrer (2026-08-13, échec réel du jour :
              // « saint antoines du rochers » tapé pour Saint-Antoine-du-Rocher — deux
              // dépôts LBC échoués « sans suggestion dans l'autocomplete », que 10 s de
              // normalisation ICI auraient évités). La BAN (api-adresse.data.gouv.fr)
              // est publique, gratuite, CORS ouvert. TROIS issues, aucune ne bloque :
              //   · trouvée ≈ identique à la saisie → enregistrement direct ;
              //   · trouvée mais différente → proposition en premier choix, la saisie
              //     manuelle reste forçable ;
              //   · introuvable → avertissement clair + « Enregistrer quand même »
              //     (rues neuves, lieux-dits, outre-mer : décision Nico 13/08, on ne
              //     bloque JAMAIS l'enregistrement) ;
              //   · service en panne → enregistrement direct, pas d'alarme à tort.
              const normBan=(s)=>String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
              const verifierPuisEnregistrer=async()=>{
                setSettingsLbcAddressSaving(true);
                const rue=settingsLbcRue.trim();
                const cp=settingsLbcCp.trim();
                const ville=settingsLbcVille.trim();
                const saisie=[rue,cp,ville].filter(Boolean).join(' ');
                let feature=null,banIndisponible=false;
                try{
                  const rep=await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(saisie)}&limit=1&autocomplete=0`);
                  if(!rep.ok)throw new Error(`HTTP ${rep.status}`);
                  feature=(await rep.json())?.features?.[0]??null;
                }catch{banIndisponible=true;}
                if(banIndisponible){await enregistrerAdresseLbc(rue,cp,ville);setSettingsLbcAddressSaving(false);return;}
                // Score plancher : sous 0.4 la BAN « trouve » n'importe quoi (elle rend
                // toujours son moins mauvais candidat) — on traite comme introuvable.
                if(!feature||Number(feature.properties?.score??0)<0.4){
                  setSettingsLbcBan({kind:'introuvable'});
                  setSettingsLbcAddressSaving(false);
                  return;
                }
                const p=feature.properties??{};
                // Recomposition dans NOS 3 champs : rue = numéro + voie (p.name porte
                // déjà « 3 Allée des Guisniers » ; les lieux-dits y vivent aussi).
                const banRue=String(p.name??'').trim();
                const banCp=String(p.postcode??cp).trim();
                const banVille=String(p.city??ville).trim();
                const banAdresse=[banRue,banCp,banVille].filter(Boolean).join(' ');
                if(normBan(banAdresse)===normBan(saisie)){
                  await enregistrerAdresseLbc(rue,cp,ville); // identique modulo accents/casse : zéro friction
                }else{
                  setSettingsLbcBan({kind:'proposition',rue:banRue,cp:banCp,ville:banVille,label:String(p.label??banAdresse)});
                }
                setSettingsLbcAddressSaving(false);
              };
              return (
            <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <Eyebrow style={{marginBottom:8}}>{lang==='fr'?'Adresse de remise Leboncoin':'Leboncoin pickup address'}</Eyebrow>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input
                  value={settingsLbcRue}
                  onChange={e=>{setSettingsLbcRue(e.target.value.slice(0,120));setSettingsLbcBan(null);}}
                  placeholder={lang==='fr'?'Rue — ex : 12 rue de la Paix':'Street — e.g. 12 rue de la Paix'}
                  style={inputStyle(false)}
                />
                <div style={{display:"flex",gap:8}}>
                  <input
                    value={settingsLbcCp}
                    onChange={e=>{setSettingsLbcCp(e.target.value.replace(/\D/g,'').slice(0,5));setSettingsLbcBan(null);}}
                    inputMode="numeric"
                    placeholder={lang==='fr'?'Code postal':'Postal code'}
                    style={{...inputStyle(cpError),flex:"0 0 110px"}}
                  />
                  <input
                    value={settingsLbcVille}
                    onChange={e=>{setSettingsLbcVille(e.target.value.slice(0,80));setSettingsLbcBan(null);}}
                    placeholder={lang==='fr'?'Ville':'City'}
                    style={{...inputStyle(false),flex:1}}
                  />
                </div>
                {cpError&&(
                  <div style={{fontSize:11,color:UI.negative,fontWeight:600}}>
                    {lang==='fr'?'Le code postal doit contenir 5 chiffres.':'Postal code must be 5 digits.'}
                  </div>
                )}
                {settingsLbcBan?.kind==='proposition'&&(
                  <div style={{background:"#F0FDFB",border:"1px solid rgba(13,148,136,0.25)",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{fontSize:12,color:"#1B6E62",lineHeight:1.5}}>
                      {lang==='fr'?<>Adresse reconnue : <b>{settingsLbcBan.label}</b></>:<>Address found: <b>{settingsLbcBan.label}</b></>}
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      <button
                        onClick={async()=>{setSettingsLbcAddressSaving(true);await enregistrerAdresseLbc(settingsLbcBan.rue,settingsLbcBan.cp,settingsLbcBan.ville);setSettingsLbcAddressSaving(false);}}
                        disabled={settingsLbcAddressSaving}
                        style={{padding:"7px 12px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                      >
                        {lang==='fr'?'Utiliser cette adresse':'Use this address'}
                      </button>
                      <button
                        onClick={async()=>{setSettingsLbcAddressSaving(true);await enregistrerAdresseLbc(settingsLbcRue.trim(),settingsLbcCp.trim(),settingsLbcVille.trim());setSettingsLbcAddressSaving(false);}}
                        disabled={settingsLbcAddressSaving}
                        style={{padding:"7px 12px",borderRadius:999,border:`1px solid ${UI.border}`,background:UI.card,color:UI.ink,fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                      >
                        {lang==='fr'?'Garder ma saisie':'Keep my entry'}
                      </button>
                    </div>
                  </div>
                )}
                {settingsLbcBan?.kind==='introuvable'&&(
                  <div style={{background:"#FFF7ED",border:"1px solid #FED7AA",borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                    <div style={{fontSize:12,color:"#9A3412",lineHeight:1.5}}>
                      {lang==='fr'
                        ?'⚠️ Adresse non reconnue (Base Adresse Nationale) — vérifie l\'orthographe de la rue et de la ville. Tu peux quand même l\'enregistrer, mais la publication Leboncoin risque d\'échouer sur cette adresse.'
                        :'⚠️ Address not recognized (French national address base) — check the street and city spelling. You can still save it, but Leboncoin publishing may fail with this address.'}
                    </div>
                    <button
                      onClick={async()=>{setSettingsLbcAddressSaving(true);await enregistrerAdresseLbc(settingsLbcRue.trim(),settingsLbcCp.trim(),settingsLbcVille.trim());setSettingsLbcAddressSaving(false);}}
                      disabled={settingsLbcAddressSaving}
                      style={{alignSelf:"flex-start",padding:"7px 12px",borderRadius:999,border:"1px solid #FED7AA",background:UI.card,color:"#9A3412",fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                    >
                      {lang==='fr'?'Enregistrer quand même':'Save anyway'}
                    </button>
                  </div>
                )}
                {!settingsLbcBan&&(
                <button
                  onClick={verifierPuisEnregistrer}
                  disabled={settingsLbcAddressSaving||cpError}
                  style={{alignSelf:"flex-start",padding:"8px 14px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:13,fontWeight:600,cursor:(settingsLbcAddressSaving||cpError)?"not-allowed":"pointer",opacity:(settingsLbcAddressSaving||cpError)?0.6:1,transition:"all 0.2s",fontFamily:"inherit",whiteSpace:"nowrap"}}
                >
                  {settingsLbcAddressSaving?"…":(lang==='fr'?'Enregistrer':'Save')}
                </button>
                )}
              </div>
              <div style={{fontSize:11,color:UI.mute,marginTop:8,lineHeight:1.4}}>
                {lang==='fr'?'Utilisée pour le champ « adresse du bien » lors de la publication automatique sur Leboncoin. Jamais affichée sur l\'annonce.':'Used for the "item address" field when auto-publishing on Leboncoin. Never shown on the listing.'}
              </div>
            </div>
              );
            })()}

            {/* Désabonnement — visible uniquement si premium */}
            {isPremium&&(
              <div style={{marginBottom:12}}>
                {platform==='ios'?(
                  /* iOS IAP : géré par Apple */
                  <div style={{background:`${UI.teal}12`,border:`1px solid ${UI.teal}55`,borderRadius:12,padding:"12px 14px",fontSize:13,color:UI.tealDeep,fontWeight:600,lineHeight:1.6}}>
                    ⭐ {lang==='fr'
                      ? 'Pour gérer votre abonnement, allez dans Réglages → Apple ID → Abonnements.'
                      : 'To manage your subscription, go to Settings → Apple ID → Subscriptions.'}
                  </div>
                ):platform==='android'?(
                  /* Android IAP : géré par Google Play */
                  <div style={{background:`${UI.teal}12`,border:`1px solid ${UI.teal}55`,borderRadius:12,padding:"12px 14px",fontSize:13,color:UI.tealDeep,fontWeight:600,lineHeight:1.6}}>
                    ⭐ {lang==='fr'
                      ? <span>Pour gérer votre abonnement, <a href="https://play.google.com/store/account/subscriptions?sku=app.fillsell.premium.sub&package=app.fillsell.app" target="_blank" rel="noreferrer" style={{color:UI.tealDeep,textDecoration:"underline"}}>ouvrez vos abonnements Google Play</a>.</span>
                      : <span>To manage your subscription, <a href="https://play.google.com/store/account/subscriptions?sku=app.fillsell.premium.sub&package=app.fillsell.app" target="_blank" rel="noreferrer" style={{color:UI.tealDeep,textDecoration:"underline"}}>open your Google Play subscriptions</a>.</span>}
                  </div>
                ):(cancelAtPeriodEnd||cancelMsg)?(
                  <div style={{background:`${UI.teal}12`,border:`1px solid ${UI.teal}55`,borderRadius:12,padding:"12px 14px",fontSize:13,color:UI.tealDeep,fontWeight:600,lineHeight:1.5}}>
                    ✅ {cancelMsg||(lang==='fr'
                      ? `Abonnement annulé. Tu gardes l'accès premium jusqu'au${cancelPeriodEnd?` ${cancelPeriodEnd}`:" la fin de la période"}.`
                      : `Subscription cancelled. You keep premium access until${cancelPeriodEnd?` ${cancelPeriodEnd}`:" the end of the period"}.`)}
                  </div>
                ):cancelStep===0?(
                  <button onClick={()=>setCancelStep(1)} style={{width:"100%",padding:"11px",background:"transparent",border:`1.5px solid ${UI.amber}99`,borderRadius:999,color:UI.amber,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s",textAlign:"left",display:"flex",alignItems:"center",gap:8}}
                    onMouseEnter={e=>e.currentTarget.style.background=`${UI.amber}0F`}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >
                    <span>📭</span> {t('seDesabonner')}
                  </button>
                ):(
                  <div style={{background:`${UI.amber}14`,border:`1.5px solid ${UI.amber}66`,borderRadius:12,padding:"14px"}}>
                    <div style={{fontSize:13,fontWeight:600,color:UI.ink,marginBottom:10}}>{lang==='fr'?'Confirmer la résiliation ?':'Confirm cancellation?'}</div>
                    <div style={{fontSize:12,color:UI.mute2,marginBottom:12,lineHeight:1.5}}>{lang==='fr'?'Tu conserveras l\'accès Premium jusqu\'à la fin de ta période en cours. Aucun remboursement au prorata.':'You will keep Premium access until the end of your current period. No prorated refund.'}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={handleCancelSubscription} disabled={cancelLoading} style={{flex:1,padding:"9px",background:UI.amber,border:"none",borderRadius:999,color:"#fff",fontSize:13,fontWeight:600,cursor:cancelLoading?"not-allowed":"pointer",opacity:cancelLoading?0.7:1,transition:"all 0.2s"}}>
                        {cancelLoading?"...":(lang==='fr'?'Confirmer':'Confirm')}
                      </button>
                      <button onClick={()=>setCancelStep(0)} disabled={cancelLoading} style={{flex:1,padding:"9px",background:"transparent",border:`1px solid ${UI.border}`,borderRadius:999,color:UI.mute2,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>
                        {lang==='fr'?'Annuler':'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Restaurer les achats — iOS non-premium uniquement */}
            {isNative&&!isPremium&&(
              <button onClick={handleIAPRestore} disabled={iapLoading}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,background:"transparent",border:"none",color:UI.ink,fontSize:"inherit",fontFamily:"inherit",cursor:iapLoading?"not-allowed":"pointer",transition:"background 0.15s",marginBottom:2,textAlign:"left",opacity:iapLoading?0.6:1}}
                onMouseEnter={e=>{if(!iapLoading)e.currentTarget.style.background=UI.chip;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
              >
                <span style={{fontSize:18,flexShrink:0}}>🔄</span>
                <div style={{fontSize:14,fontWeight:600}}>{iapLoading?(lang==='fr'?'Restauration...':'Restoring...'):(lang==='fr'?'Restaurer mes achats':'Restore purchases')}</div>
              </button>
            )}

            {/* Support */}
            <a href="mailto:support@fillsell.app" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:UI.ink,transition:"background 0.15s",marginBottom:2,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=UI.chip}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:18,flexShrink:0}}>💬</span>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{t('support')}</div>
                <div style={{fontSize:12,color:UI.mute2}}>support@fillsell.app</div>
              </div>
            </a>

            {/* Extension Chrome — desktop uniquement : impossible à installer
                depuis un mobile (app native comme navigateur mobile). */}
            {!isNative&&!isMobileViewport&&(
              <a href="/extension" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:UI.ink,transition:"background 0.15s",marginBottom:2,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.background=UI.chip}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              >
                <span style={{fontSize:18,flexShrink:0}}>🧩</span>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>{lang==='fr'?'Extension Chrome':'Chrome extension'}</div>
                  <div style={{fontSize:12,color:UI.mute2}}>{lang==='fr'?'Publier depuis ton navigateur':'Publish from your browser'}</div>
                </div>
              </a>
            )}

            {/* Mentions légales */}
            <a href="/legal" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:UI.ink,transition:"background 0.15s",marginBottom:20,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=UI.chip}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:18,flexShrink:0}}>📄</span>
              <div style={{fontSize:14,fontWeight:600}}>{t('mentionsLegales')}</div>
            </a>

            {/* Langue */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,marginBottom:12}}>
              <span style={{fontWeight:700,fontSize:14,color:UI.ink}}>{t('langue')}</span>
              <SegmentedPills options={['fr','en']} value={lang} onChange={l=>{track('change_language',{language:l});setLang(l);}} labelFn={l=>l.toUpperCase()} />
            </div>

            {/* Devise */}
            <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,marginBottom:12,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,fontSize:14,color:UI.ink}}>{t('devise')}</span>
                <select value={currency} onChange={e=>saveCurrency(e.target.value)}
                  style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${UI.border}`,fontSize:13,fontWeight:700,color:UI.ink,background:UI.card,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                  {['Europe','America','Africa','Asia/Pacific'].map(reg=>(
                    <optgroup key={reg} label={reg==='America'&&lang!=='en'?'Amériques':reg==='Africa'&&lang!=='en'?'Afrique':reg==='Asia/Pacific'?lang==='en'?'Asia & Pacific':'Asie & Pacifique':reg}>
                      {CURRENCIES_LIST.filter(c=>c.reg===reg).map(c=>(
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div style={{fontSize:11,color:UI.mute,marginTop:8,lineHeight:1.4}}>
                {lang==='en'?'⚠️ Changing currency does not convert your existing data.':'⚠️ Changer la devise ne convertit pas vos données existantes.'}
              </div>
            </div>

            {/* Déconnexion */}
            <button onClick={()=>{handleLogout();setShowSettings(false);}} style={{width:"100%",padding:"13px",background:"transparent",border:`1.5px solid ${UI.negative}88`,borderRadius:999,color:UI.negative,fontSize:14,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.background=`${UI.negative}0F`}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{t('seDeconnecter')}</button>

            {/* Suppression de compte */}
            <div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${UI.border}`}}>
              {deleteStep===0&&(
                <button onClick={()=>setDeleteStep(1)}
                  style={{width:"100%",padding:"11px",background:"transparent",border:"none",borderRadius:12,color:UI.mute,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s",textAlign:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.color=UI.negative}
                  onMouseLeave={e=>e.currentTarget.style.color=UI.mute}
                >
                  {lang==='fr'?'Supprimer mon compte':'Delete my account'}
                </button>
              )}
              {deleteStep===1&&(
                <div style={{background:`${UI.negative}0F`,border:`1.5px solid ${UI.negative}44`,borderRadius:12,padding:"14px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:UI.negative,marginBottom:6}}>
                    {lang==='fr'?'Êtes-vous sûr ?':'Are you sure?'}
                  </div>
                  <div style={{fontSize:12,color:UI.mute2,marginBottom:12,lineHeight:1.5}}>
                    {lang==='fr'?'Cette action est irréversible.':'This action is irreversible.'}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setDeleteStep(2)} style={{flex:1,padding:"9px",background:UI.negative,border:"none",borderRadius:999,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==='fr'?'Continuer':'Continue'}
                    </button>
                    <button onClick={()=>setDeleteStep(0)} style={{flex:1,padding:"9px",background:"transparent",border:`1px solid ${UI.border}`,borderRadius:999,color:UI.mute2,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==='fr'?'Annuler':'Cancel'}
                    </button>
                  </div>
                </div>
              )}
              {deleteStep===2&&(
                <div style={{background:`${UI.negative}0F`,border:`2px solid ${UI.negative}`,borderRadius:12,padding:"14px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:UI.negative,marginBottom:6}}>
                    {lang==='fr'?'Confirmation finale':'Final confirmation'}
                  </div>
                  <div style={{fontSize:12,color:UI.mute2,marginBottom:12,lineHeight:1.5}}>
                    {lang==='fr'
                      ?'Toutes vos données seront supprimées définitivement. Cette action ne peut pas être annulée.'
                      :'All your data will be permanently deleted. This action cannot be undone.'}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={handleDeleteAccount} disabled={deleteLoading}
                      style={{flex:1,padding:"9px",background:UI.negative,border:"none",borderRadius:999,color:"#fff",fontSize:13,fontWeight:600,cursor:deleteLoading?"not-allowed":"pointer",opacity:deleteLoading?0.7:1}}>
                      {deleteLoading?"...":(lang==='fr'?'Supprimer définitivement':'Delete permanently')}
                    </button>
                    <button onClick={()=>setDeleteStep(0)} disabled={deleteLoading} style={{flex:1,padding:"9px",background:"transparent",border:`1px solid ${UI.border}`,borderRadius:999,color:UI.mute2,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==='fr'?'Annuler':'Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Réinitialisation inventaire — discrète, tout en bas */}
            <div style={{marginTop:8,paddingTop:12,borderTop:`1px solid ${UI.border}`,textAlign:"center"}}>
              {resetStep===0&&(
                <button onClick={handleReset}
                  style={{background:"none",border:"none",color:UI.mute,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",padding:"4px 8px",borderRadius:8,transition:"color 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.color=UI.negative}
                  onMouseLeave={e=>e.currentTarget.style.color=UI.mute}
                >{lang==='fr'?'Réinitialiser l\'inventaire':'Reset inventory'}</button>
              )}
              {resetStep===1&&(
                <div>
                  <div style={{fontSize:12,color:UI.mute,marginBottom:8}}>{lang==='fr'?'⚠️ Supprimer tout le stock et les ventes ?':'⚠️ Delete all stock and sales?'}</div>
                  <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                    <button onClick={handleReset} style={{padding:"5px 14px",background:"none",border:`1px solid ${UI.border}`,borderRadius:999,color:UI.mute2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==='fr'?'Confirmer':'Confirm'}</button>
                    <button onClick={()=>setResetStep(0)} style={{padding:"5px 14px",background:"none",border:`1px solid ${UI.border}`,borderRadius:999,color:UI.mute2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==='fr'?'Annuler':'Cancel'}</button>
                  </div>
                </div>
              )}
            </div>

            {/* Signaler un bug — masqué sans compte : l'envoi exige un Bearer
                utilisateur, un bouton visible hors session serait un bouton
                qui ne fait rien. */}
            {user&&(
            <button onClick={()=>{setShowBugReport(true);setBugMessage("");}}
              style={{display:"block",width:"100%",background:"none",border:"none",textAlign:"center",fontSize:12,color:UI.mute,marginTop:16,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,fontFamily:"inherit",padding:0}}
            >
              🐛 {lang==='fr'?'Signaler un bug':'Report a bug'}
            </button>
            )}
          </div>
          </div>
          <style>{`
            @keyframes fadeInBd{from{opacity:0}to{opacity:1}}
          `}</style>
        </>
      )}

      {/* ── CONVERSION MODAL (fusion ex-UpgradeModal : vocal, Lens, publish, stock, générique) ── */}
      <ConversionModal
        isOpen={conversionModal.open}
        onClose={()=>setConversionModal(m=>({...m,open:false}))}
        onUpgrade={(tier)=>{setConversionModal(m=>({...m,open:false}));startTierCheckout(tier,conversionModal.origine??'modale_plan');}}
        trigger={conversionModal.trigger}
        lang={lang}
        isPremium={isPremium}
        isPro={isPro}
        isBusiness={isBusiness}
        userId={user?.id}
        itemCount={items.filter(i=>i.statut!=='vendu').length}
        coinBalance={conversionModal.coinBalance??(coinWallet?(coinWallet.included_balance??0)+(coinWallet.purchased_balance??0):null)}
        coinPrice={conversionModal.coinPrice??null}
        onUseCoins={conversionModal.coinPrice!=null?()=>{setConversionModal(m=>({...m,open:false}));setCoinStoreOpen(true);}:null}
      />

      <CoinStoreModal
        open={coinStoreOpen}
        onClose={()=>setCoinStoreOpen(false)}
        lang={lang}
        supabase={supabase}
      />

      {/* ── PREMIUM WELCOME MODAL (post-IAP purchase) ── */}
      {showPremiumWelcome&&(
        <PremiumWelcomeModal lang={lang} tier={isBusiness?'business':isPro?'pro':'premium'} onClose={()=>setShowPremiumWelcome(false)}/>
      )}

      {/* ── MODALE « MON PLAN » (badge du header) ──
          Contenu par plan RÉEL (isBusiness devant isPro devant isPremium, même
          ordre que PlanBadge — flags cumulatifs) : l'ancienne version listait
          des avantages Premium périmés quel que soit le plan.
          onUpgradePro (2026-07-24) : upsell Pro pour les Premium.
          onUpgradeBusiness (2026-08-09) : upsell Business pour les Pro, affiché
          seulement si l'offre est ouverte (drapeau côté modale). Les deux
          passent par startTierCheckout, qui porte déjà la garde Android
          anti-double-abo, l'upgrade Stripe in situ et la garde de masquage. */}
      {showPremiumModal&&(
        <PlanDetailsModal
          isPro={isPro}
          isBusiness={isBusiness}
          lang={lang}
          onClose={()=>setShowPremiumModal(false)}
          supabase={supabase}
          userId={user?.id}
          onUpgradePro={()=>{setShowPremiumModal(false);startTierCheckout('pro');}}
          onUpgradeBusiness={()=>{setShowPremiumModal(false);startTierCheckout('business');}}
        />
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteConfirm&&(
        <>
          <div onClick={()=>setDeleteConfirm(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(92vw,400px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}}>
            <div style={{fontSize:16,fontWeight:700,color:"#0D0D0D",marginBottom:8}}>
              {lang==='fr'?'🗑️ Supprimer':'🗑️ Delete'}
            </div>
            {deleteConfirm.type==='soldItem'&&(
              <>
                <div style={{fontSize:13,color:"#6B7280",marginBottom:20,lineHeight:1.5}}>
                  {lang==='fr'
                    ?`Cet article est marqué comme vendu. Que veux-tu supprimer ?`
                    :`This item is marked as sold. What do you want to delete?`}
                  <div style={{fontWeight:700,color:"#0D0D0D",marginTop:6}}>{deleteConfirm.item?.title}</div>
                  {(()=>{const it=deleteConfirm.item;if(!it)return null;const ts=getTypeStyle(it.type||it.categorie);const desc=(it.description||it.desc||"").trim();return(<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:8}}>
                    {(it.type||it.categorie)&&(it.type||it.categorie)!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"3px 9px",fontSize:11,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(it.type||it.categorie,lang)}</span>}
                    {it.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"3px 9px",fontSize:11,fontWeight:700,border:"1px solid #9FE1CB"}}>{it.marque}</span>}
                    {desc&&<span style={{background:"#F3F4F6",color:"#374151",borderRadius:99,padding:"3px 9px",fontSize:11,fontWeight:700,border:"1px solid #E5E7EB"}}>{desc.slice(0,30)}{desc.length>30?"…":""}</span>}
                    {it.emplacement&&<span style={{background:"#F3F4F6",color:"#374151",borderRadius:99,padding:"3px 9px",fontSize:11,fontWeight:700,border:"1px solid #E5E7EB"}}>📍 {it.emplacement}</span>}
                  </div>);})()}
                </div>
                {renderCrossPostConsequences(deleteConfirm.plan)}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={async()=>{
                    await performItemDeletion(deleteConfirm.item,deleteConfirm.plan);
                    setDeleteConfirm(null);
                  }} style={{width:"100%",padding:"12px",background:UI.chip,border:`1px solid ${UI.border}`,borderRadius:14,fontSize:13,fontWeight:600,color:UI.ink,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    {lang==='fr'?'📦 Supprimer l\'article uniquement':'📦 Delete item only'}
                    <div style={{fontSize:11,fontWeight:400,color:UI.mute2,marginTop:2}}>{lang==='fr'?'La vente reste dans le tableau de bord':'The sale remains in the dashboard'}</div>
                  </button>
                  <button onClick={async()=>{
                    await performItemDeletion(deleteConfirm.item,deleteConfirm.plan,{alsoDeleteSale:true});
                    setDeleteConfirm(null);
                  }} style={{width:"100%",padding:"12px",background:`${UI.negative}0F`,border:`1px solid ${UI.negative}66`,borderRadius:14,fontSize:13,fontWeight:600,color:UI.negative,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    {lang==='fr'?'🗑️ Supprimer et annuler le profit':'🗑️ Delete and remove profit'}
                    <div style={{fontSize:11,fontWeight:400,color:UI.negative,opacity:0.8,marginTop:2}}>{lang==='fr'?'Supprime aussi la vente associée':'Also removes the associated sale'}</div>
                  </button>
                  <SecondaryButton onClick={()=>setDeleteConfirm(null)} style={{padding:10}}>
                    {lang==='fr'?'Annuler':'Cancel'}
                  </SecondaryButton>
                </div>
              </>
            )}
            {deleteConfirm.type==='itemListings'&&(()=>{
              const item=deleteConfirm.item,plan=deleteConfirm.plan;
              const jobV=(plan?.online??[]).find(j=>j.platform==='vinted'&&j.listing_url);
              // La sonde ne vaut que pour LE job qu'elle a lu : une modale
              // rouverte sur un autre article ne doit jamais hériter du verdict
              // précédent (même précaution que l'écho d'URL côté pont).
              const sonde=jobV&&sondeSuppression?.jobId===jobV.id?sondeSuppression:null;
              const horsLigne=sonde?.statut==='hors_ligne';
              const vendu=sonde?.signal==='sold';
              const busy=venteSuppr.busy;
              // Comportement d'avant, inchangé — sert à « Retirée », « Je ne sais
              // pas », et à tous les cas où la sonde ne dit rien.
              const supprimerCommeAvant=async()=>{
                await performItemDeletion(item,plan);
                setDeleteConfirm(null);
              };
              return (
              <>
                <div style={{fontSize:13,color:"#6B7280",marginBottom:16,lineHeight:1.5}}>
                  {horsLigne
                    ?(vendu
                      ?(lang==='fr'?`Cette annonce Vinted est marquée VENDUE.`:`This Vinted listing is marked SOLD.`)
                      :(lang==='fr'?`Cette annonce Vinted n'est plus en ligne.`:`This Vinted listing is no longer online.`))
                    :(lang==='fr'?`Cet article est encore présent sur des plateformes.`:`This item is still live on marketplaces.`)}
                  <div style={{fontWeight:700,color:"#0D0D0D",marginTop:6}}>{item?.title}</div>
                </div>
                {/* Vinted retiré de l'encart quand la sonde vient de le voir hors
                    ligne : annoncer « annonce Vinted qui sera retirée » juste
                    au-dessus de « cette annonce n'est plus en ligne » serait se
                    contredire d'une ligne à l'autre. Les AUTRES plateformes, elles,
                    restent annoncées — et le plan RÉEL, lui, n'est pas touché :
                    « Je l'ai retirée » supprime exactement comme avant. */}
                {renderCrossPostConsequences(horsLigne?{...plan,online:(plan?.online??[]).filter(j=>j.platform!=='vinted')}:plan)}
                {horsLigne?(
                  /* ── Question posée AVANT la suppression (2026-08-10) ──────────
                     On ne conclut rien : ni vente, ni retrait. « Vendue » part
                     par le MÊME chemin que le bandeau (check-listing-status →
                     orchestrateSale) ; les deux autres réponses suppriment
                     exactement comme avant. Le prix reste éditable même quand
                     Vinted dit « vendue » : il n'expose jamais le montant d'une
                     offre acceptée (seulement le prix demandé). */
                  <div style={{background:"#F0FDF9",border:"1px solid #99E2D0",borderRadius:14,padding:"13px 14px",marginBottom:16,display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{fontSize:12.5,lineHeight:1.5,color:"#134E4A"}}>
                      {lang==='fr'
                        ?<>Avant de supprimer : <strong>tu l'as vendue ?</strong> Sans réponse, ce chiffre d'affaires ne sera compté nulle part.</>
                        :<>Before deleting: <strong>did you sell it?</strong> Without an answer, this revenue won't be counted anywhere.</>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <label style={{fontSize:12.5,color:"#134E4A",fontWeight:600}}>
                        {lang==='fr'?'Prix de vente':'Sale price'}
                      </label>
                      <input type="text" inputMode="decimal" disabled={busy}
                        value={venteSuppr.prix??(()=>{const d=sonde?.prix??jobV?.price;return d!=null?String(d):'';})()}
                        onChange={e=>setVenteSuppr(v=>({...v,prix:e.target.value,err:null}))}
                        style={{width:90,padding:"7px 10px",borderRadius:10,border:"1px solid #99E2D0",background:"#fff",color:UI.ink,fontSize:14,fontWeight:700,fontFamily:"inherit"}}/>
                      <span style={{fontSize:12.5,color:"#134E4A"}}>{currency==='EUR'?'€':currency}</span>
                    </div>
                    {/* PRIX D'ACHAT — même règle et même porte de sortie qu'au
                        bandeau : sans « je ne sais plus », les gens inventent un
                        chiffre et toutes les marges deviennent du bruit. */}
                    {/* Item RELU dans `items` : `deleteConfirm.item` est un
                        instantané figé à l'ouverture — après « Je ne sais plus »
                        il porterait encore l'ancien état et la question
                        resterait affichée. */}
                    {(()=>{const live=items.find(i=>String(i.id)===String(item.id))??item;
                      return !prixAchatConnu(live)&&!live?.prix_achat_inconnu;})()&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <label style={{fontSize:12.5,color:"#134E4A",fontWeight:600}}>
                          {lang==='fr'?"Tu l'avais payé combien ?":'What did you pay for it?'}
                        </label>
                        <input type="text" inputMode="decimal" disabled={busy}
                          value={venteSuppr.achat??''}
                          onChange={e=>setVenteSuppr(v=>({...v,achat:e.target.value}))}
                          style={{width:90,padding:"7px 10px",borderRadius:10,border:"1px solid #99E2D0",background:"#fff",color:UI.ink,fontSize:14,fontWeight:700,fontFamily:"inherit"}}/>
                        <span style={{fontSize:12.5,color:"#134E4A"}}>{currency==='EUR'?'€':currency}</span>
                        <button type="button" disabled={busy} onClick={async()=>{
                          setVenteSuppr(v=>({...v,achat:''}));
                          await supabase.from('inventaire').update({prix_achat_inconnu:true})
                            .eq('id',item.id).eq('user_id',user.id);
                          setItems(prev=>prev.map(i=>String(i.id)===String(item.id)?{...i,prix_achat_inconnu:true}:i));
                        }} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${UI.border}`,background:"transparent",color:UI.mute2,fontSize:12,fontWeight:600,cursor:busy?"default":"pointer",fontFamily:"inherit"}}>
                          {lang==='fr'?'Je ne sais plus':"I don't remember"}
                        </button>
                      </div>
                    )}
                    {venteSuppr.err&&(
                      <div style={{fontSize:12,color:UI.negative,fontWeight:600}}>{venteSuppr.err}</div>
                    )}
                  </div>
                ):sonde?.statut==='encours'?(
                  /* Non bloquant : les boutons ci-dessous restent utilisables.
                     Si l'utilisateur supprime avant la réponse, il obtient
                     exactement le comportement d'avant. */
                  <div style={{fontSize:11.5,color:UI.mute2,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{width:5,height:5,borderRadius:"50%",background:UI.mute2,flex:"0 0 auto"}}/>
                    {lang==='fr'?"Vérification de l'annonce Vinted…":'Checking the Vinted listing…'}
                  </div>
                ):null}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {horsLigne?(
                    <>
                      <button disabled={busy} onClick={()=>confirmerVenteAvantSuppression(item,jobV)}
                        style={{width:"100%",padding:"12px",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,border:"none",borderRadius:14,fontSize:13,fontWeight:700,color:"#fff",cursor:busy?"default":"pointer",opacity:busy?.6:1,fontFamily:"inherit",textAlign:"left"}}>
                        {busy?(lang==='fr'?'Enregistrement…':'Recording…'):(lang==='fr'?'🎉 Vendue — enregistrer et supprimer':'🎉 Sold — record and delete')}
                        <div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:2}}>
                          {lang==='fr'?'La vente reste dans le tableau de bord':'The sale stays in the dashboard'}
                        </div>
                      </button>
                      {/* « Retirée » et « Je ne sais pas » mènent au MÊME code :
                          le comportement d'avant, à l'identique. Deux libellés
                          quand même — ce sont deux affirmations différentes, et
                          forcer quelqu'un à dire « je l'ai retirée » quand il ne
                          sait pas, c'est fabriquer une réponse fausse. Aucune des
                          deux n'écrit quoi que ce soit de plus. */}
                      <button disabled={busy} onClick={supprimerCommeAvant}
                        style={{width:"100%",padding:"12px",background:UI.chip,border:`1px solid ${UI.border}`,borderRadius:14,fontSize:13,fontWeight:600,color:UI.ink,cursor:busy?"default":"pointer",fontFamily:"inherit",textAlign:"left"}}>
                        {lang==='fr'?"Je l'ai retirée":'I removed it'}
                      </button>
                      <button disabled={busy} onClick={supprimerCommeAvant}
                        style={{width:"100%",padding:"12px",background:UI.chip,border:`1px solid ${UI.border}`,borderRadius:14,fontSize:13,fontWeight:600,color:UI.mute2,cursor:busy?"default":"pointer",fontFamily:"inherit",textAlign:"left"}}>
                        {lang==='fr'?'Je ne sais pas':"I don't know"}
                        <div style={{fontSize:11,fontWeight:400,color:UI.mute2,opacity:0.85,marginTop:2}}>
                          {lang==='fr'?'Aucune vente enregistrée':'No sale recorded'}
                        </div>
                      </button>
                    </>
                  ):(
                    <button onClick={supprimerCommeAvant} style={{width:"100%",padding:"12px",background:`${UI.negative}0F`,border:`1px solid ${UI.negative}66`,borderRadius:14,fontSize:13,fontWeight:600,color:UI.negative,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                      {lang==='fr'?'🗑️ Retirer les annonces et supprimer':'🗑️ Remove listings and delete'}
                      <div style={{fontSize:11,fontWeight:400,color:UI.negative,opacity:0.8,marginTop:2}}>
                        {lang==='fr'?'Le retrait part en tâche de fond, puis l\'article est supprimé':'Removal runs in the background, then the item is deleted'}
                      </div>
                    </button>
                  )}
                  <SecondaryButton onClick={()=>setDeleteConfirm(null)} style={{padding:10}}>
                    {lang==='fr'?'Annuler':'Cancel'}
                  </SecondaryButton>
                </div>
              </>
              );
            })()}
            {deleteConfirm.type==='planError'&&(
              <>
                <div style={{fontSize:13,color:"#6B7280",marginBottom:20,lineHeight:1.5}}>
                  {lang==='fr'
                    ?`Impossible de vérifier si cet article a des annonces en ligne. Rien n'a été supprimé — réessaie dans un instant.`
                    :`Couldn't check whether this item has live listings. Nothing was deleted — try again shortly.`}
                  <div style={{fontWeight:700,color:"#0D0D0D",marginTop:6}}>{deleteConfirm.item?.title}</div>
                </div>
                <SecondaryButton onClick={()=>setDeleteConfirm(null)} style={{padding:10,width:"100%"}}>
                  {lang==='fr'?'Fermer':'Close'}
                </SecondaryButton>
              </>
            )}
            {deleteConfirm.type==='sale'&&(
              <>
                <div style={{fontSize:13,color:"#6B7280",marginBottom:20,lineHeight:1.5}}>
                  {lang==='fr'
                    ?'Cette vente sera supprimée définitivement et le profit retiré du tableau de bord.'
                    :'This sale will be permanently deleted and the profit removed from the dashboard.'}
                  {deleteConfirm.sale?.title&&<div style={{fontWeight:700,color:"#0D0D0D",marginTop:6}}>{deleteConfirm.sale.title}</div>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async()=>{
                    await supabase.from('ventes').delete().eq('id',deleteConfirm.sale.id);
                    await fetchAll(user.id);
                    setDeleteConfirm(null);
                  }} style={{flex:1,padding:"12px",background:UI.negative,border:"none",borderRadius:999,fontSize:13,fontWeight:600,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'?'Confirmer':'Confirm'}
                  </button>
                  <SecondaryButton onClick={()=>setDeleteConfirm(null)} style={{flex:1,width:"auto",padding:12}}>
                    {lang==='fr'?'Annuler':'Cancel'}
                  </SecondaryButton>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Toast message={toast.message} visible={toast.visible}/>

      <div className="bnav" style={{ position:"fixed", bottom:0, left:0, right:0, justifyContent:"center", zIndex:50, paddingBottom:"calc(env(safe-area-inset-bottom,0px) + 14px)" }}>
        <div style={{ position:"relative", display:"flex", alignItems:"flex-end", gap:4, padding:"10px 10px 10px", borderRadius:26, background:"rgba(255,255,255,0.72)", backdropFilter:"blur(18px) saturate(1.6)", WebkitBackdropFilter:"blur(18px) saturate(1.6)", border:"1px solid #E7E3D8", boxShadow:"0 12px 32px rgba(16,32,27,0.10), 0 2px 8px rgba(16,32,27,0.05)" }}>
          {TABS_MOBILE.map(tm=>{
            const { Icon } = tm;
            const isActive = tab===tm.idx;
            const isLens = tm.idx===2;
            const onClick = ()=>{setTab(tm.idx);localStorage.setItem('tab',tm.idx);};

            if (isLens) {
              return (
                <button key={tm.idx} onClick={onClick} style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center", width:60, background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit" }}>
                  <span style={{
                    position:"absolute", top:-26, width:52, height:52, borderRadius:"50%",
                    background:"linear-gradient(155deg,#2F9E90,#1B6E62)",
                    boxShadow: isActive ? "0 8px 22px rgba(47,158,144,0.45), 0 0 0 5px #F6F5F1" : "0 6px 16px rgba(47,158,144,0.32), 0 0 0 5px #F6F5F1",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    transition:"transform 0.2s ease",
                    transform: isActive ? "scale(1.04)" : "scale(1)",
                  }}>
                    <Icon size={22} color="#FFFFFF" strokeWidth={1.9} />
                  </span>
                  <span style={{ height:30 }} />
                  <span style={{ fontSize:10, fontWeight:600, color: isActive ? "#2F9E90" : "#8A8578" }}>{tm.label}</span>
                </button>
              );
            }

            return (
              <button key={tm.idx} onClick={onClick} style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"4px 0", width:60, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>
                <div style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center", width:34, height:30 }}>
                  {isActive && <span style={{ position:"absolute", inset:0, borderRadius:12, background:"rgba(47,158,144,0.10)" }} />}
                  <Icon size={17} color={isActive ? "#2F9E90" : "#A6A192"} strokeWidth={isActive ? 2.1 : 1.7} />
                </div>
                <span style={{ fontSize:10, fontWeight:500, color: isActive ? "#2F9E90" : "#8A8578" }}>{tm.label}</span>
                {isActive && <span style={{ position:"absolute", bottom:-3, width:3, height:3, borderRadius:"50%", background:"#2F9E90" }} />}
              </button>
            );
          })}
        </div>
      </div>

      <VoiceAssistant
        items={items} sales={sales} lang={lang} currency={currency}
        userCountry={userCountry}
        actions={vaActions}
        vaStep={vaStep} setVaStep={setVaStep}
        vaResults={vaResults} setVaResults={setVaResults}
        vaError={vaError} setVaError={setVaError}
        markSold={markSold}
        deleteItem={delItem}
        triggerRef={fabTriggerRef}
        isPremium={isPremium}
        user={user}
        voiceUsedToday={voiceUsedToday}
        setVoiceUsedToday={setVoiceUsedToday}
        ouvrirModalePlafondVoix={()=>ouvrirModalePlafond('plafond_voix',{trigger:'voice'})}
        // FAB_VOCAL_MASQUE (2026-08-11) : le FAB est retiré de l'interface.
        // L'expression d'origine est conservée intacte derrière — repasser la
        // constante à false (déclarée au-dessus de FabVocal) suffit à le rendre.
        hideFab={FAB_VOCAL_MASQUE || listingStepperOpen || tab===1}
      />


      {/* ── BUG REPORT MODAL ── */}
      {showBugReport&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:10000,display:"flex",alignItems:"flex-end"}} onClick={()=>setShowBugReport(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",padding:"24px 20px 32px",animation:"slideUpModal 0.3s cubic-bezier(0.22,1,0.36,1)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:700,color:"#0D0D0D"}}>{lang==='fr'?'Signaler un bug 🐛':'Report a bug 🐛'}</div>
              <IconButton onClick={()=>setShowBugReport(false)} icon={X} size={32} bg={UI.chip} iconColor={UI.mute2} />
            </div>
            <textarea
              value={bugMessage}
              onChange={e=>setBugMessage(e.target.value)}
              placeholder={lang==='fr'?'Décris le problème rencontré...':'Describe the issue...'}
              style={{width:"100%",minHeight:100,borderRadius:10,border:"1px solid #E5E7EB",padding:10,fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",color:"#111827"}}
            />
            <PrimaryButton
              onClick={async()=>{
                if(!bugMessage.trim())return;
                setBugSending(true);
                try{
                  // ⚠️ 2026-08-09 : cet appel partait avec le SEUL header
                  // apikey. send-bug-report exige un Bearer utilisateur
                  // (getUser) depuis le 15/05 22h54 — le contrôle a été ajouté
                  // 66 minutes après la mise en ligne de la modale, sans
                  // toucher l'appelant. Constaté en prod : POST avec apikey
                  // seul → 401 {"error":"Unauthorized"}. AUCUN rapport de bug
                  // n'est arrivé depuis. Même patron que
                  // handleCancelSubscription / delete-account : session lue,
                  // Bearer posé.
                  const{data:{session}}=await supabase.auth.getSession();
                  const jwt=session?.access_token;
                  // Session morte (expirée, refresh raté) : on ne tente rien —
                  // un 401 déguisé en « erreur d'envoi » n'apprend rien à
                  // l'utilisateur, qui a une action concrète à faire.
                  if(!jwt){
                    setToast({visible:true,message:lang==='fr'?'Ta session a expiré — reconnecte-toi puis réessaie':'Your session expired — sign in again then retry'});
                    setTimeout(()=>setToast({visible:false,message:""}),5000);
                    return;
                  }
                  const res=await fetch(`${supabaseUrl}/functions/v1/send-bug-report`,{
                    method:"POST",
                    headers:{"Content-Type":"application/json","Authorization":`Bearer ${jwt}`,"apikey":supabaseAnonKey},
                    body:JSON.stringify({message:bugMessage.trim(),userEmail:user?.email,platform:platform,userId:user?.id}),
                  });
                  if(!res.ok)throw new Error("send error");
                  setShowBugReport(false);setBugMessage("");
                  setToast({visible:true,message:lang==='fr'?'Merci ! On regarde ça rapidement 🙏':'Thanks! We\'ll look into it 🙏'});
                  setTimeout(()=>setToast({visible:false,message:""}),4000);
                }catch{
                  // La modale reste ouverte et le texte saisi est conservé :
                  // l'échec ne doit rien faire perdre. L'adresse de repli est
                  // nommée — « réessaie » seul enferme quand ça retombe.
                  setToast({visible:true,message:lang==='fr'?'Envoi impossible. Réessaie, ou écris à support@fillsell.app':'Couldn\'t send. Try again, or email support@fillsell.app'});
                  setTimeout(()=>setToast({visible:false,message:""}),6000);
                }finally{setBugSending(false);}
              }}
              disabled={bugSending||!bugMessage.trim()}
              style={{marginTop:12}}
            >
              {bugSending?"...":(lang==='fr'?'Envoyer →':'Send →')}
            </PrimaryButton>
            <button onClick={()=>setShowBugReport(false)} style={{display:"block",width:"100%",marginTop:12,background:"none",border:"none",color:UI.mute,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",padding:4}}>
              {lang==='fr'?'Annuler':'Cancel'}
            </button>
          </div>
        </div>
      )}

      {showOnboardingFlow&&user&&(
        <OnboardingFlow
          lang={lang}
          user={user}
          demanderPseudo={demanderPseudo}
          onUsername={(nom)=>setUsername(nom)}
          onDone={(dest)=>{
            onboardingFiniRef.current=true;
            setShowOnboardingFlow(false);
            if(dest==='lens'){setTab(2);localStorage.setItem('tab',2);}
            else{setTab(1);localStorage.setItem('tab',1);}
          }}
        />
      )}
      {showExtensionInfo&&(
        <ExtensionPitchScreen
          lang={lang}
          onClose={()=>setShowExtensionInfo(false)}
          supabase={supabase}
          userId={user?.id??null}
          onExtensionSeen={()=>setShowExtensionInfo(false)}
        />
      )}
    </div>
  );
}
