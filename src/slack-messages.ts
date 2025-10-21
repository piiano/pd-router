import { promises as fs } from "fs";

function templateReplace(
  template: string,
  valuesDict: { [key: string]: any }
): string {
  return template.replace(/{{\s*(.*?)\s*}}/g, (match, key) => {
    return key in valuesDict ? valuesDict[key] : match;
  });
}

export async function help(user: string, app: string): Promise<string> {
  const content = await fs.readFile("templates/msg-help.md", "utf-8");

  return templateReplace(content, { user, app });
}

export async function userTriggered(
  user: string,
  text: string
): Promise<string> {
  const content = await fs.readFile("templates/msg-triggered.md", "utf-8");

  return templateReplace(content, { user, text });
}

export async function pdIncidentTriggered(
  title: string,
  html_url: string,
  id: string,
  urgency: string,
  number: number
): Promise<string> {
  const content = await fs.readFile(
    "templates/msg-pd-incident-triggered.md",
    "utf-8"
  );

  return templateReplace(content, { title, html_url, id, urgency, number });
}

export async function pdIncidentAck(
  title: string,
  html_url: string,
  number: number,
  user: string
): Promise<string> {
  const content = await fs.readFile(
    "templates/msg-pd-incident-acknowledged.md",
    "utf-8"
  );

  return templateReplace(content, { title, html_url, number, user });
}

export async function pdIncidentReassigned(
  title: string,
  html_url: string,
  number: number,
  user: string
): Promise<string> {
  const content = await fs.readFile(
    "templates/msg-pd-incident-reassigned.md",
    "utf-8"
  );

  return templateReplace(content, { title, html_url, number, user });
}

export async function pdIncidentResolved(
  title: string,
  html_url: string,
  number: number,
  user: string
): Promise<string> {
  const content = await fs.readFile(
    "templates/msg-pd-incident-resolved.md",
    "utf-8"
  );

  return templateReplace(content, { title, html_url, number, user });
}

export async function pdIncidentStatus(
  user: string,
  incidentId: string,
  status: string
): Promise<string> {
  const content = await fs.readFile(
    "templates/msg-pd-incident-status.md",
    "utf-8"
  );

  return templateReplace(content, { user, incidentId, status });
}
