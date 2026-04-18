import Capacitor
import AuthenticationServices

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var savedCall: CAPPluginCall?

    @objc func signIn(_ call: CAPPluginCall) {
        self.savedCall = call
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return self.bridge!.viewController!.view.window!
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
           let tokenData = credential.identityToken,
           let token = String(data: tokenData, encoding: .utf8) {
            savedCall?.resolve(["identityToken": token])
        } else {
            savedCall?.reject("Failed to get token")
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        savedCall?.reject(error.localizedDescription)
    }
}
