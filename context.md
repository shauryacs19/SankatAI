# Sankat.AI — Project Context

> **Purpose:** single source of truth so Claude can get up to speed without
> re-reading the whole codebase. **Claude updates this file after every completed
> task** (append to the Changelog + adjust the relevant sections).
> Last updated: 2026-08-16.

---

## 1. What this is

**Sankat.AI** — an AI-powered medical **symptom-triage** app for India. Sign in
(AWS Cognito), fill a medical profile, chat with an AI triage assistant, store
documents, reach emergency help fast. There is a **website** and a **mobile app**;
both share **one FastAPI backend** and the **same AWS resources** (Cognito pool,
DynamoDB tables, S3 buckets).

## 2. Folder structure (connected root = `D:\Projects\SankatAI`)

```
SankatAI/
├── context.md                ← THIS FILE
├── backend/                  ← THE backend for the MOBILE APP (FastAPI). Canonical.
│   ├── main.py, .env, .env.aws.example, requirements.txt, docker-compose.yml
│   └── app/{api/routes, services, repositories, schemas, integrations/aws, core}
├── apps/mobile/
│   └── frontend/             ← Expo React Native app (the mobile client)
├── apps/web/                  ← Web app (React+Vite frontend + its FastAPI backend)
├── infrastructure/terraform/ ← IaC: Cognito, DynamoDB tables, S3 buckets (+CORS), CDN, IAM
├── models/                   ← ML vision model (separate service)
                              (docs/ was deleted 2026-08-13 — to be rewritten once
                               the project is complete. context.md + CLAUDE.md are
                               the only .md files in the repo.)
```

NOTE: an old **`SankatAI-Mobile-Application/`** folder is stale/duplicate and
should be deleted — do not edit it. Work only in `backend/` and `apps/mobile/`.
NOTE: This is now a monorepo. Keep VCS at the repository root. `.env`/`.env.*` are gitignore-listed and must never be committed.

Mobile screens (canonical): `src/screens/{LoginScreen,ProfileSetupScreen,
DashboardTabs}.js` + `src/screens/tabs/{Chat,Profile,Documents,Emergency,
Settings}Screen.js`. (LandingScreen was removed — unrouted dead code.)

## 3. Tech stack

- **Mobile**: Expo **SDK 54**, React 19.1, React Native 0.81.5, React Navigation v7
  (native-stack), `lucide-react-native`, `expo-sensors/location/document-picker/
  image-picker/file-system/navigation-bar`, `amazon-cognito-identity-js`.
- **Backend**: FastAPI, boto3 (DynamoDB + S3), PyJWT (Cognito verify), OpenAI (triage).
- **Infra**: Terraform (AWS provider), region `ap-south-1`, `project_name = sankatai`.

## 4. AWS resources (real, region ap-south-1)

Names (Terraform `project_name=sankatai`; also in `backend/.env.aws.example`):
- DynamoDB `sankatai-user-profile-table` — hash `user_id`; item has `profile` (map),
  `security_pins` (list of PBKDF2 hashes), `email`. Profile writes use `update_item`.
- DynamoDB `sankatai-chat-history` — hash `user_id`, **range `chat_id`**
  (rows: `CONSULT#…` and `MSG#…`). ⚠️ Repo MUST use `chat_id`, not `message_timestamp`.
- DynamoDB `sankatai-attachments` — hash `user_id`, range `attachment_id`.
- S3 `sankatai-chat-uploads` (chat attachments, 30-day lifecycle) and
  `sankatai-file-storage` (Documents vault, retained). Both have
  `aws_s3_bucket_cors_configuration` (methods PUT/GET/HEAD, origins from
  `var.cors_allowed_origins`, default `["*"]`) — defined in
  `infrastructure/terraform/modules/storage/{chat_uploads,file_storage}.tf`.
- Cognito pool `ap-south-1_gxKpxpsyl`, client `tm62pjk48amoj3c3l6i9m135e`.
  (⚠️ `ap-south-1_4pBYOQiu7` / `7829g8n7319m34te0bkmu9h3sq` and `ap-south-1_nUPGx5F7B` /
  `1ltbkvsnt6bk0kst5dkpeub6j9` are STALE — do not use.)
  **The pool ID is duplicated in 7 places** — `apps/mobile/src/config.js`,
  `docker-compose.yml` (×2: backend env + frontend build args), `docker-compose.dev.yml`
  (×2: backend + frontend), `apps/web/scripts/deploy-frontend.sh`,
  `apps/web/scripts/ec2-setup.sh`, and `backend/.env` (unused at runtime).
  Change all of them together or sign-in breaks with "Invalid authentication token".
- DynamoDB `sankatai-web-sessions` — hash `session_id`, TTL attr `ttl`; holds the
  Fernet-encrypted web `id_token`/`refresh_token`.

## 5. Backend — API + config

Routers in `backend/main.py`: health, triage, profile, consultations, security,
uploads. CORS middleware uses explicit `CORS_ALLOWED_ORIGINS` and credentials for the web session cookie. Auth: `user_id` from verified
Cognito token.

Endpoints: `GET /api/health`; `GET/PUT /api/profile`;
`GET/POST /api/consultations`, `PATCH …/{id}` (rename), `DELETE`,
`GET/POST …/{id}/messages`, `POST …/{id}/messages/{msgId}/feedback`;
`GET/POST/DELETE /api/security/pins`;
`/api/uploads` (`presign`, `{id}/complete`, list `?scope=vault|chat`,
`{id}/download`, PATCH, DELETE).

**Config comes from Docker, not `.env`** — see §9a. `backend/.env` is no longer read at
runtime by either compose file and can be deleted once its AWS keys are rotated.
Non-secret settings are inline in the compose files; `AUTH_SESSION_SECRET` and
`OPENAI_API_KEY` arrive as Docker secrets via the `<VAR>_FILE` convention.

## 6. Mobile app (`apps/mobile`)

- `App.js`: animated splash, immersive Android nav bar (guarded `expo-navigation-bar`),
  `ProfileProvider`, `NavigationContainer`, global `<ShakeSOS/>`.
- Nav: `RootNavigator` (native-stack) Login → ProfileSetup → App. No landing page.
- `App` = **ChatGPT-style drawer** (`screens/DashboardTabs.js`, custom Animated +
  PanResponder). Chat is full-screen; Profile/Documents/Emergency/Settings behind a
  left drawer (☰ or edge-swipe). `components/ScreenHeader.js` provides the ☰.
- `src/config.js`: API base URL auto-derives the PC LAN IP from the Metro dev server
  (`getDevServer`); `EXPO_PUBLIC_API_URL` overrides (use for the deployed backend).
- **Auth architecture (production-style, Cognito):** `context/AuthContext.js` is the single
  source of truth — status `initializing | authenticated | unauthenticated`. `App.js` shows the
  splash while INITIALIZING (restores + refreshes tokens) so the Login screen never flashes for
  a signed-in user; `RootNavigator` renders the Login stack vs the app stack purely from that
  status (no manual `navigation.reset` for auth). Screens call `useAuth().signIn/signOut`.
  - `src/lib/cognito.js`: tokens persisted in the **device secure keystore** via
    `expo-secure-store` (iOS Keychain / Android Keystore) as per-token keys — **never**
    AsyncStorage/localStorage/files. `refreshSession()` exchanges the stored Cognito refresh
    token for new id/access tokens; `getValidIdToken()` auto-refreshes on near-expiry;
    `onSignOut()` lets the API layer notify AuthContext on session loss.
  - `src/lib/api.js`: centralizes auth — awaits a valid ID token, and on a 401 refreshes once
    and retries before signing out. No screen attaches tokens directly.
- `src/lib/api.js`: `fetchWithTimeout` (12s). `src/lib/uploads.js`: S3 presign→PUT
  (`expo-file-system/legacy` uploadAsync)→complete.
- **Chat attachments** (`ChatScreen`): paperclip in the input bar → pick photo/document →
  `uploadFile(asset,{scope:'chat',chatId})` (creates the consultation first if none) →
  ids held as pending chips → `sendMessage(cid,text,attachmentIds)`. Send is allowed with
  attachments only (no text). Reuses `lib/uploads.js` — **no backend change**. `send()`
  reconciles the optimistic user bubble with `res.userMessage` and guards a null
  `assistantMessage` (attachment-only replies). History reload shows an attachment count
  (backend `MessageView.attachmentIds` returns ids only, not filenames).
