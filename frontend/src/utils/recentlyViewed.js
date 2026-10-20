// Boarding houses a student has opened, newest first. Stored on this device only.
const KEY = 'cspc_recently_viewed_houses';
const LIMIT = 10;

export const getRecentlyViewed = () => {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
};

// Keeps just what the profile card needs (photo, name, address, price range)
export const recordRecentlyViewed = (house, rooms = []) => {
  if (!house?.id) return;
  const roomPrices = rooms.map(r => parseFloat(r.price)).filter(n => n > 0);
  const entry = {
    id: house.id,
    name: house.name || '',
    img: house.img || '',
    barangay: house.barangay || '',
    location: house.location || '',
    price: house.price ?? null,
    min_price: roomPrices.length ? Math.min(...roomPrices) : null,
    max_price: roomPrices.length ? Math.max(...roomPrices) : null
  };
  const list = [entry, ...getRecentlyViewed().filter(h => String(h.id) !== String(house.id))].slice(0, LIMIT);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
};
