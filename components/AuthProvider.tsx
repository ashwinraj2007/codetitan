'use client';

import { SessionProvider } from 'next-auth/react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  ensureUserProfileInFirestore,
  signInWithGooglePopup,
  signOutFromFirebase,
  UserProfileRecord,
} from '@/lib/firebase';

interface FirebaseAuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfileRecord | null;
  authReady: boolean;
  loginWithGoogle: (metadata?: {
    userType?: 'student' | 'standard';
    institutionName?: string;
    studentId?: string;
  }) => Promise<void>;
  logoutFirebase: () => Promise<void>;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextType>({
  firebaseUser: null,
  userProfile: null,
  authReady: false,
  loginWithGoogle: async () => {},
  logoutFirebase: async () => {},
});

export function useFirebaseAuth() {
  return useContext(FirebaseAuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.emailVerified) {
        try {
          const profile = await ensureUserProfileInFirestore(user);
          setUserProfile(profile);
        } catch (err) {
          console.error('Failed to sync user profile in Firestore:', err);
        }
      } else {
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async (metadata?: {
    userType?: 'student' | 'standard';
    institutionName?: string;
    studentId?: string;
  }) => {
    const { user, profile } = await signInWithGooglePopup(metadata);
    setFirebaseUser(user);
    setUserProfile(profile);
  };

  const logoutFirebase = async () => {
    await signOutFromFirebase();
    setFirebaseUser(null);
    setUserProfile(null);
  };

  return (
    <SessionProvider>
      <FirebaseAuthContext.Provider
        value={{
          firebaseUser,
          userProfile,
          authReady,
          loginWithGoogle,
          logoutFirebase,
        }}
      >
        {children}
      </FirebaseAuthContext.Provider>
    </SessionProvider>
  );
}
