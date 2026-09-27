import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

/**
 * Hides the Google Places autocomplete dropdown (.pac-container) immediately.
 * Called after selection so the popup doesn't block the rest of the form.
 */
const dismissPacContainer = () => {
    document.querySelectorAll('.pac-container').forEach(el => {
        el.style.display = 'none';
    });
};

/**
 * Attaches Google Places Autocomplete to an HTML input element.
 * Retains 100% manual typing capability if the location is not in Google Maps.
 *
 * Behaviour:
 * - On place selected: fills the address, immediately hides the dropdown,
 *   and blurs the input so the user can smoothly continue filling the form.
 * - On blur (click outside): dropdown closes automatically.
 * - Falls back to plain text input if the API key is missing or offline.
 *
 * @param {HTMLInputElement} inputEl - Target input element
 * @param {Function} onAddressSelected - Callback triggered when user selects a suggestion
 */
export const setupAddressAutocomplete = async (inputEl, onAddressSelected) => {
    if (!inputEl) return;

    try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (apiKey) {
            setOptions({ apiKey, version: 'weekly' });
        }

        await importLibrary('places');

        if (window.google && window.google.maps && window.google.maps.places) {
            const autocomplete = new window.google.maps.places.Autocomplete(inputEl, {
                componentRestrictions: { country: 'ph' },
                fields: ['formatted_address', 'name', 'geometry']
            });

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place && (place.formatted_address || place.name)) {
                    const selectedAddress = place.formatted_address || place.name;
                    if (typeof onAddressSelected === 'function') {
                        onAddressSelected(selectedAddress);
                    }
                    // Dismiss dropdown and blur input so user can continue the form
                    dismissPacContainer();
                    inputEl.blur();
                }
            });

            // Dismiss on blur — covers clicking anywhere outside the field
            inputEl.addEventListener('blur', () => {
                // Short delay so a click on a pac-item registers before hiding
                setTimeout(dismissPacContainer, 150);
            });
        }
    } catch (err) {
        // Silently fallback to manual input if API script fails to load or offline
        console.warn('[PLACES API] Autocomplete fallback active (manual typing enabled):', err.message);
    }
};
