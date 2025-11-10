// dashboard.js - Full Updated Code (With Auth State Fix)

let auth, db;
let mapInstance, markerInstance; // Global map variables for Leaflet

// ------------------------
// Firebase Initialization (CRITICAL CHANGE HERE)
// ------------------------
fetch('firebase_config.json')
  .then(res => res.json())
  .then(config => {
    const app = firebase.initializeApp(config);
    auth = firebase.auth();
    db = firebase.firestore();
    
    // 🛑 CRITICAL FIX: onAuthStateChanged ka upyog karein
    auth.onAuthStateChanged(user => {
      if (user) {
        // User is signed in, initialize the dashboard
        initializeDashboard();
      } else {
        // User is signed out or session expired
        console.log("User is not authenticated. Redirecting.");
        localStorage.clear();
        window.location.href = "auth.html";
      }
    });

  })
  .catch(err => console.error("Failed to initialize Firebase:", err));

// Preloader hide
window.addEventListener("load", () => {
    const preloader = document.getElementById("preloader");
    if (preloader) preloader.classList.add("hidden");
});

// ------------------------
// Dashboard Initialization (UI Logic Refined)
// ------------------------
async function initializeDashboard() {
    // Data is loaded from localStorage (must be correctly set by auth.js)
    const userData = JSON.parse(localStorage.getItem('user'));

    // Safety check
    if (!userData || !userData.uid) {
        // Agar yahan data nahi mila to forcefully logout/redirect karein
        localStorage.clear();
        window.location.href = "auth.html";
        return; 
    } 

    const userName = userData.name || 'Manager';
    const userCompany = userData.company || 'Your Company';

    // ------------------------------------------------
    // UI Update: Welcome Text, User Name, and Company (FIXED SELECTORS)
    // ------------------------------------------------
    
    // 1. Navbar Username Update (Using ID: user-name)
    const userNameInNav = document.getElementById('user-name'); // Assuming your HTML has id="user-name"
    if (userNameInNav) {
        userNameInNav.textContent = userName; 
    }

    // 2. Welcome Heading Update (H1)
    const h1 = document.querySelector('h1');
    if (h1) {
        h1.innerHTML = `Welcome back, ${userName}`; 
    }

    // 3. Company Name Update (Using specific classes)
    // Note: The selector should be specific: 'p span.font-medium' may be too broad.
    // Assuming your HTML structure is correct.
    const companySpan = document.querySelector('p span.font-medium');
    if (companySpan) {
        companySpan.textContent = userCompany; 
    }
    
    // --- OLD/REDUNDANT UI CODE REMOVED/IGNORED ---
    // document.querySelectorAll('span.text-sm.text-gray-600').forEach(el => {
    //   el.textContent = `Hello, ${userData.name}`; 
    // });
    // This part is redundant if you use the id="user-name"

    // Load user's servers
    try {
        // Ensure you have correct Firestore Rules for 'servers' collection!
        const serversSnapshot = await db.collection("servers").where("uid", "==", userData.uid).get();

        const serverList = document.querySelector(".col-span-2.grid");
        if (!serverList) return;

        serverList.innerHTML = ''; // Clear existing content

        const labels = [];
        const attendanceData = [];

        serversSnapshot.forEach(doc => {
            const s = doc.data();
            labels.push(s.name);
            attendanceData.push(s.attendanceRatio || 0);

            const card = `
                <div class="group relative bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:border-gray-300 transition-all duration-300 hover:bg-gray-50">
                    <div class="flex items-start justify-between mb-3">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-900">${s.name}</h3>
                            <p class="text-xs text-gray-400 mt-1">${new Date(s.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div class="bg-gray-100 p-2 rounded-lg group-hover:bg-gray-200 transition">
                            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 mb-4 leading-relaxed">${s.description || 'No description'}</p>
                    <div class="flex items-center justify-between mt-auto text-sm">
                        <span class="text-gray-700 font-medium flex items-center gap-1">👥 ${s.employees || 0} Employees</span>
                        <button data-id="${doc.id}" class="viewServerBtn inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs rounded-md font-medium transition">View</button>
                    </div>
                </div>`;
            serverList.insertAdjacentHTML("beforeend", card);
        });

        // Attach click events for all View buttons
        document.querySelectorAll('.viewServerBtn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const serverId = event.currentTarget.getAttribute('data-id');
                if (serverId) window.location.href = `server.html?id=${serverId}`;
            });
        });

        // Render attendance chart
        updateAttendanceChart(labels, attendanceData);

    } catch (err) {
        console.error("Failed to load servers:", err);
        // Alert user if the error is due to permissions
        if (err.code === 'permission-denied' || err.message.includes('permissions')) {
             Swal.fire({
                icon: 'error',
                title: 'Permission Denied',
                text: 'Could not load server list. Please check your Firestore Security Rules.',
                confirmButtonColor: '#d33'
            });
        }
    }
}

