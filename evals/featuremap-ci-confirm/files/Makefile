.PHONY: test
test:
	python3 -m unittest discover -s checks -t .
	cmake -S . -B build
	cmake --build build
