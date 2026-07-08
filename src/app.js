import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/authRoutes.js';
import scanRoutes from './routes/scanRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatRoutes from './routes/chatRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Enable CORS so client apps can access endpoints
app.use(cors());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded crop images statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Mount API routes
// We support both '/v1' (matching Flutter client's ApiConstants) and standard '/api' prefix
app.use('/v1/auth', authRoutes);
app.use('/v1/chat', chatRoutes);
app.use('/v1', scanRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', scanRoutes);

// ─── Admin Dashboard ────────────────────────────────────────────────────────
// Admin API endpoints
app.use('/admin/api', adminRoutes);

// Serve admin dashboard HTML at /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Base route to check health of backend
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'CropGuard AI Backend API is running.',
    version: '1.0.0'
  });
});

// 404 Route handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found - ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message);
  
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

export default app;
