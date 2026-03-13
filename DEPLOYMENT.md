# DiveOps™ — Deployment Guide

This guide covers deploying DiveOps outside of Replit.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ database
- OpenAI API key
- OpenWeather API key

## Environment Variables

Create a `.env` file or configure these in your hosting platform:

```
DATABASE_URL=postgresql://user:password@host:5432/diveops
SESSION_SECRET=your-random-secret-at-least-32-chars
OPENWEATHER_API_KEY=your-openweather-key

# OpenAI — use standard OpenAI URL when not on Replit
OPENAI_API_KEY=sk-your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Option 1: Direct Deploy (VPS, bare metal)

```bash
# Install dependencies
npm ci

# Push database schema
npm run db:push

# Build the app
npm run build

# Start production server
npm start
```

The app runs on port 5000 by default. Put nginx or Caddy in front for HTTPS.

## Option 2: Docker

```bash
# Build the image
docker build -t diveops .

# Run with environment variables
docker run -d \
  --name diveops \
  -p 5000:5000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/diveops" \
  -e SESSION_SECRET="your-secret" \
  -e OPENWEATHER_API_KEY="your-key" \
  -e OPENAI_API_KEY="sk-your-key" \
  -e OPENAI_BASE_URL="https://api.openai.com/v1" \
  diveops
```

Note: Run `npm run db:push` separately before first launch to create the database tables.

## Option 3: AWS

### Option 3a: AWS ECS (Fargate) — Recommended for production

This runs the Docker container on AWS without managing servers.

**Prerequisites:** AWS CLI configured, an ECR repository, and a VPC with subnets.

```bash
# 1. Create an ECR repository
aws ecr create-repository --repository-name diveops --region us-east-1

# 2. Build and push the Docker image
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
docker build -t diveops .
docker tag diveops:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/diveops:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/diveops:latest

# 3. Create an RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier diveops-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15 \
  --master-username diveops \
  --master-user-password YOUR_DB_PASSWORD \
  --allocated-storage 20

# 4. Store secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name diveops/env \
  --secret-string '{
    "DATABASE_URL": "postgresql://diveops:YOUR_DB_PASSWORD@your-rds-endpoint:5432/diveops",
    "SESSION_SECRET": "your-random-secret",
    "OPENWEATHER_API_KEY": "your-key",
    "OPENAI_API_KEY": "sk-your-key",
    "OPENAI_BASE_URL": "https://api.openai.com/v1"
  }'
```

Then create an ECS cluster, task definition, and service. See `aws/ecs-task-definition.json` in this repo for the task definition template.

```bash
# 5. Create ECS cluster
aws ecs create-cluster --cluster-name diveops-cluster

# 6. Register task definition
aws ecs register-task-definition --cli-input-json file://aws/ecs-task-definition.json

# 7. Create the service
aws ecs create-service \
  --cluster diveops-cluster \
  --service-name diveops-service \
  --task-definition diveops \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

Put an Application Load Balancer (ALB) in front for HTTPS with an ACM certificate.

### Option 3b: AWS EC2 — Simple single-server deploy

```bash
# On a fresh Amazon Linux 2023 or Ubuntu EC2 instance:

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs git   # Amazon Linux
# OR: sudo apt install -y nodejs git   # Ubuntu

# Clone your repo
git clone YOUR_REPO_URL /opt/diveops
cd /opt/diveops

# Install and build
npm ci
npm run build

# Set environment variables
cat > /opt/diveops/.env << 'EOF'
DATABASE_URL=postgresql://user:password@your-rds-endpoint:5432/diveops
SESSION_SECRET=your-random-secret
OPENWEATHER_API_KEY=your-key
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
EOF

# Initialize database
npm run db:push

# Run with systemd (create service file)
sudo tee /etc/systemd/system/diveops.service << 'EOF'
[Unit]
Description=DiveOps Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/diveops
EnvironmentFile=/opt/diveops/.env
ExecStart=/usr/bin/node dist/index.cjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable diveops
sudo systemctl start diveops
```

Use an ALB or nginx with Certbot for HTTPS.

### Option 3c: AWS App Runner — Easiest AWS option

App Runner builds and deploys from a container image or source code with minimal configuration.

1. Push your Docker image to ECR (see steps in 3a above)
2. Go to AWS App Runner in the console
3. Create service → choose "Container registry" → select your ECR image
4. Set port to `5000`
5. Add all environment variables under "Configuration"
6. Set up an RDS PostgreSQL database and add the `DATABASE_URL`
7. Deploy — App Runner handles HTTPS, scaling, and load balancing automatically

## Option 4: Railway / Render / Fly.io

1. Connect your Git repository
2. Set the environment variables listed above
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add a PostgreSQL addon or use an external database
6. Run `npm run db:push` once to initialize the schema

## Database Setup

The app uses Drizzle ORM. To initialize a fresh database:

```bash
DATABASE_URL="your-connection-string" npm run db:push
```

This creates all tables. The app automatically seeds a default admin account on first run.

## Default Admin Account

On first launch, the app creates:
- Email: `spittman@precisionsubsea.com`
- Password: (set via SEED_GOD_PASSWORD environment variable)
- Role: GOD

Change this password immediately after first login.

## Architecture Notes

- Frontend: React SPA served by Express from `/dist`
- Backend: Express API on port 5000
- Database: PostgreSQL with Drizzle ORM
- AI: OpenAI API (GPT models) for log classification, chat, voice
- Weather: OpenWeather API for conditions and lightning monitoring

## Reverse Proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name diveops.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
