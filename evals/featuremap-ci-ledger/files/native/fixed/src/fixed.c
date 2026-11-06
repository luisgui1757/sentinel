#include <fixed/fixed.h>

fixed_t fixed_make(int64_t units, int scale) {
  fixed_t value = {units, scale};
  return value;
}

fixed_t fixed_mul(fixed_t a, fixed_t b) {
  return fixed_make(a.units * b.units, a.scale + b.scale);
}
