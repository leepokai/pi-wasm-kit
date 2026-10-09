import Foundation

/// Exactly-once completion and cancellation bookkeeping, independent of Apple's scheduler.
@MainActor
final class RunLease {
    private(set) var active = false
    private var finish: ((Bool) -> Void)?
    private var stop: (() -> Void)?
    private let store: CancellationStore

    init(store: CancellationStore = CancellationStore()) { self.store = store }
    var cancelOnOpen: Bool { store.pending }
    func acknowledgeCancellation() throws { try store.acknowledge() }
    func begin(finish: @escaping (Bool) -> Void, stop: @escaping () -> Void) {
        precondition(!active)
        active = true
        self.finish = finish
        self.stop = stop
    }
    func complete(success: Bool) {
        guard active else { return }
        active = false
        let callback = finish
        finish = nil
        stop = nil
        callback?(success)
    }
    @discardableResult func expire() -> Error? {
        guard active else { return nil }
        // Persist before stopping WebKit. The next open must cancel before scheduling.
        var failure: Error?
        do { try store.request() } catch { failure = error }
        stop?()
        complete(success: false)
        return failure
    }
}
