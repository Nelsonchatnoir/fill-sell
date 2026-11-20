// ══ L’ICÔNE D’OBJET ET LE TYPE D’UN ARTICLE (sortis de shared.js le 20/11, point 1 de Nico) ══════════════════
// Code DÉPLACÉ tel quel, ligne pour ligne, depuis src/utils/shared.js (qui le ré-exporte : l’app ne change pas).
// Pourquoi : get-pending-jobs n’utilise que detectObjectIcon, mais importer shared.js tirait 341 Ko de sources
// (messagesServeur, textes…) dans une fonction au plafond de 5 Mo de Supabase (deux 413 la nuit du 20/11).
// ⛔ Ce module n’importe RIEN de shared.js (sinon import circulaire) ; tout ajout ici reste autonome.
import { oeuvreDArt, estOeuvreDArt } from './oeuvreDArt.js';

export function detectType(titre,marque){
  // (22/10 soir, point 2 — paugues) UNE ŒUVRE D'ART N'EST JAMAIS « BEAUTÉ » : « André Thomas - Huile post
  // impressionniste biblique sur carton » partait en Beauté sur le seul mot « Huile ». Quand la règle de base
  // dit « Beauté » et que le titre nomme une œuvre (src/utils/oeuvreDArt.js), c'est
  // de la décoration — Maison, comme « tableau|cadre » plus bas. ⛔ Jamais au-dessus d'un autre type : rejoué sur
  // 48 832 fiches du 30 j, l'œuvre en premier volait des T-shirts « sérigraphie », des sacs « toile monogramme »
  // et des livres d'art.
  const base = detectTypeBase(titre, marque);
  if (base === 'Beauté' && estOeuvreDArt(titre)) return 'Maison';
  return base;
}

