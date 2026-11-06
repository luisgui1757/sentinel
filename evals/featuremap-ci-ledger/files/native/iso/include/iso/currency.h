#ifndef ISO_CURRENCY_H
#define ISO_CURRENCY_H

typedef struct {
  const char *code;
  int minor_units;
} iso_currency_t;

const iso_currency_t *iso_currency(const char *code);
long long iso_to_minor(const char *code, long long micros);

#endif
