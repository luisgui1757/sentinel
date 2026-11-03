#include <atlas/font.h>
#include <atlas/geom.h>

namespace atlas {
double advance(char c) { return distance({0, 0}, {c % 7 + 4.0, 0}); }
}
