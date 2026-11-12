# App Store listing (version 1.0)

The text entered in App Store Connect, kept here so a change is reviewed like code. English is the primary
language; Spanish is the second localization. Limits: subtitle 30, promotional text 170, keywords 100,
description 4000 characters.

## English (U.S.)

**Name:** Agents Pocket

**Subtitle:** Coding agents in your pocket

**Promotional text:**
Check on your coding agents from anywhere: read the conversation, answer a question, approve a step, or open the terminal. Free and open source.

**Keywords:**
ssh,terminal,agents,ai,coding,herdr,remote,developer,approve,cli,shell,server,devops,mac,linux

**Description:**

Agents Pocket is the phone companion for herdr, the console that runs your AI coding agents on your own Mac or Linux computer. Leave the agents working at your desk and keep up with them from your pocket.

SEE EVERY AGENT AT A GLANCE
• One Home for all your Hosts: which agents are working, which are done, and which are waiting for you.
• A notification and a Live Activity when an agent needs you or finishes.

READ AND REPLY LIKE A CHAT
• Each agent's conversation as a clean chat: messages, tool calls, results and reasoning.
• Type or dictate a reply, attach a photo or a file, and send it to the agent.
• Per-agent shortcuts for its keys and slash commands.

ANSWER WHEN AN AGENT IS BLOCKED
• When an agent stops to ask for approval or to ask a question, the prompt shows as a card with its own options.
• The app reads the prompt again before it answers, so your tap never lands on a prompt you did not see.

A REAL TERMINAL WHEN YOU NEED IT
• Attach to the agent's terminal with a full keyboard row, scrollback, and themes.
• Browse changed files and diffs, open files, and see forwarded ports.

YOUR USAGE LIMITS
• See how much of each agent's plan limits you have used and when they reset.

PRIVATE BY DESIGN
• The app connects straight to your computer over SSH. There is no account and no server of ours between you and your agents.
• SSH keys stay in the device keychain and can require Face ID.
• Notifications are encrypted on your computer; the push relay forwards them without being able to read them. You can run your own relay.
• Free and open source (MIT).

WORKS WITH
Claude Code, Codex, OpenCode, Hermes Agent, Grok and Oh My Pi, running under herdr. Support depends on each program's version; some features are available only for some programs.

WHAT YOU NEED
• A Mac or Linux computer with herdr installed and SSH turned on.
• The phone must be able to reach that computer: the same network, or a private network such as Tailscale.
• The in-app Setup Guide walks you through pairing with a QR code.

No computer at hand? Tap "Try the Demo" on the first screen to explore the app with sample data.

Agents Pocket is an independent project. Product names are trademarks of their owners and are used only to say what the app works with.

## Spanish (Mexico)

**Subtitle:** Tus agentes, en el bolsillo

**Promotional text:**
Seguí a tus agentes de código desde cualquier lugar: leé la conversación, respondé una pregunta, aprobá un paso o abrí la terminal. Gratis y de código abierto.

**Keywords:**
ssh,terminal,agentes,ia,código,herdr,remoto,desarrollador,aprobar,cli,shell,servidor,devops,linux

**Description:**

Agents Pocket es el compañero móvil de herdr, la consola que corre tus agentes de código con IA en tu propia computadora Mac o Linux. Dejá a los agentes trabajando en tu escritorio y seguilos desde el bolsillo.

TODOS TUS AGENTES DE UN VISTAZO
• Un Home para todos tus Hosts: qué agentes están trabajando, cuáles terminaron y cuáles te esperan.
• Una notificación y una Live Activity cuando un agente te necesita o termina.

LEÉ Y RESPONDÉ COMO EN UN CHAT
• La conversación de cada agente como un chat limpio: mensajes, llamadas a herramientas, resultados y razonamiento.
• Escribí o dictá una respuesta, adjuntá una foto o un archivo y enviásela al agente.
• Atajos por agente para sus teclas y comandos.

RESPONDÉ CUANDO UN AGENTE SE BLOQUEA
• Cuando un agente se detiene para pedir aprobación o hacer una pregunta, el aviso aparece como una tarjeta con sus opciones.
• La app vuelve a leer el aviso antes de responder, así tu toque nunca cae en un aviso que no viste.

UNA TERMINAL DE VERDAD CUANDO HACE FALTA
• Conectate a la terminal del agente con fila de teclas, historial y temas.
• Mirá los archivos cambiados y sus diffs, abrí archivos y revisá los puertos.

TUS LÍMITES DE USO
• Mirá cuánto usaste de los límites del plan de cada agente y cuándo se reinician.

PRIVADA POR DISEÑO
• La app se conecta directo a tu computadora por SSH. No hay cuenta ni un servidor nuestro entre vos y tus agentes.
• Las claves SSH quedan en el llavero del dispositivo y pueden pedir Face ID.
• Las notificaciones se cifran en tu computadora; el relay de push las reenvía sin poder leerlas. Podés usar tu propio relay.
• Gratis y de código abierto (MIT).

FUNCIONA CON
Claude Code, Codex, OpenCode, Hermes Agent, Grok y Oh My Pi, corriendo bajo herdr. El soporte depende de la versión de cada programa; algunas funciones están disponibles solo para algunos programas.

QUÉ NECESITÁS
• Una computadora Mac o Linux con herdr instalado y SSH activado.
• El teléfono tiene que poder llegar a esa computadora: la misma red, o una red privada como Tailscale.
• La Guía de instalación de la app te acompaña en la vinculación con un código QR.

¿No tenés una computadora a mano? Tocá "Probar la demo" en la primera pantalla para explorar la app con datos de ejemplo.

Agents Pocket es un proyecto independiente. Los nombres de productos son marcas de sus dueños y se usan solo para decir con qué funciona la app.

## Notes for App Review

Agents Pocket is a companion for herdr (https://herdr.dev), an open-source console that runs AI coding agents on the user's own Mac or Linux computer. The app connects to that computer over SSH, like other SSH clients on the App Store; it does not download or run code on the device. There is no account and no sign-in.

HOW TO REVIEW WITHOUT A COMPUTER
1. Open the app. The first screen says there are no Hosts.
2. Tap "Try the Demo". The app fills with sample Hosts and Agents; a "Demo Mode" notice on Home says the data is sample data.
3. Tap an Agent to see its conversation (Chat), the composer, the terminal view and the menus. Home also shows Usage, the Board and Settings.
4. "Leave Demo" on the Home notice (or Settings > General > Demo Mode) returns to the empty first screen.
Demo Mode uses built-in sample data and connects to no computer.

WITH A REAL COMPUTER (optional)
Settings > Setup Guide lists the steps: install herdr on a Mac or Linux computer, turn on SSH (Remote Login), run the install command shown there, and scan the QR code herdr shows.

PERMISSIONS
• Camera: only to scan the pairing QR code.
• Microphone and Speech Recognition: only for dictation in the message composer.
• Face ID: optional app lock and SSH key protection.
• Local Network: to reach the user's computer over SSH on the same network.
• Photo Library: the system picker, to attach a photo to a message.
• Notifications and Live Activities: optional; sent by a plugin on the user's computer through a push relay, encrypted end to end.

ENCRYPTION
The app uses standard algorithms only (SSH through libssh2 and OpenSSL, AES-GCM for notification payloads). It is not distributed in France.

The app is free and open source: https://github.com/openagentspocket/openagentspocket
