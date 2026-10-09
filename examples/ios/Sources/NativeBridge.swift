import Foundation
import WebKit

@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandlerWithReply {
    var onState: (([String: Any]) -> Void)?
    var onMultiply: (() -> Void)?
    var onComplete: ((Bool) -> Void)?
    let lease: RunLease
    init(lease: RunLease) { self.lease = lease }

    func userContentController(_ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage, replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "http",
              origin.host == "127.0.0.1", origin.port == 4173,
              let request = message.body as? [String: Any], let method = request["method"] as? String else {
            replyHandler(nil, "Untrusted frame or invalid request")
            return
        }
        let args = request["args"] as? [String: Any] ?? [:]
        switch method {
        case "configuration": replyHandler(["cancelOnOpen": lease.cancelOnOpen], nil)
        case "cancelAcknowledged":
            do { try lease.acknowledgeCancellation(); replyHandler(true, nil) }
            catch { replyHandler(nil, error.localizedDescription) }
        case "state": onState?(args); replyHandler(true, nil)
        case "completed": onComplete?(args["success"] as? Bool == true); replyHandler(true, nil)
        case "multiply":
            guard let a = args["a"] as? NSNumber, let b = args["b"] as? NSNumber,
                  CFGetTypeID(a) != CFBooleanGetTypeID(), CFGetTypeID(b) != CFBooleanGetTypeID(),
                  a.doubleValue.isFinite, b.doubleValue.isFinite,
                  abs(a.doubleValue) <= 1e12, abs(b.doubleValue) <= 1e12 else {
                replyHandler(nil, "Expected two finite numbers with magnitude <= 1e12")
                return
            }
            onMultiply?()
            replyHandler(["value": a.doubleValue * b.doubleValue, "platform": "iOS"], nil)
        default: replyHandler(nil, "Capability not granted")
        }
    }
}
