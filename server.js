const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Security configuration
const JWT_SECRET = process.env.JWT_SECRET || 'sunco-super-secret-key-2024';
const ACCESS_PIN = '154558'; // The required PIN for access
const SALT_ROUNDS = 12;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(helmet());
app.use(cors());
app.use(limiter);
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./sunco_data.db');

// Initialize database tables
db.serialize(() => {
  // Users table for authentication
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Enquiries table
  db.run(`CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    salesperson TEXT NOT NULL,
    customer TEXT,
    phone TEXT,
    email TEXT,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    test_drive TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create default admin user if not exists
  db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      bcrypt.hash('admin123', SALT_ROUNDS, (err, hash) => {
        if (!err) {
          db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", 
            ['admin', hash, 'admin']);
        }
      });
    }
  });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// PIN verification middleware
const verifyPin = (req, res, next) => {
  const { pin } = req.body;
  if (pin !== ACCESS_PIN) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  next();
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// PIN verification endpoint
app.post('/api/verify-pin', verifyPin, (req, res) => {
  res.json({ success: true, message: 'PIN verified successfully' });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// Get all enquiries
app.get('/api/enquiries', authenticateToken, (req, res) => {
  const { archived = 0 } = req.query;
  
  db.all("SELECT * FROM enquiries WHERE archived = ? ORDER BY created_at DESC", [archived], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create new enquiry
app.post('/api/enquiries', authenticateToken, (req, res) => {
  const enquiry = req.body;
  const id = uuidv4();
  
  const stmt = db.prepare(`INSERT INTO enquiries (
    id, date, time, salesperson, customer, phone, email, brand, model, test_drive, status, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  stmt.run([
    id, enquiry.date, enquiry.time, enquiry.salesperson, enquiry.customer, 
    enquiry.phone, enquiry.email, enquiry.brand, enquiry.model, 
    enquiry.testDrive, enquiry.status, enquiry.notes
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Get the created enquiry
    db.get("SELECT * FROM enquiries WHERE id = ?", [id], (err, row) => {
      if (!err && row) {
        // Broadcast to all connected clients
        io.emit('enquiry_created', row);
        res.json(row);
      } else {
        res.status(500).json({ error: 'Failed to retrieve created enquiry' });
      }
    });
  });
  
  stmt.finalize();
});

// Update enquiry
app.put('/api/enquiries/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const enquiry = req.body;
  
  const stmt = db.prepare(`UPDATE enquiries SET 
    date = ?, time = ?, salesperson = ?, customer = ?, phone = ?, email = ?, 
    brand = ?, model = ?, test_drive = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?`);
  
  stmt.run([
    enquiry.date, enquiry.time, enquiry.salesperson, enquiry.customer, 
    enquiry.phone, enquiry.email, enquiry.brand, enquiry.model, 
    enquiry.testDrive, enquiry.status, enquiry.notes, id
  ], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    
    // Get the updated enquiry
    db.get("SELECT * FROM enquiries WHERE id = ?", [id], (err, row) => {
      if (!err && row) {
        // Broadcast to all connected clients
        io.emit('enquiry_updated', row);
        res.json(row);
      } else {
        res.status(500).json({ error: 'Failed to retrieve updated enquiry' });
      }
    });
  });
  
  stmt.finalize();
});

// Archive/Unarchive enquiry
app.patch('/api/enquiries/:id/archive', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { archived } = req.body;
  
  db.run("UPDATE enquiries SET archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
    [archived ? 1 : 0, id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    
    // Get the updated enquiry
    db.get("SELECT * FROM enquiries WHERE id = ?", [id], (err, row) => {
      if (!err && row) {
        // Broadcast to all connected clients
        io.emit('enquiry_archived', row);
        res.json(row);
      } else {
        res.status(500).json({ error: 'Failed to retrieve updated enquiry' });
      }
    });
  });
});

// Delete enquiry (admin only)
app.delete('/api/enquiries/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  const { id } = req.params;
  
  db.run("DELETE FROM enquiries WHERE id = ?", [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    
    // Broadcast to all connected clients
    io.emit('enquiry_deleted', { id });
    res.json({ success: true });
  });
});

// Get analytics data
app.get('/api/analytics', authenticateToken, (req, res) => {
  const { timeFilter = 'all', salespersonFilter = 'all' } = req.query;
  
  let query = "SELECT * FROM enquiries WHERE archived = 0";
  let params = [];
  
  if (timeFilter !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch(timeFilter) {
      case 'today':
        query += " AND date = ?";
        params.push(today.toISOString().split('T')[0]);
        break;
      case 'week':
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        query += " AND date >= ?";
        params.push(weekAgo.toISOString().split('T')[0]);
        break;
      case 'month':
        const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        query += " AND date >= ?";
        params.push(monthAgo.toISOString().split('T')[0]);
        break;
    }
  }
  
  if (salespersonFilter !== 'all') {
    query += " AND salesperson = ?";
    params.push(salespersonFilter);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const total = rows.length;
    const testDrives = rows.filter(e => e.test_drive === 'Yes').length;
    const sold = rows.filter(e => e.status === 'Sold').length;
    
    const analytics = {
      total,
      testDriveRate: total > 0 ? Math.round((testDrives / total) * 100) : 0,
      conversionRate: total > 0 ? Math.round((sold / total) * 100) : 0,
      brandStats: {},
      statusStats: { 'Open': 0, 'Sold': 0, 'Lost': 0 }
    };
    
    // Calculate brand statistics
    rows.forEach(enquiry => {
      if (!analytics.brandStats[enquiry.brand]) {
        analytics.brandStats[enquiry.brand] = { total: 0, testDrives: 0, sold: 0 };
      }
      analytics.brandStats[enquiry.brand].total++;
      if (enquiry.test_drive === 'Yes') analytics.brandStats[enquiry.brand].testDrives++;
      if (enquiry.status === 'Sold') analytics.brandStats[enquiry.brand].sold++;
      
      analytics.statusStats[enquiry.status]++;
    });
    
    res.json(analytics);
  });
});

// Export data
app.get('/api/export', authenticateToken, (req, res) => {
  db.all("SELECT * FROM enquiries ORDER BY created_at DESC", (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const headers = ['Date', 'Time', 'Salesperson', 'Customer', 'Phone', 'Email', 'Brand', 'Model', 'Test Drive', 'Status', 'Notes', 'Archived'];
    const csvContent = [
      headers.join(','),
      ...rows.map(enquiry => [
        enquiry.date,
        enquiry.time,
        enquiry.salesperson,
        enquiry.customer || '',
        enquiry.phone || '',
        enquiry.email || '',
        enquiry.brand,
        enquiry.model,
        enquiry.test_drive,
        enquiry.status,
        `"${(enquiry.notes || '').replace(/"/g, '""')}"`,
        enquiry.archived ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sunco_enquiries_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  // Join room for real-time updates
  socket.on('join_room', (room) => {
    socket.join(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚗 Sunco Walk-In Tracker Server running on port ${PORT}`);
  console.log(`📍 Access URL: http://localhost:${PORT}`);
  console.log(`🔐 Required PIN: ${ACCESS_PIN}`);
}); 