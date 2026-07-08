import app from './app.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`  CropGuard AI Backend running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  API Base URL: http://localhost:${PORT}/v1`);
  console.log(`===================================================`);
});

// Handle unhandled promise rejections gracefully
process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Promise Rejection: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});
