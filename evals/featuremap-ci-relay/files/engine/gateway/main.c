#include "filter/accept.h"
#include "wire/frame.h"
#include "gateway/runtime.h"

int main(void) { return !(accept_frame(QUEUE_DEPTH) && frame_size(2) == 8); }
