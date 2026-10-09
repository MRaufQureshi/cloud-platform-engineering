# modules/api/cognito.tf
#
# Cognito = AWS's login service. Three pieces:
#
#   USER POOL     the user directory: who exists, their passwords, the rules.
#   APP CLIENT    "this web app is allowed to ask the pool to log someone in".
#   USER          one test user, so the demo has someone to log in as.
#
# Logging in returns a JWT (a signed token). The browser sends it with every API
# call, and API Gateway checks the signature BEFORE the Lambda ever runs.

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-users"

  username_attributes      = ["email"] # people sign in with their email address
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF" # a demo; production would turn MFA on

  # Nobody can sign themselves up. Only an admin (Terraform, here) creates users.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # A browser app cannot keep a secret, so the client has none. It proves who
  # the user is with SRP, a password protocol where the password never travels.
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",      # what the React app uses
    "ALLOW_USER_PASSWORD_AUTH", # lets the AWS CLI log in for testing (a demo convenience)
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # A wrong username and a wrong password look the same, so nobody can use the
  # login form to find out which emails exist.
  prevent_user_existence_errors = "ENABLED"
}

# The demo user's first password. Random, so it is never in git, and shown only
# as a sensitive output. Cognito makes the user choose a new one at first login.
resource "random_password" "demo" {
  length           = 16
  min_lower        = 1
  min_upper        = 1
  min_numeric      = 1
  min_special      = 1
  override_special = "!@#%^*-_"
}

resource "aws_cognito_user" "demo" {
  user_pool_id       = aws_cognito_user_pool.main.id
  username           = var.demo_username
  temporary_password = random_password.demo.result
  message_action     = "SUPPRESS" # do not try to send a welcome email

  attributes = {
    email          = var.demo_username
    email_verified = "true"
  }
}
