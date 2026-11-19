// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE POSTE SAIT-IL POSER LE NOM ET LE PRÉNOM ? ET QUAND RELANCER L'ÉCLAIREUR TOUT DE SUITE
// (19/11/2026 soir, ordre de Nico — Lizzaa, 88 dépôts bloqués)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ : le nom et le prénom donnés dans FillSell (platform_settings.leboncoin.identite_vendeur, 19/11
// 09:00) ne sont posés dans les cases escrow_lastname / escrow_firstname de l'aperçu que par l'extension 0.6.193 ou
// plus récente (background.js les lit au dépôt ; leboncoin.js les pose). La 0.6.192 (la seule au Chrome Web Store le
// 19/11) ne sait pas : l'éclaireur relancé à 09:17 a buté sur les cases vides, et rien ne le relançait avant 12 h.
// LA RÈGLE (pour tous les comptes) :
//   · posteSaitPoserIdentite(build) : un build d'extension (ou de copie Cloud) au moins aussi récent que celui de la
//     0.6.193 (BUILD_POSE_IDENTITE). Les builds commencent par leur date ISO (« 2026-11-18T22:02:42Z+362d9af »,
//     « 2026-11-19T12:01:56Z+b8a84d3-cloud · v0.6.194.46440 ») : la comparaison de la date suffit.
//   · relanceIdentiteImmediate : le nom et le prénom sont enregistrés, le poste du compte sait les poser (ou le compte
//     est au Cloud), le poste a été vu depuis moins de 24 h, aucun éclaireur n'est en route, et — soit aucun éclaireur
//     n'a tourné depuis l'enregistrement, soit le dernier a tourné sur un poste qui ne savait pas les poser →
//     l'éclaireur repart TOUT DE SUITE (handler-watch, 3 min), sans attendre les 12 h. Un éclaireur qui bute sur un
//     poste qui sait les poser retombe sous la cadence de 12 h (pas de boucle).
//   · Un poste qui ne sait pas les poser : aucun essai voué à l'échec n'est lancé par l'écran ; il dit la vérité
//     (src/stock/EcranIdentiteLbc.jsx).
// Pur (Deno + Node + navigateur). Verrou : selftest:lbc-identite-pose-1911.
import { identiteVendeurValide } from "./lbc-identite.js";

/** Le build de la 0.6.193 (paquet CWS, 18/11 22:02:42 UTC, 362d9af) : le premier qui pose le nom et le prénom. */
export const BUILD_POSE_IDENTITE = "2026-11-18T22:02:42Z";
/** Un éclaireur relancé il y a moins de 10 min n'est jamais doublé. */
export const DELAI_MIN_RELANCE_MS = 10 * 60_000;
/** Poste vu depuis moins de 24 h (même borne que l'éclaireur de 12 h de handler-watch). */
export const POSTE_VIVANT_MS = 24 * 3_600_000;

const DATE_BUILD_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/;

/** Ce build d'extension (ou de copie Cloud) sait-il poser le nom et le prénom ? Illisible → non. */
export function posteSaitPoserIdentite(build) {
  const m = String(build ?? "").match(DATE_BUILD_RE);
  return !!m && m[0] >= BUILD_POSE_IDENTITE;
}

/** Le compte peut-il les faire poser ? Cloud (copie à jour) ou build d'ordinateur assez récent. Inconnu → null. */
export function compteSaitPoserIdentite(profil) {
  if (!profil || typeof profil !== "object") return null;
  if (profil.cloud_voie === true) return true;
  if (profil.extension_build == null || profil.extension_build === "") return null;
  return posteSaitPoserIdentite(profil.extension_build);
}

/**
 * Faut-il relancer l'éclaireur MAINTENANT ? (pure)
 * @param {{ identite?: object|null, profil?: { extension_build?: string|null, cloud_voie?: boolean|null,
 *   extension_last_seen_at?: string|null }|null, dernierEclaireur?: { le: number, status?: string|null,
 *   handler_build?: string|null }|null, maintenant?: number }} o
 * @returns {{ relancer: boolean, motif: string }}
 */
export function relanceIdentiteImmediate({ identite = null, profil = null, dernierEclaireur = null, maintenant = Date.now() } = {}) {
  if (!identiteVendeurValide(identite)) return { relancer: false, motif: "sans_identite" };
  if (compteSaitPoserIdentite(profil) !== true) return { relancer: false, motif: "poste_ne_sait_pas" };
  const vu = Date.parse(String(profil?.extension_last_seen_at ?? ""));
  if (!Number.isFinite(vu) || maintenant - vu > POSTE_VIVANT_MS) return { relancer: false, motif: "poste_eteint" };
  const enregistre = Date.parse(String(identite?.enregistre_le ?? ""));
  const d = dernierEclaireur && Number.isFinite(dernierEclaireur.le) ? dernierEclaireur : null;
  if (!d) return { relancer: true, motif: "aucun_eclaireur" };
  if (["pending", "processing"].includes(String(d.status ?? ""))) return { relancer: false, motif: "eclaireur_en_route" };
  if (maintenant - d.le < DELAI_MIN_RELANCE_MS) return { relancer: false, motif: "eclaireur_recent" };
  if (Number.isFinite(enregistre) && d.le < enregistre) return { relancer: true, motif: "identite_apres_dernier_eclaireur" };
  if (!posteSaitPoserIdentite(d.handler_build)) return { relancer: true, motif: "dernier_eclaireur_sans_pose" };
  return { relancer: false, motif: "cadence_12h" };
}

// (19/11 soir) Le texte posé à la place de celui d'une extension qui NE SAIT PAS poser le nom et le prénom (< 0.6.193) :
// le geste reste dans FillSell, mais sans promettre un dépôt que cette version ne fera pas. Même tournure « nom et ton
// prénom sur ton compte vendeur » (ACTION_UTILISATEUR_RE, src/utils/shared.js) ; traduit dans src/utils/messagesServeur.js.
export const MSG_LBC_IDENTITE_EXTENSION_A_METTRE_A_JOUR =
  "Leboncoin demande ton nom et ton prénom sur ton compte vendeur (obligatoires pour la Transaction sécurisée) : sans " +
  "eux, la publication ne peut pas être validée. Donne-les une seule fois dans FillSell (À régler, « Leboncoin : ton nom " +
  "et ton prénom ») : dès que ton extension FillSell sera à jour (Chrome l'installe tout seul), FillSell les posera " +
  "lui-même et cette publication repartira seule. Rien n'a été envoyé à Leboncoin.";

/** Le texte du mur d'identité à poser pour ce build (celui qui écrit) : la promesse seulement s'il sait la tenir. */
export function messageIdentitePourBuild(build, msgPose) {
  return posteSaitPoserIdentite(build) ? msgPose : MSG_LBC_IDENTITE_EXTENSION_A_METTRE_A_JOUR;
}
