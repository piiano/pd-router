import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretsManagerSecretId = process.env.SECRETS_MANAGER_SECRET_ID;

export type Env = {
  slack: {
    signingSecret: string;
    botToken: string;
    command: string;
    pingPhrase: string;
  };
  pagerDuty: {
    signingKey: string;
    eventsApiKey: string;
    restApiKey: string;
  };
};

export async function getEnv(): Promise<Env> {
  // if (Object.keys(secrets).length > 0) {
  //   return;
  // }

  if (!secretsManagerSecretId) {
    throw new Error("Missing SECRETS_MANAGER_SECRET_ID");
  }

  const client = new SecretsManagerClient({});
  const resp = await client.send(
    new GetSecretValueCommand({
      SecretId: secretsManagerSecretId,
    })
  );

  const secrets = JSON.parse(resp?.SecretString || "{}");

  return {
    slack: {
      signingSecret: must(secrets, "SLACK_SIGNING_SECRET"),
      botToken: must(secrets, "SLACK_BOT_TOKEN"),
      command: process.env.SLACK_COMMAND || "/piiano-pd-trigger",
      pingPhrase: process.env.SLACK_PING_PHRASE || "piiano-ping-bot",
    },
    pagerDuty: {
      signingKey: must(secrets, "PAGER_DUTY_SIGNING_KEY"),
      eventsApiKey: must(secrets, "PAGER_DUTY_EVENTS_API_KEY"),
      restApiKey: must(secrets, "PAGER_DUTY_REST_API_KEY"),
    },
  };
}

function must(secrets: { [key: string]: string }, value: string): string {
  if (!secrets[value]) {
    throw new Error(`Missing secret: ${value}`);
  }

  return secrets[value];
}
