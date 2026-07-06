import XCTest

@testable import IntentiveDesktopCore

// MARK: - ConferencingApps

final class ConferencingAppsTests: XCTestCase {

    func testNativeCallAppMatchesOnOwnerNameAlone() {
        XCTAssertTrue(ConferencingApps.isCallWindow(ownerName: "zoom.us", title: nil))
        XCTAssertTrue(ConferencingApps.isCallWindow(ownerName: "Microsoft Teams", title: "anything"))
        XCTAssertTrue(ConferencingApps.isCallWindow(ownerName: "FaceTime", title: nil))
        XCTAssertTrue(ConferencingApps.isCallWindow(ownerName: "Webex", title: nil))
    }

    func testBrowserRequiresCallKeywordInTitle() {
        XCTAssertTrue(
            ConferencingApps.isCallWindow(ownerName: "Google Chrome", title: "Google Meet — Standup"))
        XCTAssertTrue(
            ConferencingApps.isCallWindow(ownerName: "Safari", title: "https://meet.google.com/abc-defg"))
        XCTAssertFalse(
            ConferencingApps.isCallWindow(ownerName: "Google Chrome", title: "GitHub - Intentive"))
        XCTAssertFalse(ConferencingApps.isCallWindow(ownerName: "Google Chrome", title: nil))
    }

    func testNonCallAppAndNilOwnerAreNotCalls() {
        // A non-browser, non-call app is never a call — even if its title mentions a meeting.
        XCTAssertFalse(ConferencingApps.isCallWindow(ownerName: "Finder", title: "Zoom Meeting"))
        XCTAssertFalse(ConferencingApps.isCallWindow(ownerName: nil, title: "Google Meet"))
    }

    func testNativeCallBundleIDMatchingIsCaseInsensitive() {
        XCTAssertTrue(ConferencingApps.isNativeCallApp(bundleID: "us.zoom.xos"))
        XCTAssertTrue(ConferencingApps.isNativeCallApp(bundleID: "US.Zoom.XOS"))
        XCTAssertTrue(ConferencingApps.isNativeCallApp(bundleID: "com.microsoft.teams2"))
        XCTAssertTrue(ConferencingApps.isNativeCallApp(bundleID: "com.apple.facetime"))
        // Intentive itself is always using the mic while recording; it must not count as a meeting.
        XCTAssertFalse(ConferencingApps.isNativeCallApp(bundleID: "com.intentive.desktop"))
        XCTAssertFalse(ConferencingApps.isNativeCallApp(bundleID: "com.google.Chrome"))
    }

    func testBrowserBundleIDPrefixMatchingCatchesHelpers() {
        // Browsers route call audio through helper processes — match by prefix.
        XCTAssertTrue(ConferencingApps.isBrowserBundleID("net.imput.helium.helper"))  // Helium (Meet)
        XCTAssertTrue(ConferencingApps.isBrowserBundleID("com.google.Chrome.helper"))
        XCTAssertTrue(ConferencingApps.isBrowserBundleID("company.thebrowser.Browser"))  // Arc
        XCTAssertTrue(ConferencingApps.isBrowserBundleID("com.apple.WebKit.GPU"))
        // Not browsers.
        XCTAssertFalse(ConferencingApps.isBrowserBundleID("com.intentive.desktop"))
        XCTAssertFalse(ConferencingApps.isBrowserBundleID("us.zoom.xos"))
    }
}

// MARK: - MeetingDetector hysteresis

@MainActor
final class MeetingDetectorTests: XCTestCase {

    // Test-controlled clock; hysteresis is driven directly via applyDetected(_:) (no timers/probe).
    private var now = Date(timeIntervalSince1970: 1000)

    private func makeDetector(
        offGrace: TimeInterval = 8.0, onChange: @escaping (Bool) -> Void = { _ in }
    ) -> MeetingDetector {
        MeetingDetector(
            pollInterval: 4.0,
            offGracePeriod: offGrace,
            now: { [weak self] in self?.now ?? Date(timeIntervalSince1970: 0) },
            onChange: onChange
        )
    }

    func testTurnsOnImmediatelyWhenMeetingDetected() {
        var changes = [Bool]()
        let detector = makeDetector(onChange: { changes.append($0) })

        detector.applyDetected(true)

        XCTAssertTrue(detector.isMeetingActive)
        XCTAssertEqual(changes, [true])
    }

    func testTurningOffRequiresSustainedGracePeriod() {
        var changes = [Bool]()
        let detector = makeDetector(offGrace: 8.0, onChange: { changes.append($0) })

        detector.applyDetected(true)  // -> on
        XCTAssertTrue(detector.isMeetingActive)

        // Meeting disappears: arms pending-off, does NOT flip immediately.
        detector.applyDetected(false)
        XCTAssertTrue(detector.isMeetingActive, "should stay active during grace period")

        // Still within the grace window.
        now = now.addingTimeInterval(5)
        detector.applyDetected(false)
        XCTAssertTrue(detector.isMeetingActive, "still within grace window")

        // Grace elapsed (5 + 4 = 9s > 8s).
        now = now.addingTimeInterval(4)
        detector.applyDetected(false)
        XCTAssertFalse(detector.isMeetingActive, "flips off after sustained grace period")
        XCTAssertEqual(changes, [true, false])
    }

    func testMeetingReappearingDuringGraceCancelsTurnOff() {
        var changes = [Bool]()
        let detector = makeDetector(offGrace: 8.0, onChange: { changes.append($0) })

        detector.applyDetected(true)  // -> on
        detector.applyDetected(false)  // arm pending-off
        now = now.addingTimeInterval(5)
        detector.applyDetected(true)  // reappears within grace -> cancels pending-off
        now = now.addingTimeInterval(20)
        detector.applyDetected(true)  // long after the original deadline; should still be active

        XCTAssertTrue(detector.isMeetingActive)
        XCTAssertEqual(changes, [true], "no spurious off edge")
    }

    func testNoChangeEmittedWhileStableInactive() {
        var changes = [Bool]()
        let detector = makeDetector(onChange: { changes.append($0) })

        detector.applyDetected(false)
        now = now.addingTimeInterval(100)
        detector.applyDetected(false)

        XCTAssertFalse(detector.isMeetingActive)
        XCTAssertEqual(changes, [], "no edges while never in a meeting")
    }
}

// MARK: - SystemAudioCaptureSettings.mode

@MainActor
final class SystemAudioCaptureModeSettingsTests: XCTestCase {
    private let key = SystemAudioCaptureSettings.key

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: key)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: key)
        super.tearDown()
    }

    func testDefaultsToOnlyDuringMeetings() {
        XCTAssertEqual(SystemAudioCaptureSettings.shared.mode, .onlyDuringMeetings)
    }

    func testPersistsAndReadsBack() {
        SystemAudioCaptureSettings.shared.mode = .onlyDuringMeetings
        XCTAssertEqual(UserDefaults.standard.string(forKey: key), "onlyDuringMeetings")
        XCTAssertEqual(SystemAudioCaptureSettings.shared.mode, .onlyDuringMeetings)

        SystemAudioCaptureSettings.shared.mode = .never
        XCTAssertEqual(SystemAudioCaptureSettings.shared.mode, .never)
    }

    func testUnknownRawValueFallsBackToDefault() {
        UserDefaults.standard.set("garbage", forKey: key)
        XCTAssertEqual(SystemAudioCaptureSettings.shared.mode, .onlyDuringMeetings)
    }
}
