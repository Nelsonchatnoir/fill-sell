// (04/11, décision de Nico : « nouvelle IP via le pool, achat automatique déjà allumé ») UNE IP neuve achetée par le
// chemin du pool lui-même (approvisionnement.acheter) — mêmes gardes que l'achat automatique : IPROYAL_ACHATS_AUTORISES=1,
// coin_config.cloud_ip_achats_auto = 1, plafond mensuel (cloud_ip_budget_mensuel_usd), solde, registre de la dépense
// AVANT l'appel. La commande livrée entre au pool (« achetee ») ; le contrôle d'entrée de l'entretien la rend disponible.
// Aucune attribution ici (scripts/reparations/ : sauvegarde, inverse).
//   docker compose exec -T orchestrateur node outils/acheter-une-ip.mjs            (plan seulement : rien n'est acheté)
//   docker compose exec -T orchestrateur node outils/acheter-une-ip.mjs --acheter
import { createClient } from '@supabase/supabase-js';
import { lireConfig } from '../src/config.js';
import { creerIproyal } from '../src/iproyal.js';
import { creerAlertes } from '../src/alertes.js';
import { creerApprovisionnement } from '../src/approvisionnement.js';
import { chargerRegles } from '../src/regles.js';
import * as journal from '../src/journal.js';

const acheterVraiment = process.argv.includes('--acheter');
const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const iproyal = creerIproyal({ jeton: config.iproyalJeton, achatsAutorises: config.iproyalAchatsAutorises, journal });
const alertes = creerAlertes({ config, base, journal });
const regles = await chargerRegles();
const appro = creerApprovisionnement({ base, iproyal, alertes, journal, regles });
const g = await appro.gardes();
const solde = await iproyal.solde().catch(() => null);
const cat = await iproyal.catalogueIsp().catch(() => null);
const prix = cat ? await iproyal.prixCommande(1, cat).catch(() => NaN) : NaN;
const decision = regles.deciderDepense({ montantUsd: prix, envAutorise: g.envAutorise, interrupteur: g.achatsAuto,
  budgetUsd: g.budgetUsd, depenseMoisUsd: g.depenseMoisUsd, soldeUsd: solde?.montant });
console.log(JSON.stringify({ plan: { quantite: 1, prix_usd: prix }, gardes: { env: g.envAutorise, interrupteur: g.achatsAuto, budget_usd: g.budgetUsd,
  depense_mois_usd: g.depenseMoisUsd }, solde_usd: solde?.montant ?? null, decision }));
if (!acheterVraiment) process.exit(0);
const r = await appro.acheter({ aCommander: 1, vise: 1, projete: 0 }, g, solde);
console.log(JSON.stringify({ achat: r }));
process.exit(r?.fait ? 0 : 1);
