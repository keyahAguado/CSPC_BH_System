// Standard and configurable requirements share the same attachment viewer.
export function documentAttachments(document) {
  let files = document?.file_paths;
  if (typeof files === 'string') { try { files = JSON.parse(files); } catch { files = []; } }
  if (!Array.isArray(files) || !files.length) files = document?.file_path ? [document.file_path] : [];
  return [...new Set(files.filter(file => typeof file === 'string' && file))];
}
