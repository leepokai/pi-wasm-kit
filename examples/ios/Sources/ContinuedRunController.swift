import BackgroundTasks
import Foundation

@MainActor
final class ContinuedRunController {
    static let identifier = "com.leepokai.piwasm.example.agent"
    let lease = RunLease()
    var start: (() -> Void)?
    var stop: (() -> Void)?
    var report: ((String) -> Void)?
    private var task: BGContinuedProcessingTask?
    private var pending = false
    private var registered = false

    init() {
        // Continued-processing registrations may occur after launch. Register just once.
        registered = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.identifier, using: .main
        ) { [weak self] task in
            MainActor.assumeIsolated {
                guard let self, let continued = task as? BGContinuedProcessingTask else {
                    task.setTaskCompleted(success: false)
                    return
                }
                self.launch(continued)
            }
        }
    }
    func submit() {
        guard registered, !pending, !lease.active else {
            report?("Background task is unavailable or already active")
            return
        }
        let request = BGContinuedProcessingTaskRequest(
            identifier: Self.identifier, title: "Pi agent demo", subtitle: "Waiting to start"
        )
        request.strategy = .fail // Never leave a surprising delayed demo run in a queue.
        pending = true
        do {
            try BGTaskScheduler.shared.submit(request)
            report?("Background request submitted")
        } catch {
            pending = false
            report?("Background unavailable: \(error.localizedDescription). Use Run task in foreground.")
        }
    }
    private func launch(_ task: BGContinuedProcessingTask) {
        pending = false
        self.task = task
        task.progress.totalUnitCount = 3 // admitted → native tool finished → submission settled
        task.expirationHandler = { [weak self] in
            Task { @MainActor in self?.expire() }
        }
        lease.begin(finish: { [weak self] success in
            guard let self else { return }
            let current = self.task
            self.task = nil
            current?.expirationHandler = nil
            if success { current?.progress.completedUnitCount = 3 }
            current?.setTaskCompleted(success: success)
            self.report?(success ? "Background task completed" : "Background task stopped; cancellation saved")
        }, stop: { [weak self] in self?.stop?() })
        report?("Background task granted")
        start?()
    }
    func progress(_ step: Int64) {
        guard let task else { return }
        task.progress.completedUnitCount = max(task.progress.completedUnitCount, min(step, 2))
        task.updateTitle("Pi agent demo", subtitle: step < 2 ? "Running agent" : "Native tool finished")
    }
    func complete(success: Bool) { lease.complete(success: success) }
    func expire() {
        if let error = lease.expire() {
            report?("Stopped, but cancellation could not be saved: \(error.localizedDescription). Saved work may resume.")
        }
    }
}
