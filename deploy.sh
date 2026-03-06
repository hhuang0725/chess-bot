#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# chess-bot — deploy backend to AWS (ECR + Lambda + API Gateway REST API)
# Usage: ./deploy.sh
# Idempotent: safe to re-run to update the Lambda image.
# ---------------------------------------------------------------------------

AWS_REGION="us-east-1"
ECR_REPO="chess-bot"
LAMBDA_FUNCTION="chess-bot"
LAMBDA_ROLE_NAME="chess-bot-lambda-role"
API_NAME="chess-bot"
IMAGE_TAG="latest"
FRONTEND_ORIGIN="https://chess-bot-frontend-1762710951.s3.us-east-1.amazonaws.com"
API_KEY_NAME="chess-bot-key"
USAGE_PLAN_NAME="chess-bot-usage-plan"
STAGE_NAME="prod"

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

# ---- 4b. Lambda reserved concurrency (hard cap on parallel MCTS runs) ---
echo "==> Setting Lambda reserved concurrency..."
TOTAL_CONCURRENCY=$(aws lambda get-account-settings \
  --region "$AWS_REGION" --query AccountLimit.ConcurrentExecutions --output text)
HEADROOM=$(( TOTAL_CONCURRENCY - 10 ))
if [ "$HEADROOM" -ge 1 ]; then
  RESERVED=$(( HEADROOM < 5 ? HEADROOM : 5 ))
  aws lambda put-function-concurrency \
    --function-name "$LAMBDA_FUNCTION" \
    --reserved-concurrent-executions "$RESERVED" \
    --region "$AWS_REGION" --output text > /dev/null
  echo "    Reserved concurrency set to $RESERVED."
else
  echo "    WARNING: Account concurrency limit ($TOTAL_CONCURRENCY) too low to reserve — skipping."
fi

# ---- 4c. Lambda environment variables -----------------------------------
echo "==> Setting Lambda environment variables..."
# MSYS_NO_PATHCONV prevents Git Bash on Windows from mangling /var/task/... paths
MSYS_NO_PATHCONV=1 aws lambda update-function-configuration \
  --function-name "$LAMBDA_FUNCTION" \
  --environment "Variables={MODEL_PATH=/var/task/model/inception_net_pretrained.pt,DEFAULT_SEARCHES=100,ALLOWED_ORIGIN=$FRONTEND_ORIGIN}" \
  --region "$AWS_REGION" --output text > /dev/null
aws lambda wait function-updated \
  --function-name "$LAMBDA_FUNCTION" --region "$AWS_REGION"

# ---- 5. REST API Gateway ------------------------------------------------
echo "==> Configuring REST API Gateway..."
LAMBDA_ARN=$(aws lambda get-function \
  --function-name "$LAMBDA_FUNCTION" \
  --region "$AWS_REGION" --query Configuration.FunctionArn --output text)

# 5a. Create or reuse REST API
API_ID=$(aws apigateway get-rest-apis \
  --region "$AWS_REGION" \
  --query "items[?name=='$API_NAME'].id" --output text)

if [ -z "$API_ID" ]; then
  echo "    Creating REST API..."
  API_ID=$(aws apigateway create-rest-api \
    --name "$API_NAME" \
    --endpoint-configuration types=REGIONAL \
    --region "$AWS_REGION" --query id --output text)
else
  echo "    Reusing existing API: $API_ID"
fi

# 5b. Root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id "$API_ID" --region "$AWS_REGION" \
  --query "items[?path=='/'].id" --output text)

# 5c. /move resource (idempotent)
RESOURCE_ID=$(aws apigateway get-resources \
  --rest-api-id "$API_ID" --region "$AWS_REGION" \
  --query "items[?path=='/move'].id" --output text)

if [ -z "$RESOURCE_ID" ]; then
  RESOURCE_ID=$(aws apigateway create-resource \
    --rest-api-id "$API_ID" --parent-id "$ROOT_ID" \
    --path-part "move" --region "$AWS_REGION" --query id --output text)
fi

# 5d. POST method — API key required (Gateway returns 403 without valid key)
aws apigateway put-method \
  --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
  --http-method POST --authorization-type NONE --api-key-required \
  --region "$AWS_REGION" 2>/dev/null || true

# 5e. Lambda proxy integration for POST
aws apigateway put-integration \
  --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
  --http-method POST --type AWS_PROXY --integration-http-method POST \
  --uri "arn:aws:apigateway:$AWS_REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
  --region "$AWS_REGION" 2>/dev/null || true

# 5f. OPTIONS method — no API key required (browser preflight never sends key)
aws apigateway put-method \
  --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
  --http-method OPTIONS --authorization-type NONE --no-api-key-required \
  --region "$AWS_REGION" 2>/dev/null || true

aws apigateway put-integration \
  --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
  --http-method OPTIONS --type MOCK \
  --request-templates '{"application/json":"{\"statusCode\":200}"}' \
  --region "$AWS_REGION" 2>/dev/null || true

