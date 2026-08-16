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
    Statement = [
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
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.backend.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}