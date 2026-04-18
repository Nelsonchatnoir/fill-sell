#import <Capacitor/Capacitor.h>
CAP_PLUGIN(AppleSignInPlugin, "AppleSignIn",
    CAP_PLUGIN_METHOD(signIn, CAPPluginReturnPromise);
)
