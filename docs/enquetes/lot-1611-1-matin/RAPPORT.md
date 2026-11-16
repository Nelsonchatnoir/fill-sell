# Lot du 16/11/2026 matin — rouges ouverts réparés à la racine + diagnostic Stripe

Ordre de Nico du 16/11 (matin). Heure de Paris. Diagnostics des points 3, 4, 5 et 6 faits par quatre agents en lecture
seule (rapports complets, requêtes et sorties dans `.tmp-terminal/p3` à `p6`, vidé en fin de bloc) ; points 1 et 2 et
tous les correctifs faits ici. Aucun mail, rien chez Stripe, rien chez Meta, aucune migration.

## 1. lizzaa (d5531b8e, Premium) — 8 annonces eBay bloquées sur 57

**1.1 Cause.** Lot eBay du 15/11 23:07, voie extension. L'IA des aspects (`ebay_aspects_ia`) n'a JAMAIS été appelée pour
les 7 articles bloqués (37 traces, aucune pour eux) : la catégorie partie au clic (259119 « Verres et mugs », 16191
« Cartouches d'encre », 3937 « Montres à gousset ») n'était pas celle que l'écran avait préparée. Au clic, la règle du
14/11 (A3, « jamais un clic mort ») les a « laissés au dépôt » — trace `champ_requis_bloquant` issue `laisse_au_depot`,
23:08:11 → 23:08:59 — en comptant sur le serveur (voie API) ou la garde de l'extension. Or par l'EXTENSION, personne ne
déduisait rien : la garde d'ebay.js pose la question. Les valeurs étaient pourtant dans le titre (« Verre à shot »,
« Transparent » ; listes eBay relues : 82 « Type », 16 « Couleur », FREE_TEXT).
« Département » est bien l'aspect eBay *Department* (Homme, Femme, Garçon, Fille, Adolescents, Adulte unisexe, Enfant
unisexe — liste de 3937) : il vient du genre de la fiche quand il est connu (ici vide), sinon de l'IA si le texte le dit.
Constat annexe (non corrigé, à décider) : le mot « verre » ne fait jamais entrer « Maison › Cuisine, arts de la table ›
Verrerie » (20696) dans les candidates (« verrerie » n'est pas le jeton « verre ») ; l'IA a choisi « Livres, BD ›
Produits dérivés › Verres et mugs » parmi des candidates toutes fausses.

**1.2 Correctif (règle, tous les comptes).** `_shared/ebay-aspects-depot.ts` + update-job-status : quand la garde de
l'extension signale des aspects obligatoires vides (needs_user, cible `ebayAspects`), le serveur applique LA règle de la
voie API (`remplirAspects` : champs du job, genre → Département, texte de la personne, IA sous la liste eBay ; jamais une
valeur inventée). Tout trouvé → le job repart seul (pending, erreur effacée) ; il en reste → la question ne porte que sur
eux (message `messageAspectsRestants`). Une fois par job ET par rayon (`platform_fields.ebay_aspects_depot`), jamais
par-dessus une valeur du job, jamais la Marque (sa règle « sans marque » passe avant).
Verrou : `selftest:ebay-aspects-depot` (25 contrôles ; ROUGE sur 33147cb : 6 échecs, module absent).

**1.3 « Montant de refus automatique ».** Un seul refus de ce type en 90 jours sur tout le parc (~17 000 dépôts eBay par
l'extension en 30 jours) : « Assiette vintage (1960-70) » à 1,20 € (1,50 € est passé dans le même lot). La voie clic ne
touche jamais aux offres : le brouillon hérite des préférences d'offres du COMPTE eBay (refus automatique sous un seuil),
qu'eBay n'a pas pu appliquer à ce prix. Corrigé : le refus est classé dès le premier essai (`ebay-brouillon-refus.js`
classe « offres », pas-de-rouge `ebay_offres_compte`) avec le message vrai, au lieu de cinq essais identiques puis
« n'a pas abouti ». **Non fait** : désactiver le refus automatique DANS le brouillon — la forme du champ (DOM et PUT du
brouillon) n'a jamais été relevée, et on ne la devine pas ; il faut un relevé sur un brouillon du compte de Nico (offres
activées), puis une extension 0.6.192. Verrou : `selftest:ebay-aspects-depot` § 9.

**1.4 Déblocage.** `scripts/reparations/20261116_lizzaa_aspects_ebay_relance.sql` (+ `_INVERSE`, sauvegarde
`_backup_1611_lizzaa_aspects_ebay`) : les 7 jobs relancés comme le bouton « Relancer » ; au passage suivant, le serveur
déduit ce qui manque. L'assiette reçoit le message vrai (elle reste à lizzaa : réglage de son compte eBay ou prix).

