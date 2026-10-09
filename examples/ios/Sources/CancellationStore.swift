import Foundation

/// A synchronous atomic file, so expiration does not depend on deferred preferences writes.
struct CancellationStore {
    let url: URL
    init(url: URL = URL.applicationSupportDirectory.appending(path: "PiWasmExample/cancel-on-open")) {
        self.url = url
    }
    var pending: Bool { FileManager.default.fileExists(atPath: url.path) }
    func request() throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("cancel\n".utf8).write(to: url, options: .atomic)
    }
    func acknowledge() throws {
        if pending { try FileManager.default.removeItem(at: url) }
    }
}
