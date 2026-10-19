// Metadata is saved in the same transaction as the room's core fields.
import { saveUploadedFile } from './upload.js';
import { supportedImage } from './uploadValidation.js';
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function readRoomList(value) {
    if (value === undefined || value === null || value === '') return [];
    const list = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(list)) throw invalid('Please refresh the room form and try again.');
    return list;
}
export function parseRoomDetails(body, files = [], existing = {}, isNew = false) {
    const floor = body.floor_label === undefined ? (existing.floor_label || '') : body.floor_label;
    if (typeof floor !== 'string' || floor.trim().length > 60 || (isNew && !floor.trim())) throw invalid('Specify the floor/storey (60 characters or fewer).');
    const description = body.description === undefined ? (existing.description || '') : body.description;
    if (typeof description !== 'string' || description.trim().length > 1000) throw invalid('Room description must be 1,000 characters or fewer.');
    let free, paid, amenities, retained, previous;
    try {
        free = readRoomList(body.amenities_free === undefined ? (body.amenities === undefined ? existing.amenities_free ?? existing.amenities : body.amenities) : body.amenities_free);
        paid = readRoomList(body.amenities_paid === undefined ? existing.amenities_paid : body.amenities_paid);
        amenities = [...free, ...paid];
        previous = readRoomList(existing.photos);
        retained = body.existing_photos === undefined ? previous : readRoomList(body.existing_photos);
    } catch { throw invalid('The room amenities or photos could not be read. Please refresh and try again.'); }
    if (amenities.length > 30 || amenities.some(a => typeof a !== 'string' || !a.trim() || a.trim().length > 80)) throw invalid('Choose up to 30 room amenities, each 80 characters or fewer.');
    const freeNames = new Set(free.map(a => a.trim().toLowerCase()));
    if (paid.some(a => freeNames.has(a.trim().toLowerCase()))) throw invalid('An amenity must be either Free or Paid, not both.');
    if (retained.some(url => typeof url !== 'string' || !previous.includes(url))) throw invalid('Only photos already saved for this room can be retained.');
    retained = [...new Set(retained)];
    if (retained.length + files.length > 6) throw invalid('A room can have up to 6 photos.');
    if ((isNew || previous.length > 0) && retained.length + files.length === 0) throw invalid('Upload at least one actual room photo.');
    if (files.some(file => file.fieldname !== 'room_photos' || !supportedImage(file))) throw invalid('Room photos must be supported image files.');
    return { floor_label: floor.trim(), description: description.trim(), amenities: [...new Set(amenities.map(a => a.trim()))], amenities_free: [...new Set(free.map(a => a.trim()))], amenities_paid: [...new Set(paid.map(a => a.trim()))], retained };
}
export async function saveRoomDetails(connection, roomId, req, existing = {}, isNew = false) {
    const files = req.files || [];
    const details = parseRoomDetails(req.body, files, existing, isNew);
    const photos = [...details.retained];
    for (const file of files) photos.push(await saveUploadedFile(file.buffer, file.originalname, 'room_photos'));
    await connection.query('UPDATE rooms SET floor_label = ?, amenities = ?, photos = ?, amenities_free = ?, amenities_paid = ?, description = ? WHERE id = ?', [details.floor_label || null, JSON.stringify(details.amenities), JSON.stringify(photos), JSON.stringify(details.amenities_free), JSON.stringify(details.amenities_paid), details.description || null, roomId]);
}
