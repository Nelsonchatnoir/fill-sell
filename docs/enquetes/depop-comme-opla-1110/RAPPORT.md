# Depop branché comme Opla — rapport (11/10/2026 soir)

Mission de Nico : texte intégral dans `docs/enquetes/lot-louis-1110/PASSATION.md` § 4.1 ; audit du code
Opla / Depop (lignes, écarts 1 à 9) : même fichier, § 4.2. Ce rapport dit ce qui a été mesuré en base, corrigé,
servi, et ce qui reste.

## 1. Mesuré en base (11/10, avant tout correctif)

| | Simon BORGET | Jake Wright |
|---|---|---|
| Inscrit | 11/10 14:08 | 10/10 21:52 |
| Extension | 0.6.106 (9d442ae), **Chrome**, vue 17:19 | 0.6.106, **Edge**, vue le 10/10 **22:21** (avant ses jobs) |
| Sessions sondées | `vinted` seulement, aucune clé `depop` | idem |
| Poste (`extension_postes`) | `opla_acces: false`, aucune trace Depop | idem |
| « Où tu vends ? » | `["vinted"]` | `["vinted","ebay"]` |
| Jobs Depop | 4 publications `pending` depuis 14:27 | 2 publications `pending` depuis le 10/10 23:34 |
| Rayon prévu | short → Enfants › Chaussures › Baskets ; sweat → Pulls ; sweat à capuche → Pulls ; lot de t-shirts → Homme › T-shirts (`catalog_vinted`) | baskets → **Femme › Robes › Robes** ×2 (`detection`) |

Aucun job Depop n'avait jamais porté de message d'accès ou de connexion (écart 1 de l'audit, confirmé).

## 2. Ce qui manquait par rapport à Opla, et ce qui est corrigé

| Étape | Opla | Depop avant | Depop maintenant |
|---|---|---|---|
| Trace de la permission par poste | `opla_acces` | aucune | **`depop_acces`** écrit à chaque poll (gpj v238+) — mesuré : 7 postes notés dans la minute, Louis `true` |
| Demande « Autoriser » | handler-watch après 15 min | aucune (file muette) | **handler-watch v99** : 15 min avec un poste sans accès, 1 h sans aucun poste autorisé (filet des anciennes extensions et des postes éteints) ; jamais si un poste du compte a l'accès |
| Levée | gpj à son poll, extension à l'octroi, handler-watch | extension seule (marqueur jamais posé) | gpj (≤ 1 fois / 10 min), extension (0.6.105+, inchangée), handler-watch en filet |
| Message | texte unique | texte prêt, jamais posé | LE texte, à l'octet serveur / extension / app |
| Bouton dans l'app | « Autoriser Opla » (web : panneau de l'extension ; téléphone : l'ordinateur) | aucun | **« Autoriser Depop »**, même pont (AUTORISER_DEPOP, déjà relayé par la 0.6.105) : Stock, suivi, confirmer, « où publier », lot |
| Relevé Depop sur un poste sans accès | laissé au poste autorisé | servi, revenait « absente » | laissé au poste autorisé |
| Connexion | « reconnecte-toi … dans Chrome » | idem | « **connecte-toi à Depop sur ton ordinateur** » (mur-geste, update-job-status v134) |
| Pré-cochage | — | lot : Depop cochée d'office | **jamais pré-cochée** dans le lot (règle de l'unité, que le lot ignorait) |
| Rayon | moteur (mot, candidates, IA, garde-fous) | table icône → rayon seulement | **moteur** : feuilles officielles, libellés corrigés, IA resolve-categorie (v14), garde-fous, question en cas de doute |

Le rayon (`_shared/depop-rayon.js`, app ET serveur) : départements plausibles selon des indices EXPLICITES
(genre, catégorie d'origine, « enfant », « 10 ans », « 140-152 cm », « women »…) ; Enfants jamais proposé sans
indice ; vêtement jamais en chaussures (le mot de l'IA, puis le NOM EN TÊTE du titre — « Short de basket » :
« short ») ; chaussure jamais en vêtement ; genre dit jamais contredit ; un article qui se dit à la fois enfant et
adulte → question. Une publication Depop ne part plus qu'avec un rayon du moteur, choisi ou répondu par la
personne (get-pending-jobs) ; handler-watch recalcule celles d'avant (10 par passage, ancien rayon gardé en
trace `depop_rayon_avant`).

## 3. Les 6 jobs (rien à la main, rien supprimé, rien parti)

État relu à 19:39 (Paris) :

