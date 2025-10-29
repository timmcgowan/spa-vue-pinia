# SPA Vue Pinia MSAL (JavaScript, redirect flow)

This project is a minimal Vue 3 + Vite single-page app using Pinia for state, MSAL for authentication (redirect flow), and Microsoft Graph to fetch user details.

Quick start

1. Copy `.env.example` to `.env` and fill your Azure AD app settings:

   - VITE_MSAL_CLIENT_ID — Application (client) ID
   - VITE_MSAL_TENANT_ID — Tenant ID (or `common`)
   - VITE_MSAL_REDIRECT_URI — e.g. `http://localhost:5173/` (must match Azure app)

2. Install and run:

```bash
npm install
npm run dev
```

3. Register an Azure AD app (brief):

- Azure Portal -> App registrations -> New registration
- Set redirect URI to the value in `.env`
- Under API permissions, add `User.Read` (delegated)
- Expose API settings are not required for this sample

Notes

- Login uses redirect flow. If you prefer popups, modify `src/stores/auth.js` to call `loginPopup` and token acquisition accordingly.
- This scaffold intentionally keeps things small. Replace UI and Graph scopes as needed.
