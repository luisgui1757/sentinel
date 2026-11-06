#pragma once
#include <atlas/geom.h>

namespace atlas {
inline int coverage(double area) { return area > 0.5 ? 255 : static_cast<int>(area * 510); }
int fill(Point a, Point b);
}
