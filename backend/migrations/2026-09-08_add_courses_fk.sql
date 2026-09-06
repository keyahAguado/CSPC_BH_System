-- Adds real referential integrity between users.course and courses.course_code.
-- Run this AFTER 2026-09-06_add_courses.sql (the courses table must already
-- exist and be seeded) and AFTER any course-value cleanup is done.
--
-- IMPORTANT — run this check FIRST, separately, before the ALTER TABLE below:
--
--   SELECT course, COUNT(*) AS how_many
--   FROM users
--   WHERE course IS NOT NULL
--     AND course NOT IN (SELECT course_code FROM courses)
--   GROUP BY course;
--
-- If that returns any rows, the ALTER TABLE below will fail (safely — it's a
-- single atomic statement, so a failure changes nothing). Each returned value
-- is either:
--   (a) a spelling/formatting variant of a real course you already know about
--       (e.g. trailing spaces, different casing) — fix with a targeted
--       UPDATE ... WHERE TRIM(course) = '...' like the ones used for the
--       Architecture/Math cleanup, or
--   (b) something genuinely unknown — add it as an inactive placeholder row
--       in `courses` (same pattern as the 'BHS' placeholder) so it doesn't
--       block the constraint or force a guess onto a real student's record:
--         INSERT INTO courses (course_code, course_name, is_active)
--         VALUES ('THE_VALUE', 'Unconfirmed Program - Pending Verification', 0);
--
-- Once the pre-check returns zero rows, run:

ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_course`
  FOREIGN KEY (`course`) REFERENCES `courses` (`course_code`)
  ON UPDATE CASCADE ON DELETE RESTRICT;
