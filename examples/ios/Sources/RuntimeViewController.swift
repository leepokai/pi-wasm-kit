import UIKit
import WebKit

@MainActor
final class RuntimeViewController: UIViewController, WKNavigationDelegate {
    private let background = ContinuedRunController()
    private var webView: WKWebView?
    private let status = UILabel()
    private let result = UILabel()
    private let proof = UILabel()
    private let backgroundStatus = UILabel()
    private let run = UIButton(type: .system)
    private let continued = UIButton(type: .system)
    private let webContainer = UIView()
    private var nativeCalls = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.accessibilityIdentifier = "runtimeStatus"
        result.accessibilityIdentifier = "runtimeResult"
        proof.accessibilityIdentifier = "nativeProof"
        backgroundStatus.accessibilityIdentifier = "backgroundStatus"
        for label in [status, result, proof, backgroundStatus] { label.numberOfLines = 0; label.font = .systemFont(ofSize: 12) }
        run.setTitle("Run task", for: .normal); run.accessibilityIdentifier = "runTask"
        run.addTarget(self, action: #selector(runTask), for: .touchUpInside)
        continued.setTitle("Run with background time", for: .normal)
        continued.addTarget(self, action: #selector(runContinued), for: .touchUpInside)
        let reload = UIButton(type: .system)
        reload.setTitle("Reopen WebView", for: .normal); reload.accessibilityIdentifier = "reopen"
        reload.addTarget(self, action: #selector(reopen), for: .touchUpInside)
        let header = UIStackView(arrangedSubviews: [status, result, proof, backgroundStatus, run, continued, reload])
        header.axis = .vertical; header.spacing = 3
        let stack = UIStackView(arrangedSubviews: [header, webContainer]); stack.axis = .vertical
        stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12)
        ])
        background.start = { [weak self] in self?.runTask() }
        background.stop = { [weak self] in self?.destroyWebView() }
        background.report = { [weak self] in self?.backgroundStatus.text = $0 }
        backgroundStatus.text = "iOS 26+ continued processing · subject to system scheduling"
        reopen()
    }
    @objc private func runTask() {
        run.isEnabled = false; continued.isEnabled = false
        webView?.evaluateJavaScript("document.getElementById('send').click()") { [weak self] _, error in
            if let error { self?.status.text = error.localizedDescription; self?.background.complete(success: false) }
        }
    }
    @objc private func runContinued() { background.submit() }
    @objc private func reopen() {
        if background.lease.active { background.expire() }
        destroyWebView()
        let bridge = NativeBridge(lease: background.lease)
        bridge.onState = { [weak self] state in
            guard let self else { return }
            self.status.text = state["status"] as? String
            self.result.text = state["summary"] as? String
            self.proof.text = "\(state["proof"] as? String ?? "") · native calls this launch: \(self.nativeCalls)"
            let busy = state["busy"] as? Bool ?? true
            self.run.isEnabled = !busy; self.continued.isEnabled = !busy
            if busy { self.background.progress(1) }
        }
        bridge.onMultiply = { [weak self] in self?.nativeCalls += 1; self?.background.progress(2) }
        bridge.onComplete = { [weak self] in self?.background.complete(success: $0) }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default() // Persistent IndexedDB, not nonPersistent().
        configuration.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: "piNative")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        webContainer.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: webContainer.topAnchor), web.bottomAnchor.constraint(equalTo: webContainer.bottomAnchor), web.leadingAnchor.constraint(equalTo: webContainer.leadingAnchor), web.trailingAnchor.constraint(equalTo: webContainer.trailingAnchor)])
        webView = web
        status.text = "Loading local demo server…"
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:4173")!))
    }
    private func destroyWebView() {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "piNative", contentWorld: .page)
        webView?.stopLoading(); webView?.removeFromSuperview(); webView = nil
        run.isEnabled = false; continued.isEnabled = false
        status.text = "Paused · reopen to recover saved work"
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        decisionHandler(url?.scheme == "http" && url?.host == "127.0.0.1" && url?.port == 4173 ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        status.text = "Start npm run preview -- --port 4173: \(error.localizedDescription)"
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        background.complete(success: false)
        destroyWebView() // Reopen explicitly; the journal survives renderer/process termination.
    }
}
