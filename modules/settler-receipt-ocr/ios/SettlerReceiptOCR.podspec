Pod::Spec.new do |s|
  s.name = 'SettlerReceiptOCR'
  s.version = '1.0.0'
  s.summary = 'On-device receipt recognition for Settler'
  s.description = 'Reads private receipt images using Apple Vision without a network service.'
  s.author = 'Raza Tech Labs'
  s.license = 'MIT'
  s.homepage = 'https://github.com/razatechlabs'
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'ImageIO'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
