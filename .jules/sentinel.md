## 2026-07-26 - Overly Permissive CORS
**Vulnerability:** Express and Socket.io were configured to allow all origins (`*`) via `cors()`.
**Learning:** This exposes the local API to any website the user visits, leading to CSRF and cross-origin data theft risks.
**Prevention:** Always restrict CORS to specific local origins (`http://localhost:5173`, `http://127.0.0.1:5173`, etc.) and allow dynamic origins via environment variables (`ALLOWED_ORIGINS`).
