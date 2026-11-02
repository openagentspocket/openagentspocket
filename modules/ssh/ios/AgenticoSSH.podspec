require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# The SSH primitives over libssh2 + OpenSSL. AgenticoSSH/, CAgenticoSSHSupport/ and
# Artifacts/ are copied from the Agentico iOS app's AgenticoSSH package (Apache-2.0, see
# NOTICE); Module/ is the Expo bridge.
Pod::Spec.new do |s|
  s.name           = 'AgenticoSSH'
  s.version        = package['version']
  s.summary        = 'SSH primitives (libssh2 + OpenSSL) for the Agentico app'
  s.description    = s.summary
  s.license        = { type: 'Apache-2.0', file: 'LICENSE' }
  s.author         = 'Agentico contributors'
  s.homepage       = 'https://herdr.dev'
  s.platforms      = { ios: '18.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'Module/**/*.swift', 'AgenticoSSH/**/*.swift', 'CAgenticoSSHSupport/*.c'
  s.preserve_paths = 'CAgenticoSSHSupport/include/**', 'Artifacts/**', 'LICENSE', 'NOTICE'
  s.vendored_frameworks = 'Artifacts/CLibSSH2.xcframework', 'Artifacts/COpenSSL.xcframework'

  include_dir = '$(PODS_TARGET_SRCROOT)/CAgenticoSSHSupport/include'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_INCLUDE_PATHS' => include_dir,
    'HEADER_SEARCH_PATHS' => include_dir
  }
  # The AgenticoSSH Swift module records the C module as a dependency, so the app target (which
  # imports AgenticoSSH in its generated modules provider) must find its module map too. The
  # path is absolute because the app's xcconfig has no PODS_TARGET_SRCROOT; ios/ is generated.
  s.user_target_xcconfig = {
    'SWIFT_INCLUDE_PATHS' => "\"#{File.join(__dir__, 'CAgenticoSSHSupport', 'include')}\""
  }
end
