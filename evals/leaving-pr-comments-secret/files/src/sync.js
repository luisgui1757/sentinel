export async function fetchCatalog(get, log = () => {}) {
  const response = await get('/v2/catalog');
  log(`try 1: ${response.status}`);
  if (response.status !== 200) throw new Error(`catalog request failed with ${response.status}`);
  return response.items;
}
