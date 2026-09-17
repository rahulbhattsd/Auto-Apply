# Authentication and Session Security

## 1. Authentication Architecture
The Personal AI Agent Platform utilizes secure, cookie-based JSON Web Tokens (JWT):

- **Algorithm**: HMAC SHA-256 (`HS256`).
- **Secret**: Set via `JWT_SECRET` (validated to have sufficient entropy at startup).
- **Transport**: Stored exclusively in an `httpOnly`, `SameSite=Lax` (or `Strict` in production), encrypted cookie (`jwt`).
- **JavaScript Accessibility**: The cookie cannot be read by clientside JavaScript (`document.cookie`), mitigating Cross-Site Scripting (XSS) credential theft.

---

## 2. API Endpoints
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new user account; returns httpOnly cookie | No |
| `POST` | `/api/auth/login` | Authenticate with email/password; returns httpOnly cookie | No |
| `GET` | `/api/auth/me` | Fetch authenticated user session | Yes |
| `POST` | `/api/auth/logout` | Invalidate cookie and terminate session | Yes |

---

## 3. Multi-Tenant User Isolation
Every authenticated route extracts the user context through the `verifyToken` preHandler hook:

```typescript
request.user = {
  id: decoded.userId,
  email: decoded.email,
  role: decoded.role,
};
```

All subsequent operations strictly filter by `userId`:
```typescript
// Memory Isolation
await prisma.memory.findMany({ where: { userId: request.user.id } });

// Conversation Isolation
await prisma.conversation.findUnique({ where: { id: convId, userId: request.user.id } });

// Task Isolation
await prisma.task.findMany({ where: { userId: request.user.id } });
```
Cross-user access attempts result in explicit `403 Forbidden` or `404 Not Found` responses, verified by automated isolation test suites (`apps/api/tests/isolation.test.ts`).

---

## 4. Protection Mechanisms
1. **CSRF Origin Verification**: All mutating API requests (`POST`, `PUT`, `PATCH`, `DELETE`) are inspected against allowlisted `Origin` and `Referer` headers. Unauthorized cross-site requests are rejected with `CSRF_ORIGIN_DENIED (403)`.
2. **Rate Limiting**:
   - Authentication routes (`/api/auth/*`): Limited to 15 requests per minute per IP to prevent brute-force attacks.
   - General API routes: Limited to 100 requests per minute per IP.
3. **Password Security**: Passwords are encrypted using `bcrypt` with a work factor of 10. Plaintext passwords are never stored or logged.
