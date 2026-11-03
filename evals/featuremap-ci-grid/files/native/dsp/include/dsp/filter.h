#pragma once
#include <common/ring.h>

namespace dsp {
float lowpass(const ring_t &r, float alpha);
}
