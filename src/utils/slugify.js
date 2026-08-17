export const slugify = (text) => {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace anything not a-z/0-9 with a hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
};

// appends -2, -3, etc. if the base slug is already taken.
// Pass `session` when calling inside a MongoDB transaction so the uniqueness
// check can see that transaction's own uncommitted writes (read-your-own-writes).
export const generateUniqueSlug = async (Model, name, session = null) => {
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 2;

  while (await Model.exists({ slug }, session ? { session } : undefined)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};