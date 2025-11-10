// index.js - Employee Login Logic (FINAL VERSION)

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");

    let db;

    // Firebase initialization from firebase_config.json
    async function initFirebase() {
        if (!firebase.apps.length) {
            try {
                const config = await fetch("firebase_config.json").then(res => res.json());
                firebase.initializeApp(config);
                db = firebase.firestore();
            } catch (error) {
                console.error("Firebase init failed:", error);
                Swal.fire({
                    icon: "error",
                    title: "Initialization Error",
                    text: "Failed to initialize Firebase. Please try again later."
                });
            }
        }
    }

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const authCodeInput = document.getElementById("authCode").value.trim();
        const dobInput = document.getElementById("dateOfBirth").value.trim();

        if (!authCodeInput || !dobInput) {
            Swal.fire({
                icon: "warning",
                title: "Missing Information",
                text: "Please enter both Auth Code and Date of Birth."
            });
            return;
        }

        await initFirebase();
        if (!db) return;

        try {
            // 🛑 DEBUGGING STEP: Input values ko console mein print kar rahe hain
            console.log("--- DEBUG INPUT START ---");
            console.log("Input Auth Code:", authCodeInput);
            console.log("Input DOB (Format should be YYYY-MM-DD):", dobInput);
            console.log("-------------------------");
            
            // Query Firestore for employee with matching authCode and dob
            const querySnapshot = await db
                .collectionGroup("employees")
                .where("authCode", "==", authCodeInput)
                .where("dob", "==", dobInput)
                .limit(1)
                .get();

            if (querySnapshot.empty) {
                // If query succeeds but finds nothing, it means data mismatch.
                Swal.fire({
                    icon: "error",
                    title: "Login Failed",
                    // Ab hum jante hain ki yeh data mismatch error hai
                    text: "Invalid Auth Code or Date of Birth. Please check the values and DOB format (YYYY-MM-DD)."
                });
                return;
            }

            // Found matching employee
            const doc = querySnapshot.docs[0];
            const employee = doc.data();

            // Employee document reference: servers/{serverId}/employees/{empId}
            const serverId = doc.ref.parent.parent.id;
            const empId = doc.id;

            // Store user session data in localStorage
            localStorage.setItem("user", JSON.stringify({
                name: employee.name,
                empID: employee.empID,
                authCode: employee.authCode,
                dob: employee.dob,
                mobile: employee.mobile,
                serverId,
                empId
            }));

            Swal.fire({
                icon: "success",
                title: "Login Successful",
                html: `Welcome back, <b>${employee.name}</b>! Redirecting...`,
                timer: 2000,
                showConfirmButton: false,
            }).then(() => {
                window.location.href = `authSetup.html?server=${encodeURIComponent(serverId)}&emp=${encodeURIComponent(empId)}`;
            });

        } catch (error) {
            console.error("Login error:", error);
            
            // Agar Index enabled hai aur phir bhi yahi error aata hai, to yeh Security Rules ka error hai.
            let errorMessage = "An error occurred. Please clear cache/local storage and try again.";
            if (error.code && error.code.includes('permission-denied')) {
                 errorMessage = "Permissions Error: The employee read rule might not be public (allow read: if true; missing).";
            } else if (error.message && error.message.includes('index')) {
                 errorMessage = "Index status error: The Collection Group Index is still not fully active ('Serving') or the collection name is wrong.";
            }
            
            Swal.fire({
                icon: "error",
                title: "Error",
                text: errorMessage
            });
        }
    });
});