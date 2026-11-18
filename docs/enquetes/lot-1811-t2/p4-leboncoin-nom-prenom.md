> Annexe du rapport du lot T2 du 18/11 (docs/enquetes/lot-1811-t2/RAPPORT.md) : enquête de l'agent, copiée telle quelle,
> noms, pseudos et adresses remplacés par l'id8 du compte ou un repère (règle « données de clients »).

# Point 4 (lot du 18/11/2026) — Leboncoin « nom et prénom » : compte d5531b8e (Premium, hors Cloud)

Enquête en lecture seule, menée le 18/11/2026 de 21:30 à 22:10 (heure de Paris). Rien n'a été écrit dans le dépôt, en base, chez Leboncoin ni sur le Cloud.
Fichiers de travail : `(dossier de travail vidé) ` (q*.sql, brouillon du verrou, `apres/` = code proposé et éprouvé hors dépôt).

## 0. En bref
- **88 publications Leboncoin bloquées**, une par article, toutes avec le motif exact `lbc_escrow_identite` :
  - 31 ont vraiment buté chez Leboncoin, le 16/11 entre 16:30 et 17:02 ;
  - 57 ont été retenues avant tout essai (aucune visite de Leboncoin), du 16/11 17:03 au 17/11.
  - S'y ajoutent 116 tâches annulées.
- **Cause chez Leboncoin.** À l'aperçu final, les champs `text[escrow_lastname](vide)` et `text[escrow_firstname](vide)` restent vides : le compte Leboncoin, neuf (0 annonce relevée le 16/11), n'a ni nom ni prénom. Notre contrôle est juste. Et **FillSell n'a nulle part ces deux valeurs** : `platform_settings.leboncoin` ne contient que rue, ville, adresse, code_postal et poids_choix, et aucune colonne de `profiles` ne les porte.
- **Cause de la relance retenue.** La porte « identité » de get-pending-jobs ne sert que les tâches qui portent `identite_lbc.eclaireur_le`, posé par « C'est fait » ou par handler-watch. La relance de l'app ne pose que `derniere_relance_manuelle`, donc elle est retenue au passage suivant (3,5 s plus tard).
  - Preuve : relance à 21:11:06.740, puis le journal à 21:11:10.201 : « … (dernier mur 2026-11-17T15:36:21.303Z) → 1 tâche(s) retenue(s) avant essai ».
  - Les portes jumelles le font déjà : Depop (`estEclaireurFrais`, vendeur-depop.js:199-204), le vendeur eBay (vendeur-ebay.js:127) et le refus de compte eBay (ebay-refus-compte.js:149) traitent la relance de l'app comme un éclaireur. Leboncoin est la seule exception.
- **Correctif proposé.**
  - (a) La relance de l'app après le dernier mur devient UN éclaireur (règle unique dans `_shared/lbc-identite.js`, marque posée par get-pending-jobs).
  - (b) FillSell demande nom et prénom UNE fois (carte existante `EcranIdentiteLbc`), les range dans `platform_settings.leboncoin.identite_vendeur` (par `platform_settings_fusionner`, aucune migration).
  - (c) L'extension, qui sert aussi la copie Cloud, les pose dans les deux cases VIDES juste avant le Continuer final. Jamais par-dessus un pré-rempli de Leboncoin, jamais une valeur inventée.
- **Verrou.** Brouillon `selftest:lbc-identite-saisie` : **rouge aujourd'hui, 13 échecs sur 17** (sortie au § 5).

## 1. Le circuit actuel, avec ses preuves

### 1.1 Détection côté extension (identique pour le PC et la copie Cloud)
- `chrome-extension/content-scripts/leboncoin.js` :
  - :148-158 : message `MSG_LBC_ESCROW_IDENTITE` et règle « Donnée personnelle : jamais saisie par nous ».
  - :2127-2133 : « Politique : on ne SAISIT jamais un email/téléphone/nom/prénom nous-mêmes ».
  - :2050-2077 : le Continuer final est cliqué **sans regarder les cases escrow**.
  - :2198-2204 : après le clic, `champsVidesApercu()` puis `champsEscrowVides()` (name ou id en `^escrow_`, visibles et vides).
  - :2633-2634 : la boucle de re-clics s'arrête dès qu'une case escrow est vide.
  - :2278-2287 : `refusApercu()` rend `{ needsUser, attenteUtilisateur: true, attenteMotif: "lbc_escrow_identite", error: MSG + « — Observabilité: … » }`.
