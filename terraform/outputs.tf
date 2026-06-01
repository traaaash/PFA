output "instance_public_ip" {
  description = "Public IP of the EC2 instance"
  value       = aws_eip.pfa_eip.public_ip
}

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.pfa_server.id
}

output "app_url" {
  description = "URL to access the application"
  value       = "http://${aws_eip.pfa_eip.public_ip}:30000"
}

output "grafana_url" {
  description = "Grafana monitoring URL"
  value       = "http://${aws_eip.pfa_eip.public_ip}:3001"
}

output "prometheus_url" {
  description = "Prometheus URL"
  value       = "http://${aws_eip.pfa_eip.public_ip}:9090"
}

output "sonarqube_url" {
  description = "SonarQube URL"
  value       = "http://${aws_eip.pfa_eip.public_ip}:9000"
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i <your-key.pem> ubuntu@${aws_eip.pfa_eip.public_ip}"
}
