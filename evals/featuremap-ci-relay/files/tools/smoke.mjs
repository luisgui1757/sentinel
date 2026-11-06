import assert from "node:assert/strict";
import { status } from "../control/console/main.mjs";

assert.equal(status(3), "/v1/frames: 3 samples");
