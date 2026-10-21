export const attachmentPaths = (value, fallback) => {
  let paths = value;
  if (typeof paths === 'string') { try { paths = JSON.parse(paths); } catch { paths = []; } }
  const files = Array.isArray(paths) ? paths.filter(path => typeof path === 'string' && path.trim()) : [];
  return [...new Set(files.length ? files : (typeof fallback === 'string' && fallback.trim() ? [fallback] : []))];
};
export const applicationDocumentGroups = (data, names) => {
  const groups = Object.entries(names).map(([key, label]) => {
    const permit_key = 'permit_' + key;
    return { permit_key, label, files: attachmentPaths((data.permitFiles || []).filter(file => file.permit_key === permit_key).map(file => file.file_path), data.application?.[permit_key]) };
  });
  for (const document of data.customDocuments || []) {
    const criterion = (data.customCriteria || []).find(item => String(item.id) === String(document.criteria_id));
    groups.push({ permit_key: 'custom_document_' + document.criteria_id, label: criterion?.label || 'Additional document', files: attachmentPaths(document.file_paths, document.file_path) });
  }
  return groups.filter(group => group.files.length);
};
