SET lock_timeout = '8s';
-- ═══════════════════════════════════════════════════════════════════════════
-- LA CATÉGORIE D'UNE ANNONCE, RAMENÉE À LA CATÉGORIE FILLSELL (04/10, Louis)
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis (Business), 03/10 : ses 15 « Rangement … pour yaourtière Multidélices »
-- importés de Beebs sont rangés « Autre » alors que l'annonce dit « Maison >
-- Petit électroménager > Yaourtières ». L'import (rapprocher_importer) ne
-- posait JAMAIS `inventaire.type` : mesuré le 04/10 sur les fiches importées
-- encore en ligne, type vide sur 194/256 (Beebs), 1 062/1 067 (eBay),
-- 1 062/1 120 (Leboncoin), 397/444 (Opla).
--
-- RÈGLE (Nico, 04/10) : le relevé reprend TOUT ce que l'annonce affiche, dont
-- la catégorie, ramenée à la catégorie FillSell la plus juste. Les quinze
-- catégories FillSell sont celles du Stock (src/tabs/StockTab.jsx,
-- categoriesStock) : Mode, High-Tech, Maison, Électroménager, Jouets, Livres,
-- Sport, Auto-Moto, Beauté, Musique, Collection, Multimédia, Jardin,
-- Bricolage, Autre.
--
-- COMMENT : le CHEMIN entier (« Maison > Petit électroménager > Yaourtières »,
-- « WOMEN_ROOT > BEAUTY > BEAUTY_MAKEUP », « Vêtements » chez Leboncoin qui ne
-- donne que la feuille), normalisé (minuscules, sans accents, « _ » → espace),
-- passe une liste ORDONNÉE de familles ; la première qui reconnaît un de ses
-- mots l'emporte. L'ordre porte les arbitrages, tous relevés sur des chemins
-- réels : Livres avant Jouets (« Jeux, jouets et loisirs > Livres »), Jouets
-- avant Musique / Électroménager / Auto-Moto (« Jouets et jeux > Jeux
-- éducatifs > Musique et arts », « Jeux, jouets et loisirs > Véhicules >
-- Voitures »), Électroménager avant Maison (yaourtières), Beauté avant Mode
-- (« WOMEN_ROOT > BEAUTY »), Collection avant Auto-Moto et Maison
-- (« Collections > Porte-clés > Automobile », « Collections > Objets de
-- cuisine »), le vêtement avant Sport (« Mode > Homme > Vêtements de sport »),
-- Maison avant le reste de Mode (« Maison > Monde de l'enfant »).
-- Rédigée et vérifiée sur les 1 035 chemins réellement capturés au 04/10
-- (Beebs, eBay, Leboncoin, Opla).
--
-- ⛔ RIEN N'EST DEVINÉ D'UN TITRE : sans chemin reconnu, la fonction rend NULL
--    et la fiche garde sa catégorie (l'écran affiche « Autre »).
-- ⛔ Elle ne remplace jamais une catégorie posée : c'est l'appelant
--    (fiche_completer_depuis_annonce, rapprocher_importer) qui ne remplit que
--    le champ vide.
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.texte_sans_accents(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
           replace(replace(replace(
             translate(lower(COALESCE(p, '')),
                       'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ’''_',
                       'aaaaaaceeeeiiiinooooouuuuyy   '),
             'œ', 'oe'), 'æ', 'ae'), '/', ' '),
           '\s+', ' ', 'g');
$function$;

CREATE OR REPLACE FUNCTION public.type_fillsell_depuis_categorie(p_platform text, p_chemin text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 PARALLEL SAFE
AS $function$
DECLARE
  c text := ' ' || public.texte_sans_accents(p_chemin) || ' ';
BEGIN
  IF btrim(c) = '' THEN RETURN NULL; END IF;
  -- 1. Ce qui n'est pas un objet à ranger (animaux, immobilier, services, vins).
  IF c ~ '(animaux|animalerie|ventes immobilieres|locations saisonnieres|autres services|\mvins?\M|gastronomie)' THEN RETURN 'Autre'; END IF;
  -- 2. Les figurines (avant Multimédia et Livres : « Jouets et jeux >
  --    Figurines, statues > TV, film, jeux vidéo », « … > Héros de BD »),
  --    sauf sous « Collections » ou la décoration (« Collections >
  --    Science-fiction > … > Figurines », « Maison > Décoration > Sculptures,
  --    figurines »).
  IF c ~ 'figurines?' AND c !~ '(\mcollections?\M|decoration)' THEN RETURN 'Jouets'; END IF;
  -- 3. Multimédia : jeux vidéo, consoles, films.
  IF c ~ '(jeux? video|video ?games?|loisir video|\mconsoles?\M|\mdvd\M|blu ?ray|\mcinema\M|\mfilms?\M|multimedia|playstation|nintendo|\mxbox\M)' THEN RETURN 'Multimédia'; END IF;
  -- 4. Livres (avant Jouets : « Jeux, jouets et loisirs > Livres »).
  IF c ~ '(\mlivres?\M|\mbooks?\M|\mbd\M|bandes? dessinees?|\mmangas?\M|\mromans?\M|magazines?|\mrevues?\M|comics|encyclopedi|dictionnaires?|non fiction)' THEN RETURN 'Livres'; END IF;
  -- 5. Jouets.
  IF c ~ '(jouets?|\mtoys?\M|jeux de societe|jeux? de construction|jeux educatifs|jeux d imitation|peluches?|doudous?|poupees?|puzzles?|\mlego\M|playmobil|jeux d eveil|\meveil\M|modelisme|vehicules? miniatures?|action figures)' THEN RETURN 'Jouets'; END IF;
  -- 6. Musique.
  IF c ~ '(instruments? de musique|\mmusique\M|\mmusic\M|vinyles?|\mcd\M|guitares?|\mpianos?\M|partitions?)' THEN RETURN 'Musique'; END IF;
  -- 7. Électroménager (avant Maison : « Maison > Petit électroménager »).
  IF c ~ '(electromenager|small appliances|yaourtieres?|cafetieres?|machines? a cafe|expresso|bouilloires?|grille ?pain|mixeurs?|blenders?|robots? (de )?(cuisine|patissier|menager)|friteuses?|\mfours?\M|micro ?ondes?|aspirateurs?|lave ?(linge|vaisselle)|seche ?linge|refrigerateurs?|congelateurs?|climatis|ventilateurs?|radiateurs?|fers? a repasser|centrales? vapeur)' THEN RETURN 'Électroménager'; END IF;
  -- 8. Beauté (avant Mode : « WOMEN_ROOT > BEAUTY »).
  IF c ~ '(beaute|\mbeauty|hygiene|parfums?|maquillage|makeup|cosmetiques?|skincare|bodycare|bien ?etre|epilation|rasage|coiffure|\mongles\M)' THEN RETURN 'Beauté'; END IF;
  -- 9. Collection (avant Auto-Moto et Maison).
  IF c ~ '(\mcollections?\M|collectionn|antiquites?|\mart du\M|timbres?|monnaies?|\mbillets\M|\mpins\M|objets? publicitaires|briquets|militaria|religion|bistrot|philatelie|numismatique)' THEN RETURN 'Collection'; END IF;
  -- 10. Auto-Moto (« auto-agrippant », « auto-adhésif » ne sont pas des autos).
  IF c ~ '(\mautos?\M(?! ?- ?(agripp|adhesi|collant|bloquant|nettoyant|portant))|automobile|\mmotos?\M|\mvoitures?\M|\mvehicules?\M|\mpneus?\M|\mjantes?\M|scooters?|tuning)' THEN RETURN 'Auto-Moto'; END IF;
  -- 11. Le vêtement et la montre, même « de sport » ou « pièces, outils » :
  --     « Mode > Homme > Vêtements de sport », « Bijoux, montres > Montres,
  --     pièces et accessoires > Pièces, outils et guides ».
  --     Les rayons Opla par genre (« WOMEN_ROOT », « MENS », « CHILDREN_NEW »)
  --     sont des rayons de vêtements (la beauté et les jouets sont pris avant).
  IF c ~ '(vetements?|chaussures?|\mmode\M|sportswear|clothing|footwear|\mshoes\M|\mbijoux\M|\mmontres?\M(?! connect)|women root|\mmens\M|children new)' THEN RETURN 'Mode'; END IF;
  -- 12. Sport.
  IF c ~ '(\msports?\M|fitness|musculation|\mvelos?\M|cyclisme|randonnee|camping|\mski\M|snowboard|natation|plongee|\msurf\M|football|tennis|\mgolf\M|running|equitation|\mpeche\M|athletisme|\myoga\M|trottinettes?|\mroller|\mskate|glisse|plein air|vacances|chasse)' THEN RETURN 'Sport'; END IF;
  -- 13. Jardin.
  IF c ~ '(jardin|\mplantes?\M|terrasse|arrosage|piscines?|barbecue|potager)' THEN RETURN 'Jardin'; END IF;
  -- 14. Bricolage.
  IF c ~ '(bricolage|outillage|\moutils?\M|quincaillerie|electricite|plomberie|materiel d ?atelier|equipements? professionnels?|chantier)' THEN RETURN 'Bricolage'; END IF;
  -- 15. High-Tech.
  IF c ~ '(high ?tech|informatique|ordinateurs?|telephon|smartphones?|tablettes?|image,? son|\mphotos?\M|camescopes?|\maudio\M|objets? connectes|montres? connectees?|electronique|electronics|reseaux|\mtv\M|televiseurs?)' THEN RETURN 'High-Tech'; END IF;
  -- 16. Puériculture : l'équipement de l'enfant se range avec la maison.
  IF c ~ '(puericulture|equipement bebe|mobilier enfant|poussettes?|chaises? hautes?|sieges? auto)' THEN RETURN 'Maison'; END IF;
  -- 17. Maison (avant le reste de Mode : « Maison > Monde de l'enfant »).
  IF c ~ '(\mmaison\M|decoration|\mdeco\M|ameublement|arts? de la table|vaisselle|linge de maison|literie|luminaires?|mobilier|\mmeubles?\M|salle de bain|cuisine|rangement|ceramiques?|\mverre|cristal|barbotines?|entretien|nettoyage|fetes?)' THEN RETURN 'Maison'; END IF;
  -- 18. Mode (le reste : genres, pièces de vêtement, sacs, accessoires).
  IF c ~ '(\msacs?\M|bagagerie|maroquinerie|accessoires|lingerie|pyjamas?|\mfemmes?\M|\mhommes?\M|\mfilles?\M|garcons?|\mbebes?\M|enfants?|\mwomens?|\mmens?\M|children|\mgirls|\mboys|\mhauts?\M|t ?shirts?|\mjeans?\M|\mrobes?\M|\mpulls?\M|manteaux|\mvestes?\M|\mjupes?\M|chemises?|\mtops?\M|baskets?|sneakers?|\mbottes?\M)' THEN RETURN 'Mode'; END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.type_fillsell_depuis_categorie(text, text) IS
  'Catégorie FillSell (Stock) d''un chemin de catégorie de plateforme. NULL = non reconnu (rien n''est deviné d''un titre). 04/10/2026.';
