import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCynxhC8FUJZfmwR2WSa5eAUcPysTWCe_Y",
  authDomain: "sipwise-89d46.firebaseapp.com",
  projectId: "sipwise-89d46",
  storageBucket: "sipwise-89d46.firebasestorage.app",
  messagingSenderId: "620832207017",
  appId: "1:620832207017:web:cf04d9f960dcae3ca939b8",
  measurementId: "G-CJTT00G79K"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const provider = new GoogleAuthProvider();

document.addEventListener('DOMContentLoaded', () => {
  // Panel toggle logic
  const signUpButton = document.getElementById('signUp');
  const signInButton = document.getElementById('signIn');
  const container = document.getElementById('container');

  signUpButton.addEventListener('click', () => {
    container.classList.add("right-panel-active");
    document.body.classList.add("register-bg");
  });

  signInButton.addEventListener('click', () => {
    container.classList.remove("right-panel-active");
    document.body.classList.remove("register-bg");
  });

  // Sign Up Reveal Logic (Name → Email → Password)
  const signUpForm = document.querySelector('.sign-up-container form');
  const nameInput = signUpForm.querySelector('input[placeholder="Name"]');
  const emailInputSignUp = signUpForm.querySelector('input[type="email"]');
  const passwordInputSignUp = signUpForm.querySelector('input[type="password"]');

  emailInputSignUp.style.opacity = '0';
  emailInputSignUp.style.pointerEvents = 'none';
  passwordInputSignUp.style.opacity = '0';
  passwordInputSignUp.style.pointerEvents = 'none';

  nameInput.addEventListener('input', () => {
    if (nameInput.value.trim() !== "") {
      emailInputSignUp.style.opacity = '1';
      emailInputSignUp.style.pointerEvents = 'auto';
    } else {
      emailInputSignUp.style.opacity = '0';
      emailInputSignUp.style.pointerEvents = 'none';
      passwordInputSignUp.style.opacity = '0';
      passwordInputSignUp.style.pointerEvents = 'none';
    }
  });

  emailInputSignUp.addEventListener('input', () => {
    if (emailInputSignUp.value.trim() !== "") {
      passwordInputSignUp.style.opacity = '1';
      passwordInputSignUp.style.pointerEvents = 'auto';
    } else {
      passwordInputSignUp.style.opacity = '0';
      passwordInputSignUp.style.pointerEvents = 'none';
    }
  });

  // Email/Password Registration
  signUpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInputSignUp.value;
    const password = passwordInputSignUp.value;

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("Registration successful!");
      window.location.href = "home.html";
    } catch (error) {
      console.error(error);
      alert("Registration failed: " + error.message);
    }
  });

  // Sign In Reveal Logic (Email → Password)
  const signInForm = document.querySelector('.sign-in-container form');
  const emailInput = signInForm.querySelector('input[type="email"]');
  const passwordInput = signInForm.querySelector('input[type="password"]');

  passwordInput.style.opacity = '0';
  passwordInput.style.pointerEvents = 'none';
  passwordInput.style.transition = 'opacity 0.4s ease';

  emailInput.addEventListener('input', () => {
    if (emailInput.value.trim() !== "") {
      passwordInput.style.opacity = '1';
      passwordInput.style.pointerEvents = 'auto';
    } else {
      passwordInput.style.opacity = '0';
      passwordInput.style.pointerEvents = 'none';
    }
  });

  // Email/Password Login
  signInForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Login successful!");
      window.location.href = "home.html";
    } catch (error) {
      console.error(error);
      let message = "Login failed.";
      if (error.code === "auth/user-not-found") {
        message = "User not found. Please register.";
      } else if (error.code === "auth/wrong-password") {
        message = "Wrong password. Please try again.";
      }
      alert(message);
    }
  });

  // Password Reset
  const resetLink = document.getElementById('resetPasswordLink');
  resetLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = prompt("Enter your email to receive a password reset link:");
    if (!email) return;

    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset link sent! Check your inbox.");
    } catch (error) {
      console.error(error);
      let message = "Failed to send reset link.";
      if (error.code === "auth/user-not-found") {
        message = "No account found with this email.";
      } else if (error.code === "auth/invalid-email") {
        message = "Invalid email address.";
      }
      alert(message);
    }
  });

  // Google Auth
  const googleSignInBtn = document.getElementById('googleSignIn');
  const googleSignUpBtn = document.getElementById('googleSignUp');

  async function handleGoogleAuth(event) {
    const button = event.currentTarget;
    const originalText = button.innerHTML;

    try {
      button.innerHTML = '<span class="spinner"></span> Continuing...';
      button.disabled = true;

      const result = await signInWithPopup(auth, provider);
      const isNewUser = result._tokenResponse?.isNewUser;

      window.location.href = "home.html";

    } catch (error) {
      console.error("Auth error:", error);
      let errorMessage = "Sign in failed. Please try again.";
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = "Sign-in window was closed too soon.";
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = "Network error. Please check your connection.";
      }
      alert(errorMessage);
    } finally {
      button.innerHTML = originalText;
      button.disabled = false;
    }
  }

  googleSignInBtn.addEventListener('click', handleGoogleAuth);
  googleSignUpBtn.addEventListener('click', handleGoogleAuth);
});
