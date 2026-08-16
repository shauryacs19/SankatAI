output "api_endpoint" {
  description = "Invoke URL — CloudFront's /api/* origin, and EXPO_PUBLIC_API_URL for mobile."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_domain_name" {
  description = "Host portion of the invoke URL (CloudFront origin domain_name)."
  value       = replace(aws_apigatewayv2_api.backend.api_endpoint, "https://", "")
}

output "api_id" {
  value = aws_apigatewayv2_api.backend.id
}

output "vpc_link_id" {
  value = aws_apigatewayv2_vpc_link.backend.id
}
