# Frontend — Sistema de Empleo (React + Vite)

Cliente web de la plataforma de empleo MDJLO. Presentación únicamente: todo el negocio y
la autorización viven en el backend (`../backend`). Ver el
[`README.md`](../README.md) de la raíz para el contexto completo.

## Stack

- React 19 + Vite 8 · react-router-dom 7 · TanStack Query · Axios
- Iconos: Tabler Icons (`@tabler/icons-webfont`, CSS importado en `main.jsx`) y
  `lucide-react` · Tipografías Google (Inter, Sora; Playfair Display en el portal)

## Scripts

```bash
npm install
npm run dev       # http://localhost:5173 (origen permitido por CORS del backend)
npm run build     # producción → dist/
npm run lint      # oxlint
npm run preview   # sirve dist/
```

## Variables de entorno (`frontend/.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | Base del backend, p. ej. `http://localhost:8080` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID OAuth de Google (habilita el botón de ingreso/registro con Google) |

## Estructura

```
src/
├── components/     UI compartida (UI, PageHeader, CvUploader, StatCard, GoogleButton,
│                   SeoMeta…)
├── context/        AuthContext (sesión, login/logout, refresh)
├── hooks/          useAccion, useClickFuera
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
- **CV**: `CvUploader` muestra el botón "Subir CV" o "Actualizar CV" según exista un CV
  vigente, el contador de consumo mensual ("Ha usado X de 4…") y se deshabilita al alcanzar
  el límite (4/mes), mostrando el mensaje del backend.
- **Errores**: `errorApi` (en `utils.js`) extrae el `message` del sobre de error y tolera
  respuestas no JSON, `429` (rate limit) y errores de red/`5xx`; el interceptor de Axios
  renueva el token en `401` y redirige a `/login` si la sesión expiró.
- **Metadescripciones**: `SeoMeta` actualiza `<title>` y `<meta name="description">` por
  ruta en el cliente (SPA sin SSR).
