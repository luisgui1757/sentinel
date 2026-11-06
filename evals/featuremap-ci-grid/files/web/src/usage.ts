import { usage } from '@grid/sdk';
import { formatWh } from '@shared/format';
import { session } from './session';

export async function render(meter: string, token: string) {
  const headers = session(token);
  return { headers, text: await usage(meter), sample: formatWh(1500) };
}
