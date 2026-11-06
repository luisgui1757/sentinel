import { label } from "../protocol/labels.mjs";
import { endpoint } from "../transport/http.mjs";

export const status = count => `${endpoint()}: ${label(count)}`;
