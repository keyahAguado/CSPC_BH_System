/**
 * Formats a raw price number or string with the Pesos ₱ symbol.
 * Example: 1500 -> "₱1,500"
 */
export const formatPrice = (val) => {
  if (val === null || val === undefined || val === '') return '₱0';
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return '₱0';
  return `₱${num.toLocaleString()}`;
};

/**
 * Formats a boarding house's price range with the Pesos ₱ symbol.
 * Handles single prices (₱1,500) and room price ranges (₱1,500 - ₱3,500).
 */
export const formatPriceRange = (house) => {
  if (!house) return '₱0';

  const prices = [];
  if (house.price !== null && house.price !== undefined && parseFloat(house.price) > 0) {
    prices.push(parseFloat(house.price));
  }
  if (house.min_price !== null && house.min_price !== undefined && parseFloat(house.min_price) > 0) {
    prices.push(parseFloat(house.min_price));
  }
  if (house.max_price !== null && house.max_price !== undefined && parseFloat(house.max_price) > 0) {
    prices.push(parseFloat(house.max_price));
  }

  if (prices.length === 0) {
    if (house.price_range) return house.price_range;
    return '₱0';
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  if (min !== max) {
    return `₱${min.toLocaleString()} - ₱${max.toLocaleString()}`;
  }

  return `₱${min.toLocaleString()}`;
};

export default formatPriceRange;
