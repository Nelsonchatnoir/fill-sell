import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Capacitor, registerPlugin } from '@capacitor/core';
const AppleSignIn = registerPlugin('AppleSignIn');
import { initIAP, purchasePremium, restorePurchases } from './lib/iap';
import { track } from './analytics/analytics';
import { useNavigate, useSearchParams } from "react-router-dom";
const isNative = Capacitor.isNativePlatform();
import { supabase, supabaseUrl, supabaseAnonKey } from './lib/supabase';
import Toast from './components/Toast';
import StatsPage from './pages/StatsPage';
import { useTranslation } from './i18n/useTranslation';
import * as XLSX from 'xlsx';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { calculateDealScore } from './utils/dealScore';
import { generateDealAnalysis } from './utils/dealAnalysis';
import { executeVoiceTasks } from './utils/voiceEngine';
import StockTab from './tabs/StockTab';
import LensTab from './tabs/LensTab';
import VentesTab from './tabs/VentesTab';
import StatsTab from './tabs/StatsTab';
import DashboardTab from './tabs/DashboardTab';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);
ChartJS.defaults.font.family = "'Nunito', -apple-system, BlinkMacSystemFont, sans-serif";
import './App.css';
import './App.redesign.css';

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const VOICE_FREE_LIMIT = 5;

