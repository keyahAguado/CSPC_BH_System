import { ref } from 'vue';
export const simulatedBookingTime=ref(null);
export const bookingNow=()=>simulatedBookingTime.value ? new Date(simulatedBookingTime.value) : new Date();
