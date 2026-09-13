'use strict';

require('dotenv').config();

const inquirer = require('inquirer');
const chalk = require('chalk');
const { YouTubeAuthResolver } = require('../utils/youtube-auth-resolver');

async function main() {
  console.log(chalk.bold.cyan('\n=== Money In Minutes: YouTube OAuth Channel Authorization ===\n'));

  const resolver = new YouTubeAuthResolver();
  const status = await resolver.checkCredentialStatus();

  console.log('Current credential status:', status);

  const args = process.argv.slice(2);
  const isReauth = args.includes('--reauth') || args.includes('--force');
  const codeArg = args.find(a => a.startsWith('--code='))?.split('=')[1] || null;
  const isInteractive = Boolean(process.stdin.isTTY);

  let clientId = process.env.YOUTUBE_CLIENT_ID || resolver.credentialManager.credentials?.youtube?.client_id;
  let clientSecret = process.env.YOUTUBE_CLIENT_SECRET || resolver.credentialManager.credentials?.youtube?.client_secret;
  let redirectUri = process.env.YOUTUBE_REDIRECT_URI || resolver.credentialManager.credentials?.youtube?.redirect_uris?.[0] || 'http://localhost:8080/oauth2callback';

  if (status.hasRefreshToken && !isReauth && !codeArg) {
    console.log(chalk.bold.green('\n✅ YouTube channel is already authorized!'));
    console.log(chalk.gray(`- Credential source: ${status.source}`));
    console.log(chalk.gray('- Offline refresh token: PRESENT'));
    console.log(chalk.gray('- Ready for autonomous daily YouTube Shorts publishing.\n'));

    if (isInteractive) {
      const { reauth } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'reauth',
          message: 'Would you like to re-authorize or link a different channel?',
          default: false
        }
      ]);
      if (!reauth) {
        console.log(chalk.cyan('Authorization confirmed. Exiting.'));
        return;
      }
    } else {
      console.log(chalk.cyan('To re-authorize or link a different channel, run:'));
      console.log(chalk.yellow('npm run shorts:oauth -- --reauth\n'));
      return;
    }
  }

  if (!clientId || !clientSecret) {
    if (!isInteractive) {
      throw new Error(
        'YouTube Client ID and Client Secret not found. Please set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env or provide config/credentials.json.'
      );
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'Enter Google Cloud YouTube Client ID:',
        default: resolver.credentialManager.credentials?.youtube?.client_id || '',
        validate: val => val.length > 0 || 'Client ID is required'
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'Enter Google Cloud YouTube Client Secret:',
        validate: val => val.length > 0 || 'Client Secret is required'
      },
      {
        type: 'input',
        name: 'redirectUri',
        message: 'Enter Redirect URI:',
        default: redirectUri
      }
    ]);

    clientId = answers.clientId;
    clientSecret = answers.clientSecret;
    redirectUri = answers.redirectUri;
  }

  const authUrl = resolver.generateAuthUrl({ clientId, clientSecret, redirectUri });

  console.log(chalk.bold.yellow('\n1. Open this URL in your browser to authorize the Money In Minutes channel:'));
  console.log(chalk.underline.blue(`\n${authUrl}\n`));
  console.log(chalk.gray('After approving permissions, copy the "code" query parameter from the redirect URL.\n'));

  let code = codeArg;
  if (!code) {
    if (!isInteractive) {
      console.log(chalk.yellow('Non-interactive environment detected.'));
      console.log(chalk.gray('Complete authorization in your browser and run:'));
      console.log(chalk.cyan('npm run shorts:oauth -- --code=<PASTED_CODE>\n'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'code',
        message: 'Paste the authorization code from your browser:',
        validate: val => val.length > 0 || 'Authorization code is required'
      }
    ]);
    code = answers.code;
  }

  console.log(chalk.cyan('Exchanging authorization code for persistent refresh token...'));
  const tokenInfo = await resolver.exchangeCodeForTokens(code, { clientId, clientSecret, redirectUri });

  console.log(chalk.bold.green('\n✅ YouTube channel authorization completed successfully!'));
  console.log(chalk.gray('Tokens have been securely saved to config/tokens.json for unattended daily publishing.\n'));
  console.log('Token Refresh Capability:', tokenInfo.hasRefreshToken ? 'ENABLED (Offline Access)' : 'NOT PROVIDED');
}

if (require.main === module) {
  main().catch(err => {
    console.error(chalk.red('OAuth setup failed:'), err.message);
    process.exit(1);
  });
}

module.exports = { main };
