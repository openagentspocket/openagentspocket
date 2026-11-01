import Foundation

/// A value behind a lock that escaping closures can share (a `Mutex` is
/// noncopyable, so it cannot be captured by one).
final class Locked<Value>: @unchecked Sendable {
    private var value: Value
    private let lock = NSLock()

    init(_ value: Value) {
        self.value = value
    }

    func withLock<Result>(_ body: (inout Value) throws -> Result) rethrows -> Result {
        lock.lock()
        defer { lock.unlock() }
        return try body(&value)
    }

    /// Returns the current value and leaves `nil` behind.
    func take<Wrapped>() -> Wrapped? where Value == Wrapped? {
        withLock { value in
            let taken = value
            value = nil
            return taken
        }
    }
}
