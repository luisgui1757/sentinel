# Atlas

Atlas is a map editor. It cuts map data into tiles, draws them, and serves
them.

## Package boundaries

| Package | Folder | May depend on |
| --- | --- | --- |
| core | `packages/core/` | nothing |
| renderer | `packages/renderer/` | core |
| editor | `packages/editor/` | core, renderer |
| measure plugin | `packages/plugins/measure/` | core |
| common | `pipeline/src/pipeline/common/` | nothing |
| tiles | `pipeline/src/pipeline/tiles/` | common |
| export | `pipeline/src/pipeline/export/` | tiles, common |
| geom | `native/geom/` | nothing |
| raster | `native/raster/` | geom |
| text | `native/text/` | geom |
| cli | `native/cli/` | geom, raster, text |
| codec | `crates/codec/` | nothing |
| style | `crates/style/` | nothing |
| tilecache | `crates/tilecache/` | codec |
| server | `crates/server/` | tilecache, codec, style |

A package may use its own code. The pipeline tests may use any package.

## Develop

```sh
make test
cmake -S native -B build && cmake --build build
```