// ------------------
// Chart.js Attendance
// ------------------
function updateAttendanceChart(labels, data) {
    const canvas = document.getElementById('attendanceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Destroy previous chart instance if it exists to prevent overlap
    if (window.myAttendanceChart instanceof Chart) {
        window.myAttendanceChart.destroy();
    }
    
    window.myAttendanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Attendance Ratio (%)',
                data,
                backgroundColor: ['#3b82f6', '#6366f1', '#10b981', '#f59e0b'],
                borderRadius: 10,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100 },
                x: { ticks: { color: '#6b7280' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `${ctx.raw}% attendance` } }
            }
        }
    });
}

// -----------
// Logout Logic
// -----------
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
        // Firebase logout call added
        await auth.signOut();
        localStorage.clear();
        window.location.href = "auth.html";
    } catch (error) {
        console.error("Logout failed:", error);
        localStorage.clear();
        window.location.href = "auth.html";
    }
});

// ---------------------
// Modal Open / Close
// ---------------------
const createServerModal = document.getElementById("createServerModal");
const openModalBtn = document.querySelector("button.bg-blue-600");
const closeModalBtn = document.getElementById("closeModalBtn");

openModalBtn?.addEventListener("click", () => {
    createServerModal?.classList.remove("hidden");
});

closeModalBtn?.addEventListener("click", () => {
    createServerModal?.classList.add("hidden");
    // Reset modal form and map on close
    const form = document.getElementById("createServerForm");
    form?.reset();
    document.getElementById('rangeValue').textContent = '500';

    // Clear stored coords
    const locInput = document.getElementById('serverLocation');
    if (locInput) {
        delete locInput.dataset.lat;
        delete locInput.dataset.lng;
    }

    // Remove Leaflet map instance if exists
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
        markerInstance = null;
    }

    document.getElementById('detectedLocation').textContent = 'Not set';
});

// Range slider live update
document.getElementById('serverRange')?.addEventListener('input', function () {
    const rv = document.getElementById('rangeValue');
    if (rv) rv.textContent = this.value;
});

// ----------------------
// Detect Location & Map (Leaflet)
// ----------------------
// mapInstance aur markerInstance ka declaration uper le jaya gaya hai (globally defined)

document.getElementById('detectLocationBtn')?.addEventListener('click', () => {
    if (navigator.geolocation) {
        Swal.fire({
            title: 'Detecting location...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });
        navigator.geolocation.getCurrentPosition(showLocation, locationError);
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Not supported',
            text: 'Geolocation is not supported by your browser.'
        });
    }
});

function showLocation(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    // Store coords in hidden input dataset
    const locInput = document.getElementById('serverLocation');
    if (locInput) {
        locInput.dataset.lat = lat;
        locInput.dataset.lng = lng;
    }

    // Update UI text
    const detectedLoc = document.getElementById('detectedLocation');
    if (detectedLoc) detectedLoc.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    // Initialize/update Leaflet map
    if (!mapInstance) {
        mapInstance = L.map('mapPreview').setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance);
        markerInstance = L.marker([lat, lng]).addTo(mapInstance).bindPopup('Detected Location').openPopup();
    } else {
        mapInstance.setView([lat, lng], 15);
        markerInstance.setLatLng([lat, lng]).update();
    }

    Swal.close();
}

