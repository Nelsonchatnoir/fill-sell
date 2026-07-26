# OBSERVATORY.md — Système de maintenance des intégrations plateformes

> **Statut :** spec v1 — 24/07/2026
> **Emplacement cible dans le repo :** racine, à côté de `STATUS.md` et `CLAUDE.md`
> **Périmètre :** Vinted, Leboncoin, eBay, Beebs
> **Responsable des décisions :** Nico. Fable implémente.

---

## 0. En une phrase

Un système qui détecte, diagnostique et prépare la correction des cassures d'intégration plateforme **avant que les utilisateurs ne les remontent**, en séparant strictement la détection (déterministe, sans IA) du diagnostic (IA, sous contrainte) et de l'application du correctif (humain sur les chemins destructifs).

---

## 0.5 Vue d'ensemble — comment ça marche

```
        ┌─────────────────────────────────────────────────────┐
   ┌───►│  ①  LE REGISTRE                                     │◄───┐
   │    │  selectors/<plateforme>.registry.js                 │    │
   │    │  La liste de tous les boutons et champs de chaque    │    │
   │    │  plateforme, chacun avec 2-3 façons de le retrouver. │    │
   │    │  Fichier de données. Aucune logique. Le centre.      │    │
   │    └──────────┬──────────────────────────┬───────────────┘    │
   │           lu par                      lu par                  │
   │               ▼                          ▼                    │
   │  ┌──────────────────────────┐  ┌──────────────────────────┐   │
   │  │ ② EXTENSION · 435 users  │  │ ③ OBSERVATOIRE · ton PC  │   │
   │  │                          │  │                          │   │
   │  │ Publie normalement.      │  │ Ouvre les 4 plateformes. │   │
   │  │ Pour chaque bouton :     │  │ Pose ~60 questions :     │   │
   │  │  1re façon → ✓ ok        │  │  « bouton Publier ? »    │   │
   │  │  2e façon  → ⚠ logué     │  │  « prix encore requis ? »│   │
   │  │  aucune    → ✖ logué     │  │  « delete répond 200 ? » │   │
   │  │                          │  │ Archive DOM + captures.  │   │
   │  │ CAPTEUR                  │  │ DIAGNOSTIC               │   │
   │  │ rapide · toutes cohortes │  │ lent · précis            │   │
   │  └───────────┬──────────────┘  └────────────▲─────────────┘   │
   │              │                              │                 │
   │              │  3 users distincts passent   │ déclenche une   │
   │              │  en 2e façon en < 1 h ───────┘ passe ciblée    │
   │              ▼                                (~5 min)        │
   │        ⚠  QUELQUE CHOSE A CHANGÉ                              │
   │              │                                                │
   │              ▼                                                │
   │  ┌───────────────────────────────────────────────────────┐    │
   │  │ ④ AGENT — s'allume UNIQUEMENT sur échec               │    │
   │  │    Compare le DOM d'hier et d'aujourd'hui, sur la      │    │
   │  │    zone concernée seulement.                          │    │
   │  │    Rend : « le bouton s'appelle maintenant X »         │    │
   │  │           + capture avant/après + niveau de confiance. │    │
   │  │    N'a le droit d'écrire QUE dans le registre.         │    │
   │  └───────────────────────┬───────────────────────────────┘    │
   │                          ▼                                    │
   │  ┌───────────────────────────────────────────────────────┐    │
   │  │ ⑤ QUI VALIDE ?                                        │    │
   │  │   🟢 lecture seule     → merge auto, tu ne vois rien  │    │
   │  │   🟠 remplissage       → tu approuves par lot, 30 s   │    │
   │  │   🔴 SUPPRESSION,      → PR + preuve visuelle.        │    │
   │  │      publication         Tu testes à la main.         │    │
   │  │                          Jamais automatique.          │    │
   │  └───────────────────────┬───────────────────────────────┘    │
   │                          │                                    │
   └──────────────────────────┴────────────────────────────────────┘
              le registre corrigé profite immédiatement
              aux 435 utilisateurs ET à l'observatoire
```

**Une journée type :**

1. `03h47` — l'observatoire tourne sur ton PC. 61 assertions. 60 vertes.
2. `03h52` — `vinted.publish.condition` échoue. L'archive DOM de la veille est comparée à celle du jour, sur ce seul bloc.
3. `03h55` — l'agent identifie le nœud, propose un maillon supplémentaire dans le registre, joint deux captures. Confiance 0.86, classe 🟠.
4. `04h00` — PR ouverte, tests e2e verts.
5. `08h30` — tu lis le rapport en 20 s : `1 PR en attente d'approbation par lot`. Tu regardes les deux captures, tu approuves.
6. Les 435 utilisateurs publient sans jamais avoir su qu'il y avait eu un problème.

Si l'étape 2 avait concerné `delete.confirm` (🔴), l'agent aurait fait exactement le même travail — mais la PR t'aurait attendu, et tu aurais testé une suppression à la main avant de merger.

---



## 1. Problème résolu

Le coût marginal dominant de FillSell n'est pas le développement de fonctionnalités. C'est la **maintenance d'intégrations sur 4 plateformes hostiles qui changent sans préavis**.

Historique documenté (juillet 2026) :

| Incident | Classe | Détecté par |
|---|---|---|
| LBC retournait un faux `published` (succès inconditionnel après sleep) | Signal de confirmation absent | Nico, manuellement |
| eBay clic avalé silencieusement | Interaction DOM non confirmée | Nico, manuellement |
| Vinted suppression par clic DOM instable → bascule sur API interne | Sélecteur fragile | Nico, manuellement |
| `listing_url` cross-contamination (13/07 **puis** 19/07) | Régression non couverte | Nico, deux fois |
| eBay Département jamais dérivé quand dropdown vide | Champ non observé | Nico, manuellement |
| Vinted titre : emoji ⌚ U+231A non couvert | Validation plateforme | Nico, manuellement |

**Constat :** 100 % des cassures sont détectées par un humain, souvent après impact utilisateur. C'est ce que ce système supprime.

---

## 2. Ce que ce système N'EST PAS

Anti-scope-creep. À relire à chaque fois qu'une idée s'ajoute.

- ❌ **Ce n'est pas un diff de DOM.** Un diff de DOM brut produit des milliers de différences sans signal (classes hashées par le build, A/B tests, personnalisation, ordre d'attributs). Le DOM est archivé, jamais utilisé comme mécanisme d'alerte.
- ❌ **Ce n'est pas un « agent développeur ».** Aucun agent n'écrit de logique métier. Un agent ne peut modifier que des fichiers de données déclaratifs.
- ❌ **Ce n'est pas un remplacement de la télémétrie prod.** C'est son complément diagnostique.
- ❌ **Ce n'est pas un système d'auto-merge.** Sur les chemins destructifs, l'humain valide. Toujours.
- ❌ **Ce n'est pas un produit.** C'est de l'outillage interne. Pas d'UI léchée, pas de généralisation prématurée.

---

## 3. Décisions d'architecture (ADR)

Chaque décision est figée. Toute remise en cause doit être argumentée contre le rationnel écrit ici.

### ADR-01 — Assertions de capacité, pas snapshots structurels

