// employeeDetail.js (FINAL FIX)
document.addEventListener("DOMContentLoaded", () => {
    let db, attendanceChart;
    const serverId = new URLSearchParams(window.location.search).get("server");
    const empId = new URLSearchParams(window.location.search).get("emp");
    const userData = JSON.parse(localStorage.getItem("user"));

    if (!serverId || !empId || !userData) {
        window.location.href = "dashboard.html";
        return;
    }

    const userNameSpan = document.getElementById("user-name");
    if (userNameSpan && userData.name) {
        userNameSpan.textContent = userData.name;
    }

    // DOM refs (existing code)
    const detailName = document.getElementById("detailName");
    const detailEmpID = document.getElementById("detailEmpID");
    const detailDOB = document.getElementById("detailDOB");
    const detailMobile = document.getElementById("detailMobile");

    const empDetailName = document.getElementById("empDetailName");
    const empDetailID = document.getElementById("empDetailID");
    const empDetailDOB = document.getElementById("empDetailDOB");
    const empDetailMobile = document.getElementById("empDetailMobile");

    const editBtn = document.getElementById("editBtn");
    const deleteBtn = document.getElementById("deleteBtn");

    const modal = document.getElementById("employeeDetailsModal");
    const closeModalBtn = document.getElementById("closeEmployeeModalBtn");
    const editEmployeeBtn = document.getElementById("editEmployeeBtn");
    const saveChangesBtn = document.getElementById("saveChangesBtn");

    const downloadBtn = document.getElementById("downloadBtn");
    const historyTableBody = document.getElementById("historyTable");
    const attendanceCanvas = document.getElementById("attendanceChart");

    let currentData = {};

    // --------------------
    // Firebase Init (CRITICAL FIX: Added Auth State Check)
    // --------------------
    fetch("firebase_config.json")
        .then(res => {
            if (!res.ok) throw new Error("Failed to load firebase_config.json");
            return res.json();
        })
        .then(config => {
            if (!firebase.apps.length) {
                // Initialize app with compat SDK
                const app = firebase.initializeApp(config);
                firebase.auth(app); // Initialize auth for state tracking
            }
            db = firebase.firestore();

            // 🛑 CRITICAL FIX: Ensure user is logged in before accessing Firestore
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    loadEmployeeDetails();
                    loadAttendanceData();
                } else {
                    window.location.href = "auth.html";
                }
            });
        })
        .catch(err => {
            console.error("Firebase init failed:", err);
            Swal.fire("Error", "Failed to initialize Firebase", "error");
        });

    // --------------------
    // Employee Details
    // --------------------
    async function loadEmployeeDetails() {
        try {
            // Read from servers/{serverId}/employees/{empId}
            const empRef = db.collection("servers").doc(serverId).collection("employees").doc(empId);
            const doc = await empRef.get();

            if (!doc.exists) {
                Swal.fire("Not Found", "Employee not found", "warning");
                return;
            }

            currentData = doc.data();

            detailName.textContent = currentData.name || "-";
            detailEmpID.textContent = currentData.empID || "-";
            detailDOB.textContent = currentData.dob || "-";
            detailMobile.textContent = currentData.mobile || "-";

            empDetailName.value = currentData.name || "";
            empDetailID.value = currentData.empID || "";
            empDetailDOB.value = currentData.dob || "";
            empDetailMobile.value = currentData.mobile || "";

        } catch (err) {
            console.error("Error loading employee:", err);
            Swal.fire("Error", "Error loading employee data. Check Firestore Rules (Employee Read).", "error");
        }
    }

    // Modal / Edit (Logic remains same)
    editBtn?.addEventListener("click", () => {
        modal.classList.remove("hidden");
        makeInputsReadOnly(true);
        saveChangesBtn.classList.add("hidden");
        editEmployeeBtn.classList.remove("hidden");
    });

    closeModalBtn?.addEventListener("click", () => {
        modal.classList.add("hidden");
    });

    editEmployeeBtn?.addEventListener("click", () => {
        makeInputsReadOnly(false);
        saveChangesBtn.classList.remove("hidden");
        editEmployeeBtn.classList.add("hidden");
    });

    saveChangesBtn?.addEventListener("click", async () => {
        const updatedData = {
            name: empDetailName.value.trim(),
            dob: empDetailDOB.value,
            mobile: empDetailMobile.value,
        };

        try {
            // Update to servers/{serverId}/employees/{empId} (Requires 'update' permission)
            const empRef = db.collection("servers").doc(serverId).collection("employees").doc(empId);
            await empRef.update(updatedData);

            Swal.fire("Updated", "Employee details updated successfully", "success");
            modal.classList.add("hidden");
            loadEmployeeDetails();

        } catch (err) {
            console.error("Error updating employee:", err);
            Swal.fire("Error", "Failed to update employee. Check Firestore Rules (Employee Update).", "error");
        }
    });

    deleteBtn?.addEventListener("click", async () => {
        const confirmed = await Swal.fire({
            title: "Are you sure?",
            text: "This will permanently delete the employee.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, delete it!",
        });

        if (confirmed.isConfirmed) {
            try {
                // Delete from servers/{serverId}/employees/{empId} (Requires 'delete' permission)
                const empRef = db.collection("servers").doc(serverId).collection("employees").doc(empId);
                await empRef.delete();

                // Update employees count in parent server doc (Requires 'update' permission on /servers/{serverId})
                await db.collection("servers").doc(serverId).update({
                    employees: firebase.firestore.FieldValue.increment(-1),
                });

                Swal.fire("Deleted", "Employee has been deleted", "success").then(() => {
                    window.location.href = `server.html?id=${serverId}`; // Changed from ?server to ?id for consistency
                });

            } catch (err) {
                console.error("Error deleting employee:", err);
                Swal.fire("Error", "Failed to delete employee. Check Firestore Rules (Employee Delete).", "error");
            }
        }
    });

    function makeInputsReadOnly(flag) {
        empDetailName.readOnly = flag;
        empDetailDOB.readOnly = flag;
        empDetailMobile.readOnly = flag;
    }

    // -------------------------
    // Attendance Data
    // -------------------------
    async function loadAttendanceData() {
        try {
            // Read from servers/{serverId}/employees/{empId}/attendance (Requires 'read' permission on subcollection)
            const attendanceRef = db
                .collection("servers")
                .doc(serverId)
                .collection("employees")
                .doc(empId)
                .collection("attendance");

            const snapshot = await attendanceRef.orderBy("date", "desc").limit(300).get();

            const records = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const status = (data.status || "").toString().toLowerCase() === "present" ? "Present" : "Absent";
                records.push({
                    id: doc.id,
                    dateKey: data.date || null,
                    timestamp: data.timestamp ? data.timestamp.toDate() : (data.createdAt ? data.createdAt.toDate() : null),
                    status,
                    verificationMethod: data.verificationMethod || "",
                    autoMarked: !!data.autoMarked
                });
            });

            renderHistoryTable(records);
            renderCurrentMonthChart(records);
            setupDownload(records);

        } catch (err) {
            console.error("Failed to load attendance:", err);
            Swal.fire("Error", "Failed to load attendance data. Check Firestore Rules (Attendance Read).", "error");
        }
    }

    // History Table (Logic remains same)
    function renderHistoryTable(records) {
        historyTableBody.innerHTML = "";

        if (!records.length) {
            historyTableBody.innerHTML = `
                <tr><td class="px-4 py-6 text-center text-gray-500" colspan="3">No attendance records found.</td></tr>
            `;
            return;
        }

        records.forEach(rec => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-gray-50";

            const dateDisplay = rec.dateKey ? formatDateLong(rec.dateKey) : (rec.timestamp ? formatDateLongFromDate(rec.timestamp) : "N/A");
            const timeDisplay = rec.timestamp ? rec.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";

            const statusClass = rec.status === "Present" ? 'inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700' :
                'inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700';

            tr.innerHTML = `
                <td class="px-4 py-3 text-sm text-gray-900">${dateDisplay}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${timeDisplay}</td>
                <td class="px-4 py-3"><span class="${statusClass}">${rec.status}</span></td>
            `;

            historyTableBody.appendChild(tr);
        });
    }

    function formatDateLong(dateKey) {
        try {
            const parts = dateKey.split("-");
            const d = new Date(parts[0], Number(parts[1]) - 1, parts[2]);
            return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return dateKey;
        }
    }
    function formatDateLongFromDate(dateObj) {
        return dateObj.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }

    // -------------------------
    // Chart (Logic remains same)
    // -------------------------
    function renderCurrentMonthChart(records) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        let presentCount = 0, absentCount = 0;

        records.forEach(r => {
            if (!r.dateKey) return;
            if (!r.dateKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) return;
            if (r.status === "Present") presentCount++;
            else absentCount++;
        });

        if (attendanceChart) attendanceChart.destroy();

        const ctx = attendanceCanvas.getContext('2d');
        attendanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Present', 'Absent'],
                datasets: [{
                    label: 'Attendance (This Month)',
                    data: [presentCount, absentCount],
                    backgroundColor: ['#4CAF50', '#F44336']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { size: 14 } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }

    // -------------------------
    // CSV Download (Logic remains same)
    // -------------------------
    function setupDownload(records) {
        // Remove previous listener before adding new one
        downloadBtn?.removeEventListener("click", downloadCsvHandler);
        
        downloadBtn?.addEventListener("click", downloadCsvHandler);
        
        function downloadCsvHandler() {
            if (!records.length) {
                Swal.fire("No data", "No attendance data to download", "info");
                return;
            }

            const csvRows = [];
            const headers = ["Date", "Check-In", "Status", "VerificationMethod", "AutoMarked"];
            csvRows.push(headers.join(","));

            const rev = records.slice().reverse();

            rev.forEach(r => {
                const date = r.dateKey || (r.timestamp ? r.timestamp.toISOString().split("T")[0] : "");
                const time = r.timestamp ? r.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
                const status = r.status;
                const method = r.verificationMethod || "";
                const autoMarked = r.autoMarked ? "true" : "false";

                const row = [date, time, status, method, autoMarked].map(field => `"${String(field).replace(/"/g, '""')}"`);
                csvRows.push(row.join(","));
            });

            const csvString = csvRows.join("\r\n");
            const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `attendance_${empId}_${new Date().toISOString().split("T")[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    window.addEventListener("beforeunload", () => {
        if (attendanceChart) attendanceChart.destroy();
    });
});