// Landing page content managed from Admin > Landing page.
// The defaults reproduce the text that was previously hardcoded in HomeView.vue,
// so a new or migrated database shows exactly what visitors saw before.

// Font Awesome 6 (free, solid) icon names an admin may assign to a feature card.
// Mirrored in frontend/src/utils/inputValidation.js and frontend/src/constants/siteContent.js.
export const FEATURE_ICONS = [
    'shield-halved', 'magnifying-glass', 'camera', 'mobile-screen', 'map-location-dot',
    'house-circle-check', 'building-circle-check', 'calendar-check', 'bell', 'credit-card',
    'star', 'user-shield', 'comments', 'file-shield', 'wifi', 'graduation-cap',
    'location-dot', 'hand-holding-heart', 'lock', 'headset'
];

export const MAX_FEATURES = 12;

export const DEFAULT_FEATURES = [
    { title: 'SASO-Accredited Listings Only', icon: 'shield-halved', description: 'All boarding houses are verified and approved by the Student Affairs and Services Office (SASO) to ensure safety, compliance, and quality standards.' },
    { title: 'Advanced Search & Filters', icon: 'magnifying-glass', description: "Enables quick and efficient searching of boarding houses near CSPC campus to match students' and parents' specific needs." },
    { title: 'Real Photos & Details', icon: 'camera', description: 'Actual photos of rooms and facilities plus full details: monthly rates, house rules, exact location, and owner contact information.' },
    { title: 'User Friendly & Responsive', icon: 'mobile-screen', description: 'Accessible on desktop and mobile devices, with an intuitive interface designed for students and parents to use easily anytime, anywhere.' }
];

// Editable text settings. Empty optional values are hidden on the landing page.
export const SITE_SETTING_DEFAULTS = {
    features_eyebrow: 'The Platform',
    features_heading: 'Core Features',
    footer_title: 'CSPC Boarding House Selection System',
    footer_tagline: 'Official Student Affairs and Services Office (SASO) Accommodation Portal',
    footer_office: '',
    footer_address: '',
    footer_email: '',
    footer_phone: '',
    footer_hours: '',
    footer_facebook: '',
    footer_website: '',
    footer_custom: '[]',
    footer_copyright: '© 2026 CSPC Boarding House Selection & Management System. All rights reserved.'
};

export const SITE_SETTING_KEYS = Object.keys(SITE_SETTING_DEFAULTS);

// Turns site_settings rows into a complete object, falling back to defaults for missing keys.
export function settingsFromRows(rows = []) {
    const settings = { ...SITE_SETTING_DEFAULTS };
    for (const row of rows) {
        if (SITE_SETTING_KEYS.includes(row.setting_key)) settings[row.setting_key] = row.setting_value ?? '';
    }
    return settings;
}
