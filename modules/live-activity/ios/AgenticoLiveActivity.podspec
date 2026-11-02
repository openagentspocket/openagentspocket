require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# Starts, updates and ends the per-Host agent Live Activity through ActivityKit. iOS only.
Pod::Spec.new do |s|
  s.name           = 'AgenticoLiveActivity'
  s.version        = package['version']
  s.summary        = 'ActivityKit bridge for the agent Live Activity'
  s.description    = s.summary
  s.license        = { type: 'MIT' }
  s.author         = 'OpenAgentsPocket contributors'
  s.homepage       = 'https://github.com/openagentspocket'
  s.platforms      = { ios: '18.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
