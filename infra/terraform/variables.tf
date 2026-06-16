variable "aws_region" {
  description = "AWS region to deploy resources into."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for tagging and naming."
  type        = string
  default     = "kestrel-kyc"
}

variable "db_password" {
  description = "Database master password."
  type        = string
  sensitive   = true
  default     = ""
}
