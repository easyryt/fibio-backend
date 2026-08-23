/**
 * Escapes regex metacharacters so user-supplied strings are treated
 * as literals inside a RegExp or MongoDB $regex query.
 */
export const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
