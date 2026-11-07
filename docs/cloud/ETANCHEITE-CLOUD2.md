# Étanchéité entre clients sur cloud-2 — correctif et mise en service

Rédigé le 07/11/2026 au soir (heure de Paris). Code : `serveur-cloud/src/cloisonnement.js`,
`serveur-cloud/deploiement/pare-feu-navigateurs.sh`, `serveur-cloud/src/docker.js`. **Rien n'est déployé : chaque étape
ci-dessous attend le feu vert nommé de Nico.**

## 1. La faille (relevé de cloud-2, 07/11 17:16, lecture seule)

- Le réseau Docker `fillsell-cloud` (pont `br-fillsell`, 172.31.0.0/24) est créé **sans**
  `com.docker.network.bridge.enable_icc=false` : `docker network inspect` → `{"com.docker.network.bridge.name":"br-fillsell"}` seul.
- Le module `br_netfilter` n'est **pas chargé** (`/proc/sys/net/bridge/` absent) : un paquet d'un conteneur vers un autre
  du même pont est commuté au niveau 2 et ne passe **jamais** par iptables (ni `DOCKER-USER`, ni `FORWARD`). La chaîne
  `FILLSELL-NAV` ne voit que la sortie vers l'extérieur ; sa ligne `-d 172.31.0.0/24 -j RETURN` laissait de toute façon passer.
- Chaque Chrome expose son pilotage DevTools sur `0.0.0.0:9223` (socat → 9222, **sans authentification**,
  `--remote-allow-origins=*`) ; le moteur steel expose de même son API sur 3000.
- Conséquence : un code exécuté dans le conteneur du client A peut ouvrir `http://172.31.0.<B>:9223` et piloter le Chrome
  de B (cookies des plateformes, stockage de l'extension, navigation par l'IP de B).

## 2. Le correctif (la règle, pour tous les serveurs)

Deux couches **indépendantes**, avec une condition commune — le pont **filtré** (br_netfilter chargé,
`net.bridge.bridge-nf-call-iptables = 1`) :

| Couche | Ce qui la pose | Ce qu'elle fait |
|---|---|---|
| Docker | réseau créé avec `enable_icc=false` (orchestrateur `docker.js`, `deployer.sh`, amorce `flotte.js`) | Docker 29 pose `-A DOCKER-FORWARD -i br-fillsell -o br-fillsell -j DROP` (et `-i br-fillsell ! -o br-fillsell -j ACCEPT`), charge lui-même br_netfilter ou refuse de créer le réseau |
| Pare-feu de l'hôte | `pare-feu-navigateurs.sh` | `-A FILLSELL-NAV -o br-fillsell -j DROP` en **première** règle (avant ESTABLISHED et toute sortie permise) ; plus de `-d 172.31.0.0/24 -j RETURN` ; charge br_netfilter, met `bridge-nf-call-iptables` et `-ip6tables` à 1 ; preuve `etat/pare-feu.json` : `"entre_conteneurs":"ferme","pont_filtre":"1"` |

Ce qui ne change pas : l'orchestrateur (réseau de l'hôte) joint toujours chaque conteneur sur 9223 et 3130 — ses paquets
partent de l'hôte (chaîne OUTPUT), jamais par FORWARD, et les réponses rentrent par ESTABLISHED (`FILLSELL-NAV-HOTE`).
La sortie des navigateurs vers les proxys est routée hors du pont (`-o` = la carte réseau) : mêmes règles qu'avant.
Le sous-réseau n'était utile à rien d'autre : aucun service du sous-réseau n'est joint par un conteneur (le relais parle au
proxy amont par son adresse publique ; le DNS de Docker est en 127.0.0.11 dans le conteneur, et le DNS externe reste refusé).

**L'orchestrateur vérifie** (`cloisonnement.js`) :
- au démarrage : verdict au journal (`reseau_cloisonnement`) ; une couche absente = `alertes.signaler` → support@
  (« NON cloisonné » ou « PARTIEL »). Le réseau n'est **jamais** recréé par le code (il faudrait arrêter les navigateurs) ;
- à chaque ouverture à côté d'un autre compte (ouvert ou en train de s'ouvrir) : sans **aucune** couche prouvée, refus.
  Le planificateur n'ouvre alors qu'**un seul compte à la fois** (le plus prioritaire) ; les autres attendent, refusés
  `reseau_non_cloisonne` (aucune ouverture tentée, aucun poste réécrit, une alerte par heure au plus). Un compte **seul**
  — le compte de Nico seul — n'est jamais bloqué.

