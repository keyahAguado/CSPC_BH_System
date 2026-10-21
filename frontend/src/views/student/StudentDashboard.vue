<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import StudentPager from '../../components/partials/StudentPager.vue';

import { useOfflineStatus } from '../../utils/offlineHelper.js';
import { formatAddress } from '../../utils/formatAddress.js';
import { formatPriceRange } from '../../utils/formatPrice.js';
import { getRecentlyViewed } from '../../utils/recentlyViewed.js';
import { getImageUrl } from '../../config/api';

const router = useRouter();
const route = useRoute();
// Instant initialization from persistent localStorage cache for 0ms offline rendering
const initialCachedHouses = (() => {
  try {
    const raw = localStorage.getItem('cspc_cached_student_houses') || localStorage.getItem('cspc_cached_accredited_houses');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
})();

const PAGE_SIZES = [6, 12, 24, 48];
const VISIBLE_AMENITY_OPTIONS = 4;
const SORT_VALUES = ['default', 'price_asc', 'price_desc', 'rating'];
const DIRECTORY_QUERY_KEYS = ['q', 'min', 'max', 'rating', 'amenity', 'loc', 'sort', 'page', 'per'];
const DIRECTORY_STATE_KEY = 'cspc_student_directory_state';

// Search, filters, sort and page live in the URL (and this tab's session) so returning
// from a house's details page, even via "Back to Listings", restores the same view.
const initialQuery = (() => {
  if (DIRECTORY_QUERY_KEYS.some(k => route.query[k] !== undefined)) return route.query;
  try {
    return JSON.parse(sessionStorage.getItem(DIRECTORY_STATE_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
})();
const queryList = (val) => (val === undefined || val === null ? [] : (Array.isArray(val) ? val : [val]))
  .map(v => String(v)).filter(Boolean);
const queryText = (val) => (Array.isArray(val) ? val[0] : val) ?? '';

const houses = ref(initialCachedHouses);
const isLoading = ref(initialCachedHouses.length === 0);
const searchInput = ref(String(queryText(initialQuery.q)));
const minPrice = ref(String(queryText(initialQuery.min)));
const maxPrice = ref(String(queryText(initialQuery.max)));
const selectedRatings = ref(queryList(initialQuery.rating).map(Number).filter(n => n >= 1 && n <= 5));
const selectedAmenities = ref(queryList(initialQuery.amenity).filter(k => /^(free|paid):./.test(k)));
const selectedLocation = ref(String(queryText(initialQuery.loc)).toLowerCase());
const sortBy = ref(SORT_VALUES.includes(queryText(initialQuery.sort)) ? queryText(initialQuery.sort) : 'default');
const currentPage = ref(Math.max(1, parseInt(queryText(initialQuery.page), 10) || 1));
const perPage = ref(PAGE_SIZES.includes(parseInt(queryText(initialQuery.per), 10)) ? parseInt(queryText(initialQuery.per), 10) : PAGE_SIZES[0]);
const showAllAmenities = ref(false);
const showMobileFilters = ref(false);
const resultsTop = ref(null);

// Collapsible filter sections; Location starts closed unless a location is already selected
const openSections = ref({ ratings: true, price: true, amenities: true, location: !!selectedLocation.value });
const toggleSection = (key) => { openSections.value[key] = !openSections.value[key]; };

// Grid/List is a viewer preference only — it never changes the results or the page
const VIEW_MODE_KEY = 'cspc_directory_view_mode';
const viewMode = ref((() => {
  try { return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; }
})());
const setViewMode = (mode) => {
  viewMode.value = mode;
  try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch (e) {}
};
// Grid cards stay compact (2 chips + "+N"); the wider list rows have room for more
const chipLimit = computed(() => (viewMode.value === 'list' ? 5 : 2));

const { isOffline } = useOfflineStatus();
// loadError: request failed and there is nothing cached to show.
// refreshFailed: request failed but cached listings are still being displayed.
const loadError = ref(false);
const refreshFailed = ref(false);

const token = sessionStorage.getItem('cspc_token');
const userRaw = sessionStorage.getItem('cspc_user');
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const isGuest = computed(() => route.query.guest === 'true' || !token);
const displayName = computed(() => isGuest.value ? 'Guest' : (currentUser?.name || 'Guest'));

const fetchHouses = async () => {
  try {
    if (houses.value.length === 0) {
      isLoading.value = true;
    }
    loadError.value = false;
    refreshFailed.value = false;
    const res = await axios.get('/api/student/houses');
    const fetched = res.data?.houses || res.data?.data || (Array.isArray(res.data) ? res.data : null);
    if (Array.isArray(fetched)) {
      houses.value = fetched;
      localStorage.setItem('cspc_cached_student_houses', JSON.stringify(fetched));
    }
  } catch (e) {
    console.error('Failed to load houses from network:', e);
    try {
      const cached = localStorage.getItem('cspc_cached_student_houses') || localStorage.getItem('cspc_cached_accredited_houses');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          houses.value = parsed;
        }
      }
    } catch (err) {}

    if (houses.value.length === 0) {
      loadError.value = true;
    } else {
      refreshFailed.value = true;
    }
  } finally {
    isLoading.value = false;
  }
};

// Same parsing rules as the House Details page (JSON array, double-encoded JSON, or comma list)
const parseAmenities = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  let temp = val;
  while (typeof temp === 'string') {
    try {
      const parsed = JSON.parse(temp);
      if (temp === parsed) break; // Halts infinite loops for literal strings
      temp = parsed;
    } catch (e) {
      return temp.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return Array.isArray(temp) ? temp : [];
};

const normalize = (val) => String(val || '').trim().toLowerCase();

// Free amenities first, then paid ones. The key keeps free and paid apart, so a
// student filtering for "Laundry" is not shown houses that charge for laundry.
const amenitiesOf = (house) => {
  const seen = new Set();
  const list = [];
  [['amenities_free', false], ['amenities_paid', true]].forEach(([field, paid]) => {
    parseAmenities(house[field])
      .filter(a => typeof a === 'string' && a.trim())
      .forEach(a => {
        const label = a.trim();
        const key = (paid ? 'paid:' : 'free:') + normalize(label);
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ key, label, paid });
      });
  });
  return list;
};

// Checkbox presets offered to owners (same lists as OwnerAccreditation.vue / EditHouse.vue)
const PRESET_AMENITY_KEYS = new Set([
  ...['Wi-Fi', '24/7 Water', 'CCTV', 'Electric Fan', 'Caretaker', 'Study Area', 'Visitor Area', 'Fire Exit']
    .map(a => 'free:' + a.toLowerCase()),
  ...['Aircon', 'Laundry', 'Parking', 'Refrigerator', 'Electricity', 'Water Bill', 'Balcony', 'Kitchen Use']
    .map(a => 'paid:' + a.toLowerCase())
]);

// Owner-typed entries that are not meaningful amenity names (e.g. "1", "dd", "PAID")
const isJunkAmenity = (label) => {
  const name = normalize(label);
  return (name.match(/[a-z]/g) || []).length < 3 || ['paid', 'free', 'none', 'n/a'].includes(name);
};

// Every amenity found in the loaded listings, with how many houses list it
const allAmenityOptions = computed(() => {
  const counts = new Map();
  houses.value.forEach(h => {
    amenitiesOf(h).forEach(a => {
      const entry = counts.get(a.key) || { ...a, count: 0 };
      entry.count += 1;
      counts.set(a.key, entry);
    });
  });
  return [...counts.values()].sort((a, b) =>
    Number(a.paid) - Number(b.paid) || b.count - a.count || a.label.localeCompare(b.label)
  );
});

// Filter list: preset amenities, plus typed-in ones that at least two houses share.
// Cards still show every amenity the owner entered.
const amenityOptions = computed(() => allAmenityOptions.value.filter(opt =>
  PRESET_AMENITY_KEYS.has(opt.key) || (opt.count >= 2 && !isJunkAmenity(opt.label))
));

const amenityByKey = computed(() => new Map(allAmenityOptions.value.map(opt => [opt.key, opt])));

const visibleAmenityOptions = computed(() => {
  // Ticked amenities always stay visible, even when collapsed or hidden by the rules above
  const extra = selectedAmenities.value
    .filter(key => !amenityOptions.value.some(opt => opt.key === key))
    .map(key => amenityByKey.value.get(key))
    .filter(Boolean);
  if (showAllAmenities.value) return [...amenityOptions.value, ...extra];
  return [
    ...amenityOptions.value.filter((opt, idx) =>
      idx < VISIBLE_AMENITY_OPTIONS || selectedAmenities.value.includes(opt.key)
    ),
    ...extra
  ];
});

const locationOptions = computed(() => {
  const map = new Map();
  houses.value.forEach(h => {
    const barangay = String(h.barangay || '').trim();
    if (barangay && !map.has(normalize(barangay))) map.set(normalize(barangay), barangay);
  });
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const filteredHouses = computed(() => {
  const query = (searchInput.value || '').toLowerCase().trim();
  const terms = query.split(/\s+/).filter(t => t.length > 0);

  const filtered = houses.value.filter(h => {
    const name = (h.name || '').toLowerCase();
    const address = (h.address || h.location || '').toLowerCase();
    const barangay = (h.barangay || '').toLowerCase();
    const ownerName = (h.owner_name || '').toLowerCase();

    const matchSearch = terms.length === 0 || terms.some(t =>
      name.includes(t) || address.includes(t) || barangay.includes(t) || ownerName.includes(t)
    );

    const rawPrice = (h.price !== null && h.price !== undefined) ? String(h.price).replace(/,/g, '') : '0';
    const price = parseFloat(rawPrice) || 0;
    const min = parseFloat(minPrice.value) || 0;
    const max = parseFloat(maxPrice.value) || Infinity;
    const matchPrice = price >= min && price <= max;

    const rating = Math.round(parseFloat(h.avg_rating) || 0);
    const matchRating = selectedRatings.value.length === 0 || selectedRatings.value.includes(rating);

    const houseAmenities = amenitiesOf(h).map(a => a.key);
    const matchAmenities = selectedAmenities.value.every(a => houseAmenities.includes(a));

    const matchLocation = !selectedLocation.value || normalize(h.barangay) === selectedLocation.value;

    return matchSearch && matchPrice && matchRating && matchAmenities && matchLocation;
  });

  if (terms.length > 0) {
    return [...filtered].sort((a, b) => {
      const getScore = (h) => {
        const name = (h.name || '').toLowerCase();
        const address = (h.address || h.location || '').toLowerCase();
        const barangay = (h.barangay || '').toLowerCase();
        const ownerName = (h.owner_name || '').toLowerCase();
        return terms.reduce((acc, t) => {
          let score = 0;
          if (name.includes(t)) score += 3;
          if (address.includes(t)) score += 2;
          if (barangay.includes(t)) score += 1;
          if (ownerName.includes(t)) score += 1;
          return acc + score;
        }, 0);
      };
      return getScore(b) - getScore(a);
    });
  }

  return filtered;
});

const toPositiveNumber = (val) => {
  const num = parseFloat(String(val ?? '').replace(/,/g, ''));
  return num > 0 ? num : null;
};

// Sorting uses the min/max prices the API already returns; listings without a price stay last
const sortedHouses = computed(() => {
  const list = filteredHouses.value.map((house, index) => ({ house, index }));
  const byPrice = (field, dir) => (a, b) => {
    const pa = toPositiveNumber(a.house[field]);
    const pb = toPositiveNumber(b.house[field]);
    if (pa === null && pb === null) return a.index - b.index;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir || a.index - b.index;
  };

  if (sortBy.value === 'price_asc') list.sort(byPrice('min_price', 1));
  else if (sortBy.value === 'price_desc') list.sort(byPrice('max_price', -1));
  else if (sortBy.value === 'rating') {
    list.sort((a, b) =>
      (parseFloat(b.house.avg_rating) || 0) - (parseFloat(a.house.avg_rating) || 0) ||
      (Number(b.house.review_count) || 0) - (Number(a.house.review_count) || 0) ||
      a.index - b.index
    );
  }
  return list.map(item => item.house);
});

const totalPages = computed(() => Math.max(1, Math.ceil(sortedHouses.value.length / perPage.value)));
const pageStart = computed(() => sortedHouses.value.length === 0 ? 0 : (currentPage.value - 1) * perPage.value + 1);
const pageEnd = computed(() => Math.min(currentPage.value * perPage.value, sortedHouses.value.length));
const paginatedHouses = computed(() =>
  sortedHouses.value.slice((currentPage.value - 1) * perPage.value, currentPage.value * perPage.value)
);

const goToPage = (n) => {
  if (n < 1 || n > totalPages.value || n === currentPage.value) return;
  currentPage.value = n;
  resultsTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Any change to search, filters, or sort starts again from the first page
watch([searchInput, minPrice, maxPrice, selectedRatings, selectedAmenities, selectedLocation, sortBy, perPage], () => {
  currentPage.value = 1;
}, { deep: true });

// Keep the current page valid once listings are known (e.g. a restored page that no longer exists)
watch([totalPages, isLoading], ([total, loading]) => {
  if (!loading && currentPage.value > total) currentPage.value = total;
}, { immediate: true });

const hasValue = (val) => val !== '' && val !== null && val !== undefined;

// Mirror the directory state into the URL (keeping ?guest=true) and this tab's session
const directoryQuery = computed(() => {
  const query = {};
  if (searchInput.value.trim()) query.q = searchInput.value.trim();
  if (hasValue(minPrice.value)) query.min = String(minPrice.value);
  if (hasValue(maxPrice.value)) query.max = String(maxPrice.value);
  if (selectedRatings.value.length) query.rating = selectedRatings.value.map(String);
  if (selectedAmenities.value.length) query.amenity = [...selectedAmenities.value];
  if (selectedLocation.value) query.loc = selectedLocation.value;
  if (sortBy.value !== 'default') query.sort = sortBy.value;
  if (currentPage.value > 1) query.page = String(currentPage.value);
  if (perPage.value !== PAGE_SIZES[0]) query.per = String(perPage.value);
  return query;
});

watch(directoryQuery, (query) => {
  try {
    sessionStorage.setItem(DIRECTORY_STATE_KEY, JSON.stringify(query));
  } catch (e) {}
  const preserved = Object.fromEntries(
    Object.entries(route.query).filter(([key]) => !DIRECTORY_QUERY_KEYS.includes(key))
  );
  const next = { ...preserved, ...query };
  if (JSON.stringify(next) !== JSON.stringify(route.query)) {
    router.replace({ query: next }).catch(() => {});
  }
}, { immediate: true, deep: true });

const activeFilterCount = computed(() =>
  selectedRatings.value.length +
  selectedAmenities.value.length +
  (hasValue(minPrice.value) ? 1 : 0) +
  (hasValue(maxPrice.value) ? 1 : 0) +
  (selectedLocation.value ? 1 : 0)
);

const formatPeso = (val) => '₱' + (parseFloat(val) || 0).toLocaleString();

const removeFromList = (listRef, value) => {
  listRef.value = listRef.value.filter(v => v !== value);
};

// Removable chips shown above the results for everything currently narrowing the list
const activeChips = computed(() => {
  const chips = [];
  const q = searchInput.value.trim();
  if (q) chips.push({ id: 'q', label: `Search: "${q}"`, remove: () => { searchInput.value = ''; } });
  [...selectedRatings.value].sort((a, b) => b - a).forEach(n => chips.push({
    id: 'rating-' + n, label: `${n} star${n === 1 ? '' : 's'}`, remove: () => removeFromList(selectedRatings, n)
  }));
  if (hasValue(minPrice.value)) chips.push({ id: 'min', label: `Min ${formatPeso(minPrice.value)}`, remove: () => { minPrice.value = ''; } });
  if (hasValue(maxPrice.value)) chips.push({ id: 'max', label: `Max ${formatPeso(maxPrice.value)}`, remove: () => { maxPrice.value = ''; } });
  selectedAmenities.value.forEach(key => {
    const opt = amenityByKey.value.get(key);
    const paid = key.startsWith('paid:');
    const label = opt?.label || key.slice(key.indexOf(':') + 1);
    chips.push({ id: 'amenity-' + key, label: paid ? `${label} (Paid)` : label, remove: () => removeFromList(selectedAmenities, key) });
  });
  if (selectedLocation.value) {
    const loc = locationOptions.value.find(l => l.key === selectedLocation.value);
    chips.push({ id: 'loc', label: `Brgy. ${loc?.label || selectedLocation.value}`, remove: () => { selectedLocation.value = ''; } });
  }
  return chips;
});

// "Newest" is the API's order (most recently listed first); while searching it is relevance
const defaultSortLabel = computed(() => (searchInput.value.trim() ? 'Best match' : 'Newest'));

const clearFilters = () => {
  searchInput.value = '';
  minPrice.value = '';
  maxPrice.value = '';
  selectedRatings.value = [];
  selectedAmenities.value = [];
  selectedLocation.value = '';
  sortBy.value = 'default';
};

const toggleRating = (num) => {
  const idx = selectedRatings.value.indexOf(num);
  if (idx === -1) selectedRatings.value.push(num);
  else selectedRatings.value.splice(idx, 1);
};

const toggleAmenity = (key) => {
  const idx = selectedAmenities.value.indexOf(key);
  if (idx === -1) selectedAmenities.value.push(key);
  else selectedAmenities.value.splice(idx, 1);
};

const amenityIcon = (label) => {
  const name = normalize(label);
  if (name.includes('wi-fi') || name.includes('wifi') || name.includes('internet')) return 'fa-wifi';
  if (name.includes('laundry') || name.includes('wash')) return 'fa-shirt';
  if (name.includes('kitchen') || name.includes('cook')) return 'fa-utensils';
  if (name.includes('parking') || name.includes('garage')) return 'fa-car';
  if (name.includes('cctv') || name.includes('security')) return 'fa-video';
  if (name.includes('water')) return 'fa-droplet';
  if (name.includes('fan') || name.includes('aircon') || name.includes('air con')) return 'fa-fan';
  if (name.includes('study')) return 'fa-book-open';
  if (name.includes('caretaker')) return 'fa-user-shield';
  if (name.includes('fire')) return 'fa-fire-extinguisher';
  return 'fa-circle-check';
};

const ratingValue = (house) => parseFloat(house.avg_rating) || 0;

const displayPrice = (house) => {
  const text = formatPriceRange(house);
  return text === '₱0' ? null : text.replace(' - ', ' – ');
};

const handleDetails = (houseId) => {
  router.push(`/student/house/${houseId}`);
};

// ---------- Mobile layout helpers ----------
const mobileSearchInput = ref(null);

// Same coordinate rules as the House Details map
const hasMapPin = (house) => {
  const lat = Number(house.latitude);
  const lng = Number(house.longitude);
  return String(house.latitude ?? '').trim() !== '' && String(house.longitude ?? '').trim() !== '' &&
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};
const viewOnMap = (houseId) => router.push({ path: '/student/map', query: { house: String(houseId) } });

// Cover photo plus gallery photos, counted the same way as the House Details carousel
const photoCount = (house) => {
  const gallery = Number(house.photo_count) > 0
    ? Number(house.photo_count)
    : [house.img_1, house.img_2, house.img_3].filter(Boolean).length;
  return (house.img ? 1 : 0) + gallery;
};

// Rating pill on the card photo, e.g. "5.0 (1)"; houses without reviews show "0"
const ratingText = (house) => Number(house.review_count) > 0
  ? `${ratingValue(house).toFixed(1)} (${house.review_count})`
  : '0';
const ratingLabel = (house) => Number(house.review_count) > 0
  ? `Rated ${ratingValue(house).toFixed(1)} out of 5 from ${house.review_count} ${Number(house.review_count) === 1 ? 'review' : 'reviews'}`
  : 'No reviews yet';

// Mobile filter sheet. "Price Range" / "Rating" show only that section;
// "More Filters" (sheetSection = null) shows sort and every filter.
const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
const sheetSection = ref(null);
const SHEET_TITLES = { price: 'Price Range', ratings: 'Rating' };
const sheetTitle = computed(() => SHEET_TITLES[sheetSection.value] || 'Filters');
// On phones, hides the sections that don't belong to the sheet that was opened
const sectionHidden = (key) => !!sheetSection.value && sheetSection.value !== key;
const openFilterSheet = (section = null) => {
  sheetSection.value = section;
  showMobileFilters.value = true;
  if (section) openSections.value[section] = true;
};
const closeFilterSheet = () => {
  if (isMobile()) showMobileFilters.value = false;
};
watch(showMobileFilters, (open) => {
  document.body.style.overflow = open && isMobile() ? 'hidden' : '';
  if (!open) sheetSection.value = null;
});
const moreFilterCount = computed(() => selectedAmenities.value.length + (selectedLocation.value ? 1 : 0));
const hasPriceFilter = computed(() => hasValue(minPrice.value) || hasValue(maxPrice.value));

// The Search page (same directory, shown with its filters on phones) opens with the box focused
const isSearchPage = computed(() => route.name === 'StudentSearch');
// The Search page lists houses only once the student has typed something or picked a filter
const hasSearchCriteria = computed(() => searchInput.value.trim() !== '' || activeFilterCount.value > 0);
const awaitingSearch = computed(() => isSearchPage.value && !hasSearchCriteria.value);
// Houses this student opened recently (this device), shown on the Search page before searching
const recentlyViewed = ref(getRecentlyViewed());
const recentAddress = (house) => (house.barangay ? `Brgy. ${house.barangay}, Nabua` : formatAddress(house));
watch(isSearchPage, (onSearch) => {
  if (!onSearch) return;
  nextTick(() => {
    const input = mobileSearchInput.value;
    if (!input) return;
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus({ preventScroll: true });
  });
}, { immediate: true });

const preventBackNavigation = () => {
  window.history.pushState(null, null, window.location.href);
};

onMounted(() => {
  // Home is the student's landing page; the Search page keeps normal Back behaviour
  if (!isSearchPage.value) {
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', preventBackNavigation);
  }
  fetchHouses();
});

onUnmounted(() => {
  document.body.style.overflow = '';
  window.removeEventListener('popstate', preventBackNavigation);
});
</script>

<template>
  <div class="bg-[#f8fafc] min-h-screen font-sans text-slate-800 pb-2 md:pb-6">
    <StudentNav />

    <!-- MAIN BODY CONTAINER -->
    <main class="max-w-[1440px] mx-auto pt-5 pb-2 md:py-8 lg:py-10 px-4 sm:px-6">
      <!-- Grid places the header, filter panel, and results; on small screens they stack in that order -->
      <div class="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] gap-x-8 gap-y-5 text-left">

        <!-- MOBILE HEADER. Home: greeting + search bar that opens the Search page.
             Search page: search box, sort/filter pills. Both: result count. -->
        <header class="md:hidden min-w-0">
          <div v-if="!isSearchPage" class="welcome-card relative overflow-hidden rounded-2xl px-6 py-7 mb-5 text-[#0f1f45]">
            <div class="relative">
              <h1 class="text-[30px] font-black leading-[1.2] tracking-tight break-words">
                Welcome,<br><span class="uppercase">{{ displayName }}!</span>
              </h1>
              <p class="text-[15px] text-slate-600 leading-relaxed mt-3 max-w-[16rem]">Find a safe and comfortable boarding house near CSPC.</p>
            </div>
          </div>

          <router-link
            v-if="!isSearchPage"
            to="/student/search"
            class="flex items-center gap-3 bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_18px_rgb(15_47_102/.07)] px-4 py-4"
            aria-label="Search boarding house"
          >
            <i class="fa-solid fa-magnifying-glass text-slate-700 text-[17px]" aria-hidden="true"></i>
            <span class="flex-1 min-w-0 truncate text-[15px]" :class="searchInput ? 'text-slate-800' : 'text-slate-400'">{{ searchInput || 'Search boarding house...' }}</span>
          </router-link>

          <div v-if="isSearchPage" class="flex items-center gap-2 bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_18px_rgb(15_47_102/.07)] px-4 py-1.5">
            <i class="fa-solid fa-magnifying-glass text-slate-700 text-[17px]" aria-hidden="true"></i>
            <input
              ref="mobileSearchInput"
              type="search"
              v-model="searchInput"
              aria-label="Search boarding house"
              placeholder="Search boarding house..."
              class="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-slate-800 placeholder:text-slate-400 py-2.5"
            >
          </div>

          <div v-if="isSearchPage" class="mobile-pills flex gap-2 overflow-x-auto -mx-4 px-4 pt-4 pb-1" aria-label="Sort and filter">
            <button type="button" class="pill" :class="{ 'is-on': hasPriceFilter }" @click="openFilterSheet('price')">
              Price <i class="fa-solid fa-chevron-down text-[11px]" aria-hidden="true"></i>
            </button>
            <button type="button" class="pill" :class="{ 'is-on': selectedRatings.length }" @click="openFilterSheet('ratings')">
              Rating <i class="fa-solid fa-chevron-down text-[11px]" aria-hidden="true"></i>
            </button>
            <button type="button" class="pill" :class="{ 'is-on': moreFilterCount || sortBy !== 'default' }" @click="openFilterSheet()">
              <i class="fa-solid fa-sliders text-[13px]" aria-hidden="true"></i> More Filters<span v-if="moreFilterCount"> ({{ moreFilterCount }})</span>
            </button>
          </div>

          <div v-if="!awaitingSearch" class="flex items-center justify-between gap-3 mt-4">
            <p class="text-[16px] text-slate-700">
              <template v-if="isLoading">Loading boarding houses…</template>
              <template v-else>{{ sortedHouses.length }} boarding {{ sortedHouses.length === 1 ? 'house' : 'houses' }} found</template>
            </p>
            <router-link v-if="isSearchPage" to="/student/map" class="shrink-0 inline-flex items-center gap-1.5 text-[14px] font-semibold text-blue-700 py-2">
              <i class="fa-regular fa-map text-[16px]" aria-hidden="true"></i> Map View
            </router-link>
            <div v-else class="shrink-0 flex bg-white border border-slate-200 rounded-2xl shadow-sm p-1" role="group" aria-label="Layout">
              <button
                type="button"
                @click="setViewMode('grid')"
                :aria-pressed="viewMode === 'grid'"
                aria-label="Grid view"
                class="w-11 h-10 rounded-xl flex items-center justify-center transition"
                :class="viewMode === 'grid' ? 'bg-blue-50 text-blue-700' : 'text-slate-400'"
              ><i class="fa-solid fa-table-cells-large text-[17px]" aria-hidden="true"></i></button>
              <button
                type="button"
                @click="setViewMode('list')"
                :aria-pressed="viewMode === 'list'"
                aria-label="List view"
                class="w-11 h-10 rounded-xl flex items-center justify-center transition"
                :class="viewMode === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-400'"
              ><i class="fa-solid fa-list text-[17px]" aria-hidden="true"></i></button>
            </div>
          </div>
        </header>

        <!-- HEADER: title, result count, search, sort -->
        <header class="lg:col-start-2 lg:row-start-1 hidden md:flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div v-if="!isSearchPage" class="welcome-card relative overflow-hidden rounded-2xl px-8 py-8 lg:px-10 w-full text-[#0f1f45]">
            <div class="relative">
              <h1 class="text-[34px] lg:text-[38px] font-black leading-[1.15] tracking-tight break-words">
                Welcome, <span class="uppercase">{{ displayName }}!</span>
              </h1>
              <p class="text-[15px] text-slate-600 leading-relaxed mt-2.5">Find a safe and comfortable boarding house near CSPC.</p>
            </div>
          </div>

          <div class="flex-[1_0_auto] max-w-full">
            <p class="text-slate-500 text-sm font-medium">
              <template v-if="isLoading">Loading boarding houses…</template>
              <template v-else>{{ sortedHouses.length }} boarding {{ sortedHouses.length === 1 ? 'house' : 'houses' }} found</template>
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-3 flex-[1_1_560px] max-w-full">
            <div class="relative w-full sm:flex-1 min-w-0">
              <span class="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                <i class="fa-solid fa-magnifying-glass text-xs"></i>
              </span>
              <input
                type="text"
                v-model="searchInput"
                aria-label="Search boarding house"
                placeholder="Search boarding house..."
                class="w-full pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium shadow-sm focus:border-blue-400 outline-none transition"
              >
            </div>
            <div class="relative w-full sm:w-52 shrink-0">
              <select
                v-model="sortBy"
                aria-label="Sort boarding houses"
                class="w-full appearance-none pl-4 pr-9 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 shadow-sm focus:border-blue-400 outline-none transition cursor-pointer"
              >
                <option value="default">{{ defaultSortLabel }}</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
              </select>
              <span class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 pointer-events-none">
                <i class="fa-solid fa-chevron-down text-[10px]"></i>
              </span>
            </div>
            <!-- Grid / List (presentation only; hidden on phones where both look the same) -->
            <div class="hidden md:flex shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm p-1" role="group" aria-label="Layout">
              <button
                type="button"
                @click="setViewMode('grid')"
                :aria-pressed="viewMode === 'grid'"
                aria-label="Grid view"
                title="Grid view"
                class="w-11 h-[38px] rounded-lg flex items-center justify-center transition"
                :class="viewMode === 'grid' ? 'bg-blue-50 text-blue-700' : 'text-slate-400 hover:text-slate-700'"
              ><i class="fa-solid fa-table-cells-large text-[15px]"></i></button>
              <button
                type="button"
                @click="setViewMode('list')"
                :aria-pressed="viewMode === 'list'"
                aria-label="List view"
                title="List view"
                class="w-11 h-[38px] rounded-lg flex items-center justify-center transition"
                :class="viewMode === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-400 hover:text-slate-700'"
              ><i class="fa-solid fa-list text-[15px]"></i></button>
            </div>
          </div>
        </header>

        <!-- FILTER PANEL: sidebar on desktop, collapsible card on smaller screens -->
        <!-- On phones this is a bottom sheet opened from the filter pills -->
        <aside
          class="filter-panel lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:self-start lg:sticky lg:top-24"
          :class="{ 'is-sheet-open': showMobileFilters }"
          @click.self="closeFilterSheet"
        >
          <div class="filter-card bg-white rounded-2xl lg:rounded-3xl shadow-sm border border-slate-200/60" role="group" aria-label="Filters">
            <div class="md:hidden flex items-center justify-between gap-3 px-5 pt-3 pb-1">
              <span class="mx-auto w-10 h-1.5 rounded-full bg-slate-200" aria-hidden="true"></span>
            </div>
            <div class="md:hidden flex items-center justify-between gap-3 px-5 pt-2 pb-3">
              <h2 class="text-[17px] font-bold text-slate-900">{{ sheetTitle }}</h2>
              <div class="flex items-center gap-1">
                <button type="button" @click="clearFilters" class="text-[13px] font-semibold text-blue-700 px-3 py-2">Clear all</button>
                <button type="button" @click="showMobileFilters = false" class="w-10 h-10 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center" aria-label="Close filters">
                  <i class="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="hidden md:flex items-center justify-between gap-3 p-4 lg:px-6 lg:pt-6 lg:pb-4">
              <button
                type="button"
                class="flex items-center gap-2 text-slate-800 lg:cursor-default min-w-0"
                :aria-expanded="showMobileFilters"
                @click="showMobileFilters = !showMobileFilters"
              >
                <i class="fa-solid fa-sliders text-blue-600 text-sm"></i>
                <h2 class="text-xs font-black uppercase tracking-[0.12em] text-slate-900 whitespace-nowrap">Filter Directory</h2>
                <span v-if="activeFilterCount > 0" class="lg:hidden text-[10px] font-black bg-blue-600 text-white rounded-full px-2 py-0.5 leading-none">{{ activeFilterCount }}</span>
                <!-- Wrapper carries lg:hidden because Font Awesome sets display on the icon itself -->
                <span class="lg:hidden flex items-center">
                  <i class="fa-solid fa-chevron-down text-[10px] text-slate-400 transition-transform" :class="{ 'rotate-180': showMobileFilters }"></i>
                </span>
              </button>
              <button
                type="button"
                @click="clearFilters"
                class="text-xs font-bold text-blue-600 hover:text-blue-800 transition whitespace-nowrap shrink-0"
              >Clear All</button>
            </div>

            <div :class="showMobileFilters ? 'block' : 'hidden lg:block'" class="px-5 md:px-4 pb-5 lg:px-6 lg:pb-6">
              <hr class="mb-5 border-slate-100">

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-8 gap-y-6">
                <!-- Sort (phones only; desktop has the sort dropdown in the header) -->
                <div v-if="!sheetSection" class="md:hidden">
                  <p class="flt-label mb-3">Sort by</p>
                  <div class="relative">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-blue-600 pointer-events-none">
                      <i class="fa-solid fa-arrow-down-wide-short text-xs"></i>
                    </span>
                    <select
                      v-model="sortBy"
                      aria-label="Sort boarding houses"
                      class="w-full appearance-none pl-8 pr-8 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-400 transition cursor-pointer"
                    >
                      <option value="default">{{ defaultSortLabel }}</option>
                      <option value="price_asc">Price: Low to High</option>
                      <option value="price_desc">Price: High to Low</option>
                      <option value="rating">Highest Rated</option>
                    </select>
                    <span class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 pointer-events-none">
                      <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </span>
                  </div>
                </div>

                <!-- Star Rating Filter -->
                <div :class="{ 'sheet-hide': sectionHidden('ratings') }">
                  <button type="button" @click="toggleSection('ratings')" :aria-expanded="openSections.ratings" aria-controls="flt-ratings" class="flt-head" :class="{ 'mb-3': openSections.ratings }">
                    <span class="flt-label">Ratings<span v-if="!openSections.ratings && selectedRatings.length" class="flt-count">{{ selectedRatings.length }}</span></span>
                    <i class="fa-solid fa-chevron-up flt-chevron" :class="{ 'rotate-180': !openSections.ratings }"></i>
                  </button>
                  <div v-show="openSections.ratings" id="flt-ratings" class="grid grid-cols-2 md:grid-cols-1 gap-3">
                    <label
                      v-for="num in [5,4,3,2,1]"
                      :key="num"
                      class="flex items-center gap-3 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        :value="num"
                        :checked="selectedRatings.includes(num)"
                        @change="toggleRating(num)"
                        class="w-4 h-4 border-slate-300 rounded text-blue-600 focus:ring-0 cursor-pointer flex-shrink-0"
                      >
                      <span class="text-xs font-bold text-slate-600 group-hover:text-slate-900 flex items-center gap-1">
                        {{ num }}
                        <span class="text-amber-400 whitespace-nowrap">
                          <i v-for="star in num" :key="star" class="fa-solid fa-star text-[10px]"></i>
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <!-- Price Range Filter -->
                <div class="flt-section" :class="{ 'sheet-hide': sectionHidden('price') }">
                  <button type="button" @click="toggleSection('price')" :aria-expanded="openSections.price" aria-controls="flt-price" class="flt-head" :class="{ 'mb-3': openSections.price }">
                    <span class="flt-label">Price Range (₱)<span v-if="!openSections.price && (hasValue(minPrice) || hasValue(maxPrice))" class="flt-count">{{ (hasValue(minPrice) ? 1 : 0) + (hasValue(maxPrice) ? 1 : 0) }}</span></span>
                    <i class="fa-solid fa-chevron-up flt-chevron" :class="{ 'rotate-180': !openSections.price }"></i>
                  </button>
                  <div v-show="openSections.price" id="flt-price" class="flex items-center gap-1.5">
                    <div class="relative flex-1">
                      <span class="absolute left-3 top-2.5 text-slate-300 text-[11px] font-bold">₱</span>
                      <input
                        type="number"
                        v-model="minPrice"
                        aria-label="Minimum price"
                        placeholder="Min"
                        class="w-full pl-6 pr-2 py-2 border border-slate-200 bg-slate-50/50 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-400 transition"
                      >
                    </div>
                    <span class="text-slate-300 text-xs">-</span>
                    <div class="relative flex-1">
                      <span class="absolute left-3 top-2.5 text-slate-300 text-[11px] font-bold">₱</span>
                      <input
                        type="number"
                        v-model="maxPrice"
                        aria-label="Maximum price"
                        placeholder="Max"
                        class="w-full pl-6 pr-2 py-2 border border-slate-200 bg-slate-50/50 rounded-xl text-xs font-bold outline-none focus:bg-white focus:border-blue-400 transition"
                      >
                    </div>
                  </div>
                </div>

                <!-- Amenities Filter -->
                <div v-if="amenityOptions.length > 0" class="flt-section" :class="{ 'sheet-hide': sectionHidden('amenities') }">
                  <button type="button" @click="toggleSection('amenities')" :aria-expanded="openSections.amenities" aria-controls="flt-amenities" class="flt-head" :class="{ 'mb-3': openSections.amenities }">
                    <span class="flt-label">Amenities<span v-if="!openSections.amenities && selectedAmenities.length" class="flt-count">{{ selectedAmenities.length }}</span></span>
                    <i class="fa-solid fa-chevron-up flt-chevron" :class="{ 'rotate-180': !openSections.amenities }"></i>
                  </button>
                  <div v-show="openSections.amenities" id="flt-amenities">
                  <div class="grid grid-cols-1 gap-3">
                    <label
                      v-for="opt in visibleAmenityOptions"
                      :key="opt.key"
                      class="flex items-center gap-3 cursor-pointer group min-w-0"
                    >
                      <input
                        type="checkbox"
                        :checked="selectedAmenities.includes(opt.key)"
                        @change="toggleAmenity(opt.key)"
                        class="w-4 h-4 border-slate-300 rounded text-blue-600 focus:ring-0 cursor-pointer flex-shrink-0"
                      >
                      <i class="fa-solid text-[11px] text-slate-500 w-4 text-center" :class="amenityIcon(opt.label)"></i>
                      <span class="text-xs font-bold text-slate-600 group-hover:text-slate-900 truncate">{{ opt.label }}</span>
                      <span v-if="opt.paid" class="shrink-0 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px leading-none">Paid</span>
                    </label>
                  </div>
                  <button
                    v-if="amenityOptions.length > VISIBLE_AMENITY_OPTIONS"
                    type="button"
                    @click="showAllAmenities = !showAllAmenities"
                    class="mt-3 text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
                  >
                    <i class="fa-solid text-[11px]" :class="showAllAmenities ? 'fa-circle-minus' : 'fa-circle-plus'"></i>
                    {{ showAllAmenities ? 'Show fewer amenities' : 'Show all amenities' }}
                  </button>
                  </div>
                </div>

                <!-- Location Filter -->
                <div v-if="locationOptions.length > 0" class="flt-section" :class="{ 'sheet-hide': sectionHidden('location') }">
                  <button type="button" @click="toggleSection('location')" :aria-expanded="openSections.location" aria-controls="flt-location" class="flt-head" :class="{ 'mb-3': openSections.location }">
                    <span class="flt-label">Location<span v-if="!openSections.location && selectedLocation" class="flt-count">1</span></span>
                    <i class="fa-solid fa-chevron-up flt-chevron" :class="{ 'rotate-180': !openSections.location }"></i>
                  </button>
                  <div v-show="openSections.location" id="flt-location" class="relative">
                    <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-blue-600 pointer-events-none">
                      <i class="fa-solid fa-location-dot text-xs"></i>
                    </span>
                    <select
                      v-model="selectedLocation"
                      aria-label="Filter by location"
                      class="w-full appearance-none pl-8 pr-8 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-blue-400 transition cursor-pointer"
                    >
                      <option value="">All Locations</option>
                      <option v-for="loc in locationOptions" :key="loc.key" :value="loc.key">Brgy. {{ loc.label }}</option>
                    </select>
                    <span class="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 pointer-events-none">
                      <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                @click="clearFilters"
                class="hidden md:flex mt-6 w-full items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-widest hover:bg-blue-100 transition"
              >
                <i class="fa-solid fa-rotate-right text-[11px]"></i> Clear Filters
              </button>
            </div>
            <div class="md:hidden sticky bottom-0 bg-white border-t border-slate-100 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <button
                type="button"
                @click="showMobileFilters = false"
                class="w-full bg-blue-700 hover:bg-blue-800 text-white text-[15px] font-semibold py-3.5 rounded-xl transition"
              >Show {{ sortedHouses.length }} {{ sortedHouses.length === 1 ? 'result' : 'results' }}</button>
            </div>
          </div>
        </aside>

        <!-- RESULTS -->
        <section ref="resultsTop" class="lg:col-start-2 lg:row-start-2 scroll-mt-24 min-w-0">
          <!-- Loading Spinner -->
          <div v-if="isLoading" class="py-24 text-center bg-white rounded-[2rem] border border-slate-200/60 shadow-sm">
            <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading boarding houses...</p>
          </div>

          <!-- Subtle Offline Notice (ONLY when physically offline) -->
          <div v-if="isOffline" class="mb-6 p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border border-amber-400/40 backdrop-blur-md rounded-2xl text-amber-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-md shadow-amber-200">
                <i class="fa-solid fa-wifi-slash animate-pulse"></i>
              </div>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-amber-950">You are currently offline • Displaying saved listings</p>
                <p class="text-[11px] font-medium text-amber-800">Reconnect to active internet to view real-time room availability and updates.</p>
              </div>
            </div>
            <span class="self-start sm:self-auto text-[9px] bg-amber-600 text-white px-3 py-1.5 rounded-full font-black uppercase tracking-widest shrink-0 shadow-sm">
              Offline Cache
            </span>
          </div>

          <!-- Refresh failed while online, but saved listings are still shown -->
          <div v-if="!isLoading && !isOffline && refreshFailed" class="mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
            <p class="text-xs font-bold flex items-center gap-2">
              <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>
              Couldn't refresh the directory. Showing previously saved listings.
            </p>
            <button type="button" @click="fetchHouses" class="self-start sm:self-auto text-[10px] font-black uppercase tracking-widest bg-white border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition">Retry</button>
          </div>

          <!-- Load Error State (request failed while online and nothing is cached) -->
          <div v-if="!isLoading && !isOffline && loadError" class="py-20 text-center bg-white rounded-[2rem] border border-red-100 shadow-sm px-6">
            <div class="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 mx-auto mb-4">
              <i class="fa-solid fa-circle-exclamation text-2xl"></i>
            </div>
            <h3 class="text-slate-900 font-black uppercase tracking-tight text-sm mb-1">Unable to Load Boarding Houses</h3>
            <p class="text-slate-400 font-medium text-xs max-w-md mx-auto leading-relaxed mb-5">
              Something went wrong while loading the directory. Please try again.
            </p>
            <button type="button" @click="fetchHouses" class="bg-blue-700 hover:bg-[#0f2f66] text-white text-[10px] font-black py-2.5 px-6 rounded-xl uppercase tracking-widest transition">Retry</button>
          </div>

          <!-- ONLINE Empty State (When 0 accredited houses exist in database) -->
          <div v-if="!isLoading && !isOffline && !loadError && houses.length === 0" class="py-20 text-center bg-white rounded-[2rem] border border-slate-200/80 shadow-sm px-6">
            <div class="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#2a528a] mx-auto mb-4 shadow-sm">
              <i class="fa-solid fa-building-circle-check text-2xl"></i>
            </div>
            <h3 class="text-slate-900 font-black uppercase tracking-tight text-sm mb-1">No Accredited Boarding Houses Available Yet</h3>
            <p class="text-slate-400 font-medium text-xs max-w-md mx-auto leading-relaxed">
              SASO Administrators are currently reviewing and inspecting pending landlord accreditation applications. Please check back soon for updated listings.
            </p>
          </div>

          <!-- OFFLINE Empty State (Only if NO cached houses exist in storage) -->
          <div v-if="!isLoading && isOffline && houses.length === 0" class="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-amber-200 shadow-sm px-6">
            <div class="w-14 h-14 rounded-2xl bg-amber-100/80 flex items-center justify-center text-amber-600 mx-auto mb-4">
              <i class="fa-solid fa-wifi-slash text-2xl"></i>
            </div>
            <h3 class="text-amber-900 font-black uppercase tracking-widest text-xs mb-1">No Saved Listings Available Offline</h3>
            <p class="text-slate-500 font-medium text-xs max-w-sm mx-auto">Please connect to an active internet connection to load and save available boarding houses.</p>
          </div>

          <!-- Search page before any search: recently viewed houses -->
          <section v-if="awaitingSearch && recentlyViewed.length" class="mb-2" aria-labelledby="recent-title">
            <h2 id="recent-title" class="flex items-center gap-2.5 text-[17px] font-bold text-[#0f1f45]">
              <i class="fa-regular fa-clock text-blue-700 text-[19px]" aria-hidden="true"></i> Recently Viewed
            </h2>
            <div class="recent-scroll flex gap-3 overflow-x-auto -mx-4 px-4 pt-3 pb-2">
              <router-link
                v-for="house in recentlyViewed"
                :key="house.id"
                :to="`/student/house/${house.id}`"
                class="shrink-0 w-[150px] bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <img
                  :src="getImageUrl(house.img)"
                  :alt="house.name"
                  loading="lazy"
                  class="w-full aspect-[4/3] object-cover bg-slate-100"
                  @error="$event.target.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'"
                >
                <div class="p-2.5">
                  <p class="text-[13px] font-bold text-[#0f1f45] truncate">{{ house.name }}</p>
                  <p v-if="recentAddress(house)" class="text-[11px] text-slate-500 truncate mt-0.5">
                    <i class="fa-solid fa-location-dot text-[10px]" aria-hidden="true"></i> {{ recentAddress(house) }}
                  </p>
                  <p v-if="displayPrice(house)" class="text-[13px] font-black text-blue-700 truncate mt-1">{{ displayPrice(house) }}</p>
                </div>
              </router-link>
            </div>
          </section>

          <!-- Search page before any search: a prompt instead of the full list -->
          <div v-if="!isLoading && houses.length > 0 && awaitingSearch" class="py-14 px-6 text-center">
            <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto mb-4">
              <i class="fa-solid fa-magnifying-glass text-2xl" aria-hidden="true"></i>
            </div>
            <h2 class="text-[17px] font-bold text-slate-900">No search yet</h2>
            <p class="text-[14px] text-slate-500 leading-relaxed mt-1.5 max-w-xs mx-auto">
              Type a boarding house name, barangay, or owner, or use the filters above to find a place.
            </p>
          </div>

          <template v-if="!isLoading && houses.length > 0 && !awaitingSearch">
            <!-- Active filter chips -->
            <div v-if="activeChips.length > 0" class="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
              <button
                v-for="chip in activeChips"
                :key="chip.id"
                type="button"
                @click="chip.remove"
                :aria-label="`Remove filter ${chip.label}`"
                class="inline-flex items-center gap-2 max-w-full text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-full pl-3 pr-2 py-1.5 hover:bg-blue-100 transition"
              >
                <span class="truncate">{{ chip.label }}</span>
                <i class="fa-solid fa-xmark text-[10px] text-blue-500"></i>
              </button>
              <button
                v-if="activeChips.length > 1"
                type="button"
                @click="clearFilters"
                class="text-xs font-bold text-slate-500 hover:text-slate-900 underline underline-offset-2 px-1"
              >Clear all</button>
            </div>

            <!-- No matches for the current search/filters -->
            <div v-if="sortedHouses.length === 0" class="py-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200/80 shadow-inner px-6">
              <svg class="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>
              <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-4">No accredited houses match your filter criteria.</p>
              <button type="button" @click="clearFilters" class="text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-5 py-2.5 hover:bg-blue-100 transition">Clear Filters</button>
            </div>

            <!-- MOBILE HOUSE CARDS: grid = two compact columns, list = full cards -->
            <div v-else class="md:hidden" :class="viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-4'">
              <template v-if="viewMode === 'grid'">
                <article
                  v-for="house in paginatedHouses"
                  :key="'g-' + house.id"
                  class="bg-white rounded-2xl p-1.5 border border-slate-100 shadow-[0_4px_16px_rgb(15_47_102/.07)] flex flex-col min-w-0"
                >
                  <div class="relative rounded-xl overflow-hidden aspect-[4/3] bg-slate-100">
                    <router-link :to="`/student/house/${house.id}`" :aria-label="house.name" class="block w-full h-full">
                      <img
                        :src="getImageUrl(house.img)"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        class="w-full h-full object-cover"
                        @error="$event.target.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'"
                      >
                    </router-link>
                    <span class="rating-pill absolute top-2 right-2 text-[11px] px-2 py-1" :aria-label="ratingLabel(house)">
                      <i class="fa-solid fa-star text-amber-400" aria-hidden="true"></i>{{ ratingText(house) }}
                    </span>
                  </div>
                  <router-link :to="`/student/house/${house.id}`" class="flex flex-col flex-1 px-1.5 pt-2 pb-1.5 min-w-0">
                    <h2 class="font-black text-[13px] text-slate-900 leading-tight uppercase tracking-tight line-clamp-2">{{ house.name }}</h2>
                    <p v-if="formatAddress(house)" class="text-[11px] text-slate-500 truncate mt-1">
                      <i class="fa-solid fa-location-dot text-blue-600 text-[10px]" aria-hidden="true"></i> {{ formatAddress(house) }}
                    </p>
                    <p class="mt-auto pt-2 leading-none truncate">
                      <template v-if="displayPrice(house)">
                        <span class="font-black text-[14px] text-blue-700">{{ displayPrice(house) }}</span><span class="text-[11px] text-slate-500"> /month</span>
                      </template>
                      <span v-else class="text-[11px] text-slate-400">Price not available</span>
                    </p>
                  </router-link>
                </article>
              </template>
              <template v-else>
              <article
                v-for="house in paginatedHouses"
                :key="'m-' + house.id"
                class="bg-white rounded-[22px] p-2.5 border border-slate-100 shadow-[0_4px_20px_rgb(15_47_102/.07)]"
              >
                <div class="relative rounded-2xl overflow-hidden aspect-[16/10] bg-slate-100">
                  <img
                    :src="getImageUrl(house.img)"
                    :alt="house.name"
                    loading="lazy"
                    decoding="async"
                    class="w-full h-full object-cover"
                    @error="$event.target.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'"
                  >
                  <span class="rating-pill absolute top-3 right-3 text-[13px] px-3 py-1.5" :aria-label="ratingLabel(house)">
                    <i class="fa-solid fa-star text-amber-400" aria-hidden="true"></i>{{ ratingText(house) }}
                  </span>
                  <span v-if="photoCount(house) > 0" class="absolute bottom-3 right-3 inline-flex items-center gap-1.5 bg-slate-900/70 text-white text-[12px] font-semibold rounded-lg px-2.5 py-1.5" :aria-label="`${photoCount(house)} photos`">
                    <i class="fa-regular fa-image text-[13px]" aria-hidden="true"></i> 1 / {{ photoCount(house) }}
                  </span>
                </div>

                <div class="px-2 pt-3 pb-1.5">
                  <h2 class="font-black text-[17px] text-slate-900 leading-tight uppercase tracking-tight line-clamp-2">{{ house.name }}</h2>
                  <p v-if="formatAddress(house)" class="text-[12px] text-slate-500 font-medium uppercase tracking-wide flex items-start gap-1.5 mt-1.5">
                    <i class="fa-solid fa-location-dot text-[12px] text-blue-600 mt-[1px]" aria-hidden="true"></i>
                    <span class="line-clamp-2">{{ formatAddress(house) }}</span>
                  </p>

                  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-3">
                    <p class="leading-none">
                      <template v-if="displayPrice(house)">
                        <span class="font-black text-[21px] text-blue-700">{{ displayPrice(house) }}</span>
                        <span class="text-[13px] text-slate-500"> / month</span>
                      </template>
                      <span v-else class="text-[13px] font-semibold text-slate-400">Price not available</span>
                    </p>
                  </div>

                  <div class="flex flex-wrap gap-2 mt-3">
                    <span
                      v-for="a in amenitiesOf(house).slice(0, 2)"
                      :key="a.key"
                      class="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-xl px-3 py-2 max-w-[140px]"
                      :class="a.paid ? 'text-amber-800 bg-amber-50' : 'text-slate-700 bg-slate-50'"
                    >
                      <i class="fa-solid text-[12px]" :class="[amenityIcon(a.label), a.paid ? 'text-amber-600' : 'text-slate-500']" aria-hidden="true"></i>
                      <span class="truncate">{{ a.label }}</span>
                      <span v-if="a.paid" class="sr-only">(paid)</span>
                    </span>
                    <span class="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700 bg-slate-50 rounded-xl px-3 py-2">
                      <i class="fa-solid fa-bed text-[12px] text-slate-500" aria-hidden="true"></i>
                      {{ house.room_count || 0 }} {{ Number(house.room_count) === 1 ? 'Room' : 'Rooms' }}
                    </span>
                    <span
                      v-if="amenitiesOf(house).length > 2"
                      class="inline-flex items-center text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2"
                      :aria-label="`${amenitiesOf(house).length - 2} more amenities`"
                    >+{{ amenitiesOf(house).length - 2 }}</span>
                  </div>

                  <div class="grid grid-cols-1 mt-4">
                    <button
                      type="button"
                      @click="handleDetails(house.id)"
                      class="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[14px] font-semibold"
                    >
                      View Details <i class="fa-solid fa-arrow-right text-[12px]" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
              </article>
              </template>
            </div>

            <!-- DYNAMIC ACCREDITED HOUSES GRID -->
            <div v-if="sortedHouses.length > 0" :class="viewMode === 'list' ? 'hidden md:flex flex-col gap-4' : 'hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'">
              <article
                v-for="house in paginatedHouses"
                :key="house.id"
                class="bg-white rounded-2xl p-3 shadow-sm border border-slate-200/60 hover:shadow-md transition-all duration-300 flex flex-col hover:-translate-y-0.5"
                :class="viewMode === 'list' ? 'md:flex-row md:gap-5' : ''"
              >
                <!-- Aspect-Ratio Protected Photo Cover -->
                <div class="relative rounded-xl overflow-hidden aspect-[17/10] bg-slate-50 border border-slate-100 shrink-0"
                     :class="viewMode === 'list' ? 'md:w-[260px] lg:w-[300px] md:aspect-auto md:min-h-[190px]' : ''">
                  <img
                    :src="getImageUrl(house.img)"
                    :alt="house.name"
                    loading="lazy"
                    decoding="async"
                    class="w-full h-full object-cover"
                    @error="$event.target.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png'"
                  >
                  <span class="rating-pill absolute top-3 right-3 text-[13px] px-3 py-1.5" :aria-label="ratingLabel(house)">
                    <i class="fa-solid fa-star text-amber-400" aria-hidden="true"></i>{{ ratingText(house) }}
                  </span>
                </div>

                <div class="px-1.5 pt-3 flex flex-col flex-1 min-w-0" :class="viewMode === 'list' ? 'md:pt-1.5 md:pb-1 md:pr-2' : ''">
                  <h2 class="font-black text-[17px] text-[#0f2f66] leading-tight uppercase tracking-tight line-clamp-2">{{ house.name }}</h2>
                  <p v-if="formatAddress(house)" class="text-[10.5px] text-slate-400 font-bold uppercase tracking-wider flex items-start gap-1.5 mt-1">
                    <i class="fa-solid fa-location-dot text-[9px] text-blue-500 mt-[2px]"></i>
                    <span class="line-clamp-2">{{ formatAddress(house) }}</span>
                  </p>

                  <!-- Price and rating -->
                  <div class="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 mt-3">
                    <p class="leading-none">
                      <template v-if="displayPrice(house)">
                        <span class="font-black text-[20px] text-blue-700">{{ displayPrice(house) }}</span>
                        <span class="text-xs text-slate-400 font-medium"> / month</span>
                      </template>
                      <span v-else class="text-xs font-bold text-slate-400">Price not available</span>
                    </p>
                    <div v-if="Number(house.review_count) > 0" class="flex items-center gap-0.5 text-[10px]" :title="`${house.review_count} review${Number(house.review_count) === 1 ? '' : 's'}`">
                      <i v-for="i in 5" :key="i" class="fa-solid fa-star" :class="i <= Math.round(ratingValue(house)) ? 'text-amber-400' : 'text-slate-200'"></i>
                      <span class="ml-1 text-xs font-black text-slate-700">{{ ratingValue(house).toFixed(1) }}</span>
                    </div>
                    <span v-else class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No reviews yet</span>
                  </div>

                  <p class="text-[10px] text-slate-500 font-bold mt-2 flex items-center gap-1.5">
                    <i class="fa-solid fa-door-open text-blue-500 text-[9px]"></i> Rooms: {{ house.room_count || 0 }}
                  </p>

                  <!-- Amenity chips -->
                  <!-- Condensed amenities: a few chips plus "+N" (full list in the tooltip and on the details page) -->
                  <div v-if="amenitiesOf(house).length > 0" class="flex flex-wrap gap-1.5 mt-3">
                    <span
                      v-for="a in amenitiesOf(house).slice(0, chipLimit)"
                      :key="a.key"
                      :title="a.paid ? `${a.label} (paid)` : a.label"
                      class="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-lg px-2.5 py-1.5 max-w-[150px] border"
                      :class="a.paid ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-slate-600 bg-white border-slate-200'"
                    >
                      <i class="fa-solid text-[10px]" :class="[amenityIcon(a.label), a.paid ? 'text-amber-600' : 'text-slate-500']"></i>
                      <span class="truncate">{{ a.label }}</span>
                      <span v-if="a.paid" class="sr-only">(paid)</span>
                    </span>
                    <span
                      v-if="amenitiesOf(house).length > chipLimit"
                      class="inline-flex items-center text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                      :title="amenitiesOf(house).slice(chipLimit).map(a => a.paid ? `${a.label} (paid)` : a.label).join(', ')"
                      :aria-label="`${amenitiesOf(house).length - chipLimit} more amenities`"
                    >+{{ amenitiesOf(house).length - chipLimit }}</span>
                  </div>

                  <!-- Booking happens on the details page, where the student picks a room -->
                  <div class="mt-auto pt-4" :class="viewMode === 'list' ? 'md:flex md:justify-end' : ''">
                    <button
                      @click="handleDetails(house.id)"
                      class="w-full bg-blue-700 text-white text-[12px] font-black py-3 px-4 rounded-xl uppercase tracking-widest hover:bg-[#0f2f66] transition flex items-center justify-center gap-2 cursor-pointer"
                      :class="viewMode === 'list' ? 'md:w-auto md:px-8' : ''"
                    >View Details <i class="fa-solid fa-arrow-right text-[10px]"></i></button>
                  </div>
                </div>
              </article>
            </div>

            <!-- Data table paging (bottom) -->
            <StudentPager v-if="sortedHouses.length > 0" class="mt-6" noun="boarding houses" :page="currentPage" :total-pages="totalPages" :start="pageStart" :end="pageEnd" :total="sortedHouses.length" @update:page="goToPage"  />
          </template>
        </section>
      </div>
    </main>

  </div>
</template>

<style>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.25s ease-out forwards;
}
</style>

<style scoped>
/* Collapsible filter sections */
.flt-head { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: left; }
.flt-label { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
.flt-head:hover .flt-label { color: #334155; }
.flt-count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #2563eb; color: #fff; font-size: 10px; letter-spacing: 0; display: inline-flex; align-items: center; justify-content: center; }
.flt-chevron { font-size: 11px; color: #94a3b8; transition: transform .15s; }
@media (min-width: 1024px) {
  .flt-section { border-top: 1px solid #f1f5f9; padding-top: 20px; }
}

/* ---------- Mobile layout ---------- */
.rating-pill { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; background: #fff; color: #1e293b; font-weight: 700; line-height: 1; box-shadow: 0 2px 8px rgb(15 23 42 / .18); }
.welcome-card { background: #f8fafc; border: 1px solid #e2e8f0; box-shadow: 0 4px 18px rgb(15 47 102 / .06); }
/* Faded CSPC campus photo on the right, fading out behind the text */
.welcome-card::before {
  content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 70%;
  background: url('/img/cspc_bg.webp') center / cover no-repeat;
  opacity: .22; filter: saturate(.5);
  -webkit-mask-image: linear-gradient(to right, transparent, #000 55%);
  mask-image: linear-gradient(to right, transparent, #000 55%);
}
.mobile-pills, .recent-scroll { scrollbar-width: none; }
.recent-scroll::-webkit-scrollbar { display: none; }
.mobile-pills::-webkit-scrollbar { display: none; }
.pill { flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid #e2e8f0; background: #fff; color: #0f172a; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 1px 2px rgb(15 23 42 / .04); }
.pill.is-on { border-color: #1d4ed8; background: #eef4ff; color: #1d4ed8; }
.pill-select { appearance: none; -webkit-appearance: none; background: transparent; border: 0; outline: 0; color: inherit; font: inherit; padding-right: 2px; cursor: pointer; }
.pill:has(.pill-select:focus-visible), .pill:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

@media (max-width: 767px) {
  .sheet-hide { display: none !important; }
  .filter-panel { display: none; }
  .filter-panel.is-sheet-open { display: block; position: fixed; inset: 0; z-index: 80; background: rgb(15 23 42 / .45); }
  .filter-panel.is-sheet-open .filter-card { position: absolute; left: 0; right: 0; bottom: 0; max-height: 85vh; overflow-y: auto; border-radius: 24px 24px 0 0; border: 0; animation: sheetUp .22s ease-out; }
}
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .filter-card { animation: none !important; } }
</style>
