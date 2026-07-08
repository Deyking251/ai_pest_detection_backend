# CropGuard AI - Backend API Services

A Node.js Express backend for the **CropGuard AI** Pest & Disease Detection Application. It keeps AI provider credentials on the server, handles user authentication, image uploads, Groq/Gemini-powered diagnosis/chat, fallback responses, and personalized scan histories.

---

## 🚀 Tech Stack
* **Runtime**: [Node.js](https://nodejs.org/) (v20+ recommended)
* **Framework**: [Express.js](https://expressjs.com/)
* **Database**: [MySQL](https://www.mysql.com/) (Connector: `mysql2` with promise pools)
* **Authentication**: [JSON Web Tokens (JWT)](https://jwt.io/) & `bcryptjs`
* **File Uploads**: [Multer](https://github.com/expressjs/multer) (saves crop images locally)
* **AI Providers**: Groq via backend-only `groq-sdk`, plus Google Gemini via backend-only API keys and the Python `google-genai` SDK

---

## 📁 Directory Structure
```text
backend/
├── src/
│   ├── config/
│   │   ├── db.js          # MySQL connection pool
│   │   └── schema.sql     # Database tables and indexes
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── chatController.js
│   │   └── scanController.js
│   ├── middlewares/
│   │   ├── authMiddleware.js
│   │   └── uploadMiddleware.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── scanRoutes.js
│   ├── app.js             # Middleware stack and app routing
│   ├── predict.py         # Gemini image analysis worker
│   └── server.js          # Express server initialization
├── uploads/               # Holds crop scan images
├── .env.example           # Example config template
├── .env                   # Local configuration secret keys
├── requirements.txt       # Python dependencies for Gemini image analysis
└── package.json           # Scripts and dependencies
```

---

## 🛠️ Step-by-Step Setup

### 1. Database Setup via MySQL Workbench
1. Launch **MySQL Workbench** and connect to your local MySQL instance.
2. Open a new SQL Query tab.
3. Open or copy the contents of `src/config/schema.sql`.
4. Run the script. This will:
   * Create the database `cropguard_db`.
   * Create the `users` table.
   * Create the `scans` table (referencing the users table with cascade deletes).

### 2. Environment Variables Configuration
Duplicate the configuration template:
```bash
cp .env.example .env
```
Open `.env` and fill in your details:
```env
PORT=3000
NODE_ENV=development

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=cropguard_db

JWT_SECRET=some_very_long_secure_string_here
JWT_EXPIRES_IN=7d

# AI Provider Routing
# Use groq, gemini, or leave blank for automatic provider order.
AI_PROVIDER=groq
AI_CHAT_PROVIDER=groq
AI_IMAGE_PROVIDER=groq

# Groq API Configuration
# Keep this key only in backend/.env. Never ship it in Flutter.
GROQ_API_KEY=your_groq_api_key_here
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Google Gemini API Configuration
# Keep this key only in backend/.env. Never ship it in Flutter.
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_CHAT_MODEL=gemini-2.5-flash

# Optional Hugging Face fallback for chat
HF_API_TOKEN=your_hugging_face_token_here
```

### 3. Backend AI Architecture
Flutter should not call Gemini directly because mobile apps can be decompiled and bundled API keys can be extracted. This project uses a safer architecture:

```text
Flutter app -> CropGuard backend (/v1/analyze, /v1/chat) -> Groq/Gemini API
```

The Flutter client only knows the backend URL. `GROQ_API_KEY` and `GEMINI_API_KEY` stay in `backend/.env`, which is ignored by Git. The backend uses them for:
* `/v1/analyze`: uploads an image and asks Groq Vision or Gemini Vision for structured crop diagnosis JSON.
* `/v1/chat`: sends farmer questions to Groq or Gemini through the Express controller.

Set `AI_PROVIDER=groq` to make Groq primary for both chat and image analysis. Use `AI_CHAT_PROVIDER` or `AI_IMAGE_PROVIDER` only if you want different providers per endpoint. If Groq/Gemini returns a quota or rate-limit error, the backend returns an explicit `AI Analysis Unavailable` scan result instead of pretending a simulated diagnosis is real. For demos only, set `ENABLE_SIMULATED_ANALYSIS=true` in `.env` to use mock scan results while Gemini is unavailable.

### 4. Install Dependencies
Run these commands inside the `backend` folder:
```bash
npm install
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### 5. Running the Server
* **Development Mode** (auto-reloads on changes):
  ```bash
  npm run dev
  ```
* **Production Mode**:
  ```bash
  npm start
  ```

---

## 📡 API Endpoints Reference

### 🔐 Authentication

#### **Register User**
* **URL**: `/v1/auth/register` (also supports `/api/auth/register`)
* **Method**: `POST`
* **Body (JSON)**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "securepassword"
  }
  ```
* **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully.",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com"
    },
    "token": "eyJhbGciOiJIUzI1Ni..."
  }
  ```

#### **Login User**
* **URL**: `/v1/auth/login` (also supports `/api/auth/login`)
* **Method**: `POST`
* **Body (JSON)**:
  ```json
  {
    "email": "jane@example.com",
    "password": "securepassword"
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Logged in successfully.",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-05-31T18:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1Ni..."
  }
  ```

---

### 🌿 Pest and Disease Analysis

#### **Analyze Crop Image**
Processes raw crop images. If a user token is supplied in headers, the results will save to that user's scan history.
* **URL**: `/v1/analyze` (also supports `/api/analyze`)
* **Method**: `POST`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>` *(optional)*
* **Content-Type**: `multipart/form-data`
* **Form Field**: `image` *(File)*
* **Success Response (200 OK)**:
  ```json
  {
    "id": "scan-1718049182390-4821",
    "cropName": "Tomato",
    "issueName": "Leaf Blight",
    "confidence": 0.94,
    "severity": "Moderate",
    "description": "Early blight is caused by the fungus Alternaria solani...",
    "treatments": [
      "Apply a copper-based fungicide at the first sign of disease.",
      "Remove lower infected leaves to prevent upward splash dispersal.",
      "Improve air circulation by pruning and spacing plants correctly."
    ],
    "dateTime": "2026-05-31T18:48:00.000Z",
    "imagePath": "/uploads/crop-1718049182390.png",
    "isBookmarked": false
  }
  ```

#### **Retrieve User Scan History**
* **URL**: `/v1/history` (also supports `/api/history`)
* **Method**: `GET`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>` *(Required)*
* **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "scan-1718049182390-4821",
      "cropName": "Tomato",
      "issueName": "Leaf Blight",
      "confidence": 0.94,
      "severity": "Moderate",
      "description": "Early blight is caused by the fungus Alternaria solani...",
      "treatments": [
        "Apply a copper-based fungicide...",
        "Remove lower infected leaves..."
      ],
      "dateTime": "2026-05-31T18:48:00.000Z",
      "imagePath": "/uploads/crop-1718049182390.png",
      "isBookmarked": false
    }
  ]
  ```

#### **Toggle Bookmark Status**
* **URL**: `/v1/history/:id/bookmark` (also supports `/api/history/:id/bookmark`)
* **Method**: `PATCH`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>` *(Required)*
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Scan bookmarked.",
    "isBookmarked": true
  }
  ```

#### **Delete Scan**
* **URL**: `/v1/history/:id` (also supports `/api/history/:id`)
* **Method**: `DELETE`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>` *(Required)*
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Scan deleted successfully."
  }
  ```

---

## 📲 Integrating with Flutter
To point the Flutter frontend to this local backend:
1. Update `lib/constants/api_constants.dart`:
   ```dart
   class ApiConstants {
     // For Android Emulator, use '10.0.2.2'. For physical device/Linux desktop, use 'localhost' or local IP.
     static String baseUrl = 'http://localhost:3000/v1'; 
     
     static const String analyzeEndpoint = '/analyze';
     static const String loginEndpoint = '/auth/login';
     static const String signupEndpoint = '/auth/register';
     
     // ...
   }
   ```
2. Set up network permission in your app configurations if targeting Android or iOS devices.

Do not add `GROQ_API_KEY`, `GEMINI_API_KEY`, `groq-sdk`, `google-genai`, or any direct AI REST call to Flutter. Keep AI calls behind the backend and deploy the backend over HTTPS for production.
