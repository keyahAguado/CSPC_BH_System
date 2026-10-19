// Approved scope: once an online payment is verified, neither the owner nor the student can cancel the reservation
// through the platform. Refunds, disputes and paid-cancellation reviews are outside the platform's scope.
// Shown before payment and whenever a paid cancellation is refused.
export const PAID_RESERVATION_POLICY = 'Once a payment is verified, the reservation cannot be cancelled through the platform by the student or the owner. Exceptional cancellation or payment concerns are handled directly between the student and the owner, outside the platform. This does not mean payments are non-refundable.';

// The former paid-cancellation endpoint stays closed, including request/resolve/withdraw replay attempts.
export async function reviewPaidCancellation() {
 const error = new Error(PAID_RESERVATION_POLICY);
 error.status = 409;
 throw error;
}
