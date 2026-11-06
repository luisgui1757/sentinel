#include <string.h>

#include <fixed/fixed.h>
#include <iso/currency.h>

static const iso_currency_t table[] = {
    {"USD", 2}, {"EUR", 2}, {"GBP", 2}, {"JPY", 0}, {"BHD", 3}, {"CHF", 2},
};

const iso_currency_t *iso_currency(const char *code) {
  for (size_t i = 0; i < sizeof table / sizeof *table; i++)
    if (strcmp(table[i].code, code) == 0) return &table[i];
  return NULL;
}

long long iso_to_minor(const char *code, long long micros) {
  const iso_currency_t *c = iso_currency(code);
  if (!c) return 0;
  return fixed_rescale(fixed_make(micros, 6), c->minor_units).units;
}
