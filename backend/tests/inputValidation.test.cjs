const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../..');
const load = Promise.all(['backend/config/inputValidation.js', 'frontend/src/utils/inputValidation.js', 'backend/config/uploadValidation.js'].map(file => import(pathToFileURL(path.join(root,file)).href)));
const context = { today: '2026-10-03' };
const examples = {
    booking: { roomId: '1', resident_name: 'Student', check_in_date: '2026-12-30', months: '2', age: '21', gender: 'male', contact_number: '09123456789', payment_method: 'paymongo' },
    occupant: { name: 'Boarder', months: '2', age: '21', check_in_date: '2026-10-01', payment_status: 'Not Paid', upfront_status: 'Unpaid' },
    property: { house_name:'Property', location:'Nabua', price:'1500.50', contact_number:'09123456789 / 09987654321', latitude:'13.4', longitude:'123.3', advance_months:'1', deposit_months:'2', deposit_type:'consumable', amenities_free:'["WiFi"]', amenities_paid:'[]', existing_photos:'["/uploads/old.jpg"]' },
    room: { room_number:'A', capacity:'2', price:'1000.25', gender_type:'female' },
    studentProfile: { student_id:'ST-1', sex:'Female', course:'BSIT', year_section:'1A', dob:'2005-10-03', age:'21', phone:'09123456789' },
    ownerProfile: { name:'Owner', phone:'09123456789', address:'Nabua' },
    ownerRegistration: { name:'Owner', email:'owner@example.invalid', google_id:'verified-id', phone:'09123456789', address:'Nabua' },
    adminUser: { name:'User', email:'user@example.invalid', phone:'09123456789', password:'' },
    review: { rating:5, comment:'Good place' },
    course: { course_code:'BSIT', course_name:'Information Technology', department:'CCS' },
    criterion: { label:'Additional requirement', house_id:1 },
    approval: { checklist:[1,2], admin_comments:'Accredited' },
    rejection: { admin_comments:'Please correct the documents.' },
    archive: { reason:'Owner paused listing' },
    upfront: { status:'Unpaid' },
    monthlyRent: { status:'Not Paid' },
    bookingPayment: { status:'paid' },
    document: { identifier:'permit_fire', is_custom:'false', expiry_date:'2027-12-30' },
    password: { currentPassword:'existing-password', newPassword:'new-password' },
    login: { email:'admin@example.invalid', password:'password' }
};
for (const [scope, data] of Object.entries(examples)) test(scope + ' valid existing submission is accepted identically in browser/server', async () => {
    const [backend,frontend] = await load;
    assert.equal(backend.validateInput(scope,data,context),null);
    assert.equal(frontend.validateInput(scope,data,context),null);
});
const cases = [];
const add = (scope,key,values) => values.forEach(value => cases.push({scope,key,value}));
for (const scope of ['booking','occupant']) {
    add(scope,'check_in_date',['20226-12-30','0026-12-30','2026-02-30','2026-13-01',[],{}]);
    add(scope,'months',[0,-1,1.5,'2months','1e3','',true,{},2147483648]);
    add(scope,'age',[-1,0,1.5,'abc','1e2',{},121]);
    add(scope,scope==='booking'?'resident_name':'name',['','   ',{},'A'.repeat(256)]);
    add(scope,'contact_number',['12345','091234567890',{},'A'.repeat(21)]);
    add(scope,'emergency_contact',['12345',{},'A'.repeat(21)]);
    add(scope,'guardian_name',[{},'A'.repeat(256)]);
    add(scope,'address',[{},'A'.repeat(16001)]);
}
add('booking','check_in_date',['2026-10-02','']);
add('booking','payment_method',['other','',{},[]]);
add('booking','roomId',[0,-1,'1abc',{},'']);
add('booking','gender',['other',{},[]]);
add('occupant','payment_status',['unpaid','other',{}]);
add('occupant','upfront_status',['paid','other',{}]);
for (const scope of ['room','property']) add(scope,'price',[-1,'abc','1500abc','Infinity',Infinity,NaN,'999999999','0.001',{},true]);
for (const [key,values] of Object.entries({ house_name:['','   ',{},'A'.repeat(256)],location:['',{},'A'.repeat(256)],latitude:['',91,-91,'NaN',{},true],longitude:['',181,-181,'123abc',{}],advance_months:[-1,3,'1abc',{},true],deposit_months:[-1,3,1.5,{},[]],deposit_type:['other',{}],existing_photos:['bad','{}','[1]','[{}]'],amenities_free:['bad','{}','[1]'],contact_number:['abc',{},'1'.repeat(201)] })) add('property',key,values);
add('room','capacity',[0,-1,1.5,'abc','1e3',{},true,2147483648]);
add('room','room_number',['','   ',{},'A'.repeat(51)]);
add('room','gender_type',['other',{}]);
for (const scope of ['studentProfile','ownerProfile','ownerRegistration','adminUser']) {
    add(scope,'phone',['12345',{},'1'.repeat(21)]);
    add(scope,'address',[{},'A'.repeat(16001)]);
}
add('studentProfile','dob',['20226-12-30','0026-12-30','2026-02-30','2015-01-01','1900-01-01',{}]);
add('studentProfile','age',[-1,1.5,22,{}]);
add('studentProfile','student_id',[{},'A'.repeat(51)]);
add('studentProfile','course',[{},'A'.repeat(101)]);
add('studentProfile','year_section',[{},'A'.repeat(51)]);
add('studentProfile','sex',['other',{}]);
for (const scope of ['adminUser','ownerRegistration']) add(scope,'email',['','invalid','a b@example.invalid',{},'A'.repeat(256)]);
for (const scope of ['ownerProfile','ownerRegistration','adminUser']) add(scope,'name',['','   ',{},'A'.repeat(256)]);
add('adminUser','password',['123',{},'X'.repeat(73)]);
add('ownerRegistration','google_id',['',{},'X'.repeat(256)]);
add('review','rating',[0,6,1.5,'abc',{},true,'1e0']);
add('review','comment',[{},'X'.repeat(16001)]);
add('course','course_code',['','   ',{},'X'.repeat(51)]);
add('course','course_name',['','   ',{},'X'.repeat(256)]);
add('criterion','label',['','   ',{},'X'.repeat(256)]);
add('criterion','house_id',[-1,'1abc',{}]);
add('approval','checklist',['1,2',{},[0],[1,1],[{}],new Array(1001).fill(1)]);
add('approval','admin_comments',[{},'X'.repeat(16001)]);
add('rejection','admin_comments',['','   ',{}]);
add('archive','reason',[{},'X'.repeat(16001)]);
for (const scope of ['upfront','monthlyRent','bookingPayment']) add(scope,'status',['','other',{},[]]);
add('document','identifier',['other','',{}]);
add('document','expiry_date',['20226-12-30','0026-12-30','2026-02-30',{}]);
add('document','is_custom',['other',{}]);
add('password','newPassword',['','123',{},'X'.repeat(73),'\u{1f600}'.repeat(19)]);
add('login','password',['',{},true]);
for (const {scope,key,value} of cases) test(scope + ' rejects invalid ' + key + ' ' + JSON.stringify(value).slice(0,60), async () => {
    const [backend,frontend] = await load;
    const body={...examples[scope],[key]:value};
    const error=backend.validateInput(scope,body,context);
    assert.equal(typeof error,'string');
    assert.equal(frontend.validateInput(scope,body,context),error);
    assert(!error.includes('[object Object]'));
});
test('Browser/server validation rules remain synchronized',async()=>{
    const backend=fs.readFileSync(path.join(root,'backend/config/inputValidation.js'),'utf8');
    assert.equal(fs.readFileSync(path.join(root,'frontend/src/utils/inputValidation.js'),'utf8'),backend.slice(0,backend.indexOf('export function validateBody')));
});
test('Preserves optional fields, blank room price fallback, separate payments, and expired permits',async()=>{
    const [api]=await load;
    assert.equal(api.validateInput('room',{room_number:'A',capacity:1,price:''}),null);
    assert.equal(api.validateInput('room',{room_number:'A',capacity:1,price:0}),null);
    assert.equal(api.validateInput('occupant',{name:'Boarder',months:1,payment_status:'Paid',upfront_status:'Unpaid'}),null);
    assert.equal(api.validateInput('occupant',{name:'Boarder',months:1,payment_status:'Not Paid',upfront_status:'Paid'}),null);
    assert.equal(api.validateInput('document',{identifier:'permit_fire',expiry_date:'2020-01-01'}),null);
    assert.equal(api.validateInput('document',{identifier:'12',is_custom:'true',expiry_date:''}),null);
    assert.equal(api.validateInput('archive',{}),null);
    assert.equal(api.validateInput('approval',{checklist:[]}),null);
});
test('Calendar limits and real leap days',async()=>{
    const [api]=await load;
    for(const value of ['1000-01-01','9999-12-31','2000-02-29','2024-02-29']) assert(api.validDate(value));
    for(const value of ['1900-02-29','2026-04-31','2026-00-01','2026-12-00']) assert(!api.validDate(value));
    assert(api.validateInput('occupant',{name:'Boarder',months:12,check_in_date:'9999-12-31'}));
});
test('Invalid body or ID stops before next handler',async()=>{
    const [api]=await load;
    for(const req of [{body:[],params:{}},{body:{},params:{id:'1abc'}},{body:{},params:{id:'0'}}]) {
        let reached=false;const res={status(n){this.code=n;return this;},json(body){this.body=body;}};
        api.validateBody('ids')(req,res,()=>{reached=true;});
        assert.equal(res.code,400);assert.equal(res.body.errorCode,'invalid_input');assert.equal(reached,false);
    }
});
// Execute registrations from the actual route source, including their middleware order.
const wiring = [
 ['student.js','post','/book/:houseId','booking'], ['student.js','post','/update-profile','studentProfile'], ['student.js','post','/review/:id','review'],
 ['owner.js','post','/rooms/occupants/add/:roomId','occupant'], ['owner.js','post','/rooms/add/:houseId','room'], ['owner.js','put','/rooms/edit/:roomId','room'],
 ['owner.js','post','/edit/:id','property'], ['owner.js','post','/update-profile','ownerProfile'], ['owner.js','post','/rooms/occupants/upfront-payment/:id','upfront'],
 ['boardingHouses.js','post','/accreditation','property'], ['boardingHouses.js','post','/documents/update/:id','document'],
 ['admin.js','post','/users/update/:id','adminUser'], ['admin.js','post','/courses/add','course'], ['admin.js','post','/criteria/add','criterion'], ['admin.js','post','/approve/:id','approval'],
 ['auth.js','post','/register/owner-complete','ownerRegistration'], ['auth.js','post','/change-password','password']
];
for(const [file,method,route,scope] of wiring) test('Actual '+file+' '+route+' rejects invalid input before storage/database',async()=>{
    const [api,,uploads]=await load;
    const source=fs.readFileSync(path.join(root,'backend/routes',file),'utf8');
    const start=source.indexOf(`router.${method}('${route}'`),end=source.indexOf('\n});',start)+4;
    let handlers,calls=0;const pass=(req,res,next)=>next();
    const router={[method](name,...list){handlers=list;}};
    const sandbox={router,authenticateToken:pass,verifyOwner:pass,verifyAdmin:pass,upload:{single:()=>pass},uploadOwnerMedia:pass,uploadAccreditationFiles:pass,verifyOwnerOnboarding:pass,validateBody:api.validateBody,validateStudentCourse:api.validateStudentCourse,validateImages:uploads.validateImages,updateProfileHandler:()=>{calls++;},pool:{query(){calls++;throw Error('Unexpected DB');},getConnection(){calls++;throw Error('Unexpected DB');}},console:{error(){},log(){}}};
    if(route.endsWith('/update-profile')&&file==='owner.js') vm.runInNewContext(source.slice(start,source.indexOf('\n',start)),sandbox);
    else vm.runInNewContext(source.slice(start,end),sandbox);
    const invalid=cases.find(c=>c.scope===scope);assert(invalid);
    const req={path:route,body:{...examples[scope],[invalid.key]:invalid.value},params:{id:1,houseId:1,roomId:1},user:{id:1,role:'owner'}};
    const res={status(n){this.code=n;return this;},json(body){this.body=body;}};
    const dispatch=i=>handlers[i](req,res,()=>dispatch(i+1));await dispatch(0);
    assert.equal(res.code,400);assert.equal(calls,0);
});
for(const date of ['20226-12-30','0026-12-30','2026-02-30'])test('Booking date blur leaves malformed date for submission validation without alerts '+date,async()=>{
    const [api]=await load;const source=fs.readFileSync(path.join(root,'frontend/src/views/student/Book.vue'),'utf8');
    const start=source.indexOf('const handleCheckInDateChange ='),end=source.indexOf('\n};',start)+3;
    const state={form:{value:{check_in_date:date}},errorMsg:{value:''},minCheckInDate:{value:'2026-10-03'},alertRef:{value:null},validDate:api.validDate};
    vm.runInNewContext(source.slice(start,end)+'\nhandleCheckInDateChange();',state);
    assert.equal(state.form.value.check_in_date,date);assert.equal(state.errorMsg.value,'');
    assert.match(api.validateInput('booking',{...examples.booking,check_in_date:date},{today:'2026-10-03'}),/valid date/);
});

for (const blocked of [false, true]) test('Editing booking clears correction notice but preserves reservation block '+blocked, () => {
    const source=fs.readFileSync(path.join(root,'frontend/src/views/student/Book.vue'),'utf8');
    const start=source.indexOf('const clearInputError ='),end=source.indexOf('\n};',start)+3;
    const state={reservationBlocked:{value:blocked},errorMsg:{value:'Existing notice'}};
    vm.runInNewContext(source.slice(start,end)+'\nclearInputError();',state);
    assert.equal(state.errorMsg.value,blocked?'Existing notice':'');
});
test('Repeated booking correction attempts update one notice without popups', () => {
    const source=fs.readFileSync(path.join(root,'frontend/src/views/student/Book.vue'),'utf8');
    const start=source.indexOf('const showBookingError ='),end=source.indexOf('\n};',start)+3;
    let scrolls=0;
    const state={errorMsg:{value:''},bookingErrorRef:{value:{scrollIntoView(){scrolls++;}}},nextTick:fn=>fn()};
    vm.runInNewContext(source.slice(start,end)+'\nshowBookingError("First error");showBookingError("Second error");',state);
    assert.equal(state.errorMsg.value,'Second error');assert.equal(scrolls,2);
});