const C = {
  // Design tokens Fill & Sell
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
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
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
  const REGION_LABELS={Europe:'Europe',America:lang==='en'?'Americas':'Amériques',Africa:lang==='en'?'Africa':'Afrique','Asia/Pacific':lang==='en'?'Asia & Pacific':'Asie & Pacifique'};
  const q=search.trim().toLowerCase();
  const filtered=q?CURRENCIES_LIST.filter(c=>c.code.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.sym.toLowerCase().includes(q)):CURRENCIES_LIST;
  const grouped=filtered.reduce((acc,c)=>{(acc[c.reg]||(acc[c.reg]=[])).push(c);return acc;},{});
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',boxSizing:'border-box'}}>
      <div style={{background:'#fff',borderRadius:24,padding:'20px',maxWidth:400,width:'100%',boxShadow:'0 24px 64px rgba(0,0,0,0.22)',boxSizing:'border-box',maxHeight:'88vh',display:'flex',flexDirection:'column'}}>
        <div style={{fontSize:24,textAlign:'center',marginBottom:4}}>💱</div>
        <div style={{fontSize:18,fontWeight:900,textAlign:'center',marginBottom:3,color:'#0D0D0D',letterSpacing:'-0.02em'}}>
          {lang==='en'?'Choose your currency':'Choisissez votre devise'}
        </div>
        <div style={{fontSize:11,color:'#6B7280',textAlign:'center',marginBottom:12}}>
          {lang==='en'?'Display only — no conversion.':'Affichage uniquement, aucune conversion.'}
        </div>
        <input placeholder={lang==='en'?'Search: USD, Dollar…':'Rechercher : EUR, Euro…'} value={search} onChange={e=>setSearch(e.target.value)}
          style={{width:'100%',boxSizing:'border-box',padding:'9px 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.14)',fontSize:13,fontFamily:'inherit',outline:'none',marginBottom:10}}/>
        <div style={{overflowY:'auto',flex:1}}>
          {['Europe','America','Africa','Asia/Pacific'].map(reg=>{
            const items=grouped[reg];
            if(!items||items.length===0) return null;
            return(
              <div key={reg}>
                <div style={{fontSize:9,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.1em',padding:'8px 2px 4px'}}>{REGION_LABELS[reg]}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5,marginBottom:4}}>
                  {items.map(c=>(
                    <button key={c.code} onClick={()=>setSelected(c.code)}
                      style={{padding:'7px 4px',borderRadius:9,border:selected===c.code?'2px solid #1D9E75':'1px solid rgba(0,0,0,0.09)',background:selected===c.code?'#F0FBF7':'#FAFAFA',cursor:'pointer',transition:'all 0.1s',fontFamily:'inherit',textAlign:'center',lineHeight:1.25}}>
                      <div style={{fontSize:11,fontWeight:800,color:selected===c.code?'#1D9E75':'#111'}}>{c.code}</div>
                      <div style={{fontSize:10,color:selected===c.code?'#1D9E75':'#6B7280'}}>{c.sym}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={()=>onConfirm(selected)}
          style={{marginTop:12,width:'100%',padding:'13px',background:'#1D9E75',border:'none',borderRadius:13,color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>
          {selected} {CURRENCY_SYMBOLS[selected]} — {lang==='en'?'Confirm':'Confirmer'}
        </button>
      </div>
    </div>
  );
}
// Capitalize after spaces and apostrophes to handle "L'Oréal", "Louis Vuitton", etc.
const normalizeMarque = m => m?.trim() ? m.trim().toLowerCase().replace(/(^|\s|')(\S)/g,(_,sep,c)=>sep+c.toUpperCase()) : null;
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
  const THRESHOLD=70;

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

  const startY=useRef(0);
  const currentDx=useRef(0);
  const isScrolling=useRef(false);
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

function PremiumBanner({ userEmail, compact=false, onDark=false, source='banner' }){
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
      alert("Erreur : " + e.message);
      setLoading(false);
    }
  }

  if(compact){
    const bg=onDark?(loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)"):(loading?"#E5E7EB":"#1D9E75");
    const bgHover=onDark?"rgba(255,255,255,0.3)":"#0F6E56";
    const bgLeave=onDark?(loading?"rgba(255,255,255,0.1)":"rgba(255,255,255,0.2)"):(loading?"#E5E7EB":"#1D9E75");
    const col=onDark?"#fff":"#fff";
    const brd=onDark?"1px solid rgba(255,255,255,0.4)":"none";
    return(
      <button onClick={handleCheckout} disabled={loading}
        style={{padding:"6px 12px",background:bg,color:col,border:brd,borderRadius:99,fontSize:11,fontWeight:800,cursor:loading?"not-allowed":"pointer",transition:"all 0.15s",whiteSpace:"nowrap",flexShrink:0}}
        onMouseEnter={e=>{if(!loading)e.currentTarget.style.background=bgHover;}}
        onMouseLeave={e=>{e.currentTarget.style.background=bgLeave;}}
      >
        {loading ? "..." : <><span className="premium-short">✨</span><span className="premium-full">{tb('unlockPremium')}</span></>}
      </button>
    );
  }

  return(
    <div style={{background:"linear-gradient(135deg,#1D9E7508,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:11,fontWeight:800,background:"rgba(29,158,117,0.08)",color:"#0F6E56",borderRadius:99,padding:"4px 12px",border:"1px solid rgba(29,158,117,0.18)"}}>🎁 {lang==='fr'?'7 jours gratuits · Sans CB':'7 days free · No charge today'}</div>
      <CtaPremium
        onClick={handleCheckout}
        label={loading ? tb('redirection') : `✨ ${tb('unlockPremium')}`}
        disabled={loading}
        sub={lang==='fr'?'puis 9,99€/mois · Sans engagement.':'then €9.99/month · No commitment.'}
      />
    </div>
  );
}

function IAPUpgradeBlock({ lang, iapProduct, iapLoading, onPurchase, onRestore }) {
  return (
    <div style={{background:"linear-gradient(135deg,#1D9E7508,#E8956D08)",border:"1px solid rgba(232,149,109,0.22)",borderRadius:14,padding:"16px 18px",display:"flex",flexDirection:"column",gap:10,alignItems:"center",textAlign:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:11,fontWeight:800,background:"rgba(29,158,117,0.08)",color:"#0F6E56",borderRadius:99,padding:"4px 12px",border:"1px solid rgba(29,158,117,0.18)"}}>
        🎁 {lang==='fr'?'7 jours gratuits · Sans CB':'7 days free · No charge today'}
      </div>
      {iapProduct&&(
        <div style={{fontSize:11,color:"#9CA3AF",fontWeight:600}}>
          {lang==='fr'?'puis ':'then '}{iapProduct.priceString} / {lang==='fr'?'mois':'month'}
        </div>
      )}
      <CtaPremium
        onClick={onPurchase}
        label={iapLoading?(lang==='fr'?'Chargement...':'Loading...'):(lang==='fr'?'✨ Commencer l\'essai gratuit →':'✨ Start free trial →')}
        disabled={iapLoading}
        sub={iapProduct
          ?(lang==='fr'?`puis ${iapProduct.priceString}/mois · Sans engagement.`:`then ${iapProduct.priceString}/month · No commitment.`)
          :(lang==='fr'?'puis 9,99€/mois · Sans engagement.':'then €9.99/month · No commitment.')}
      />
      <button
        onClick={onRestore}
        disabled={iapLoading}
        style={{background:"transparent",border:"none",color:"#9CA3AF",fontSize:12,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}
      >
        {lang==='fr'?'Restaurer mes achats':'Restore purchases'}
      </button>
    </div>
  );
}

function CtaPremium({ onClick, label = "✨ Commencer l'essai gratuit →", disabled, sub }) {
  return (
    <>
      <button
        className="cta-premium"
        onClick={onClick}
        disabled={disabled}
        style={disabled ? {opacity:0.7,cursor:"not-allowed"} : undefined}
      >
        {label}
      </button>
      <div className="cta-premium-sub">
        {sub || "Puis 9,99 €/mois — annulable à tout moment"}
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
    <div style={{fontSize:10,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{label}</div>
    <div style={{fontSize:22,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.03em",lineHeight:1}}>{value}</div>
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
          style={{background:"transparent",border:"none",outline:"none",color:C.text,fontSize:15,fontWeight:600,width:"100%",fontFamily:"inherit"}}/>
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
function mapItem(v){return{id:v.id,title:v.titre,prix_achat:v.prix_achat,buy:v.prix_achat,sell:v.prix_vente,margin:v.margin,marginPct:v.margin_pct,statut:v.statut,date:v.date,date_ajout:v.created_at||v.date_achat||v.date,marque:v.marque||"",description:v.description||"",type:v.type||"Autre",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,quantite:v.quantite||1,emplacement:v.emplacement||null};}

function stripMarque(nom,marque){
  if(!marque)return nom;
  const escaped=marque.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const cleaned=nom.replace(new RegExp(`\\b${escaped}\\b`,'gi'),'').replace(/\s+/g,' ').trim();
  return cleaned||nom;
}
function detectType(titre,marque){
  const t=((titre||'')+' '+(marque||'')).toLowerCase();
  // Luxury brands always take absolute priority over article type
  if(/louis.?vuitton|\blv\b|gucci|hermès|hermes|chanel|dior|prada|balenciaga|givenchy|saint.?laurent|\bysl\b|burberry|versace|fendi|celine|céline|bottega.?veneta|valentino|moncler|off.?white|alexander.?mcqueen|vivienne.?westwood|rolex|omega|cartier|tag.?heuer|breitling|patek|audemars|richard.?mille|\biwc\b|birkin|kelly|speedy|neverfull|louboutin|jimmy.?choo|manolo|stone.?island|canada.?goose|ralph.?lauren|lacoste|tommy|boss|armani/i.test(t)) return 'Luxe';
  if(/robe|jupe|pull|jean|veste|manteau|chemise|blouse|short|legging|pantalon|top|t-shirt|cardigan|blouson|parka|doudoune|sweat|hoodie|débardeur|tunique|combinaison|kimono|salopette|bermuda|jogging|survêtement|maillot|bikini|lingerie|soutien|culotte|boxer|chaussette|collant|chaussure|basket|botte|sandale|espadrille|mocassin|sneaker|talon|ballerine|sac|pochette|portefeuille|ceinture|écharpe|foulard|casquette|chapeau|bonnet|gant|lunette|bijou|collier|bracelet|bague|montre|boucle|accessoire|imperméable|pyjama|nuisette|robe.?chambre|maillot.?bain|cap|bob|beret|turban|snood|mitaine|manchette|cravate|noeud.?papillon|bretelle|jarretelle|chaussure.?sport|derby|oxford|loafer|chelsea|compensée|plateforme|slip|string|monokini|playsuit|body|bustier|corset/i.test(t)) return 'Mode';
  if(/guitare|\bpiano\b|violon|\bbatterie\b(?!.{0,12}voiture)|\bsynthé\b|synthétiseur|ukulélé|trompette|saxophone|accordéon|contrebasse|clavier.?midi|pédale.?(?:effet|guitare|basse)|table.?(?:mix|mixage)|\bampli\b(?!.{0,10}voiture|.{0,10}\bauto\b)|\bvinyle\b|vinyl|platine.?(?:vinyle|disque|dj)|\bpartition\b|solfège|\bgibson\b|\bfender\b|\bmarshall\b|\bibanez\b|\bepiphone\b|les.?paul|stratocaster|telecaster|\bstrat\b|\bbasse\b|micro.?(?:studio|chant|enregistrement)|enceinte.?studio|moniteur.?studio/i.test(t)) return 'Musique';
  if(/iphone|samsung|huawei|xiaomi|oneplus|pixel|macbook|laptop|ordinateur|pc|computer|tablette|ipad|téléphone|smartphone|airpods|écouteur|casque|enceinte|jbl|bose|sony|beats|playstation|ps4|ps5|xbox|nintendo|switch|console|jeu.?video|manette|clavier|souris|écran|moniteur|imprimante|disque|ssd|ram|processeur|gopro|appareil.?photo|camera|objectif|drone|fitbit|garmin|apple.?watch|smartwatch|montre.?connect|tv|télévision|projecteur|home.?cinema|ampli|chargeur|cable|adaptateur|batterie.?externe|airpod|earbud|tws|true.?wireless|powerbank|hub|dock|station|chargeur.?sans.?fil|disque.?dur|clé.?usb|carte.?sd|webcam|micro|ring.?light|green.?screen|smart.?tv|android.?tv|chromecast|firestick|apple.?tv|box.?internet|routeur|répéteur.?wifi|alarme|camera.?surveillance|sonnette|imprimante.?3d|scanner|tablette.?graphique/i.test(t)) return 'High-Tech';
  if(/perceuse|visseuse|meuleuse|ponceuse|scie.?(?:circulaire|sauteuse|cloche)?|\bforet\b|tournevis|\bmarteau\b(?!.{0,6}piqueur)|interrupteur|disjoncteur|prise.?électrique|tableau.?électrique|fusible|\bmakita\b|\bdewalt\b|\bryobi\b|\bfacom\b|\bstanley.?(?!cup)|\bpinces?\b|mastic|enduit|joint.?(?:silicone|plomberie)|silicone.?(?:sanitaire|joint)|carrelage|lame.?parquet|papier.?peint|rouleau.?peinture|niveau.?(?:laser|bulle)|mètre.?ruban|cheville.?(?:plastique|béton|mur)|clé.?(?:plate|allen|mixte|dynamométrique)|boulons?(?!\s*éblouir)|\bétau\b|établi|serre.?joint/i.test(t)) return 'Bricolage';
  if(/tondeuse|débroussailleuse|taille.?haie|souffleur.?(?:feuilles|jardin)|tronçonneuse|sécateur|élagueuse|scarificateur|arrosoir|tuyau.?arrosage|asperseur|pompe.?jardin|\bbêche\b|\brateau\b|\bfourche\b(?!.{0,8}moto)|\bbinette\b|brouette|compost|\bterreau\b|engrais|graines?(?:\s+de\s+jardin)?|jardinage|\bhusqvarna\b|\bstihl\b(?!.{0,8}moto)/i.test(t)) return 'Jardin';
  if(/canapé|sofa|table|chaise|bureau|armoire|commode|lit|matelas|étagère|bibliothèque|meuble|lampe|luminaire|miroir|tableau|cadre|tapis|rideau|coussin|plaid|couette|drap|serviette|vase|bougie|déco|cuisine|assiette|bol|verre|tasse|cafetière|machine.?café|grille.?pain|mixeur|robot|poêle|casserole|ustensile|réfrigérateur|micro.?onde|pouf|banquette|ottomane|tabouret|bar|console|desserte|vaisselier|bahut|buffet|vitrine|applique|suspension|guirlande|led|ampoule|parure|jeté|store|voilage|portant|cintre|organisateur|boite|panier|corbeille|plante|pot/i.test(t)) return 'Maison';
  if(/lego|playmobil|hasbro|mattel|jouet|jeu|puzzle|peluche|figurine|poupée|voiture.?miniature|construction|kapla|duplo|hot.?wheels|barbie/i.test(t)) return 'Jouets';
  if(/livre|bd|bande.?dessinée|manga|roman|magazine|comics|guide|encyclopédie|atlas|dictionnaire/i.test(t)) return 'Livres';
  if(/vélo|trottinette|skateboard|ski|snowboard|raquette|ballon|football|basketball|tennis|badminton|golf|rugby|natation|plongée|surf|kayak|randonnée|camping|sport|fitness|musculation|haltère|kettlebell|yoga|pilates|course|running|trail|cyclisme|équitation|boxe|arts.?martiaux|tapis.?course|vélo.?appartement|rameur|elliptique|corde.?sauter|élastique.?musculation|bande.?résistance|gant.?boxe|protège|casque.?vélo|genouillère|spike|crampon|patin|roller|tente|sac.?dos.?rando|gourde|frontale|bâton.?marche|canne.?pêche|moulinet|waders/i.test(t)) return 'Sport';
  if(/voiture|auto|moto|scooter|véhicule|pneu|jante|casque.?moto|pièce.?auto|autoradio|gps/i.test(t)) return 'Auto-Moto';
  if(/parfum|crème|sérum|mascara|rouge.?lèvre|palette|correcteur|dissolvant|vernis|shampooing|après-shampooing|masque.?cheveux|huile|lotion|gel.?douche|savon|rasoir|fond.?teint|bb.?cream|cc.?cream|cushion|anticernes|poudre|blush|bronzer|highlighter|fard.?paupières|eyeliner|crayon|kajal|extension.?cils|faux.?cils|sourcil|gloss|baume|exfoliant|gommage|peeling|autobronzant|spray.?solaire|after.?sun|déodorant|roll.?on|stick|eau.?de.?cologne|brosse|peigne|lisseur|boucleur|bigoudi|coton|lingette|démaquillant|tonique|brume/i.test(t)) return 'Beauté';  if(/collectionn|carte|timbre|monnaie|pièce|funko|vintage|antique|brocante/i.test(t)) return 'Collection';
  if(/aspirateur|robot.?aspirateur|roomba|dyson|lave.?linge|lave.?vaisselle|congélateur|four|hotte|plaque|induction|gazinière|sèche.?linge|sèche.?cheveux|fer.?repasser|climatiseur|ventilateur|radiateur|chauffage|chauffe.?eau|nespresso|dolce.?gusto|blender|robot.?cuisine|thermomix|friteuse|yaourtière|extracteur.?jus|centrifugeuse|bouilloire|épilateur|rasoir.?électrique|brosse.?dents/i.test(t)) return 'Électroménager';
  return 'Autre';
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
  { text: "J'ai acheté pour 40€ de vêtements à la brocante — un top bleu Zara taille L et un jean Levis en bon état", tag: "Ajouter",     cls: "add"   },
  { text: "J'ai acheté un lot de 20 paquets Pokémon pour 8€ au total, état neuf",                                      tag: "Lot",         cls: "add"   },
  { text: "J'ai vendu le jean Levis à 38€ avec 3€ de frais Vinted",                                                    tag: "Vendre",      cls: "sell"  },
  { text: "J'ai acheté une perceuse Makita 18V avec 2 batteries état correct pour 45€ et revendue 89€",                tag: "Achat+Vente", cls: "sell"  },
  { text: "Combien j'ai gagné ce mois-ci et quels sont mes articles les plus rentables ?",                              tag: "Stats",       cls: "query" },
  { text: "Qu'est-ce que j'ai comme articles Nike en stock et depuis combien de temps ?",                               tag: "Stock",       cls: "query" },
  { text: "Analyse mes profits et dis-moi sur quoi je dois me concentrer",                                             tag: "Analyse",     cls: "query" },
  { text: "J'ai acheté un sac Kelly Hermès vert petit modèle bon état pour 180€",                                      tag: "Ajouter",     cls: "add"   },
  { text: "J'ai vendu 5 paquets Pokémon à 12€ chacun sur Vinted avec 2€ de frais",                                     tag: "Vendre",      cls: "sell"  },
  { text: "Combien d'articles j'ai ajouté cette semaine et combien j'en ai vendu ?",                                    tag: "Stats",       cls: "query" },
];
const VOICE_EXAMPLES_EN_RAW = [
  { text: "I bought €40 worth of clothes at a flea market — a blue Zara top size L and a Levi's jeans in good condition", tag: "Add",      cls: "add"   },
  { text: "I bought a lot of 20 Pokémon packs for €8 total, brand new condition",                                          tag: "Lot",      cls: "add"   },
  { text: "I sold the Levi's jeans for €38 with €3 Vinted fees",                                                           tag: "Sell",     cls: "sell"  },
  { text: "I bought a Makita 18V drill with 2 batteries in decent condition for €45 and resold it for €89",                tag: "Buy+Sell", cls: "sell"  },
  { text: "How much did I earn this month and what are my most profitable items?",                                          tag: "Stats",    cls: "query" },
  { text: "What Nike items do I have in stock and how long have they been there?",                                          tag: "Stock",    cls: "query" },
  { text: "Analyze my profits and tell me what I should focus on",                                                          tag: "Analyze",  cls: "query" },
  { text: "I bought a small green Hermès Kelly bag in good condition for €180",                                             tag: "Add",      cls: "add"   },
  { text: "I sold 5 Pokémon packs at €12 each on Vinted with €2 fees",                                                     tag: "Sell",     cls: "sell"  },
  { text: "How many items did I add this week and how many did I sell?",                                                    tag: "Stats",    cls: "query" },
];
const VOICE_EXAMPLES = VOICE_EXAMPLES_FR_RAW;
const VOICE_EXAMPLES_EN = VOICE_EXAMPLES_EN_RAW;

function getRotatingExamples(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? VOICE_EXAMPLES_EN_RAW : VOICE_EXAMPLES_FR_RAW;
  if (sym === '€') return raw;
  return raw.map(e => ({ ...e, text: e.text.replace(/€/g, sym) }));
}
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
  {title:'Sac Kelly Hermès',     type:'Luxe',       marque:'Hermès',  buy:125, qty:1,  days:1},
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15,  qty:1,  days:null},
];
const SKELETON_SOLD=[
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15, sell:38, margin:23, marginPct:61},
  {title:'Perceuse Makita 18V',  type:'High-Tech',  marque:'Makita',  buy:45, sell:89, margin:44, marginPct:49},
  {title:'Paquet Pokémon ×5',    type:'Collection', marque:'Pokémon', buy:2,  sell:15, margin:13, marginPct:87},
];
const TEXTAREA_PLACEHOLDERS=VOICE_EXAMPLES.map(e=>e.text);
function mapSale(v){return{id:v.id,title:v.titre,prix_vente:v.prix_vente,buy:v.prix_achat,sell:v.prix_vente,ship:0,margin:v.benefice,marginPct:v.prix_vente>0?(v.benefice/v.prix_vente)*100:0,date:v.date,date_vente:v.date||v.created_at,marque:v.marque||"",type:v.type||"",purchaseCosts:v.purchase_costs||0,sellingFees:v.selling_fees||0,description:v.description||null,emplacement:v.emplacement||null};}

// Groups consecutive rows with same title+date+sell price into one display row
function groupSales(arr){
  const groups=[];
  for(const s of arr){
    const last=groups[groups.length-1];
    if(last&&last.title===s.title&&last.date===s.date&&Math.abs((last.sell||0)-(s.sell||0))<0.01){
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

function DealScoreCard({result,analysis,analysisLoading,lang}){
  const [barsAnim,setBarsAnim]=useState(false);
  useEffect(()=>{
    if(!result) return;
    setBarsAnim(false);
    const t=setTimeout(()=>setBarsAnim(true),80);
    return()=>clearTimeout(t);
  },[result?.score]);
  if(!result) return null;
  const {score,label,confidence,dataQuality,dimensions,pills}=result;
  const scoreClass=score>=7?'#1D9E75':score>=4?'#F9A26C':'#E53E3E';
  const dimLabels=lang==='en'
    ?{profitPotentiel:'Profit potential',liquidite:'Liquidity',safety:'Safety',upside:'Upside'}
    :{profitPotentiel:'Potentiel profit',liquidite:'Liquidité',safety:'Sécurité',upside:'Upside'};
  return(
    <div style={{background:'#fff',borderRadius:16,border:'1px solid #ECF0F4',boxShadow:'0 1px 4px rgba(0,0,0,0.05),0 4px 16px rgba(0,0,0,0.04)',padding:'16px 18px',display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:'#A3A9A6',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>Deal Score</div>
          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
            <span className="score-num" style={{color:scoreClass}}>{score.toFixed(1)}</span>
            <span style={{fontSize:13,color:'#A3A9A6',fontWeight:600}}>/10</span>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="score-tag" style={{background:scoreClass+'18',color:scoreClass,border:`1px solid ${scoreClass}33`}}>{label}</div>
          <div style={{fontSize:10,color:'#A3A9A6',fontWeight:600,marginTop:6}}>{lang==='en'?`${confidence}% confidence`:`${confidence}% confiance`}</div>
        </div>
      </div>
      <div className="bar-block">
        {Object.entries(dimensions).map(([key,val])=>(
          <div key={key} className="bar-row">
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontSize:11,fontWeight:700,color:'#6B7280'}}>{dimLabels[key]}</span>
              <span style={{fontSize:11,fontWeight:800,color:'#0D0D0D'}}>{val}/10</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{width:barsAnim?`${val*10}%`:'0%'}}/>
            </div>
          </div>
        ))}
      </div>
      {pills.length>0&&(
        <div className="tag-row">
          {pills.map((pill,i)=>(
            <span key={i} style={{background:'#E8F5F0',color:'#1D9E75',borderRadius:99,padding:'4px 10px',fontSize:11,fontWeight:700,border:'1px solid #C6E8DF'}}>{pill}</span>
          ))}
        </div>
      )}
      <div className="ai-insight">
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
          <span style={{width:7,height:7,borderRadius:'50%',background:'#4ECDC4',display:'inline-block',flexShrink:0}}/>
          <span style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.07em'}}>{lang==='en'?'AI Analysis':'Analyse IA'}</span>
        </div>
        {analysisLoading?(
          <div style={{display:'flex',gap:6,alignItems:'center',paddingTop:2}}>
            {[60,90,50].map((w,i)=><span key={i} style={{width:w,height:10,background:'#E5E7EB',borderRadius:4,display:'inline-block'}}/>)}
          </div>
        ):analysis?(
          <div style={{fontSize:12,fontWeight:600,color:'#374151',lineHeight:1.6}} dangerouslySetInnerHTML={renderMd(analysis)}/>
        ):(
          <div style={{fontSize:11,color:'#A3A9A6',fontStyle:'italic'}}>{lang==='en'?'Analysis not available':'Analyse non disponible'}</div>
        )}
      </div>
      {dataQuality==='low'&&(
        <div style={{fontSize:10,color:'#A3A9A6',fontWeight:600}}>
          {lang==='en'?'Limited precision — add more sales to improve':'Précision limitée — ajoute des ventes pour améliorer'}
        </div>
      )}
    </div>
  );
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
      <div style={{fontSize:12,fontWeight:800,color:'#0D0D0D',marginBottom:14}}>
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
                <div style={{width:32,flexShrink:0,fontSize:11,fontWeight:800,color:'#0D0D0D',textAlign:'right'}}>
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

function VoiceTicker({ lang = 'fr', currency = 'EUR' }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const stateRef = useRef({ char: 0, mode: "type" });

  useEffect(() => {
    stateRef.current = { char: 0, mode: "type" };
    setText("");
    let alive = true;
    let timer;
    const examples = getRotatingExamples(currency, lang);
    const tick = () => {
      if (!alive) return;
      const cur = examples[idx];
      const s = stateRef.current;
      if (s.mode === "type") {
        s.char++;
        setText(cur.text.slice(0, s.char));
        if (s.char >= cur.text.length) { s.mode = "hold"; timer = setTimeout(tick, 1800); return; }
        timer = setTimeout(tick, 32 + Math.random() * 30);
      } else if (s.mode === "hold") {
        s.mode = "erase";
        timer = setTimeout(tick, 30);
      } else {
        s.char -= 3;
        setText(cur.text.slice(0, Math.max(0, s.char)));
        if (s.char <= 0) { s.char = 0; s.mode = "type"; setIdx(i => (i + 1) % examples.length); }
        else { timer = setTimeout(tick, 14); }
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [idx, lang, currency]);

  const examples = getRotatingExamples(currency, lang);
  const cur = examples[idx % examples.length];
  return (
    <div className="voice-ticker">
      <span className="vt-quote">«</span>
      <span className="vt-text">{text}</span>
      <span className="vt-cursor" />
      <span className={`vt-tag ${cur.cls}`}>{cur.tag}</span>
    </div>
  );
}

function VoiceZone({ lang = 'fr', currency = 'EUR' }) {
  const { t } = useTranslation(lang);
  return (
    <div className="voice-zone">
      <div className="vz-prompt">
        {t('voiceZonePrompt')} <b>{t('voiceZoneHint')}</b>
      </div>
      <VoiceTicker lang={lang} currency={currency} />
    </div>
  );
}

function EmptyStateDashboard({ lang, onTryVoice, onAddManual, onPremium }) {
  return (
    <div className="empty-hero">
      <div className="empty-hero-art">🎙️</div>
      <h1>{lang==='en' ? "Talk, the AI does the rest." : "Parle, l'IA fait le reste."}</h1>
      <p>
        {lang==='en'
          ? <><>No forms, no tutorial. </><b>You talk, the AI understands.</b></>
          : <><>Pas de formulaire, pas de tutoriel. </><b>Tu parles, l'IA comprend.</b></>
        }
      </p>
      <VoiceTicker lang={lang}/>
      <div className="voice-categories">
        <div className="voice-cat" style={{cursor:"pointer"}} onClick={onAddManual}><div className="ico">➕</div><div className="lbl">{lang==='en'?'Add':'Ajouter'}</div></div>
        <div className="voice-cat" style={{cursor:"pointer"}} onClick={onAddManual}><div className="ico">💰</div><div className="lbl">{lang==='en'?'Sell':'Vendre'}</div></div>
        <div className="voice-cat" style={{cursor:"pointer"}} onClick={onAddManual}><div className="ico">🔍</div><div className="lbl">{lang==='en'?'Ask':'Demander'}</div></div>
      </div>
      <div className="empty-hero-cta-stack">
        <button className="cta-premium" onClick={onTryVoice}>
          🎙️ {lang==='en' ? 'Try voice AI' : 'Essayer le vocal IA'}
        </button>
        <button className="empty-hero-secondary" onClick={onAddManual}>
          ➕ {lang==='en' ? 'Add manually' : 'Ajouter manuellement'}
        </button>
      </div>
      <div style={{marginTop:'12px',borderRadius:'14px',border:'1px solid #e8e8e8',background:'#fafafa',padding:'12px 16px',fontSize:'13px',color:'#666',textAlign:'center'}}>
        <div style={{marginBottom:'6px',fontWeight:600,color:'#333',fontSize:'13px'}}>
          {lang==='fr'?'📋 Plan gratuit inclus':'📋 Free plan included'}
        </div>
        <div style={{marginBottom:'8px',lineHeight:'1.6'}}>
          📦 {lang==='fr'?'20 articles':'20 items'} &nbsp;·&nbsp;
          🎙️ {lang==='fr'?'5 vocaux/jour':'5 voice/day'} &nbsp;·&nbsp;
          📸 {lang==='fr'?'3 Lens/jour':'3 Lens/day'}
        </div>
        <button onClick={onPremium} className="cta-premium">
          ✨ Premium · 9,99€/mois &nbsp;—&nbsp;
          {lang==='fr'?'Tout illimité · 7j gratuits':'All unlimited · 7 days free'}
        </button>
      </div>
    </div>
  );
}

function FabVocal({ onClick, isRec, isThink, isRes, lang }) {
  const { t } = useTranslation(lang);
  if (isRes) return null;
  return (
    <div className="fab-wrap">
      <div className="fab-orbit" aria-hidden="true">
        <svg viewBox="0 0 120 120">
          <defs>
            <path
              id="fabOrbitPath"
              d="M 60,60 m -50,0 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0"
            />
          </defs>
          <text>
            <textPath href="#fabOrbitPath" startOffset="0">
              {t('fabOrbit')}
            </textPath>
          </text>
        </svg>
      </div>
      {isThink && (
        <div className="fab-think-toast">
          {lang === 'en' ? 'Thinking' : 'Je réfléchis'}
          <span className="fab-think-dots"><span/><span/><span/></span>
        </div>
      )}
      <button
        className={"fab-vocal" + (isRec ? " listening" : "") + (isThink ? " thinking" : "")}
        onClick={onClick}
        disabled={isThink}
        aria-label="Parler à l'IA"
        style={{touchAction:'manipulation'}}
      >
        {isThink
          ? <span style={{fontSize:22}}>⏳</span>
          : isRec
            ? <span className="fab-icon-blink">🎙️</span>
            : <span>🎙️</span>
        }
      </button>
      {!isThink&&<div className="fab-tooltip">{lang === 'en' ? 'Talk to your AI' : 'Parle à ton IA'}</div>}
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


function VoiceAssistant({items,sales,lang,currency='EUR',userCountry,actions,vaStep,setVaStep,vaResults,setVaResults,vaError,setVaError,markSold,deleteItem,triggerRef,isPremium=false,user=null,voiceUsedToday=0,setVoiceUsedToday}){
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
  const fmt=(amount,dec=null)=>formatCurrency(amount,currency,dec);
  const sym=CURRENCY_SYMBOLS[currency]||currency;

  function resetVA(){
    clearTimeout(autoCloseRef.current);
    clearTimeout(voiceAutoStopRef.current);
    try{if(vaMediaRef.current&&vaMediaRef.current.state!=="inactive")vaMediaRef.current.stop();}catch{}
    vaMediaRef.current=null;vaChunksRef.current=[];
    vaStreamRef.current?.getTracks().forEach(t=>t.stop());
    vaStreamRef.current=null;
    setVaStep("");setVaResults([]);setVaError(null);setVaEdits({});
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
      setVaError(lang==="en"?"Microphone unavailable. Check permissions in Settings > Fill & Sell.":"Microphone non disponible. Vérifiez les permissions dans Réglages > Fill & Sell.");setVaStep("");return;
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
          showVoiceToast(lang==='fr'
            ?"🔒 Limite atteinte · 5 vocaux/jour en gratuit"
            :"🔒 Daily limit reached · 5 voices/day on free plan");
          setVaStep("");
          return;
        }
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
          if(!tRes.ok)throw new Error(lang==="en"?"Transcription failed":"Transcription échouée");
          let tJson;try{tJson=await tRes.json();}catch{throw new Error(lang==="en"?"Invalid server response":"Réponse serveur invalide");}
          const{text,error:tErr}=tJson;
          if(tErr)throw new Error(tErr);
          if(!text?.trim())throw new Error(lang==="en"?"No speech detected":"Aucune parole détectée");
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
            if(fuResults.every(r=>r.status==="success")){autoCloseRef.current=setTimeout(()=>resetVA(),3500);}
            return;
          }
          // Snapshot du stock (articles non vendus) transmis à la edge function pour le matching IA
          const stockSnap=items.filter(i=>i.statut!=="vendu").map(i=>({id:i.id,nom:i.title||i.nom||"",marque:i.marque||null,type:i.type||null,description:i.description||null,emplacement:i.emplacement||null}));
          const iRes=await fetch(`${SURL}/functions/v1/voice-intent`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${vaToken}`,"apikey":supabaseAnonKey},body:JSON.stringify({text,lang,currency,items:stockSnap})});
          if(!iRes.ok)throw new Error(lang==="en"?"Intent failed":"Erreur intention");
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
          const{results}=await executeVoiceTasks(finalTasks,{items,sales,lang,currency,country:userCountry?.code??getCountryFallback(),actions,supabaseUrl:SURL,token:vaToken});
          // Store price_advice data for potential follow-up "ajoute le au stock"
          const paRes=results.find(r=>r.intent==="price_advice"&&r.status==="success");
          if(paRes?.taskData)setLastPriceAdviceData(paRes.taskData);
          else setLastPriceAdviceData(null);
          setVaResults(results);setVaStep("results");
          const QUICK_INTENTS=new Set(["inventory_add","inventory_sell","inventory_delete","inventory_update","inventory_lot"]);
          const isQuickOnly=results.every(r=>r.status==="success"&&QUICK_INTENTS.has(r.intent));
          if(isQuickOnly){
            autoCloseRef.current=setTimeout(()=>resetVA(),3500);
          }
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

  return(
    <>
      <style>{`
        @keyframes va-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        @keyframes va-pulse{0%,100%{box-shadow:0 0 0 0 rgba(229,62,62,0.5),0 4px 20px rgba(229,62,62,0.35)}50%{box-shadow:0 0 0 12px rgba(229,62,62,0),0 4px 20px rgba(229,62,62,0.35)}}
        @keyframes va-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes va-w1{0%,100%{height:4px}50%{height:16px}}
        @keyframes va-w2{0%,100%{height:8px}50%{height:24px}}
        @keyframes va-w3{0%,100%{height:12px}50%{height:32px}}
        @keyframes va-w4{0%,100%{height:6px}50%{height:20px}}
        @keyframes va-w5{0%,100%{height:10px}50%{height:28px}}
        @keyframes va-w6{0%,100%{height:5px}50%{height:18px}}
        @keyframes va-w7{0%,100%{height:9px}50%{height:22px}}
        @keyframes va-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes va-slidein{from{transform:translateY(100%)}to{transform:translateY(0)}}
      `}</style>

      {/* FAB */}
      <FabVocal onClick={handleFabClick} isRec={isRec} isThink={isThink} isRes={isRes} lang={lang} />

      {/* Voice remaining pill (free users, 1-2 left only) */}
      {!isPremium&&!isRec&&!isThink&&!isRes&&(()=>{
        const r=VOICE_FREE_LIMIT-voiceUsedToday;
        if(r<=2&&r>0)return(
          <div style={{position:"fixed",bottom:"calc(env(safe-area-inset-bottom,0px) + 130px)",left:"50%",transform:"translateX(-50%)",background:r===1?"#FEE2E2":"#FEF3C7",color:r===1?"#DC2626":"#D97706",borderRadius:20,padding:"5px 14px",zIndex:999,fontSize:12,fontWeight:700,whiteSpace:"nowrap",animation:"va-fadein 0.2s ease",pointerEvents:"none"}}>
            {r===1?(lang==='fr'?'⚠️ Dernier vocal du jour !':'⚠️ Last voice today!'):(lang==='fr'?`🎙️ ${r} vocaux restants`:`🎙️ ${r} voices left`)}
          </div>
        );
        return null;
      })()}

      {/* Voice gate toast */}
      <div style={{position:"fixed",bottom:"90px",left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.8)",color:"#fff",borderRadius:"20px",padding:"10px 20px",fontSize:"14px",fontWeight:500,zIndex:9999,opacity:voiceToast?1:0,transition:"opacity 0.3s ease",pointerEvents:"none",whiteSpace:"nowrap"}}>
        {voiceToast}
      </div>

      {/* Error bubble */}
      {vaError&&vaStep===""&&(
        <div style={{position:"fixed",bottom:"calc(env(safe-area-inset-bottom,0px) + 130px)",left:"50%",transform:"translateX(-50%)",background:"#1A1A1A",color:"#fff",borderRadius:12,padding:"10px 18px",boxShadow:"0 4px 20px rgba(0,0,0,0.25)",zIndex:999,fontSize:13,fontWeight:700,whiteSpace:"nowrap",animation:"va-fadein 0.2s ease",pointerEvents:"none"}}>
          {vaError}
        </div>
      )}

      {/* Results drawer */}
      {vaResults.length>0&&(
        <div ref={drawerRef}
          onTouchStart={e=>{
            swipeRef.current.startY=e.touches[0].clientY;
            swipeRef.current.active=(drawerRef.current?.scrollTop??0)===0;
          }}
          onTouchMove={e=>{
            if(!swipeRef.current.active)return;
            const dy=e.touches[0].clientY-swipeRef.current.startY;
            if(dy>0&&drawerRef.current){drawerRef.current.style.transition="none";drawerRef.current.style.transform=`translateY(${dy}px)`;}
          }}
          onTouchEnd={e=>{
            if(!swipeRef.current.active)return;
            const dy=e.changedTouches[0].clientY-swipeRef.current.startY;
            if(dy>60){resetVA();}
            else if(drawerRef.current){drawerRef.current.style.transition="transform 0.2s ease";drawerRef.current.style.transform="translateY(0)";}
          }}
          style={{position:"fixed",bottom:0,left:0,right:0,maxHeight:"min(70vh,700px)",overflowY:"auto",background:"#fff",borderRadius:"20px 20px 0 0",borderTop:"0.5px solid rgba(0,0,0,0.08)",padding:"16px 16px calc(env(safe-area-inset-bottom,0px) + 16px)",zIndex:1001,boxShadow:"0 -8px 40px rgba(0,0,0,0.12)",animation:"va-slidein 0.3s ease"}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
            <div style={{flex:1,display:"flex",justifyContent:"center"}}>
              <div style={{width:36,height:4,background:"rgba(0,0,0,0.12)",borderRadius:99}}/>
            </div>
            <button onClick={resetVA} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#6B7280",flexShrink:0}}>✕</button>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {vaResults.map((result,idx)=>{
              const{intent,status,data,message,taskData}=result||{};

              if(intent==="deal_score"&&!taskData?.prix_vente) return null;

              if(status==="error"||intent==="unknown"){
                return(<div key={idx} style={{background:"#F9FAFB",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.06)"}}><div style={{fontSize:13,color:"#6B7280",fontWeight:600}}>{message||(lang==="en"?"Didn't understand, try again":"Je n'ai pas compris, réessaie")}</div></div>);
              }

              if(status==="success"&&intent==="inventory_add"){
                const cat=data?.type||taskData?.categorie||taskData?.type;
                const ts=cat?getTypeStyle(cat):null;
                const qAdded=(data?.quantite||taskData?.quantite)>1?(data?.quantite||taskData?.quantite):null;
                const marque=data?.marque||taskData?.marque;
                const nom=data?.title||data?.nom||taskData?.nom;
                const prix=data?.buy??data?.prix_achat??taskData?.prix_achat;
                const desc=data?.description||taskData?.description||null;
                return(
                  <div key={idx} style={{background:"#E8F5F0",borderRadius:12,padding:"12px 14px",border:"1px solid #9FE1CB",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>✅</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#0F6E56"}}>{nom} {lang==="en"?"added":"ajouté"}{prix?` · ${fmt(prix)}`:""}{qAdded?` · ×${qAdded}`:""}</div>
                      {desc&&<div style={{fontSize:11,color:"#1D9E75",fontWeight:500,marginTop:2,opacity:0.85}}>{desc}</div>}
                      <div className="vr-pills" style={{marginTop:4}}>
                        {marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{marque}</span>}
                        {ts&&cat!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"1px 8px",fontSize:10,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {typeLabel(cat,lang)}</span>}
                      </div>
                    </div>
                  </div>
                );
              }

              if(status==="success"&&intent==="inventory_search"){
                const found=data?.items||[];
                const anyFormOpen=vaEdits[idx]?.sellOpen!=null||vaEdits[idx]?.deleteOpen!=null||vaEdits[idx]?.editOpen!=null;
                const CATS=["Mode","High-Tech","Maison","Électroménager","Luxe","Jouets","Livres","Sport","Auto-Moto","Beauté","Musique","Collection","Multimédia","Jardin","Bricolage","Autre"];
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{lang==="en"?"Search":"Résultats"} ({found.length})</div>
                    {found.length===0?(<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"No items found":"Aucun article trouvé"}</div>):(
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {found.map((item,i)=>{
                          const isSellOpen=vaEdits[idx]?.sellOpen===i;
                          const sellPrice=vaEdits[idx]?.sellPrice??"";
                          const sellFees=vaEdits[idx]?.sellFees??"";
                          const sellQty=vaEdits[idx]?.sellQty??1;
                          const sellPrixMode=vaEdits[idx]?.sellPrixMode??"total";
                          const sellFeesMode=vaEdits[idx]?.sellFeesMode??"total";
                          const isDeleteOpen=vaEdits[idx]?.deleteOpen===i;
                          const isEditOpen=vaEdits[idx]?.editOpen===i;
                          const ef=vaEdits[idx]?.editFields||{};
                          const isSold=item.statut==="vendu"||item.statut==="sold";
                          const nom=item.titre||item.title||item.nom||"";
                          const inputSt={fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.15)",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff",width:"100%"};
                          return(
                            <div key={i} style={{paddingBottom:6,borderBottom:i<found.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                              {/* Item row */}
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
                                <div style={{minWidth:0,flex:1}}>
                                  <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nom}</div>
                                  <div className="vr-pills" style={{marginTop:2}}>
                                    {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{item.marque}</span>}
                                    {(item.type||item.categorie)&&(item.type||item.categorie)!=="Autre"&&(()=>{const ts2=getTypeStyle(item.type||item.categorie);return<span style={{background:ts2.bg,color:ts2.color,borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:`1px solid ${ts2.border}`}}>{ts2.emoji} {typeLabel(item.type||item.categorie,lang)}</span>;})()}
                                    {(item.quantite||item.qty)>1&&<span style={{background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #E5E7EB"}}>×{item.quantite||item.qty}</span>}
                                  </div>
                                  {(item.description||item.desc)&&<div style={{fontSize:11,color:"#6B7280",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description||item.desc}</div>}
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginLeft:8}}>
                                  <div style={{textAlign:"right"}}>
                                    {isSold?(()=>{
                                      const fmtDate=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
                                      return(
                                        <>
                                          <div style={{fontSize:11,color:"#A3A9A6",textDecoration:"line-through"}}>{fmt(item.buy||item.prix_achat||0)}</div>
                                          <div style={{fontSize:13,fontWeight:700,color:"#1D9E75"}}>{(item.sell||item.prix_vente)?fmt(item.sell||item.prix_vente):"?"}</div>
                                          {item.date_vente&&<div style={{fontSize:10,color:"#1D9E75",marginTop:1}}>{lang==="en"?"sold on ":"vendu le "}{fmtDate(item.date_vente)}</div>}
                                        </>
                                      );
                                    })():(()=>{
                                      const days=item.date_ajout?Math.floor((Date.now()-new Date(item.date_ajout))/86400000):null;
                                      const fmtDate=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
                                      return(
                                        <>
                                          <div style={{fontSize:13,fontWeight:700,color:"#F9A26C"}}>{fmt(item.buy||item.prix_achat||0)}</div>
                                          {item.date_ajout&&<div style={{fontSize:10,color:"#A3A9A6",marginTop:1}}>{lang==="en"?`in stock since `:`en stock depuis le `}{fmtDate(item.date_ajout)}{days!==null?` (${days}${lang==="en"?"d":"j"})`:""}</div>}
                                        </>
                                      );
                                    })()}
                                  </div>
                                  {!anyFormOpen&&!isSold&&(
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{sellOpen:i,sellPrice:"",sellFees:"",sellQty:1,sellPrixMode:"total",sellFeesMode:"total"}}))}
                                      style={{fontSize:10,fontWeight:700,color:"#1D9E75",border:"1px solid #1D9E75",borderRadius:6,padding:"3px 7px",background:"transparent",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                                      {lang==="en"?"Mark as sold":"Marquer vendu"}
                                    </button>
                                  )}
                                  {isSold&&!anyFormOpen&&<span style={{fontSize:10,fontWeight:700,color:"#1D9E75"}}>{lang==="en"?"✓ sold":"✓ vendu"}</span>}
                                  {!anyFormOpen&&(
                                    <>
                                      <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{editOpen:i,editFields:{nom,prix_achat:item.prix_achat||item.buy||"",marque:item.marque||item.brand||"",type:item.type||item.categorie||""}}}))}
                                        style={{fontSize:10,fontWeight:700,color:"#1D9E75",border:"1px solid #1D9E75",borderRadius:6,padding:"3px 7px",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                                        ✏️
                                      </button>
                                      <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{deleteOpen:i}}))}
                                        style={{fontSize:10,fontWeight:700,color:"#E53E3E",border:"1px solid #E53E3E",borderRadius:6,padding:"3px 7px",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                                        ✕
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Sell form */}
                              {isSellOpen&&(
                                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
                                  {(item.quantite||1)>1&&(
                                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                                      <span style={{fontSize:11,color:"#6B7280",flex:1}}>{lang==="en"?"Qty to sell":"Qté à vendre"}</span>
                                      <input type="number" min={1} max={item.quantite} value={sellQty}
                                        onFocus={e=>e.target.select()}
                                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellQty:Math.max(1,Math.min(parseInt(e.target.value)||1,item.quantite))}}))}
                                        style={{width:60,fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.15)",borderRadius:7,padding:"5px 8px",textAlign:"center",fontFamily:"inherit"}}/>
                                      <span style={{fontSize:11,color:"#A3A9A6"}}>/ {item.quantite}</span>
                                    </div>
                                  )}
                                  {sellQty>1&&(
                                    <>
                                      <div style={{display:"flex",gap:4}}>
                                        {["total","unit"].map(m=>(
                                          <button key={m} onClick={()=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellPrixMode:m}}))}
                                            style={{flex:1,padding:"3px 0",fontSize:10,fontWeight:700,borderRadius:6,border:"1px solid #1D9E75",background:sellPrixMode===m?"#1D9E75":"transparent",color:sellPrixMode===m?"#fff":"#1D9E75",cursor:"pointer",fontFamily:"inherit"}}>
                                            {m==="total"?(lang==="en"?"Total price":"Prix total"):(lang==="en"?"Per unit":"Par unité")}
                                          </button>
                                        ))}
                                      </div>
                                      <div style={{display:"flex",gap:4}}>
                                        {["total","unit"].map(m=>(
                                          <button key={m} onClick={()=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellFeesMode:m}}))}
                                            style={{flex:1,padding:"3px 0",fontSize:10,fontWeight:700,borderRadius:6,border:"1px solid #F9A26C",background:sellFeesMode===m?"#F9A26C":"transparent",color:sellFeesMode===m?"#fff":"#F9A26C",cursor:"pointer",fontFamily:"inherit"}}>
                                            {m==="total"?(lang==="en"?"Fees on total":"Frais total"):(lang==="en"?"Fees/unit":"Frais/unité")}
                                          </button>
                                        ))}
                                      </div>
                                      {parseFloat(sellPrice)>0&&<div style={{fontSize:10,color:"#6B7280",textAlign:"center"}}>{sellPrixMode==="total"?`= ${fmt(parseFloat(sellPrice)/sellQty)}/${lang==='en'?'unit':'unité'}`:`= ${fmt(parseFloat(sellPrice)*sellQty)} total`}</div>}
                                    </>
                                  )}
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <div style={{display:"flex",gap:6,flex:1}}>
                                      <input type="number" value={sellPrice} autoFocus
                                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellPrice:e.target.value}}))}
                                        placeholder={lang==="en"?"Sale price (€)":"Prix de vente (€)"}
                                        style={{flex:2,fontSize:12,fontWeight:600,border:"1px solid #1D9E75",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                                      <input type="number" value={sellFees}
                                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],sellFees:e.target.value}}))}
                                        placeholder={lang==="en"?"Fees (€)":"Frais (€)"}
                                        style={{flex:1,fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.15)",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                                    </div>
                                    <button onClick={async()=>{
                                      const pv=parseFloat(sellPrice)||0;
                                      const pf=parseFloat(sellFees)||0;
                                      const qty=Math.max(1,Math.min(parseInt(sellQty)||1,item.quantite||1));
                                      const svUnit=sellPrixMode==="total"&&qty>1?pv/qty:pv;
                                      const sfUnit=sellFeesMode==="total"&&qty>1?pf/qty:pf;
                                      if(svUnit>0){
                                        await actions.confirmSellDirect(item,svUnit,sfUnit,qty);
                                        await actions.fetchAll();
                                      }
                                      setVaEdits(prev=>({...prev,[idx]:{sellOpen:null,sellPrice:"",sellFees:"",sellQty:1,sellPrixMode:"total",sellFeesMode:"total"}}));
                                    }} style={{fontSize:11,fontWeight:800,color:"#fff",background:"#1D9E75",border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                      {lang==="en"?"✓ Sold":"✓ Vendu"}
                                    </button>
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{sellOpen:null,sellPrice:"",sellFees:"",sellQty:1,sellPrixMode:"total",sellFeesMode:"total"}}))}
                                      style={{fontSize:11,color:"#6B7280",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,padding:"5px 8px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Delete confirm */}
                              {isDeleteOpen&&(
                                <div style={{background:"#FFF5F5",borderRadius:8,padding:"10px 12px",marginTop:6,border:"1px solid #FCA5A5"}}>
                                  <div style={{fontSize:12,fontWeight:700,color:"#0D0D0D",marginBottom:8}}>
                                    {lang==="en"?`Delete "${nom}"?`:`Supprimer "${nom}" ?`}
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <button onClick={()=>{
                                      actions.deleteItem(item.id);
                                      replaceResult(idx,{...result,data:{...data,items:data.items.filter((_,j)=>j!==i)}});
                                      setVaEdits(prev=>({...prev,[idx]:{deleteOpen:null}}));
                                    }} style={{flex:1,padding:"6px",background:"#E53E3E",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                                      {lang==="en"?"Delete":"Supprimer"}
                                    </button>
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{deleteOpen:null}}))}
                                      style={{flex:1,padding:"6px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,fontSize:12,fontWeight:600,color:"#6B7280",cursor:"pointer",fontFamily:"inherit"}}>
                                      {lang==="en"?"Cancel":"Annuler"}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Edit form */}
                              {isEditOpen&&(
                                <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:6}}>
                                  <div style={{display:"flex",gap:6}}>
                                    <input value={ef.nom??nom}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,nom:e.target.value}}}))}
                                      placeholder={lang==="en"?"Name":"Nom"}
                                      style={{...inputSt,flex:2}}/>
                                    <input type="number" value={ef.prix_achat??item.prix_achat??item.buy??""}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,prix_achat:e.target.value}}}))}
                                      placeholder={`${lang==="en"?"Price":"Prix"} ${sym}`}
                                      style={{...inputSt,flex:1}}/>
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <input value={ef.marque??item.marque??item.brand??""}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,marque:e.target.value}}}))}
                                      placeholder={lang==="en"?"Brand":"Marque"}
                                      style={{...inputSt,flex:1}}/>
                                    <select value={ef.type??item.type??item.categorie??""}
                                      onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editFields:{...ef,type:e.target.value}}}))}
                                      style={{...inputSt,flex:1}}>
                                      <option value="">{lang==="en"?"Category":"Catégorie"}</option>
                                      {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                                    </select>
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <button onClick={async()=>{
                                      try{
                                        const fields={
                                          titre:ef.nom!=null?ef.nom:nom,
                                          prix_achat:parseFloat(ef.prix_achat)||item.prix_achat||0,
                                          marque:ef.marque!=null?ef.marque||null:item.marque||null,
                                          type:ef.type||item.type||null,
                                        };
                                        await actions.updateItem(item.id,fields);
                                        replaceResult(idx,{...result,data:{...data,items:data.items.map((it,j)=>j===i?{...it,...fields}:it)}});
                                        actions.fetchAll();
                                        setVaEdits(prev=>({...prev,[idx]:{editOpen:null,editFields:{}}}));
                                      }catch(e){setVaEdits(prev=>({...prev,[idx]:{...prev[idx],editError:e.message}}));}
                                    }} style={{flex:1,padding:"6px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                                      ✓ {lang==="en"?"Save":"Sauvegarder"}
                                    </button>
                                    <button onClick={()=>setVaEdits(prev=>({...prev,[idx]:{editOpen:null,editFields:{}}}))}
                                      style={{flex:1,padding:"6px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,fontSize:12,fontWeight:600,color:"#6B7280",cursor:"pointer",fontFamily:"inherit"}}>
                                      {lang==="en"?"Cancel":"Annuler"}
                                    </button>
                                  </div>
                                  {vaEdits[idx]?.editError&&<div style={{fontSize:11,color:"#E53E3E"}}>{vaEdits[idx].editError}</div>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_query"){
                const aqIsProfit=taskData?.type==="profit";
                const aqV=data?.value??0;
                // Granularité réelle de la période pour adapter le commentaire
                const aqGran=(()=>{
                  const p=data?.periode;
                  if(p==="week")return"week";
                  if(p==="month")return"month";
                  if(p==="custom"){
                    const df=taskData?.date_from,dt=taskData?.date_to;
                    if(df&&dt){
                      if(df===dt)return"day";
                      const diffDays=Math.round((new Date(dt)-new Date(df))/86400000);
                      if(diffDays<=7)return"week";
                      if(diffDays<=31)return"month";
                      return"period"; // période longue > 31 jours
                    }
                  }
                  return"day";
                })();
                const aqComment=aqIsProfit?(()=>{
                  if(aqGran==="week"){
                    if(aqV>50)return lang==="en"?"Great week 🔥":"Super semaine 🔥";
                    if(aqV>10)return lang==="en"?"Good week 👍":"Bonne semaine 👍";
                    if(aqV>0)return lang==="en"?"Slow week 😊":"Petite semaine 😊";
                    if(aqV===0)return lang==="en"?"Empty week 💪":"Semaine blanche 💪";
                    return lang==="en"?"Week in the red 😬":"Semaine dans le rouge 😬";
                  }
                  if(aqGran==="month"){
                    if(aqV>50)return lang==="en"?"Great month 🔥":"Super mois 🔥";
                    if(aqV>10)return lang==="en"?"Good month 👍":"Bon mois 👍";
                    if(aqV>0)return lang==="en"?"Slow month 😊":"Petit mois 😊";
                    if(aqV===0)return lang==="en"?"Empty month 💪":"Mois blanc 💪";
                    return lang==="en"?"Month in the red 😬":"Mois dans le rouge 😬";
                  }
                  // période longue (> 31 jours) — commentaire neutre
                  if(aqGran==="period"){
                    if(aqV>50)return lang==="en"?"Great period 🔥":"Belle période 🔥";
                    if(aqV>10)return lang==="en"?"Good period 👍":"Bonne période 👍";
                    if(aqV>0)return lang==="en"?"Slow period 😊":"Petite période 😊";
                    if(aqV===0)return lang==="en"?"Empty period 💪":"Période blanche 💪";
                    return lang==="en"?"Period in the red 😬":"Période dans le rouge 😬";
                  }
                  // day (défaut)
                  if(aqV>50)return lang==="en"?"Great day 🔥":"Bonne journée 🔥";
                  if(aqV>10)return lang==="en"?"Not bad 👍":"Pas mal du tout 👍";
                  if(aqV>0)return lang==="en"?"Small win 😊":"Petit gain 😊";
                  if(aqV===0)return lang==="en"?"Nothing today 💪":"Rien aujourd'hui 💪";
                  return lang==="en"?"In the red 😬":"Dans le rouge 😬";
                })():null;
                // Label de période lisible
                const aqPeriode=(()=>{
                  const p=data?.periode;
                  if(!p||p==="all")return null;
                  if(p==="today")return lang==="en"?"Today":"Aujourd'hui";
                  if(p==="week")return lang==="en"?"Last 7 days":"7 derniers jours";
                  if(p==="month")return lang==="en"?"Last 30 days":"30 derniers jours";
                  if(p==="year")return lang==="en"?"This year":"Cette année";
                  if(p==="custom"){
                    const df=taskData?.date_from,dt=taskData?.date_to;
                    const fD=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit"}):"";
                    if(df&&dt&&df===dt)return fD(df);
                    if(df&&dt)return`${fD(df)} – ${fD(dt)}`;
                    return null;
                  }
                  return p;
                })();
                return(
                  <div key={idx} className="vr-profit-card">
                    <div style={{fontSize:12,fontWeight:600,color:"#A3A9A6",marginBottom:6}}>{data?.label}</div>
                    <div style={{fontSize:32,fontWeight:900,color:aqV<0?"#E53E3E":"#1D9E75",letterSpacing:"-0.03em"}}>{fmt(aqV)}</div>
                    {aqPeriode&&<div style={{fontSize:11,color:"#D1D5DB",marginTop:4}}>{aqPeriode}</div>}
                    {aqComment&&<div style={{fontSize:14,fontWeight:700,color:"#0D0D0D",marginTop:8}}>{aqComment}</div>}
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_best"&&data?.byCategory){
                const entries=Object.entries(data.byCategory);
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>{lang==="en"?"Best by category":"Meilleur par catégorie"}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {entries.map(([cat,s],i)=>(
                        <div key={i} style={{background:"#F5F6F5",borderRadius:10,padding:"10px 12px"}}>
                          <div style={{fontSize:10,fontWeight:800,color:"#A3A9A6",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{cat}</div>
                          <div style={{fontSize:12,fontWeight:700,color:"#0D0D0D",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title||s.titre}</div>
                          <div style={{fontSize:13,fontWeight:800,color:"#1D9E75"}}>+{fmt(Math.round((s.margin??s.benefice??s.prix_vente-s.prix_achat)*100)/100)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_best"){
                const top=data?.items||[];
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Top</div>
                    {top.map((s,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<top.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{i+1}. {s.title||s.titre}</div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:700,color:"#1D9E75"}}>{fmt(Math.round((s.margin||s.benefice||0)*100)/100)}</div><div style={{fontSize:10,color:"#A3A9A6"}}>{Math.round((s.marginPct||s.margin_pct||0)*10)/10}%</div></div>
                      </div>
                    ))}
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_dormant"){
                const dormant=data?.items||[];
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{lang==="en"?"Dormant":"Dormants"} ({dormant.length})</div>
                    {dormant.slice(0,6).map((item,i)=>{
                      const d=Math.floor((Date.now()-new Date(item.date_achat||item.created_at||item.date))/86400000);
                      return(<div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<Math.min(dormant.length,6)-1?"1px solid rgba(0,0,0,0.04)":"none"}}><div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{item.title||item.titre}</div><span style={{background:"#FFF4EE",color:"#F9A26C",border:"1px solid #FDDCB5",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0}}>{d}j</span></div>);
                    })}
                    {dormant.length>6&&<div style={{fontSize:11,color:"#A3A9A6",textAlign:"center",marginTop:4}}>+{dormant.length-6} {lang==="en"?"more":"autres"}</div>}
                  </div>
                );
              }

              if(status==="success"&&intent==="analytics_date"){
                const dateItems=data?.items||[];
                const adType=taskData?.type||"all";
                const adDate=taskData?.date||"";
                const fmtDs=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit"}):"";
                const dateLabel=fmtDs(adDate);
                // Header selon type achats/ventes
                const adHeader=(()=>{
                  const n=dateItems.length;
                  if(adType==="bought")return lang==="en"?`Bought on ${dateLabel} (${n})`:`Acheté le ${dateLabel} (${n})`;
                  if(adType==="sold")return lang==="en"?`Sold on ${dateLabel} (${n})`:`Vendu le ${dateLabel} (${n})`;
                  return lang==="en"?`On ${dateLabel} (${n})`:`Le ${dateLabel} (${n})`;
                })();
                // Message état vide
                const adEmpty=(()=>{
                  if(adType==="bought")return lang==="en"?"Nothing bought that day 🙂":"Rien acheté ce jour-là 🙂";
                  if(adType==="sold")return lang==="en"?"Nothing sold that day 🙂":"Rien vendu ce jour-là 🙂";
                  return lang==="en"?"Nothing recorded that day 🙂":"Rien enregistré ce jour-là 🙂";
                })();
                return(
                  <div key={idx} className="vr-profit-card" style={{textAlign:"left"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
                      {adType==="bought"?"🛒":adType==="sold"?"💸":"📅"} {adHeader}
                    </div>
                    {dateItems.length===0
                      ?<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{adEmpty}</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {dateItems.map((item,i)=>{
                          const isSold=item._type==="sold";
                          const nomItem=item.title||item.titre||"—";
                          const catItem=item.type||item.categorie||"Autre";
                          const tsItem=catItem?getTypeStyle(catItem):null;
                          const marqueItem=item.marque||"";
                          const empItem=item.emplacement||"";
                          const prixA=item.buy||item.prix_achat||0;
                          const prixV=item.sell||item.prix_vente||0;
                          const ben=item.margin??item.benefice??0;
                          return(
                            <div key={i} style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                              padding:"7px 0",borderBottom:i<dateItems.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                              <div style={{flex:1,minWidth:0,marginRight:10}}>
                                <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",overflow:"hidden",
                                  textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{nomItem}</div>
                                <div className="vr-pills" style={{marginTop:3}}>
                                  {marqueItem&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,
                                    padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>
                                    {marqueItem}</span>}
                                  {tsItem&&catItem&&catItem!=="Autre"&&<span style={{background:tsItem.bg,color:tsItem.color,
                                    borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,
                                    border:`1px solid ${tsItem.border}`}}>{tsItem.emoji} {typeLabel(catItem,lang)}</span>}
                                  {empItem&&<span style={{background:"#F3F4F6",color:"#6B7280",borderRadius:99,
                                    padding:"1px 7px",fontSize:10,fontWeight:600}}>📍 {empItem}</span>}
                                </div>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0}}>
                                {isSold?(
                                  <>
                                    <div style={{fontSize:12,fontWeight:700,color:"#1D9E75"}}>{fmt(prixV)}</div>
                                    <div style={{fontSize:11,color:"#A3A9A6",textDecoration:"line-through"}}>{fmt(prixA)}</div>
                                    <div style={{fontSize:11,fontWeight:700,color:ben>=0?"#1D9E75":"#E53E3E"}}>
                                      {ben>=0?"+":""}{fmt(Math.round(ben*100)/100)}</div>
                                  </>
                                ):(
                                  <div style={{fontSize:12,fontWeight:700,color:"#F9A26C"}}>{fmt(prixA)}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    }
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_sell"){
                // ── Cas no_match : article absent du stock → card "Vente directe" ──
                if(taskData?.no_match){
                  const pvDirect=parseFloat(taskData?.prix_vente)||0;
                  return(
                    <div key={idx} style={{background:"#fff",borderRadius:14,padding:"16px",border:"1px solid rgba(0,0,0,0.08)",display:"flex",flexDirection:"column",gap:12}}>
                      <div>
                        <div style={{fontWeight:800,fontSize:15,color:"#0D0D0D",marginBottom:4}}>{taskData?.nom||"Article"}</div>
                        <span style={{background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700}}>
                          {lang==="en"?"Direct sale — not in stock":"Vente directe — absent du stock"}
                        </span>
                      </div>
                      <div style={{background:"#F9FAFB",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:13,color:"#6B7280",fontWeight:600}}>{lang==="en"?"Cost":"Achat"} —</span>
                        <span style={{color:"#D1D5DB"}}>→</span>
                        <span style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>{lang==="en"?"Sale":"Vente"} {pvDirect>0?`${pvDirect.toFixed(2).replace(".",",")} €`:"—"}</span>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{
                          // Vente directe confirmée : insertion sans article inventaire
                          actions.addDirectSale({nom:taskData?.nom,marque:taskData?.marque,type:taskData?.type,description:taskData?.description,prix_vente:taskData?.prix_vente})
                            .then(()=>replaceResult(idx,{...result,status:"success",message:lang==="en"?"Sale recorded":"Vente enregistrée"}))
                            .catch(e=>replaceResult(idx,{...result,status:"error",message:e.message}));
                        }} style={{flex:1,padding:"13px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(29,158,117,0.3)"}}>
                          ✓ {lang==="en"?"Add sale":"Ajouter la vente"}
                        </button>
                        <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"13px 16px",background:"transparent",border:"1.5px solid rgba(0,0,0,0.12)",borderRadius:12,color:"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                      </div>
                    </div>
                  );
                }

                // ── Cas ambiguïté : plusieurs candidats, l'utilisateur choisit ──
                if(taskData?.candidates?.length>0){
                  return(
                    <div key={idx} style={{background:"#fff",borderRadius:14,padding:"16px",border:"1px solid rgba(0,0,0,0.08)",display:"flex",flexDirection:"column",gap:10}}>
                      <div style={{fontWeight:800,fontSize:14,color:"#0D0D0D"}}>
                        {lang==="en"?"Which item do you mean?":"Quel article veux-tu dire ?"}
                      </div>
                      {taskData.candidates.map((c,ci)=>{
                        // Même normalisation String() que pour matched_id
                        const cItem=items.find(i=>String(i.id)===String(c.id));
                        if(!cItem)return null;
                        const ts2=getTypeStyle(cItem.type);
                        return(
                          <button key={ci} onClick={()=>{
                            // Résoudre l'ambiguïté : on réinjecte le result avec l'ID sélectionné
                            replaceResult(idx,{...result,taskData:{...taskData,candidates:null,matched_id:c.id}});
                          }} style={{textAlign:"left",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E5E7EB",background:"#F9FAFB",cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",gap:4}}>
                            <div style={{fontWeight:700,fontSize:13,color:"#0D0D0D"}}>{cItem.title}</div>
                            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                              {cItem.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{cItem.marque}</span>}
                              {cItem.type&&cItem.type!=="Autre"&&<span style={{background:ts2.bg,color:ts2.color,borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:`1px solid ${ts2.border}`}}>{ts2.emoji} {cItem.type}</span>}
                              {cItem.emplacement&&<span style={{background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:600,border:"1px solid #E5E7EB"}}>📦 {cItem.emplacement}</span>}
                            </div>
                          </button>
                        );
                      })}
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px",background:"transparent",border:"1.5px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✕ {lang==="en"?"Cancel":"Annuler"}
                      </button>
                    </div>
                  );
                }

                // ── Cas normal : article identifié (matched_id) ou à confirmer ──
                const sellPv=vaEdits[idx]?.prix_vente??taskData?.prix_vente??null;
                const qv=taskData?.quantite_vendue||1;
                // Priorité à matched_id fourni par l'IA ; fallback keyword si absent.
                // String() normalise les deux côtés : Supabase retourne bigint en number,
                // mais l'IA peut retourner l'id en string → comparaison stricte échouerait.
                const found=taskData?.matched_id
                  ?items.find(i=>String(i.id)===String(taskData.matched_id)&&i.statut!=="vendu")
                  :items.find(i=>{if(i.statut==="vendu")return false;const q=(taskData?.nom||"").toLowerCase().trim();const t=(i.title||"").toLowerCase().trim();return q&&(t.includes(q)||q.includes(t));});
                const pv=parseFloat(sellPv)||0;
                const sf=parseFloat(taskData?.frais)||0;
                const buyU=found?(found.buy+(found.purchaseCosts||0)):0;
                const mgU=pv-buyU-sf;
                const mgpU=pv>0?(mgU/pv)*100:0;
                const ts=found?getTypeStyle(found.type):null;
                const daysInStock=found&&(found.date_ajout||found.date)?Math.floor((Date.now()-new Date(found.date_ajout||found.date).getTime())/(1000*60*60*24)):null;
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:14,padding:"16px",border:"1px solid rgba(0,0,0,0.08)",display:"flex",flexDirection:"column",gap:12}}>
                    {/* Article header */}
                    <div>
                      <div style={{fontWeight:800,fontSize:15,color:"#0D0D0D",marginBottom:6}}>{found?.title||taskData?.nom||"Article"}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                        {qv>1&&<span style={{background:"#1D9E75",color:"#fff",borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:800}}>×{qv}</span>}
                        {found?.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700,border:"1px solid #9FE1CB"}}>{found.marque}</span>}
                        {ts&&found?.type&&found.type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {found.type}</span>}
                        {daysInStock!==null&&<span style={{background:"#F3F4F6",color:"#6B7280",borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:600}}>{daysInStock}j en stock</span>}
                      </div>
                    </div>
                    {/* Prix achat → vente */}
                    <div style={{background:"#F9FAFB",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,color:"#6B7280",fontWeight:600}}>{lang==="en"?"Bought":"Achat"} {fmt(buyU)}</span>
                      <span style={{color:"#D1D5DB",fontWeight:400}}>→</span>
                      {pv>0
                        ?<span style={{fontSize:13,fontWeight:800,color:"#0D0D0D"}}>{lang==="en"?"Sell":"Vente"} {fmt(pv)}</span>
                        :<span style={{fontSize:12,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"Price to confirm":"Prix à confirmer"}</span>
                      }
                      {pv>0&&<span style={{marginLeft:"auto",fontWeight:900,fontSize:15,color:mgU>=0?"#1D9E75":"#EF4444"}}>{mgU>=0?"+":""}{fmt(mgU)} <span style={{fontSize:11,fontWeight:600,opacity:0.8}}>({fmtp(mgpU)})</span></span>}
                    </div>
                    {/* Champ prix si absent */}
                    {!taskData?.prix_vente&&(
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <input type="number" value={vaEdits[idx]?.prix_vente??""}
                          onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],prix_vente:parseFloat(e.target.value)||0}}))}
                          placeholder={lang==="en"?"Sell price (€)":"Prix de vente (€)"}
                          style={{flex:1,fontSize:14,fontWeight:700,border:"1.5px solid #1D9E75",borderRadius:10,padding:"10px 12px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff",outline:"none"}}/>
                      </div>
                    )}
                    {/* Boutons */}
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{
                        if(!found){replaceResult(idx,{...result,status:"error",message:lang==="en"?"Item not found":"Article non trouvé"});return;}
                        actions.confirmSellDirect(found,sellPv,taskData?.frais||0,qv)
                          .then(()=>replaceResult(idx,{...result,status:"success",message:lang==="en"?"Sale registered":"Vente enregistrée"}))
                          .catch(e=>replaceResult(idx,{...result,status:"error",message:e.message}));
                      }} style={{flex:1,padding:"13px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(29,158,117,0.3)"}}>
                        ✓ {lang==="en"?"Confirm sale":"Confirmer la vente"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"13px 16px",background:"transparent",border:"1.5px solid rgba(0,0,0,0.12)",borderRadius:12,color:"#6B7280",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_delete"){
                return(
                  <div key={idx} style={{background:"#FFF5F5",borderRadius:12,padding:"14px",border:"1px solid #FCA5A5"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",marginBottom:12}}>
                      {lang==="en"?`Delete ${taskData?.nom||"item"}?`:`Supprimer ${taskData?.nom||"l'article"} ?`}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>{
                        const q=(taskData?.nom||"").toLowerCase();
                        const found=items.find(i=>(i.title||"").toLowerCase().includes(q)&&q);
                        if(found){deleteItem(found.id);replaceResult(idx,{...result,status:"success",message:lang==="en"?"Deleted":"Supprimé"});}
                        else replaceResult(idx,{...result,status:"error",message:lang==="en"?"Item not found":"Article non trouvé"});
                      }} style={{flex:1,padding:"10px",background:"#E53E3E",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        {lang==="en"?"Delete":"Supprimer"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==="en"?"Cancel":"Annuler"}</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_add"){
                const confMarque=taskData?.marque||null;
                const rawNom=taskData?.nom??"";
                const nomSansMar=confMarque&&rawNom?rawNom.replace(new RegExp('(^|\\s)'+confMarque.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\s|$)','gi'),' ').replace(/\s+/g,' ').trim():rawNom;
                const editNom=vaEdits[idx]?.nom??nomSansMar;
                const editPrix=vaEdits[idx]?.prix??taskData?.prix_achat??"";
                const confCat=taskData?.categorie||null;
                const confTs=confCat?getTypeStyle(confCat):null;
                const confDesc=taskData?.description||null;
                const confEmplacement=taskData?.emplacement||null;
                const {loc:confLoc,rest:confDescRest}=parseLocDesc(confDesc);
                return(
                  <div key={idx} style={{background:"#F0FDF4",borderRadius:12,padding:"14px",border:"1px solid #86EFAC"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#15803D",marginBottom:8}}>➕ {lang==="en"?"New item":"Nouvel article"}</div>
                    {(confMarque||(confTs&&confCat!=="Autre"))&&(
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>
                        {confMarque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{confMarque}</span>}
                        {confTs&&confCat!=="Autre"&&<span style={{background:confTs.bg,color:confTs.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,border:`1px solid ${confTs.border}`}}>{confTs.emoji} {typeLabel(confCat,lang)}</span>}
                      </div>
                    )}
                    {confDescRest&&<div style={{fontSize:11,color:"#4B5563",fontWeight:500,marginBottom:confLoc?4:8,fontStyle:"italic",lineHeight:1.4}}>{confDescRest}</div>}
                    {confLoc&&<div style={{fontSize:11,color:"#6B7280",fontWeight:500,marginBottom:confEmplacement?4:8,lineHeight:1.4}}>📍 {confLoc}</div>}
                    {confEmplacement&&<div style={{fontSize:11,color:"#6B7280",fontWeight:500,marginBottom:8,lineHeight:1.4}}>📦 {confEmplacement}</div>}
                    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                      <input value={editNom}
                        onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],nom:e.target.value}}))}
                        placeholder={lang==="en"?"Name":"Nom"}
                        style={{fontSize:13,fontWeight:600,border:"1px solid rgba(0,0,0,0.12)",borderRadius:8,padding:"8px 10px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff",width:"100%"}}/>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <input type="number" value={editPrix}
                          onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],prix:parseFloat(e.target.value)||0}}))}
                          placeholder={lang==="en"?"Buy price":"Prix achat"}
                          style={{flex:1,fontSize:13,fontWeight:700,border:"1px solid rgba(0,0,0,0.12)",borderRadius:8,padding:"8px 10px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                        <span style={{fontSize:13,color:"#6B7280",fontWeight:600,flexShrink:0}}>{sym}</span>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={async()=>{
                        try{
                          await actions.addItem({...taskData,nom:editNom,prix_achat:editPrix||taskData?.prix_achat});
                          replaceResult(idx,{...result,status:"success",data:{nom:editNom,prix_achat:editPrix,marque:confMarque,type:confCat,description:confDesc},message:lang==="en"?"Item added":"Article ajouté"});
                        }catch(e){replaceResult(idx,{...result,status:"error",message:e.message});}
                      }} style={{flex:1,padding:"10px",background:"#1D9E75",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ {lang==="en"?"Confirm":"Confirmer"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==="en"?"Cancel":"Annuler"}</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_lot"){
                const lotItems=data?.items||[];
                return(
                  <div key={idx} style={{background:"#EFF6FF",borderRadius:12,padding:"14px",border:"1px solid #93C5FD"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#1D4ED8",marginBottom:10}}>🛍️ Lot — {fmt(data?.lotTotal||0)}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                      {lotItems.map((item,i)=>{
                        const editNom=vaEdits[idx]?.[i]?.nom??item.nom;
                        const editPrix=vaEdits[idx]?.[i]?.prix??item.prix_estime_lot;
                        return(
                          <div key={i} style={{display:"flex",flexDirection:"column",gap:3}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <input value={editNom}
                                onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],[i]:{...prev[idx]?.[i],nom:e.target.value}}}))}
                                style={{flex:1,fontSize:12,fontWeight:600,border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,padding:"5px 8px",fontFamily:"inherit",color:"#0D0D0D",background:"#fff"}}/>
                              <input type="number" value={editPrix}
                                onChange={e=>setVaEdits(prev=>({...prev,[idx]:{...prev[idx],[i]:{...prev[idx]?.[i],prix:parseFloat(e.target.value)||0}}}))}
                                style={{width:60,fontSize:12,fontWeight:700,border:"1px solid rgba(0,0,0,0.12)",borderRadius:7,padding:"5px 6px",fontFamily:"inherit",color:"#1D4ED8",background:"#fff",textAlign:"right"}}/>
                              <span style={{fontSize:12,color:"#1D4ED8",fontWeight:700,flexShrink:0}}>{sym}</span>
                            </div>
                            {(item.marque||item.categorie)&&(
                              <div style={{display:"flex",gap:4,paddingLeft:2}}>
                                {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{item.marque}</span>}
                                {(()=>{const _ts=getTypeStyle(item.categorie);return item.categorie&&item.categorie!=="Autre"&&<span style={{background:_ts.bg,color:_ts.color,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,flexShrink:0,border:`1px solid ${_ts.border}`}}>{_ts.emoji} {typeLabel(item.categorie,lang)}</span>;})()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={async()=>{
                        try{
                          const toAdd=lotItems.map((item,i)=>({
                            ...item,
                            nom:vaEdits[idx]?.[i]?.nom??item.nom,
                            prix_achat:vaEdits[idx]?.[i]?.prix??item.prix_estime_lot,
                          }));
                          for(const item of toAdd) await actions.addItem(item);
                          replaceResult(idx,{...result,status:"success",message:lang==="en"?`${toAdd.length} items added`:`${toAdd.length} articles ajoutés`});
                        }catch(e){replaceResult(idx,{...result,status:"error",message:e.message});}
                      }} style={{flex:1,padding:"10px",background:"#1D4ED8",color:"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ {lang==="en"?"Confirm add":"Confirmer ajout"}
                      </button>
                      <button onClick={()=>replaceResult(idx,{...result,status:"error",message:lang==="en"?"Cancelled":"Annulé"})} style={{padding:"10px 14px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:"#6B7280",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{lang==="en"?"Cancel":"Annuler"}</button>
                    </div>
                  </div>
                );
              }

              if(status==="pending_confirmation"&&intent==="inventory_update"){
                return(<div key={idx} style={{background:"#FFFBEB",borderRadius:12,padding:"14px",border:"1px solid #FDE68A"}}><div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",marginBottom:4}}>{lang==="en"?"Update:":"Mise à jour :"} {taskData?.nom} · {taskData?.field} → {taskData?.value}</div><div style={{fontSize:11,color:"#A3A9A6"}}>{lang==="en"?"Manual update required":"Mise à jour manuelle requise"}</div></div>);
              }

              if(status==="success"&&intent==="deal_score"){
                const{score,label,profitNet,margePercent,pills,dataQuality}=data||{};
                const sc=score>=8?"#1D9E75":score>=6.5?"#4ECDC4":score>=5?"#F9A26C":"#E53E3E";
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <div style={{fontSize:36,fontWeight:900,color:sc,letterSpacing:"-0.04em",lineHeight:1}}>{score}</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:800,color:sc}}>{label}</div>
                        <div style={{fontSize:11,color:"#A3A9A6"}}>{lang==="en"?"out of 10":"sur 10"}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:20,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:20,fontWeight:900,color:profitNet>=0?"#1D9E75":"#E53E3E"}}>{profitNet>0?"+":""}{fmt(profitNet)}</div>
                        <div style={{fontSize:10,color:"#A3A9A6",fontWeight:600}}>{lang==="en"?"Net profit":"Bénéfice net"}</div>
                      </div>
                      <div>
                        <div style={{fontSize:20,fontWeight:900,color:"#0D0D0D"}}>{margePercent}%</div>
                        <div style={{fontSize:10,color:"#A3A9A6",fontWeight:600}}>{lang==="en"?"Margin":"Marge"}</div>
                      </div>
                    </div>
                    {pills?.length>0&&(
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                        {pills.slice(0,2).map((p,i)=>(
                          <span key={i} style={{background:"#E8F5F0",color:"#0F6E56",border:"1px solid #9FE1CB",borderRadius:99,padding:"2px 10px",fontSize:10,fontWeight:700}}>{p}</span>
                        ))}
                      </div>
                    )}
                    {dataQuality==="low"&&(
                      <div style={{fontSize:10,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"Based on limited data":"Basé sur peu de données"}</div>
                    )}
                  </div>
                );
              }

              if(status==="success"&&intent==="inventory_sell"){
                const svUnit=parseFloat(String(data?.prix_vente??taskData?.prix_vente??0).replace(",","."))||0;
                const sfUnit=parseFloat(String(taskData?.frais??0).replace(",","."))||0;
                const qv=Math.max(1,(data?.quantite_vendue||taskData?.quantite_vendue||1));
                const nom=data?.nom||taskData?.nom||"";
                const q=nom.toLowerCase().trim();
                const soldItem=items.find(i=>{const t=(i.title||"").toLowerCase().trim();return q&&(t.includes(q)||q.includes(t));});
                const marque=soldItem?.marque||data?.marque||taskData?.marque||null;
                const type=soldItem?.type||null;
                const ts=type?getTypeStyle(type):null;
                const cogs=soldItem?(soldItem.buy+(soldItem.purchaseCosts||0)):0;
                const mgUnit=svUnit>0?svUnit-cogs-sfUnit:null;
                const mgpUnit=svUnit>0&&mgUnit!=null?(mgUnit/svUnit)*100:null;
                const totalSell=svUnit*qv;
                const totalProfit=mgUnit!=null?mgUnit*qv:null;
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:14,padding:"16px",border:"1px solid #9FE1CB",boxShadow:"0 1px 4px rgba(29,158,117,0.1)",display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:15}}>✅</span>
                      <span style={{fontSize:12,fontWeight:800,color:"#0F6E56",textTransform:"uppercase",letterSpacing:"0.06em"}}>{lang==="en"?"Sale registered":"Vente enregistrée"}</span>
                    </div>
                    <div style={{fontWeight:800,fontSize:15,color:"#0D0D0D"}}>{nom||"Article"}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {qv>1&&<span style={{background:"#1D9E75",color:"#fff",borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:800}}>×{qv}</span>}
                      {marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700,border:"1px solid #9FE1CB"}}>{marque}</span>}
                      {ts&&type&&type!=="Autre"&&<span style={{background:ts.bg,color:ts.color,borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700,border:`1px solid ${ts.border}`}}>{ts.emoji} {type}</span>}
                    </div>
                    <div style={{background:"#F0FDF4",borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{lang==="en"?"Sold for":"Prix de vente"}</div>
                        <div style={{fontSize:18,fontWeight:900,color:"#0D0D0D"}}>{fmt(totalSell)}</div>
                      </div>
                      {totalProfit!=null&&<div style={{textAlign:"right"}}>
                        <div style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2}}>{lang==="en"?"Profit":"Profit"}</div>
                        <div style={{fontSize:18,fontWeight:900,color:totalProfit>=0?"#1D9E75":"#EF4444"}}>{totalProfit>=0?"+":""}{fmt(totalProfit)} <span style={{fontSize:12,fontWeight:600,opacity:0.8}}>({fmtp(mgpUnit)})</span></div>
                      </div>}
                    </div>
                  </div>
                );
              }

              if(status==="success"&&intent==="query_stats"&&(data?.metric==="best_sales"||data?.metric==="worst_sales")){
                const sItems=data?.items||[];
                const isWorst=data?.metric==="worst_sales";
                const lim=data?.limit??sItems.length;
                const title=isWorst
                  ?(lim===1?(lang==="en"?"Worst sale":"Pire vente"):(lang==="en"?`${lim} worst sales`:`${lim} pires ventes`))
                  :(lim===1?(lang==="en"?"Best sale":"Meilleure vente"):(lang==="en"?`Top ${lim} sales`:`Top ${lim} ventes`));
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{isWorst?"📉":"🏆"} {title}</div>
                    {sItems.length===0
                      ?<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"No sales yet":"Aucune vente"}</div>
                      :sItems.map((s,i)=>{
                        const profit=Math.round((s._sortVal??s.margin??s.benefice??0)*100)/100;
                        return(
                          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<sItems.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D"}}>{lim>1?`${i+1}. `:""}{s.title||s.titre||s.nom}</div>
                            <div style={{fontSize:12,fontWeight:700,color:profit>=0?"#1D9E75":"#E53E3E"}}>{profit>0?"+":""}{fmt(profit)}</div>
                          </div>
                        );
                      })
                    }
                  </div>
                );
              }

              if(status==="success"&&intent==="query_stats"&&data?.metric==="stock_by_period"){
                const sbpItems=data?.items||[];
                const fmtDate=d=>d?new Date(d).toLocaleDateString(lang==="en"?"en-GB":"fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>📦 {lang==="en"?"In stock":"En stock"} ({data?.count??sbpItems.length})</div>
                    {sbpItems.length===0
                      ?<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"No items":"Aucun article"}</div>
                      :sbpItems.map((item,i)=>{
                        const days=item.date_ajout?Math.floor((Date.now()-new Date(item.date_ajout))/86400000):null;
                        return(
                          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:i<sbpItems.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title||item.titre}</div>
                            <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                              <div style={{fontSize:12,fontWeight:700,color:"#F9A26C"}}>{fmt(item.buy||item.prix_achat||0)}</div>
                              {item.date_ajout&&<div style={{fontSize:10,color:"#A3A9A6"}}>{lang==="en"?"since ":"depuis le "}{fmtDate(item.date_ajout)}{days!==null?` (${days}${lang==="en"?"d":"j"})`:""}</div>}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              }

              if(status==="success"&&intent==="query_stats"&&(data?.metric==="profit_mois"||data?.metric==="marge_moyenne"||data?.metric==="stock_immobilise"||data?.metric==="stock_count")){
                const metricEmoji={profit_mois:"💰",marge_moyenne:"📊",stock_immobilise:"🔒",stock_count:"📦"};
                const metricTitle={
                  profit_mois:lang==="en"?`Profit – ${data?.monthName}`:`Bénéfice – ${data?.monthName}`,
                  marge_moyenne:lang==="en"?"Avg margin":"Marge moyenne",
                  stock_immobilise:lang==="en"?"Locked capital":"Stock immobilisé",
                  stock_count:lang==="en"?"Items in stock":"Articles en stock",
                };
                const isCurrency=data?.metric!=="marge_moyenne"&&data?.metric!=="stock_count";
                const suffix=isCurrency?"":data?.metric==="stock_count"?"":"%";
                const val=data?.value??0;
                const valColor=data?.metric==="stock_immobilise"?"#F9A26C":val>=0?"#1D9E75":"#E53E3E";
                const displayVal=isCurrency?(val>0?"+":"")+fmt(val):val+suffix;
                const qsComment=data?.metric==="profit_mois"
                  ?(val>50?(lang==="en"?"Great month 🔥":"Super mois 🔥")
                    :val>10?(lang==="en"?"Good month 👍":"Bon mois 👍")
                    :val>0?(lang==="en"?"Slow month 😊":"Petit mois 😊")
                    :val===0?(lang==="en"?"Empty month 💪":"Mois blanc 💪")
                    :(lang==="en"?"Month in the red 😬":"Mois dans le rouge 😬"))
                  :null;
                return(
                  <div key={idx} className="vr-profit-card">
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",marginBottom:8}}>{metricEmoji[data?.metric]} {metricTitle[data?.metric]}</div>
                    <div style={{fontSize:28,fontWeight:900,color:valColor,letterSpacing:"-0.03em"}}>{displayVal}</div>
                    {data?.metric==="stock_immobilise"&&<div style={{fontSize:11,color:"#A3A9A6",marginTop:4}}>{data?.count} {lang==="en"?"item(s) in stock":"article(s) en stock"}</div>}
                    {qsComment&&<div style={{fontSize:14,fontWeight:700,color:"#0D0D0D",marginTop:8}}>{qsComment}</div>}
                  </div>
                );
              }

              if(status==="success"&&intent==="off_topic"){
                return(<div key={idx} style={{background:"#F9FAFB",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(0,0,0,0.08)"}}><div style={{fontSize:13,fontWeight:600,color:"#6B7280",lineHeight:1.5}}>{message}</div></div>);
              }

              if(status==="success"&&intent==="location_items"){
                const locItems=data?.items||[];
                const locEmp=data?.emplacement||taskData?.emplacement||"";
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(0,0,0,0.08)"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>📦 {locEmp} — {locItems.length} {lang==="en"?"item(s)":"article(s)"}</div>
                    {locItems.length===0
                      ?(<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic"}}>{lang==="en"?"No items found":"Aucun article trouvé"}</div>)
                      :(<div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {locItems.map((item,i)=>{
                            const ts2=item.type?getTypeStyle(item.type):null;
                            return(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:i<locItems.length-1?"1px solid rgba(0,0,0,0.04)":"none"}}>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:13,fontWeight:700,color:"#0D0D0D",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                                  <div className="vr-pills" style={{marginTop:2}}>
                                    {item.marque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:"1px solid #9FE1CB"}}>{item.marque}</span>}
                                    {ts2&&item.type&&item.type!=="Autre"&&<span style={{background:ts2.bg,color:ts2.color,borderRadius:99,padding:"1px 7px",fontSize:10,fontWeight:700,border:`1px solid ${ts2.border}`}}>{ts2.emoji} {typeLabel(item.type,lang)}</span>}
                                  </div>
                                </div>
                                <div style={{fontSize:13,fontWeight:700,color:"#F9A26C",flexShrink:0}}>{fmt(item.prix_achat||item.buy||0)}</div>
                              </div>
                            );
                          })}
                        </div>)
                    }
                  </div>
                );
              }

              /* Rendu "où j'ai rangé X" — affichage riche avec pills */
              if(status==="success"&&intent==="inventory_location"){
                const locTitle=data?.title||taskData?.nom||"";
                const locEmp=data?.emplacement||null;
                const locMarque=data?.marque||null;
                const locType=data?.type||null;
                const locDesc=data?.description||null;
                const locVille=data?.ville||null;
                const locQte=data?.quantite||null;
                const tsLoc=locType?getTypeStyle(locType):null;
                return(
                  <div key={idx} className="vr-profit-card" style={{textAlign:"left"}}>
                    <div style={{fontSize:12,fontWeight:800,color:"#6B7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
                      📦 {lang==="en"?"Stored here":"Rangé ici"}
                    </div>
                    <div style={{fontSize:15,fontWeight:800,color:"#0D0D0D",marginBottom:8}}>{locTitle}</div>
                    {(locEmp||locMarque||tsLoc||locQte>1)&&(
                      <div className="vr-pills">
                        {locEmp&&<span style={{background:"#F3F4F6",color:"#374151",borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700,border:"1px solid #E5E7EB"}}>📦 {locEmp}</span>}
                        {locMarque&&<span style={{background:"#E8F5F0",color:"#1D9E75",borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700,border:"1px solid #9FE1CB"}}>{locMarque}</span>}
                        {tsLoc&&locType&&locType!=="Autre"&&<span style={{background:tsLoc.bg,color:tsLoc.color,borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700,border:`1px solid ${tsLoc.border}`}}>{tsLoc.emoji} {typeLabel(locType,lang)}</span>}
                        {/* Pill quantité — fond orange clair, même style que le stock */}
                        {locQte>1&&<span style={{background:"#FFF4EE",color:"#F9A26C",borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:700,border:"1px solid rgba(249,162,108,0.3)"}}>×{locQte}</span>}
                      </div>
                    )}
                    {/* Description tronquée sur 1 ligne */}
                    {locDesc&&<div style={{fontSize:12,color:"#6B7280",marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{locDesc}</div>}
                    {locVille&&<div style={{fontSize:12,color:"#A3A9A6",marginTop:4}}>📍 {locVille}</div>}
                    {!locEmp&&<div style={{fontSize:13,color:"#A3A9A6",fontStyle:"italic",marginTop:6}}>{lang==="en"?"No location saved 🙂":"Aucun emplacement enregistré 🙂"}</div>}
                  </div>
                );
              }

              if(status==="success"&&(intent==="business_advice"||intent==="price_advice"||intent==="price_question"||intent==="buy_advice")){
                const label=intent==="buy_advice"
                  ?(lang==="en"?"🛒 Buy Analysis":"🛒 Analyse achat")
                  :intent==="price_advice"||intent==="price_question"
                  ?(lang==="en"?"💰 Price Advice":"💰 Conseil prix")
                  :(lang==="en"?"🤖 Business Advice":"🤖 Analyse personnalisée");
                const raw=data?.analysis||message||"";
                return(
                  <div key={idx} style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid rgba(0,0,0,0.08)",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#1D9E75",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:10}}>{label}</div>
                    <div style={{fontSize:13,color:"#0D0D0D",lineHeight:1.7,fontWeight:500,whiteSpace:"pre-wrap"}}>{raw.replace(/\*\*/g,"").replace(/\*/g,"")}</div>
                  </div>
                );
              }

              if(status==="success"){
                return(<div key={idx} style={{background:"#E8F5F0",borderRadius:12,padding:"12px 14px",border:"1px solid #9FE1CB"}}><div style={{fontSize:13,fontWeight:600,color:"#0F6E56"}}>✅ {message}</div></div>);
              }

              return null;
            })}
          </div>
        </div>
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
  const [loginError,setLoginError]=useState("");
  const [resetStep,setResetStep]=useState(0);
  const [forgotMode,setForgotMode]=useState(false);
  const [forgotMsg,setForgotMsg]=useState("");
  const [isPremium,setIsPremium]=useState(false);
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
  const [firstItemAdded,setFirstItemAdded]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
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
  const [dealScore,setDealScore]=useState(null);
  const [dealAnalysis,setDealAnalysis]=useState(null);
  const [dealAnalysisLoading,setDealAnalysisLoading]=useState(false);
  const dealAnalysisTimer=useRef(null);
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
  const LENS_FREE_LIMIT=3;
  useEffect(()=>{
    const _id=setInterval(()=>{
      setLensPlaceholderFade(false);
      setTimeout(()=>{setLensPlaceholderIdx(i=>(i+1)%LENS_PLACEHOLDERS_FR.length);setLensPlaceholderFade(true);},300);
    },3000);
    return()=>clearInterval(_id);
  },[]);
  useEffect(()=>{
    fetch("https://ipapi.co/json/")
      .then(r=>r.ok?r.json():null)
      .then(d=>{if(d?.country_code)setUserCountry({code:d.country_code,name:d.country_name});})
      .catch(()=>{});
  },[]);
  const [isRecording,setIsRecording]=useState(false);
  const [voiceText,setVoiceText]=useState("");
  const [voicePlaceholderIdx,setVoicePlaceholderIdx]=useState(0);
  const [voiceLoading,setVoiceLoading]=useState(false);
  const [voiceStep,setVoiceStep]=useState("");
  const [voiceParsed,setVoiceParsed]=useState(null);
  const [voiceError,setVoiceError]=useState(null);
  useEffect(()=>{if(!voiceError)return;const t=setTimeout(()=>{setVoiceError(null);setVoiceStep("");},4000);return()=>clearTimeout(t);},[voiceError]);
  const [showManualForm,setShowManualForm]=useState(false);
  useEffect(()=>{
    const t=setInterval(()=>setVoicePlaceholderIdx(i=>(i+1)%TEXTAREA_PLACEHOLDERS.length),4000);
    return()=>clearInterval(t);
  },[]);
  const mediaRecorderRef=useRef(null);
  const audioChunksRef=useRef([]);
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
    if(user?.id) await supabase.from('profiles').update({currency:code}).eq('id',user.id);
  }
  async function triggerCheckout(){
    try{
      const{data:{session}}=await supabase.auth.getSession();
      const token=session?.access_token;
      const res=await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':supabaseAnonKey},body:JSON.stringify({email:user.email})});
      const body=await res.json();
      const{url,error}=body;
      if(error)throw new Error(error);
      track('begin_checkout', { currency: 'EUR', value: 9.99 });
      console.log('[checkout] redirecting to:', url);
      window.location.href=url;
    }catch(e){
      console.error('[checkout] error:', e);
      alert("Erreur : "+e.message);
    }
  }

  async function handleIAPPurchase(){
    setIapLoading(true);
    try{
      const hasPremium=await purchasePremium();
      if(hasPremium){
        await supabase.from('profiles').update({is_premium:true}).eq('id',user.id);
        setIsPremium(true);
        setToast({visible:true,message:lang==='fr'?'✅ Premium activé !':'✅ Premium activated!'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }
    }catch(e){
      console.error('[IAP] purchase failed:',e);
      setToast({visible:true,message:lang==='fr'?'❌ Erreur lors de l\'achat':'❌ Purchase failed'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }finally{setIapLoading(false);}
  }

  async function handleIAPRestore(){
    setIapLoading(true);
    try{
      const hasPremium=await restorePurchases('button');
      if(hasPremium){
        await supabase.from('profiles').update({is_premium:true}).eq('id',user.id);
        setIsPremium(true);
        setToast({visible:true,message:lang==='fr'?'✅ Achat restauré !':'✅ Purchase restored!'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }else{
        setToast({visible:true,message:lang==='fr'?'Aucun achat actif trouvé':'No active purchase found'});
        setTimeout(()=>setToast({visible:false,message:''}),3000);
      }
    }catch(e){
      console.error('[IAP] restore failed:',e);
      setToast({visible:true,message:lang==='fr'?'❌ Erreur lors de la restauration':'❌ Restore failed'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
    }finally{setIapLoading(false);}
  }

  async function fetchAll(uid){
    setLoading(true);
    const [v,i,p]=await Promise.all([
      supabase.from('ventes').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('inventaire').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
      supabase.from('profiles').select('is_premium,subscription_cancel_at_period_end,subscription_period_end,currency').eq('id',uid).single(),
    ]);
    if(!v.error) setSales((v.data||[]).map(mapSale));
    if(!i.error) setItems((i.data||[]).map(mapItem));
    let premiumValue=p.data?.is_premium===true;
    console.log('[fetchAll] is_premium from Supabase:', p.data?.is_premium, '→ resolved:', premiumValue, p.error?'ERROR:'+p.error.message:'');
    if(!p.error){
      setIsPremium(premiumValue);
      setCancelAtPeriodEnd(p.data?.subscription_cancel_at_period_end===true);
      setCancelPeriodEnd(p.data?.subscription_period_end||null);
      const confirmed=!!localStorage.getItem('fs_currency_confirmed');
      if(confirmed&&p.data?.currency){
        setCurrency(p.data.currency);
        localStorage.setItem('fs_currency',p.data.currency);
      } else if(!confirmed){
        setShowCurrencyOnboarding(true);
      }
    }
    setLoading(false);
    setAppLoading(false);
    const lensCount=await checkAndResetDaily(supabase,uid,'lens_count_today','lens_count_date');
    setLensUsedToday(lensCount);
    const voiceCount=await checkAndResetDaily(supabase,uid,'voice_count_today','voice_count_date');
    setVoiceUsedToday(voiceCount);
  }

  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data:{session}})=>{
      const u=session?.user??null;
      if(u){ setUser(u); fetchAll(u.id); setAuthLoading(false); }
      else setLoading(false);
    });
    if(isNative){
      initIAP().then(product=>{ if(mounted) setIapProduct(product); });
    }
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      const u=session?.user??null;
      setUser(u);
      if(event==='INITIAL_SESSION') setAuthLoading(false);
      if(u){
        if(event==='SIGNED_IN'){ setIsSigningIn(false); setTab(0); localStorage.setItem('tab','0'); }
        fetchAll(u.id);
      }else{setSales([]);setItems([]);setLoading(false);setAppLoading(false);}
    });
    return()=>{ mounted=false; subscription.unsubscribe(); };
  },[]);


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

  useEffect(()=>{
    const prixAchat=parseFloat(cBuy)||0;
    const prixVente=parseFloat(cSell)||0;
    const frais=parseFloat(cShip)||0;
    if(prixAchat>0&&prixVente>0){
      const historique=sales.map(s=>({
        prix_achat:s.buy,
        prix_vente:s.sell,
        frais:(s.sellingFees||0)+(s.purchaseCosts||0),
        date_vente:s.date,
      }));
      const scoreResult=calculateDealScore({prixAchat,prixVente,frais,lang,historique});
      setDealScore(scoreResult);
      setDealAnalysisLoading(true);
      clearTimeout(dealAnalysisTimer.current);
      dealAnalysisTimer.current=setTimeout(async()=>{
        const analysis=await generateDealAnalysis(scoreResult,lang,currency,userCountry?.code??getCountryFallback());
        setDealAnalysis(analysis);
        setDealAnalysisLoading(false);
      },1500);
    }else{
      setDealScore(null);
      setDealAnalysis(null);
      clearTimeout(dealAnalysisTimer.current);
      setDealAnalysisLoading(false);
    }
  },[cBuy,cSell,cShip,lang,sales]);

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

  const _f={family:"'Nunito', -apple-system, sans-serif",size:11};
  const _tip={backgroundColor:'#ffffff',titleColor:'#A3A9A6',borderColor:'rgba(0,0,0,0.08)',borderWidth:1,padding:12,cornerRadius:10,displayColors:false,titleFont:{..._f,size:11,weight:'700'},bodyFont:{..._f,size:14,weight:'800'}};
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
    setVoiceParsed(null);setVoiceError(null);setIsRecording(false);
  }

  async function callVoiceParse(text){
    setVoiceStep("parsing");setVoiceLoading(true);
    try{
      const{data:{session:vpSess}}=await supabase.auth.getSession();
      const vpToken=vpSess?.access_token;
      const res=await fetch(`${supabaseUrl}/functions/v1/voice-parse`,{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${vpToken}`,"apikey":supabaseAnonKey},
        body:JSON.stringify({text,lang}),
      });
      if(!res.ok)throw new Error("Parse failed");
      const result=await res.json();
      if(result.error)throw new Error(result.error);
      setVoiceParsed(result);setVoiceStep("done");
    }catch(e){
      setVoiceError(e.message||"Erreur analyse");setVoiceStep("error");
    }
    setVoiceLoading(false);
  }

  async function handleVoiceToggle(){
    if(isRecording){mediaRecorderRef.current?.stop();setIsRecording(false);return;}
    if(!isPremium){
      const count=await checkAndResetDaily(supabase,user.id,'voice_count_today','voice_count_date');
      if(count>=VOICE_FREE_LIMIT){
        setVoiceError(lang==='fr'
          ?"🔒 Limite atteinte · 5 vocaux/jour en gratuit"
          :"🔒 Daily limit reached · 5 voices/day on free plan");
        setVoiceStep("error");
        return;
      }
      await supabase.from('profiles')
        .update({voice_count_today:count+1,voice_count_date:new Date().toISOString().split('T')[0]})
        .eq('id',user.id);
      setVoiceUsedToday(count+1);
    }
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      setVoiceError("Microphone non disponible. Vérifiez les permissions dans Réglages > Fill & Sell.");setVoiceStep("error");return;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mimeType=MediaRecorder.isTypeSupported("audio/webm")?"audio/webm":"audio/mp4";
      const recorder=new MediaRecorder(stream,{mimeType});
      audioChunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size>0)audioChunksRef.current.push(e.data);};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const blob=new Blob(audioChunksRef.current,{type:mimeType});
        setVoiceStep("transcribing");setVoiceLoading(true);
        try{
          const{data:{session:vtSess}}=await supabase.auth.getSession();
          const vtToken=vtSess?.access_token;
          if(!vtToken)throw new Error(lang==="en"?"Session expired, please reconnect.":"Session expirée, reconnectez-vous.");
          const fd=new FormData();
          fd.append("audio",blob,"audio."+mimeType.split("/")[1]);
          fd.append("lang",lang);
          const res=await fetch(`${supabaseUrl}/functions/v1/voice-transcribe`,{method:"POST",headers:{"Authorization":`Bearer ${vtToken}`,"apikey":supabaseAnonKey},body:fd});
          if(!res.ok)throw new Error("Transcription failed");
          let vtJson;try{vtJson=await res.json();}catch{throw new Error(lang==="en"?"Invalid server response":"Réponse serveur invalide");}
          const{text,error:err}=vtJson;
          if(err)throw new Error(err);
          setVoiceText(text);
          await callVoiceParse(text);
        }catch(e){
          setVoiceError(e.message||"Erreur transcription");setVoiceStep("error");setVoiceLoading(false);
        }
      };
      mediaRecorderRef.current=recorder;
      recorder.start();
      setIsRecording(true);setVoiceStep("recording");
    }catch(e){
      setVoiceError(e.message||"Micro non disponible");setVoiceStep("error");
    }
  }

  async function addItemsFromVoice(){
    if(!voiceParsed?.items?.length)return;
    let idBase=Date.now();
    for(const item of voiceParsed.items){
      const qty=Math.max(1,item.quantite||1);
      const fraisG=parseFloat(item.frais_global)||0;
      const fraisU=fraisG>0?fraisG/qty:(parseFloat(item.frais_unitaire)||0);
      const b=voiceParsed.isLot?(parseFloat(item.prix_estime_lot)||0)/qty+fraisU:(parseFloat(item.prix_achat)||0);
      const pc=0;
      const s=voiceParsed.isLot?0:(parseFloat(item.prix_vente)||0);
      const sf=0;
      const hasS=s>0;
      const cogs=b+pc;
      const mg=hasS?s-cogs-sf:0;
      const mgp=hasS?(mg/s)*100:0;
      const marqueNorm=normalizeMarque(item.marque);
      const _td1=detectType(item.nom||"",marqueNorm);const typeAuto=_td1==='Luxe'?'Luxe':(item.categorie||_td1);
      if(!isPremium&&items.length>=20)continue;
      const row={id:idBase++,user_id:user.id,titre:stripMarque(item.nom||"Article",marqueNorm),prix_achat:b,prix_vente:hasS?s:null,margin:hasS?mg:null,margin_pct:hasS?mgp:null,statut:hasS?"vendu":"stock",date:item.date?new Date(item.date).toISOString():new Date().toISOString(),marque:marqueNorm,description:item.description||null,type:typeAuto,purchase_costs:pc,selling_fees:hasS?sf:0,quantite:qty,emplacement:item.emplacement||null};
      const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(!error){
        setItems(prev=>[mapItem(data),...prev]);
        if(hasS){
          const srow={id:idBase++,user_id:user.id,titre:stripMarque(item.nom||"Article",marqueNorm),prix_achat:b,prix_vente:s,benefice:mg,marque:marqueNorm||null,type:typeAuto||null,description:item.description||null,emplacement:item.emplacement||null,date:item.date||new Date().toISOString().split('T')[0]};
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
    for(const item of lotDistributed.items){
      if(!isPremium&&items.length>=20)break;
      const b=parseFloat(item.prix_estime_lot)||0;
      const marqueNorm=normalizeMarque(item.marque);
      const _td2=detectType(item.nom||"",marqueNorm);const typeAuto=_td2==='Luxe'?'Luxe':(item.categorie||_td2);
      const row={id:idBase++,user_id:user.id,titre:stripMarque(item.nom||"Article",marqueNorm),prix_achat:b,prix_vente:null,margin:null,margin_pct:null,statut:"stock",date:new Date().toISOString(),marque:marqueNorm,description:item.description||null,type:typeAuto,purchase_costs:0,selling_fees:0,quantite:1};
      const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(!error)setItems(prev=>[mapItem(data),...prev]);
    }
    const n=lotDistributed.items.length;
    setToast({visible:true,message:lang==='fr'?`✅ ${n} article${n>1?"s":""} ajouté${n>1?"s":""} !`:`✅ ${n} item${n>1?"s":""} added!`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    setLotDistributed(null);setLotManualItems([{nom:""},{nom:""}]);setLotManualTotal("");setManualMode("single");
  }

  async function addItem(){
    if(!iTitle||!iBuy)return;
    if(!isPremium&&items.length>=20){alert(lang==='en'?"⚠️ Free plan limit reached (20 items max).\nUpgrade to add unlimited items.":"⚠️ Limite du plan gratuit atteinte (20 articles max).\nPasse au plan supérieur pour ajouter des articles illimités.");return;}
    const b=parseFloat(iBuy)||0;const pc=parseFloat(iPurchaseCosts)||0;const s=iAlreadySold?(parseFloat(iSell)||0):0;const sf=iAlreadySold?(parseFloat(iSellingFees)||0):0;const hasS=iAlreadySold&&s>0;
    const cogs=b+pc;const mg=hasS?s-cogs-sf:0;const mgp=hasS?(mg/s)*100:0;
    const marqueNormalized=normalizeMarque(iMarque);
    const typeAuto=iType||detectType(iTitle,marqueNormalized);
    const row={id:Date.now(),user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:hasS?s:null,margin:hasS?mg:null,margin_pct:hasS?mgp:null,statut:hasS?"vendu":"stock",date:new Date().toISOString(),marque:marqueNormalized,description:iDesc||null,type:typeAuto,purchase_costs:pc,selling_fees:hasS?sf:0,quantite:iQuantite||1,emplacement:iEmplacement||null};
    const{data,error}=await supabase.from('inventaire').insert([row]).select().single();
    if(!error){
      track('add_item', { purchase_price: b, has_sell_price: hasS });
      setItems(prev=>[mapItem(data),...prev]);
      if(hasS){
        const srow={id:Date.now()+1,user_id:user.id,titre:iTitle,prix_achat:b,prix_vente:s,benefice:mg,marque:marqueNormalized||null,type:typeAuto||null,description:iDesc||null,emplacement:iEmplacement||null,date:new Date().toISOString().split('T')[0]};
        const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
        if(sd) setSales(prev=>[mapSale(sd),...prev]);
      }
    }
    if(items.length===0) setFirstItemAdded(true);
    setISaved(true);setTimeout(()=>setISaved(false),1600);
    setToast({visible:true,message:hasS?`${t('articleAjoute')} · +${fmt(mg)} ${t('dansTonSuivi')}`:`${t('articleAjoute')} · ${lang==='fr'?'Investi':'Invested'} ${fmt(cogs)}`});
    setTimeout(()=>setToast({visible:false,message:""}),3000);
    if(hasS&&iRememberSellingFees) localStorage.setItem('savedFees',String(sf));
    setITitle("");setIBuy("");setIPurchaseCosts("");setISell("");if(!iRememberSellingFees)setISellingFees("");setIAlreadySold(false);setIMarque("");setIType("");setIDesc("");setIQuantite(1);setIEmplacement("");
    setTimeout(()=>{if(listRef.current)listRef.current.scrollIntoView({behavior:"smooth"});},300);
  }

  function markSold(item){
    const saved=localStorage.getItem('savedFees')||'';
    setSellModal({item,sellPrice:'',sellingFees:saved,rememberFees:!!saved,sellQty:1,prixMode:'total',feesMode:'total'});
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
      const soldRow={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:svUnit,margin:mgUnit,margin_pct:mgpUnit,statut:"vendu",selling_fees:sfUnit,purchase_costs:0,quantite:qVendue,marque:item.marque||null,type:item.type||null,description:item.description||null,date:new Date().toISOString()};
      const{data:si,error:siErr}=await supabase.from('inventaire').insert([soldRow]).select().single();
      if(siErr)console.error("[confirmSell] soldRow insert failed:",siErr.message);
      if(si)setItems(prev=>[mapItem(si),...prev]);
    }else{
      await supabase.from('inventaire').update({prix_vente:svUnit,margin:mgUnit,margin_pct:mgpUnit,statut:"vendu",selling_fees:sfUnit}).eq('id',item.id);
      setItems(prev=>prev.map(i=>i.id===item.id?{...i,sell:svUnit,margin:mgUnit,marginPct:mgpUnit,statut:"vendu"}:i));
    }
    for(let q=0;q<qVendue;q++){
      const srow={user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:svUnit,benefice:mgUnit,marque:item.marque||null,type:item.type||null,description:item.description||null,emplacement:item.emplacement||null,date:new Date().toISOString().split('T')[0]};
      const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
      if(sd){
        if(q===0)track('mark_sold',{profit:mgUnit*qVendue,margin_pct:Math.round(mgpUnit*10)/10});
        setSales(prev=>[mapSale(sd),...prev]);
      }
    }
    setSellModal(null);
    await fetchAll(user.id);
  }

  function delItem(id){
    const item=items.find(i=>i.id===id);
    if(item&&(item.statut==='vendu'||item.sell!=null)){
      setDeleteConfirm({type:'soldItem',item});
    }else{
      (async()=>{
        await supabase.from('inventaire').delete().eq('id',id);
        await fetchAll(user.id);
      })();
    }
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
    if(!editItem) return;
    const qty=Math.max(1,parseInt(editItem.quantite)||1);
    const rawB=parseFloat(editItem.buy)||0;
    const b=(editItem.priceMode==="total"&&qty>1)?rawB/qty:rawB;
    const s=parseFloat(editItem.sell)||0;
    const f=parseFloat(editItem.frais)||0;
    const hasS=s>0;
    const mg=hasS?s-b-f:null;
    const mgp=hasS?(mg/s)*100:null;
    const typeAuto=editItem.type||detectType(editItem.title,editItem.marque);
    const{error}=await supabase.from('inventaire').update({
      titre:editItem.title,
      marque:editItem.marque?.trim()?editItem.marque.trim().charAt(0).toUpperCase()+editItem.marque.trim().slice(1).toLowerCase():null,
      type:typeAuto,
      prix_achat:b,
      prix_vente:hasS?s:null,
      margin:mg,
      margin_pct:mgp,
      description:editItem.description||null,
      quantite:qty,
    }).eq('id',editItem.id);
    if(!error){
      setItems(prev=>prev.map(i=>i.id===editItem.id?{...i,title:editItem.title,marque:editItem.marque,type:typeAuto,buy:b,sell:s,margin:mg,marginPct:mgp,description:editItem.description,quantite:qty}:i));
      setEditItem(null);
      setToast({visible:true,message:lang==='fr'?'✓ Article modifié':'✓ Item updated'});
      setTimeout(()=>setToast({visible:false,message:''}),3000);
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
        marque,
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
        marque:row.marque||null,
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
          await navigator.share({files:[file],title:'Export Fill & Sell'});
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

  async function handleLogin(){
    setLoginError("");
    if(!emailRef.current?.value||!passwordRef.current?.value){setLoginError("Remplis email et mot de passe");return;}
    setIsSigningIn(true);
    try{
      const{error}=await supabase.auth.signInWithPassword({email:emailRef.current?.value,password:passwordRef.current?.value});
      if(error){setLoginError(error.message);return;}
      track('login', { method: 'email' });
      navigate("/app");
    }catch(e){setLoginError(e.message);}finally{setIsSigningIn(false);}
  }

  async function handleForgot(){
    const _lt=localStorage.getItem('fs_lang')||((navigator.language||'fr').startsWith('fr')?'fr':'en');
    if(!email){setForgotMsg(_lt==='en'?"Enter your email above.":"Saisis ton email ci-dessus.");return;}
    setForgotMsg("");
    const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:"https://fillsell.app/reset-password"});
    if(error){setForgotMsg("Erreur : "+error.message);return;}
    setForgotMsg("📧 Email envoyé ! Vérifie ta boîte mail.");
  }

  async function handleSignup(){
    if(!email||!password){alert("Remplis email et mot de passe");return;}
    const{data,error}=await supabase.auth.signUp({email,password});
    if(error){alert(error.message);return;}
    track('sign_up', { method: 'email' });
    if(data?.session) navigate("/app");
    else alert("Vérifie ton email pour confirmer ton compte !");
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
      if(!res.ok){ const e=await res.json(); throw new Error(e.error||"Erreur suppression compte"); }
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
    {icon:"📊",label:lang==='fr'?"Tableau":"Board",idx:0},
    {icon:"🤖",label:lang==='fr'?"Stock IA":"AI Stock",idx:1},
    {icon:"📸",label:"Lens",idx:2},
    {icon:"📋",label:lang==='fr'?"Ventes":"Sales",idx:3},
    {icon:"📈",label:"Stats",idx:4},
  ];

  const headerStats=[
    {label:t('benefices'),value:fmt(totalM)},
    {label:t('totalInvesti'),value:fmt(invested)},
    {label:t('enStockLabel'),value:`${stockQty} ${lang==='fr'?'art.':'items'} · ${fmt(stockVal)}`},
  ];

  if(authLoading||appLoading)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#4ECDC4 0%,#F9A26C 100%)",flexDirection:"column",gap:24}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <img src="/icon_1024x1024.png" alt="Fill & Sell" style={{width:72,height:72,borderRadius:18,objectFit:"cover",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}/>
        <div style={{fontSize:22,fontWeight:900,color:"#fff",letterSpacing:"-0.02em"}}>Fill & Sell</div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {[0,1,2].map(i=>(
          <span key={i} style={{width:8,height:8,borderRadius:"50%",background:"rgba(255,255,255,0.9)",display:"inline-block",animation:`fs-dot 1.2s ease-in-out ${i*0.2}s infinite`}}/>
        ))}
      </div>
    </div>
  );

  const loginLang=localStorage.getItem('fs_lang')||((navigator.language||'fr').startsWith('fr')?'fr':'en');
  const loginTexts=loginLang==='en'?{
    subtitle:"Sign in to continue",login:"Sign in",signup:"Create my account",
    forgot:"Forgot your password?",forgotBtn:"Send reset link",
    forgotMsg:"Enter your email above.",back:"← Back"
  }:{
    subtitle:"Connecte-toi pour continuer",login:"Se connecter",signup:"Créer mon compte",
    forgot:"Mot de passe oublié ?",forgotBtn:"Envoyer le lien de réinitialisation",
    forgotMsg:"Saisis ton email ci-dessus.",back:"← Retour"
  };

  if(!authLoading&&!isSigningIn&&(!user||loginOnly))return(
    <div style={{position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"linear-gradient(135deg,#4ECDC4 0%,#F9A26C 100%)",overflow:"hidden",boxSizing:"border-box"}}>
      <button onClick={()=>navigate("/")} style={{position:"absolute",top:"max(50px, calc(16px + env(safe-area-inset-top)))",left:16,background:"none",border:"none",color:"rgba(255,255,255,0.85)",fontSize:22,cursor:"pointer",padding:"4px 8px",lineHeight:1}}>←</button>
      <div style={{background:"#fff",borderRadius:24,padding:"36px 28px",width:"100%",maxWidth:400,boxShadow:"0 24px 64px rgba(0,0,0,0.2)",boxSizing:"border-box"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <img src="/logo.png" style={{height:52,marginBottom:12,objectFit:"contain"}} alt="Fill & Sell"/>
          <div style={{fontSize:15,color:C.sub,fontWeight:500}}>{loginTexts.subtitle}</div>
        </div>
        <div style={{display:"flex",background:"rgba(0,0,0,0.05)",borderRadius:99,padding:3,marginBottom:18}}>
          <button onClick={()=>setAuthMode('login')} style={{flex:1,padding:"9px 12px",borderRadius:99,border:"none",fontSize:14,fontWeight:700,cursor:"pointer",background:authMode==='login'?"#3EACA0":"transparent",color:authMode==='login'?"#fff":"#6B7280",transition:"all 0.15s"}}>
            {loginTexts.login}
          </button>
          <button onClick={()=>setAuthMode('signup')} style={{flex:1,padding:"9px 12px",borderRadius:99,border:"none",fontSize:14,fontWeight:700,cursor:"pointer",background:authMode==='signup'?"#3EACA0":"transparent",color:authMode==='signup'?"#fff":"#6B7280",transition:"all 0.15s"}}>
            {loginTexts.signup}
          </button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {isNative&&(
            <div style={{marginBottom:16}}>
              <button onClick={handleAppleSignIn} style={{width:"100%",backgroundColor:"#000",color:"#fff",border:"none",borderRadius:12,padding:"14px 16px",fontSize:16,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:20}}>&#63743;</span>
                {lang==='fr'?'Continuer avec Apple':'Continue with Apple'}
              </button>
              <div style={{textAlign:"center",color:"#999",fontSize:13,marginTop:12}}>
                {lang==='fr'?'— ou —':'— or —'}
              </div>
            </div>
          )}
          <input type="email" placeholder="Email" ref={emailRef} defaultValue=""
            style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
          {!forgotMode&&(
            <>
              <input type="password" placeholder="Mot de passe" ref={passwordRef} defaultValue=""
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                style={{padding:"13px 16px",borderRadius:12,border:"1px solid rgba(0,0,0,0.12)",fontSize:15,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
              <button onClick={authMode==='login'?handleLogin:handleSignup}
                style={{padding:"14px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",boxShadow:"0 4px 16px rgba(62,172,160,0.35)"}}>
                {authMode==='login'?loginTexts.login:loginTexts.signup}
              </button>
              {loginError&&<div style={{fontSize:13,textAlign:"center",color:C.red,fontWeight:600}}>{loginError}</div>}
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(true);setForgotMsg("");}} style={{fontSize:13,color:C.teal,cursor:"pointer",textDecoration:"underline"}}>
                  {loginTexts.forgot}
                </span>
              </div>
            </>
          )}
          {forgotMode&&(
            <>
              <button onClick={handleForgot}
                style={{padding:"14px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",boxShadow:"0 4px 16px rgba(62,172,160,0.35)"}}>
                {loginTexts.forgotBtn}
              </button>
              {forgotMsg&&(
                <div style={{fontSize:13,textAlign:"center",color:forgotMsg.startsWith("📧")?C.teal:C.red,fontWeight:600}}>
                  {forgotMsg}
                </div>
              )}
              <div style={{textAlign:"center"}}>
                <span onClick={()=>{setForgotMode(false);setForgotMsg("");}} style={{fontSize:13,color:C.sub,cursor:"pointer"}}>
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
      if(!isPremium&&items.length>=20)throw new Error(lang==='fr'?"Limite gratuite atteinte":"Free plan limit reached");
      const b=parseFloat(String(data.prix_achat??data.prix_estime_lot??0).replace(",","."))||0;
      const marqueNorm=normalizeMarque(data.marque);
      const _td3=detectType(data.nom||"",marqueNorm);const typeAuto=_td3==='Luxe'?'Luxe':(data.categorie||_td3);
      const row={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:stripMarque(data.nom||"Article",marqueNorm),prix_achat:b,prix_vente:null,margin:null,margin_pct:null,statut:"stock",date:new Date().toISOString(),marque:marqueNorm,description:data.description||null,type:typeAuto,purchase_costs:0,selling_fees:0,quantite:data.quantite||1,emplacement:data.emplacement||null};
      console.log("[addItem] data reçu:", JSON.stringify(data), "row.quantite:", row.quantite);
      const{data:d,error}=await supabase.from('inventaire').insert([row]).select().single();
      if(error)throw new Error(error.message);
      const mapped=mapItem({...d,quantite:d.quantite??row.quantite});
      setItems(prev=>[mapped,...prev]);
      return mapped;
    },
    markSold:(item)=>markSold(item),
    confirmSellDirect:async(item,prix_vente,frais=0,quantite_vendue=1)=>{
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
        const soldRow={id:Date.now()+Math.floor(Math.random()*10000),user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:sv,margin:mg,margin_pct:mgp,statut:"vendu",selling_fees:sf,purchase_costs:0,quantite:qVendue,marque:item.marque||null,type:item.type||null,description:item.description||null,date:new Date().toISOString()};
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
      for(let q=0;q<qVendue;q++){
        const srow={user_id:user.id,titre:item.title,prix_achat:item.buy,prix_vente:sv,benefice:mg,marque:item.marque||null,type:item.type||null,description:item.description||null,emplacement:item.emplacement||null,date:new Date().toISOString().split('T')[0]};
        const{data:sd}=await supabase.from('ventes').insert([srow]).select().single();
        if(sd)setSales(prev=>[mapSale(sd),...prev]);
      }
      // Resynchroniser depuis la base pour garantir la cohérence (comme confirmSell le fait)
      await fetchAll(user.id);
    },
    deleteItem:(id)=>delItem(id),
    fetchAll:()=>fetchAll(user.id),
    updateItem:async(id,fields)=>{
      const{error}=await supabase.from('inventaire').update(fields).eq('id',id);
      if(error)throw new Error(error.message);
    },
    // Vente directe sans article en stock (intent inventory_sell + no_match).
    // Insère uniquement dans ventes — pas de suppression inventaire.
    addDirectSale:async({nom,marque,type,description,prix_vente})=>{
      const pv=parseFloat(String(prix_vente??0).replace(",","."))||0;
      const row={user_id:user.id,titre:nom||"Article",marque:marque||null,type:type||null,description:description||null,prix_achat:0,prix_vente:pv,benefice:pv,date:new Date().toISOString().split('T')[0]};
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
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
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
          if(prev.length>=5)return prev;
          return[...prev,{preview:dataUrl,mime:safeMime}];
        });
      };
      reader.readAsDataURL(file);
    });
    if(lensFileRef.current)lensFileRef.current.value="";
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
    if(!isPremium){
      const count=await checkAndResetDaily(supabase,user.id,'lens_count_today','lens_count_date');
      if(count>=LENS_FREE_LIMIT){
        alert(lang==='fr'
          ?"Tu as utilisé tes 3 analyses Lens aujourd'hui. Passe en Premium pour un accès illimité. 📸"
          :"You've used your 3 Lens analyses today. Upgrade to Premium for unlimited access. 📸");
        return;
      }
      await supabase.from('profiles')
        .update({lens_count_today:count+1,lens_count_date:new Date().toISOString().split('T')[0]})
        .eq('id',user.id);
      setLensUsedToday(count+1);
    }
    setLensLoading(true);setLensResult(null);setLensAdded(false);
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

  async function addLensItem(){
    if(!lensResult?.titre||lensAdded)return;
    try{
      await vaActions.addItem({
        nom:lensResult.titre||"Article",
        marque:lensResult.marque||null,
        categorie:lensResult.categorie||"Autre",
        description:lensResult.description||(lensDesc.trim()||null),
        prix_achat:parseFloat(lensBuy)||lensResult.prix_achat_suggere||0,
        prix_vente:lensResult.prix_vente_suggere||null,
        quantite:1,
      });
      setLensAdded(true);
    }catch(e){
      alert(e.message);
    }
  }

  return(
    <div className="app-root" style={{height:"100dvh",overflowY:"hidden",display:"flex",flexDirection:"column",overflowX:"hidden",maxWidth:"100vw",position:"relative"}}>

      <div className="topbar">
        <button onClick={()=>{setTab(0);localStorage.setItem('tab','0');}} className="tb-logo">
          <img src="/icon_1024x1024.png" alt="Fill & Sell" className="logo-mobile" style={{width:30,height:30,borderRadius:9,objectFit:"cover",flexShrink:0}}/>
          <img src="/logo.png" alt="Fill & Sell" className="logo-desktop" style={{height:34,width:"auto",objectFit:"contain",flexShrink:0}}/>
          <span className="name">Fill &amp; Sell</span>
        </button>
        <div className="header-centre" style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:13,fontWeight:900,color:"#0D0D0D",letterSpacing:"-0.02em",lineHeight:1}}>
            {fmt(tm.profit)}<span style={{opacity:0.55,fontSize:11,fontWeight:700}}> {t('profit')}</span>
          </div>
          <div style={{fontSize:10,fontWeight:700,color:"#A3A9A6",marginTop:2,whiteSpace:"nowrap"}}>
            {tm.count} {t('ventesMonth')}
          </div>
        </div>
        <div className="tb-right">
          {!isPremium&&!isNative?(
            <PremiumBanner userEmail={user?.email} compact onDark={false} source="topbar"/>
          ):isPremium?(
            <div className="tb-premium">⭐ Premium</div>
          ):null}
          <button onClick={()=>{setShowSettings(true);setCancelStep(0);setCancelMsg("");}} title="Paramètres" className="tb-icon-btn-light">⚙️</button>
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
                style={{flex:1,textAlign:"center",padding:"10px 8px",background:"transparent",border:"none",borderBottom:`2px solid ${tab===i?"#1D9E75":"transparent"}`,color:tab===i?"#1D9E75":"#A3A9A6",fontSize:13,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer",transition:"all 0.15s ease"}}
                onMouseEnter={e=>{if(i!==tab)e.currentTarget.style.color="#5DCAA5";}}
                onMouseLeave={e=>{if(i!==tab)e.currentTarget.style.color="#A3A9A6";}}
              >{tabLabel}</button>
            ))}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="wrap page-pad" style={{padding:"18px 14px 16px",background:"var(--bg)",flex:"1",overflowY:"auto",WebkitOverflowScrolling:"touch",minHeight:0}}>

        {tab===0&&(
          <DashboardTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative}
            loading={loading} items={items} sales={sales}
            stock={stock} stockVal={stockVal} stockQty={stockQty}
            tm={tm} salesForKpis={salesForKpis} totalM={totalM}
            selectedRange={selectedRange} setSelectedRange={setSelectedRange}
            delSale={delSale}
            resetStep={resetStep} setResetStep={setResetStep} handleReset={handleReset}
            fabTriggerRef={fabTriggerRef}
            triggerCheckout={triggerCheckout} handleIAPPurchase={handleIAPPurchase}
            setTab={setTab}
            EmptyStateDashboard={EmptyStateDashboard}
          />
        )}

        {tab===1&&(
          <StockTab
            lang={lang} currency={currency} isPremium={isPremium} isNative={isNative}
            items={items} user={user} voiceUsedToday={voiceUsedToday}
            iapProduct={iapProduct} iapLoading={iapLoading}
            stock={stock} sold={sold}
            stockFiltre={stockFiltre} soldFiltre={soldFiltre}
            stockVisible={stockVisible} soldVisible={soldVisible}
            stockVal={stockVal} stockQty={stockQty} soldQty={soldQty}
            voiceStep={voiceStep} setVoiceStep={setVoiceStep}
            voiceParsed={voiceParsed} setVoiceParsed={setVoiceParsed}
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
            PremiumBanner={PremiumBanner}
            IAPUpgradeBlock={IAPUpgradeBlock}
            VoiceZone={VoiceZone}
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
            handleLensPhoto={handleLensPhoto} analyzeLens={analyzeLens} addLensItem={addLensItem}
            handleIAPPurchase={handleIAPPurchase} handleIAPRestore={handleIAPRestore}
            PremiumBanner={PremiumBanner} IAPUpgradeBlock={IAPUpgradeBlock}
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
            delSale={delSale} setTab={setTab}
            PremiumBanner={PremiumBanner} IAPUpgradeBlock={IAPUpgradeBlock}
          />
        )}
        {tab===4&&(
          <StatsTab sales={sales} items={items} lang={lang} currency={currency} user={user}/>
        )}
      </div>

      {/* ── EDIT MODAL ── */}
      {editItem&&(
        <>
          <div onClick={()=>setEditItem(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(92vw,480px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"88vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>✏️ {lang==='fr'?"Modifier l'article":"Edit item"}</div>
              <button onClick={()=>setEditItem(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Field label={lang==='fr'?"Nom":"Name"} value={editItem.title} set={v=>setEditItem(p=>({...p,title:v}))} placeholder="Ex: Air Max 90..." icon="🏷️"/>
              <Field label={lang==='fr'?"Marque (optionnel)":"Brand (optional)"} value={editItem.marque||""} set={v=>setEditItem(p=>({...p,marque:v}))} placeholder="Ex: Nike, Zara..." icon="✏️"/>
              <select value={editItem.type||""} onChange={e=>setEditItem(p=>({...p,type:e.target.value}))}
                style={{background:"#fff",border:"1px solid rgba(0,0,0,0.08)",borderRadius:14,padding:"0 16px",height:58,fontSize:15,fontWeight:600,color:editItem.type?"#0D0D0D":"#A3A9A6",width:"100%",cursor:"pointer",fontFamily:"inherit",outline:"none",appearance:"auto"}}>
                <option value="">{(editItem.title||editItem.marque)?(lang==='fr'?`🤖 Détecté : ${detectType(editItem.title,editItem.marque)}`:`🤖 Detected: ${typeLabel(detectType(editItem.title,editItem.marque),lang)}`):(lang==='fr'?'🤖 Détection automatique':'🤖 Auto-detection')}</option>
                <option value="Luxe">💎 {typeLabel('Luxe',lang)}</option>
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
              <button onClick={handleEditSave} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}>
                {lang==='fr'?"💾 Enregistrer":"💾 Save"}
              </button>
              <button onClick={()=>setEditItem(null)} style={{padding:"13px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                {t('annuler')}
              </button>
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
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>💰 {t('marquerVendu')}</div>
              <button onClick={()=>setSellModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}>✕</button>
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
              <Field label={`${lang==='fr'?'Frais de vente':'Selling fees'} (${lang==='fr'?'optionnel':'optional'})`} value={sellModal.sellingFees} set={v=>setSellModal(p=>({...p,sellingFees:v}))} placeholder={lang==='fr'?"Commission Vinted, livraison client...":"Vinted fee, shipping to buyer..."} type="number" icon="📬" suffix={CURRENCY_SYMBOLS[currency]||'€'}/>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
                <input type="checkbox" checked={sellModal.rememberFees} onChange={e=>setSellModal(p=>({...p,rememberFees:e.target.checked}))} style={{width:16,height:16,accentColor:C.teal,cursor:"pointer",flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,color:C.sub}}>{t('memoriserFrais')}</span>
              </label>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={confirmSell} disabled={!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0} style={{flex:1,padding:"13px",background:!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0?"#E5E7EB":`linear-gradient(135deg,${C.teal},${C.peach})`,color:!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0?"#9CA3AF":"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:!sellModal.sellPrice||parseFloat(sellModal.sellPrice)<=0?"not-allowed":"pointer",transition:"all 0.2s"}}>
                {t('confirmer')} ✓
              </button>
              <button onClick={()=>setSellModal(null)} style={{padding:"13px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                {t('annuler')}
              </button>
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
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>📥 {lang==='fr'?"Confirmer l'import":"Confirm import"}</div>
              <button onClick={()=>setImportModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub}}>✕</button>
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
              <button onClick={handleImportConfirm} disabled={importLoading} style={{flex:1,padding:"13px",background:`linear-gradient(135deg,${C.teal},${C.peach})`,color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:importLoading?"not-allowed":"pointer",opacity:importLoading?0.7:1,transition:"all 0.2s"}}>
                {importLoading?(lang==='fr'?"Import en cours...":"Importing..."):(lang==='fr'?"Importer les données →":"Import data →")}
              </button>
              <button onClick={()=>setImportModal(null)} style={{padding:"13px 20px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,color:C.sub,fontSize:14,fontWeight:600,cursor:"pointer"}}>
                {lang==='fr'?'Annuler':'Cancel'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SETTINGS DRAWER ── */}
      {showSettings&&(
        <>
          <div onClick={()=>{setShowSettings(false);setDeleteStep(0);}} style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 16px",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(2px)",animation:"fadeInBd 0.2s ease"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:384,padding:24,boxShadow:"0 24px 80px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto",animation:"fadeInBd 0.2s ease"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:800,color:C.text}}>{t('parametres')}</div>
              <button onClick={()=>{setShowSettings(false);setDeleteStep(0);}} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",color:C.sub,flexShrink:0}}>✕</button>
            </div>

            {/* Profil */}
            <div style={{background:C.rowBg,borderRadius:14,padding:"14px 16px",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{t('monCompte')}</div>
              <div style={{fontSize:13,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📧 {user?.email}</div>
              {isPremium&&<div style={{fontSize:12,color:C.teal,fontWeight:600,marginTop:5}}>⭐ {t('abonnementPremium')}</div>}
            </div>

            {/* Désabonnement — visible uniquement si premium */}
            {isPremium&&(
              <div style={{marginBottom:12}}>
                {isNative?(
                  /* iOS IAP : géré par Apple, pas Stripe */
                  <div style={{background:"#F0FFF4",border:"1px solid #9AE6B4",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#276749",fontWeight:600,lineHeight:1.6}}>
                    ⭐ {lang==='fr'
                      ? 'Pour gérer votre abonnement, allez dans Réglages → Apple ID → Abonnements.'
                      : 'To manage your subscription, go to Settings → Apple ID → Subscriptions.'}
                  </div>
                ):(cancelAtPeriodEnd||cancelMsg)?(
                  <div style={{background:"#F0FFF4",border:"1px solid #9AE6B4",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#276749",fontWeight:600,lineHeight:1.5}}>
                    ✅ {cancelMsg||(lang==='fr'
                      ? `Abonnement annulé. Tu gardes l'accès premium jusqu'au${cancelPeriodEnd?` ${cancelPeriodEnd}`:" la fin de la période"}.`
                      : `Subscription cancelled. You keep premium access until${cancelPeriodEnd?` ${cancelPeriodEnd}`:" the end of the period"}.`)}
                  </div>
                ):cancelStep===0?(
                  <button onClick={()=>setCancelStep(1)} style={{width:"100%",padding:"11px",background:"transparent",border:"1.5px solid rgba(232,149,109,0.6)",borderRadius:12,color:C.peach,fontSize:13,fontWeight:700,cursor:"pointer",transition:"all 0.2s",textAlign:"left",display:"flex",alignItems:"center",gap:8}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(232,149,109,0.06)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  >
                    <span>📭</span> {t('seDesabonner')}
                  </button>
                ):(
                  <div style={{background:"rgba(232,149,109,0.08)",border:"1.5px solid rgba(232,149,109,0.4)",borderRadius:12,padding:"14px"}}>
                    <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:10}}>{lang==='fr'?'Confirmer la résiliation ?':'Confirm cancellation?'}</div>
                    <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.5}}>{lang==='fr'?'Tu conserveras l\'accès Premium jusqu\'à la fin de ta période en cours. Aucun remboursement au prorata.':'You will keep Premium access until the end of your current period. No prorated refund.'}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={handleCancelSubscription} disabled={cancelLoading} style={{flex:1,padding:"9px",background:C.peach,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:cancelLoading?"not-allowed":"pointer",opacity:cancelLoading?0.7:1,transition:"all 0.2s"}}>
                        {cancelLoading?"...":(lang==='fr'?'Confirmer':'Confirm')}
                      </button>
                      <button onClick={()=>setCancelStep(0)} disabled={cancelLoading} style={{flex:1,padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>
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
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,background:"transparent",border:"none",color:C.text,fontSize:"inherit",fontFamily:"inherit",cursor:iapLoading?"not-allowed":"pointer",transition:"background 0.15s",marginBottom:2,textAlign:"left",opacity:iapLoading?0.6:1}}
                onMouseEnter={e=>{if(!iapLoading)e.currentTarget.style.background=C.rowBg;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}
              >
                <span style={{fontSize:18,flexShrink:0}}>🔄</span>
                <div style={{fontSize:14,fontWeight:600}}>{iapLoading?(lang==='fr'?'Restauration...':'Restoring...'):(lang==='fr'?'Restaurer mes achats':'Restore purchases')}</div>
              </button>
            )}

            {/* Support */}
            <a href="mailto:support@fillsell.app" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:C.text,transition:"background 0.15s",marginBottom:2,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.rowBg}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:18,flexShrink:0}}>💬</span>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{t('support')}</div>
                <div style={{fontSize:12,color:C.sub}}>support@fillsell.app</div>
              </div>
            </a>

            {/* Mentions légales */}
            <a href="/legal" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,textDecoration:"none",color:C.text,transition:"background 0.15s",marginBottom:20,cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.rowBg}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:18,flexShrink:0}}>📄</span>
              <div style={{fontSize:14,fontWeight:600}}>{t('mentionsLegales')}</div>
            </a>

            {/* Langue */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:C.rowBg,borderRadius:12,marginBottom:12}}>
              <span style={{fontWeight:700,fontSize:14,color:C.text}}>{t('langue')}</span>
              <div style={{display:"flex",gap:6}}>
                {['fr','en'].map(l=>(
                  <button key={l} onClick={()=>{track('change_language',{language:l});setLang(l);}}
                    style={{padding:"5px 12px",borderRadius:99,border:"none",fontSize:12,fontWeight:800,cursor:"pointer",transition:"all 0.15s",background:lang===l?"#1D9E75":"rgba(0,0,0,0.06)",color:lang===l?"#fff":"#6B7280"}}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Devise */}
            <div style={{background:C.rowBg,borderRadius:12,marginBottom:12,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,fontSize:14,color:C.text}}>{t('devise')}</span>
                <select value={currency} onChange={e=>saveCurrency(e.target.value)}
                  style={{padding:"6px 10px",borderRadius:10,border:"1px solid rgba(0,0,0,0.12)",fontSize:13,fontWeight:700,color:C.text,background:"#fff",cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                  {['Europe','America','Africa','Asia/Pacific'].map(reg=>(
                    <optgroup key={reg} label={reg==='America'&&lang!=='en'?'Amériques':reg==='Africa'&&lang!=='en'?'Afrique':reg==='Asia/Pacific'?lang==='en'?'Asia & Pacific':'Asie & Pacifique':reg}>
                      {CURRENCIES_LIST.filter(c=>c.reg===reg).map(c=>(
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div style={{fontSize:11,color:"#9CA3AF",marginTop:8,lineHeight:1.4}}>
                {lang==='en'?'⚠️ Changing currency does not convert your existing data.':'⚠️ Changer la devise ne convertit pas vos données existantes.'}
              </div>
            </div>

            {/* Déconnexion */}
            <button onClick={()=>{handleLogout();setShowSettings(false);}} style={{width:"100%",padding:"13px",background:"transparent",border:`1.5px solid ${C.red}88`,borderRadius:12,color:C.red,fontSize:14,fontWeight:700,cursor:"pointer",transition:"all 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(229,62,62,0.06)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >{t('seDeconnecter')}</button>

            {/* Suppression de compte */}
            <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid rgba(0,0,0,0.07)"}}>
              {deleteStep===0&&(
                <button onClick={()=>setDeleteStep(1)}
                  style={{width:"100%",padding:"11px",background:"transparent",border:"none",borderRadius:12,color:"#9CA3AF",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s",textAlign:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.color=C.red}
                  onMouseLeave={e=>e.currentTarget.style.color="#9CA3AF"}
                >
                  {lang==='fr'?'Supprimer mon compte':'Delete my account'}
                </button>
              )}
              {deleteStep===1&&(
                <div style={{background:C.redLight,border:`1.5px solid ${C.red}44`,borderRadius:12,padding:"14px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:6}}>
                    {lang==='fr'?'Êtes-vous sûr ?':'Are you sure?'}
                  </div>
                  <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.5}}>
                    {lang==='fr'?'Cette action est irréversible.':'This action is irreversible.'}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setDeleteStep(2)} style={{flex:1,padding:"9px",background:C.red,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      {lang==='fr'?'Continuer':'Continue'}
                    </button>
                    <button onClick={()=>setDeleteStep(0)} style={{flex:1,padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==='fr'?'Annuler':'Cancel'}
                    </button>
                  </div>
                </div>
              )}
              {deleteStep===2&&(
                <div style={{background:C.redLight,border:`2px solid ${C.red}`,borderRadius:12,padding:"14px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.red,marginBottom:6}}>
                    {lang==='fr'?'Confirmation finale':'Final confirmation'}
                  </div>
                  <div style={{fontSize:12,color:C.sub,marginBottom:12,lineHeight:1.5}}>
                    {lang==='fr'
                      ?'Toutes vos données seront supprimées définitivement. Cette action ne peut pas être annulée.'
                      :'All your data will be permanently deleted. This action cannot be undone.'}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={handleDeleteAccount} disabled={deleteLoading}
                      style={{flex:1,padding:"9px",background:C.red,border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:deleteLoading?"not-allowed":"pointer",opacity:deleteLoading?0.7:1}}>
                      {deleteLoading?"...":(lang==='fr'?'Supprimer définitivement':'Delete permanently')}
                    </button>
                    <button onClick={()=>setDeleteStep(0)} disabled={deleteLoading} style={{flex:1,padding:"9px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:10,color:C.sub,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                      {lang==='fr'?'Annuler':'Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
          <style>{`
            @keyframes fadeInBd{from{opacity:0}to{opacity:1}}
          `}</style>
        </>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteConfirm&&(
        <>
          <div onClick={()=>setDeleteConfirm(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:200}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:201,background:"#fff",borderRadius:20,padding:"28px",width:"min(92vw,400px)",boxShadow:"0 24px 80px rgba(0,0,0,0.2)"}}>
            <div style={{fontSize:16,fontWeight:800,color:"#0D0D0D",marginBottom:8}}>
              {lang==='fr'?'🗑️ Supprimer':'🗑️ Delete'}
            </div>
            {deleteConfirm.type==='soldItem'&&(
              <>
                <div style={{fontSize:13,color:"#6B7280",marginBottom:20,lineHeight:1.5}}>
                  {lang==='fr'
                    ?`Cet article est marqué comme vendu. Que veux-tu supprimer ?`
                    :`This item is marked as sold. What do you want to delete?`}
                  <div style={{fontWeight:700,color:"#0D0D0D",marginTop:6}}>{deleteConfirm.item?.title}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={async()=>{
                    await supabase.from('inventaire').delete().eq('id',deleteConfirm.item.id);
                    await fetchAll(user.id);
                    setDeleteConfirm(null);
                  }} style={{width:"100%",padding:"12px",background:"#F3F4F6",border:"1px solid rgba(0,0,0,0.1)",borderRadius:12,fontSize:13,fontWeight:700,color:"#0D0D0D",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    {lang==='fr'?'📦 Supprimer l\'article uniquement':'📦 Delete item only'}
                    <div style={{fontSize:11,fontWeight:400,color:"#6B7280",marginTop:2}}>{lang==='fr'?'La vente reste dans le tableau de bord':'The sale remains in the dashboard'}</div>
                  </button>
                  <button onClick={async()=>{
                    const title=deleteConfirm.item?.title?.toLowerCase().trim();
                    const matchingSale=sales.find(s=>s.title?.toLowerCase().trim()===title);
                    await supabase.from('inventaire').delete().eq('id',deleteConfirm.item.id);
                    if(matchingSale)await supabase.from('ventes').delete().eq('id',matchingSale.id);
                    await fetchAll(user.id);
                    setDeleteConfirm(null);
                  }} style={{width:"100%",padding:"12px",background:"#FFF5F5",border:"1px solid #FCA5A5",borderRadius:12,fontSize:13,fontWeight:700,color:"#E53E3E",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    {lang==='fr'?'🗑️ Supprimer et annuler le profit':'🗑️ Delete and remove profit'}
                    <div style={{fontSize:11,fontWeight:400,color:"#E53E3E",opacity:0.8,marginTop:2}}>{lang==='fr'?'Supprime aussi la vente associée':'Also removes the associated sale'}</div>
                  </button>
                  <button onClick={()=>setDeleteConfirm(null)} style={{width:"100%",padding:"10px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,fontSize:13,fontWeight:600,color:"#6B7280",cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'?'Annuler':'Cancel'}
                  </button>
                </div>
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
                  }} style={{flex:1,padding:"12px",background:"#E53E3E",border:"none",borderRadius:12,fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'?'Confirmer':'Confirm'}
                  </button>
                  <button onClick={()=>setDeleteConfirm(null)} style={{flex:1,padding:"12px",background:"transparent",border:"1px solid rgba(0,0,0,0.12)",borderRadius:12,fontSize:13,fontWeight:600,color:"#6B7280",cursor:"pointer",fontFamily:"inherit"}}>
                    {lang==='fr'?'Annuler':'Cancel'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <Toast message={toast.message} visible={toast.visible}/>

      <div className="bnav">
        {TABS_MOBILE.map(tm=>(
          <button key={tm.idx} onClick={()=>{setTab(tm.idx);localStorage.setItem('tab',tm.idx);}} className={"bnav-item "+(tab===tm.idx?"on":"")}>
            <span className="ic">{tm.icon}</span>
            <span className="lbl">{tm.label}</span>
            <span className="ind"/>
          </button>
        ))}
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
      />
      {showCurrencyOnboarding&&(
        <CurrencyOnboardingModal lang={lang} onConfirm={async(code)=>{
          await saveCurrency(code);
          localStorage.setItem('fs_currency_confirmed','1');
          setShowCurrencyOnboarding(false);
        }}/>
      )}
    </div>
  );
}
