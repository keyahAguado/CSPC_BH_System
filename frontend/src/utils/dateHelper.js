// Parse date-only values as calendar dates without a UTC day shift.
const parseCalendarDate = (value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : new Date(NaN);
    }
    return new Date(value);
};

/**
 * Computes an exact check-out date from check-in date, duration in months, and optional approved extension months.
 * @param {string|Date} checkInDateStr - Move-in / Check-in starting date
 * @param {number} monthsCount - Original stay duration in months
 * @param {number} extensionMonths - Approved extension duration in months
 * @returns {Date|null} Computed check-out Date object or null
 */
export const computeCheckoutDate = (checkInDateStr, monthsCount = 1, extensionMonths = 0) => {
    if (!checkInDateStr) return null;
    const date = parseCalendarDate(checkInDateStr);
    if (isNaN(date.getTime())) return null;

    const totalMonths = (parseInt(monthsCount) || 1) + (parseInt(extensionMonths) || 0);
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + totalMonths);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(originalDay, lastDay));
    return date;
};

/**
 * Formats a date string or Date object into a readable string (e.g., "Feb 1, 2027")
 * @param {string|Date} dateVal - Date value to format
 * @returns {string} Formatted date text
 */
export const formatCheckoutDateString = (dateVal) => {
    if (!dateVal) return '—';
    try {
        const d = parseCalendarDate(dateVal);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
        return '—';
    }
};