**Décision :** l'alerte repose sur ~15 assertions booléennes par plateforme (« puis-je encore faire X ? »), pas sur la comparaison de structure.

**Rationnel :** rapport signal/bruit. 60 booléens lisibles en un écran vs. des milliers de diffs sans signal. Un rapport qu'on ne lit pas est un rapport qui n'existe pas.

**Conséquence :** le snapshot DOM complet est conservé, mais uniquement comme **archive forensique** consultée après échec d'une assertion, sur le sous-arbre concerné.

---

### ADR-02 — La télémétrie prod est le capteur principal ; l'observatoire est le capteur diagnostique

**Décision :** l'observatoire n'est pas le premier à savoir. Les 435 utilisateurs le sont.

**Rationnel :** les plateformes déploient progressivement (1 % → 5 % → 50 %, par région et cohorte). Un compte d'observatoire unique voit le changement **des jours après** que 5 % des utilisateurs l'aient subi. 435 utilisateurs répartis sur toutes les cohortes constituent un capteur infiniment plus sensible.

**Conséquence :** architecture en deux étages.

```
   ÉTAGE 1 — TÉLÉMÉTRIE PROD (existe déjà, à enrichir)
   435 users · monitor_state · handler-watch (cron 3 min) · platform_health
   ├─ Latence      : minutes
   ├─ Couverture   : toutes cohortes
   └─ Diagnostic   : ✖ ("ça échoue", pas "pourquoi")
                    │  déclenche ↓
   ÉTAGE 2 — OBSERVATOIRE (à construire)
   4 plateformes × ~15 assertions + archive DOM/API
   ├─ Latence      : 24 h en passe nocturne, ~5 min en passe déclenchée
   ├─ Couverture   : 1 cohorte
   └─ Diagnostic   : ✔ (quel sélecteur, quel nœud, depuis quand)
```

> ⚠️ **État transitoire (précision du 26/07).** La cible ci-dessus reste
> valable, mais au 26/07 **3 personnes sur 462 inscrits ont jamais lancé
> l'extension** : l'étage 1 n'a AUCUN signal à émettre au démarrage. Ce n'est
> pas l'architecture qui change, c'est l'**ordre de construction** :
>
> - la **passe nocturne fonctionne dès le jour 1 avec zéro utilisateur** —
>   en v1, l'observatoire est temporairement capteur principal ET capteur
>   diagnostique, avec une latence de détection de 24 h assumée (§9) ;
> - la télémétrie de dégradation (`selector_health`, seuil « 3 users en
>   2e voie ») **ne peut ni fonctionner ni être testée tant que personne ne
>   publie**. Elle est construite quand même (elle doit vieillir en prod),
>   mais rien n'est gaté dessus, et son seuil est paramétré (§4.3), jamais
>   « 3 en dur » silencieusement inatteignable.
>
> **Critère de bascule (chiffré) :** l'étage 1 redevient capteur principal
> quand **≥ 20 installs distinctes ont publié sur les 7 derniers jours**
> (mesuré sur `selector_health`). À la bascule : seuil §4.3 remonté à 3,
> passe nocturne rétrogradée au rang de diagnostic, cible de détection
> ramenée à < 1 h (§9). Le rapport quotidien (§6.5) affiche
> « installs actives 7 j : N » pour voir la bascule approcher — sans ce
> compteur, personne ne se souviendra de réactiver quoi que ce soit.
> (Écrire « la base installée » plutôt qu'un effectif figé : 435 était déjà
> périmé au moment de la rédaction — 462 inscrits au 26/07.)

---

### ADR-03 — Le registre de sélecteurs est extrait avant toute automatisation

**Décision :** les sélecteurs sont sortis de `vinted.js` / `leboncoin.js` / `ebay.js` / `beebs.js` vers des fichiers de données purs `selectors/<platform>.registry.js`.

**Rationnel :** trois bénéfices immédiats, **sans aucune IA** :
1. **Résolution en cascade au runtime** — un sélecteur cassé devient un non-événement si le fallback tient.
2. **Télémétrie de dégradation** — chaque résolution par un maillon de secours est loguée. La cassure est visible chez les vrais utilisateurs **avant** qu'elle ne casse.
3. **Surface patchable sûre** — un agent qui édite un fichier de données déclaratif est incomparablement moins dangereux qu'un agent qui édite de la logique métier.

**Conséquence :** c'est le chantier n°1. Rien ne se construit avant.

> ⚠️ **Décision de séquençage v1 (Nico, 26/07) — registre DÉCOUPLÉ de
> l'extension.** Les content scripts MV3 sont des scripts classiques injectés
> par le manifest, sans système de module : partager le registre avec eux
> impose de modifier le tableau `js` du manifest, donc une release et une
> review Chrome. **On ne modifie PAS le manifest en v1.** Concrètement :
>
> - le registre est créé comme fichier de données (semaine 1) ;
> - l'**observatoire** l'importe normalement (Node/Playwright, aucun
>   obstacle) et devient son **premier et unique consommateur v1** ;
> - la migration des content scripts vers `resolveSelector` — et donc la
>   cascade runtime ET l'émission `selector_health` côté extension — est
>   **reportée à une release ultérieure (0.4.3+)**.
>
> Objectif : détection opérationnelle sans dépendre d'un cycle de review
> Chrome. Corollaire honnête : les bénéfices 1 et 2 du rationnel ci-dessus
> (cascade runtime, télémétrie de dégradation) ne deviennent réels qu'à la
> 0.4.3+ ; en v1 le registre achète le bénéfice 3 et l'observatoire.

---

### ADR-04 — L'observatoire tourne sur la machine résidentielle, pas dans un datacenter

**Décision :** exécution sur le PC Windows déjà allumé 24/7 pour le worker de l'extension. Pas de GitHub Actions, pas de VPS.

**Rationnel :**
- **IP résidentielle française** — les IP de datacenter sont un signal de détection anti-bot de premier ordre. Un accès automatisé attribuable depuis un datacenter est le pire des cas.
- **Coût infra : 0 €** — pas de VPS, pas de proxy résidentiel payant, pas de tiers dans la chaîne.
- **Cohérence** — le même environnement Chrome que celui des utilisateurs.

> ⚠️ **Correction du rationnel initial (24/07).** La v1 justifiait ce choix par « la machine est de toute façon allumée 24/7 pour le worker de l'extension ». C'est faux dans le cas de Nico : le worker tourne sur la machine de **chaque utilisateur**, et Nico ne revend quasiment plus. Le PC n'a donc aucune raison structurelle de tourner en continu. Voir §6.6 — ce n'est pas un problème, parce que l'observatoire n'a jamais besoin de tourner en continu.

**Conséquences / risques acceptés :**
- Pas de parallélisme. Acceptable : 4 plateformes × ~15 assertions, c'est une dizaine de minutes.
- Disponibilité partielle de la machine. Traité en §6.6 : la machine est un **exécutant sans état**, jamais un dépôt.

---

### ADR-05 v3 — Comptes réels de Nico, protection par la fréquence

> **Arbitrage de Nico, 24/07 (décision finale).** L'observatoire utilise les comptes existants sur les 4 plateformes. Motif : Nico ne revend plus, ces comptes ne servent plus opérationnellement.

