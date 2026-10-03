// =============================================================

// Main Express server: handles API routes, authentication,
// file storage fallback, Socket.IO real-time events, and
// static file serving for the public/ folder.
// =============================================================

// Load environment variables from .env file (if present)
require('dotenv').config();


const express = require('express');       // Web framework
const cors    = require('cors');          // Cross-Origin Resource Sharing
const mysql   = require('mysql2/promise');// MySQL async driver
const http    = require('http');          // Native HTTP server
const { Server } = require('socket.io'); // WebSocket / real-time events
const bcrypt  = require('bcryptjs');      // Password hashing
const jwt     = require('jsonwebtoken'); // JSON Web Token auth
const fs      = require('fs');            // File-system access
const path    = require('path');          // Path utilities


const app    = express();
const server = http.createServer(app);
// Allow any origin for Socket.IO connections
const io     = new Server(server, { cors: { origin: '*' } });



const JWT_SECRET = process.env.JWT_SECRET || 'ishare_secret_2026';

const PORT    = process.env.PORT || 3001;
// Directory where all JSON data files are stored
const DATA_DIR = path.join(__dirname, 'data');

// Mapping of logical keys to physical JSON file paths
const FILES = {
  users:         path.join(DATA_DIR, 'users.json'),
  notes:         path.join(DATA_DIR, 'notes.json'),
  announcements: path.join(DATA_DIR, 'announcements.json'),
  messages:      path.join(DATA_DIR, 'messages.json'),
  notifications: path.join(DATA_DIR, 'notifications.json'),
  departments:   path.join(DATA_DIR, 'departments.json'),
  subjects:      path.join(DATA_DIR, 'subjects.json'),
  likes:         path.join(DATA_DIR, 'likes.json'),
  downloads:     path.join(DATA_DIR, 'downloads.json')
};


app.use(cors());           // Enable CORS for all routes
app.use(express.json());   // Parse incoming JSON request bodies

// Serve static files (HTML pages, CSS, JS) from the public/ directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root "/" to the main login page
app.get('/', (req, res) => {
  res.redirect('/pages/index.html');
});


let useMySQL = false; // Flag: true if MySQL connection succeeded
let pool;             // MySQL connection pool (if MySQL is used)


// IIFE: immediately invoked async function that starts the server
(async function main() {
  // Try to connect to MySQL if DB_HOST env variable is set
  try {
    if (process.env.DB_HOST || process.env.USE_MYSQL === 'true') {
      pool = mysql.createPool({
        host:           process.env.DB_HOST     || 'localhost',
        user:           process.env.DB_USER     || 'root',
        password:       process.env.DB_PASSWORD || '',
        database:       process.env.DB_NAME     || 'ishare_db',
        connectTimeout: 2000
      });
      // Verify connection with a simple query
      await pool.query('SELECT 1');
      useMySQL = true;
      console.log('MySQL connected successfully');
    } else {
      console.log('No DB_HOST specified, using file storage fallback');
    }
  } catch (err) {
    // If MySQL fails, automatically switch to file-based storage
    console.warn('MySQL not available, falling back to file storage:', err.message);
    useMySQL = false;
  }

  // Initialize database tables or JSON data files
  await initDb();

  // Socket.IO: log client connections and disconnections
  io.on('connection', (socket) => {
    console.log('Client connected');
    socket.on('disconnect', () => console.log('Client disconnected'));
  });

  // Start listening on the configured port
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();

// =============================================================

// =============================================================

/**
 * Read a JSON data file by key (e.g. 'users', 'notes').
 * Returns an empty array if the file doesn't exist or is malformed.
 */
function readFile(key) {
  try { return JSON.parse(fs.readFileSync(FILES[key], 'utf-8')); } catch { return []; }
}

/**
 * Write data array to a JSON file by key (pretty-printed).
 */
function writeFile(key, data) { fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2)); }

/**
 * Generate the next auto-increment ID for a given array of records.
 * Returns 1 if the array is empty.
 */
function nextId(arr) { return arr.length > 0 ? Math.max(...arr.map(i => i.id)) + 1 : 1; }

/**
 * Strip the password field from a user object before sending to client.
 * Prevents accidental password leakage in API responses.
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

/**
 * Returns the current UTC time as an ISO 8601 string.
 * Used as a consistent timestamp for all new records.
 */
function nowISO() { return new Date().toISOString(); }

