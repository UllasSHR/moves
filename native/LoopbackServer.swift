import Foundation
import Network

final class LoopbackServer {
    private let root: URL
    private let queue = DispatchQueue(label: "moves.loopback")
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]
    private(set) var port: UInt16 = 0
    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }
    func start(completion: @escaping (Result<URL, Error>) -> Void) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        let listener = try NWListener(using: parameters)
        self.listener = listener
        var reported = false
        listener.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                guard !reported, let port = listener.port else { return }
                reported = true; self.port = port.rawValue
                DispatchQueue.main.async { completion(.success(URL(string: "http://127.0.0.1:\(port.rawValue)/native.html")!)) }
            case .failed(let error):
                guard !reported else { return }; reported = true
                DispatchQueue.main.async { completion(.failure(error)) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            guard self.connections.count < 16 else { connection.cancel(); return }
            let id = UUID(); self.connections[id] = connection
            connection.stateUpdateHandler = { [weak self] state in
                if case .cancelled = state { self?.connections.removeValue(forKey: id) }
                if case .failed = state { connection.cancel() }
            }
            connection.start(queue: self.queue)
            self.receive(connection, accumulated: Data())
            self.queue.asyncAfter(deadline: .now() + 5) { connection.cancel() }
        }
        listener.start(queue: queue)
    }
    func stop() { queue.async { [self] in listener?.cancel(); connections.values.forEach { $0.cancel() }; connections.removeAll() } }
    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, ended, error in
            guard let self else { return }
            var bytes = accumulated; if let data { bytes.append(data) }
            if bytes.count > 32768 { self.reply(connection, code: 431, body: Data()); return }
            if let text = String(data: bytes, encoding: .utf8), text.contains("\r\n\r\n") {
                self.handle(connection, request: text)
            } else if ended || error != nil { connection.cancel() }
            else { self.receive(connection, accumulated: bytes) }
        }
    }
    private func handle(_ connection: NWConnection, request: String) {
        let lines = request.components(separatedBy: "\r\n\r\n")[0].components(separatedBy: "\r\n")
        let first = lines.first?.split(separator: " ") ?? []
        guard first.count == 3, first[2] == "HTTP/1.1" else { reply(connection, code: 400, body: Data()); return }
        guard first[0] == "GET" || first[0] == "HEAD" else { reply(connection, code: 405, body: Data()); return }
        var hosts: [String] = [], origins: [String] = []
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { reply(connection, code: 400, body: Data()); return }
            let name = line[..<colon].lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            if name == "host" { hosts.append(value) }
            if name == "origin" { origins.append(value) }
        }
        // A loopback bind alone does not reject browser DNS-rebinding requests.
        let authority = "127.0.0.1:\(port)"
        guard hosts == [authority], origins.isEmpty || origins == ["http://\(authority)"] else { reply(connection, code: 403, body: Data()); return }
        let encoded = String(first[1]).components(separatedBy: "?")[0]
        guard let path = encoded.removingPercentEncoding, path.hasPrefix("/"), !path.contains("\0"), !path.contains("\\"), !path.split(separator: "/").contains("..") else { reply(connection, code: 403, body: Data()); return }
        let file = root.appendingPathComponent(path == "/" ? "native.html" : String(path.dropFirst())).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else { reply(connection, code: 404, body: Data()); return }
        let types = ["html":"text/html; charset=utf-8", "js":"text/javascript; charset=utf-8", "css":"text/css", "wasm":"application/wasm", "task":"application/octet-stream", "png":"image/png"]
        reply(connection, code: 200, body: data, type: types[file.pathExtension] ?? "application/octet-stream", head: first[0] == "HEAD")
    }
    private func reply(_ connection: NWConnection, code: Int, body: Data, type: String = "text/plain", head: Bool = false) {
        let csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        let header = "HTTP/1.1 \(code) Response\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nPermissions-Policy: camera=(self), microphone=(), geolocation=()\r\nContent-Security-Policy: \(csp)\r\n\r\n"
        var response = Data(header.utf8); if !head { response.append(body) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}
