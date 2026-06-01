variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.medium"
}

variable "key_name" {
  description = "Name of the AWS key pair for SSH access"
  type        = string
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "pfa-ticketing"
}

variable "dockerhub_username" {
  description = "Docker Hub username"
  type        = string
  default     = "dhiasaidan"
}

variable "ldap_server_url" {
  description = "LDAP server URL"
  type        = string
  default     = ""
}

variable "ldap_base_dn" {
  description = "LDAP base DN"
  type        = string
  default     = "dc=sotupa,dc=local"
}
