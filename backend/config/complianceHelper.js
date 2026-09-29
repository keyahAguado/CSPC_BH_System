const formatDateStr = (d) => {
    if (!d) return '';
    if (typeof d === 'string') {
        const parts = d.split('T')[0];
        if (parts.length === 10) return parts;
    }
    try {
        const dateObj = new Date(d);
        if (isNaN(dateObj.getTime())) return '';
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
        return formatter.format(dateObj);
    } catch (e) {
        return '';
    }
};

/**
 * Helper to determine compliance status based on expiry dates.
 * Mirrors complianceManager.js: only the 4 critical documents (the ones
 * that can actually archive a listing) count here — matches compliance_status,
 * not supplementary_status.
 */
export function getComplianceStatus(house) {
    const permits = [
        'expiry_permit_business_form',
        'expiry_permit_barangay',
        'expiry_permit_sanitary',
        'expiry_permit_fire'
    ];

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const todayStr = formatDateStr(now);
    const thirtyDaysStr = formatDateStr(thirtyDaysFromNow);

    let status = 'active'; // Overall status

    for (const key of permits) {
        const expiryDate = house[key];
        if (!expiryDate) continue;

        const expiryStr = formatDateStr(expiryDate);
        if (!expiryStr) continue;

        if (expiryStr <= todayStr) {
            return 'expired'; // Immediate fail if any one is expired
        }
        if (expiryStr <= thirtyDaysStr) {
            status = 'warning'; // Downgrade to warning if within 30 days
        }
    }

    return status;
}

/**
 * Live version of the supplementary-document check in complianceManager.js.
 * Used wherever we display status to a user and can't wait for the next cron
 * sweep to reflect a date that was just edited/renewed.
 */
export function getSupplementaryStatus(house) {
    const permits = [
        'expiry_permit_cedula',
        'expiry_permit_dti',
        'expiry_permit_building',
        'expiry_permit_zoning'
    ];

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const todayStr = formatDateStr(now);
    const thirtyDaysStr = formatDateStr(thirtyDaysFromNow);

    let status = 'active';

    for (const key of permits) {
        const expiryDate = house[key];
        if (!expiryDate) continue;

        const expiryStr = formatDateStr(expiryDate);
        if (!expiryStr) continue;

        if (expiryStr <= todayStr) {
            return 'expired';
        }
        if (expiryStr <= thirtyDaysStr) {
            status = 'warning';
        }
    }

    return status;
}