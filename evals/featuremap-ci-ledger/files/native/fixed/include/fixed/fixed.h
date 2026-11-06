#ifndef FIXED_FIXED_H
#define FIXED_FIXED_H

#include <stdint.h>

typedef struct {
  int64_t units;
  int scale;
} fixed_t;

fixed_t fixed_make(int64_t units, int scale);
fixed_t fixed_mul(fixed_t a, fixed_t b);
fixed_t fixed_rescale(fixed_t value, int scale);

#endif
