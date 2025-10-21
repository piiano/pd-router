# pd-router

A multi-tenant PagerDuty-Slack integration for service providers that enables per-customer incident escalation channels.

## The Problem

As a **service provider** with multiple customers, you already have dedicated Slack channels for communicating with each customer. You want to leverage these existing channels to also allow customers to trigger PagerDuty incidents when they experience issues with your service.

**The official PagerDuty Slack bot wasn't designed for this.** It treats all incident triggers as coming from a single organization (because it was built for companies to manage their own infrastructure, not for service providers managing incidents on behalf of multiple customers).

## The Solution

pd-router enables true **multi-tenant incident management** by leveraging your existing customer channels:

- Uses your existing dedicated Slack channels for each customer
- Each customer can trigger PagerDuty incidents independently from their channel
- Customers remain isolated - they don't know other customers exist
- Incident updates are routed back to the correct customer channel
- All incidents flow through your single PagerDuty instance with proper channel tracking

### Example Use Case

You're a SaaS provider with existing customer communication channels for Acme Corp, Globex, and InitTech:

- **#customer-acme** - Acme Corp's existing communication/support channel
- **#customer-globex** - Globex's existing communication/support channel
- **#customer-initech** - InitTech's existing communication/support channel

You add the pd-router bot to these existing channels. Now when Acme mentions the bot with `@bot escalate API is returning 500 errors`, only Acme sees the incident trigger and subsequent updates in their channel. Globex and InitTech have no idea Acme is experiencing issues. All three customers can simultaneously escalate incidents from their existing channels without interfering with each other.

## Overview

pd-router is an AWS Lambda-based microservice that provides:

- **Per-Channel Escalation**: Each Slack channel (customer) can trigger independent PagerDuty incidents
- **Automatic Channel Linking**: Incidents remember which customer channel they originated from
- **Isolated Updates**: PagerDuty incident updates (acknowledged, reassigned, resolved) route back only to the originating customer channel
- **Status Visibility**: Customers can query their incident status directly from their channel

## Architecture

The application follows a service-oriented architecture with clear separation of concerns:

```
AWS Lambda Handler (index.ts)
    ├── PagerDuty Service (pagerduty.ts)
    ├── Slack Service (slack.ts)
    └── Environment Configuration (env.ts)
```

**Event Flow**:
1. Inbound events reach Lambda via API Gateway
2. Handler detects event source (PagerDuty or Slack) via User-Agent header
3. Routes to appropriate service handler
4. Services communicate via REST APIs with PagerDuty and Slack
5. Formatted responses sent back to respective platforms

## Features

### PagerDuty Integration

Handles webhook events for incident lifecycle:
- `incident.triggered` - New incidents created
- `incident.acknowledged` - Incidents acknowledged by responder
- `incident.reassigned` - Incidents reassigned to different team members
- `incident.resolved` - Incidents marked as resolved

All PagerDuty events are automatically broadcast to the linked Slack channel with formatted messages and interactive buttons.

### Slack Bot Integration

Built with Slack Bolt framework:
- **App Mentions**: Listens for bot mentions in channels
- **Escalate Command**: Mention bot with "escalate [description]" to create PagerDuty incidents
- **Status Checks**: Interactive buttons for querying current incident status
- **Health Checks**: Ping/pong functionality for monitoring
- **Help Messages**: Provides usage instructions for unknown commands

## Usage

### Escalate from Slack

Mention the bot in any channel with the "escalate" keyword:

```
@bot-name escalate Database server is down
```

The bot will:
1. Create a PagerDuty incident with the full message as the title
2. Link the incident to the current Slack channel
3. Confirm the escalation in Slack

### Receive PagerDuty Updates

When incidents are triggered, acknowledged, reassigned, or resolved in PagerDuty, formatted notifications are automatically sent to the linked Slack channel with:
- Incident title with link to PagerDuty
- Incident number and urgency
- Status/action indicators
- Interactive "Check Status" button

### Check Incident Status

Click the "Check Status of the alert" button on any incident notification to get the current status from PagerDuty.

## Configuration

### Required Environment Variables

- `SECRETS_MANAGER_SECRET_ID`: ARN or name of AWS Secrets Manager secret containing credentials

### Optional Environment Variables

- `SLACK_COMMAND`: Slash command to listen for (default: "/piiano-pd-trigger")
- `SLACK_PING_PHRASE`: Ping message phrase (default: "piiano-ping-bot")

### Secrets Manager Configuration

Create an AWS Secrets Manager secret with the following JSON structure:

```json
{
  "SLACK_SIGNING_SECRET": "your-slack-signing-secret",
  "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
  "PAGER_DUTY_SIGNING_KEY": "your-pagerduty-signing-key",
  "PAGER_DUTY_EVENTS_API_KEY": "your-pagerduty-events-api-key",
  "PAGER_DUTY_REST_API_KEY": "your-pagerduty-rest-api-key"
}
```

### Slack App Setup

1. Create a Slack App at https://api.slack.com/apps
2. Add Bot Token Scopes:
   - `app_mentions:read` - Read bot mentions
   - `chat:write` - Post messages
   - `channels:read` - Read channel information
   - `conversations.list` - List conversations for channel resolution
3. Enable Event Subscriptions and subscribe to:
   - `app_mention` - Bot mention events
4. Install the app to your workspace
5. Copy the Signing Secret and Bot Token to Secrets Manager

### PagerDuty Setup

1. Create a PagerDuty API token with permissions to:
   - Create incidents (Events API v2)
   - Query incidents (REST API)
2. Create a webhook subscription pointing to your Lambda function URL

## License

MIT License - see LICENSE file for details

## Version

0.1.0

## Organization

Piiano
