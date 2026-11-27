# DealAssistant

A small self-hosted Discord utility for sharing payment details during deals. It
replies with your configured cryptocurrency addresses, converts a USD deal amount
into the amount of crypto to send, and serves your contact links, vouch links and
middleman policy as consistent embeds.

It is a personal utility, not a wallet, payment processor, escrow or middleman
service. It never asks for private keys or seed phrases, and it cannot verify or
confirm a payment.

## Commands

| Command | Description |
| --- | --- |
| `/btc [amount]` | Bitcoin address, optionally converted from a USD amount |
| `/ltc [amount]` | Litecoin address, optionally converted |
| `/eth [amount]` | Ethereum address, optionally converted |
| `/sol [amount]` | Solana address, optionally converted |
| `/usdceth [amount]` | USDC on Ethereum address |
| `/usdcsol [amount]` | USDC on Solana address |
| `/cashapp` | Cash App tag |
| `/info` | Your name, contact links and vouch links |
| `/vouch [amount]` | Vouch prompt with your marketplace profile and thread |
| `/middleman` | Your middleman policy |
| `/help` | Lists the commands that are currently enabled |

Payment commands are only registered when the matching address is configured, so
users never see a command that cannot answer.

`amount` is a USD figure. For example `/btc amount:200` shows the address, the
approximate BTC amount at the current rate, and the rate used. Rates come from the
CoinGecko public API and are cached for 60 seconds. If the lookup fails the
command still returns the address and says the live rate was unavailable.

## Requirements

- Node.js 20 or newer
- Your own Discord application (created below)
- No database, no Docker, no privileged intents

## Discord application setup

1. Open <https://discord.com/developers/applications> and click **New Application**.
2. Give it a name (for example `Deal Assistant`). This is the name people see, so
   set a profile picture on the **General Information** page too.
3. On **General Information**, copy the **Application ID**. This becomes
   `DISCORD_CLIENT_ID`.
4. Open the **Bot** page and click **Reset Token**, then copy the token once. This
   becomes `DISCORD_TOKEN`. Do not share it or commit it anywhere.
5. Open the **Installation** page. Under **Installation Contexts**, enable
   **User Install** and save.
6. Under **Default Install Settings**, add the `applications.commands` scope for
   **User Install**. Do not add the `bot` scope and do not grant Administrator or
   any other permissions — none are needed.
7. Leave **Install Link** set to **Discord Provided Link**.
8. Copy the install link and open it in your browser, then choose **Add to my
   apps**. This installs the application on your own Discord account, which is
   what lets the commands work in servers and DMs without inviting a bot to every
   server.
9. In Discord, open **User Settings -> Advanced** and enable **Developer Mode**.
10. Right-click your own avatar anywhere and choose **Copy User ID**. This becomes
    `DISCORD_OWNER_ID`.
11. Register the commands (see below), start the app, and run `/info` in a server
    or in a DM with the app. If it responds, the setup works.

`DISCORD_OWNER_ID` is a security setting, not a personalisation field. It decides
who may run the commands. You can find your user ID only after enabling Developer
Mode; it is not the same number as the Application ID.

### About installation restrictions

Disabling **Public Bot** on the Bot page only stops other people from adding your
bot user to their servers. It does not prevent someone from installing a
user-install app to their own account, because the install link is public.

DealAssistant therefore enforces ownership in code: every interaction is checked
against `DISCORD_OWNER_ID` before any command logic runs, including buttons,
modals and autocomplete. Someone else may be able to install the app, but they
cannot use it. Keep the install link private anyway.

## Configuration

All configuration lives in two files: `.env` for values and credentials, and an
optional `config.json` for longer text.

```bash
cp .env.example .env
```

### `.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token from the Developer Portal |
| `DISCORD_CLIENT_ID` | yes | Application ID |
| `DISCORD_OWNER_ID` | yes | Your Discord user ID; the only account allowed to run commands |
| `DISPLAY_NAME` | no | Name shown in embeds (default `Deal Assistant`) |
| `EMBED_COLOR` | no | Accent colour as hex (default `#5865F2`) |
| `EMBED_FOOTER` | no | Footer text added to every embed |
| `BTC_ADDRESS`, `LTC_ADDRESS`, `ETH_ADDRESS`, `SOL_ADDRESS`, `USDC_ETH_ADDRESS`, `USDC_SOL_ADDRESS` | no | Public receiving addresses; a payment command only appears when its address is set |
| `CASHAPP_TAG` | no | Cash App tag; enables `/cashapp` |
| `TELEGRAM_URL`, `WEBSITE_URL`, `EMAIL_ADDRESS`, `MARKETPLACE_PROFILE_URL`, `VOUCH_THREAD_URL` | no | Contact links; unset links are omitted from `/info` |
| `ENABLED_COMMANDS` | no | Comma-separated allowlist, for example `btc,info,help`. Blank enables everything that is configured |

