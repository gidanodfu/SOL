# Matriz de cumplimiento — Sistema de Empleo MDJLO

Estado por código de requerimiento y dónde está implementado (endpoint de la API /
pantalla del frontend / regla en la base de datos). Estados: ✔ implementado,
⬤ parcial (funcionalidad básica; ampliación prevista), ✘ pendiente.

## Requerimientos funcionales (RF)

| Código | Estado | Ubicación |
|---|---|---|
| RF-01 Login | ✔ | `POST /api/auth/login` · login |
| RF-02 Auth en backend CI4 vs MySQL | ✔ | `Services/AuthService`, `UserModel` |
| RF-03 MySQL fuente de verdad | ✔ | JWT solo transporta id; rol/estado se recargan de BD (`JwtAuthFilter`) |
| RF-04 Rol desde BD, no elegible | ✔ | columna `users.rol`; no editable por frontend |
| RF-05 Control de acceso | ✔ | filtros `jwt` + `rol:...` por ruta |
| RF-06 Cuentas activo/inactivo | ✔ | login bloqueado; admin activa/desactiva (`UsuariosController`, `EmpresasController`) |
| RF-07 Administración de usuarios | ✔ | `api/admin/usuarios*` · Usuarios (admin); un admin **no puede desactivar su propia cuenta** (`UsuarioService::cambiarEstado`, 403) |
| RF-08 Empresas se registran por solicitud pública + aprobación municipal | ✔ | `POST /api/solicitudes-empresa` · `api/admin/solicitudes-empresa*` (auto-registro con verificación de RUC) |
| RF-09 Evaluación presencial | ⬤ | asumida en la aprobación de la solicitud (`evaluacion_presencial=1`) |
| RF-10 Perfil de empresa | ✔ | CRUD admin + auto-edición de la empresa (`empresa/perfil`) |
| RF-11 Usuario empresarial creado al aprobar la solicitud | ✔ | dentro de `SolicitudEmpresaService::aprobar` |
| RF-12 RUC = usuario | ✔ | username generado desde el RUC en el alta; el login acepta el RUC o el correo corporativo |
| RF-13 Contraseña definida por la empresa al activar | ✔ | enlace de un solo uso `activar-cuenta/{token}` (`SolicitudEmpresaService`) |
| RF-14 Hash seguro | ✔ | `password_hash(PASSWORD_DEFAULT)` (RN-06) |
| RF-15 Notificación por correo + enlace de activación | ✔ | `EmailService` (SMTP); el admin puede copiar/regenerar el enlace |
| RF-16 Activar/desactivar empresa | ✔ | `PUT /api/admin/empresas/{id}/estado` sincroniza `users.estado` |
| RF-17 Conservación de información | ✔ | flags de estado; sin borrado físico |
| RF-18 Registro de postulantes (manual DNI + Google) | ✔ | `POST /api/registro/postulante` y `POST /api/auth/google` · Registro |
| RF-19/20 Perfil laboral + actualización | ✔ | datos personales/contacto + CV; **para postular solo se exige contacto completo + CV vigente** (las secciones de formación/experiencia/habilidades/cursos se retiraron del producto) |
| RF-21 CV cargar/consultar | ✔ | `POST/GET /api/postulante/cv*` · "Mi perfil y CV"; máximo **4 CV/mes** (ver RT-CV y endurecimiento 2026-09) |
| RF-22 Registro de ofertas | ✔ | `api/empresa/ofertas*` · Ofertas (empresa) |
| RF-23 Estados de oferta | ✔ | borrador → publicada → cerrada (los estados heredados `pendiente/rechazada` se normalizaron con migración) |
| RF-24 Publicación directa por la empresa (sin validación municipal) | ✔ | `PUT /api/empresa/ofertas/{id}/publicar` |
| RF-25/26 El admin supervisa y puede cerrar ofertas | ✔ | Ofertas (admin); `PUT /api/admin/ofertas/{id}/cerrar` |
| RF-27/28 Consulta + búsqueda públicas (sin sesión) | ✔ | `GET /api/ofertas` con filtros (categoría, ubicación, formación, experiencia) · "Buscar empleo". El filtro "Puesto o empresa" (`q`) se retiró el 2026-09-15 |
| RF-29 Detalle de oferta público | ✔ | `GET /api/ofertas/{id}` (incluye "ya postulé" si hay sesión) |
| RF-30 Registro individual de postulación | ✔ | `POST /api/postulante/postulaciones` (empresa denormalizada) |
| RF-31 Postulación única activa | ✔ | columna generada única `postulacion_unica` (RN-14) + chequeo en servicio |
| RF-32 Registro automático en bandeja empresa | ✔ | misma tabla `postulaciones`; bandeja por `empresa_id` |
| RF-33 Bandeja de postulaciones | ✔ | `GET /api/empresa/postulaciones` · Postulaciones (empresa) |
| RF-34 Pendientes primero, recientes dentro de estado | ✔ | orden `FIELD(estado…)` + `fecha_postulacion DESC` |
| RF-35 Detalle del postulante (datos de contacto, CV, oferta) | ✔ | `GET /api/empresa/postulaciones/{id}` |
| RF-36 Gestión de estado | ✔ | `PUT .../estado` con transiciones validadas |
| RF-37/38 Activar/desactivar sin eliminar | ✔ | `PUT .../activacion` |
| RF-39 Historial de estados | ✔ | tabla `postulacion_historial` (cada cambio, usuario y fecha) |
| RF-40 La empresa selecciona | ✔ | el admin solo supervisa; selección por la empresa (RN-18) |
| RF-41/42/43 Atenciones con tipos y seguimiento | ✘ retirado (2026-09) | módulo de atenciones eliminado de la API y el frontend; la tabla `atenciones` queda sin uso |
| RF-44/45/46/47 Ferias, eventos, talleres, capacitaciones | ✔ | `api/admin/actividades*` · Actividades (admin) |
| RF-48 Sección de difusión de oportunidades | ✔ | `GET /api/oportunidades` · "Ferias y oportunidades" (postulante) |
| RF-49 Empleos Perú | ✔ | fuente `empleos_peru` en `oportunidades` |
| RF-50 MYPE locales | ✔ | fuente `mype_local` (y empresas afiliadas) |
| RF-51 Fuente identificada | ✔ | columna `fuente` por oportunidad |
| RF-52 Dashboard municipal | ✔ | `GET /api/admin/dashboard` · Dashboard (admin) |
| RF-53 Empresas registradas/activas | ✔ | indicador en dashboard |
| RF-54 Ofertas por estado | ✔ | ídem |
| RF-55 Postulaciones por estado | ✔ | ídem |
| RF-56 Personas atendidas | ✘ retirado (2026-09) | indicadores de atenciones eliminados del dashboard y reportes |
| RF-57 Seleccionados y empresas con procesos | ✔ | indicadores `seleccionados`, `empresas_con_procesos` |
| RF-58 Contrataciones | ✔ | `api/empresa/contrataciones*`, supervisión admin |
| RF-59 Tiempo postulación→contacto/selección | ✔ | promedio en días desde `postulacion_historial` |
| RF-60 Reportes por periodo | ✔ | `GET /api/admin/reportes?desde=&hasta=` (con export CSV) |
| RF-61 Registro de actividades | ✔ | tabla `auditoria` (login, altas, activaciones, aprobaciones, resets…) |
| RF-62 Historial conservado | ✔ | flags `activo`/estado + tablas históricas |
| RF-63 Trazabilidad de acciones administrativas | ✔ | `auditoria.user_id` + fecha; historial de postulación |

