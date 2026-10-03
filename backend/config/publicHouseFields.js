// Public listing fields only. Permit files and internal review history stay private.
export const PUBLIC_HOUSE_COLUMNS = [
    'id', 'owner_id', 'name', 'img', 'img_1', 'img_2', 'img_3',
    'location', 'barangay', 'map_link', 'latitude', 'longitude',
    'price', 'rooms', 'phone_contact', 'description', 'amenities_free', 'amenities_paid',
    'rating', 'house_status', 'created_at', 'advance_months', 'deposit_months',
    'deposit_type'
].map(field => 'bh.' + field).join(', ');
