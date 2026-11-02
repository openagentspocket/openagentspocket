import Foundation

// Entry point: `Tests.run` returns the number of failed checks.
let failures = Tests.run(vectorsPath: CommandLine.arguments.dropFirst().first ?? "")
exit(failures == 0 ? 0 : 1)
