#ifndef COMMON_RING_H
#define COMMON_RING_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  float data[64];
  int head;
} ring_t;

void ring_push(ring_t *r, float v);

#ifdef __cplusplus
}
#endif

#endif
