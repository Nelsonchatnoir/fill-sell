// ═══════════════════════════════════════════════════════════════════════════
// L'INTERRUPTEUR DU NOUVEAU STEPPER (refonte, 24/09/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Les nouveaux écrans sont construits À CÔTÉ des anciens. L'ancien stepper
// reste le chemin par DÉFAUT tant que la bascule n'est pas faite. Trois
// sources, de la plus locale à la plus large, la première qui répond gagne :
//   1. localStorage `fs_nouveau_stepper` = "1" | "0" — surcharge de CE
//      navigateur (tests, et « retour en arrière en un geste » pour une
//      personne) ;
//   2. profiles.beta_flags.nouveau_stepper = true — un compte (Nico d'abord) ;
//   3. coin_config.nouveau_stepper_ouvert = 1 — tout le monde.
// FAIL-CLOSED : clé absente, illisible, lecture ratée → ancien stepper.
//
// Bascule :   update profiles set beta_flags = beta_flags || '{"nouveau_stepper":true}'::jsonb where id = '<uuid>';
//             insert into coin_config(key,value) values ('nouveau_stepper_ouvert',1) on conflict (key) do update set value = 1;
// Retour :    … value = 0 (tous) · beta_flags - 'nouveau_stepper' (un compte)
//             · localStorage.setItem('fs_nouveau_stepper','0') (un navigateur).
import { useEffect, useState } from "react";

export const CLE_LOCALE = "fs_nouveau_stepper";
export const CLE_PROFIL = "nouveau_stepper";
export const CLE_CONFIG = "nouveau_stepper_ouvert";

export function lireSurchargeLocale() {
  try {
    const v = localStorage.getItem(CLE_LOCALE);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch { /* stockage indisponible : pas de surcharge */ }
  return null;
}

export async function lireDrapeauNouveauStepper(supabase, userId) {
  const local = lireSurchargeLocale();
  if (local !== null) return local;
  if (!supabase) return false;
  if (userId) {
    try {
      const { data, error } = await supabase.from("profiles").select("beta_flags").eq("id", userId).maybeSingle();
      if (!error && data?.beta_flags?.[CLE_PROFIL] === true) return true;
      if (!error && data?.beta_flags?.[CLE_PROFIL] === false) return false;
    } catch { /* colonne absente = fermé */ }
  }
  try {
    const { data, error } = await supabase.from("coin_config").select("value").eq("key", CLE_CONFIG).maybeSingle();
    if (!error && Number(data?.value) === 1) return true;
  } catch { /* fermé */ }
  return false;
}

/** Le drapeau, prêt AVANT que quelqu'un ouvre un stepper. `false` tant qu'on ne sait pas. */
export function useNouveauStepper(supabase, userId) {
  const [drapeau, setDrapeau] = useState(() => lireSurchargeLocale() ?? false);
  useEffect(() => {
    let vivant = true;
    lireDrapeauNouveauStepper(supabase, userId).then(v => { if (vivant) setDrapeau(Boolean(v)); });
    // Une surcharge posée pendant la session (tests) se relit sans recharger.
    const onStorage = (e) => { if (e.key === CLE_LOCALE) lireDrapeauNouveauStepper(supabase, userId).then(v => { if (vivant) setDrapeau(Boolean(v)); }); };
    window.addEventListener("storage", onStorage);
    return () => { vivant = false; window.removeEventListener("storage", onStorage); };
  }, [supabase, userId]);
  return drapeau;
}
