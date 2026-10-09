import SwiftUI

@main
struct PiWasmExampleApp: App {
    var body: some Scene {
        WindowGroup { ExampleView().ignoresSafeArea(edges: .bottom) }
    }
}
struct ExampleView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> RuntimeViewController { RuntimeViewController() }
    func updateUIViewController(_ controller: RuntimeViewController, context: Context) {}
}
