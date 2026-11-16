package app.fillsell.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // (14/11/2026, bloc E1) Plugin maison : la campagne de l'installation (Google Play). Un plugin local s'enregistre
        // AVANT super.onCreate (règle Capacitor). Fermé côté app tant que PLAY_REFERRER_BINAIRE_MIN vaut null.
        registerPlugin(InstallReferrerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
