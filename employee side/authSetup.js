lucide.createIcons();

class FaceAuthSystem {
  constructor() {
    this.stream = null;
    this.db = null;
    this.serverId = null;
    this.empId = null;
    this.storedDescriptor = null;
    this.isSystemReady = false;
    this.isFaceSetup = false;
    
    // DOM Elements
    this.loader = document.getElementById('loader');
    this.loaderText = document.getElementById('loader-text');
    this.statusCard = document.getElementById('status-card');
    this.statusIcon = document.getElementById('status-icon');
    this.statusTitle = document.getElementById('status-title');
    this.statusMessage = document.getElementById('status-message');
    this.videoContainer = document.getElementById('video-container');
    this.video = document.getElementById('video');
    this.actionButtons = document.getElementById('action-buttons');
    this.setupBtn = document.getElementById('setup-btn');
    this.attendanceBtn = document.getElementById('attendance-btn');
    this.historyBtn = document.getElementById('history-btn');
    this.dashboardBtn = document.getElementById('dashboard-btn');
    this.historyModal = document.getElementById('history-modal');
    
    // Configuration
    this.FACE_MATCH_THRESHOLD = 0.35;
    this.DETECTION_RETRIES = 5;
    this.DETECTION_TIMEOUT = 8000;
    this.MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
    
    this.init();
  }
  
  async init() {
    try {
      lucide.createIcons();
      await this.validateSession();
      await this.initFirebase();
      await this.loadModels();
      await this.initCamera();
      await this.checkFaceSetupStatus();
      
      // Initialize auto-absent marking
      await this.initializeAutoAbsentMarking();
      
      this.isSystemReady = true;
      this.hideLoader();
      this.showActionButtons();
      
    } catch (error) {
      console.error('System initialization failed:', error);
      this.showError('System initialization failed', error.message);
    }
  }
  
  async validateSession() {
    this.updateLoader('Validating session...');
    
    const urlParams = new URLSearchParams(window.location.search);
    this.serverId = urlParams.get('server');
    this.empId = urlParams.get('emp');
    
    if (!this.serverId || !this.empId) {
      const userData = localStorage.getItem('user');
      if (userData) {
        try {
          const user = JSON.parse(userData);
          this.serverId = user.serverId;
          this.empId = user.empId;
        } catch (e) {
          throw new Error('Invalid user data in localStorage');
        }
      }
    }
    
    if (!this.serverId || !this.empId) {
      throw new Error('Invalid session credentials. Please login again.');
    }
  }
  
