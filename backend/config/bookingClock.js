// Only booking business time changes. Authentication and provider signatures use real time.
let simulated=null;
// Opt-in and local only: never in production, never with live PayMongo keys, and only against a database on this
// machine or the Docker Compose service (db). Test sessions (testSession.js) let the data be restored afterwards.
export function testClockEnabled(env=process.env){return env.NODE_ENV!=='production' && env.PAYMONGO_PAYMENT_MODE!=='live' && env.ENABLE_BOOKING_TEST_CLOCK==='true' && !String(env.PAYMONGO_SECRET_KEY || '').startsWith('sk_live_') && ['localhost','127.0.0.1','::1','db'].includes(env.DB_HOST || '127.0.0.1');}
const privateAddress=ip=>{const a=String(ip || '').replace(/^::ffff:/,'');return a==='::1' || /^127\./.test(a) || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a);};
// A request reaches the clock only from this machine: a private network peer (the Docker nginx proxy counts) and a
// browser that opened the app as localhost. Any forwarded public address is refused.
export function clockRequestAllowed(req){if(!testClockEnabled())return false;const host=String(req.headers.host || '').replace(/:\d+$/,'').toLowerCase();const forwarded=String(req.headers['x-forwarded-for'] || '').split(',').map(s=>s.trim()).filter(Boolean);return privateAddress(req.socket?.remoteAddress) && ['localhost','127.0.0.1','[::1]'].includes(host) && forwarded.every(privateAddress);}
export const bookingNow=()=>simulated && testClockEnabled() ? new Date(simulated) : new Date();
export const clockState=()=>({enabled:testClockEnabled(),simulated:!!simulated && testClockEnabled(),now:bookingNow().toISOString()});
export function setBookingClock(value){if(!testClockEnabled())throw Object.assign(new Error('Testing clock is disabled. Use an explicitly enabled local test database.'),{status:404});if(value===null){simulated=null;return clockState();}if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))throw Object.assign(new Error('Choose a valid date and time.'),{status:400});if(Date.parse(value)<bookingNow().getTime())throw Object.assign(new Error('Advance the clock forward, or reset to real time. Reset does not undo database changes.'),{status:400});simulated=new Date(value).toISOString();return clockState();}
// The database stores UTC (pool timezone 'Z'); the business calendar is Manila (UTC+8, no DST).
// CURDATE() always means the Manila calendar day. Simulated time rewrites only queries using
// booking/occupancy tables. Do not alter token clocks, compliance timestamps, webhook signature
// validation, or database server/global settings.
const MANILA_DATE_SQL='DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))';
const sqlStamp=date=>date.toISOString().slice(0,19).replace('T',' ');
export function bookingClockSql(sql){if(typeof sql!=='string')return sql;if(!simulated || !testClockEnabled() || !/\b(bookings|occupants|rooms)\b/i.test(sql))return sql.replace(/\bCURDATE\(\)/gi,MANILA_DATE_SQL);const now=bookingNow(),day=new Date(now.getTime()+8*3600000).toISOString().slice(0,10);return sql.replace(/\bCURDATE\(\)/gi,"DATE('"+day+"')").replace(/\bNOW\(\)/gi,"TIMESTAMP('"+sqlStamp(now)+"')");}
export function withBookingClock(pool){const wrap=c=>{if(c.__bookingClock)return c;for(const key of ['query','execute']){if(!c[key])continue;const original=c[key].bind(c);c[key]=(sql,...args)=>original(bookingClockSql(sql),...args);}Object.defineProperty(c,'__bookingClock',{value:true});return c;};wrap(pool);const get=pool.getConnection.bind(pool);pool.getConnection=async()=>wrap(await get());return pool;}
