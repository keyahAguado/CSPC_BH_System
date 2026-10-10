// Pure input checks. Database ownership and lifecycle checks remain in their routes.
export const MAX_MONEY = 99999999.99;
const missing = value => value === undefined || value === null || value === '';
export function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function todayInManila() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = name => parts.find(p => p.type === name).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validWhole(value, min = 1, max = 2147483647) {
    return ['number', 'string'].includes(typeof value) && /^\d+$/.test(String(value).trim()) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}
export function validMoney(value, allowZero = false) {
    return ['number', 'string'].includes(typeof value) && /^\d+(?:\.\d{1,2})?$/.test(String(value).trim()) && Number.isFinite(Number(value)) && Number(value) >= (allowZero ? 0 : 0.01) && Number(value) <= MAX_MONEY;
}
function text(value, label, max, required = false) {
    if (missing(value)) return required ? `${label} is required.` : null;
    if (typeof value !== 'string') return `${label} must be text.`;
    if (required && !value.trim()) return `${label} is required.`;
    if (Array.from(value).length > max) return `${label} must be ${max} characters or fewer.`;
    return null;
}
function phone(value, label, required = false) {
    const error = text(value, label, 20, required);
    if (error || missing(value)) return error;
    return /^09\d{9}$/.test(value.trim()) ? null : `${label} must be an 11-digit mobile number starting with 09.`;
}
function date(value, label, required = false) {
    if (missing(value)) return required ? `${label} is required.` : null;
    return validDate(value) ? null : `${label} is invalid. Please enter a complete, valid date.`;
}
function choice(value, allowed, label, required = false) {
    if (missing(value)) return required ? `Please select ${label}.` : null;
    return allowed.includes(value) ? null : `Please select a valid ${label}.`;
}
// TEXT columns have a byte limit; 16000 Unicode characters fit even at four bytes each.
export function validateInput(scope, data, context = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Please check the submitted form and try again.';
    const errors = [];
    const add = error => { if (error) errors.push(error); };
    const whole = (key, label, min, max, required = false) => {
        if (missing(data[key])) { if (required) add(`${label} is required.`); }
        else if (!validWhole(data[key], min, max)) add(`${label} must be a whole number from ${min} to ${max}.`);
    };
    const contact = () => {
        add(phone(data.contact_number, 'Contact number', scope === 'booking'));
        add(phone(data.emergency_contact, 'Emergency contact number'));
        add(text(data.guardian_name, 'Guardian name', 255));
        add(text(data.address, 'Address', 16000));
    };
    if (scope === 'booking' || scope === 'occupant') {
        add(text(data[scope === 'booking' ? 'resident_name' : 'name'], 'Full name', 255, true));
        add(date(data.check_in_date, 'Check-in date', scope === 'booking'));
        if (scope === 'booking' && validDate(data.check_in_date) && data.check_in_date < (context.today || todayInManila())) add('Check-in date cannot be before today.');
        whole('months', 'Duration of stay', 1, 2147483647, true);
        whole('age', 'Age', 1, 120);
        const start = data.check_in_date || context.today || todayInManila();
        if (validDate(start) && validWhole(data.months)) {
            const [year, month] = start.split('-').map(Number);
            if (year * 12 + month - 1 + Number(data.months) > 9999 * 12 + 11) add('Duration of stay places the check-out date beyond the supported year. Please reduce the number of months.');
        }
        contact();
        if (scope === 'booking') {
            whole('roomId', 'Selected room', 1, 2147483647, true);
            add(choice(data.payment_method, ['cash', 'paymongo'], 'payment method', true));
            add(choice(data.gender || data.sex, ['male', 'female'], 'gender'));
        } else {
            add(choice(data.payment_status, ['Paid', 'Not Paid'], 'monthly rent status'));
            add(choice(data.upfront_status, ['Paid', 'Unpaid'], 'upfront collection status'));
        }
    }
    if (scope === 'property') {
        add(text(data.house_name, 'Boarding house name', 255, true));
        add(text(data.location, 'Property address', 255, true));
        add(text(data.barangay, 'Barangay', 255));
        add(text(data.description, 'Description', 16000));
        add(text(data.map_link, 'Map link', 16000));
        add(text(data.contact_number, 'Property contact number', 200, true));
        if (typeof data.contact_number === 'string' && !/^[\d\s/,\-+()]{7,200}$/.test(data.contact_number.trim())) add('Please enter a valid property contact number or list of numbers.');
        if (!validMoney(data.price)) add('Monthly rent must be greater than zero, with at most two decimal places, and no more than 99,999,999.99.');
        for (const [key, label, limit] of [['latitude', 'Latitude', 90], ['longitude', 'Longitude', 180]]) {
            const value = data[key];
            if (!['string','number'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < -limit || Number(value) > limit || Number(value) === 0) add(`${label} is invalid. Please confirm the property map pin.`);
        }
        for (const key of ['advance_months', 'deposit_months']) {
            if (!missing(data[key]) && ![0,1,2].includes(Number(data[key]))) add('Advance rent and deposit must use the available 0, 1, or 2 month choices.');
            else if (!missing(data[key]) && !validWhole(data[key],0,2)) add('Advance rent and deposit must be whole numbers.');
        }
        add(choice(data.deposit_type, ['refundable', 'consumable'], 'deposit type'));
        for (const key of ['amenities_free','amenities_paid','existing_photos']) {
            if (missing(data[key])) continue;
            let values;
            try { values = typeof data[key] === 'string' ? JSON.parse(data[key]) : data[key]; } catch { add('Please refresh the form and select your amenities/photos again.'); continue; }
            if (!Array.isArray(values) || values.some(v => typeof v !== 'string' || v.length > (key === 'existing_photos' ? 255 : 255))) add('Please refresh the form and select your amenities/photos again.');
            else if (key === 'existing_photos' && values.length > 10) add('A property can have at most 10 gallery photos.');
        }
        for (const key of ['business_form','cedula','dti','barangay','building','zoning','sanitary','fire']) add(date(data['expiry_permit_' + key], `${key.replaceAll('_',' ')} expiry date`));
        if (!missing(data.house_id)) whole('house_id', 'Property ID', 1, 2147483647);
    }
    if (scope === 'room') {
        add(text(typeof data.room_number === 'number' ? String(data.room_number) : data.room_number, 'Room number', 50, true));
        whole('capacity', 'Capacity', 1, 2147483647, true);
        if (!missing(data.price) && !validMoney(data.price, true)) add('Room rent must be zero or greater, with at most two decimal places, and no more than 99,999,999.99.');
        add(choice(data.gender_type, ['male','female'], 'room gender'));
    }
    if (['studentProfile','ownerProfile','ownerRegistration','adminUser'].includes(scope)) {
        const student = scope === 'studentProfile';
        if (!student) add(text(data.name, 'Name',255,true));
        add(phone(data.phone,'Phone number',scope === 'ownerRegistration'));
        add(phone(data.emergency_contact,'Emergency contact number'));
        add(text(data.address,'Address',16000,scope === 'ownerRegistration'));
        add(text(data.guardian_name,'Guardian name',255));
        if (student) {
            add(text(data.student_id,'Student ID',50));
            add(text(data.course,'Course',100));
            add(text(data.year_section,'Year and section',50));
            add(choice(data.sex,['male','female','Male','Female'],'gender'));
            add(date(data.dob,'Date of birth'));
            whole('age','Age',1,120);
            if (validDate(data.dob)) {
                const today = context.today || todayInManila();
                const age = Number(today.slice(0,4)) - Number(data.dob.slice(0,4)) - (today.slice(5) < data.dob.slice(5) ? 1 : 0);
                if (age < 15 || age > 65) add('Date of birth must correspond to an age between 15 and 65.');
                else if (!missing(data.age) && Number(data.age) !== age) add('Age does not match the date of birth. Please check both fields.');
            }
        } else if (scope !== 'ownerProfile') {
            add(text(data.email,'Email address',255,true));
            if (typeof data.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) add('Please enter a valid email address.');
            if (scope === 'ownerRegistration') add(text(data.google_id,'Google account ID',255,true));
            if (!missing(data.password) && (typeof data.password !== 'string' || data.password.trim().length < 6 || new TextEncoder().encode(data.password).length > 72)) add('Password must contain at least 6 characters and fit within 72 UTF-8 bytes.');
        }
        for (const key of ['existing_profile_pic','profile_pic']) add(text(data[key],'Profile photo reference',255));
    }
    if (scope === 'review') {
        if (!validWhole(data.rating,1,5)) add('Star rating must be a whole number from 1 to 5.');
        add(text(data.comment,'Review comment',16000));
    }
    if (scope === 'course') {
        add(text(data.course_code,'Course code',50,true));
        add(text(data.course_name,'Course name',255,true));
        add(text(data.department,'Department',10));
        add(choice(data.department,['CAS','CCS','CEA','CHS','CTHBM','CTDE'],'department'));
    }
    if (scope === 'criterion') {
        add(text(data.label,'Requirement name',255,true));
        whole('house_id','Property ID',1,2147483647);
    }
    if (scope === 'siteFeature') {
        add(text(data.title,'Feature title',120,true));
        add(text(data.description,'Feature description',500,true));
        add(choice(data.icon,['shield-halved','magnifying-glass','camera','mobile-screen','map-location-dot','house-circle-check','building-circle-check','calendar-check','bell','credit-card','star','user-shield','comments','file-shield','wifi','graduation-cap','location-dot','hand-holding-heart','lock','headset'],'feature icon',true));
    }
    if (scope === 'featureMove') add(choice(data.direction,['up','down'],'move direction',true));
    if (scope === 'siteSettings') {
        for (const [key,label,max,required] of [['features_eyebrow','Section label',60],['features_heading','Section heading',80,true],['footer_title','Footer title',120,true],['footer_tagline','Footer tagline',255],['footer_office','Office name',120],['footer_address','Office address',255],['footer_email','Contact email',255],['footer_phone','Contact number',60],['footer_hours','Office hours',120],['footer_facebook','Facebook page link',255],['footer_website','Website link',255],['footer_copyright','Copyright notice',255]]) add(text(data[key],label,max,required));
        if (typeof data.footer_email === 'string' && data.footer_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.footer_email.trim())) add('Please enter a valid contact email address.');
        if (typeof data.footer_phone === 'string' && data.footer_phone.trim() && !/^[\d\s/,\-+()]{7,60}$/.test(data.footer_phone.trim())) add('Please enter a valid contact number or list of numbers.');
        for (const [key,label] of [['footer_facebook','Facebook page link'],['footer_website','Website link']]) {
            if (typeof data[key] === 'string' && data[key].trim() && !/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(data[key].trim())) add(`${label} must be a full web address starting with http:// or https://.`);
        }
    }
    if (scope === 'approval') {
        add(text(data.admin_comments,'Administrative comments',16000));
        if (!missing(data.checklist) && (!Array.isArray(data.checklist) || data.checklist.length > 1000 || data.checklist.some(id => !validWhole(id,1,2147483647)) || new Set(data.checklist.map(Number)).size !== data.checklist.length)) add('The selected checklist is invalid. Please refresh the application and select the requirements again.');
    }
    if (scope === 'rejection') add(text(data.admin_comments,'Administrative feedback',16000,true));
    if (scope === 'archive') add(text(data.reason,'Archive reason',16000));
    if (scope === 'monthlyRent') add(choice(data.status,['Paid','Not Paid'],'monthly rent status',true));
    if (scope === 'bookingPayment') add(choice(data.status,['paid','unpaid'],'payment status',true));
    if (scope === 'upfront') add(choice(data.status,['Paid','Unpaid'],'upfront collection status',true));
    if (scope === 'document') {
        add(date(data.expiry_date,'Document expiry date'));
        if (![true,false,'true','false',undefined].includes(data.is_custom)) add('Please select a valid document requirement.');
        const custom = data.is_custom === true || data.is_custom === 'true';
        if (custom) whole('identifier','Requirement ID',1,2147483647,true);
        else add(choice(data.identifier,['permit_business_form','permit_cedula','permit_dti','permit_barangay','permit_building','permit_zoning','permit_sanitary','permit_fire'],'document requirement',true));
    }
    if (scope === 'login') {
        add(text(data.email,'Email address',255,true));
        add(text(data.password,'Password',1000,true));
    }
    if (scope === 'password') {
        if (typeof data.newPassword !== 'string' || data.newPassword.trim().length < 6 || new TextEncoder().encode(data.newPassword).length > 72) add('New password must contain at least 6 characters and fit within 72 UTF-8 bytes.');
        add(text(data.currentPassword,'Current password',1000));
    }
    return errors[0] || null;
}
