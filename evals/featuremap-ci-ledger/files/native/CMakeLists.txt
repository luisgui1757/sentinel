cmake_minimum_required(VERSION 3.20)
project(ledger_native C)

set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_library(fixed fixed/src/fixed.c fixed/src/round.c)
target_include_directories(fixed PUBLIC fixed/include)

add_library(iso iso/src/currency.c)
target_include_directories(iso PUBLIC iso/include)
target_link_libraries(iso PRIVATE fixed)

add_library(ledger_ffi SHARED ffi/src/ffi.c)
target_include_directories(ledger_ffi PUBLIC ffi/include)
target_link_libraries(ledger_ffi PRIVATE fixed iso)
