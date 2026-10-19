export function roomList(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
export const roomFormDetails = (room = {}) => ({ floor_label: room.floor_label || '', description: room.description || '', amenities_free: [...roomList(room.amenities_free ?? room.amenities)], amenities_paid: [...roomList(room.amenities_paid)], existing_photos: [...roomList(room.photos)], files: [], photo_required: roomList(room.photos).length > 0 });
export function roomFormData(core, details) {
  const data = new FormData();
  for (const [key, value] of Object.entries(core)) data.append(key, value ?? '');
  data.append('floor_label', details.floor_label.trim());
  data.append('description', (details.description || '').trim());
  data.append('amenities_free', JSON.stringify(details.amenities_free));
  data.append('amenities_paid', JSON.stringify(details.amenities_paid));
  data.append('existing_photos', JSON.stringify(details.existing_photos));
  for (const file of details.files) data.append('room_photos', file);
  return data;
}
export function roomDetailsError(details, isNew = false) {
  if (!details.floor_label.trim()) return 'Specify the room floor/storey.';
  if (details.floor_label.trim().length > 60) return 'Floor/storey must be 60 characters or fewer.';
  if ((details.description || '').trim().length > 1000) return 'Room description must be 1,000 characters or fewer.';
  const count = details.existing_photos.length + details.files.length;
  if ((isNew || details.photo_required) && !count) return 'Upload at least one actual room photo.';
  if (count > 6) return 'A room can have up to 6 photos.';
  if (details.files.some(file => file.size > 10 * 1024 * 1024)) return 'Each room photo must be 10 MB or smaller.';
  return null;
}
