import { loadDocumentFile, fileTarget } from './openFile.js';

/**
 * Downloads a validated file; credentials are sent only to this app origin,
 * converting it to a same-origin blob URL, and triggering a programmatic download click.
 * 
 * @param {string} url - The URL of the file to download
 * @param {string} token - The Authorization Bearer token
 * @param {function} [onStart] - Callback triggered when the download starts
 * @param {function} [onEnd] - Callback triggered when the download finishes (success or error)
 * @param {function} [onError] - Callback triggered if download fails
 */
export async function downloadOriginalFile(url, token, onStart, onEnd, onError) {
  if (onStart) onStart();
  try {
    const blob = await loadDocumentFile(url, {token});
    const blobUrl = window.URL.createObjectURL(blob);

    // Extract filename from URL
    const filename = decodeURIComponent(fileTarget(url).pathname.split('/').pop() || 'document').replace(/[\\/:*?"<>|]/g,'_');

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    if (onError) onError(error);
  } finally {
    if (onEnd) onEnd();
  }
}