Only public receiving addresses are needed. Never put a seed phrase or private key
in this file.

### `config.json`

Optional. Copy the example if you want to change the longer text:

```bash
cp config.example.json config.json
```

```json
{
  "infoMessage": "Hi, I'm {displayName}.",
  "middlemanPolicy": ["First line.", "Second line."],
  "vouchTemplate": "> **{amount} deal, quick and easy.**",
  "vouchTemplateNoAmount": "> Thanks for the deal."
}
```

`{displayName}` and `{amount}` are replaced at runtime. Any key you omit falls back
to the default shown in `config.example.json`. `config.json` is git-ignored because
it holds personal text.

## Installation and startup

```bash
npm install
cp .env.example .env      # then edit .env
npm run register          # once, and again whenever commands change
npm start
```

`npm run register` and `npm start` are different steps:

- `register` uploads the slash command definitions to Discord. Run it once after
  configuring, and again after changing commands, options or enabled payment
  methods.
- `start` connects the application to Discord and answers commands. It must keep
  running.

Global command updates can take up to an hour to appear in Discord. If a command
is missing, re-run `register` and wait, then restart your Discord client.

### Windows

After `npm install` and a filled-in `.env`, double-click `start-dealassistant.bat`.
It checks for Node, installs dependencies if they are missing, and starts the app.

### Linux and VPS

```bash
npm install --omit=dev
npm run register
npm start
```

To keep it running, use a process manager such as systemd:

```ini
[Unit]
Description=DealAssistant
After=network-online.target

[Service]
WorkingDirectory=/opt/DealAssistant
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
EnvironmentFile=/opt/DealAssistant/.env

[Install]
WantedBy=multi-user.target
```

`pm2 start src/index.js --name dealassistant` works too.

## Security

- The bot token is a credential. Keep `.env` out of version control; it is already
  in `.gitignore`.
- Only `DISCORD_OWNER_ID` may run commands. The check is centralised in
  `src/auth.js` and applies to every interaction type.
- The app requests no privileged intents, no bot permissions and no Administrator
  access. It only needs the `applications.commands` scope.
- Responses are public by default so you can share them with a counterparty. That
  is intentional: the owner shares, not a stranger executing commands.
- Nothing is stored. There is no database and no logging of addresses or users.
- Do not paste seed phrases or private keys into `.env`, `config.json`, or the
  Discord chat.

## Troubleshooting

**Commands do not appear.** Run `npm run register` again. Global commands can take
up to an hour. Make sure you installed the app to your own account ("Add to my
apps"), and that `.env` contains the Application ID of the same app whose token you
are using. Restart the Discord client.

**`Invalid token` on startup.** The token was copied incorrectly or was reset.
Generate a new one on the Bot page and update `DISCORD_TOKEN`.

**Commands fail with "application did not respond".** The process is not running,
or it crashed. Check the terminal output.

**Only my other account can run commands / "private application" reply.** The
account you are using is not `DISCORD_OWNER_ID`. Copy your own user ID again — it
is not the application ID.

**A command is missing entirely.** Its address is not configured, or
`ENABLED_COMMANDS` excludes it. Check the startup log: disabled commands are
listed with the reason.

**Commands work in DMs but not in a server.** The app is installed to your user
account but the command is not available in that context. User-install commands
work in servers, the app's DM, and group DMs; make sure you are not expecting
guild-install behaviour from a user-install app.

**The rate shows as unavailable.** CoinGecko was unreachable or rate limited. The
address is still returned. Check the network and try again shortly.

**`config.json could not be parsed`.** The file is not valid JSON — check for
trailing commas and unescaped quotes.

## Tests

```bash
npm test
```

The suite runs offline: Discord interactions and the price API are mocked, so no
token or network access is required.

## License

MIT. See [LICENSE](LICENSE).
