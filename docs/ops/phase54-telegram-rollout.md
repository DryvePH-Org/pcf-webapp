# Phase 54: asking for a budget by Telegram

A requester sends a **voice message** to the company's Telegram bot, checks the summary the bot sends back,
corrects it if needed and taps **Submit**. It becomes an ordinary budget request made by that person, under
exactly the same rules as one made on the website (limits, the approver step, repeat protection). When the
custodian answers, the bot tells the requester on Telegram.

## 1. Create the bot (once, about 3 minutes)

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Give it a name people will recognise (for example "DRYVE Petty Cash") and a username ending in `bot`
   (for example `dryve_pcf_bot`).
3. BotFather replies with a **token**. Treat it like a password: do not paste it in chat, email or the repository.
4. Optional, still in BotFather: `/setdescription`, `/setuserpic`, and `/setcommands` with
   `help - Paano gamitin` and `cancel - Kanselahin ang request`.

## 2. Put the settings on the server

Add these lines to `/opt/pcf/.env.runtime` on the server (over `ssh root@76.13.221.143`):

```
TELEGRAM_BOT_TOKEN=<the token from BotFather>
TELEGRAM_WEBHOOK_SECRET=<a long random secret: run  openssl rand -hex 24  and use the result>
TELEGRAM_BOT_USERNAME=budgetReqBot   # optional: the app asks Telegram for the real name
ELEVENLABS_API_KEY=<your ElevenLabs key>
```

`GROQ_API_KEY` stays as it is: it reads the amount and the reason out of the sentence, and is the fallback if
ElevenLabs is down. `ELEVENLABS_STT_MODEL` is optional (the default is `scribe_v2`).

Then restart only the app:

```
cd /opt/pcf && docker compose -f compose.yml -f compose.proxy.yml up -d --no-deps --force-recreate app
```

## 3. Connect it and link people (in the app, as an administrator)

1. **Administration -> Telegram -> Connect the bot to this site.** This tells Telegram where to send messages.
2. For each person who will use it, press **Make link** and send them the link (WhatsApp, Messenger, SMS).
   They tap it once and Telegram opens the bot. The link works one time and expires in 7 days.
3. **Unlink** removes a person at any time. A person who is not linked gets nothing from the bot.

## What the requester does

- Send a voice message: "Kailangan ko ng dalawang libo para sa gasolina ng service."
- Check the summary. Tap **Palitan ang halaga / dahilan / fund** to correct it (by voice or typing).
- Tap **Submit**.

## Safety and privacy

- Nothing is submitted without the requester tapping Submit.
- Only the person an administrator linked can use their chat; groups are ignored.
- Telegram's address on this site only accepts messages that carry the secret above.
- The voice recording is read by ElevenLabs (and Groq as the fallback) and by Telegram. Bots' messages are not
  end-to-end encrypted, so do not use this for anything secret. The recording is not kept by the app; what was
  said (the text) is kept with the request's draft so a request can be checked later.
- If the token ever leaks: in BotFather send `/revoke`, put the new token on the server, restart, and press
  **Connect the bot** again.

## Testing it without Telegram

`e2e/telegram.spec.ts` runs the whole conversation against a stand-in for Telegram, ElevenLabs and Groq, with a
real app and database. Start the app with `TELEGRAM_API_BASE`, `ELEVENLABS_API_BASE` and `GROQ_API_BASE` pointing
at `http://127.0.0.1:3399` and test keys, then run it with `E2E_AUTHENTICATED=true`.