Écarté : restreindre 9223 / 3130 à la passerelle **dans** le conteneur (socat `range=`). Il ne couvre ni le moteur steel
(3000, image tierce) ni les conteneurs de contrôle d'IP, il exige une image `fillsell-chrome` reconstruite (déploiement
complet : CRX renuméroté, copie de l'extension remplacée, Chrome réinstallé si le cache de construction a été vidé) et il
ajoute une panne possible (passerelle mal lue = orchestrateur refusé = aucun navigateur). Deux couches du noyau suffisent ;
il reste possible plus tard, au prochain déploiement complet, comme troisième couche.

Hors périmètre (décision d'architecture de Nico), **inchangé par ce correctif** : en mode GPU, l'écran X `:0` est monté
dans tous les conteneurs (socket Unix, pas le réseau) — un conteneur peut toujours y lire ou y injecter.

## 3. Mise en service sur cloud-2

`SSH2` = `ssh -i ~/.ssh/fillsell_cloud_ed25519 root@5.9.80.213`. Le navigateur de Nico = `fs-nav-f44b5917-bccc-4431-ba41-f40571a2ed18`.
Le commit doit être sur `main` (feu vert de Nico) et l'arbre propre. Aucune valeur de `/srv/fillsell-cloud/.env` n'est lue
ni affichée dans ces gestes.

### Le test réel (servira trois fois : avant, après l'étape A, après l'étape B)

À lancer sur le serveur (`SSH2 'sh -s' <<'EOF' … EOF`) :

```sh
N=fs-nav-f44b5917-bccc-4431-ba41-f40571a2ed18
IMG=$(docker inspect -f '{{.Config.Image}}' $N)
IPN=$(docker inspect -f '{{(index .NetworkSettings.Networks "fillsell-cloud").IPAddress}}' $N)
# Depuis un conteneur jetable du réseau (= un autre client) :
docker run --rm --network fillsell-cloud --entrypoint curl "$IMG" -s -m 5 -o /dev/null -w '9223 depuis un conteneur : %{http_code}\n' "http://$IPN:9223/json/version"; echo "sortie $?"
docker run --rm --network fillsell-cloud --entrypoint curl "$IMG" -s -m 5 -o /dev/null -w '3130 depuis un conteneur : %{http_code}\n' "http://$IPN:3130/etat"; echo "sortie $?"
# Depuis l'hôte (= l'orchestrateur) :
curl -s -m 5 -o /dev/null -w '9223 depuis l hote : %{http_code}\n' "http://$IPN:9223/json/version"
curl -s -m 5 -o /dev/null -w '3130 depuis l hote : %{http_code}\n' "http://$IPN:3130/etat"
```

- **Avant** (preuve de la faille) : depuis un conteneur → `200` puis `401` (joignables) ; depuis l'hôte → `200`, `401`.
- **Après** : depuis un conteneur → `000` et `sortie 28` (délai : rien ne passe), deux fois ; depuis l'hôte → `200` et `401`
  (le jeton manque : le contrôle est joint et refuse, comme il doit).

### Étape 0 — lectures avant (aucune écriture)

```sh
SSH2 'docker network inspect fillsell-cloud -f "{{json .Options}} {{len .Containers}}"; lsmod | grep -c br_netfilter;
      iptables -S FILLSELL-NAV | sed -n 1,3p; sed -n "s/^VERSION_ORCHESTRATEUR=//p" /srv/fillsell-cloud/deploiement/.env;
      docker ps -a --filter network=fillsell-cloud --format "{{.Names}} | {{.Status}} | essai={{.Label \"fillsell.essai\"}} charge={{.Label \"fillsell.charge\"}}";
      systemctl is-active fillsell-pare-feu.service fillsell-pare-feu-maj.path'
```

Noter la version de l'orchestrateur (retour arrière). Aucun essai en cours (`fs-sante-*`, `fs-charge-*`, étiquettes
`fillsell.essai` / `fillsell.charge`) : sinon, attendre ou l'arrêter avec qui l'a lancé. Lancer le **test réel** (« avant »).
NB : `fillsell-pare-feu.service` est `failed` depuis le 04/11 17:32 (premier démarrage, script pas encore copié) : sans
gravité, l'étape A le relance.

### Étape A — le pare-feu (AUCUNE coupure : la faille est fermée ici)

