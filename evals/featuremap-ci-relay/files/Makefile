.PHONY: test
test:
	node tools/smoke.mjs
	python3 -m config.provision.main
	cmake -S engine -B build
	cmake --build build
	./build/relay
