# Vinted « Dans quel pays vis-tu ? » dans le « Me connecter » du Cloud — 09/11/2026 soir

Cliente : Deborah Seghir (`f0acd3af-2571-4a7e-a3db-100ee3f7c867`), Pro, iPhone, essai Apple lancé à 19:27.
Serveur : cloud-2 ; IP du compte : n° 1, 94.194.94.233 (IPRoyal, `pays = FR` en base, attribuée 19:27:49).

## 1. Ce qui s'est passé (journal de l'orchestrateur, heure de Paris)

| Essai | Ouvert → fermé | Ce que dit le journal |
|---|---|---|
| 1 | 19:27:57 → 19:28:46 (52 s) | rien de refusé ; fermé par la cliente |
| 2 | 19:28:48 → 19:29:20 | **19:29:09 : toucher → `www.vinted.dk/member/register/select_type` refusé** ; 19:29:13 « Refuser les cookies » |
| 3 | 19:29:31 → 19:29:56 | **19:29:40 : même refus vers vinted.dk** ; 19:29:51 « Refuser les cookies » |
| 4 | 19:30:04 → 19:30:15 (11 s) | fermé par la cliente |
| 5 | 19:32:16 → 19:36:14 | « Continuer avec Google » → **Vinted connecté 19:36:11** |

Puis Leboncoin 19:39:15, Beebs 19:39:38 (Google), Depop 19:40:03 : **les 4 plateformes connectées à 19:40**.
Aucune image n'est gardée (`ENREGISTREMENT_CONNEXIONS=0`) : ce qu'elle voyait est reconstitué ci-dessous.

## 2. Ce qu'elle voyait : la question du pays de Vinted

- Le code de Vinted (09/11) contient une fenêtre `domain-select-modal` : « **Dans quel pays vis-tu ?** », la liste des
  pays dans leur langue (at, au, be, cz, de, **dk « Danmark »**, ee, es…, France plus bas, à faire défiler). Un pays
  touché mène à son domaine **au même chemin** (`lien + chemin courant`) — exactement l'adresse refusée deux fois.
  Choisir France ou fermer la fenêtre pose le témoin `domain_selected=true` (20 ans).
- La fenêtre est décidée **côté serveur de Vinted, selon l'IP** : la page servie à une IP française (PC de Nico) n'a
  pas de liste ; la même page servie à une IP hors de France (hôte de cloud-2, Allemagne, jamais utilisée par un
  compte) porte `domainLinks` ; avec le témoin `domain_selected=true`, plus de liste (mesuré le 09/11).
- Donc **Vinted ne place pas l'IP 94.194.94.233 en France**, alors que la plupart des bases la disent à Paris
  (ipinfo, MaxMind/GeoJS, db-ip, ip2location, RIPE `country=FR`) ; iplocation.net la dit au Royaume-Uni (« SKY UK
  Limited » : bloc loué par IPXO). Vinted passe par Fastly (en-têtes `varnish`, `cache-par`).
- Aucune autre trace de refus vers un autre pays depuis le démarrage de l'orchestrateur (08/11 22:55) : elle seule.

## 3. Pourquoi ça n'aboutissait pas (chez nous)

1. Notre filtre refuse à raison tout autre pays que Vinted France ; mais le message était le générique « Cette page ne
   fait pas partie de la connexion à Vinted » et la page rechargée **reposait la même question** : la cliente retombait
   dans la liste, sans savoir qu'il fallait faire défiler jusqu'à France.
2. Rien ne répondait à cette question à sa place, alors que FillSell Cloud n'a qu'une réponse possible : France.

## 4. Le correctif (règle, pour tous les comptes) — `serveur-cloud/src/plateformes.js`, `connexion.js`

- `DEFINITIONS.vinted.choixPays` + `cookiesChoixPays()` : la réponse « France » (témoin `domain_selected=true` de l'hôte
  www.vinted.fr, 20 ans, celui que la page pose elle-même) est posée par `Storage.setCookies` **avant chaque page de
  connexion** : ouverture, retour après un refus, nouvel essai propre (la purge d'un essai sans connexion l'efface).
  Un échec de pose ne bloque rien (`choix_pays_echec` au journal).
- `autrePaysDe()` : un lien vers la même plateforme dans un autre pays (vinted.dk, vinted.co.uk, vinted.com…) reste
  **refusé**, mais la personne lit « FillSell Cloud se connecte à Vinted France : tu restes sur Vinted France. Continue
  ta connexion ici. » et l'alerte à support@ dit « autre pays : vinted.dk — Vinted ne voit sans doute pas l'IP du
  compte en France ». Leboncoin, Beebs, Depop : aucun changement.
- Tests : `orchestrateur.test.mjs` (règle pure) et `simulation.test.mjs` (« Me connecter » Vinted : témoin posé avant
  la page et avant le retour ; vinted.dk refusé avec le bon message ; Leboncoin sans témoin).

## 5. À décider par Nico

- **L'IP n° 1 (94.194.94.233) n'est pas vue en France par Vinted.** Le correctif efface la question, pas la cause :
  Vinted voit toujours un accès « hors de France » sur ce compte. Remplacer l'IP = achat (accord écrit de Nico).
- Proposition : ajouter au contrôle d'entrée d'une IP la lecture de `www.vinted.fr` SANS le témoin — une page qui porte
  `domainLinks` = IP non vue en France par Vinted → l'IP ne sert pas (règle à valider avant d'être codée).

## 6. Déploiement (09/11, feu vert de Nico)

- Poussé c90e1e3..d9ee076 (a2a9246 = ce correctif). Orchestrateur de cloud-2 : **065871458a15 → d9ee076698ac** à
  20:55:44-20:56:05 (`ORCHESTRATEUR_SEUL=1`, image Chrome 61fb7ddd6e2a et extension Cloud CRX 7ab2163c1521 inchangées),
  lancé une fois Deborah au repos (20:55:01 : aucun « Me connecter », aucune tâche, aucun relevé).
- Vérifié après : son poste rouvert à 20:56:16 avec ses 4 sessions reprises du profil, session FillSell gardée, coffre
  `connecte = true` pour Vinted, Leboncoin, Beebs, Depop (20:56:17), IP n° 1 inchangée, aucune purge ni alerte.
