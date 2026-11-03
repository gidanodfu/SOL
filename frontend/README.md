# Frontend — Sistema de Empleo (React + Vite)

Cliente web de la plataforma de empleo MDJLO. Presentación únicamente: todo el negocio y
la autorización viven en el backend (`../backend`). Ver el
[`README.md`](../README.md) de la raíz para el contexto completo.

## Stack

- React 19 + Vite 8 · react-router-dom 7 · TanStack Query · Axios
- Node.js 22.23.4 (imagen fijada `node:22.23.4-alpine`); servidor de desarrollo Vite
- Iconos: Tabler Icons (`@tabler/icons-webfont`, CSS importado en `main.jsx`) y
  `lucide-react` · Tipografías Google (Inter, Sora; Playfair Display en el portal)

## Scripts

Todos los comandos se ejecutan dentro de Docker; no instale Node.js ni
`node_modules` en el host.

```bash
# desde la raíz del repositorio
./deploy/scripts/dev.sh up
./deploy/scripts/dev.sh deps
./deploy/scripts/dev.sh exec frontend npm run lint
./deploy/scripts/dev.sh build-frontend
./deploy/scripts/test.sh frontend     # tests + lint + build
```

El servidor de desarrollo (Vite) se inicia con `dev.sh up` en
`http://localhost:5173`, con recarga automática mediante los volúmenes de
`src/`, `public/`, `index.html`, `vite.config.js` y `package.json`.

`./deploy/scripts/test.sh frontend` ejecuta `npm test`, `npm run lint` y
`npm run build` dentro de Docker. La suite cubre, entre otros, versión y
`/about`, documentos legales, catálogo de ubicaciones, validaciones de
formularios, CV/rate limiting, oportunidades y reglas de postulaciones. Al
cierre de la versión 1.4.8 reporta **79/79 tests**, lint con **0 errores** y
build correcto. Los warnings de Oxlint son estáticos y no bloquean el build.

## Variables de entorno

La configuración pública se toma del `.env` de la **raíz** del repositorio (Vite usa
`envDir='..'`). En Docker, Compose inyecta solo las variables `VITE_*`; nunca se
monta el `.env` privado completo en el contenedor frontend.

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | Base del backend, p. ej. `http://localhost:8080` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID OAuth de Google (habilita el botón de Google) |
| `VITE_TURNSTILE_SITE_KEY` | Site key pública de Cloudflare Turnstile |

Las variables `VITE_*` se incorporan al bundle público. No incluya secretos del backend.

## Sesión, datos y errores

- `AuthContext` restaura la sesión con `GET /api/auth/me`, guarda los tokens en
  `localStorage`, renueva el access token con `/api/auth/refresh` y cierra
  sesión en el backend.
- `services/api.js` centraliza Axios con `baseURL=/api`, añade el Bearer y
  redirige a `/login` cuando la sesión expira.
- TanStack Query es la caché de datos de servidor. Las mutaciones invalidan las
  claves afectadas (por ejemplo, `oportunidades-publicas`, `cv`, `perfil-*` y
  las bandejas administrativas) para refrescar la vista sin polling.
- `utils.js` contiene `errorApi`, `esEnlaceSeguro`, helpers de fechas y
  descargas; las páginas muestran el `message` del backend y, cuando existe,
  `campos` para asociar el error al control.
- Las validaciones del frontend son de presentación y usabilidad. El backend
  revalida tipos, permisos, propiedad, unicidad y reglas de negocio; ninguna
  regla de seguridad depende del cliente.

## Versión y build

`vite.config.js` lee `../VERSION`, valida el formato con
`src/config/versionFormat.js` e inyecta `import.meta.env.VITE_SOL_VERSION`.
`src/config/version.js` transforma ese valor y `/about` lo muestra como
`X.Y.Z ESTABLE` o el canal correspondiente. `VERSION` es la única fuente; no se
edita la versión en `package.json`, `constants.js` ni componentes.

## Editor y temas

- El editor de texto enriquecido usa TiPTap y se carga de forma diferida; el
  HTML se sanea en backend y se renderiza con DOMPurify a través de
  `ContenidoEnriquecido`.
- `ThemeContext` aplica tema cromático, modo claro/oscuro/sistema, reducción de
  movimiento y alto contraste. Las preferencias se persisten por usuario en
  `ui_preferences` mediante `/api/cuenta/preferencias`.

## Estructura

```
src/
├── components/     UI compartida (UI, PageHeader, CvUploader, StatCard, GoogleButton,
│                   SeoMeta…)
├── context/        AuthContext y ThemeContext (sesión, tema y preferencias)
├── hooks/          useAccion, useClickFuera, usePermisosMunicipales,
│                   useSidebarColapsado y utilidades de UI
├── layouts/        LayoutApp (admin legacy), LayoutAdmin, LayoutEmpresa,
│                   LayoutPostulante y LayoutBusqueda (bolsa pública sin sesión)
├── pages/          auth (login, registro, registro-empresa, activar-cuenta),
│                   admin/, empresa/, postulante/, cuenta/
├── services/       clientes de API por dominio (axios, base `/api`)
├── routes/         declaración de rutas y guardas por rol
└── styles.css      diseño base (portal institucional)
    admin.css       tema del panel administrativo
    empresa.css     tema del portal de empresa
    postulante.css  tema del portal de postulante (bolsa pública incluida)
```

## Diseño / sistema visual

