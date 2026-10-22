# ServiMatch · Render + Turso

Paquete independiente de Node.js 24, HTML, CSS y JavaScript, con base remota Turso libSQL. Incluye login con correo/contraseña, clientes, administración, profesionales por especialidad, sesiones y modo oscuro. No depende de ChatGPT, Cloudflare Workers ni Docker para publicarse.

## 1. Crear la base en Turso

En tu panel de Turso crea una base llamada `servimatch`. Selecciona el motor **libSQL** si se ofrece elegir entre Turso y libSQL. Este paquete usa `@libsql/client`, no el motor Turso nuevo. No es necesario crear tablas manualmente: el servidor aplica las migraciones SQL al arrancar.

Dentro de esa base busca la URL de conexión y genera un token de acceso de la base con permisos de lectura y escritura. Conserva ambos de forma privada. No uses un token de administración de toda tu cuenta.

Necesitarás estos valores al crear el servicio en Render:

- `TURSO_DATABASE_URL`: URL real de esa base (normalmente `libsql://...turso.io`).
- `TURSO_AUTH_TOKEN`: token de esa base, nunca en el código ni en el navegador.

Si usas la CLI de Turso en Mac, Linux o WSL, los comandos equivalentes son:

```sh
turso auth login
turso db create servimatch
turso db show servimatch --url
turso db tokens create servimatch
```

Omitir `--tursodb` crea una base libSQL. Los dos últimos comandos muestran valores que debes guardar en Render, no en el repositorio.

## 2. Generar la clave de configuración inicial

En PowerShell ejecuta:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado de 64 caracteres y guárdalo en un lugar privado. Lo usarás como variable `ADMIN_SETUP_TOKEN` de Render y para abrir una única vez el formulario que crea al administrador. No es la contraseña del administrador y no se envía por chat.

## 3. Subir el código a GitHub

Crea un repositorio llamado `servimatch` (puede ser privado). Extrae este ZIP. Sube el CONTENIDO de la carpeta `servimatch-render`, de forma que `package.json`, `package-lock.json` y `server.mjs` queden directamente en la raíz del repositorio. No subas el ZIP como único archivo.

Puedes usar GitHub → Add file → Upload files o Git. Este paquete incluye `.gitignore`.

No subas `.env`, tokens, `node_modules` ni la base de datos de tu computadora. `.env.example` sí se puede subir: solo contiene marcadores de posición.

## 4. Crear el servicio web en Render

En Render: New → Web Service → conecta GitHub → elige tu repositorio.

Configura:

| Campo | Valor |
|---|---|
| Runtime / Language | Node |
| Branch | La rama donde subiste los archivos, normalmente main |
| Root Directory | Vacío si package.json está en la raíz |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

En Environment Variables agrega:

| Nombre | Valor |
|---|---|
| `NODE_VERSION` | `24.19.0` |
| `NODE_ENV` | `production` |
| `TURSO_DATABASE_URL` | La URL real de tu base de Turso |
| `TURSO_AUTH_TOKEN` | El token de acceso de esa base |
| `ADMIN_SETUP_TOKEN` | La cadena aleatoria de 64 caracteres generada en el paso 2 |

Render proporciona automáticamente `PORT` y `RENDER_EXTERNAL_URL`; no los inventes. La app escucha en 0.0.0.0 y usa esa URL HTTPS para validar el origen y emitir cookies seguras. Si más adelante usas un dominio propio, configura `PUBLIC_URL` con el origen HTTPS exacto de ese dominio.

Pulsa Create Web Service y espera a que el despliegue quede activo. Si las credenciales son correctas, el servidor crea las tablas de forma incremental y el log muestra “ServiMatch listo”. Si el despliegue falla, revisa los logs y comparte solo el mensaje de error, ocultando tokens.

También hay un `render.yaml` para usar Blueprints. La configuración manual anterior es la ruta recomendada para esta primera prueba; no crees ambos servicios a la vez.

## 5. Crear el administrador online

Copia la URL HTTPS que Render asigne realmente. En tu navegador abre:

```text
https://TU-URL-REAL.onrender.com/?setup=TU_ADMIN_SETUP_TOKEN
```

Reemplaza ambos marcadores por tus valores reales. La app abre “Configura tu administrador”. Escribe tu nombre, el correo que usarás para entrar, una contraseña de al menos 15 caracteres y su confirmación. Pulsa Crear acceso de administrador.

El token de configuración se consume lógicamente: después de existir un administrador con contraseña, ya no permite crear otro. El correo y la contraseña de ServiMatch son los que acabas de elegir. El formulario no los sustituye por credenciales de otro servicio.

A partir de entonces comparte únicamente la URL normal, sin `?setup=...`. No compartas el enlace inicial de configuración.

## 6. Probar en teléfonos

- Registro: pulsa “Crear una cuenta” y elige “Necesito un servicio” o “Quiero ofrecer mis servicios”.
- Cliente: crea su cuenta y solicita un servicio.
- Profesional: registra correo, contraseña, especialidad, zona, experiencia, descripción y tarifa. Su cuenta queda pendiente de revisión y todavía no puede recibir trabajos.
- Administrador: abre “Postulaciones”, revisa el perfil y aprueba o rechaza indicando el motivo. El profesional puede corregir y reenviar una solicitud rechazada.
- El administrador también puede registrar profesionales directamente con contraseña temporal.
- Administrador: asigna la solicitud al profesional correspondiente.
- Profesional aprobado: inicia sesión con su correo/contraseña y gestiona los servicios de su especialidad. Solo los creados con clave temporal deben cambiarla al entrar.
- Comprueba cerrar sesión e ingresar otra vez. Prueba el selector claro/oscuro.
- Android: Chrome → menú → Instalar app o Agregar a pantalla principal.
- iPhone: Safari → Compartir → Agregar a pantalla de inicio.