## Reglas de negocio (RN)

| Código | Estado | Mecanismo |
|---|---|---|
| RN-01…RN-06 | ✔ | alta de empresas por solicitud aprobada (`SolicitudEmpresaService`) o por admin (legado), RUC/correo = credencial, hash seguro |
| RN-07/08 | ✔ | rol leído de BD; no editable desde frontend |
| RN-09 | ✔ | `RoleFilter` en cada endpoint protegido |
| RN-10 | ✔ | `JwtAuthFilter` valida `estado=activo` |
| RN-11 | ✔ | sincronización `empresas.estado`↔`users.estado` |
| RN-12 | ✔ | desactivación conserva registros |
| RN-13/14/15 | ✔ | registro por postulación, único activo, bandeja por empresa |
| RN-16 | ✔ | pendientes primero en bandeja |
| RN-17 | ✔ | activar/desactivar, sin borrado físico |
| RN-18 | ✔ | selección/contratación solo por la empresa |
| RN-19 | ✔ | solo las ofertas `publicada` reciben postulaciones; publicación directa por la empresa (`borrador → publicada`) |
| RN-20 | ✔ | historiales y auditoría |
| RN-21 | ✔ | un administrador no puede desactivar su propia cuenta (`UsuarioService::cambiarEstado` → 403); la UI no ofrece la acción |

## Arquitectura y código (RT)

| Código | Estado | Ubicación |
|---|---|---|
| RT-01/02/03 Independencia y responsabilidades | ✔ | `backend/` (CI4) y `frontend/` (React) separados; solo API REST |
| RT-04 Frontend solo presentación | ✔ | sin reglas de negocio ni credenciales |
| RT-05 Backend valida propiedad/permisos | ✔ | p. ej. ofertas/postulaciones/CV de la propia empresa |
| RT-06 Solo backend habla con MySQL | ✔ | |
| RT-07 Endpoints REST | ✔ | grupo `/api` en `Routes.php` |
| RT-08 Respuestas uniformes | ✔ | `{success,message,data,errors}` vía `BaseApiController`/`ApiExceptionHandler` |
| RT-09 Capas SOLID | ✔ | `Controllers → Services → Repositories → Models/Entities` |
| RT-10 Early returns | ✔ | filtros, auth y validaciones |
| RT-11/12/13 Comentarios y reglas de negocio | ✔ | comentarios solo para invariantes (RN-14, RT-CV…) |
| RT-14…17 Convenciones | ✔ | nombres descriptivos en español, sin duplicación |
| RT-18…22 Seguridad | ✔ | JWT en backend, autorización por rol, hash, revalidación de datos |

