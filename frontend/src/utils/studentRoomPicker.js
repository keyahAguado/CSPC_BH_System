export const roomWing = (room) => ['female','male'].includes((room.gender_type || '').trim().toLowerCase()) ? room.gender_type.trim().toLowerCase() : 'other';
export const roomIsFull = (room) => room.available_count != null ? Number(room.available_count) <= 0 : Number(room.occupant_count || 0) + Number(room.reserved_count || 0) >= Number(room.capacity || 0);
export const roomTitle = (room) => /^(room|bed|unit|cottage|house)\b/i.test(String(room.room_number || '').trim()) ? String(room.room_number).trim() : 'Room ' + (room.room_number || '');
export const roomMonthlyPrice = (room, base) => Number(room?.price !== null && room?.price !== undefined && room?.price !== '' ? room.price : base) || 0;
export function filterBookingRooms(rooms, { wing, search = '', floor = 'all', availability = 'all' }) {
  return rooms.filter(room => roomWing(room) === wing
    && String(room.room_number || '').toLowerCase().includes(search.trim().toLowerCase())
    && (floor === 'all' || (floor === 'unspecified' ? !room.floor_label : room.floor_label === floor))
    && (availability === 'all' || (availability === 'full' ? roomIsFull(room) : !roomIsFull(room))));
}

export function sortBookingRooms(rooms, sort = 'number', basePrice) {
  return [...rooms].sort((a,b) => sort === 'price-low' ? roomMonthlyPrice(a,basePrice)-roomMonthlyPrice(b,basePrice) || String(a.room_number).localeCompare(String(b.room_number),undefined,{numeric:true}) : sort === 'price-high' ? roomMonthlyPrice(b,basePrice)-roomMonthlyPrice(a,basePrice) || String(a.room_number).localeCompare(String(b.room_number),undefined,{numeric:true}) : String(a.room_number).localeCompare(String(b.room_number),undefined,{numeric:true}));
}
export function bookingRoomPage(rooms, requestedPage = 1, pageSize = 8) {
  const totalPages = Math.max(1, Math.ceil(rooms.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  const start = (page-1)*pageSize;
  return { items: rooms.slice(start,start+pageSize), page, totalPages, from: rooms.length ? start+1 : 0, to: Math.min(start+pageSize,rooms.length), total: rooms.length };
}

export function roommateBreakdown(room) {
  const total = Number(room?.resident_count ?? room?.occupant_count ?? 0);
  const cspcValue=room?.resident_count!=null ? room.cspc_resident_count : room?.cspc_occupant_count;
  const nonCspcValue=room?.resident_count!=null ? room.non_cspc_resident_count : room?.non_cspc_occupant_count;
  if (total === 0) return { cspc: 0, nonCspc: 0, total: 0 };
  if (cspcValue == null || nonCspcValue == null) return null;
  const cspc = Number(cspcValue), nonCspc = Number(nonCspcValue);
  if (![cspc,nonCspc].every(value => Number.isInteger(value) && value >= 0) || cspc+nonCspc !== total) return null;
  return { cspc, nonCspc, total };
}
export function roommateSummary(room) {
  const counts = roommateBreakdown(room);
  if (!counts) return 'Roommate details not available yet';
  if (!counts.total) return 'No current occupants';
  return counts.cspc + ' CSPC / ' + counts.nonCspc + ' non-CSPC';
}

export function canBookRoomGender(room, gender) {
  const studentGender = String(gender || '').trim().toLowerCase();
  if (!['female','male'].includes(studentGender)) return false;
  const restriction = String(room?.gender_type || '').trim().toLowerCase();
  return !restriction || ['mixed','unisex'].includes(restriction) || restriction === studentGender;
}