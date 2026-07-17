// Shared design tokens, constants, and pure utility functions
// Used by tab components and App.jsx

export const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
export const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export const C = {
  primary:"#1D9E75",
  dark:"#0F6E56",
  soft:"#5DCAA5",
  muted:"#A3A9A6",
  bg:"#F5F6F5",
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

export const VOICE_FREE_LIMIT = 5;

const CURRENCY_DATA=[
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
export const CURRENCY_LOCALES = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.loc]));
export const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.sym]));
export const CURRENCY_DECIMALS = Object.fromEntries(CURRENCY_DATA.map(c=>[c.code,c.dec]));

export function formatCurrency(amount, currency='EUR', decimals=null) {
  const n = Math.round((amount||0)*100)/100;
  const dec = decimals!==null ? decimals : (CURRENCY_DECIMALS[currency]??2);
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[currency]||'fr-FR',{style:'currency',currency,minimumFractionDigits:dec,maximumFractionDigits:dec}).format(n);
  } catch {
    const sym = CURRENCY_SYMBOLS[currency]||currency;
    return sym+' '+n.toFixed(dec);
  }
}

export const normalizeMarque = m => m?.trim() ? m.trim().toLowerCase().replace(/(^|\s|')(\S)/g,(_,sep,c)=>sep+c.toUpperCase()) : null;
export const fmtp = n => (Math.round(n*10)/10).toFixed(1)+"%";

export const LOC_RE = /^(acheté[e]?\s+(?:à|en|au|aux)\s|bought\s+(?:in|at)\s)/i;
export function parseLocDesc(desc) {
  if (!desc) return { loc: null, rest: null };
  const parts = desc.split(/,\s*/).map(p => p.trim()).filter(Boolean);
  const loc = parts.filter(p => LOC_RE.test(p)).join(", ") || null;
  const rest = parts.filter(p => !LOC_RE.test(p)).join(", ") || null;
  return { loc, rest };
}

export function detectType(titre,marque){
  const t=((titre||'')+' '+(marque||'')).toLowerCase();
  // ⚠️ CATÉGORIE "Luxe" SUPPRIMÉE le 2026-07-17. L'ancien 1er test renvoyait
  // 'Luxe' dès qu'une marque « premium » figurait dans le texte — MAIS la liste
  // incluait des marques NON luxe (Ralph Lauren, Lacoste, Tommy, Boss, Armani),
  // et surtout 'Luxe' n'est mappé sur AUCUNE plateforme (💎 injouable). Un
  // parfum Chanel partait ainsi en Luxe → injouable. Désormais on classe par
  // TYPE DE PRODUIT : la marque (luxe ou non) n'influence plus la catégorie —
  // un sac Hermès → Mode, un parfum Chanel → Beauté, une Rolex → Mode.
  if(/robe|jupe|pull|jean|veste|manteau|costume|chemise|chemisier|blouse|short|legging|pantalon|\bpolo\b|\btop\b|t-shirt|cardigan|blouson|parka|doudoune|sweat|hoodie|débardeur|tunique|combinaison|kimono|salopette|bermuda|jogging|survêtement|maillot|bikini|lingerie|soutien|brassière|culotte|boxer|chaussette|collant|chaussure|basket|botte|sandale|espadrille|escarpin|mocassin|sneaker|talon|ballerine|sac|pochette|portefeuille|ceinture|écharpe|foulard|casquette|chapeau|bonnet|(?<![\p{L}\p{N}])gants?(?![\p{L}\p{N}])|lunette|bijou|collier|bracelet|\bbagues?\b|(?<![\p{L}\p{N}])montres?(?![\p{L}\p{N}])(?!\s*(?:connect|intelligente))|boucle|accessoire|imperméable|pyjama|nuisette|robe.?chambre|maillot.?bain|\bcap\b|\bbob\b|beret|turban|snood|mitaine|manchette|cravate|noeud.?papillon|bretelle|jarretelle|chaussure.?sport|derby|oxford|loafer|chelsea|compensée|plateforme|slip|string|monokini|playsuit|body|bustier|corset|louboutin|jimmy.?choo|manolo|birkin|kelly|neverfull|speedy/iu.test(t)) return 'Mode';
  if(/guitare|\bpiano\b|violon|\bbatterie\b(?!.{0,18}(?:voiture|cuisine|externe|lithium|rechargeable|li.?ion|au.?plomb|solaire|\d{3,}|perceuse|visseuse|drone|portable|ordinateur|tondeuse|\d+\s?v\b|\d+\s?mah))|\bsynthé\b|synthétiseur|ukulélé|trompette|saxophone|accordéon|contrebasse|clavier.?(?:midi|arrangeur|ma[îi]tre)|pédale.?(?:effet|guitare|basse)|table.?(?:de.?)?(?:mix|mixage)|\bampli\b(?!.{0,10}voiture|.{0,10}\bauto\b)|\bvinyle\b|vinyl|platine.?(?:vinyle|disque|dj)|\bpartition\b|solfège|\bgibson\b|\bfender\b|\bmarshall\b|\bibanez\b|\bepiphone\b|les.?paul|stratocaster|telecaster|\bstrat\b|guitare.?basse|basse.?(?:[eé]lec|acoustique|\d.?cordes|fretless|active)|\bbassiste\b|micro.?(?:studio|chant|enregistrement)|enceinte.?studio|moniteur.?studio/i.test(t)) return 'Musique';
  // Mobilité AVANT High-Tech : « trottinette Xiaomi » (Xiaomi = marque téléphone
  // ET trottinette) partait en High-Tech → 📱 Téléphones. L'objet prime sur la marque.
  if(/\btrottinette\b|hoverboard|gyroroue|monoroue|overboard/i.test(t)) return 'Sport';
  if(/iphone|samsung|huawei|xiaomi|oneplus|pixel|macbook|laptop|ordinateur|\bpc\b|computer|tablette|ipad|téléphone|smartphone|airpods|écouteur|casque(?!.{0,8}(?:moto|v[ée]lo|scooter|ski|chantier))|enceinte|jbl|bose|sony|beats|playstation|ps4|ps5|xbox|nintendo|switch|console|jeu.?video|manette|clavier|souris|écran|moniteur|imprimante|disque|ssd|\bram\b|processeur|gopro|appareil.?photo|camera|objectif|drone|fitbit|garmin|apple.?watch|smartwatch|montre.?connect|(?<!meuble.{0,6})tv|télévision|projecteur|home.?cinema|ampli|chargeur|cable|adaptateur|batterie.?externe|airpod|earbud|tws|true.?wireless|powerbank|hub|dock|station|chargeur.?sans.?fil|disque.?dur|clé.?usb|carte.?sd|carte.?graphique|carte.?m[èe]re|\bgpu\b|geforce|radeon|webcam|ring.?light|green.?screen|smart.?tv|android.?tv|chromecast|firestick|apple.?tv|box.?internet|routeur|répéteur.?wifi|alarme|camera.?surveillance|sonnette|imprimante.?3d|scanner|tablette.?graphique/i.test(t)) return 'High-Tech';
  if(/perceuse|visseuse|meuleuse|ponceuse|scie.?(?:circulaire|sauteuse|cloche)?|\bforet\b|tournevis|\bmarteau\b(?!.{0,6}piqueur)|interrupteur|disjoncteur|prise.?électrique|tableau.?électrique|fusible|\bmakita\b|\bdewalt\b|\bryobi\b|\bfacom\b|\bstanley.?(?!cup)|\bpinces?\b|mastic|enduit|joint.?(?:silicone|plomberie)|silicone.?(?:sanitaire|joint)|carrelage|lame.?parquet|papier.?peint|rouleau.?peinture|niveau.?(?:laser|bulle)|mètre.?ruban|cheville.?(?:plastique|béton|mur)|clé.?(?:plate|allen|mixte|dynamométrique)|boulons?(?!\s*éblouir)|\bétau\b|établi|serre.?joint/i.test(t)) return 'Bricolage';
  if(/tondeuse(?!.{0,12}(?:cheveux|barbe|chien|animal))|débroussailleuse|taille.?haie|souffleur.?(?:feuilles|jardin)|tronçonneuse|sécateur|élagueuse|scarificateur|arrosoir|tuyau.?arrosage|asperseur|pompe.?jardin|\bbêche\b|\brateau\b|\bfourche\b(?!.{0,8}moto)|\bbinette\b|brouette|compost|\bterreau\b|engrais|graines?(?:\s+de\s+jardin)?|jardinage|\bhusqvarna\b|\bstihl\b(?!.{0,8}moto)/i.test(t)) return 'Jardin';
  if(/canapé|sofa|\btable\b|chaise|bureau|armoire|commode|\blit\b|matelas|étagère|bibliothèque|meuble|lampe|luminaire|miroir|tableau|cadre|tapis|rideau|coussin|plaid|couette|drap|serviette|vase|bougie|déco|cuisine|assiette|\bbol\b|verre|tasse|cafetière|machine.?café|grille.?pain|mixeur|robot|poêle|casserole|ustensile|réfrigérateur|micro.?onde|pouf|banquette|ottomane|tabouret|\bbar\b|console|desserte|vaisselier|bahut|buffet|vitrine|applique|suspension|guirlande|led|ampoule|parure|jeté|store|voilage|portant|cintre|organisateur|boite|panier|corbeille|plante|\bpot\b/i.test(t)) return 'Maison';
  if(/lego|playmobil|hasbro|mattel|jouet|\bjeux?\b|puzzle|peluche|figurine|poupée|voiture.?miniature|construction|kapla|duplo|hot.?wheels|barbie/i.test(t)) return 'Jouets';
  if(/livre|bd|bande.?dessinée|manga|roman|magazine|comics|guide|encyclopédie|atlas|dictionnaire/i.test(t)) return 'Livres';
  if(/vélo|trottinette|skateboard|\bski\b|snowboard|raquette|ballon|football|basketball|tennis|badminton|golf(?!\s*(?:gti|tdi|tsi|gtd|\d|plus|r32|variant|sportsvan))|rugby|natation|plongée|\bsurf\b|kayak|randonnée|camping|\bsport|fitness|musculation|haltère|kettlebell|yoga|pilates|course|running|trail|cyclisme|équitation|boxe|arts.?martiaux|tapis.?course|vélo.?appartement|rameur|elliptique|corde.?sauter|élastique.?musculation|bande.?résistance|gant.?boxe|protège|casque.?vélo|genouillère|spike|crampon|patin|roller|tente|sac.?dos.?rando|gourde|frontale|bâton.?marche|canne.?pêche|moulinet|waders/i.test(t)) return 'Sport';
  if(/voiture|\bauto\b|moto|scooter|véhicule|pneu|jante|casque.?moto|pièce.?auto|autoradio|gps|huile.?moteur|liquide.?(?:de.?)?(?:refroidissement|frein)/i.test(t)) return 'Auto-Moto';
  if(/parfum|crème|sérum|mascara|rouge.?lèvre|palette|correcteur|dissolvant|vernis|shampooing|après-shampooing|masque.?cheveux|(?<!sans\s)huile(?!\s*(?:moteur|d.?olive|de.?friture|de.?tournesol|de.?colza|alimentaire|de.?coude))|lotion|gel.?douche|savon|rasoir|fond.?teint|bb.?cream|cc.?cream|cushion|anticernes|poudre|blush|bronzer|highlighter|fard.?paupières|eyeliner|crayon|kajal|extension.?cils|faux.?cils|sourcil|gloss|baume|exfoliant|gommage|peeling|autobronzant|spray.?solaire|after.?sun|déodorant|roll.?on|\bstick\b|eau.?de.?cologne|brosse|peigne|lisseur|boucleur|bigoudi|coton|lingette|démaquillant|tonique|brume/i.test(t)) return 'Beauté';
  if(/collectionn|cartes?\s*(?:pokémon|pokemon|magic|yu.?gi.?oh|panini|à.?collectionner|de.?collection|postale)|timbre|monnaie|pièce.?(?:de.?monnaie|ancienne|de.?collection|comm[ée]morative|rare)|funko|vintage|antique|brocante/i.test(t)) return 'Collection';
  if(/aspirateur|robot.?aspirateur|roomba|dyson|lave.?linge|lave.?vaisselle|congélateur|\bfour\b|hotte|plaque|induction|gazinière|sèche.?linge|sèche.?cheveux|fer.?repasser|climatiseur|ventilateur|radiateur|chauffage|chauffe.?eau|nespresso|dolce.?gusto|blender|robot.?cuisine|thermomix|friteuse|yaourtière|extracteur.?jus|centrifugeuse|bouilloire|épilateur|rasoir.?électrique|brosse.?dents/i.test(t)) return 'Électroménager';
  return 'Autre';
}

export function getTypeStyle(type){
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

export const getMargeColor = pct => pct>=40?"#1D9E75":pct>=20?"#5DCAA5":pct>=5?"#F9A26C":"#E53E3E";
export const getCatBorder = type => getTypeStyle(type).border;

// ── Design 2026 (Lens / navbar) : tuiles de catégorie ──
// Pastels désaturés dans l'esprit canvas #EDEAE0 / paper #F6F5F1.
// Une couleur par catégorie — deux articles de même catégorie = même tuile.
export const CAT_TILE_COLORS = {
  'Mode':           '#FBEAE2',
  'Luxe':           '#F5EBD7',
  'High-Tech':      '#E5E9F3',
  'Maison':         '#E6EFEA',
  'Électroménager': '#E3F0F0',
  'Jouets':         '#FAF0D7',
  'Livres':         '#F0E8DB',
  'Sport':          '#E2EEF6',
  'Auto-Moto':      '#E9E9E3',
  'Beauté':         '#EFE6F0',
  'Musique':        '#EAE5F2',
  'Collection':     '#F6E9DE',
  'Jardin':         '#E7F0E2',
  'Bricolage':      '#F1E9DD',
  'Multimédia':     '#E8E4EE',
  'Autre':          '#ECEBE6',
};
export function getCatTileColor(type){
  if(CAT_TILE_COLORS[type]) return CAT_TILE_COLORS[type];
  const key=Object.keys(CAT_TILE_COLORS).find(k=>k.toLowerCase()===(type||"").toLowerCase());
  return key?CAT_TILE_COLORS[key]:CAT_TILE_COLORS['Autre'];
}
// Slug CSS de la catégorie (classe .cat-mode, .cat-hightech, .cat-electromenager...)
export const catClass = type => 'cat-'+((type||'autre').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,''));

// ── Icône par type précis d'objet (même pattern que detectType : mots-clés
// dans titre + description, du plus spécifique au plus générique — l'ordre compte).
const OBJECT_ICON_RULES = [
  // Désambiguïsations prioritaires (avant les règles génériques)
  [/basket.?ball|ballon.?(?:de.?)?basket|panier.?de.?basket/i, '🏀'],  // ballon de basket : "basket" seul → 👟 (bug)
  [/casque.?(?:moto|scooter|cross|intégral|jet)/i, '🪖'],
  // Vêtements de SPORT AVANT les règles d'ÉQUIPEMENT sport (⛑️/🤿/🎿/⚽) : un
  // maillot de foot est un HAUT (pas une robe), une combinaison de ski un
  // VÊTEMENT (pas des skis). Bug chasse mot-clé 2026-07-17.
  [/maillot.?(?:de.?)?(?:foot|rugby|basket|hand|volley|cyclis|sport)|\bjersey\b|brassière/i, '👕'],
  [/combinaison.?(?:de.?)?(?:ski|surf|snowboard|moto|plong[ée]e)|kimono.?(?:judo|karat[ée]|jjb|taekwondo)|justaucorps/i, '🧥'],
  [/casque.?(?:vélo|ski|snow)/i, '⛑️'],
  [/tondeuse.?(?:à.?)?(?:barbe|cheveux)|rasoir|épilateur/i, '🪒'],
  // Contexte sport : doit passer avant les règles génériques sac (👜) et
  // lunettes (🕶️) — feuilles Vinted dédiées (Sacs de sport, genré ;
  // Sports nautiques > Natation > Lunettes de natation).
  [/sac.?de.?(?:sport|gym|fitness)/i, '🎽'],
  [/lunettes?.?de.?(?:natation|piscine)/i, '🥽'],
  [/sac.?à.?dos|backpack|cartable/i, '🎒'],
  [/batterie.?externe|powerbank|chargeur|câble|adaptateur|\bhub\b|\bdock\b/i, '🔌'],
  [/tapis.?de.?course|vélo.?d.?appartement|rameur|elliptique/i, '🏃'],
  [/clavier.?(?:midi|maître|maitre|arrangeur)|piano|synthé|synthétiseur/i, '🎹'],  // clavier arrangeur/maître = instrument, avant ⌨️ clavier ordinateur
  [/voiture.?miniature|hot.?wheels|majorette/i, '🏎️'],
  [/machine.?à.?laver|lave.?linge|sèche.?linge|lave.?vaisselle/i, '🧺'],
  [/machine.?à.?café|cafetière|nespresso|senseo|dolce.?gusto|expresso/i, '☕'],
  // ⚠️ `cartes?\s*` et non `carte.?` : `.?` (0-1 char) ne franchit pas « s + espace »
  // de « cartes pokémon » → un « Lot cartes Pokémon x20 » tombait en 🏆 Collection
  // (défaut non mappé → job échoué), alors que « Carte Pokémon » (singulier) matchait.
  [/cartes?\s*(?:pokémon|pokemon|magic|yu.?gi.?oh|panini|à.?collectionner)|booster/i, '🃏'],
  [/maillot.?de.?bain|bikini|monokini/i, '👙'],
  [/jeu.?de.?société|monopoly|\buno\b/i, '🎲'],
  // ── Désambiguïsations ajoutées le 2026-07-09 (mission mapping complet) —
  // chacune doit gagner sur une règle générique plus bas (indiquée) ─────────
  [/télécommandé|voiture.?rc\b/i, '🚁'],                                        // avant 🚗 voiture
  [/déguisement|panoplie\b|costume.?de.?(?:pirate|princesse|sorci|clown|halloween|super.?héros)/i, '🎭'], // avant 🤵/👔 costume
  [/montre.?connectée|smart.?watch|apple.?watch|galaxy.?watch|garmin|fitbit|amazfit/i, '⏱️'],  // avant ⌚ montre
  [/enceinte.?connectée|google.?home|amazon.?echo|\balexa\b|homepod|assistant.?vocal/i, '📡'], // avant 🔊 enceinte
  [/liseuse|kindle|\bkobo\b/i, '📇'],                                           // avant 📚 livre
  [/collier.?(?:pour.?)?(?:chien|chat)|gamelle|croquettes?\b|litière|griffoir|arbre.?à.?chat|laisse\b/i, '🐕'], // avant 💍 collier
  [/chausson|pantoufle|charentaise/i, '🥿'],                                    // avant 👟 chaussure
  [/sac.?banane|banane.?(?:eastpak|nike|adidas)|fanny.?pack|bum.?bag/i, '👝'],  // avant 👜 sac
  [/housse.?de.?couette|parure.?de.?lit|taie.?d.?oreiller|drap.?housse|\bdraps?\b/i, '🛌'],    // avant 🛏️ lit (scission literie/meuble)
  [/lit.?parapluie|lit.?à.?barreaux|berceau|cododo|table.?à.?langer|réducteur.?de.?lit|\btoise\b/i, '🚼'],    // avant 🛏️ lit, 🪑 chaise ET ☂️ parapluie (lit parapluie = lit de voyage bébé, pas un parapluie)
  [/fer.?à.?repasser|défroisseur|centrale.?vapeur|table.?à.?repasser/i, '🧼'],
  [/machine.?à.?coudre|surjeteuse/i, '🧵'],
  [/plongée|\btuba\b|\bpalmes\b/i, '🤿'],                                       // avant 🕶️/👟 (masque, palmes)
  [/paddle|kayak|wakeboard|kitesurf|skimboard|ski.?nautique/i, '🏄'],           // avant 🎿 ski
  [/équitation|équestre|cravache|licol|tapis.?de.?selle|étriers?\b/i, '🐴'],
  [/billard|snooker|pétanque|fléchette|bowling|frisbee/i, '🎱'],
  // Mode / Luxe
  [/basket|sneaker|chaussure|jordan|air.?max|air.?force|derby|mocassin|loafer|espadrille|crampon/i, '👟'],
  [/botte|bottine|\bboots?\b/i, '👢'],
  // \btalons?\b : "pantalon" CONTIENT "talon" — sans la boundary stricte,
  // tout titre "Pantalon ..." partait sur Chaussures à talons (bug prod).
  [/\btalons?\b|escarpin|ballerine|compensée|louboutin/i, '👠'],
  [/sandale|tongs?\b|claquette|mule\b/i, '🩴'],
  [/\bsacs?\b(?!\s*(?:de.?couchage|de.?frappe|poubelle|congélation|aspirateur))|handbag|pochette|cabas|besace|bandoulière|birkin|kelly|speedy|neverfull/i, '👜'],
  [/portefeuille|porte.?monnaie|porte.?carte/i, '👛'],
  [/valise|bagage/i, '🧳'],
  // (?:^|[^-\w]) : exclut "garde-robe" (fréquent dans les descriptions IA) et
  // "wardrobe" — sinon un t-shirt dont la description dit "à avoir dans sa
  // garde-robe" devient une robe et le mapping Vinted part sur le mauvais rayon.
  [/(?:^|[^-\w])robe\b|jupe/i, '👗'],
  // 🥼/🤵/🎀 scindés de 🧥/👔 (2026-07-09) : blazer/tailleur, costume et
  // cravate ont chacun leur branche Vinted dédiée (Blazers et tailleurs,
  // Costumes et blazers, Accessoires > Cravates et nœuds papillons) — le
  // T4 "Pantalon de costume → Chemises" venait de "costume" logé dans 👔.
  [/blazer|tailleur\b/i, '🥼'],
  [/manteau|veste|blouson|parka|doudoune|trench|imperméable|kimono|polaire\b/i, '🧥'],
  [/cravate|n[œo]e?ud.?papillon/i, '🎀'],
  [/costume|smoking\b/i, '🤵'],
  [/chemise|blouse\b/i, '👔'],
  // Scindé de 👕 : pull/sweat/hoodie/cardigan vivent chez Vinted sous une
  // branche "Sweats et pulls" entièrement différente de "Hauts et t-shirts"
  // (voir vintedCategories.js) — un seul et même mot-clé ne peut plus servir
  // de proxy fiable au chemin catalogue, d'où l'icône dédiée.
  [/pull|sweat|hoodie|cardigan|gilet(?!.{0,4}(?:de.?costume|jaune|de.?sécurité))/i, '🧶'],
  [/t.?shirt|tee.?shirt|débardeur|polo\b|\btop\b|tunique|\bbodys?\b/i, '👕'],
  // 🩳 AVANT 👖 : "short en jean" doit rester un short (le mot-clé jean
  // matcherait sinon en premier).
  [/\bshorts?\b|\bbermudas?\b/i, '🩳'],
  [/jean|pantalon|jogging|legging|chino|salopette|survêtement/i, '👖'],
  // Lingerie/nuit (2026-07-09) : branche Vinted dédiée des deux côtés
  // (Lingerie et pyjamas / Sous-vêtements et chaussettes) — backlog T3.
  [/lingerie|soutien.?gorge|nuisette|pyjama|peignoir|tenue.?de.?nuit|caleçon|\bboxers?\b|\bslips?\b|culotte(?!.{0,10}cheval)/i, '🩲'],
  [/chaussette|collant/i, '🧦'],
  [/écharpe|foulard|châle|snood/i, '🧣'],
  // ⚠️ FRONTIÈRES UNICODE, PAS \b (2026-07-12) — bug « Gants » du run réel.
  // /gant/ sans frontière matche « élé-GANT- », adjectif omniprésent dans les
  // descriptions générées par l'IA : le Xiaomi Redmi Note 10 est ainsi parti sur
  // Vinted en « Hommes > Accessoires > Gants » (categoryPath du job, vérifié en
  // base), et une enceinte, une chaise ou un vase « élégants » y seraient partis
  // aussi.
  // ⚠️ \b NE SUFFIT PAS et c'est le piège dans le piège : en JS, \b est ASCII —
  // le « é » n'est pas un caractère de mot, donc \bgant matche ENCORE dans
  // « élégant » (frontière entre « é » et « g »). D'où les lookarounds Unicode
  // explicites ci-dessous, avec le drapeau /u.
  [/(?<![\p{L}\p{N}])gants?(?![\p{L}\p{N}])(?!\s*de\s*boxe)|(?<![\p{L}\p{N}])mitaines?(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])moufles?(?![\p{L}\p{N}])/iu, '🧤'],
  [/casquette|chapeau|bonnet|\bbob\b|béret|beret/i, '🧢'],
  [/lunette|solaire|sunglass/i, '🕶️'],
  // Même piège, deux fois : /montre/ matchait le VERBE (« ce casque montre une
  // isolation… ») et « dé-MONTRE- ». Substantif exigé, tournures verbales exclues.
  [/(?<![\p{L}\p{N}])montres?(?![\p{L}\p{N}])(?!\s+(?:qu|que|comment|bien|aussi|des|une?|le|la|les|son|sa|ses)\b)|watch|rolex|omega|swatch/iu, '⌚'],
  // /bague/ sans frontière matchait « BAGUEtte ».
  [/bijou|collier|bracelet|(?<![\p{L}\p{N}])bagues?(?![\p{L}\p{N}])|boucle.?d.?oreille|pendentif|broche/iu, '💍'],
  // Accessoires ajoutés le 2026-07-09 (backlog T3) — feuilles Vinted réelles.
  [/ceinture(?!.{0,10}(?:lombaire|à.?outils|de.?sécurité))/i, '🪢'],
  [/parapluie|ombrelle/i, '☂️'],
  [/porte.?cl[ée]s?\b/i, '🗝️'],
  // Mobilité électrique AVANT High-Tech : « trottinette Xiaomi » ne doit pas
  // matcher 📱 sur la marque (Xiaomi fait trottinettes ET téléphones). L'objet prime.
  [/trottinette|hoverboard|gyroroue|monoroue/i, '🛴'],
  // High-Tech
  [/iphone|smartphone|téléphone|galaxy|\bpixel\b|xiaomi|oneplus/i, '📱'],
  [/carte.?graphique|carte.?m[èe]re|\bgpu\b|\brtx\b|geforce|radeon|\bcpu\b|barrette.?ram/i, '🖥️'],  // composants PC : "carte" seul → 🏆 Collection (bug)
  [/macbook|laptop|ordinateur.?portable|notebook|chromebook/i, '💻'],
  [/\bpc\b|imac|ordinateur|écran|moniteur/i, '🖥️'],
  // 📲 scindé de 📱 (2026-07-09, T4) : feuille dédiée Électronique >
  // Tablettes, liseuses et accessoires > Tablettes.
  [/tablette(?!.{0,4}de.?chocolat)|ipad|galaxy.?tab/i, '📲'],
  [/écouteur|airpods?|earbud|casque|headphone/i, '🎧'],
  [/enceinte|haut.?parleur|speaker|barre.?de.?son|soundbar/i, '🔊'],
  [/console|playstation|\bps[2-5]\b|xbox|nintendo|switch|game.?boy|manette|jeu.?vidéo/i, '🎮'],
  // télé(?![a-zà-ÿ]) et non télé\b : \b est ASCII-only en JS, donc "télé"
  // suivi d'une lettre matchait quand même ("télécommande" → Téléviseurs).
  [/meuble.?(?:tv|t[ée]l[ée]|hi.?fi)/i, '🛋️'],  // meuble TV = mobilier, pas un téléviseur
  [/\btv\b|télé(?![a-zà-ÿ])|téléviseur|télévision|projecteur|vidéoprojecteur/i, '📺'],
  [/appareil.?photo|caméra|camera|reflex|gopro|objectif|caméscope/i, '📷'],
  [/drone/i, '🛸'],
  [/imprimante|scanner/i, '🖨️'],
  [/clavier/i, '⌨️'],
  [/souris/i, '🖱️'],
  // Maison
  [/canapé|sofa|fauteuil|banquette|pouf/i, '🛋️'],
  [/chaise|tabouret|\bbanc\b/i, '🪑'],
  [/\blit\b|matelas|sommier|couette|drap|parure/i, '🛏️'],
  [/lampe|luminaire|applique|suspension|lampadaire|ampoule|\bled\b|guirlande(?!.{0,14}(?:de.?)?(?:sapin|noël|noel))/i, '💡'],
  [/miroir/i, '🪞'],
  [/bougie|photophore/i, '🕯️'],
  [/cadre|tableau(?!.?électrique)|poster|affiche/i, '🖼️'],
  [/plante|cache.?pot|jardinière/i, '🪴'],
  [/vase\b/i, '🏺'],
  [/assiette|\bbol\b|tasse|\bmug\b|verre|carafe|vaisselle/i, '🍽️'],
  [/casserole|poêle|cocotte|marmite|ustensile/i, '🍳'],
  // Maison — textiles/déco/papeterie/animaux/fêtes (2026-07-09, backlog T3) :
  // toutes ces branches existent réellement (Maison > Textiles/Décoration/
  // Fournitures de bureau/Animaux/Célébrations et fêtes — arbre archivé).
  [/rideau|voilage|\bstores?\b/i, '🪟'],
  [/coussin(?!.{0,14}(?:allaitement|grossesse))|plaid\b|jeté.?de.?(?:lit|canapé)/i, '🪶'],
  [/\btapis\b(?!.?(?:de.?)?(?:course|yoga|souris|selle|sol|éveil|bain|jeu))/i, '🟫'],
  [/nappe\b|napperon|linge.?de.?table/i, '📜'],
  [/horloge|pendule\b|réveil/i, '🕰️'],
  [/no[eë]l|guirlande.?de.?sapin|boule.?de.?sapin|crèche\b/i, '🎄'],
  [/stylo|papeterie|carnet|bloc.?notes?|surligneur|crayon(?!.{0,12}(?:lèvres|yeux|sourcils))|calculatrice|agenda\b|trousse(?!.{0,4}(?:de.?toilette|à.?maquillage))/i, '🖋️'],
  // Électroménager
  [/bouilloire|théière/i, '🫖'],
  [/aspirateur|roomba|nettoyeur.?vapeur/i, '🧹'],
  [/frigo|réfrigérateur|congélateur/i, '🧊'],
  [/\bfour\b|micro.?onde/i, '♨️'],
  [/mixeur|blender|robot.?(?:cuisine|pâtissier)|thermomix|batteur.?électrique/i, '🥣'],
  [/grille.?pain|toaster/i, '🍞'],
  [/friteuse|airfryer/i, '🍟'],
  [/sèche.?cheveux|lisseur|boucleur/i, '💇'],
  // Climatisation / chauffage d'appoint (2026-07-09) : feuilles réelles sous
  // Maison > Entretien de la maison > Chauffage, climatisation et ventilation.
  [/ventilateur|climatiseur|purificateur.?d.?air|humidificateur|déshumidificateur/i, '🌀'],
  [/radiateur|chauffage.?d.?appoint|convecteur|bain.?d.?huile/i, '🌡️'],
  // Bricolage
  [/perceuse|visseuse|tournevis|perforateur/i, '🪛'],
  [/scie|tronçonneuse|élagueuse/i, '🪚'],
  [/marteau|maillet|\bmasse\b/i, '🔨'],
  [/échelle|escabeau/i, '🪜'],
  [/peinture|rouleau.?peinture|pinceau/i, '🖌️'],
  [/\bvis\b|boulon|cheville|clou\b/i, '🔩'],
  [/mètre.?ruban|niveau.?(?:laser|à.?bulle)/i, '📏'],
  [/clé.?(?:plate|allen|molette|mixte|dynamométrique)|pince|étau|serre.?joint/i, '🔧'],
  // Jardin
  [/tondeuse|débroussailleuse|scarificateur/i, '🌱'],
  [/taille.?haie|sécateur|cisaille/i, '✂️'],
  [/barbecue|plancha|\bbbq\b/i, '🔥'],
  [/salon.?de.?jardin|parasol|transat(?!.{0,10}(?:b[ée]b[ée]|enfant|nouveau))/i, '⛱️'],  // transat BÉBÉ exclu → tombe au filet plutôt que Parasols (jardin)
  // Sport
  [/vélo|\bvtt\b|bicyclette/i, '🚲'],
  [/trottinette/i, '🛴'],
  [/skate|longboard/i, '🛹'],
  [/roller|patin/i, '⛸️'],
  [/\bskis?\b|snowboard/i, '🎿'],
  [/ballon|football/i, '⚽'],
  [/tennis|raquette|badminton|squash/i, '🎾'],
  [/golf/i, '⛳'],
  [/haltère|kettlebell|musculation|fitness/i, '🏋️'],
  [/boxe|\bmma\b/i, '🥊'],
  [/tente|camping|sac.?de.?couchage|duvet/i, '⛺'],
  [/pêche|moulinet|waders/i, '🎣'],
  [/yoga|pilates/i, '🧘'],
  // Auto-Moto
  [/moto\b/i, '🏍️'],
  [/scooter/i, '🛵'],
  [/pneu|jante|\broue\b/i, '🛞'],
  [/voiture|automobile|autoradio|pare.?choc|rétroviseur/i, '🚗'],
  // Beauté
  [/parfum|eau.?de.?(?:toilette|parfum)|cologne/i, '🌸'],
  [/rouge.?à.?lèvre|gloss|lipstick|mascara|palette|fard|eyeliner|fond.?de.?teint|blush|maquillage/i, '💄'],
  [/vernis|manucure/i, '💅'],
  [/crème|sérum|lotion|shampooing|gel.?douche|savon|\bsoin\b/i, '🧴'],
  // Musique
  [/guitare|stratocaster|telecaster|les.?paul|ukulélé/i, '🎸'],
  [/violon|violoncelle|contrebasse/i, '🎻'],
  [/batterie(?!.{0,15}(?:voiture|moto|vélo|externe|cuisine))|cymbale|caisse.?claire/i, '🥁'],
  [/trompette|saxophone|clarinette|flûte/i, '🎺'],
  [/vinyle|vinyl|platine|33.?tours|45.?tours/i, '💿'],
  // Médias physiques (2026-07-09, backlog T3) : Divertissement > Vidéo (DVD/
  // Blu-ray/VHS) et > Musique (CD/Cassettes audio) — 📀 AVANT 💽 pour que
  // "cassette vidéo" parte en Vidéo, "cassette" seule = audio par défaut.
  [/\bdvd\b|blu.?ray|\bvhs\b|cassette.?vidéo|laserdisc/i, '📀'],
  [/\bcd\b|\bk7\b|cassette|minidisc/i, '💽'],
  [/harmonica/i, '🎼'],
  [/micro(?:phone)?\b/i, '🎤'],
  // Jouets
  [/lego|duplo|kapla|jeu.?de.?construction/i, '🧱'],
  [/peluche|doudou/i, '🧸'],
  [/poupée|barbie|poupon/i, '🪆'],
  [/puzzle/i, '🧩'],
  // playmobil : aucune feuille Vinted dédiée (0 hit dans l'arbre, vérifié
  // 2026-07-09) — rangé avec les figurines ("Sets de jeux" = feuille sœur).
  [/figurine|funko|playmobil/i, '🦸'],
  // Livres
  [/manga|\bbd\b|bande.?dessinée|comics/i, '📖'],
  [/livre|roman|encyclopédie|dictionnaire/i, '📚'],
  [/magazine|revue\b/i, '📰'],
  // Collection
  [/timbre/i, '📮'],
  [/monnaie|numismat|pièce.?de.?monnaie/i, '🪙'],
  // Puériculture — scindée en 4 icônes (juillet 2026) : l'ancienne 👶 unique
  // conflatait poussette/siège auto/biberon/babyphone, quatre branches
  // catalogue différentes sur les 3 plateformes (un babyphone partait en
  // "Poussettes"). ⚠️ Conflations puériculture RESTANTES, hors de ces regex :
  // "transat" (bébé) part sur ⛱️ salon de jardin, "chaise haute" sur 🪑
  // chaise, "lit parapluie" sur 🛏️ lit — à scinder si le volume le justifie.
  [/poussette|landaus?\b/i, '👶'],
  [/siège.?auto/i, '💺'],
  [/biberon/i, '🍼'],
  [/babyphone|baby.?phone|écoute.?bébé/i, '📟'],
];
// Icône par défaut si aucun mot-clé ne matche : celle de la catégorie.
const CAT_DEFAULT_ICONS = {
  'Mode':'👗','Luxe':'💎','High-Tech':'📱','Maison':'🏠','Électroménager':'⚡',
  'Jouets':'🧸','Livres':'📚','Sport':'⚽','Auto-Moto':'🚗','Beauté':'💄',
  'Musique':'🎵','Collection':'🏆','Multimédia':'📺','Jardin':'🌿','Bricolage':'🔧','Autre':'📦',
};
// Accessoires fréquemment INCLUS avec un appareil principal — leur simple
// mention ne doit pas reclasser l'objet (« Nintendo Switch avec dock » reste
// une console, pas un 🔌 « Batteries externes » ; bug réel 2026-07-16, une
// console partait en cross-post dans la mauvaise catégorie). On retire les
// clauses d'INCLUSION (« avec … dock », « + … câble », « livré avec … housse »)
// AVANT la détection : l'objet PRINCIPAL pilote alors l'icône. Un accessoire
// vendu SEUL (« Chargeur iPhone », « Dock USB-C ») n'a pas de marqueur
// d'inclusion → sa mention reste → il est classé 🔌 comme avant.
// ⚠️ MARQUEURS SYMBOLES HORS \b (fix 2026-07-17) : « + » et « & » sont des
// caractères NON-WORD ; entourés d'espaces (« blanc + dock »), un \b autour
// d'eux ne matche jamais → la clause « + dock » n'était pas retirée et une
// console « Switch OLED blanc + dock » repartait en 🔌 (bug réel re-test dock).
// On sépare donc les marqueurs MOTS (bornés par \b) des marqueurs SYMBOLES
// (`[+&]`, sans \b). Constaté aussi sur « Casque Bose & câble » → 🔌.
const INCLUDED_ACCESSORY_CLAUSE =
  /(?:\b(?:avec|with|inclus|incluse?s?|livré[e]?s?\s+avec|comprend|comprenant|accompagné[e]?\s+de|fourni[e]?s?\s+avec)\b|[+&])\s*[^,.;:!?]*?\b(?:dock|chargeur|c[âa]ble|adaptateur|hub|manette|joy-?con|housse|[ée]tui|coque|protection|support|sacoche|pochette)\b[^,.;:!?]*/gi;

export function detectObjectIcon(titre, description, type){
  const raw=((titre||'')+' '+(description||''));
  // Dé-bruitage des accessoires inclus (cf. INCLUDED_ACCESSORY_CLAUSE).
  const t=raw.replace(INCLUDED_ACCESSORY_CLAUSE,' ').toLowerCase();
  for(const [re,icon] of OBJECT_ICON_RULES){ if(re.test(t)) return icon; }
  // ⚠️ FILET « Luxe » (2026-07-17) : la catégorie Luxe est supprimée, mais des
  // items LEGACY (ou une IA pas encore redéployée) peuvent encore porter
  // type="Luxe" → 💎 non mappé = injouable. On ré-dérive alors le VRAI type
  // produit (detectType) pour retomber sur une catégorie mappée : un sac/une
  // montre de luxe redeviennent Mode, un parfum Beauté. (Les items AVEC un
  // mot-objet ont déjà été résolus par les règles ci-dessus.)
  let effectiveType = type;
  if(String(type).toLowerCase()==='luxe') effectiveType = detectType(titre, description);
  if(CAT_DEFAULT_ICONS[effectiveType]) return CAT_DEFAULT_ICONS[effectiveType];
  const key=Object.keys(CAT_DEFAULT_ICONS).find(k=>k.toLowerCase()===(effectiveType||"").toLowerCase());
  return key?CAT_DEFAULT_ICONS[key]:CAT_DEFAULT_ICONS['Autre'];
}

// ── Design 2026 (Lens / navbar) : CSS des cards de liste (maquette validée).
// Partagé entre StockTab (.stock-v2) et VentesTab (.ventes-v2) — même tokens,
// même structure row [tuile | infos | droite], mêmes filtres à pastilles.
export function buildCardCss(scope){
  const s='.'+scope;
  return `
${s}{
  --canvas:#EDEAE0;
  --paper:#F6F5F1;
  --ink:#10201B;
  --teal:#2F9E90;
  --teal-deep:#1B6E62;
  --amber:#E8956D;
  --mute:#8A8578;
  --border:#E7E3D8;
  font-family:'Space Grotesk',sans-serif;
}
${s} .row{
  background:#fff;border-radius:16px;
  padding:11px 12px;border:1px solid var(--border);
  display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;
  position:relative;
}
${s} .row.in-swipe{padding:0;border:none;border-radius:0;background:transparent;flex:1;min-width:0;cursor:pointer;}
/* .edit-affordance (icône crayon) supprimée le 2026-07-14 : la carte entière est
   cliquable pour éditer, l'icône était redondante et se collait au prix. */
${s} .cat-tile{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
${Object.entries(CAT_TILE_COLORS).map(([type,color])=>`${s} .${catClass(type)}{background:${color};}`).join('\n')}
${s} .left{min-width:0;}
${s} .title-line{display:flex;align-items:center;gap:6px;}
${s} .title{font-weight:700;font-size:14.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${s} .brand-dot{width:3px;height:3px;border-radius:50%;background:var(--mute);opacity:.7;flex-shrink:0;}
${s} .brandname{font-size:12px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${s} .qty-badge{font-size:11px;font-weight:700;color:var(--teal-deep);flex-shrink:0;}
${s} .meta{font-size:11.5px;color:var(--mute);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${s} .meta .hl{color:var(--ink);}
/* ⚠️⚠️ AUCUN BACKTICK DANS CE FICHIER — tout ce CSS est un template literal JS.
   Un backtick posé ici (j'avais écrit .left entre backticks, à la mode Markdown)
   TERMINE la chaîne : buildCardCss se casse en plein milieu et l'app entière
   part en écran blanc (« .left is not a function »). Et vite build ne le voit
   PAS : le fichier reste syntaxiquement valide, il ne veut simplement plus rien
   dire. Citer un sélecteur ? Guillemets français, jamais de backtick.

   flex-wrap OBLIGATOIRE (2026-07-13). Sans lui, la rangée de pastilles ne
   pouvait PAS passer à la ligne : chaque pastille a un contenu de largeur
   irréductible (min-width auto), donc au-delà de 3-4 pastilles la rangée
   débordait de la colonne de gauche et venait passer SOUS les boutons de la
   colonne de droite — c'est le chevauchement « En ligne » / « Republier ».
   La 5e pastille (« En ligne ») n'a fait que révéler le défaut, elle ne l'a pas
   créé : 4 plateformes suffisaient déjà à serrer la carte sur mobile. */
${s} .icons{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;min-width:0;}
${s} .micon{height:19px;padding:0 6px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700;gap:3px;flex:0 0 auto;white-space:nowrap;}
${s} .ic-vinted{background:#09B584;}
${s} .ic-leboncoin{background:#EA5B0C;}
${s} .ic-beebs{background:#FF6B35;}
${s} .ic-ebay{background:#0064D2;}
${s} .ic-plateforme{background:var(--teal-deep);}
${s} .ic-pending{background:var(--amber);}
${s} .ic-loc{background:var(--mute);}
/* « En ligne » : un STATUT, pas une plateforme. Il ouvre la rangée, et se
   distingue par sa FORME (chip clair cerclé de teal + point) plutôt que par une
   6e couleur pleine : cinq aplats saturés côte à côte rendaient la carte
   illisible. Teal du design system (pas de nouvelle teinte), poids 700 max.
   ⚠️ white-space:nowrap est porté par .micon : sans lui, « En ligne » se cassait
   en « En » / « ligne » quand la place manquait (constaté sur la 1re carte). */
${s} .ic-online{background:rgba(47,158,144,.12);color:var(--teal-deep);box-shadow:inset 0 0 0 1px rgba(47,158,144,.40);}
${s} .ic-online .dot{width:5px;height:5px;border-radius:50%;background:var(--teal);flex:0 0 auto;}
/* Plateformes : LOGOS et non plus noms écrits. « Leboncoin » + « Beebs » en toutes
   lettres débordaient la carte en largeur mobile quel que soit le CSS — quatre
   logos de 18 px tiennent dans la place d'un seul nom. Aucun socle ni cadre ici :
   PlatformLogo fournit déjà l'icône carrée (socle blanc pour vinted/ebay, icône
   d'app pleine pour beebs/leboncoin). */
${s} .plogo{display:flex;align-items:center;flex:0 0 auto;line-height:0;}
${s} .right{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px;}
${s} .price{font-weight:700;font-size:13px;color:var(--ink);margin-bottom:1px;}
${s} .price .lbl{font-weight:500;font-size:9px;color:var(--mute);display:block;text-align:right;}
${s} .btn-stack{display:flex;flex-direction:column;gap:4px;width:78px;}
${s} .btn-publier{font-size:11.5px;font-weight:700;color:#fff;text-align:center;background:linear-gradient(155deg,var(--teal),var(--teal-deep));padding:6px 0;border-radius:9px;border:none;cursor:pointer;font-family:inherit;}
/* Déjà en ligne : « Republier » reste accessible (ajouter une plateforme) mais
   n'appelle plus l'action principale — l'aplat plein disait « il te reste à
   publier » sur un article déjà publié. */
${s} .btn-publier.is-online{background:transparent;color:var(--teal-deep);border:1px solid var(--teal);font-weight:600;padding:5px 0;}
${s} .btn-vendre{font-size:11px;font-weight:600;color:var(--mute);text-align:center;background:transparent;border:1px solid var(--border);padding:5px 0;border-radius:9px;cursor:pointer;font-family:inherit;}
${s} .cat-filters{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 2px 4px;}
${s} .cat-filters::-webkit-scrollbar{display:none;}
${s} .fpill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;background:#fff;border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--mute);white-space:nowrap;flex-shrink:0;cursor:pointer;font-family:inherit;transition:all 0.15s;}
${s} .fpill.active{background:var(--ink);border-color:var(--ink);color:#fff;}
${s} .fdot{width:8px;height:8px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(16,32,27,0.10);}
`;
}

const TYPE_LABELS_EN={'High-Tech':'High-Tech','Mode':'Fashion','Luxe':'Luxury','Maison':'Home','Électroménager':'Appliances','Jouets':'Toys','Livres':'Books','Sport':'Sport','Auto-Moto':'Vehicles','Beauté':'Beauty','Musique':'Music','Collection':'Collection','Multimédia':'Multimedia','Jardin':'Garden','Bricolage':'DIY','Autre':'Other'};
export function typeLabel(type,lang){return lang==='en'?(TYPE_LABELS_EN[type]||type):type;}
export function marqueLabel(m,lang){return(lang==='en'&&m?.toLowerCase()==='sans marque')?'Unbranded':m;}

export const SKELETON_ITEMS=[
  {title:'Veste Zara oversize',  type:'Mode',       marque:'Zara',    buy:12,  qty:1,  days:2},
  {title:'Lot Pokémon x20',      type:'Collection', marque:'Pokémon', buy:8,   qty:20, days:null},
  {title:'iPhone 12 64Go',       type:'High-Tech',  marque:'Apple',   buy:180, qty:1,  days:5},
  {title:'Sac Kelly Hermès',     type:'Mode',       marque:'Hermès',  buy:125, qty:1,  days:1},
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15,  qty:1,  days:null},
];
export const SKELETON_SOLD=[
  {title:'Jean Levis 501',       type:'Mode',       marque:'Levis',   buy:15, sell:38, margin:23, marginPct:61},
  {title:'Perceuse Makita 18V',  type:'High-Tech',  marque:'Makita',  buy:45, sell:89, margin:44, marginPct:49},
  {title:'Paquet Pokémon ×5',    type:'Collection', marque:'Pokémon', buy:2,  sell:15, margin:13, marginPct:87},
];

