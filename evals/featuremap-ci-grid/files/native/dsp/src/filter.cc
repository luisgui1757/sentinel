#include <dsp/filter.h>

namespace dsp {
float lowpass(const ring_t &r, float alpha) {
  float out = 0;
  for (int i = 0; i < 64; i++) out = alpha * r.data[i] + (1 - alpha) * out;
  return out;
}
}