```sh
SSH2 'mkdir -p /srv/fillsell-cloud/archives && cp -p /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh /srv/fillsell-cloud/archives/pare-feu-navigateurs.sh.avant-etancheite'
scp -i ~/.ssh/fillsell_cloud_ed25519 serveur-cloud/deploiement/pare-feu-navigateurs.sh root@5.9.80.213:/srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh
SSH2 'systemctl restart fillsell-pare-feu.service; systemctl is-active fillsell-pare-feu.service; journalctl -u fillsell-pare-feu.service -n 2 --no-pager | tail -1 | sed -E "s/[0-9.]+:[0-9]+/<ip:port>/g"'
```

La chaîne est remplacée d'un bloc (`iptables-restore`) : aucune connexion en cours coupée, le navigateur de Nico continue.
Vérifications :

```sh
SSH2 'iptables -S FILLSELL-NAV | sed -n 2,3p; iptables -S FILLSELL-NAV | grep -c 172.31.0.0/24;
      cat /proc/sys/net/bridge/bridge-nf-call-iptables /proc/sys/net/bridge/bridge-nf-call-ip6tables;
      grep -o "\"entre_conteneurs\":\"[a-z]*\",\"pont_filtre\":\"[01]\"" /srv/fillsell-cloud/etat/pare-feu.json;
      docker exec deploiement-orchestrateur-1 cat /proc/sys/net/bridge/bridge-nf-call-iptables;
      iptables -L FILLSELL-NAV -v -n -x | grep -m3 "dpt:"'
```

Attendu : `-A FILLSELL-NAV -o br-fillsell -j DROP` puis la ligne ESTABLISHED ; `0` ligne 172.31.0.0/24 ; `1` et `1` ;
`"entre_conteneurs":"ferme","pont_filtre":"1"` ; **`1` lu depuis le conteneur de l'orchestrateur** (c'est ce que lira sa
garde : sans ce `1`, NE PAS passer à l'étape B, dire à Nico) ; les compteurs des lignes des proxys montent si on relit
2 min plus tard (la sortie par les proxys est intacte). Puis le **test réel** (« après ») : conteneur → `000`/`28` ; hôte → `200`/`401`.
Et le journal de l'orchestrateur reste propre : `SSH2 'docker logs --since 10m deploiement-orchestrateur-1 2>&1 | grep -c "\"niveau\":\"erreur\""'` → 0.

