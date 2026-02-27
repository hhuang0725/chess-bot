#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# chess-bot2 — deploy backend to AWS (ECR + Lambda + API Gateway HTTP API)
# Usage: ./deploy.sh
# Idempotent: safe to re-run to update the Lambda image.
# ---------------------------------------------------------------------------

AWS_REGION="us-east-1"
ECR_REPO="chess-bot2"
LAMBDA_FUNCTION="chess-bot2"
LAMBDA_ROLE_NAME="chess-bot2-lambda-role"
API_NAME="chess-bot2"
IMAGE_TAG="latest"

# ---- 1. Resolve AWS account ID ------------------------------------------
echo "==> Resolving AWS account..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG"
echo "    Account: $AWS_ACCOUNT_ID  |  Region: $AWS_REGION"

# ---- 2. ECR: create repo + push image ------------------------------------
echo "==> Creating ECR repository (if needed)..."
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$AWS_REGION" \
  2>/dev/null || true

echo "==> Authenticating Docker with ECR..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin \
      "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "==> Building Docker image..."
docker build --platform linux/amd64 --provenance=false -t "$ECR_REPO" -f backend/Dockerfile .

echo "==> Tagging and pushing image to ECR..."
docker tag "$ECR_REPO:latest" "$ECR_URI"
docker push "$ECR_URI"

# ---- 3. IAM role for Lambda ----------------------------------------------
echo "==> Creating Lambda IAM role (if needed)..."
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}'

ROLE_ARN=$(aws iam create-role \
  --role-name "$LAMBDA_ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --query Role.Arn --output text 2>/dev/null) || \
ROLE_ARN=$(aws iam get-role \
  --role-name "$LAMBDA_ROLE_NAME" \
  --query Role.Arn --output text)

aws iam attach-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
  2>/dev/null || true

echo "    Role ARN: $ROLE_ARN"

# IAM propagation — new roles need a few seconds before Lambda can use them
sleep 10

# ---- 4. Lambda: create or update ----------------------------------------
echo "==> Deploying Lambda function..."
if aws lambda get-function --function-name "$LAMBDA_FUNCTION" --region "$AWS_REGION" &>/dev/null; then
  echo "    Function exists — updating image..."
  aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION" \
    --image-uri "$ECR_URI" \
    --region "$AWS_REGION" \
    --output text > /dev/null

  aws lambda wait function-updated \
    --function-name "$LAMBDA_FUNCTION" \
    --region "$AWS_REGION"
else
  echo "    Creating new function..."
  aws lambda create-function \
    --function-name "$LAMBDA_FUNCTION" \
    --package-type Image \
    --code ImageUri="$ECR_URI" \
    --role "$ROLE_ARN" \
    --memory-size 3008 \
    --timeout 60 \
    --region "$AWS_REGION" \
    --output text > /dev/null

  aws lambda wait function-active \
    --function-name "$LAMBDA_FUNCTION" \
    --region "$AWS_REGION"
fi
echo "    Lambda ready."

# ---- 5. API Gateway HTTP API --------------------------------------------
echo "==> Configuring API Gateway..."
LAMBDA_ARN=$(aws lambda get-function \
  --function-name "$LAMBDA_FUNCTION" \
  --region "$AWS_REGION" \
  --query Configuration.FunctionArn --output text)

# Reuse existing API if already created
API_ID=$(aws apigatewayv2 get-apis \
  --region "$AWS_REGION" \
  --query "Items[?Name=='$API_NAME'].ApiId" \
  --output text)

if [ -z "$API_ID" ]; then
  echo "    Creating HTTP API..."
  API_ID=$(aws apigatewayv2 create-api \
    --name "$API_NAME" \
    --protocol-type HTTP \
    --cors-configuration \
      AllowOrigins='["*"]',AllowMethods='["POST","OPTIONS"]',AllowHeaders='["Content-Type"]' \
    --region "$AWS_REGION" \
    --query ApiId --output text)
else
  echo "    Reusing existing API: $API_ID"
fi

# Lambda integration
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id "$API_ID" \
  --integration-type AWS_PROXY \
  --integration-uri "$LAMBDA_ARN" \
  --payload-format-version "2.0" \
  --region "$AWS_REGION" \
  --query IntegrationId --output text)

# Route: POST /move
aws apigatewayv2 create-route \
  --api-id "$API_ID" \
  --route-key "POST /move" \
  --target "integrations/$INTEGRATION_ID" \
  --region "$AWS_REGION" \
  --output text > /dev/null

# $default stage with auto-deploy
aws apigatewayv2 create-stage \
  --api-id "$API_ID" \
  --stage-name '$default' \
  --auto-deploy \
  --region "$AWS_REGION" \
  --output text > /dev/null

# ---- 6. Grant API Gateway permission to invoke Lambda -------------------
echo "==> Granting API Gateway invoke permission..."
aws lambda add-permission \
  --function-name "$LAMBDA_FUNCTION" \
  --statement-id "apigateway-invoke" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$AWS_REGION:$AWS_ACCOUNT_ID:$API_ID/*" \
  --region "$AWS_REGION" \
  --output text > /dev/null \
  2>/dev/null || true

# ---- 7. Print endpoint --------------------------------------------------
ENDPOINT="https://$API_ID.execute-api.$AWS_REGION.amazonaws.com/move"
echo ""
echo "====================================================="
echo " Deployment complete!"
echo "====================================================="
echo " Endpoint:  $ENDPOINT"
echo ""
echo " Test:"
echo "   curl -X POST $ENDPOINT \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"fen\":\"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\",\"searches\":10}'"
echo ""
echo " Frontend env var:"
echo "   VITE_BOT_API_URL=$ENDPOINT"
echo "====================================================="