const VOICE_EXAMPLES_FR_RAW = [
  { text: "J'ai acheté une veste Zara oversize taille M, noire, très bon état, 12€ au vide-grenier de Corbeil, elle est dans le sac bleu sous l'escalier", tag: "Ajouter", cls: "add" },
  { text: "Où j'ai rangé mon iPhone 12 ?", tag: "Stock", cls: "query" },
  { text: "J'ai pris un lot de 3 paires de Nike Air Max 90, pointures 42 43 et 44, 60€ le lot sur Facebook Marketplace, dans la caisse rouge du garage", tag: "Ajouter", cls: "add" },
  { text: "Qu'est-ce que j'ai dans le bac H48 ?", tag: "Stock", cls: "query" },
  { text: "J'ai chopé un sac Hermès Kelly authentique, cuir marron, légèrement usé sur les anses, 125€ en dépôt-vente, je l'ai rangé dans la vitrine du salon", tag: "Ajouter", cls: "add" },
  { text: "J'ai vendu l'iPhone 380€ sur Vinted, expédié aujourd'hui", tag: "Vendre", cls: "sell" },
  { text: "J'ai acheté un lot de 20 cartes Pokémon dont 2 rares holographiques, 8€ à la brocante, boîte à cartes sur le bureau", tag: "Ajouter", cls: "add" },
  { text: "Combien j'ai gagné ce mois-ci ?", tag: "Stats", cls: "query" },
  { text: "Le sac Hermès est parti à 420€, payé en liquide", tag: "Vendre", cls: "sell" },
  { text: "C'est quoi mes articles en stock depuis plus de 2 semaines ?", tag: "Stats", cls: "query" },
  { text: "J'ai vendu le lot Nike 55€ sur Leboncoin", tag: "Vendre", cls: "sell" },
  { text: "Quelle est ma marge moyenne sur la Mode ?", tag: "Stats", cls: "query" },
];
const VOICE_EXAMPLES_EN_RAW = [
  { text: "I bought an oversized Zara jacket size M, black, great condition, €12 at the Corbeil car boot sale, it's in the blue bag under the stairs", tag: "Add", cls: "add" },
  { text: "Where did I put my iPhone 12?", tag: "Stock", cls: "query" },
  { text: "I grabbed a lot of 3 pairs of Nike Air Max 90, sizes 42 43 and 44, €60 the lot on Facebook Marketplace, in the red crate in the garage", tag: "Add", cls: "add" },
  { text: "What do I have in bin H48?", tag: "Stock", cls: "query" },
  { text: "I picked up an authentic Hermès Kelly bag, brown leather, slightly worn handles, €125 at a consignment store, stored in the living room display cabinet", tag: "Add", cls: "add" },
  { text: "I sold the iPhone for €380 on Vinted, shipped today", tag: "Sell", cls: "sell" },
  { text: "I bought a lot of 20 Pokémon cards including 2 holographic rares, €8 at the flea market, card box on the desk", tag: "Add", cls: "add" },
  { text: "How much did I make this month?", tag: "Stats", cls: "query" },
  { text: "The Hermès bag sold for €420, paid cash", tag: "Sell", cls: "sell" },
  { text: "Which items have been in stock for more than 2 weeks?", tag: "Stats", cls: "query" },
  { text: "Sold the Nike lot for €55 on Leboncoin", tag: "Sell", cls: "sell" },
  { text: "What's my average margin on Fashion?", tag: "Stats", cls: "query" },
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

export function getRotatingLensPlaceholders(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? LENS_PLACEHOLDERS_EN : LENS_PLACEHOLDERS_FR;
  if (sym === '€') return raw;
  return raw.map(t => t.replace(/€/g, sym));
}

export function getRotatingExamples(currency, lang) {
  const sym = CURRENCY_SYMBOLS[currency] || '€';
  const raw = lang === 'en' ? VOICE_EXAMPLES_EN_RAW : VOICE_EXAMPLES_FR_RAW;
  if (sym === '€') return raw;
  return raw.map(e => ({ ...e, text: e.text.replace(/€/g, sym) }));
}

export function groupSales(arr){
  const groups=[];
  for(const s of arr){
    const last=groups[groups.length-1];
    if(last&&last.title===s.title&&last.marque===s.marque&&last.date===s.date&&Math.abs((last.sell||0)-(s.sell||0))<0.01){
      last._qty=(last._qty||1)+1;
      last.margin=(last.margin||0)+(s.margin||0);
      last.marginPct=(last.sell||0)>0?(last.margin/(last.sell*last._qty))*100:0;
    }else{
      groups.push({...s,_qty:1});
    }
  }
  return groups;
}
