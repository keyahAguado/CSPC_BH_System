// Leading icons for owner status badges (styles/owner-badges.css): by status key first, then by tone.
const BY_KEY = { pending:'fa-hourglass-half', reserved:'fa-bookmark', occupying:'fa-house-user', review:'fa-triangle-exclamation', completed:'fa-flag-checkered', 'not-arrived':'fa-user-slash', cancelled:'fa-circle-xmark', rejected:'fa-ban', confirmed:'fa-circle-check', paid:'fa-circle-check', unpaid:'fa-clock', refunded:'fa-rotate-left' };
const BY_TONE = { green:'fa-circle-check', amber:'fa-clock', orange:'fa-clock', blue:'fa-bookmark', sky:'fa-calendar-day', red:'fa-circle-xmark', slate:'fa-circle-minus', purple:'fa-credit-card' };
export const badgeIcon = badge => badge?.icon || BY_KEY[badge?.key] || BY_TONE[badge?.tone] || 'fa-circle';
