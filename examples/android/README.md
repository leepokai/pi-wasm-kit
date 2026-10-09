# Android example

Java, Android API 26+, compile/target SDK 35, JDK 17+ and an updated Android System WebView supporting `WEB_MESSAGE_LISTENER`. The wrapper uses an origin-scoped AndroidX bridge and persistent WebView storage. Pi/QuickJS WASM executes on the Android device.

Start the [shared asset server](../../docs/mobile.md#run-the-shared-assets). Set `ANDROID_HOME` to your SDK, start an emulator or connect your own debug device, then:

```sh
cd examples/android
./gradlew :app:assembleDebug
adb reverse tcp:4173 tcp:4173
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.leepokai.piwasm.example/com.leepokai.piwasm.MainActivity
```

Tap **Run task** and observe `42 (Android native tool)`. **Reopen WebView** rebuilds the runtime while retaining its journal. Force-stop and relaunch also retain saved work. This example does not include an Android background service; recovery runs when the app executes again.

The only permitted cleartext domain is `127.0.0.1`. Keep `adb reverse` active: the loopback origin provides the secure context needed for Web Locks. No APK is distributed as a production app.

## Process-recovery E2E

With the APK installed and the preview server running, from the repository root:

```sh
python3 examples/android/test/recovery.py
```

`ADB=/absolute/path/to/adb` overrides the executable. With multiple devices set `ANDROID_SERIAL`. The test controls only `com.leepokai.piwasm.example`: native tool execution, saved answer after process restart with no tool replay, and interruption/recovery of a new submission. It does not clear application data. A recent emulator API 35 was used for validation; the API 26 minimum is a build configuration, not a claim that every WebView version was tested.
