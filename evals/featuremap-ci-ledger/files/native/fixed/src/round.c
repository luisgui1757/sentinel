#include <fixed/fixed.h>

static int64_t pow10i(int n) {
  int64_t p = 1;
  while (n-- > 0) p *= 10;
  return p;
}

fixed_t fixed_rescale(fixed_t value, int scale) {
  if (scale >= value.scale) return fixed_make(value.units * pow10i(scale - value.scale), scale);
  int64_t div = pow10i(value.scale - scale), q = value.units / div, r = value.units % div;
  if (2 * (r < 0 ? -r : r) > div || (2 * (r < 0 ? -r : r) == div && q % 2 != 0)) q += value.units < 0 ? -1 : 1;
  return fixed_make(q, scale);
}
