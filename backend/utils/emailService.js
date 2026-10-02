/**
 * Email Service - POD Defense Version
 * Email dispatch is disabled for POD defense deployment.
 * All functions return safe no-op responses with success: false and disabled: true so no delivery is falsely reported.
 */

export const sendNotificationEmail = (userId, subject, message) => {
    // Disabled for POD defense version — in-app notifications are preserved in database
    return Promise.resolve({
        success: false,
        disabled: true,
        delivered: false,
        message: 'Email notifications disabled for POD defense version.'
    });
};

export const sendRawEmail = async (recipientEmail, recipientName, subject, message) => {
    // Disabled for POD defense version
    return {
        success: false,
        disabled: true,
        delivered: false,
        message: 'Email notifications disabled for POD defense version.'
    };
};
