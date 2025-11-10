document.addEventListener("DOMContentLoaded", () => {
    let auth, db;
    const serverId = new URLSearchParams(window.location.search).get("id");
    const userData = JSON.parse(localStorage.getItem("user"));

    // Quick initial check, but onAuthStateChanged is more reliable
    if (!serverId || !userData) {
        window.location.href = "dashboard.html";
        return;
    }

    fetch("firebase_config.json")
        .then(res => res.json())
        .then(config => {
            const app = firebase.initializeApp(config);
            auth = firebase.auth();
            db = firebase.firestore();
            
            // 🛑 CRITICAL FIX: Authentication state check lagaya
            auth.onAuthStateChanged(user => {
                if (user) {
                    init();
                } else {
                    console.log("User is not authenticated. Redirecting.");
                    localStorage.clear();
                    window.location.href = "auth.html";
                }
            });

        })
        .catch(err => console.error("Firebase init failed:", err));

    async function init() {
        await loadServerInfo();
        await loadEmployees();
        await loadChart();
    }

    async function loadServerInfo() {
        try {
            const doc = await db.collection("servers").doc(serverId).get();
            const server = doc.data();
            if (server) {
                document.getElementById("serverName").textContent = `${server.name} — Employee Management`;
                // Assuming your HTML has id="user-name" in the header/navbar
                document.getElementById("user-name").textContent = userData.name || 'Manager'; 
            }
        } catch (err) {
            console.error("Failed to fetch server info:", err);
            // If server info fails, it's likely a permission issue too
            if (err.code === 'permission-denied') {
                 Swal.fire({icon: 'error', title: 'Error', text: 'Permission denied to load server info. Check Firestore Rules.'});
            }
        }
    }

    async function loadEmployees() {
        const listContainer = document.getElementById("employeeList");
        listContainer.innerHTML = "";

        try {
            // This query reads from the subcollection servers/{serverId}/employees
            const snapshot = await db.collection("servers")
                .doc(serverId)
                .collection("employees")
                .orderBy("createdAt", "desc")
                .get();

            if (snapshot.empty) {
                listContainer.innerHTML = `<tr><td colspan="6" class="text-center text-gray-500 py-4">No employees found.</td></tr>`;
                return;
            }

            snapshot.forEach(doc => {
                const emp = doc.data();
                const empDocId = doc.id; 

                const row = `
                    <tr class="hover:bg-gray-50 transition cursor-pointer">
                        <td class="px-6 py-4 font-medium text-blue-600 underline" data-id="${empDocId}">
                            <a href="employeeDetail.html?server=${serverId}&emp=${empDocId}">${emp.name}</a>
                        </td>
                        <td class="px-6 py-4">${emp.empID || "-"}</td>
                        <td class="px-6 py-4">${emp.dob || "-"}</td>
                        <td class="px-6 py-4">${emp.mobile || "-"}</td>
                        <td class="px-6 py-4 font-mono text-blue-600">${emp.authCode || "-"}</td>
                        <td class="px-6 py-4 text-gray-500">${new Date(emp.createdAt).toLocaleDateString()}</td>
                    </tr>`;
                listContainer.insertAdjacentHTML("beforeend", row);
            });

        } catch (err) {
            console.error("Load employee error:", err);
             Swal.fire({icon: 'error', title: 'Error', text: 'Failed to load employees. Check Firestore Rules for /servers/{serverId}/employees subcollection.'});
            listContainer.innerHTML = `<tr><td colspan="6" class="text-center text-red-500 py-4">Error loading employees.</td></tr>`;
        }
    }


    async function loadChart() {
        try {
            // Querying employees subcollection (Potential Permission Error Source 2)
            const empSnapshot = await db.collection("servers")
                .doc(serverId)
                .collection("employees")
                .get();

            if (empSnapshot.empty) return;

            const labels = [];
            const values = [];

            for (const empDoc of empSnapshot.docs) {
                const empData = empDoc.data();
                const empName = empData.name || "Unknown";

                // Querying attendance subcollection (Potential Permission Error Source 3)
                const attendanceSnap = await db.collection("servers")
                    .doc(serverId)
                    .collection("employees")
                    .doc(empDoc.id)
                    .collection("attendance")
                    .where("status", "==", "Present") // sirf present wale
                    .get();

                labels.push(empName);
                values.push(attendanceSnap.size); // 👈 yaha total present days count
            }

            const ctx = document.getElementById("serverChart").getContext("2d");
            
            // Destroy previous chart instance if it exists to prevent overlap
            if (window.myServerChart instanceof Chart) {
                window.myServerChart.destroy();
            }

            window.myServerChart = new Chart(ctx, {
                type: "bar",
                data: {
                    labels: labels,
                    datasets: [{
                        label: "Days Present",
                        data: values,
                        backgroundColor: "#3b82f6",
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => `${ctx.raw} days present`
                            }
                        }
                    }
                }
            });

        } catch (err) {
            console.error("Chart error:", err);
             Swal.fire({icon: 'error', title: 'Error', text: 'Failed to load attendance chart. Check Firestore Rules for attendance subcollection.'});
        }
    }


    function generateAuthCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    document.getElementById("addEmployeeBtn")?.addEventListener("click", () => {
        document.getElementById("addEmployeeModal").classList.remove("hidden");
    });

    document.getElementById("closeModalBtn")?.addEventListener("click", () => {
        document.getElementById("addEmployeeModal").classList.add("hidden");
    });

    document.getElementById("addEmployeeForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("empName").value.trim();
        const empID = document.getElementById("empID").value.trim();
        const dob = document.getElementById("empDOB")?.value.trim();
        const mobile = document.getElementById("empMobile")?.value.trim();
        if (!name || !empID || !dob || !mobile) {
            Swal.fire({ icon: "warning", title: "Incomplete", text: "Please fill all fields." });
            return;
        }
        const authCode = generateAuthCode();
        const newEmp = { name, empID, dob, mobile, authCode, createdAt: Date.now() };

        try {
            // Write to employees subcollection
            await db.collection("servers").doc(serverId).collection("employees").add(newEmp);
            
            // Update employees count in parent server doc (requires 'update' permission on /servers/{serverId})
            await db.collection("servers").doc(serverId).update({
                employees: firebase.firestore.FieldValue.increment(1)
            });

            Swal.fire({
                icon: "success",
                title: "Employee Added",
                html: `<p>${name} has been added successfully.</p><br><b>Auth Code:</b> <code>${authCode}</code>`,
                confirmButtonText: "Copy Code"
            }).then((result) => {
                if (result.isConfirmed) navigator.clipboard.writeText(authCode);
            });

            e.target.reset();
            document.getElementById("addEmployeeModal").classList.add("hidden");
            // Reload employee list to show the new employee
            loadEmployees(); 
            // Reload chart to update stats
            loadChart();

        } catch (err) {
            console.error("Error adding employee:", err);
            Swal.fire({ icon: "error", title: "Failed", text: "Could not add employee. Check Firestore Rules for employee creation." });
        }
    });

    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        localStorage.clear();
        window.location.href = "auth.html";
    });

    // NEW: Delete Server Button Logic
    document.getElementById("deleteServerBtn")?.addEventListener("click", () => {
        Swal.fire({
            title: "Are you sure?",
            text: "Do you really want to delete this server and all its data? This action cannot be undone!",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Delete",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#dc2626",
            cancelButtonColor: "#6b7280",
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    // This deletion might also fail if delete permission on subcollections isn't granted.
                    // Delete all employees under this server first
                    const employeesSnapshot = await db.collection("servers").doc(serverId).collection("employees").get();
                    const batch = db.batch();
                    employeesSnapshot.forEach(doc => batch.delete(doc.ref));
                    // Delete server doc
                    batch.delete(db.collection("servers").doc(serverId));
                    await batch.commit();

                    Swal.fire({
                        icon: "success",
                        title: "Deleted!",
                        text: "Server has been deleted.",
                        timer: 1500,
                        showConfirmButton: false,
                    });

                    // Redirect after short delay
                    setTimeout(() => {
                        window.location.href = "dashboard.html";
                    }, 1600);

                } catch (err) {
                    console.error("Failed to delete server:", err);
                    Swal.fire({ icon: "error", title: "Error", text: "Failed to delete server. Check Firestore Rules for deletion." });
                }
            }
        });
    });
});