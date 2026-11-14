<div align="center">

# MORU Client

### Your Minecraft. Your Profiles.

A Windows desktop launcher for Minecraft: Java Edition,
with version profiles and integrated mod discovery.

![Platform](https://img.shields.io/badge/Platform-Windows_11-0078D4?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?style=flat-square)
![React](https://img.shields.io/badge/React-UI-61DAFB?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-Code-3178C6?style=flat-square)

</div>

---

## About MORU

MORU is an independent Minecraft: Java Edition launcher project
focused on managing game profiles and mods through a simple desktop interface.

The application supports Korean and English, with a dark interface
and emerald accents.

## Current Features

| Feature | Description |
|---|---|
| Game profiles | Create, select, save, and delete launcher profiles |
| Release catalog | Load official Minecraft release versions from Mojang |
| Loader selection | Choose Vanilla or Fabric where supported |
| Mod discovery | Browse recommendations and search Modrinth |
| Profile-based downloads | Download compatible mods into separate profile folders |
| Required dependencies | Resolve required Modrinth dependencies during installation |
| File verification | Verify downloaded mod files using SHA-512 |
| Languages | Korean and English |
| Custom fonts | Select and save a local TTF font for the launcher |

## Microsoft Account Integration

MORU implements Microsoft OAuth 2.0 Authorization Code Flow
with PKCE through the system browser.

The authentication flow is:

Microsoft → Xbox Live → XSTS → Minecraft Services

Minecraft Services access approval is currently pending.
Full Minecraft account verification is not yet available
for this application ID.

Once access is approved, the implemented flow is intended to:

- Verify Minecraft: Java Edition entitlement.
- Retrieve the authenticated player's Minecraft profile.
- Display the player's nickname and skin face.
- Restore and refresh the saved session.
- Allow the user to sign out of MORU.

Authentication tokens remain in the Electron main process.
The Microsoft token cache is encrypted using Electron safeStorage,
backed by Windows DPAPI on Windows.

Tokens are not exposed to the renderer or stored in localStorage.
MORU does not collect Microsoft account passwords.

## Planned Work

- Minecraft game installation and launching.
- Java runtime management.
- Fabric loader installation.
- Additional installed-mod management tools.

## Development

MORU uses Electron, React, TypeScript, and electron-vite.

Install dependencies:

```bash
npm install
