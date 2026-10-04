'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { DetectionResult } from '@/types/detector';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
let connectionChecked = false;
export async function testFirestoreConnection(): Promise<void> {
  if (typeof window === 'undefined' || connectionChecked) return;
  connectionChecked = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined') {
  testFirestoreConnection();
}

export interface UserProfileRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  userType: 'student' | 'standard';
  institutionName: string;
  studentId: string;
  createdAt?: any;
  updatedAt?: any;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  if (cleaned.length >= 1 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

function clampNumber(val: number, min: number, max: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export async function ensureUserProfileInFirestore(
  user: FirebaseUser,
  metadata?: {
    userType?: 'student' | 'standard';
    institutionName?: string;
    studentId?: string;
  }
): Promise<UserProfileRecord> {
  const uid = sanitizeId(user.uid, 'usr');
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const email = (user.email || 'student@example.com').trim().slice(0, 254);
  const defaultDisplayName = (
    user.displayName ||
    email.split('@')[0] ||
    'Student'
  )
    .trim()
    .slice(0, 120);
  const photoURL = (user.photoURL || '').trim().slice(0, 512);

  if (existingSnap && existingSnap.exists()) {
    const existingData = existingSnap.data() as UserProfileRecord;
    if (
      metadata &&
      ((metadata.userType && metadata.userType !== existingData.userType) ||
        (metadata.institutionName &&
          metadata.institutionName.trim() !== existingData.institutionName) ||
        (metadata.studentId &&
          metadata.studentId.trim() !== existingData.studentId))
    ) {
      const nextUserType: 'student' | 'standard' =
        metadata.userType === 'standard' ? 'standard' : 'student';
      const nextInstitution = (
        metadata.institutionName ?? existingData.institutionName ?? ''
      )
        .trim()
        .slice(0, 160);
      const nextStudentId = (metadata.studentId ?? existingData.studentId ?? '')
        .trim()
        .slice(0, 64);

      try {
        await updateDoc(userRef, {
          displayName: (existingData.displayName || defaultDisplayName).slice(0, 120),
          photoURL: (photoURL || existingData.photoURL || '').slice(0, 512),
          userType: nextUserType,
          institutionName: nextInstitution,
          studentId: nextStudentId,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, userPath);
      }

      return {
        ...existingData,
        displayName: (existingData.displayName || defaultDisplayName).slice(0, 120),
        photoURL: (photoURL || existingData.photoURL || '').slice(0, 512),
        userType: nextUserType,
        institutionName: nextInstitution,
        studentId: nextStudentId,
      };
    }

    return existingData;
  }

  const userType: 'student' | 'standard' =
    metadata?.userType === 'standard' ? 'standard' : 'student';
  const institutionName = (metadata?.institutionName || '').trim().slice(0, 160);
  const studentId = (metadata?.studentId || '').trim().slice(0, 64);

  const newProfile = {
    uid,
    email: email.length >= 3 ? email : 'user@example.com',
    displayName: defaultDisplayName.length >= 1 ? defaultDisplayName : 'Student',
    photoURL,
    userType,
    institutionName,
    studentId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(userRef, newProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, userPath);
  }

  return newProfile;
}

export async function signInWithGooglePopup(metadata?: {
  userType?: 'student' | 'standard';
  institutionName?: string;
  studentId?: string;
}): Promise<{ user: FirebaseUser; profile: UserProfileRecord }> {
  const credential = await signInWithPopup(auth, googleProvider);
  const profile = await ensureUserProfileInFirestore(credential.user, metadata);
  return { user: credential.user, profile };
}

export async function signOutFromFirebase(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function saveScanResultToFirestore(
  user: FirebaseUser,
  result: DetectionResult
): Promise<void> {
  if (!user?.uid || !user.emailVerified) return;

  // Ensure parent user document exists first (Master Gate requirement)
  await ensureUserProfileInFirestore(user);

  const uid = sanitizeId(user.uid, 'usr');
  const scanId = sanitizeId(result.id || `scan_${Date.now()}`, 'scan');
  const scanPath = `users/${uid}/scans/${scanId}`;
  const scanRef = doc(db, 'users', uid, 'scans', scanId);

  const title =
    (result.documentTitle || 'Untitled Manuscript').trim().slice(0, 200) ||
    'Untitled Manuscript';
  const summary =
    (result.summary || 'Analysis completed.').trim().slice(0, 2000) ||
    'Analysis completed.';

  let payloadJson = JSON.stringify({ ...result, id: scanId });
  if (payloadJson.length > 395000) {
    // Truncate segments list if huge so it stays strictly within the 400,000 char blueprint limit
    const compactResult: DetectionResult = {
      ...result,
      id: scanId,
      segments: (result.segments || []).slice(0, 120),
    };
    payloadJson = JSON.stringify(compactResult).slice(0, 400000);
  }

  const scanDoc = {
    id: scanId,
    ownerId: uid,
    title,
    wordCount: clampNumber(Math.round(result.wordCount || 0), 0, 100000),
    overallScore: clampNumber(Math.round(result.originalityScore || 0), 0, 100),
    plagiarismScore: clampNumber(Math.round(result.plagiarismScore || 0), 0, 100),
    paraphraseScore: clampNumber(Math.round(result.paraphraseScore || 0), 0, 100),
    aiScore: clampNumber(Math.round(result.aiLikelihood || 0), 0, 100),
    originalScore: clampNumber(Math.round(result.originalityScore || 0), 0, 100),
    summary,
    payloadJson,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(scanRef, scanDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, scanPath);
  }
}

export function subscribeToUserScans(
  user: FirebaseUser,
  onScansUpdated: (scans: DetectionResult[]) => void
): Unsubscribe {
  const uid = sanitizeId(user.uid, 'usr');
  const scansPath = `users/${uid}/scans`;
  const scansQuery = query(
    collection(db, 'users', uid, 'scans'),
    where('ownerId', '==', uid)
  );

  return onSnapshot(
    scansQuery,
    (snapshot) => {
      const loaded: DetectionResult[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.payloadJson && typeof data.payloadJson === 'string') {
          try {
            const parsed = JSON.parse(data.payloadJson) as DetectionResult;
            loaded.push(parsed);
          } catch {
            // Ignore malformed JSON
          }
        }
      });
      loaded.sort((a, b) => {
        const tA = new Date(a.timestamp || 0).getTime();
        const tB = new Date(b.timestamp || 0).getTime();
        return tB - tA;
      });
      onScansUpdated(loaded);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, scansPath);
    }
  );
}

export async function clearAllUserScansInFirestore(user: FirebaseUser): Promise<void> {
  if (!user?.uid) return;
  const uid = sanitizeId(user.uid, 'usr');
  const scansPath = `users/${uid}/scans`;
  const scansQuery = query(
    collection(db, 'users', uid, 'scans'),
    where('ownerId', '==', uid)
  );

  let snapshot;
  try {
    snapshot = await getDocs(scansQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, scansPath);
  }

  for (const docSnap of snapshot.docs) {
    const docPath = `users/${uid}/scans/${docSnap.id}`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'scans', docSnap.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  }
}
