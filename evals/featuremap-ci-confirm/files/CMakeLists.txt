cmake_minimum_required(VERSION 3.16)
project(confirm LANGUAGES C)
add_library(part_headers INTERFACE)
target_include_directories(part_headers INTERFACE
  ${CMAKE_CURRENT_SOURCE_DIR}/components/kernel/include
  ${CMAKE_CURRENT_SOURCE_DIR}/components/planner/include
  ${CMAKE_CURRENT_SOURCE_DIR}/components/console/include)
add_library(kernel STATIC components/kernel/kernel.c)
add_library(planner STATIC components/planner/planner.c)
add_library(console STATIC components/console/console.c)
foreach(part kernel planner console)
  target_link_libraries(${part} PRIVATE part_headers)
endforeach()
