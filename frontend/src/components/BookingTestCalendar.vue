<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

// Test calendar: moves booking time forward (deadlines, automatic starts) and shows each booking's key dates.
// Test sessions save a copy of all data first, so everything done while testing can be restored afterwards.
const manualRecords=ref([]),chosenManualRecords=ref([]),manualResetAck=ref(false),manualResetError=ref('');
async function loadManualRecords(){try{const {data}=await axios.get('/api/testing/manual-test-records',auth());manualRecords.value=data.records||[];manualResetError.value='';chosenManualRecords.value=chosenManualRecords.value.filter(id=>manualRecords.value.some(r=>r.id===id));}catch{manualResetError.value='Could not load manual test records. Reload after updating the backend.';}}
async function clearManualRecords(){if(busy.value || !manualResetAck.value || !chosenManualRecords.value.length)return;busy.value=true;notify('');try{const {data}=await axios.post('/api/testing/reset-manual-records',{occupantIds:chosenManualRecords.value,confirmed:true},auth());chosenManualRecords.value=[];manualResetAck.value=false;notify(data.message+' Refresh Bookings, Room Details and the student booking page.','success');await loadManualRecords();await loadEvents();}catch(e){notify(e.response?.data?.message||'Could not clear selected manual test records.','error')}finally{busy.value=false}}
const resetStudents=ref([]),chosenStudents=ref([]),resetAck=ref(false),resetTime=ref(''),manualStudentIds=ref('');
async function loadResetStudents(){try{const {data}=await axios.get('/api/testing/test-students',auth());let saved=[];try{saved=JSON.parse(sessionStorage.getItem('cspc_test_students')||'[]')}catch{}resetStudents.value=[...new Map([...saved,...(data.students||[])].map(s=>[s.id,s])).values()];sessionStorage.setItem('cspc_test_students',JSON.stringify(resetStudents.value));}catch{}}
async function cleanRestart(){if(busy.value || !resetAck.value)return;busy.value=true;notify('');try{const ids=[...new Set([...chosenStudents.value,...manualStudentIds.value.split(',').map(s=>s.trim()).filter(Boolean).map(Number)])];const date=new Date(resetTime.value+':00+08:00');if(!Number.isFinite(date.getTime()))throw Error('Choose the scenario starting date and time.');const {data}=await axios.post('/api/testing/reset-students',{studentIds:ids,now:date.toISOString(),confirmed:true},auth());notify(data.message+' Test time is now '+stamp(new Date(data.now))+'. Submit new bookings only after refreshing all role pages.','success');resetAck.value=false;viewMonth.value='';selected.value='';await refresh();}catch(e){notify(e.response?.data?.message||e.message||'Could not restart tests.','error')}finally{busy.value=false}}
const PHT = 'Asia/Manila';
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const auth = () => ({ headers: { Authorization: 'Bearer ' + sessionStorage.getItem('cspc_token') } });
const state = ref(null), loading = ref(true), busy = ref(false), message = ref(''), tone = ref('info');
const events = ref([]), viewMonth = ref(''), selected = ref(''), time = ref('09:00'), confirmRestore = ref(false);
const ack = ref((() => { try { return sessionStorage.getItem('cspc_clock_ack') === '1'; } catch { return false; } })());

