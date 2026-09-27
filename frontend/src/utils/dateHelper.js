/**
 * Computes an exact check-out date from check-in date, duration in months, and optional approved extension months.
 * @param {string|Date} checkInDateStr - Move-in / Check-in starting date
 * @param {number} monthsCount - Original stay duration in months
 * @param {number} extensionMonths - Approved extension duration in months
 * @returns {Date|null} Computed check-out Date object or null
 */
export const computeCheckoutDate = (checkInDateStr, monthsCount = 1, extensionMonths = 0) => {
    if (!checkInDateStr) return null;
    const date = new Date(checkInDateStr);
    if (isNaN(date.getTime())) return null;

    const totalMonths = (parseInt(monthsCount) || 1) + (parseInt(extensionMonths) || 0);
    date.setMonth(date.getMonth() + totalMonths);
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
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
        return '—';
    }
};