Todos deben usar la misma URL de Render. Los usuarios y solicitudes online se guardan en Turso, no en el disco temporal de Render, y tu computadora puede estar apagada.

## Datos y límites de esta primera publicación

Esta instalación comienza con una base nueva. No importa automáticamente tu `.local-state/servimatch.sqlite` ni los datos del alojamiento anterior. Conserva una copia de tu base local si más adelante quieres migrar esos datos.

Usa los planes gratuitos para esta prueba temporal, dentro de sus cuotas. Render Free se suspende tras 15 minutos sin tráfico y puede tardar alrededor de un minuto en volver a iniciar. Revisa la caducidad del token de Turso para renovarlo en Render cuando corresponda. No hay envío de correos de recuperación ni pagos en esta entrega.

## Verificación y desarrollo

```sh
npm ci
npm test
```

Las pruebas usan el mismo conector libSQL con una base local temporal para verificar migraciones, persistencia, registro, permisos, especialidades y sesiones. También verifican el servidor HTTP, las cookies Secure detrás del proxy HTTPS, el cierre de sesión repetido y la preferencia de tema. No usan credenciales ni una base real de tu cuenta de Turso.

Para ejecutar contra tu Turso desde tu computadora, copia `.env.example` a `.env`, coloca allí los valores reales y usa `PUBLIC_URL=http://127.0.0.1:3000` y `NODE_ENV=development`. Después `npm start`. Esto sí escribe en la base remota que configures; usa una base de prueba separada si no quieres modificar los registros online.

## Estructura

- `server.mjs`: servidor independiente y límites del acceso HTTP.
- `lib/database.mjs`: conector Turso/libSQL y migraciones incrementales.
- `lib/auth.mjs`: contraseñas scrypt, sesiones, alta y cierre de sesión.
- `lib/service-api.mjs`: permisos y operaciones del servicio.
- `public/`: interfaz responsive, PWA y modo oscuro.
- `migrations/`: esquema de datos, aplicado en orden al arrancar.
- `tests/`: verificación automatizada.

La publicación real y la conexión a tu cuenta se verifican después de configurar las variables y desplegar en Render. Este ZIP no está publicado ni conectado a tus cuentas todavía.

## Colores de estado y campos en celulares

- Profesional activo/disponible: verde. No disponible: gris. En servicio: naranja, calculado cuando tiene un trabajo en curso. Esto representa disponibilidad del profesional, no presencia en línea ni que la app esté abierta.
- Solicitud pendiente: amarillo; asignada: violeta; confirmada: azul; en curso: naranja; completada: verde; cancelada: rojo. Cada indicador conserva su texto para no depender solamente del color.
- Los colores se ajustan al modo oscuro.
- Los campos de formulario y búsqueda usan 16px en pantallas móviles y dispositivos táctiles para evitar el motivo habitual del zoom al enfocar campos. No se bloquea el zoom manual. Falta comprobar el comportamiento en el teléfono concreto del usuario.

## Actualizar tu despliegue existente

El logo original está integrado en el acceso, el encabezado y los iconos de instalación. El registro permite elegir cliente o profesional; los profesionales nuevos requieren aprobación administrativa.

1. Extrae el ZIP y abre `servimatch-render`.
2. Sube el contenido actualizado a la raíz del mismo repositorio de GitHub. Incluye completas las carpetas `public/`, `lib/` y `migrations/`, además de los archivos de la raíz. No subas una carpeta adicional por encima de `package.json`.
3. No omitas `lib/professional.mjs` ni `migrations/0002_professional_applications.sql`. Conserva las migraciones anteriores sin modificarlas.
4. En Render selecciona **Manual Deploy → Deploy latest commit**.
5. Abre la app, crea una postulación de prueba y entra como administrador en **Postulaciones** para revisarla.

El servidor aplica automáticamente la nueva migración al iniciar. Los profesionales existentes permanecen aprobados y la base de Turso se conserva. No cambies las variables de entorno ni vuelvas a crear al administrador.

Las pruebas incluyen rechazo con motivo, corrección y reenvío, aprobación, bloqueo de cuentas pendientes y conservación de los profesionales existentes durante la actualización.

## Foto de perfil y Premium demo

En Mi perfil se puede subir, cambiar o quitar una foto. La app recorta y comprime la imagen a JPEG de 256×256 antes de guardarla en Turso; se muestra en el perfil y el botón de cuenta.

La sección ServiMatch Premium sigue la referencia de $5.99/mes. El formulario es exclusivamente demostrativo: usa datos ficticios (por ejemplo, 4242 4242 4242 4242, 12/30 y 123). No se envían ni se almacenan datos de tarjeta; solo se guarda una fecha de activación demo de 30 días en la cuenta. Se puede cancelar; no hay cobros ni renovación automática. Visibilidad, estadísticas y otros beneficios se presentan como propuesta y no se habilitan en esta versión. Premium no evita la aprobación del profesional.

Para actualizar, sube también `server.mjs` y la carpeta completa `migrations/`, incluida `0003_profile_premium.sql`, además de `public/` y `lib/`. No modifiques las migraciones anteriores. Despliega el último commit en Render; no se requieren nuevas variables ni recrear cuentas.
