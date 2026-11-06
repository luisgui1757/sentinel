---
type: llm
---

The reply reports the four violations of the README boundaries that the code has today, by file or by package: `packages/plugins/measure/src/index.ts` imports `@gl/context`, which the path alias maps to the renderer (measure uses renderer); `pipeline/src/pipeline/tiles/cut.py` imports `pipeline.export.formats` (tiles uses export); `native/text/src/glyph.cc` includes `atlas/fill.h` of raster (text uses raster); and the `style` crate depends on the `codec` crate through the workspace dependencies (style uses codec). The reply does not call another dependency a violation.
