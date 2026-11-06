.PHONY: test
test:
	python3 -m unittest discover -s services -t .
	cargo check --quiet --manifest-path agent/Cargo.toml
