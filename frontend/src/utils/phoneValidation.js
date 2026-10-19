// Shared PH mobile number handling: standard local format 09XXXXXXXXX (11 digits).
// Used by every personal phone field (student contact/emergency, owner phone,
// occupant contact/emergency, admin user edit). NOT used for the boarding
// house's public contact field, which intentionally allows multiple/loosely
// formatted numbers.

export const PH_PHONE_REGEX = /^09\d{9}$/;

// Normalizes whatever is typed or already stored (9171234567, 639171234567,
// +639171234567, 09171234567...) into the standard 09XXXXXXXXX form.
export const normalizePhPhone = (rawValue) => {
  let digits = (rawValue || '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length >= 12) {
    digits = digits.slice(2); // strip country code, leaves 9XXXXXXXXX
  }
  if (digits.startsWith('9') && !digits.startsWith('09')) {
    digits = '0' + digits; // restore trunk prefix
  }
  return digits.slice(0, 11);
};

export const isValidPhPhone = (value) => PH_PHONE_REGEX.test(value || '');

// Boarding house public contact: one to three PH mobile numbers (09XXXXXXXXX) separated by " / ".
export const MAX_HOUSE_CONTACT_NUMBERS = 3;
export const HOUSE_CONTACT_REGEX = /^09\d{9}( \/ 09\d{9}){0,2}$/;
export const isValidHouseContact = (value) => HOUSE_CONTACT_REGEX.test(String(value || '').trim());

// Builds the strict form from whatever was typed or pasted: digits only, every number must start with 09 (other
// leading digits are dropped), 11 digits per number, " / " between numbers, at most three numbers. When the user is
// typing forward and a number is complete, the separator is added so the next number can be typed straight away.
export function formatHouseContact(raw, { typingForward = false } = {}) {
  const numbers = [];
  let current = '';
  for (const digit of String(raw || '').replace(/\D/g, '')) {
    if (numbers.length >= MAX_HOUSE_CONTACT_NUMBERS) break;
    if (current.length === 0 && digit !== '0') continue;
    if (current.length === 1 && digit !== '9') continue;
    current += digit;
    if (current.length === 11) { numbers.push(current); current = ''; }
  }
  const complete = numbers.length;
  if (current) numbers.push(current);
  let value = numbers.join(' / ');
  if (typingForward && !current && complete > 0 && complete < MAX_HOUSE_CONTACT_NUMBERS) value += ' / ';
  return value;
}

// Converts a stored value (older free-form entries such as "+63 917 123 4567, 0918...") into the strict form.
export function normalizeHouseContact(stored) {
  const parts = String(stored || '').split(/[\/,;|]|\s{2,}/).map(part => normalizePhPhone(part)).filter(isValidPhPhone);
  return parts.length ? parts.slice(0, MAX_HOUSE_CONTACT_NUMBERS).join(' / ') : formatHouseContact(stored);
}
