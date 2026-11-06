#include "ledger_ffi.h"

#include <fixed/fixed.h>
#include <iso/currency.h>

long long ledger_convert(const char *to, long long cents, long long rate_micros) {
  const iso_currency_t *c = iso_currency(to);
  if (!c) return 0;
  fixed_t value = fixed_mul(fixed_make(cents, 2), fixed_make(rate_micros, 6));
  return fixed_rescale(value, c->minor_units).units;
}