Retour arrière A (s'il le faut) : `SSH2 'cp -p /srv/fillsell-cloud/archives/pare-feu-navigateurs.sh.avant-etancheite /srv/fillsell-cloud/deploiement/pare-feu-navigateurs.sh && systemctl restart fillsell-pare-feu.service'`
— la chaîne d'avant revient d'un bloc. br_netfilter reste chargé : sans effet (la chaîne d'avant et Docker laissent passer
comme avant) ; le décharger (`modprobe -r br_netfilter`) seulement si aucun réseau à `enable_icc=false` n'existe.

### Étape B — le réseau recréé cloisonné + l'orchestrateur qui vérifie (une fenêtre)

Coupure du navigateur de Nico : de sa fermeture (fin de la vidange) à sa réouverture, **3 à 5 min** (réseau ~1 min,
construction de l'orchestrateur ~1–2 min, premier tour 5 s après le démarrage, Chrome ~30 s). La vidange laisse d'abord
finir une tâche en cours (10 min au plus) : choisir un moment sans republication en cours.

```sh
# B1. Arrêt propre : vidange, coffres et sessions sauvegardés, conteneurs Chrome supprimés (profils gardés sur le disque).
SSH2 'cd /srv/fillsell-cloud/deploiement && docker compose stop orchestrateur'
# B2. Plus aucun conteneur sur le réseau (les profils sont des montages : rien n'est perdu), puis le réseau recréé.
SSH2 'docker ps -aq --filter network=fillsell-cloud | xargs -r docker rm -f;
      docker network inspect fillsell-cloud -f "{{len .Containers}}";
      docker network rm fillsell-cloud &&
      docker network create --driver bridge --subnet 172.31.0.0/24 -o com.docker.network.bridge.name=br-fillsell -o com.docker.network.bridge.enable_icc=false --label fillsell.cloud=1 fillsell-cloud'
# B3. Vérifier ce que Docker a posé, puis rejouer le pare-feu (preuve de cet état).
SSH2 'docker network inspect fillsell-cloud -f "{{json .Options}}"; lsmod | grep -c br_netfilter;
      iptables -S DOCKER-FORWARD | grep br-fillsell; iptables -S DOCKER-USER | grep br-fillsell;
      iptables -S INPUT | grep br-fillsell; ip6tables -S FORWARD | grep br-fillsell;
      systemctl restart fillsell-pare-feu.service && systemctl is-active fillsell-pare-feu.service'
# B4. L'orchestrateur de ce commit (depuis le PC, dossier du dépôt, main propre) — il démarre sur le réseau neuf.
ORCHESTRATEUR_SEUL=1 bash serveur-cloud/outils/deployer.sh 5.9.80.213 cloud-2.fillsell.app
```

Attendu en B2 : `0` conteneur avant `network rm`. En B3 : `"com.docker.network.bridge.enable_icc":"false"` ; `1` ;
`-A DOCKER-FORWARD -i br-fillsell -o br-fillsell -j DROP` et `-A DOCKER-FORWARD -i br-fillsell ! -o br-fillsell -j ACCEPT` ;
`-A DOCKER-USER -i br-fillsell -j FILLSELL-NAV` toujours là (règle par nom d'interface, survit au pont recréé) ;
`-A INPUT -i br-fillsell -j FILLSELL-NAV-HOTE` ; `-A FORWARD -i br-fillsell -j DROP` (IPv6) ; `active`.

Vérifications après B4 :

```sh
SSH2 'docker logs --since 10m deploiement-orchestrateur-1 2>&1 | grep -E "reseau_cloisonnement|reseau_non_cloisonne|ouverture_refusee|navigateur_ouvert" | tail -5'
curl -s https://cloud-2.fillsell.app/sante
```

Attendu : `reseau_cloisonnement` avec `"ok":true,"complet":true,…,"raisons":[]`, **aucune** ligne `reseau_non_cloisonne`
ni `ouverture_refusee_reseau_non_cloisonne`, `navigateur_ouvert` pour le compte de Nico ; aucun mail « cloisonnement » à
support@. Puis le **test réel** une dernière fois (l'adresse de Nico a pu changer : le script la relit). Enfin une tâche
du compte de Nico passe (sortie par son proxy intacte).

Retour arrière B (dans cet ordre, l'orchestrateur d'avant = la version notée à l'étape 0, image encore présente :
`SSH2 'docker image inspect fillsell-orchestrateur:<version> >/dev/null && echo présente'`) :

```sh
SSH2 'cd /srv/fillsell-cloud/deploiement && docker compose stop orchestrateur;
      docker ps -aq --filter network=fillsell-cloud | xargs -r docker rm -f;
      docker network rm fillsell-cloud &&
      docker network create --driver bridge --subnet 172.31.0.0/24 -o com.docker.network.bridge.name=br-fillsell fillsell-cloud;
      systemctl restart fillsell-pare-feu.service;
      sed -i "s/^VERSION_ORCHESTRATEUR=.*/VERSION_ORCHESTRATEUR=<version>/" .env && docker compose up -d --no-deps orchestrateur'
```

On peut ne défaire qu'une moitié : l'orchestrateur neuf tourne sur l'ancien réseau (la couche du pare-feu suffit : il
alerte « PARTIEL » et sert tous les comptes) ; l'ancien orchestrateur tourne sur le réseau neuf (il ignore la vérification).

## 4. Les autres serveurs

- Serveur neuf (amorce de `flotte.js`, ou premier `deployer.sh`) : le réseau naît `enable_icc=false`, le pare-feu pose le
  DROP et le pont filtré. Rien à faire.
- Serveur existant (cloud-1 s'il sert encore, tout serveur créé avant ce commit) : un déploiement complet rejoue le
  nouveau pare-feu (couche 2, sans coupure) et **dit** `ATTENTION : réseau fillsell-cloud sans enable_icc=false` ; la
  couche 1 suit l'étape B ci-dessus (adresse, domaine et conteneur de Nico à adapter).

## 5. Risques relevés

- br_netfilter est global : tout le trafic commuté de l'hôte (ponts `docker0` et `br-fillsell`, les deux seuls relevés sur
  cloud-2 le 07/11) passe désormais par iptables. C'est le mode ordinaire de Docker dès qu'un réseau a `enable_icc=false` ;
  `docker0` garde son `-i docker0 -j ACCEPT`.
- La garde lit `/proc/sys/net/bridge/bridge-nf-call-iptables` depuis le conteneur de l'orchestrateur (réseau de l'hôte) :
  vérifié à l'étape A avant de déployer la garde. Lu à tort comme absent, il ne coûterait que le « un seul compte à la
  fois » (et l'alerte), jamais une ouverture entre clients.
- Le pilotage 9223 reste sans authentification DANS un conteneur (le client lui-même) ; seuls les voisins sont coupés.
