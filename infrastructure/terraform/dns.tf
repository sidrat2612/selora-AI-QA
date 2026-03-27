# ─── Route 53 ───────────────────────────────────────────────────────────────
# After creating the hosted zone, update your domain registrar's NS records
# to point to the Route 53 name servers (shown in outputs).

resource "aws_route53_zone" "main" {
  name = var.domain_name
}

# ─── Web → CloudFront ──────────────────────────────────────────────────────

resource "aws_route53_record" "web" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.web_fqdn
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "web_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.web_fqdn
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

# ─── Console → CloudFront ──────────────────────────────────────────────────

resource "aws_route53_record" "console" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.console_fqdn
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.console.domain_name
    zone_id                = aws_cloudfront_distribution.console.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "console_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.console_fqdn
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.console.domain_name
    zone_id                = aws_cloudfront_distribution.console.hosted_zone_id
    evaluate_target_health = false
  }
}

# ─── API → App Runner ──────────────────────────────────────────────────────

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.api_fqdn
  type    = "CNAME"
  ttl     = 300
  records = [aws_apprunner_custom_domain_association.api.dns_target]
}

# App Runner certificate validation records
resource "aws_route53_record" "api_validation" {
  for_each = {
    for r in aws_apprunner_custom_domain_association.api.certificate_validation_records :
    r.name => r
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 300
  records = [each.value.value]
}
