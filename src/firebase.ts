import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDeXM6bYdVazVJKg-mjH6fTeUn_5T1Y-t8",
  authDomain: "sutn-8fbc6.firebaseapp.com",
  projectId: "sutn-8fbc6",
  storageBucket: "sutn-8fbc6.firebasestorage.app",
  messagingSenderId: "644185940871",
  appId: "1:644185940871:web:3fb8911b58a99c09e1e922",
  measurementId: "G-GEQM9YP38S"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
