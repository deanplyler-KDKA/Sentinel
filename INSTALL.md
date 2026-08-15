# Installing Sentinel

Sentinel shows you, in one place, whether your PC's protection is working: antivirus,
firewall, encryption, updates, storage, and internet speed. It **watches** — it never
changes your settings, and it isn't antivirus itself. Windows Defender keeps doing that
job; Sentinel just tells you whether it's actually switched on.

## What you need

- Windows 10 or 11 (64-bit)
- No administrator password required
- Nothing else — no account, no sign-up

## Installing

1. Run **`Sentinel_0.3.0_x64-setup.exe`**.

2. **Windows will show a blue "Windows protected your PC" warning.** This is expected
   and does not mean anything is wrong. It appears because the installer isn't signed
   with a paid certificate — Windows shows this for any small developer's app.

   Click **More info**, then **Run anyway**.

   *(If you'd rather not trust that on my say-so, that's a completely reasonable
   instinct — it's the right instinct in general. Ask Dean before continuing.)*

3. The installer takes a few seconds and doesn't ask any questions. Sentinel opens when
   it's done, and afterwards you'll find it in the Start Menu.

## What it does the first time

Sentinel reads your security settings and gives you four scores plus a plain-English
list of anything worth fixing. Every suggestion explains *why* and gives you steps —
and where Windows owns the setting, a button that takes you straight to the right page.

It will probably suggest something on day one. That's normal, not alarming.

## Things worth knowing

- **Nothing leaves your PC.** No account, no telemetry, nothing uploaded. The only
  exception is the internet speed test, which measures your connection when you press
  the button (details in About → Privacy).
- **It only runs when you open it.** Nothing runs in the background, nothing starts
  with Windows, and closing the window stops it completely.
- **It changes nothing.** Sentinel has no ability to alter Windows settings. When
  something needs changing, it opens Windows' own settings page and you decide.
- **Uninstalling is clean.** Settings → Apps → Sentinel → Uninstall. Your security
  settings are untouched — verified before every release.

## If something looks wrong

- **A card says "Unavailable" or "Unknown"** — Sentinel couldn't read that item on your
  hardware. It says so honestly rather than guessing. Not a problem with your PC.
- **The speed test fails** — try again in a minute, or switch the service dropdown on
  the Network page from Cloudflare to M-Lab.
- **Anything else** — Settings → Export diagnostics writes a log file to your Downloads
  folder. Send that to Dean.
