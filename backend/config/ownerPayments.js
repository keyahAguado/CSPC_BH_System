import { readyDirectConnection } from './ownerDirectPayments.js';
export { sealSecret, openSecret } from './paymentSecrets.js';
export { paymentMode } from './paymentEnvironment.js';
const fail = (status, message) => Object.assign(new Error(message), { status });

// New online bookings use the owner's verified merchant connection only.
// Historical checkout credentials remain supported by paymentSettlement.js.
export async function requireOwnerPayments(db, houseId) {
    const [houses] = await db.query('SELECT owner_id FROM boarding_houses WHERE id = ?', [houseId]);
    if (!houses[0]) throw fail(404, 'Property not found.');
    const ready = await readyDirectConnection(db, houses[0].owner_id);
    if (!ready) throw fail(409, 'The owner must check their online payment connection or connect their merchant account. Choose cash or contact the owner.');
    return {...ready, direct_connection_id: ready.id};
}
