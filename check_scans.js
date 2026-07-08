import pool from './src/config/db.js';

async function checkRecentScans() {
  try {
    console.log("Fetching recent scans from DB...");
    const [rows] = await pool.query(
      'SELECT id, crop_name, issue_name, confidence, image_path, date_time FROM scans ORDER BY date_time DESC LIMIT 5'
    );
    
    if (rows.length === 0) {
      console.log("No scans found in the database.");
    } else {
      console.log("\n--- Recent Scans ---");
      rows.forEach((row, i) => {
        console.log(`\nScan #${i + 1}:`);
        console.log(`  ID: ${row.id}`);
        console.log(`  Crop: ${row.crop_name}`);
        console.log(`  Issue: ${row.issue_name}`);
        console.log(`  Confidence: ${(row.confidence * 100).toFixed(1)}%`);
        console.log(`  Image: ${row.image_path}`);
        console.log(`  Date: ${row.date_time}`);
      });
    }
  } catch (error) {
    console.error("Error fetching scans:", error);
  } finally {
    process.exit(0);
  }
}

checkRecentScans();
