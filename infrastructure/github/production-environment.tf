terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

variable "repository" {
  type    = string
  default = "ai-development-control-center"
}

variable "production_reviewer_user_ids" {
  description = "GitHub numeric user IDs authorized to approve the production Environment."
  type        = list(number)

  validation {
    condition     = length(var.production_reviewer_user_ids) > 0
    error_message = "At least one Human reviewer must be configured."
  }
}

resource "github_repository_environment" "production" {
  repository  = var.repository
  environment = "production"

  reviewers {
    users = var.production_reviewer_user_ids
  }

  deployment_branch_policy {
    protected_branches     = true
    custom_branch_policies = false
  }
}

# No Cloudflare deploy credential is stored as a GitHub Environment secret.
# GitHub OIDC is identity evidence only. The Cloudflare deploy token belongs
# exclusively to the authority-execution-enforcer Worker.
