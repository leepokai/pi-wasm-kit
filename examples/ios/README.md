# iOS example

[Platform installation guide](../../docs/install.md#ios) · [Runtime and background behavior](../../docs/mobile.md)

Swift 6, iOS 26+, Xcode 26+ and [XcodeGen](https://github.com/yonaskolb/XcodeGen). A SwiftUI shell hosts WKWebView, the actual WASM runtime, IndexedDB, and a Swift multiply tool. The icon is the project's Continuation π mark.

Start the shared [asset server](../../docs/mobile.md#run-the-shared-assets), then from the repository root:

```sh
xcodegen generate --spec examples/ios/project.yml
open examples/ios/PiWasmExample.xcodeproj
```

Choose the `PiWasmExample` scheme and an iOS 26+ simulator. Tap **Run task** and observe `42 (iOS native tool)`. Reopen the WebView or terminate/relaunch the app to recover the same journal. The generated Xcode project and build products are ignored; edit `project.yml` and regenerate.

**Run with background time** requests iOS 26's `BGContinuedProcessingTask`. Read the [background behavior and device-test boundary](../../docs/mobile.md#ios-26-continued-processing). It may be rejected, particularly on Simulator. It does not grant perpetual execution.

## Tests

Keep the preview server on port 4173 running, then:

```sh
xcodebuild test \
  -project examples/ios/PiWasmExample.xcodeproj \
  -scheme PiWasmExample \
  -destination 'platform=iOS Simulator,name=YOUR_IPHONE_SIMULATOR' \
  -derivedDataPath examples/ios/build/dd
```

Swift Testing covers cancellation persistence and completion ordering. XCTest UI tests run the native tool, relaunch without replaying a completed tool, interrupt an active run, and verify a new completed answer after recovery. The fixture model is synthetic and requires no API key.

Code signing is disabled for simulator builds. For a physical device, supply your own team/signing settings and a reachable HTTPS asset origin, updating both origin checks. No signing credentials or production service are included.
