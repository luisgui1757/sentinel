#include <chrono>
#include "ingest/clock.h"

namespace ingest {
long now_ms() {
  using namespace std::chrono;
  return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}
}