- `chrome-extension/background.js` :
  - :6066-6069 : `attenteUtilisateur` part vers `marquerAttenteUtilisateur` (:7613).
  - :7813-7826 : `champsAttenteUtilisateur` pose `last_diagnostic = { quoi: "lbc_escrow_identite", detail, at }`, puis needs_user **persisté**. Aucune tentative n'est consommée, la tâche n'est jamais passée en failed.
  - :382-385 : `CAUSES_HUMAINES_CONNUES.lbc_escrow_identite`.
- Champs relevés sur l'éclaireur 0ca182b5 (18/11 10:05:51) : `/deposer-une-annonce`, titre « Un dernier aperçu avant de publier votre annonce ! », boutons Je vends · Je donne · Retour · Continuer, champs `text[subject](rempli)`, `text[price_cents](rempli)`, `text[location](rempli)`, `text[escrow_lastname](vide)`, `text[escrow_firstname](vide)`.
  - Ce sont des inputs texte nommés.
  - Ailleurs, Leboncoin utilise des inputs React (titre, adresse) que l'on pose avec `typeInto` (leboncoin.js:6943) : `execCommand insertText` caractère par caractère, `setNativeValue` en repli.
  - **Non prouvé** : les cases sont-elles affichées AVANT le premier clic ? Le relevé est pris après. C'est à établir à l'essai (§ 4) ; le correctif traite les deux cas.

### 1.2 Côté serveur : la règle unique `supabase/functions/_shared/lbc-identite.js`
- :41-48 `attendIdentiteLbc`, motif exact.
- :55-62 `eclaireurIdentiteLbc` : la plus ancienne, une fois par 12 h.
- :65-72 `champsEclaireur` : `identite_lbc.eclaireur_le / par / n`.
- :94-97 `MSG_LBC_IDENTITE_RETENUE`.
- :120-126 `partagerCandidatsIdentite` : **seul `identite_lbc.eclaireur_le` > dernier mur est servi**.
- :129-136 `champsRetenueIdentite` : needs_user, `needs_user_source = lbc_identite`, `retenue_avant_essai`.
- Branchements :
  - get-pending-jobs/index.ts:6612-6664 : la porte. Elle tient tant qu'un mur vu a moins de 30 j et qu'aucune publication Leboncoin n'est passée depuis ; elle écrit au plus 40 retenues par passage.
  - handler-watch/index.ts:6329-6416 : éclaireur toutes les 12 h si le poste a été vu il y a moins de 24 h. Si un éclaireur marqué est publié, toutes les autres tâches sont relâchées (`champsReprise`).
- App :
  - `src/tabs/StockTab.jsx` :7855-7867 (`identiteLbc`), :8016 (sortie des lignes par article), :9901 et :10015-10019 (UNE carte « Leboncoin : ton nom et ton prénom »), :13058.
  - `src/stock/EcranIdentiteLbc.jsx` : texte « Complète-les … dans tes informations personnelles Leboncoin », lien `URL_INFOS_LBC`, « C'est fait » = `champsEclaireur(…, 'geste')` + compare-and-swap.
