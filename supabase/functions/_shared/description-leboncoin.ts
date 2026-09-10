// ═══════════════════════════════════════════════════════════════════════════
// DESCRIPTION LEBONCOIN : AUCUNE MENTION D'UN AUTRE SITE (2026-09-09)
// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LEBONCOIN FAIT (mesuré le 09/09 sur le compte de Nico, wizard réel) :
// la règle est SERVEUR. Le formulaire ne dit rien pendant la saisie ; c'est
// `POST api.leboncoin.fr/api/adsubmit/v2/classifieds` qui répond 403
//   {"status":"rejected","details":[{"field":"body","message":"Nous vous
//    invitons à supprimer toute mention d'un site internet autre que
//    leboncoin.fr dans le titre et/ou le texte de votre annonce."}]}
// et le message apparaît sous le champ (#body-error). L'extension voyait un
// « Continuer qui ne fait rien » : le job 8fea6e80 (Sweat Tommy Jeans) est
// tombé sur « Leboncoin n'a pas confirmé le dépôt ».
//
// Ce qui déclenche, PROUVÉ :
//   · la description Vinted de Nico, dont le seul mot « de site » est le
//     hashtag « #VintedStyle » → 403. La règle est donc une SOUS-CHAÎNE,
//     insensible à la casse : un hashtag suffit, une borne de mot ne
//     protège pas (« VintedStyle » est refusé).
//   · « Robe Shein en très bon état » → ACCEPTÉ (annonce créée puis
//     supprimée) : une marque qui est aussi un site n'est pas visée.
//     « shein » (148 articles en base) NE DOIT PAS être dans la liste.
//
// LISTE FERMÉE : les places de marché entre particuliers (sous-chaîne) et
// toute adresse web. Jamais « leboncoin » (c'est leur site). Toute addition
// se mesure d'abord (scripts/description-leboncoin-selftest.mjs + comptage
// en base) — pas de devinette : un terme qu'on retire, c'est du texte de la
// vendeuse qui disparaît.
//
// CE QU'ON RETIRE, ET SEULEMENT ÇA (jamais une réécriture, l'IA n'y touche pas) :
//   1. le HASHTAG entier qui contient un terme (#VintedStyle, #vintedfrance) —
//      227 des 254 descriptions Vinted touchées ne portent QUE ça ;
//   2. sinon la PHRASE qui contient le terme — segment entre ponctuations
//      finales (. ! ?), retours à la ligne ou pictogrammes (📦 ❌ ✅ ⚠️
//      servent de puces dans ces descriptions : « ❌ Pas d'envoi via Vinted
//      Go » part en entier, « Envoi rapide 📦 » juste avant reste) ;
//   3. les adresses web (http…, www…, quelque-chose.fr/.com…) — le mot seul.
// FAIL-SAFE : si le texte devient vide, on rend l'ORIGINAL inchangé (un
// refus qu'on comprend vaut mieux qu'une annonce sans description) ; toute
// exception rend l'original. Le job en base n'est jamais modifié : c'est le
// texte SERVI à l'extension (get-pending-jobs) qui est nettoyé.
// Copie de la liste côté app : src/utils/descriptionMentions.js (bornes de
// mot, informatif) — les deux listes n'ont PAS le même rôle, ne pas fusionner.

export const TERMES_SITES_LEBONCOIN: readonly string[] = [
  "vinted",              // prouvé (403 sur « #VintedStyle »)
  "ebay",
  "beebs",
  "vestiaire collective",
  "vestiairecollective",
  "videdressing",        // l'ancien site ; en base, 74 hashtags « #videdressing »
  "depop",
  "wallapop",
];

// Adresse web : protocole, www., ou domaine.tld — leboncoin.fr exclu.
const ADRESSE_WEB = /(?:https?:\/\/\S+|www\.\S+|\b(?!leboncoin\.)[a-z0-9-]+\.(?:fr|com|net|org|eu|io|app|shop|co|be|ch)\b)/gi;

const PICTO = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u;
// Délimiteurs de segment : ponctuation finale suivie d'un blanc ou de la fin,
// ou un pictogramme. Les parenthèses capturantes gardent le délimiteur dans
// le split.
const DELIM = new RegExp(`([.!?]+(?=\\s|$)|${PICTO.source})`, "gu");

