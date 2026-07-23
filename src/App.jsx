import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarChart3, Bot, Aperture, ClipboardList, LineChart, X, Eye, EyeOff } from 'lucide-react';
const AppleSignIn = registerPlugin('AppleSignIn');
import { Browser } from '@capacitor/browser';
import { App as CapacitorApp } from '@capacitor/app';
import { initIAP, purchasePremium, restorePurchases, listenCoinTransactionUpdates, PRODUCT_IDS } from './lib/iap';
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
import Toast from './components/Toast';
import ConversionModal from './components/ConversionModal';
import StatsPage from './pages/StatsPage';
import { useTranslation } from './i18n/useTranslation';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { executeVoiceTasks, groupSellLots } from './utils/voiceEngine';
// detectType + normalizeMarque : source de vérité UNIQUE dans utils/shared.js
// (l'ancienne copie locale a fait survivre le bug Ralph Lauren→Luxe ; unifié 2026-07-17).
import { detectType, normalizeMarque } from './utils/shared';
import StockTab from './tabs/StockTab';
import LensTab from './tabs/LensTab';
import VentesTab from './tabs/VentesTab';
import StatsTab from './tabs/StatsTab';
import DashboardTab from './tabs/DashboardTab';
import { UI, Eyebrow, PrimaryButton, PremiumButton, SecondaryButton, IconButton, Loader, SegmentedPills } from './components/ui';
import CoinStoreModal from './components/CoinStoreModal';
import PepiteIcon from './components/PepiteIcon';
import PlatformLogo from './components/platform-logos/PlatformLogo';
import PlanBadge from './components/PlanBadge';
import PlanDetailsModal from './components/PlanDetailsModal';
import { useIsMobile } from './hooks/useIsMobile';
import BrandMark from './components/BrandMark';
import { VoiceSheet, VoiceThinking, FloatingBubble } from './components/voice/VoiceKit';
import { VOICE_KIT_CSS } from './components/voice/tokens';
import VoiceResultCard from './components/voice/VoiceResultCard';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);
ChartJS.defaults.font.family = "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif";
import './App.css';
import './App.redesign.css';

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const VOICE_FREE_LIMIT = 5;

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
function suggestCurrency(){
  const nl=(navigator.language||'fr').toLowerCase();
  const exact={'en-gb':'GBP','en-us':'USD','en-ca':'CAD','en-au':'AUD','en-nz':'NZD','en-sg':'SGD','en-za':'ZAR','en-ng':'NGN','en-ke':'KES','en-gh':'GHS','en-ph':'PHP','en-in':'INR','en-pk':'PKR','pt-br':'BRL','pt-pt':'EUR','pt-mz':'MZN','es-mx':'MXN','es-ar':'ARS','es-cl':'CLP','es-co':'COP','es-pe':'PEN','es-uy':'UYU','es-py':'PYG','es-bo':'BOB','es-cr':'CRC','es-gt':'GTQ','es-hn':'HNL','es-ni':'NIO','es-pa':'PAB','es-do':'DOP','es-ve':'VES','fr-ch':'CHF','de-ch':'CHF','it-ch':'CHF','zh-cn':'CNY','zh-tw':'TWD','zh-hk':'HKD','ar-sa':'SAR','ar-ae':'AED','ar-kw':'KWD','ar-bh':'BHD','ar-om':'OMR','ar-qa':'QAR','ar-jo':'JOD','ar-iq':'IQD','ar-eg':'EGP','ar-ma':'MAD','ar-tn':'TND','ar-dz':'DZD','ar-ly':'LYD','ar-sd':'SDG','ar-lb':'LBP','ar-sy':'SYP','ar-ye':'YER'};
  if(exact[nl]) return exact[nl];
  const prefix=nl.split('-')[0];
  const byPrefix={'ja':'JPY','ko':'KRW','zh':'CNY','th':'THB','vi':'VND','id':'IDR','ms':'MYR','hi':'INR','ur':'PKR','bn':'BDT','si':'LKR','ne':'NPR','my':'MMK','km':'KHR','lo':'LAK','mn':'MNT','kk':'KZT','uz':'UZS','ky':'KGS','tg':'TJS','tk':'TMT','tr':'TRY','ru':'RUB','uk':'UAH','be':'BYN','az':'AZN','ka':'GEL','hy':'AMD','he':'ILS','fa':'IRR','pl':'PLN','cs':'CZK','hu':'HUF','ro':'RON','hr':'HRK','bg':'BGN','sr':'RSD','is':'ISK','sq':'ALL','mk':'MKD','bs':'BAM','sv':'SEK','no':'NOK','nb':'NOK','nn':'NOK','da':'DKK','sw':'KES','am':'ETB','af':'ZAR','so':'SOS'};
  return byPrefix[prefix]||'EUR';
}
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
function CurrencyOnboardingModal({lang,onConfirm}){
  const [selected,setSelected]=useState(suggestCurrency());
  const [search,setSearch]=useState('');
  const [usernameInput,setUsernameInput]=useState('');
  const REGION_LABELS={Europe:'Europe',America:lang==='en'?'Americas':'Amériques',Africa:lang==='en'?'Africa':'Afrique','Asia/Pacific':lang==='en'?'Asia & Pacific':'Asie & Pacifique'};
  const q=search.trim().toLowerCase();
  const filtered=q?CURRENCIES_LIST.filter(c=>c.code.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.sym.toLowerCase().includes(q)):CURRENCIES_LIST;
  const grouped=filtered.reduce((acc,c)=>{(acc[c.reg]||(acc[c.reg]=[])).push(c);return acc;},{});
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',boxSizing:'border-box'}}>
      <div style={{background:'#fff',borderRadius:24,padding:'20px',maxWidth:400,width:'100%',boxShadow:'0 24px 64px rgba(0,0,0,0.22)',boxSizing:'border-box',maxHeight:'88vh',display:'flex',flexDirection:'column'}}>
        <div style={{fontSize:24,textAlign:'center',marginBottom:4}}>💱</div>
        <div style={{fontSize:18,fontWeight:700,textAlign:'center',marginBottom:3,color:UI.ink,letterSpacing:'-0.02em'}}>
          {lang==='en'?'Choose your currency':'Choisissez votre devise'}
        </div>
        <div style={{fontSize:11,color:UI.mute2,textAlign:'center',marginBottom:12}}>
          {lang==='en'?'Display only — no conversion.':'Affichage uniquement, aucune conversion.'}
        </div>
        <input placeholder={lang==='en'?'Search: USD, Dollar…':'Rechercher : EUR, Euro…'} value={search} onChange={e=>setSearch(e.target.value)}
          style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.14)',fontSize:16,fontFamily:'inherit',outline:'none',marginBottom:10}}/>
        <div style={{overflowY:'auto',flex:1}}>
          {['Europe','America','Africa','Asia/Pacific'].map(reg=>{
            const items=grouped[reg];
            if(!items||items.length===0) return null;
            return(
              <div key={reg}>
                <div style={{fontSize:9,fontWeight:700,color:UI.mute,textTransform:'uppercase',letterSpacing:'0.1em',padding:'8px 2px 4px'}}>{REGION_LABELS[reg]}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginBottom:4}}>
                  {items.map(c=>(
                    <button key={c.code} onClick={()=>setSelected(c.code)}
                      style={{padding:'7px 4px',borderRadius:11,border:selected===c.code?`1.5px solid ${UI.teal}`:`1px solid ${UI.border}`,background:selected===c.code?'#E7F3F0':UI.chip,cursor:'pointer',transition:'all 0.1s',fontFamily:'inherit',textAlign:'center',lineHeight:1.25}}>
                      <div style={{fontSize:11,fontWeight:700,color:selected===c.code?UI.tealDeep:UI.ink}}>{c.code}</div>
                      <div style={{fontSize:10,color:selected===c.code?UI.tealDeep:UI.mute2}}>{c.sym}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:12,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,color:UI.mute2,marginBottom:6}}>{lang==='en'?"What's your name? (optional)":"Comment tu t'appelles ? (optionnel)"}</div>
          <input
            value={usernameInput}
            onChange={e=>setUsernameInput(e.target.value.slice(0,30))}
            placeholder={lang==='en'?'First name or nickname…':'Prénom ou pseudo…'}
            maxLength={30}
            style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.14)',fontSize:16,fontFamily:'inherit',outline:'none',marginBottom:10}}
          />
        </div>
        <PrimaryButton onClick={()=>onConfirm(selected,usernameInput.trim())} style={{flexShrink:0}}>
          {selected} {CURRENCY_SYMBOLS[selected]} — {lang==='en'?'Confirm':'Confirmer'}
        </PrimaryButton>
      </div>
    </div>
  );
}
function UsernameOnboardingInput({lang,onConfirm}){
  const [val,setVal]=useState('');
  return(
    <>
      <input value={val} onChange={e=>setVal(e.target.value.slice(0,30))} maxLength={30}
        placeholder={lang==='en'?'First name or nickname…':'Prénom ou pseudo…'}
        style={{width:'100%',boxSizing:'border-box',padding:'12px 14px',borderRadius:12,border:'1.5px solid rgba(0,0,0,0.14)',fontSize:16,fontFamily:'inherit',outline:'none',marginBottom:16,textAlign:'center'}}/>
      <PrimaryButton onClick={()=>onConfirm(val.trim())}>
        {lang==='en'?"Let's go !":"C'est parti !"}
      </PrimaryButton>
    </>
  );
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
    await supabase.from('profiles')
      .update({ [field_count]: 0, [field_date]: today })
      .eq('id', userId);
  }
  return currentCount;
}

// Libellés des mouvements du ledger de Pépites (Settings)
const COIN_KIND_LABELS={
  grant_monthly:{fr:'Pépites du mois',en:'Monthly Nuggets'},
  purchase:{fr:'Pack acheté',en:'Pack purchased'},
  spend_publish:{fr:'Publication',en:'Publish'},
  spend_lens:{fr:'Analyse Lens',en:'Lens scan'},
  refund:{fr:'Remboursement',en:'Refund'},
  admin:{fr:'Ajustement',en:'Adjustment'},
};

