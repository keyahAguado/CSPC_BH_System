-- Legacy flat amenities remain readable as Free until owners review their categories.
ALTER TABLE rooms ADD COLUMN amenities_free JSON NULL, ADD COLUMN amenities_paid JSON NULL;