**Décision :** comptes réels à tous les niveaux. Pas de comptes dédiés.

**Ce que cette décision apporte :**
- **Fidélité maximale.** Comptes anciens, vérifiés, avec historique → cohortes de déploiement représentatives de ce que voient les utilisateurs. Un compte créé récemment ne l'est pas (onboarding, vérifications, features bridées, A/B différents).
- **Suppression de l'étage de calibration** (comparaison compte dédié vs. compte réel) : il n'a plus d'objet. Moins de complexité.
- **Démarrage immédiat**, sans période de maturation des comptes.

**Ce que ça déplace, et donc ce qui est renforcé :** l'isolation par compte disparaît. La seule protection restante est le **rythme**. Les règles ci-dessous ne sont donc plus des recommandations, elles sont le garde-fou principal.

**Règles (durcies) :**
- **Plafond dur : ≤ 2 sessions authentifiées automatisées par plateforme et par jour**, toutes assertions confondues. Implémenté en code, pas en convention. Dépassement → run annulé et logué.
- **Maximiser N0 (accès non authentifié).** Chaque assertion réalisable sans connexion est du risque supprimé définitivement : taxonomies, structures de catégories, formulaires publics, APIs ouvertes. **Cible ≥ 40 % des assertions.** C'est le premier réflexe en écrivant les `assertions/*.yaml`.
- **Aucune publication réelle.** L'observatoire remplit les formulaires et s'arrête avant la soumission.
- Cadence irrégulière : fenêtre aléatoire, jamais `03:00:00` pile, jours sautés aléatoirement.
- Profils Chrome séparés par plateforme, jamais une session partagée.
- Le compte dev eBay `nelsoncat` (API Taxonomy) reste strictement séparé de tout accès automatisé au site eBay.
- **Ne pas dupliquer ce que l'usage normal fournit déjà.** L'extension et la télémétrie `selector_health` (§4.3) produisent le signal le plus fidèle qui existe, sans aucun accès automatisé supplémentaire. L'observatoire ne doit couvrir que ce que la prod ne voit pas.

**Assurance (10 min, une fois) :** créer un compte de secours dormant par plateforme, sans jamais l'utiliser. Coût nul, il vieillit en arrière-plan. Il n'existe que pour couvrir le scénario où un compte principal est perdu — auquel cas la capacité de **tester manuellement les correctifs** disparaît avec lui, ce qui bloquerait toute la boucle de développement sur cette plateforme.

---

### ADR-06 — Les APIs internes priment sur le DOM

**Décision :** priorité de surveillance décroissante : APIs internes > APIs officielles > champs obligatoires par catégorie > assertions DOM > DOM brut.

**Rationnel :** un contrat JSON est stable et son diff est exploitable ; un DOM ne l'est pas. La bascule Vinted du clic DOM vers `POST /api/v2/items/{id}/delete` a déjà démontré le gain.

**Conséquence :** métrique de pilotage à suivre dans le temps → **nombre de sélecteurs DOM critiques par plateforme**. Objectif : décroissante d'année en année. L'observatoire ne sert pas seulement à survivre à la fragilité, il sert à la réduire.

---

### ADR-07 — Le gate de merge dépend de la criticité du chemin, pas du résultat des tests

**Décision :** trois classes, avec des politiques de merge distinctes.

| Classe | Périmètre | Gate | Autonomie agent |
|---|---|---|---|
| 🟢 **Vert** | Détection d'état, lecture de catalogue, scraping de taxonomie | Tests verts → merge auto | 90 % |
| 🟠 **Orange** | Remplissage de champ, navigation, sélection de catégorie | Tests verts + diff sélecteur + screenshot avant/après → approbation par lot | 60 % |
| 🔴 **Rouge** | **Suppression**, publication réelle, dépense de Pépites, écriture de statut de vente | PR + dossier de preuve. Test manuel obligatoire. **Jamais de merge auto.** | 0 % sur le merge, 100 % sur la préparation |

**Rationnel :** `DELETE_DRY_RUN=false` — les suppressions sont réelles, sur les comptes des utilisateurs. Le bug LBC « faux published » prouve qu'un test peut passer sur un code faux. La classe de bug `listing_url` est revenue deux fois. Un agent introduit ce type de régression dix fois plus vite qu'un humain.

**Règle de revue :** les 5 minutes de review portent sur le **dossier de preuve** (screenshots annotés avant/après), pas sur le diff de code. Un diff de sélecteur est illisible et trompeur.

---

### ADR-08 — L'agent forensique n'a le droit d'écrire que dans le registre

**Décision :** contrainte imposée par l'outillage (chemins autorisés en dur), pas par le prompt.

**Rationnel :** un garde-fou exprimé en langage naturel finit par échouer. Un garde-fou exprimé dans le code n'échoue jamais.

**Chemins autorisés en écriture :** `chrome-extension/selectors/*.registry.js` uniquement.
**Interdits :** toute logique métier, tout fichier d'edge function, toute migration SQL.

---

## 4. Le registre de sélecteurs

### 4.1 Schéma

```js
// chrome-extension/selectors/vinted.registry.js
// FICHIER DE DONNÉES PUR — aucune logique, aucun import applicatif.
// Seul fichier que l'agent forensique est autorisé à modifier.

export const PLATFORM = 'vinted';
export const REGISTRY_VERSION = 1;

export default {
  'publish.submit': {
    // --- classification ---
    criticality: 'red',          // 'green' | 'orange' | 'red'  → cf. ADR-07
    workflows: ['publish'],      // workflows impactés si cassé

    // --- résolution ---
    chain: [
      '<SÉLECTEUR PRIMAIRE — À REMPLIR PAR L'AUDIT>',
      '<FALLBACK 1>',
      '<FALLBACK 2 — le plus générique>',
    ],

    // --- validation post-résolution (anti-faux-positif) ---
    assert: {
      role: 'button',
      textMatches: '^(Ajouter|Publier)',
      visible: true,
    },

    // --- métadonnées ---
    page: 'publish_form',        // clé de page, cf. §4.3
    authRequired: true,
    ownerFile: 'chrome-extension/content-scripts/vinted.js',
    lastVerified: '2026-07-24',
    notes: '',
  },
};
```

**Contraintes de forme (à respecter strictement, l'agent s'appuie dessus) :**
- Une clé = `<domaine>.<action>` en snake/dot case, stable dans le temps. On ne renomme jamais une clé, on la déprécie.
- `chain` est ordonnée du plus spécifique au plus générique.
- `assert` est obligatoire dès que `criticality !== 'green'`. Sans validation post-résolution, un fallback générique peut cibler le mauvais nœud — c'est exactement le mode d'échec du bug LBC.
- Aucun sélecteur ne doit exister ailleurs dans le code une fois la migration terminée. Un lint le vérifie (§4.4).

### 4.2 Contrat de résolution runtime

```js
// chrome-extension/selectors/resolve.js  (logique — l'agent n'y touche pas)

/**
 * @returns {{ el: Element|null, viaIndex: number, key: string }}
 * viaIndex = -1 si aucun maillon n'a résolu
 */
export function resolveSelector(key, registry, root = document) { /* ... */ }
```

