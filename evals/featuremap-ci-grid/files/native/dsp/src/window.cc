#include <cmath>
#include <dsp/window.h>
#include "clock.h"

namespace dsp {
float hann(int i, int n) { return 0.5f * (1 - std::cos(2 * M_PI * i / (n - 1))); }
float window_gain() { return 1.0f / ingest::SAMPLE_RATE_HZ; }
}
