<script setup>
import { computed, ref, watch, useId, nextTick } from 'vue';
import { getImageUrl } from '../config/api.js';
import { roomList } from '../utils/roomDetails.js';
import { roomWing, roomIsFull, roomTitle, roomMonthlyPrice, filterBookingRooms, sortBookingRooms, bookingRoomPage, roommateBreakdown, roommateSummary, canBookRoomGender } from '../utils/studentRoomPicker.js';
const props = defineProps({ rooms: { type: Array, default: () => [] }, modelValue: [String, Number], basePrice: [String, Number], studentGender: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue','continue']);
const uid = useId();
const wing = ref('female'), search = ref(''), floor = ref('all'), availability = ref('all');
const sort = ref('number'), page = ref(1), pageSize = ref(8);
const listHeading = ref(null);
const genderKnown = computed(() => ['female','male'].includes(String(props.studentGender || '').trim().toLowerCase()));
const eligibleRooms = computed(() => props.rooms.filter(room => canBookRoomGender(room,props.studentGender)));
const selected = computed(() => eligibleRooms.value.find(room => String(room.id) === String(props.modelValue)));
const wings = computed(() => [
  { key: 'female', label: "Female's wing", icon: 'fa-person-dress', count: eligibleRooms.value.filter(room => roomWing(room) === 'female').length },
  { key: 'male', label: "Male's wing", icon: 'fa-person', count: eligibleRooms.value.filter(room => roomWing(room) === 'male').length },
  ...(eligibleRooms.value.some(room => roomWing(room) === 'other') ? [{ key: 'other', label: 'Other rooms', icon: 'fa-door-open', count: eligibleRooms.value.filter(room => roomWing(room) === 'other').length }] : [])
].filter(tab => tab.key === 'other' || tab.key === String(props.studentGender || '').trim().toLowerCase()));
watch(eligibleRooms, (rooms) => {
  if (props.modelValue !== '' && props.modelValue != null && !rooms.some(room => String(room.id) === String(props.modelValue))) emit('update:modelValue','');
  if (selected.value) wing.value = roomWing(selected.value);
  else if (!rooms.some(room => roomWing(room) === wing.value)) wing.value = rooms.length ? roomWing(rooms[0]) : (String(props.studentGender || '').trim().toLowerCase() || 'female');
}, { immediate: true });
const changeWing = (key) => { wing.value = key; floor.value = 'all'; search.value = ''; };
const floors = computed(() => [...new Set(eligibleRooms.value.filter(room => roomWing(room) === wing.value).map(room => room.floor_label).filter(Boolean))].sort((a,b) => a.localeCompare(b, undefined, { numeric: true })));
const visible = computed(() => filterBookingRooms(eligibleRooms.value, { wing: wing.value, search: search.value, floor: floor.value, availability: availability.value }));
const sorted = computed(() => sortBookingRooms(visible.value,sort.value,props.basePrice));
const results = computed(() => bookingRoomPage(sorted.value,page.value,pageSize.value));
watch([wing,search,floor,availability,sort,pageSize,() => props.studentGender], () => { page.value=1; });
const goToPage = async (value) => { page.value=bookingRoomPage(sorted.value,value,pageSize.value).page; await nextTick(); listHeading.value?.focus({preventScroll:true}); listHeading.value?.scrollIntoView({block:'nearest',behavior:'auto'}); };
const pageNumbers = computed(() => {
  const total=results.value.totalPages,current=results.value.page;
  if(total<=5) return Array.from({length:total},(_,index)=>index+1);
  return [...new Set([1,...Array.from({length:3},(_,index)=>current-1+index).filter(value=>value>1 && value<total),total])];
});
const selectedOffPage = computed(() => selected.value && !results.value.items.some(room => String(room.id) === String(selected.value.id)));
const money = (room) => roomMonthlyPrice(room, props.basePrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const occupancy = (room) => room.available_count != null ? room.available_count + ' of ' + room.capacity + ' beds available for your stay' : Number(room.occupant_count || 0) + ' of ' + room.capacity + ' occupied' + (Number(room.reserved_count || 0) ? ' \u00b7 ' + room.reserved_count + ' reserved' : '') + ' \u00b7 ' + Math.max(0,Number(room.capacity)-Number(room.occupant_count || 0)-Number(room.reserved_count || 0)) + ' available';
const selectRoom = (room) => { if (canBookRoomGender(room,props.studentGender) && !roomIsFull(room)) emit('update:modelValue', room.id); };
const clickRow = (event, room) => { if (!event.target.closest('button,input,label,a')) selectRoom(room); };
const detail = ref(null), detailDialog = ref(null), photoDialog = ref(null), photoIndex = ref(0);
watch(() => props.rooms, (rooms) => {
  if (selected.value && roomIsFull(selected.value)) emit('update:modelValue','');
  if (!detail.value) return;
  const current=rooms.find(room=>String(room.id)===String(detail.value.id));
  if (current) detail.value=current;
  else { detailDialog.value?.close(); detail.value=null; }
});
const detailPhotos = computed(() => roomList(detail.value?.photos));
const amenityGroups = computed(() => [{ title: 'Free amenities', kind: 'free', icon: 'fa-gift', items: roomList(detail.value?.amenities_free ?? detail.value?.amenities) }, { title: 'Paid amenities', kind: 'paid', icon: 'fa-coins', items: roomList(detail.value?.amenities_paid) }]);
const amenityCount = computed(() => amenityGroups.value.reduce((sum, group) => sum + group.items.length, 0));
const amenitiesOpen = ref(false);
const openDetails = async (room) => { if (!canBookRoomGender(room,props.studentGender)) return; detail.value = room; amenitiesOpen.value = true; await nextTick(); detailDialog.value.showModal(); detailDialog.value.querySelector('.room-detail-body')?.scrollTo(0,0); };
const photoZoomed = ref(false);
const openPhoto = (index) => { photoIndex.value = index; photoZoomed.value=false; photoDialog.value.showModal(); };
const stepPhoto = (direction) => { photoIndex.value=(photoIndex.value+direction+detailPhotos.value.length)%detailPhotos.value.length; photoZoomed.value=false; };
const selectDetail = () => { selectRoom(detail.value); detailDialog.value.close(); };
</script>
<template>
  <section class="room-picker" aria-labelledby="room-picker-title">
    <header class="picker-heading"><span class="picker-step">2</span><div><h2 id="room-picker-title">Choose your room</h2><p>Compare rooms, explore the details, then choose your space.</p></div></header>
    <aside class="picker-availability-note"><i class="fa-solid fa-bed" aria-hidden="true"></i><div><strong>Availability for your selected dates</strong><p>Available beds already account for active stays and approved reservations that overlap your entire stay. A reserved bed is held for those dates; it does not mean the student has moved in. Current roommate counts are separate and may change before you arrive.</p></div></aside>
    <p class="picker-gender-notice" role="status"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>{{ genderKnown ? 'Showing rooms that match your gender, including mixed/unisex rooms when offered.' : 'Choose your gender in Personal Details below to see rooms you can book.' }}<button v-if="!genderKnown" type="button" @click="emit('continue')">Set gender</button></p>
    <div v-if="genderKnown" class="picker-wings" aria-label="Room wings">
      <button v-for="tab in wings" :key="tab.key" type="button" :class="['wing-tab', tab.key, { active: wing === tab.key }]" :aria-pressed="wing === tab.key" @click="changeWing(tab.key)"><i :class="['fa-solid',tab.icon]" aria-hidden="true"></i><span>{{ tab.label }} <small>({{ tab.count }} rooms)</small></span></button>
    </div>
    <div class="picker-filters">
      <label class="picker-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="search" type="search" aria-label="Search by room number" placeholder="Search room number" /></label>
      <label class="picker-filter"><span>Floor:</span><select v-model="floor" aria-label="Filter rooms by floor"><option value="all">All</option><option v-for="value in floors" :key="value" :value="value">{{ value }}</option><option value="unspecified">Not specified</option></select></label>
      <label class="picker-filter"><span>Availability:</span><select v-model="availability" aria-label="Filter rooms by availability"><option value="all">All</option><option value="available">Available</option><option value="full">Full</option></select></label>
      <label class="picker-sort"><span>Sort by</span><select v-model="sort" aria-label="Sort rooms"><option value="number">Room number</option><option value="price-low">Rent: low to high</option><option value="price-high">Rent: high to low</option></select></label>
    </div>
    <div class="picker-results-bar"><p ref="listHeading" tabindex="-1" aria-live="polite">Showing {{ results.from }}&ndash;{{ results.to }} of {{ results.total }} rooms</p></div>
    <input v-if="selectedOffPage" type="radio" name="roomId" :value="selected.id" checked hidden tabindex="-1" aria-hidden="true" />
    <div class="picker-table-wrap">
      <table class="picker-table" aria-label="Choose your room">
        <colgroup><col class="picker-col-select"/><col class="picker-col-room"/><col class="picker-col-floor"/><col class="picker-col-occupancy"/><col class="picker-col-rent"/><col class="picker-col-action"/></colgroup>
        <thead><tr><th scope="col"><span class="sr-only">Select</span></th><th scope="col">Room number</th><th scope="col">Floor</th><th scope="col">Beds available for your stay</th><th scope="col">Monthly rent</th><th scope="col">Action</th></tr></thead>
        <tbody>
          <tr v-for="room in results.items" :key="room.id" :class="['picker-table-room',roomWing(room),{selected:String(modelValue) === String(room.id),full:roomIsFull(room)}]" @click="clickRow($event,room)">
            <td class="picker-selection-cell"><input :id="uid + '-' + room.id" type="radio" name="roomId" :value="room.id" :checked="String(modelValue) === String(room.id)" :disabled="roomIsFull(room)" required :aria-describedby="uid + '-status-' + room.id" @change="selectRoom(room)" /></td>
            <td class="picker-room-name"><label :for="uid + '-' + room.id">{{ roomTitle(room) }}</label></td>
            <td class="picker-floor-cell"><span class="picker-mobile-label">Floor: </span>{{ room.floor_label || 'Not specified' }}</td>
            <td class="picker-occupancy-cell"><span :id="uid + '-status-' + room.id" :class="['occupancy-pill',{full:roomIsFull(room)}]" :title="roommateSummary(room)"><i class="fa-solid fa-user-group" aria-hidden="true"></i><template v-if="roomIsFull(room)">{{ room.available_count != null ? 'Unavailable for selected dates' : Number(room.occupant_count || 0) >= Number(room.capacity) ? 'Full' : 'No available beds' }}</template><template v-else>{{ occupancy(room) }}</template></span><span class="sr-only">{{ roommateSummary(room) }}</span></td>
            <td class="picker-rent-cell">&#8369;{{ money(room) }}</td>
            <td class="picker-action-cell"><button type="button" class="picker-view" @click.stop="openDetails(room)"><span>View details</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!visible.length" class="picker-empty"><i class="fa-solid fa-door-open" aria-hidden="true"></i><p>{{ !genderKnown ? 'Complete your gender in Personal Details to view eligible rooms.' : wings.find(tab => tab.key === wing)?.count ? 'No rooms match your filters.' : 'No eligible rooms listed in this wing.' }}</p><button v-if="wings.find(tab => tab.key === wing)?.count" type="button" @click="search = ''; floor = 'all'; availability = 'all'">Clear filters</button></div>
    </div>
    <nav class="picker-pagination" aria-label="Room list pages">
      <label class="picker-page-size">Rows per page<select v-model.number="pageSize" aria-label="Rooms per page"><option :value="8">8</option><option :value="16">16</option><option :value="24">24</option></select></label>
      <div class="picker-page-controls"><button type="button" :disabled="results.page === 1" @click="goToPage(results.page-1)" aria-label="Previous room page"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><template v-for="(number,index) in pageNumbers" :key="number"><span v-if="index && number > pageNumbers[index-1]+1" class="picker-page-gap">&hellip;</span><button type="button" :class="{active:number === results.page}" :aria-current="number === results.page ? 'page' : undefined" :aria-label="'Room page ' + number" @click="goToPage(number)">{{ number }}</button></template><button type="button" :disabled="results.page === results.totalPages" @click="goToPage(results.page+1)" aria-label="Next room page"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button><span class="picker-page-range">{{ results.from }}&ndash;{{ results.to }} of {{ results.total }}</span></div>
    </nav>
    <footer class="picker-footer">
      <p v-if="selected">Selected: <strong>{{ roomTitle(selected) }}</strong><span> &middot; Monthly rent: &#8369;{{ money(selected) }}</span></p><p v-else>No room selected.</p>
      <div><button type="button" class="picker-secondary" :disabled="!selected" @click="openDetails(selected)"><i class="fa-regular fa-eye" aria-hidden="true"></i> View room details</button><button type="button" class="picker-primary" :disabled="!selected || roomIsFull(selected)" @click="emit('continue')">Continue <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></div>
    </footer>
  </section>
  <Teleport to="body">
    <dialog ref="detailDialog" class="room-detail-dialog" :aria-labelledby="uid + '-detail-title'" @click="event => { if (event.target === detailDialog) detailDialog.close(); }">
      <template v-if="detail">
        <header class="room-detail-heading"><div><p class="room-detail-eyebrow">Room details</p><h2 :id="uid + '-detail-title'">{{ roomTitle(detail) }}</h2></div><button type="button" @click="detailDialog.close()" aria-label="Close room details" autofocus><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></header>
        <div class="room-detail-body">
          <div v-if="detailPhotos.length" :class="['room-detail-photos', { single: detailPhotos.length === 1 }]"><button v-for="(photo,index) in detailPhotos" :key="photo" type="button" @click="openPhoto(index)" :aria-label="'Open room photo ' + (index + 1)"><img :src="getImageUrl(photo)" :alt="roomTitle(detail) + ', photo ' + (index + 1)" /><span v-if="index === 0"><i class="fa-regular fa-image" aria-hidden="true"></i>{{ detailPhotos.length }} photos</span></button></div><p v-else class="room-detail-no-photos">Room photos not provided yet.</p>
          <div class="room-detail-facts"><span><i class="fa-regular fa-building" aria-hidden="true"></i>{{ detail.floor_label || 'Floor not specified' }}</span><span :class="['occupancy-pill',{full:roomIsFull(detail)}]">{{ occupancy(detail) }}</span></div>
          <div class="room-detail-rent-card"><div><span>Monthly rent</span><p class="room-detail-price">&#8369;{{ money(detail) }}<small> / month</small></p></div><span class="room-detail-capacity"><i class="fa-solid fa-bed" aria-hidden="true"></i>{{ detail.capacity }} {{ Number(detail.capacity) === 1 ? 'bed' : 'beds' }}</span></div>
          <section class="roommate-section" aria-label="Current roommates"><h3><i class="fa-solid fa-user-group" aria-hidden="true"></i>Current roommates</h3><p>Owner-confirmed residents and manually recorded occupants, grouped by category.</p><div v-if="roommateBreakdown(detail)" class="roommate-counts"><div><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i><strong>{{ roommateBreakdown(detail).cspc }}</strong><span>CSPC occupants</span></div><div><i class="fa-solid fa-user" aria-hidden="true"></i><strong>{{ roommateBreakdown(detail).nonCspc }}</strong><span>Non-CSPC occupants</span></div></div><p v-else>Roommate details are not available yet.</p><p v-if="Number(detail.resident_count ?? detail.occupant_count ?? 0) === 0" class="roommate-empty-note">No confirmed residents are currently recorded.</p><p v-if="Number(detail.arrival_pending_count || 0)">{{ detail.arrival_pending_count }} started stay(s) awaiting arrival confirmation. Their beds remain held.</p><small>Future reservations reduce availability for overlapping dates but are not counted as current roommates. Availability is rechecked when the owner approves.</small></section>
          <section class="room-detail-description"><h3>About this room</h3><p>{{ detail.description || 'The owner has not added a room description yet.' }}</p></section>
          <section class="room-detail-section"><div class="room-detail-section-heading"><div><h3><i class="fa-solid fa-list-check" aria-hidden="true"></i> Room amenities</h3><p>{{ amenityCount }} amenities</p></div><button type="button" :aria-expanded="amenitiesOpen" @click="amenitiesOpen = !amenitiesOpen">{{ amenitiesOpen ? 'Hide amenities' : 'See all amenities' }} <i :class="['fa-solid', amenitiesOpen ? 'fa-chevron-up' : 'fa-chevron-down']" aria-hidden="true"></i></button></div><div v-if="amenitiesOpen" class="room-detail-amenities"><div v-for="group in amenityGroups" :key="group.title" :class="'amenities-' + group.kind"><h4><i :class="['fa-solid',group.icon]" aria-hidden="true"></i>{{ group.title }}<span>{{ group.items.length }}</span></h4><ul v-if="group.items.length"><li v-for="item in group.items" :key="item">{{ item }}</li></ul><p v-else>None listed.</p></div></div></section>
          <section class="room-detail-section"><h3><i class="fa-regular fa-file-lines" aria-hidden="true"></i> Room details</h3><dl class="room-detail-specs"><div><dt>Capacity</dt><dd>{{ detail.capacity }} occupants</dd></div><div v-if="detail.rules"><dt>Rules</dt><dd>{{ detail.rules }}</dd></div></dl></section>
        </div>
        <footer class="room-detail-footer"><button type="button" class="picker-primary" :disabled="roomIsFull(detail) || !canBookRoomGender(detail,studentGender)" @click="selectDetail">{{ !canBookRoomGender(detail,studentGender) ? 'Room is not eligible' : roomIsFull(detail) ? 'No available beds' : 'Select this room' }}</button></footer>
      </template>
    </dialog>
    <dialog ref="photoDialog" class="picker-photo-dialog" aria-label="Room photo viewer" @keydown.left.prevent="stepPhoto(-1)" @keydown.right.prevent="stepPhoto(1)"><header><span>Photo {{ photoIndex + 1 }} of {{ detailPhotos.length }}</span><div class="picker-photo-tools"><button type="button" @click="photoZoomed = !photoZoomed">{{ photoZoomed ? 'Fit to screen' : 'Zoom in' }}</button><button type="button" @click="photoDialog.close()">Close</button></div></header><div :class="['picker-photo-stage',{zoomed:photoZoomed}]"><img v-if="detailPhotos.length" :src="getImageUrl(detailPhotos[photoIndex])" :alt="'Room photo ' + (photoIndex + 1)" /></div><footer v-if="detailPhotos.length > 1"><button type="button" @click="stepPhoto(-1)">Previous</button><button type="button" @click="stepPhoto(1)">Next</button></footer></dialog>
  </Teleport>
</template>
<style scoped>
.picker-availability-note{display:flex;align-items:flex-start;gap:10px;margin:0 32px 14px;padding:12px 14px;border:1px solid #dce8fa;border-radius:10px;background:#f0f6ff;color:#344e70;font-size:12px;line-height:1.6;}.picker-availability-note>i{color:#2563eb;margin-top:3px;}.picker-availability-note strong{color:#193c6b;font-weight:700;}.picker-availability-note p{margin:3px 0 0;}@media(max-width:760px){.picker-availability-note{margin:0 20px 14px;}}
.room-picker { background:#fff; border:1px solid #e7edf5; border-radius:24px; overflow:hidden; box-shadow:0 2px 6px rgb(15 23 42 / .03); }
.picker-heading { display:flex; align-items:center; gap:18px; padding:28px 28px 24px; }
.picker-step { width:46px; height:46px; border-radius:50%; background:#1256f5; color:white; display:grid; place-items:center; font-size:20px; font-weight:800; box-shadow:0 4px 8px #dbeafe; flex-shrink:0; }
.picker-heading h2 { color:#0f172a; font-size:21px; font-weight:800; text-transform:uppercase; line-height:1.3; }
.picker-heading p { color:#71809c; font-size:15px; margin-top:4px; }
.picker-wings { display:flex; margin:0 28px; border:1px solid #e3e8f1; border-radius:12px; background:#f5f7fb; overflow:hidden; }
.wing-tab { display:flex; flex:1; align-items:center; justify-content:center; gap:14px; padding:19px 12px; font-size:17px; font-weight:700; color:#526580; border-bottom:3px solid transparent; }
.wing-tab i { font-size:24px; color:#1256f5; }.wing-tab small { font-size:14px; font-weight:400; white-space:nowrap; }
.wing-tab.female.active { color:#ec1687; background:#fff5fa; border-color:#ec1687; }.wing-tab.female.active i {color:#ec1687;}.wing-tab.male.active,.wing-tab.other.active {color:#1256f5;background:#eff6ff;border-color:#1256f5;}
.picker-filters { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr); gap:14px; margin:25px 28px; }
.picker-search,.picker-filter { display:flex; align-items:center; gap:10px; border:1px solid #ccd5e3; border-radius:10px; padding:12px; min-width:0; color:#526580; font-size:13px; }
.picker-search input { width:100%; min-width:0; border:0; outline:0; background:transparent; font-size:13px; }.picker-filter select { min-width:0; width:100%; border:0; padding:0 18px 0 0; background-color:transparent; font-size:13px; }.picker-filter span {flex-shrink:0;}
.picker-search:focus-within,.picker-filter:focus-within {outline:2px solid #93c5fd;outline-offset:2px;}
.picker-room-list { padding:0 28px 28px; display:grid; gap:16px; min-height:220px; align-content:start; }
.picker-room { display:grid; grid-template-columns:24px minmax(0,1.2fr) minmax(0,1.3fr) auto; align-items:center; gap:18px; padding:23px 20px; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; box-shadow:0 2px 5px rgb(15 23 42 / .025); }
.picker-room.selected {border-color:#2681ff;background:#f0f7ff;box-shadow:0 0 0 1px #2681ff;}.picker-room.full {background:#f8fafc;cursor:default;}.picker-room input {width:23px;height:23px;accent-color:#1256f5;}.picker-room-identity label {font-size:18px;font-weight:750;color:#0f172a;cursor:inherit;}.picker-room-identity p {display:flex;align-items:center;gap:9px;font-size:13px;color:#71809c;margin-top:7px;}.picker-room-pricing {border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:0 18px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;}.picker-room-pricing strong {font-size:20px;font-weight:800;color:#1256f5;white-space:nowrap;}
.occupancy-pill {display:inline-flex;align-items:center;gap:7px;background:#e7f8ee;color:#00864e;border:1px solid #c8eedc;border-radius:999px;padding:6px 11px;font-size:11px;font-weight:700;white-space:nowrap;}.occupancy-pill.full {background:#fff1f2;color:#be123c;border-color:#fecdd3;}
.picker-view {display:flex;align-items:center;gap:10px;color:#1256f5;font-size:13px;font-weight:600;white-space:nowrap;text-decoration:none;}
.picker-empty {padding:40px 15px;text-align:center;color:#71809c;}.picker-empty i {font-size:26px;margin-bottom:12px;}.picker-empty button {margin-top:10px;color:#1256f5;text-decoration:underline;}
.picker-footer {display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 28px;border-top:1px solid #edf0f5;background:#fcfdff;}.picker-footer p {font-size:13px;color:#526580;}.picker-footer p strong {color:#0f172a;}.picker-footer p span {color:#1256f5;font-weight:700;}.picker-footer>div {display:flex;gap:12px;flex-shrink:0;}
.picker-primary,.picker-secondary {display:inline-flex;align-items:center;justify-content:center;gap:12px;padding:13px 18px;border-radius:10px;font-size:13px;font-weight:650;}.picker-primary {background:#1256f5;color:white;border:1px solid #1256f5;}.picker-secondary {background:white;border:1px solid #cbd5e1;color:#526580;}button:disabled {opacity:.5;cursor:not-allowed;}button:focus-visible {outline:3px solid #93c5fd;outline-offset:3px;}
.room-detail-dialog {margin:auto;overflow:auto;width:min(600px,94vw);max-height:92dvh;padding:0;border:1px solid #e2e8f0;border-radius:18px;background:white;color:#0f172a;}.room-detail-dialog::backdrop,.picker-photo-dialog::backdrop {background:rgb(15 23 42 / .5);}.room-detail-heading {display:flex;justify-content:space-between;align-items:center;padding:22px 24px 18px;}.room-detail-heading h2 {font-size:23px;font-weight:750;}.room-detail-heading button {font-size:24px;color:#526580;padding:4px 8px;}.room-detail-body {padding:0 24px;}.room-detail-photos {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}.room-detail-photos.single {grid-template-columns:1fr;}.room-detail-photos button {position:relative;min-width:0;}.room-detail-photos img {height:205px;width:100%;object-fit:cover;border-radius:12px;}.room-detail-photos span {position:absolute;bottom:12px;right:10px;display:flex;gap:7px;align-items:center;background:rgb(15 23 42 / .75);color:white;padding:7px 10px;border-radius:20px;font-size:12px;}.room-detail-no-photos {padding:45px 15px;background:#f1f5f9;border-radius:12px;text-align:center;font-size:14px;color:#64748b;}.room-detail-facts {display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px;}.room-detail-facts>span:first-child {display:flex;align-items:center;gap:10px;color:#71809c;font-size:14px;}.room-detail-price {color:#1256f5;font-size:27px;font-weight:800;margin:12px 0 20px;}.room-detail-section {border-top:1px solid #e8edf3;padding:20px 0;}.room-detail-section h3 {font-size:16px;font-weight:700;display:flex;gap:12px;align-items:center;}.room-detail-section h3 i {color:#526580;}.room-detail-section-heading {display:flex;align-items:center;justify-content:space-between;gap:12px;}.room-detail-section-heading p {font-size:13px;color:#71809c;margin:5px 0 0 28px;}.room-detail-section-heading button {font-size:13px;color:#1256f5;text-decoration:underline;white-space:nowrap;}.room-detail-section-heading button i {margin-left:8px;}.room-detail-amenities {display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px;}.room-detail-amenities h4 {font-size:13px;font-weight:700;margin-bottom:8px;}.room-detail-amenities ul {display:flex;flex-wrap:wrap;gap:6px;}.room-detail-amenities li {font-size:12px;padding:5px 8px;border-radius:6px;background:#f1f5f9;}.room-detail-amenities p {font-size:13px;color:#71809c;}.room-detail-specs {margin:14px 0 0 28px;font-size:13px;}.room-detail-specs>div {display:grid;grid-template-columns:110px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid #edf0f5;}.room-detail-specs dt {color:#71809c;}.room-detail-specs dd {overflow-wrap:anywhere;}.room-detail-footer {position:sticky;bottom:0;background:white;border-top:1px solid #e8edf3;padding:16px 24px;}.room-detail-footer button {width:100%;font-size:15px;}
.picker-photo-dialog {margin:auto;overflow:auto;width:min(1000px,94vw);padding:0;background:#0f172a;color:white;border:0;border-radius:12px;}.picker-photo-dialog header,.picker-photo-dialog footer {display:flex;align-items:center;justify-content:space-between;padding:15px 20px;font-size:14px;}.picker-photo-dialog button {padding:6px 12px;border:1px solid #64748b;border-radius:6px;}.picker-photo-dialog img {width:100%;height:68dvh;object-fit:contain;}
@media(max-width:760px){.picker-heading {padding:22px 20px;}.picker-wings{margin:0 20px;}.wing-tab{font-size:14px;gap:8px;padding:15px 8px;}.wing-tab small{font-size:12px;}.picker-filters{margin:20px;grid-template-columns:1fr 1fr;gap:10px;}.picker-search{grid-column:1/-1;}.picker-room-list{padding:0 20px 22px;}.picker-room{grid-template-columns:23px minmax(0,1fr) auto;padding:18px 14px;gap:12px;}.picker-room input{grid-row:1/3;}.picker-room-identity{grid-column:2;}.picker-room-pricing{grid-row:2;grid-column:2/4;border:0;padding:0;flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px;}.picker-view{grid-row:1;grid-column:3;}.picker-footer{padding:18px 20px;flex-wrap:wrap;}.picker-footer>div{width:100%;}.picker-footer>div button{flex:1;}.picker-room-pricing strong{font-size:18px;}}
@media(max-width:430px){.picker-heading h2{font-size:18px;}.picker-step{width:38px;height:38px;}.wing-tab i{font-size:19px;}.wing-tab span{display:flex;flex-direction:column;gap:2px;}.picker-filter{font-size:12px;padding:10px 8px;gap:5px;}.picker-filter select{font-size:12px;}.picker-room-identity label{font-size:16px;}.picker-room-identity p{font-size:12px;}.picker-view{font-size:12px;gap:6px;}.occupancy-pill{font-size:10px;}.picker-secondary,.picker-primary{font-size:12px;padding:12px;}.room-detail-body{padding:0 18px;}.room-detail-heading{padding:18px;}.room-detail-photos img{height:155px;}.room-detail-price{font-size:23px;}.room-detail-section-heading{align-items:flex-start;}.room-detail-section-heading button{font-size:11px;}.room-detail-facts{gap:10px;}.room-detail-amenities{grid-template-columns:1fr;}}

/* Bounded room lists and a focused, independently scrolling details dialog. */
.picker-heading h2{text-transform:none;font-size:22px;}
.picker-heading p{font-size:13px;color:#526580;}
.picker-filters{margin-bottom:14px;}
.picker-results-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 28px 14px;font-size:12px;color:#526580;}
.picker-results-bar strong{color:#193b65;}
.picker-results-bar label{display:flex;align-items:center;gap:8px;}
.picker-results-bar select{border:1px solid #dce5f1;border-radius:8px;background:#fff;padding:8px 28px 8px 10px;font-size:12px;color:#334c68;}
.picker-room{padding:18px;gap:16px;transition:border-color 160ms ease,background-color 160ms ease,box-shadow 160ms ease;}
.picker-room:not(.full):hover{border-color:#93b9f4;background:#f8fbff;}
.picker-room.selected:not(.full):hover{background:#eff6ff;}
.picker-room-identity label{font-size:17px;}
.picker-room-identity p{font-size:12px;color:#526580;margin-top:5px;}
.picker-room-meta{display:block;font-size:11px;color:#526580;margin-top:5px;}
.picker-room-pricing strong{font-size:18px;}
.occupancy-pill{white-space:normal;line-height:1.5;}
.picker-room-list{gap:12px;min-height:0;padding-bottom:18px;}
.picker-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 28px 20px;font-size:12px;color:#526580;}
.picker-pagination>div{display:flex;gap:8px;}
.picker-pagination button{display:inline-flex;align-items:center;gap:8px;border:1px solid #dce5f1;background:#fff;border-radius:8px;padding:8px 12px;color:#2453a2;font-weight:600;min-height:36px;}
.picker-pagination button:hover:not(:disabled){background:#eff6ff;border-color:#93b9f4;}
.picker-footer{background:#f8fbff;}
.picker-footer>div{flex-wrap:wrap;}
.room-detail-dialog{width:min(760px,calc(100vw - 32px));max-height:calc(100dvh - 40px);height:min(850px,calc(100dvh - 40px));overflow:clip;border:0;border-radius:20px;box-shadow:0 24px 80px rgb(15 23 42 / .2);}
.room-detail-dialog[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto;}
.room-detail-heading{padding:20px 24px;border-bottom:1px solid #e8eef6;gap:16px;}
.room-detail-eyebrow{font-size:11px;font-weight:650;color:#526580;margin-bottom:3px;}
.room-detail-heading h2{font-size:24px;}
.room-detail-heading>button{display:grid;place-items:center;width:36px;height:36px;border:1px solid #dce5f1;border-radius:10px;font-size:18px;background:#f8fbff;flex-shrink:0;}
.room-detail-body{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:20px 24px 0;}
.room-detail-photos{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;}
.room-detail-photos button:first-child{grid-column:1/-1;}
.room-detail-photos img{height:76px;border-radius:10px;}
.room-detail-photos button:first-child img{height:275px;}
.room-detail-photos button:hover img{filter:brightness(.96);}
.room-detail-photos span{font-size:11px;padding:6px 10px;}
.room-detail-facts>span:first-child{color:#46617f;}
.room-detail-rent-card{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:18px 0 22px;padding:18px 20px;background:#eff6ff;border:1px solid #dbeafe;border-radius:13px;}
.room-detail-rent-card>div>span{font-size:12px;color:#526580;}
.room-detail-price{font-size:28px;margin:4px 0 0;line-height:1.3;}
.room-detail-price small{font-size:13px;font-weight:500;color:#46617f;white-space:nowrap;}
.room-detail-capacity{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650;color:#2453a2;white-space:nowrap;}
.room-detail-description{padding-bottom:22px;}
.room-detail-description h3{font-size:15px;font-weight:700;color:#193b65;}
.room-detail-description p{font-size:13px;line-height:1.8;color:#46617f;white-space:pre-line;overflow-wrap:anywhere;margin-top:8px;}
.room-detail-section h3{font-size:15px;color:#193b65;}
.room-detail-section h3 i{color:#2563eb;}
.room-detail-amenities>div{border:1px solid #e2eaf5;border-radius:12px;padding:14px;background:#fbfdff;}
.room-detail-amenities h4{display:flex;align-items:center;gap:8px;color:#193b65;margin-bottom:12px;}
.room-detail-amenities h4>i{color:#2563eb;}
.room-detail-amenities h4>span{margin-left:auto;background:#e7efff;color:#2453a2;padding:2px 7px;border-radius:999px;font-size:11px;}
.room-detail-amenities li{background:white;border:1px solid #dce5f1;color:#334c68;font-size:12px;}
.room-detail-specs{margin-left:0;}
.room-detail-specs dt{color:#526580;}
.room-detail-specs dd{white-space:pre-line;color:#334c68;}
.room-detail-footer{position:static;padding:14px 24px;background:#f8fbff;}
.room-detail-footer button{font-size:13px;min-height:44px;}
.picker-photo-tools{display:flex;gap:8px;}
.picker-photo-stage{max-height:72dvh;overflow:auto;}
.picker-photo-stage.zoomed img{height:auto;width:auto;max-width:none;min-width:100%;}
button{cursor:pointer;transition:background-color 160ms ease,color 160ms ease,border-color 160ms ease,box-shadow 160ms ease;}
.picker-primary:hover:not(:disabled){background:#1d4ed8;border-color:#1d4ed8;}
.picker-secondary:hover:not(:disabled){background:#eff6ff;}
@media(max-width:760px){.picker-results-bar{margin:0 20px 14px;flex-wrap:wrap;}.picker-pagination{padding:0 20px 18px;}.picker-room{padding:16px 14px;}.picker-room-pricing strong{font-size:17px;}.room-detail-photos button:first-child img{height:230px;}}
@media(max-width:430px){.room-detail-dialog{width:calc(100vw - 20px);height:calc(100dvh - 24px);max-height:calc(100dvh - 24px);border-radius:16px;}.room-detail-body{padding:16px 16px 0;}.room-detail-heading{padding:16px;}.room-detail-photos button:first-child img{height:195px;}.room-detail-photos img{height:50px;}.room-detail-rent-card{padding:14px;flex-wrap:wrap;gap:10px;}.room-detail-price{font-size:24px;}.room-detail-footer{padding:12px 16px;}.picker-pagination{flex-wrap:wrap;}.picker-footer>div{flex-wrap:wrap;}.picker-results-bar label{width:100%;justify-content:space-between;}}
@media(pointer:coarse){.picker-pagination button,.picker-view,.room-detail-heading>button{min-height:44px;}.picker-photo-dialog button{min-height:44px;}}
@media(prefers-reduced-motion:reduce){button,.picker-room{transition:none;}}

.picker-room-identity .picker-roommate-summary{font-size:11px;color:#334c68;align-items:flex-start;gap:7px;line-height:1.6;}
.picker-roommate-summary i{color:#527bb6;margin-top:3px;flex-shrink:0;}
.roommate-section{padding:0 0 22px;}
.roommate-section h3{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:700;color:#193b65;}
.roommate-section h3 i{color:#2563eb;}
.roommate-section>p{font-size:12px;line-height:1.7;color:#46617f;margin-top:7px;}
.roommate-counts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0;}
.roommate-counts>div{display:grid;grid-template-columns:26px auto;align-items:center;gap:4px 9px;padding:14px;border:1px solid #dce7f5;border-radius:12px;background:#f8fbff;}
.roommate-counts i{grid-row:1/3;color:#2563eb;font-size:19px;}
.roommate-counts strong{font-size:20px;font-weight:750;color:#193b65;}
.roommate-counts span{font-size:12px;color:#46617f;}
.roommate-section small{display:block;font-size:11px;line-height:1.7;color:#526580;}
@media(max-width:370px){.roommate-counts{grid-template-columns:1fr;}}

/* Reference room picker: shared table grid, compact rows and aligned controls. */
.room-picker{border-radius:24px;border:1px solid #e3ebf5;box-shadow:0 8px 26px rgb(38 73 120 / .055);}
.picker-heading{padding:30px 32px 26px;gap:24px;}
.picker-step{width:64px;height:64px;font-size:28px;background:#0657ff;box-shadow:0 4px 10px rgb(6 87 255 / .14);}
.picker-heading h2{font-size:32px;font-weight:800;letter-spacing:-.025em;line-height:1.25;color:#081b4d;}
.picker-heading p{font-size:17px;color:#617da7;margin-top:5px;}
.picker-wings{margin:0 32px;border-color:#e0e8f4;background:#f2f6fb;border-radius:11px;}
.wing-tab{min-height:70px;padding:15px 18px;font-size:22px;gap:20px;line-height:1.35;}
.wing-tab i{font-size:30px;color:#0657ff;}
.wing-tab small{font-size:17px;}
.wing-tab.female.active{background:#fff3fa;color:#f0088d;border-bottom-color:#ff098e;}
.wing-tab.female.active i{color:#ff098e;}
.picker-filters{grid-template-columns:minmax(220px,1.5fr) minmax(145px,.95fr) minmax(180px,1.05fr) minmax(185px,1fr);gap:18px;margin:24px 32px 20px;}
.picker-search,.picker-filter,.picker-sort{display:flex;align-items:center;gap:14px;min-width:0;padding:14px 15px;border:1px solid #dfe7f3;border-radius:10px;background:#fff;color:#506f9b;font-size:15px;box-shadow:0 1px 3px rgb(25 59 101 / .035);min-height:52px;}
.picker-search i{font-size:17px;}
.picker-search input{font-size:15px;color:#334f78;}
.picker-search input::placeholder{color:#8ba1be;}
.picker-filter select,.picker-sort select{flex:1;width:100%;min-width:0;font-size:15px;border:0;background-color:transparent;padding:0 22px 0 0;color:#506f9b;}
.picker-sort>span{flex-shrink:0;}
.picker-sort:focus-within{outline:2px solid #93c5fd;outline-offset:2px;}
.picker-results-bar{margin:0 32px 15px;font-size:15px;line-height:1.6;color:#506f9b;}
.picker-table-wrap{margin:0 32px;border:1px solid #e4ebf5;border-radius:11px;overflow:hidden;}
.picker-table{border-collapse:collapse;table-layout:fixed;width:100%;text-align:left;}
.picker-col-select{width:6%;}.picker-col-room{width:18%;}.picker-col-floor{width:17%;}.picker-col-occupancy{width:29%;}.picker-col-rent{width:17%;}.picker-col-action{width:13%;}
.picker-table th{background:#f1f6fb;color:#5e7aa3;font-size:15px;font-weight:700;padding:16px 12px;border-bottom:1px solid #e3eaf4;line-height:1.4;}
.picker-table td{padding:12px;vertical-align:middle;border-bottom:1px solid #e3eaf4;height:54px;font-size:15px;}
.picker-table tbody tr:last-child td{border-bottom:0;}
.picker-table-room{cursor:pointer;transition:background-color 160ms ease;}
.picker-table-room:hover{background:#f8fbff;}
.picker-table-room.selected{background:#edf5ff;box-shadow:inset 3px 0 #0657ff;}
.picker-selection-cell{text-align:center;}
.picker-selection-cell input{width:25px;height:25px;accent-color:#0657ff;vertical-align:middle;cursor:pointer;}
.picker-room-name label{font-size:16px;font-weight:750;color:#081b4d;cursor:pointer;overflow-wrap:anywhere;}
.picker-floor-cell{color:#617da7;overflow-wrap:anywhere;}
.picker-occupancy-cell .occupancy-pill{font-size:14px;line-height:1.4;font-weight:650;padding:6px 15px;gap:12px;background:#e2f8ed;border:1px solid #d1f2e3;color:#009c69;}
.picker-occupancy-cell .occupancy-pill>i{font-size:18px;}
.picker-rent-cell{font-size:18px !important;font-weight:800;color:#0657ff;line-height:1.4;overflow-wrap:anywhere;}
.picker-rent-cell span{white-space:nowrap;}
.picker-action-cell .picker-view{font-size:15px;font-weight:500;color:#0657ff;gap:15px;}
.picker-table-room.full{background:#f8fafd;cursor:default;}
.picker-table-room.full :is(.picker-room-name label,.picker-floor-cell,.picker-rent-cell,.picker-view){color:#8b9fbf;}
.picker-table-room.full .picker-occupancy-cell .occupancy-pill{color:#738baa;background:#edf1f6;border-color:#e1e7f0;}
.picker-table-room.full .picker-room-name label{cursor:default;}
.picker-table-room.full .picker-view:hover{color:#526f9b;}
.picker-mobile-label{display:none;}
.picker-pagination{padding:20px 32px;gap:18px;color:#617da7;font-size:15px;}
.picker-page-size{display:flex;align-items:center;gap:18px;white-space:nowrap;}
.picker-page-size select{border:1px solid #e1e9f4;border-radius:9px;padding:11px 30px 11px 14px;min-width:86px;background-color:white;color:#506f9b;font-size:15px;}
.picker-page-controls{display:flex;align-items:center;gap:12px;}
.picker-page-controls button{width:44px;min-height:44px;padding:9px;justify-content:center;border-radius:9px;border-color:#e2eaf5;font-size:16px;color:#526f9b;}
.picker-page-controls button.active{background:#0657ff;border-color:#0657ff;color:white;box-shadow:0 3px 8px rgb(6 87 255 / .12);}
.picker-page-controls button.active:hover{background:#1d4ed8;}
.picker-page-controls button:last-of-type:not(:disabled){color:#0657ff;}
.picker-page-range{margin-left:22px;white-space:nowrap;}
.picker-page-gap{padding:0 2px;}
.picker-footer{background:#f5faff;padding:20px 32px;border-top:1px solid #e5edf8;gap:20px;}
.picker-footer p{font-size:15px;color:#46658f;}
.picker-footer>div{gap:24px;}
.picker-footer .picker-secondary,.picker-footer .picker-primary{font-size:15px;min-height:56px;padding:14px 26px;border-radius:10px;}
.picker-footer .picker-primary{min-width:185px;background:#0657ff;border-color:#0657ff;}
.picker-footer .picker-primary:disabled{opacity:1;background:#80aaff;border-color:#80aaff;}
.picker-footer .picker-secondary:disabled{opacity:1;color:#9cafcb;border-color:#e0e8f4;background:#f8fbff;}
@media(max-width:1200px) and (min-width:761px){.picker-filters{grid-template-columns:1.3fr 1fr 1fr 1fr;gap:10px;}.picker-search,.picker-filter,.picker-sort{font-size:12px;padding:12px 10px;gap:8px;}.picker-filter select,.picker-sort select,.picker-search input{font-size:12px;}.picker-table th,.picker-table td{padding:12px 8px;font-size:12px;}.picker-room-name label{font-size:13px;}.picker-occupancy-cell .occupancy-pill{font-size:11px;padding:6px 9px;gap:6px;}.picker-occupancy-cell .occupancy-pill>i{font-size:14px;}.picker-rent-cell{font-size:14px !important;}.picker-action-cell .picker-view{font-size:12px;gap:7px;}}
@media(max-width:760px){.picker-heading{padding:22px 20px;gap:14px;}.picker-heading h2{font-size:23px;}.picker-heading p{font-size:13px;}.picker-step{width:46px;height:46px;font-size:21px;}.picker-wings{margin:0 20px;}.wing-tab{min-height:62px;font-size:16px;gap:12px;padding:12px 8px;}.wing-tab i{font-size:24px;}.wing-tab small{font-size:12px;}.picker-filters{grid-template-columns:1fr 1fr;margin:20px;gap:10px;}.picker-search{grid-column:1/-1;}.picker-sort{grid-column:1/-1;}.picker-filter,.picker-sort,.picker-search{font-size:13px;min-height:44px;padding:10px 12px;}.picker-filter select,.picker-sort select,.picker-search input{font-size:13px;}.picker-results-bar{margin:0 20px 12px;font-size:12px;}.picker-table-wrap{margin:0 20px;border:0;overflow:visible;}.picker-table,.picker-table tbody{display:block;}.picker-table colgroup,.picker-table thead{display:none;}.picker-table tbody{display:grid;gap:12px;}.picker-table-room{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px 12px;border:1px solid #e2eaf5;border-radius:11px;padding:14px;}.picker-table td{display:block;border:0;padding:0;height:auto;}.picker-selection-cell{grid-column:1;grid-row:1/4;align-self:center;}.picker-selection-cell input{width:22px;height:22px;}.picker-room-name{grid-column:2;grid-row:1;}.picker-room-name label{font-size:15px;}.picker-floor-cell{grid-column:2;grid-row:2;font-size:12px !important;}.picker-mobile-label{display:inline;}.picker-occupancy-cell{grid-column:2/-1;grid-row:3;}.picker-occupancy-cell .occupancy-pill{font-size:11px;padding:5px 9px;gap:7px;}.picker-occupancy-cell .occupancy-pill>i{font-size:14px;}.picker-rent-cell{grid-column:2/-1;grid-row:4;font-size:17px !important;}.picker-action-cell{grid-column:3;grid-row:1/3;align-self:center;}.picker-action-cell .picker-view{font-size:12px;gap:7px;min-height:44px;}.picker-pagination{padding:18px 20px;flex-wrap:wrap;gap:14px;}.picker-page-size{font-size:12px;gap:12px;}.picker-page-size select{font-size:12px;padding:8px 26px 8px 12px;}.picker-page-controls{gap:7px !important;flex-wrap:wrap;}.picker-page-controls button{width:36px;min-height:38px;font-size:13px;padding:7px;}.picker-page-range{font-size:12px;margin-left:7px;}.picker-footer{padding:18px 20px;}.picker-footer p{font-size:13px;}.picker-footer>div{gap:10px;}.picker-footer .picker-primary,.picker-footer .picker-secondary{font-size:12px;min-height:44px;min-width:0;padding:11px 14px;}}
@media(max-width:430px){.wing-tab span{display:flex;flex-direction:column;gap:2px;}.picker-heading h2{font-size:20px;}.picker-heading p{font-size:12px;}.picker-footer>div{flex-wrap:wrap;}.picker-footer>div>button{flex:1;}.picker-page-controls{width:100%;}.picker-page-range{margin-left:auto;}.picker-table-room{gap:8px;}}
@media(prefers-reduced-motion:reduce){.picker-table-room{transition:none;}}

/* Keep the room step at the same heading scale as Schedule and Personal Details. */
.room-picker .picker-heading{gap:12px;align-items:flex-start;}
.room-picker .picker-step{width:32px;height:32px;font-size:14px;font-weight:700;box-shadow:0 4px 6px rgb(219 234 254 / .5);}
.room-picker .picker-heading h2{font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;line-height:32px;color:#0f172a;}
.room-picker .picker-heading p{font-size:12px;line-height:1.6;margin-top:2px;}

.picker-table-room.female:not(.full):hover{background:#fff5fa;}
.picker-table-room.female.selected{background:#fff0f7;box-shadow:inset 3px 0 #ec1687;}
.picker-table-room.female.selected:not(.full):hover{background:#ffe8f3;}
.picker-table-room.female input[type=radio]{accent-color:#ec1687;}
.picker-table-room.female input[type=radio]:focus-visible{outline:3px solid #f9a8d4;outline-offset:3px;}
.room-detail-amenities .amenities-free h4>i{color:#22c55e;}
.room-detail-amenities .amenities-paid h4>i{color:#f97316;}

.picker-gender-notice{display:flex;align-items:flex-start;gap:8px;margin:-10px 32px 20px;color:#526b89;font-size:12px;line-height:1.7;}
.picker-gender-notice>i{color:#2563eb;margin-top:4px;flex-shrink:0;}
@media(max-width:760px){.picker-gender-notice{margin:-6px 20px 18px;}}
.picker-gender-notice button{color:#2563eb;font-weight:650;text-decoration:underline;text-underline-offset:3px;white-space:nowrap;}
.picker-view>span{text-decoration:underline;text-underline-offset:3px;}

/* Compact controls keep actions proportional to the room table. */
.room-picker .wing-tab{min-height:48px;padding:10px 14px;font-size:17px;gap:12px;}
.room-picker .wing-tab i{font-size:24px;}
.room-picker .wing-tab small{font-size:13px;}
.room-picker .picker-filters{gap:12px;margin-top:18px;margin-bottom:16px;grid-template-columns:minmax(0,1.35fr) minmax(0,.85fr) minmax(0,1fr) minmax(180px,1.1fr);}
.room-picker :is(.picker-search,.picker-filter,.picker-sort){min-height:40px;padding:8px 12px;font-size:12px;gap:8px;border-radius:8px;}
.room-picker :is(.picker-search input,.picker-filter select,.picker-sort select){font-size:12px;line-height:1.5;}
.room-picker .picker-search i{font-size:14px;}
.room-picker .picker-results-bar{font-size:12px;margin-bottom:12px;}
.room-picker .picker-pagination{padding-top:16px;padding-bottom:16px;font-size:12px;}
.room-picker .picker-page-size{gap:12px;}
.room-picker .picker-page-size select{min-width:65px;min-height:34px;padding:6px 24px 6px 10px;font-size:12px;border-radius:7px;}
.room-picker .picker-page-controls{gap:8px;}
.room-picker .picker-page-controls button{width:34px;min-height:34px;padding:7px;font-size:13px;border-radius:7px;}
.room-picker .picker-page-range{margin-left:12px;font-size:12px;}
.room-picker .picker-footer{padding-top:16px;padding-bottom:16px;gap:14px;flex-wrap:wrap;}
.room-picker .picker-footer p{font-size:12px;}
.room-picker .picker-footer>div{gap:10px;margin-left:auto;}
.room-picker .picker-footer :is(.picker-primary,.picker-secondary){min-height:38px;min-width:0;padding:9px 15px;font-size:12px;gap:9px;border-radius:8px;}
@media(min-width:761px) and (max-width:980px){.room-picker .picker-filters{grid-template-columns:1fr 1fr;}}
@media(max-width:760px){.room-picker .picker-filters{grid-template-columns:1fr 1fr;gap:10px;}.room-picker .picker-search,.room-picker .picker-sort{grid-column:1/-1;}.room-picker .wing-tab{font-size:15px;gap:8px;}.room-picker .wing-tab i{font-size:21px;}.room-picker .wing-tab small{font-size:12px;}}
@media(pointer:coarse){.room-picker :is(.picker-search,.picker-filter,.picker-sort),.room-picker .picker-page-controls button,.room-picker .picker-page-size select,.room-picker .picker-footer :is(.picker-primary,.picker-secondary){min-height:44px;}.room-picker .picker-page-controls button{width:40px;}}
</style>
