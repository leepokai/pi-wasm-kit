import XCTest

@MainActor
final class RuntimeUITests: XCTestCase {
    func testNativeToolAndJournalSurviveAppRelaunch() {
        let app = XCUIApplication()
        app.launch()
        let run = app.buttons["runTask"]
        XCTAssertTrue(run.waitForExistence(timeout: 15))
        wait(app.staticTexts["runtimeStatus"], contains: "Ready")
        run.tap()
        wait(app.staticTexts["nativeProof"], contains: "iOS native tool")
        wait(app.staticTexts["runtimeStatus"], contains: "Ready")
        wait(app.staticTexts["runtimeResult"], contains: "21 × 2 = 42")
        let savedResult = app.staticTexts["runtimeResult"].label
        app.terminate(); app.launch()
        wait(app.staticTexts["runtimeResult"], contains: savedResult)
        wait(app.staticTexts["nativeProof"], contains: "native calls this launch: 0")
        app.buttons["runTask"].tap()
        wait(app.staticTexts["runtimeStatus"], contains: "Running")
        app.terminate(); app.launch()
        wait(app.staticTexts["runtimeStatus"], contains: "Ready")
        wait(app.staticTexts["nativeProof"], contains: "iOS native tool")
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@ AND label CONTAINS %@", savedResult, "21 × 2 = 42"), object: app.staticTexts["runtimeResult"])
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 30), .completed)
    }
    private func wait(_ element: XCUIElement, contains value: String) {
        let predicate = NSPredicate(format: "label CONTAINS %@", value)
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 30), .completed)
    }
}
