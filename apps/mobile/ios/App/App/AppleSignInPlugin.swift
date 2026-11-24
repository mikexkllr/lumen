import AuthenticationServices
import Capacitor
import UIKit

/// "Sign in with Apple" for the web app (window.Capacitor → registerPlugin('AppleSignIn')).
/// Asks for no name and no email: Lumen only needs Apple's anonymous, stable user id, which the
/// server verifies from the identity token. `nonce` is the SHA-256 hex of the app's raw nonce.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var pending: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        guard pending == nil else { return call.reject("busy", "busy") }
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = []
        if let nonce = call.getString("nonce") { request.nonce = nonce }
        pending = call
        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? UIWindow()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { pending = nil }
        guard let call = pending else { return }
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
            return call.reject("no identity token", "failed")
        }
        var result: [String: Any] = ["identityToken": token, "user": cred.user]
        if let codeData = cred.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            result["authorizationCode"] = code
        }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { pending = nil }
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        pending?.reject(error.localizedDescription, canceled ? "canceled" : "failed")
    }
}
