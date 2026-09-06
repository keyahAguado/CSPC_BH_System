// Flexible multi-word search shared across admin/owner list filters.
// Splits the query into words and requires every word to appear somewhere
// across the given fields (any order, any field) — so searching
// "boarding house Hernandez" still matches "Hernandez Boardinghouse",
// unlike a naive single-substring match against the whole typed phrase.
export function matchesSearch(query, fields) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = fields.filter(Boolean).join(' ').toLowerCase();
  return terms.every(term => haystack.includes(term));
}
