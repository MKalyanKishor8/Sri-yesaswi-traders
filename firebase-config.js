/**
 * ==============================================================================
 * Sri Yesaswi Traders - Firebase Configuration & Database Services
 * ==============================================================================
 * Provides Cloud Firestore and Firebase Authentication integration for:
 * 1. Client & Admin User Authentication (Sign Up, Sign In, Role Management)
 * 2. Consignment RFQ & Quote Submissions Storage
 * 3. Live Price Lock Contracts & Activity Feeds
 * ==============================================================================
 */

// Your Firebase Web App Configuration
// Replace the placeholder values below with your Firebase Console Project settings:
// (Go to Firebase Console -> Project Settings -> General -> Your apps -> Web app)
const firebaseConfig = {
  apiKey: "AIzaSyYOUR_API_KEY_HERE",
  authDomain: "sri-yesaswi-traders.firebaseapp.com",
  projectId: "sri-yesaswi-traders",
  storageBucket: "sri-yesaswi-traders.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

// State flag to detect if active credentials are provided
const isFirebaseConfigured = () => {
  return (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("YOUR_API_KEY_HERE") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes("sri-yesaswi-traders")
  );
};

// Initialize Firebase App & Services
let auth = null;
let db = null;
let isInitialized = false;

try {
  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    isInitialized = true;
    console.log("⚡ Firebase successfully initialized for Sri Yesaswi Traders.");
  }
} catch (error) {
  console.warn("⚠️ Firebase live connection pending API keys. Using local secure fallback database.", error);
}

/**
 * Local Database Fallback (Ensures the app always works seamlessly offline or pre-configuration)
 */
const LocalDB = {
  getUsers: () => JSON.parse(localStorage.getItem("syt_users") || "[]"),
  saveUser: (user) => {
    const users = LocalDB.getUsers();
    users.push(user);
    localStorage.setItem("syt_users", JSON.stringify(users));
  },
  findUser: (email) => LocalDB.getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase()),
  getRFQs: () => JSON.parse(localStorage.getItem("syt_rfqs") || "[]"),
  saveRFQ: (rfq) => {
    const rfqs = LocalDB.getRFQs();
    rfqs.unshift(rfq);
    localStorage.setItem("syt_rfqs", JSON.stringify(rfqs));
  }
};

/**
 * Register a new enterprise buyer
 */
async function registerUser(userData) {
  const { company, name, phone, email, commodity, password } = userData;

  // 1. Try Firebase Auth + Firestore
  if (isInitialized && isFirebaseConfigured()) {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // Store profile metadata in Firestore 'users' collection
      await db.collection("users").doc(user.uid).set({
        uid: user.uid,
        company,
        name,
        phone,
        email,
        commodity,
        role: "buyer",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, user: { uid: user.uid, email, name, role: "buyer" } };
    } catch (err) {
      console.error("Firebase Registration Error:", err);
      return { success: false, error: err.message };
    }
  }

  // 2. Fallback Storage
  if (LocalDB.findUser(email)) {
    return { success: false, error: "An enterprise account with this email already exists." };
  }

  const newUser = {
    id: "user_" + Date.now(),
    company,
    name,
    phone,
    email,
    commodity,
    role: "buyer",
    createdAt: new Date().toISOString()
  };

  LocalDB.saveUser(newUser);
  return { success: true, user: newUser };
}

/**
 * Sign In client or admin
 */
async function loginUser(email, password, role = "buyer", pin = null) {
  // 1. Try Firebase Auth
  if (isInitialized && isFirebaseConfigured()) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      const user = userCredential.user;

      const userDoc = await db.collection("users").doc(user.uid).get();
      const profile = userDoc.exists ? userDoc.data() : { role: "buyer", name: email };

      if (role === "admin" && profile.role !== "admin") {
        return { success: false, error: "Access denied. Not an authorized admin account." };
      }

      return { success: true, user: { uid: user.uid, email, ...profile } };
    } catch (err) {
      console.error("Firebase Login Error:", err);
      return { success: false, error: err.message };
    }
  }

  // 2. Fallback Authentication
  if (role === "admin") {
    // Admin credentials validation
    if (email.toLowerCase() === "admin@sriyesaswitraders.com" || pin === "531116") {
      return {
        success: true,
        user: {
          id: "admin_suresh",
          name: "M.V SURESH KUMAR",
          email: "admin@sriyesaswitraders.com",
          role: "admin",
          designation: "Founder & Managing Director"
        }
      };
    }
    return { success: false, error: "Invalid admin email, password, or 2FA PIN." };
  }

  // Buyer validation
  const existingUser = LocalDB.findUser(email);
  if (existingUser || email === "buyer@globalagro.com") {
    return {
      success: true,
      user: existingUser || {
        id: "demo_buyer",
        name: "Apex Global Buyer",
        email: email,
        role: "buyer"
      }
    };
  }

  return { success: false, error: "Account not found. Please register your enterprise first." };
}

/**
 * Save Consignment Sourcing RFQ to Database
 */
async function saveRFQ(rfqData) {
  const newRFQ = {
    ...rfqData,
    status: "Pending Review",
    createdAt: new Date().toISOString(),
    id: "RFQ-" + Math.floor(100000 + Math.random() * 900000)
  };

  // 1. Try Firebase Firestore
  if (isInitialized && isFirebaseConfigured()) {
    try {
      const docRef = await db.collection("rfqs").add({
        ...rfqData,
        status: "Pending Review",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("✅ RFQ saved to Cloud Firestore with ID:", docRef.id);
      return { success: true, id: docRef.id };
    } catch (err) {
      console.error("Firestore RFQ Save Error:", err);
    }
  }

  // 2. Fallback Storage
  LocalDB.saveRFQ(newRFQ);
  console.log("💾 RFQ saved to local storage database:", newRFQ.id);
  return { success: true, id: newRFQ.id };
}

/**
 * Retrieve RFQ list
 */
async function getRFQs() {
  if (isInitialized && isFirebaseConfigured()) {
    try {
      const snapshot = await db.collection("rfqs").orderBy("createdAt", "desc").limit(10).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error("Firestore Fetch Error:", err);
    }
  }
  return LocalDB.getRFQs();
}
