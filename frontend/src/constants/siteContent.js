// Landing page content defaults (mirrors backend/config/siteContent.js).
// Used as the landing page fallback when the content API is unreachable (e.g. offline PWA)
// and as the icon catalogue for Admin > Landing page.

export const FEATURE_ICONS = [
    { value: 'shield-halved', label: 'Shield' },
    { value: 'magnifying-glass', label: 'Search' },
    { value: 'camera', label: 'Camera' },
    { value: 'mobile-screen', label: 'Mobile' },
    { value: 'map-location-dot', label: 'Map' },
    { value: 'house-circle-check', label: 'Verified house' },
    { value: 'building-circle-check', label: 'Accredited building' },
    { value: 'calendar-check', label: 'Booking' },
    { value: 'bell', label: 'Notifications' },
    { value: 'credit-card', label: 'Payment' },
    { value: 'star', label: 'Reviews' },
    { value: 'user-shield', label: 'Privacy' },
    { value: 'comments', label: 'Messages' },
    { value: 'file-shield', label: 'Documents' },
    { value: 'wifi', label: 'Offline / PWA' },
    { value: 'graduation-cap', label: 'Students' },
    { value: 'location-dot', label: 'Location' },
    { value: 'hand-holding-heart', label: 'Support' },
    { value: 'lock', label: 'Security' },
    { value: 'headset', label: 'Help desk' }
];

export const DEFAULT_FEATURES = [
    { id: -1, title: 'SASO-Accredited Listings Only', icon: 'shield-halved', description: 'All boarding houses are verified and approved by the Student Affairs and Services Office (SASO) to ensure safety, compliance, and quality standards.' },
    { id: -2, title: 'Advanced Search & Filters', icon: 'magnifying-glass', description: "Enables quick and efficient searching of boarding houses near CSPC campus to match students' and parents' specific needs." },
    { id: -3, title: 'Real Photos & Details', icon: 'camera', description: 'Actual photos of rooms and facilities plus full details: monthly rates, house rules, exact location, and owner contact information.' },
    { id: -4, title: 'User Friendly & Responsive', icon: 'mobile-screen', description: 'Accessible on desktop and mobile devices, with an intuitive interface designed for students and parents to use easily anytime, anywhere.' }
];

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
    footer_copyright: '© 2026 CSPC Boarding House Selection & Management System. All rights reserved.'
};

// Only http(s) links are rendered as clickable on the public page.
export const safeExternalUrl = (value) => (typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : '');
