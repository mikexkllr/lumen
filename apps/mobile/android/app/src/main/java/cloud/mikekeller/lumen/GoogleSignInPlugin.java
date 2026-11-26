package cloud.mikekeller.lumen;

import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * "Sign in with Google" for the web app (registerPlugin('GoogleSignIn')) through Android's
 * Credential Manager: Google's account sheet, then an ID token for the web OAuth client
 * (`clientId`, the server client id) with the SHA-256 of the app's nonce. Only the ID token goes
 * back to the web app; the server checks it and keeps a hash of Google's user id.
 */
@CapacitorPlugin(name = "GoogleSignIn")
public class GoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void authorize(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || !clientId.endsWith(".apps.googleusercontent.com")) {
            call.reject("missing client id", "failed");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId)
            .setNonce(call.getString("nonce", ""))
            .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Credential c = result.getCredential();
                    if (!(c instanceof CustomCredential) || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                        call.reject("unexpected credential", "failed");
                        return;
                    }
                    try {
                        JSObject ret = new JSObject();
                        ret.put("idToken", GoogleIdTokenCredential.createFrom(c.getData()).getIdToken());
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("unreadable Google credential", "failed", e);
                    }
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    call.reject(String.valueOf(e.getMessage()), e instanceof GetCredentialCancellationException ? "canceled" : "failed");
                }
            }
        );
    }
}
