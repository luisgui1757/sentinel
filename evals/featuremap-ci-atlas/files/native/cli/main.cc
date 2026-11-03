#include <atlas/fill.h>
#include <atlas/font.h>
#include <atlas/geom.h>
#include <cstdio>

int main() {
  std::printf("%d %f\n", atlas::fill({0, 0}, {3, 4}), atlas::advance('a'));
}
