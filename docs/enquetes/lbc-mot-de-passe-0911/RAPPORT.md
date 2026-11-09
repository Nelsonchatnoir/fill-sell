# « Me reconnecter » Leboncoin : « mot de passe incorrect » dans notre onglet seulement (09/11/2026, soir)

Cas : Guillaume JEHLY (gjehly@gmail.com, Business, Brave, extension 0.6.184). Le bon mot de passe est refusé dans l'onglet
ouvert par « Me reconnecter », accepté dans un autre onglet, un autre navigateur et sur son téléphone. Lecture seule sur
ses données : aucun job, aucun réglage, aucun mail touché.

## 1. Comment l'onglet s'ouvre, ce que l'extension fait sur auth.leboncoin.fr
- Sur le WEB (son cas : aucune demande `kind='connexion'` en file le 09/11), « Me connecter / Me reconnecter » est un
  simple lien `<a href={lienWeb(…)} target="_blank" rel="noopener noreferrer">` (`src/components/BoutonMeConnecter.jsx`)
  vers `PLATFORM_LOGIN_URLS.leboncoin` = `https://auth.leboncoin.fr/login`, **sans aucun paramètre**. Nouvel onglet
  normal, pas l'onglet de travail. Même adresse pour « Se connecter à Leboncoin » d'une tâche échouée (`StockTab.jsx`).
- Téléphone (file `connexion`) et popup de l'extension : `https://www.leboncoin.fr/` (accueil du site).
- Extension sur auth.leboncoin.fr : `consentement.js` + `leboncoin.js` y sont injectés (motif `*.leboncoin.fr`), mais ne
  font rien au chargement d'une page de connexion (lecture de `luat` 5 s après, sans effet ici). Aucune règle
  declarativeNetRequest (pas la permission), aucune écriture de cookie Leboncoin, aucune interception de formulaire ni
  d'en-tête. Ce n'est pas l'extension.

## 2. Cause prouvée
- Code de la page de connexion de Leboncoin (chunks `_next` publics, lus le 09/11) : le formulaire appelle
  `POST /api/authenticator/v2/users/login` avec `{ redirect_uri, client_id, from_to, email, password }`, où `client_id`,
  `redirect_uri`, `from_to` sont **lus dans l'adresse de la page** (`t.client_id`, `t.redirect_uri`, `t.from_to`), sans
  valeur par défaut.
- Notre lien : `__NEXT_DATA__.query` = `{}` (vérifié dans la page) → la demande part SANS client ni adresse de retour.
- Leboncoin traduit une réponse 401 en erreur `wrong_code`, affichée sous le champ mot de passe avec la clé
  `login.unknown-account.error` = « **Votre mot de passe est incorrect.** ».
- Le parcours normal (relevé le 09/11 dans un Chrome neuf, sans session) : `www.leboncoin.fr/compte/part/mes-annonces` →
  `auth.leboncoin.fr/login?client_id=lbc-front-web&redirect_uri=…/api/authorizer/v2/authorize&from_to=…&error=…`. C'est
  ce contexte qui manque dans notre onglet, et seulement là : même navigateur, mêmes cookies, mêmes scripts dans
  « l'autre onglet » (passé par leboncoin.fr → « Se connecter »).
- Limite : la réponse 401 elle-même n'a pas été observée (aucun mot de passe saisi par nous, règle absolue).

## 3. Correctif (règle, tous les comptes) — web au push, rien côté extension
- `PLATFORM_LOGIN_URLS.leboncoin` = `https://www.leboncoin.fr/compte/part/mes-annonces` : déconnecté, Leboncoin construit
  lui-même sa page de connexion avec son contexte puis revient sur « Mes annonces » ; connecté, la page s'ouvre.
- Règle : un lien de connexion ouvre une page du SITE de la plateforme, jamais l'hôte d'authentification d'un échange
  OAuth en lien nu ; on ne fabrique jamais nous-mêmes client_id / state / PKCE.
- Selftest `liens-connexion` (14) : rouge sur l'ancienne adresse.
- Téléphone : le lien de la carte d'une tâche échouée part avec la prochaine OTA (feu vert de Nico).

## 4. « Sa session tombe par moments » — ce sont ses POSTES, pas une session qui tombe
- `profiles.extension_postes` : 3 postes vivants le 09/11 (UTC) — Chrome sur le PC à puce Qualcomm (mur Leboncoin 13:20,
  réussite Leboncoin 17:11), Brave sur ce même PC (réussite 11:03, mur 16:28), Brave sur le PC Intel (vivant depuis
  16:49, mur 18:22) ; 2 autres morts depuis le matin. Leboncoin est connecté dans certains navigateurs et pas dans
  d'autres, à des heures différentes.
- Les TÂCHES évitent déjà un poste qui a vu le mur (`get-pending-jobs`, « UN POSTE QUI VIENT DE VOIR LE MUR… »,
  `murDuPosteTient`). Les RELEVÉS (`kind='annonces'`) non : ils partent au premier poste qui interroge le serveur
  (`get-pending-jobs`, « Relevés multiplateforme »). Un relevé pris par un navigateur sans session Leboncoin conclut
  « page de connexion », l'app affiche « Me reconnecter », alors qu'un autre navigateur publie (17:42, 18:11 Paris).
  La série de 16:47 à 16:57 Paris (relevés `verif_redepot` toutes les ~100 s, tous « page de connexion », puis un relevé
  réussi à 16:59) va dans ce sens.
- Nos onglets de travail ne déconnectent pas Leboncoin : aucune écriture de cookie Leboncoin, aucune page de
  déconnexion visitée. Ce qui change d'un relevé à l'autre, c'est le poste qui le prend.
- FAIT sur décision de Nico (09/11 soir) : les relevés suivent le mur du poste comme les tâches (get-pending-jobs), le
  relevé servi est noté sur le poste (`releve_<pf>`) et pose son mur s'il tombe sur la page de connexion ; l'app tait ce
  relevé quand un autre poste vivant du compte est connecté. Règle : `_shared/poste-connecte.js`, selftest `poste-connecte`.
