Gem::Specification.new do |spec|
  spec.name = "ledger-api"
  spec.version = "0.4.0"
  spec.summary = "Ledger api"
  spec.authors = ["Ledger team"]
  spec.files = Dir["lib/**/*.rb"]
  spec.required_ruby_version = ">= 3.2"
  spec.add_dependency "ledger-core"
end
