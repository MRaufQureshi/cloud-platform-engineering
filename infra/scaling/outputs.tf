# The ALB's DNS name — this is how you actually reach the app, 
# an ALB has no stable IP of its own
output "alb_dns_name" {
  value = aws_lb.webserver_elb.dns_name
}
