package tn.solarys.centrale;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

/**
 * L'ENVELOPPE ANDROID — une WebView, et le strict nécessaire autour.
 *
 * POURQUOI LES FICHIERS NE SONT PAS SERVIS EN « file:// ».
 *
 * C'est le piège de tout portage d'application web en APK, et il ne se voit
 * qu'à l'exécution : un module ES chargé depuis « file:// » est refusé par la
 * politique d'origine du navigateur. L'application s'ouvrirait donc sur une
 * page blanche, sans message, alors que le même dossier marche parfaitement
 * sur un serveur.
 *
 * « WebViewAssetLoader » sert les fichiers embarqués sous une véritable
 * origine « https:// ». Les modules se chargent, le service worker
 * s'installe — il est lui aussi interdit en « file:// » — et le stockage
 * local devient persistant plutôt qu'attaché à une origine opaque.
 */
public class MainActivity extends AppCompatActivity {

    /** L'origine virtuelle sous laquelle les fichiers embarqués sont servis. */
    private static final String ORIGINE = "https://appassets.androidplatform.net";

    private WebView vue;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);

        final WebViewAssetLoader chargeur = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        vue = new WebView(this);
        vue.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings reglages = vue.getSettings();
        reglages.setJavaScriptEnabled(true);
        // LE SIMULATEUR RANGE SES MANŒUVRES DANS LE STOCKAGE LOCAL. Sans
        // ceci, une consignation posée puis l'application fermée, et tout est
        // perdu — le défaut même que la persistance existe pour éviter.
        reglages.setDomStorageEnabled(true);
        reglages.setSupportZoom(false);
        reglages.setAllowFileAccess(false);
        reglages.setAllowContentAccess(false);
        reglages.setMediaPlaybackRequiresUserGesture(true);

        vue.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return chargeur.shouldInterceptRequest(r.getUrl());
            }

            /**
             * RIEN NE SORT DE L'APPLICATION VERS LA WEBVIEW. L'application
             * n'a aucun lien externe aujourd'hui ; si l'un apparaissait, il
             * n'ouvrirait pas une page hors origine dans cette fenêtre.
             */
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !r.getUrl().toString().startsWith(ORIGINE);
            }
        });

        setContentView(vue);

        // LE BOUTON RETOUR REMONTE DANS L'APPLICATION avant de la quitter :
        // sans cela, un appui sur « retour » ferme tout, et l'on perd son
        // écran en croyant revenir d'un panneau.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (vue.canGoBack()) {
                    vue.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (etat == null) {
            vue.loadUrl(ORIGINE + "/assets/www/index.html");
        } else {
            vue.restoreState(etat);
        }
    }

    /** La rotation ne doit pas rejouer la simulation depuis le début. */
    @Override
    protected void onSaveInstanceState(Bundle etat) {
        super.onSaveInstanceState(etat);
        vue.saveState(etat);
    }
}
