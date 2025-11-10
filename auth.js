let auth, db;

// Load firebase config from external JSON file
fetch('firebase_config.json')
  .then(res => res.json())
  .then(config => {
    const app = firebase.initializeApp(config);
    auth = firebase.auth(app);
    db = firebase.firestore(app);
  })
  .catch(err => {
    console.error("Failed to load Firebase config:", err);
    showAlert("Error", "Failed to load Firebase config.", "error");
  });

// Preloader hide
window.addEventListener("load", () => {
  const preloader = document.getElementById("preloader");
  if (preloader) preloader.classList.add("hidden");
});

// Toggle password visibility
function togglePassword(inputId, toggleBtn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
  toggleBtn.textContent = input.type === 'text' ? 'Hide' : 'Show';
}

// Switch between login and signup
function switchForm(type) {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const title = document.getElementById('formTitle');
  if (type === 'signup') {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    title.textContent = 'Create a New Account';
  } else {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    title.textContent = 'Login to Your Account';
  }
}

// Handle Signup
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const company = document.getElementById('signupCompany').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!name || !email || !company || !password) {
    return showAlert("Incomplete", "Please fill in all fields.", "warning");
  }

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCred.user;

    await db.collection("users").doc(user.uid).set({
      fullName: name,
      email: email,
      company: company,
      createdAt: new Date().toISOString()
    });

    // Store session
    localStorage.setItem('user', JSON.stringify({
      uid: user.uid,
      email: user.email,
      name: name,
      company: company
    }));

    // Success alert and redirect
    Swal.fire({
      title: "Success",
      text: "Account created successfully!",
      icon: "success",
      confirmButtonColor: "#3085d6",
      confirmButtonText: "OK"
    }).then(() => {
      window.location.href = "dashboard.html";
    });

  } catch (error) {
    const msg = getCustomAuthError(error.code, 'signup');
    showAlert("Signup Failed", msg, "error");
  }
});

// Handle Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    return showAlert("Incomplete", "Please enter email and password.", "warning");
  }

  try {
    const userCred = await auth.signInWithEmailAndPassword(email, password);
    const user = userCred.user;

    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Store session
    localStorage.setItem('user', JSON.stringify({
      uid: user.uid,
      email: user.email,
      name: userData.fullName || '',
      company: userData.company || ''
    }));

    // Success alert and redirect
    Swal.fire({
      title: "Success",
      text: "Login successful!",
      icon: "success",
      confirmButtonColor: "#3085d6",
      confirmButtonText: "OK"
    }).then(() => {
      window.location.href = "dashboard.html";
    });

  } catch (error) {
    const msg = getCustomAuthError(error.code, 'login');
    showAlert("Login Failed", msg, "error");
  }
});

// Show alert using SweetAlert2
function showAlert(title, message, icon = "info") {
  Swal.fire({
    title: title,
    text: message,
    icon: icon,
    confirmButtonColor: icon === 'success' ? '#3085d6' : '#d33',
    confirmButtonText: 'OK'
  });
}

// Return custom messages for auth errors
function getCustomAuthError(code, type = 'login') {
  switch (code) {
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
      return "Invalid email or password. Please try again.";
    case 'auth/user-not-found':
      return "No account found with this email.";
    case 'auth/email-already-in-use':
      return "This email is already registered. Please log in.";
    case 'auth/weak-password':
      return "Password must be at least 6 characters long.";
    case 'auth/too-many-requests':
      return "Too many failed attempts. Please try again later.";
    case 'auth/invalid-email':
      return "The email address is not valid.";
    default:
      return type === 'signup'
        ? "Signup failed. Please check your details and try again."
        : "Login failed. Please check your credentials and try again.";
  }
}
