# Install Pi WASM Kit

Pi WASM Kit is an **SDK with runnable examples**. Install the SDK from npm. GitHub releases also contain an npm-compatible tarball and brand assets. There is no global CLI, desktop installer, App Store/TestFlight build, or Play Store APK.

| Where you want to run it | Install / launch | Requirements |
| --- | --- | --- |
| Node.js on macOS, Windows or Linux | [Install the SDK](#nodejs-sdk) in your application | Node.js 22.19+ and npm |
| Web browser | [Run the browser playground](#browser-playground), or bundle the SDK in your web app | Modern browser, WASM, Workers, IndexedDB, Web Locks; HTTPS/localhost |
| iPhone / iPad | [Build the iOS example](#ios) | macOS, Xcode 26+, XcodeGen; iOS 26+ |
| Android | [Build and install the example](#android) | macOS/Windows/Linux, JDK 17+ (21 used in CI), Android SDK 35; device API 26+ with updated WebView |

Node/browser checks run on macOS and Linux. Windows commands are provided for standard npm/Gradle usage but have not been E2E-tested on a Windows machine. Native mobile checks use iOS Simulator and Android Emulator; see [validation](testing.md) for physical-device and background limits.

## Node.js SDK

Install [Node.js](https://nodejs.org/en/download) and check `node --version` is at least 22.19. From an existing application's directory, run this same command on macOS, Linux, or Windows PowerShell:

```sh
npm install pi-wasm-kit
```

For a pinned version, use `npm install pi-wasm-kit@0.2.0`. For a new application run `npm init -y` first. No Rust, QuickJS compiler, Xcode or Android SDK is needed to consume the JavaScript SDK.

Verify the installed exports:

```sh
node --input-type=module -e "import { PiWasmAgent } from 'pi-wasm-kit'; console.log(typeof PiWasmAgent.open)"
```

Expected output: `function`. Use `.mjs` files, or set your application's `package.json` to `"type": "module"`, for ESM imports. Continue with the [SDK example](../README.md#use-the-sdk) and [API guide](api.md).

If downloading manually, obtain the tarball and `SHA256SUMS.txt` from [the release](https://github.com/leepokai/pi-wasm-kit/releases/tag/v0.2.0), verify the SHA-256, then run `npm install ./pi-wasm-kit-0.2.0.tgz`:

```sh
# macOS
shasum -a 256 pi-wasm-kit-0.2.0.tgz
# Linux
sha256sum pi-wasm-kit-0.2.0.tgz
```

```powershell
# Windows PowerShell
Get-FileHash .\pi-wasm-kit-0.2.0.tgz -Algorithm SHA256
```

## Browser playground

Install Node.js and Git. These commands work in a macOS/Linux terminal or Windows PowerShell:

```sh
git clone https://github.com/leepokai/pi-wasm-kit.git
cd pi-wasm-kit
npm ci
npm run build
npm run dev
```

Open the URL printed by Vite. Use the deterministic demo without an API key. Click **Run**, **Interrupt runtime**, then **Reopen & resume**. The browser executes WASM; its IndexedDB stores the journal. It resumes when the page runs again.

For embedding in your own Vite/bundler application, install the SDK from npm as above and use `pi-wasm-kit/browser` in a Worker. Refer to [`examples/browser`](../examples/browser) for the full bridge. Do not load this Node-style package through an unbundled `<script>` tag or open `index.html` through `file://`.

## Shared setup for mobile examples

Clone the repository as above. Keep this terminal running from the repository root:

```sh
npm ci
npm run build:demo
npm run preview -- --port 4173 --strictPort
```

Use a **second terminal** for the platform commands below. The server serves web assets; the agent and journal run inside the device's WebView. These examples are not packaged for offline mobile use.

## iOS

**Build host: macOS only.** Install full [Xcode](https://developer.apple.com/xcode/) 26+ and an iOS 26+ Simulator through Xcode Settings → Components. Launch Xcode once to complete setup. With [Homebrew](https://brew.sh/) installed:

```sh
brew install xcodegen
```

From the repository root in the second terminal:

```sh
xcodegen generate --spec examples/ios/project.yml
open examples/ios/PiWasmExample.xcodeproj
```

Choose the `PiWasmExample` scheme and an iOS 26+ iPhone Simulator, then Run. The simulator reaches the Mac's loopback server automatically. Tap **Run task** and look for `42 (iOS native tool)`.

For a signed physical device, configure your Apple development team and replace the loopback URL/allowlists with your reachable HTTPS asset origin. The repository defaults to unsigned simulator builds. `BGContinuedProcessingTask` is an iOS 26+ integration, subject to system scheduling; see [the mobile guide](mobile.md#ios-26-continued-processing).

[Full iOS instructions and E2E command](../examples/ios/README.md)

## Android

**Build host: macOS, Windows or Linux.** Install [Android Studio](https://developer.android.com/studio) and a [JDK 21](https://adoptium.net/temurin/releases/?version=21). In Android Studio's SDK Manager, install Android SDK Platform 35, Build-Tools 35.0.0, Platform-Tools and Emulator. Start an API 35 emulator in Device Manager, or connect a device with USB debugging enabled. The runtime minimum is API 26 with an updated System WebView.

Use the SDK path shown in Android Studio. Common defaults are below; change them if you installed elsewhere. Ensure `java -version` reports JDK 17 or newer and `JAVA_HOME`, if set, points at that JDK. The included Gradle wrapper downloads Gradle automatically.

### macOS terminal

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
cd examples/android
./gradlew :app:assembleDebug
adb reverse tcp:4173 tcp:4173
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.leepokai.piwasm.example/com.leepokai.piwasm.MainActivity
```

### Linux terminal

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
cd examples/android
./gradlew :app:assembleDebug
adb reverse tcp:4173 tcp:4173
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.leepokai.piwasm.example/com.leepokai.piwasm.MainActivity
```

### Windows PowerShell

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
cd examples/android
.\gradlew.bat :app:assembleDebug
adb reverse tcp:4173 tcp:4173
adb install -r .\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.leepokai.piwasm.example/com.leepokai.piwasm.MainActivity
```

Run these in the same terminal where the variables were set. With multiple connected devices, set `ANDROID_SERIAL` to the intended device. Tap **Run task** and look for `42 (Android native tool)`. The example resumes when the app runs again; it does not include a background service.

[Full Android instructions and E2E command](../examples/android/README.md) · [Official SDK environment variables](https://developer.android.com/tools/variables)

## Common setup issues

| Symptom | Check |
| --- | --- |
| `npm install pi-wasm-kit` returns 404 | Check `npm config get registry`; use `https://registry.npmjs.org/` or the GitHub release tarball if your registry mirror has not synced |
| Blank mobile page / connection refused | Keep the preview server on port 4173; Android additionally needs `adb reverse` |
| Web Locks unavailable | Use HTTPS or loopback, not a plain HTTP LAN address |
| Android reports no SDK / wrong Java | Check `ANDROID_HOME`, SDK Platform 35 and `JAVA_HOME` |
| Native bridge unavailable | Update Android System WebView; keep the exact origin allowlist |
| Journal already open | Close the other tab/runtime owning the same journal, then reopen |
| iOS background request rejected | Use foreground Run; scheduling is controlled by iOS and cannot be established by Simulator tests |