export interface NettoyageLeboncoin {
  texte: string;
  modifiee: boolean;
  termes: string[];
  retires: number;   // hashtags + phrases + adresses retirés (mentions de sites)
  vide: boolean;     // le nettoyage aurait tout effacé → original rendu
  marques: string[]; // hashtags de marque TIERCE retirés (2026-09-10)
  plafonnes: number; // hashtags retirés par le plafond de 5 (2026-09-10)
  // Minimum de 10 caractères de Leboncoin (2026-09-10) :
  complete?: string[];        // faits ajoutés pour atteindre le minimum
  videe_trop_courte?: boolean; // rien à ajouter → champ servi VIDE
}

// ═══════════════════════════════════════════════════════════════════════════
// DEUX RÈGLES DE PLUS, LUES SUR LA PAGE DE CORRECTION LEBONCOIN (2026-09-10,
// annonce 3266614438 de Nico, « Sweat Tommy Jeans bleu marine – Taille M ») :
//   « Conformément à nos règles de diffusion, nous vous autorisons à utiliser
//     CINQ (5) mots-clés dans le descriptif de votre annonce. »
//   et le mail : pas de marque/enseigne tierce (#TommyHilfiger sur un article
//   Tommy Jeans). Les deux règles s'appliquent, elles ne se remplacent pas.
// Notre description en portait DOUZE : #TommyJeans #TommyHilfiger #SweatHomme
// #TailleM #Streetwear #CasualStyle #LookUrbain #VetementHomme #BleuMarine
// #ModeHomme #BasicPremium #VintedStyle.
//
// Mesuré avant de coder (10/09) : 597 descriptions du parc dépassent 5
// hashtags (toutes importées de Vinted, max 141) ; sur 531 dépôts Leboncoin
// en 30 j, 6 partaient hors règle ; 203 descriptions citent une marque
// tierce par hashtag (Zara 137, Mango 134, Stradivarius 118, Bershka 116,
// Shein 81 — le bloc « #Zara #Mango #Stradivarius #Bershka #Shein » des
// vendeuses Vinted). Volume faible ⇒ pas de refonte, pas de nettoyage en base,
// la règle À L'ENVOI seulement, ici, avec la variante « mentions de sites ».
//
// CE QU'ON TOUCHE, ET SEULEMENT ÇA : des HASHTAGS (#Mot). Jamais le texte
// vendeur : « façon Zara » en clair (2 cas dans le parc) reste, une ligne
// « Mots-clés : … » sans dièse reste (indistinguable du texte — décision
// Nico : mieux vaut une annonce refusée qu'une description charcutée).
// La description Vinted n'est pas concernée (les hashtags y servent).
//   1. MARQUE TIERCE : un hashtag qui est une marque du lexique ET qui n'est
//      pas la marque de l'article (ni un préfixe / dérivé de celle-ci :
//      #ZaraKids sur un article Zara reste) est retiré. #TommyHilfiger part
//      d'un article Tommy Jeans, #TommyJeans reste.
//   2. PLAFOND DE 5 : s'il reste plus de 5 hashtags, on garde les 5 plus
//      SPÉCIFIQUES à l'article — la marque de l'article d'abord, puis ceux
//      dont les mots sont dans le titre (#SweatHomme, #TailleM, #BleuMarine),
//      puis les autres, les GÉNÉRIQUES en dernier (#ModeHomme, #Streetwear,
//      #CasualStyle, #LookUrbain, #BasicPremium). À score égal, l'ordre
//      d'écriture de la vendeuse fait foi.
// Une description déjà conforme ressort IDENTIQUE (aucun octet touché).
// ═══════════════════════════════════════════════════════════════════════════