  async initFirebase() {
    this.updateLoader('Connecting to Firebase...');
    
    try {
      const config = await fetch('firebase_config.json').then(res => {
        if (!res.ok) throw new Error('Failed to load Firebase config');
        return res.json();
      });
      
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }
      
      this.db = firebase.firestore();
      await this.db.collection('servers').doc(this.serverId).get();
      
    } catch (error) {
      throw new Error('Firebase connection failed: ' + error.message);
    }
  }
  
  async loadModels() {
    this.updateLoader('Loading AI models...');
    
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(this.MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL)
      ]);
    } catch (error) {
      throw new Error('Failed to load face recognition models: ' + error.message);
    }
  }
  
  async initCamera() {
    this.updateLoader('Initializing camera...');
    
    try {
      const constraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };
      
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      
      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });
      
    } catch (error) {
      throw new Error('Camera access failed: ' + error.message);
    }
  }
  
  async checkFaceSetupStatus() {
    this.updateLoader('Checking face setup status...');
    
    try {
      const employeeDoc = await this.db
        .collection('servers')
        .doc(this.serverId)
        .collection('employees')
        .doc(this.empId)
        .get();
      
      if (employeeDoc.exists) {
        const data = employeeDoc.data();
        if (data.faceDescriptor && Array.isArray(data.faceDescriptor) && data.faceDescriptor.length === 128) {
          this.storedDescriptor = new Float32Array(data.faceDescriptor);
          this.isFaceSetup = true;
          this.updateStatus('success', 'Face Recognition Ready', 'Your face is already setup. Ready for attendance!');
          this.setupBtn.style.display = 'none';
          this.attendanceBtn.classList.remove('hidden');
          this.attendanceBtn.disabled = false;
          this.historyBtn.classList.remove('hidden');
          this.dashboardBtn.classList.remove('hidden');
          return;
        }
      }
      
      this.updateStatus('warning', 'Face Setup Required', 'Please setup your face for secure authentication');
      this.setupBtn.disabled = false;
      
    } catch (error) {
      throw new Error('Failed to check face setup status: ' + error.message);
    }
  }

  async initializeAutoAbsentMarking() {
    try {
      // Schedule auto-absent marking
      this.scheduleAutoAbsentMarking();
      
    } catch (error) {
      console.error('Error initializing auto-absent marking:', error);
    }
  }

  scheduleAutoAbsentMarking() {
    // Calculate time until next midnight
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(now.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);
    
    const timeUntilMidnight = nextMidnight.getTime() - now.getTime();
    
    // Schedule first run at next midnight
    setTimeout(() => {
      this.markAutoAbsent();
      
      // Set up daily recurring execution
      setInterval(() => {
        this.markAutoAbsent();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
      
    }, timeUntilMidnight);
    
    console.log(`Auto-absent marking scheduled for ${nextMidnight.toLocaleString()}`);
  }

  async markAutoAbsent() {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      
      const dateKey = this.formatDate(yesterday);
      
      // Check if auto-absent already marked for this date
      const autoAbsentDoc = await this.db
        .collection('servers')
        .doc(this.serverId)
        .collection('autoAbsent')
        .doc(dateKey)
        .get();
      
      if (autoAbsentDoc.exists) {
        console.log(`Auto-absent already processed for ${dateKey}`);
        return;
      }
      
      // Get all employees in this server
      const employeesSnapshot = await this.db
        .collection('servers')
        .doc(this.serverId)
        .collection('employees')
        .get();
      
      const batch = this.db.batch();
      let absentCount = 0;
      
      for (const employeeDoc of employeesSnapshot.docs) {
        const empId = employeeDoc.id;
        
        // Check if employee has attendance for yesterday
        const attendanceSnapshot = await this.db
          .collection('servers')
          .doc(this.serverId)
          .collection('employees')
          .doc(empId)
          .collection('attendance')
          .where('date', '==', dateKey)
          .get();
        
        if (attendanceSnapshot.empty) {
          // Mark as absent
          const attendanceRef = this.db
            .collection('servers')
            .doc(this.serverId)
            .collection('employees')
            .doc(empId)
            .collection('attendance')
            .doc();
          
          batch.set(attendanceRef, {
            date: dateKey,
            timestamp: firebase.firestore.Timestamp.fromDate(yesterday),
            status: 'Absent',
            autoMarked: true,
            verificationMethod: 'auto_absent_marking',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          absentCount++;
        }
      }
      
      // Mark that auto-absent has been processed for this date
      const autoAbsentRef = this.db
        .collection('servers')
        .doc(this.serverId)
        .collection('autoAbsent')
        .doc(dateKey);
      
      batch.set(autoAbsentRef, {
        date: dateKey,
        processedAt: firebase.firestore.FieldValue.serverTimestamp(),
        absentMarkedCount: absentCount
      });
      
      await batch.commit();
      
      console.log(`Auto-absent marking completed for ${dateKey}. Marked ${absentCount} employees as absent.`);
      
    } catch (error) {
      console.error('Error in auto-absent marking:', error);
    }
  }

  formatDate(date) {
    return date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  }
  
  async setupFace() {
    try {
      this.setupBtn.disabled = true;
      this.updateStatus('', 'Setting up face...', 'Please look directly at the camera');
      
      const detection = await this.detectFaceWithRetries();
      if (!detection) {
        throw new Error('No face detected. Please ensure good lighting and look at the camera.');
      }
      
      await this.db
        .collection('servers')
        .doc(this.serverId)
        .collection('employees')
        .doc(this.empId)
        .set({
          faceDescriptor: Array.from(detection.descriptor),
          faceSetupDate: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      
      this.storedDescriptor = detection.descriptor;
      this.isFaceSetup = true;
      
      await Swal.fire({
        icon: 'success',
        title: 'Face Setup Complete!',
        text: 'Your face has been successfully registered.',
        timer: 2000,
        showConfirmButton: false
      });
      
      this.updateStatus('success', 'Face Setup Complete', 'Ready for attendance marking');
      this.setupBtn.style.display = 'none';
      this.attendanceBtn.classList.remove('hidden');
      this.attendanceBtn.disabled = false;
      this.historyBtn.classList.remove('hidden');
      this.dashboardBtn.classList.remove('hidden');
      
    } catch (error) {
      this.updateStatus('error', 'Face Setup Failed', error.message);
      this.setupBtn.disabled = false;
      
      await Swal.fire({
        icon: 'error',
        title: 'Setup Failed',
        text: error.message
      });
    }
  }
  
  async markAttendance() {
    try {
      this.attendanceBtn.disabled = true;
      this.updateStatus('', 'Verifying identity...', 'Please look at the camera');
      
      const detection = await this.detectFaceWithRetries();
      if (!detection) {
        throw new Error('Face not detected for verification');
      }
      
      if (!this.storedDescriptor) {
        throw new Error('Face data not found. Please setup face first.');
      }
      
      const distance = faceapi.euclideanDistance(detection.descriptor, this.storedDescriptor);
      console.log('Face match distance:', distance.toFixed(4));
      
      if (distance > this.FACE_MATCH_THRESHOLD) {
        throw new Error('Face verification failed. Access denied.');
      }
      
      this.updateStatus('', 'Face verified! Checking location...', 'Getting your location...');
      
      const coords = await this.getCurrentPosition();
      const locationValid = await this.verifyLocation(coords.latitude, coords.longitude);
      
      if (!locationValid.valid) {
        throw new Error(`You are ${Math.round(locationValid.distance)}m away from allowed location (${locationValid.allowedRange}m range).`);
      }
      
      this.updateStatus('', 'Location verified! Marking attendance...', 'Please wait...');
      
      const alreadyMarked = await this.hasAttendanceToday();
      if (alreadyMarked) {
        throw new Error('Attendance already marked for today');
      }
      
      const now = new Date();
      const dateKey = this.formatDate(now);
      
      await this.db
        .collection('servers')
        .doc(this.serverId)
        .collection('employees')
        .doc(this.empId)
        .collection('attendance')
        .add({
          date: dateKey,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          status: 'Present',
          verificationMethod: 'face_recognition',
          faceMatchScore: (1 - distance).toFixed(4),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      
      this.updateStatus('success', 'Attendance Marked Successfully!', 'Your attendance has been recorded for today');
      
      await Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: 'Attendance marked successfully!',
        timer: 3000,
        showConfirmButton: false
      });
      
    } catch (error) {
      this.updateStatus('error', 'Attendance Failed', error.message);
      
      await Swal.fire({
        icon: 'error',
        title: 'Attendance Failed',
        text: error.message
      });
      
    } finally {
      this.attendanceBtn.disabled = false;
    }
  }

  async showAttendanceHistory() {
    try {
      this.historyModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      
      // Show loading state
      document.getElementById('history-loading').classList.remove('hidden');
      document.getElementById('history-empty').classList.add('hidden');
      document.getElementById('history-content').classList.add('hidden');
      
      // Fetch attendance records
      const attendanceSnapshot = await this.db
        .collection('servers')
        .doc(this.serverId)
        .collection('employees')
        .doc(this.empId)
        .collection('attendance')
        .orderBy('timestamp', 'desc')
        .limit(100) // Limit to last 100 records
        .get();
      
      // Hide loading
      document.getElementById('history-loading').classList.add('hidden');
      
      if (attendanceSnapshot.empty) {
        document.getElementById('history-empty').classList.remove('hidden');
        return;
      }
      
      // Process records
      const records = [];
      let presentCount = 0;
      let absentCount = 0;
      
      attendanceSnapshot.forEach(doc => {
        const data = doc.data();
        records.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate() || new Date()
        });
        
        if (data.status === 'Present') presentCount++;
        else if (data.status === 'Absent') absentCount++;
      });
      
      // Calculate attendance rate
      const totalRecords = presentCount + absentCount;
      const attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;
      
      // Update summary
      document.getElementById('present-count').textContent = presentCount;
      document.getElementById('absent-count').textContent = absentCount;
      document.getElementById('attendance-rate').textContent = attendanceRate + '%';
      
      // Populate table
      this.populateHistoryTable(records);
      
      // Show content
      document.getElementById('history-content').classList.remove('hidden');
      
      // Refresh icons
      lucide.createIcons();
      
    } catch (error) {
      console.error('Error loading attendance history:', error);
      
      document.getElementById('history-loading').classList.add('hidden');
      document.getElementById('history-empty').classList.remove('hidden');
      document.getElementById('history-empty').innerHTML = `
        <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <i data-lucide="alert-circle" class="w-8 h-8 text-red-400"></i>
        </div>
        <h3 class="text-lg font-medium text-gray-800 mb-2">Error Loading History</h3>
        <p class="text-gray-500">${error.message}</p>
      `;
      
      lucide.createIcons();
    }
  }

  populateHistoryTable(records) {
    const tbody = document.getElementById('history-table');
    tbody.innerHTML = '';
    
    records.forEach(record => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-gray-50';
      
      const statusClass = record.status === 'Present' ? 'attendance-present' : 
                        record.status === 'Absent' ? 'attendance-absent' : 'attendance-late';
      
      const methodText = this.getMethodText(record.verificationMethod);
      const timeText = record.timestamp ? record.timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }) : 'N/A';
      
      row.innerHTML = `
        <td class="px-4 py-3 text-sm text-gray-900">
          ${record.timestamp ? record.timestamp.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }) : 'N/A'}
        </td>
        <td class="px-4 py-3">
          <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusClass}">
            ${record.status}
          </span>
        </td>
        <td class="px-4 py-3 text-sm text-gray-900">${timeText}</td>
        <td class="px-4 py-3 text-sm text-gray-500">${methodText}</td>
      `;
      
      tbody.appendChild(row);
    });
  }

  getMethodText(method) {
    const methods = {
      'face_recognition': 'Face Recognition',
      'auto_absent_marking': 'Auto Absent',
      'manual': 'Manual',
      'location_based': 'Location Based'
    };
    return methods[method] || 'Unknown';
  }

  closeHistoryModal() {
    this.historyModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
  
  async detectFaceWithRetries() {
    const startTime = Date.now();
    
    for (let i = 0; i < this.DETECTION_RETRIES; i++) {
      try {
        const detection = await faceapi
          .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        
        if (detection) return detection;
        
      } catch (error) {
        console.warn(`Face detection attempt ${i + 1} failed:`, error);
      }
      
      if (Date.now() - startTime > this.DETECTION_TIMEOUT) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return null;
  }
  
  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        position => resolve(position.coords),
        error => {
          const messages = {
            1: 'Location access denied. Please enable location permissions.',
            2: 'Location unavailable. Please check your GPS.',
            3: 'Location request timeout. Please try again.'
          };
          reject(new Error(messages[error.code] || 'Location error: ' + error.message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }
  
  async verifyLocation(userLat, userLng) {
    const serverDoc = await this.db.collection('servers').doc(this.serverId).get();
    
    if (!serverDoc.exists) {
      throw new Error('Server configuration not found');
    }
    
    const { lat: serverLat, lng: serverLng, range } = serverDoc.data();
    
    const distance = this.calculateDistance(userLat, userLng, serverLat, serverLng);
    
    return {
      valid: distance <= range,
      distance,
      allowedRange: range
    };
  }
  
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }
  
  async hasAttendanceToday() {
    const today = new Date();
    const dateKey = this.formatDate(today);
    
    const attendanceSnapshot = await this.db
      .collection('servers')
      .doc(this.serverId)
      .collection('employees')
      .doc(this.empId)
      .collection('attendance')
      .where('date', '==', dateKey)
      .get();
    
    return !attendanceSnapshot.empty;
  }
  
  // UI Helper Methods
  updateLoader(message) {
    this.loaderText.textContent = message;
  }
  
  hideLoader() {
    this.loader.classList.add('hidden');
    this.videoContainer.classList.remove('hidden');
  }
  
  showActionButtons() {
    this.actionButtons.classList.remove('hidden');
  }
  
  updateStatus(type, title, message) {
    this.statusTitle.textContent = title;
    this.statusMessage.textContent = message;
    
    // Remove all status classes
    this.statusCard.classList.remove('error-state', 'success-state', 'warning-state');
    
    // Update icon and style based on type
    const iconMap = {
      error: 'x-circle',
      success: 'check-circle',
      warning: 'alert-triangle',
      default: 'info'
    };
    
    this.statusIcon.setAttribute('data-lucide', iconMap[type] || 'loader');
    this.statusIcon.classList.toggle('animate-spin', !type);
    
    if (type) {
      this.statusCard.classList.add(`${type}-state`);
    }
    
    lucide.createIcons();
  }
  
  showError(title, message) {
    this.hideLoader();
    this.updateStatus('error', title, message);
    
    Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonText: 'Retry',
      showCancelButton: true,
      cancelButtonText: 'Go Back'
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.reload();
      } else {
        window.location.href = 'index.html';
      }
    });
  }
  
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
      this.stream = null;
    }
  }
}

// Initialize system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const system = new FaceAuthSystem();
  
  // Event listeners
  document.getElementById('setup-btn').addEventListener('click', () => system.setupFace());
  document.getElementById('attendance-btn').addEventListener('click', () => system.markAttendance());
  document.getElementById('history-btn').addEventListener('click', () => system.showAttendanceHistory());
  document.getElementById('close-history').addEventListener('click', () => system.closeHistoryModal());
  
  // Close modal when clicking outside
  document.getElementById('history-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('history-modal')) {
      system.closeHistoryModal();
    }
  });
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => system.cleanup());
});