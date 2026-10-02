import AppKit
import WebKit
import AVFoundation
import ApplicationServices
import Carbon

final class Overlay: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class MovesApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    var server: LoopbackServer!
    var webView: WKWebView!
    var panel: Overlay!
    var statusItem: NSStatusItem!
    var toggleItem: NSMenuItem!
    var horizontalItem: NSMenuItem!
    var hotKey: EventHotKeyRef?
    var escapeKey: EventHotKeyRef?
    var handler: EventHandlerRef?
    var requested = false, armed = false, loaded = false, horizontal = false, awaitingReset = false
    var sensitivity = 900
    var generation = 0
    var output = ScrollOutput()
    var lastMessage = Date.distantPast
    var lastPointer: CGPoint?
    var lastPID: pid_t?
    var watchdog: Timer?
    var warmupPassed = false
    let checkMode = CommandLine.arguments.contains("--check-webkit")

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        makeUI(); if !checkMode { registerHotkey() }
        if checkMode { DispatchQueue.main.asyncAfter(deadline: .now() + 45) { print("FAIL WebKit startup timed out"); exit(1) } }
        let resources = Bundle.main.resourceURL!.appendingPathComponent("Web")
        server = LoopbackServer(root: resources)
        do { try server.start { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let url): self.webView.load(URLRequest(url: url))
            case .failure(let error): self.display("Unavailable", "Could not open local tracker: \(error.localizedDescription)")
            }
        } } catch { display("Unavailable", error.localizedDescription) }
        watchdog = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self, self.armed else { return }
            if Date().timeIntervalSince(self.lastMessage) > 1 { self.stop(reason: "Tracking stopped responding. Toggle to restart.") }
            else if !CGPreflightPostEventAccess() { self.stop(reason: "Accessibility permission was removed.") }
        }
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(sleeping), name: NSWorkspace.willSleepNotification, object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(sleeping), name: NSNotification.Name("com.apple.screenIsLocked"), object: nil)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // Menu-bar apps keep running after their panel closes. Opening the app
        // again must restore that panel without enabling the camera or scrolling.
        showPanel()
        return true
    }
    func makeUI() {
        let config = WKWebViewConfiguration()
        config.preferences.inactiveSchedulingPolicy = .none
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "moves")
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 264, height: 150), configuration: config)
        webView.uiDelegate = self; webView.navigationDelegate = self
        panel = Overlay(contentRect: NSRect(x: 0, y: 0, width: 264, height: 150), styleMask: [.titled, .closable, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "Moves"; panel.titleVisibility = .hidden; panel.contentView = webView
        panel.delegate = self
        panel.level = .floating; panel.hidesOnDeactivate = false; panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        if let frame = NSScreen.main?.visibleFrame { panel.setFrameOrigin(NSPoint(x: frame.maxX - panel.frame.width - 20, y: frame.minY + 20)) }
        panel.orderFrontRegardless()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "Moves ○"
        let menu = NSMenu()
        toggleItem = add("Enable gesture scrolling  ⌃⌥M", action: #selector(toggle), to: menu)
        horizontalItem = add("Enable sideways scrolling", action: #selector(toggleHorizontal), to: menu)
        menu.addItem(.separator())
        add("Show Moves", action: #selector(showPanel), to: menu)
        add("Open Accessibility settings…", action: #selector(openAccessibility), to: menu)
        let speedMenu = NSMenu()
        for (name, gain) in [("Gentle", 600), ("Normal", 900), ("Faster", 1400)] { let item = add(name, action: #selector(setSpeed(_:)), to: speedMenu); item.tag = gain; item.state = gain == sensitivity ? .on : .off }
        let speedItem = NSMenuItem(title: "Sensitivity", action: nil, keyEquivalent: ""); speedItem.submenu = speedMenu; menu.addItem(speedItem)
        menu.addItem(.separator()); add("Quit Moves", action: #selector(quit), to: menu)
        statusItem.menu = menu
    }
    @discardableResult func add(_ title: String, action: Selector, to menu: NSMenu) -> NSMenuItem { let item = NSMenuItem(title: title, action: action, keyEquivalent: ""); item.target = self; menu.addItem(item); return item }
    func registerHotkey() {
        var event = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let callback: EventHandlerUPP = { _, event, context in
            guard let event, let context else { return OSStatus(eventNotHandledErr) }
            var id = EventHotKeyID()
            let result = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            if result == noErr { let app = Unmanaged<MovesApp>.fromOpaque(context).takeUnretainedValue(); if id.id == 1 { app.toggle() } else { app.stop() } }
            return noErr
        }
        let result = InstallEventHandler(GetApplicationEventTarget(), callback, 1, &event, Unmanaged.passUnretained(self).toOpaque(), &handler)
        let registered = RegisterEventHotKey(UInt32(kVK_ANSI_M), UInt32(controlKey | optionKey), EventHotKeyID(signature: 0x4D4F5645, id: 1), GetApplicationEventTarget(), OptionBits(kEventHotKeyExclusive), &hotKey)
        if result != noErr || registered != noErr { display("Shortcut unavailable", "Control–Option–M is unavailable. Use the Moves menu to toggle.") }
    }
    func bindEscape() { if escapeKey == nil { _ = RegisterEventHotKey(UInt32(kVK_Escape), 0, EventHotKeyID(signature: 0x4D4F5645, id: 2), GetApplicationEventTarget(), OptionBits(kEventHotKeyExclusive), &escapeKey) } }
    @objc func toggle() {
        if requested { stop(); return }
        guard loaded else { display("Starting", "The bundled tracker is still loading. Try again in a moment."); return }
        requested = true; generation += 1; let token = generation; showPanel()
        webView.evaluateJavaScript("document.getElementById('toggle').textContent='Cancel setup';", completionHandler: nil)
        // Camera consent is independent of scroll-output permission. A denied
        // output preflight must not make the camera setup silently unreachable.
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: finishSetup(token)
        case .notDetermined:
            display("Camera permission", "Choose Allow in the macOS camera prompt. No scrolling starts until control access is also allowed.")
            NSApp.activate(ignoringOtherApps: true)
            AVCaptureDevice.requestAccess(for: .video) { [weak self] allowed in DispatchQueue.main.async { guard let self, self.requested, self.generation == token else { return }; if allowed { self.finishSetup(token) } else { self.stop(reason: "Camera access denied. Enable Camera access for Moves in System Settings.") } } }
        default: stop(reason: "Camera access denied. Enable Camera access for Moves in System Settings.")
        }
    }
    func finishSetup(_ token: Int) {
        guard requested, token == generation else { return }
        guard CGPreflightPostEventAccess() else {
            _ = CGRequestPostEventAccess()
            stop(reason: "Camera allowed. macOS still denies scroll control. Remove the old Moves entry from Device Control and Data Access, add this installed app again, then click Start.")
            showPanel(); return
        }
        bindEscape(); output.reset(); lastPointer = nil; lastPID = nil
        toggleItem.title = "Disable gesture scrolling  ⌃⌥M"; statusItem.button?.title = "Moves …"
        webView.evaluateJavaScript("document.getElementById('toggle').textContent='Stop scrolling';", completionHandler: nil)
        startTracking(token)
    }
    func startTracking(_ token: Int) {
        guard requested, token == generation else { return }
        // start() is async. Discard its Promise result: WebKit cannot serialize
        // a Promise through evaluateJavaScript's completion handler. Async
        // startup failures arrive through the existing session-bound bridge.
        configureTracker(); webView.evaluateJavaScript("void window.movesNative.start(\(token));") { [weak self] _, error in if let error, let self, self.generation == token { self.stop(reason: error.localizedDescription) } }
    }
    func stop(reason: String? = nil) {
        requested = false; armed = false; generation += 1; output.reset(); awaitingReset = false; lastPointer = nil; lastPID = nil
        if let escapeKey { UnregisterEventHotKey(escapeKey); self.escapeKey = nil }
        toggleItem.title = "Enable gesture scrolling  ⌃⌥M"; statusItem.button?.title = "Moves ○"
        if loaded { webView.evaluateJavaScript("document.getElementById('toggle').textContent='Start scrolling';", completionHandler: nil) }
        if loaded { webView.evaluateJavaScript("window.movesNative.stop();", completionHandler: nil); webView.setCameraCaptureState(.none, completionHandler: nil) }
        if let reason { display("Off", reason) }
        else { panel.orderOut(nil) }
    }
    @objc func toggleHorizontal() { horizontal.toggle(); horizontalItem.state = horizontal ? .on : .off; horizontalItem.title = horizontal ? "Disable sideways scrolling" : "Enable sideways scrolling"; output.reset(); configureTracker() }
    @objc func setSpeed(_ item: NSMenuItem) { sensitivity = item.tag; for sibling in item.menu?.items ?? [] { sibling.state = sibling == item ? .on : .off }; output.reset(); configureTracker() }
    func configureTracker() { if loaded { awaitingReset = true; webView.evaluateJavaScript("window.movesNative.configure(\(horizontal),\(sensitivity));", completionHandler: nil) } }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "http", message.frameInfo.securityOrigin.host == "127.0.0.1", message.frameInfo.securityOrigin.port == Int(server.port), let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "toggle" { toggle(); return }
        if type == "size", let height = body["height"] as? Double, height.isFinite { fitPanel(height); return }
        if type == "loaded" { loaded = true; configureTracker(); webView.evaluateJavaScript("window.movesNative.warmup();", completionHandler: nil); return }
        if type == "warmup" { warmupPassed = body["ok"] as? Bool == true; if checkMode { print(warmupPassed ? "PASS native WebKit: bundled model and WASM performed inference; no camera access or system input." : "FAIL native WebKit: \(body["message"] ?? "unknown error")"); exit(warmupPassed ? 0 : 1) }; return }
        guard requested, body["session"] as? Int == generation else { return }
        if type == "error" { stop(reason: body["message"] as? String ?? "Tracker failed."); return }
        if type == "reset" { output.reset(); awaitingReset = false; return }
        if type == "started" { armed = true; awaitingReset = false; lastMessage = Date(); statusItem.button?.title = "Moves ●"; return }
        guard armed else { return }
        if type == "motion" || type == "health" { lastMessage = Date() }
        guard type == "motion", !awaitingReset else { return }
        guard body["tracked"] as? Bool == true else { output.reset(); return }
        guard CGPreflightPostEventAccess(), let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != ProcessInfo.processInfo.processIdentifier, let pointer = CGEvent(source: nil)?.location else { output.reset(); return }
        // Avoid feeding our overlay, and rebase when the user chooses a different target.
        guard !panel.isVisible || !panel.frame.contains(NSEvent.mouseLocation) else { output.reset(); return }
        let changed = lastPID != front.processIdentifier || lastPointer.map { hypot($0.x - pointer.x, $0.y - pointer.y) > 8 } ?? true
        if changed { lastPID = front.processIdentifier; lastPointer = pointer; output.reset(); configureTracker(); return }
        guard let x = body["x"] as? Double, let y = body["y"] as? Double else { return }
        if let event = output.event(x: horizontal ? x : 0, y: y, location: pointer) { event.post(tap: .cghidEventTap) }
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(requested && origin.protocol == "http" && origin.host == "127.0.0.1" && origin.port == Int(server.port) && frame.isMainFrame && type == .camera && AVCaptureDevice.authorizationStatus(for: .video) == .authorized ? .grant : .deny)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) { let url = navigationAction.request.url; decisionHandler(url?.scheme == "http" && url?.host == "127.0.0.1" && url?.port == Int(server.port) ? .allow : .cancel) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loaded = false; stop(reason: "Tracker process stopped. Relaunch Moves.") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { display("Unavailable", error.localizedDescription) }
    func display(_ state: String, _ message: String) {
        guard loaded else { panel.title = "Moves · \(state)"; NSLog("Moves: %@", message); return }
        let values = try! JSONSerialization.data(withJSONObject: [state, message]); let json = String(data: values, encoding: .utf8)!
        webView.evaluateJavaScript("{ const v=\(json); document.getElementById('state').textContent=v[0]; document.getElementById('message').textContent=v[1]; document.getElementById('message').hidden=false; }", completionHandler: nil)
    }
    @objc func showPanel() {
        guard let panel else { return }
        if let screen = NSScreen.main, !NSScreen.screens.contains(where: { $0.visibleFrame.intersects(panel.frame) }) {
            panel.setFrameOrigin(NSPoint(x: screen.visibleFrame.maxX - panel.frame.width - 20, y: screen.visibleFrame.minY + 20))
        }
        panel.orderFrontRegardless()
    }
    @objc func openAccessibility() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!) }
    func fitPanel(_ height: Double) {
        let top = panel.frame.maxY
        panel.setContentSize(NSSize(width: 264, height: max(130, min(520, height))))
        var frame = panel.frame
        frame.origin.y = top - frame.height
        if let screen = panel.screen ?? NSScreen.main {
            frame.origin.y = max(screen.visibleFrame.minY, min(frame.origin.y, screen.visibleFrame.maxY - frame.height))
        }
        panel.setFrame(frame, display: true)
    }
    @objc func sleeping() { stop(reason: "Paused for sleep or lock. Toggle to resume.") }
    func windowWillClose(_ notification: Notification) { stop() }
    @objc func quit() { stop(); NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { requested = false; armed = false; watchdog?.invalidate(); if let hotKey { UnregisterEventHotKey(hotKey) }; if let escapeKey { UnregisterEventHotKey(escapeKey) }; server?.stop() }
}

if CommandLine.arguments.contains("--self-test") { runSelfTests(); exit(0) }
let application = NSApplication.shared
let delegate = MovesApp()
application.delegate = delegate
application.run()
