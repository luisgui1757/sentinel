#include <atlas/fill.h>

namespace atlas {
int fill(Point a, Point b) { return coverage(distance(a, b) / 10.0); }
}
