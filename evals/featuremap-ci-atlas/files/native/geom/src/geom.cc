#include <atlas/geom.h>
#include <cmath>

namespace atlas {
double distance(Point a, Point b) { return std::hypot(a.x - b.x, a.y - b.y); }
}
