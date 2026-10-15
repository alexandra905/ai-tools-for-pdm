const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const slotTimes = ['09:00', '11:00', '13:00', '15:00', '17:00'];
const dataDirectory = path.join(__dirname, 'data');
const databasePath = process.env.BORIS_DATABASE_PATH
  ? path.resolve(process.env.BORIS_DATABASE_PATH)
  : path.join(dataDirectory, 'boris.sqlite');

function getCurrentDate() {
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .formatToParts(new Date())
    .reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function initializeDatabase() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS walk_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      walk_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      booked_by TEXT,
      booked_at TEXT,
      UNIQUE (walk_date, slot_time),
      CHECK (
        (booked_by IS NULL AND booked_at IS NULL)
        OR
        (booked_by IS NOT NULL AND booked_at IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS feedings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_name TEXT NOT NULL,
      fed_at TEXT NOT NULL
    );
  `);

  return database;
}

const database = initializeDatabase();

function ensureWalkSlots(walkDate = getCurrentDate()) {
  const addFreeSlot = database.prepare(`
    INSERT OR IGNORE INTO walk_slots (walk_date, slot_time, booked_by, booked_at)
    VALUES (?, ?, NULL, NULL)
  `);

  for (const slotTime of slotTimes) {
    addFreeSlot.run(walkDate, slotTime);
  }
}

ensureWalkSlots();

function getWalkSlots(walkDate = getCurrentDate()) {
  ensureWalkSlots(walkDate);

  return database.prepare(`
    SELECT slot_time AS slotTime, booked_by AS bookedBy
    FROM walk_slots
    WHERE walk_date = ?
    ORDER BY slot_time
  `).all(walkDate);
}

function bookWalkSlot(slotTime, employeeName) {
  if (!slotTimes.includes(slotTime)) {
    return { status: 'invalid_slot' };
  }

  const cleanEmployeeName = typeof employeeName === 'string' ? employeeName.trim() : '';

  if (!cleanEmployeeName) {
    return { status: 'invalid_name' };
  }

  const walkDate = getCurrentDate();
  ensureWalkSlots(walkDate);

  const result = database.prepare(`
    UPDATE walk_slots
    SET booked_by = ?, booked_at = ?
    WHERE walk_date = ?
      AND slot_time = ?
      AND booked_by IS NULL
      AND booked_at IS NULL
  `).run(cleanEmployeeName, new Date().toISOString(), walkDate, slotTime);

  return result.changes === 1 ? { status: 'booked' } : { status: 'conflict' };
}

function getLastFeeding() {
  return database.prepare(`
    SELECT employee_name AS employeeName, fed_at AS fedAt
    FROM feedings
    ORDER BY fed_at DESC, id DESC
    LIMIT 1
  `).get() || null;
}

function addFeeding(employeeName) {
  const cleanEmployeeName = typeof employeeName === 'string' ? employeeName.trim() : '';

  if (!cleanEmployeeName) {
    return { status: 'invalid_name' };
  }

  const feeding = {
    employeeName: cleanEmployeeName,
    fedAt: new Date().toISOString()
  };

  database.prepare(`
    INSERT INTO feedings (employee_name, fed_at)
    VALUES (?, ?)
  `).run(feeding.employeeName, feeding.fedAt);

  return { status: 'created', feeding };
}

module.exports = {
  addFeeding,
  bookWalkSlot,
  database,
  databasePath,
  ensureWalkSlots,
  getCurrentDate,
  getLastFeeding,
  getWalkSlots,
  slotTimes
};
