// Standard and configurable requirements share the same attachment viewer.
export function documentAttachments(document) {
  let files = document?.file_paths;
  if (typeof files === 'string') { try { files = JSON.parse(files); } catch { files = []; } }
  if (!Array.isArray(files) || !files.length) files = document?.file_path ? [document.file_path] : [];
  return [...new Set(files.filter(file => typeof file === 'string' && file))];
}

export function permitAttachments(house, key, rows = []) {
  if (!house || !key) return [];
  const files = rows.filter(row => String(row.house_id) === String(house.id) && row.permit_key === key)
    .flatMap(row => documentAttachments(row));
  // Preserve every ordered attachment, using the legacy first-file column only
  // when the normalized attachment table has no records for this permit.
  return documentAttachments({ file_paths: files, file_path: house[key] });
}
