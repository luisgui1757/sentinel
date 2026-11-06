import { distance, type Point } from '@atlas/core';
import { context } from '@gl/context';

export function measure(canvas: HTMLCanvasElement, path: Point[]) {
  context(canvas);
  return path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
}
