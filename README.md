# DealAssistant

[![Tests](https://github.com/Matriarch/DealAssistant/actions/workflows/tests.yml/badge.svg)](https://github.com/Matriarch/DealAssistant/actions/workflows/tests.yml)

A small self-hosted Discord utility for sharing payment details during deals. It
replies with your configured cryptocurrency addresses, converts a USD deal amount
into the amount of crypto to send, and serves your contact links, vouch links and
middleman policy as consistent embeds.

It is a personal utility, not a wallet, payment processor, escrow or middleman
service. It never asks for private keys or seed phrases, and it cannot verify or
confirm a payment.

## Commands

- `/pay currency:BTC` shares receiving details for a configured method.
- `/btc`, `/ltc`, `/eth`, `/sol`, `/usdceth`, and `/usdcsol` are payment
  shortcuts with an optional USD amount. `/cashapp` shows your cashtag.
- `/price currency:BTC fiat:CAD` and `/convert amount:200 from:USD to:BTC`
  show private exchange-rate estimates.
- `/info`, `/vouch`, and `/middleman` share your configured deal information.
  `/help` lists the commands currently enabled.
- With `feesEnabled` set to `true`, use `/fees amount:200 percent:2.50` or
  `/fees amount:200 fixed:3 fiat:CAD` to calculate the fee and net amount privately.

Payment shortcuts require a configured receiving address or cashtag.

`/pay` lists configured methods, including Cash App when set. The individual
cryptocurrency commands remain available as shortcuts. Set
`PAYMENT_QR_ENABLED=true` and rerun registration to add the optional `qr:true`
argument to cryptocurrency payments. The image is generated locally and encodes
the same address shown in the response. Amounts stay outside the QR code.

The payment shortcuts take amounts in USD. `/pay currency:BTC amount:200 fiat:EUR`
estimates the payment for a EUR deal. `/pay`, `/price` and `/convert` support USD,
EUR, GBP and CAD. For example, `/convert amount:0.5 from:ETH to:USD` estimates the
USD value of 0.5 ETH. Rates include USDC market prices from CoinGecko and show
when the app retrieved them. The app caches rates for 60 seconds and shares
concurrent lookups for the same asset. Payment responses still show the address
when a lookup fails. Market estimates can change before payment.

## Requirements

- Node.js 22 or newer (Node.js 24 LTS recommended)
- Your own Discord application, created below
- No database, no Docker, no privileged intents

## Discord application setup

1. Open <https://discord.com/developers/applications> and click **New Application**.
2. Give it a name (for example `Deal Assistant`) and set a profile picture on the
   **General Information** page.
3. On **General Information**, copy the **Application ID**. This becomes
   `DISCORD_CLIENT_ID`.
4. Open the **Bot** page, click **Reset Token**, and copy the token once. This
   becomes `DISCORD_TOKEN`. Treat it like a password.
5. Open the **Installation** page. Under **Installation Contexts**, enable
   **User Install** and save. Guild Install is optional — this app never needs to
   join a server, so leaving it off reduces the surface area.
6. Under **Install Link**, choose **Discord Provided Link**. The default install
   settings do not appear until a link type is selected.
7. Under **Default Install Settings**, add the `applications.commands` scope for
   **User Install**. Do not add the `bot` scope and do not grant Administrator or
   any other permissions — none are needed.
8. Copy the install link, open it in your browser, and choose **Add to my apps**.
   This installs the application on your own Discord account, which is what lets
   the commands work in servers and DMs without inviting a bot to every server.
9. In Discord, open **User Settings -> Advanced** and enable **Developer Mode**.
10. Right-click your own avatar and choose **Copy User ID**. This becomes
    `DISCORD_OWNER_ID`.
11. Register the commands, start the app, and run `/info` in a server or in a DM
    with the app.

`DISCORD_OWNER_ID` is a security setting, not a personalisation field. It decides
who may run the commands. It is not the same number as the Application ID.

### Installation restrictions

Disabling **Public Bot** on the Bot page only stops other people from adding your
bot user to their servers. It does not prevent someone from installing a
user-install app to their own account, because the install link is public.

DealAssistant therefore enforces ownership in code: every interaction is checked
against `DISCORD_OWNER_ID` before any command logic runs, including buttons,
modals and autocomplete. Someone else may be able to install the app, but they
cannot use it. Keep the install link private anyway.

Server roles with **Use External Apps** turned off receive replies from user-installed
apps privately. Visibility can vary by conversation and permissions. [Discord’s guide to apps](https://support.discord.com/hc/en-us/articles/21334461140375-Using-Apps-on-Discord)

## Configuration

All configuration lives in `.env`, plus an optional `config.json` for longer text.
Both are validated at startup; the process exits with a specific message rather
than failing later in Discord.

```bash
# copy .env.example to .env, then edit it
# on Windows: copy .env.example .env
```

### `.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | yes | Bot token from the Developer Portal |
| `DISCORD_CLIENT_ID` | yes | Application ID |
| `DISCORD_OWNER_ID` | yes | Your Discord user ID; the only account allowed to run commands (see step 10) |
| `DISPLAY_NAME` | no | Name shown in embeds (default `Deal Assistant`) |
| `EMBED_COLOR` | no | Accent colour as hex (default `#5865F2`) |
| `EMBED_FOOTER` | no | Footer text added to every embed |
| `BTC_ADDRESS`, `LTC_ADDRESS`, `ETH_ADDRESS`, `SOL_ADDRESS`, `USDC_ETH_ADDRESS`, `USDC_SOL_ADDRESS` | no | Public receiving addresses; a payment command only appears when its address is set |
| `CASHAPP_TAG` | no | Cash App tag; enables `/cashapp` |
| `PAYMENT_QR_ENABLED` | no | Set to `true` to offer `qr:true` on supported methods |
| `TELEGRAM_URL`, `WEBSITE_URL`, `EMAIL_ADDRESS`, `MARKETPLACE_PROFILE_URL`, `VOUCH_THREAD_URL` | no | Contact links; unset links are omitted from `/info` |
| `ENABLED_COMMANDS` | no | Comma-separated allowlist, for example `btc,info,help`. Blank enables everything that is configured |

Only public receiving addresses are needed. Never put a seed phrase or private key
in this file.

### Payment addresses

Addresses are validated against the network for their command when the app starts.
An invalid value stops startup with a message naming the variable; the value itself
is never echoed and is never corrected or rewritten.

| Command | Network | Accepted format |
| --- | --- | --- |
| `btc` | Bitcoin | Base58Check (`1…`, `3…`) or bech32/bech32m (`bc1…`) |
| `ltc` | Litecoin | Base58Check (`L…`, `M…`, `3…`) or bech32/bech32m (`ltc1…`) |
| `eth`, `usdceth` | Ethereum | `0x` plus 40 hex characters; mixed case must satisfy EIP-55 |
| `sol`, `usdcsol` | Solana | Base58 that decodes to 32 bytes |

Bech32 addresses are checksum-verified, and version 0 witness programs must use
bech32 while version 1 and above must use bech32m. A Litecoin address in a Bitcoin
variable, or a broken EIP-55 checksum, is rejected rather than accepted.

Validation only proves the string is well formed for that network. It cannot prove
you own the address, and it cannot prove that a particular wallet or exchange
supports receiving a specific token on that network. USDC on Ethereum and USDC on
Solana are different networks with different addresses.

### `config.json`

Copy the optional example to customize text, payment methods, or commands.

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

`{displayName}` and `{amount}` are replaced at runtime. Omitted keys fall back to
the defaults shown in `config.example.json`. `config.json` is git-ignored because
it holds personal text. Text is measured against Discord's embed limits after
substitution, so an oversized message is reported at startup.

#### Add a payment method

The `paymentMethods` array adds choices to `/pay`. Fill in your own public
recipient details. This example uses a fictional service and identifier.

```json
{
  "paymentMethods": [
    {
      "id": "EXAMPLE-PAY",
      "displayName": "Example payment service",
      "symbol": "USD",
      "network": "Example service",
      "recipient": "ExampleRecipient",
      "instructions": "Include the invoice reference."
    }
  ]
}
```

Methods like this show the identifier exactly as configured and ask the reader
to verify it manually. For a blockchain address, set `addressFormat` to
`btc`, `ltc`, `eth`, or `sol` to check its format. Add `qr: true` to allow
address QR codes when `PAYMENT_QR_ENABLED` is also true.

Conversion requires a matching asset, network, and `addressFormat`. For example,
an ETH entry uses `symbol: "ETH"`, `network: "Ethereum"`, `addressFormat: "eth"`,
and `priceId: "ethereum"`. The other pairs use the network names in the address
table and CoinGecko IDs `bitcoin`, `litecoin`, `solana`, or `usd-coin`. For USDC,
use `Ethereum (ERC-20)` with `eth` or `Solana (SPL)` with `sol`. Optional
`decimals` can reduce the precision shown in estimates. Discord allows 25
`/pay` choices, including configured built-in methods.

#### Add a custom command

Add entries to `customCommands` for commands such as `/terms`, `/links`,
or `/rules`. Each needs a unique lowercase command name, a Discord description,
and embed content.

```json
{
  "customCommands": [
    {
      "name": "rules",
      "description": "Share the trade rules.",
      "title": "{displayName} trade rules",
      "body": "**Deal reference** {reference}",
      "fields": [{ "name": "Before payment", "value": "Confirm the network." }],
      "links": [{ "label": "Full rules", "url": "https://example.invalid/rules" }],
      "options": [{ "name": "reference", "description": "Deal reference", "maxLength": 24 }]
    }
  ]
}
```

Embed content can include an optional `color` and `footer`. Templates in titles,
bodies, fields, and footers accept `{displayName}` and the names of up to five
optional plain-text parameters. An omitted parameter displays an em dash. Links
use full HTTP or HTTPS URLs. If you use `ENABLED_COMMANDS`, include the custom
command names you want to register. Discord allows 100 enabled slash commands per
application.

## Installation and startup

```bash
npm ci
# copy .env.example to .env and fill it in
npm run register          # once, and again whenever commands change
npm start
```

`register` and `start` are different steps:

- `register` uploads the slash command definitions to Discord. Run it once after
  configuring, and again after changing command names, options, or the list of
  configured payment methods.
- `start` connects the application to Discord and answers commands. It must keep
  running.

Global command updates can take up to an hour to appear in Discord. If a command is
missing, re-run `register`, wait, and restart your Discord client.

### Windows

After `npm install` and a filled-in `.env`, double-click `start-dealassistant.bat`.
It checks the Node.js version, installs dependencies if they are missing, and
starts the app.

### Linux and VPS

Run the service as a dedicated unprivileged account rather than root:

```bash
sudo useradd --system --home /opt/DealAssistant --shell /usr/sbin/nologin dealassistant
sudo mkdir -p /opt/DealAssistant
sudo chown -R dealassistant:dealassistant /opt/DealAssistant

# place the project in /opt/DealAssistant, then
cd /opt/DealAssistant
sudo -u dealassistant npm ci --omit=dev
sudo -u dealassistant npm run register

# the .env file holds a bot token, so restrict it to the service account
sudo chown dealassistant:dealassistant /opt/DealAssistant/.env
sudo chmod 600 /opt/DealAssistant/.env
```

```ini
[Unit]
Description=DealAssistant
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=dealassistant
Group=dealassistant
WorkingDirectory=/opt/DealAssistant
ExecStart=/usr/bin/node src/index.js
EnvironmentFile=/opt/DealAssistant/.env
Restart=on-failure
RestartSec=5

# the process needs no write access and no extra privileges
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=true
LockPersonality=true
UMask=0077

[Install]
WantedBy=multi-user.target
```

`pm2 start src/index.js --name dealassistant` also works if you prefer a process
manager.

## Security

- The bot token is a credential. `.env` is git-ignored; never commit or share it.
- Only `DISCORD_OWNER_ID` may run commands. The check is centralised in
  `src/auth.js` and applies to every interaction type.
- The app requests no privileged intents and no bot permissions. It only needs the
  `applications.commands` scope.
- Nothing is stored: no database, no message content, no logging of addresses or
  users.
- Logs are filtered for tokens, webhook URLs and bearer headers before anything is
  written.
- Do not paste seed phrases or private keys into `.env`, `config.json`, or chat.

## Troubleshooting

**Commands do not appear.** Run `npm run register` again. Global commands can take
up to an hour. Confirm you installed the app to your own account ("Add to my
apps"), and that `DISCORD_CLIENT_ID` belongs to the same application as the token.
Restart the Discord client.

**Startup stops with a configuration error.** The message names the variable. An
invalid address, a malformed URL, an oversized embed text, or a missing owner ID all
stop startup on purpose. Fix the value and start again.

**`Invalid token` on startup.** The token was copied incorrectly or was reset.
Generate a new one on the Bot page and update `DISCORD_TOKEN`.

**"This application is private" reply.** The account you are using is not
`DISCORD_OWNER_ID`. Copy your own user ID again — it is not the application ID.

**A command is missing.** Its address is not configured, or `ENABLED_COMMANDS`
excludes it. The startup log lists disabled commands with the reason.

**A command replies that it is unavailable.** The registered command no longer
exists in this configuration. Re-run `npm run register`.

**Replies only appear to you in a server.** Check whether your role can use
external apps publicly in that channel.

**The rate shows as unavailable.** CoinGecko was unreachable or rate limited. The
address is still returned. Requests are not retried to avoid worsening a rate
limit.

**`config.json could not be parsed`.** The file is not valid JSON — check trailing
commas and unescaped quotes.

## Tests

```bash
npm test
```

The suite runs offline: Discord interactions and the price API are mocked. It covers
address validation for every supported network, deferred acknowledgements, rate
timeouts and fallbacks, embed limits, owner-only authorisation, log redaction, and
configuration failures. GitHub Actions runs it on Node.js 22 and 24 and audits
production dependencies on every push and pull request.

Live Discord integration is not part of the test suite; it requires a separate
application and token.

## License

MIT. See [LICENSE](LICENSE). Address encoding uses [@scure/base](https://github.com/paulmillr/scure-base)
and [js-sha3](https://github.com/emn178/js-sha3). Address QR images use
[qr](https://github.com/paulmillr/qr), available under MIT or Apache-2.0.
