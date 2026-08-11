import axios from 'axios';

/**
 * Downloads a file securely by fetching it with the Authorization token,
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
    const response = await axios.get(url, {
      responseType: 'blob',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const blob = response.data;
    const blobUrl = window.URL.createObjectURL(blob);

    // Extract filename from URL
    const filename = url.substring(url.lastIndexOf('/') + 1) || 'download';

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    if (onError) onError(error);
  } finally {
    if (onEnd) onEnd();
  }
}
