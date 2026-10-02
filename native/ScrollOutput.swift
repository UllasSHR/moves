import Foundation
import CoreGraphics

// No queued motion or inertia: fractional pixels are carried only while tracking.
struct ScrollOutput {
    private var remainderX = 0.0
    private var remainderY = 0.0
    mutating func reset() { remainderX = 0; remainderY = 0 }
    mutating func event(x: Double, y: Double, location: CGPoint) -> CGEvent? {
        guard x.isFinite, y.isFinite, abs(x) <= 40, abs(y) <= 40 else { reset(); return nil }
        remainderX += x; remainderY += y
        let px = Int32(remainderX.rounded(.towardZero)), py = Int32(remainderY.rounded(.towardZero))
        remainderX -= Double(px); remainderY -= Double(py)
        guard px != 0 || py != 0 else { return nil }
        // DOM positive offset moves content up/left; Quartz positive wheel moves it down/right.
        guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: -py, wheel2: -px, wheel3: 0) else { return nil }
        event.location = location
        event.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
        return event
    }
}