aws apigateway put-method-response \
  --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
  --http-method OPTIONS --status-code 200 \
  --response-parameters '{
    "method.response.header.Access-Control-Allow-Headers": false,
    "method.response.header.Access-Control-Allow-Methods": false,
    "method.response.header.Access-Control-Allow-Origin": false
  }' --region "$AWS_REGION" 2>/dev/null || true

# Note: values need literal single quotes inside the JSON strings (AWS requirement)
CORS_PARAMS=$(cat <<EOF
{
  "method.response.header.Access-Control-Allow-Headers": "'Content-Type,x-api-key'",
  "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,POST'",
  "method.response.header.Access-Control-Allow-Origin": "'$FRONTEND_ORIGIN'"
}
EOF
)
aws apigateway put-integration-response \
  --rest-api-id "$API_ID" --resource-id "$RESOURCE_ID" \
  --http-method OPTIONS --status-code 200 \
  --response-parameters "$CORS_PARAMS" \
  --region "$AWS_REGION" 2>/dev/null || true

# 5g. Deploy to stage (creates stage if new, updates if exists)
echo "    Deploying to stage: $STAGE_NAME"
aws apigateway create-deployment \
  --rest-api-id "$API_ID" --stage-name "$STAGE_NAME" \
  --region "$AWS_REGION" --output text > /dev/null

# ---- 6. API Key + Usage Plan --------------------------------------------
echo "==> Configuring API key and usage plan..."

# 6a. Create or reuse API key
KEY_ID=$(aws apigateway get-api-keys \
  --region "$AWS_REGION" \
  --query "items[?name=='$API_KEY_NAME'].id" --output text)

if [ -z "$KEY_ID" ]; then
  KEY_ID=$(aws apigateway create-api-key \
    --name "$API_KEY_NAME" --enabled \
    --region "$AWS_REGION" --query id --output text)
  echo "    API key created: $KEY_ID"
else
  echo "    Reusing existing key: $KEY_ID"
fi

API_KEY_VALUE=$(aws apigateway get-api-key \
  --api-key "$KEY_ID" --include-value \
  --region "$AWS_REGION" --query value --output text)

# 6b. Create or reuse usage plan (throttle: 2 req/s sustained, burst 5)
PLAN_ID=$(aws apigateway get-usage-plans \
  --region "$AWS_REGION" \
  --query "items[?name=='$USAGE_PLAN_NAME'].id" --output text)

if [ -z "$PLAN_ID" ]; then
  PLAN_ID=$(aws apigateway create-usage-plan \
    --name "$USAGE_PLAN_NAME" \
    --throttle burstLimit=5,rateLimit=2 \
    --api-stages "apiId=$API_ID,stage=$STAGE_NAME" \
    --region "$AWS_REGION" --query id --output text)
  echo "    Usage plan created: $PLAN_ID"
else
  echo "    Reusing usage plan: $PLAN_ID"
  aws apigateway update-usage-plan \
    --usage-plan-id "$PLAN_ID" \
    --patch-operations \
      op=replace,path=/throttle/burstLimit,value=5 \
      op=replace,path=/throttle/rateLimit,value=2 \
    --region "$AWS_REGION" --output text > /dev/null
fi

# 6c. Associate key with usage plan (idempotent)
aws apigateway create-usage-plan-key \
  --usage-plan-id "$PLAN_ID" --key-type API_KEY --key-id "$KEY_ID" \
  --region "$AWS_REGION" --output text > /dev/null 2>/dev/null || true

# ---- 7. Grant API Gateway permission to invoke Lambda -------------------
echo "==> Granting API Gateway invoke permission..."
aws lambda add-permission \
  --function-name "$LAMBDA_FUNCTION" \
  --statement-id "apigateway-invoke" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$AWS_REGION:$AWS_ACCOUNT_ID:$API_ID/$STAGE_NAME/POST/move" \
  --region "$AWS_REGION" --output text > /dev/null \
  2>/dev/null || true

# ---- 8. Print endpoint --------------------------------------------------
ENDPOINT="https://$API_ID.execute-api.$AWS_REGION.amazonaws.com/$STAGE_NAME/move"
echo ""
echo "====================================================="
echo " Deployment complete!"
echo "====================================================="
echo " Endpoint:  $ENDPOINT"
echo " API Key:   $API_KEY_VALUE"
echo ""
echo " Build frontend:"
echo "   VITE_BOT_API_URL=$ENDPOINT VITE_API_KEY=$API_KEY_VALUE npm run build --prefix frontend"
echo ""
echo " Test (no key → 403):"
echo "   curl -s -o /dev/null -w \"%{http_code}\" -X POST $ENDPOINT \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"fen\":\"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\"}'"
echo ""
echo " Test (with key → 200):"
echo "   curl -s -X POST $ENDPOINT \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H \"x-api-key: $API_KEY_VALUE\" \\"
echo "     -d '{\"fen\":\"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\",\"searches\":10}'"
echo "====================================================="
