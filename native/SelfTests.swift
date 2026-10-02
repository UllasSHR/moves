import Foundation
import CoreGraphics
import Network

private func checkRawHTTP(port: UInt16, request: String, code: Int) {
    let connection = NWConnection(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!, using: .tcp)
    let queue = DispatchQueue(label: "moves.http-test")
    var done = false
    connection.stateUpdateHandler = { state in
        if case .ready = state {
            connection.send(content: Data(request.utf8), completion: .contentProcessed { error in
                precondition(error == nil)
                connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, _, error in
                    precondition(error == nil)
                    let text = String(data: data ?? Data(), encoding: .utf8) ?? ""
                    precondition(text.hasPrefix("HTTP/1.1 \(code) "), "Expected \(code), got \(text.prefix(60))")
                    connection.cancel()
                    DispatchQueue.main.async { done = true }
                }
            })
        }
    }
    connection.start(queue: queue)
    let deadline = Date().addingTimeInterval(8)
    while !done && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
    precondition(done, "Raw HTTP check timed out")
}

func runSelfTests() {
    var output = ScrollOutput()
    let point = CGPoint(x: 20, y: 30)
    let up = output.event(x: 0, y: 9, location: point)!
    precondition(up.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == -9)
    precondition(up.getIntegerValueField(.scrollWheelEventIsContinuous) == 1)
    let diagonal = output.event(x: -6, y: -8, location: point)!
    precondition(diagonal.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == 8)
    precondition(diagonal.getIntegerValueField(.scrollWheelEventPointDeltaAxis2) == 6)
    precondition(diagonal.location == point)
    precondition(output.event(x: 0, y: 0, location: point) == nil)
    precondition(output.event(x: .nan, y: 0, location: point) == nil)
    precondition(output.event(x: 0, y: 100, location: point) == nil)
    precondition(output.event(x: 0, y: 0.6, location: point) == nil)
    precondition(output.event(x: 0, y: 0.6, location: point)!.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == -1)
    output.reset(); precondition(output.event(x: 0, y: 0.6, location: point) == nil)
    print("PASS Quartz construction: signs, both axes, continuous pixels, pointer location, fractional accumulation, reset, invalid input. No events posted.")
    let server = LoopbackServer(root: Bundle.main.resourceURL!.appendingPathComponent("Web"))
    var done = false
    try! server.start { result in
        let url = try! result.get()
        precondition(url.host == "127.0.0.1")
        let base = "http://127.0.0.1:\(url.port!)"
        let cases: [(String, Int, String, String?, String?)] = [
            ("/native.html",200,"GET",nil,nil),
            ("/native.html",200,"HEAD",nil,nil),
            ("/models/hand_landmarker.task",200,"GET",nil,nil),
            ("/wasm/vision_wasm_internal.wasm",200,"GET",nil,nil),
            ("/missing",404,"GET",nil,nil),
            ("/%2e%2e/Info.plist",403,"GET",nil,nil),
            ("/%2e%2e%2fInfo.plist",403,"GET",nil,nil),
            ("/%00",403,"GET",nil,nil),
            ("/%5cInfo.plist",403,"GET",nil,nil),
            ("/native.html",405,"POST",nil,nil),
            ("/native.html",403,"GET","attacker.example",nil),
            ("/native.html",403,"GET",nil,"https://attacker.example"),
            ("/native.html",200,"GET",nil,base)
        ]
        var remaining = cases.count
        for (path, code, method, host, origin) in cases {
            var request = URLRequest(url: URL(string: base + path)!)
            request.httpMethod = method
            if let host { request.setValue(host, forHTTPHeaderField: "Host") }
            if let origin { request.setValue(origin, forHTTPHeaderField: "Origin") }
            URLSession.shared.dataTask(with: request) { data, response, error in
                precondition(error == nil, String(describing: error))
                let http = response as! HTTPURLResponse
                precondition(http.statusCode == code, "\(path): expected \(code), got \(http.statusCode)")
                if code == 200 {
                    precondition(method == "HEAD" ? data?.isEmpty == true : !(data?.isEmpty ?? true))
                    precondition(http.value(forHTTPHeaderField: "Content-Security-Policy")?.contains("frame-ancestors 'none'") == true)
                    precondition(http.value(forHTTPHeaderField: "X-Content-Type-Options") == "nosniff")
                    precondition(http.value(forHTTPHeaderField: "Referrer-Policy") == "no-referrer")
                    precondition(http.value(forHTTPHeaderField: "Access-Control-Allow-Origin") == nil)
                }
                DispatchQueue.main.async { remaining -= 1; if remaining == 0 { done = true } }
            }.resume()
        }
    }
    let deadline = Date().addingTimeInterval(12)
    while !done && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
    precondition(done, "Loopback server timed out")
    checkRawHTTP(port: server.port, request: "GET /native.html HTTP/1.1\r\n\r\n", code: 403)
    checkRawHTTP(port: server.port, request: "GET /native.html HTTP/1.1\r\nHost: 127.0.0.1:\(server.port)\r\nHost: attacker.example\r\n\r\n", code: 403)
    checkRawHTTP(port: server.port, request: "GET /native.html HTTP/1.1\r\nMalformed header\r\n\r\n", code: 400)
    checkRawHTTP(port: server.port, request: "GET /native.html HTTP/1.1\r\nHost: 127.0.0.1:\(server.port)\r\nX-Large: " + String(repeating: "x", count: 34000) + "\r\n\r\n", code: 431)
    server.stop()
    print("PASS loopback assets, model/WASM bytes, HEAD, security headers, method/host/origin restrictions, missing files and encoded traversal/NUL/backslash rejection.")
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("moves-http-fixture-\(UUID().uuidString)")
    let root = temporary.appendingPathComponent("Web")
    try! FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: temporary) }
    let outside = temporary.appendingPathComponent("private-fixture.txt")
    try! Data("Synthetic private fixture".utf8).write(to: outside)
    try! FileManager.default.createSymbolicLink(at: root.appendingPathComponent("escape.txt"), withDestinationURL: outside)
    let fixtureServer = LoopbackServer(root: root)
    done = false
    try! fixtureServer.start { _ in done = true }
    let fixtureDeadline = Date().addingTimeInterval(5)
    while !done && Date() < fixtureDeadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
    precondition(done)
    checkRawHTTP(port: fixtureServer.port, request: "GET /escape.txt HTTP/1.1\r\nHost: 127.0.0.1:\(fixtureServer.port)\r\n\r\n", code: 404)
    fixtureServer.stop()
    print("PASS missing/duplicate Host, malformed/oversized headers, and symlink escape rejection. No camera access or system input.")
}
