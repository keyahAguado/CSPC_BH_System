import { withBookingClock } from './bookingClock.js';
import mysql from 'mysql2/promise';
import { DEFAULT_FEATURES, SITE_SETTING_DEFAULTS } from './siteContent.js';

let dbHost = process.env.DB_HOST || '127.0.0.1';

const poolConfig = {
    host: dbHost,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cspc_boarding_db',
    port: process.env.DB_PORT || 3306,
    // DATETIME values are UTC (MySQL NOW() in Docker). Read and write them as UTC on every
    // host, so a Windows/Manila dev machine and the UTC container agree on deadlines.
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = withBookingClock(mysql.createPool(poolConfig));

// Test the connection pool with self-healing retry logic and host auto-resolution
async function testConnection(retries = 5, delay = 3000) {
    for (let i = 1; i <= retries; i++) {
        try {
            const connection = await pool.getConnection();
            console.log(`✅ Connected to MySQL database: ${process.env.DB_NAME || 'cspc_boarding_db'} (Host: ${poolConfig.host})`);
            connection.release();
            await ensureSchemaColumns();
            return; // Success!
        } catch (err) {
            console.warn(`⚠️  Database connection attempt ${i}/${retries} failed (${err.message}). Retrying in ${delay / 1000}s...`);

            // Self-healing fallback: If DB_HOST='db' but running outside Docker on host machine
            if (err.code === 'ENOTFOUND' && poolConfig.host === 'db') {
                console.log('🔄 Detected local environment with DB_HOST=db. Automatically falling back to 127.0.0.1...');
                poolConfig.host = '127.0.0.1';
                pool = withBookingClock(mysql.createPool(poolConfig));
            }

            if (i === retries) {
                console.error('❌ Database connection failed permanently:', err.message);
            } else {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

async function ensureSchemaColumns() {
    try {
        const [userCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'dpa_accepted'");
        if (userCols.length === 0) {
            await pool.query("ALTER TABLE users ADD COLUMN dpa_accepted TINYINT(1) DEFAULT 0, ADD COLUMN dpa_accepted_at DATETIME NULL DEFAULT NULL");
            console.log("✅ Auto-migrated: Added dpa_accepted and dpa_accepted_at to users table.");
        }

        // Future cash occupants start unpaid; preserve all explicitly recorded statuses.
        const [upfrontCols] = await pool.query("SHOW COLUMNS FROM occupants LIKE 'upfront_status'");
        if (!upfrontCols.length) {
            await pool.query("ALTER TABLE occupants ADD COLUMN upfront_status VARCHAR(50) DEFAULT 'Unpaid'");
        } else if (upfrontCols[0].Default !== 'Unpaid') {
            await pool.query("ALTER TABLE occupants ALTER COLUMN upfront_status SET DEFAULT 'Unpaid'");
        }

        // Deadlines apply only when explicitly assigned; historical bookings remain unchanged.
        for (const [column, definition] of [["renewal_notice_checkout","DATE NULL"],["renewal_response_due_at","DATETIME NULL"],["renewal_response","VARCHAR(20) NULL"],["renewal_waiting","TINYINT(1) NOT NULL DEFAULT 0"],["renewal_wait_until","DATETIME NULL"],["renewal_sources","TEXT NULL"],['cancellation_review','TEXT NULL'],['move_in_required','TINYINT(1) NOT NULL DEFAULT 0'],['move_in_confirmed_at','DATETIME NULL'],['occupancy_auto_started','TINYINT(1) NOT NULL DEFAULT 0'],['occupancy_start_issue','VARCHAR(255) NULL'],['payment_review_reason','TEXT NULL'],['payment_review_required','TINYINT(1) NOT NULL DEFAULT 0'],['owner_response_due_at','DATETIME NULL'],['payment_due_at','DATETIME NULL'],['expired_at','DATETIME NULL'],['expiry_reason','VARCHAR(40) NULL'],['upfront_amount','DECIMAL(10,2) NULL']]) {
            const [columns] = await pool.query('SHOW COLUMNS FROM bookings LIKE ?', [column]);
            if (!columns.length) await pool.query('ALTER TABLE bookings ADD COLUMN ' + column + ' ' + definition);
        }

        // An automatically started stay is a scheduled stay until the owner confirms arrival.
        // Open automatic stays that predate this column are marked as awaiting arrival.
        const [arrivalCols] = await pool.query("SHOW COLUMNS FROM occupants LIKE 'arrival_required'");
        if (!arrivalCols.length) {
            await pool.query('ALTER TABLE occupants ADD COLUMN arrival_required TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN arrival_confirmed_at DATETIME NULL');
            await pool.query(`UPDATE occupants o JOIN bookings b ON o.reference_no = CONCAT('REF-', LPAD(b.id, GREATEST(4,CHAR_LENGTH(b.id)), '0'))
                SET o.arrival_required = 1 WHERE b.occupancy_auto_started = 1 AND (o.check_out_date IS NULL OR o.check_out_date > CURDATE())`);
        }

        // Paid stays whose student never arrives: an owner attendance record, then a terminal 'not_arrived' status.
        // Appending an ENUM value is metadata-only in MySQL 8.0; existing rows are untouched.
        const [nonArrivalCols] = await pool.query("SHOW COLUMNS FROM occupants LIKE 'non_arrival_recorded_at'");
        if (!nonArrivalCols.length) await pool.query('ALTER TABLE occupants ADD COLUMN non_arrival_recorded_at DATETIME NULL, ADD COLUMN non_arrival_note VARCHAR(500) NULL');
        const [statusCol] = await pool.query("SHOW COLUMNS FROM bookings LIKE 'status'");
        if (statusCol.length && !String(statusCol[0].Type).includes("'not_arrived'")) {
            await pool.query("ALTER TABLE bookings MODIFY COLUMN status ENUM('pending','confirmed','cancelled','rejected','completed','not_arrived') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pending'");
        }

        // Booking/occupant links match on reference_no; without an index each check scans, and locking reads lock, every occupant row.
        const [referenceIndex] = await pool.query("SHOW INDEX FROM occupants WHERE Key_name = 'occupants_reference_no'");
        if (!referenceIndex.length) await pool.query('ALTER TABLE occupants ADD KEY occupants_reference_no (reference_no)');

        const [criteriaCols] = await pool.query("SHOW COLUMNS FROM checklist_criteria LIKE 'is_active'");
        if (!criteriaCols.length) await pool.query("ALTER TABLE checklist_criteria ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");

        const [categoryCols] = await pool.query("SHOW COLUMNS FROM checklist_criteria LIKE 'requirement_type'");
        if (!categoryCols.length) await pool.query("ALTER TABLE checklist_criteria ADD COLUMN requirement_type ENUM('required','supplementary') NOT NULL DEFAULT 'supplementary'");

        for (const [column, definition] of [['floor_label', 'VARCHAR(60) NULL'], ['description', 'TEXT NULL'], ['amenities', 'JSON NULL'], ['amenities_free', 'JSON NULL'], ['amenities_paid', 'JSON NULL'], ['photos', 'JSON NULL']]) {
            const [columns] = await pool.query('SHOW COLUMNS FROM rooms LIKE ?', [column]);
            if (!columns.length) await pool.query('ALTER TABLE rooms ADD COLUMN ' + column + ' ' + definition);
        }

        const [documentFileCols] = await pool.query("SHOW COLUMNS FROM house_documents LIKE 'file_paths'");
        if (!documentFileCols.length) await pool.query("ALTER TABLE house_documents ADD COLUMN file_paths JSON NULL");

        const [roomCols] = await pool.query("SHOW COLUMNS FROM rooms LIKE 'deleted_at'");
        if (roomCols.length === 0) {
            await pool.query("ALTER TABLE rooms ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL");
            console.log("✅ Auto-migrated: Added deleted_at to rooms table for soft deletes.");
        }

        const [docCols] = await pool.query("SHOW COLUMNS FROM boarding_houses LIKE 'last_updated_document'");
        if (docCols.length > 0 && docCols[0].Type.toLowerCase().includes('varchar(50)')) {
            await pool.query("ALTER TABLE boarding_houses MODIFY COLUMN last_updated_document VARCHAR(255)");
            console.log("✅ Auto-migrated: Expanded last_updated_document in boarding_houses table to VARCHAR(255).");
        }

        const [archByCols] = await pool.query("SHOW COLUMNS FROM boarding_houses LIKE 'archived_by'");
        if (archByCols.length === 0) {
            await pool.query("ALTER TABLE boarding_houses ADD COLUMN archived_by VARCHAR(50) DEFAULT NULL, ADD COLUMN archive_reason TEXT DEFAULT NULL, ADD COLUMN archived_at DATETIME DEFAULT NULL");
            console.log("✅ Auto-migrated: Added archived_by, archive_reason, and archived_at columns to boarding_houses table.");
        }

        const [refCols] = await pool.query("SHOW COLUMNS FROM boarding_houses LIKE 'reference_no'");
        if (refCols.length === 0) {
            await pool.query("ALTER TABLE boarding_houses ADD COLUMN reference_no VARCHAR(30) NULL DEFAULT NULL, ADD UNIQUE KEY reference_no (reference_no)");
            console.log("✅ Auto-migrated: Added reference_no to boarding_houses table for property-first owner registration.");
        }

        // Every file uploaded for a legal document (images or PDF). The first file is also
        // kept in the boarding_houses permit column so existing compliance logic is unchanged.
        await pool.query(`CREATE TABLE IF NOT EXISTS house_permit_files (
            id INT NOT NULL AUTO_INCREMENT,
            house_id INT NOT NULL,
            permit_key VARCHAR(50) NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY house_permit (house_id, permit_key),
            CONSTRAINT house_permit_files_house FOREIGN KEY (house_id) REFERENCES boarding_houses (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);

        await ensureApplicationTrackingSchema();
    } catch (err) {
        console.warn("⚠️ Auto-migration check warning:", err.message);
    }
    await ensureSiteContentTables();
}

// Accountless application tracking (all additive and nullable, so existing rows stay valid):
// - users.applicant_key_hash: unused since tracking uses the reference number only (kept for compatibility)
// - boarding_houses.application_status: application workflow status (NULL for legacy rows)
// - house_photos.category: gallery photo category (NULL = uncategorised / legacy)
// - application_status_history: audit trail of status changes with a snapshot of the application
// - account_activation_tokens: one-time owner account activation links (hashed)
async function ensureApplicationTrackingSchema() {
    const addColumn = async (table, column, definition) => {
        const [cols] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
        if (cols.length === 0) {
            await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            console.log(`✅ Auto-migrated: Added ${column} to ${table}.`);
        }
    };
    await addColumn('users', 'applicant_key_hash', 'VARCHAR(255) NULL DEFAULT NULL');
    await addColumn('boarding_houses', 'application_status', 'VARCHAR(30) NULL DEFAULT NULL');
    await addColumn('house_photos', 'category', 'VARCHAR(30) NULL DEFAULT NULL');

    await pool.query(`CREATE TABLE IF NOT EXISTS application_status_history (
        id INT NOT NULL AUTO_INCREMENT,
        house_id INT NOT NULL,
        from_status VARCHAR(30) NULL DEFAULT NULL,
        to_status VARCHAR(30) NOT NULL,
        remarks TEXT NULL,
        actor_type VARCHAR(20) NOT NULL,
        actor_id INT NULL DEFAULT NULL,
        snapshot JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY application_status_history_house (house_id, created_at),
        CONSTRAINT application_status_history_house FOREIGN KEY (house_id) REFERENCES boarding_houses (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);

    await pool.query(`CREATE TABLE IF NOT EXISTS account_activation_tokens (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY account_activation_token_hash (token_hash),
        KEY account_activation_user (user_id),
        CONSTRAINT account_activation_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);

    // "Remember this device" for Track My Application: only the token hash is stored; revocable
    await pool.query(`CREATE TABLE IF NOT EXISTS applicant_tracking_sessions (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL DEFAULT NULL,
        last_used_at DATETIME NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY applicant_tracking_token_hash (token_hash),
        KEY applicant_tracking_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
}

// Landing page content (Admin > Landing page). Defaults are seeded only when the
// features table is first created, so an admin who removes every card is not overridden
// on the next restart. Missing setting keys are filled without touching edited ones.
async function ensureSiteContentTables() {
    try {
        const [featureTables] = await pool.query("SHOW TABLES LIKE 'site_features'");
        if (featureTables.length === 0) {
            await pool.query(`CREATE TABLE IF NOT EXISTS site_features (
                id INT NOT NULL AUTO_INCREMENT,
                title VARCHAR(120) NOT NULL,
                description VARCHAR(500) NOT NULL,
                icon VARCHAR(50) NOT NULL DEFAULT 'shield-halved',
                sort_order INT NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
            const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM site_features');
            if (count === 0) {
                await pool.query(
                    'INSERT INTO site_features (title, description, icon, sort_order) VALUES ?',
                    [DEFAULT_FEATURES.map((f, i) => [f.title, f.description, f.icon, i + 1])]
                );
            }
            console.log("✅ Auto-migrated: Created site_features with the default landing page features.");
        }

        await pool.query(`CREATE TABLE IF NOT EXISTS site_settings (
            setting_key VARCHAR(64) NOT NULL,
            setting_value TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
        await pool.query(
            'INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES ?',
            [Object.entries(SITE_SETTING_DEFAULTS)]
        );
    } catch (err) {
        console.warn("⚠️ Landing page content tables check warning:", err.message);
    }
}

// Fire the self-healing test on startup
testConnection();

export default pool;