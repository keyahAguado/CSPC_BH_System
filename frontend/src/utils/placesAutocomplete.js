import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

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
 * Retains 100% manual typing capability if the location is not in Google Maps.
 *
 * - On place selected: fills the address, hides dropdown, blurs input.
 * - On blur (click outside): dropdown closes automatically.
 * - Falls back to plain text input if the API key is missing or offline.
 *
 * @param {HTMLInputElement} inputEl - Target input element
 * @param {Function} onAddressSelected - Callback triggered when user selects a suggestion
 */
export const setupAddressAutocomplete = async (inputEl, onAddressSelected) => {
    if (!inputEl) return;

    try {
        // Only call setOptions if Google Maps hasn't been loaded yet by another component.
        // OwnerAccreditation and EditHouse load Maps independently — don't override their setup.
        if (!window.google?.maps) {
            const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
            if (apiKey) {
                setOptions({ key: apiKey, apiKey, version: 'weekly' });
            }
        }

        await importLibrary('places');

        if (window.google?.maps?.places) {
            const autocomplete = new window.google.maps.places.Autocomplete(inputEl, {
                componentRestrictions: { country: 'ph' },
                fields: ['formatted_address', 'name', 'geometry']
            });

            const syncManualTyping = () => {
                if (typeof onAddressSelected === 'function') {
                    onAddressSelected(inputEl.value);
                }
            };

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                const selectedAddress = place?.formatted_address || place?.name || inputEl.value;
                if (selectedAddress) {
                    inputEl.value = selectedAddress;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    if (typeof onAddressSelected === 'function') {
                        onAddressSelected(selectedAddress);
                    }
                    // Dismiss dropdown and blur so user can continue filling the form
                    dismissPacContainer();
                    inputEl.blur();
                }
            });

            inputEl.addEventListener('input', syncManualTyping);
            inputEl.addEventListener('change', syncManualTyping);

            // Dismiss on blur — covers clicking anywhere outside the field
            inputEl.addEventListener('blur', () => {
                syncManualTyping();
                setTimeout(dismissPacContainer, 150);
            });
        }
    } catch (err) {
        // Silently fallback to manual input if API fails to load or offline
        console.warn('[PLACES API] Autocomplete fallback active (manual typing enabled):', err.message);
    }
};
