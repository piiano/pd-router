import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { initPagerDutyService } from "./pagerduty";
import { getEnv } from "./env";
import { initSlackService } from "./slack";

const response200 = {
  statusCode: 200,
  body: "{}",
};

const response403 = {
  statusCode: 403,
  body: "{}",
};

export const handler = async (
  event: APIGatewayProxyEvent,
  context: any,
  callback: any
): Promise<APIGatewayProxyResult> => {
  try {
    console.log("Received event:", JSON.stringify(event, null, 2)); // Logging the event for debugging

    const env = await getEnv();
    const pagerDutyService = initPagerDutyService(env);
    const slackService = initSlackService(env, pagerDutyService);

    // If the event is from PagerDuty.
    if (event.headers["User-Agent"]?.startsWith("PagerDuty")) {
      const msg = await pagerDutyService.handleWebhook(event);
      if (!msg) {
        console.log(
          "[pd] Incident was triggered outside of the Slack app. No message sent."
        );
        return response200;
      }

      await slackService.sendMsg(msg.channelId, msg.content, msg.button);
      return response200;
    }

    // Otherwise, it's a Slack event.
    const handler = await slackService.lambdaReceiver.start();
    return handler(event, context, callback);
  } catch (error) {
    console.error(error);

    return response403;
  }
};