// LEXIQUE DES MARQUES (relevé en base le 10/09) : les valeurs de
// inventaire.marque portées par ≥ 5 articles chez ≥ 3 vendeurs (697 entrées),
// repliées (minuscules, sans accents, lettres et chiffres seuls). PURGÉ juste
// dessous : les mots qui ne sont pas des marques (couleurs, matières,
// « accessoires », « tendance »…), les licences et personnages (Disney,
// Pokémon, Barbie… un #Marvel sur un article Disney n'est pas une enseigne
// tierce) et les marques homonymes d'un mot courant (Gant, Next, Only, Head,
// Champion…) — un faux positif retirerait un hashtag légitime.
const LEXIQUE_MARQUES_BRUT = "3suisses abercrombiefitch absorba accessoire accessoires accessories action adelejoris adidas adidasoriginals afibel agnesflo aigle airness alainmanoukian aldi amazon americaneagle americanvintage amisu andre ange annafield annakarel anneweyburn antonelle apple ardene arena argent armandthierry armandthiery arte artigli asics asos asosdesign asterix atlas atmosphera atmosphere auchan aucune autreton avene babyclub babymoov babynat badabulle bakugan bandai banpresto barbie barbour bash batman bayard beaba bebeconfort bebereve belair bensoncherry bershka bestmountain bestway bioviva birkenstock bizzbee blancheporte bleubonheur boboli bodyflirt bonnetqueen bonobo bonprix boohoo bosch boss boutchou boutiqueboheme boutiqueindependante bpcbonprixcollection bpcselection breal brice brooksbrothers burberry burton byone cable cacharel cachecache cadeaupapa cadetrousselle calinkalin calvinklein calvinkleinjeans camaieu campus canda canon cargo carhartt caroll carrefour cars casio castore catimini cecil celine celio champion chaps chapsralphlauren charlior charmance chattawak chaussea chevignon chic chicco chipie christiandior christianlaurier christinelaure christy cider claudiepierlot clementoni clockhouse cluse cocacola colorblock columbia commedesgarcons complices comptoirdescotonniers converse coolcat copcopine coton creeks crivit cyrillus damart darjeeling daxon dazy dccomics decathlon denim denimco derhy desigual despetitshauts devred dickies diddl diesel dior disney disneybaby diverse divided djeco dkny dockers domyos dontcallmejennyfer dopodopo dragonball dupareilaumeme eastpak eddiebauer edenpark educa eldys ellesse emeryrose emmaella emporioarmani energetics eram esmara esprit etam everlast exacompta faitmain fanatics fanta fantaisie fashion fashionnova fashionprivatecompany fbsister femme feshfen festina fila firefly fisherprice fizzy forever21 fortnite fossil fouganza freegun frozen fruitoftheloom funko funkopop gaastra gabriellavicenza galerieslafayette gant garcia garciajeans garfield gemo generic gentlemanfarmer geographicalnorway george geox gerarddarel gifi gildan givenchy glass goliath google gracemila graindeble graindemalice grandsboulevards gstar gstarraw gucci guess guilia gymshark haba hanes hardrock harleydavidson harrypotter hasbro havaianas head hellokitty hellyhansen hema hermes histoiredor hmdivided hmmama hollister hotwheels hugoboss hummel hurley icepeak iconice ikea ikks inapril1986 inconnu inesis inextenso influx intex intextenso ipanema isabelmarant isotoner ithippie ixon izod jackjones jackwolfskin jacquelineriu janod japanstyle jeanbourget jeanlouisscherrer jenesaisquoi jennifer jennyfer johnbaner johnh jolly jonak jordan jordanxparissaintgermain jott jules jurassicworld jusdorange justfab kalenji kaporal kappa kariban karllagerfeld karlmarcjohn kenzo kiabi kickers kidkanai kidsbygemo kidsgraffiti kilky kimadi kimbaloo kinder kipsta kitchoun kookai kwoman lacity lacompagniedespetits lacoste lafabriquedesgarcons lafeemaraboutee lahalle lancaster lancel lancome laneige lansay lanvin lapetiteetoile laredoute larousse leclerc lecoqsportif leecooper lefties lego legoduplo lepharedelabaleine lesbagatelles lespetitesbombes lespetitscailloux lestropeziennes letempsdescerises levis levistraussco lhbylahalle liberto lilierose lililala lilimarelle lilliputiens lisarose littledutch littlemarcel littlestpetshop liujo livergy llbean logg lolaespeleta lolaliza lolsurprise longboard longchamp looneytunes lotto love lulucastagnette luneville lupilu luxury madeinfrance madeinitaly maison123 maisonheritage maje majestic mango manoukian marabout marcjacobs marksspencer marlboroclassics marvel massimodutti mattel mayoral mcdonalds megableu merryscott mespetitscailloux mexx michaelkors mickeymouse millenium minecraft minelli minions minnie miraculous misscaptain missguided mitchellness mmadeinitaly modavista mollybracken momcozy monoprix monoprixautreton morgan mosquitos motsdenfants msmode mustang mustela myheroacademia mylittlepony nabaiji nafnaf nakd nameit napapijri naruto nasa nathan nattou nautica nestle newbalance newcollection newera newfashion newlook newyorker next nextlevel nickelodeon nike nikeair nintendo nocibe noel noemieco noexcuse noir nolabel noukies oakland oakley obaibi okaidi olaian oldnavy ollygan olympiquedemarseille oncloud oneill onepiece onestep only orcelly orchestra orchestrabebe oxbow oxford oxybul oysho palladium palomino panini papillon paprika pasdemarque patagonia pataugas patetripaton patricebreal pauljoe pawpatrol pepejeans pepperts pepsi petitbateau petitbeguin petitcreateur petitkimbaloo phildar philips philipsavent pickouic pieces pierrecardin pimkie pinkie playmobil playmobil123 playstation playtive pokemon poloralphlauren pommette portcompany powerlix premaman prettylittlething primark princessetamtam projectxparis promod ptitmome pullbear puma punkidz puzzle pzoz quechua queshua quiksilver rainbow ralphlauren ravensburger rayban redskins reebok renault reserved ricalewis rinascimento ripcurl riverisland rodier rose rougegorge rowenta roxy russell russellathletic saguaro salsa samsung sandro sanmarina sanrio sansmarque sansnom sarahjohn schott scotchsoda season seeusoon sephora sergeblanco sergentmajor sergiotacchini sessun sezane shein sheincurve shiny silvercrest sinequanone sisley sismix skatenation smoby smog soeur soliver somewhere soniarykiel sonicthehedgehog sony sophielagirafe sophyline spiderman spinmaster sports springfield stabilo stadetoulousain starter starwars stitch stradivarius studio stussy success sucredorge sudexpress suncoo superdry superga superman superwings supremegrip swarovski swatch tabel taillissime tallyweijl tamaris tams tapealoeil tapealoil tarajarmon teddysmith tedlapidus tefal tendance terranova terredemarins texbaby texto tf1games thekooples thenorthface thermobaby therollingstones thesmurfs tiffosi timberland tissaia today tomandjerry tometkiddy tommyhilfiger tommyjeans tomy topshop toscane tourdefrance toutsimplement toysrus tribord triumph tupperware twistshake ucollection uessentiel umbro underarmour undiz uniqlo unitedcolorsofbenetton universal unjourailleurs up2fashion usmarshall uspoloassn utoutpetits vanessawu vans verbaudet veromoda vertbaudet via28 victoriassecret vila vingino vintage vintageboutique vintagechic vintagedressing vintagelove volcom vondutch voyelles vtech walkandtalk wedze womenonly woolrich wrangler xbox yamaha ycoo yessica yvesrocher yvessaintlaurent zadigvoltaire zamba zanzea zapa zara zarababy zarakids zaraman zaratrafaluc zebra zeeman zgeneration zkids";
const LEXIQUE_PURGE = "accessoire accessoires accessories action ange argent arena arte atlas atmosphera atmosphere aucune autreton boutiqueboheme boutiqueindependante cable cadeaupapa campus canon cargo cars champion chic cider cocacola colorblock coton dccomics denim diddl diverse disney disneybaby dragonball faitmain fanta fantaisie fashion femme firefly fizzy fortnite frozen funko funkopop gant garcia garfield generic george glass goliath hardrock harrypotter head hellokitty hotwheels inconnu influx japanstyle jennifer jolly jordanxparissaintgramain jurassicworld jusdorange kinder littlestpetshop lolsurprise longboard looneytunes lotto love luxury madeinfrance madeinitaly majestic marvel mcdonalds mickeymouse millenium minecraft minions minnie miraculous mmadeinitaly motsdenfants mustang myheroacademia mylittlepony naruto nasa nathan nestle newcollection newfashion next nextlevel nickelodeon noel noexcuse noir nolabel olympiquedemarseille onepiece only oxford panini papillon paprika pasdemarque pawpatrol pepsi petitcreateur pieces pinkie pokemon puzzle rainbow reserved rose salsa sanrio sansmarque sansnom season shiny skatenation soeur somewhere sonicthehedgehog spiderman sports stadetoulousain starter starwars stitch studio success superman superwings tendance texto thesmurfs therollingstones today tomandjerry toscane tourdefrance universal vintage vintageboutique vintagechic vintagedressing vintagelove voyelles womenonly zebra";
const LEXIQUE_MARQUES: ReadonlySet<string> = (() => {
  const purge = new Set(LEXIQUE_PURGE.split(/\s+/));
  return new Set(LEXIQUE_MARQUES_BRUT.split(/\s+/).filter((m) => m && !purge.has(m)));
})();