const dayOf = date => new Intl.DateTimeFormat('en-CA', { timeZone: PHT, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const stamp = (date, opts = {}) => date.toLocaleString('en-US', { timeZone: PHT, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', ...opts });
const clockTime = (date) => date.toLocaleTimeString('en-US', { timeZone: PHT, hour: 'numeric', minute: '2-digit' });
const longDay = day => new Date(day + 'T12:00:00+08:00').toLocaleDateString('en-US', { timeZone: PHT, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const now = computed(() => state.value ? new Date(state.value.now) : new Date());
const today = computed(() => dayOf(now.value));
const monthLabel = computed(() => viewMonth.value ? new Date(viewMonth.value + '-15T12:00:00+08:00').toLocaleDateString('en-US', { timeZone: PHT, month: 'long', year: 'numeric' }) : '');

const TYPES = {
  renewal_wait: {label:'Renewal decision due',jump:'Jump to 1 minute after'},
  renewal_decision: {label:'Resident renewal deadline',jump:'Jump to 1 minute after'},
  owner_deadline: { label: 'Owner deadline', jump: 'Jump to 1 minute after' },
  payment_deadline: { label: 'Pay by', jump: 'Jump to 1 minute after' },
  check_in: { label: 'Check-in', jump: 'Jump to 9:00 AM' },
  move_in_review: { label: 'Move-in review', jump: 'Jump to 9:00 AM' },
  checkout_due: { label: 'Checkout due', jump: 'Jump to 9:00 AM' }
};

const byDay = computed(() => events.value.reduce((map, e) => { (map[e.day] ??= []).push(e); return map; }, {}));
const grid = computed(() => {
  if (!viewMonth.value) return [];
  const [y, m] = viewMonth.value.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = first.getUTCDay(), cells = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => {
    const day = new Date(first.getTime() + (i - offset) * 864e5).toISOString().slice(0, 10);
    return { day, date: Number(day.slice(8)), inMonth: i >= offset && i < offset + days, events: byDay.value[day] || [] };
  });
});
const selectedEvents = computed(() => byDay.value[selected.value] || []);

const eventTarget = e => e.at ? new Date(new Date(e.at).getTime() + 60000) : new Date(e.day + 'T09:00:00+08:00');
const customTarget = computed(() => selected.value && /^\d{2}:\d{2}$/.test(time.value) ? new Date(selected.value + 'T' + time.value + ':00+08:00') : null);
const ahead = target => !!target && target.getTime() > now.value.getTime();

async function loadEvents() {
  if (!grid.value.length) return;
  try {
    const { data } = await axios.get('/api/testing/booking-calendar', { ...auth(), params: { from: grid.value[0].day, to: grid.value.at(-1).day } });
    events.value = data.events || [];
  } catch { events.value = []; }
}
async function loadState() {
  try { const { data } = await axios.get('/api/testing/booking-clock', auth()); state.value = data; }
  catch { state.value = { enabled: false }; }
}
async function refresh() {
  await loadState();
  if (state.value?.enabled) {
    await loadManualRecords();
    if (!viewMonth.value) viewMonth.value = today.value.slice(0, 7);
    if (!selected.value) selected.value = today.value;
    await loadEvents();
    if(!resetTime.value){const d=new Date();d.setMonth(d.getMonth()+1,1);resetTime.value=dayOf(d)+'T09:00';}
  }
}
onMounted(async () => { if (local) {await refresh();if(state.value?.enabled)await loadResetStudents();} loading.value = false; });

const notify = (text, kind = 'info') => { message.value = text; tone.value = kind; };
const rememberAck = () => { try { sessionStorage.setItem('cspc_clock_ack', ack.value ? '1' : '0'); } catch { /* storage unavailable */ } };

async function moveTo(target) {
  if (busy.value || !ack.value) return;
  busy.value = true; notify('');
  try {
    const { data } = await axios.post('/api/testing/booking-clock', { now: target ? target.toISOString() : null }, auth());
    const expired = data.expiry?.expired || 0, started = data.occupancy?.started || 0, blocked = data.occupancy?.blocked || 0;
    notify(target ? `Clock moved to ${stamp(new Date(data.now))}. Checks ran: ${expired} expired, ${started} ${started === 1 ? 'stay' : 'stays'} started${blocked ? `, ${blocked} could not start` : ''}.` : 'Back on real time.', 'success');
    await refresh();
  } catch (e) { notify(e.response?.data?.message || 'The clock could not be moved.', 'error'); }
  finally { busy.value = false; }
}

async function session(action) {
  if (busy.value) return;
  busy.value = true; notify(''); confirmRestore.value = false;
  try { const { data } = await axios.post('/api/testing/booking-clock/session', { action }, auth()); notify(data.message, 'success'); await refresh(); }
  catch (e) { notify(e.response?.data?.message || 'The test session could not be updated.', 'error'); }
  finally { busy.value = false; }
}

const shiftMonth = step => {
  const [y, m] = viewMonth.value.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1));
  viewMonth.value = d.toISOString().slice(0, 7);
  void loadEvents();
};
const goToday = () => { viewMonth.value = today.value.slice(0, 7); selected.value = today.value; void loadEvents(); };
</script>

<template>
  <section class="tc" aria-label="Booking test calendar">
    <p v-if="!local" class="tc-note">The test calendar works only when the app is opened at http://localhost on this computer.</p>
    <p v-else-if="loading" class="tc-note" role="status">Checking the test clock…</p>

    <div v-else-if="!state?.enabled" class="tc-card tc-setup">
      <h2>Turn on the test calendar</h2>
      <p>The test calendar is off. It only runs locally, outside production, with PayMongo test keys.</p>
      <ol>
        <li>Open <code>backend/.env</code> and add the line <code>ENABLE_BOOKING_TEST_CLOCK=true</code>.</li>
        <li>Restart the backend: <code>docker compose up -d --build backend</code></li>
        <li>Open <code>http://localhost</code>, sign in as the owner, and come back to this page.</li>
      </ol>
      <p>To turn it off again, remove that line (or set it to <code>false</code>) and restart the backend.</p>
    </div>

    <template v-else>
      <div class="tc-top">
        <div class="tc-card tc-now">
          <span :class="['tc-badge', state.simulated ? 'is-sim' : 'is-real']">{{ state.simulated ? 'Simulated time' : 'Real time' }}</span>
          <p class="tc-time">{{ stamp(now) }}</p>
          <div class="tc-actions">
            <button type="button" :disabled="busy || !ack" @click="moveTo(new Date(now.getTime() + 3600000))">+1 hour</button>
            <button type="button" :disabled="busy || !ack" @click="moveTo(new Date(now.getTime() + 86400000))">+1 day</button>
            <button type="button" :disabled="busy || !ack || !state.simulated" @click="moveTo(null)">Back to real time</button>
          </div>
          <label class="tc-ack"><input v-model="ack" type="checkbox" @change="rememberAck"> I understand that moving the clock runs deadline expiry and automatic stay starts, which change booking records.</label>
        </div>

        <div class="tc-card tc-session">
          <h2>Test session</h2>
          <template v-if="state.session?.active">
            <p>Started {{ stamp(new Date(state.session.startedAt)) }}. A copy of all data from that moment is saved.</p>
            <div v-if="!confirmRestore" class="tc-actions">
              <button type="button" class="primary" :disabled="busy" @click="confirmRestore = true">End and restore data</button>
              <button type="button" :disabled="busy" @click="session('keep')">End and keep changes</button>
            </div>
            <div v-else class="tc-confirm" role="alert">
              <p>Restore returns the whole database to the saved starting point. Transactions already present in that snapshot will return too. It does not mean an empty booking history. Other users' changes since that snapshot are also undone. Provider payments and uploaded files are not reversed. The clock returns to real time.</p>
              <div class="tc-actions"><button type="button" class="danger" :disabled="busy" @click="session('restore')">Restore data</button><button type="button" :disabled="busy" @click="confirmRestore = false">Cancel</button></div>
            </div>
          </template>
          <template v-else>
            <p>Start a session to save this starting point. Restore later returns to that snapshot, including transactions it already contained. For empty booking histories, use Start fresh for selected students below.</p>
            <div class="tc-actions"><button type="button" class="primary" :disabled="busy" @click="session('start')">Start test session</button></div>
          </template>
        </div>
      </div>

      <section class="tc-card tc-reset"><h2>Start fresh for selected students</h2><p>Clear only the selected students' local bookings, linked occupancy/payment history and related booking notifications, including their copies in the saved snapshot. Keep accounts, profiles, rooms and property setup. This is different from Restore.</p><p><strong>This student cleanup does not include manual Non-CSPC records.</strong> Clear those separately below if you want an empty room. Moving the clock backward does not erase recorded stays; their historical dates can still overlap a new booking.</p><fieldset><legend>Test student accounts</legend><label v-for="student in resetStudents" :key="student.id" class="tc-ack"><input type="checkbox" v-model="chosenStudents" :value="student.id">{{ student.name }} <small>(ID {{ student.id }})</small></label><p v-if="!resetStudents.length">No students with booking history were found under your properties. A clean account needs no transaction reset.</p></fieldset><label class="tc-reset-field">Previously cleared student IDs (optional, comma separated)<input v-model="manualStudentIds" placeholder="For example: 43, 45" inputmode="numeric"></label><label class="tc-reset-field">Scenario starting time (Philippine time)<input v-model="resetTime" type="datetime-local"></label><p><strong>Set this time before creating the first booking.</strong> Moving forward after submitting a request may expire it. The test clock is shared by all accounts; use this only in your disposable local testing database.</p><label class="tc-ack"><input type="checkbox" v-model="resetAck">I selected test accounts only. I understand their test transactions will be deleted from current data and the saved snapshot. PayMongo transactions and files are not reversed.</label><div class="tc-actions"><button type="button" class="danger" :disabled="busy || !resetAck || (!chosenStudents.length && !manualStudentIds.trim()) || !resetTime" @click="cleanRestart">Clear selected test history and set starting time</button></div></section>
      <section class="tc-card tc-reset" aria-labelledby="manual-reset-title">
        <h2 id="manual-reset-title">Clear manual Non-CSPC test records</h2>
        <p>Select only disposable manual test occupants. This removes their stay and local payment history from <strong>current data and the saved snapshot</strong>, so Restore cannot bring them back. Student accounts, student bookings, rooms and other occupants are kept. This does not change the test clock or reverse provider payments.</p>
        <button type="button" :disabled="busy" @click="loadManualRecords">Refresh manual records</button>
        <p v-if="manualResetError" role="alert">{{ manualResetError }}</p>
        <fieldset v-if="manualRecords.length"><legend>Manual test occupants</legend>
          <label v-for="record in manualRecords" :key="record.id" class="tc-ack">
            <input type="checkbox" v-model="chosenManualRecords" :value="record.id" :disabled="busy || record.identityConflict">
            <span><strong>{{ record.name }}</strong> &middot; NC-{{ String(record.id).padStart(4,'0') }}<br><small>{{ record.house_name }} &middot; Room {{ record.room_number }} &middot; Check-in {{ String(record.check_in_date || '').slice(0,10) }}<br>{{ record.inCurrent ? 'Current data' : '' }}{{ record.inCurrent && record.inSnapshot ? ' and ' : '' }}{{ record.inSnapshot ? 'saved snapshot' : '' }}<span v-if="record.identityConflict"> &mdash; ID belongs to different residents; restore and review first.</span></small></span>
          </label>
        </fieldset>
        <p v-else-if="!manualResetError">No unlinked manual Non-CSPC records were found under your properties or their saved snapshot copies.</p>
        <label class="tc-ack"><input type="checkbox" v-model="manualResetAck" :disabled="busy">I confirm the selected records are disposable tests. Their stay/payment history will be deleted from current data and the saved snapshot.</label>
        <div class="tc-actions"><button type="button" class="danger" :disabled="busy || !manualResetAck || !chosenManualRecords.length" @click="clearManualRecords">Clear selected manual test records</button></div>
      </section>
      <p v-if="message" :class="['tc-message', 'is-' + tone]" role="status">{{ message }}</p>

      <div class="tc-layout">
        <div class="tc-card tc-calendar">
          <header class="tc-month">
            <button type="button" aria-label="Previous month" @click="shiftMonth(-1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
            <h2>{{ monthLabel }}</h2>
            <button type="button" aria-label="Next month" @click="shiftMonth(1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
            <button type="button" class="tc-today" @click="goToday">Test today</button>
          </header>
          <div class="tc-grid" role="grid" aria-label="Booking events by day">
            <span v-for="w in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="w" class="tc-weekday" role="columnheader">{{ w }}</span>
            <button v-for="cell in grid" :key="cell.day" type="button" role="gridcell"
                    :class="['tc-day', { out: !cell.inMonth, past: cell.day < today, today: cell.day === today, selected: cell.day === selected }]"
                    :aria-label="longDay(cell.day) + (cell.events.length ? ', ' + cell.events.length + ' events' : '')" :aria-selected="cell.day === selected"
                    @click="selected = cell.day">
              <span class="tc-date">{{ cell.date }}</span>
              <span v-for="e in cell.events.slice(0, 3)" :key="e.type + e.bookingId" :class="['tc-chip', 't-' + e.type]">{{ TYPES[e.type].label }}</span>
              <span v-if="cell.events.length > 3" class="tc-more">+{{ cell.events.length - 3 }} more</span>
            </button>
          </div>
          <ul class="tc-legend" aria-label="Event types">
            <li v-for="(t, key) in TYPES" :key="key"><span :class="['tc-dot', 't-' + key]"></span>{{ t.label }}</li>
          </ul>
        </div>

        <aside class="tc-card tc-panel" aria-live="polite">
          <h2>{{ selected ? longDay(selected) : 'Choose a day' }}</h2>
          <p v-if="selected && selected < today" class="tc-muted">This day is in the past for the test clock. Time only moves forward; restore the test session to go back.</p>
          <ul v-if="selectedEvents.length" class="tc-events">
            <li v-for="e in selectedEvents" :key="e.type + e.bookingId">
              <span :class="['tc-chip', 't-' + e.type]">{{ TYPES[e.type].label }}</span>
              <strong>{{ e.ref }} · {{ e.student }}</strong>
              <span class="tc-muted">Room {{ e.room }} · {{ e.house }} · {{ e.method === 'paymongo' ? 'Online' : 'Cash' }}<template v-if="e.at"> · {{ clockTime(new Date(e.at)) }}</template></span>
              <button type="button" :disabled="busy || !ack || !ahead(eventTarget(e))" @click="moveTo(eventTarget(e))">{{ TYPES[e.type].jump }}</button>
            </li>
          </ul>
          <p v-else-if="selected" class="tc-muted">No booking events on this day.</p>
          <div v-if="selected" class="tc-custom">
            <label>Time<input v-model="time" type="time"></label>
            <button type="button" class="primary" :disabled="busy || !ack || !ahead(customTarget)" @click="moveTo(customTarget)">Move clock here</button>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.tc{display:flex;flex-direction:column;gap:16px;margin:8px 0 24px;color:#294665;font-size:13px;line-height:1.6}
.tc-card{background:#fff;border:1px solid #dbe5f2;border-radius:14px;padding:18px}
.tc-card h2{margin:0 0 8px;font-size:15px;font-weight:700;color:#193b63}
.tc-note,.tc-muted{color:#5b6e86}
.tc-setup ol{margin:8px 0 12px;padding-left:20px;list-style:decimal}.tc-setup li+li{margin-top:6px}
.tc code{font-size:12px;background:#eef3fb;border-radius:6px;padding:1px 6px}
.tc-top{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px}
.tc-badge{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px}
.tc-badge.is-sim{background:#fff4e5;color:#b45309}.tc-badge.is-real{background:#eaf1ff;color:#215bcc}
.tc-time{margin:8px 0 12px;font-size:20px;font-weight:700;color:#12345b}.tc-time small{font-size:12px;font-weight:500;color:#5b6e86;margin-left:6px}
.tc-actions{display:flex;gap:8px;flex-wrap:wrap}
.tc button{font:inherit;font-size:12px;font-weight:600;border:1px solid #cdd9e8;border-radius:8px;padding:8px 12px;background:#fff;color:#294665;cursor:pointer}
.tc button.primary{background:#2563eb;border-color:#2563eb;color:#fff}
.tc button.danger{background:#dc2626;border-color:#dc2626;color:#fff}
.tc button:disabled{opacity:.5;cursor:not-allowed}
.tc button:focus-visible,.tc input:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
.tc-ack{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12px;color:#5b6e86}.tc-ack input{margin-top:4px}
.tc-confirm{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px}.tc-confirm p{margin:0 0 8px;color:#7f1d1d}
.tc-message{margin:0;padding:10px 14px;border-radius:10px;font-weight:500}
.tc-message.is-success{background:#ecfdf5;color:#065f46}.tc-message.is-error{background:#fef2f2;color:#991b1b}.tc-message.is-info{background:#eff6ff;color:#1e40af}
.tc-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
.tc-month{display:flex;align-items:center;gap:8px;margin-bottom:12px}.tc-month h2{margin:0;min-width:150px;text-align:center}
.tc-month .tc-today{margin-left:auto}
.tc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.tc-weekday{font-size:11px;font-weight:700;color:#5b6e86;text-align:center;padding:4px 0}
.tc .tc-day{display:flex;flex-direction:column;align-items:stretch;gap:3px;min-height:92px;padding:6px;border:1px solid #e3eaf4;border-radius:8px;background:#fff;text-align:left;font-weight:500}
.tc .tc-day.out{background:#f8fafc;color:#94a3b8}
.tc .tc-day.past .tc-date{color:#94a3b8}
.tc .tc-day.today{border-color:#2563eb;box-shadow:inset 0 0 0 1px #2563eb}
.tc .tc-day.selected{background:#eff6ff}
.tc-date{font-size:12px;font-weight:700;color:#193b63}
.tc-chip{display:block;font-size:10.5px;font-weight:600;line-height:1.3;padding:2px 6px;border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc-more{font-size:10.5px;color:#5b6e86}
.t-renewal_wait,.t-renewal_decision{background:#fff4dc;color:#925d08}.t-owner_deadline{background:#fff4e5;color:#9a3412}.t-payment_deadline{background:#fee2e2;color:#991b1b}.t-check_in{background:#dbeafe;color:#1e40af}.t-move_in_review{background:#ede9fe;color:#5b21b6}.t-checkout_due{background:#e2e8f0;color:#334155}
.tc-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 0 0;padding:0;list-style:none;font-size:11.5px;color:#5b6e86}
.tc-dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.tc-events{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.tc-events li{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px;border:1px solid #e3eaf4;border-radius:10px}
.tc-events strong{color:#193b63}
.tc-custom{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid #e3eaf4}
.tc-custom label{display:flex;flex-direction:column;gap:4px;font-weight:600}
.tc-custom input{font:inherit;border:1px solid #cdd9e8;border-radius:8px;padding:6px 10px}
@media (max-width:1100px){.tc-layout{grid-template-columns:1fr}}
@media (max-width:760px){.tc-top{grid-template-columns:1fr}.tc .tc-day{min-height:64px;padding:4px}.tc-chip{font-size:0;padding:0;height:6px}}
@media (pointer:coarse){.tc button{min-height:44px}}
</style>

<style scoped>.tc-reset{margin:18px 0}.tc-reset p{font-size:13px;line-height:1.65;color:#334a66}.tc-reset fieldset{border:1px solid #dce6f3;border-radius:8px;padding:12px;margin:12px 0}.tc-reset legend{font-size:13px;font-weight:650}.tc-reset-field{display:grid;gap:6px;font-size:13px;margin:12px 0;max-width:450px}.tc-reset-field input{border:1px solid #cdd9e8;padding:10px;border-radius:8px;font:inherit;min-width:0}.tc-reset .danger{background:#b91c1c;color:white}.tc-reset small{color:#526b89}</style>