// =============================================================

// =============================================================

/**
 * JWT authentication middleware.
 * Reads the Bearer token from the Authorization header,
 * verifies it, and attaches the decoded payload to req.user.
 * Returns 401 if the token is missing or invalid.
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ success: false, message: 'No token provided' });
  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach user payload to request
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// =============================================================

// =============================================================

/**
 * initDb(): Sets up the database on first run.
 * - File storage: creates /data directory, default JSON files,
 *   and a default admin user.
 * - MySQL: creates all required tables and inserts an admin user
 *   if one doesn't already exist.
 */
async function initDb() {
  if (!useMySQL) {
    // --- File Storage Mode ---
    // Ensure the /data directory exists
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    // Seed default departments and subjects if files don't exist
    const defaults = {
      departments: [
        { id: 1, code: 'BCSE',  name: 'Computer Science & Engineering',    enabled: true },
        { id: 2, code: 'BSEEE', name: 'Electrical & Electronic Engineering', enabled: true },
        { id: 3, code: 'BBA',   name: 'Business Administration',            enabled: true },
        { id: 4, code: 'BSCE',  name: 'Civil Engineering',                  enabled: true }
      ],
      subjects: [
        { id: 1, name: 'Algorithms',       department: 'Computer Science & Engineering' },
        { id: 2, name: 'Operating Systems', department: 'Computer Science & Engineering' }
      ]
    };
    for (const [key, val] of Object.entries(defaults)) {
      if (!fs.existsSync(FILES[key])) writeFile(key, val);
    }

    // Read admin credentials from environment variables or use defaults
    const adminStudentId = process.env.ADMIN_STUDENT_ID || '123456';
    const adminEmail     = process.env.ADMIN_EMAIL      || 'admin@ishare.com';
    const adminPassword  = process.env.ADMIN_PASSWORD   || 'admin123';
    const adminFullname  = process.env.ADMIN_FULLNAME   || 'System Admin';

    // Hash the admin password with bcrypt (10 salt rounds)
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

    // Create the default admin user record
    const adminUser = {
      id: 1,
      studentId:   adminStudentId,
      fullname:    adminFullname,
      email:       adminEmail,
      department:  'Administration',
      password:    hashedAdminPassword,
      accountType: 'admin',
      status:      'active',
      createdAt:   nowISO()
    };

    // Always overwrite users file with fresh admin on startup
    writeFile('users', [adminUser]);
    console.log('Admin user created in file storage with student ID:', adminStudentId, 'email:', adminEmail);
    console.log('File storage initialized (fallback)');
    return;
  }

  // --- MySQL Mode ---
  try {
    // Create database if it does not exist
    await pool.query('CREATE DATABASE IF NOT EXISTS ishare_db');
    await pool.query('USE ishare_db');

    // Create all required tables if they don't exist
    await pool.query(`CREATE TABLE IF NOT EXISTS registrations (id INT PRIMARY KEY AUTO_INCREMENT, studentId VARCHAR(50) UNIQUE NOT NULL, fullname VARCHAR(100) NOT NULL, email VARCHAR(100) NOT NULL, department VARCHAR(100) NOT NULL, registeredAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, status VARCHAR(20) DEFAULT 'completed')`);
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY AUTO_INCREMENT, studentId VARCHAR(50) UNIQUE NOT NULL, fullname VARCHAR(100) NOT NULL, email VARCHAR(100) UNIQUE NOT NULL, department VARCHAR(100) NOT NULL, password VARCHAR(255) NOT NULL, accountType VARCHAR(20) DEFAULT 'student', status VARCHAR(20) DEFAULT 'active', createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS notes (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(255) NOT NULL, courseCode VARCHAR(50), description TEXT, fileType VARCHAR(20), url VARCHAR(500), authorId INT, author VARCHAR(100), department VARCHAR(100), downloads INT DEFAULT 0, likes INT DEFAULT 0, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS announcements (id INT PRIMARY KEY AUTO_INCREMENT, title VARCHAR(255) NOT NULL, body TEXT, createdBy VARCHAR(100), createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (id INT PRIMARY KEY AUTO_INCREMENT, senderId INT NOT NULL, receiverId INT NOT NULL, text TEXT, time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, conversationKey VARCHAR(100))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications (id INT PRIMARY KEY AUTO_INCREMENT, userId INT NOT NULL, title VARCHAR(255), message TEXT, type VARCHAR(50), time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, read BOOLEAN DEFAULT FALSE, relatedId INT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS departments (id INT PRIMARY KEY AUTO_INCREMENT, code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(100) NOT NULL, enabled BOOLEAN DEFAULT TRUE)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS subjects (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL, department VARCHAR(100))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS likes (id INT PRIMARY KEY AUTO_INCREMENT, userId INT NOT NULL, noteId INT NOT NULL, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS downloads (id INT PRIMARY KEY AUTO_INCREMENT, userId INT NOT NULL, noteId INT NOT NULL, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    console.log('Database initialized successfully');

    // Seed the admin user if one doesn't exist yet
    const adminStudentId = process.env.ADMIN_STUDENT_ID || '123456';
    const adminEmail     = process.env.ADMIN_EMAIL      || 'admin@ishare.com';
    const adminPassword  = process.env.ADMIN_PASSWORD   || 'admin123';
    const adminFullname  = process.env.ADMIN_FULLNAME   || 'System Admin';
    const [adminExists] = await pool.query('SELECT id FROM users WHERE studentId = ? LIMIT 1', [adminStudentId]);
    if (!adminExists.length) {
      const hashed = await bcrypt.hash(adminPassword, 10);
      await pool.query(
        'INSERT INTO users (studentId, fullname, email, department, password, accountType) VALUES (?, ?, ?, ?, ?, ?)',
        [adminStudentId, adminFullname, adminEmail, 'Administration', hashed, 'admin']
      );
      console.log('Admin user created with student ID:', adminStudentId, 'email:', adminEmail);
    } else {
      console.log('Admin user already exists with student ID:', adminStudentId);
    }
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// =============================================================

// =============================================================

/**
 * POST /api/auth/register
 * Register a new student account.
 * Body: { studentId, fullname, email, department, password }
 * Returns: JWT token + sanitized user object
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { studentId, fullname, email, department, password } = req.body;
    // Validate all required fields are present
    if (!studentId || !fullname || !email || !department || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    // Hash the password before storing
    const hashed = await bcrypt.hash(password, 10);

    if (useMySQL) {
      try {
        // Insert user and registration records into MySQL
        const [result] = await pool.query(
          'INSERT INTO users (studentId, fullname, email, department, password) VALUES (?, ?, ?, ?, ?)',
          [studentId, fullname, email, department, hashed]
        );
        await pool.query(
          'INSERT INTO registrations (studentId, fullname, email, department, status) VALUES (?, ?, ?, ?, ?)',
          [studentId, fullname, email, department, 'completed']
        );
        // Issue a 7-day JWT token for the new user
        const token = jwt.sign({ id: result.insertId, studentId, email, department, accountType: 'student' }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, data: { token, user: { id: result.insertId, studentId, fullname, email, department, accountType: 'student' } } });
      } catch (err) {
        // Handle duplicate student ID or email error from MySQL
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ success: false, message: 'Student ID or email already exists' });
        }
        return res.status(500).json({ success: false, message: err.message });
      }
    }

    // --- File Storage Mode ---
    let users = readFile('users');
    // Check for duplicate student ID or email
    if (users.find(u => u.studentId === studentId || u.email === email)) {
      return res.status(400).json({ success: false, message: 'Student ID or email already exists' });
    }
    // Build new user record with auto-increment ID
    const newUser = {
      id: nextId(users),
      studentId,
      fullname,
      email,
      department,
      password: hashed,
      accountType: 'student',
      status:      'active',
      createdAt:   nowISO()
    };
    users.push(newUser);
    writeFile('users', users);
    // Sign and return JWT
    const token = jwt.sign({ id: newUser.id, studentId, email, department, accountType: 'student' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, data: { token, user: sanitizeUser(newUser) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/login
 * Authenticate a student user.
 * Body: { studentId, password }
 * Returns: JWT token + sanitized user object
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { studentId, password } = req.body;
    if (useMySQL) {
      // Look up user by student ID in MySQL
      const [rows] = await pool.query('SELECT * FROM users WHERE studentId = ?', [studentId]);
      const user = rows[0];
      if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });
      // Verify hashed password
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ success: false, message: 'Invalid credentials' });
      const token = jwt.sign({ id: user.id, studentId: user.studentId, email: user.email, department: user.department, accountType: user.accountType }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, data: { token, user: sanitizeUser(user) } });
    }
    // --- File Storage Mode ---
    const users = readFile('users');
    const user = users.find(u => u.studentId === studentId);
    if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, studentId: user.studentId, email: user.email, department: user.department, accountType: user.accountType }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, data: { token, user: sanitizeUser(user) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/auth/admin/login
 * Authenticate an admin user (by email or student ID).
 * Body: { email?, studentId?, password }
 * Returns: JWT token + sanitized admin user
 */
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password, studentId } = req.body;
    if (useMySQL) {
      let rows;
      // Allow admin login via student ID or email
      if (studentId) {
        [rows] = await pool.query('SELECT * FROM users WHERE studentId = ? AND accountType = ?', [studentId, 'admin']);
      } else if (email) {
        [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND accountType = ?', [email, 'admin']);
      } else {
        return res.status(400).json({ success: false, message: 'Email or Student ID is required' });
      }
      const user = rows[0];
      if (!user) return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
      const token = jwt.sign({ id: user.id, studentId: user.studentId, email: user.email, department: user.department, accountType: user.accountType }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, data: { token, user: sanitizeUser(user) } });
    }
    // --- File Storage Mode ---
    const users = readFile('users');
    // Find admin by studentId or email, ensuring accountType === 'admin'
    const user = users.find(u => (studentId ? u.studentId === studentId : u.email === email) && u.accountType === 'admin');
    if (!user) return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid admin credentials' });
    const token = jwt.sign({ id: user.id, studentId: user.studentId, email: user.email, department: user.department, accountType: user.accountType }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, data: { token, user: sanitizeUser(user) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 * Requires: Authorization Bearer token
 */
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      const [rows] = await pool.query('SELECT id, studentId, fullname, email, department, accountType, status FROM users WHERE id = ?', [req.user.id]);
      const user = rows[0];
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({ success: true, data: user });
    }
    // --- File Storage Mode ---
    const users = readFile('users');
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/users
 * Returns a list of all users (passwords stripped).
 * Requires: Auth token
 */
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      const [rows] = await pool.query('SELECT id, studentId, fullname, email, department, accountType, status, createdAt FROM users');
      return res.json({ success: true, data: rows });
    }
    const users = readFile('users').map(sanitizeUser);
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/users/:id
 * Returns a single user by ID (password stripped).
 * Requires: Auth token
 */
app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      const [rows] = await pool.query('SELECT id, studentId, fullname, email, department, accountType, status, createdAt FROM users WHERE id = ?', [req.params.id]);
      const user = rows[0];
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({ success: true, data: user });
    }
    const users = readFile('users');
    const user = users.find(u => u.id === parseInt(req.params.id));
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/users/:id
 * Update a user's profile fields (fullname, email, department, status).
 * Requires: Auth token
 */
app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const { fullname, email, department, status } = req.body;
    if (useMySQL) {
      const [result] = await pool.query(
        'UPDATE users SET fullname = ?, email = ?, department = ?, status = ? WHERE id = ?',
        [fullname, email, department, status, req.params.id]
      );
      return res.json({ success: true, data: { affectedRows: result.affectedRows } });
    }
    // --- File Storage Mode ---
    let users = readFile('users');
    const idx = users.findIndex(u => u.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'User not found' });
    users[idx] = { ...users[idx], fullname, email, department, status };
    writeFile('users', users);
    res.json({ success: true, data: { affectedRows: 1 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/users/:id
 * Permanently deletes a user by ID.
 * Requires: Auth token
 */
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
      return res.json({ success: true, data: { deleted: true } });
    }
    // --- File Storage Mode ---
    let users = readFile('users');
    const before = users.length;
    users = users.filter(u => u.id !== parseInt(req.params.id));
    if (users.length === before) return res.status(404).json({ success: false, message: 'User not found' });
    writeFile('users', users);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/notes
 * Returns all notes, optionally filtered by ?department=...
 * Sorted by creation date descending (newest first).
 */
app.get('/api/notes', async (req, res) => {
  try {
    const { department } = req.query;
    if (useMySQL) {
      let sql = 'SELECT * FROM notes';
      const params = [];
      if (department) { sql += ' WHERE department = ?'; params.push(department); }
      sql += ' ORDER BY createdAt DESC';
      const [rows] = await pool.query(sql, params);
      return res.json({ success: true, data: rows });
    }
    // --- File Storage Mode ---
    let notes = readFile('notes');
    if (department) notes = notes.filter(n => n.department === department);
    notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notes
 * Create a new note. Emits 'note:new' Socket.IO event.
 * Requires: Auth token
 * Body: { title, courseCode, description, fileType, url, department }
 */
app.post('/api/notes', authMiddleware, async (req, res) => {
  try {
    const { title, courseCode, description, fileType, url, department } = req.body;
    const author = req.user.studentId || req.user.email; // Use student ID as author label
    if (useMySQL) {
      const [result] = await pool.query(
        'INSERT INTO notes (title, courseCode, description, fileType, url, authorId, author, department) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [title, courseCode, description, fileType, url, req.user.id, author, department]
      );
      const note = { id: result.insertId, title, courseCode, description, fileType, url, authorId: req.user.id, author, department, downloads: 0, likes: 0 };
      io.emit('note:new', note); // Broadcast new note to all connected clients
      return res.json({ success: true, data: note });
    }
    // --- File Storage Mode ---
    const notes = readFile('notes');
    const note = {
      id: nextId(notes),
      title,
      courseCode,
      description,
      fileType,
      url,
      authorId:  req.user.id,
      author,
      department,
      downloads: 0,
      likes:     0,
      createdAt: nowISO()
    };
    notes.push(note);
    writeFile('notes', notes);
    io.emit('note:new', note); // Broadcast to all connected Socket.IO clients
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/notes/:id
 * Returns a single note by ID.
 */
app.get('/api/notes/:id', async (req, res) => {
  try {
    if (useMySQL) {
      const [rows] = await pool.query('SELECT * FROM notes WHERE id = ?', [req.params.id]);
      const note = rows[0];
      if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
      return res.json({ success: true, data: note });
    }
    const notes = readFile('notes');
    const note = notes.find(n => n.id === parseInt(req.params.id));
    if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/notes/:id
 * Update note metadata (title, courseCode, description, fileType, url, department).
 * Requires: Auth token
 */
app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    const { title, courseCode, description, fileType, url, department } = req.body;
    if (useMySQL) {
      const [result] = await pool.query(
        'UPDATE notes SET title = ?, courseCode = ?, description = ?, fileType = ?, url = ?, department = ? WHERE id = ?',
        [title, courseCode, description, fileType, url, department, req.params.id]
      );
      return res.json({ success: true, data: { affectedRows: result.affectedRows } });
    }
    let notes = readFile('notes');
    const idx = notes.findIndex(n => n.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Note not found' });
    notes[idx] = { ...notes[idx], title, courseCode, description, fileType, url, department };
    writeFile('notes', notes);
    res.json({ success: true, data: { affectedRows: 1 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/notes/:id
 * Permanently delete a note by ID.
 * Requires: Auth token
 */
app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      await pool.query('DELETE FROM notes WHERE id = ?', [req.params.id]);
      return res.json({ success: true, data: { deleted: true } });
    }
    let notes = readFile('notes');
    const before = notes.length;
    notes = notes.filter(n => n.id !== parseInt(req.params.id));
    if (notes.length === before) return res.status(404).json({ success: false, message: 'Note not found' });
    writeFile('notes', notes);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notes/:id/like
 * Toggle a like on a note. If already liked, removes the like (unlike).
 * Emits 'note:like' or 'note:unlike' Socket.IO event.
 * Requires: Auth token
 */
app.post('/api/notes/:id/like', authMiddleware, async (req, res) => {
  try {
    const noteId = parseInt(req.params.id);
    const userId = req.user.id;
    if (useMySQL) {
      // Check if this user already liked this note
      const [existing] = await pool.query('SELECT id FROM likes WHERE userId = ? AND noteId = ?', [userId, noteId]);
      if (existing.length > 0) {
        // Unlike: remove like record and decrement count
        await pool.query('DELETE FROM likes WHERE userId = ? AND noteId = ?', [userId, noteId]);
        await pool.query('UPDATE notes SET likes = likes - 1 WHERE id = ?', [noteId]);
        io.emit('note:unlike', { noteId, userId });
        return res.json({ success: true, data: { liked: false } });
      } else {
        // Like: add like record and increment count
        await pool.query('INSERT INTO likes (userId, noteId) VALUES (?, ?)', [userId, noteId]);
        await pool.query('UPDATE notes SET likes = likes + 1 WHERE id = ?', [noteId]);
        io.emit('note:like', { noteId, userId });
        return res.json({ success: true, data: { liked: true } });
      }
    }
    // --- File Storage Mode ---
    let likes = readFile('likes');
    const existing = likes.find(l => l.userId === userId && l.noteId === noteId);
    let notes = readFile('notes');
    const noteIdx = notes.findIndex(n => n.id === noteId);
    if (noteIdx === -1) return res.status(404).json({ success: false, message: 'Note not found' });
    if (existing) {
      // Remove the like
      likes = likes.filter(l => !(l.userId === userId && l.noteId === noteId));
      notes[noteIdx].likes = Math.max(0, (notes[noteIdx].likes || 0) - 1);
      io.emit('note:unlike', { noteId, userId });
      writeFile('likes', likes);
      writeFile('notes', notes);
      return res.json({ success: true, data: { liked: false } });
    } else {
      // Add the like
      likes.push({ id: nextId(likes), userId, noteId, createdAt: nowISO() });
      notes[noteIdx].likes = (notes[noteIdx].likes || 0) + 1;
      io.emit('note:like', { noteId, userId });
      writeFile('likes', likes);
      writeFile('notes', notes);
      return res.json({ success: true, data: { liked: true } });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/notes/:id/download
 * Records a download event and increments the note's download counter.
 * Emits 'note:download' Socket.IO event.
 * Requires: Auth token
 */
app.post('/api/notes/:id/download', authMiddleware, async (req, res) => {
  try {
    const noteId = parseInt(req.params.id);
    if (useMySQL) {
      await pool.query('INSERT INTO downloads (userId, noteId) VALUES (?, ?)', [req.user.id, noteId]);
      await pool.query('UPDATE notes SET downloads = downloads + 1 WHERE id = ?', [noteId]);
      io.emit('note:download', { noteId, userId: req.user.id });
      return res.json({ success: true, data: { downloaded: true } });
    }
    // --- File Storage Mode ---
    let downloads = readFile('downloads');
    downloads.push({ id: nextId(downloads), userId: req.user.id, noteId, createdAt: nowISO() });
    let notes = readFile('notes');
    const noteIdx = notes.findIndex(n => n.id === noteId);
    if (noteIdx === -1) return res.status(404).json({ success: false, message: 'Note not found' });
    notes[noteIdx].downloads = (notes[noteIdx].downloads || 0) + 1;
    io.emit('note:download', { noteId, userId: req.user.id });
    writeFile('downloads', downloads);
    writeFile('notes', notes);
    res.json({ success: true, data: { downloaded: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/announcements
 * Returns all announcements sorted by newest first.
 */
app.get('/api/announcements', async (req, res) => {
  try {
    if (useMySQL) {
      const [rows] = await pool.query('SELECT * FROM announcements ORDER BY createdAt DESC');
      return res.json({ success: true, data: rows });
    }
    const announcements = readFile('announcements');
    announcements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data: announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/announcements
 * Create a new announcement. Emits 'announcement:new' Socket.IO event.
 * Requires: Auth token
 * Body: { title, body }
 */
app.post('/api/announcements', authMiddleware, async (req, res) => {
  try {
    const { title, body } = req.body;
    const createdBy = req.user.studentId || req.user.email;
    if (useMySQL) {
      const [result] = await pool.query('INSERT INTO announcements (title, body, createdBy) VALUES (?, ?, ?)', [title, body, createdBy]);
      const announcement = { id: result.insertId, title, body, createdBy };
      io.emit('announcement:new', announcement);
      return res.json({ success: true, data: announcement });
    }
    const announcements = readFile('announcements');
    const announcement = { id: nextId(announcements), title, body, createdBy, createdAt: nowISO() };
    announcements.push(announcement);
    writeFile('announcements', announcements);
    io.emit('announcement:new', announcement);
    res.json({ success: true, data: announcement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/announcements/:id
 * Update announcement title and body.
 * Requires: Auth token
 */
app.put('/api/announcements/:id', authMiddleware, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (useMySQL) {
      const [result] = await pool.query('UPDATE announcements SET title = ?, body = ? WHERE id = ?', [title, body, req.params.id]);
      return res.json({ success: true, data: { affectedRows: result.affectedRows } });
    }
    let announcements = readFile('announcements');
    const idx = announcements.findIndex(a => a.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Announcement not found' });
    announcements[idx] = { ...announcements[idx], title, body };
    writeFile('announcements', announcements);
    res.json({ success: true, data: { affectedRows: 1 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/announcements/:id
 * Permanently delete an announcement by ID.
 * Requires: Auth token
 */
app.delete('/api/announcements/:id', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      await pool.query('DELETE FROM announcements WHERE id = ?', [req.params.id]);
      return res.json({ success: true, data: { deleted: true } });
    }
    let announcements = readFile('announcements');
    const before = announcements.length;
    announcements = announcements.filter(a => a.id !== parseInt(req.params.id));
    if (announcements.length === before) return res.status(404).json({ success: false, message: 'Announcement not found' });
    writeFile('announcements', announcements);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/departments
 * Returns all departments sorted alphabetically.
 */
app.get('/api/departments', async (req, res) => {
  try {
    if (useMySQL) {
      const [rows] = await pool.query('SELECT * FROM departments ORDER BY name');
      return res.json({ success: true, data: rows });
    }
    const departments = readFile('departments');
    departments.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data: departments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/departments
 * Create a new department.
 * Requires: Auth token
 * Body: { code, name, enabled }
 */
app.post('/api/departments', authMiddleware, async (req, res) => {
  try {
    const { code, name, enabled } = req.body;
    if (useMySQL) {
      const [result] = await pool.query('INSERT INTO departments (code, name, enabled) VALUES (?, ?, ?)', [code, name, enabled !== false]);
      return res.json({ success: true, data: { id: result.insertId, code, name, enabled: enabled !== false } });
    }
    const departments = readFile('departments');
    const department = { id: nextId(departments), code, name, enabled: enabled !== false };
    departments.push(department);
    writeFile('departments', departments);
    res.json({ success: true, data: department });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/departments/:id
 * Update department code, name, and enabled status.
 * Requires: Auth token
 */
app.put('/api/departments/:id', authMiddleware, async (req, res) => {
  try {
    const { code, name, enabled } = req.body;
    if (useMySQL) {
      const [result] = await pool.query('UPDATE departments SET code = ?, name = ?, enabled = ? WHERE id = ?', [code, name, enabled, req.params.id]);
      return res.json({ success: true, data: { affectedRows: result.affectedRows } });
    }
    let departments = readFile('departments');
    const idx = departments.findIndex(d => d.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Department not found' });
    departments[idx] = { ...departments[idx], code, name, enabled };
    writeFile('departments', departments);
    res.json({ success: true, data: { affectedRows: 1 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/subjects
 * Returns all subjects, optionally filtered by ?department=...
 * Sorted alphabetically.
 */
app.get('/api/subjects', async (req, res) => {
  try {
    const { department } = req.query;
    if (useMySQL) {
      const sql = department ? 'SELECT * FROM subjects WHERE department = ? ORDER BY name' : 'SELECT * FROM subjects ORDER BY name';
      const params = department ? [department] : [];
      const [rows] = await pool.query(sql, params);
      return res.json({ success: true, data: rows });
    }
    let subjects = readFile('subjects');
    if (department) subjects = subjects.filter(s => s.department === department);
    subjects.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, data: subjects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/subjects
 * Create a new subject linked to a department.
 * Requires: Auth token
 * Body: { name, department }
 */
app.post('/api/subjects', authMiddleware, async (req, res) => {
  try {
    const { name, department } = req.body;
    if (useMySQL) {
      const [result] = await pool.query('INSERT INTO subjects (name, department) VALUES (?, ?)', [name, department]);
      return res.json({ success: true, data: { id: result.insertId, name, department } });
    }
    const subjects = readFile('subjects');
    const subject = { id: nextId(subjects), name, department };
    subjects.push(subject);
    writeFile('subjects', subjects);
    res.json({ success: true, data: subject });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/messages?userId=<id>
 * Returns conversation history between the authenticated user
 * and the specified user ID, sorted oldest-first.
 * Requires: Auth token
 */
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.query;
    const otherId   = parseInt(userId);
    const currentId = req.user.id;
    if (!otherId) return res.status(400).json({ success: false, message: 'userId is required' });
    // Conversation key is always the smaller ID first to ensure consistency
    const key = `${Math.min(currentId, otherId)}-${Math.max(currentId, otherId)}`;
    if (useMySQL) {
      const [rows] = await pool.query('SELECT * FROM messages WHERE conversationKey = ? ORDER BY time ASC', [key]);
      return res.json({ success: true, data: rows });
    }
    let messages = readFile('messages');
    messages = messages.filter(m => m.conversationKey === key);
    messages.sort((a, b) => new Date(a.time) - new Date(b.time));
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/messages
 * Send a message to another user. Emits 'message:new' Socket.IO event.
 * Requires: Auth token
 * Body: { receiverId, text }
 */
app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    const currentId = req.user.id;
    const key = `${Math.min(currentId, parseInt(receiverId))}-${Math.max(currentId, parseInt(receiverId))}`;
    if (useMySQL) {
      const [result] = await pool.query(
        'INSERT INTO messages (senderId, receiverId, text, conversationKey) VALUES (?, ?, ?, ?)',
        [currentId, receiverId, text, key]
      );
      const message = { id: result.insertId, senderId: currentId, receiverId, text, time: new Date(), conversationKey: key };
      io.emit('message:new', message);
      return res.json({ success: true, data: message });
    }
    const messages = readFile('messages');
    const message = { id: nextId(messages), senderId: currentId, receiverId, text, time: nowISO(), conversationKey: key };
    messages.push(message);
    writeFile('messages', messages);
    io.emit('message:new', message);
    res.json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/notifications
 * Returns all notifications for the authenticated user, newest first.
 * Requires: Auth token
 */
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      const [rows] = await pool.query('SELECT * FROM notifications WHERE userId = ? ORDER BY time DESC', [req.user.id]);
      return res.json({ success: true, data: rows });
    }
    let notifications = readFile('notifications');
    notifications = notifications.filter(n => n.userId === req.user.id);
    notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read.
 * Requires: Auth token
 */
app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      await pool.query('UPDATE notifications SET read = TRUE WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);
      return res.json({ success: true, data: { updated: true } });
    }
    let notifications = readFile('notifications');
    const idx = notifications.findIndex(n => n.id === parseInt(req.params.id) && n.userId === req.user.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Notification not found' });
    notifications[idx].read = true;
    writeFile('notifications', notifications);
    res.json({ success: true, data: { updated: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications for the authenticated user as read.
 * Requires: Auth token
 */
app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      await pool.query('UPDATE notifications SET read = TRUE WHERE userId = ?', [req.user.id]);
      return res.json({ success: true, data: { updated: true } });
    }
    let notifications = readFile('notifications');
    let updated = 0;
    for (const n of notifications) {
      if (n.userId === req.user.id && !n.read) {
        n.read = true;
        updated++;
      }
    }
    writeFile('notifications', notifications);
    res.json({ success: true, data: { updated: updated > 0 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a specific notification owned by the authenticated user.
 * Requires: Auth token
 */
app.delete('/api/notifications/:id', authMiddleware, async (req, res) => {
  try {
    if (useMySQL) {
      await pool.query('DELETE FROM notifications WHERE id = ? AND userId = ?', [req.params.id, req.user.id]);
      return res.json({ success: true, data: { deleted: true } });
    }
    let notifications = readFile('notifications');
    const before = notifications.length;
    notifications = notifications.filter(n => !(n.id === parseInt(req.params.id) && n.userId === req.user.id));
    if (notifications.length === before) return res.status(404).json({ success: false, message: 'Notification not found' });
    writeFile('notifications', notifications);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================

// =============================================================

/**
 * GET /api/stats/summary
 * Returns platform-wide summary statistics:
 * total users, notes, announcements, and downloads.
 */
app.get('/api/stats/summary', async (req, res) => {
  try {
    if (useMySQL) {
      const [[users]]         = await pool.query('SELECT COUNT(*) as total FROM users');
      const [[notes]]         = await pool.query('SELECT COUNT(*) as total FROM notes');
      const [[announcements]] = await pool.query('SELECT COUNT(*) as total FROM announcements');
      const [[downloads]]     = await pool.query('SELECT COUNT(*) as total FROM downloads');
      return res.json({ success: true, data: { users: users.total, notes: notes.total, announcements: announcements.total, downloads: downloads.total } });
    }
    // --- File Storage Mode ---
    const users         = readFile('users');
    const notes         = readFile('notes');
    const announcements = readFile('announcements');
    const downloads     = readFile('downloads');
    res.json({ success: true, data: { users: users.length, notes: notes.length, announcements: announcements.length, downloads: downloads.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
