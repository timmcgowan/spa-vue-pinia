# BFF (Backend-for-Frontend) for SPA Vue Pinia MSAL

This simple BFF demonstrates a small Express server that:

- Decodes incoming bearer tokens (for display / claims) — NOTE: decoding only, not signature validation.
- Uses `@azure/msal-node` client credentials flow to obtain app tokens and call Microsoft Graph.
- Exposes small endpoints:
  - GET /api/claims — returns decoded incoming token claims
  - GET /api/me — uses incoming token to determine user id (oid/upn) and fetches the user object from Graph using app token
  - GET /api/users/:id — fetch arbitrary user from Graph (requires app permission User.Read.All)
  - POST /api/forward — forward a request to an arbitrary API using an app token (body: { method, url, data, headers })

Environment variables

- BFF_CLIENT_ID — App (client) ID for the BFF (Confidential client)
- BFF_CLIENT_SECRET — Client secret for the BFF
- BFF_TENANT_ID — Tenant ID (or `common`)
- BFF_GRAPH_BASE — (optional) Graph endpoint override (e.g. https://graph.microsoft.us)
- BFF_PORT — (optional) port, default 4000

Quick start

1. Copy `.env.example` to `.env` and fill in your values.
2. Install and start:

```bash
cd bff
npm install
npm run dev
```

Notes & next steps

- Token validation: this scaffold decodes incoming JWTs without validating signature. For production, validate tokens (use jwks-rsa or azure public keys).
- On-Behalf-Of (OBO): if you want true delegated calls to Graph preserving the user context (instead of app-only calls), implement the OBO flow using `acquireTokenOnBehalfOf` in `@azure/msal-node`. That requires the frontend to request an access token for the BFF API scope and send it to the BFF.
- Policy (OPA): later we can insert an OPA policy check middleware before forwarding requests to downstream APIs.