## 2. gjehly (Business) — jeux vidéo : « Âge » Beebs, « Plateforme » Vinted, « Modèle » eBay

Le 15/11 22:46-22:48, lot de 63 articles (57 prêts, 6 abandonnés). Questions affichées (usage_logs) : « Âge » Beebs ×3
(Mortal Kombat PS3, Battle Stadium D.O.N GameCube, Super Battletank Game Gear), « Plateforme » Vinted ×1 (Battletank),
« Modèle » eBay ×1 (« D PlayStation PS1 », rayon 139971 « Consoles »).

**Ce qui était connu et pas lu.** Ces jeux viennent de son eBay : `annonces_plateforme.donnees_index.caracteristiques`
porte « Classification » (Mortal Kombat « M (Mature 17+) », Battletank « ESRB E (Everyone) », Battle Stadium « CERO A »,
Ni no Kuni « PEGI 12 ») et « Plateforme ». Jamais lu. Pire : Vinted recevait « Non précisé » (valeur probable, « faute de
mieux ») et le clic Publier le rangeait sur la fiche comme une réponse « manuel » — il cachait ensuite tout classement.

**2.1** Valeurs exactes de Beebs relues (`platform_category_aspects`, « Multimédia › Jeux vidéo ») : les 10 tranches
d'âge d'enfant de `BEEBS_AGES` (0-6 mois … 16 ans et +) — la table PEGI/USK/ESRB → tranche (règle D1 du 26/10) est la
bonne. Correctif : le classement écrit sur l'annonce d'origine (systèmes NOMMÉS seulement : PEGI, USK, lettres ESRB avec
leur libellé) devient une source ; une valeur neutre (« Non précisé », « RP ») ne passe plus devant un classement connu
(`classementInformatif`) et n'est plus rangée sur la fiche. Mortal Kombat → Vinted « M – 17 ans et plus », Beebs
« 16 ans et + », plus de question. Battletank (« E – Tous publics ») et Battle Stadium (CERO A) : l'« Âge » Beebs reste une
question — règle D1 de Nico (« E – Tous publics » : aucun âge minimum). À décider si « Tous publics » doit valoir une
tranche.
**2.2** « D PlayStation PS1 » : titre « nu » (le jeu s'appelle « D ») → famille console. Désormais une description qui
DÉCLARE un jeu (« Type de produit : Jeu vidéo », « je vends le jeu… », jamais une console déclarée) en fait un jeu :
eBay « Jeux » (Plateforme « Sony PlayStation 1 » posée), plus de « Modèle ». Mesuré sur le parc (95 fiches candidates) :
1 seule bascule, celle-là. Game Gear et Master System ajoutées (eBay « Sega Game Gear » / « Sega Master System », Beebs
Retrogaming) ; Vinted n'a pas ces machines dans sa liste : la question « Plateforme » de Battletank reste légitime.
**2.3 Vérifié : FAUX jusqu'ici.** Retenus sur l'article : taille, couleur, matière, marque, classement d'un jeu, format de
colis Vinted. PAS les champs d'une plateforme (« Âge » Beebs, « Plateforme » d'un jeu, « Modèle » eBay…). Désormais
(`publication/moteur/reponsesArticle.js`) : un choix dans la liste, parti tel quel, se range sur la fiche
(`attributs.reponses_plateformes`, « manuel ») et la publication suivante le reprend (s'il est encore dans la liste du
rayon), avant toute valeur probable.
**2.4** Aucun job de gjehly n'est bloqué : les articles aux questions abandonnées n'ont jamais été envoyés. À sa prochaine
publication : Mortal Kombat part sans question, « D » part en Jeux ; Battletank (Plateforme Vinted, Âge Beebs) et Battle
Stadium (Âge Beebs) gardent leur question, à raison.
Verrou : `selftest:jeux-video-origine-reponses` (56 contrôles ; ROUGE sur 33147cb : 22 échecs). Web + OTA.

## 3. carhoa — Vinted, dimensions du colis (« Après-ski Decathlon noir taille 38 »)

