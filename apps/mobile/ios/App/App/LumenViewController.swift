import Capacitor
import UIKit

/// Bridge view controller that registers the app's own plugins.
class LumenViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(GoogleSignInPlugin())
    }
}
