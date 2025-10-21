import { APIGatewayProxyEvent } from "aws-lambda";
import { Env } from "./env";
import * as messages from "./slack-messages";
import axios from "axios";
import * as crypto from "crypto";
import { Button } from "@slack/bolt";

// URLs.
const pagerDutyRestURL = "https://api.pagerduty.com/incidents";
const pagerDutyEventsURL = "https://events.pagerduty.com/v2/enqueue";

interface WebhookV3Payload {
  event:
    | { resource_type: "pagey"; event_type: "pagey.ping" }
    | IncidentEvent<"incident.triggered">
    | IncidentEvent<"incident.acknowledged", { assignees: Assignee[] }>
    | IncidentEvent<"incident.reassigned", { assignees: Assignee[] }>
    | IncidentEvent<"incident.resolved">;
}

interface IncidentEvent<T, D = {}> {
  resource_type: "incident";
  event_type: T;
  agent: { summary: string };
  data: IncidentData & D;
}

interface IncidentData {
  id: string;
  html_url: string;
  number: number;
  title: string;
  urgency: string;
}

interface Assignee {
  summary: string;
}

export type PageDutyService = {
  handleWebhook: (event: APIGatewayProxyEvent) => Promise<{
    channelId: string;
    content: string;
    button?: Button;
  } | null>;
  triggerIncident: (summary: string, channel: string) => Promise<void>;
  getIncident: (
    incidentId: string
  ) => Promise<{ incidentId: string; status: string }>;
};

export function initPagerDutyService(env: Env): PageDutyService {
  return {
    handleWebhook: handleWebhook.bind(null, env),
    triggerIncident: triggerIncident.bind(null, env),
    getIncident: getIncident.bind(null, env),
  };
}

async function handleWebhook(
  env: Env,
  event: APIGatewayProxyEvent
): Promise<{
  channelId: string;
  content: string;
  button?: Button;
} | null> {
  console.log("Received event from PagerDuty");

  // https://github.com/serverless/serverless/issues/2765
  const headers: { [key: string]: any } = {};
  for (const key in event.headers) {
    headers[key.toLowerCase()] = event.headers[key];
  }

  verifySignature(
    headers["X-PagerDuty-Signature".toLowerCase()] || "",
    event.body ?? "",
    env.pagerDuty.signingKey
  );

  const webhook: WebhookV3Payload = JSON.parse(event.body ?? "{}");

  // If ping event, return 200.
  if (webhook.event.resource_type == "pagey") {
    return {
      channelId: "temp-pagerduty-testing",
      content: "Received ping event from PagerDuty",
    };
  }

  // Get the channel ID from the incident ID. If the channel ID is not found, that is probably because
  // the incident was triggered outside of the Slack app, so we don't need to send a message.
  const channelId = await getChannel(env, webhook.event.data.id);
  if (!channelId) {
    return null;
  }

  switch (webhook.event.event_type) {
    case "incident.triggered":
      return {
        channelId,
        content: await messages.pdIncidentTriggered(
          webhook.event.data.title,
          webhook.event.data.html_url,
          webhook.event.data.id,
          webhook.event.data.urgency,
          webhook.event.data.number
        ),
        button: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Check Status of the alert",
          },
          action_id: "pagerduty-status-button",
          value: webhook.event.data.id,
        },
      };
    case "incident.acknowledged":
      return {
        channelId,
        content: await messages.pdIncidentAck(
          webhook.event.data.title,
          webhook.event.data.html_url,
          webhook.event.data.number,
          webhook.event.agent.summary
        ),
      };
    case "incident.reassigned":
      return {
        channelId,
        content: await messages.pdIncidentReassigned(
          webhook.event.data.title,
          webhook.event.data.html_url,
          webhook.event.data.number,
          webhook.event.data.assignees.map((a) => a.summary).join(", ")
        ),
      };
    case "incident.resolved":
      return {
        channelId,
        content: await messages.pdIncidentResolved(
          webhook.event.data.title,
          webhook.event.data.html_url,
          webhook.event.data.number,
          webhook.event.agent.summary
        ),
      };
  }
}

// This will open an incident in the test incident PD service.
const triggerIncident = async (env: Env, summary: string, channel: string) => {
  console.debug("[pd] Sending alert");
  const data = {
    payload: {
      summary: summary,
      severity: "critical",
      source: "slack",
      custom_details: channel,
    },
    routing_key: env.pagerDuty.eventsApiKey,
    event_action: "trigger",
  };

  const response = await axios.post(pagerDutyEventsURL, data, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  console.info("[pd] Alert sent to PagerDuty:", response.data);
};

const getIncident = async (env: Env, incidentId: string) => {
  console.log("[pd] getting incident for incident id", incidentId);

  const response = await axios.get(`${pagerDutyRestURL}/${incidentId}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token token=${env.pagerDuty.restApiKey}`,
    },
  });

  return {
    incidentId: response.data.incident.id,
    status: response.data.incident.status,
  };
};

const getChannel = async (
  env: Env,
  pagerDutyId: string
): Promise<string | undefined> => {
  console.log("[pd] getting alert for incident id", pagerDutyId);

  const response = await axios.get(`${pagerDutyRestURL}/${pagerDutyId}`, {
    params: {
      "include[]": "first_trigger_log_entries",
    },
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token token=${env.pagerDuty.restApiKey}`,
    },
  });

  // Assuming the status is in the first element of the array under the property status
  return response.data?.incident?.first_trigger_log_entry?.channel?.details;
};

// Based on https://developer.pagerduty.com/docs/28e906a0e4f36-verifying-signatures#verifying-the-signature
function verifySignature(
  signaturesHeader: string,
  payload: string,
  key: string
) {
  const signatures = signaturesHeader
    // Split the signatures by comma.
    .split(",")
    // Only keep the ones that start with "v1=".
    .filter((s) => s.startsWith("v1="))
    // Remove the "v1=" prefix.
    .map((s) => {
      return s.slice(3);
    });

  const calculatedSignature = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");

  if (!signatures.includes(calculatedSignature)) {
    throw new Error("[pd] Invalid signature");
  }
}
