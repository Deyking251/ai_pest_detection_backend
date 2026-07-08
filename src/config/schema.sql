-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS cropguard_db;
USE cropguard_db;

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scans table for crop health history
CREATE TABLE IF NOT EXISTS scans (
    id VARCHAR(100) PRIMARY KEY,
    user_id INT NULL,
    crop_name VARCHAR(100) NOT NULL,
    issue_name VARCHAR(100) NOT NULL,
    confidence DOUBLE NOT NULL,
    severity VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    treatments JSON NOT NULL, -- Stored as a JSON array of treatment strings
    image_path VARCHAR(255) NOT NULL,
    is_bookmarked BOOLEAN DEFAULT FALSE,
    date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
