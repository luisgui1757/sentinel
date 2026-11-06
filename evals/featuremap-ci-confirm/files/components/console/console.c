#include <console.h>
#include <planner.h>
#include <kernel.h>

int console_value(void) { return CONSOLE_PORT + PLAN_SIZE * UNIT; }
