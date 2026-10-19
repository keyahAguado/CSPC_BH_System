// Correct known legacy wording as well as new notices. Keep event dates, references,
// recipients and links intact; the recipient's authenticated role determines the wording.
export function notificationForRole(value, role) {
    const message = String(value || '');
    const prefix = message.match(/^([A-Z][A-Z -]+):/)?.[1];
    if (role === 'owner') {
        if (prefix === 'WAITING FOR RENEWAL DECISION' && message.includes('Your request is not approved')) {
            const event = message.slice(0, message.indexOf('Your request is not approved'));
            return event + 'This incoming request is not approved and no bed is reserved for it. The student must not pay. Your response deadline is paused while the renewal decision is pending. Review the resident’s decision or extension before approving this request. When the waiting stage ends, you will receive a new response deadline or a notice that the requested dates are unavailable.';
        }
        if (prefix === 'RENEWAL DECISION RECORDED') return message
            .replace('You confirmed leaving', 'The resident confirmed leaving')
            .replace('Your current stay', 'The resident’s current stay')
            .replace('The owner can now review replacement requests', 'You can now review incoming replacement requests')
            .replace('Contact the owner to arrange actual checkout.', 'Coordinate departure with the resident and record actual checkout after they leave.');
        if (prefix === 'RENEWAL EXTENSION REQUESTED') return message
            .replace('The extension still needs owner approval', 'The resident’s extension request needs your approval')
            .replace('Current checkout remains', 'The resident’s current checkout remains');
        if (prefix === 'EXTENSION APPROVED') return message
            .replace('Your stay extension request of', 'The resident’s stay extension request of')
            .replace('has been approved.', 'was approved by you.')
            .replace('Your new booked checkout', 'The resident’s new booked checkout');
        if (prefix === 'RENEWAL DECISION RESOLVED') return message
            .replace('The owner approved changed stay dates.', 'You approved changed stay dates.')
            .replace('Your booked checkout', 'The resident’s booked checkout');
        if (prefix === 'CHECKOUT REMINDER') return message
            .replace('Contact each other to arrange departure or request an extension; an extension requires owner approval and available dates.', 'Contact the resident to arrange departure or discuss an extension. Review any extension request against available dates before approving it.')
            .replace('The owner must record actual checkout after departure.', 'Record actual checkout after the resident leaves.');
    }
    if (role === 'student' && prefix === 'CHECKOUT REMINDER') return message
        .replace('Contact each other to arrange departure or request an extension;', 'Contact the owner to arrange your departure or request an extension;');
    if (role === 'student' && prefix === 'RENEWAL DECISION UPDATE') return message
        .replace('The extension request is no longer pending. Your booked checkout remains', 'The existing resident’s extension request is no longer pending. Their booked checkout remains');
    return message;
}
