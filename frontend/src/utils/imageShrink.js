// Shrinks large phone photos before upload so submissions send megabytes less over mobile data.
// Re-encodes to JPEG only when the image is larger than maxSide or heavier than minBytes, and keeps
// the original whenever shrinking fails or would not make the file smaller. PDFs are never touched.
export async function shrinkImage(file, { maxSide = 1920, quality = 0.85, minBytes = 900 * 1024 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= minBytes) { bitmap.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

// Permits and clearances keep more pixels so small print stays readable.
export const shrinkDocumentImage = (file) => shrinkImage(file, { maxSide: 2400, quality: 0.88 });
