const axios = require('axios');
const core = require('@actions/core');
const github = require('@actions/github');
const { join } = require('path');

const shouldNotiLine = core.getInput('line');
const shouldNotiDiscord = core.getInput('discord');

const REQUIRED_ENV_VARS = [
  'GITHUB_EVENT_PATH',
  'GITHUB_REPOSITORY',
  'GITHUB_WORKFLOW',
  'GITHUB_ACTOR',
  'GITHUB_EVENT_NAME',
  'GITHUB_ACTION',
  'DISCORD_WEBHOOK',
  'GITHUB_JOB_STATUS',
  'GITHUB_RUN_ID'
];

REQUIRED_ENV_VARS.forEach(env => {
  if (!process.env[env] || !process.env[env].length) {
    console.error(
      `Env var ${env} is not defined. Maybe try to set it if you are running the script manually.`
    );
    process.exit(1);
  }
});

const eventPayload = github.context.payload;

console.log("eventPayload: ", JSON.stringify(eventPayload, null, 2))
console.log("shouldNotiDiscord: ", shouldNotiDiscord)
console.log("shouldNotiLine: ", shouldNotiLine)

if (shouldNotiDiscord === 'true') {
  const notiObj = {
    jobStatus: process.env.GITHUB_JOB_STATUS,
    workflow: process.env.GITHUB_WORKFLOW,
    username: process.env.DISCORD_USERNAME,
    avatarUrl: process.env.DISCORD_AVATAR,
    eventContent: eventPayload,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK,
    additionalDesc: process.env.ADDITIONAL_DESCRIPTION
  }
  discordNotify(notiObj)
}

async function discordNotify({ jobStatus, workflow, username, avatarUrl, eventContent, discordWebhookUrl, additionalDesc }) {
  let color
  let title
  if (jobStatus == "success") {
    title = "Action is successful."
    color = "5162540"
  } else if (jobStatus == "failure") {
    title = "Action has failed."
    color = "16711680"
  } else if (jobStatus == "cancelled") {
    title = "Action is cancelled."
    color = "8421504"
  } else {
    title = `Action is ${jobStatus}.`
  }

  try {
    additionalDesc = JSON.parse(additionalDesc)
  } catch (error) {
    console.log("parse ADDITIONAL_DESCRIPTION error: ", error)
    additionalDesc = {}
  }

  const descriptionObj = JSON.parse(JSON.stringify({
    'Repository': `[${process.env.GITHUB_REPOSITORY}](${eventContent.repository.html_url})`,
    'Workflow': workflow,
    'Ref name': process.env.GITHUB_REF_NAME
  }))
  const description = getDiscordDescription(Object.assign(descriptionObj, additionalDesc), eventContent)

  const payload = {
    username: username || 'Deploy Notification',
    avatar_url: avatarUrl || 'https://cdn.discordapp.com/attachments/988683025942454312/1268082301942632480/IMG_6667.png?ex=66ab212c&is=66a9cfac&hm=21ce38167bfb7cd41eea5d77a7e0562d47767f35af7eb6ff53a22803ef8883f4&',
    embeds: [
      {
        author: {
          name: eventContent.sender?.login || process.env.GITHUB_ACTOR,
          url: eventContent.sender?.html_url,
          icon_url: eventContent.sender?.avatar_url
        },
        color: color,
        title: title,
        url: `${eventContent.repository.html_url}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        description: description
      }
    ]
  }

  console.log("payload", JSON.stringify(payload, null, 2))

  try {
    console.log('Sending message ...');
    await axios.post(
      `${discordWebhookUrl}?wait=true`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
      },
    );
    console.log('Message sent ! Shutting down ...');
    process.exit(0);
  } catch (error) {
    console.error('Error :', error.response.status, error.response.statusText);
    console.error('Full Error: ', error)
    console.error('Message :', error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

function getDiscordDescription(descriptionObj, eventContent) {
  let description = ''
  for (const key of Object.keys(descriptionObj)) {
    description += `**${key}**: ${descriptionObj[key]}\n\n`
  }
  if (eventContent.commits?.length) {
    description += `**Commit**: [${eventContent.commits?.length} new commits](${eventContent.compare})\n`
    for (let i = 0; i < 5 && i < eventContent.commits.length; i++) {
      description += `- [\`${eventContent.commits[i].id.slice(0, 7)}\`](${eventContent.commits[i].url}) ${eventContent.commits[i].message} - ${eventContent.commits[i].author?.username || eventContent.commits[i].committer?.username}\n`
    }
  }
  return description
}
