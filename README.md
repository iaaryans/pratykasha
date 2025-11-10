# 🌟 Pratyaksha: Secure AI Attendance System

[![GitHub stars](https://img.shields.io/github/stars/YOUR_GITHUB_USERNAME/Pratyaksha.svg?style=social&label=Star)](https://github.com/computerBoy-dev/pratyaksha)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

## ⭐ Project Summary

**Pratyaksha** is a high-security, automated web application designed to modernize attendance tracking. It enforces dual-factor verification by using **Facial Recognition** for identity and **Geolocation (Geo-Fencing)** for mandatory location compliance.

The system features segregated access: Managers set up secure servers, while Employees use a unique **Auth Code + DOB** for non-authenticated login and attendance marking.

## ✨ Tech Stack & Core Features

| Category | Technology | Function |
| :--- | :--- | :--- |
| **Biometrics** | **Face-API.js** | Browser-based face detection and descriptor generation. |
| **Location** | **Browser Geolocation API** | Geo-fencing and Haversine distance calculation. |
| **Backend** | **Google Cloud Firestore** | Scalable NoSQL database for real-time data and attendance logs. |
| **Security** | **Firebase Security Rules** | Enforces granular access for Managers (Auth) and Employees (Non-Auth). |
| **Frontend** | JavaScript, **Tailwind CSS** | Responsive UI for setup and attendance marking. |

## 🚀 Setup & Installation

### 1. Prerequisites

1.  A **Firebase Project** with Firestore and Security Rules configured.
2.  Node.js (for local server/testing).

### 2. Quick Setup

1.  **Clone the Repo:**
    ```bash
    git clone [https://github.com/YOUR_GITHUB_USERNAME/Pratyaksha.git](https://github.com/YOUR_GITHUB_USERNAME/Pratyaksha.git)
    cd Pratyaksha
    ```
2.  **Firebase Config:** Add your configuration keys into a file named `firebase_config.json` in the root directory.
3.  **Create Index:** Create a **Collection Group** Index for `employees` on fields `authCode` and `dob` in your Firestore Console.
4.  **Deploy Rules:** Deploy the provided **Security Rules** (which include the necessary public read permissions for employee login).

### 3. How to Run

* Open `auth.html` (for **Manager Login/Signup**).
* Open `index.html` (for **Employee Login**).

## 🔒 Proprietary License

This software is **Proprietary**. All rights are reserved by [Your Name or Company Name].

**Unauthorized copying, modification, redistribution, or use of this Software is strictly prohibited.**

Please refer to the `LICENSE` file for full details.
