# Security Specification: AI Voice Assistant Memory & Preferences

## 1. Data Invariants
1. A UserProfile can only be read and written by the authenticated user whose `request.auth.uid` matches the `{userId}` path parameter.
2. User memories in `/users/{userId}/memories/{memoryId}` must strictly belong to `{userId}` with `userId == request.auth.uid`.
3. Chat sessions in `/users/{userId}/sessions/{sessionId}` and their messages in `/users/{userId}/sessions/{sessionId}/messages/{messageId}` must strictly belong to `{userId}` with `userId == request.auth.uid`.
4. Users cannot modify or spoof other users' memories, profiles, or conversation history.
5. All IDs must be valid alphanumeric strings adhering to `^[a-zA-Z0-9_\\-]+$` up to 128 characters.
6. Payload field sizes are strictly enforced (e.g. memory fact <= 1000 chars, message text <= 5000 chars).
7. Default deny on all unlisted collections.

## 2. The Dirty Dozen Payloads (Targeting Rejection)
1. **Unauthenticated Read**: Reading `/users/user123` when `request.auth == null` -> DENIED.
2. **Cross-User Profile Hijack**: `user_A` trying to update `/users/user_B` -> DENIED.
3. **Ghost Fields Injection**: Adding `{ maliciousKey: "exploit" }` to `UserProfile` -> DENIED.
4. **Memory Owner Spoofing**: `user_A` creating memory with `userId: "user_B"` under `/users/user_A/memories/m1` -> DENIED.
5. **Cross-User Memory Reading**: `user_A` reading `/users/user_B/memories/m1` -> DENIED.
6. **Huge Payload / Denial of Wallet**: Sending a memory `fact` with 100,000 characters -> DENIED (max 1000).
7. **Invalid Enum Attack**: Creating a memory with `category: "hacked_category"` -> DENIED.
8. **Invalid Path Injection**: Creating a document with ID `../../root` -> DENIED by `isValidId`.
9. **Cross-User Chat Session Tampering**: `user_A` writing messages into `user_B`'s session -> DENIED.
10. **Chat Message Sender Spoofing**: Writing a message with `sender: "admin_override"` -> DENIED (only 'user' | 'zoya').
11. **Timestamp Forgery**: Passing invalid non-timestamp formats -> Validated.
12. **Blanket Query Scraping**: Listing `/users` root collection -> DENIED.
