terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    # Zips the Cognito pre sign-up Lambda (modules/security/cognito).
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}
