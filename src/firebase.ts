// Google Identity Platform = Firebase Auth on the web. This initializes the
// client SDK from the public web config (apiKey here is a client identifier, not
// a secret). MFA is enforced by Identity Platform configuration server-side.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
};

export const firebaseApp = initializeApp(cfg);
export const auth = getAuth(firebaseApp);