## CV y almacenamiento (RT-CV)

| Código | Estado | Ubicación |
|---|---|---|
| RT-CV-01/02 | ✔ | archivo en Supabase Storage; MySQL guarda metadatos (`cvs`) |
| RT-CV-03 | ✔ | cada carga crea versión y desactiva la anterior (`CvService`) |
| RT-CV-04 | ✔ | empresa ve CV solo de postulaciones propias (`PostulacionService`) |
| RT-CV-05 | ✔ | URL firmada generada por el backend (driver local = ruta interna autorizada) |
| RT-CV-06/07 | ✔ | validación extensión/MIME/tamaño; `object_key` generada por el sistema |
| RT-CV-08 | ✔ | historial de versiones conservado |
| RT-CV (límite mensual) | ✔ | máximo 4 CV por mes calendario (`CvService::LIMITE_MENSUAL` sobre `cvs.created_at`); `409` al superar; `limite_mensual` en `GET/POST /api/postulante/cv` |

## Endurecimiento de seguridad y errores (2026-09)

| Aspecto | Estado | Ubicación |
|---|---|---|
| `password_hash` nunca en respuestas | ✔ | `UsuarioRepository::base()` con columnas explícitas; `GET /api/admin/usuarios` sin hash (RT-20) |
| Rate limiting de autenticación | ✔ | token bucket CI4: login ráfaga 5 (1/60 s) por IP+usuario, solo fallos (reset en éxito); refresh/Google/registro ráfaga 10 (1/30 s) por IP (`ThrottleFilter`, `AuthService`) |
| Rate limiting de subida de CV | ✔ | token bucket: ráfaga 10 (1/360 s) por IP (`throttle:10,3600`) |
| Validación de teléfono 9 u 11 dígitos | ✔ | regla `telefono` en `Validador` (backend) + filtrado a dígitos y validación en el frontend |
| Errores saneados | ✔ | `ApiExceptionHandler` responde JSON uniforme; `500` genérico con log interno; `429` con `Retry-After` |
| Metadescripciones por ruta | ✔ | `frontend/src/components/SeoMeta.jsx` + `index.html` |
| Conexión MySQL | ✔ | gestión nativa de CI4 (una conexión por request); sin pool personalizado |

## Saneamiento funcional y técnico (2026-09-15)

| Aspecto | Estado | Ubicación |
|---|---|---|
| Bloqueo de autodesactivación del admin | ✔ | `UsuarioService::cambiarEstado` (403) + UI de Usuarios sin la acción sobre la cuenta propia |
| Filtro "Puesto o empresa" eliminado | ✔ | sin `q` en `GET /api/ofertas` y `GET /api/postulante/ofertas`; UI/OpenAPI/tests actualizados |
| Historial de postulación con `users.id` real | ✔ | `PostulacionService::postular` + `PostulanteRepository::usuarioIdDe` |
| Contratación solo sobre postulación activa | ✔ | `ContratacionService::registrar` exige `activo=1` |
| `total` de empresas respeta `q` | ✔ | `EmpresaRepository::contar` |
| Transacciones en escrituras multi-tabla | ✔ | `PostulanteService::actualizarBasico`, `UsuarioService::cambiarEstado`, `EmpresaService::cambiarEstado` |
| Tope de paginación admin | ✔ | `limite` 1–200 y `offset` >= 0 en usuarios, empresas y solicitudes |
| Dependencias dev sin uso retiradas | ✔ | `fakerphp/faker`, `mikey179/vfsstream` |

## Pendientes / recomendados

- **Configuración en .env antes de producción**: SMTP (`email.*`) para las notificaciones de aprobación/rechazo, token de SUNAT (`sunat.token`) para verificar RUC y Google (`google.clientId` + `VITE_GOOGLE_CLIENT_ID`).
- **WhatsApp de notificaciones** (aprobación/rechazo) todavía no integrado; hoy solo correo. Opcional.
- **Supabase Storage real**: conectar credenciales (driver `supabase`) en producción y
  re-verificar subida + URL firmada; desarrollo usa driver `local`.
- Roles secundarios del personal municipal (hoy un único rol `admin`).
- Integración de oficinas descentralizadas (matriz de la Resolución).
- Difusión hacia empresas (ver ferias/oportunidades desde la cuenta empresa).
- **Tablas en desuso** (`formacion_academica`, `experiencia_laboral`, `habilidades`,
  `cursos_certificaciones`, `atenciones`): no se eliminan hasta confirmar que ningún
  entorno tiene datos reales; el borrado se haría con una migración nueva.
- **Hallazgos menores de la auditoría** (`backend/docs/auditoria-backend.md`, sección F):
  dueño único de `users.estado`/`empresas.estado`, auditoría ampliada, N+1 en listados,
  zona horaria Perú y validación calendárica quedan para una fase posterior.
