package com.leepokai.piwasm;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.util.Collections;

/** Development wrapper: the WASM guest and journal live in this device's WebView. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "http://127.0.0.1:4173";
    private LinearLayout layout;
    private TextView status, result, proof;
    private Button run;
    private WebView web;
    private int nativeCalls;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(24, 0, 24, 0);
        layout.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(24, insets.getSystemWindowInsetTop(), 24, insets.getSystemWindowInsetBottom());
            return insets;
        });
        status = label("runtimeStatus"); result = label("runtimeResult"); proof = label("nativeProof");
        run = button("Run task", view -> web.evaluateJavascript("document.getElementById('prompt-form').requestSubmit()", null));
        button("Reopen WebView", view -> reopen());
        setContentView(layout);
        reopen();
    }
    private TextView label(String name) {
        TextView view = new TextView(this); view.setContentDescription(name);
        view.setTextSize(12); layout.addView(view); return view;
    }
    private Button button(String title, View.OnClickListener action) {
        Button view = new Button(this); view.setText(title); view.setOnClickListener(action);
        layout.addView(view); return view;
    }
    private void reopen() {
        destroyWebView();
        run.setEnabled(false); status.setText("Loading local demo server…");
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            status.setText("Update Android System WebView to enable the origin-scoped bridge."); return;
        }
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebViewCompat.addWebMessageListener(web, "piNative", Collections.singleton(ORIGIN),
            (view, message, origin, mainFrame, reply) -> {
                JSONObject response = new JSONObject();
                try {
                    JSONObject request = new JSONObject(message.getData());
                    response.put("id", request.getInt("id"));
                    if (!mainFrame || !ORIGIN.equals(origin.toString())) throw new IllegalArgumentException("Untrusted frame");
                    response.put("result", dispatch(request.getString("method"), request.optJSONObject("args")));
                } catch (Exception error) {
                    try { response.put("error", error.getMessage()); } catch (org.json.JSONException impossible) { throw new IllegalStateException(impossible); }
                }
                reply.postMessage(response.toString());
            });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                android.net.Uri uri = request.getUrl();
                return !("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPort() == 4173);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) status.setText("Start the preview server and adb reverse: " + error.getDescription());
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                destroyWebView(); status.setText("Renderer stopped · reopen to recover saved work"); return true;
            }
        });
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        web.loadUrl(ORIGIN);
    }
    private Object dispatch(String method, JSONObject args) throws Exception {
        switch (method) {
            case "configuration": return new JSONObject().put("cancelOnOpen", false);
            case "cancelAcknowledged": case "completed": return true;
            case "state":
                status.setText(args.getString("status")); result.setText(args.getString("summary"));
                proof.setText(args.getString("proof") + " · native calls this launch: " + nativeCalls);
                run.setEnabled(!args.getBoolean("busy")); return true;
            case "multiply":
                double a = number(args, "a"), b = number(args, "b"); nativeCalls++;
                return new JSONObject().put("value", a * b).put("platform", "Android");
            default: throw new IllegalArgumentException("Capability not granted");
        }
    }
    private double number(JSONObject args, String key) throws Exception {
        Object value = args.get(key);
        if (!(value instanceof Number)) throw new IllegalArgumentException("Expected a number");
        double number = ((Number)value).doubleValue();
        if (!Double.isFinite(number) || Math.abs(number) > 1e12) throw new IllegalArgumentException("Number out of range");
        return number;
    }
    private void destroyWebView() {
        if (web != null) { layout.removeView(web); web.stopLoading(); web.destroy(); web = null; }
        if (run != null) run.setEnabled(false);
    }
    @Override public void onDestroy() { destroyWebView(); super.onDestroy(); }
}
