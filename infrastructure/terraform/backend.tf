terraform {
  backend "s3" {
    bucket       = "admin-terraform-state-bucket-020"
    key          = "sankatai/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = false
    encrypt      = true
  }
}
