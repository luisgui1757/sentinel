.PHONY: test
test:
	PYTHONPATH=pipeline/src python3 -m unittest discover -s pipeline/tests
	cargo check --quiet --manifest-path crates/Cargo.toml
