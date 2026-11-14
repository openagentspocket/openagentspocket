// The app's privacy policy, served by the relay at GET /privacy so the App
// Store listing links to the same origin that handles notifications. One
// source of truth: change the policy here. The contact address comes from
// the PRIVACY_CONTACT var, so it is set at deploy time, not committed.

const UPDATED = "2026-11-14";
const APP_NAME = "Agents Pocket";

/** @param {string} contact */
function englishPolicy(contact) {
  return `
<h1>${APP_NAME} — Privacy Policy</h1>
<p class="updated">Last updated ${UPDATED}</p>
<p>${APP_NAME} is an app for watching and answering coding agents that run
on computers you own. It has no accounts, no ads, no analytics and no
tracking. The developer does not keep or sell personal data. The only app data
that passes through the developer's servers is what the notification relay
needs to deliver a notification (see Notifications) and what the app sends when
it checks for updates to itself (see App updates).</p>
<h2>What stays on your device</h2>
<ul>
<li>Your Hosts, settings and SSH keys. Private keys stay in the device's secure
storage (iOS Keychain, Android Keystore) and never leave the device.</li>
<li>The camera is used only to scan a Pairing Code; images are not stored or
sent.</li>
</ul>
<h2>What goes to your own computers</h2>
<p>The app connects over SSH directly to the Hosts you add, to show your
agents, terminals, files and usage. That data travels between your devices
and is not seen by the developer.</p>
<h2>Notifications</h2>
<p>When you turn on notifications, the herdr plugin on your Host encrypts each
notification with a key only your devices hold and sends it through a relay
to Apple Push Notification service or Firebase Cloud Messaging. The relay keeps no history and cannot read
the notification. It handles, only to deliver it: your device's push token,
the encrypted message, the request's IP address and timing, and, for Live
Activities, agent counts. To limit abuse it counts requests per IP address
and per push token in memory, for at most a minute. By default the app uses
the relay the developer runs on Cloudflare Workers; you can set a relay you
run yourself in the app's notification settings instead.</p>
<h2>App updates</h2>
<p>Official builds of the app can receive updates to their own JavaScript code
from the update server the developer runs on Cloudflare. At each launch the
app asks that server whether an update exists. The request carries your IP
address, the platform, the app's version identifiers, the identifier of the
update the app is running, a random identifier the update library creates when
the app is installed and, if an update failed or the app crashed since the last
check, a summary of the error. The server uses this only to answer the request
and does not log or store any of it. Updates are signed by the developer and the
app refuses any update that is not. They carry fixes and polish to features
already in the app, not new data flows. No content from your Hosts, sessions or
messages is sent to the update server. A build you make from the source code
has updates turned off.</p>
<h2>Children</h2>
<p>The app is a developer tool and is not directed at children.</p>
<h2>Changes and contact</h2>
<p>Changes to this policy appear on this page with a new date. Questions:
<a href="mailto:${contact}">${contact}</a>.</p>`;
}

/** @param {string} contact */
function spanishPolicy(contact) {
  return `
<h1>${APP_NAME} — Política de privacidad</h1>
<p class="updated">Última actualización ${UPDATED}</p>
<p>${APP_NAME} es una app para seguir y responder a agentes de
programación que corren en computadoras tuyas. No tiene cuentas, publicidad,
analítica ni rastreo. El desarrollador no guarda ni vende datos
personales. De los datos de la app, lo único que pasa por los servidores del desarrollador es lo que
el relay de notificaciones necesita para entregar una notificación (ver
Notificaciones) y lo que la app envía cuando busca actualizaciones de sí misma
(ver Actualizaciones de la app).</p>
<h2>Lo que queda en tu dispositivo</h2>
<ul>
<li>Tus Hosts, ajustes y claves SSH. Las claves privadas quedan en el
almacenamiento seguro del dispositivo (Llavero de iOS, Keystore de Android) y
nunca salen de él.</li>
<li>La cámara se usa solo para escanear un código de vinculación; las imágenes
no se guardan ni se envían.</li>
</ul>
<h2>Lo que va a tus propias computadoras</h2>
<p>La app se conecta por SSH directamente a los Hosts que agregás, para
mostrar tus agentes, terminales, archivos y uso. Esos datos viajan entre tus
dispositivos y el desarrollador no los ve.</p>
<h2>Notificaciones</h2>
<p>Si activás las notificaciones, el plugin de herdr en tu Host cifra cada
notificación con una clave que solo tienen tus dispositivos y la envía, a
través de un relay, al servicio de notificaciones push de Apple o a Firebase Cloud Messaging. El relay no
guarda historial y no puede leer la notificación. Para entregarla maneja
solamente: el token push de tu dispositivo, el mensaje cifrado, la dirección
IP y el horario del pedido y, para las Live Activities, la cantidad de
agentes. Para limitar abusos cuenta los pedidos por dirección IP y por token
push en memoria, durante un minuto como máximo. Por defecto la app usa el
relay que el desarrollador corre en Cloudflare Workers; en los ajustes de
notificaciones de la app podés poner en su lugar un relay que corras vos.</p>
<h2>Actualizaciones de la app</h2>
<p>Las versiones oficiales de la app pueden recibir actualizaciones de su propio
código JavaScript desde el servidor de actualizaciones que el desarrollador
corre en Cloudflare. En cada inicio, la app le pregunta a ese servidor si hay
una actualización. El pedido incluye tu dirección IP, la plataforma, los
identificadores de versión de la app, el identificador de la actualización que
está corriendo, un identificador aleatorio que la biblioteca de actualizaciones
crea al instalar la app y, si una actualización falló o la app se cerró por un
error desde la última consulta, un resumen del error. El servidor lo usa solo
para responder el pedido y no registra ni guarda nada de eso. Las
actualizaciones están firmadas por el desarrollador y la app rechaza cualquiera
que no lo esté. Traen correcciones y mejoras de funciones que la app ya tiene,
no flujos de datos nuevos. Nada del contenido de tus Hosts, sesiones o mensajes
se envía al servidor de actualizaciones. Una versión que compilás vos desde el
código fuente tiene las actualizaciones desactivadas.</p>
<h2>Menores</h2>
<p>La app es una herramienta para desarrolladores y no está dirigida a
menores.</p>
<h2>Cambios y contacto</h2>
<p>Los cambios a esta política aparecen en esta página con una fecha nueva.
Consultas: <a href="mailto:${contact}">${contact}</a>.</p>`;
}

/**
 * The policy page, English then Spanish. Without PRIVACY_CONTACT the relay
 * answers 503 rather than publish a policy nobody can be reached through.
 *
 * @param {Record<string, string>} env
 * @returns {Response}
 */
export function privacyPage(env) {
  const contact = (env.PRIVACY_CONTACT ?? "").trim();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(contact)) {
    return new Response("privacy contact not configured\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP_NAME} — Privacy Policy</title>
<style>
body { font: 16px/1.55 -apple-system, system-ui, sans-serif; max-width: 42rem;
  margin: 2rem auto; padding: 0 1.25rem; color: #1f1b16; background: #f2ede2; }
h1 { font-size: 1.6rem; } h2 { font-size: 1.15rem; margin-top: 1.6rem; }
.updated { color: #635c50; } hr { margin: 3rem 0; border: 0; border-top: 1px solid #e0d9cb; }
a { color: #13801a; }
</style>
</head>
<body>
${englishPolicy(contact)}
<hr>
<section lang="es">
${spanishPolicy(contact)}
</section>
</body>
</html>
`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
