import { Env } from "./env";
import { PageDutyService } from "./pagerduty";
import * as messages from "./slack-messages";
import { App, AwsLambdaReceiver, Button, LogLevel } from "@slack/bolt";
import { ConversationsListResponse } from "@slack/web-api";

type SlackService = {
  lambdaReceiver: AwsLambdaReceiver;
  app: App;

  sendMsg(channel: string, message: string, button?: Button): Promise<void>;
};

type Channel = {
  id?: string;
  name?: string;
};

export function initSlackService(
  env: Env,
  pagerDutyService: PageDutyService
): SlackService {
  const lambdaReceiver = new AwsLambdaReceiver({
    signingSecret: env.slack.signingSecret,
  });
  const app = new App({
    token: env.slack.botToken,
    receiver: lambdaReceiver,
    logLevel: LogLevel.DEBUG,
  });

  // Listens to incoming slash command
  app.event("app_mention", async ({ event, say }) => {
    const { channel, text: origText } = event;
    const user = event.username || event.user || "";

    // extract bot name and text itself from the message.
    const match = /@(?<botName>.+)>(?<message>[\s\S]*)/.exec(origText);
    const botName = match?.groups?.botName || "";
    const text = match?.groups?.message.trim() || "";

    // If the user didn't provide any text, send the help message.
    if (text === null || text === undefined || text.trim() === "") {
      await say({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: await messages.help(user, botName),
            },
          },
        ],
      });
      return;
    }

    // If the user sent a ping, reply with a pong.
    if (text === env.slack.pingPhrase) {
      await say(`received ping from <@${user}> :wave:`);
      return;
    }

    // If the user didn't provide the escalate keyword, send the help message.
    if (!text.startsWith("escalate")) {
      await say({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: await messages.help(user, botName),
            },
          },
        ],
      });
      return;
    }

    // Alert PagerDuty.
    await pagerDutyService.triggerIncident(text, channel);

    // Reply to Slack.
    await say({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: await messages.userTriggered(user, text),
          },
        },
      ],
      text: "Incident triggered",
    });
  });

  // Listens for an action from a button click
  app.action("pagerduty-status-button", async ({ body, ack, say }) => {
    await ack();

    if (body.type !== "block_actions" || body.actions[0].type !== "button") {
      console.log("Wrong type or wrong action type", body.type);
      return;
    }

    const pagerDutyId = body.actions[0].value; // get the incident ID
    const incident = await pagerDutyService.getIncident(pagerDutyId); // get status for the incident saved in the button value

    await say(
      await messages.pdIncidentStatus(
        body.user.id,
        pagerDutyId,
        incident.status
      )
    );
  });

  return {
    lambdaReceiver,
    app,
    sendMsg: sendMsg.bind(null, app),
  };
}

export async function sendMsg(
  app: App,
  channel: string,
  message: string,
  button?: Button
) {
  const channelId = await findChannelId(app, channel);

  console.log("Sending message to channel:", channelId);

  await app.client.chat.postMessage({
    channel: channelId,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
        accessory: button,
      },
    ],
    text: "PagerDuty status update",
  });
}

async function findChannelId(app: App, channel: string): Promise<string> {
  let channels: Channel[] = [];
  // Getting the list of channels to figure the channel ID.
  for await (const response of app.client.paginate("conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit: 200,
  })) {
    const page = (response as ConversationsListResponse).channels;
    if (!page || page.length === 0) {
      continue;
    }

    channels.push(...page);
  }

  // Find the channel ID for the channel name.
  const channelId = channels.find(
    (chan) => chan.name === channel || chan.id === channel
  )?.id;
  if (!channelId) {
    throw new Error(`channel ${channel} not found`);
  }

  return channelId;
}
