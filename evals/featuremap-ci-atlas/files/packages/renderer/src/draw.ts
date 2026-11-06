import { distance, type Point } from '@core/geometry';
import { context } from '@gl/context';

export function drawLine(canvas: HTMLCanvasElement, a: Point, b: Point) {
  const gl = context(canvas);
  return { gl, length: distance(a, b) };
}