| Job | Compte | Rayon avant → maintenant | État |
|---|---|---|---|
| afc6f4d6 | Jake | Femme › Robes › Robes → **Femme › Chaussures › Baskets** | « Depop attend ton autorisation… » |
| 6002227e | Jake | Femme › Robes › Robes → **Femme › Chaussures › Baskets** | « Depop attend ton autorisation… » |
| c04cd76a | Simon | Homme › Hauts › Pulls → **Homme › Hauts › Sweat-shirts** | « Depop attend ton autorisation… » |
| d088073e | Simon | Homme › Hauts › Pulls → **Homme › Hauts › Sweats à capuche** | « Depop attend ton autorisation… » |
| c30d08eb | Simon | Enfants › Chaussures › Baskets → **Enfants › Bas › Shorts** | « Depop attend ton autorisation… » |
| f441eebf | Simon | Homme › Hauts › T-shirts → question « Rayon Depop » (lot « Enfant XL / S Homme ») | « Choisis le rayon Depop… » |

La première passe (v2, 19:30) avait rangé le lot mixte en Enfants › Lots de vêtements : règle ajoutée (v3),
rejugé à 19:33. La demande « Autoriser Depop » ne s'était pas posée à 19:30 : la requête de handler-watch ne
lisait pas la colonne `platform` (corrigé, v99 ; le selftest le tient, contre-épreuve faite).

## 4. Les catégories fausses du passé (audit complet, lecture seule)

`node scripts/audits/depop-rayons-passes.mjs` : 20 jobs Depop (publication, republication) depuis le 09/10.
**5 rayons faux, tous parmi les 6 jobs en attente, aucun parti chez Depop** (cause : table icône → rayon —
« basket » faisait 👟, « trainers » inconnu donnait la robe par défaut, 🧶 donnait Pulls). Les 3 annonces
publiées sont justes (robe Camaïeu, gants de ski enfant, import « Scotch »). Les 9 « doutes » sont les jobs de
test de Nico (présentoir, rayon choisi à la main — gardé) et un robot aspirateur sans rayon (interdit, annulé).

## 5. Tests

- Selftests : 273/273 avant le chantier, **275/275** après (dont `depop-rayon` 78 et
  `depop-file-jamais-silencieuse` 46, séquentiels).
- Moteur en réel, à blanc (resolve-categorie déployée, rejeu) : 22/23 sur un jeu varié (adulte, enfant,
  chaussures, accessoires, hors mode), dont les 6 jobs ; le 23e (lot mixte) est désormais une question.
- En prod : les 6 jobs traités par la règle (§ 3), sans geste.
- **Parcours réel sur le compte de Nico : PAS FAIT.** Le Chrome piloté n'a aucune session fillsell.app et
  m'y connecter est interdit ; retirer l'autorisation Depop ne se fait que dans la page des extensions de
  Chrome (non pilotable). Pour la preuve : publier depuis le téléphone un article de test à 999 € vers Depop
  (le serveur recalcule le rayon et le sert au poste de Nico, autorisé), puis le retirer depuis l'app.

## 6. Servi / à téléverser / ouvert

- Fonctions : resolve-categorie **v14**, get-pending-jobs **v239** (`verify_jwt` true), update-job-status
  **v134**, handler-watch **v99** (`false`) — `verify_jwt` lu avant et après chaque déploiement.
  handler-watch embarque aussi deux modules partagés modifiés le 11/10 (boutique Vinted, point 5), déjà
  servis par get-pending-jobs v237.
- OTA **2.9.85** (build `2026-10-11T17:44:00Z+9ffb9ef`).
- Extension : **rien de nouveau** (le message d'attente est réécrit par le serveur ; le relais AUTORISER_DEPOP
  et la relance à l'octroi existent depuis la 0.6.105). Reste à téléverser le zip de la mission précédente :
  `C:\Users\nicol\fill-and-sell\build\CWS-0.6.110-A-TELEVERSER\fillsell-extension-0.6.110-a3c5aef-cws.zip`.
- Ouvert :
  1. le popup de l'extension n'envoie pas ses capacités : son compteur « Depop en attente » reste vide (écart 6,
     cosmétique ; une prochaine extension) ;
  2. la sonde de session Depop ne peut pas tourner sans la permission (Chrome refuse de lire les cookies
     depop.com) : c'est la trace `depop_acces` qui la remplace pour « autoriser » ;
  3. preuve réelle de la levée « Autoriser Depop » : à faire au premier octroi réel (Simon, Jake) ou par le
     parcours ci-dessus ;
  4. Jake est sur Edge et son extension n'a plus été vue depuis le 10/10 22:21 : ses jobs attendent son retour.
