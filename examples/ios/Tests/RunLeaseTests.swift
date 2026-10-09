import Foundation
import Testing
@testable import PiWasmExample

@MainActor
struct RunLeaseTests {
    @Test func expirationPersistsCancellationBeforeStoppingAndCompletesOnce() throws {
        let directory = URL.temporaryDirectory.appending(path: "pi-tests-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = CancellationStore(url: directory.appending(path: "cancel"))
        let lease = RunLease(store: store)
        var completions: [Bool] = []
        var stopped = false
        lease.begin(finish: { completions.append($0) }, stop: { stopped = true; #expect(lease.cancelOnOpen) })
        lease.expire(); lease.expire(); lease.complete(success: true)
        #expect(stopped)
        #expect(completions == [false])
        #expect(RunLease(store: store).cancelOnOpen)
        try lease.acknowledgeCancellation()
        #expect(!lease.cancelOnOpen)
    }
    @Test func successDoesNotCreateCancellationIntent() throws {
        let directory = URL.temporaryDirectory.appending(path: "pi-tests-\(UUID())")
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = CancellationStore(url: directory.appending(path: "cancel"))
        let lease = RunLease(store: store)
        var completions: [Bool] = []
        lease.begin(finish: { completions.append($0) }, stop: { Issue.record("Unexpected stop") })
        lease.complete(success: true); lease.expire()
        #expect(completions == [true]); #expect(!lease.cancelOnOpen)
    }
}
