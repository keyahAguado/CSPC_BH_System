// Approved scope (same wording as backend/config/paidCancellation.js): once a payment is verified, neither the
// owner nor the student can cancel the reservation through the platform. Refunds and disputes are handled outside it.
export const PAID_RESERVATION_POLICY = 'Once a payment is verified, the reservation cannot be cancelled through the platform by the student or the owner. Exceptional cancellation or payment concerns are handled directly between the student and the owner, outside the platform. This does not mean payments are non-refundable.';

// A verified online payment that could not secure its reservation (late, wrong amount, or dates no longer free).
// The payment stays on record; no bed is held and the stay does not start. There is no in-app resolution step.
export const paymentException = b => !!b && b.payment_method === 'paymongo' && !!b.paymongo_payment_id && Number(b.payment_review_required) === 1;

export function paymentExceptionMessage(b, owner = false) {
  const reason = b?.payment_review_reason || 'The payment could not be matched to an active reservation.';
  const bed = b?.occupant_check_in ? 'The existing stay record is unchanged.' : 'No bed is held for these dates, and the stay will not start automatically.';
  return owner
    ? `The student's online payment was received but could not secure this reservation. Reason: ${reason} ${bed} The platform cannot cancel, refund or reinstate this reservation. Settle it with the student outside the platform.`
    : `Your payment was received, but it did not secure this reservation. Reason: ${reason} ${bed} The platform cannot cancel this reservation or refund the payment. Contact the owner to settle it outside the platform; this does not mean the payment is non-refundable. Do not pay again.`;
}
