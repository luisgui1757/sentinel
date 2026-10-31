#!/usr/bin/env node
// SPDX-License-Identifier: MIT

// prettier-ignore
export const IDENTITY = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

// sum the totals
export const sum = values => values.reduce((total, value) => total + value, 0);
