# SankatAI infrastructure (single environment).
#
# Request path:
#   client -> API Gateway (Cognito JWT authorizer) -> VPC Link
#          -> internal ALB -> private EC2 -> FastAPI
#
# The EC2 instance has no public IP, no SSH, and accepts traffic only from the
# ALB security group. Administration is SSM Session Manager.

module "cognito" {
  source = "./modules/security/cognito"

  project_name = var.project_name

  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
}

module "frontend" {
  source = "./modules/cdn/frontend"

  project_name = var.project_name
  # /api/* now originates from API Gateway, not the (now private) EC2 host.
  backend_origin_domain = module.api_gateway.api_domain_name
  backend_origin_port   = 443
}

module "database" {
  source = "./modules/database"

  project_name = var.project_name
}

module "storage" {
  source = "./modules/storage"

  project_name         = var.project_name
  cors_allowed_origins = var.cors_allowed_origins
}

module "secrets" {
  source = "./modules/secrets"

  project_name = var.project_name
  environment  = "dev"
}

# Backend IAM role/policy/instance-profile — scoped to exactly the buckets,
# tables and secret this application uses.
#
# Dependency order is storage/secrets -> iam. The ECR repo ARN is constructed
# rather than passed in, because ecr -> ec2 -> iam -> ecr would be a cycle.
module "iam" {
  source = "./modules/security/iam"
  region = var.region

  project_name            = var.project_name
  chat_bucket_arn         = module.storage.chat_bucket_arn
  file_bucket_arn         = module.storage.file_bucket_arn
  user_profiles_table_arn = module.database.user_profiles_table_arn
  chat_history_table_arn  = module.database.chat_history_table_arn
  attachments_table_arn   = module.database.attachments_table_arn
  ai_api_key_secret_arn   = module.secrets.ai_api_key_arn
}

module "network" {
  source = "./modules/network"

  project_name = var.project_name
  region       = var.region

  vpc_cidr             = "10.0.0.0/16"
  public_subnet_cidr   = "10.0.1.0/24"
  public_subnet_b_cidr = "10.0.2.0/24"
  private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]

  availability_zone   = "${var.region}a"
  availability_zone_b = "${var.region}b"
  nat_instance_type   = var.nat_instance_type
}

module "backend_ec2" {
  source = "./modules/compute/ec2"

  project_name  = var.project_name
  instance_type = var.instance_type
  vpc_id        = module.network.vpc_id
  # PRIVATE subnet — no public IP, no route to the internet gateway.
  subnet_id             = module.network.private_subnet_ids[0]
  iam_instance_profile  = module.iam.instance_profile_name
  alb_security_group_id = module.alb.security_group_id
  app_port              = var.backend_origin_port
}

module "alb" {
  source = "./modules/alb"

  project_name        = var.project_name
  vpc_id              = module.network.vpc_id
  vpc_cidr            = module.network.vpc_cidr
  subnet_ids          = module.network.private_subnet_ids
  backend_instance_id = module.backend_ec2.instance_id
  backend_port        = var.backend_origin_port
}

# The only public entry point. Validates Cognito access tokens, then forwards
# through the VPC Link to the internal ALB.
module "api_gateway" {
  source = "./modules/api_gateway"

  project_name                = var.project_name
  region                      = var.region
  cognito_user_pool_id        = module.cognito.user_pool_id
  cognito_user_pool_client_id = module.cognito.user_pool_client_id

  vpc_link_subnet_ids         = module.network.private_subnet_ids
  vpc_link_security_group_ids = [module.alb.security_group_id]
  alb_listener_arn            = module.alb.listener_arn

  cors_allowed_origins = var.cors_allowed_origins
}

module "ecr" {
  source = "./modules/ecr"

  project_name                = var.project_name
  github_repository           = var.github_repository
  backend_instance_id         = module.backend_ec2.instance_id
  create_github_oidc_provider = var.create_github_oidc_provider
}

# NOTE: there is no AI module. Inference is an external HTTPS call to the
# Ollama Cloud OpenAI-compatible endpoint (AI_BASE_URL), keyed by the
# `openai_api_key` secret. Bedrock + OpenSearch Serverless were removed on
# 2026-08-16 — the AOSS collection alone was ~$350/mo.
