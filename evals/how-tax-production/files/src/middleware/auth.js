export async function auth(context) {
  if (!context.headers['x-api-key']) throw new Error('missing api key');
}
