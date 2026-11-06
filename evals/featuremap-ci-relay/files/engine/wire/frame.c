#include "wire/frame.h"
#include "filter/policy.h"

int frame_size(int samples) { return samples * SAMPLE_BYTES; }