function locationError(err) {
    Swal.fire({
        icon: 'error',
        title: 'Location Error',
        text: err.message || 'Unable to retrieve your location.'
    });
}

// ---------------------
// Create Server Handler
// ---------------------
document.getElementById("createServerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const userData = JSON.parse(localStorage.getItem("user"));
    if (!userData) return;

    const nameEl = document.getElementById("serverName");
    const descEl = document.getElementById("serverDescription");
    const rangeEl = document.getElementById("serverRange");
    const locInput = document.getElementById('serverLocation');

    const name = nameEl ? nameEl.value.trim() : "";
    const description = descEl ? descEl.value.trim() : "";
    const range = rangeEl ? parseInt(rangeEl.value, 10) : 0;

    if (!name) return Swal.fire({ icon: 'warning', title: 'Name required', text: 'Please enter server name.' });
    if (!range) return Swal.fire({ icon: 'warning', title: 'Range required', text: 'Please set a valid range.' });

    // Coordinates check
    let lat = null, lng = null;
    if (locInput?.dataset?.lat && locInput?.dataset?.lng) {
        lat = parseFloat(locInput.dataset.lat);
        lng = parseFloat(locInput.dataset.lng);
    }

    if (lat === null || lng === null) {
        return Swal.fire({
            icon: 'warning',
            title: 'Location Required',
            text: 'Please detect the server location using "Auto Detect Location" before creating the server.',
            confirmButtonColor: '#3b82f6'
        });
    }

    const newServer = {
        name,
        description,
        range,
        lat,
        lng,
        uid: userData.uid,
        createdAt: Date.now(),
        employees: 0,
        attendanceRatio: 0
    };

    try {
        const docRef = await db.collection("servers").add(newServer);

        // Append card immediately
        const serverList = document.querySelector(".col-span-2.grid");
        if (serverList) {
            const card = `
                <div class="group relative bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-lg hover:border-gray-300 transition-all duration-300 hover:bg-gray-50">
                    <div class="flex items-start justify-between mb-3">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-900">${newServer.name}</h3>
                            <p class="text-xs text-gray-400 mt-1">${new Date(newServer.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div class="bg-gray-100 p-2 rounded-lg group-hover:bg-gray-200 transition">
                            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 mb-4 leading-relaxed">${newServer.description || 'No description'}</p>
                    <div class="flex items-center justify-between mt-auto text-sm">
                        <span class="text-gray-700 font-medium flex items-center gap-1">👥 0 Employees</span>
                        <button data-id="${docRef.id}" class="viewServerBtn inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs rounded-md font-medium transition">View</button>
                    </div>
                </div>`;
            serverList.insertAdjacentHTML("beforeend", card);

            // Attach event for new View button
            const newBtn = serverList.querySelector(`.viewServerBtn[data-id="${docRef.id}"]`);
            if (newBtn) newBtn.addEventListener('click', () => window.location.href = `server.html?id=${docRef.id}`);
        }

        // Reset modal safely
        createServerModal?.classList.add("hidden");
        document.getElementById("createServerForm")?.reset();
        document.getElementById('rangeValue').textContent = '500';

        // Clear stored coords and map
        if (locInput) {
            delete locInput.dataset.lat;
            delete locInput.dataset.lng;
        }
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
            markerInstance = null;
        }
        document.getElementById('detectedLocation').textContent = 'Not set';
        
        // Re-initialize dashboard to update the chart immediately
        initializeDashboard(); 

        Swal.fire({
            icon: 'success',
            title: 'Server Created!',
            text: `"${newServer.name}" has been created successfully.`,
            timer: 1800,
            showConfirmButton: false
        });

    } catch (error) {
        console.error("Error creating server:", error);
        Swal.fire({
            icon: 'error',
            title: 'Oops!',
            text: 'Failed to create server. Please try again.',
            confirmButtonColor: '#d33'
        });
    }
});