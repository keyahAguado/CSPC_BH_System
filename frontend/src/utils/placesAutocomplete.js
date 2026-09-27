import { Loader } from '@googlemaps/js-api-loader';

// ── Single shared loader instance for the entire app ──────────────────────
// Using Loader (not setOptions/importLibrary) ensures the API key is always
// attached at construction time and the script is loaded exactly once,
// regardless of which component initialises it first.
let _loader = null;
let _loadPromise = null;

const getLoader = () => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!_loader) {
        _loader = new Loader({
            apiKey,
            version: 'weekly',
            libraries: ['places', 'marker', 'geometry'],
        });
    }
    return _loader;
};

/**
 * Loads the Google Maps Places library exactly once.
 * Returns true when ready, false if the key is missing.
 */
export const ensureMapsLoaded = async () => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
        console.warn('[PLACES API] VITE_GOOGLE_MAPS_API_KEY is not set.');
        return false;
    }
    if (!_loadPromise) {
        _loadPromise = getLoader().load();
    }
    await _loadPromise;
    return !!(window.google?.maps);
};

/**
 * Hides the Google Places autocomplete dropdown (.pac-container) immediately.
 */
const dismissPacContainer = () => {
    document.querySelectorAll('.pac-container').forEach(el => {
        el.style.display = 'none';
    });
};

/**
 * Attaches Google Places Autocomplete to an HTML input element.
 *
 * - On place selected: fills address, hides dropdown, blurs input.
 * - On blur (click outside): dropdown closes automatically.
 * - Falls back to plain text input if key missing or offline.
 *
 * @param {HTMLInputElement} inputEl
 * @param {Function} onAddressSelected
 */
export const setupAddressAutocomplete = async (inputEl, onAddressSelected) => {
    if (!inputEl) return;

    try {
        const ready = await ensureMapsLoaded();
        if (!ready) return;

        const autocomplete = new window.google.maps.places.Autocomplete(inputEl, {
            componentRestrictions: { country: 'ph' },
            fields: ['formatted_address', 'name', 'geometry'],
        });

        // Handle selection from Google Places dropdown
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            const selectedAddress = place?.formatted_address || place?.name || inputEl.value;
            if (selectedAddress) {
                inputEl.value = selectedAddress;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                if (typeof onAddressSelected === 'function') {
                    onAddressSelected(selectedAddress);
                }
            }
            setTimeout(() => {
                dismissPacContainer();
                inputEl.blur();
            }, 50);
        });

        // Guaranteed manual typing fallback for rural barangays and sitios missing on Google Maps
        const syncManualTyping = () => {
            if (typeof onAddressSelected === 'function') {
                onAddressSelected(inputEl.value);
            }
        };

        inputEl.addEventListener('input', syncManualTyping);
        inputEl.addEventListener('change', syncManualTyping);

        inputEl.addEventListener('blur', () => {
            syncManualTyping();
            setTimeout(dismissPacContainer, 150);
        });

    } catch (err) {
        console.warn('[PLACES API] Autocomplete fallback active:', err.message);
    }
};