Règles :
1. Parcours de `chain` dans l'ordre.
2. Pour chaque maillon : le nœud doit exister **et** satisfaire `assert`. Sinon on passe au suivant.
3. **Détection d'état uniquement via `getComputedStyle` + `textContent`** — jamais `getClientRects` / `innerText` / opacité animée. Le worker tourne dans une fenêtre non rendue (convention existante, non négociable).
4. Chaque appel émet un événement de télémétrie (§4.3), y compris en cas de succès sur le maillon 0.
5. `viaIndex === -1` → l'appelant déclenche le chemin `needsUser` existant. Aucun clic à l'aveugle.

### 4.3 Télémétrie de dégradation — le vrai système d'alerte précoce

Table Supabase :

```sql
create table public.selector_health (
  id            bigserial primary key,
  platform      text        not null,
  selector_key  text        not null,
  via_index     smallint    not null,   -- 0 = primaire, >0 = dégradé, -1 = échec total
  outcome       text        not null,   -- 'resolved' | 'failed' | 'assert_rejected'
  ext_version   text,
  occurred_at   timestamptz not null default now()
);

create index on public.selector_health (platform, selector_key, occurred_at desc);
create index on public.selector_health (occurred_at desc) where via_index <> 0;

-- Convention Supabase (breaking change mai 2026) : GRANT obligatoire
grant select, insert, update, delete on public.selector_health to authenticated;
```

**Aucune donnée personnelle.** Pas de `user_id`, pas d'URL d'annonce, pas de contenu. Uniquement de la santé technique. Ça évite d'ouvrir un sujet RGPD pour rien.

**Règle d'agrégation — seuil PARAMÉTRÉ, pas figé :**

```
seuil = max(1, min(3, ⌈10 % des installs actives sur 7 jours⌉))
```

