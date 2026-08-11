/**
 * Helper to determine compliance status based on expiry dates.
 */
export function getComplianceStatus(house) {
    const permits = [
        'expiry_permit_business_form',
        'expiry_permit_cedula',
        'expiry_permit_dti',
        'expiry_permit_barangay',
        'expiry_permit_building',
        'expiry_permit_zoning',
        'expiry_permit_sanitary',
        'expiry_permit_fire'
    ];

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    let status = 'active'; // Overall status

    for (const key of permits) {
        const expiryDate = house[key];
        if (!expiryDate) continue;

        const date = new Date(expiryDate);
        if (date < now) {
            return 'expired'; // Immediate fail if any one is expired
        }
        if (date < thirtyDaysFromNow) {
            status = 'warning'; // Downgrade to warning if within 30 days
        }
    }

    return status;
}