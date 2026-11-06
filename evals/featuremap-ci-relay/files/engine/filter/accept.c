#include "filter/accept.h"
#include "filter/policy.h"
#include "wire/frame.h"

int accept_frame(int samples) { return samples >= MIN_SAMPLES && frame_size(samples) <= 512; }