Si un `selector_key` est résolu via `via_index > 0` par **≥ seuil installs distinctes en < 60 min**, on déclenche une passe d'observatoire ciblée (§6.2), avec un **rate-limit d'1 passe ciblée par clé et par 24 h** (indispensable quand le seuil vaut 1 : une install unique en boucle de retry ne doit pas transformer l'observatoire en métronome).

Pourquoi paramétré : avec la base actuelle (3 lanceurs historiques, cf. ADR-02), un seuil fixe à 3 exigerait que 100 % de la base active casse dans la même heure — c'est un déclencheur mort qui aurait l'air en service. La valeur 3 reste la CIBLE, atteinte mécaniquement à la bascule ADR-02 (≥ 20 installs publiantes/7 j ⇒ 10 % ≥ 2, puis plafonné à 3). Le compteur « installs distinctes » reste essentiel quelle que soit la valeur.

> ⚠️ Rappel de séquençage (ADR-03) : cette télémétrie n'émet rien tant que les content scripts n'utilisent pas `resolveSelector`, c'est-à-dire avant la release 0.4.3+. En v1, le déclencheur de passe ciblée QUI FONCTIONNE est la signature `handler-watch` (§6.2, tâche 3.1) — il marche avec un seul utilisateur.

> ⚠️ Sans `user_id`, la distinction se fait par une clé d'installation anonyme (UUID généré localement, stockée dans `chrome.storage.local`, non reliée au compte). À implémenter en semaine 1.

### 4.4 Lint de non-régression

Une règle simple en CI : **aucun littéral ressemblant à un sélecteur CSS/XPath en dehors de `selectors/*.registry.js`**.

Sans ce lint, les sélecteurs réapparaîtront dans la logique métier en trois semaines et tout le bénéfice de l'ADR-03 est perdu.

---

## 5. Les assertions

### 5.1 Structure

```yaml
# observatory/assertions/vinted.yaml
platform: vinted
assertions:
  - key: auth.session_valid
    criticality: red
    authRequired: true
    page: home
    check: session_detected

  - key: publish.form_reachable
    criticality: red
    authRequired: true
    page: publish_form
    check: page_loads_with_selector
    selector_key: publish.form_root
```

### 5.2 Jeu initial — Vinted (~15)

> ⚠️ **Cette liste est structurelle. Les sélecteurs concrets sortent de l'audit (§8, semaine 1), pas de l'imagination.** Aucun sélecteur ne doit être inventé : chacun doit provenir du code existant qui fonctionne aujourd'hui en production, ou d'une investigation avec preuve.

| # | Clé | Crit. | Auth | Ce qui casse si ça tombe |
|---|---|---|---|---|
| 1 | `auth.session_valid` | 🔴 | oui | Tout |
| 2 | `publish.form_reachable` | 🔴 | oui | Publication |
| 3 | `publish.photo_upload` | 🔴 | oui | Publication |
| 4 | `publish.title` | 🔴 | oui | Publication |
| 5 | `publish.description` | 🟠 | oui | Qualité d'annonce |
| 6 | `publish.price` | 🔴 | oui | Publication |
| 7 | `publish.category_picker` | 🔴 | oui | Publication |
| 8 | `publish.catalog_single_value_confirm` | 🟠 | oui | Confirmation inline valeur unique |
| 9 | `publish.condition` (État) | 🔴 | oui | Validation catalogue (bug connu 18-20/07) |
| 10 | `publish.brand` | 🟠 | oui | Champ requis selon catégorie |
| 11 | `publish.storage_space` (Espace de stockage) | 🟠 | oui | Bug connu 18-20/07 |
| 12 | `publish.submit` | 🔴 | oui | Publication |
| 13 | `publish.success_signal` | 🔴 | oui | **Faux positifs de publication** — cf. bug LBC |
| 14 | `delete.api_contract` | 🔴 | oui | Suppression (API interne) |
| 15 | `status.item_state` (active/sold/unavailable) | 🔴 | oui | Détection de vente |
| 16 | `taxonomy.categories_reachable` | 🟢 | non | Enrichissement du catalogue |

**Assertion 13 — la plus importante du système, et COUVERTURE PARTIELLE v1 — dépend de publications réelles.** Elle vérifie qu'un **signal de confirmation réel** existe et est détectable. C'est exactement le bug LBC (succès inconditionnel après un sleep) qui a coûté des heures. Cette assertion est celle qui empêche sa réapparition sur les quatre plateformes.

> ⚠️ **Limite structurelle assumée (26/07)** : l'observatoire s'arrête avant la soumission (ADR-05, « aucune publication réelle ») — or le success-signal n'existe qu'APRÈS soumission. L'observatoire ne peut donc PAS vérifier cette assertion. **Option retenue (Nico, 26/07)** : l'extension instrumente la détection du success-signal **à chaque publication réelle** — chaque publication d'un vrai utilisateur (ou un test manuel de Nico) émet un événement `selector_health` dédié (`outcome = 'success_signal_detected' | 'success_signal_missing'`), livré avec la release 0.4.3+ (séquençage ADR-03). D'ici là, l'assertion n'est couverte que par les publications réelles effectuées manuellement. Ne jamais la présenter comme « couverte » en v1 : un tableau de bord qui affiche vert sur une assertion non testée est pire que pas de tableau de bord.

### 5.3 Les autres plateformes

Même structure, adaptée :

| Plateforme | Spécificités à couvrir |
|---|---|
| **Leboncoin** | Écran wizard « Vos coordonnées », signal de confirmation réel (bug historique), catégories |
| **eBay** | Champs obligatoires par catégorie (848 requis / 234 catégories), API Taxonomy, dérivation Département, Type pré-rempli à tort, clic avalé |
| **Beebs** | Marque / Format colis sur puériculture, délai de grâce le plus long, fallback texte libre |

**Ordre d'implémentation :** Vinted → Leboncoin → eBay → Beebs. Vinted d'abord car c'est la plateforme la plus critique en volume et la plus instable.

---

## 6. L'observatoire

### 6.1 Structure

```
observatory/
├── package.json
├── playwright.config.ts
├── assertions/
│   ├── vinted.yaml
│   ├── leboncoin.yaml
│   ├── ebay.yaml
│   └── beebs.yaml
├── runners/
│   ├── run.ts              # orchestrateur : nightly | targeted | manual
│   ├── checks.ts           # implémentation des types de check
│   └── evidence.ts         # capture DOM + screenshot + réponses API
├── storage/
│   └── upload.ts           # → Supabase Storage
└── report/
    └── digest.ts           # → Resend, format 60 booléens
```

Le registre est **partagé** avec l'extension via un import relatif — c'est tout l'intérêt de garder l'observatoire dans le même repo. Un sélecteur corrigé par l'agent bénéficie simultanément à l'observatoire et à la production.

### 6.2 Deux modes d'exécution

| Mode | Déclencheur | Périmètre | Latence |
|---|---|---|---|
| **Nocturne** | Cadence irrégulière (ADR-05) | 4 plateformes × toutes assertions + archive complète | 24 h |
| **Ciblée** | Signature `handler-watch` S1/S2/S3 **ou** dégradation `selector_health` (§4.3) | 1 plateforme × workflow concerné + archive du sous-arbre | ~5 min |
| **Manuelle** | CLI | Au choix | immédiat |

### 6.3 Preuves collectées

Pour chaque assertion en échec :
1. HTML du **sous-arbre** concerné (pas la page entière) — J-1 et J
2. Screenshot pleine page + screenshot du conteneur, annoté
3. Réponses des APIs internes appelées pendant la passe
4. `resolvedVia` par maillon de la chaîne
5. Les dégradations observées en prod sur la même clé, 7 derniers jours

Pour chaque passe (succès inclus) : archive DOM complète + hash, pour constituer le corpus historique.

### 6.4 Schéma DB

```sql
create table public.observatory_runs (
  id          uuid primary key default gen_random_uuid(),
  trigger     text not null,        -- 'nightly' | 'targeted' | 'manual'
  platform    text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running',
  error       text
);

create table public.observatory_assertions (
  id            bigserial primary key,
  run_id        uuid not null references public.observatory_runs(id) on delete cascade,
  assertion_key text not null,
  criticality   text not null,
  status        text not null,       -- 'pass' | 'fail' | 'skip' | 'error'
  via_index     smallint,
  duration_ms   integer,
  evidence_path text,
  details       jsonb,
  checked_at    timestamptz not null default now()
);

create table public.observatory_snapshots (
  id          bigserial primary key,
  run_id      uuid not null references public.observatory_runs(id) on delete cascade,
  page_key    text not null,
  dom_path    text,                  -- Supabase Storage
  dom_hash    text not null,
  shot_path   text,
  api_capture jsonb,
  captured_at timestamptz not null default now()
);

create index on public.observatory_assertions (assertion_key, checked_at desc);
create index on public.observatory_assertions (run_id) where status = 'fail';

grant select, insert, update, delete on public.observatory_runs        to authenticated;
grant select, insert, update, delete on public.observatory_assertions  to authenticated;
grant select, insert, update, delete on public.observatory_snapshots   to authenticated;
```

**Rétention :**

| Donnée | Durée | Justification |
|---|---|---|
| DOM complet | 90 jours glissants | Volume. Suffisant pour tout diagnostic. |
| Hash DOM + résultats d'assertions | **illimité** | C'est le corpus historique — l'actif qui compose. |
| Screenshots d'échecs | illimité | Volume faible, valeur diagnostique élevée. |
| Screenshots de succès | 30 jours | Volume élevé, valeur faible. |

### 6.5 Le rapport quotidien

Format cible, envoyé par Resend, à côté d'`ops-digest` :

```
OBSERVATOIRE — 24/07  ·  03:47  ·  4 plateformes  ·  61 assertions

  VINTED      15/16  ⚠  publish.condition          (dégradé, maillon 2)
  LEBONCOIN   16/16  ✓
  EBAY        14/15  ✖  publish.required_fields    (nouveau champ détecté)
  BEEBS       14/14  ✓

  PROD (7j) — dégradations observées chez les utilisateurs
    vinted.publish.condition   maillon 2   ×34   12 installs distinctes
                                                  ↑ depuis le 22/07

  → 2 dossiers de diagnostic prêts. 1 PR ouverte (🟠). 1 en attente (🔴).
```

**Critère de réussite du format :** il tient en un écran et se lit en 20 secondes. Si le rapport dépasse 30 lignes en régime normal, le seuil de bruit est mal réglé — corriger le seuil, pas le lecteur.

---

### 6.6 Machine, disponibilité et reprise après panne

**Principe fondateur : la machine est un exécutant sans état. Rien de durable n'y vit.**

#### Le PC ne tourne pas 24/7

L'observatoire est une **tâche planifiée de ~10 minutes**, pas un service permanent.

| Composant | Où il tourne | Dépend du PC ? |
|---|---|---|
| Extension des 435 utilisateurs | machine de chaque utilisateur | ❌ |
| Télémétrie `selector_health` | → Supabase | ❌ |
| `handler-watch` (cron 3 min) | edge function Supabase | ❌ |
| Alertes Resend | Supabase | ❌ |
| **Observatoire (passe nocturne)** | **PC de Nico** | ✅ |
| **Observatoire (passe ciblée)** | **PC de Nico** | ✅ |
| Agent forensique | API, déclenché par le runner | ✅ (indirectement) |

> **Concrètement : la détection ne dépend pas du PC. Seul le diagnostic en dépend.**
> PC éteint trois jours → l'alerte arrive quand même en quelques minutes via la télémétrie utilisateurs. Seul le diagnostic automatique attend le réveil de la machine. Mode dégradé, pas panne.

**Mise en œuvre :** Planificateur de tâches Windows, option « Réveiller l'ordinateur pour exécuter cette tâche ». Le PC dort ~23 h/jour, se réveille dans la fenêtre aléatoire, exécute, se rendort. Extinctions, redémarrages et mises à jour Windows sont des non-événements.

**Passes ciblées quand la machine dort :** le déclencheur écrit une demande en base (`observatory_requests`), traitée au réveil suivant. Si la latence de ~5 min compte vraiment, laisser la machine en veille connectée plutôt qu'éteinte — mais ce n'est pas indispensable.

**Heartbeat :** alerte Resend si aucun run réussi depuis 36 h. Notification, pas urgence.

#### Si le PC lâche : rien n'est perdu

| Actif | Emplacement réel | Perdu ? |
|---|---|---|
| Registre de sélecteurs | Git / GitHub | ❌ |
| Fichiers d'assertions + code observatoire | Git / GitHub | ❌ |
| Résultats d'assertions | Supabase (`observatory_assertions`) | ❌ |
| Archives DOM + captures | Supabase Storage | ❌ |
| Corpus historique (hashes) | Supabase | ❌ |
| Télémétrie prod | Supabase | ❌ |
| Secrets / identifiants | **gestionnaire de mots de passe** (pas seulement le disque) | ❌ *si la règle est tenue* |
| Profils Chrome (sessions) | disque local | ✅ — reconstitués en se reconnectant |
| Runs non encore uploadés | disque local | ✅ — au pire une passe de 10 min |

**Règle d'implémentation non négociable :** chaque passe uploade ses résultats vers Supabase **à la fin du run**, jamais en batch différé. Le disque local n'est qu'un tampon. Un upload échoué est rejoué au run suivant.

**Reprise sur machine neuve (~1 h) :**

```
1. git clone <repo>
2. npm install && npx playwright install chromium
3. Secrets depuis le gestionnaire de mots de passe → .env
4. Reconnexion manuelle aux 4 plateformes (profils Chrome recréés)
5. Réenregistrer la tâche planifiée
6. Passe manuelle de vérification
```

#### Faut-il une machine dédiée ?

**Pas au démarrage.** Ne pas acheter de matériel avant d'avoir constaté une gêne réelle.

| Option | Coût | Conso annuelle | Quand |
|---|---|---|---|
| PC actuel + réveil planifié | 0 € | négligeable (dort 23 h/j) | **Maintenant** |
| PC actuel allumé 24/7 | 0 € | ~100–130 €/an (~60 W) | À éviter, aucun intérêt |
| Mini-PC dédié (Intel N100) | ~150 € | ~13 €/an (~6 W) | Si la planification devient une friction après 1–2 mois |

---

## 7. L'agent forensique

Le seul composant IA du système. Il n'intervient qu'**après** l'échec d'une assertion.

### 7.1 Contrat

**Entrées (fournies, jamais devinées) :**
- Clé d'assertion en échec + criticité + workflows impactés
- Sous-arbre DOM J-1 et J
- Screenshots
- Entrée de registre concernée (chaîne complète + `assert`)
- Dégradations observées en prod sur cette clé (7 j)
- Réponses d'API capturées

**Sortie — JSON strict, aucune prose :**

```json
{
  "assertion_key": "vinted.publish.condition",
  "cause": "…",
  "evidence": [
    { "claim": "…", "source": "dom_snapshot:<id>", "excerpt": "…" }
  ],
  "proposed_chain": ["…", "…"],
  "assert_update": null,
  "impacted_workflows": ["publish"],
  "confidence": 0.0,
  "recommendation": "auto_merge | batch_approve | human_required | insufficient_evidence"
}
```

### 7.2 Règles dures

1. **Ancrage obligatoire.** Aucune affirmation sans `source` pointant vers une preuve fournie. Pas de source → `insufficient_evidence`. Le refus est une sortie valide et attendue.
2. **Écriture limitée à `selectors/*.registry.js`** (ADR-08), imposée par l'outillage.
3. **`confidence < 0.7` → `human_required`**, quelle que soit la criticité.
4. **`criticality === 'red'` → `human_required`**, quelle que soit la confiance.
5. **Budget plafonné** par run et par jour. Circuit breaker automatique.
6. **Jamais de suppression de maillon existant** — l'agent ne peut qu'**ajouter** un maillon en tête de chaîne. Un ancien sélecteur qui ne marche plus chez lui peut encore marcher chez une cohorte d'utilisateurs.

> La règle 6 est subtile et importante : les plateformes déploient progressivement. Retirer un ancien sélecteur casse les utilisateurs restés sur l'ancienne version. La chaîne ne fait que s'allonger ; l'élagage est une décision humaine, trimestrielle.

### 7.3 Le dossier de preuve

C'est le livrable qui prend les 5 minutes de review. Format de la description de PR :

```markdown
## vinted.publish.condition — sélecteur ajouté

**Cause :** …
**Confiance :** 0.86  ·  **Classe :** 🟠  ·  **Workflows :** publish

| | Avant (23/07) | Après (24/07) |
|---|---|---|
| Screenshot | ![](…) | ![](…) |
| Nœud | `…` | `…` |

**Chaîne résultante :** maillon ajouté en tête, 3 maillons conservés.
**Prod :** 34 résolutions dégradées / 12 installs distinctes depuis le 22/07.
**Tests :** ✅ e2e vinted.publish
```

---

## 8. Plan d'exécution — 4 semaines

Trois semaines sur quatre sans une ligne d'IA. C'est le signe que l'architecture est saine.

### Semaine 1 — Registre (🚫 sans IA)

> Périmètre réel de l'audit (corrigé 26/07, vérifié dans le repo) : il n'existe
> **ni `chrome-extension/platforms/`, ni `shared.js` côté extension**. Les
> sélecteurs vivent dans `chrome-extension/content-scripts/{vinted,leboncoin,
> ebay,beebs}.js` (+ `fillsell-auth.js`), et dans **`background.js`** (détection
> d'état des annonces `detect*State`, contrats d'API internes, patterns d'URL)
> et `config.js` (URLs de dépôt). `src/utils/shared.js` (app web,
> detectObjectIcon) est HORS périmètre : aucun sélecteur plateforme dedans.

| # | Tâche | Livrable |
|---|---|---|
| 1.1 | **Audit** : inventaire exhaustif des sélecteurs existants dans les 5 content scripts + `background.js` + `config.js`. Lecture seule. | `docs/SELECTOR_AUDIT.md` |
| 1.2 | Création des 4 fichiers registre à partir de l'audit (aucun sélecteur inventé) | `selectors/*.registry.js` |
| 1.3 | `resolveSelector()` + chaîne de fallback + validation `assert` | `selectors/resolve.js` |
| 1.4 | UUID d'installation anonyme dans `chrome.storage.local` | — |
| 1.5 | Migration `selector_health` (la table peut exister avant ses émetteurs) | migration SQL |
| ~~1.6~~ | ~~Migration progressive des appels vers `resolveSelector`~~ — **REPORTÉ à la release 0.4.3+** (décision de séquençage ADR-03 : pas de modification du manifest ni des content scripts en v1) | — |
| 1.7 | Lint anti-sélecteur-hors-registre — **armé en avertissement seul jusqu'à 0.4.3** (les content scripts gardent légitimement leurs sélecteurs tant que 1.6 n'a pas eu lieu) | CI |

**Risque initial (« régression sur le chemin de publication Vinted ») : caduc en v1** — la migration étant reportée, la semaine 1 ne touche AUCUN chemin de production. Le risque se déplace vers la 0.4.3+ et sa mitigation reste la même : migration clé par clé, test manuel après chaque groupe.

### Semaine 2 — Observatoire v0 (🚫 sans IA) — **chemin critique v1**

> Tant que l'étage 1 est éteint (ADR-02, état transitoire), cette semaine
> livre le SEUL capteur du système. C'est elle qui rend la détection
> opérationnelle, pas la semaine 1.

| # | Tâche |
|---|---|
| 2.1 | Scaffold `observatory/` + Playwright + config machine résidentielle |
| 2.2 | Connexion des comptes **réels** (ADR-05 v3 — « comptes dédiés » était un résidu de la v2 de l'ADR), secrets hors repo + création des 4 comptes de secours dormants |
| 2.3 | `assertions/vinted.yaml` — les ~16 assertions |
| 2.4 | Runner + capture de preuves + upload Storage |
| 2.5 | Migrations `observatory_*` |
| 2.6 | Rapport Resend + heartbeat (alerte si aucun run > 36 h) |
| 2.7 | Extension des assertions à LBC / eBay / Beebs |

### Semaine 3 — Chaînage et APIs (🚫 sans IA)

| # | Tâche |
|---|---|
| 3.1 | `handler-watch` (S1/S2/S3) → déclenchement de passe ciblée — **déclencheur PRINCIPAL v1** : il fonctionne avec un seul utilisateur, contrairement à 3.2 |
| 3.2 | Agrégat `selector_health` → déclenchement (seuil PARAMÉTRÉ, cf. §4.3 — vaut 1 avec rate-limit tant que la base est petite, 3 à la bascule ADR-02). **Dormant de fait avant la 0.4.3+** : aucun émetteur côté extension avant la migration |
| 3.3 | Watcher de contrats d'API internes (Vinted delete, autocomplétions) |
| 3.4 | Watcher eBay Taxonomy → alimentation automatique de `ebay_item_aspects` |
| 3.5 | Métrique « nombre de sélecteurs DOM critiques par plateforme » + compteur « installs actives 7 j » (critère de bascule ADR-02) au rapport |
| 3.6 | **Préparation release extension 0.4.3+** (part avec le cycle de review Chrome, hors chemin critique) : migration `resolveSelector` clé par clé — Vinted d'abord —, émission `selector_health`, instrumentation du success-signal à chaque publication réelle (assertion 13, §5.2), passage du lint 1.7 en bloquant |

### Semaine 4 — Agent forensique (✅ IA, classes 🟢/🟠 uniquement)

| # | Tâche |
|---|---|
| 4.1 | Prompt + schéma de sortie JSON stricte |
| 4.2 | Outillage à écriture restreinte (ADR-08) |
| 4.3 | Génération du dossier de preuve + ouverture de PR |
| 4.4 | Policy de merge par classe (ADR-07) |
| 4.5 | 20 cas d'eval construits à partir des cassures **réelles** de juillet |
| 4.6 | Plafonds de budget + circuit breaker |

**4.5 est non négociable.** Sans suite d'évaluation, un changement de prompt devient impossible à valider, donc le système se fige et meurt. Les cassures de juillet (LBC faux published, eBay clic avalé, Vinted État, eBay Département) sont un jeu de test réel déjà disponible.

### Prérequis bloquant, avant la semaine 4

> ⚠️ **La convention actuelle « push direct sur main » est acceptable tant qu'un seul humain écrit. Elle devient dangereuse dès qu'un agent écrit.**
> Avant toute PR automatique : PR obligatoire + tests verts + revue humaine sur les classes 🟠/🔴. À mettre en place en semaine 3 au plus tard.

---

## 9. Métriques de succès

> ⚠️ **Baseline (corrigé 26/07)** : il n'y a pas de flux prod à mesurer —
> 3 lanceurs historiques, quasi aucune publication organique. La baseline
> n'est donc pas « à mesurer », elle EST le tableau des 6 incidents de
> juillet (§1) : détection par Nico, en jours, après impact. Mesurer
> mensuellement à partir du premier mois d'exploitation.

| Métrique | Baseline | Cible v1 (étage 1 éteint) | Cible après bascule ADR-02 |
|---|---|---|---|
| **Temps de détection** d'une cassure | jours (humain, cf. §1) | **< 24 h** (passe nocturne — c'est le SEUL capteur v1, viser < 1 h serait se mentir) | < 1 h |
| **Temps de réparation** (détection → prod) | 1–3 jours | < 24 h | < 4 h |
| **% de cassures détectées avant le premier ticket** | ~0 % | > 70 % (mécaniquement facile : presque personne ne publie — l'interpréter avec ça en tête) | > 70 % |
| **% de cassures absorbées par le fallback** (aucun impact) | 0 % | n/a avant 0.4.3+ (pas de cascade runtime, cf. ADR-03) | > 30 % |
| Nombre de sélecteurs DOM critiques / plateforme | mesuré par l'audit 1.1 | décroissant | −20 % |
| **Installs actives 7 j** (critère de bascule) | 3 lanceurs historiques | croissante — pilote la bascule à ≥ 20 | n/a |
| Heures/semaine passées en debug d'intégration | à estimer sur juillet | −60 % | −60 % |
| Coût LLM mensuel de l'agent | 0 € | < 60 € | < 60 € |

**Si à 3 mois « temps de réparation » n'a pas baissé, le système a échoué** — quel que soit son élégance. C'est la métrique qui juge le projet. (Le « temps de détection », lui, se juge contre la cible de la COLONNE en vigueur : reprocher < 1 h à un système dont le seul capteur est nocturne serait juger la démographie, pas l'outil.)

---

## 10. Risques et mitigations

| Risque | Gravité | Mitigation |
|---|---|---|
| Suspension d'un compte d'observatoire | Moyenne | Comptes burner, cadence irrégulière, IP résidentielle, pas de publication réelle |
| Bruit → rapport ignoré | **Élevée** | Assertions au lieu de diffs (ADR-01) ; si > 30 lignes en régime normal, corriger les seuils |
| Agent introduit une régression destructive | **Critique** | ADR-07 (🔴 = jamais d'auto-merge) + ADR-08 (écriture restreinte) + règle 6 (jamais de suppression de maillon) |
| Approval fatigue → validation aveugle | **Élevée** | Volume de 🔴 maintenu bas ; revue sur le dossier de preuve, pas sur le diff ; si > 5 PR 🔴/semaine, remonter le seuil de confiance |
| Machine résidentielle éteinte | Faible | Heartbeat + alerte à 36 h |
| Explosion du coût LLM | Moyenne | Plafond par run et par jour, circuit breaker, agent déclenché uniquement sur échec |
| Réapparition de sélecteurs hors registre | Moyenne | Lint en CI (1.7) |
| Sur-ingénierie / dérive de périmètre | **Élevée** | §2 relu à chaque nouvelle idée |

---

## 11. Prompts Fable — Semaine 1

Conventions respectées : bloc unique copiable, `git add` fichier par fichier, code + commit + push, aucune étape de test/vérification côté Fable (Nico teste manuellement), investigation avec preuve avant toute correction.

### Prompt 1.1 — Audit (lecture seule)

```
Tâche : audit en LECTURE SEULE des sélecteurs de l'extension Chrome FillSell.
Ne modifie aucun fichier applicatif. Ne corrige rien. N'invente rien.

Objectif : produire l'inventaire exhaustif de tous les sélecteurs DOM et de
tous les appels d'API interne utilisés par l'extension, afin de construire
ensuite un registre déclaratif.

Fichiers à analyser (chemins RÉELS, vérifiés le 26/07 — il n'existe ni
chrome-extension/platforms/ ni shared.js côté extension) :
- chrome-extension/content-scripts/vinted.js
- chrome-extension/content-scripts/leboncoin.js
- chrome-extension/content-scripts/ebay.js
- chrome-extension/content-scripts/beebs.js
- chrome-extension/content-scripts/fillsell-auth.js
- chrome-extension/background.js   ← détection d'état des annonces
  (detectVintedState, detectLeboncoinState, detectEbayState, detectBeebsState),
  appels d'API internes, patterns d'URL de dépôt et de connexion
- chrome-extension/config.js       ← URLs de dépôt par plateforme
- chrome-extension/popup.js        (peu probable, vérifier quand même)
NB : src/utils/shared.js appartient à l'APP WEB (detectObjectIcon, mapping
d'icônes) — HORS périmètre, aucun sélecteur plateforme dedans. Ne pas l'auditer.

Pour CHAQUE sélecteur trouvé, relève :
1. Le littéral exact (querySelector, XPath, data-testid, classe, attribut…)
2. Fichier + numéro de ligne
3. La fonction appelante
4. Le workflow concerné : publish | delete | status_check | draft | edit | other
5. Sa criticité selon cette grille :
   - red    = suppression, publication réelle, écriture de statut de vente,
              dépense de Pépites, authentification
   - orange = remplissage de champ, navigation, sélection de catégorie
   - green  = lecture, détection d'état non critique, scraping de catalogue
6. Existe-t-il déjà un fallback dans le code ? (oui/non, lequel)
7. Existe-t-il une vérification post-résolution avant action ? (oui/non, laquelle)

Relève AUSSI séparément :
- tous les appels d'API interne des plateformes (URL, méthode, payload,
  forme de la réponse attendue) — ex. POST /api/v2/items/{id}/delete
- tous les endroits où un succès est supposé sans signal de confirmation réel
  (pattern du bug LBC : retour de succès après un sleep, sans vérification)

Livrable : crée le fichier docs/SELECTOR_AUDIT.md avec :
- Une section par plateforme
- Un tableau markdown : clé_proposée | sélecteur | fichier:ligne | fonction |
  workflow | criticité | fallback | vérif_post
- La convention de nommage des clés : <domaine>.<action> en dot.case
  (ex. publish.submit, delete.confirm, status.item_state)
- Une section "APIs internes"
- Une section "Succès supposés sans signal de confirmation" — c'est la plus
  importante, liste-la exhaustivement
- Une section "Sélecteurs sans aucun fallback et de criticité red"

Contraintes :
- N'invente aucun sélecteur. Si un sélecteur est construit dynamiquement,
  note-le tel quel avec son mode de construction.
- Ne propose aucune correction dans ce fichier.

Puis :
git add docs/SELECTOR_AUDIT.md
git commit -m "docs: audit exhaustif des sélecteurs et APIs internes de l'extension"
git push
```

### Prompt 1.2 — Registre + résolution (à lancer après lecture de l'audit par Nico)

> À n'envoyer qu'après que Nico ait lu et validé `docs/SELECTOR_AUDIT.md`. Le contenu exact dépend de l'audit.

```
Tâche : créer le registre de sélecteurs déclaratif et la couche de résolution.
Source de vérité : docs/SELECTOR_AUDIT.md (déjà dans le repo). Lis-le d'abord.
N'invente aucun sélecteur : reprends uniquement ceux de l'audit.

1) Crée chrome-extension/selectors/vinted.registry.js
   Fichier de DONNÉES PUR : pas de logique, pas d'import applicatif.
   Format exact par entrée :

   'publish.submit': {
     criticality: 'red',
     workflows: ['publish'],
     chain: ['<primaire depuis l'audit>', '<fallback si existant>'],
     assert: { role: 'button', textMatches: '^(Ajouter|Publier)', visible: true },
     page: 'publish_form',
     authRequired: true,
     ownerFile: 'chrome-extension/content-scripts/vinted.js',
     lastVerified: '2026-07-24',
     notes: '',
   }

   Règles :
   - `assert` est OBLIGATOIRE pour toute entrée criticality !== 'green'
   - chain ordonnée du plus spécifique au plus générique
   - si l'audit ne révèle qu'un seul sélecteur, chain n'a qu'un maillon —
     n'invente pas de fallback
   - exporte aussi: export const PLATFORM = 'vinted'; export const REGISTRY_VERSION = 1;

2) Crée les 3 autres registres (leboncoin, ebay, beebs) sur le même modèle,
   depuis l'audit.

3) Crée chrome-extension/selectors/resolve.js :
   export function resolveSelector(key, registry, root = document)
   → retourne { el, viaIndex, key }  (viaIndex = -1 si échec total)

   - parcourt chain dans l'ordre
   - un maillon n'est retenu que si le nœud existe ET satisfait `assert`
   - détection d'état UNIQUEMENT via getComputedStyle + textContent.
     JAMAIS getClientRects / innerText / opacité animée
     (le worker tourne dans une fenêtre non rendue)
   - émet un événement de télémétrie à chaque appel, succès inclus

4) Crée chrome-extension/selectors/installId.js :
   UUID d'installation anonyme généré une fois et stocké dans
   chrome.storage.local. Aucun lien avec le compte utilisateur.

5) Crée la migration supabase/migrations/<timestamp>_selector_health.sql
   avec la table selector_health (colonnes : id bigserial pk, platform text
   not null, selector_key text not null, via_index smallint not null,
   outcome text not null, ext_version text, install_id text,
   occurred_at timestamptz not null default now()), les deux index, et
   OBLIGATOIREMENT :
   grant select, insert, update, delete on public.selector_health to authenticated;

   Aucune donnée personnelle dans cette table : pas de user_id, pas d'URL
   d'annonce, pas de contenu.

6) NE MIGRE PAS encore les appels existants vers resolveSelector.
   Cette étape sera faite clé par clé dans un prompt séparé.

Puis, fichier par fichier (jamais git add -A) :
git add chrome-extension/selectors/vinted.registry.js
git add chrome-extension/selectors/leboncoin.registry.js
git add chrome-extension/selectors/ebay.registry.js
git add chrome-extension/selectors/beebs.registry.js
git add chrome-extension/selectors/resolve.js
git add chrome-extension/selectors/installId.js
git add supabase/migrations/<timestamp>_selector_health.sql
git commit -m "feat(selectors): registre déclaratif, résolution en cascade et télémétrie de dégradation"
git push
```

---

## 12. Décisions restant à prendre (Nico)

| # | Décision | Recommandation |
|---|---|---|
| 1 | Repo unique ou repo séparé pour l'observatoire ? | **Unique.** Le partage du registre entre extension et observatoire est tout l'intérêt. |
| 2 | Comptes de l'observatoire | ✅ **Tranché : comptes réels** (ADR-05 v3). Reste à faire : plafond ≤ 2 sessions/plateforme/jour en dur, et 4 comptes de secours dormants. |
| 3 | Migrer les 4 plateformes en semaine 1, ou Vinted seul ? | **Vinted seul.** Valider le pattern avant de le généraliser. |
| 4 | Passer en PR obligatoire avant la semaine 4 ? | **Oui, non négociable** (cf. §8). |
| 5 | Budget mensuel plafond de l'agent forensique | Proposition : **60 €/mois**, circuit breaker à 80 %. |

---

*Fin de spec v1. Toute modification doit préserver les ADR ou les remplacer explicitement avec un rationnel écrit.*
