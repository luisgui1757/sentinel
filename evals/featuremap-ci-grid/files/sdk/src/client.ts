import { formatKwh } from '@grid/shared';
import { retry } from './retry';

export async function usage(meter: string): Promise<string> {
  const res = await retry(() => fetch(`/api/meters/${meter}/usage`));
  const body = (await res.json()) as { kwh: number };
  return formatKwh(body.kwh);
}
