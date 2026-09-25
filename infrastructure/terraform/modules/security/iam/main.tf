# Backend EC2 role: least-privilege access to exactly the buckets and tables
# this application uses. Attach `instance_profile_name` to the backend instance
# — the app resolves credentials from the instance role, never static keys.
#
# ⚠️ RECOVERED FILE. `outputs.tf` referenced `aws_iam_role.backend` and
# `aws_iam_instance_profile.backend`, but no file defined them — the module did
# not validate. The resource ADDRESSES below are fixed by those outputs, so they
# will bind to the existing state. Confirm the `name` attributes match what is
# already deployed before applying:
#     terraform state show module.iam.aws_iam_role.backend
#     terraform state show module.iam.aws_iam_instance_profile.backend
# A different name forces a replacement.

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "backend" {
  name = "${var.project_name}-backend-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_instance_profile" "backend" {
  name = "${var.project_name}-backend-profile"
  role = aws_iam_role.backend.name
}

resource "aws_iam_role_policy" "backend" {
  name = "${var.project_name}-backend-policy"
  role = aws_iam_role.backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      # Objects in the two upload buckets (presign PUT/GET, delete on vault
      # delete). Object-level actions only.
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = [
          "${var.chat_bucket_arn}/*",
          "${var.file_bucket_arn}/*",
        ]
      },
      # Bucket-level: listing is needed for the vault views.
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [var.chat_bucket_arn, var.file_bucket_arn]
      },
      # Application tables. Indexes are covered by the /index/* suffix.
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          # Metadata only; used by /api/health/readiness, which otherwise
          # reports every table as down.
          "dynamodb:DescribeTable",
        ]
        Resource = [
          var.user_profiles_table_arn,
          var.chat_history_table_arn,
          var.attachments_table_arn,
          "${var.user_profiles_table_arn}/index/*",
          "${var.chat_history_table_arn}/index/*",
          "${var.attachments_table_arn}/index/*",
        ]
      },
      # NOTE: no bedrock:* grants. Inference is an outbound HTTPS call to the
      # Ollama Cloud endpoint, authenticated with the secret below.
      # The AI provider key. Scoped to this one secret — not secretsmanager:*.
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.ai_api_key_secret_arn
      },
      # Voice input. The backend PRESIGNS Transcribe streaming WebSocket URLs
      # with this role (a local SigV4 computation, no network call); the
      # client's connection is then authorised as this role. The action has no
      # resource type in IAM, so "*" is the only valid Resource. It can only
      # open a live stream: no batch jobs, no vocabularies, no stored media.
      {
        Effect   = "Allow"
        Action   = ["transcribe:StartStreamTranscriptionWebSocket"]
        Resource = "*"
      },
      # Read replies aloud (Polly) and detect the language of typed messages
      # (Comprehend). Neither action supports resource-level scoping for these
      # uses, so "*" is the only valid Resource. Both are stateless calls; the
      # TTS cache reuses the chat bucket's existing object grant above (tts/).
      {
        Effect   = "Allow"
        Action   = ["polly:SynthesizeSpeech", "comprehend:DetectDominantLanguage"]
        Resource = "*"
      },
      # Application + system logs. Write-only: the instance can ship logs but
      # cannot read back what it or anything else has written.
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/sankatai/*"
      },
      # Pull the backend image from ECR. GetAuthorizationToken cannot be scoped
      # to a resource — AWS requires "*" for that single action.
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = "arn:aws:ecr:${var.region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}-backend"
      },
      # ── Admin console + analytics ─────────────────────────────────────────
      # Admins, invitations (+ GSIs) and analytics tables. Transactions need
      # the underlying Put/Update/ConditionCheck actions; no Scan, no Delete.
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:ConditionCheckItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:DescribeTable",
        ]
        Resource = concat(var.admin_table_arns, [for arn in var.admin_table_arns : "${arn}/index/*"])
      },
      # Audit log is append-only: write new items and read them back. No
      # UpdateItem/DeleteItem/BatchWriteItem, so history cannot be rewritten.
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = var.admin_audit_table_arn
      },
      # ADMIN group membership + pool metadata, on this one pool only.
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminUserGlobalSignOut",
          "cognito-idp:DescribeUserPool",
        ]
        Resource = var.cognito_user_pool_arn
      },
      # Analytics salt (read by the rollout on the instance).
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.analytics_salt_secret_arn
      },
      # System Health: API Gateway metrics. GetMetricData has no resource-level
      # permissions in IAM, so "*" is the only valid Resource; it reads metric
      # values only (no logs, no alarms, no writes).
      {
        Effect   = "Allow"
        Action   = ["cloudwatch:GetMetricData"]
        Resource = "*"
      },
      ],
      # Invitation email: SendEmail only, only From the configured sender.
      # Resource is any identity so sandbox recipient checks pass; the
      # FromAddress condition is what pins the sender.
      var.ses_sender_email == "" ? [] : [{
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = "arn:aws:ses:${var.region}:${data.aws_caller_identity.current.account_id}:identity/*"
        Condition = {
          StringEquals = { "ses:FromAddress" = var.ses_sender_email }
        }
      }],
    )
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}