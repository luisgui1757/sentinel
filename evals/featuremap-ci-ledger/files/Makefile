.PHONY: test
test:
	ruby -Igems/core/lib -Igems/api/lib -Igems/admin/lib -e 'ARGV.each { |f| require File.expand_path(f) }' tests/ruby/*_test.rb
	PYTHONPATH=jobs python3 -m unittest discover -s tests/python
	cargo check --quiet --manifest-path engine/Cargo.toml
	cmake -S native -B build > /dev/null
	cmake --build build > /dev/null
