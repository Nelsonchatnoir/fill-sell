// L'ENTRETIEN HORAIRE du pool — dans l'orchestrateur (il a la clé de service,
// le jeton IPRoyal et le réseau), jamais dans pg_cron :
//   1. cloud_pool_entretien() (réservations échues, comptes qui suivent leur état,
//      échéances, ménage RGPD) ;
//   2. PURGE PROUVÉE de chaque IP partie au repos : conteneur et profil détruits,
//      coffre vidé, session FillSell révoquée, identifiants du proxy changés —
//      la preuve va à cloud_ip_noter_purge (sans elle, l'IP ne sort jamais du repos) ;
//   3. contrôles : entrée des IP livrées, sortie des repos finis ;
//   4. échéances relues chez IPRoyal (renouvellement automatique) ; ce qu'il
//      FAUDRAIT renouveler ou commander est PROPOSÉ par alerte (aucun achat
//      sans le GO de Nico) ;
//   5. alertes : pool vide / presque vide, compte actif sans IP, purge en retard.
// (03/11, point 2 de Nico) Et désormais, tout automatique :
//   0. le PARE-FEU des navigateurs suit le pool (pareFeu.js : la liste écrite, l'hôte la rejoue sans redéploiement) ;
//      aucune IP n'est contrôlée ni visitée tant que la preuve ne porte pas sa sortie ;
//   3 bis. la REQUALIFICATION : une IP disponible au refus de plateforme non prouvé reçoit UNE visite de contrôle de
//      cette plateforme (au plus une par heure ; controle.js), dont le verdict lève ou prouve le refus ;
//   4 bis. la LIVRAISON des commandes, le RENOUVELLEMENT et l'ACHAT sous le stock visé — sous leurs gardes
//      (approvisionnement.js) ; sans elles, une proposition (alerte).
// (07/11, décisions de Nico)
//   1. « IP toujours d'avance » : le stock visé = la MARGE (cloud_ip_marge) + l'attente ; et entre deux entretiens, le
//      RÉAPPROVISIONNEMENT RAPIDE (reapprovisionnerVite, toutes les REAPPRO_RAPIDE_MIN minutes) : lecture de trois petites
//      tables, livraison et contrôle d'entrée des IP achetées, achat dès qu'il manque des IP — mêmes gardes, jamais en
//      même temps qu'un entretien (un seul verrou), jamais une boucle (garde du nombre, pause d'une heure après un échec) ;
//   3. le SOLDE IPRoyal : l'alerte part sous la dépense prévue sur 14 jours (regles.seuilSoldeProjete) et dit combien
//      recharger. (10/11 soir) Les IP se paient par le solde, JAMAIS par carte (approvisionnement.js).
// (07/11 soir, ordres 3 et 4 de Nico)
//   4. LE CONTRÔLE DE SANTÉ des IP libres (controlerSante, toutes les SANTE_IP_MIN minutes, coin_config
//      cloud_ip_sante_controle = 1) : une IP à la fois (cloud-pool.choisirIpASonder), un Chrome jetable (sante.js), sous le
//      MÊME verrou que l'entretien et le réapprovisionnement (jamais deux navigateurs de contrôle ensemble), jamais pendant
//      une pointe de charge ; le verdict va à cloud_ip_sante_noter ; une IP GRILLÉE n'est plus attribuable
//      (cloud_ip_attribuable) et l'alerte part à support@ ; à chaque entretien, l'alerte « IP saines libres sous la marge ».
//   3. LA RÈGLE « SAINES D'ABORD » du renouvellement (planDuJour, sainesSeulement) : coin_config
//      cloud_ip_renouveler_saines_seulement = 1, ET le contrôle de santé allumé (sans lui, aucune santé n'est connue : le
//      plan d'avant, dit par une alerte).
// ⛔ (14/11, règle de Nico : « On ne jette JAMAIS une IP payée ») LE CONTRÔLE D'ENTRÉE NE MET PLUS JAMAIS AU REBUT. Le
//    13/11, l'IP 77 (achetée 13:18) est partie au rebut à 13:22:57 sur UN contrôle sans réponse (sortie et pays vides) ;
//    relue le soir par son proxy : sortie 188.126.2.31, FR. Désormais (cloud-pool.js, section 4 bis) :
//      · ATTENTE : une IP livrée n'est contrôlée qu'après PARAMETRES.controleEntreeDelaiMin (entreeControlable) ;
//      · NOUVEAUX ESSAIS : un écho vide est relu dans le même navigateur (controle.js, releverControle) ;
//      · QUARANTAINE : un contrôle qui reste douteux → cloud_ip_quarantaine_noter (jamais cloud_ip_signaler) ; l'IP est
//        recontrôlée (au plus une par tour, dans le budget de 2 contrôles) et rejoint le pool dès qu'un contrôle passe ;
//      · SIGNALEMENT à Nico (support@, la preuve : chaque contrôle raté) après des échecs répétés étalés sur 24 h — l'IP
//        reste en quarantaine jusqu'à son échéance, jamais jetée.
//    Sans la migration 20261114090000 (colonne ni fonction), un contrôle douteux n'écrit RIEN : l'IP reste « achetee »
//    et se recontrôle au tour suivant — jamais le rebut.
import { mkdir } from 'node:fs/promises';
import { loadavg, cpus } from 'node:os';
import { nouveauProfilId } from './navigateur.js';
import { claims } from './sessionFillsell.js';
import { creerPareFeu, sortieOuverte } from './pareFeu.js';
import { creerApprovisionnement, dateIproyal } from './approvisionnement.js';

export const VISITE_ESPACEMENT_MS = 3600_000;   // (03/11) au plus une visite de contrôle de plateforme par heure
const COLONNES_IPS = 'id, commande, ip, port, etat, user_id, dernier_user_id, attribuee_le, liberee_le, repos_fin, purge_prouvee_le, expire_le, attributions, reserve_pour, reserve_jusqu_au, refus, rebut_critere, rebut_le, livree_le';
/** (07/11 soir) La charge de l'hôte (1 min) par processeur — le conteneur voit celle de l'hôte. */
export const chargeHote = () => loadavg()[0] / Math.max(1, cpus().length);

/**
 * (14/11) LE DÉPHASAGE DU CONTRÔLE DE SANTÉ (pur ; index.js) : une demi-période après le réapprovisionnement rapide. Les deux
 * minuteries partaient au même instant toutes les 5 min ; le réapprovisionnement prenait le verrou commun, la santé le
 * trouvait pris et repartait sans rien faire (« occupe ») — en prod, aucune santé écrite depuis le 12/11 02:28, aucun
 * « sante_ip » au journal du 13/11 soir alors que l'IP 78 était due : plus aucune IP libre « saine », et la règle « saines
 * d'abord » ne renouvelait plus la marge (attribuées + marge) — elle laissait expirer pour racheter.
 */
export function dephasageSanteMs(santeMin, reapproMin) {
  const s = Number(santeMin), r = Number(reapproMin);
  if (!(s > 0) || !(r > 0)) return 0;
  return Math.round((Math.min(s, r) * 60_000) / 2);
}