function PremiumBanner({ userEmail, compact=false, onDark=false, source='banner', onOpenModal=null, label=null }){
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
      alert(lang==='en'?`Error: ${e.message}`:`Erreur : ${e.message}`);
      setLoading(false);
    }
  }

  if(compact){
    const bg=onDark?(loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)"):(loading?"#E5E7EB":"#2F9E90");
    const bgHover=onDark?"rgba(255,255,255,0.3)":"#1B6E62";
    const bgLeave=onDark?(loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)"):(loading?"#E5E7EB":"#2F9E90");
    const col=onDark?"#fff":"#fff";
    const brd=onDark?"1px solid rgba(255,255,255,0.4)":"none";
    return(
      <button onClick={onOpenModal??handleCheckout} disabled={loading}
        style={{padding:"6px 12px",background:bg,color:col,border:brd,borderRadius:99,fontSize:11,fontWeight:700,cursor:loading?"not-allowed":"pointer",transition:"all 0.15s",whiteSpace:"nowrap",flexShrink:0}}
        onMouseEnter={e=>{if(!loading)e.currentTarget.style.background=bgHover;}}
        onMouseLeave={e=>{e.currentTarget.style.background=bgLeave;}}
      >
        {loading ? "..." : <><span className="premium-short">✨ Upgrade</span><span className="premium-full">{lang==='fr'?'✨ Upgrade →':'✨ Upgrade →'}</span></>}
      </button>
    );
  }

  return(
    <div style={{background:"linear-gradient(135deg,#2F9E9008,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <CtaPremium
        onClick={onOpenModal??handleCheckout}
        label={loading ? tb('redirection') : (label ?? (lang==='fr'?'✨ Passer Premium · 12,99 €/mois':'✨ Upgrade to Premium · €12.99/mo'))}
        disabled={loading}
        sub={lang==='fr'?'Sans engagement · Résiliable en 1 clic':'No commitment · Cancel anytime in 1 click'}
      />
    </div>
  );
}

function IAPUpgradeBlock({ lang, iapProduct, iapLoading, onPurchase, onRestore, label=null }) {
  return (
    <div style={{background:"linear-gradient(135deg,#2F9E9008,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:11,fontWeight:700,background:"rgba(47,158,144,0.08)",color:"#1B6E62",borderRadius:99,padding:"4px 12px",border:"1px solid rgba(47,158,144,0.18)"}}>
        ✨ {lang==='fr'?'Stock illimité · IA vocale · Stats':'Unlimited stock · Voice AI · Stats'}
      </div>
      <CtaPremium
        onClick={onPurchase}
        label={iapLoading?(lang==='fr'?'Chargement...':'Loading...'):(label ?? (lang==='fr'?'✨ Passer Premium →':'✨ Go Premium →'))}
        disabled={iapLoading}
        sub={iapProduct
          ?(lang==='fr'?`${iapProduct.priceString}/mois · Sans engagement.`:`${iapProduct.priceString}/month · No commitment.`)
          :(lang==='fr'?'12,99 €/mois · Sans engagement.':'€12.99/month · No commitment.')}
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

function CtaPremium({ onClick, label = "✨ Passer Premium →", disabled, sub }) {
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
function mapItem(v){return{id:v.id,title:v.titre,prix_achat:v.prix_achat,buy:v.prix_achat,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date,date_ajout:v.created_at||v.date_achat||v.date,marque:v.marque||"",description:v.description||"",type:v.type||"Autre",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,quantite:v.quantite||1,emplacement:v.emplacement||null,plateforme:v.plateforme||null};}

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
function mapSale(v){return{id:v.id,title:v.titre,prix_vente:v.prix_vente,buy:v.prix_achat,sell:v.prix_vente,ship:0,margin:v.benefice,marginPct:v.prix_vente>0?(v.benefice/v.prix_vente)*100:0,date:v.date,date_vente:v.date||v.created_at,marque:v.marque||"",type:v.type||"",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,description:v.description||null,emplacement:v.emplacement||null,plateforme:v.plateforme||null,quantite:v.quantite||null};}

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
      last.margin=(last.margin||0)+(s.margin||0);
      last.marginPct=(last.sell||0)>0?(last.margin/(last.sell*last._qty))*100:0;
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
  function dayBucket(days){
    return Array.from({length:days},(_,i)=>{
      const d=new Date(now); d.setDate(now.getDate()-days+1+i);
      const dayStr=d.toISOString().split('T')[0];
      const ds=salesData.filter(s=>(s.date||'').startsWith(dayStr));
      return{name:`${d.getDate()}/${d.getMonth()+1}`,profit:ds.reduce((a,s)=>a+s.margin,0),'Marge %':ds.length?ds.reduce((a,s)=>a+s.marginPct,0)/ds.length:null,count:ds.length};
    });
  }
  function weekBucket(totalDays,numWeeks){
    const cutoff=new Date(now); cutoff.setDate(now.getDate()-totalDays+1);
    const filtered=salesData.filter(s=>new Date(s.date)>=cutoff);
    return Array.from({length:numWeeks},(_,i)=>{
      const start=new Date(cutoff); start.setDate(cutoff.getDate()+i*7);
      const end=new Date(start); end.setDate(start.getDate()+6);
      const ws=filtered.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end;});
      return{name:`S${i+1}`,profit:ws.reduce((a,s)=>a+s.margin,0),'Marge %':ws.length?ws.reduce((a,s)=>a+s.marginPct,0)/ws.length:null,count:ws.length};
    });
  }
  function monthBucket(pts){
    return Array.from({length:pts},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(pts-1-i),1);
      const m=d.getMonth(); const y=d.getFullYear();
      const ms=salesData.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===m&&sd.getFullYear()===y;});
      return{name:MONTHS_FR[m],profit:ms.reduce((a,s)=>a+s.margin,0),'Marge %':ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:null,count:ms.length};
    });
  }
  function ytdBucket(){
    const n=now.getMonth()+1;
    return Array.from({length:n},(_,i)=>{
      const ms=salesData.filter(s=>{const sd=new Date(s.date);return sd.getMonth()===i&&sd.getFullYear()===now.getFullYear();});
      return{name:MONTHS_FR[i],profit:ms.reduce((a,s)=>a+s.margin,0),'Marge %':ms.length?ms.reduce((a,s)=>a+s.marginPct,0)/ms.length:null,count:ms.length};
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
function EmptyStateDashboard({ lang, onTryVoice, onOpenLens }) {
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
      titleFr:"Vendu quelque part, retiré partout", titleEn:"Sold somewhere, removed everywhere",
      descFr:"Vendu sur Vinted ? Retiré de Leboncoin, eBay et Beebs aussitôt.", descEn:"Sold on Vinted? Removed from Leboncoin, eBay and Beebs right away.",
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
          <div style={{position:"relative",width:80,height:80,margin:"0 auto 20px"}}>
            <span style={{position:"absolute",inset:0,borderRadius:24,background:"rgba(47,158,144,0.28)",animation:"fsPulse 2.6s ease-out infinite"}}/>
            <span style={{position:"absolute",inset:0,borderRadius:24,background:"rgba(47,158,144,0.28)",animation:"fsPulse 2.6s ease-out infinite",animationDelay:"1.3s"}}/>
            <div style={{position:"relative",width:80,height:80,borderRadius:24,background:`linear-gradient(150deg,${UI.teal},${UI.tealDeep})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 10px 24px rgba(27,110,98,0.35)"}}>
              <MicSvg/>
            </div>
          </div>
          <h1 style={{margin:0,fontWeight:700,fontSize:27,lineHeight:1.15,letterSpacing:"-0.02em",color:UI.ink}}>{fr?"Parle, l'IA fait le reste.":"Talk, the AI does the rest."}</h1>
          <p style={{margin:"12px auto 0",maxWidth:284,fontSize:15,lineHeight:1.5,color:UI.mute,fontWeight:400}}>
            {fr
              ? <>Dis « J'ai payé ce jean 8 € » — l'IA l'ajoute, le classe et le range. <span style={{color:UI.tealDeep,fontWeight:600}}>Zéro formulaire.</span></>
              : <>Say “I paid €8 for these jeans” — the AI adds, sorts and stores it. <span style={{color:UI.tealDeep,fontWeight:600}}>Zero forms.</span></>
            }
          </p>
          <div
            onClick={onTryVoice}
            role="button"
            style={{display:"flex",alignItems:"center",gap:10,marginTop:20,background:UI.canvas,border:`1px solid ${UI.border}`,borderRadius:16,padding:"15px 14px",cursor:"pointer"}}
          >
            <span style={{fontWeight:700,fontSize:22,color:UI.teal,lineHeight:0.6}}>«</span>
            <span style={{flex:1,textAlign:"left",fontStyle:"italic",fontWeight:500,fontSize:15,color:"#6E6A5E"}}>{fr?"J'ai vendu mon…":"I sold my…"}</span>
            <span style={{fontWeight:700,fontSize:10,letterSpacing:"0.08em",color:"#C46A3E",background:"rgba(232,149,109,0.18)",padding:"5px 9px",borderRadius:8}}>{fr?"VENDRE":"SELL"}</span>
          </div>
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
          {fr?"Une annonce, publiée partout. Vendu ? Ton stock, tes ventes et tes marges se mettent à jour tout seuls.":"One listing, published everywhere. Sold? Your stock, sales and margins update on their own."}
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
              ? <>Prends un article en photo : l'IA l'identifie, estime <span style={{color:UI.tealDeep,fontWeight:600}}>son prix de revente</span> et la meilleure plateforme, puis note le deal sur 10.</>
              : <>Snap a photo of an item: the AI identifies it, estimates <span style={{color:UI.tealDeep,fontWeight:600}}>its resale price</span> and the best platform, then rates the deal out of 10.</>
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
    </div>
  );
}

function PremiumWelcomeModal({ lang, onClose }) {
  const PERKS = lang === 'en'
    ? [
        { icon: '🎙️', label: 'AI Voice — Unlimited' },
        { icon: '📸', label: 'Lens Pro — 10/day · live market price' },
        { icon: '📦', label: 'Unlimited stock' },
        { icon: '📊', label: 'Advanced AI-powered stats' },
        { icon: '📤', label: 'Import / Export Excel' },
      ]
    : [
        { icon: '🎙️', label: 'IA vocale — Illimité' },
        { icon: '📸', label: 'Lens Pro — 10/jour · prix marché en direct' },
        { icon: '📦', label: 'Stock illimité' },
        { icon: '📊', label: 'Stats avancées analysées par IA' },
        { icon: '📤', label: 'Import / Export Excel' },
      ];
  const title = lang === 'en' ? 'Welcome to FillSell Premium' : 'Bienvenue dans FillSell Premium';
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
  return 'Autre';
}

const CAT_COLORS_MAP={
  'Mode':'#DB2777','High-Tech':'#2563EB','Luxe':'#D97706','Maison':'#16A34A',
  'Sport':'#7C3AED','Musique':'#9333EA','Beauté':'#EC4899','Collection':'#F59E0B',
  'Livres':'#84CC16','Auto-Moto':'#EF4444','Électroménager':'#06B6D4','Jouets':'#F97316',
  'Autre':'#6B7280',
};


function VoiceAssistant({items,sales,lang,currency='EUR',userCountry,actions,vaStep,setVaStep,vaResults,setVaResults,vaError,setVaError,markSold,deleteItem,triggerRef,isPremium=false,user=null,voiceUsedToday=0,setVoiceUsedToday,setConversionModal,hideFab=false}){
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
    const t=setTimeout(()=>setVaError(null),2000);
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
          setConversionModal({open:true,trigger:'voice'});
          setVaStep("");
          return;
        }
        // Incrément avant le fetch pour qu'Android accumule le compteur même si le réseau coupe
        const nextCount=voiceUsedToday+1;
        if(setVoiceUsedToday)setVoiceUsedToday(nextCount);
        supabase.from('profiles').update({voice_count_today:nextCount,voice_count_date:new Date().toISOString().split('T')[0]}).eq('id',user.id);
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
          if(!tRes.ok){const tErrJson=await tRes.json().catch(()=>({}));if(tErrJson?.error==='ai_unavailable'||tRes.status===503){setVoiceToast(lang==='fr'?'⏳ IA temporairement indisponible. Réessaie dans 30 secondes.':'⏳ AI temporarily unavailable. Please retry in 30 seconds.');setTimeout(()=>setVoiceToast(''),5000);setVaStep("");return;}if(tRes.status===429||tErrJson?.error==='quota_exceeded'){setConversionModal({open:true,trigger:'voice'});setVaStep("");return;}throw new Error(lang==="en"?"Transcription failed":"Transcription échouée");}
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
          if(!iRes.ok){const iErrJson=await iRes.json().catch(()=>({}));if(iErrJson?.error==='ai_unavailable'||iRes.status===503){setVoiceToast(lang==='fr'?'⏳ IA temporairement indisponible. Réessaie dans 30 secondes.':'⏳ AI temporarily unavailable. Please retry in 30 seconds.');setTimeout(()=>setVoiceToast(''),5000);setVaStep("");return;}if(iRes.status===429||iErrJson?.error==='quota_exceeded'){if(isPremium){const msg=iErrJson?.reason==='monthly_limit'?(lang==='fr'?'Limite mensuelle atteinte. Passez Premium pour continuer.':'Monthly limit reached. Upgrade to Premium to continue.'):(lang==='fr'?'Limite journalière atteinte. Revenez demain ou passez Premium.':'Daily limit reached. Come back tomorrow or upgrade to Premium.');setVoiceToast(`🔒 ${msg}`);setTimeout(()=>setVoiceToast(''),5000);}else{setConversionModal({open:true,trigger:'voice'});}setVaStep("");return;}throw new Error(lang==="en"?"Intent failed":"Erreur intention");}
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
  const [lensInventaireId,setLensInventaireId]=useState(null);
  const [listingStepperOpen,setListingStepperOpen]=useState(false);
  const [aiCache,setAiCache]=useState({});
  const [iapProduct,setIapProduct]=useState(null);
  const [iapLoading,setIapLoading]=useState(false);
  const [lang,setLang]=useState(()=>{
    const saved=localStorage.getItem('fs_lang');
    if(saved) return saved;
    const bl=(navigator.language||navigator.userLanguage||'fr').toLowerCase().split('-')[0];
    return bl==='fr'?'fr':'en';
  });
  const [currency,setCurrency]=useState(()=>localStorage.getItem('fs_currency')||'EUR');
  const [showCurrencyOnboarding,setShowCurrencyOnboarding]=useState(false);
  const [showUsernameOnboarding,setShowUsernameOnboarding]=useState(false);
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
  // Annonces que l'extension n'ARRIVE PLUS À VÉRIFIER (2026-07-13) : après 4
  // lectures indéterminées d'affilée (page anti-bot, format inattendu), elle
  // cesse d'insister et pose platform_fields.check_unresolved. RIEN de destructif
  // n'en découle — mais sans ce bandeau, l'annonce cessait d'être surveillée SANS
  // que personne ne le sache. C'est le trou que ce bandeau ferme : l'extension
  // continue de retenter une fois par jour, et si ça dure, on te le DIT.
  const [unverifiableListings,setUnverifiableListings]=useState([]);
  // Prix de vente confirmé par l'utilisateur, par job (pré-rempli avec le prix
  // de mise en ligne, MODIFIABLE : la vente a pu être négociée).
  const [salePriceDraft,setSalePriceDraft]=useState({});
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
  const [lensPremiumLimitReached,setLensPremiumLimitReached]=useState(false);
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
  const [lensUsedToday,setLensUsedToday]=useState(0);
  const [voiceUsedToday,setVoiceUsedToday]=useState(0);
  // Quota Lens Free : 5 analyses par MOIS (le plafond journalier a été retiré,
  // cf. lens-analysis). Le compteur affiché est mensuel.
  const LENS_FREE_LIMIT=5;
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
  const [voiceZoneOpen,setVoiceZoneOpen]=useState(true);
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

  const {t,tpl}=useTranslation(lang);
  const fmt = (amount, dec=null) => formatCurrency(amount, currency, dec);
  useEffect(()=>{localStorage.setItem('fs_lang',lang);},[lang]);
  useEffect(()=>{localStorage.setItem('fs_currency',currency);},[currency]);
  useEffect(()=>{if(!localStorage.getItem('fs_lang'))localStorage.setItem('fs_lang',lang);},[]);
  async function saveCurrency(code){
    setCurrency(code);
    localStorage.setItem('fs_currency',code);
    if(user?.id) await supabase.rpc('set_profile_currency',{p_currency:code});
  }
  // product : undefined → abonnement Premium standard ; 'pro' → abonnement Pro 29,99 €
  async function triggerCheckout(product){
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
      const res=await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':supabaseAnonKey},body:JSON.stringify({email:user.email,...(product==='pro'?{product:'pro'}:{})})});
      const body=await res.json();
      const{url,error}=body;
      if(error)throw new Error(error);
      track('begin_checkout', { currency: 'EUR', value: product==='pro'?29.99:12.99 });
      console.log('[checkout] redirecting to:', url);
      window.location.href=url;
    }catch(e){
      console.error('[checkout] error:', e);
      alert("Erreur : "+e.message);
    }
  }

  // tier : 'pro' → abonnement Pro (app.fillsell.pro.sub) ; toute autre valeur
  // (undefined, event de clic…) → Premium standard. Comparaison stricte voulue.
  async function handleIAPPurchase(tier){
    const isProPurchase=tier==='pro';
    console.log('[IAP] handleIAPPurchase started — platform:',platform,'tier:',isProPurchase?'pro':'premium');
    setIapLoading(true);
    // Programme Founder fermé aux nouveaux (2026-07) : jamais PRODUCT_IDS.sub ici.
    // Il reste référencé dans restorePurchases pour les Founders existants.
    const productId=isProPurchase?PRODUCT_IDS.pro:PRODUCT_IDS.standard;
    try{
      const {cancelled,purchaseToken}=await purchasePremium(productId,user.id);
      if(cancelled) return;
      if(platform==='android'){
        // Android : succès Play Billing côté client → écriture directe + sauvegarde du token
        // Le webhook Google Play gère les renouvellements ; le token ici couvre le 1er achat
        const updates={is_premium:true};
        if(isProPurchase) updates.is_pro=true;
        if(purchaseToken){updates.google_purchase_token=purchaseToken;updates.google_product_id=productId;}
        await supabase.from('profiles').update(updates).eq('id',user.id);
      } else {
        // iOS : attendre confirmation via webhook Apple
        let confirmed=false;
        for(let i=0;i<10;i++){
          await new Promise(r=>setTimeout(r,2000));
          const{data}=await supabase.from('profiles').select('is_premium').eq('id',user.id).single();
          if(data?.is_premium){confirmed=true;break;}
        }
        if(!confirmed) throw new Error('Premium not confirmed by server');
      }
      setIsPremium(true);
      if(isProPurchase) setIsPro(true);
      setShowPremiumWelcome(true);
    }catch(e){
      console.error('[IAP] purchase failed:',e);
      try{
        const{data}=await supabase.from('profiles').select('is_premium').eq('id',user.id).single();
        if(data?.is_premium){
          setIsPremium(true);
              setShowPremiumWelcome(true);
          return;
        }
      }catch{}
      const errMsg=e?.message||e?.code||String(e);
      setToast({visible:true,message:`❌ ${errMsg}`});
      setTimeout(()=>setToast({visible:false,message:''}),8000);
    }finally{setIapLoading(false);}
  }

  async function handleIAPRestore(){
    setIapLoading(true);
    try{
      const {isPremium,receipt,purchaseToken,productId}=await restorePurchases('button');
      if(isPremium){
        if(receipt&&platform==='ios'){
          const{data:fnData,error:fnErr}=await supabase.functions.invoke('validate-apple-receipt',{body:{receipt,userId:user.id}});
          if(fnErr||!fnData?.is_premium) throw new Error(fnErr?.message||'Receipt validation failed');
        } else if(platform==='android'){
          const updates={is_premium:true};
          if(purchaseToken){updates.google_purchase_token=purchaseToken;updates.google_product_id=productId;}
          await supabase.from('profiles').update(updates).eq('id',user.id);
        }
        setIsPremium(true);
          setShowPremiumWelcome(true);
      }else{
        setToast({visible:true,message:lang==='fr'?'Aucun achat actif trouvé':'No active purchase found'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }
    }catch(e){
      console.error('[IAP] restore failed:',e);
      try{
        const{data}=await supabase.from('profiles').select('is_premium').eq('id',user.id).single();
        if(data?.is_premium){
          setIsPremium(true);
              setShowPremiumWelcome(true);
          return;
        }
      }catch{}
      setToast({visible:true,message:lang==='fr'?'❌ Erreur lors de la restauration':'❌ Restore failed'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }finally{setIapLoading(false);}
  }

  // Checkout direct d'un tier ('premium'|'pro') : log + tracking + IAP/Stripe.
  function startTierCheckout(tier){
    const pro=tier==='pro';
    if(user)supabase.from('usage_logs').insert({user_id:user.id,feature:pro?'pro_cta_click':'premium_cta_click'}).then(()=>{});
    trackTikTokEvent("InitiateCheckout",user?.email,pro?29.99:12.99);
    if(pro){isNative?handleIAPPurchase('pro'):triggerCheckout('pro');}
    else{isNative?handleIAPPurchase():triggerCheckout();}
  }
  // Ex-UpgradeModal, fusionnée dans ConversionModal : un tier explicite part
  // directement en checkout, sans tier on ouvre la modale de conversion.
  function openUpgradeModal(tier,trigger='generic'){
    if(tier==='pro'||tier==='premium'){startTierCheckout(tier);return;}
    if(user)supabase.from('usage_logs').insert({user_id:user.id,feature:'premium_cta_click'}).then(()=>{});
    setConversionModal({open:true,trigger});
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
      supabase.from('ventes').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(500),
      supabase.from('inventaire').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(500),
      supabase.from('profiles').select('is_premium,is_pro,is_founder,apple_original_transaction_id,google_purchase_token,subscription_cancel_at_period_end,subscription_period_end,currency,username,platform_settings,extension_last_seen_at,extension_build').eq('id',uid).maybeSingle(),
    ]);
    if(!v.error) setSales((v.data||[]).map(mapSale));
    if(!i.error) setItems((i.data||[]).map(mapItem));
    // Ne jamais utiliser is_premium seul (cf. CLAUDE.md) : is_pro/is_founder/IAP actif
    // valent aussi statut premium, même si is_premium n'a jamais été positionné à true
    // (ex. promotion manuelle sans passer par le flow IAP).
    let premiumValue=!!(p.data?.is_premium||p.data?.is_pro||p.data?.is_founder||p.data?.apple_original_transaction_id||p.data?.google_purchase_token);
    console.log('[fetchAll] premium fields from Supabase:', {is_premium:p.data?.is_premium,is_pro:p.data?.is_pro,is_founder:p.data?.is_founder,has_apple:!!p.data?.apple_original_transaction_id,has_google:!!p.data?.google_purchase_token}, '→ resolved:', premiumValue, p.error?'ERROR:'+p.error.message:'');
    if(!p.error){
      setIsPremium(premiumValue);
      setIsPro(p.data?.is_pro===true);
      setUsername(p.data?.username||'');
      setSettingsLbcRue(p.data?.platform_settings?.leboncoin?.rue||'');
      setSettingsLbcCp(p.data?.platform_settings?.leboncoin?.code_postal||'');
      setSettingsLbcVille(p.data?.platform_settings?.leboncoin?.ville||'');
      setCancelAtPeriodEnd(p.data?.subscription_cancel_at_period_end===true);
      setCancelPeriodEnd(p.data?.subscription_period_end||null);
      setExtensionBuild(p.data?.extension_build??null);
      setExtensionLastSeenAt(p.data?.extension_last_seen_at??null);
      const confirmed=!!localStorage.getItem('fs_currency_confirmed');
      if(confirmed&&p.data?.currency){
        setCurrency(p.data.currency);
        localStorage.setItem('fs_currency',p.data.currency);
      } else if(!confirmed){
        if(p.data?.currency){
          // Compte existant sur nouvel appareil — pas d'onboarding
          setCurrency(p.data.currency);
          localStorage.setItem('fs_currency',p.data.currency);
          localStorage.setItem('fs_currency_confirmed','1');
        } else {
          setShowCurrencyOnboarding(true);
        }
      }
      if(!p.data?.username){
        // Nom fourni par le provider OAuth (Google le renvoie à chaque connexion,
        // Apple seulement à la toute première) : Supabase le garde dans
        // user_metadata — on le PERSISTE dans profiles à la première entrée pour
        // ne plus jamais dépendre de la réponse du provider, et la modale pseudo
        // ne s'affiche alors pas. getSession = lecture locale, pas d'appel réseau.
        const{data:{session:authSession}}=await supabase.auth.getSession();
        const meta=authSession?.user?.user_metadata||{};
        const providerName=String(meta.full_name||meta.name||'').trim().slice(0,30);
        if(providerName){
          const{error:unErr}=await supabase.rpc('set_profile_username',{p_username:providerName});
          if(!unErr){setUsername(providerName);localStorage.setItem('fs_username_asked','1');}
        } else if(!localStorage.getItem('fs_username_asked')&&confirmed){
          setShowUsernameOnboarding(true);
        }
      }
    }
    // Annonces à retirer (article vendu, frères encore live) — voir le bandeau.
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
    const{data:unavail}=await supabase.from('cross_post_jobs')
      .select('id, platform, title, price, inventaire_id, listing_url, platform_fields')
      .eq('user_id',uid).eq('status','published').eq('action','publish')
      .not('platform_fields->>unavailable_since','is',null);
    setUnavailableListings(unavail||[]);

    // Annonces INVÉRIFIABLES depuis plus de 2 jours (2026-07-13). L'extension
    // retente une fois par jour et se répare toute seule si la cause disparaît
    // (bot-shield levé, onglet rouvert) — on n'alerte donc pas au premier jour.
    // Mais au-delà, c'est à toi de trancher : l'annonce est peut-être toujours en
    // ligne et plus personne ne la surveille. On ne conclut RIEN à ta place, on
    // te donne le lien.
    const{data:unverif}=await supabase.from('cross_post_jobs')
      .select('id, platform, title, listing_url, platform_fields')
      .eq('user_id',uid).eq('status','published').eq('action','publish')
      .not('platform_fields->>check_unresolved_since','is',null);
    const seuil=Date.now()-2*24*60*60*1000;
    setUnverifiableListings((unverif||[]).filter(j=>{
      const t=Date.parse(j.platform_fields?.check_unresolved_since??'');
      return Number.isFinite(t)&&t<seuil;
    }));

    setLoading(false);
    setAppLoading(false);
    // Quota Lens : usage_logs est LA source de vérité (comptée côté serveur par
    // check_and_log_usage). Le quota inclus étant désormais MENSUEL (free 5,
    // premium 120, pro 250), le compteur affiché l'est aussi — borne = début de
    // mois UTC, comme date_trunc('month') côté serveur. (Le nom lensUsedToday
    // est historique : il contient le compteur du MOIS.)
    const lensMonthStart=new Date();lensMonthStart.setUTCDate(1);lensMonthStart.setUTCHours(0,0,0,0);
    const{count:lensCount}=await supabase.from('usage_logs')
      .select('id',{count:'exact',head:true})
      .eq('user_id',uid).eq('feature','lens')
      .gte('created_at',lensMonthStart.toISOString());
    setLensUsedToday(lensCount||0);
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
      const{data:w}=await supabase.from('coin_wallets').select('included_balance,purchased_balance').eq('user_id',user.id).maybeSingle();
      setCoinWallet(w??{included_balance:0,purchased_balance:0});
      if(!showSettings)return;
      const{data:h}=await supabase.from('coin_ledger').select('delta,kind,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(5);
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
  const tm={profit:currentMonthSales.reduce((a,s)=>a+s.margin,0),count:currentMonthSales.length};

  // Filtre par période pour les graphiques
  function filterSalesByRange(salesArr,range){
    const cutoffs={'7j':7,'1M':30,'6M':180,'1A':365};
    if(range==='YTD') return salesArr.filter(s=>new Date(s.date)>=new Date(now.getFullYear(),0,1));
    const ms=cutoffs[range]||180;
    const cutoff=new Date(now.getTime()-ms*86400000);
    return salesArr.filter(s=>new Date(s.date)>=cutoff);
  }

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
  const salesForKpis=filterSalesByRange(sales,selectedRange);
  const totalM=salesForKpis.reduce((a,s)=>a+s.margin,0);
  const totalR=salesForKpis.reduce((a,s)=>a+s.sell,0);
  const avgM=totalR>0?(totalM/totalR)*100:0;
  const stock=useMemo(()=>items.filter(i=>i.statut==="stock"),[items]);
  const sold=useMemo(()=>items.filter(i=>i.statut==="vendu"),[items]);
  const BoundPremiumBanner=useMemo(()=>{const C=(props)=><PremiumBanner {...props} onOpenModal={()=>openUpgradeModal()}/>;return C;},[user]);
  function searchMatch(item,query){
    if(!query.trim())return true;
    const q=query.toLowerCase().trim();
    return item.title?.toLowerCase().includes(q)||item.marque?.toLowerCase().includes(q)||item.description?.toLowerCase().includes(q)||item.type?.toLowerCase().includes(q);
  }
  const stockFiltre=useMemo(()=>stock
    .filter(i=>filterType==="Tous"||i.type===filterType)
    .filter(i=>filterMarque==="Toutes"||(i.marque?.toLowerCase()===filterMarque.toLowerCase()))
    .filter(i=>searchMatch(i,search)),[stock,filterType,filterMarque,search]);
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
  const groupedSales=useMemo(()=>groupSales(sales),[sales]);
  const visibleSales=useMemo(()=>(showAllSales?groupedSales:groupedSales.slice(0,10)).filter(s=>searchMatch(s,searchHistory)),[groupedSales,showAllSales,searchHistory]);
  const invested=items.reduce((a,i)=>a+i.buy*(i.quantite||1),0);
  const stockVal=useMemo(()=>stock.reduce((a,i)=>a+i.buy*(i.quantite||1),0),[stock]);
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
        setConversionModal({open:true,trigger:'voice'});
        setVoiceStep("");return;
      }
      await supabase.from('profiles').update({voice_count_today:count+1,voice_count_date:new Date().toISOString().split('T')[0]}).eq('id',user.id);
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
        if(iRes.status===429||iErrJson?.error==='quota_exceeded'){if(isPremium){setToast({visible:true,message:lang==='fr'?'🎙️ Limite vocale mensuelle atteinte.':'🎙️ Monthly voice limit reached.'});setTimeout(()=>setToast({visible:false,message:''}),5000);}else{setConversionModal({open:true,trigger:'voice'});}setVoiceStep("");setVoiceLoading(false);return;}
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
    let insertedCount=items.filter(i=>i.statut!=='vendu').length;
    const{data:{session:avSess}}=await supabase.auth.getSession();
    const avToken=avSess?.access_token;
    for(const item of voiceParsed.items){
      if(!isPremium&&insertedCount>=20){try{setConversionModal({open:true,trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?"20 item limit reached. Upgrade to Premium for unlimited stock.":"Limite de 20 articles atteinte. Passez Premium pour un stock illimité."});setTimeout(()=>setToast({visible:false,message:""}),4000);}break;}
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
    let insertedCount=items.filter(i=>i.statut!=='vendu').length;
    const{data:{session:ntSess}}=await supabase.auth.getSession();
    const ntToken=ntSess?.access_token;
    for(const item of lotDistributed.items){
      if(!isPremium&&insertedCount>=20){try{setConversionModal({open:true,trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?"20 item limit reached. Upgrade to Premium for unlimited stock.":"Limite de 20 articles atteinte. Passez Premium pour un stock illimité."});setTimeout(()=>setToast({visible:false,message:""}),4000);}break;}
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
    if(!isPremium&&items.filter(i=>i.statut!=='vendu').length>=20){try{setConversionModal({open:true,trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?"20 item limit reached. Upgrade to Premium for unlimited stock.":"Limite de 20 articles atteinte. Passez Premium pour un stock illimité."});setTimeout(()=>setToast({visible:false,message:""}),4000);}return;}
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
    const cogsUnit=item.buy+(item.purchaseCosts||0);
    const mgUnit=svUnit-cogsUnit-sfUnit;
    const mgpUnit=svUnit>0?(mgUnit/svUnit)*100:0;
    const remaining=qTotal-qVendue;
    if(remaining>0){
      await supabase.from('inventaire').update({quantite:remaining}).eq('id',item.id);
      setItems(prev=>prev.map(i=>i.id===item.id?{...i,quantite:remaining}:i));
      const soldRow={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:svUnit,margin:mgUnit,margin_pct:mgpUnit,statut:"vendu",selling_fees:sfUnit,purchase_costs:0,quantite:qVendue,marque:item.marque||null,type:item.type||null,description:item.description||null,date:new Date().toISOString(),plateforme:sellModal.plateforme||null};
      const{data:si,error:siErr}=await supabase.from('inventaire').insert([soldRow]).select().single();
      if(siErr)console.error("[confirmSell] soldRow insert failed:",siErr.message);
      if(si)setItems(prev=>[mapItem(si),...prev]);
    }else{
      await supabase.from('inventaire').update({prix_vente:svUnit,margin:mgUnit,margin_pct:mgpUnit,statut:"vendu",selling_fees:sfUnit}).eq('id',item.id);
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
    const{data,error}=await supabase.from('cross_post_jobs')
      .select('id, platform, action, status, listing_url, title, created_at')
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
    return{online:Object.values(parPlateforme),aAnnuler,retraitsEnCours:[...retraitsEnCours]};
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
    // 3. SEULEMENT MAINTENANT
    await supabase.from('inventaire').delete().eq('id',item.id);
    if(alsoDeleteSale){
      const t=item?.title?.toLowerCase().trim();
      const ms=sales.find(s=>s.title?.toLowerCase().trim()===t);
      if(ms)await supabase.from('ventes').delete().eq('id',ms.id);
    }
    await fetchAll(user.id);
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
    const rawB=parseFloat(editItem.buy)||0;
    const b=(editItem.priceMode==="total"&&qty>1)?rawB/qty:rawB;
    const s=parseFloat(editItem.sell)||0;
    const f=parseFloat(editItem.frais)||0;
    const hasS=s>0;
    const mg=hasS?s-b-f:null;
    const mgp=hasS?(mg/s)*100:null;
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
    const{error}=await supabase.from('inventaire').update({
      titre:editItem.title,
      marque:marqueNorm,
      type:typeAuto,
      prix_achat:b,
      prix_vente:hasS?s:null,
      margin:mg,
      margin_pct:mgp,
      description:editItem.description||null,
      quantite:qty,
      // Même colonne que l'intention vocale inventory_move (moveToLocation).
      emplacement:editItem.emplacement?.trim()||null,
    }).eq('id',editItem.id);
    if(!error){
      setItems(prev=>prev.map(i=>i.id===editItem.id?{...i,title:editItem.title,marque:editItem.marque,type:typeAuto,buy:b,sell:s,margin:mg,marginPct:mgp,description:editItem.description,quantite:qty,emplacement:editItem.emplacement?.trim()||null}:i));
      setEditItem(null);
      setToast({visible:true,message:lang==='fr'?'✓ Article modifié':'✓ Item updated'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }else{
      setToast({visible:true,message:`⚠️ ${error.message}`});
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
      navigate("/app");
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
      if(!isPremium&&items.filter(i=>i.statut!=='vendu').length>=20){try{setConversionModal({open:true,trigger:'stock'});}catch{setToast({visible:true,message:lang==='en'?"20 item limit reached. Upgrade to Premium for unlimited stock.":"Limite de 20 articles atteinte. Passez Premium pour un stock illimité."});setTimeout(()=>setToast({visible:false,message:""}),4000);}throw new Error(lang==='fr'?"Limite gratuite atteinte":"Free plan limit reached");}
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
      const cogs=item.buy+(item.purchaseCosts||0);
      const mg=sv-cogs-sf;const mgp=(mg/sv)*100;
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
        const{data:updRows,error:updErr}=await supabase.from('inventaire')
          .update({prix_vente:sv,margin:mg,margin_pct:mgp,statut:"vendu",selling_fees:sf})
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
      const pa=parseFloat(String(prix_achat??0).replace(",","."))||0;
      const qv=Math.max(1,parseInt(quantite_vendue)||1);
      const marqueNorm=normalizeMarque(marque);
      const row={user_id:user.id,titre:nom||"Article",marque:marqueNorm,type:type||null,description:description||null,prix_achat:pa,prix_vente:pv,benefice:pa>0?pv-pa:pv,date:new Date().toISOString().split('T')[0],plateforme:plateforme||null,quantite:qv>1?qv:null};
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
          const msg=errBody.reason==='monthly_limit'
            ?(lang==='fr'?'Limite mensuelle atteinte. Passez Premium pour continuer.':'Monthly limit reached. Upgrade to Premium to continue.')
            :(lang==='fr'?'Limite journalière atteinte. Revenez demain ou passez Premium.':'Daily limit reached. Come back tomorrow or upgrade to Premium.');
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
    setLensResult(null);setLensAdded(false);setLensPremiumLimitReached(false);
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

  async function handleLensPhotoNative(){
    try{
      // Vérifier l'état des permissions avant d'ouvrir
      let perms;
      try{ perms=await Camera.checkPermissions(); }catch(_){ perms=null; }

      if(perms?.camera==='denied'){
        alert(lang==='fr'
          ?'Accès à la caméra refusé.\n\nVa dans Réglages › FillSell › Active Appareil photo et Photos.'
          :'Camera access denied.\n\nGo to Settings › FillSell › Enable Camera and Photos.');
        return;
      }

      // Si "prompt" (jamais demandé) → demander explicitement avant d'ouvrir
      if(perms?.camera==='prompt'||perms?.camera==='prompt-with-rationale'){
        try{ await Camera.requestPermissions({permissions:['camera','photos']}); }catch(_){}
      }

      const photo=await Camera.getPhoto({
        quality:90,
        allowEditing:false,
        resultType:CameraResultType.DataUrl,
        source:CameraSource.Prompt,
      });
      if(!photo.dataUrl)return;
      setLensResult(null);setLensAdded(false);setLensPremiumLimitReached(false);
      setLensPhotos(prev=>{
        if(prev.length>=5)return prev; // cap 5 tant que lens-analysis gelé (slice 0,5 déployé) ; passer à (isPro?8:5) EN MÊME TEMPS que le déploiement lens slice(0,8)
        return[...prev,{preview:photo.dataUrl,mime:'image/jpeg'}];
      });
    }catch(e){
      const msg=(e?.message||'').toLowerCase();
      if(msg.includes('cancel'))return;
      if(msg.includes('denied')||msg.includes('permission')){
        alert(lang==='fr'
          ?'Accès à la caméra refusé.\n\nVa dans Réglages › FillSell › Active Appareil photo et Photos.'
          :'Camera access denied.\n\nGo to Settings › FillSell › Enable Camera and Photos.');
        return;
      }
      // Plugin absent ou erreur interne → fallback silencieux vers file input
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
    // Quota : plus de pré-check ni d'incrément client (profiles.lens_count_today).
    // Le serveur (lens-analysis → check_and_log_usage sur usage_logs) est l'unique
    // autorité : son 429 quota_exceeded est géré plus bas, et le compteur affiché
    // est resynchronisé après chaque succès.
    setLensLoading(true);setLensResult(null);setLensAdded(false);setLensInventaireId(null);
    const allSalesValid=sales.filter(s=>s.sell>0&&s.margin!=null);
    const avgMargin=allSalesValid.length?Math.round(allSalesValid.reduce((a,s)=>a+s.marginPct,0)/allSalesValid.length):null;
    const catProfit={};
    for(const s of sales){const c=s.type||s.categorie||"Autre";catProfit[c]=(catProfit[c]||0)+(s.margin??0);}
    const topCats=Object.entries(catProfit).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c])=>c);
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
          userStats:{avgMargin,topCategories:topCats},
        }),
      });
      if(!r.ok){
        const errBody=await r.json().catch(()=>({}));
        // Quota mensuel épuisé ET pas assez de pièces pour l'analyse hors quota
        if(errBody.error==='insufficient_coins'){
          setConversionModal({open:true,trigger:'lens',coinPrice:errBody.price??6,coinBalance:errBody.balance??0});
          return;
        }
        // quota_exceeded ne subsiste que pour le frein journalier Premium (10/j)
        if(errBody.error==='quota_exceeded'){
          if(isPremium){
            setLensPremiumLimitReached(true);
          }else{
            setConversionModal({open:true,trigger:'lens'});
          }
          return;
        }
        throw new Error(errBody.error||`HTTP ${r.status}`);
      }
      const result=await r.json();
      if(result.error)throw new Error(result.error);
      setLensResult(result);
      // Miroir du log serveur qui vient d'être écrit dans usage_logs
      setLensUsedToday(prev=>prev+1);
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

  async function saveLensItemForListing(prixAchatSaisi){
    if(lensInventaireId)return lensInventaireId;
    if(!lensResult?.titre||lensResult.est_vendu)return null;
    try{
      const saisi=prixAchatSaisi!=null&&prixAchatSaisi!==""?parseFloat(String(prixAchatSaisi).replace(",","."))||null:null;
      const mapped=await vaActions.addItem({
        nom:lensResult.titre||"Article",
        marque:lensResult.marque||null,
        categorie:lensResult.categorie||"Autre",
        description:lensResult.description||(lensDesc.trim()||null),
        // Jamais de fallback sur prix_achat_suggere (estimation marché IA, pas ce que l'user a payé).
        prix_achat:saisi??lensResult.prix_achat_reel??null,
        prix_vente:lensResult.prix_vente_suggere||null,
        quantite:1,
      });
      setLensInventaireId(mapped.id);
      if(!lensAdded)setLensAdded(true);
      return mapped.id;
    }catch(e){
      console.error('[saveLensItemForListing]',e);
      return null;
    }
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
        const pa=lensResult.prix_achat_reel||0;
        const marqueNorm=normalizeMarque(lensResult.marque);
        const _td=detectType(nom,marqueNorm);
        const typeAuto=(lensResult.categorie&&lensResult.categorie!=='Luxe')?lensResult.categorie:_td;
        const srow={user_id:user.id,titre:stripMarque(nom,marqueNorm),prix_achat:pa,prix_vente:pv,benefice:pv-pa,marque:marqueNorm||null,type:typeAuto||null,description:lensResult.description||(lensDesc.trim()||null),emplacement:null,date:new Date().toISOString().split('T')[0]};
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
            <PremiumBanner userEmail={user?.email} compact onDark={false} source="topbar" onOpenModal={()=>openUpgradeModal()}/>
          ):!isPremium&&isNative?(
            <button onClick={()=>openUpgradeModal()} style={{padding:"6px 12px",background:`linear-gradient(120deg,${UI.teal},${UI.amber})`,color:"#fff",border:"none",borderRadius:99,fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap",flexShrink:0}}>✨ Upgrade</button>
          ):isPremium?(
            // Pro passe devant Premium : isPro vient de profiles.is_pro, isPremium
            // de l'expression complète (cf. CLAUDE.md). Aucune logique nouvelle ici.
            <PlanBadge isPremium={isPremium} isPro={isPro} onClick={()=>setShowPremiumModal(true)} />
          ):null}
          <button onClick={()=>{setShowSettings(true);setCancelStep(0);setCancelMsg("");setSettingsPseudoInput(username);}} title="Paramètres" className="tb-icon-btn-light">⚙️</button>
        </div>
      </div>

      {/* Bannière « extension obsolète » (2026-07-19, restyle amber + dismiss
          2026-07-23) : desktop seulement — sur mobile/natif l'extension ne
          s'installe pas (cf. e252620), la condition extensionOutdated les
          exclut déjà. Lien vers /extension (zip du build courant + guide de
          rechargement) — PAS le Chrome Web Store, le build y est encore en
          review. Dismissible : clé (build installé | build minimal requis)
          en localStorage, cf. extBannerDismissedFor. */}
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

      {extensionOutdated&&extBannerDismissedFor!==extBannerKey&&(
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px 11px 14px",background:`linear-gradient(90deg,${UI.amber}1F,${UI.amber}0D)`,borderBottom:`1px solid ${UI.amber}66`,borderLeft:`4px solid ${UI.amber}`,fontSize:13,color:"#C2410C"}}>
          <span aria-hidden="true" style={{fontSize:17,flexShrink:0}}>🧩</span>
          <span style={{flex:1,lineHeight:1.45,fontWeight:500}}>
            {lang==='fr'
              ?"Ton extension Chrome FillSell n'est plus à jour — certaines publications peuvent échouer."
              :"Your FillSell Chrome extension is out of date — some listings may fail to publish."}
          </span>
          <a href="/extension" style={{fontWeight:700,fontSize:12,color:"#fff",background:UI.amber,borderRadius:99,padding:"6px 14px",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0,boxShadow:"0 1px 4px rgba(232,149,109,0.4)"}}>
            {lang==='fr'?"Mettre à jour":"Update"}
          </a>
          <button onClick={()=>{setExtBannerDismissedFor(extBannerKey);try{localStorage.setItem('fs_ext_banner_dismissed',extBannerKey);}catch{/* stockage indisponible : dismiss valable pour la session seulement */}}}
            aria-label={lang==='fr'?"Masquer":"Dismiss"} title={lang==='fr'?"Masquer":"Dismiss"}
            style={{background:"transparent",border:"none",color:"#C2410C",fontSize:15,lineHeight:1,cursor:"pointer",padding:"4px 6px",opacity:0.65,flexShrink:0,fontFamily:"inherit"}}>✕</button>
        </div>
      )}

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

        {/* Annonce INVÉRIFIABLE depuis > 2 jours : la surveillance automatique
            n'aboutit plus (page anti-bot, format inattendu). ⚠️ Bandeau PUREMENT
            INFORMATIF — aucun bouton destructif, aucune écriture : l'annonce est
            peut-être parfaitement en ligne. L'extension continue de retenter une
            fois par jour et le bandeau disparaîtra tout seul dès qu'une lecture
            aboutira. Le lien permet de vérifier à la main en attendant. */}
        {unverifiableListings.map(job=>{
          const PLAT={vinted:'Vinted',leboncoin:'Leboncoin',beebs:'Beebs',ebay:'eBay',vestiaire:'Vestiaire'};
          const plat=PLAT[job.platform]||job.platform;
          const depuis=Math.floor((Date.now()-Date.parse(job.platform_fields?.check_unresolved_since))/86400000);
          return (
            <div key={job.id} style={{background:UI.paper,border:`1px solid ${UI.border}`,borderLeft:`4px solid ${UI.mute2}`,borderRadius:16,padding:"14px 16px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:14,color:UI.ink,lineHeight:1.55}}>
                <strong>{lang==='fr'?'Vérification impossible':'Cannot verify listing'}</strong>
                <br/>
                {lang==='fr'
                  ?<>Impossible de vérifier l'état de « {job.title||'Article'} » sur <strong>{plat}</strong> depuis {depuis} jour{depuis>1?'s':''}. L'annonce est peut-être toujours en ligne — <strong>rien n'a été modifié</strong>. On réessaie chaque jour ; en attendant, tu peux vérifier toi-même.</>
                  :<>Could not check “{job.title||'Item'}” on <strong>{plat}</strong> for {depuis} day{depuis>1?'s':''}. The listing may well still be online — <strong>nothing was changed</strong>. We keep retrying daily; meanwhile you can check yourself.</>}
              </div>
              {job.listing_url&&(
                <div>
                  <a href={job.listing_url} target="_blank" rel="noopener noreferrer"
                    style={{display:"inline-block",padding:"9px 18px",borderRadius:999,border:`1px solid ${UI.border}`,background:UI.card,color:UI.ink,fontSize:13.5,fontWeight:600,textDecoration:"none",fontFamily:"inherit"}}>
                    {lang==='fr'?`Ouvrir l'annonce ${plat}`:`Open the ${plat} listing`}
                  </a>
                </div>
              )}
            </div>
          );
        })}

        {tab===0&&(
          <DashboardTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative} username={username}
            loading={loading} items={items} sales={sales}
            stock={stock} stockVal={stockVal} stockQty={stockQty}
            tm={tm} salesForKpis={salesForKpis} totalM={totalM}
            selectedRange={selectedRange} setSelectedRange={setSelectedRange}
            fabTriggerRef={fabTriggerRef}
            openUpgradeModal={openUpgradeModal}
            setTab={setTab}
            EmptyStateDashboard={EmptyStateDashboard}
          />
        )}

        {tab===1&&(
          <StockTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative} isPro={isPro}
            items={items} user={user} voiceUsedToday={voiceUsedToday}
            extensionStatus={{ lastSeenAt: extensionLastSeenAt, build: extensionBuild, outdated: extensionOutdated }}
            iapProduct={iapProduct} iapLoading={iapLoading}
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
          />
        )}

        {tab===2&&(
          <LensTab
            lang={lang} currency={currency} userCountry={userCountry}
            isPremium={isPremium} isNative={isNative} user={user}
            iapProduct={iapProduct} iapLoading={iapLoading}
            lensPhotos={lensPhotos} setLensPhotos={setLensPhotos}
            lensResult={lensResult} setLensResult={setLensResult}
            lensAdded={lensAdded} setLensAdded={setLensAdded}
            lensDesc={lensDesc} setLensDesc={setLensDesc}
            lensBuy={lensBuy} setLensBuy={setLensBuy}
            lensLoading={lensLoading} lensMicActive={lensMicActive} lensMicLoading={lensMicLoading}
            lensPlaceholderFade={lensPlaceholderFade} lensPlaceholderIdx={lensPlaceholderIdx}
            lensFileRef={lensFileRef} toggleLensMic={toggleLensMic}
            handleLensPhoto={handleLensPhoto} handleLensPhotoNative={handleLensPhotoNative} analyzeLens={analyzeLens} addLensItem={addLensItem} openLensEditModal={openLensEditModal}
            handleIAPPurchase={handleIAPPurchase} handleIAPRestore={handleIAPRestore}
            PremiumBanner={BoundPremiumBanner} IAPUpgradeBlock={IAPUpgradeBlock}
            openUpgradeModal={openUpgradeModal}
            lensUsedToday={lensUsedToday} LENS_FREE_LIMIT={LENS_FREE_LIMIT}
            lensPremiumLimitReached={lensPremiumLimitReached}
            isPro={isPro}
            supabase={supabase}
            saveLensItemForListing={saveLensItemForListing}
            lensInventaireId={lensInventaireId}
            onStepperOpenChange={setListingStepperOpen}
          />
        )}

        {tab===3&&(
          <VentesTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative} user={user}
            sales={sales} visibleSales={visibleSales} groupedSales={groupedSales}
            salesForKpis={salesForKpis} totalM={totalM}
            searchHistory={searchHistory} setSearchHistory={setSearchHistory}
            showAllSales={showAllSales} setShowAllSales={setShowAllSales}
            iapProduct={iapProduct} iapLoading={iapLoading}
            handleIAPPurchase={handleIAPPurchase} handleIAPRestore={handleIAPRestore}
            delSale={delSale} setTab={setTab} setEditItem={setEditItem}
            PremiumBanner={BoundPremiumBanner} IAPUpgradeBlock={IAPUpgradeBlock}
            openUpgradeModal={openUpgradeModal}
          />
        )}
        {/* StatsTab toujours monté — état local préservé entre les onglets */}
        <div style={{display:tab===4?'block':'none'}}>
          <StatsTab sales={sales} items={items} lang={lang} currency={currency} user={user} aiCache={aiCache} setAiCache={setAiCache} setTab={setTab} isActive={tab===4}/>
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {editItem&&(
        <>
          <div onClick={()=>setEditItem(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(92vw,480px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"88vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:C.text}}>{editItem._isNew?(lang==='fr'?"➕ Ajouter au stock":"➕ Add to stock"):`✏️ ${lang==='fr'?"Modifier l'article":"Edit item"}`}</div>
              <IconButton onClick={()=>setEditItem(null)} icon={X} size={32} bg={UI.chip} iconColor={UI.mute2} />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Field label={lang==='fr'?"Nom":"Name"} value={editItem.title} set={v=>setEditItem(p=>({...p,title:v}))} placeholder="Ex: Air Max 90..." icon="🏷️"/>
              <Field label={lang==='fr'?"Marque (optionnel)":"Brand (optional)"} value={editItem.marque||""} set={v=>setEditItem(p=>({...p,marque:v}))} placeholder="Ex: Nike, Zara..." icon="✏️"/>
              <select value={editItem.type||""} onChange={e=>setEditItem(p=>({...p,type:e.target.value}))}
                style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:14,padding:"0 16px",height:58,fontSize:15,fontWeight:600,color:editItem.type?"#0D0D0D":"#A3A9A6",width:"100%",cursor:"pointer",fontFamily:"inherit",outline:"none",appearance:"auto"}}>
                <option value="">{(editItem.title||editItem.marque)?(lang==='fr'?`🤖 Détecté : ${detectType(editItem.title,editItem.marque)}`:`🤖 Detected: ${typeLabel(detectType(editItem.title,editItem.marque),lang)}`):(lang==='fr'?'🤖 Détection automatique':'🤖 Auto-detection')}</option>
                <option value="Mode">👗 {typeLabel('Mode',lang)}</option>
                <option value="High-Tech">📱 High-Tech</option>
                <option value="Maison">🏠 {typeLabel('Maison',lang)}</option>
                <option value="Électroménager">⚡ {typeLabel('Électroménager',lang)}</option>
                <option value="Jouets">🧸 {typeLabel('Jouets',lang)}</option>
                <option value="Livres">📚 {typeLabel('Livres',lang)}</option>
                <option value="Sport">⚽ Sport</option>
                <option value="Auto-Moto">🚗 {typeLabel('Auto-Moto',lang)}</option>
                <option value="Beauté">💄 {typeLabel('Beauté',lang)}</option>
                <option value="Musique">🎵 Musique</option>
                <option value="Collection">🏆 Collection</option>
                <option value="Multimédia">📺 {typeLabel('Multimédia',lang)}</option>
                <option value="Jardin">🌿 {typeLabel('Jardin',lang)}</option>
                <option value="Bricolage">🔧 {typeLabel('Bricolage',lang)}</option>
                <option value="Autre">📦 {typeLabel('Autre',lang)}</option>
              </select>
              <Field label={lang==='fr'?"Prix d'achat":"Purchase price"} value={String(editItem.buy??"")}set={v=>setEditItem(p=>({...p,buy:v}))} placeholder="0,00" type="number" icon="🛒" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              {(parseInt(editItem.quantite)||1)>1&&(
                <div style={{display:"flex",gap:4,background:"#F1F5F9",borderRadius:10,padding:4}}>
                  {["unit","total"].map(mode=>(
                    <button key={mode} type="button"
                      onClick={()=>setEditItem(p=>({...p,priceMode:mode}))}
                      style={{flex:1,padding:"8px 0",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",touchAction:"manipulation",
                        background:(editItem.priceMode??"unit")===mode?"#fff":"transparent",
                        color:(editItem.priceMode??"unit")===mode?C.teal:"#6B7280",
                        boxShadow:(editItem.priceMode??"unit")===mode?"0 1px 4px rgba(0,0,0,0.1)":"none",
                        transition:"all 0.15s"}}>
                      {mode==="unit"?(lang==='fr'?"Par article":"Per item"):(lang==='fr'?"Prix total lot":"Total lot price")}
                    </button>
                  ))}
                </div>
              )}
              <Field label={lang==='fr'?"Prix de vente (optionnel)":"Sell price (optional)"} value={String(editItem.sell??"")} set={v=>setEditItem(p=>({...p,sell:v}))} placeholder={lang==='fr'?"Vide = en stock":"Empty = in stock"} type="number" icon="💰" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              <Field label={lang==='fr'?"Frais (optionnel)":"Fees (optional)"} value={String(editItem.frais??"")} set={v=>setEditItem(p=>({...p,frais:v}))} placeholder="0,00" type="number" icon="📬" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>🔢 {lang==='fr'?"Quantité":"Quantity"}</div>
                <div style={{display:"flex",alignItems:"center",gap:0,border:"1.5px solid rgba(0,0,0,0.12)",borderRadius:14,overflow:"hidden",background:"#fff",height:58}}>
                  <button type="button" onClick={()=>setEditItem(p=>({...p,quantite:Math.max(1,(parseInt(p.quantite)||1)-1)}))} style={{width:52,height:"100%",border:"none",background:"transparent",fontSize:22,fontWeight:300,color:"#6B7280",cursor:"pointer",touchAction:"manipulation",flexShrink:0}}>−</button>
                  <input type="number" min="1" value={editItem.quantite??1}
                    onChange={e=>setEditItem(p=>({...p,quantite:Math.max(1,parseInt(e.target.value)||1)}))}
                    onFocus={e=>e.target.select()}
                    style={{flex:1,border:"none",outline:"none",textAlign:"center",fontSize:18,fontWeight:700,color:"#0D0D0D",background:"transparent",width:0,MozAppearance:"textfield"}}
                  />
                  <button type="button" onClick={()=>setEditItem(p=>({...p,quantite:(parseInt(p.quantite)||1)+1}))} style={{width:52,height:"100%",border:"none",background:"transparent",fontSize:22,fontWeight:300,color:"#6B7280",cursor:"pointer",touchAction:"manipulation",flexShrink:0}}>+</button>
                </div>
              </div>
              {/* Emplacement — MÊME donnée que le badge 📦 des cartes de stock et
                  que l'intention vocale inventory_move : colonne inventaire.emplacement
                  (cf. vaActions.moveToLocation). Aucun champ parallèle créé. */}
              <Field label={lang==='fr'?"Emplacement (optionnel)":"Location (optional)"} value={editItem.emplacement||""} set={v=>setEditItem(p=>({...p,emplacement:v}))} placeholder={lang==='fr'?"Ex: Étagère salon, Carton 3...":"Ex: Living room shelf, Box 3..."} icon="📦"/>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>📝 {lang==='fr'?"Description (optionnel)":"Description (optional)"}</div>
                <textarea value={editItem.description||""} onChange={e=>setEditItem(p=>({...p,description:e.target.value.slice(0,200)}))}
                  placeholder={lang==='fr'?"Ex: Taille M, noir, neuf...":"Ex: Size M, black, new..."}
                  maxLength={200} rows={2}
                  style={{width:"100%",padding:"10px 14px",borderRadius:14,border:`1.5px solid ${editItem.description?C.teal:"rgba(0,0,0,0.12)"}`,fontSize:13,color:C.text,fontFamily:"inherit",resize:"none",outline:"none",background:"#fff",transition:"border-color 0.15s",boxSizing:"border-box",lineHeight:1.5}}
                  onFocus={e=>e.currentTarget.style.borderColor=C.teal}
                  onBlur={e=>e.currentTarget.style.borderColor=editItem.description?C.teal:"rgba(0,0,0,0.12)"}
                />
                <div style={{fontSize:10,color:C.label,textAlign:"right",marginTop:2}}>{(editItem.description||"").length}/200</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <PrimaryButton onClick={handleEditSave} style={{flex:1,width:"auto"}}>
                {lang==='fr'?"💾 Enregistrer":"💾 Save"}
              </PrimaryButton>
              <SecondaryButton onClick={()=>setEditItem(null)} style={{width:"auto",padding:"13px 20px"}}>
                {t('annuler')}
              </SecondaryButton>
            </div>
          </div>
        </>
      )}

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
                  <PlanBadge isPremium={isPremium} isPro={isPro} />
                </div>
              )}
            </div>

            {/* Pépites de publication */}
            <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <Eyebrow>{lang==='fr'?'Mes Pépites':'My Nuggets'}</Eyebrow>
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:22,fontWeight:700,color:UI.ink,display:"inline-flex",alignItems:"center",gap:7}}><PepiteIcon size={24} /> {(coinWallet?.included_balance??0)+(coinWallet?.purchased_balance??0)}</span>
                <span style={{fontSize:11,color:UI.mute,fontWeight:600}}>
                  {lang==='fr'
                    ?`${coinWallet?.included_balance??0} incluses · ${coinWallet?.purchased_balance??0} achetées`
                    :`${coinWallet?.included_balance??0} included · ${coinWallet?.purchased_balance??0} purchased`}
                </span>
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
                <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${UI.border}`,display:"flex",flexDirection:"column",gap:5}}>
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
              return (
            <div style={{background:UI.paper,border:`1px solid ${UI.border}`,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <Eyebrow style={{marginBottom:8}}>{lang==='fr'?'Adresse de remise Leboncoin':'Leboncoin pickup address'}</Eyebrow>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input
                  value={settingsLbcRue}
                  onChange={e=>setSettingsLbcRue(e.target.value.slice(0,120))}
                  placeholder={lang==='fr'?'Rue — ex : 12 rue de la Paix':'Street — e.g. 12 rue de la Paix'}
                  style={inputStyle(false)}
                />
                <div style={{display:"flex",gap:8}}>
                  <input
                    value={settingsLbcCp}
                    onChange={e=>setSettingsLbcCp(e.target.value.replace(/\D/g,'').slice(0,5))}
                    inputMode="numeric"
                    placeholder={lang==='fr'?'Code postal':'Postal code'}
                    style={{...inputStyle(cpError),flex:"0 0 110px"}}
                  />
                  <input
                    value={settingsLbcVille}
                    onChange={e=>setSettingsLbcVille(e.target.value.slice(0,80))}
                    placeholder={lang==='fr'?'Ville':'City'}
                    style={{...inputStyle(false),flex:1}}
                  />
                </div>
                {cpError&&(
                  <div style={{fontSize:11,color:UI.negative,fontWeight:600}}>
                    {lang==='fr'?'Le code postal doit contenir 5 chiffres.':'Postal code must be 5 digits.'}
                  </div>
                )}
                <button
                  onClick={async()=>{
                    setSettingsLbcAddressSaving(true);
                    const rue=settingsLbcRue.trim();
                    const cp=settingsLbcCp.trim();
                    const ville=settingsLbcVille.trim();
                    // String unique attendue par le handler (content-scripts/leboncoin.js) :
                    // jointure par espaces, sans virgule — l'autocomplete LBC (type
                    // Google Places) matche mieux "12 rue de la paix 69001 lyon" que la
                    // même chaîne ponctuée (cf. commentaire fillAddress).
                    const adresse=[rue,cp,ville].filter(Boolean).join(' ');
                    // Lecture-fusion-écriture : platform_settings est partagé entre
                    // plateformes, ne jamais écraser les clés des autres.
                    const{data:cur}=await supabase.from('profiles').select('platform_settings').eq('id',user.id).maybeSingle();
                    const next={...(cur?.platform_settings||{}),leboncoin:{...(cur?.platform_settings?.leboncoin||{}),rue,code_postal:cp,ville,adresse}};
                    // .select() : sans lui, un update filtré par RLS (0 ligne) ne
                    // renvoie PAS d'erreur → faux "✅" (cas vécu : policy UPDATE absente).
                    const{data:upd,error}=await supabase.from('profiles').update({platform_settings:next}).eq('id',user.id).select('platform_settings');
                    setSettingsLbcAddressSaving(false);
                    const failed=error||!upd?.length;
                    setToast({visible:true,message:failed?(lang==='fr'?'❌ Erreur lors de la sauvegarde':'❌ Save failed'):(lang==='fr'?'✅ Adresse enregistrée !':'✅ Address saved!')});
                    setTimeout(()=>setToast({visible:false,message:''}),3000);
                  }}
                  disabled={settingsLbcAddressSaving||cpError}
                  style={{alignSelf:"flex-start",padding:"8px 14px",borderRadius:999,border:"none",background:`linear-gradient(120deg,${UI.teal},${UI.tealDeep})`,color:"#fff",fontSize:13,fontWeight:600,cursor:(settingsLbcAddressSaving||cpError)?"not-allowed":"pointer",opacity:(settingsLbcAddressSaving||cpError)?0.6:1,transition:"all 0.2s",fontFamily:"inherit",whiteSpace:"nowrap"}}
                >
                  {settingsLbcAddressSaving?"…":(lang==='fr'?'Enregistrer':'Save')}
                </button>
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

            {/* Signaler un bug */}
            <button onClick={()=>{setShowBugReport(true);setBugMessage("");}}
              style={{display:"block",width:"100%",background:"none",border:"none",textAlign:"center",fontSize:12,color:UI.mute,marginTop:16,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:3,fontFamily:"inherit",padding:0}}
            >
              🐛 {lang==='fr'?'Signaler un bug':'Report a bug'}
            </button>
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
        onUpgrade={(tier)=>{setConversionModal(m=>({...m,open:false}));startTierCheckout(tier);}}
        trigger={conversionModal.trigger}
        lang={lang}
        isPremium={isPremium}
        isPro={isPro}
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
        <PremiumWelcomeModal lang={lang} onClose={()=>setShowPremiumWelcome(false)}/>
      )}

      {/* ── MODALE « MON PLAN » (badge Premium/Pro du header) ──
          Contenu par plan RÉEL (isPro devant, comme PlanBadge) — l'ancienne
          version listait des avantages Premium périmés quel que soit le plan. */}
      {showPremiumModal&&(
        <PlanDetailsModal
          isPro={isPro}
          lang={lang}
          onClose={()=>setShowPremiumModal(false)}
          supabase={supabase}
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
            {deleteConfirm.type==='itemListings'&&(
              <>
                <div style={{fontSize:13,color:"#6B7280",marginBottom:16,lineHeight:1.5}}>
                  {lang==='fr'
                    ?`Cet article est encore présent sur des plateformes.`
                    :`This item is still live on marketplaces.`}
                  <div style={{fontWeight:700,color:"#0D0D0D",marginTop:6}}>{deleteConfirm.item?.title}</div>
                </div>
                {renderCrossPostConsequences(deleteConfirm.plan)}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={async()=>{
                    await performItemDeletion(deleteConfirm.item,deleteConfirm.plan);
                    setDeleteConfirm(null);
                  }} style={{width:"100%",padding:"12px",background:`${UI.negative}0F`,border:`1px solid ${UI.negative}66`,borderRadius:14,fontSize:13,fontWeight:600,color:UI.negative,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    {lang==='fr'?'🗑️ Retirer les annonces et supprimer':'🗑️ Remove listings and delete'}
                    <div style={{fontSize:11,fontWeight:400,color:UI.negative,opacity:0.8,marginTop:2}}>
                      {lang==='fr'?'Le retrait part en tâche de fond, puis l\'article est supprimé':'Removal runs in the background, then the item is deleted'}
                    </div>
                  </button>
                  <SecondaryButton onClick={()=>setDeleteConfirm(null)} style={{padding:10}}>
                    {lang==='fr'?'Annuler':'Cancel'}
                  </SecondaryButton>
                </div>
              </>
            )}
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
        setConversionModal={setConversionModal}
        hideFab={listingStepperOpen || tab===1}
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
                  const res=await fetch(`${supabaseUrl}/functions/v1/send-bug-report`,{
                    method:"POST",
                    headers:{"Content-Type":"application/json","apikey":supabaseAnonKey},
                    body:JSON.stringify({message:bugMessage.trim(),userEmail:user?.email,platform:platform,userId:user?.id}),
                  });
                  if(!res.ok)throw new Error("send error");
                  setShowBugReport(false);setBugMessage("");
                  setToast({visible:true,message:lang==='fr'?'Merci ! On regarde ça rapidement 🙏':'Thanks! We\'ll look into it 🙏'});
                  setTimeout(()=>setToast({visible:false,message:""}),4000);
                }catch{
                  setToast({visible:true,message:lang==='fr'?'Erreur d\'envoi, réessaie':'Send error, try again'});
                  setTimeout(()=>setToast({visible:false,message:""}),3000);
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

      {showCurrencyOnboarding&&(
        <CurrencyOnboardingModal lang={lang} onConfirm={async(code,uname)=>{
          await saveCurrency(code);
          if(uname){await supabase.rpc('set_profile_username',{p_username:uname});setUsername(uname);localStorage.setItem('fs_username_asked','1');}
          localStorage.setItem('fs_currency_confirmed','1');
          setShowCurrencyOnboarding(false);
        }}/>
      )}
      {showUsernameOnboarding&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',boxSizing:'border-box'}}>
          <div style={{background:'#fff',borderRadius:24,padding:'32px 28px',maxWidth:360,width:'100%',boxShadow:'0 24px 64px rgba(0,0,0,0.22)',boxSizing:'border-box',textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>👋</div>
            <div style={{fontSize:20,fontWeight:700,color:'#0D0D0D',letterSpacing:'-0.02em',marginBottom:6}}>
              {lang==='en'?"What's your name?":"Comment tu t'appelles ?"}
            </div>
            <div style={{fontSize:13,color:'#6B7280',marginBottom:20}}>
              {lang==='en'?'Optional — first name or nickname.':'Optionnel — prénom ou pseudo.'}
            </div>
            <UsernameOnboardingInput lang={lang} onConfirm={async(uname)=>{
              if(uname){await supabase.rpc('set_profile_username',{p_username:uname});setUsername(uname);}
              localStorage.setItem('fs_username_asked','1');
              setShowUsernameOnboarding(false);
            }}/>
          </div>
        </div>
      )}
    </div>
  );
}