// Vocabulaire GÉNÉRIQUE des hashtags de mode (plafond de 5) : un hashtag dont
// TOUS les mots sont là-dedans n'est spécifique à rien — il part en premier.
const MOTS_GENERIQUES = new Set(("mode fashion style styl look looks tendance tendances chic casual basic basics premium urbain urban streetwear ootd outfit " +
  "femme femmes homme hommes enfant enfants fille filles garcon garcons bebe kids kid vetement vetements clothes clothing tenue tenues " +
  "shopping occasion secondemain seconde main bonplan bonplans promo pascher cher neuf etat tbe luxe sport sports ete hiver printemps automne " +
  "dressing vintage cool top idee cadeau nouveau new collection selection qualite confort confortable elegant elegante classe classique moderne " +
  "jolie joli beau belle marque brand original originale deal bon plan").split(/\s+/));

const replier = (s: string) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// « #SweatHomme » → [sweat, homme] ; « #TailleM » → [taille, m] ; « #tommy_jeans » → [tommy, jeans]
const motsDuHashtag = (h: string): string[] => String(h).replace(/^#/, "")
  .replace(/([a-z\u00e0-\u00ff0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  .split(/[^\p{L}\p{N}]+/u).map((m) => replier(m)).filter(Boolean);

export interface ContexteLeboncoin {
  titre?: string;
  marque?: string;
  /** Faits DÉJÀ présents sur le job, servant à atteindre le minimum de 10
   *  caractères de Leboncoin. Rien n'est jamais inventé à partir d'eux. */
  etat?: string;
  taille?: string;
}

/** Les hashtags à RETIRER d'une description, avec le motif de chacun.
 *  Pur : rien n'est modifié ici, le retrait est fait ligne par ligne par
 *  nettoyerDescriptionLeboncoin (mêmes bornes, même finition). */
export function hashtagsARetirer(texte: string, contexte: ContexteLeboncoin = {}): { marques: Map<string, string>; plafonnes: Set<string> } {
  const marques = new Map<string, string>();
  const plafonnes = new Set<string>();
  const hashtags = [...new Set(String(texte ?? "").match(/#[^\s#]+/g) ?? [])];
  if (!hashtags.length) return { marques, plafonnes };
  const marqueArticle = replier(contexte.marque ?? "");
  const estMarqueArticle = (tok: string) => !!marqueArticle && (tok === marqueArticle || tok.startsWith(marqueArticle) || marqueArticle.startsWith(tok));
  // 1. marques tierces — SEULEMENT si la marque de l'article est connue :
  //    sans elle, aucun hashtag de marque n'est « tiers » (un #Zara sur un
  //    article dont la marque n'est pas renseignée serait un faux positif).
  const restants: string[] = [];
  for (const h of hashtags) {
    const tok = replier(h);
    if (marqueArticle && tok && LEXIQUE_MARQUES.has(tok) && !estMarqueArticle(tok)) { marques.set(h, tok); continue; }
    restants.push(h);
  }
  // 2. plafond de 5 : score de spécificité, ordre d'écriture à score égal
  if (restants.length > 5) {
    const motsTitre = new Set(String(contexte.titre ?? "").split(/[^\p{L}\p{N}]+/u).map(replier).filter(Boolean));
    const score = (h: string): number => {
      const tok = replier(h);
      if (estMarqueArticle(tok)) return 5;
      const mots = motsDuHashtag(h);
      const dansTitre = mots.filter((m) => motsTitre.has(m)).length;
      if (mots.length && dansTitre === mots.length) return 4;
      if (dansTitre > 0) return 3;
      if (mots.length && mots.every((m) => MOTS_GENERIQUES.has(m))) return 0;
      return 1;
    };
    const classes = restants.map((h, i) => ({ h, i, s: score(h) })).sort((a, b) => b.s - a.s || a.i - b.i);
    for (const c of classes.slice(5)) plafonnes.add(c.h);
  }
  return { marques, plafonnes };
}


const minuscule = (s: string) => s.toLowerCase();
const termesDans = (s: string): string[] => {
  const bas = minuscule(s);
  const t = TERMES_SITES_LEBONCOIN.filter((x) => bas.includes(x));
  ADRESSE_WEB.lastIndex = 0;
  if (ADRESSE_WEB.test(s)) t.push("adresse web");
  return t;
};

function nettoyerLigne(ligne: string, termes: Set<string>): { ligne: string; retires: number } {
  let retires = 0;
  // 1. hashtags entiers
  let l = ligne.replace(/#[^\s#]+/g, (h) => {
    if (termesDans(h).length) { retires++; termesDans(h).forEach((t) => termes.add(t)); return ""; }
    return h;
  });
  // 3. adresses web (mot seul)
  l = l.replace(ADRESSE_WEB, () => { retires++; termes.add("adresse web"); return ""; });
  if (!termesDans(l).length) return { ligne: l, retires };
  // 2. phrases : segments entre délimiteurs
  const parts = l.split(DELIM); // [seg, delim, seg, delim, …]
  const garder: boolean[] = parts.map(() => true);
  const estPicto = (s: string | undefined) => !!s && new RegExp(`^${PICTO.source}$`, "u").test(s);
  const vide = (s: string | undefined) => !s || !s.trim();
  for (let i = 0; i < parts.length; i += 2) {
    const seg = parts[i];
    const trouves = termesDans(seg);
    if (!trouves.length) continue;
    trouves.forEach((t) => termes.add(t));
    garder[i] = false; retires++;
    // la ponctuation qui FERME cette phrase part avec elle
    if (i + 1 < parts.length && !estPicto(parts[i + 1])) garder[i + 1] = false;
    // un pictogramme qui SERVAIT DE PUCE à cette phrase (rien devant lui) part aussi
    if (i - 1 >= 0 && estPicto(parts[i - 1]) && (i - 2 < 0 || vide(parts[i - 2]) || !garder[i - 2])) garder[i - 1] = false;
    // un pictogramme qui DÉCORAIT la fin de cette phrase (rien derrière lui) part aussi
    if (i + 1 < parts.length && estPicto(parts[i + 1]) && (i + 2 >= parts.length || vide(parts[i + 2]))) garder[i + 1] = false;
  }
  l = parts.filter((_, i) => garder[i]).join("");
  return { ligne: l, retires };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE MINIMUM DE 10 CARACTÈRES (2026-09-10, Pantalon de Choupette)
// ═══════════════════════════════════════════════════════════════════════════
// MESURÉ sur 45 jours et tout le parc, la coupure ne souffre aucune exception :
//     0 caractère ....  8 jobs, 8 PUBLIÉS   (champ vide = facultatif, accepté)
//     9 caractères ... 11 jobs, 0 publié    (« Peu porté » ×10, « Taille 44 » ×1)
//    10 et plus ...... 15 jobs, 15 PUBLIÉS
// Leboncoin impose donc un minimum de 10 caractères à une description NON
// VIDE, et le refuse CÔTÉ NAVIGATEUR : le clic sur Continuer n'émet aucune
// requête, aucun message n'apparaît dans nos sélecteurs, l'aperçu reste
// affiché. D'où le diagnostic « clic avalé » qui a coûté une journée — le
// Pantalon de Choupette a échoué trois fois pendant que son Jean (534
// caractères) passait entre deux de ses tentatives, même compte, même session.
//
// CE QU'ON FAIT : on complète jusqu'à 10 avec des faits DÉJÀ PRÉSENTS sur le
// job — état, marque, taille. Rien n'est inventé, rien n'est deviné : un fait
// absent du job n'est jamais fabriqué. Si on ne sait rien ajouter, on sert le
// champ VIDE, qui est prouvé passer (8 sur 8).
// ⛔ Une description de 0 caractère n'est PAS touchée : elle passe déjà.
// ⛔ Une description de 10 caractères ou plus n'est PAS touchée.
const LBC_DESCRIPTION_MIN = 10;

/** Les faits ajoutables, dans l'ordre où ils se lisent le mieux. Un fait déjà
 *  présent dans le texte (à la casse près) n'est jamais répété. */
function faitsAjoutables(texte: string, c: ContexteLeboncoin): string[] {
  const deja = texte.toLowerCase();
  const propose = [
    String(c.etat ?? "").trim(),
    String(c.marque ?? "").trim(),
    String(c.taille ?? "").trim() ? `Taille ${String(c.taille).trim()}` : "",
  ];
  return propose.filter((f) => f && !deja.includes(f.toLowerCase()));
}

/** Complète une description de 1 à 9 caractères. Rend le texte servi et ce qui
 *  a été ajouté (pour la trace). `vide: true` = on a renoncé et on sert "" . */
export function completerSiTropCourte(
  texte: string,
  contexte: ContexteLeboncoin = {},
): { texte: string; ajouts: string[]; vide: boolean } {
  const t = String(texte ?? "");
  // Hors périmètre : vide (accepté tel quel) ou déjà au-dessus du minimum.
  if (t.trim().length === 0 || t.length >= LBC_DESCRIPTION_MIN) return { texte: t, ajouts: [], vide: false };
  let sortie = t.trim();
  const ajouts: string[] = [];
  for (const fait of faitsAjoutables(sortie, contexte)) {
    sortie = `${sortie} — ${fait}`;
    ajouts.push(fait);
    if (sortie.length >= LBC_DESCRIPTION_MIN) return { texte: sortie, ajouts, vide: false };
  }
  // Rien de connu à ajouter, ou pas assez : le champ VIDE plutôt qu'un refus
  // silencieux. On perd le texte, on ne perd pas l'annonce.
  return { texte: "", ajouts: [], vide: true };
}

export function nettoyerDescriptionLeboncoin(description: string, contexte: ContexteLeboncoin = {}): NettoyageLeboncoin {
  // Le minimum s'applique APRÈS le nettoyage (consigne Nico) : c'est le texte
  // RÉELLEMENT servi qui doit passer la barre, pas celui d'avant — un retrait
  // de hashtags peut faire passer une description sous les 10 caractères.
  const nettoye = nettoyerSeulement(description, contexte);
  const min = completerSiTropCourte(nettoye.texte, contexte);
  if (min.texte === nettoye.texte) return nettoye;
  return {
    ...nettoye,
    texte: min.texte,
    modifiee: true,
    complete: min.ajouts,
    videe_trop_courte: min.vide,
  };
}

/** Le NETTOYAGE seul (mentions de sites, marques tierces, plafond de 5), sans
 *  le minimum de 10 caractères. Exporté pour que chaque règle se teste seule :
 *  passer par le tout ferait juger la propreté d'un texte sur sa longueur. */
export function nettoyerSeulement(description: string, contexte: ContexteLeboncoin = {}): NettoyageLeboncoin {
  const original = String(description ?? "");
  try {
    const aSites = termesDans(original).length > 0;
    const { marques, plafonnes } = hashtagsARetirer(original, contexte);
    if (!aSites && !marques.size && !plafonnes.size) {
      return { texte: original, modifiee: false, termes: [], retires: 0, vide: false, marques: [], plafonnes: 0 };
    }
    const termes = new Set<string>();
    let retires = 0;
    const aRetirer = new Set<string>([...marques.keys(), ...plafonnes]);
    const lignes = original.split(/\r?\n/).map((ligne) => {
      const r = aSites ? nettoyerLigne(ligne, termes) : { ligne, retires: 0 };
      retires += r.retires;
      // Hashtags de marque tierce et hashtags au-delà du plafond : le MOT
      // entier, rien d'autre (les hashtags de sites sont déjà partis plus haut).
      if (aRetirer.size) r.ligne = r.ligne.replace(/#[^\s#]+/g, (h) => (aRetirer.has(h) ? "" : h));
      // On ne retouche que les DOUBLES espaces créés par un retrait — jamais
      // la typographie de la vendeuse (« Offres bienvenues ! » garde son espace).
      const nettoyee = r.ligne.replace(/[ \t]{2,}/g, " ").trim();
      // Une ligne qui avait du texte et n'en a plus (ou plus que des
      // pictogrammes / ponctuation, « 📦 ✨ ») DISPARAÎT — pas de ligne vide
      // orpheline à sa place. Les lignes vides d'origine restent.
      if (ligne.trim() && !/[\p{L}\p{N}]/u.test(nettoyee)) return null;
      return nettoyee;
    }).filter((l): l is string => l !== null);
    const texte = lignes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!texte) return { texte: original, modifiee: false, termes: [...termes], retires, vide: true, marques: [], plafonnes: 0 };
    return { texte, modifiee: texte !== original, termes: [...termes], retires, vide: false, marques: [...marques.values()], plafonnes: plafonnes.size };
  } catch {
    return { texte: original, modifiee: false, termes: [], retires: 0, vide: false, marques: [], plafonnes: 0 };
  }
}