export function creerEntretien({ config, base, navigateurs, coffre, sessions, iproyal, controles, alertes, regles, journal, fournisseurIp,
  pareFeu = creerPareFeu({ config, journal }), approvisionnement = creerApprovisionnement({ base, iproyal, alertes, journal, regles }),
  sante = null, charge = chargeHote }) {
  let derniereVisite = 0;
  let occupe = false;            // (07/11) UN verrou : l'entretien et le réapprovisionnement rapide ne courent jamais ensemble
  let dernierLambda = null;      // (07/11) le λ du dernier entretien (le réapprovisionnement rapide ne relit pas les essais)
  let santeAbsenteLe = null;     // (07/11 soir) la colonne cloud_ips.sante manquait (migration 20261107190000 pas encore en base)
  let derniereAlerteMarge = 0;   // (07/11 soir) « saines sous la marge » : un rappel toutes les santeAlerteRappelH heures
  let derniereAlerteRegle = 0;
  let quarantaineAbsenteLe = null; // (14/11) la colonne cloud_ips.quarantaine manquait (migration 20261114090000 pas encore en base)
  let controleRenouvellementAbsentLe = null; // (19/11/2026 soir) colonne controle_renouvellement (migration 20261119230000)
  let attendusAbsentLe = null;     // (19/11/2026 soir) fonction cloud_ip_attendus (migration 20261119230000)
  let soldeNote;                   // (20/11/2026 soir, bloc D) le dernier solde écrit en base (cents), relu une fois

  /**
   * (20/11/2026 soir, bloc D de Nico) LE SOLDE IPRoyal NOTÉ EN BASE (coin_config cloud_ip_solde_cents) : la vente du Cloud
   * (cloud_ip_a_venir, migration 20261120230000) promet une place quand le rachat automatique peut payer une IP. Écrit
   * seulement quand il CHANGE (jamais une ligne inchangée réécrite) ; 0 quand les achats sont coupés sur ce serveur
   * (IPROYAL_ACHATS_AUTORISES) : aucune promesse sur un rachat qui ne partira pas. Une écriture ratée : journal, rien d'autre.
   */
  async function noterSolde(s) {
    if (!s || !Number.isFinite(Number(s.montant))) return;
    const cents = iproyal?.achatsAutorises === true ? Math.max(0, Math.floor(Number(s.montant) * 100)) : 0;
    try {
      if (soldeNote === undefined) {
        const { data, error } = await base.rpc('cloud_param', { p_cle: 'ip_solde_cents', p_defaut: -1 });
        if (error) throw new Error(error.message);
        soldeNote = Number(data);
      }
      if (soldeNote === cents) return;
      const { error } = await base.from('coin_config').upsert({ key: 'cloud_ip_solde_cents', value: cents, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw new Error(error.message);
      journal.info('solde_note', { avant: soldeNote, apres: cents });
      soldeNote = cents;
    } catch (e) { journal.alerte('solde_note_echec', { erreur: e.message }); }
  }

  /** Le pool. (07/11 soir) Avec la santé (colonne sante) ; sans elle tant que la migration manque (relu une fois par heure).
   *  (14/11) Pareil pour la quarantaine (colonne quarantaine, migration 20261114090000). */
  async function lireIps() {
    const normaliser = (ips, avecSante, avecQuarantaine, avecControleRenouvellement) => Object.assign((ips ?? []).map((i) => ({ ...i, ip: String(i.ip).replace(/\/32$/, '') })),
      { avecSante, avecQuarantaine, avecControleRenouvellement });
    let sante = santeAbsenteLe == null || Date.now() - santeAbsenteLe > 3600_000;
    let quarantaine = quarantaineAbsenteLe == null || Date.now() - quarantaineAbsenteLe > 3600_000;
    // (19/11/2026 soir) La colonne controle_renouvellement (migration 20261119230000) : sans elle, comme avant.
    let ctrl = controleRenouvellementAbsentLe == null || Date.now() - controleRenouvellementAbsentLe > 3600_000;
    for (let essai = 0; essai < 4; essai++) {
      const colonnes = `${COLONNES_IPS}${sante ? ', sante' : ''}${quarantaine ? ', quarantaine' : ''}${ctrl ? ', controle_renouvellement' : ''}`;
      const { data, error } = await base.from('cloud_ips').select(colonnes);
      if (!error) {
        if (sante) santeAbsenteLe = null;
        if (quarantaine) quarantaineAbsenteLe = null;
        if (ctrl) controleRenouvellementAbsentLe = null;
        return normaliser(data, sante, quarantaine, ctrl);
      }
      const m = String(error.message ?? '');
      if (ctrl && /controle_renouvellement/i.test(m)) { controleRenouvellementAbsentLe = Date.now(); ctrl = false; continue; }
      if (quarantaine && /quarantaine/i.test(m)) {
        if (quarantaineAbsenteLe == null) journal.alerte('quarantaine_colonne_absente', { erreur: m });
        quarantaineAbsenteLe = Date.now(); quarantaine = false; continue;
      }
      if (sante && /sante/i.test(m)) {
        if (santeAbsenteLe == null) journal.alerte('sante_colonne_absente', { erreur: m });
        santeAbsenteLe = Date.now(); sante = false; continue;
      }
      throw new Error(`cloud_ips : ${m}`);
    }
    throw new Error('cloud_ips : illisible');
  }
  /** (19/11/2026, demande de Nico) La fin connue de chaque titulaire d'IP (cloud_ip_titulaires, migration 20261119190000) :
   *  Map id de l'IP → { actif, fin }. null si la fonction manque ou ne répond pas : le plan renouvelle alors toute IP attribuée,
   *  comme avant (jamais couper un client sur une lecture ratée). */
  async function lireTitulaires() {
    try {
      const { data, error } = await base.rpc('cloud_ip_titulaires');
      if (error || !Array.isArray(data)) return null;
      return new Map(data.map((t) => [Number(t.ip_id), { actif: t.actif === true, fin: t.fin_connue ?? null, etat: t.etat_cloud ?? null }]));
    } catch { return null; }
  }
  /**
   * (20/11/2026 18:09, décision de Nico) LE STOCK D'AVANCE : le seuil (regles.seuilStock : max(6, 2 × le pic d'attributions par
   * jour sur 7 jours)) devient la marge de l'achat et de la garde du nombre ; cloud_ip_marge est aligné en base (la garde de
   * cloud_ip_depense_ouvrir le lit), seulement quand il change. Relu au plus toutes les 10 min ; illisible = la marge d'avant.
   */
  let seuilLu = null;
  async function avecSeuilStock(g) {
    if (!g || typeof regles.seuilStock !== 'function') return g;
    if (!seuilLu || Date.now() - seuilLu.le > 10 * 60_000) {
      try {
        const { data, error } = await base.from('cloud_ip_evenements').select('le').eq('nature', 'attribution')
          .gte('le', new Date(Date.now() - 7 * 86_400_000).toISOString());
        if (error) throw new Error(error.message);
        seuilLu = { le: Date.now(), ...regles.seuilStock((data ?? []).map((x) => x.le)) };
        if (Number(g.marge) !== seuilLu.seuil) {
          const { error: e2 } = await base.from('coin_config').update({ value: seuilLu.seuil, updated_at: new Date().toISOString() }).eq('key', 'cloud_ip_marge');
          journal.info('stock_seuil_aligne', { avant: g.marge, apres: seuilLu.seuil, pic: seuilLu.pic, erreur: e2?.message ?? null });
        }
      } catch (e) { journal.alerte('stock_seuil_illisible', { erreur: e.message }); return g; }
    }
    return { ...g, marge: seuilLu.seuil, stockPic: seuilLu.pic };
  }
  /** (19/11/2026 ~14:00) Les lignes de la liste d'attente (petite table, ménage à 30 jours) : la VRAIE attente (regles.attenteVraie). */
  async function lireAttente() {
    const { data, error } = await base.from('cloud_attente').select('inscrit_le, notifie_le, derniere_le, demande_le');
    if (error) throw new Error(`cloud_attente : ${error.message}`);
    return data ?? [];
  }
  /**
   * (19/11/2026 ~14:00, décisions de Nico) LE PLAN SUR DEMANDE : le renouvellement du plan du jour (IP attribuées : leur
   * compte vit à l'échéance ; IP libres : seulement si une demande les attend — marge 0), et l'ACHAT de regles.achatSurDemande
   * (une IP, seulement pour un client qui attend sans IP saine libre, jamais tant qu'un achat est en route). La garde du
   * nombre garde son jeu (cloud_ip_marge) : elle n'arrête qu'une boucle.
   */
  function planSurDemande({ toutes, etat, attente, g, sainesSeulement, titulaires }) {
    const sansPlace = etat?.comptes_sans_place ?? null;
    const demande = (Number(attente) || 0) + (Number(sansPlace) || 0);
    const plan = regles.planDuJour({ ips: toutes, lambda: dernierLambda ?? regles.lambdaMesure(0), enAttente: demande,
      commandesEnCours: etat?.commandes_en_cours ?? 0, marge: 0, comptesSansPlace: sansPlace, sainesSeulement, titulaires });
    // (20/11/2026, règle de Nico) La marge de 2 IP saines libres EN PLUS de l'attente : cloud_ip_marge (g.marge).
    const d = regles.achatSurDemande({ ips: toutes, attente, comptesSansPlace: sansPlace ?? 0, commandesEnCours: etat?.commandes_en_cours ?? 0,
      ...(g?.marge != null ? { marge: g.marge } : {}) });
    plan.aCommander = d.aCommander;
    plan.surDemande = d;
    plan.garde = sansPlace == null ? null : regles.gardeNombre({ ips: toutes, comptesSansPlace: sansPlace, enAttente: attente,
      enCommande: etat?.commandes_en_cours ?? 0, quantite: d.aCommander, marge: g?.marge ?? regles.PARAMETRES?.ipMarge });
    return plan;
  }
  /** (07/11) Le registre des dépenses des 30 derniers jours (petite table) : rythme d'achat, prix, anti-boucle. */
  async function lireRegistre(maintenant = Date.now()) {
    const q = base.from('cloud_ip_commandes').select('id, nature, quantite, statut, prix_usd, demandee_le, ip_id, details');
    const { data, error } = await (typeof q.gte === 'function' ? q.gte('demandee_le', new Date(maintenant - 30 * 86_400_000).toISOString()) : q);
    return error ? [] : (data ?? []);
  }
  /** (07/11) Le prix d'UNE IP 30 jours : le catalogue IPRoyal, sinon le registre, sinon PARAMETRES. */
  async function prixIp(registre) {
    if (iproyal?.disponible && iproyal.catalogueIsp) {
      const p = await iproyal.catalogueIsp().then((c) => Number(c?.prixUnitaireUsd)).catch(() => NaN);
      if (p > 0) return p;
    }
    return regles.prixIpDuRegistre?.(registre) ?? regles.PARAMETRES?.prixIpUsd30j ?? 5.4;
  }
  /**
   * Le contrôle d'une IP (entrée, sortie de repos, (14/11) recontrôle de quarantaine), depuis un navigateur neuf ; le
   * verdict va à la base. (14/11, règle de Nico) Entrée ou quarantaine : un contrôle qui passe → cloud_ip_controle_entree
   * (entrée) ou cloud_ip_quarantaine_noter (retour au pool) ; un contrôle DOUTEUX → cloud_ip_quarantaine_noter, JAMAIS le
   * rebut (cloud_ip_signaler n'est appelé par aucun automate). Une écriture refusée (migration absente) : rien d'écrit,
   * l'IP reste où elle est et se recontrôle au tour suivant.
   */
  async function controlerIp(i, nature) {
    const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: i.id });
    if (!proxyUrl) return false;
    const c = await controles.controler({ ipId: i.id, ip: i.ip, proxyUrl }).catch((e) => { journal.erreur('controle_echec', { ip_id: i.id, erreur: e.message }); return null; });
    if (!c) return true;
    if (nature === 'sortie') {
      const { data } = await base.rpc('cloud_ip_remettre_en_pool', { p_ip: i.id, p_controle: c });
      journal.info('controle_applique', { ip_id: i.id, nature, ok: data?.ok === true, manques: data?.manques ?? [] });
      return true;
    }
    const manques = regles.manquesControle(c, i);
    if (!manques.length) {
      const { data, error } = nature === 'entree'
        ? await base.rpc('cloud_ip_controle_entree', { p_ip: i.id, p_controle: c })
        : await base.rpc('cloud_ip_quarantaine_noter', { p_ip: i.id, p_controle: c, p_quarantaine: null });
      journal.info('controle_applique', { ip_id: i.id, nature, ok: data?.ok === true, manques: data?.manques ?? [], ...(error ? { erreur: error.message } : {}) });
      if (nature === 'quarantaine' && data?.ok === true && i.quarantaine?.signalee_le) {
        await alertes?.signaler('serveur', `IP ${i.id} (${i.ip}) SORTIE DE QUARANTAINE : contrôle passé (sortie ${c.ip_sortie}, ${c.pays}) après `
          + `${i.quarantaine?.essais ?? '?'} contrôle(s) raté(s) — elle rejoint le pool (signalée inutilisable le ${i.quarantaine.signalee_le}).`, { ip_id: i.id });
      }
      return true;
    }
    // Douteuse : la QUARANTAINE (la suivante, calculée ici ; la base revérifie le contrôle elle-même).
    const avant = nature === 'quarantaine' ? (i.quarantaine ?? null) : null;
    let q = regles.quarantaineSuivante(avant, c, { manques, origine: avant?.origine ?? 'controle_entree' });
    const signaler = regles.quarantaineASignaler(q);
    if (signaler) {
      const t = Date.now();
      q = { ...q, signalee_le: new Date(t).toISOString(), prochain_le: new Date(t + regles.quarantaineEspacementMs(q.essais, { signalee: true })).toISOString() };
    }
    const { data, error } = await base.rpc('cloud_ip_quarantaine_noter', { p_ip: i.id, p_controle: c, p_quarantaine: q });
    if (error) {
      journal.alerte('quarantaine_ecriture_refusee', { ip_id: i.id, nature, manques, erreur: error.message });
      return true;
    }
    journal.info('controle_applique', { ip_id: i.id, nature, ok: data?.ok === true, quarantaine: data?.quarantaine === true,
      essais: q.essais, prochain_le: q.prochain_le, manques: data?.manques ?? manques, lectures: c.lectures ?? null });
    if (signaler && data?.quarantaine === true) {
      await alertes?.signaler('serveur', regles.texteSignalementQuarantaine(i, q), { ip_id: i.id, commande: i.commande ?? null, quarantaine: q });
    }
    // (19/11/2026 soir, décision de Nico) Refusée au contrôle d'entrée (remplacementEchecsEntree contrôles ratés) : notée au
    // journal, jamais attribuée — aucun mail à Nico, aucune demande à la main.
    if (data?.quarantaine === true) await noterIpDefectueuse({ ...i, etat: 'quarantaine', quarantaine: q });
    return true;
  }
  /**
   * (19/11/2026 soir, décision de Nico : « plus jamais d'intervention humaine sur les IP ») UNE IP DÉFECTUEUSE (suspecte ou
   * grillée hébergeur / proxy / pays, ou refusée au contrôle d'entrée) : elle reste hors du pool (ni attribuée, ni comptée,
   * ni rachetée pour la remplacer) et le journal la note, UNE fois par adresse et par défaut. AUCUN mail avec un texte à
   * coller au support : ce chemin est supprimé. Le remplacement, s'il existe, passe par l'API du fournisseur retenu ; la
   * relecture horaire des commandes reprend une adresse neuve et la repasse au contrôle d'entrée. Ne lève jamais.
   */
  const defautsNotes = new Set();
  async function noterIpDefectueuse(ip) {
    try {
      const d = regles.remplacementADemander?.(ip);
      if (!d || defautsNotes.has(d.cle)) return null;
      defautsNotes.add(d.cle);
      journal.alerte('ip_defectueuse', { ip_id: ip.id, commande: ip.commande ?? null, motif: d.motif, codes: d.codes });
      return d;
    } catch (e) { journal.alerte('ip_defectueuse_echec', { ip_id: ip?.id ?? null, erreur: e.message }); return null; }
  }
  /** (04/11) Les plateformes dont les visites de contrôle sont coupées (coin_config) ; « * » = lecture ratée, toutes. */
  async function visitesCoupees() {
    const coupees = new Set();
    for (const pf of ['vinted', 'leboncoin', 'beebs', 'depop']) {
      const { data, error } = await base.rpc('cloud_param', { p_cle: `visites_controle_${pf}`, p_defaut: 1 });
      if (error) { coupees.add('*'); break; }
      if (Number(data) === 0) coupees.add(pf);
    }
    return coupees;
  }

  /** (08/11 nuit) Les IP au repos dont le dernier compte n'a réussi AUCUNE connexion pendant qu'il les tenait (ids). Lecture
   *  ratée ou donnée manquante : aucune (le repos de 7 jours reste la règle dans le doute). */
  async function ipsSansConnexionReussie(ips) {
    const ids = new Set();
    const avecTenue = (ips ?? []).filter((i) => i.dernier_user_id && i.attribuee_le && i.liberee_le);
    if (!avecTenue.length) return ids;
    const { data, error } = await base.from('cloud_connexions').select('user_id, ouverte_le')
      .in('user_id', [...new Set(avecTenue.map((i) => i.dernier_user_id))]).eq('statut', 'connectee');
    if (error || !Array.isArray(data)) return ids;
    for (const i of avecTenue) {
      const debut = Date.parse(i.attribuee_le) - 60_000, fin = Date.parse(i.liberee_le);
      const reussie = data.some((c) => c.user_id === i.dernier_user_id && Date.parse(c.ouverte_le) >= debut && Date.parse(c.ouverte_le) <= fin);
      if (!reussie) ids.add(Number(i.id));
    }
    return ids;
  }

  /** (04/11) Le compte tient-il encore une IP, ou son Cloud est-il actif ? Dans le doute (lecture ratée) : oui, jamais de purge. */
  async function compteToujoursActif(user, ips) {
    if ((ips ?? []).some((i) => i.user_id && i.user_id === user)) return true;
    const { data: e, error } = await base.rpc('cloud_etat', { p_user: user });
    if (error) return true;
    return e?.actif === true;
  }

  async function purger(ip) {
    const user = ip.dernier_user_id;
    const { data: poste } = await base.from('cloud_postes').select('session_fillsell_id, details').eq('user_id', user).maybeSingle();
    const ancien = poste?.details?.profil ?? null;
    const c = await coffre.lire(user).catch(() => ({}));
    const sessionCoffre = c.fillsell?.own ? claims(c.fillsell.own.access_token)?.session_id : null;
    // 1. Le navigateur et le profil.
    const { profilsRestants } = await navigateurs.detruire(user, ancien);
    // 2. Le coffre.
    await coffre.vider(user);
    const restants = Object.keys(await coffre.lire(user).catch(() => ({ x: 1 }))).length;
    // 3. La session FillSell posée par le serveur (et elle seule).
    let revoquee = true;
    for (const s of new Set([poste?.session_fillsell_id, sessionCoffre].filter(Boolean))) {
      try { await sessions.revoquer(user, s); } catch (e) { revoquee = false; journal.erreur('purge_revocation_echec', { user, erreur: e.message }); }
    }
    // 4. Les identifiants du proxy.
    let identifiants = false;
    if (iproyal.disponible) {
      try {
        const url = await iproyal.changerIdentifiants(ip.commande, ip.ip);
        const { data } = await base.rpc('cloud_ip_identifiants_changes', { p_ip: ip.id, p_proxy_url: url });
        identifiants = data === true;
      } catch (e) { journal.erreur('purge_identifiants_echec', { ip_id: ip.id, erreur: e.message }); }
    }
    // 5. Un profil NEUF (vide) pour la suite.
    const nouveau = nouveauProfilId(user);
    await mkdir(`${config.dossierProfils}/${nouveau}`, { recursive: true });
    const neufLe = new Date().toISOString();
    await base.rpc('cloud_poste_noter', { p_user: user, p_etat: 'eteint', p_details: { profil: nouveau, session_fillsell_id: '', purge: neufLe } });
    const preuve = {
      version: 1, faite_le: new Date().toISOString(),
      profil: { ancien: ancien ?? `inconnu-${ip.id}`, nouveau, ancien_detruit: profilsRestants === 0, nouveau_cree_le: neufLe },
      cookies_restants: profilsRestants === 0 ? 0 : 1, stockages_restants: profilsRestants === 0 ? 0 : 1,
      coffre_restants: restants, session_fillsell_revoquee: revoquee,
      empreinte: { ancienne: ancien ?? `inconnu-${ip.id}`, nouvelle: nouveau },
      identifiants_proxy_renouveles: identifiants,
    };
    const { data: r } = await base.rpc('cloud_ip_noter_purge', { p_ip: ip.id, p_preuve: preuve });
    journal.info('purge', { ip_id: ip.id, user, ok: r?.ok === true, manques: r?.manques ?? [] });
    if (r?.ok !== true) await alertes.signaler('serveur', `Purge incomplète de l'IP ${ip.id} : ${(r?.manques ?? []).join(', ')}`, { ip_id: ip.id });
    return r;
  }

  /**
   * (30/10, lot D) LA PURGE EN ROTATION — la promesse « effacé au plus tard 3 jours après la fin » (conditions,
   * art. 8 ; confidentialité 4.8). Sans IP attribuée, la purge du 05/10 (déclenchée par l'IP qui part au repos) ne
   * s'éveille jamais : on purge donc PAR COMPTE. Un compte dont le Cloud n'est plus actif (essai fini hors grâce de
   * `grace_jours`, arrêt, fin d'abonnement, compte supprimé) et qui garde des données Cloud (coffre, session FillSell
   * du navigateur, profil non purgé) : navigateur et profil détruits, coffre vidé, session révoquée — à chaque entretien
   * horaire, donc au plus tard grâce (2 j) + 1 h après la fin.
   */
  async function purgerComptesInactifs(maintenant = Date.now()) {
    const [{ data: postes }, { data: coffres }] = await Promise.all([
      base.from('cloud_postes').select('user_id, session_fillsell_id, details'),
      base.from('cloud_coffre').select('user_id'),
    ]);
    const parUser = new Map();
    for (const po of postes ?? []) parUser.set(po.user_id, { poste: po, coffre: false });
    for (const c of coffres ?? []) parUser.set(c.user_id, { ...(parUser.get(c.user_id) ?? { poste: null }), coffre: true });
    const purges = [];
    for (const [user, { poste, coffre: aCoffre }] of parUser) {
      const restes = aCoffre || Boolean(poste?.session_fillsell_id) || (poste?.details?.profil && !poste?.details?.purge);
      if (!restes) continue;
      const { data: e } = await base.rpc('cloud_etat', { p_user: user });
      if (e?.actif === true) continue;
      const fin = Date.parse(String(e?.essaiFin ?? ''));
      const graceJ = Number((await base.rpc('cloud_param', { p_cle: 'grace_jours', p_defaut: 2 })).data ?? 2);
      if (e?.etat === 'essai_termine' && e?.essaiArrete !== true && Number.isFinite(fin) && fin + graceJ * 86_400_000 > maintenant) continue;
      try {
        const c = await coffre.lire(user).catch(() => ({}));
        const sessionCoffre = c.fillsell?.own ? claims(c.fillsell.own.access_token)?.session_id : null;
        const { profilsRestants } = await navigateurs.detruire(user, poste?.details?.profil ?? null);
        await coffre.vider(user);
        let revoquee = true;
        for (const s of new Set([poste?.session_fillsell_id, sessionCoffre].filter(Boolean))) {
          try { await sessions.revoquer(user, s); } catch (err) { revoquee = false; journal.erreur('purge_revocation_echec', { user, erreur: err.message }); }
        }
        const le = new Date().toISOString();
        await base.rpc('cloud_poste_noter', { p_user: user, p_etat: 'eteint', p_details: { purge: le, session_fillsell_id: '', profil_detruit: profilsRestants === 0 } });
        journal.info('purge_compte', { user: String(user).slice(0, 8), etat: e?.etat ?? 'inconnu', profil_detruit: profilsRestants === 0, session_revoquee: revoquee });
        purges.push(user);
        if (profilsRestants !== 0 || !revoquee) await alertes.signaler('serveur', `Purge incomplète du compte ${String(user).slice(0, 8)} (rotation).`);
      } catch (err) { journal.erreur('purge_compte_echec', { user: String(user).slice(0, 8), erreur: err.message }); }
    }
    return purges.length;
  }

  /** (07/11) L'entretien horaire, sous le verrou partagé avec le réapprovisionnement rapide. */
  async function tour() {
    if (occupe) return { occupe: true };
    occupe = true;
    try { return await tourSansVerrou(); } finally { occupe = false; }
  }

  async function tourSansVerrou() {
    const bilan = {};
    // (04/11 soir, essai GPU) ENTRETIEN_POOL=0 : un SECOND serveur (l'essai) ne tient pas le pool — cloud-1 le fait. Seul
    // le pare-feu de SES navigateurs suit le pool (étape 0) : aucune purge, aucun contrôle, aucune visite, aucune échéance,
    // aucun achat, aucune livraison, aucune alerte, aucun cloud_pool_entretien() — jamais deux entretiens du même pool.
    const pool = config?.entretienPool !== false;
    if (pool) {
      const { data: e1, error } = await base.rpc('cloud_pool_entretien');
      if (error) throw new Error(`cloud_pool_entretien : ${error.message}`);
      bilan.base = e1;
    } else bilan.pool = 'coupe';

    let toutes = await lireIps();

    // 0. (03/11) Le pare-feu des navigateurs suit le pool : la liste écrite, l'hôte la rejoue (aucun redéploiement).
    //    Les IP qu'un navigateur ouvert utilise restent permises quoi qu'il arrive.
    const enUsage = (navigateurs?.ouverts?.() ?? []).map((u) => navigateurs.ouvert?.(u)?.ipId).filter((x) => x != null);
    const pf = await pareFeu.synchroniser(toutes, { enUsage })
      .catch((e) => { journal.alerte('pare_feu_synchro_echec', { erreur: e.message }); return null; });
    const appliquees = pf?.appliquees ?? await pareFeu.appliquees().catch(() => null);
    const sortiePermise = (i) => Boolean(appliquees) && sortieOuverte(appliquees, i.ip, i.port ?? 12323);
    bilan.pare_feu = { ecrit: pf?.ecrit ?? false, manquantes: pf?.manquantes?.length ?? null };
    if (!pool) { journal.info('entretien', bilan); return bilan; }

    // 2. Purges
    bilan.purges = 0;
    bilan.purges_refusees = 0;
    for (const ip of toutes.filter((i) => i.etat === 'repos' && !i.purge_prouvee_le && i.dernier_user_id)) {
      // ⛔ (04/11, incident de 12:25 — règle de Nico : « ne plus jamais repartir de zéro ») La purge détruit le profil,
      // vide le coffre (cookies DataDome compris) et révoque la session : elle n'est due qu'à un compte qui PART. Un compte
      // qui tient encore une IP, ou dont le Cloud est actif, n'est JAMAIS purgé parce qu'une de ses IP est au repos (le
      // 04/11, cloud_ip_liberer sur un compte actif a fait effacer Vinted, Leboncoin, Depop). L'IP reste au repos, dite.
      if (await compteToujoursActif(ip.dernier_user_id, toutes)) {
        bilan.purges_refusees++;
        journal.alerte('purge_refusee_compte_actif', { ip_id: ip.id, user: String(ip.dernier_user_id).slice(0, 8) });
        continue;
      }
      await purger(ip).catch((e) => journal.erreur('purge_echec', { ip_id: ip.id, erreur: e.message }));
      bilan.purges++;
    }

    // 3. Contrôles (au plus 2 par heure : chacun allume un navigateur)
    let controlesFaits = 0;
    // (08/11/2026 nuit, décision de Nico : « on peut les réattribuer, celles où la connexion n'a jamais réussi ») Une IP
    // au repos, purge prouvée, dont le dernier compte n'a réussi AUCUNE connexion pendant qu'il la tenait, sort du repos
    // sans attendre ses 7 jours (cloud_ip_remettre_en_pool, migration 20261108233000, refait la même vérification).
    const sansConnexion = await ipsSansConnexionReussie(toutes.filter((i) => i.etat === 'repos' && i.purge_prouvee_le
      && Date.parse(i.repos_fin) > Date.now()));
    bilan.repos_sans_connexion = [...sansConnexion];
    // (14/11, règle de Nico) L'entrée attend controleEntreeDelaiMin après la livraison (le proxy d'IPRoyal n'est pas actif
    // tout de suite) ; puis la quarantaine due (une par tour), après l'entrée et la sortie de repos.
    const achetees = toutes.filter((i) => i.etat === 'achetee');
    const entreesPretes = achetees.filter((i) => regles.entreeControlable?.(i) ?? true);
    if (entreesPretes.length < achetees.length) bilan.entrees_reportees = achetees.length - entreesPretes.length;
    const quarantaineDue = regles.choisirQuarantaineARecontroler?.(toutes, { permise: sortiePermise }) ?? null;
    if (toutes.some((i) => i.etat === 'quarantaine')) {
      bilan.quarantaine = { ips: toutes.filter((i) => i.etat === 'quarantaine').map((i) => i.id), due: quarantaineDue?.id ?? null };
    }
    const aControler = [
      ...entreesPretes.map((i) => ({ i, nature: 'entree' })),
      ...toutes.filter((i) => i.etat === 'repos' && i.purge_prouvee_le && (Date.parse(i.repos_fin) <= Date.now() || sansConnexion.has(Number(i.id))))
        .map((i) => ({ i, nature: 'sortie' })),
      ...(quarantaineDue ? [{ i: quarantaineDue, nature: 'quarantaine' }] : []),
    ];
    for (const { i, nature } of aControler) {
      if (controlesFaits >= 2) break;
      // (03/11) Jamais un contrôle par une sortie que le pare-feu n'a pas encore ouverte : il échouerait et jetterait l'IP.
      if (!sortiePermise(i)) { journal.info('controle_reporte_pare_feu', { ip_id: i.id, nature }); continue; }
      if (await controlerIp(i, nature)) controlesFaits++;
    }
    bilan.controles = controlesFaits;

    // 3 bis. (03/11) LA REQUALIFICATION : une visite de contrôle de la plateforme qui a refusé, sur une IP DISPONIBLE
    //        (jamais une IP tenue par un compte), au plus une par heure, seulement si le pare-feu ouvre sa sortie.
    bilan.visite = null;
    // (04/11, accord de Nico) L'INTERRUPTEUR DES VISITES DE CONTRÔLE, par plateforme : coin_config
    // `cloud_visites_controle_<plateforme>` = 0 → aucune visite de cette plateforme, depuis aucune IP. Chaque visite
    // présente à la plateforme notre navigateur sans cookie, depuis une IP du pool ; pendant le chantier Beebs, aucune.
    // Une lecture ratée de l'interrupteur coupe la visite (jamais une visite sur un doute).
    const coupees = await visitesCoupees();
    bilan.visites_coupees = [...coupees];
    if (controles?.visiterPlateforme && controlesFaits < 2 && Date.now() - derniereVisite >= VISITE_ESPACEMENT_MS) {
      const { data: aVisiter } = await base.rpc('cloud_ip_a_visiter');
      const parId = new Map(toutes.map((i) => [Number(i.id), i]));
      const v = (aVisiter ?? []).find((x) => !coupees.has(x.plateforme) && !coupees.has('*')
        && parId.get(Number(x.ip_id)) && sortiePermise(parId.get(Number(x.ip_id))));
      if (v) {
        derniereVisite = Date.now();
        const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: v.ip_id });
        if (proxyUrl) {
          const visite = await controles.visiterPlateforme({ ipId: v.ip_id, proxyUrl, plateforme: v.plateforme })
            .catch((e) => { journal.erreur('visite_controle_echec', { ip_id: v.ip_id, erreur: e.message }); return null; });
          if (visite) {
            const { data: r } = await base.rpc('cloud_ip_refus_visite', { p_ip: v.ip_id, p_plateforme: v.plateforme, p_visite: visite });
            bilan.visite = { ip_id: v.ip_id, plateforme: v.plateforme, verdict: visite.verdict, issue: r?.issue ?? r?.raison ?? null };
            journal.info('requalification', bilan.visite);
          }
        }
      }
    }

    // 4. Échéances relues (lecture seule), plan proposé. (19/11/2026) Une lecture par COMMANDE, qui relit aussi l'ADRESSE :
    //    une IP remplacée par IPRoyal dans la même commande reçoit la nouvelle et repasse le contrôle d'entrée
    //    (approvisionnement.relireCommandes, cloud_ip_remplacee, migration 20261119190000) ; sinon, l'échéance seule, comme avant.
    if (iproyal.disponible && typeof approvisionnement?.relireCommandes === 'function') {
      bilan.commandes = await approvisionnement.relireCommandes(toutes)
        .catch((e) => { journal.alerte('commandes_illisibles', { erreur: e.message }); return null; });
      if (bilan.commandes?.remplacees?.length) toutes = await lireIps();
    } else if (iproyal.disponible) {
      for (const i of toutes.filter((x) => !['expiree', 'rebut'].includes(x.etat))) {
        try {
          const cmd = await iproyal.lireCommande(i.commande);
          const fin = dateIproyal(cmd?.expire_date);
          if (Number.isFinite(fin) && fin > Date.parse(i.expire_le)) {
            await base.rpc('cloud_ip_renouvelee', { p_ip: i.id, p_expire_le: new Date(fin).toISOString() });
          }
        } catch (e) { journal.alerte('echeance_illisible', { ip_id: i.id, erreur: e.message }); }
      }
    }
    // (07/11) Les réglages (marge, interrupteurs, moyen de paiement), le registre des 30 derniers jours, l'état du pool.
    const g = await avecSeuilStock(await approvisionnement.gardes().catch((e) => { journal.alerte('gardes_illisibles', { erreur: e.message }); return null; }));
    const registre = await lireRegistre().catch(() => []);
    let { data: etat } = await base.rpc('cloud_pool_etat');
    // (30/10, lot D ; 07/11, décision 3) Le solde du fournisseur (lecture seule, aucune recharge) : l'alerte part sous la
    // dépense prévue sur 14 jours. (10/11 soir) Plus de paiement par carte : le solde est TOUJOURS surveillé.
    // (19/11/2026) Les titulaires : une IP d'un compte fini avant son échéance n'est ni renouvelée ni comptée au solde.
    const titulaires = await lireTitulaires();
    // (19/11/2026 ~14:00, décision de Nico) L'ACHAT SUR DEMANDE (coin_config cloud_ip_achat_sur_demande = 1, script des réglages) : plus
    // aucune IP achetée ni renouvelée d'avance pour la marge ; la VRAIE attente (lignes de cloud_attente : inscrits, ou essai
    // de moins de 24 h) fait la demande. cloud_ip_marge ne reste que le jeu de la garde du nombre.
    const surDemande = g?.surDemande === true && typeof regles.achatSurDemande === 'function';
    const lignesAttente = await lireAttente().catch(() => null);
    const attente = lignesAttente && regles.attenteVraie ? regles.attenteVraie(lignesAttente) : (etat?.en_attente ?? 0);
    const projection = regles.seuilSoldeProjete
      ? regles.seuilSoldeProjete({ ips: toutes, registre, marge: surDemande ? 0 : (g?.marge ?? regles.PARAMETRES?.ipMarge),
        enAttente: surDemande ? attente : (etat?.en_attente ?? 0), prixIpUsd: await prixIp(registre), titulaires })
      : null;
    bilan.solde = await fournisseurIp?.verifierSolde(Date.now(), { projection, alerter: true })
      .catch((e2) => { journal.alerte('solde_echec', { erreur: e2.message }); return null; }) ?? null;
    await noterSolde(bilan.solde);   // (20/11/2026 soir, bloc D) la vente le lit (cloud_ip_a_venir)
    // En ROTATION, un compte n'attend jamais une IP dédiée : pas de plan d'achat ni d'alerte « pool vide ».
    if (await fournisseurIp?.rotationActive().catch(() => false)) {
      bilan.rotation = true;
      bilan.purges_comptes = await purgerComptesInactifs().catch((e2) => { journal.erreur('purge_comptes_echec', { erreur: e2.message }); return null; });
      journal.info('entretien', bilan);
      return bilan;
    }
    // 4 bis. (03/11) Les commandes livrées entrent au pool (contrôle d'entrée au tour suivant, sortie ouverte d'abord).
    const livraison = await approvisionnement.livrer().catch((e) => { journal.alerte('livraisons_echec', { erreur: e.message }); return null; });
    bilan.livraisons = livraison?.livrees ?? null;
    // (07/11) Une livraison a fermé des commandes et ajouté des IP : le pool et l'état sont RELUS — sinon le plan ne
    // verrait ni la commande (fermée) ni ses IP (lues avant) et rachèterait ce qui vient d'arriver.
    // (20/11/2026 soir, bloc D) Pareil pour un achat à l'issue inconnue relu chez IPRoyal (adopté ou clos).
    if (bilan.livraisons > 0 || livraison?.relues > 0) { toutes = await lireIps(); ({ data: etat } = await base.rpc('cloud_pool_etat')); }
    dernierLambda = regles.lambdaMesure(etat?.essais_7j ?? 0);
    const sainesSeulement = await regleSaines(g, toutes);
    const plan = surDemande
      ? planSurDemande({ toutes, etat, attente, g, sainesSeulement, titulaires })
      : regles.planDuJour({ ips: toutes, lambda: dernierLambda,
        enAttente: etat?.en_attente ?? 0, commandesEnCours: etat?.commandes_en_cours ?? 0,
        marge: g?.marge ?? regles.PARAMETRES?.ipMarge, comptesSansPlace: etat?.comptes_sans_place ?? null, sainesSeulement, titulaires });
    bilan.plan = { renouveler: plan.renouveler.length, laisserExpirer: plan.laisserExpirer.length, aCommander: plan.aCommander, niveau: plan.niveau, vise: plan.vise,
      ...(plan.surDemande ? { sur_demande: plan.surDemande } : {}),
      garde: plan.garde ? { comptees: plan.garde.comptees, borne: plan.garde.borne, ok: plan.garde.ok } : null,
      ...(sainesSeulement ? { saines_seulement: true, projete_saines: plan.projeteSaines, a_controler: plan.aControler } : {}) };
    // (07/11 soir, ordre 4) Le bilan de santé des IP libres et l'alerte « saines sous la marge » (contrôle allumé seulement).
    if (g?.santeControle && toutes.avecSante && regles.bilanSante) {
      bilan.sante = regles.bilanSante(toutes, { marge: g.marge });
      const rappel = (regles.PARAMETRES?.santeAlerteRappelH ?? 6) * 3600_000;
      if (bilan.sante.sousMarge && Date.now() - derniereAlerteMarge >= rappel) {
        derniereAlerteMarge = Date.now();
        const s = bilan.sante;
        await alertes?.signaler('serveur', `IP saines libres SOUS LA MARGE (contrôle de santé) : ${s.saines} saine(s) pour une marge de ${s.marge} — `
          + `${s.suspectes} suspecte(s), ${s.inconnues} pas encore contrôlée(s), ${s.grillees} grillée(s) sur ${s.libres} IP libres. `
          + `${g.achatsAuto ? 'L\'achat automatique reconstitue la marge (cloud_ip_achats_auto = 1).' : 'Achats automatiques COUPÉS (cloud_ip_achats_auto = 0) : la marge ne se reconstitue pas seule.'}`, { sante: s });
      }
    }
    // (03/11) Renouveler puis acheter, sous leurs gardes ; sans elles, une proposition (approvisionnement.js).
    if (g && (plan.renouveler.length || plan.aCommander > 0)) {
      const soldeVivant = bilan.solde ? { ...bilan.solde } : null;
      bilan.renouvellements = await approvisionnement.renouveler(plan, toutes, g, soldeVivant, { registre })
        .catch((e) => { journal.erreur('renouvellements_echec', { erreur: e.message }); return null; });
      // (20/11/2026 soir, bloc D de Nico) Un compte Cloud actif attend une IP : un achat raté est réessayé dans 5 min (au plus 3 par heure).
      bilan.achat = await approvisionnement.acheter(plan, g, soldeVivant, { projection, enAttente: etat?.en_attente ?? 0,
        urgent: (Number(etat?.comptes_sans_place) || 0) > 0 })
        .catch((e) => { journal.erreur('achat_echec', { erreur: e.message }); return null; });
      if (bilan.achat?.fait) await noterSolde(soldeVivant);
    }

    // 5. Alertes
    const decision = regles.deciderAlerte({ niveau: plan.niveau, attribuables: etat?.attribuables_essai ?? 0,
      seuilCommande: plan.seuils.commande, sansPlace: etat?.comptes_sans_place ?? 0 });
    // (14/11, complément 3 point 2 de Nico) Un MAIL seulement quand un client attend une place SANS IP saine disponible
    // (_shared/alertes-nico.js, alertePool) — un pool à la marge ou presque vide sans personne qui attend : journal seul.
    // Revu sain à ce passage : le problème est résolu (le prochain renverra un mail).
    const regleNico = await alertes?.regle?.();
    // (19/11/2026) En route : les IP achetées (contrôle d'entrée à venir), les commandes en cours, l'achat de ce tour.
    const enRoute = toutes.filter((i) => i.etat === 'achetee').length + (Number(etat?.commandes_en_cours) || 0)
      + (bilan.achat?.fait ? Number(bilan.achat.quantite) || 0 : 0);
    // (19/11/2026 ~14:00) Sur demande : la VRAIE attente ; le rachat qui tourne avec une IP en route sert la personne dans les
    // minutes (pas d'alerte) ; achats coupés : l'alerte part (Nico prévenu).
    const poolNico = regleNico?.alertePool({ sansPlace: etat?.comptes_sans_place ?? 0, enAttente: surDemande ? attente : (etat?.en_attente ?? 0),
      sainesLibres: bilan.sante?.saines ?? null, inconnuesLibres: bilan.sante?.inconnues ?? null, enRoute, attribuables: etat?.attribuables_essai ?? 0,
      achatsCoupes: !(g?.envAutorise && g?.achatsAuto) })
      ?? { alerte: 'orchestrateur.pool_marge', cle: 'pool', sansIp: false };
    if (decision.action === 'alerte') {
      await alertes.signaler(decision.niveau, decision.niveau === 'sans_place'
        ? `${etat?.comptes_sans_place} compte(s) Cloud actif(s) SANS IP : achète une IP (essai en attente : ${etat?.en_attente ?? 0}).`
        : `Pool ${decision.niveau === 'vide' ? 'VIDE' : 'presque vide'} : ${etat?.attribuables_essai ?? 0} IP libre(s), ${etat?.en_attente ?? 0} personne(s) attendent une place.`, { etat },
        { alerte: poolNico.alerte, cle: poolNico.cle });
    } else if (poolNico.sansIp) {
      // Des IP libres, mais aucune SAINE (contrôle de santé) alors que quelqu'un attend : le même problème.
      await alertes.signaler('serveur', `${etat?.en_attente ?? 0} personne(s) attendent une place Cloud et aucune IP SAINE n'est libre `
        + `(${bilan.sante?.libres ?? '?'} libre(s) : ${bilan.sante?.suspectes ?? '?'} suspecte(s), ${bilan.sante?.grillees ?? '?'} grillée(s), `
        + `${bilan.sante?.inconnues ?? '?'} pas encore contrôlée(s)).`, { etat, sante: bilan.sante ?? null }, { alerte: poolNico.alerte, cle: poolNico.cle });
    }
    if (!poolNico.sansIp) await alertes?.resoudre?.('orchestrateur.client_sans_ip', 'pool');
    // (19/11/2026, décision 3 de Nico : « un client peut arriver à tout moment ») Stock d'IP saines VIDE — ni libre saine, ni
    // livrée à contrôler, ni en route —, même sans personne qui attend : UN mail par incident (orchestrateur.stock_ip_vide),
    // résolu quand une IP revient. Quelqu'un attend déjà : l'alerte « client sans IP » ci-dessus le dit (jamais deux mails).
    if (poolNico.stockVide && !poolNico.sansIp) {
      await alertes.signaler('serveur', `Stock d'IP Cloud VIDE : plus aucune IP saine libre ni en route pour un nouveau client `
        + `(${bilan.sante?.libres ?? '?'} libre(s) : ${bilan.sante?.grillees ?? '?'} grillée(s), ${bilan.sante?.suspectes ?? '?'} suspecte(s)). `
        + (g?.achatsAuto ? `Achat automatique : ${bilan.achat?.raison ? `NON fait (${bilan.achat.raison})` : 'rien demandé à ce passage'}.` : 'Achats automatiques COUPÉS (cloud_ip_achats_auto = 0).'),
      { etat, sante: bilan.sante ?? null, achat: bilan.achat ?? null }, { alerte: poolNico.alerteStock ?? 'orchestrateur.stock_ip_vide', cle: 'pool' });
    } else if (!poolNico.stockVide) await alertes?.resoudre?.('orchestrateur.stock_ip_vide', 'pool');
    if ((etat?.purges_en_retard ?? 0) > 0) await alertes.signaler('serveur', `${etat.purges_en_retard} purge(s) en retard de plus d'une heure.`);
    // (07/11) La garde du nombre ne compte pas le rebut : une série d'IP jetées serait une boucle qu'elle ne voit pas — elle
    // est DITE ici ; au contrôle d'ENTRÉE, au-delà de PARAMETRES.ipRebutsEntreeMax en 24 h, l'achat automatique se suspend.
    if ((etat?.rebuts_24h ?? 0) >= 2) await alertes.signaler('serveur', `${etat.rebuts_24h} IP envoyées au rebut en 24 h (dont ${plan.rebutsEntree24h ?? '?'} au contrôle d'entrée) : à partir de ${regles.PARAMETRES?.ipRebutsEntreeMax ?? 3} au contrôle d'entrée, l'achat automatique se suspend 24 h. Relire cloud_ip_evenements.`);
    // (14/11) Plus de rebut au contrôle d'entrée : les IP refusées à l'entrée sont en QUARANTAINE (recontrôlées) — une série
    // reste une boucle possible (IPRoyal livre des IP mortes ?) : dite ici, et l'achat se suspend à ipRebutsEntreeMax.
    else if ((plan.rebutsEntree24h ?? 0) >= 2) await alertes.signaler('serveur', `${plan.rebutsEntree24h} IP refusées au contrôle d'entrée en 24 h, en QUARANTAINE (recontrôlées, jamais jetées) : à partir de ${regles.PARAMETRES?.ipRebutsEntreeMax ?? 3}, l'achat automatique se suspend 24 h. Relire cloud_ip_evenements (nature quarantaine).`);
    bilan.etat = { attribuables: etat?.attribuables_essai, en_attente: etat?.en_attente, sans_place: etat?.comptes_sans_place };
    journal.info('entretien', bilan);
    return bilan;
  }

  /** (07/11) Les IP des achats en cours (registre : « demandee », « en_cours ») — une petite table. */
  async function achatsEnCours() {
    const { data, error } = await base.from('cloud_ip_commandes').select('quantite').eq('nature', 'achat').in('statut', ['demandee', 'en_cours']);
    if (error) throw new Error(`cloud_ip_commandes : ${error.message}`);
    return (data ?? []).reduce((n, c) => n + (Number(c.quantite) || 0), 0);
  }
  async function personnesEnAttente() {
    const { count, error } = await base.from('cloud_attente').select('user_id', { count: 'exact', head: true });
    if (error) throw new Error(`cloud_attente : ${error.message}`);
    return Number(count) || 0;
  }

  /**
   * (07/11, décision 1 de Nico : « IP toujours d'avance ; la liste d'attente n'est qu'un filet ») LE RÉAPPROVISIONNEMENT
   * RAPIDE — toutes les REAPPRO_RAPIDE_MIN minutes (index.js). Rien sans IPROYAL_ACHATS_AUTORISES=1 (aucune lecture) ni
   * sans cloud_ip_achats_auto = 1 ; sinon trois petites lectures (cloud_ips, achats en cours, attente). Puis, seulement
   * s'il y a lieu : la livraison des commandes en cours (IPRoyal), le pare-feu et le contrôle d'entrée d'UNE IP achetée
   * (elle devient attribuable sans attendre l'heure), et l'achat de ce qui manque à la marge — mêmes gardes que
   * l'entretien (garde du nombre en JS et en base, pause d'une heure après un échec). Jamais pendant un entretien (même
   * verrou) ; jamais deux achats ensemble (le verrou ici, la base sous verrou entre serveurs).
   */
  /**
   * (19/11/2026 ~14:00, demande de Nico pendant la coupure du rachat) Une personne attend VRAIMENT une place (regles.
   * attenteVraie) et aucune IP SAINE n'est libre, alors que rien ne s'achète seul (interrupteur ou serveur coupé) : Nico est
   * prévenu TOUT DE SUITE — au réapprovisionnement rapide (toutes les 5 min), plus à l'entretien horaire seulement — par
   * l'alerte « client sans IP » (orchestrateur.client_sans_ip, clé « pool » : UN mail par incident ; l'entretien la résout
   * quand une IP saine revient). Deux petites lectures (cloud_ips, cloud_attente) ; jamais un achat.
   */
  async function alerteClientSansIpCoupure(raison) {
    try {
      const lignes = await lireAttente();
      const attente = regles.attenteVraie ? regles.attenteVraie(lignes) : lignes.length;
      if (attente <= 0) return { attente: 0 };
      const toutes = await lireIps();
      const saines = toutes.filter((i) => i.etat === 'disponible' && regles.ipAttribuable?.(i, { nature: 'essai', userId: null })
        && regles.santeConnue?.(i) === 'saine').length;
      if (saines > 0) return { attente, saines };
      await alertes?.signaler('serveur', `${attente} personne(s) attendent une place Cloud et aucune IP SAINE n'est libre — achats automatiques COUPÉS `
        + `(${raison === 'serveur' ? 'IPROYAL_ACHATS_AUTORISES sur le serveur' : 'cloud_ip_achats_auto = 0'}) : rien ne s'achète seul. `
        + `IP libres : ${toutes.filter((i) => i.etat === 'disponible').length} (aucune saine), en route : ${toutes.filter((i) => i.etat === 'achetee').length}.`,
      { attente, saines: 0, coupe: raison }, { alerte: 'orchestrateur.client_sans_ip', cle: 'pool' });
      return { attente, saines: 0, alerte: true };
    } catch (e) { journal.alerte('attente_illisible', { erreur: e.message }); return null; }
  }

  async function reapprovisionnerVite() {
    if (config?.entretienPool === false) return { pool: 'coupe' };
    if (iproyal?.achatsAutorises !== true) return { coupe: 'serveur', attente: await alerteClientSansIpCoupure('serveur') };
    if (occupe) return { occupe: true };
    occupe = true;
    try {
      const g0 = await approvisionnement.gardes();
      if (!g0?.envAutorise || !g0?.achatsAuto) return { coupe: 'interrupteur', attente: await alerteClientSansIpCoupure('interrupteur') };
      const g = await avecSeuilStock(g0);   // (20/11 18:09) le seuil du stock d'avance, seulement si l'achat est permis
      if (await fournisseurIp?.rotationActive?.().catch(() => false)) return { rotation: true };
      const bilan = {};
      let toutes = await lireIps();
      let enCommande = await achatsEnCours();
      if (enCommande > 0) {
        const liv = await approvisionnement.livrer().catch((e) => { journal.alerte('livraisons_echec', { erreur: e.message }); return null; });
        bilan.livraisons = liv?.livrees ?? 0;
        // (20/11/2026 soir, bloc D) Un achat à l'issue inconnue relu (adopté ou clos) change aussi ce qui est en route : relu.
        if (bilan.livraisons > 0 || liv?.relues > 0) { toutes = await lireIps(); enCommande = await achatsEnCours(); }
      }
      // (14/11, règle de Nico) L'entrée attend controleEntreeDelaiMin après la livraison ; sans entrée à faire, UN
      // recontrôle de quarantaine dû (le premier tombe 15 min après l'échec : il ne doit pas attendre l'heure).
      const achetees = toutes.filter((i) => i.etat === 'achetee' && (regles.entreeControlable?.(i) ?? true));
      const quarantaines = Boolean(regles.choisirQuarantaineARecontroler?.(toutes));   // un recontrôle DÛ (pare-feu vu ensuite)
      if ((achetees.length || quarantaines) && controles?.controler) {
        const enUsage = (navigateurs?.ouverts?.() ?? []).map((u) => navigateurs.ouvert?.(u)?.ipId).filter((x) => x != null);
        const pf = await pareFeu.synchroniser(toutes, { enUsage }).catch((e) => { journal.alerte('pare_feu_synchro_echec', { erreur: e.message }); return null; });
        const appliquees = pf?.appliquees ?? await pareFeu.appliquees().catch(() => null);
        const permise = (x) => Boolean(appliquees) && sortieOuverte(appliquees, x.ip, x.port ?? 12323);
        const i = achetees.find(permise);
        if (i && await controlerIp(i, 'entree')) { bilan.controle = i.id; toutes = await lireIps(); }
        else if (!i && quarantaines) {
          const q = regles.choisirQuarantaineARecontroler?.(toutes, { permise }) ?? null;
          if (q && await controlerIp(q, 'quarantaine')) { bilan.recontrole_quarantaine = q.id; toutes = await lireIps(); }
        }
      }
      const lambda = dernierLambda ?? regles.lambdaMesure(0);
      const sainesSeulement = await regleSaines(g, toutes);
      // (19/11/2026 ~14:00, décision de Nico) Sur demande : la VRAIE attente fait la demande ; une IP à la fois, jamais tant
      // qu'un achat est en route ; jamais pour remplacer une IP mauvaise (regles.achatSurDemande).
      const surDemande = g?.surDemande === true && typeof regles.achatSurDemande === 'function';
      const attenteVraie = surDemande ? await lireAttente().then((l) => regles.attenteVraie(l)).catch(() => null) : null;
      const attenteAvant = surDemande ? (attenteVraie ?? await personnesEnAttente()) : await personnesEnAttente();
      const avant = surDemande
        ? regles.achatSurDemande({ ips: toutes, attente: attenteAvant, comptesSansPlace: 0, commandesEnCours: enCommande, ...(g?.marge != null ? { marge: g.marge } : {}) })
        : regles.planDuJour({ ips: toutes, lambda, enAttente: attenteAvant, commandesEnCours: enCommande, marge: g.marge, sainesSeulement });
      if (avant.aCommander <= 0) {
        if (Object.keys(bilan).length) journal.info('reappro_rapide', { ...bilan, aCommander: 0, ...(surDemande ? { sur_demande: avant } : {}) });
        return { ...bilan, aCommander: 0, ...(surDemande ? { raison: avant.raison } : {}) };
      }
      // Il manque des IP : l'état du pool (comptes actifs sans IP) porte la garde du nombre ; puis l'achat.
      const { data: etat, error } = await base.rpc('cloud_pool_etat');
      if (error) throw new Error(`cloud_pool_etat : ${error.message}`);
      const attente = surDemande ? attenteAvant : (etat?.en_attente ?? 0);
      const plan = surDemande
        ? planSurDemande({ toutes, etat: { ...etat, commandes_en_cours: etat?.commandes_en_cours ?? enCommande }, attente, g, sainesSeulement, titulaires: null })
        : regles.planDuJour({ ips: toutes, lambda, enAttente: attente, commandesEnCours: etat?.commandes_en_cours ?? enCommande,
          marge: g.marge, comptesSansPlace: etat?.comptes_sans_place ?? null, sainesSeulement });
      bilan.aCommander = plan.aCommander;
      if (plan.aCommander > 0) {
        const solde = await fournisseurIp?.solde?.().catch(() => null) ?? null;
        // (19/11/2026, décision 2 de Nico) La projection de 14 jours (prix du registre : aucun appel de plus à IPRoyal) : un
        // achat refusé faute de solde dit le montant à recharger et les clients refusés — un mail par incident.
        const registre = await lireRegistre().catch(() => []);
        const projection = regles.seuilSoldeProjete ? regles.seuilSoldeProjete({ ips: toutes, registre, marge: surDemande ? 0 : g.marge, enAttente: attente,
          prixIpUsd: regles.prixIpDuRegistre?.(registre) ?? regles.PARAMETRES?.prixIpUsd30j, titulaires: await lireTitulaires() }) : null;
        // (20/11/2026 soir, bloc D de Nico) Le solde lu est noté en base (la vente le lit) ; un compte Cloud actif attend une IP :
        // un achat raté est réessayé au tour suivant (5 min), au plus 3 par heure.
        const soldeVivant = solde ? { ...solde } : null;
        await noterSolde(solde);
        bilan.achat = await approvisionnement.acheter(plan, g, soldeVivant, { projection, enAttente: attente,
          urgent: (Number(etat?.comptes_sans_place) || 0) > 0 });
        if (bilan.achat?.fait) await noterSolde(soldeVivant);
      }
      journal.info('reappro_rapide', { ...bilan, vise: plan.vise, projete: plan.projete,
        garde: plan.garde ? { comptees: plan.garde.comptees, borne: plan.garde.borne, ok: plan.garde.ok } : null });
      return bilan;
    } finally { occupe = false; }
  }

  /**
   * (07/11 soir, ordre 3 de Nico) La règle « saines d'abord » s'applique-t-elle ? Le réglage (cloud_ip_renouveler_saines_
   * seulement = 1) ET le contrôle de santé allumé ET la santé lue en base. Demandée sans eux : la règle d'avant, dite.
   */
  async function regleSaines(g, toutes) {
    if (!g?.sainesSeulement) return false;
    if (g.santeControle && toutes?.avecSante) return true;
    if (Date.now() - derniereAlerteRegle >= (regles.PARAMETRES?.santeAlerteRappelH ?? 6) * 3600_000) {
      derniereAlerteRegle = Date.now();
      await alertes?.signaler('serveur', `Règle « saines d'abord » demandée (cloud_ip_renouveler_saines_seulement = 1) mais ${!g.santeControle
        ? 'le contrôle de santé est coupé (cloud_ip_sante_controle = 0)' : 'la colonne cloud_ips.sante manque (migration 20261107190000)'} : aucune santé connue, le renouvellement suit la règle d'avant.`);
    }
    return false;
  }

  /**
   * (07/11 soir, ordre 4 de Nico : « ce contrôle de santé doit tourner seul, régulièrement, sur toutes les IP libres ; une IP
   * grillée n'est jamais donnée à un client ») LE CONTRÔLE DE SANTÉ — toutes les SANTE_IP_MIN minutes (index.js). Rien
   * sans coin_config cloud_ip_sante_controle = 1 (une seule lecture). Sinon, sous le verrou de l'entretien (jamais deux
   * navigateurs de contrôle ensemble), hors pointe de charge (PARAMETRES.santeChargeMax), UNE IP (choisirIpASonder : libre,
   * ni réservée ni en usage, sortie ouverte par le pare-feu ; suspectes, jamais contrôlées, puis au plus tard toutes les
   * 20 h) contrôlée par un Chrome jetable (sante.js) ; la santé suivante (santeSuivante : un échec rend « suspecte », le
   * même échec relu au moins 30 min plus tard « grillée ») va à cloud_ip_sante_noter. (14/11, complément 3 de Nico) Une grillée
   * est recontrôlée à son calendrier et redevient saine dès qu'un contrôle passe ; sans client dessus, plus aucun mail (journal seul).
   */
  async function controlerSante() {
    if (config?.entretienPool === false) return { pool: 'coupe' };
    if (!sante?.verifier || !regles.choisirIpASonder) return { coupe: 'module' };
    const { data: actif, error } = await base.rpc('cloud_param', { p_cle: 'ip_sante_controle', p_defaut: 0 });
    if (error || Number(actif) !== 1) return { coupe: 'interrupteur' };
    if (occupe) return { occupe: true };
    const c = Number(charge?.());
    if (Number.isFinite(c) && c > (regles.PARAMETRES?.santeChargeMax ?? 0.7)) {
      journal.info('sante_reportee_charge', { charge: Math.round(c * 100) / 100 });
      return { charge: c };
    }
    occupe = true;
    try {
      const toutes = await lireIps();
      if (!toutes.avecSante) return { coupe: 'migration_absente' };
      const appliquees = await pareFeu.appliquees().catch(() => null);
      const enUsage = (navigateurs?.ouverts?.() ?? []).map((u) => navigateurs.ouvert?.(u)?.ipId).filter((x) => x != null);
      const choix = regles.choisirIpASonder(toutes, { enUsage,
        permise: (i) => Boolean(appliquees) && sortieOuverte(appliquees, i.ip, i.port ?? 12323) });
      if (!choix) return { rien: true };
      return await controlerEtNoter(choix.ip, { raison: choix.raison, dues: choix.dues });
    } finally { occupe = false; }
  }

  /** Le contrôle de santé d'UNE IP (Chrome jetable, sante.verifier), la santé suivante écrite (cloud_ip_sante_noter), l'alerte
   *  d'une IP qui vient d'être grillée. Appelé sous le verrou (controlerSante, controlerAvantAttribution). */
  async function controlerEtNoter(ip, { raison = null, dues = null } = {}) {
    {
      const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: ip.id });
      if (!proxyUrl) { journal.alerte('sante_proxy_illisible', { ip_id: ip.id }); return { ip_id: ip.id, raison: 'proxy_illisible' }; }
      const controle = await sante.verifier({ ipId: ip.id, ip: ip.ip, proxyUrl });
      const nouvelle = regles.santeSuivante(ip.sante ?? null, controle);
      const { data: r, error: e2 } = await base.rpc('cloud_ip_sante_noter', { p_ip: ip.id, p_sante: nouvelle });
      const bilan = { ip_id: ip.id, raison, dues, avant: ip.sante?.verdict ?? null, verdict: nouvelle.verdict,
        echecs: controle.echecs, inconnus: controle.inconnus, ecrit: r?.ok === true, ...(r?.ok === true ? {} : { refus: r?.raison ?? e2?.message ?? null }),
        // (07/11 soir) L'opérateur de sortie : une IP atypique (non française) reste saine, elle passe en dernier.
        operateur: nouvelle.operateur ? { as: nouvelle.operateur.as, pays: nouvelle.operateur.pays, rang: nouvelle.operateur.rang } : null };
      journal.info('sante_ip', bilan);
      if (r?.ok === true && nouvelle.verdict === 'grillee' && r.avant !== 'grillee') {
        const echeance = new Date(ip.expire_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
        const definitive = regles.grilleeSurSortie?.(nouvelle) === true;
        await alertes?.signaler('serveur', `IP ${ip.id} (${ip.ip}) GRILLÉE au contrôle de santé : ${nouvelle.echecs.join(', ')} — échec relu par un 2e contrôle `
          + `(1er le ${nouvelle.suspecte_le}). Elle n'est plus attribuable ni comptée dans la marge, et n'est pas renouvelée tant qu'elle reste grillée ; `
          + (definitive
            ? `(19/11/2026, décision de Nico) grillée sur sa SORTIE (hébergeur, proxy ou pays) : définitive, plus jamais attribuée ni renouvelée, elle expire (échéance ${echeance}, heure de Paris).`
            : `(14/11, complément 3 de Nico) elle est recontrôlée (15 min, 1 h, 4 h puis toutes les 12 h) et revient au pool dès qu'un contrôle passe (échéance ${echeance}, heure de Paris).`),
        { ip_id: ip.id, sante: { echecs: nouvelle.echecs, suspecte_le: nouvelle.suspecte_le, grillee_le: nouvelle.grillee_le, resume: controle.resume } });
      }
      // (19/11/2026 soir, décision de Nico) Suspecte ou grillée sur hébergeur / proxy / pays : notée au journal, hors du pool —
      // jamais un rachat pour la remplacer, jamais un mail à coller au support.
      if (r?.ok === true) await noterIpDefectueuse({ ...ip, sante: nouvelle });
      return bilan;
    }
  }

  /** (19/11/2026 soir) Les comptes au Cloud actif sans IP (cloud_ip_attendus, migration 20261119230000) ; null tant que la
   *  fonction manque (relu une fois par heure). */
  async function lireAttendus() {
    if (attendusAbsentLe != null && Date.now() - attendusAbsentLe < 3600_000) return null;
    const { data, error } = await base.rpc('cloud_ip_attendus');
    if (error) {
      if (attendusAbsentLe == null) journal.info('attendus_illisibles', { erreur: String(error.message ?? '').slice(0, 160) });
      attendusAbsentLe = Date.now();
      return null;
    }
    attendusAbsentLe = null;
    return Array.isArray(data) ? data : [];
  }

  /**
   * (19/11/2026 soir, décision de Nico : « aucune IP donnée à un compte sans un contrôle réussi juste avant ») LE CONTRÔLE
   * AVANT ATTRIBUTION — après chaque réapprovisionnement rapide (index.js, toutes les 5 min), même achats coupés. Rien sans
   * compte qui attend (cloud_ip_attendus : une lecture). Sinon, sous le verrou, hors pointe de charge : l'IP que
   * cloud_ip_attribuer lui donnerait (son IP au repos, sa réservation, puis la meilleure disponible —
   * regles.ipAControlerAvantAttribution) passe le contrôle de santé complet ; « saine » écrite, le déclencheur
   * cloud_ips_zz_servir_actif_sans_ip la donne tout de suite ; un échec : la suivante au tour d'après. Une IP déjà contrôlée
   * qui lui irait : le compte est servi tout de suite (cloud_compte_synchroniser_pool). Jamais un achat.
   */
  async function controlerAvantAttribution() {
    if (config?.entretienPool === false) return { pool: 'coupe' };
    if (!sante?.verifier || !regles.ipAControlerAvantAttribution) return { coupe: 'module' };
    if (occupe) return { occupe: true };
    const attendus = await lireAttendus();
    if (attendus == null) return { coupe: 'migration_absente' };
    if (!attendus.length) return { rien: true };
    if (await fournisseurIp?.rotationActive?.().catch(() => false)) return { rotation: true };
    const c = Number(charge?.());
    if (Number.isFinite(c) && c > (regles.PARAMETRES?.santeChargeMax ?? 0.7)) {
      journal.info('controle_attribution_reporte_charge', { charge: Math.round(c * 100) / 100, attendus: attendus.length });
      return { charge: c };
    }
    occupe = true;
    try {
      const toutes = await lireIps();
      if (!toutes.avecSante) return { coupe: 'migration_absente' };
      const appliquees = await pareFeu.appliquees().catch(() => null);
      const enUsage = (navigateurs?.ouverts?.() ?? []).map((u) => navigateurs.ouvert?.(u)?.ipId).filter((x) => x != null);
      const choix = regles.ipAControlerAvantAttribution(toutes, attendus, { enUsage,
        permise: (i) => Boolean(appliquees) && sortieOuverte(appliquees, i.ip, i.port ?? 12323) });
      if (!choix) { journal.info('controle_attribution_rien', { attendus: attendus.length }); return { attendus: attendus.length, rien: true }; }
      if (choix.raison === 'deja_controlee') {
        const { data, error } = await base.rpc('cloud_compte_synchroniser_pool', { p_user: choix.user_id });
        const b = { pour: choix.user_id, ip_id: choix.ip.id, raison: choix.raison, servi: error ? null : data ?? null, ...(error ? { erreur: error.message } : {}) };
        journal.info('controle_attribution', b);
        return b;
      }
      const bilan = await controlerEtNoter(choix.ip, { raison: `avant_attribution:${choix.raison}` });
      journal.info('controle_attribution', { pour: choix.user_id, nature: choix.nature, ...bilan });
      return { pour: choix.user_id, ...bilan };
    } finally { occupe = false; }
  }

  /**
   * (19/11/2026 soir, réponse de Nico : « avant de renouveler l'IP d'un client : contrôle seulement sa sortie (hébergeur,
   * proxy, pays) et les refus déjà prouvés, sans visiter les plateformes sur son IP ») LE CONTRÔLE DE SORTIE AVANT LE
   * RENOUVELLEMENT d'une IP TENUE — après chaque contrôle de santé (index.js) : une IP due (regles.choisirSortieAControler :
   * échéance dans 4 jours, sans contrôle valable, ou un échec à relire 30 min plus tard), lue par sante.verifierSortie (aucune
   * page de plateforme), écrite par cloud_ip_controle_renouvellement_noter. Un échec RELU : elle ne sera pas renouvelée
   * (planDuJour) et l'équipe est prévenue, une fois.
   */
  async function controlerSortieAvantRenouvellement() {
    if (config?.entretienPool === false) return { pool: 'coupe' };
    if (!sante?.verifierSortie || !regles.choisirSortieAControler) return { coupe: 'module' };
    if (occupe) return { occupe: true };
    occupe = true;
    try {
      const toutes = await lireIps();
      if (!toutes.avecControleRenouvellement) return { coupe: 'migration_absente' };
      const appliquees = await pareFeu.appliquees().catch(() => null);
      const choix = regles.choisirSortieAControler(toutes, {
        permise: (i) => Boolean(appliquees) && sortieOuverte(appliquees, i.ip, i.port ?? 12323) });
      if (!choix) return { rien: true };
      const ip = choix.ip;
      const { data: proxyUrl } = await base.rpc('cloud_proxy_identifiants', { p_ip: ip.id });
      if (!proxyUrl) { journal.alerte('sortie_proxy_illisible', { ip_id: ip.id }); return { ip_id: ip.id, raison: 'proxy_illisible' }; }
      const controle = await sante.verifierSortie({ ipId: ip.id, ip: ip.ip, proxyUrl });
      const suivant = regles.controleRenouvellementSuivant(ip, controle);
      const { data: r, error } = await base.rpc('cloud_ip_controle_renouvellement_noter', { p_ip: ip.id, p_controle: suivant });
      const bilan = { ip_id: ip.id, raison: choix.raison, echecs: suivant.echecs, inconnus: suivant.inconnus, confirme: suivant.confirme,
        ecrit: r?.ok === true, ...(r?.ok === true ? {} : { refus: r?.raison ?? error?.message ?? null }) };
      journal.info('sortie_avant_renouvellement', bilan);
      if (r?.ok === true && suivant.confirme === true && ip.controle_renouvellement?.confirme !== true) {
        const echeance = new Date(ip.expire_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
        await alertes?.signaler('serveur', `IP ${ip.id} (${ip.ip}) tenue par un compte : sortie relue en échec avant son renouvellement (${suivant.echecs.join(', ')}). `
          + `Elle ne sera pas renouvelée : à son échéance (${echeance}, heure de Paris), le compte reçoit l'IP saine suivante, contrôlée juste avant. Rien n'est acheté pour ça.`,
        { ip_id: ip.id, user: ip.user_id, controle: suivant }, { cle: `ip:${ip.id}|sortie` });
      }
      return bilan;
    } finally { occupe = false; }
  }

  return { tour, purger, purgerComptesInactifs, reapprovisionnerVite, controlerSante, controlerAvantAttribution, controlerSortieAvantRenouvellement };
}