- **D'où viendraient nom et prénom aujourd'hui** : seulement du compte Leboncoin (le pré-rempli de l'aperçu). FillSell ne les a pas, ne les demande pas et ne les pose pas.

### 1.3 Le compte d5531b8e (base de prod lue à 21:51)
Requête : groupement des tâches Leboncoin par statut et motif (`q1.sql`, `q6.sql`, `q7.sql`, `q8.sql`).

| Statut | Nombre | Motif / texte | Créées |
|---|---|---|---|
| needs_user, mur vu | 31 | `lbc_escrow_identite`, « … sans eux, la publication ne peut pas être validée. Complète-les sur leboncoin.fr … puis relance … » | 16/11 16:27:31 → 16:28:16 |
| needs_user, retenue avant essai | 57 | `lbc_escrow_identite` + `retenue_avant_essai`, `MSG_LBC_IDENTITE_RETENUE` | 16/11 16:28:17 → 17/11 15:00:30 |
| cancelled | 113 + 3 | « Arrêtée à ta demande » (17/11 11:54-11:57) ; « vendu » | — |

- 88 articles distincts, une tâche par article, sans doublon.
- Le compte : `is_premium` vrai, `cloud_voie` faux, extension 0.6.192 (`2026-11-16T14:54:01Z+4e5f9ee`), vue à 21:51.
- Éclaireur 0ca182b5 : `identite_lbc.n = 5`, tous lancés par handler-watch (12 h), aucun « C'est fait » (aucune tâche `par = geste`).
  - Essais archivés : 16/11 16:30, 17/11 04:33, 17/11 16:33. Dernier essai : 18/11 10:03, revenu au mur à 10:05:51.
  - Journal handler-watch à 10:03:12 : « éclaireur … relancé (90 en attente du nom et prénom) ».
  - **Prochain éclaireur automatique : ce soir à partir de 22:03. Il butera de nouveau** tant que rien n'est corrigé.
- 6 relances depuis l'app (`derniere_relance_manuelle`), toutes retenues sans aucune visite de Leboncoin :

| Relance (17/11) | Retenue |
|---|---|
| 14:55:51, 14:56:09, 14:57:02 | 14:57:10 |
| 15:08:11, 15:08:17 | 15:09:09 |
| 21:11:06.740 | 21:11:10.159 (journal à 21:11:10.201) |

- Pourquoi c'est vide chez elle : compte Leboncoin neuf, sans nom ni prénom.
  - Le lot du 16/11 (`docs/enquetes/lot-1611-3-apres-midi/RAPPORT.md` § 6) relève Leboncoin à 0 annonce.
  - Leboncoin pré-remplit ces deux cases à partir des informations personnelles du compte. Sans elles, il refuse le Continuer final côté page : aucun adsubmit n'est parti.
  - Elle n'a jamais utilisé le lien de la carte.

## 2. La relance retenue : où, et la règle à changer
Le chemin :
1. App : `relancerJobEchoue` (StockTab.jsx:8932). Il pose `derniere_relance_manuelle` (:9003) et `relances_manuelles`, puis passe la tâche en pending (:9032-9036).
   - `lbc_identite` ne figure PAS dans `MURS_LEVES_A_LA_RELANCE` (:490-507), donc la marque de mur reste posée.
2. get-pending-jobs/index.ts:6621-6650 : la tâche est candidate, un mur de moins de 30 j existe, aucune publication n'est passée.
3. `partagerCandidatsIdentite` (lbc-identite.js:122) ne voit que `identite_lbc.eclaireur_le`, donc la tâche part dans `retenus`. `champsRetenueIdentite` la remet en needs_user avec « Rien n'a été envoyé à Leboncoin ».
4. Elle attend le passage de 12 h de handler-watch, qui relance l'éclaireur le plus ancien, pas celle de la personne.

**Règle proposée** : « une relance faite par la personne depuis l'app après le dernier mur part tout de suite, comme UN éclaireur. Si elle bute encore (nouveau mur vu), on retombe dans la retenue. »
- Un seul éclaireur par passage, comme aujourd'hui.
- La cadence de republication n'est pas touchée : la porte d'identité (:6612) ne fait que RETIRER des tâches de `out`, et les filtres de créneau, plafond et quotas (lignes 8936 et suivantes) s'appliquent après, inchangés.

`supabase/functions/_shared/lbc-identite.js`. Avant (:120-123) :
```js
const eclaireurs = l.filter((j) => (Date.parse(String(pfDe(j).identite_lbc?.eclaireur_le ?? "")) || 0) > (dernierMurMs ?? 0));
```
Après :
```js
/** (18/11, point 4) Relancée APRÈS le dernier mur : par la carte ou handler-watch (identite_lbc.eclaireur_le), ou par la
 *  personne depuis l'app (derniere_relance_manuelle) — comme Depop (estEclaireurFrais) et eBay (vendeur-ebay.js). */
export function relanceeApresMur(job, dernierMurMs) {
  const pf = pfDe(job);
  const t = Math.max(Date.parse(String(pf.identite_lbc?.eclaireur_le ?? "")) || 0, Date.parse(String(pf.derniere_relance_manuelle ?? "")) || 0);
  return t > (dernierMurMs ?? 0);
}
// dans partagerCandidatsIdentite :
const eclaireurs = l.filter((j) => relanceeApresMur(j, dernierMurMs));
```
Éprouvé hors dépôt (`apres/lbc-identite.js`) : `servis [d0bdebe8]`, `retenus [neuve, avant]`.

`get-pending-jobs/index.ts`, juste après :6637-6638 : marquer l'éclaireur servi par une relance de l'app, pour que handler-watch le reconnaisse (sa reprise de tout le compte lit `identite_lbc.eclaireur_le`, :6363 et :6370-6373, et son horloge de 12 h aussi).
```ts
const maintenantIso = new Date().toISOString();
for (const j of servis) {
  const pfS = (j.platform_fields ?? {}) as Record<string, unknown>;
  const marque = Date.parse(String((pfS.identite_lbc as Record<string, unknown> | undefined)?.eclaireur_le ?? "")) || 0;
  if (marque > dernierMur) continue;                                   // carte ou handler-watch : déjà marqué
  const pfE = champsEclaireur(pfS, "relance_app", maintenantIso) as Record<string, unknown>;
  const { data: majE } = await userClient.from("cross_post_jobs").update({ platform_fields: pfAPersister(pfE) })
    .eq("id", String(j.id)).eq("status", "pending").select("id");
  if ((majE ?? []).length) j.platform_fields = pfE;
  console.log(`[get-pending-jobs] userId=${user.id} : relance de l'app ${String(j.id).slice(0, 8)} servie en éclaireur (nom et prénom Leboncoin)`);
}
```
- Il faut importer `champsEclaireur` à la ligne :7. Il retire déjà `needs_user_source` et `next_action_after`.
- App, en complément (OTA) : ajouter `'lbc_identite'` à `MURS_LEVES_A_LA_RELANCE` (StockTab.jsx:490).
- Même trou, laissé tel quel (décision de Nico) : la porte « forfait pro » (`estEclaireurForfait`, lbc-forfait.js:218) ne lit pas non plus `derniere_relance_manuelle`.

## 3. Le nom et le prénom : demandés une fois, posés par FillSell

### 3.1 Où les ranger
`profiles.platform_settings.leboncoin.identite_vendeur = { nom, prenom, enregistre_le }`.
- Écriture : `fusionnerReglages(['leboncoin','identite_vendeur'], {…})` (src/utils/reglagesPlateformes.js:25), donc `rpc platform_settings_fusionner`.
  - Définition relue en prod : générique, propre ligne seulement, aucune liste blanche de clés.
  - Le trigger `profiles_platform_settings_garde` ne protège que les clés d'adresse contre l'effacement.
  - **Aucune migration nécessaire.** Option : ajouter `leboncoin.identite_vendeur` aux clés protégées, par une réécriture SQL depuis `pg_get_functiondef` (circuit des migrations, base jetable, feu vert).
- Règle pure à ajouter dans `_shared/lbc-identite.js` (Deno, Node et Vite) :
```js
export const CLE_IDENTITE_VENDEUR = "identite_vendeur";
const nomPropre = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const NOM_PROPRE_RE = /^\p{L}[\p{L}\p{M}' .\-’]*$/u;
/** { nom, prenom } nettoyés, ou null (inconnu : on DEMANDE, jamais une valeur inventée). 1 à 50 car., lettres, ' - . espace. */
export function identiteVendeurValide(x) {
  if (!x || typeof x !== "object") return null;
  const nom = nomPropre(x.nom), prenom = nomPropre(x.prenom);
  const ok = (v) => v.length >= 1 && v.length <= 50 && NOM_PROPRE_RE.test(v);
  return ok(nom) && ok(prenom) ? { nom, prenom } : null;
}
```
- Résultats de l'essai hors dépôt :
  - « Dupont-Martin / Anne  Marie » donne `{Dupont-Martin, Anne Marie}` ;
  - « N'Diaye / Éloïse » est accepté ;
  - « Dupont2 » et une valeur vide donnent `null`.

### 3.2 Comment la tâche reçoit les valeurs, sans les copier dans 88 tâches
- `background.js:8883` `rafraichirAdresseLbc` lit déjà `profiles?id=eq.<uid>&select=platform_settings` juste avant FILL_LISTING (appel :5781, publication ET recréation d'une republication, `processJob` :31162).
- On y ajoute une ligne, AVANT le `return` anticipé (:8890) :
```js
const idv = rows?.[0]?.platform_settings?.leboncoin?.identite_vendeur;
if (idv && typeof idv === "object") job.identite_vendeur_lbc = { nom: String(idv.nom ?? ""), prenom: String(idv.prenom ?? "") };
```
- La valeur reste sur l'objet `job` en mémoire, transmis dans le message `FILL_LISTING` (:34458). **Jamais dans `platform_fields`**, que l'extension réécrit en base avec le verdict.
- On ne passe pas par get-pending-jobs : il réécrit les `platform_fields` des tâches servies, ce qui mettrait la donnée personnelle en base, dans chaque tâche.
- **Cloud** : la copie Cloud est la même extension (`scripts/cloud/build-extension-cloud.mjs`). `patcherContentLeboncoin` ne touche que `lireTypeCompteLbc`. Le navigateur Cloud lit `profiles` avec la session FillSell de la personne (RLS). Aucun code propre au Cloud dans `serveur-cloud/`, seulement la copie à reconstruire et monter.

### 3.3 Où l'extension les pose (leboncoin.js)
- Bloc pur au niveau du module, près de :148. Il doit être au niveau du module, parce que `champsEscrowVides` est un `const` défini à :2204, APRÈS le clic : l'appeler avant le clic lèverait une ReferenceError (zone morte temporelle).
  - Texte complet dans `apres/bloc-identite-escrow.js`, éprouvé : deux cases vides reçoivent les deux valeurs ; si une seule est vide, seule celle-là est posée ; une case pré-remplie n'est pas touchée ; sans valeur connue, `manque` ; une case `escrow_*` inconnue n'est jamais remplie.
```js
// ⟦identite-escrow:début⟧
const CASES_ESCROW_LBC = { escrow_lastname: "nom", escrow_firstname: "prenom" };
function identiteEscrowDuJob(job) { … même règle que identiteVendeurValide … }
function decisionIdentiteEscrowLbc(cases, identite) {
  const vides = (cases ?? []).filter((c) => c && c.vide && Object.prototype.hasOwnProperty.call(CASES_ESCROW_LBC, c.cle));
  if (!vides.length) return { poser: [], manque: false };
  if (!identite) return { poser: [], manque: true };
  return { poser: vides.map((c) => ({ cle: c.cle, valeur: identite[CASES_ESCROW_LBC[c.cle]] })), manque: false };
}
// ⟦identite-escrow:fin⟧
```
- Insertion avant le clic, entre la relecture de la description (:2033-2048) et `console.log("🚀 LIVE …")` (:2050). Les cases `input[name^="escrow_"]` visibles sont lues :
  - si `manque` : on rend l'attente `lbc_escrow_identite` **sans cliquer**, donc rien n'est envoyé ;
  - sinon : `typeInto(el, valeur)`, `blur`, `humanPause`, relecture de `el.value`. Si la valeur n'a pas pris, attente avec `identite: { posee: false }`.
  - Puis `finalContinue = findButtonByExactText("Continuer") ?? finalContinue`.
  - Avertissement sans valeurs, par exemple « identité Transaction sécurisée : escrow_lastname, escrow_firstname posés depuis FillSell ». Aucun journal ne porte les valeurs : `dumpEcranVisible` ne note que « (rempli) ».
- Repli si les cases n'apparaissent qu'après le clic : dans la boucle (:2633), si des cases escrow sont vides, qu'une identité est connue et qu'elle n'a pas encore été posée, on la pose une fois, on relit la sonde (`depotRequeteVue().seen` doit être faux : le refus escrow est côté page) et on reclique une seule fois.
- `refusApercu` (:2279) : si l'identité a été posée et que Leboncoin refuse encore, même motif `lbc_escrow_identite` avec `identite: { posee: true }`, pour que la porte et la carte restent les mêmes et que la carte dise « Leboncoin n'a pas accepté ce nom ».
  - `champsAttenteUtilisateur` (background.js:7819) recopie `result.identiteEscrow` dans `last_diagnostic.identite`.
- Remplacer les deux règles « jamais saisie par nous » (:150-151, :2128-2133) par la décision de Nico du 18/11, et le message `MSG_LBC_ESCROW_IDENTITE` par : « Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) : donne-les une fois dans FillSell (À régler › Leboncoin : ton nom et ton prénom), FillSell les posera lui-même à chaque dépôt. »
  - Il faut garder la tournure « nom et ton prénom sur ton compte vendeur » (`ACTION_UTILISATEUR_RE`, src/utils/shared.js:222).
  - Il faut ajouter la traduction EN dans src/utils/messagesServeur.js:280.
  - Même mise à jour pour `MSG_LBC_IDENTITE_RETENUE` (lbc-identite.js:94) et `CAUSES_HUMAINES_CONNUES` (background.js:383).
- Toutes versions d'extension : update-job-status peut remplacer l'ancien texte (« complète-les sur leboncoin.fr ») quand `last_diagnostic.quoi = lbc_escrow_identite`. C'est le patron de `MSG_LBC_A_PAYER_CLOUD`, :5833-5856.

### 3.4 Où l'app pose la question
C'est la carte existante, pas un écran d'accueil : Stock › À régler › « Leboncoin : ton nom et ton prénom », `src/stock/EcranIdentiteLbc.jsx`.
- Ajouter deux champs (Prénom, Nom), pré-remplis depuis `platform_settings.leboncoin.identite_vendeur` (lecture de sa propre ligne à l'ouverture) et contrôlés par `identiteVendeurValide`.
- Le bouton « Enregistrer et essayer » fait `fusionnerReglages(['leboncoin','identite_vendeur'], { nom, prenom, enregistre_le })`, puis le `cEstFait` actuel (`champsEclaireur(…, 'geste')`, compare-and-swap sur needs_user). Garder le lien `URL_INFOS_LBC` en secours : `selftest:lbc-identite-carte` § 3 le vérifie.
- Si `last_diagnostic.identite.posee` vaut vrai : « Leboncoin n'a pas accepté ce nom et ce prénom : vérifie-les ».
- Mots du Cloud : la carte a déjà `compteCourantEstCloud()`.
- Le mécanisme « question de champ » (`needsUserField`, mini-éditeur) ne convient pas : il est par article, alors que l'identité est par compte. La carte unique existe déjà et regroupe les 88 tâches.

Une fois les valeurs enregistrées :
1. Un éclaireur part : la carte, la relance, ou handler-watch au plus tard 12 h après.
2. L'extension pose les deux cases, Leboncoin accepte.
3. handler-watch relâche les 87 autres (`ESPACEMENT_REPRISE_MS = 0`, rythme normal de publication).
4. Les tâches suivantes passent sans porte : une publication est passée après le dernier mur.

**Aucun script de réparation** : le cas se répare par ce circuit, avec le geste de la personne. Elle doit avoir l'extension 0.6.193 (elle a la 0.6.192). Depuis le 06/11, `build_min_requis` n'est plus une porte : un éclaireur servi à un poste resté en 0.6.192 rebutera une fois.

## 4. Essai réel (rien n'a été lancé)
- Les deux comptes de test sont reliés à Leboncoin, et aucun n'a jamais buté sur ce mur (0 tâche `lbc_escrow_identite`). Leurs cases sont donc pré-remplies par Leboncoin.
  - Nico (f44b5917) : au Cloud (`cloud_voie` vrai, copie 0.6.191.45898), session Leboncoin vraie (vérifiée le 16/11 08:29), dernière publication Leboncoin le 07/11.
  - Ornella (f8aa02a5) : extension 0.6.192 sur PC, vue à 21:54, session Leboncoin vraie, dernière publication Leboncoin le 17/11 21:16.
- **Essai de non-régression, possible sur l'un ou l'autre** : une annonce de test à ≥ 999 €, avec des photos jamais publiées sur le compte (règle du 30/10), avec la 0.6.193 (Ornella) ou la copie Cloud (Nico).
  - On attend l'avertissement « pré-rempli par Leboncoin, non touché », aucune case modifiée, publication normale, puis retrait.
- **Essai du chemin neuf** : il faut un compte Leboncoin SANS nom ni prénom.
  - Seule voie conforme : Nico ouvre un nouveau compte Leboncoin (son e-mail), sans informations personnelles, et le relie à FillSell sur son PC ou au Cloud. Vider les champs d'un compte existant n'est pas prouvé possible et n'est pas souhaitable.
  - Déroulé : publier l'article de test à 999 € ; il bute (motif) et la carte s'ouvre ; saisir nom et prénom ; « Enregistrer et essayer ».
  - On attend : une visite en quelques secondes ; l'avertissement « posés depuis FillSell » ; adsubmit 2xx ; publication.
  - On relit ensuite `leboncoin.fr/account/private-details`, pour savoir si Leboncoin a enregistré le nom (les dépôts suivants seraient alors pré-remplis).
  - On lève au passage la question ouverte du § 1.1 (cases visibles avant ou après le premier clic).
- **Essai de la relance**, sur le même compte, mur présent, une seconde tâche retenue : « Relancer » depuis la fiche. Attendu : le journal get-pending-jobs « relance de l'app … servie en éclaireur » et une visite immédiate, au lieu de « retenue(s) avant essai ».

## 5. Verrou proposé : `selftest:lbc-identite-saisie`
Brouillon prêt : `(dossier de travail vidé) lbc-identite-saisie-selftest.mjs`, à poser en `scripts/lbc-identite-saisie-selftest.mjs`, script `"selftest:lbc-identite-saisie": "node scripts/lbc-identite-saisie-selftest.mjs"` dans package.json.
- Attention : package.json est modifié en ce moment par un autre terminal (relances Cloud). `git add` du fichier entier, à coordonner.
- Sections :
  1. Relance de l'app après le mur = un essai ; relance avant le mur = retenue ; deux relances = un seul essai ; éclaireur de carte inchangé ; mur après la relance = retenue. Cas réels : d0bdebe8, 20:11:06.740Z, mur 15:36:21.303Z.
  2. get-pending-jobs : `champsEclaireur(…, "relance_app", …)`.
  3. `identiteVendeurValide` et `CLE_IDENTITE_VENDEUR`.
  4. Bloc `⟦identite-escrow⟧` exécuté en vm (vide → posé, pré-rempli → intact, une case, sans nom → question, case inconnue) ; ancienne politique retirée ; appel présent.
  5. background : lecture de `identite_vendeur`, `job.identite_vendeur_lbc`, jamais dans `platform_fields`.
  6. App : `fusionnerReglages(['leboncoin','identite_vendeur'] …)`, aucun `.update` de platform_settings, `'lbc_identite'` dans `MURS_LEVES_A_LA_RELANCE`.

Sortie sur le code actuel (86a0297), le 18/11 vers 22:05 :
```
1. … ✗ la relance de 20:11:06 (après le mur de 15:36) est servie (avant : retenue en 4 s)   servis = []
     ✗ une publication neuve et une relance ANTÉRIEURE au mur restent retenues
     ✗ deux relances au même passage : UN seul essai
     ✓ l'éclaireur de la carte / de handler-watch : inchangé   ✓ un mur VU après la relance : retombe dans la retenue
2. ✗ champsEclaireur(…, "relance_app")   ✓ handler-watch lit toujours identite_lbc.eclaireur_le
3. ✗ identiteVendeurValide exportée   ✗ platform_settings.leboncoin.identite_vendeur
4. ✗ bloc ⟦identite-escrow⟧   ✗ ancienne politique remplacée   ✗ décision appelée avant le Continuer final
5. ✗ lue dans platform_settings…identite_vendeur   ✗ posée sur job.identite_vendeur_lbc
6. ✗ fusionnerReglages   ✓ jamais un .update de platform_settings   ✗ 'lbc_identite' dans MURS_LEVES_A_LA_RELANCE
✗ 13 échec(s) sur 17   (exit 1)
```
- Selftests du sujet à relancer avec : `lbc-identite-carte` (§ 5 : l'assertion « seul l'éclaireur relancé APRÈS le dernier mur part » reste vraie), `lbc-forfait-pro`, `a-regler-sans-bandeau`, `retraits-bloques-connexion`, `depop-vendeur-mur`, `cloud-extension` (patchs Cloud), `marques-exactes` et `champs-lbc-etat-marque` (blocs de leboncoin.js), `lbc-saisie-longue` (typeInto). Puis la suite complète.

## 6. Déploiement (versions lues le 18/11 à 21:54 par `npx supabase functions list`)

| Élément | Avant | À faire |
|---|---|---|
| get-pending-jobs | **v386**, verify_jwt **true** (déployée le 17/11 13:44:55 ; l'état dit 385, une redéploie a eu lieu depuis) | déployer avec verify_jwt true (sans `--no-verify-jwt`, `--yes`) ; relire la version après |
| update-job-status | v206, verify_jwt **false** | seulement si on remplace le texte pour toutes les versions (§ 3.3) : `--no-verify-jwt` |
| handler-watch | v210, verify_jwt **false** | inchangée (la marque `relance_app` suffit) |
| Migration | — | aucune (`platform_settings` en jsonb, RPC générique) ; option : clé protégée par le trigger, par le circuit des migrations |
| Extension | manifest **0.6.192** (lu) | numéro neuf 0.6.193, à relire avant d'écrire ; `npm run package:extension`, puis `build/CWS-0.6.193-A-TELEVERSER/` |
| Copie Cloud | 0.6.191.45898 (Nico) | reconstruire et monter : `EXTENSION_SEULE=1 bash serveur-cloud/outils/deployer.sh …`, feu vert de Nico |
| App | dernière OTA lue dans l'état : 2.9.212 | OTA ≥ 2.9.213 (relire `build.json` et le canal) : EcranIdentiteLbc, `MURS_LEVES_A_LA_RELANCE`, messagesServeur EN ; web en même temps |

Ordre conseillé :
1. get-pending-jobs (la relance devient un essai : utile tout de suite, aucun autre prérequis).
2. Extension 0.6.193 et copie Cloud.
3. OTA de la carte.

Docs à mettre dans le même commit :
- `docs/regles/plateformes.md` : section « 18/11 — Leboncoin : FillSell pose nom et prénom ».
- `docs/regles/republication-et-publication.md` : la relance vaut éclaireur pour le mur d'identité.
- `docs/agents/etat-2026-10-01.md`.

## 7. Constat annexe
**Ce qui se voit.** Le 16/11, 31 visites de Leboncoin ont buté sur le même mur l'une après l'autre, de 16:30 à 17:02, sous la 0.6.186. La porte n'a retenu les suivantes qu'au passage de 17:03:28 (« 52 tâche(s) retenue(s) »), puis à 17:06:48 (12 tâches).

**Hypothèse, non prouvée.** Ces 31 tâches auraient été servies avant le premier mur, puis traitées par le poste depuis sa file locale, sans repasser par la porte. Le moteur de file n'a pas été lu.

**Ce que ça change.** Si nom et prénom sont posés, ces visites passent. Sans identité connue, l'extension pourrait s'arrêter au premier mur `lbc_escrow_identite` pour les autres publications Leboncoin de sa file. C'est à décider par Nico, hors de ce point.
