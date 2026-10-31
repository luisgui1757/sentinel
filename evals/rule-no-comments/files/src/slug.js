// Turn a title into a URL slug.
export function slugify(title) {
  // lower case everything
  const lower = title.toLowerCase();
  // replace runs of other characters with one hyphen
  const dashed = lower.replace(/[^a-z0-9]+/g, '-');
  // trim hyphens at both ends
  return dashed.replace(/^-/, '').replace(/-$/, '');
}
