import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// ─── Simple Admin Auth Middleware ────────────────────────────────────────────
// Admin password is set via ADMIN_PASSWORD env var, defaults to 'admin123'
const adminAuth = (req, res, next) => {
  const adminPassword = req.headers['x-admin-password'] || req.query.password;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (adminPassword !== expectedPassword) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Invalid admin password.' });
  }
  next();
};

// ─── GET /admin/api/stats — Dashboard statistics ─────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ totalScans }]] = await pool.query('SELECT COUNT(*) AS totalScans FROM scans');
    const [[{ bookmarkedScans }]] = await pool.query('SELECT COUNT(*) AS bookmarkedScans FROM scans WHERE is_bookmarked = TRUE');

    // Scans per day (last 7 days)
    const [dailyScans] = await pool.query(`
      SELECT DATE(date_time) AS scanDate, COUNT(*) AS count
      FROM scans
      WHERE date_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(date_time)
      ORDER BY scanDate ASC
    `);

    // Top 5 most detected diseases
    const [topDiseases] = await pool.query(`
      SELECT issue_name, COUNT(*) AS count
      FROM scans
      GROUP BY issue_name
      ORDER BY count DESC
      LIMIT 5
    `);

    // Severity distribution
    const [severityDist] = await pool.query(`
      SELECT severity, COUNT(*) AS count
      FROM scans
      GROUP BY severity
      ORDER BY count DESC
    `);

    // Recent signups (last 5)
    const [recentUsers] = await pool.query(`
      SELECT id, name, email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalScans,
        bookmarkedScans,
        dailyScans,
        topDiseases,
        severityDist,
        recentUsers
      }
    });
  } catch (error) {
    console.error('Admin Stats Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /admin/api/users — All users ────────────────────────────────────────
router.get('/users', adminAuth, async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.bio, u.location,
             u.primary_crop, u.experience, u.farm_size, u.profile_picture, u.created_at,
             (SELECT COUNT(*) FROM scans s WHERE s.user_id = u.id) AS scanCount
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Admin Users Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /admin/api/users/:id — Delete a user ────────────────────────────
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, message: 'User and all associated scans deleted.' });
  } catch (error) {
    console.error('Admin Delete User Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /admin/api/scans — All scans ───────────────────────────────────────
router.get('/scans', adminAuth, async (req, res) => {
  try {
    const [scans] = await pool.query(`
      SELECT s.id, s.crop_name, s.issue_name, s.confidence, s.severity,
             s.description, s.treatments, s.image_path, s.is_bookmarked, s.date_time,
             s.user_id, u.name AS user_name, u.email AS user_email
      FROM scans s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.date_time DESC
    `);

    const formattedScans = scans.map(row => ({
      id: row.id,
      cropName: row.crop_name,
      issueName: row.issue_name,
      confidence: parseFloat(row.confidence),
      severity: row.severity,
      description: row.description,
      treatments: typeof row.treatments === 'string' ? JSON.parse(row.treatments) : row.treatments,
      imagePath: row.image_path,
      isBookmarked: Boolean(row.is_bookmarked),
      dateTime: row.date_time,
      userId: row.user_id,
      userName: row.user_name || 'Anonymous',
      userEmail: row.user_email || '—'
    }));

    res.json({ success: true, scans: formattedScans });
  } catch (error) {
    console.error('Admin Scans Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /admin/api/scans/:id — Delete a scan ────────────────────────────
router.delete('/scans/:id', adminAuth, async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM scans WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Scan not found.' });
    }
    res.json({ success: true, message: 'Scan deleted successfully.' });
  } catch (error) {
    console.error('Admin Delete Scan Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /admin/api/server-info — Server health info ─────────────────────────
router.get('/server-info', adminAuth, async (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  res.json({
    success: true,
    info: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: `${hours}h ${minutes}m ${seconds}s`,
      memoryUsage: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`,
      environment: process.env.NODE_ENV || 'development',
      dbHost: process.env.DB_HOST || '127.0.0.1',
      dbName: process.env.DB_NAME || 'cropguard_db'
    }
  });
});

// ─── GET /admin/api/login-activity — Get user login and signup logs ────────
router.get('/login-activity', adminAuth, async (req, res) => {
  try {
    const [logs] = await pool.query(`
      SELECT l.id, l.action_type, l.ip_address, l.user_agent, l.timestamp,
             u.name AS user_name, u.email AS user_email
      FROM login_activity l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.timestamp DESC
      LIMIT 100
    `);
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Admin Login Activity Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