// (05/11 soir, Nico — « Boîte à bijoux », PMF Vito : fiche rangée en « Mode ») Un contenant de bijoux est un objet de
// la maison : ses mots-bijoux ne font jamais le TYPE (même règle que l'icône, zonesContenantBijoux).
const CONTENANT_BIJOUX_TYPE = /(?<![\p{L}\p{N}])(?:bo[iî]tes?|coffrets?|coffres?|[ée]crins?|pr[ée]sentoirs?|organiseurs?|organisateurs?|plateaux?|arbres?|range|porte|rangements?)[\s-]*(?:(?:[àa]|de|d['’]|pour|aux|des)\s*)?(?:(?:les|vos|tes|mes|ses)\s+)?(?:bijou[xs]?|bagues?|colliers?|bracelets?|montres?|boucles?.?d.?oreilles?|pendentifs?)(?![\p{L}\p{N}])/giu;
const POUR_BIJOUX_TYPE = /(?<![\p{L}\p{N}])(?:pour|ranger)\s+(?:(?:les|vos|tes|mes|des|ses)\s+)?(?:bijou[xs]?|bagues?|colliers?|bracelets?|montres?|boucles?.?d.?oreilles?|pendentifs?)(?:\s*(?:,|et|ou|&|\/)\s*(?:(?:les|vos|tes|mes|des)\s+)?(?:bijou[xs]?|bagues?|colliers?|bracelets?|montres?|boucles?.?d.?oreilles?|pendentifs?))*(?![\p{L}\p{N}])/giu;
function detectTypeBase(titre,marque){
  const brut=((titre||'')+' '+(marque||'')).toLowerCase();
  const sansContenant=brut.replace(CONTENANT_BIJOUX_TYPE,' rangement déco ');
  const t=sansContenant===brut ? brut : sansContenant.replace(POUR_BIJOUX_TYPE,' ');
  // ⚠️ CATÉGORIE "Luxe" SUPPRIMÉE le 2026-07-17. L'ancien 1er test renvoyait
  // 'Luxe' dès qu'une marque « premium » figurait dans le texte — MAIS la liste
  // incluait des marques NON luxe (Ralph Lauren, Lacoste, Tommy, Boss, Armani),
  // et surtout 'Luxe' n'est mappé sur AUCUNE plateforme (💎 injouable). Un
  // parfum Chanel partait ainsi en Luxe → injouable. Désormais on classe par
  // TYPE DE PRODUIT : la marque (luxe ou non) n'influence plus la catégorie —
  // un sac Hermès → Mode, un parfum Chanel → Beauté, une Rolex → Mode.
  if(/robe|jupe|pull|jean(?!\W(?:paul|patou|jacques|claude|charles|louis|pierre|michel|marie|baptiste))|veste|manteau|costume|chemise|chemisier|blouse|short|legging|pantalon|\bpolo\b|\btop\b|t-shirt|cardigan|blouson|parka|doudoune|sweat|hoodie|débardeur|tunique|combinaison|kimono|salopette|bermuda|jogging|survêtement|maillot|bikini|lingerie|soutien|brassière|culotte|boxer|chaussette|collant|chaussure|basket|botte|sandale|espadrille|escarpin|mocassin|sneaker|talon|ballerine|sac|pochette|portefeuille|ceinture|écharpe|foulard|casquette|chapeau|bonnet|(?<![\p{L}\p{N}])gants?(?![\p{L}\p{N}])|lunette|bijou|collier|bracelet|\bbagues?\b|(?<![\p{L}\p{N}])montres?(?![\p{L}\p{N}])(?!\s*(?:connect|intelligente))|boucle|accessoire|imperméable|pyjama|nuisette|robe.?chambre|maillot.?bain|\bcap\b|\bbob\b|beret|turban|snood|mitaine|manchette|cravate|noeud.?papillon|bretelle|jarretelle|chaussure.?sport|derby|oxford|loafer|chelsea|compensée|plateforme|slip|string|monokini|playsuit|body|bustier|corset|louboutin|jimmy.?choo|manolo|birkin|kelly|neverfull|speedy/iu.test(t)) return 'Mode';
  if(/guitare|\bpiano\b|violon|\bbatterie\b(?!.{0,18}(?:voiture|cuisine|externe|lithium|rechargeable|li.?ion|au.?plomb|solaire|\d{3,}|perceuse|visseuse|drone|portable|ordinateur|tondeuse|\d+\s?v\b|\d+\s?mah))|\bsynthé\b|synthétiseur|ukulélé|trompette|saxophone|accordéon|contrebasse|clavier.?(?:midi|arrangeur|ma[îi]tre)|pédale.?(?:effet|guitare|basse)|table.?(?:de.?)?(?:mix|mixage)|\bampli\b(?!.{0,10}voiture|.{0,10}\bauto\b)|\bvinyle\b|vinyl|platine.?(?:vinyle|disque|dj)|\bpartition\b|solfège|\bgibson\b|\bfender\b|\bmarshall\b|\bibanez\b|\bepiphone\b|les.?paul|stratocaster|telecaster|\bstrat\b|guitare.?basse|basse.?(?:[eé]lec|acoustique|\d.?cordes|fretless|active)|\bbassiste\b|micro.?(?:studio|chant|enregistrement)|enceinte.?studio|moniteur.?studio/i.test(t)) return 'Musique';
  // Mobilité AVANT High-Tech : « trottinette Xiaomi » (Xiaomi = marque téléphone
  // ET trottinette) partait en High-Tech → 📱 Téléphones. L'objet prime sur la marque.
  if(/\btrottinette\b|hoverboard|gyroroue|monoroue|overboard/i.test(t)) return 'Sport';
  if(/iphone|samsung|huawei|xiaomi|oneplus|pixel|macbook|laptop|ordinateur|\bpc\b|computer|tablette|ipad|téléphone|smartphone|airpods|écouteur|casque(?!.{0,8}(?:moto|v[ée]lo|scooter|ski|chantier))|enceinte|jbl|bose|sony|beats|playstation|ps4|ps5|xbox|nintendo|switch(?!\s*(?:&|and|et|n)\s*go\b)|console|jeu.?video|manette|clavier|souris|écran|moniteur|imprimante|disque|ssd|\bram\b|processeur|gopro|appareil.?photo|camera|objectif|drone|fitbit|garmin|apple.?watch|smartwatch|montre.?connect|(?<!meuble.{0,6})tv|télévision|projecteur|home.?cinema|ampli|chargeur|cable|adaptateur|batterie.?externe|airpod|earbud|tws|true.?wireless|powerbank|hub|dock|station|chargeur.?sans.?fil|disque.?dur|clé.?usb|carte.?sd|carte.?graphique|carte.?m[èe]re|\bgpu\b|geforce|radeon|webcam|ring.?light|green.?screen|smart.?tv|android.?tv|chromecast|firestick|apple.?tv|box.?internet|routeur|répéteur.?wifi|alarme|camera.?surveillance|sonnette|imprimante.?3d|scanner|tablette.?graphique/i.test(t)) return 'High-Tech';
  if(/perceuse|visseuse|meuleuse|ponceuse|\bscies?\b|scie.?(?:circulaire|sauteuse|cloche)|\bforet\b|tournevis|\bmarteau\b(?!.{0,6}piqueur)|interrupteur|disjoncteur|prise.?électrique|tableau.?électrique|fusible|\bmakita\b|\bdewalt\b|\bryobi\b|\bfacom\b|\bstanley.?(?!cup)|\bpinces?\b|mastic|enduit|joint.?(?:silicone|plomberie)|silicone.?(?:sanitaire|joint)|carrelage|lame.?parquet|papier.?peint|rouleau.?peinture|niveau.?(?:laser|bulle)|mètre.?ruban|cheville.?(?:plastique|béton|mur)|clé.?(?:plate|allen|mixte|dynamométrique)|boulons?(?!\s*éblouir)|\bétau\b|établi|serre.?joint/i.test(t)) return 'Bricolage';
  if(/tondeuse(?!.{0,12}(?:cheveux|barbe|chien|animal))|débroussailleuse|taille.?haie|souffleur.?(?:feuilles|jardin)|tronçonneuse|sécateur|élagueuse|scarificateur|arrosoir|tuyau.?arrosage|asperseur|pompe.?jardin|\bbêche\b|\brateau\b|\bfourche\b(?!.{0,8}moto)|\bbinette\b|brouette|compost|\bterreau\b|engrais|graines?(?:\s+de\s+jardin)?|jardinage|\bhusqvarna\b|\bstihl\b(?!.{0,8}moto)/i.test(t)) return 'Jardin';
  if(/canapé|sofa|\btable\b|chaise|bureau|armoire|commode|\blit\b|matelas|étagère|bibliothèque|meuble|lampe|luminaire|miroir|tableau|cadre|tapis|rideau|coussin|plaid|couette|(?<![\p{L}\p{N}])draps?(?![\p{L}\p{N}])|serviette|vase|bougie|déco|cuisine|assiette|\bbol\b|verre|tasse|cafetière|machine.?café|grille.?pain|mixeur|robot|poêle|casserole|ustensile|réfrigérateur|micro.?onde|pouf|banquette|ottomane|tabouret|\bbar\b|console|desserte|vaisselier|bahut|buffet|vitrine|applique|suspension|guirlande|led|ampoule|parure|jeté|store|voilage|portant|cintre|organisateur|boite|panier|corbeille|plante|\bpot\b/iu.test(t)) return 'Maison';
  if(/lego|playmobil|hasbro|mattel|jouet|\bjeux?\b|puzzle|peluche|figurines?|\bfunko\b|nendoroid|\bamiibo\b|\bbandai\b|banpresto|kotobukiya|poupée|voiture.?miniature|construction|kapla|duplo|hot.?wheels|barbie/i.test(t)) return 'Jouets';
  if(/livre|bd|bande.?dessinée|manga|roman|magazine|comics|guide|encyclopédie|atlas|dictionnaire/i.test(t)) return 'Livres';
  if(/vélo|trottinette|skateboard|\bski\b|snowboard|raquette|ballon|football|basketball|tennis|badminton|golf(?!\s*(?:gti|tdi|tsi|gtd|\d|plus|r32|variant|sportsvan))|rugby|natation|plongée|\bsurf\b|kayak|randonnée|camping|\bsport|fitness|musculation|haltère|kettlebell|yoga|pilates|course|running|trail|cyclisme|équitation|boxe|arts.?martiaux|tapis.?course|vélo.?appartement|rameur|elliptique|corde.?sauter|élastique.?musculation|bande.?résistance|gant.?boxe|protège|casque.?vélo|genouillère|spike|crampon|patin|roller|tente|sac.?dos.?rando|gourde|frontale|bâton.?marche|canne.?pêche|moulinet|waders/i.test(t)) return 'Sport';
  if(/voiture|\bauto\b|moto|scooter|véhicule|pneu|jante|casque.?moto|pièce.?auto|autoradio|gps|huile.?moteur|liquide.?(?:de.?)?(?:refroidissement|frein)/i.test(t)) return 'Auto-Moto';
  if(/parfum|crème|sérum|mascara|rouge.?lèvre|palette|correcteur|dissolvant|vernis|shampooing|après-shampooing|masque.?cheveux|(?<!sans\s)huile(?!\s*(?:moteur|d.?olive|de.?friture|de.?tournesol|de.?colza|alimentaire|de.?coude))|lotion|gel.?douche|savon|rasoir|fond.?teint|bb.?cream|cc.?cream|cushion|anticernes|poudre|blush|bronzer|highlighter|fard.?paupières|eyeliner|crayon|kajal|extension.?cils|faux.?cils|sourcil|gloss|baume|exfoliant|gommage|peeling|autobronzant|spray.?solaire|after.?sun|déodorant|roll.?on|\bstick\b|eau.?de.?cologne|brosse|peigne|lisseur|boucleur|bigoudi|coton|lingette|démaquillant|tonique|brume/i.test(t)) return 'Beauté';
  if(/collectionn|cartes?\s*(?:pokémon|pokemon|magic|yu.?gi.?oh|panini|à.?collectionner|de.?collection|postale)|timbre|monnaie|pièce.?(?:de.?monnaie|ancienne|de.?collection|comm[ée]morative|rare)|funko|vintage|antique|brocante/i.test(t)) return 'Collection';
  if(/aspirateur|robot.?aspirateur|roomba|dyson|lave.?linge|lave.?vaisselle|congélateur|\bfour\b|hotte|plaque|induction|gazinière|sèche.?linge|sèche.?cheveux|fer.?repasser|climatiseur|ventilateur|radiateur|chauffage|chauffe.?eau|nespresso|dolce.?gusto|blender|robot.?cuisine|thermomix|friteuse|yaourtière|extracteur.?jus|centrifugeuse|bouilloire|épilateur|rasoir.?électrique|brosse.?dents/i.test(t)) return 'Électroménager';
  return 'Autre';
}

// ── Icône par type précis d'objet (même pattern que detectType : mots-clés
// dans titre + description, du plus spécifique au plus générique — l'ordre compte).
const OBJECT_ICON_RULES = [
  // Désambiguïsations prioritaires (avant les règles génériques)
  // Figurines / objets de collection — AVANT TOUTE règle vêtement. La description
  // d'une figurine décrit la TENUE du personnage représenté (kimono, manteau,
  // veste…) et matchait alors la règle vêtement 🧥 (« manteau|veste|kimono »,
  // plus bas) → catégorie Mode>Vêtements → champ « Taille » obligatoire absurde
  // sur une figurine (bug réel « Bandai Roronoa Zoro One Piece », 2026-07-17).
  // On matche l'OBJET (« figurine ») et les MARQUES de figurines (jamais des
  // marques de vêtement) : l'objet prime sur les habits du personnage. On ne met
  // PAS les noms de licences nus (naruto, one piece…) — un « hoodie Naruto » ou
  // un « maillot one-piece » doit rester un vêtement.
  // (24/10, sos.cuisine) La gamme VTech « Switch & Go » (dinosaures-robots transformables) est un JOUET de
  // cette famille : sans cette règle, ses titres tombaient sur la console (« switch »), puis, la console écartée,
  // sur ⚽ / 🏠 (« robot ») / 🚗 (« voiture ») — mesuré sur les 4 fiches du parc.
  [/figurines?|\bfunko\b|nendoroid|\bamiibo\b|\bbandai\b|banpresto|kotobukiya|good[sx]?.?smile|mc.?farlane|s\.?h\.?\s?figuarts|pop.?!?\s?vinyl|switch\s*(?:&|and|et|n)\s*go\b/i, '🦸'],
  [/basket[sx]?.?ball|ballon.?(?:de.?)?basket|panier[sx]?.?de.?basket/i, '🏀'],  // ballon de basket : "basket" seul → 👟 (bug)
  // (29/10, point 3 — Ianis Martin) « Top case » est un BAGAGE DE MOTO, pas un haut ni un casque : sans cette règle,
  // « Top case … 2 casques » partait en 👕 (« top ») puis, une fois 👕 gardé, en 🪖 (« casques » = la contenance).
  [/\btop[\s-]?cases?\b/i, '🏍️'],
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
  [/sac[sx]?.?de.?(?:sport|gym|fitness)/i, '🎽'],
  [/lunettes?.?de.?(?:natation|piscine)/i, '🥽'],
  [/sac[sx]?.?à.?dos|backpack|cartable/i, '🎒'],
  [/batterie[sx]?.?externe|powerbank|chargeur|câble|adaptateur|\bhub\b|\bdock\b/i, '🔌'],
  [/tapis[sx]?.?de.?course|vélo[sx]?.?d.?appartement|rameur|elliptique/i, '🏃'],
  [/clavier.?(?:midi|maître|maitre|arrangeur)|piano(?!\s*de\s*cuisson)|synthé|synthétiseur/i, '🎹'],  // clavier arrangeur/maître = instrument, avant ⌨️ clavier ordinateur ; piano de cuisson = cuisinière, pas un instrument
  [/voiture[sx]?.?miniature|hot[sx]?.?wheels|majorette/i, '🏎️'],
  [/machine[sx]?.?à.?laver|lave[sx]?.?linge|sèche[sx]?.?linge|lave[sx]?.?vaisselle/i, '🧺'],
  [/machine[sx]?.?à.?café|cafetière|nespresso|senseo|dolce[sx]?.?gusto|expresso/i, '☕'],
  // ⚠️ `cartes?\s*` et non `carte.?` : `.?` (0-1 char) ne franchit pas « s + espace »
  // de « cartes pokémon » → un « Lot cartes Pokémon x20 » tombait en 🏆 Collection
  // (défaut non mappé → job échoué), alors que « Carte Pokémon » (singulier) matchait.
  [/cartes?\s*(?:pokémon|pokemon|magic|yu.?gi.?oh|panini|à.?collectionner)|booster/i, '🃏'],
  [/maillot[sx]?.?de.?bain|bikini|monokini/i, '👙'],
  [/jeu[sx]?.?de.?société|monopoly|\buno\b/i, '🎲'],
  // Peluche AVANT les règles animal/objet homonymes (audit 2026-07-19) : une
  // « peluche souris » partait en 🖱️ Souris d'ordinateur (la règle souris
  // vient plus haut que 🧸 dans la section Jouets). L'objet « peluche » prime
  // sur ce qu'elle représente — même logique que les figurines.
  // ⚠️ `doudou` BORNÉ (2026-08-12) : sans borne il matchait DANS « DOUDOUne »
  // — placé avant les règles vêtement, il envoyait toutes les doudounes en
  // 🧸 Peluches (le « doudoune » de la règle 🧥 n'était JAMAIS atteint).
  // Même famille que mascara/Mascarade, lego/GaLEGOn, ampoule/Têtampoule.
  [/peluche|doudous?(?![\p{L}\p{N}])/iu, '🧸'],
  // ── Désambiguïsations ajoutées le 2026-07-09 (mission mapping complet) —
  // chacune doit gagner sur une règle générique plus bas (indiquée) ─────────
  [/télécommandé|voiture[sx]?.?rc\b/i, '🚁'],                                        // avant 🚗 voiture
  [/déguisement|panoplie\b|costume[sx]?.?de.?(?:pirate|princesse|sorci|clown|halloween|super[sx]?.?héros)/i, '🎭'], // avant 🤵/👔 costume
  [/montre[sx]?.?connectée|smart[sx]?.?watch|apple[sx]?.?watch|galaxy[sx]?.?watch|garmin|fitbit|amazfit/i, '⏱️'],  // avant ⌚ montre
  [/enceinte[sx]?.?connectée|google[sx]?.?home|amazon[sx]?.?echo|\balexa\b|homepod|assistant[sx]?.?vocal/i, '📡'], // avant 🔊 enceinte
  [/liseuse|kindle|\bkobo\b/i, '📇'],                                           // avant 📚 livre
  [/collier.?(?:pour.?)?(?:chien|chat)|gamelle|croquettes?\b|litière|griffoir|arbre[sx]?.?à.?chat|laisse\b/i, '🐕'], // avant 💍 collier
  [/chausson|pantoufle|charentaise/i, '🥿'],                                    // avant 👟 chaussure
  [/sac[sx]?.?banane|banane.?(?:eastpak|nike|adidas)|fanny[sx]?.?pack|bum[sx]?.?bag/i, '👝'],  // avant 👜 sac
  // ⚠️ `draps?` avec bornes Unicode et non \b (2026-08-15, robe Shein Carla) :
  // \b est ASCII — « é » n'est pas un caractère de mot, donc \bdrap\b matchait
  // dans « drapé »/« drapée » et une ROBE partait en 🛌 → catégorie Vinted
  // « Maison > Textiles > Linge de lit » (5 jobs, 42 unités brûlées). Même
  // piège que gant/élégant documenté plus bas.
  [/housse[sx]?.?de.?couette|parure[sx]?.?de.?lit|taie[sx]?.?d.?oreiller|drap[sx]?.?housse|(?<![\p{L}\p{N}])draps?(?![\p{L}\p{N}])/iu, '🛌'],    // avant 🛏️ lit (scission literie/meuble)
  [/lit[sx]?.?parapluie|lit[sx]?.?à.?barreaux|berceau|cododo|table[sx]?.?à.?langer|réducteur[sx]?.?de.?lit|\btoise\b/i, '🚼'],    // avant 🛏️ lit, 🪑 chaise ET ☂️ parapluie (lit parapluie = lit de voyage bébé, pas un parapluie)
  [/fer[sx]?.?à.?repasser|défroisseur|centrale[sx]?.?vapeur|table[sx]?.?à.?repasser/i, '🧼'],
  [/machine[sx]?.?à.?coudre|surjeteuse/i, '🧵'],
  [/plongée|\btuba\b|\bpalmes\b/i, '🤿'],                                       // avant 🕶️/👟 (masque, palmes)
  [/paddle|kayak|wakeboard|kitesurf|skimboard|ski[sx]?.?nautique/i, '🏄'],           // avant 🎿 ski
  [/équitation|équestre|cravache|licol|tapis[sx]?.?de.?selle|étriers?\b/i, '🐴'],
  [/billard|snooker|pétanque|fléchette|bowling|frisbee/i, '🎱'],
  // Mode / Luxe
  // Couvre-chefs AVANT les sneakers : une marque de basket (Jordan/Air Max…)
  // sur une casquette/bonnet ne doit pas router vers 👟 (bug "Casquette Jordan").
  [/casquette|chapeau|bonnet|\bbob\b|béret|beret/i, '🧢'],
  // (19/11 soir, lot de Nico — « sweat Nike Jordan » rangé Baskets) Jordan / Air Max / Air Force ne nomment la paire que
  // si le titre ne nomme pas un VÊTEMENT : 24 vêtements (sweat, t-shirt, jogging, maillot, veste, débardeur…) partaient
  // en 👟 en 30 jours. Une seule règle (même premier mot retenu qu'avant) ; verrou scripts/objet-date-et-jordan-1911-selftest.mjs.
  [/basket|sneaker|chaussure|(?<!\b(?:sweat|sweatshirt|sweat[sx]?.?shirt|hoodie|pull|pullover|t.?shirt|tee[sx]?.?shirt|tee|short|jogging|pantalon|survetement|maillot|veste|debardeur|polo|ensemble|legging|doudoune|blouson|manteau|parka|jersey|brassiere|chemise|robe|jupe)s?\b[\s\S]*)(?:jordan|air[sx]?.?max|air[sx]?.?force)(?![\s\S]*\b(?:sweat|sweatshirt|sweat[sx]?.?shirt|hoodie|pull|pullover|t.?shirt|tee[sx]?.?shirt|tee|short|jogging|pantalon|survetement|maillot|veste|debardeur|polo|ensemble|legging|doudoune|blouson|manteau|parka|jersey|brassiere|chemise|robe|jupe)s?\b)|derby|mocassin|loafer|espadrille|crampon/i, '👟'],
  [/botte|bottine|\bboots?\b/i, '👢'],
  // (16/11, lot du matin, point 3 — carhoa, « Après-ski Decathlon noir taille 38 ») Un « après-ski » est une BOTTE
  // de neige, jamais du matériel de ski : « ski » y prenait la règle 🎿 (plus bas) → Vinted « Skis alpins » (4733),
  // un rayon où Vinted exige les dimensions du colis. Avant la règle 🎿, après les chaussures (« chaussures après-ski »
  // reste une chaussure). Un VÊTEMENT « style après-ski » (« Manteau … Après-Ski Oversize ») garde sa règle de vêtement.
  [/^(?!.*\b(?:manteaux?|vestes?|blousons?|doudounes?|pantalons?|combinaisons?|sweats?|pulls?|polaires?|parkas?|bonnets?|gants?|chaussettes?|moufles?)\b).*\bapr[eè]s[\s-]?skis?\b/i, '👢'],
  // \btalons?\b : "pantalon" CONTIENT "talon" — sans la boundary stricte,
  // tout titre "Pantalon ..." partait sur Chaussures à talons (bug prod).
  [/\btalons?\b|escarpin|ballerine|compensée|louboutin/i, '👠'],
  // ⚠️ mules? : frontières Unicode obligatoires (2026-07-18) — /mule\b/ sans
  // frontière GAUCHE matchait « forMULE », mot quasi systématique des
  // descriptions cosmétiques générées par l'IA : une crème Medik8 partait en
  // Sandales eBay (62107, « Pointure EU » obligatoire). Même piège déjà vu
  // sur gants (élégant) et montres (démontre) plus bas.
  // sandalettes? (2026-09-10) : mot-clé à part entière depuis la borne à DROITE —
  // « sandale » ne matche plus le préfixe de « sandalettes ».
  [/sandalettes?|sandale|tongs?\b|claquette|(?<![\p{L}\p{N}])mules?(?![\p{L}\p{N}])/iu, '🩴'],
  [/\bsacs?\b(?!\s*(?:de.?couchage|de.?frappe|poubelle|congélation|aspirateur))|handbag|pochette|cabas|besace|bandoulière|birkin|kelly|speedy|neverfull/i, '👜'],
  [/portefeuille|porte[sx]?.?monnaie|porte[sx]?.?carte/i, '👛'],
  [/valisettes?|valise|bagage/i, '🧳'],   // valisettes? (2026-09-10, borne droite)
  // ── Vêtement BÉBÉ à contexte OBLIGATOIRE (2026-08-08, chantier détection
  // bébé — corpus réel : 145 titres enfant en prod, ensemble ×10,
  // bodysuit/grenouillère/sarouel ×1 chacun, tous en 📦 ou dépendants de
  // l'icône IA). Ces mots ne déclenchent QUE si le texte porte AUSSI un
  // signal bébé explicite (bébé / N mois / naissance / nourrisson) : hors de
  // ce contexte (« ensemble tailleur femme », « sarouel homme »,
  // « grenouillère adulte »), RIEN ne change — l'adulte garde son
  // comportement d'avant au caractère près (exigence du chantier, testée en
  // batterie). Résidu assumé : « grenouillère fille 2 ans » sans mot
  // bébé/mois reste en 📦. Placés AVANT les vêtements composants : un
  // « Ensemble bébé manteau et pantalon 3 mois » est un ENSEMBLE, pas un
  // manteau. Feuilles Vinted exactes : cf. VINTED_ENFANT_AFFINAGES.
  [/^(?=[\s\S]*\b(?:ensembles?|bodysuits?)\b)(?=[\s\S]*(?:bébé|bebe|\b\d+\s?mois\b|naissance|nourrisson))/i, '👕'],
  [/^(?=[\s\S]*grenouillères?)(?=[\s\S]*(?:bébé|bebe|\b\d+\s?mois\b|naissance|nourrisson))/i, '🩲'],
  [/^(?=[\s\S]*\bsarouels?\b)(?=[\s\S]*(?:bébé|bebe|\b\d+\s?mois\b|naissance|nourrisson))/i, '👖'],
  // (?<![-\w]) : exclut "garde-robe" (fréquent dans les descriptions IA) et
  // "wardrobe" — sinon un t-shirt dont la description dit "à avoir dans sa
  // garde-robe" devient une robe et le mapping Vinted part sur le mauvais rayon.
  // Écrit en LOOKBEHIND (2026-09-10), plus en (?:^|[^-\w]) : ce contexte
  // CONSOMMAIT l'espace, et la borne de mot posée à la compilation
  // (BORNE_GAUCHE) se retrouvait devant l'espace, donc devant la lettre du
  // mot précédent — « Jolie robe » ne matchait plus.
  [/(?<![-\w])robes?\b|jupes?\b/i, '👗'],
  // Combinaison / combi (2026-09-10, « Combinaison Kiabi noire » publiée en
  // Téléviseurs) : aucune règle ne la nommait. L'icône n'est qu'un repli —
  // c'est le MOT qui compte désormais : « combinaison » se résout contre
  // l'arbre (Vinted « Combinaisons et combishorts > Combinaisons », Beebs
  // « Combinaisons (femme) »…), l'IA départage les homonymes (étape 3).
  // Les combinaisons de sport (ski, surf, plongée…) sont prises AVANT par la
  // règle 🧥 dédiée, l'ordre des règles fait foi.
  // « combi short » / « combi-short » restent au short (batterie
  // audit-coverage : 🩳 attendu) ; « combishort » soudé est pris par 👖 plus
  // bas et son mot rejoint la feuille « Combishorts ».
  [/combinaisons?\b|\bcombis?\b(?![\s-]*shorts?\b)/i, '👗'],
  // 🥼/🤵/🎀 scindés de 🧥/👔 (2026-07-09) : blazer/tailleur, costume et
  // cravate ont chacun leur branche Vinted dédiée (Blazers et tailleurs,
  // Costumes et blazers, Accessoires > Cravates et nœuds papillons) — le
  // T4 "Pantalon de costume → Chemises" venait de "costume" logé dans 👔.
  [/blazer|tailleur\b/i, '🥼'],
  [/(?<!porte.)manteau|veste|blouson|parka|doudoune|trench|imperméable|kimono|ponchos?\b|polaire\b/i, '🧥'],  // porte-manteau = mobilier, pas un manteau (audit 2026-07-19)
  // ── Vestes techniques sans le mot « veste » (2026-08-12) ────────────────────
  // Cas réel : 384 articles importés d'un dressing Vinted, tous type=NULL en
  // base — le TITRE est le seul signal, et les titres Vinted SEO ne nomment
  // pas la famille (« Coupe vent Nike vintage 90's y2k oversize » ne contient
  // aucun mot de la liste, alors que « Veste coupe vent k-way Nike » passait
  // par « veste »). Même icône 🧥 que veste — donc mêmes plateformes.
  // k-way SANS \b : le tiret est un caractère non-word, et \b est ASCII —
  // frontières Unicode explicites, même piège que gant/mascara/ampoule.
  [/coupe[sx]?.?vents?\b|(?<![\p{L}\p{N}])k.?ways?(?![\p{L}\p{N}])|\bbombers?\b|softshell/iu, '🧥'],
  [/cravate|n[œo]e?ud.?papillon/i, '🎀'],
  [/costume|smoking\b/i, '🤵'],
  [/chemisettes?|chemise|chemisiers?\b|blouse\b/i, '👔'],   // chemisettes? (2026-09-10, borne droite) ;   // « chemisier » n'est PAS « chemise » : chemis-IER (82 articles du parc)
  // Scindé de 👕 : pull/sweat/hoodie/cardigan vivent chez Vinted sous une
  // branche "Sweats et pulls" entièrement différente de "Hauts et t-shirts"
  // (voir vintedCategories.js) — un seul et même mot-clé ne peut plus servir
  // de proxy fiable au chemin catalogue, d'où l'icône dédiée.
  // pullovers? / sweatshirts? / sweaters? (2026-09-10) : mots-clés à part entière
  // depuis la borne à DROITE — « pull » et « sweat » ne matchent plus un préfixe.
  [/pullovers?|sweatshirts?|sweaters?|pull|sweat|hoodie|cardigan|gilet(?!.{0,4}(?:de.?costume|jaune|de.?sécurité))/i, '🧶'],
  // polo/top gardés contre leurs homonymes (audit 2026-07-19) : « Volkswagen
  // Polo 1.2 TSI » partait en T-shirts (même famille que golf GTI, déjà gardé
  // plus bas), et « top qualité/état/prix » — tournure quasi systématique des
  // descriptions IA — matchait \btop\b (« JBL Flip 5, top qualité sonore »
  // → Hauts et t-shirts).
  // \bbod(?:ys?|ies)\b (2026-08-08, B3b) : le pluriel courant de « body »
  // est « bodies » — « Lot 8 bodies bébé » (job réel 46e7dfc9) tombait en 📦.
  [/t.?shirt|tee[sx]?.?shirt|débardeur|caracos?\b|marinieres?\b|(?<!volkswagen\s)(?<!vw\s)polos?\b(?!\s*(?:\d|tdi|tsi|gti|gtd))|(?<!au\s)\btops?\b(?!\s*(?:qualité|état|etat|condition|niveau|prix)|[\s-]*cases?\b)|tunique|\bbod(?:ys?|ies)\b/i, '👕'],
  // « maillot » NU (2026-08-12, dressing importés) : la règle sport (plus
  // haut) exige un qualificatif (foot/rugby/basket/…) et « maillot de bain »
  // part en 👙 avant — un « Maillot Adidas » seul ne matchait RIEN et tombait
  // en 📦. Placée APRÈS ces deux règles : elles gardent la priorité.
  [/(?<![\p{L}\p{N}])maillots?(?![\p{L}\p{N}])/iu, '👕'],
  // 🩳 AVANT 👖 : "short en jean" doit rester un short (le mot-clé jean
  // matcherait sinon en premier).
  [/\bshorts?\b|\bbermudas?\b/i, '🩳'],
  [/jean(?!\W(?:paul|patou|jacques|claude|charles|louis|pierre|michel|marie|baptiste))|pantalon|jogging|legging|\bchino\b|salopette|pantacourts?\b|jeggings?\b|combishorts?\b|survêtement/i, '👖'],
  // « survet » nu (2026-08-12, dressing importés) : « survêtement » (règle
  // au-dessus) ne le couvre pas — le ê coupe le préfixe ASCII.
  [/\bsurvets?\b/i, '👖'],
  // Lingerie/nuit (2026-07-09) : branche Vinted dédiée des deux côtés
  // (Lingerie et pyjamas / Sous-vêtements et chaussettes) — backlog T3.
  [/lingerie|soutien[sx]?.?gorge|nuisette|pyjama|peignoir|tenue[sx]?.?de.?nuit|caleçon|\bboxers?\b|\bslips?\b|culotte(?!.{0,10}cheval)/i, '🩲'],
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
  // ⚠️ MONTRE AVANT LUNETTES (2026-07-19, bug G-Shock → « Lunettes de soleil »
  // sur les 4 plateformes) : en horlogerie française le cadran est cerclé d'une
  // « lunette » (bezel) — la desc FR d'une montre matche donc la règle
  // lunettes, et c'est l'ORDRE des règles qui fait la priorité, pas la position
  // du mot (même mécanique que le bug Parfum/Soins). La montre prime ; signaux
  // horlogers ajoutés (timepiece, chronograph, analogique-numérique) pour les
  // copies qui ne disent jamais « montre ».
  // Même piège que gants, deux fois : /montre/ matchait le VERBE (« ce casque
  // montre une isolation… ») et « dé-MONTRE- ». Substantif exigé, tournures
  // verbales exclues.
  [/(?<![\p{L}\p{N}])montres?(?![\p{L}\p{N}])(?!\s+(?:qu|que|comment|bien|aussi|des|une?|le|la|les|son|sa|ses)\b)|watch|rolex|omega|swatch|timepiece|chronograph|wristwatch|analog(?:ique)?.?(?:digital|num[ée]rique)/iu, '⌚'],
  // ⌚ ANATOMIE — doit gagner sur 💍 (juste en dessous), 4e bug de la classe
  // « mot générique capté par la mauvaise règle » :
  // « bracelet » est le mot d'une montre autant que d'un bijou, et TOUTE
  // description de montre le porte (bracelet acier / cuir / résine). Quand le
  // titre ne dit que la marque et le modèle — « Casio G-Shock GA-2100 »,
  // « Seiko 5 Automatique », « Daniel Wellington Classic » — il ne reste AUCUN
  // mot horloger : /bracelet/ de la règle 💍 gagnait et la montre partait en
  // Bijoux fantaisie > Autres (eBay 499), dont le SEUL requis est une Marque à
  // 57 valeurs mode/bijoux (Accessorize, Debenhams, Dorothy Perkins…) — d'où le
  // « Marque : valeur hors liste eBay » sur une montre.
  // On statue donc sur l'anatomie, JAMAIS sur « bracelet » : un bijou n'a ni
  // cadran, ni mouvement, ni verre saphir, ni étanchéité chiffrée.
  // Marques bornées à l'horlogerie pure : « casio » seul est volontairement
  // ABSENT (calculatrices, claviers) — ses montres sont prises par le cadran ou
  // par g-shock ; « citizen » aussi (mot anglais courant, et la règle 📀 est
  // plus bas : « DVD Citizen Kane » serait devenu une montre).
  // Placée APRÈS ⏱️ (l. 319) : une montre connectée reste une montre connectée.
  [/(?<![\p{L}\p{N}])cadrans?(?![\p{L}\p{N}])|remontoir|montre[sx]?.?bracelet|bracelet.?(?:de.?)?montre|mouvements?.?(?:[àa].?)?(?:quartz|automatique|m[ée]canique|manuel)|verre.?(?:saphir|min[ée]ral|hardlex)|lunette.?(?:rotative|tournante)|[ée]tanche.?\d+\s?(?:m|atm|bars?)(?![\p{L}\p{N}])|g.?shock|(?<![\p{L}\p{N}])(?:seiko|tissot|festina|longines)(?![\p{L}\p{N}])/iu, '⌚'],
  // Lunettes RESSERRÉE (même bug G-Shock) : « lunette » au singulier nu est
  // bien plus souvent une lunette de montre (bezel), arrière (auto), de WC ou
  // astronomique que des solaires — on exige le pluriel nu, « lunette(s) de
  // soleil/vue », le nom pluriel « solaires », ou l'anglais. « solaire »
  // singulier (crème/panneau/montre solaire) ne route plus vers les lunettes.
  [/(?<![\p{L}\p{N}])lunettes(?![\p{L}\p{N}])|lunettes?.?de.?(?:soleil|vue)|(?<![\p{L}\p{N}])solaires(?![\p{L}\p{N}])|sunglass/iu, '🕶️'],
  // /bague/ sans frontière matchait « BAGUEtte ».
  // (03/10, point 8) « Statue buste femme en terre cuite ancienne drapé et
  // collier » partait en 💍 (Beebs « Bijoux (femme) », taille de bague
  // demandée) : la règle bijoux passe avant la statuaire, et l'ordre des
  // règles prime sur celui des mots. Un bijou nommé APRÈS une statue, un buste
  // ou une sculpture est un détail de l'objet d'art, pas l'objet — l'inverse
  // (« Collier pendentif buste ») reste un bijou. Mesuré le 03/10 sur les
  // 82 000 fiches du parc : ce seul titre mêle les deux familles.
  [/(?<!(?:statues?|statuettes?|sculptures?|(?<![\p{L}\p{N}])bustes?)(?![\p{L}\p{N}])[^]*)(?:bijou|collier|bracelet|(?<![\p{L}\p{N}])bagues?(?![\p{L}\p{N}])|boucle[sx]?.?d.?oreille|pendentif|broche)/iu, '💍'],
  // (05/11 soir, Nico — « Boîte à bijoux artisanale Liban – Coffret en bois marqueterie », PMF Vito : rangée chez
  // Beebs en « Bijoux (femme) », une taille de BAGUE demandée) UN CONTENANT DE BIJOUX N'EST JAMAIS UN BIJOU. Les
  // mots-bijoux d'un contenant (« boîte à bijoux », « écrin à bague », « présentoir à colliers », « range-bijoux »,
  // « porte-bijoux », « boîte à montres ») ne choisissent jamais le rayon (zonesContenantBijoux, plus bas) ; le
  // contenant est un objet de la MAISON (Vinted : Maison › Décoration › Rangement › « Coffres à bijoux »). Placée
  // APRÈS 💍 : un bijou nommé hors du contenant (« Bague argent dans son écrin », « Coffret bijoux collier et
  // boucles ») reste un bijou.
  [/(?:bo[iî]tes?|coffrets?|coffres?|[ée]crins?|pr[ée]sentoirs?|organiseurs?|organisateurs?|plateaux?|arbres?|range|porte|rangements?)[\s-]*(?:(?:[àa]|de|d['’]|pour|aux|des)\s*)?(?:(?:les|vos|tes|mes|ses)\s+)?(?:bijou|bagues?|colliers?|bracelets?|montres?|boucles?.?d.?oreilles?|pendentifs?)/iu, '🏠'],
  // Accessoires ajoutés le 2026-07-09 (backlog T3) — feuilles Vinted réelles.
  [/ceinture(?!.{0,10}(?:lombaire|à.?outils|de.?sécurité))/i, '🪢'],
  [/parapluie|ombrelle/i, '☂️'],
  [/porte[sx]?.?cl[ée]s?\b/i, '🗝️'],
  // Mobilité électrique AVANT High-Tech : « trottinette Xiaomi » ne doit pas
  // matcher 📱 sur la marque (Xiaomi fait trottinettes ET téléphones). L'objet prime.
  [/trottinette|hoverboard|gyroroue|monoroue/i, '🛴'],
  // High-Tech
  [/iphone|smartphone|téléphone|galaxy|\bpixel\b|xiaomi|oneplus/i, '📱'],
  [/carte[sx]?.?graphique|carte.?m[èe]re|\bgpu\b|\brtx\b|geforce|radeon|\bcpu\b|barrette[sx]?.?ram/i, '🖥️'],  // composants PC : "carte" seul → 🏆 Collection (bug)
  [/macbook|laptop|ordinateur[sx]?.?portable|notebook|chromebook/i, '💻'],
  [/\bpc\b|imac|ordinateur|écran|moniteur/i, '🖥️'],
  // 📲 scindé de 📱 (2026-07-09, T4) : feuille dédiée Électronique >
  // Tablettes, liseuses et accessoires > Tablettes.
  [/tablette(?!.{0,4}de.?chocolat)|ipad|galaxy[sx]?.?tab/i, '📲'],
  [/écouteur|airpods?|earbud|casque|headphone/i, '🎧'],
  // « femme enceinte » (grossesse/allaitement) n'est pas un haut-parleur ;
  // console d'entrée = meuble, console de mixage = audio ; switch réseau =
  // équipement informatique, pas une Nintendo (audit 2026-07-19).
  // (24/10, sos.cuisine) « Switch & Go » / « switch and go » est une GAMME DE JOUETS VTech (dinosaures
  // transformables), pas la console : 4 fiches du parc partaient en Jeux vidéo sur eBay et Leboncoin.
  [/(?<!femmes?\s)enceinte|haut[sx]?.?parleur|speaker|barre[sx]?.?de.?son|soundbar/i, '🔊'],
  [/console(?!s?\s*(?:de\s*mixage|d['’]entrée|murale|extensible))|playstation|\bps[2-5]\b|xbox|nintendo|switch(?!\s*(?:réseau|ethernet|rj45|tp.?link|netgear|poe|gigabit|\d+\s*ports|(?:&|and|et|n)\s*go\b))|game[sx]?.?boy|manette|jeu[sx]?.?vidéo/i, '🎮'],
  // télé(?![a-zà-ÿ]) et non télé\b : \b est ASCII-only en JS, donc "télé"
  // suivi d'une lettre matchait quand même ("télécommande" → Téléviseurs).
  [/meuble.?(?:tv|t[ée]l[ée]|hi.?fi)/i, '🛋️'],  // meuble TV = mobilier, pas un téléviseur
  [/veilleuse/i, '📦'],  // veilleuse bébé (souvent "projecteur étoiles") ≠ vidéoprojecteur, avant 📺
  [/\btv\b|télé(?![a-zà-ÿ])|téléviseur|télévision|projecteur|vidéoprojecteur/i, '📺'],
  // objectif : singulier seulement, hors tournures figurées (« vos objectifs
  // fitness », « objectif de remise en forme » — prose IA courante) ; un
  // objectif photo se vend au singulier avec marque/focale (audit 2026-07-19).
  [/appareil[sx]?.?photo|caméra|camera|reflex|gopro|objectif(?!s\b)(?!\s*(?:de\s|d['’]|:|minceur|fitness|sportif))|caméscope/i, '📷'],
  [/drone/i, '🛸'],
  [/imprimante|scanner/i, '🖨️'],
  [/clavier/i, '⌨️'],
  [/souris/i, '🖱️'],
  // Maison
  [/canapé|sofa|fauteuil|banquette|pouf/i, '🛋️'],
  [/banc.?(?:de.?)?(?:muscu|gym|fitness|abdo|développé)|banc[sx]?.?à.?charge|presse.?(?:à.?)?cuisse/i, '🏋️'],  // banc de muscu = sport, pas une chaise, avant 🪑
  [/chaise|tabouret|\bbanc\b/i, '🪑'],
  // `draps?` borné Unicode (2026-08-15) : \bdrap\b matchait « drapé » — cf. la
  // règle 🛌 plus haut, même correction.
  [/\blit\b|matelas|sommier|couette|(?<![\p{L}\p{N}])draps?(?![\p{L}\p{N}])|parure/iu, '🛏️'],
  // `ampoule` BORNÉ À GAUCHE (2026-08-11) : sans borne il matche « Têtampoule »
  // (nom de Pokémon) — même famille de bug que « mascara » dans « Mascarade ».
  [/lampe|luminaire|applique|suspension|lampadaire|(?<![\p{L}\p{N}])ampoules?|\bled\b|guirlande(?!.{0,14}(?:de.?)?(?:sapin|noël|noel))/iu, '💡'],
  [/miroir/i, '🪞'],
  [/bougie(?!s?\s*(?:d['’]allumage|de\s*préchauffage))|photophore/i, '🕯️'],  // bougie d'allumage = pièce auto (audit 2026-07-19)
  // ŒUVRES (2026-08-13, jobs jocaille) : « Peinture à l'huile ancienne »,
  // « Toile huile vintage 1959 », « Gravure couleur Hebbelinck » partaient en
  // 🖌️ (règle `peinture` plus bas) → LBC Bricolage (outils, Produit quasi
  // sans option) au lieu de Décoration. L'œuvre d'art se reconnaît AVANT
  // l'outil — cette règle précède 🖌️ dans la liste (premier match gagne).
  // « toile » seul reste hors règle (toile de tente, toile cirée) : borné aux
  // formes « toile huile/peinte », « huile sur toile/panneau/carton ».
  // (03/10, point 9) « Peinture paysage verger en fleurs signée » partait en
  // 🖌️ (Leboncoin « Bricolage », et une question « Poids » remplie des choix
  // de « Type ») : sur les 54 titres du parc qui disent « peinture », 6
  // ŒUVRES tombaient dans la peinture de bricolage. Une peinture SIGNÉE ou
  // ENCADRÉE, « à huile », « sur toile/carton/bois/panneau », ou dont le titre
  // dit le genre (paysage, florale, portrait, nature morte, abstraite) est une
  // œuvre. ⛔ « peinture marine » reste hors règle (peinture époxy de bateau,
  // relevée au parc) ; « peinture sur tissu » aussi (outil de batik).
  [/cadres?\b(?!\s*(?:de\s*)?(?:vélo|vtt|route\b|carbone|alu\b|lit\b))|tableau(?!.?électrique)|poster|affiche|gravures?\b|lithographies?\b|estampes?\b|aquarelles?\b|toiles?\s+(?:huile|peinte)|huile\s+sur\s+(?:toile|panneau|carton)|peintures?\s+à\s+l['’]huile|peintures?\s+(?:à\s+)?huile\b|peintures?\s+sur\s+(?:toile|carton|bois|panneau)\b|peintures?\s+(?:paysages?|florale?s?|portraits?|nature\s+morte|abstraites?)\b|peintures?\b(?=[^]*\b(?:sign[ée]e?s?|encadr[ée]e?s?)(?![\p{L}\p{N}]))/iu, '🖼️'],  // cadre de vélo/lit ≠ cadre déco (audit 2026-07-19)
  [/plante|cache[sx]?.?pot|jardinière/i, '🪴'],
  [/vase\b/i, '🏺'],
  [/assiette|\bbol\b|tasse|\bmug\b|verres?\b(?!\s*tremp)|carafe|vaisselle/i, '🍽️'],  // verre trempé = protection d'écran (audit 2026-07-19)
  [/casserole|poêle(?!s?\s*à\s*(?:bois|granulés?|pétrole))|cocotte|marmite|ustensile/i, '🍳'],  // poêle à bois/granulés = chauffage (audit 2026-07-19)
  // SCULPTURES (2026-08-13, jobs jocaille — « Ancien buste de cardinal en
  // plâtre polychrome signé E. Mélange », 2 échecs lbcCategoryPath absent) :
  // aucun mot de la statuaire n'était couvert. Même famille que les ŒUVRES
  // (règle 🖼️ plus haut) : l'objet d'art se reconnaît AVANT l'outil 🖌️
  // (plus bas). Placée APRÈS 🪴/🏺/🍽️/🍳 : les matières nues (bronze, terre
  // cuite) ne volent pas leurs objets aux règles voisines — « vase en terre
  // cuite » reste un vase, « cocotte en terre cuite » une cocotte.
  // « plâtre » nu volontairement ABSENT (sac de plâtre = matériau bricolage,
  // et « Sac de plâtre » matcherait 👜 avant nous de toute façon) : la phrase
  // « plâtre polychrome » suffit, les bustes/statues portent leur propre mot.
  // « buste de couture » exclu (mannequin de couturière ≠ sculpture) et
  // usage ANATOMIQUE gardé (diff base 2026-08-13 : « coupe ajustée au
  // buste », « tour de buste », « buste smocké » — prose vêtement courante,
  // une combinaison partait en 🖼️) : pas de « au/du/de » devant, pas de
  // smocké/ajusté/cintré/élastiqué derrière.
  // « bronze » borné Unicode (ne matche ni « bronzer » ni « bronzage »).
  [/(?<!\b(?:au|du|de)\s)bustes?\b(?!\s*de\s*couture)(?!\s+(?:smock|ajust|cintr|élastiqu))|statues?\b|statuettes?\b|sculptures?\b|pl[âa]tres?\s+polychromes?\b|(?<![\p{L}\p{N}])bronzes?(?![\p{L}\p{N}])|terres?\s+cuites?\b|santons?\b/iu, '🖼️'],
  // Maison — textiles/déco/papeterie/animaux/fêtes (2026-07-09, backlog T3) :
  // toutes ces branches existent réellement (Maison > Textiles/Décoration/
  // Fournitures de bureau/Animaux/Célébrations et fêtes — arbre archivé).
  [/rideau|voilage|\bstores?\b/i, '🪟'],
  [/coussin(?!.{0,14}(?:allaitement|grossesse))|plaid\b|jeté[sx]?.?de.?(?:lit|canapé)/i, '🪶'],
  [/\btapis\b(?!.?(?:de.?)?(?:course|yoga|souris|selle|sol|éveil|bain|jeu))/i, '🟫'],
  [/nappe\b|napperon|linge[sx]?.?de.?table/i, '📜'],
  [/horloge|pendule\b|réveil/i, '🕰️'],
  [/no[eë]l|guirlande[sx]?.?de.?sapin|boule[sx]?.?de.?sapin|crèche\b/i, '🎄'],
  [/stylo|papeterie|carnet|bloc[sx]?.?notes?|surligneur|crayon(?!.{0,12}(?:lèvres|yeux|sourcils))|calculatrice|agenda\b|trousse(?!.{0,4}(?:de.?toilette|à.?maquillage))/i, '🖋️'],
  // Électroménager
  [/bouilloire|théière/i, '🫖'],
  [/aspirateur|roomba|nettoyeur[sx]?.?vapeur/i, '🧹'],
  [/frigo|réfrigérateur|congélateur/i, '🧊'],
  [/\bfour\b|micro[sx]?.?onde/i, '♨️'],
  [/mixeur|blender|robot.?(?:cuisine|pâtissier)|thermomix|batteur[sx]?.?électrique/i, '🥣'],
  [/grille[sx]?.?pain|toaster/i, '🍞'],
  [/friteuse|airfryer/i, '🍟'],
  // ⚠️ Appareils coiffants ÉLARGIS à leurs ACCESSOIRES + marques + anglais
  // (2026-07-19, bug Dyson Airwrap : « Soft Smoothing Brush Attachment »,
  // desc « brosse lissante … soin optimal des cheveux » → 🧴 Soins de la
  // peau via \bsoin\b — un embout d'appareil de coiffure n'est pas un
  // produit de soin, référentiel skincare absurde sur les 4 plateformes).
  // 3e bug de la classe « mot générique capté par la mauvaise règle » après
  // Parfum/Soins et Lunettes/Montre. Les titres importés ne disent ni
  // « sèche-cheveux » ni « lisseur » : marques (airwrap, ghd, babyliss) et
  // équivalents anglais requis.
  [/sèche[sx]?.?cheveux|lisseur|boucleur|airwrap|supersonic|multi[sx]?.?styler|\bstylers?\b|brosses?.?(?:soufflante|lissante|chauffante|rotative|coiffante)|fers?.?à.?(?:lisser|boucler|friser)|babyliss|\bghd\b|hair.?(?:dryer|straightener|curler)|straightener|curling.?(?:iron|wand)|hot.?(?:air.?)?brush/i, '💇'],
  // Climatisation / chauffage d'appoint (2026-07-09) : feuilles réelles sous
  // Maison > Entretien de la maison > Chauffage, climatisation et ventilation.
  [/ventilateur|climatiseur|purificateur[sx]?.?d.?air|humidificateur|déshumidificateur/i, '🌀'],
  [/radiateur|chauffage[sx]?.?d.?appoint|convecteur|bain[sx]?.?d.?huile/i, '🌡️'],
  // Bricolage
  [/perceuse|visseuse|tournevis|perforateur/i, '🪛'],
  [/\bscies?\b|tronçonneuse|élagueuse/i, '🪚'],
  [/marteau|maillet|\bmasses?\b(?!\s*(?:musculaire|corporelle|graisseuse))/i, '🔨'],  // « masse musculaire » = prose fitness (audit 2026-07-19)
  [/échelle(?!s?\s*(?:1\s*[:/]\s*\d|\d|réduite))|escabeau/i, '🪜'],  // « échelle 1:18 » = miniature/maquette (audit 2026-07-19)
  // \b obligatoire avant l'exclusion : sans lui, « pinceaux de maquillage »
  // re-matchait par backtracking sur « pinceau » nu (le lookahead ne voyait
  // que « x de maquillage »).
  // (03/10) Un LIVRE sur la peinture (« Livre peinture vitrail ») n'est pas un
  // pot de peinture : un livre nommé avant le mot laisse la règle 📚 parler.
  [/(?<!\blivres?\b[^]*)(?:peinture|rouleau[sx]?.?peinture|pinceaux?\b(?!\s*(?:de\s*|à\s*)?(?:maquillage|makeup|teint|blush|poudre)))/i, '🖌️'],  // pinceau de maquillage = Beauté (audit 2026-07-19)
  [/\bvis\b|boulon|cheville|clou\b/i, '🔩'],
  [/mètre[sx]?.?ruban|niveau.?(?:laser|à.?bulle)/i, '📏'],
  // pinces? borné (audit 2026-07-19) : « pince » matchait DANS « pinceaux » —
  // bug latent révélé par l'exclusion maquillage de 🖌️ juste au-dessus.
  [/clé.?(?:plate|allen|molette|mixte|dynamométrique)|pinces?(?![\p{L}\p{N}])|étau|serre[sx]?.?joint/iu, '🔧'],
  // Jardin
  [/tondeuse|débroussailleuse|scarificateur/i, '🌱'],
  [/taille[sx]?.?haie|sécateur|cisaille/i, '✂️'],
  [/barbecue|plancha|\bbbq\b/i, '🔥'],
  [/salon[sx]?.?de.?jardin|parasol|transat(?!.{0,10}(?:b[ée]b[ée]|enfant|nouveau))/i, '⛱️'],  // transat BÉBÉ exclu → tombe au filet plutôt que Parasols (jardin)
  // Sport
  [/\bvélos?\b|\bvtt\b|bicyclette/i, '🚲'],
  [/trottinette/i, '🛴'],
  [/skateboards?|skate|longboard/i, '🛹'],   // skateboards? (2026-09-10, borne droite)
  [/roller|\bpatins?(?![a-zà-ÿ])/i, '⛸️'],  // \b ASCII : "patinée" (é) forçait un match → garde accents
  [/\bskis?\b|snowboard/i, '🎿'],
  [/\bgourde\b|bidon.?(?:sport|vélo)|bouteille.?(?:isotherme|inox|sport)/i, '📦'],  // gourde ≠ ballon (défaut Sport ⚽), pas de feuille dédiée → filet
  [/ballon|football/i, '⚽'],
  [/tennis|raquette|badminton|squash/i, '🎾'],
  [/golf(?!\s*(?:gti|tdi|tsi|gtd|\d|plus|r32|variant|sportsvan))/i, '⛳'],
  [/haltère|kettlebell|musculation|fitness/i, '🏋️'],
  [/boxe|\bmma\b/i, '🥊'],
  [/tente|camping|sac[sx]?.?de.?couchage|duvet/i, '⛺'],
  [/pêche|moulinet|waders/i, '🎣'],
  [/yoga|pilates/i, '🧘'],
  // Auto-Moto
  [/moto\b/i, '🏍️'],
  [/scooter/i, '🛵'],
  [/pneu|jante|\broue\b/i, '🛞'],
  [/voiture|automobile|autoradio|pare[sx]?.?choc|rétroviseur/i, '🚗'],
  // Beauté
  [/parfumee?s?|parfum|eau[sx]?.?de.?(?:toilette|parfum)|cologne/i, '🌸'],   // parfumé·e·s (2026-09-10, borne droite ; comparé sans accents)
  // « palette de couleurs » = prose IA omniprésente (vêtements, déco…), pas
  // une palette de fards (audit 2026-07-19).
  // ⚠️ `mascara` BORNÉ (2026-08-11). Sans borne il matchait « MASCARADE » :
  // 165 lignes / 108 titres de cartes Pokémon de l'extension « Mascarade
  // Crépusculaire » partaient en 💄 Maquillage, donc en Divers > Autres sur
  // Leboncoin et dans les rayons beauté des trois autres plateformes. Borne
  // UNICODE et pas \b : \b est ASCII-only, il ne ferme rien après une lettre
  // accentuée (même piège que « parfum » dans « parfumée »).
  [/rouge[sx]?.?à.?lèvre|gloss|lipstick|mascaras?(?![\p{L}\p{N}])|palettes?\b(?!\s*(?:de\s*)?couleurs?\b)|fard|eyeliner|fond[sx]?.?de.?teint|blush|maquillage/iu, '💄'],
  [/vernis|manucure/i, '💅'],
  // ⚠️ \bsoin\b nu SUPPRIMÉ (2026-07-19, bug Dyson Airwrap) : « pour un soin
  // optimal des cheveux/du linge/de vos sols » est une tournure IA générique
  // qui routait n'importe quel accessoire en Soins de la peau. Le soin ne
  // compte plus que CONTEXTUALISÉ peau/visage/corps ; un vrai produit a de
  // toute façon crème/sérum/lotion/masque dans sa copie.
  [/crème|sérum|lotion|shampooing|gel[sx]?.?douche|savon|soins?\s+(?:de\s+la\s+peau|du\s+visage|du\s+corps|des\s+mains|hydratants?|anti.?[âa]ges?|anti[sx]?.?rides|visage|corps)/i, '🧴'],
  // Couverture élargie (2026-07-18, bug Medik8) : huile et masque exigent un
  // CONTEXTE beauté (une huile moteur, un masque de ski/plongée/carnaval ne
  // doivent pas router ici) ; le reste est sans ambiguïté. Équivalents anglais
  // pour les titres importés (« Crystal Retinal 6 Serum ») que les regex FR ne
  // voyaient pas — ils tombaient au défaut type, jusqu'ici 💄 Rouges à lèvres.
  [/huiles?\s+(?:pour\s+)?(?:l[ea]s?\s+)?(?:visage|corps|cheveux|barbe|s[èe]che|démaquillante|essentielle|de\s*massage)/i, '🧴'],
  [/masques?\s+(?:pour\s+)?(?:l[ea]s?\s+)?(?:visage|corps|cheveux|capillaire|hydratant|purifiant|exfoliant|de\s*nuit|en\s*tissu|à\s*l.argile)/i, '🧴'],
  [/déodorant|gommage|exfoliant|démaquillant|\btoniques?\b|\bbaumes?\b|après[sx]?.?rasage|contour[sx]?.?des[sx]?.?yeux|\bserums?\b|\bcreams?\b|moisturi[sz]ers?|cleanser/i, '🧴'],
  // Musique
  [/guitare|stratocaster|telecaster|les[sx]?.?paul|ukulélé/i, '🎸'],
  [/violon|violoncelle|contrebasse/i, '🎻'],
  // Exclusions élargies (audit 2026-07-19) : batteries d'appareils (téléphone,
  // outil, lithium, mAh) — seuls les fûts restent des instruments.
  [/batterie(?!.{0,15}(?:voiture|moto|vélo|externe|cuisine|téléphone|smartphone|iphone|ordinateur|pc\b|portable|perceuse|outil|lithium|li.?ion|rechargeable|\d+\s*mah))|cymbale|caisse[sx]?.?claire/i, '🥁'],
  [/trompette|saxophone|clarinette|flûte(?!s?\s*(?:à\s*)?champagne)/i, '🎺'],
  [/(?<!sol\s)(?<!stickers?\s)(?<!autocollants?\s)vinyle?s?\b(?!\s*(?:adhésifs?|autocollants?))|platine|33.?tours|45.?tours/i, '💿'],  // sol/sticker vinyle = revêtement, pas un disque (audit 2026-07-19)
  // Médias physiques (2026-07-09, backlog T3) : Divertissement > Vidéo (DVD/
  // Blu-ray/VHS) et > Musique (CD/Cassettes audio) — 📀 AVANT 💽 pour que
  // "cassette vidéo" parte en Vidéo, "cassette" seule = audio par défaut.
  [/\bdvd\b|blu[sx]?.?ray|\bvhs\b|cassette[sx]?.?vidéo|laserdisc/i, '📀'],
  [/\bcd\b|\bk7\b|cassette|minidisc/i, '💽'],
  [/harmonica/i, '🎼'],
  [/micro(?:phone)?\b(?![\s-]*(?:sd\b|usb|hdmi|ondes?))/i, '🎤'],  // micro SD/USB/-ondes ≠ microphone (audit 2026-07-19)
  // Jouets
  // `lego` BORNÉ (2026-08-11) : sans borne il matche « GaLEGOn » (nom de
  // Pokémon) — troisième cas de la même famille que « mascara »/« ampoule ».
  [/(?<![\p{L}\p{N}])legos?(?![\p{L}\p{N}])|duplo|kapla|jeu[sx]?.?de.?construction/iu, '🧱'],
  // (peluche/doudou : remontée en tête des désambiguïsations — cf. « peluche
  // souris » qui partait en 🖱️ Souris d'ordinateur.)
  [/poupée|barbie|poupon/i, '🪆'],
  [/puzzle/i, '🧩'],
  // playmobil : aucune feuille Vinted dédiée (0 hit dans l'arbre, vérifié
  // 2026-07-09) — rangé avec les figurines ("Sets de jeux" = feuille sœur).
  [/figurine|funko|playmobil/i, '🦸'],
  // Livres
  [/manga|\bbd\b|bande[sx]?.?dessinée|comics/i, '📖'],
  [/livrets?|livre|romans?(?![\p{L}\p{N}])|encyclopédie|dictionnaire/iu, '📚'],   // livrets? (2026-09-10, borne droite) ;  // « romantique » contenait roman (audit 2026-07-19)
  [/magazine|revue\b/i, '📰'],
  // Collection
  // ── Cartes à collectionner (2026-08-11) ───────────────────────────────────
  // INDISSOCIABLE de la borne posée sur `mascara` juste au-dessus : sans cette
  // règle, les 108 titres « Mascarade Crépusculaire » libérés de 💄 tombent sur
  // 📦 (leur `type` est null, donc aucun défaut de catégorie ne les rattrape) —
  // et 📦 vaut null sur les QUATRE plateformes. Ils passeraient de « mal
  // classés mais publiables partout » à « publiables nulle part ».
  // 🃏 est déjà mappé partout, et c'est le bon rayon : Vinted « Cartes à
  // collectionner à l'unité », LBC « Loisirs > Collection », eBay « JCC :
  // cartes à l'unité » (183454), Beebs « Cartes Pokémon à l'unité ».
  // ⚠️ PLACÉE APRÈS Jouets/Livres à dessein : « peluche Pokémon » doit rester
  // 🧸 et « figurine Pokémon » 🦸 — leurs règles matchent avant celle-ci.
  // ⚠️ La règle 🃏 existante (bloc désambiguïsation, plus haut) exige le MOT
  // « carte » ou « booster » — ces titres-là n'ont ni l'un ni l'autre :
  // « Stalgamin 051/167 - Mascarade Crépusculaire EV06 - TWM FR ». Ce qui les
  // identifie, c'est le NUMÉRO DE CARTE (051/167) accompagné d'un marqueur de
  // collection (Reverse, Holo, Promo, ou un code d'extension type EV06).
  // Les DEUX sont exigés : seul, « 128/256 » est une capacité de stockage,
  // « 205/55 » une taille de pneu, « 16/9 » un format d'image.
  [/cartes?\s+(?:à\s+)?collectionner|\bjcc\b|trading\s+cards?|\btcg\b|yu.?gi.?oh|magic.{0,15}gathering|\bmtg\b|(?=[\s\S]*\b\d{1,3}\s*\/\s*\d{2,3}\b)(?=[\s\S]*(?:holo(?:graphique)?|reverse|promo|booster|psa\s*\d|pok[ée]mon|\b(?:ev|sv|xy|sm|swsh|bw|dp)\d{1,2}\b))/iu, '🃏'],
  [/timbre/i, '📮'],
  [/monnaie|numismat|pièce[sx]?.?de.?monnaie/i, '🪙'],
  // Puériculture — scindée en 4 icônes (juillet 2026) : l'ancienne 👶 unique
  // conflatait poussette/siège auto/biberon/babyphone, quatre branches
  // catalogue différentes sur les 3 plateformes (un babyphone partait en
  // "Poussettes"). ⚠️ Conflations puériculture RESTANTES, hors de ces regex :
  // "transat" (bébé) part sur ⛱️ salon de jardin, "chaise haute" sur 🪑
  // chaise, "lit parapluie" sur 🛏️ lit — à scinder si le volume le justifie.
  [/poussette|landaus?\b/i, '👶'],
  [/siège[sx]?.?auto/i, '💺'],
  [/biberon/i, '🍼'],
  [/babyphone|baby[sx]?.?phone|écoute[sx]?.?bébé/i, '📟'],
  // ── DERNIER RECOURS : numéro de carte seul (2026-08-11) ───────────────────
  // Placée en TOUTE FIN de liste, donc atteinte UNIQUEMENT si aucune autre
  // règle n'a reconnu l'objet. Un « 205/55 » de pneu, un « 128/256 » de
  // stockage, un « 16/9 » d'écran sont déjà captés plus haut par leur propre
  // mot-clé ; ce qui arrive ici avec un numéro de la forme NN/NNN et rien
  // d'autre de reconnaissable est, en pratique, une carte à collectionner.
  // Cas qui l'exige : « Galegon 53/123 Diamant & Perle : Trésors Mystérieux »
  // — aucun marqueur (ni Reverse, ni Holo, ni code d'extension), et sans cette
  // règle il tombe sur 📦, injouable sur les quatre plateformes.
  // (19/11 soir, lot de Nico — « TEST FillSell 28/10 » rangé en cartes JCC, question « Jeu ») Après la barre, un nombre
  // de cartes d'au moins 19 : « 28/10 » (une date), « 9/12 mois », « 11/12 ans », « 6/18 mois » (un âge), « 1/16 »
  // (une échelle) ne sont jamais un numéro de carte — 25 titres en 30 jours. Verrou objet-date-et-jordan-1911.
  [/(?<![\p{L}\p{N}/.,])\d{1,3}\s*\/\s*(?!0\d(?!\d)|1[0-8](?!\d))\d{2,3}(?![\p{L}\p{N}/.,])/u, '🃏'],
];
// Icône par défaut si aucun mot-clé ne matche : celle de la catégorie.
const CAT_DEFAULT_ICONS = {
  'Mode':'👗','Luxe':'💎','High-Tech':'📱','Maison':'🏠','Électroménager':'⚡',
  // Beauté : 🧴 Soins et non 💄 (2026-07-18) — un produit beauté SANS mot-clé
  // (déo importé, titre anglais inconnu) partait en « Rouges à lèvres » eBay
  // (31804, Teinte obligatoire) ; Soins de la peau est le défaut le moins faux.
  'Jouets':'🧸','Livres':'📚','Sport':'⚽','Auto-Moto':'🚗','Beauté':'🧴',
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

// Mentions NÉGATIVES de fragrance (bug réel Medik8 2026-07-19) : « sans
// parfum » dans la description d'un SÉRUM matchait la règle 🌸 Parfums —
// prioritaire sur 🧴 dans OBJECT_ICON_RULES — et l'item entier partait en
// Parfums sur les plateformes (eBay : Type Eau de parfum/Volume/Nom de parfum
// obligatoires). Retirées AVANT détection, même philosophie que
// INCLUDED_ACCESSORY_CLAUSE : on enlève le bruit, l'objet principal pilote.
const FRAGRANCE_NEGATION =
  /(?:\bsans\b|\b0\s*%)\s*parfum\b|\bnon\s+parfum[ée]e?s?\b|fragrance[-\s]?free|unscented/gi;

// ── « UN DVD N'A PAS D'ISBN » (2026-09-06, lot de 24 DVD d'Ornella) ─────────
// La famille Lens `livres_medias` s'appelle littéralement « livres ET médias » :
// elle porte les livres, mais AUSSI les DVD, Blu-ray, CD, vinyles et jeux
// vidéo. La règle « famille souveraine pour les livres » du 02/09 (cas
// Delavier) en tirait 📚 pour TOUTE la famille — et un lot de 24 DVD est parti
// côté Beebs en « Jeux, jouets et loisirs > Livres > Autres livres », avec le
// mur ISBN au bout : on a réclamé à une vendeuse le numéro ISBN de DVD.
//
// Ce prédicat dit « support NON-livre », et rien d'autre :
//  · uniquement des mots qui désignent un SUPPORT physique (dvd, vinyle,
//    console…), JAMAIS un sujet. « Musique », « film » et « série » sont
//    volontairement ABSENTS de la liste : un livre parle toujours de son sujet
//    — c'est la leçon exacte du cas Delavier (« La Méthode Delavier de
//    MUSCULATION » n'est pas un article de sport), qu'on ne rejoue pas à
//    l'envers ;
//  · DÉSARMÉ dès que le texte nomme explicitement un livre (« méthode + CD »,
//    « roman », « manga », « tome ») : un livre vendu avec un CD reste un livre,
//    et c'est le cas de faux positif le plus probable de toute la règle.
//
// Vocabulaire aligné sur MEDIA_NON_LIVRE_RE d'update-job-status (24/08, les 12
// DVD de Prudence Fresnel) : la même doctrine des deux côtés de la barrière.
export const SUPPORT_NON_LIVRE_RE =
  /\b(dvd|blu[-\s]?ray|vhs|k7|laserdisc|vinyles?|33\s?tours|45\s?tours|cd|cds|cd-?rom|jeux?\s+vid[ée]o|video\s?games?|consoles?|playstation|xbox|nintendo|game\s?boy|gamecube|megadrive|dreamcast)\b/i;
export const LIVRE_EXPLICITE_RE =
  /\b(livres?|romans?|mangas?|bandes?\s+dessin[ée]es?|bd|tomes?|beaux?[-\s]livres?|books?|novels?|isbn)\b/i;

// true = le texte désigne un support vidéo/audio/jeu, donc PAS un livre, donc
// PAS d'ISBN. Utilisé aux deux bouts de la chaîne : le mapping de catégorie
// (ceinture) et l'exigence d'ISBN (bretelles).
export function estSupportNonLivre(...textes) {
  const t = textes.filter(Boolean).map(String).join(" ");
  if (!t.trim()) return false;
  if (LIVRE_EXPLICITE_RE.test(t)) return false;
  return SUPPORT_NON_LIVRE_RE.test(t);
}

// ── LES ACCENTS NE DOIVENT PAS DÉCIDER (2026-09-07 soir) ───────────────────
// Mesuré sur le parc : « débardeur » est reconnu, « debardeur » ne l'est PAS —
// et les vendeurs écrivent sans accents en permanence (téléphone, majuscules,
// copier-coller d'une fiche produit). Même chose pour « marinière/mariniere »,
// « cuillère/cuillere », « paréo/pareo », « boléro/bolero ».
// La doctrine du dépôt est déjà celle-là ailleurs (texteComparable) : ON
// NORMALISE POUR COMPARER. On l'applique donc ici, des DEUX côtés — le texte
// ET les motifs — pour que la comparaison ait lieu dans le même alphabet.
//
// ⚠️ EFFET DE BORD HEUREUX, ET VÉRIFIÉ : « boléro » (une veste courte) était
// classé 🍽️ ARTS DE LA TABLE, parce que `\bbol\b` matche dans « boléro » —
// « é » n'est pas un caractère de mot ASCII, donc la borne \b tombe juste
// après « bol ». Exactement le piège documenté de gant/élégant et drap/drapé.
// Sur le texte sans accents, « bolero » ne matche plus : la borne échoue sur
// le « e ». Les deux pièges historiques, eux, restent fermés — leurs règles
// utilisent des bornes Unicode (?<![\p{L}\p{N}]) que la normalisation ne
// touche pas. Les trois cas sont sous test.
const SANS_ACCENTS = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// Motifs dé-accentués, construits UNE fois depuis la source de vérité : on ne
// maintient pas deux listes, on en dérive une.
let _reglesSansAccents = null;
// ── BORNE DE MOT À GAUCHE, POUR TOUTES LES RÈGLES (2026-09-10) ──────────────
// Cas fondateur : « Combinaison Kiabi… en coton CÔTELÉ » publiée en
// « Électronique > Téléviseurs » — la règle 📺 `télé(?![a-zà-ÿ])` n'avait pas
// de borne à GAUCHE ; une fois les accents retirés, « cotele » contient
// « tele ». Audit du 10/09 : 169 des 177 règles ont au moins une alternative
// qui commence par une lettre sans \b — c'est un défaut de FORME de tout le
// fichier, pas un cas isolé (« veste » dans « vestiaire », « botte » dans
// « bottega »…). Plutôt que 169 retouches, la borne est posée ICI, une fois,
// à la compilation : un mot-objet commence toujours au début d'un mot.
// Exceptions ASSUMÉES (préfixes soudés du vêtement) : mini-/maxi-/midi-
// (minijupe), sous- (sous-pull), sur- (surchemise), demi- — écrits collés,
// ils restent reconnus. Le texte comparé est déjà sans accents (SANS_ACCENTS),
// donc [A-Za-z0-9] suffit comme classe de lettre.
const BORNE_GAUCHE = "(?:(?<![A-Za-z0-9])|(?<=\\b(?:mini|maxi|midi|sous|sur|demi)))";
// ── BORNE DE MOT À DROITE, POUR TOUTES LES RÈGLES (2026-09-10, GO Nico) ─────
// Mesure du 09/09 : 152 des 178 règles ont une alternative qui finit par une
// lettre sans \b ni (?!…) — « botte » matchait « Bottega », « synthé »
// matchait « synthétique » (14 titres classés 🎹), « chale » « chaleur ».
// Symétrique de BORNE_GAUCHE, posée ICI, une fois, à la compilation, SANS
// liste d'exceptions par règle (décision Nico : un mécanisme qu'on comprend
// encore dans six mois). Passe large du 10/09 sur 44 303 titres de
// l'inventaire : 99,7 % identiques ; les 9 vrais dérivés soudés perdus
// (livret, chemisette, sweater, valisette, parfumée, skateboard, pullover,
// sweatshirt, sandalettes) sont devenus des mots-clés à part entière dans
// leurs règles ; les 57 changements d'icône restants sont des corrections.
//   · (?:s|x|es)? : le pluriel reste reconnu pour les règles écrites au
//     singulier (« bottes », « sandales », « pulls ») ;
//   · puis fin de mot : le caractère suivant n'est pas alphanumérique — OU le
//     caractère précédent ne l'est pas, ce qui rend la borne INERTE pour les
//     règles à largeur nulle (^(?=…)(?=…) des vêtements bébé, qui matchent en
//     position 0 sans rien consommer) et pour un motif qui finit déjà sur un
//     séparateur. Un mot-objet s'arrête toujours à la fin d'un mot.
// Non-régression figée : scripts/mot-objet-borne-droite-selftest.mjs (corpus
// scripts/corpus-mot-objet-2026-09-10.json, 1 153 titres réels de jobs).
const BORNE_DROITE = "(?:s|x|es)?(?:(?![A-Za-z0-9])|(?<![A-Za-z0-9]))";
function reglesComparables() {
  if (!_reglesSansAccents) {
    _reglesSansAccents = OBJECT_ICON_RULES.map(([re, icon]) =>
      [new RegExp(BORNE_GAUCHE + "(?:" + SANS_ACCENTS(re.source) + ")" + BORNE_DROITE, re.flags), icon]);
  }
  return _reglesSansAccents;
}

// Détection par MOT-CLÉ seule (les 2 passes d'OBJECT_ICON_RULES), SANS repli sur
// le défaut de catégorie : renvoie l'icône si un mot-objet explicite matche,
// sinon null. Extraite de detectObjectIcon (2026-07-21) pour que les appelants
// puissent distinguer « un vrai mot-clé a matché » (signal FIABLE, audité) d'un
// simple défaut de catégorie. Sert à la réconciliation icône IA ↔ mot-clé dans
// resolveArticleIcon (front) : un « hoodie/sweat » nommé dans le titre FR prime
// sur une estimation Haiku (category_icon) qui, elle, peut confondre 🧶 et 🧥.
export function detectObjectIconKeyword(titre, description){
  return detectObjectKeywordDetail(titre, description)?.icon ?? null;
}

// LE MOT QUI A MATCHÉ, EN PLUS DE L'ICÔNE (2026-09-10). Jusqu'ici la détection
// ne rendait que l'emoji : « jupe » devenait 👗, et 👗 = « Robes » — l'emoji
// est le dernier endroit où l'information se perdait. Le mot, lui, se compare
// à l'arbre relevé de chaque plateforme (categorieParMot) : « jupe » → feuille
// « Jupes ». `passe` dit d'où il vient : 1 = le TITRE (source du vendeur,
// fiable), 2 = titre + description (filet, moins sûr). `mot` est le texte
// matché sur la forme comparable (sans accents, minuscules), débarrassé d'un
// éventuel caractère de contexte en tête (filet : une règle qui consommerait
// son contexte gauche rendrait « robe » précédé d'un espace).
// ── (18/10 soir, Nico) L'ACCESSOIRE D'UN OBJET N'EST JAMAIS L'OBJET ──────────
// « Housse de coussin » partait au rayon des coussins, « Housse de canapé » à
// celui des canapés, « House de couette » (faute) à celui des couettes — sur les
// quatre plateformes, puisque le mot du titre choisit la feuille de chacune.
// RÈGLE (la même que l'option du texte, _shared/option-du-texte.js) : « housse
// de… », « taie de… » et la faute « house de… » suivis d'un objet nomment
// l'ACCESSOIRE. Le mot de cet objet n'est jamais le mot de l'article ; une règle
// qui nomme l'accessoire (« housse de couette », « taie d'oreiller ») le reste ;
// sans elle, rien du titre : l'objet de l'IA, puis la question. Un mot qui nomme
// l'accessoire lui-même (« de protection pour… », « de transport… », « étui »)
// se saute jusqu'à l'objet ; un « pour … » juste après nomme un objet de plus
// (« housse étui portefeuille pour smartphone ») ; sans « de » (« Housse coussin
// velours »), le mot qui suit est l'objet ; « drap housse » EST l'article.
// Un TITRE qui COMMENCE par l'accessoire (« Housse pour objectif appareil
// photo », « Lot de 4 housses… ») ne nomme que lui : aucun mot-objet après la
// tête n'y choisit le rayon (banc du 18/10 : « objectif » puis « appareil
// photo » prenaient la place de la housse).
// Un texte sans cette tournure suit exactement le chemin d'avant.
const FAUTE_HOUSSE = /\bhouse(s?)(?=\s+(?:de|d['’]|du|des|pour)\b)/g;
const MOTS_DE_L_ACCESSOIRE = "protection|rangement|transport|voyage|rechange|remplacement|etuis?|coques?|pochettes?|sacs?|sacoches?";
const OBJET_ACCESSOIRE = new RegExp("(?<!\\bdraps?\\s)\\b(?:housses?|taies?)\\s*(?:de\\s+|d['’]\\s*|du\\s+|des\\s+|pour\\s+)?(?:(?:la|le|les|l['’]|un|une|mon|ma|mes|son|sa|ses)\\s*)?"
  + "(?:(?:" + MOTS_DE_L_ACCESSOIRE + ")\\s+(?:(?:de|d['’]|du|des|pour)\\s*)?(?:(?:la|le|les|l['’])\\s*)?){0,2}([a-z0-9]+)(?:\\s+(?!pour\\b)[a-z0-9]+)?(?:\\s+pour\\s+(?:(?:la|le|les|l['’]|un|une|mon|ma|son|sa)\\s*)?([a-z0-9]+))?", "gd");
const TITRE_ACCESSOIRE = /^[^a-z0-9]*(?:(?:lots?|set)\s+(?:de\s+)?)?(?:\d+\s+)?(?:housses?|taies?)\b/;
// Une règle qui nomme elle-même l'accessoire (« taie d'oreiller », « housse de couette ») n'est jamais sautée.
const MOT_ACCESSOIRE = /^(?:housses?|taies?)\b/;
/** Les mots-objets d'un accessoire dans un texte comparable : [{ debut, fin }] (indices de caractères). Un texte
 *  qui COMMENCE par l'accessoire (un titre) : tout ce qui suit la tête. */
export function zonesObjetAccessoireTexte(t){
  const x=String(t??'');
  const tete=TITRE_ACCESSOIRE.exec(x);
  if(tete) return [{ debut: tete.index+tete[0].length, fin: x.length }];
  const z=[];
  for(const m of x.matchAll(OBJET_ACCESSOIRE)){
    for(const k of [1,2]) if(m.indices[k]) z.push({ debut: m.indices[k][0], fin: m.indices[k][1] });
  }
  return z;
}
// ── (05/11 soir, Nico — « Boîte à bijoux », PMF Vito) UN CONTENANT DE BIJOUX N'EST JAMAIS UN BIJOU ──────────────
// Même mécanisme que l'accessoire du 18/10 : les mots-bijoux RANGÉS par un contenant (« boîte à bijoux », « écrin à
// bague », « coffret à bijoux », « présentoir à colliers et bracelets », « range-bijoux », « porte-bijoux », « arbre à
// bijoux », « boîte à montres », et, dans un texte qui nomme un tel contenant, « … pour colliers et bagues ») ne
// choisissent jamais l'icône : ni 💍, ni ⌚. Un bijou nommé AILLEURS dans le texte (« Bague argent dans son écrin »,
// « Coffret bijoux Swarovski collier et boucles ») reste l'article. Texte comparable (minuscules, sans accents).
const CONTENANT_BIJOUX = "boites?|coffrets?|coffres?|ecrins?|presentoirs?|organiseurs?|organisateurs?|plateaux?|arbres?|supports?|rangements?|range|porte|vide[\\s-]?poches?|trousses?|valisettes?|mallettes?";
const BIJOUX_RANGES = "bijou[xs]?|bagues?|colliers?|bracelets?|montres?|boucles?\\s?d['’ ]?\\s?oreilles?|pendentifs?|broches?|chaines?";
const LISTE_BIJOUX = `(?:${BIJOUX_RANGES})(?:\\s*(?:,|et|ou|&|/)\\s*(?:(?:les|vos|tes|mes|des)\\s+)?(?:${BIJOUX_RANGES}))*`;
const RE_CONTENANT_BIJOUX = new RegExp(`(?<![a-z0-9])(?:${CONTENANT_BIJOUX})[\\s-]*(?:(?:a|de|d['’]|pour|aux|des|en)\\s*)?(?:(?:les|vos|tes|mes|ses)\\s+)?(${LISTE_BIJOUX})(?![a-z0-9])`, "gd");
const RE_POUR_BIJOUX = new RegExp(`(?<![a-z0-9])(?:pour|ranger|range)\\s+(?:(?:les|vos|tes|mes|des|ses)\\s+)?(${LISTE_BIJOUX})(?![a-z0-9])`, "gd");
/** Les mots-bijoux rangés par un contenant, dans un texte comparable : [{ debut, fin }]. */
export function zonesContenantBijoux(t){
  const x=String(t??'');
  const z=[];
  for(const m of x.matchAll(RE_CONTENANT_BIJOUX)) z.push({ debut: m.indices[1][0], fin: m.indices[1][1] });
  if(!z.length) return z;
  for(const m of x.matchAll(RE_POUR_BIJOUX)) z.push({ debut: m.indices[1][0], fin: m.indices[1][1] });
  return z;
}
/** Le texte nomme-t-il un CONTENANT de bijoux dont aucun bijou n'est l'article ? (détection de l'icône seule) */
export function estContenantDeBijoux(titre, description){
  return detectObjectKeywordDetail(titre, description)?.contenantBijoux === true;
}

const _reglesGlobales=new Map();
function premiereHorsObjetAccessoire(re, t, zones){
  if(!zones.length) return re.exec(t);
  let g=_reglesGlobales.get(re);
  if(!g){ g=new RegExp(re.source, re.flags.includes('g')?re.flags:re.flags+'g'); _reglesGlobales.set(re,g); }
  for(const m of t.matchAll(g)){
    const mot=m[0].replace(/^[^a-z0-9]+/i,'');
    const debut=m.index+(m[0].length-mot.length);
    if(MOT_ACCESSOIRE.test(mot) || !zones.some((z)=>debut>=z.debut && debut<z.fin)) return m;
  }
  return null;
}

// (22/10 soir, point 2 — paugues) Les icônes de la beauté : une œuvre d'art n'y tombe jamais.
const ICONES_BEAUTE_OBJET = new Set(['🌸', '💄', '💅', '🧴']);

// ── (23/10, point 4 — louis-seller) « CASQUE » SEUL NE DIT PAS QUEL CASQUE ─────────────────────────────────────
// « Casque enfant Oxelo Decathlon - Taille 55-58 cm » partait en 🎧 (Électronique > Photo, audio & vidéo) : la règle
// audio prend le mot « casque » nu, et les règles des casques de protection exigent un qualificatif COLLÉ au mot
// (« casque vélo », jamais « casque de ski », « casque enfant Oxelo »). Quand le mot qui décide est « casque » tout
// seul, on lit d'abord ce qui le qualifie — la marque, une taille de tête en cm, le contexte — du plus sûr au moins
// sûr ; UNE seule famille signalée donne son icône (⛑️ protection : vélo, ski, roller, chantier… ; 🪖 moto) ; aucune
// famille, ou des signaux contradictoires (audio ET protection), gardent la règle d'avant — jamais une devinette.
// Rejeu : scripts/lot-2310-selftest.mjs (les titres « casque » du parc ; aucun casque audio ne bascule).
const CASQUE_NU_RE = /^casques?$/i;
const CASQUE_MARQUES = {
  protection: /\b(?:oxelo|decathlon|b'?\s?twin|rockrider|quechua|wed'?\s?ze|van\s?rysel|riverside|giro|uvex|abus|poc|kask|lazer|cairn|salomon|rossignol|wanabee|hornit|nutcase|melon|thousand|globber|micro\s?mobility|kiddimoto|bell\s+(?:sports|spark|sixer)|met\s+(?:helmets|crackerjack|genie))\b/i,
  moto: /\b(?:scorpion|shark|bullitt?|ls2|shoei|hjc|arai|agv|nolan|caberg|schuberth|airoh|x-?lite|astone|mt\s?helmets|givi|dexter|bering)\b/i,
  audio: /\b(?:sony|bose|jbl|sennheiser|beats|jabra|skullcandy|frends|marshall|audio-?technica|akg|steelseries|logitech|razer|hyper\s?x|corsair|turtle\s?beach|airpods?|plantronics|urbanears|philips|panasonic|pioneer|denon|bang\s?&?\s?olufsen|b&o|beyerdynamic|shure|grado|koss|soundcore|anker|apple|samsung|xiaomi|huawei|pico|oculus|meta\s?quest)\b/i,
};
const CASQUE_TOUR_DE_TETE_RE = /\b(?:4[4-9]|5\d|6[0-4])\s*(?:(?:-|–|à|\/|a)\s*(?:4[4-9]|5\d|6[0-4]))?\s*cm\b/i;
const CASQUE_CONTEXTE = {
  protection: /\b(?:protection|v[ée]lo|cycli(?:sme|ste)|vtt|bmx|trottinette|roller|rollers|skate|skateboard|ski|snow(?:board)?|[ée]quitation|cheval|escalade|chantier|s[ée]curit[ée]|en\s?1078|en\s?1077|boxe|hockey|patin(?:age|s)?|kayak|draisienne)\b/i,
  moto: /\b(?:moto|motocross|cross|scooter|int[ée]gral|jet|modulable|mx|enduro|quad)\b/i,
  audio: /\b(?:bluetooth|sans\s?fil|filaire|micro(?:phone)?|gam(?:ing|er)|usb|jack|audio|hi-?fi|st[ée]r[ée]o|r[ée]duction\s+de\s+bruit|anc|dj|[ée]couteurs?|son\s+surround|ps[45]|xbox|switch|pc\s+gamer|vr|r[ée]alit[ée]\s+virtuelle)\b/i,
};
/** La famille d'un casque d'après ce qui le qualifie, ou null (aucun signal, ou des signaux contradictoires). */
export function familleDuCasque(titre, description) {
  const t = `${String(titre ?? '')} ${String(description ?? '')}`;
  const f = { protection: false, moto: false, audio: false };
  for (const k of Object.keys(f)) if (CASQUE_MARQUES[k].test(t) || CASQUE_CONTEXTE[k].test(t)) f[k] = true;
  if (CASQUE_TOUR_DE_TETE_RE.test(t)) f.protection = f.protection || !f.moto;
  if (f.audio) return null;                       // un signal audio : la règle d'avant (🎧) garde la main
  if (f.moto) return 'moto';                      // moto prime sur « protection » (un casque de moto protège aussi)
  return f.protection ? 'protection' : null;
}

export function detectObjectKeywordDetail(titre, description){
  // (22/10 soir, point 2 — paugues) UNE ŒUVRE D'ART N'EST JAMAIS UN SOIN : « Huile post impressionniste biblique
  // sur carton » partait en 🧴 sur le mot « Huile ». Quand les règles disent beauté (ou rien) et que le titre ou la
  // description nomme une œuvre (src/utils/oeuvreDArt.js), l'icône est 🖼️ — rendue comme une décision du titre
  // quand le titre suffit. ⛔ Jamais au-dessus d'une autre icône (rejeu sur 48 832 fiches : T-shirts
  // « sérigraphie », sacs « toile monogramme », médailles « gravure personnalisée » gardent la leur).
  const base = detectObjectKeywordDetailBase(titre, description);
  if (!base || ICONES_BEAUTE_OBJET.has(base.icon)) {
    const art = oeuvreDArt(titre, description);
    if (art) return { icon: '🖼️', mot: art.preuve, passe: oeuvreDArt(titre) ? 1 : 2, oeuvre: art.famille };
  }
  // (23/10, point 4) « casque » nu → la famille que disent la marque, la taille, le contexte (familleDuCasque).
  if (base?.icon === '🎧' && CASQUE_NU_RE.test(String(base.mot ?? '').trim())) {
    const famille = familleDuCasque(titre, description);
    if (famille === 'moto') return { ...base, icon: '🪖', casque: 'moto' };
    if (famille === 'protection') return { ...base, icon: '⛑️', casque: 'protection' };
  }
  return base;
}

function detectObjectKeywordDetailBase(titre, description){
  // Dé-bruitage : accessoires inclus + négations de fragrance.
  const denoise=(s)=>String(s||'')
    .replace(INCLUDED_ACCESSORY_CLAUSE,' ')
    .replace(FRAGRANCE_NEGATION,' ')
    .toLowerCase()
    .replace(FAUTE_HOUSSE,'housse$1');
  const motDe=(m)=>String(m?.[0]??'').replace(/^[^a-z0-9]+/i,'').trim()||null;
  // Passe 1 — le TITRE seul : c'est lui qui NOMME l'objet (même règle produit
  // que le ciblage par titre des pages de liste). Sans cette passe, un mot-clé
  // de la DESCRIPTION porté par une règle plus haute dans OBJECT_ICON_RULES
  // vole l'icône à l'objet du titre : « Sérum anti-rides » + description
  // « …parfum délicat » partait en 🌸 Parfums (l'ordre des règles fait la
  // priorité, pas la position du mot dans le texte).
  const regles=reglesComparables();
  const tTitre=SANS_ACCENTS(denoise(titre));
  // (05/11 soir) Les mots-bijoux d'un contenant (« boîte à bijoux ») ne choisissent jamais l'icône.
  const zBijouxTitre=zonesContenantBijoux(tTitre);
  const zTitre=[...zonesObjetAccessoireTexte(tTitre), ...zBijouxTitre];
  const marque=(r)=>(zBijouxTitre.length && r.icon==='🏠' ? { ...r, contenantBijoux: true } : r);
  for(const [re,icon] of regles){ const m=premiereHorsObjetAccessoire(re,tTitre,zTitre); if(m) return marque({ icon, mot: motDe(m), passe: 1 }); }
  // Passe 2 — titre + description (comportement historique, filet pour les
  // titres sans mot-objet : « Medik8 Crystal Retinal 6 » + desc « crème… »).
  const t=SANS_ACCENTS(denoise((titre||'')+' '+(description||'')));
  const zBijoux=zonesContenantBijoux(t);
  const zT=[...zonesObjetAccessoireTexte(t), ...zBijoux];
  for(const [re,icon] of regles){ const m=premiereHorsObjetAccessoire(re,t,zT); if(m) return (zBijoux.length && icon==='🏠') ? { icon, mot: motDe(m), passe: 2, contenantBijoux: true } : { icon, mot: motDe(m), passe: 2 }; }
  return null;
}

// ── (18/10, eBay ÷ 5) UNE DÉCORATION MURALE NE PREND PAS L'ICÔNE DE SON MOTIF ──
// « Décoration murale chambre », description « avec un lit, un miroir et un
// lampadaire » : aucune règle ne nomme « décoration murale » au titre, la
// passe 2 lisait « lit » dans la DESCRIPTION → 🛏️ → eBay « Lits, cadres,
// sommiers » (175758) : « Taille de matelas compatible » demandée deux fois,
// « Matériau » une fois. « Décoration murale cuisine » (« une cocotte, un
// fouet ») → 🍳 → « Casseroles, marmites » : « Type de cuisinière compatible ».
// Le mot de pièce du titre nomme la pièce, la description énumère ce que la
// décoration REPRÉSENTE : son SUJET, pas l'objet — la même famille d'erreurs
// que les 10 échecs mesurés de la passe 2 (19/09). Quand le TITRE nomme une
// décoration murale, la passe 2 ne fixe donc pas l'icône (resolveArticleIconDetail,
// voie 5) : l'icône de l'IA (🖼️ pour ces articles) ou le défaut de type décide.
// ⛔ La passe 1 n'est jamais touchée : « Horloge murale », « Étagère murale »
//    gardent l'icône que leur titre leur donne.
const DECORATION_MURALE_TITRE = /\b(?:deco(?:ration)?s?|decors?|stickers?|autocollants?|triptyques?|tableaux?|panneaux?|plaques?\s+decoratives?)\s+mura(?:le|les|l|ux)\b/;
export function titreNommeUneDecorationMurale(titre){
  return DECORATION_MURALE_TITRE.test(SANS_ACCENTS(titre).toLowerCase());
}

export function detectObjectIcon(titre, description, type){
  // Mot-clé explicite d'abord (les 2 passes) — comportement historique intact.
  const kw = detectObjectIconKeyword(titre, description);
  if(kw) return kw;
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

// Liste PLATE et dédupliquée de TOUTES les icônes objet que le système
// reconnaît : les icônes d'OBJECT_ICON_RULES + les défauts par catégorie
// (CAT_DEFAULT_ICONS). UNIQUE enum autorisé pour toute source EXTERNE
// d'icône — en particulier le category_icon que generate-listing peut
// désormais renvoyer : une valeur hors de cette liste est rejetée et l'on
// retombe silencieusement sur detectObjectIcon. detectObjectIcon lui-même
// reste INCHANGÉ et reste le filet de secours ; cette constante ne fait que
// l'exposer, elle ne modifie aucun comportement de détection.
export const ALL_OBJECT_ICONS = [
  ...new Set([
    ...OBJECT_ICON_RULES.map(r => r[1]),
    ...Object.values(CAT_DEFAULT_ICONS),
  ]),
];
