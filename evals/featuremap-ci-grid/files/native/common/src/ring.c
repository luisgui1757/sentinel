#include <common/ring.h>

void ring_push(ring_t *r, float v) {
  r->data[r->head] = v;
  r->head = (r->head + 1) % 64;
}
