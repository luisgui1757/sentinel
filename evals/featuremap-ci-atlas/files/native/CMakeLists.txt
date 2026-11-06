cmake_minimum_required(VERSION 3.20)
project(atlas_native CXX)

include_directories(geom/include raster/include text/include)

add_library(geom geom/src/geom.cc)
add_library(raster raster/src/fill.cc)
target_link_libraries(raster PUBLIC geom)
add_library(text text/src/font.cc text/src/glyph.cc)
target_link_libraries(text PUBLIC geom)
add_executable(atlas cli/main.cc)
target_link_libraries(atlas PRIVATE geom raster text)
