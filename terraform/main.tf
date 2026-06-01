terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 5.100.0"
    }
  }
  required_version = ">= 1.3.0"
}

provider "aws" {
  region = var.aws_region
}

# ─── DATA: Latest Ubuntu 22.04 AMI ────────────────────────────────
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ─── VPC ──────────────────────────────────────────────────────────
resource "aws_vpc" "pfa_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name    = "${var.app_name}-vpc"
    Project = "PFA"
  }
}

# ─── SUBNET ───────────────────────────────────────────────────────
resource "aws_subnet" "pfa_subnet" {
  vpc_id                  = aws_vpc.pfa_vpc.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name    = "${var.app_name}-subnet"
    Project = "PFA"
  }
}

# ─── INTERNET GATEWAY ─────────────────────────────────────────────
resource "aws_internet_gateway" "pfa_igw" {
  vpc_id = aws_vpc.pfa_vpc.id

  tags = {
    Name    = "${var.app_name}-igw"
    Project = "PFA"
  }
}

# ─── ROUTE TABLE ──────────────────────────────────────────────────
resource "aws_route_table" "pfa_rt" {
  vpc_id = aws_vpc.pfa_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.pfa_igw.id
  }

  tags = {
    Name    = "${var.app_name}-rt"
    Project = "PFA"
  }
}

resource "aws_route_table_association" "pfa_rta" {
  subnet_id      = aws_subnet.pfa_subnet.id
  route_table_id = aws_route_table.pfa_rt.id
}

# ─── SECURITY GROUP ───────────────────────────────────────────────
resource "aws_security_group" "pfa_sg" {
  name        = "${var.app_name}-sg"
  description = "Security group for PFA Ticketing App"
  vpc_id      = aws_vpc.pfa_vpc.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 30000
    to_port     = 30000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 30001
    to_port     = 30001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 9090
    to_port     = 9090
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 9000
    to_port     = 9000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.app_name}-sg"
    Project = "PFA"
  }
}

# ─── EC2 INSTANCE ─────────────────────────────────────────────────
resource "aws_instance" "pfa_server" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = var.key_name
  subnet_id                   = aws_subnet.pfa_subnet.id
  vpc_security_group_ids      = [aws_security_group.pfa_sg.id]
  associate_public_ip_address = true

  root_block_device {
    volume_size = 20
    volume_type = "gp2"
  }

  user_data = templatefile("${path.module}/user_data.sh", {
    dockerhub_username = var.dockerhub_username
    ldap_server_url    = var.ldap_server_url
    ldap_base_dn       = var.ldap_base_dn
  })

  tags = {
    Name    = "${var.app_name}-server"
    Project = "PFA"
  }
}

# ─── ELASTIC IP ───────────────────────────────────────────────────
resource "aws_eip" "pfa_eip" {
  instance = aws_instance.pfa_server.id
  domain   = "vpc"

  depends_on = [aws_internet_gateway.pfa_igw]

  tags = {
    Name    = "${var.app_name}-eip"
    Project = "PFA"
  }
}
