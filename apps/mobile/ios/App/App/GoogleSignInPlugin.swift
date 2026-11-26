import AuthenticationServices
import Capacitor
import CryptoKit
import UIKit

/// "Sign in with Google" for the web app (registerPlugin('GoogleSignIn')) without Google's SDK:
/// Google's page opens in the system sign-in sheet (ASWebAuthenticationSession), the app's iOS
/// OAuth client gets an authorization code with PKCE and swaps it for an ID token. Only the ID
/// token goes back to the web app; the server checks it. Scope `openid`: no name, no email.
/// `nonce` is the SHA-256 hex of the app's raw nonce, `clientId` the iOS client id.
@objc(GoogleSignInPlugin)
public class GoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "GoogleSignInPlugin"
    public let jsName = "GoogleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var session: ASWebAuthenticationSession?

    @objc func authorize(_ call: CAPPluginCall) {
        let suffix = ".apps.googleusercontent.com"
        guard session == nil else { return call.reject("busy", "busy") }
        guard let clientId = call.getString("clientId"), clientId.hasSuffix(suffix) else {
            return call.reject("missing client id", "failed")
        }
        // An iOS OAuth client redirects to its own id, reversed, as URL scheme.
        let scheme = "com.googleusercontent.apps." + clientId.dropLast(suffix.count)
        let redirect = "\(scheme):/oauth2redirect"
        let verifier = Self.randomURLSafe(32)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let state = Self.randomURLSafe(16)
        var auth = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        auth.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: call.getString("nonce") ?? ""),
            URLQueryItem(name: "prompt", value: "select_account"),
        ]
        guard let url = auth.url else { return call.reject("bad url", "failed") }

        let finish: (URL?, Error?) -> Void = { [weak self] callback, error in
            self?.session = nil
            if let error = error {
                let canceled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                return call.reject(error.localizedDescription, canceled ? "canceled" : "failed")
            }
            let items = callback.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.queryItems } ?? []
            let value = { (name: String) in items.first(where: { $0.name == name })?.value }
            guard value("state") == state else { return call.reject("unexpected answer", "failed") }
            if let err = value("error") { return call.reject(err, err == "access_denied" ? "canceled" : "failed") }
            guard let code = value("code") else { return call.reject("no code", "failed") }
            Self.exchange(code: code, clientId: clientId, redirect: redirect, verifier: verifier) { idToken, message in
                if let idToken = idToken { call.resolve(["idToken": idToken]) } else { call.reject(message ?? "token exchange failed", "failed") }
            }
        }
        DispatchQueue.main.async {
            let s: ASWebAuthenticationSession
            if #available(iOS 17.4, *) {
                s = ASWebAuthenticationSession(url: url, callback: .customScheme(String(scheme)), completionHandler: finish)
            } else {
                s = ASWebAuthenticationSession(url: url, callbackURLScheme: String(scheme), completionHandler: finish)
            }
            s.presentationContextProvider = self
            self.session = s
            if !s.start() {
                self.session = nil
                call.reject("could not open the sign-in sheet", "failed")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    /// Authorization code + PKCE verifier -> ID token (an iOS client has no secret).
    private static func exchange(code: String, clientId: String, redirect: String, verifier: String, done: @escaping (String?, String?) -> Void) {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let form = ["code": code, "client_id": clientId, "redirect_uri": redirect, "grant_type": "authorization_code", "code_verifier": verifier]
        req.httpBody = form.map { "\($0.key)=\(formEncode($0.value))" }.joined(separator: "&").data(using: .utf8)
        req.timeoutInterval = 15
        URLSession.shared.dataTask(with: req) { data, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            DispatchQueue.main.async {
                if let token = json?["id_token"] as? String, status == 200 { done(token, nil) }
                else { done(nil, error?.localizedDescription ?? (json?["error"] as? String) ?? "HTTP \(status)") }
            }
        }.resume()
    }

    private static func formEncode(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    private static func randomURLSafe(_ bytes: Int) -> String {
        var b = [UInt8](repeating: 0, count: bytes)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes, &b)
        return Data(b).base64URL
    }
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
