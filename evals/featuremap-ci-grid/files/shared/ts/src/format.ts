import { toKwh } from '../../../sdk/src/units';

export const formatKwh = (kwh: number) => `${kwh.toFixed(1)} kWh`;

export const formatWh = (wh: number) => formatKwh(toKwh(wh));
