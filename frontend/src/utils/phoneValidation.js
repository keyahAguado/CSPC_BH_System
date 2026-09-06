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
