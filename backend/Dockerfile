FROM public.ecr.aws/lambda/python:3.11

# Install Python dependencies
COPY backend/requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy model code and pretrained weights
COPY backend/model/ ${LAMBDA_TASK_ROOT}/model/

# Copy handler
COPY backend/handler.py ${LAMBDA_TASK_ROOT}/

# Set the handler
CMD ["handler.lambda_handler"]