**3.1 Cause amont.** « Après-ski » prenait la règle 🎿 (« ski ») → Vinted « Sport › … › Skis alpins » (4733). Dans ce
rayon, Vinted refuse tout format standard (« Ces dimensions sont supérieures aux limites maximales autorisées ») et exige
`parcel_dimensions_height / width / length`. Prouvé par le 400 du job 7dd1a5de ; même mur chez ayadi007 (4031 « Chariots
à outils »). Forme exacte de l'envoi des dimensions (unité, limites, format « Personnalisé ») : NON relevée.
**3.2** Correctif amont : un « après-ski » (hors vêtement : manteau, combinaison…) est une botte 👢 (17 fiches du parc
relues, aucune bascule à tort). Envoyer les dimensions : **non fait** — il faut un relevé réel (compte de Nico, annonce à
999 €, rayon 4733 ou 4031) puis une extension (armement + sonde) ; la saisie (3 nombres en cm, rangés sur la fiche)
existe pour eBay (`champsDimension.js`) et s'ouvrirait à Vinted. Décision de Nico ouverte depuis le 07/11.
**3.3** Le refus n'est plus jamais « aléa de Vinted » ni repris en boucle : `refusDimensionsColisVinted` (vinted-colis.js),
pas-de-rouge `vinted_dimensions_colis` → la personne, message vrai (rayon nommé, « choisis un autre rayon ou publie-le
toi-même »), dès le premier refus. **3.4** Autres comptes : ayadi007 43b69049 (annulé 06/11) et 9c7d4951 (question
« Format du colis » sans réponse possible depuis le 12/11) → handler-watch (questions-tranchees 10 bis) remplace cette
question par le message vrai dans les rayons où le refus est prouvé. carhoa a republié elle-même (ff5f2925, publiée).
Verrou : `selftest:vinted-colis-dimensions` (25 contrôles ; ROUGE sur 33147cb : 18 échecs).

## 4. Republications Leboncoin jamais reprises

**Cause (Duck Tales de yoann.besak 28bce155, caisse à vin d'ornellaracano f2bd4ee7).** get-pending-jobs les retenait à
chaque appel (« en attente … du rapatriement de ses photos », toutes les 2 min) : leurs fiches (vinted_sync) ont 3
photos sur `images1.vinted.net`, la copie 2 photos chez nous ; `contenuAImposer` demandait le rapatriement, que
handler-watch ne fait JAMAIS pour Vinted (décision de Nico du 06/09). Attente sans fin, sans un mot. Cadence hors de cause.
**Correctif.** Un seul test d'hôte partagé (`_shared/hotes-photos.js`, lu par photos-rapatriement.ts, contenu-fiche.js,
capture-corrigee.js) : on n'attend que ce que le serveur sait rapatrier, et 24 h au plus (photo morte) ; la retenue se dit
sur la tâche (marque `attente_photos_fiche` + message) et s'efface. Rejeu sur les deux tâches : elles partent avec leurs
photos (état ramené à celui de la fiche, règle du 22/10). Aucun autre compte touché (183 tâches pending > 48 h rejouées).
**joshua.sapone (table toscane, 0a1cac7c) : autre cause** — le pré-vol Leboncoin échoue toutes les ~33 min en Immobilier
(« Catégorie : ni suggestion ni sélecteur manuel trouvés », extension 0.6.186) ; la 0.6.191 (à téléverser) attend ce bloc
20 s ; à relire après sa mise à jour. Doute pour Nico : f2bd4ee7 (« Caisse à vin Château Lagrange ») est rattachée à une
fiche Vinted « Caisse de rangement en bois vintage » (rattachement automatique du 23/09).
Verrou : `selftest:photos-attente-rapatriable` (28 contrôles ; ROUGE sur 33147cb : 15 échecs).

## 5. 2f7275hb8p — Leboncoin, champ photo introuvable

**Ponctuel**, pas un parcours cassé : 10 dépôts sur ~9 400 en 30 jours (8 comptes), tous repartis au premier nouvel essai ;
le bloc photos de la page de dépôt ne s'était pas peint à temps dans l'onglet de travail caché (minuteries ralenties par
Chrome). Le défaut était le MESSAGE (« On ne sait pas encore pourquoi »). Corrigé côté serveur (pas-de-rouge,
`lbc_photos_non_affichees`) : même cadence (3 reprises, 15 min), message vrai, puis « relancer » avec sa phrase.
Durcissement de l'extension (attendre 20 s, rendre la fenêtre visible, joindre la photographie de la page) : non fait,
facultatif, demanderait une 0.6.192. Verrou : `selftest:lbc-photos-non-affichees` (16 contrôles ; ROUGE : 7 échecs).

## 6. Diagnostic seul — abandons de l'essai Cloud à la page Stripe

Rapport complet : `annexe-p6-stripe-essai-cloud.md` (agent en lecture seule). Aucun changement. Annexes des points 3, 4, 5 :
`annexe-p3-vinted-dimensions.md`, `annexe-p4-lbc-file.md`, `annexe-p5-lbc-photo.md` (leurs renvois à `.tmp-terminal/` sont caducs :
le dossier est vidé en fin de bloc).