- **Profile (sectioned):** the in-app Profile page is a **hub** (`screens/tabs/ProfileScreen.js`)
  with loading/empty/error+retry states and cards linking to focused editors:
  `screens/profile/{PersonalInfoScreen,MedicalInfoScreen,EmergencyContactsScreen}.js`
  (registered in the app stack; reached via the drawer's `pageNav` delegation). Shared controls
  live in `components/FormControls.js` (`Field/Chips/YesNo/SectionTitle/SectionEditor`), reused
  by the editors **and** `ProfileSetupScreen` (dedup). Validators in `lib/validators.js`.
  ⚠️ Profile **PUT replaces the whole record** — every section save merges edits over the
  current profile (`saveProfile({ ...profile, ...edits })`). Medical editor also holds risk
  factors + insurance. No new backend fields were invented (schema unchanged).
- Features: chat (search/rename/feedback/analysis/animations, content-hugging bubbles, attachments);
  profile (personal/medical/contacts, **insurance**, **risk factors**, **security PINs**
  via `components/SecurityPins.js`); documents (real S3 uploads, password-protect by PIN,
  AI-consent, view/delete — **protected files need the PIN to view AND to delete**, verified
  server-side; previews open in-app via `lib/preview.js` + `components/FilePreview.js`); emergency (numbers, share location, hospitals);
  **Shake-for-SOS** (`components/ShakeSOS.js`) — shake → emergency-contacts popup →
  tap shares live location on WhatsApp + calls.

## 7. How to run

**Backend (real AWS):** `cd backend`, ensure `.env` has valid AWS keys (or use an IAM
role), `pip install -r requirements.txt`, `python main.py` (serves `0.0.0.0:5174`).
**Apply S3 CORS / infra:** `cd infrastructure/terraform && terraform apply` (CORS is
already coded). Quick manual alternative: `aws s3api put-bucket-cors --bucket <name>
--cors-configuration file://cors.json`.
**Mobile:** `cd apps/mobile && npm install && npx expo start -c`; phone + PC on
same Wi-Fi (or set `EXPO_PUBLIC_API_URL` to the deployed backend); allow port 5174.
New native dep **`expo-secure-store`** (secure token storage) — run `npx expo install
expo-secure-store` to pin the SDK-54 version; it's bundled in Expo Go so no rebuild needed for
dev. `@react-native-async-storage/async-storage` remains installed only because `amazon-cognito-identity-js` imports its React Native storage helper; application JWT persistence never uses AsyncStorage.

## 8. Known limitations
- ⚠️ **Not applied yet.** All of §9 is Terraform-verified structurally but has not
  been `terraform apply`-ed. The plan REPLACES the EC2 instance (subnet change) and
  DESTROYS `sankatai-web-sessions` + the `auth_session_secret` Secrets Manager entry.
  Review the plan before applying.
- `terraform fmt/validate/plan` could not be run here — no network access to the
  HashiCorp releases CDN from this sandbox. Verified instead with a structural
  cross-check (every module input declared, every required input passed, every
  `module.x.y` reference resolves to a real output) plus a brace/paren balance pass.
  **Run the three commands before applying.**
- The NAT instance is single-AZ and self-patched. If it dies, the backend loses all
  outbound AWS/ECR access. Acceptable for this project; a NAT Gateway per AZ is the
  production answer.
- **No RAG.** Bedrock KB + AOSS were deleted 2026-08-16 (cost). The triage service is
  pure LLM inference against Ollama Cloud. If retrieval is needed later, use a
  self-hosted store (e.g. pgvector/FAISS on the existing EC2) — do not reintroduce AOSS.
- Sign-up/confirm/change-password still use `USER_PASSWORD_AUTH` via the SDK rather
  than the Hosted UI. Works, but means the pool client keeps that flow enabled.
- Claude's sandbox can't run a full Metro bundle / on-device test / AWS CLI — code is
  validated by JSX + `py_compile` only. Watch for red-screen import errors on first load.
- New native modules need `npm install` + `expo start -c`.
- WhatsApp deep links can't auto-send and can't foreground with a call → Shake-SOS opens
  WhatsApp (message+location ready) then calls; contact numbers need country code.

## 9. Current monorepo architecture

- `apps/mobile/` — canonical Expo mobile app.
- `apps/web/` — canonical React/Vite web app.
- `packages/shared/` — workspace package `@sankatai/shared` for framework-neutral logic.
- `backend/` — the ONLY FastAPI backend shared by both clients.
- `infrastructure/terraform/` — AWS infrastructure.
- Root `package.json` is the npm workspace root.

### Production network + auth architecture (2026-08-14)

```
Browser / Mobile
   │ Hosted UI, OAuth code + PKCE
   ▼
Cognito ──access token──┐
                        ▼
              API Gateway HTTP API v2
              (Cognito JWT authorizer)
                        │ overwrite:header.x-user-id = claims.sub
                        ▼
                    VPC Link
                        ▼
              Internal ALB (private subnets)
                        ▼
         Private EC2 · Docker · FastAPI     ← no public IP, no SSH
                        │
     ┌──────────────────┼──────────────┬──────────────┐
     ▼                  ▼              ▼              ▼
  Ollama Cloud         S3          DynamoDB    Secrets Manager
 (HTTPS, via NAT)                                (via EC2 role)
```

Egress: private subnets route through a **t4g.nano NAT instance** (~$4/mo, vs
~$32/mo NAT Gateway). S3 and DynamoDB use free **gateway VPC endpoints** and
bypass the NAT entirely. No interface endpoints — six of them would cost ~$44/mo,
more than the NAT they'd replace.

Admin: **SSM Session Manager only** (`aws ssm start-session --target <id>`).
No SSH key, no port 22, no bastion.

**The backend performs no JWT validation.** It has no PyJWT dependency, no JWKS
client, and no Cognito config. `integrations/aws/cognito_auth.py` is now ~60
lines that read two headers.

Both clients:
- Send the Cognito **access token** as `Authorization: Bearer`.
- API Gateway validates signature (pool JWKS), `iss`, `exp`, and `client_id`
  (access tokens carry `client_id`, not `aud`; the authorizer falls back to it).
- `overwrite:header.x-user-id` REPLACES any client-supplied value.
- **No `x-user-email`** — Cognito access tokens have no `email` claim, so
  `CurrentUser.email` is always `None`. Clients read email from their own ID token.

Web (`services/auth/`):
- `pkce.js` — S256 verifier/challenge/state.
- `hostedUi.js` — authorize → callback exchange → refresh → federated logout.
- `tokenStore.js` — tokens in memory only.
- **Reload does not log out.** Cognito's Hosted UI session cookie lets
  `restoreSession()` bounce through `/oauth2/authorize` and return a fresh code
  with no credential prompt. A one-shot `restoreTried` flag prevents redirect
  loops when that cookie has genuinely expired.
- `sessionStorage` holds only PKCE verifier / CSRF state / returnTo / that flag.
  **Never tokens.**
- Sign-in is a redirect; `Login.jsx` has no password field. Sign-up, confirm and
  change-password still use the SDK directly (no redirect needed).

Mobile: unchanged — tokens in `expo-secure-store`, single-flight refresh, one
retry on 401. Point `EXPO_PUBLIC_API_URL` at the gateway.

### Refactor invariants

- Never reintroduce localStorage/AsyncStorage/sessionStorage for JWT persistence.
- Never validate JWTs in the backend — that belongs to the API Gateway authorizer.
- The backend must be unreachable except through API Gateway. The identity
  headers are trusted, so a directly-reachable instance = trivial impersonation.
- Do not create another backend under a client directory.
- Keep mobile and web UI platform-specific.
- Put business rules/data contracts in `@sankatai/shared`.
- Protect expensive/medical AI endpoints with Cognito authentication.
- Do not expose model chain-of-thought.
- Production CORS must be an explicit allow-list.
- Production web auth requires `AUTH_SESSION_SECRET` and `AUTH_SESSION_SECURE=true`.
- Backend AWS access should use an IAM role rather than static credentials.

## 9a. Configuration model (Docker-based, since 2026-08-13)

**`backend/.env` is no longer on the runtime path.** Config comes from Compose.

- **Non-secret config** (Cognito IDs, table/bucket names, CORS, cookie flags) is inline
  in `docker-compose.yml` / `docker-compose.dev.yml` as `${VAR:-default}`. Those files
  are the single source of truth; override via shell env, never by editing defaults.
- **Secrets are Docker secrets** in `./secrets/` (gitignored except README):
  `auth_session_secret`, `openai_api_key` (**holds the ollama.com API key** — see the AI
  provider entry in §10; the name is kept so the wiring doesn't churn).
  Compose mounts them at `/run/secrets/*` and
  passes `AUTH_SESSION_SECRET_FILE` / `OPENAI_API_KEY_FILE`. `config.py::_secret()`
  reads `<VAR>_FILE` first, falls back to `<VAR>`, and degrades to the default if the
  mount is missing (never crashes at import).
- **No static AWS keys anywhere.** Prod uses the EC2/ECS instance role; dev mounts the
  host `~/.aws` read-only with `AWS_PROFILE`. ⚠️ The old keys from `backend/.env` must
  still be **rotated** — they were committed to a file and read in-session.
- ⚠️ `VITE_*` are **build-time** in prod (`args:` → Dockerfile `ARG`), so a pool change
  needs `--build`. In dev they're plain env on the Vite dev server, so a restart suffices.

## 10. Changelog (most recent first)
- **Bedrock + OpenSearch Serverless removed entirely — Ollama Cloud is the only AI (2026-08-16):**
  Cost. The AOSS collection alone had a 2-OCU floor (~$350/mo) and dominated the bill.
  - **Deleted** `modules/ai/` (whole module: `opensearch.tf`, `knowledge_base.tf`, `data.tf`,
    `outputs.tf`, `variables.tf`, `versions.tf`), `modules/security/iam/bedrock.tf`
    (the `bedrock_kb` service role + its S3/model policies), `modules/storage/knowledge_base.tf`
    (the KB source bucket), and the stale `tf.log`.
  - **Root**: `module "ai"` block gone from `main.tf`; `module.iam` no longer takes
    `knowledge_base_bucket_arn`. All 7 Bedrock/AOSS outputs removed from `outputs.tf`.
    `providers.tf` / `versions.tf` trimmed to the bare `aws` provider (the manual-index
    comment block is obsolete).
  - **IAM**: `bedrock:Retrieve`, `bedrock:RetrieveAndGenerate` and `bedrock:InvokeModel`
    statements dropped from the backend role policy. `data "aws_caller_identity" "current"`
    moved from the deleted `bedrock.tf` into `main.tf` (still used by the logs/ECR ARNs).
    Removed inputs `knowledge_base_bucket_arn` + `embedding_model_id`; removed outputs
    `bedrock_kb_role_arn` / `bedrock_kb_role_name`.
  - **Storage**: `knowledge_base` variable + both KB outputs removed.
  - **Zero backend/web/mobile code change** — the app never called Bedrock. AI already went
    through `AI_BASE_URL` (`https://ollama.com/v1`) + the `openai_api_key` secret (§9a).
    `knowledge_base/WHO-ICRC-Basic-Emergency-Care.pdf` stays in the repo, unused.
  - Verified: no `bedrock|opensearch|aoss|knowledge_base` string left in any `.tf`, backend,
    web, mobile, compose or CI file; every module input declared, every required input passed,
    every `module.x.y` reference resolves; brace/paren balance clean.
  - **Destroy path (state still holds these):**
    `terraform init -upgrade` (drops the `opensearch` provider from the lock file), then
    `terraform plan` — expect DESTROY of the AOSS collection + its 3 policies, the Bedrock KB
    + data source, `aws_s3_bucket.knowledge_base` (⚠️ versioned + non-empty — empty it first:
    `aws s3 rm s3://sankatai-knowledge-base --recursive` plus delete-markers/versions), and
    the `sankatai-bedrock-kb-role`. The hand-made AOSS vector index is not in state and dies
    with the collection.
  - **Cost delta: ~-$350/mo.**
- **Production network architecture: private EC2 behind VPC Link + internal ALB (2026-08-14):**
  - **network/** rewritten: +2 private subnets (2 AZs), +2nd public subnet (ALB needs
    two AZs), **t4g.nano NAT instance** (iptables MASQUERADE, `source_dest_check=false`)
    replacing a NAT Gateway, private route table, free **S3 + DynamoDB gateway endpoints**.
  - **alb/** (new): `internal = true` ALB in the private subnets, target group on 8000,
    HTTP listener, health check `/api/health` (not `/readiness` — that one calls AWS on
    every probe). SG accepts only VPC-internal traffic.
  - **compute/ec2/**: moved to `private_subnet_ids[0]`, `associate_public_ip_address=false`,
    SG ingress `security_groups = [alb_sg]` (no CIDR rule at all), **IMDSv2 required**,
    SSM agent + CloudWatch agent in user_data. `ssh_cidr` variable deleted.
  - **api_gateway/**: integration switched from `HTTP_PROXY`-to-public-DNS to
    `connection_type = VPC_LINK` → ALB listener ARN. Authorizer now validates the
    **access token**. `x-user-email` mapping removed (see §9).
  - **security/cognito/**: added `allowed_oauth_flows=["code"]`, scopes, callback/logout
    URLs, `enable_token_revocation`. PKCE is enforced by Cognito for public clients.
  - **secrets/**: `auth_session_secret` → `openai_api_key` (+ `ignore_changes` on the
    value so plaintext never lands in state).
  - **ecr/** (new): repo with scan-on-push + 10-image lifecycle, **GitHub OIDC provider
    + role** scoped to `repo:<owner>/<repo>:*`, permissions limited to ECR push and
    `ssm:SendCommand` against the one instance.
  - **security/iam/**: + Secrets Manager (single ARN), + CloudWatch Logs (write-only,
    `/sankatai/*`), + ECR pull. ECR ARN is *constructed*, not passed — `ecr → ec2 → iam
    → ecr` would be a cycle.
  - **cdn/frontend/**: `/api/*` origin repointed to the API Gateway domain,
    `https-only`, cookie forwarding `all → none`.
  - **Web**: Hosted UI + PKCE (`pkce.js`, `hostedUi.js`), reload-safe restore via the
    Cognito session cookie, `/auth/callback` route, `Login.jsx` password field removed.
  - **CI**: `app-ci.yml` static AWS keys → OIDC (`id-token: write`), deploy via SSM
    Run Command to the private instance.
  - Verified: `compileall` clean; eslint clean on all changed files (3 remaining errors
    are pre-existing patterns in `AuthContext.jsx`); Terraform structural cross-check
    passes; no `0.0.0.0/0` ingress and no port 22 anywhere in `modules/`.
  - **Cost delta: ~+$21/mo** (internal ALB ~$17, NAT instance ~$4). HTTP API VPC Links
    have no hourly charge.
- **JWT validation moved from the backend to API Gateway (2026-08-14):**
  - **New** `modules/api_gateway/` — HTTP API v2, `aws_apigatewayv2_authorizer`
    (type JWT, issuer = pool, audience = app client id), `HTTP_PROXY` integration to
    the backend EC2, `$default` auto-deploy stage with access logs + throttling.
    `GET /api/health` is `authorization_type = NONE`; `ANY /{proxy+}` requires JWT.
    Wired into root `main.tf` as `module.api_gateway`; output `api_endpoint` is the
    new `VITE_API_URL` / `EXPO_PUBLIC_API_URL`.
  - **Backend**: `cognito_auth.py` rewritten — no PyJWT, no JWKS, no Cognito config;
    reads `x-user-id` / `x-user-email`. `CurrentUser` and `get_current_user` keep
    their names and module path, so all 6 route files are untouched.
  - **Deleted**: `routes/auth.py`, `services/web_session_service.py`,
    `dynamo_client.get_web_sessions_table()`, `AUTH_SESSION_*` config,
    `AUTH_CLOCK_SKEW_LEEWAY`, `_warn_on_clock_skew()`, `COGNITO_*` backend config,
    the `auth_session_secret` Docker secret, `modules/database/web_sessions.tf`
    + its outputs/variables/IAM grants, and `PyJWT[crypto]` + `cryptography`.
  - **New config**: `AUTH_ENABLED` (default true; `false` = fixed dev identity for
    running the backend without a gateway). Dev compose sets it false.
  - **Web client rewritten to Bearer**: new `services/auth/tokenStore.js`
    (memory-only), `cognito.js` stores the session + single-flight `refreshSession`,
    `httpClient.js` sends `Authorization` and drops `credentials: 'include'`.
    CORS `allow_credentials` is now false everywhere.
  - Verified: `compileall` clean, no `jwt`/`web_session`/`routes.auth` imports remain,
    eslint clean on all three changed/added web files.
  - ⚠️ **Not yet done** — see §8: EC2 SG still allows `0.0.0.0/0` on 8000, and the
    `sankatai-web-sessions` DynamoDB table still exists in AWS until `terraform apply`.
- **Repo prepared for first GitHub commit (2026-08-14):** rewrote the root `.gitignore`
  as the single monorepo ignore file (only other one: `apps/mobile/android/.gitignore`).
  Now covers secrets (`.env*`, `secrets/*`, `*.pem|key|p12|jks|keystore`), node/Expo/Android/
  iOS build output, Python caches + venvs, Terraform (`.terraform/`, `*.tfstate*`, `*.tfvars`),
  archives (`backend.zip`, `*.zip`), and ML weights (`*.h5|pb|pt|onnx|tflite`).
  Added `secrets/.gitkeep` (dir kept, contents ignored).
  - **Deliberately committed:** `apps/mobile/android/app/debug.keystore` (standard public RN
    debug key), `knowledge_base/WHO-ICRC-Basic-Emergency-Care.pdf` (4 MB RAG source),
    Cognito pool/client ids (public app-client values).
  - **Deliberately excluded:** `models/emergency_vision_model.h5` (11 MB — regenerate with
    `models/train_model.py`; use Git LFS if it must be versioned), `backend.zip`,
    `infrastructure/terraform/.terraform/`, `backend/.env`, `.claude/settings.local.json`.
  - Audit: 257 candidate files, **zero** credential matches (no AKIA/ASIA keys, `sk-` tokens,
    or PEM private keys in any file that would be committed).
  - ⚠️ **Before pushing:** rotate the AWS keys still in `backend/.env` and the values in
    `secrets/` (they were on disk unencrypted); no `.env.example` currently exists — add one
    documenting the required vars. `backend/.env` is no longer read at runtime (see §9a) and
    can be deleted.
- **AOSS vector index is now created MANUALLY — Terraform no longer manages it (2026-08-13):**
  - **Deleted `modules/ai/index.tf`** (`opensearch_index.knowledge_base`, `time_sleep.collection_ready`,
    `time_sleep.index_ready`). The `opensearch` provider block in `providers.tf` and the
    `opensearch` + `time` entries in both `versions.tf` files are gone with it — nothing in the
    configuration touches the OpenSearch data plane any more.
  - `knowledge_base.tf` keeps only the policy/grant `depends_on`. **The index must exist before
    `terraform apply`**, or CreateKnowledgeBase fails with "no such index".
  - The index recipe (name, vector field, full mapping body, and the warning about
    shards/replicas) is documented in the **header of `modules/ai/opensearch.tf`**, and
    `local.index_name` / `local.vector_field` remain the source of truth — Bedrock's field mapping
    reads the same locals, so the hand-made index must match them.
  - New outputs to drive the manual step: `ai_opensearch_collection_endpoint`,
    `ai_opensearch_index_name`, `ai_opensearch_vector_field`.
  - Run **`terraform init -upgrade`** once to drop the removed providers from
    `.terraform.lock.hcl`.
- **Fixed `Error: EOF` on `module.ai.opensearch_index.knowledge_base` (2026-08-13, superseded by
  the entry above):**
  Root cause: the resource set **`number_of_shards = 2` / `number_of_replicas = 0`**. OpenSearch
  *Serverless* manages sharding and replication itself and rejects those settings by **closing the
  connection**, so the provider reports a bare `Error: EOF` with no status code or body — which is
  why it looked like a network/auth problem. `tf.log` confirms it: the last provider line is
  `settingsFromIndexResourceData` listing both keys, then EOF ~350ms later. Both settings are now
  removed (only `index.knn` + `knn.algo_param.ef_search` remain, matching AWS's reference index
  body for a Bedrock KB); `ignore_changes` on them stays because AOSS reports its own values back.
  The provider block in `providers.tf` (`opensearch_version`, `healthcheck = false`,
  `aws_signature_service = "aoss"`) was already correct and is unchanged.
- **Bedrock Knowledge Base apply fixed — 4 Terraform bugs (2026-08-13):**
  - **`Error: EOF` from the opensearch provider** — `healthcheck = false` only disables the
    elastic client's node health check; the provider still probes `GET /` to sniff the engine
    version, and AOSS doesn't serve it. Root `providers.tf` now sets
    `opensearch_version = "2.11.0"` + `version_ping_timeout = 5` to skip the probe.
  - **KB created before the index ("no such index")** — `vector_index_name` is a literal string,
    so there was **no dependency edge** between `opensearch_index.knowledge_base` and
    `aws_bedrockagent_knowledge_base`; Terraform ran them in parallel. Both the index and a new
    `time_sleep.index_ready` (60s, AOSS acknowledges an index before it's consistently visible)
    are now in the KB's `depends_on`.
  - **AOSS "Invalid principal"** — the data-access policy listed
    `data.aws_caller_identity.current.arn`, which under an assumed role is the STS *session* ARN
    (`arn:aws:sts::…:assumed-role/<role>/<session>`); AOSS only accepts real IAM principals.
    Dropped — `aws_iam_session_context.issuer_arn` already resolves to the underlying role ARN
    (and equals the caller ARN for IAM users).
  - Fresh-state applies still need the two-step `-target` on the collection first (the provider
    URL isn't known until the collection exists) — documented in `providers.tf`.
- **Terraform: Bedrock Knowledge Base wiring fixed + AOSS index automated (2026-08-13):**
  - **The AI/KB stack could not `terraform validate`.** Resources were referenced across module
    boundaries as if they shared a namespace: `modules/ai` used `aws_iam_role.bedrock_kb` (lives in
    `security/iam`) and `aws_s3_bucket.knowledge_base` (lives in `storage`); `security/iam` used
    `aws_s3_bucket.knowledge_base` and **output** `aws_bedrockagent_knowledge_base…arn` from the ai
    module while also taking that ARN as an input — a cycle.
  - **Dependency order is now storage → iam → ai.** `storage` exports
    `knowledge_base_bucket_{name,arn}`; `iam` takes `knowledge_base_bucket_arn` and exports
    `bedrock_kb_role_{arn,name}`; `ai` takes the bucket ARN + role. Grants that would re-introduce
    the cycle (KB trust condition, backend `bedrock:Retrieve`) use **constructed** ARNs
    (`…:knowledge-base/*`); the exact collection-scoped `aoss:APIAccessAll` is attached from the ai
    module instead.
  - **`modules/security/iam` was missing its backend role entirely** — `outputs.tf` referenced
    `aws_iam_role.backend` / `aws_iam_instance_profile.backend` with no defining file. Recreated as
    `main.tf` (S3 object+bucket, DynamoDB incl. `/index/*`, `bedrock:Retrieve`, `InvokeModel`).
    ⚠️ Resource *addresses* match state, but the `name` attributes are reconstructed — verify with
    `terraform state show module.iam.aws_iam_role.backend` before applying or it will replace.
  - **Vector index is now created by Terraform.** Bedrock does not create it and the AWS provider
    has no resource for it, so `modules/ai/index.tf` uses `opensearch_index`
    (opensearch-project provider, **pinned `~> 2.2.0`** — 2.3.x regressed AOSS index creation)
    behind a 60s `time_sleep` for data-policy propagation. Root `providers.tf` configures
    `provider "opensearch"` from `module.ai.opensearch_collection_endpoint`; because that is
    unknown on a fresh state, the **first** apply needs
    `terraform apply -target=module.ai.aws_opensearchserverless_collection.knowledge_base` first.
  - **AOSS data-access policy corrected:** the collection rule only had
    `DescribeCollectionItems` (Bedrock cannot ingest with that) and listed no deployer principal,
    so index creation would have been denied. Now grants Create/Update/Describe collection items
    and includes the caller ARN **and** `aws_iam_session_context.issuer_arn` (assumed-role case)
    plus the backend role for runtime retrieval.
  - Also: explicit `FIXED_SIZE` chunking (512/20%) on the data source, `embedding_model_id` /
    `embedding_dimension` variables kept in sync between the two modules, a name-length
    precondition on the collection (AOSS max 32 chars), and new root outputs
    (`knowledge_base_bucket_name`, `bedrock_knowledge_base_id`, `bedrock_data_source_id`).
  - Run `terraform init -upgrade` (two new providers: `opensearch`, `time`).
- **AI switched to Ollama Cloud; chat bottom spacing (2026-08-13):**
  - **AI provider is now endpoint-agnostic.** `config.py` gained `AI_BASE_URL`
    (default `https://ollama.com/v1`), `AI_MODEL` (default `gpt-oss:120b`) and `AI_TIMEOUT`
    (default 30s — cloud models are slower than gpt-4o-mini). `OpenAIProvider` passes
    `base_url`/`model` through instead of hardcoding `gpt-4o-mini`. **No new dependency** —
    Ollama Cloud speaks the OpenAI protocol, so the existing `openai` SDK is the transport.
    Switching back to OpenAI is env-only (`AI_BASE_URL=https://api.openai.com/v1`).
  - The **`openai_api_key` Docker secret now holds the ollama.com API key** — the secret name and
    the `OPENAI_API_KEY_FILE` wiring are unchanged, so nothing else moved. Both compose files set
    `AI_BASE_URL` / `AI_MODEL` / `AI_TIMEOUT`.
  - New `_extract_json()` in the provider: open-weight models honour JSON mode loosely, so replies
    fenced in ```json or wrapped in prose are unwrapped before the triage service parses them.
    Failures still fall through to `emergency_fallback_analyze` (offline banner).
  - **Chat bottom spacing:** `composerFoot` height is now dynamic — `20` while the keyboard is up
    (`Keyboard.addListener` on `keyboardDidShow/Hide`), otherwise `useSafeAreaInsets().bottom + 18`
    so the composer clears the Android gesture/home bar in the immersive shell.
  - **SecureNote repositioned:** it's now an absolutely-positioned centred overlay
    (`secureAnchor`, `bottom: '35%'`) instead of a row in the composer stack.
- **Composer polish, in-app file preview, PIN-gated delete (2026-08-13):**
  - **Mobile chat composer:** send button is now a **circle** (`borderRadius: 22`) with an
    **`ArrowRight`** icon (`Send` paper-plane dropped). A blank `composerFoot` spacer (14px,
    surface-coloured) sits under the input bar so it never touches the keyboard.
  - **"Your data is encrypted and secure" moved:** it no longer lives permanently under the
    composer. New `SecureNote` component renders it **only in a new/empty chat**, **between the
    suggestion cards and the quick-prompt chips row** (i.e. after the greeting block, before
    `chipsScroll`), as a light-grey (`colors.surface2`) pill with a **slim red border**
    (`colors.primary`) and a **slow 1.1s-each-way opacity fade** (`Animated.loop`, native driver).
    A travelling-border variant was tried and reverted — plain border + fade only.
  - **Android keyboard mode changed `pan` -> `resize`** (`app.json`). Under `pan` Android aligns
    the focused input's bottom edge to the keyboard, which silently swallows any padding placed
    below the composer — that's why the earlier spacer had no effect. With `resize` the window
    shrinks, so the bottom-anchored composer plus the 18px `composerFoot` gap stay above the
    keyboard. KAV stays iOS-only. **Requires a native rebuild (`npm run android`).**
  - **Files preview in-app, never in another app.** New `src/lib/preview.js`
    (`isImageFile`, `openInAppBrowser`) + `src/components/FilePreview.js` (full-screen Modal with
    `<Image resizeMode="contain">`, loading/error states). Images open in the modal; every other
    file opens via **`expo-web-browser`** `openBrowserAsync` (Chrome Custom Tabs /
    SFSafariViewController). `Linking.openURL` was removed from both `DocumentsScreen.openFile`
    and `ChatScreen.openAttachment` — pre-signed URLs are no longer handed to external apps.
    **New dependency: `expo-web-browser@~15.0.11`** — run `npm install` before the next build.
  - **Protected files now require the PIN before deletion (was: deletable with only the typed
    confirmation).** Enforced **server-side**: `AttachmentService.delete()` takes a `verify_pin`
    callable and raises `PinError` for protected files, `DELETE /api/uploads/{id}` accepts an
    optional `DeleteAttachmentRequest{pin}` body and returns **403 "Incorrect PIN."**. Both
    clients' `deleteUpload(attachmentId, pin)` send it.
    - Mobile: tapping delete on a protected file opens the existing PIN modal in
      `mode: 'delete'` (Continue) → then the typed-`confirm` modal. A 403 clears the PIN and
      bounces back to the PIN step.
    - Web: the delete modal is now two-step for protected files (PIN → typed confirm), same 403
      handling.
- **Web profile card restored + dead-code sweep (2026-08-13):**
  - The rail's **user/profile card had been dropped** when it was moved below the disclaimer (the
    replace that removed it from the top matched, the one re-adding it at the bottom didn't).
    It's back as the last block in `<nav>`, under the disclaimer.
  - **Removed code with no remaining references:**
    - CSS (`dashboard.styles.js`): all `.dx-history*` panel rules (except `.dx-history-act`, which
      the History tab reuses), `.dx-resizer`, `.dx-history-reopen`, `.dx-new-btn`, `.dx-search*`,
      `.dx-chatbar*`, `.dx-bubble.bot`, `.dx-fb-note`, `.dx-dot`, `.db-tab-spacer` — ~50 rules.
    - Orphaned web components deleted: `medical-documents/components/PasswordProtection.jsx` and
      `profile/components/{Contacts,InsuranceInfo,MedicalInfo,PersonalInfo,RiskProfile}.jsx`
      (superseded by `DocumentUploadForm`'s inline section and `ProfileTab`).
    - `packages/shared/documents.js`: dropped `CATEGORY_STORAGE_KEY` (categories live on the
      profile now), `UPLOAD_TYPES` / `ACCEPT` / `isSupported` / `DOC_EXTS` (the web upload form
      accepts any file type; mobile uses native pickers).
    - Unused `lucide-react` imports in `ChatPage.jsx` (`Bell`, `BadgeCheck`).
  - Verified: every named import from `@sankatai/shared` still resolves, and **all 39 mobile +
    55 web + 36 backend files parse**.
- **Unsend messages, content-aware chat search, Auth folded into Settings (2026-08-13):**
  - **Backend (soft delete + search)** — `sankatai-chat-history` rows are never removed:
    - `consultation_repository.soft_delete_message()` sets `deleted: true` + `deleted_at`;
      `list_messages()` filters `deleted` rows out. Only `role == "user"` rows can be unsent
      (returns `not_own` otherwise), always scoped to the caller's partition.
    - New route **`DELETE /api/consultations/{id}/messages/{messageId}`** → 204 / 404 / 400.
    - `search_consultations(user_id, q)` matches the **title OR any live message body**; wired to
      **`GET /api/consultations?q=`** (no new table or index — one query per partition prefix).
  - **Unsend UI:** web shows a **three-dot menu to the left of your own message** → Unsend
    (`.dx-userline`, `.dx-msgmenu*`, closes on outside click); mobile **long-presses the bubble** →
    confirm popup → Unsend. Both drop the message optimistically and roll back on error.
    Optimistic `tmp-` messages can't be unsent (no server id yet).
  - **Search fixed and widened:** it now runs **server-side** (debounced 250ms) in both clients, so
    it matches text inside conversations, not just titles; empty result reads **"No chats found."**
    Web exposes `visibleConsultations` + `searching` on the outlet context; mobile's `ChatContext`
    keeps `searchResults` + `searching` and falls back to the local title filter if the request
    fails.
  - **Authentication is no longer a tab** — it became a section inside **Settings**
    (`features/profile/components/AuthSection.jsx`, `components/AuthSection.js`), and the
    duplicate Sign out entries in both Settings screens were removed since that section owns it.
  - **User profile card moved to the bottom of the rail**, under the disclaimer, in both clients,
    with margin added so the nav/quick-action/disclaimer blocks don't touch.
- **Nav trimmed + new Authentication tab (both clients, 2026-08-13):**
  - **Health Profile removed from the nav** — the user card already opens it. The route/page still
    exists: web keeps `/dashboard/profile` (header label via new `PAGE_LABELS`), mobile marks the
    page `hidden: true` in `PAGES` so it renders when active but isn't listed.
  - **Sign out removed from the sidebar/drawer** and moved into a new **Authentication** tab
    (`pages/AuthPage.jsx` + route `/dashboard/auth`; `screens/tabs/AuthScreen.js`): account email,
    sign-in method, **Change password**, and sign out.
  - **Change password talks to Cognito directly** — new `changePassword(email, current, next)` in
    both `services/auth/cognito.js` and `lib/cognito.js`. It re-authenticates with the current
    password first (both clients keep the Cognito SDK on memory-only storage, so a live SDK
    session isn't guaranteed) and then calls the SDK's `changePassword`. **No backend change**, and
    the web session cookie / keystore tokens are left untouched. Wrong current password surfaces as
    "Your current password is incorrect."; minimum length 8, confirmation must match.
  - **User card moved above New Chat** in both rails.
  - **Rail sized to fit without scrolling:** compact paddings/icon sizes, `overflow: hidden`, and
    `.db-quick { margin-top: auto }` so leftover space collapses above Quick Actions and the
    disclaimer lands last.
  - **Form text legibility:** global `input/textarea/select` colour, placeholder and
    `-webkit-autofill` overrides in `index.css` (plus a `.db-shell` scoped copy) — inputs were
    inheriting the browser default and vanishing against themed surfaces. Mobile inputs already
    set `color`/`placeholderTextColor`; the new Auth screen follows the same pattern.
- **Dashboard shell redesign from the light/dark mockups — frontend only (2026-08-13):**
  - **Chat history moved out of the chat column into its own History tab.** New
    `apps/web/src/features/dashboard/pages/HistoryPage.jsx` (route `/dashboard/history`, was a
    redirect) and `apps/mobile/src/screens/tabs/HistoryScreen.js`. Both list consultations with
    search, New chat, rename and delete, and open the chat tab on tap. ChatPage lost the whole
    resizable/collapsible `dx-history` panel (plus its width/collapse persistence and resizer) and
    the duplicated `dx-chatbar`; the mobile drawer lost its inline chat list. Mobile rename is a
    **real modal** now (`Alert.prompt` is iOS-only).
  - **Sidebar/drawer (both clients):** logo block (the app's existing HeartPulse mark + Sankat.AI
    wordmark — not the mockup's) with an "AI Health Assistant" subtitle, a **New Chat** button,
    nav = Chat / History / Health Profile / File Storage / Emergency / Settings, a **Quick
    Actions** group (Symptom Checker, Find Nearby Hospitals, Upload Reports, Emergency SOS — all
    wired to existing handlers), a **Disclaimer** card, and a tappable user row → profile.
    **Saved** was left out (nothing bookmarks messages) and **no appearance toggle** was added —
    theming stays in Settings, as asked.
  - **Header:** on the chat route it shows `SankatAI` + verified badge + green "Always here to
    help" status; other routes keep their page title. The SOS button stays on the right.
    **Offline Mode** left the sidebar to keep the nav short — the header's offline badge is now a
    link to `/dashboard/offline`, so the page is still reachable.
  - Web CSS: new `.db-brand-*`, `.db-newchat`, `.db-quick*`, `.db-disclaimer`, `.db-topbrand*`,
    `.dh-*` (history tab); the rail is now scrollable and slightly wider.
- **Mobile chat fixes: swipe polish, sheet dismissal, composer padding, attachments (2026-08-13):**
  - **Swipe-left is now decoration only** — the springy right-to-left slide stays, but the revealed
    timestamp was removed (the time is already inside each message). `revealTime*` styles and
    `revealOpacity` deleted.
  - **Swipe-down on the AI Analysis sheet finally works:** the capture-phase responder was on the
    *sheet*, so it was only consulted for touches that already resolved inside it. It now sits on
    the **outermost view inside the `Modal`** (the scrim), which every touch in the modal passes
    through, so the drag is seen first. Conditions unchanged (list at top, or start in the outer
    20%).
  - **Composer bottom padding:** the secure-note row under the input bar now carries
    `paddingBottom: 14` so the composer never sits flush against the keyboard.
  - **Chat attachments were invisible on mobile** — history messages only carry `attachmentIds`
    and nothing resolved them. Added the same lookup the web uses: `listUploads('chat', chatId)` →
    `attachMap` (id → `{filename, kind, downloadUrl}`), loaded with the conversation and refreshed
    after a send that carried attachments. Photos now render as 150px tappable **thumbnails**,
    documents as tappable cards; both open the presigned URL. **No backend change** — the list
    endpoint already returned `downloadUrl`.
- **Chat UI redesign from the supplied mockup — frontend only, both clients (2026-08-13):**
  No backend/API/data-shape changes; all new fields are optional and client-side.
  - **Shared** (`packages/shared/chat.js`): `SEV_META`/`sevMeta` (card title + corner pill per
    severity), `AI_DISCLAIMER`, `EMERGENCY_CALLOUT`, `CHAT_SUGGESTIONS` (quick-action chips) and
    `MOCK_SEVERITY_REPLIES` (dev-only sample LOW/MODERATE/HIGH/EMERGENCY replies).
  - **Header:** brand **"SankatAI" in RED** (never blue) with "AI Health Assistant" + verified
    badge, and a pill **Emergency** button (emergency-token tinted → solid on hover/press).
    The old "Chat"/SOS controls were replaced by it.
  - **AI replies are severity cards** (supersedes the earlier plain-text styling): icon chip +
    `EMERGENCY • 95/100` heading + corner pill, body, red call-108 callout for EMERGENCY, optional
    `recommendations` bullets and `followUp` line, shield disclaimer, then a divider footer with
    the time, labelled **Helpful / Not helpful** and a **share** action (RN `Share` /
    `navigator.share` with clipboard fallback). Card border/accents follow the severity colour.
  - **User messages** keep the grey bubble; the time now sits inside it with a **double tick**
    once delivered (restored per the mockup) and the animated "Sending…" while in flight.
  - **Composer:** quick-action chips row (Chest pain causes / Breathing exercises / Find nearby
    hospital — the first two prefill the input, the third calls the existing hospital finder), a
    **mic button** (visual only — dictation isn't implemented; mobile shows a "coming soon" alert,
    web keeps the existing `handleVoice`), and a "Your data is encrypted and secure" footer.
  - **Follow-up fixes:** web Helpful/Not-helpful buttons wrapped onto two lines because the card
    footer reused `.dx-fb`, which is a fixed **28×28 icon-only box**; scoped overrides under
    `.dx-aicard-foot` give them auto width, pill padding, `white-space: nowrap` and
    `flex-shrink: 0`. On mobile the quick-action chips row was too tall — a **horizontal
    ScrollView stretches to fill a flex column** unless pinned, so it now carries
    `flexGrow/flexShrink: 0` + `maxHeight: 40` with fixed 32px chips.
  - **Removed on request (same day):** the web chat bar's **chat name + rename pencil + "Created X
    ago"** and the whole **"AI Medical Assistant" badge/tooltip**; the chat bar is now just the
    brand block + Emergency button. The **dev card-preview button** was deleted from both clients
    along with `showMockCards` and `MOCK_SEVERITY_REPLIES` in shared; `createdAgo` import and the
    `.dx-chatbar-{name,edit,created,info,titlerow}` / `.dx-ai-badge*` / `.dx-ai-tip` CSS went with
    them, and the `setMessages` outlet-context addition was reverted. Renaming a chat still works
    from the history list.
  - Files: mobile `screens/tabs/ChatScreen.js`; web `pages/ChatPage.jsx`, `DashboardLayout.jsx`,
    `dashboard.styles.js` (new `.dx-aicard*`, `.dx-brand*`, `.dx-emergency-btn`, `.dx-quickchips`,
    `.dx-secure`, `.dx-tick`).
- **Chat gestures round 2 — why they didn't fire (2026-08-13):**
  - **Time reveal:** the responder was attached to **each message row**, so it only worked when the
    drag started exactly on a bubble — swiping the empty space around messages did nothing. It now
    lives on a single `Animated.View` **wrapping the whole thread** (which is also what translates),
    claims in the **capture phase** (`onMoveShouldSetPanResponderCapture`, threshold `dx < -6`) so
    the ScrollView can't take the gesture first, and sets
    `onPanResponderTerminationRequest: () => false` so it can't be stolen mid-drag.
    Rows are plain `View`s again.
  - **Analysis sheet:** the drag only worked on the header. `sheetEdgePan` now claims a downward
    drag **anywhere on the sheet** when the inner list is at the top (`sheetAtTop` ref, fed by
    `onScroll`, reset on `Modal.onShow`) **or** when the drag starts in the outer 20% on either
    side; both sheet responders capture and refuse termination. This is the standard bottom-sheet
    rule — without the at-top check, scrolling the analysis content would dismiss it.
  - **Gesture gating behind the sheet:** `analysisOpenRef` blocks the thread's swipe-to-see-time
    while the analysis sheet is open. The drawer's edge-swipe is already unreachable then — an RN
    `Modal` renders in its own native window, so views beneath it receive no touches.
- **Chat gestures: direction fix, 20% zones, swipe-down to close analysis (2026-08-13):**
  - **Time reveal is now right-to-left** (was left-to-right, which is why it felt missing):
    `revealPan` claims `dx < -8`, the thread shifts up to −64px and each timestamp is parked at
    `right: -60` (WhatsApp direction).
  - **Drawer open-swipe widened to 20% of screen width and stopped blocking other gestures.**
    The old fixed **26px overlay strip** was replaced: `edgePan` now lives on the page wrapper and
    claims in the **capture phase** only when the drag *starts* within the left 20%
    (`g.x0 <= screenW * 0.2`) **and** moves right. Leftward drags therefore fall through to the
    chat's time-reveal even when they start at the very edge — an overlay strip could not do this,
    since a sibling view that declines the responder does not forward the touch to views beneath.
    The close-drag on the open drawer also got a capture-phase handler.
  - **AI Analysis sheet closes on swipe down:** the sheet is an `Animated.View` on a `sheetY`
    translate. `sheetPan` covers the new grab handle + header; `sheetEdgePan` claims the same drag
    in the capture phase when it starts in the outer 20% on **either** side, so it works over the
    scrollable content without overlay gutters (which would have eaten scrolling there).
    Release past 110px or with `vy > 0.8` animates out and closes; otherwise it springs back.
- **Delivery markers trimmed + emergency red restored + ChatGPT-style user bubble (2026-08-13):**
  - **Removed the "Sent" label and double ticks entirely** (both clients). A user message shows
    only the animated **"Sending…"** while in flight; once delivered, nothing is rendered.
    Mobile dropped the `CheckCheck` import; web dropped `.dx-delivery.sent` + the `CheckCheck`
    import. The `sent`/`received` status itself is still tracked (it drives the indicator).
  - **Two-tier red.** The softened brand red (`#C4504B` / `#D9635E`) stays for general UI, but
    **life-critical actions keep the ORIGINAL vivid red**: `SEVERITY.EMERGENCY` reverted to
    `#DC2626`, and the web `--sev-emergency` tokens back to `#DC2626` (light) / `#F87171` (dark).
    Those controls now read the **emergency** token rather than `primary` — mobile
    `ChatScreen.sos` + `emergBtnDanger`, `EmergencyScreen.callBtn` + `actionDanger`,
    `ShakeSOS.sirenBadge` + `ambulance`; web `.db-sos`, `.dx-call`, `.dx-action.danger`,
    `.dx-ea.danger` (Ambulance / emergency-contact call).
    Rule going forward: **emergency = `sevEmergency`/`--sev-emergency`, everything else =
    `primary`.**
  - **User chat bubble is now grey, not red** (ChatGPT-like): background `colors.surface2` /
    `var(--surface-2)` with normal body text (black in light, near-white in dark) instead of
    white-on-red. Mobile in-bubble attachment chips were re-themed off the white-on-red
    assumption (surface + border + muted icon).
- **Chat input keyboard fix + "Sending…/Sent" delivery state (2026-08-13):**
  - **Input bar sat a full keyboard too high on Android.** Root cause: `app.json`
    `softwareKeyboardLayoutMode: "pan"` already lifts the whole window, and
    `KeyboardAvoidingView behavior="padding"` added the keyboard height *again*. KAV now uses
    `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — Android relies on the pan alone.
    The bar also **dropped its bottom safe-area inset** so it sits over the home/nav bar by design
    (immersive shell); the now-dead `keyboardOpen` state, `Keyboard` listeners and
    `useSafeAreaInsets` were removed from `ChatScreen`.
  - `usePullRefresh` takes an optional **`progressViewOffset`** (default 0) so nested lists show
    the spinner at the top of the scroll area like the full-screen ones.
  - **Delivery state replaces the tick pair, both clients.** The single tick is gone: while a user
    message is in flight it reads **"Sending" + three dots animating up/down**; once the server
    persists it, **"Sent" + double ticks** (primary colour).
    Mobile: local `SendingDots` component (looped `Animated` translateY, staggered 130ms).
    Web: `.dx-delivery` / `.dx-sending-dots` reusing the existing `dx-bounce` keyframes; the old
    `.dx-tick` rules and the now-unused `Check` import were removed.
- **Chat: drawer refresh, swipe-to-reveal timestamps, delivery ticks (mobile) (2026-08-13):**
  - **Drawer chat-list refresh:** the history `ScrollView` in `DashboardTabs.js` now takes the
    shared `usePullRefresh` control → pull down inside the open left drawer to re-fetch chat names
    (`ChatContext.loadList`). No new fetch path.
  - **Swipe-right-and-hold reveals message times:** each message row is an `Animated.View` with a
    `PanResponder` that only claims **horizontal** drags (`dx > 8 && |dx| > |dy|*1.8`), so vertical
    scrolling is unaffected. Dragging right translates the thread up to **64px** and fades in a
    per-message timestamp parked at `left: -60`; release springs back. Built-in
    `PanResponder`/`Animated` — no gesture-handler dependency.
  - **Single/double ticks (web parity):** `toBubble` now carries `createdAt` + `status`.
    An optimistic user bubble is `sent` (single grey `Check`); once the server echoes the message
    back it becomes `received` (double primary `CheckCheck`) — same semantics as the web's
    `dx-tick`. History-loaded user messages are `received`.
  - **Dedup:** `fmtTime` moved into `packages/shared/chat.js` (with `MSG_SENT`/`MSG_RECEIVED`
    constants); the web's `features/chat/utils/format.jsx` now re-exports it from
    `@sankatai/shared` instead of holding its own copy, so both clients format times identically.
    `MessageView.createdAt` already existed — no backend change.
- **Brand red softened, light + dark, both clients (2026-08-13):** the old red was too bright/
  saturated. New values (single source: `packages/shared/theme.js`, mirrored into the web CSS
  tokens):
  - **Light:** primary `#DC2626 → #C4504B`, hover `#B91C1C → #A93F3B`, soft `#FEF2F2 → #FBF1F0`,
    border `#FECACA → #F0CFCD`. White-on-primary stays **AA (4.57:1)**.
  - **Dark:** primary `#EF4444 → #D9635E`, hover `#F87171 → #E0736E`, soft `#3B1416 → #33191A`,
    border `#7F1D1D → #6E3330` (5.26:1 on the dark bg, no glare).
  - `SEVERITY.EMERGENCY` now tracks the brand red (`#C4504B` light / `#D9635E` dark) so pills
    don't clash; low/moderate/high are unchanged.
  - Web: `index.css` (`:root` + `[data-theme=dark]`: primary/accent/danger/glow + sev-emergency)
    and `App.css` (incl. the `--shadow-red-*` rgba). Also swept the **hardcoded literals** that
    bypass the tokens — gradients, `rgba(220,38,38,…)` shadows and `var(--x, #DC2626)` fallbacks —
    across `dashboard.styles.js`, `admin.styles.js`, `Landing.jsx`, `Header.jsx`,
    `ProfileSetup.jsx`, `DashboardSkeleton.jsx`, `format.js`, `DocumentUploadPage.jsx`.
  - Mobile needed no literal sweep: every screen already reads `colors.primary` from the shared
    palette via `useTheme`.
- **Chat bubbles restyled — 80% width, plain AI replies (2026-08-13):** ChatGPT/Claude-style
  reading experience in **both** clients. The user's message keeps its tinted bubble; the
  assistant's reply is plain text on the page background — no card, border, shadow or radius.
  - **Mobile `ChatScreen.js`:** `msgCol` max width `88% → 80%`; the shared `bubble` base style was
    dropped in favour of two styles — `bubbleUser` (primary fill, rounded) and `bubbleBot`
    (transparent, no padding/border). The loading indicator uses the same plain container.
  - **Web `dashboard.styles.js`:** `.dx-msg` max-width `82% → 80%`; `.dx-bubble.bot` is now
    transparent with no border/shadow/radius, `.dx-msg.bot .dx-msg-body` spans the full width, and
    `.dx-typing` lost its card too. Severity pills, avatars, timestamps and feedback controls are
    unchanged. (The ≤mobile media query still widens `.dx-msg` to 92%.)
- **PIN deletion now requires the PIN + dark-mode navigation flash fixed (2026-08-13):**
  - **Security:** `DELETE /api/security/pins/{id}` previously deleted on session auth alone, so a
    stolen session could strip protection off the vault. It now takes a body
    (**`DeletePinRequest{pin}`**) and calls the **existing** `security_pin_service.verify_pin`
    → 404 unknown id, **403 "Incorrect PIN."**, then the existing in-use check. No new service or
    storage. ⚠️ Breaking API change: `deletePin(id)` → **`deletePin(id, pin)`** in both clients
    (`apps/web/src/services/securityApi.js`, `apps/mobile/src/lib/api.js`); backend must be
    restarted.
  - **UI:** both `SecurityPins` components now open a PIN-entry modal instead of deleting
    immediately (web replaced its `window.confirm`; mobile replaced its `Alert.alert`). Mobile
    re-added the modal styles that moved out with `CreatePinModal`.
  - **Dark-mode white flash when navigating Profile → editors → back:** root cause was the
    **native-stack scene container, which is WHITE by default** — during a push/pop the native
    view showed through before the themed screen painted. `RootNavigator` now sets
    `screenOptions.contentStyle = { backgroundColor: colors.bg }` (+ `navigationBarColor`) from
    `useTheme`, and `App.js` wraps each `NavigationContainer` in a themed `View` backdrop.
    The `NavigationContainer` `theme` alone was not enough — it colours the container, not the
    per-scene native background.
- **Web upload simplified to one any-type drop field; mobile Uncategorized hidden when empty
  (2026-08-13):**
  - **Web `DocumentUploadForm.jsx`:** removed the document/image type picker entirely — on the web
    both options opened the same file explorer, so the step was pure duplication.
    **`components/FileTypeSelector.jsx` deleted** (no other usages). The form is now
    name → single drop field → protection. The drop field is a real **drag-and-drop target**
    (`onDragOver/onDragLeave/onDrop`, `.du-drop.dragover` style) and accepts **any file type** —
    the `<input type="file">` has no `accept` and the type-validation branch is gone.
    `kind` (photo/document) is derived from the file itself via shared **`kindForFile`**, and the
    image preview via **`isImageFile`**, so behaviour matches what the backend already expected.
    Dropping/picking a file also prefills the File Name field when it's still blank.
    ⚠️ `ACCEPT` / `isSupported` in `packages/shared/documents.js` are now unused by web (mobile
    still uses the pickers) — left in place, nothing imports them from web.
  - The **mobile** photo/document action sheet stays — there the two options open genuinely
    different pickers (photo library vs files).
  - **Mobile `DocumentsScreen.js`:** the "Uncategorized" section renders only when it holds files
    **or a drag is in progress** (it must exist as a drop target so a file can be dragged back out
    of a category). Because that section mounts on the same render as the drag, drop-target
    measurement moved out of `beginDrag` into a `useEffect` keyed on `dragItem` — effects run
    after commit, so the newly-mounted section is measurable.
- **Documents: categories synced across clients + mobile move/delete parity (2026-08-13):**
  - **Root cause of the web/mobile category mismatch:** categories that hold files sync fine (the
    name lives on the attachment record), but **empty** custom categories were device-local —
    web `localStorage`, mobile `expo-secure-store`. They could never match.
  - **Fix — reuse the existing profile record, no new resource:** added
    **`fileCategories: list[str]`** to `backend/app/schemas/profile.py`. Same
    `sankatai-user-profile-table`, same `GET/PUT /api/profile`; no new table, router or AWS
    resource. Both clients now read `profile.fileCategories` and drop their local storage.
    ⚠️ Profile PUT **replaces the whole record** — both clients merge over the current profile
    and **refuse to write while the profile is still loading** (would blank the user's data).
    `CATEGORY_STORAGE_KEY` is kept in shared but marked legacy/do-not-write.
  - **New shared helpers** in `packages/shared/documents.js` (used by both clients):
    `readProfileCategories`, `addProfileCategory`, `renameProfileCategory`,
    `removeProfileCategory`, `normalizeCategory`, `MAX_CATEGORY_LEN`,
    plus `DELETE_CONFIRM_TEXT` / `isDeleteConfirmed` — the web's inline
    `'confirm'` string checks now call the shared helper too.
  - **Mobile hold-and-drag between categories** (real drag & drop, superseding the first
    long-press-sheet attempt): built on RN's built-in **`PanResponder` + `Animated`** — no
    `react-native-gesture-handler`/`reanimated` dependency added. How it works:
    press-and-hold **300ms** arms the drag (`dragRef` is the synchronous mirror of `dragItem`
    that the responder callbacks read); `onPanResponderTerminationRequest` returns `true` until
    the hold arms, so normal ScrollView scrolling still works, and `false` afterwards so the
    scroll view can't steal the drag. Scrolling is also locked via `scrollEnabled` during a drag,
    which is what lets the drop rects be measured **once** on drag start
    (`measureInWindow` per category section, stored in `sectionRects`).
    A floating `dragGhost` (`Animated.ValueXY`) follows the finger; the hovered section gets a
    dashed primary border; drop calls the same optimistic `updateUpload({ category })` +
    rollback as the web. A short tap still toggles the grid card's action overlay (handled in
    `onPanResponderRelease`, since the PanResponder owns the touch — the cards are plain `View`s
    with `panHandlers`, not Touchables). Empty categories are removable from their heading (×),
    and **Uncategorized always renders** so it can be used as a drop target.
  - **Mobile grid sizing:** cards are `width: '48.5%'` with `columnGap/rowGap` and **no
    `flexGrow`** — exactly two per row, and a lone card on the last row keeps one slot instead
    of stretching across the screen.
  - **Mobile delete now requires typing "confirm"** in a modal instead of a one-tap
    `Alert.alert`, matching the web.
  - Validated: `node --check` on shared, `ast.parse` on the profile schema, mobile transforms with
    `babel-preset-expo`, web parses with `@babel/preset-react`. ⚠️ Backend must be restarted for
    the schema change; existing profiles simply default to an empty list.
- **Documents grid-view styling: centred cards + reveal-on-interaction actions (2026-08-13):**
  List view untouched; all changes are scoped to grid.
  - **Web** (`dashboard.styles.js`, `.db-file-list.grid` only): card is centred both axes
    (`min-height: 172px`, 56px thumbnail, name clamped to 2 lines). Actions are an
    `position:absolute; inset:0` centred overlay, `opacity:0` until `:hover`/`:focus-within`;
    the card's icon/name/meta get `filter: blur(4px); opacity:.55` on hover. ⚠️ The overlay and
    the buttons keep `pointer-events:none` until hover so the overlay never swallows the card's
    view-file click.
  - **Mobile** (`DocumentsScreen.js`): grid card is `minHeight:160`, content centred; new
    `activeCardId` state — tapping a card toggles its action overlay (tap again to dismiss;
    switching view resets it). RN has no CSS blur and **`expo-blur` was deliberately not added**
    — the overlay is a `cardScrim` (surface colour at `opacity: 0.9`) with the card body dimmed to
    `opacity: 0.35`, which reads the same at card size with zero new deps.
    `actionButtons(it, overlay)` is shared by both views so list/grid can't drift.
  - Validated: mobile transforms with `babel-preset-expo`; web style module parses.
- **Mobile pull-to-refresh on data screens (2026-08-13):** matches the web Documents tab's refresh
  button. New shared hook **`src/components/usePullRefresh.js`** returns a themed
  `<RefreshControl/>` (primary tint, own `refreshing` state, swallows errors so each screen keeps
  its own error UI) to pass as a ScrollView `refreshControl`.
  Wired into the screens that read server data: **Documents** (`load` + `listPins` in parallel),
  **Profile hub** (`reload` → `ProfileContext.refresh`), **Emergency** (`refresh` — contacts come
  from the profile). **Chat is intentionally excluded**; Settings is local state only, so it was
  skipped too. Gesture is the standard **pull down from the top**, not swipe-up.
  Note: pull-refresh is user-driven, so it uses the default `signOutOn401: true` path.
  The hook takes an `enabled` flag (default true) — Documents passes `!dragItem` so a
  hold-and-drag can never also trigger a reload.
  Validated: all four files transform with `babel-preset-expo`.
- **Documents upload: file name field + PIN setup inline (2026-08-13):**
  - **Mobile** `screens/tabs/DocumentsScreen.js`: upload sheet now has a **File name** field
    (prefilled with the picked file's name, sent **verbatim** like the web form — no extension
    enforcement; Upload is disabled while blank). `kind` is derived from the ORIGINAL asset via
    `kindForAsset` so a rename can't change photo/document classification.
  - The **password-protect Switch is no longer disabled** when the account has no PIN (it silently
    did nothing before). Turning it on with zero PINs shows "Your account doesn't have a PIN
    created." + a **Set up a PIN** button that opens the create-PIN popup inline; the new PIN is
    appended to `pins` and auto-selected, so the upload continues without leaving the sheet.
  - **Create-PIN modal extracted for reuse** (no duplicated UI): new
    `apps/mobile/src/components/CreatePinModal.js` and
    `apps/web/src/features/profile/components/CreatePinModal.jsx`. Both `SecurityPins`
    components now render it; Profile behaviour is unchanged.
  - **Web** `DocumentUploadForm.jsx`: the static "Create one in Profile → Security PINs" note is
    replaced by "Your account doesn't have a PIN created." + a **Set up a PIN** button using the
    same modal. ⚠️ The modal is rendered **outside** the upload `<form>` (the component returns a
    fragment) — nested `<form>` elements are invalid HTML and the inner submit would bubble.
    New `.du-pw-setup` rule in `pages/DocumentUploadPage.jsx`.
  - Validated: mobile files transform with `babel-preset-expo`; web files parse with
    `@babel/preset-react`. Not run in a browser/device here.
- **Documents: grid/list view toggle (web + mobile) (2026-08-13):** Google-Docs-style single
  button in the Documents tab cycles **list ↔ grid**. Default **list**; preference persists per
  device. Category grouping is preserved in both views; both views show the same fields
  (name, type, date, size, actions) — only the layout differs.
  - `packages/shared/documents.js`: added `VIEW_STORAGE_KEY` (`sankatai_docs_view`), `DOC_VIEWS`,
    `DEFAULT_DOC_VIEW`, `normalizeDocView`, `nextDocView` (exported via `@sankatai/shared`).
  - Web `features/medical-documents/components/DocumentsTab.jsx`: `view` state + `LayoutGrid`/`List`
    toggle button in the header actions; persists to **localStorage** (UI pref only — no tokens, auth
    invariant untouched); `db-file-list` gets a `grid` modifier class.
  - Web `features/dashboard/dashboard.styles.js`: new `.db-file-list.grid` rules (CSS grid,
    `auto-fill minmax(190px,1fr)`, 2 cols under 520px). Existing list rules unchanged; drag-drop,
    PIN gating, edit/delete modals untouched.
  - Mobile `screens/tabs/DocumentsScreen.js`: same toggle beside the Category button; persists via
    **expo-secure-store** (same pattern as categories); `fileRow` → `fileCard` renders a full-width
    row or a `48%`-width card in a `flexWrap` grid. Mobile meta now also shows type + date (web parity).
  - Validated: `node --check` on shared; mobile file transforms with `babel-preset-expo`; web JSX
    parses with `@babel/preset-react`. Not run in a browser/device here.
- **Cognito login RESOLVED + postmortem (2026-08-13):** login confirmed working.
  Postmortem (since deleted with the rest of docs/) recorded three faults: (1) `cognito_auth.py`
  overwritten with config code → `ImportError` → backend never started; (2) pool ID migrated
  in `backend/.env` only while the browser still signed in against the old pool → `iss`/`aud`
  mismatch; (3) `verify_token` swallowed all exception detail, making both undiagnosable.
  The unblocking step was `docker compose ... up --build` — Vite bakes `VITE_*` in at build
  time, so a restart kept shipping the stale pool ID.
- **Fix: `ImmatureSignatureError` — "token is not yet valid (iat)" (2026-08-13):**
  Third and final layer of the login failure. With `iss`/`aud` finally matching, the new
  diagnostic log pinned it exactly: the **container clock was behind AWS**, so
  freshly-minted Cognito tokens looked future-dated and PyJWT rejected them. Classic
  Docker Desktop / WSL2 drift after the host sleeps.
  - `config.AUTH_CLOCK_SKEW_LEEWAY` (default **60s**, env-overridable) is now passed as
    `leeway=` to `jwt.decode`. Verified: a token dated 30s ahead is rejected at
    `leeway=0` and accepted at `leeway=60`. Keep it small — leeway also extends how long
    an *expired* token stays acceptable.
  - `main.py::_warn_on_clock_skew()` runs at startup, compares the host clock to AWS's
    `Date` header, and logs `CLOCK SKEW: ... Cognito logins WILL fail` when drift exceeds
    the leeway. Turns a confusing 401 into an obvious startup line.
  - Leeway is **tolerance, not a fix**: drift beyond 60s still fails. Resync with
    `wsl --shutdown` + restart Docker Desktop.
  Debugging lesson: the three failures — dead socket, pool mismatch, clock skew — all
  surfaced as the same opaque message. The logging added in the previous entry is what
  made the last one solvable in one attempt; keep it.
- **Docker-based configuration + auth diagnostics (2026-08-13):**
  Removed `env_file: ./backend/.env` from both compose files; config is now inline in
  Compose and secrets are Docker secrets (see §9a). Added `config.py::_secret()` for the
  `<VAR>_FILE` convention, created `./secrets/` (gitignored, with README), dropped all
  static AWS creds in favour of the instance role (prod) / mounted `~/.aws` (dev).
  Fixed `backend/Dockerfile`: it ran uvicorn on **8000** while prod compose mapped and
  healthchecked **5174**, so nothing was listening — now 5174 throughout.
  Added the missing **`frontend` service to prod `docker-compose.yml`** (it only had
  `backend`), wired with `VITE_*` build args.
  **Diagnostics:** `verify_token` previously swallowed the cause of every failure, which
  is why "Invalid authentication token." was undiagnosable. It now logs the exception
  type, the token's *unverified* `iss`/`aud`/`token_use`, and the values the backend
  expects — while still returning the same generic message to the client.
  Verified: both compose files parse, no `env_file`, no `AWS_ACCESS_KEY*`; secret reads
  from file (len 64, not the default); missing mount falls back safely; `main` imports.

- **Fix: "Invalid authentication token" after the connection fix (2026-08-13):**
  second-order fault from the fix below. The pool ID was corrected in `backend/.env`
  only, while the browser still signed in against `ap-south-1_4pBYOQiu7` (hardcoded as
  the Compose default). The ID token's `iss`/`aud` therefore never matched what
  `_decode_verified` required → 401 "Invalid authentication token."
  Migrated **all** components to `ap-south-1_gxKpxpsyl` / `tm62pjk48amoj3c3l6i9m135e`:
  `apps/mobile/src/config.js`, `docker-compose.yml`, `docker-compose.dev.yml` (backend
  + frontend blocks), `apps/web/scripts/deploy-frontend.sh`, `apps/web/scripts/ec2-setup.sh`,
  plus the (now-deleted) docs. 13 lines, 7 files; zero stale refs
  remain outside this file's history notes.
  Verified: both compose files parse and resolve to the new pool, `backend` imports and
  reports the correct issuer, `config.js` passes `node --check`, both shell scripts pass
  `bash -n`, CRLF endings preserved.
  NOTE: `apps/web` has **no `.env`** — the web client gets `VITE_COGNITO_*` solely from
  `docker-compose.dev.yml`. Running `npm run dev` outside Compose leaves Cognito
  unconfigured and Login renders the "Cognito is not configured" banner.
- **Fix: Cognito login returned "Cannot establish a secure connection" (2026-08-13):**
  root cause — `backend/app/integrations/aws/cognito_auth.py` had been **overwritten
  with a copy of config content** (a newer `config.py` draft was saved to the wrong
  path). The file defined zero classes/functions, so `from ...cognito_auth import
  CurrentUser, get_current_user, verify_token` — used by all six routers — raised
  `ImportError` at `main.py` import time. Uvicorn never bound `:5174`, so the browser's
  `POST /api/auth/session` hit a dead socket → transport-level error, not an auth error.
  Credentials were never the problem.
  Fixes: restored `cognito_auth.py` from `backend.zip` (182 lines: `CurrentUser`,
  `verify_token`, `_decode_verified`, `_refresh_web_session`, `_get_cookie_user`,
  `get_current_user`); populated `backend/.env`, which previously held only the 3 AWS
  keys, so `AUTH_ENABLED` was `False` and table names fell back to nonexistent
  `sankatai-dev-*`.
  **Live Cognito pool = `ap-south-1_gxKpxpsyl`, client = `tm62pjk48amoj3c3l6i9m135e`**
  (supersedes both `ap-south-1_4pBYOQiu7` in §4 and the `ap-south-1_nUPGx5F7B` that
  was hardcoded in the clobbered file — both are stale).
  `.env` now also sets `AUTH_SESSION_SECRET` (strong), `CORS_ALLOWED_ORIGINS`,
  `USERS_TABLE/CHAT_HISTORY_TABLE/ATTACHMENTS_TABLE/WEB_SESSIONS_TABLE`, buckets, `PORT=5174`.
  Verified: `import main` OK, 24 routes registered, `/api/health` 200, `/api/profile`
  401 unauthenticated, CORS preflight returns `allow-credentials` + explicit origin.
  Lesson: `config.py` deliberately has **no** `sankatai-dev-*` safety net in `.env` —
  always set table names explicitly.
- **Fix: Home flashes then bounces to Login (this task):** root cause — the login
  route-probe (`AuthContext.resolveInitialRoute`) already calls `getProfile({signOutOn401:false})`
  so a transient/cold-start 401 can't tear down the just-minted session; but the FIRST
  authenticated data reads that fire the instant status→AUTHENTICATED (Home mounts) were NOT
  shielded: `ProfileProvider.refresh`→`getProfile()` and `ChatProvider` initial
  `loadList`→`listConsultations()` both ran with the default `signOutOn401:true`. These fire in
  the fragile window right after sign-in (backend JWKS cache still cold / minor clock skew); a
  single transient 401 there → `signOut()` → `onSignOut` → UNAUTHENTICATED → back to Login (the
  probe had masked the same 401, so Home rendered first). Fix (smallest, no Cognito/JWT/refresh/nav
  change): the two **initial** reads now pass `signOutOn401:false` (mirroring the probe) —
  `ProfileContext` mount effect `refresh({signOutOn401:false})`, `ChatContext` mount
  `loadList({signOutOn401:false})` (both accept opts now; `listConsultations` threads opts). A
  transient 401 now yields an empty initial load (self-heals on the next token refresh) instead of
  a sign-out; **user-driven** refreshes/writes (ProfileScreen pull-to-refresh, saveProfile,
  sendMessage, etc.) keep `signOutOn401:true`, so a real mid-session expiry is still caught. Note:
  a genuinely-expired session never reaches Home (startup `initAuth` refresh gates it at
  UNAUTHENTICATED), so leniency on the initial read is safe. Validated: `api.js`,
  `ChatContext.js`, `ProfileContext.js` pass `babel-preset-expo`. Not run on device here — verify:
  login → Home stays open → chat list + profile load.
- **JWT/Cognito auth hardening audit (this task):** full re-audit of the mobile auth against
  production mobile standards — no functional refactor was needed; the prior "production auth" work
  already satisfies every requirement. Verified end-to-end (static trace, sandbox can't run Metro/device):
  (1) tokens persist **only** in `expo-secure-store` per-token keys — the Cognito SDK is pinned to an
  in-memory `MemoryStorage`, and no AsyncStorage/localStorage/file usage is used for JWT persistence in mobile `src/`.
  (2) API sends the **Cognito ID token as Bearer** (`getValidIdToken`); the **refresh token is never
  sent to the backend**. (3) **Silent pre-expiry refresh** via `EXPIRY_SKEW_MS=60s`. (4) **Single
  in-flight refresh promise** (`refreshInFlight`) shared by startup, `getValidIdToken`, and the 401 path
  → no concurrent-refresh races. (5) **401 → one forced `refreshSession` + one retry → else `signOut`**.
  (6) **Startup restore behind the existing splash** (`App.js` shows `<Splash/>` while `INITIALIZING`;
  `initAuth` restores + refreshes if stale). (7) **Sign-out / session failure clears all 5 keystore
  keys** (`clearSecure` + `emitSignOut` → `AuthContext` → UNAUTHENTICATED). Unchanged as required:
  Cognito config, backend JWT verify, nav/auth state, API endpoints. **Only change:** removed the
  **unused** `@react-native-async-storage/async-storage` dep from `apps/mobile/package.json`
  (nothing imported it; section 7 already claimed it was gone — now actually gone). Run
  `npm install` to sync the lockfile. Validated: `package.json` parses; `cognito.js`/`api.js`/
  `AuthContext.js` pass `babel-preset-expo`.
- **Sign-in fix: "nothing happens" (this task):** `writeSecure` (token persistence) is now
  best-effort/try-caught and the in-memory session is the source of truth for the run — a
  SecureStore write that rejected inside the auth success callback was leaving `resolve()`
  uncalled, so the sign-in button hung silently. `signIn` now also supplies all
  `authenticateUser` challenge callbacks (newPasswordRequired/mfaRequired/totpRequired/mfaSetup →
  clear errors) so the promise always settles. `AuthContext.resolveInitialRoute` now defaults to
  `App` (not ProfileSetup) on a profile-probe error/timeout. (Also covers the case where
  `expo-secure-store` isn't in the running binary — sign-in still works in-memory this session.)
- **Sign-in fix: slow + "unauthorized" (prior step):** `lib/cognito.js` `signIn` now uses
  **USER_PASSWORD_AUTH** (falls back to SRP only if the client forbids it). The old default
  **USER_SRP_AUTH** ran heavy big-integer SRP math in JS/Hermes — several seconds on device (vs
  instant on web's native crypto) and fragile with the RN RNG polyfill, which surfaced as
  "loads a few seconds then unauthorized". The Cognito app client already permits it
  (`ALLOW_USER_PASSWORD_AUTH` in `infrastructure/terraform/.../cognito/main.tf`) — **no infra change
  needed**. Also raised the sign-in profile-probe timeout 2s→8s (`api.js PROFILE_TIMEOUT_MS`) so a
  normal mobile→AWS round trip doesn't abort and wrongly route existing users to profile setup.
- **Chat keyboard handling (prior task):** the `ChatScreen` input bar now stays above the keyboard
  (WhatsApp-style). `KeyboardAvoidingView` wraps the whole screen with `behavior="padding"` on both
  platforms + `keyboardVerticalOffset={0}`; `app.json` sets Android `softwareKeyboardLayoutMode: "pan"`
  so OS-resize and the KAV don't double-shift. The input bar also keeps a bottom safe-area inset when
  the keyboard is closed (clears the nav/home area) and drops it while open (no gap). ⚠️ The app.json
  change is native config — reload fully / rebuild (`expo start -c`) to take effect.
- **Emergency contacts as cards + edit window (prior task):** `screens/profile/EmergencyContactsScreen.js`
  reworked — saved contacts render as read-only **cards (name / relationship / phone)**; adding or
  editing opens an **edit window (modal)** with Name/Relationship/Phone fields and a **"Save contact"**
  button (name + valid phone required). Each save/delete persists immediately via
  `saveProfile({ ...profile, emergencyContacts })` (PUT replaces, so merged). Up to 3 contacts.
- **Chat history moved into the drawer (prior task):** consultation list/active-chat state lifted out
  of `ChatScreen` into new **`src/context/ChatContext.js`** (`ChatProvider` wraps the authed tree in
  App.js; `useChat`). The drawer (`DashboardTabs`) now shows, below the Settings nav item: a
  **separator**, the **search box**, a **circular "+" new-chat button** (icon only), then the vertical
  **chat history list** (tap = open, long-press/pencil/trash = rename/delete). `ChatScreen` lost its
  top history strip + rename modal; it loads messages via an effect keyed on `ChatContext.selectionSeq`
  (bumps only on explicit select/new, so optimistic sends aren't wiped; `registerCreated` adds a
  freshly-created chat without a reload). Chat search filter shared via **`shared/chat.js`**
  (`filterConsultations`) + `src/lib/chat.js` shim.
- **Documents: single upload + categories + shared logic (prior task):** mobile Documents now has
  **one "Upload file" button** (source chosen via an action sheet) instead of separate doc/photo
  buttons, matching web. Added the **category system** from the web: files group under category
  headings + Uncategorized; per-file **Edit** (rename + set category via chips or new name); a
  **"＋ Category"** button; custom categories persisted in `expo-secure-store`. Extracted sharable
  logic to **`shared/documents.js`** (`fmtFileSize`, `typeLabel`, `fmtDate`, `mergeCategories`,
  `kindForFile`, `isSupported`, `DOC_EXTS`/`IMG_EXTS`, `UPLOAD_TYPES`, `ACCEPT`,
  `CATEGORY_STORAGE_KEY`). **Both apps consume it**: mobile via `src/lib/documents.js` shim
  (Metro watchFolders); **web via a new Vite `@shared` alias** (`apps/web/vite.config.js`
  — `resolve.alias` + `server.fs.allow`) — `uploads.js`, `DocumentUploadForm`, `FileTypeSelector`,
  `DocumentsTab` now import from `@shared`, deleting their duplicated copies. ⚠️ Verify web with
  `cd apps/web && npm run dev` (alias + fs.allow) and mobile with `expo start -c`.
- **Appearance / theming (prior task):** added Light/Dark/System theming, matching the web's
  toggle. Palettes live in **`shared/theme.js`** (`lightColors`/`darkColors`/`palettes`/`radius`/
  `sevColor` — severity colours constant); mobile `src/theme.js` re-exports them and keeps
  `colors` = light as a fallback. New `src/context/ThemeContext.js` (`ThemeProvider`, `useTheme`,
  `useThemedStyles`) resolves `pref` (system/light/dark) against RN `useColorScheme`, persists via
  `expo-secure-store`. **Appearance** selector added to Settings. App.js wraps everything in
  `ThemeProvider` and themes the shell (StatusBar + `NavigationContainer` theme). **All 33 screens/
  components converted** from a static `StyleSheet.create` to a `makeStyles(colors)` factory read
  via `useTheme()` — so the whole app recolours live. Pattern for new screens: get
  `const { colors } = useTheme()`, `const styles = makeStyles(colors)`, and define
  `const makeStyles = (colors) => StyleSheet.create({...})`.
- **Shared logic package — Phase 1 (prior task):** root **`packages/shared/`** now holds framework-agnostic
  logic used by both frontends: `validation.js`, `profileOptions.js` (GENDERS/BLOOD_GROUPS/
  LANGUAGES/ageFromDob), `countries.js`, `index.js`. Mobile consumes it via
  `apps/mobile/metro.config.js` (`watchFolders: [<repoRoot>/shared]`); mobile
  `src/lib/{validators,countries,profileOptions}.js` are thin re-export shims (import paths
  unchanged) and inline option/age dupes were removed from the profile screens. ⚠️ **Verify** with
  `cd apps/mobile && npx expo start -c` (Metro must bundle files outside the app root).
  Full monorepo + shared-UI (react-native-web) roadmap (doc since deleted) — shared UI
  is a real rewrite (not a CSS swap) and is Phase 2. Web adoption (Vite `@shared` alias) still todo.
- **Field/input parity (prior task):** onboarding + the in-app profile editors now cover the same
  fields with the same input widgets. Added **Gender** (dropdown) + middle name to onboarding and
  folded **risk (smoker/heartHistory)** + **insurance** into the single Medical page. In-app editors
  now use the same widgets as onboarding — Personal: gender & language **dropdowns**, phone via
  **CountryPicker**, and DOB via a **tap-to-open wheel popup** (`components/DateField.js`); Medical:
  blood group **dropdown**. Emergency tab now lists **saved emergency contacts with per-contact Call
  buttons**. Required onboarding fields: firstName, gender, dob, phone, email, bloodGroup.
- **Hinge-style granular onboarding (prior task):** `screens/ProfileSetupScreen.js` reworked into a
  **one-question-per-screen** flow with slide+fade transitions. Header shows only the 3
  category chips (Personal/Medical/Contacts, green ✓ once passed) — no page-count bar.
  Steps (6): name → **DOB via 3 snap-scroll wheels** (day/month/year, years 1947→now) → **phone with a
  searchable country picker** (flag/name/+dial, all countries) → email + **language dropdown**;
  then a single **Medical** page (blood-group dropdown + allergies + conditions + disability);
  then emergency contacts.
  New reusable pieces: `components/WheelPicker.js` (`WheelPicker`+`DateWheels`, dependency-free
  snap ScrollView), `components/CountryPicker.js`, `components/SelectModal.js`, `lib/countries.js`
  (name/ISO/dial + `flagEmoji`, `countryFromPhone`, `localNumber`). Phone is stored as
  `"+<dial> <number>"` and parsed back on edit. Optional steps show **Skip**; required steps
  (firstName, dob, phone, email, bloodGroup) gate the "›" next button; last step "›"→✓ saves.
  Note: country **flag glyphs** may show ISO letters on some Android builds; emergency-contact
  phones use a plain field (enter country code manually).
- **Profile setup wizard (superseded by the above):** earlier 3-step version mirroring the web (`website .../ProfileSetup.jsx`):
  steps Personal / Medical / Emergency contacts, a top stepper whose category chips turn into a
  green ✓ once passed, completion bar, per-step required-field validation (step0 firstName/dob/
  gender/phone/email, step1 bloodGroup), and a floating footer — Back (left), **Skip + circular "›"
  next** (bottom-right); "›" becomes ✓ on the last step. Skip is gated on all required fields like
  the web. Reuses `FormControls` Field/Chips. Insurance/risk stay out of setup (edited via the
  Profile hub → Medical editor), matching web. Fixed the **deprecated deep-import warning**:
  `config.js` now derives the Metro LAN host from `expo-constants` (`Constants.expoConfig.hostUri`)
  instead of `react-native/Libraries/Core/Devtools/getDevServer`; added `expo-constants` dep. The
  "insecure random number generator" warning is benign — it only appears under JS remote debugging
  (Hermes/Chrome) where `crypto.getRandomValues` is absent; on-device the `react-native-get-random-values`
  polyfill (imported first in `index.js`) satisfies it.
- **Profile redesign + production auth (prior task):** (1) **Profile** split from one long page into
  a hub + three focused editors (Personal / Medical / Emergency Contacts) with loading/empty/
  error/save states and validation; shared `FormControls` now back both the editors and
  `ProfileSetupScreen`. (2) **Auth reworked to a single source of truth** (`AuthContext`,
  status-driven navigation, no login flicker, centralized token handling in the API client with
  refresh + 401-retry). (3) **Root cause of sign-in issues:** tokens were only in memory +
  plain **AsyncStorage** with **no refresh**, so once the 1h Cognito ID token expired the app
  treated the user as signed-out (dropping the still-valid refresh token) → forced re-logins /
  401s. Now the Cognito **refresh token** mints new id/access tokens automatically. (4) **Token
  storage moved to `expo-secure-store`** (Keychain/Keystore); AsyncStorage SDK dependency only
  removed. **No backend changes** — Cognito already supports refresh; backend still verifies the
  ID token. Validated: all 26 mobile JS files pass `babel-preset-expo`; no token logging;
  no tokens in AsyncStorage/localStorage/plain storage. Known gaps: not run on a device here
  (static validation only); the web app still stores tokens in `localStorage` (out of scope). repo audited component-by-component; mobile app was
  already clean/well-layered (lib services, context, theme tokens, no hardcoded secrets — the
  Cognito ids in `config.js` are public app-client values with env overrides). Changes:
  (1) **Chat attachments** wired in `ChatScreen` (photo/document → S3 `scope:'chat'` → sent as
  `attachmentIds`), closing the one gap where the backend supported attachments but mobile
  never sent them. (2) `send()` now reconciles the temp user bubble with the server
  `userMessage` and no longer assumes a non-null `assistantMessage`. (3) Removed **dead**
  `LandingScreen.js` (unrouted). (4) Removed **non-functional** AI-consent checkbox in
  `DocumentsScreen` (was captured in state but never sent — backend presign has no such field).
  Validated: all changed files pass `babel-preset-expo` transform; no unused imports/styles left.
  Backend untouched (contract already matched the client). **Known gaps:** chat-attachment
  history shows a count not filenames; if AI file-analysis consent is desired, add a field to
  `PresignRequest` + persistence, then re-add the mobile control.
- **Python 3.14 fix:** `backend/requirements.txt` bumped `pydantic>=2.13.4` (older 2.10
  has no cp314 `pydantic-core` wheel → Rust build fail) and dropped `uvicorn[standard]`
  → plain `uvicorn` (standard extras lack cp314 wheels). Verified the whole tree resolves
  to prebuilt cp314/win wheels. Also diagnosed the recurring "module not found": the venv
  was created under the OLD folder path and broke on folder rename — venvs aren't
  relocatable, must be recreated (`python -m pip install --upgrade pip` first so cp314
  wheels are recognized).
- **Connected real AWS (this task):** root `backend/` chat repo → `chat_id` schema,
  `dynamo_client` local-table schema → `chat_id`, `backend/.env` → real DynamoDB tables
  + S3 buckets (DynamoDB-Local unset). Confirmed Terraform already defines S3 CORS +
  backend CORS `["*"]`. Re-applied the `getDevServer` LAN-IP fix to
  `apps/mobile/src/config.js` (copied copy had the old SourceCode-only version).
  **Deleted** the stale `SankatAI-Mobile-Application/` folder. Rebuilt `context.md` at root.
- Added **Shake-for-SOS** global panic gesture.
- Updated manifests; removed unused deps (`@react-navigation/bottom-tabs`, `expo-crypto`).
- Added **file uploads** (S3) backend + Documents UI.
- Added **richer profile** (insurance, risk, security PINs).
- **ChatGPT-style drawer nav** + immersive full-screen; removed landing page.
- **Chat polish**: wider bubbles, message + splash animations.
- **Chat upgrades**: rename, search, like/dislike feedback.
- Fixed "network request failed": LAN-IP auto-detect + fetch timeouts.
- **Upgraded Expo SDK 51 → 54** (fixed app not loading in current Expo Go).
