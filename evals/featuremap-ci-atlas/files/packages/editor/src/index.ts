import { toMeters } from '@atlas/core';
import { drawLine } from '@atlas/renderer';
import { FONT_FAMILY } from './fonts';

export function ruler(canvas: HTMLCanvasElement, degrees: number) {
  drawLine(canvas, { x: 0, y: 0 }, { x: degrees, y: 0 });
  return `${toMeters(degrees).toFixed(0)} m (${FONT_FAMILY})`;
}
