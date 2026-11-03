#include <cstdio>
#include <common/ring.h>
#include <dsp/filter.h>
#include "ingest/clock.h"

int main() {
  ring_t r{};
  ring_push(&r, 1.0f);
  std::printf("%ld %f\n", ingest::now_ms(), dsp::lowpass(r, 0.5f));
}
