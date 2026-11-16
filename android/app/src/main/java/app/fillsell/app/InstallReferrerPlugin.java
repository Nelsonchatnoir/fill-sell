package app.fillsell.app;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * La campagne de l'installation, rendue par Google Play (Install Referrer API) — 14/11/2026, bloc E1.
 *
 * La pub Meta envoie l'Android sur Google Play avec ses UTM dans `referrer` (site/gabarits/installer.mjs) ; ce module
 * les relit, UNE fois, pour que l'inscription porte la campagne (src/utils/acquisition.js, enrichirSourceAndroid).
 * Côté app, l'appel est fermé tant que PLAY_REFERRER_BINAIRE_MIN vaut null : ce module, présent dans le binaire, ne
 * fait rien tant qu'on ne l'appelle pas.
 *
 * Rend TOUJOURS { etat } et ne rejette jamais (une mesure ne bloque rien) :
 *   ok           → { etat: "ok", referrer, clic, installation } (secondes)
 *   indisponible → l'API n'existe pas sur ce Play Store (FEATURE_NOT_SUPPORTED) ou le client ne se construit pas
 *   reessayer    → service indisponible, déconnecté, ou toute autre erreur : l'app retente au lancement suivant
 * Une seule réponse par appel (AtomicBoolean) ; la connexion est toujours fermée (endConnection).
 * Rien d'autre n'est lu ni transmis. Verrou : scripts/acquisition-meta-selftest.mjs.
 */
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {

    @PluginMethod
    public void lire(final PluginCall call) {
        final AtomicBoolean rendu = new AtomicBoolean(false);
        final InstallReferrerClient client;
        try {
            client = InstallReferrerClient.newBuilder(getContext()).build();
        } catch (Exception e) {
            rendre(call, rendu, etat("indisponible"));
            return;
        }
        try {
            client.startConnection(
                new InstallReferrerStateListener() {
                    @Override
                    public void onInstallReferrerSetupFinished(int code) {
                        JSObject r;
                        if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                            try {
                                ReferrerDetails d = client.getInstallReferrer();
                                String referrer = d.getInstallReferrer();
                                r = etat("ok");
                                r.put("referrer", referrer == null ? "" : referrer);
                                r.put("clic", d.getReferrerClickTimestampSeconds());
                                r.put("installation", d.getInstallBeginTimestampSeconds());
                            } catch (Exception e) {
                                r = etat("reessayer");
                            }
                        } else if (code == InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED) {
                            r = etat("indisponible");
                        } else {
                            r = etat("reessayer");
                        }
                        fermer(client);
                        rendre(call, rendu, r);
                    }

                    @Override
                    public void onInstallReferrerServiceDisconnected() {
                        fermer(client);
                        rendre(call, rendu, etat("reessayer"));
                    }
                }
            );
        } catch (Exception e) {
            fermer(client);
            rendre(call, rendu, etat("reessayer"));
        }
    }

    private static JSObject etat(String valeur) {
        JSObject r = new JSObject();
        r.put("etat", valeur);
        return r;
    }

    private static void fermer(InstallReferrerClient client) {
        try {
            client.endConnection();
        } catch (Exception ignore) {
            // déjà fermée
        }
    }

    private static void rendre(PluginCall call, AtomicBoolean rendu, JSObject r) {
        if (rendu.compareAndSet(false, true)) call.resolve(r);
    }
}
