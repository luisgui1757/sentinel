cmake_minimum_required(VERSION 3.20)
project(grid_native C CXX)

add_library(common common/src/ring.c)
target_include_directories(common PUBLIC common/include)

add_library(dsp dsp/src/filter.cc dsp/src/window.cc)
target_include_directories(dsp PUBLIC dsp/include PRIVATE ingest/include/ingest)
target_link_libraries(dsp PUBLIC common)

add_executable(ingest ingest/src/main.cc ingest/src/calib.cc)
target_include_directories(ingest PRIVATE ingest/include)
target_link_libraries(ingest PRIVATE dsp common)
