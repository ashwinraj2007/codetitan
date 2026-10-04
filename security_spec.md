# Firestore Zero-Trust Security Specification (`security_spec.md`)

## 1. Data Invariants & Relational Mapping

1. **Master Source of Truth (`/users/{userId}`)**:
   - Every user profile document at `/users/{userId}` MUST have `uid == userId` and `uid == request.auth.uid`.
   - Write operations require a verified email (`request.auth.token.email_verified == true`).
   - PII Isolation: Reading `/users/{userId}` is strictly restricted to `request.auth.uid == userId` (never blanket `isSignedIn()`).
   - Immutability: `uid`, `email`, and `createdAt` cannot be modified on update; `updatedAt` must equal `request.time`.

2. **Relational Subcollection (`/users/{userId}/scans/{scanId}`)**:
   - A `ScanRecord` cannot exist unless its parent `/users/{userId}` document exists and belongs to `request.auth.uid` (`get(/databases/$(database)/documents/users/$(userId)).data.uid == request.auth.uid`).
   - `ownerId` MUST equal `request.auth.uid` and `userId`, and `id` MUST equal `scanId`.
   - Scan records are immutable once created (`allow update: if false;`), and can only be read, listed, created, or deleted by the verified owner (`request.auth.uid == userId`).
   - List queries on `/users/{userId}/scans` enforce `request.auth.uid == userId && resource.data.ownerId == request.auth.uid` without any `get()` or `exists()` calls inside `allow list`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on User Create)**: Authenticated user `user_A` attempts to create `/users/user_B` with `{ "uid": "user_B", ... }`. -> `PERMISSION_DENIED`
2. **Payload 2 (Unverified Email Write)**: User with `email_verified: false` attempts to create `/users/user_A`. -> `PERMISSION_DENIED`
3. **Payload 3 (Shadow Field Injection on User Create)**: User includes an undeclared field `{ ..., "isAdmin": true }` when creating `/users/user_A`. -> `PERMISSION_DENIED`
4. **Payload 4 (PII Lateral Read)**: Authenticated user `user_B` attempts `get` on `/users/user_A`. -> `PERMISSION_DENIED`
5. **Payload 5 (Immutable Field Tampering on User Update)**: User `user_A` attempts to change `createdAt` or `uid` during an update to `/users/user_A`. -> `PERMISSION_DENIED`
6. **Payload 6 (Client Timestamp Forgery)**: User `user_A` sends a forged future/past `createdAt` or `updatedAt` instead of `request.time`. -> `PERMISSION_DENIED`
7. **Payload 7 (Value Poisoning on User Update)**: User `user_A` updates `userType` to `"superadmin"` (outside the `["student", "standard"]` enum). -> `PERMISSION_DENIED`
8. **Payload 8 (ID Poisoning / Resource Exhaustion)**: Attacker attempts to create `/users/user_A/scans/{invalid$id!}` or a `title` exceeding 200 characters. -> `PERMISSION_DENIED`
9. **Payload 9 (Orphaned Scan Write without Parent User)**: Authenticated user `user_Ghost` attempts to create `/users/user_Ghost/scans/scan_1` before `/users/user_Ghost` exists. -> `PERMISSION_DENIED`
10. **Payload 10 (Cross-Tenant Scan Creation)**: User `user_A` attempts to create a scan under `/users/user_B/scans/scan_1`. -> `PERMISSION_DENIED`
11. **Payload 11 (Post-Creation Scan Mutation)**: User `user_A` attempts to `update` an existing scan `/users/user_A/scans/scan_1` to alter `overallScore` to `100`. -> `PERMISSION_DENIED`
12. **Payload 12 (Unauthorized Cross-User Scan Listing)**: User `user_B` attempts to `list` documents from `/users/user_A/scans`. -> `PERMISSION_DENIED`
