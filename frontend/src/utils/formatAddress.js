/**
 * Builds a clean, human-readable boarding house address.
 *
 * Priority:
 * 1. If barangay is available → "Brgy. [barangay], Nabua, Camarines Sur"
 * 2. Otherwise → strip Plus Code prefix from the location string
 *
 * Usage:
 *   formatAddress(house)           — pass the full house object (preferred)
 *   formatAddress(house.location)  — pass just the string (legacy fallback)
 */
export const formatAddress = (houseOrString) => {
  if (!houseOrString) return '';

  // If a full house object is passed
  if (typeof houseOrString === 'object') {
    const barangay = houseOrString.barangay?.trim();
    if (barangay) {
      return `Brgy. ${barangay}, Nabua, Camarines Sur`;
    }
    // Fall back to stripped location string
    return stripPlusCode(houseOrString.location || '');
  }

  // Legacy: plain string passed
  return stripPlusCode(houseOrString);
};

const stripPlusCode = (address) => {
  if (!address) return '';
  return address.replace(/^[A-Z0-9]{4,}\+[A-Z0-9]{2,},?\s*/i, '').trim();
};
