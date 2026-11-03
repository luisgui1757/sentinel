#include <atlas/fill.h>
#include <atlas/font.h>

namespace atlas {
int glyph_alpha(char c) { return coverage(em(advance(c))); }
}