- **Portal institucional** (login, registro, registro-empresa, activar-cuenta): cabecera
  azul marino `#0B2542`, escudo municipal, tipografía institucional y franja de sistema.
- **Logo municipal**: única fuente `public/sol-logo.png`, renderizada mediante
  `components/LogoMunicipal.jsx` con proporción y transparencia originales. No se usan
  URLs externas ni copias del escudo. El favicon y `apple-touch-icon` se componen en un
  lienzo cuadrado transparente desde el master, sin estirarlo ni generar archivos extra.
- **Empresa y postulante**: layouts propios con navegación por rol, tarjetas de oferta
  (`job-card`), filtros tipo *pill*, chips de estado y diseño responsive; cada rol está
  scoped bajo su clase contenedora (`.app-empresa`, `.app-postulante`).
- **Admin**: panel con sidebar propio y tarjetas de indicadores.
- Los estilos de cada rol no deben mezclarse: si una página cambia de layout, revisar sus
  clases contra el CSS correspondiente.

## Notas

- La bolsa (`/postulante/buscar`, `/postulante/oportunidades`) es pública: `LayoutBusqueda`
  decide el cabecero según haya sesión o no.
- El perfil de postulante (datos + CV) exige contacto completo y CV vigente para postular.
- **Teléfono**: los formularios filtran a solo dígitos (`soloDigitos`) y validan 9 u 11
  dígitos (`esTelefonoValido`) antes de enviar; el backend revalida.
- **CV**: `CvUploader` muestra "Subir CV" o "Actualizar CV" según exista una
  versión vigente. No hay cuota mensual: la carga se protege con rate limiting
  configurable por usuario e IP, una operación simultánea por postulante y
  respuestas `429` con `Retry-After`. El historial de versiones y el único CV
  activo se conservan; el backend valida MIME, firma binaria, estructura y
  tamaño antes de almacenar.
- **Errores**: `errorApi` (en `utils.js`) extrae el `message` del sobre de error y tolera
  respuestas no JSON, `429` (rate limit) y errores de red/`5xx`; el interceptor de Axios
  renueva el token en `401` y redirige a `/login` si la sesión expiró.
- **Metadescripciones**: `SeoMeta` actualiza `<title>` y `<meta name="description">` por
  ruta en el cliente (SPA sin SSR).
- **Estado vacío compuesto (`Empty`)**: `components/Empty.jsx` implementa, en JSX + CSS
  propio, la composición del componente `Empty` de shadcn/ui (`Empty`, `EmptyHeader`,
  `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`). Referencias:
  <https://ui.shadcn.com/docs/components/base/empty> y
  <https://21st.dev/community/components/explore/shadcn-empty-state>. **Sin dependencias
  nuevas** (el proyecto no usa Tailwind, shadcn, `class-variance-authority` ni el alias
  `@/`). Los estilos viven en `styles.css` (clases `.empty`, `.empty-*`) y usan los tokens
  del tema, por lo que respetan modo claro/oscuro y son reutilizables. `EmptyMedia
  variant="icon"` omite a propósito las capas decorativas rotadas del original.
  - Uso actual: panel **«Detalle de la oferta»** en
    `pages/postulante/BuscarEmpleo.jsx` (icono `Briefcase` de `lucide-react` + título +
    descripción + indicación), centrado por `.panel-caja-vacia` (`postulante.css`).
  - Cubre solo el caso *detalle sin oferta seleccionada*. La **carga inicial**
    (`Buscando ofertas…`), el **error** de consulta y el **sin resultados** se manejan por
    separado en la misma página (`EstadoCarga`/`Mensaje`/`empty-note`) y no se sustituyen
    por este estado vacío.
  - Reutilización: para otro módulo, envolver el contenido con
    `<Empty><EmptyHeader><EmptyMedia variant="icon">…</EmptyMedia><EmptyTitle>…</EmptyTitle><EmptyDescription>…</EmptyDescription></EmptyHeader><EmptyContent>…</EmptyContent></Empty>`.
- **Presencia digital de empresa** (`components/RedesSociales.jsx`): componente
  `PresenciaDigital` (sitio web + Instagram/Facebook/TikTok/X) reutilizado en el modal público
  del postulante (`EmpresaModal`) y en el modal administrativo (`pages/admin/Empresas.jsx`).
  Los logotipos son **SVG locales** (rutas de [simple-icons](https://simpleicons.org/), CC0)
  incluidos a mano: **sin dependencias nuevas**. `CAMPOS_PRESENCIA` define los campos del
  formulario de `/empresa/perfil` (tarjeta «Presencia digital»). El sitio web se muestra
  arriba (etiqueta = dominio) y solo las redes configuradas; si no hay nada, el bloque no se
  renderiza. Los enlaces abren en pestaña nueva con `rel="noopener noreferrer"` y nunca se
  renderiza una URL cuyo protocolo no sea `http(s)`.
- **Privacidad de contacto de empresa**: el teléfono y el correo de la empresa **no** se
  entregan al rol `postulante`. El control es del backend (p. ej. se excluyen en
  `PostulacionRepository::dePostulante` y en el bloque `empresa` de las ofertas públicas), no
  solo de la UI. El rol `admin` sí los conserva.
- **Validación de URLs** (frontend y backend): solo `http(s)`; para cada red social el host
  debe ser el dominio oficial o un subdominio suyo (comparación por `host` real, no por
  texto). Helpers: `Validador::esUrlHttps`/`dominioPermitido` (PHP) y `dominioPermitido`
  (`utils.js`).
