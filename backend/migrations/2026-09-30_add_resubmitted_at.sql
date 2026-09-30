-- Migration: Add resubmitted_at column to boarding_houses
-- Tracks the exact timestamp when an owner uploads a document while
-- document_update_pending = 1, so admins see the real resubmission date
-- instead of the original created_at of the boarding house.

ALTER TABLE boarding_houses
  ADD COLUMN IF NOT EXISTS resubmitted_at DATETIME DEFAULT NULL
    COMMENT 'Set to NOW() each time owner uploads a doc triggering document_update_pending=1. Used in admin Pending Applications date column.';
