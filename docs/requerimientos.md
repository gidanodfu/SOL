# Requerimientos del Sistema de Empleo — MDJLO

Documento de especificación que rige el desarrollo. Los códigos (RF-XX, RN-XX, RT-XX,
RNF-XX, RT-CV-XX) se referencian en código y migraciones para trazabilidad. Los cambios de
modelo aprobados con posterioridad se documentan en los anexos (§17, §18, §19) y el cuerpo
principal describe el **comportamiento vigente**.

## 1. Propósito

Sistema de intermediación laboral de la Municipalidad Distrital de José Leonardo Ortiz
para la Unidad Funcional del Empleo: postulantes, empresas afiliadas, ofertas,
postulaciones, ferias/talleres, difusión de oportunidades y reportes. Funciones según
Resolución de Gerencia Municipal N.° 000197-2025-MDJLO-GM.

## 2. Objetivo

Gestionar y supervisar la intermediación laboral entre empresas y ciudadanos: afiliación de
empresas, publicación de oportunidades, perfiles laborales con CV, postulaciones y
seguimiento de resultados; además de ferias, capacitaciones, difusión y reportes.

## 3. Procesos en alcance

1. Gestión de usuarios y roles.
2. Auto-registro de empresas (solicitud pública) y aprobación/administración municipal.
3. Gestión de postulantes.
4. Gestión de perfiles laborales y CV.
5. Gestión y publicación de ofertas laborales.
6. Búsqueda de oportunidades laborales.
7. Gestión de postulaciones.
8. Seguimiento del proceso de selección (a cargo de la empresa).
9. Gestión de ferias, talleres y capacitaciones.
10. Difusión de oportunidades laborales (Empleos Perú, MYPE y otras fuentes).
11. Generación de estadísticas y reportes.
12. Control de estados y conservación del historial.

> El registro de atenciones/asesorías individuales (RF-41/42/43) se retiró del producto; ver §17.

## 4. Actores

- **Administrador municipal** (personal municipal autorizado): administra usuarios y
  empresas, aprueba o rechaza solicitudes de afiliación, activa/desactiva cuentas, supervisa
  y cierra ofertas, gestiona actividades (ferias/talleres), difusión y contrataciones, y
  consulta indicadores y reportes. **No revisa ni selecciona postulaciones**: la selección
  la realiza la empresa (RN-18). Un administrador **no puede desactivar su propia cuenta**
  (RN-21).
- **Empresa** (afiliada por auto-registro con aprobación municipal): gestiona su
  información y datos de contacto, registra ofertas en borrador y las **publica
  directamente**, consulta las postulaciones recibidas, revisa perfiles/CV autorizados,
  actualiza estados de postulación y registra la contratación.
- **Postulante** (ciudadano): crea su cuenta (DNI o Google), completa sus datos de contacto
  y **CV**, busca ofertas publicadas, postula y consulta el estado de sus postulaciones. La
  formación, experiencia, habilidades y cursos son opcionales y se retiraron del producto
  (§17).

## 5. Requerimientos funcionales (RF)

### 5.1 Gestión de usuarios y autenticación
- **RF-01** Login con nombre de usuario (RUC/DNI) o correo y contraseña.
- **RF-02** Autenticación procesada por el backend CI4 contra MySQL.
- **RF-03** MySQL es la fuente de verdad de identidad, rol, estado y relaciones.
- **RF-04** El rol se identifica automáticamente desde la BD; el usuario no puede elegirlo.
- **RF-05** El backend verifica rol y permisos antes de cada operación.
- **RF-06** Estados de cuenta: Activo / Inactivo; inactivos no inician sesión.
- **RF-07** El admin crea, consulta, modifica, activa y desactiva usuarios; **no puede
  desactivar su propia cuenta** (validado en backend y reflejado en la UI).

### 5.2 Registro y administración de empresas
- **RF-08** La empresa envía una **solicitud pública de afiliación** (auto-registro) con RUC
  verificado en SUNAT; el admin la aprueba o rechaza desde una bandeja.
- **RF-09** Evaluación presencial asumida en la aprobación de la solicitud.
- **RF-10** Perfil de empresa: RUC, razón social, nombre comercial, dirección, teléfono,
  correo, representante, información adicional.
- **RF-11** Al aprobar la solicitud se crea el usuario empresarial.
- **RF-12** El RUC es el nombre de usuario por defecto; el login acepta el correo
  corporativo o el RUC.
- **RF-13** La empresa define su contraseña al activar la cuenta con un enlace de un solo
  uso (`/activar-cuenta`).
- **RF-14** Hash seguro; nunca texto plano.
- **RF-15** Notificación por correo con el enlace de activación (el admin también puede
  entregarlo desde la bandeja).
- **RF-16** Activar/desactivar empresas; inactiva no accede ni opera.
- **RF-17** La desactivación no elimina información ni historial.

### 5.3 Gestión de postulantes
- **RF-18** Registro de ciudadanos como postulantes (manual con DNI o con Google).
- **RF-19** Perfil laboral vigente: datos personales y de contacto + **CV**. El requisito
  para postular es contacto completo y CV vigente; formación, experiencia, habilidades y
  cursos se retiraron del producto (§17).
- **RF-20** Actualización del perfil.
- **RF-21** Carga y consulta del CV, con **máximo 4 cargas por mes calendario** y versiones
  anteriores conservadas.

### 5.4 Gestión de ofertas laborales
- **RF-22** Registro de ofertas: puesto, descripción, funciones, requisitos, formación,
  experiencia, habilidades, tipo de empleo, lugar, remuneración, vacantes, fechas de
  publicación y cierre.
- **RF-23** Estados vigentes: Borrador, Publicada, Cerrada. El ENUM conserva los valores
  históricos `pendiente`/`rechazada` (normalizados por migración), que ya no se generan.
- **RF-24** La empresa **publica directamente** sus ofertas (sin validación municipal previa).
- **RF-25** El admin supervisa las ofertas (listado) y puede cerrarlas.
- **RF-26** El flujo municipal de aprobar/rechazar ofertas fue retirado (§17).

### 5.5 Búsqueda de oportunidades
- **RF-27** Consulta de ofertas disponibles (bolsa pública, sin sesión).
- **RF-28** Búsqueda por categoría, ubicación, formación y experiencia.
- **RF-29** Detalle de oferta antes de postular.

### 5.6 Gestión de postulaciones
- **RF-30** Registro individual de postulación: postulante, oferta, empresa, fecha, estado,
  estado de activación.
- **RF-31** Impedir más de una postulación activa del mismo postulante a la misma oferta.
- **RF-32** Registro automático en la bandeja de la empresa responsable.
- **RF-33** Bandeja "Postulaciones" de la empresa.
- **RF-34** Priorizar pendientes; dentro de cada estado, más recientes primero.
- **RF-35** Detalle: postulante, CV, oferta, fecha y estado.
- **RF-36** Estados de postulación: Pendiente, En revisión, Preseleccionado, Contactado,
  Seleccionado, No seleccionado.
- **RF-37** Activar/desactivar postulación.
- **RF-38** Sin eliminación física; la desactivación solo cambia su activación.
- **RF-39** Conservar historial de estados (el historial referencia `users.id`).
- **RF-40** La empresa selecciona candidatos; la Municipalidad supervisa y reporta.

### 5.7 Atención y orientación laboral — RETIRADO
- **RF-41/42/43** El registro y seguimiento de atenciones se retiró de la API y el frontend
  (§17). La tabla `atenciones` queda sin uso.

### 5.8 Ferias, eventos y capacitaciones
- **RF-44** Ferias de empleo. **RF-45** Eventos. **RF-46** Talleres.
- **RF-47** Capacitaciones y formación para el empleo.

### 5.9 Difusión
- **RF-48** Sección de oportunidades de distintas fuentes.
- **RF-49** Promoción de Empleos Perú.
- **RF-50** Oportunidades de MYPE locales.
- **RF-51** Cada oportunidad identifica su fuente.

### 5.10 Reportes y estadísticas
- **RF-52** Dashboard municipal de indicadores.
- **RF-53** Empresas registradas y activas.
- **RF-54** Ofertas por estado.
- **RF-55** Cantidad y estado de postulaciones.
- **RF-56** Personas atendidas — RETIRADO (eliminado del dashboard y reportes, §17).
- **RF-57** Candidatos seleccionados y empresas con procesos.
- **RF-58** Contrataciones registradas (empresa y supervisión admin).
- **RF-59** Tiempo postulación → contacto/selección.
- **RF-60** Filtros por rango de fechas.

### 5.11 Auditoría y trazabilidad
- **RF-61** Registro de acciones relevantes.
- **RF-62** Historial de usuarios, empresas, ofertas, postulaciones y estados.
- **RF-63** Usuario responsable y fecha en acciones administrativas.

## 6. Reglas de negocio (RN)

- **RN-01** Las empresas se afilian por solicitud pública aprobada por la Municipalidad.
- **RN-02** La aprobación asume la evaluación presencial.
- **RN-03** Al aprobar la solicitud se crea el perfil y el usuario de la empresa.
- **RN-04** RUC = usuario por defecto (el login también acepta el correo corporativo).
- **RN-05** La contraseña la define la empresa al activar la cuenta.
- **RN-06** Hash seguro de contraseñas.
- **RN-07** Rol determinado por el backend desde la BD.
- **RN-08** El usuario no elige su rol.
- **RN-09** El backend valida permisos en cada operación protegida.
- **RN-10** Inactivos no inician sesión.
- **RN-11** Empresas inactivas no operan.
- **RN-12** No se elimina físicamente al desactivar.
- **RN-13** Cada postulación es un registro independiente.
- **RN-14** Máx. una postulación activa por postulante-oferta.
- **RN-15** Toda postulación aparece en la bandeja de su empresa.
- **RN-16** Pendientes primero.
- **RN-17** Postulaciones activables/desactivables, nunca eliminadas.
- **RN-18** La empresa selecciona a sus candidatos.
- **RN-19** La empresa publica directamente sus ofertas; el admin supervisa y puede cerrar.
- **RN-20** Conservación del historial.
- **RN-21** Un administrador no puede desactivar su propia cuenta (backend como autoridad).

## 7. Requerimientos no funcionales (RNF)

- **RNF-01** Arquitectura desacoplada React → API REST → CI4 → MySQL.
- **RNF-02/03/04** Backend PHP/CI4, frontend React, datos en MySQL.
- **RNF-05** Seguridad: hash, sesiones, permisos, rutas, validación, rate limiting, acceso
  no autorizado.
- **RNF-06** Integridad referencial.
- **RNF-07** Disponibilidad y recuperación de errores.
- **RNF-08** Usabilidad para ciudadanos, empresas y personal municipal.
- **RNF-09** Responsivo (desktop/tablet/móvil).
- **RNF-10** Código por módulos y responsabilidades (mantenible/extensible).
- **RNF-11** Operaciones administrativas rastreables.
- **RNF-12** Protección de información personal y empresarial.

## 8. Matriz Resolución → funcionalidad (estado real)

Estados: **IMPLEMENTADO**, **PARCIAL**, **PENDIENTE**, **FUERA DE ALCANCE**, **RETIRADO**.

| Función normativa | Estado | Implementación real |
|---|---|---|
| Apoyo a población vulnerable | PARCIAL | Registro de postulantes y bolsa pública; sin módulo específico de vulnerabilidad |
| Asesoría laboral | RETIRADO | El registro de atenciones se retiró del producto |
| Ferias de empleo | IMPLEMENTADO | `api/admin/actividades*` (tipo `feria_empleo`) y difusión pública |
| Orientación vocacional | RETIRADO | Se eliminó con el módulo de atenciones |
| Formación para el empleo | IMPLEMENTADO | Actividades tipo `capacitacion`/`taller` |
| Coordinación con empresas | IMPLEMENTADO | Afiliación de empresas + gestión de ofertas |
| Asesoría para CV | PARCIAL | Carga/actualización de CV (sin asesoría guiada) |
| Preparación para entrevistas | RETIRADO | Se eliminó con el módulo de atenciones |
| Monitoreo de vacantes | IMPLEMENTADO | Supervisión municipal de ofertas y reportes |
| Trabajo social | FUERA DE ALCANCE | Requeriría un módulo de derivaciones no previsto |
| Emprendimiento y autoempleo | PARCIAL | Difusión de oportunidades; sin módulo de emprendimiento |
| Informes de efectividad | IMPLEMENTADO | Dashboard admin y reportes con export CSV/Excel |
| Empleos Perú | IMPLEMENTADO | Fuente `empleos_peru` en oportunidades |
| Oportunidades MYPE | IMPLEMENTADO | Fuente `mype_local` y empresas afiliadas |
| Oficinas descentralizadas | FUERA DE ALCANCE | No hay integración con oficinas descentralizadas |

## 9. Resultado esperado (flujo vigente)

Solicitud pública de afiliación (RUC verificado) → aprobación municipal → enlace de
activación → la empresa define su contraseña → empresa habilitada → registra oferta →
la publica directamente → el postulante consulta la bolsa pública → completa contacto + CV
→ postula → la postulación aparece en la bandeja de la empresa → la empresa revisa el
perfil/CV → cambia estados → contacta/selecciona → registra la contratación → el municipio
supervisa y reporta.

## 10. CV y almacenamiento externo (RT-CV)

- **RT-CV-01** CV en servicio externo S3-compatible (Supabase Storage), no en MySQL.
- **RT-CV-02** MySQL guarda metadatos y referencia (postulante, nombre original, MIME,
  tamaño, ruta del objeto, fecha de actualización).
- **RT-CV-03** Actualización gestionada por backend (sustitución/versión + referencia).
- **RT-CV-04** Acceso controlado por CI4: la empresa solo ve CV de postulaciones autorizadas.
- **RT-CV-05** Sin URLs públicas permanentes; URL temporal/firmada generada por CI4.
- **RT-CV-06** Validar extensión, MIME y tamaño antes de almacenar.
- **RT-CV-07** Nombres generados por el sistema.
- **RT-CV-08** Historial/versiones del CV cuando sea necesario.
- **RT-CV-09** Máximo 4 cargas por mes calendario (control en backend).

Decisión: MySQL = datos y referencias; Supabase Storage = archivos; CI4 controla permisos;
React solo interfaz. `frontend/public/` únicamente recursos públicos (logos, iconos).

## 11. Arquitectura y organización (RT-01..RT-06)

- **RT-01** Frontend y backend como proyectos independientes; comunicación solo por API REST.
- **RT-02** Frontend independiente: interfaces, componentes, formularios, navegación,
  validaciones de presentación, consumo de API, estado de UI. Sin reglas de negocio ni
  credenciales MySQL.
- **RT-03** Backend independiente: auth, autorización, reglas de negocio, validación,
  gestión de usuarios/roles/empresas/ofertas/postulaciones, acceso MySQL, respuestas API.
- **RT-04** Frontend solo presentación y API; la restricción visual no reemplaza la del backend.
- **RT-05** Backend implementa las reglas de negocio (¿puede esta empresa modificar esta oferta?).
- **RT-06** Solo el backend habla con MySQL.

### Estructura frontend
```
frontend/  public/{images,icons,...}  src/{assets,components,layouts,pages,routes,
          services,hooks,context,utils,validators,constants,App.jsx}  .env  package.json
```
### Estructura backend
```
backend/  app/{Config,Controllers,Models,Services,Repositories,Entities,Filters,
        Validation,Database/{Migrations,Seeds}}  public/index.php  writable  tests
        .env  composer.json
```

## 12. API REST (RT-07/RT-08)

- **RT-07** Endpoints REST: ej. `GET /api/ofertas`, `GET /api/ofertas/{id}`,
  `POST /api/postulante/postulaciones`; protegidos con validación de auth y permisos.
- **RT-08** Respuestas consistentes:
  - OK: `{ "success": true, "message": "...", "data": {} }`
  - Error: `{ "success": false, "message": "...", "errors": [] }`
  - Códigos: `400/401/403/404/409/422/429/500`; los `500` no exponen detalles internos.

## 13. SOLID y estilo (RT-09..RT-17)

- **RT-09** SOLID; capas Controller → Service → Repository → Model/Database; SRP (sin
  mega-controladores); DIP con abstracciones cuando aplique.
- **RT-10** Early returns en controllers, services, validaciones, autorización,
  procesamiento de postulaciones, ofertas y autenticación.
- **RT-11** Comentarios solo si aportan (reglas de negocio o decisiones no evidentes).
- **RT-12** Doc de métodos no evidentes: propósito, parámetros, resultado, errores.
- **RT-13** Comentar reglas de negocio con riesgo de modificación accidental (no eliminar
  postulaciones; empresa solo gestiona sus ofertas; RUC es usuario inicial; rol desde BD;
  un admin no puede autodesactivarse).
- **RT-14/15** Nombres uniformes y descriptivos en español (p. ej. `obtenerPostulacionesPendientes()`).
- **RT-16** Métodos pequeños. **RT-17** Evitar duplicación, centralizar lógica reutilizable.

## 14. Seguridad (RT-18..RT-22)

- **RT-18** Auth en CI4. **RT-19** Autorización en backend (independiente de lo visual).
- **RT-20** Contraseñas con hash seguro (incluidas las creadas por admin).
- **RT-21** Endpoints privados/administrativos protegidos (p. ej. `/api/admin/empresas`,
  `/api/admin/usuarios`, `/api/empresa/postulaciones`).
- **RT-22** Re-validar en CI4 todo lo recibido de React.
- **RT-23** Rate limiting (token bucket de CI4) en login, refresh/Google/registro y subida
  de CV; respuesta `429` con `Retry-After`.
- **RT-24** Ninguna respuesta de usuario expone `password_hash`.

## 15. Regla arquitectónica principal

> Frontend y backend son proyectos completamente independientes. React es responsable
> exclusivamente de la presentación y consumo de la API. CodeIgniter es responsable de la
> lógica de negocio, autenticación, autorización y acceso a datos. MySQL es la fuente de
> verdad de la información persistente. Ninguna decisión crítica de seguridad o negocio
> dependerá exclusivamente del frontend.

## 16. Resultados de selección y tiempo de atención

Indicadores de efectividad (no solo usuarios/CV): empresas, ofertas, postulaciones,
selección y contratación (RF-58) y tiempos postulación→contacto/selección (RF-59),
filtrables por rango de fechas (RF-60).

## 17. Anexo — cambios de modelo (2026-09)

Ajustes al flujo original aprobados posteriormente:

- **Auto-registro de empresas (sustituye RF-08 "solo la Municipalidad registra")**: la
  empresa envía una solicitud pública (RUC verificado en SUNAT, correo corporativo,
  teléfono y representante). El admin aprueba o rechaza desde una bandeja y la empresa es
  notificada por correo; si se aprueba recibe un enlace de un solo uso (`/activar-cuenta`)
  para definir su contraseña y recién entonces operar. El login usa el correo corporativo.
- **Publicación directa de ofertas (sustituye RF-24 validación municipal previa)**: la
  empresa guarda la oferta en borrador y la publica con un botón; el admin solo supervisa
  (listado y cierre). Editar una oferta publicada la mantiene publicada.
- **Bolsa de empleo pública (RF-27/28/29)**: `/postulante/buscar` y
  `/postulante/oportunidades` y sus endpoints (`GET /api/ofertas`, `/oportunidades`) se
  consultan sin sesión; para postularse hay que iniciar sesión como postulante.
- **Registro de postulante con auto-login (RF-18 ampliado)**: el registro manual
  (DNI + contraseña) crea la cuenta y la deja con sesión iniciada
  (`POST /api/registro/postulante` devuelve tokens), de modo que el ciudadano cae
  directo en `/postulante/buscar`.
- **Registro/ingreso con Google (RF-18 ampliado)**: además del registro manual se
  permite el ingreso con Google (`POST /api/auth/google`), solo para postulantes.
  Las cuentas creadas así no tienen DNI y, mientras no puedan postular (datos de
  contacto incompletos o sin CV vigente), el frontend los lleva a
  `/postulante/perfil` a completarlo; cuando ya pueden postular, el siguiente
  ingreso con Google va directo a la bolsa de empleo.
- **Requisitos mínimos para postular (RF-19 ampliado)**: un postulante puede
  postularse cuando tiene sus datos de contacto completos (correo, teléfono,
  fecha de nacimiento y dirección) y un CV vigente cargado.
- **Secciones del perfil retiradas (RF-19/20, decisión posterior)**: los CRUD de
  formación académica, experiencia laboral, habilidades y cursos/certificaciones
  (tablas `formacion_academica`, `experiencia_laboral`, `habilidades`,
  `cursos_certificaciones`) se eliminaron del producto (API y frontend). Las tablas
  quedan sin uso en la base de datos y se pueden eliminar con una migración cuando se
  confirme que ningún entorno tiene datos reales.
- **Módulo de atenciones retirado (RF-41/42/43/56, decisión posterior)**: el registro y
  seguimiento de atenciones (CRUD `admin/atenciones`) y sus indicadores en el dashboard
  y reportes se eliminaron de la API y el frontend. La tabla `atenciones` queda sin uso
  en la base de datos (migración histórica intacta); eliminar con una migración cuando se
  confirme que ningún entorno tiene datos reales.
- **Flujo heredado de validación de ofertas retirado (RF-23/24/25/26, decisión posterior)**:
  se eliminaron los endpoints `admin/ofertas/{id}/aprobar|rechazar` y
  `empresa/ofertas/{id}/revision` (UI admin/empresa, servicios y tests incluidos). La
  migración `NormalizarOfertasHeredadas` convierte los datos existentes:
  `pendiente → publicada` y `rechazada → borrador`; el ENUM conserva los valores
  históricos pero el sistema ya no los genera.

## 18. Anexo — endurecimiento de seguridad y errores (2026-09-10)

Cambios aplicados sin modificar el esquema de base de datos ni añadir variables `.env`:

- **Validación de teléfono**: los campos `telefono` aceptan **9 u 11 dígitos**
  (`Validador` regla `telefono`, `^(?:\d{9}|\d{11})$`). El backend es la validación
  definitiva; el frontend filtra a solo dígitos y usa el mismo criterio.
- **Límite de CV**: máximo **4 CV por mes calendario** por postulante, contado en el
  backend sobre `cvs.created_at` (no evadible desde el frontend). Al superarlo responde
  `409`; `GET /api/postulante/cv` y la subida exponen `limite_mensual`
  (`{limite, usados, restantes}`). El botón de la interfaz pasa de "Subir CV" a
  "Actualizar CV" cuando ya existe un CV vigente.
- **Rate limiting** (Throttler nativo de CI4 = **token bucket**; respuesta `429` con
  `Retry-After`): permite una ráfaga inicial y luego repone 1 token por intervalo (no es
  bloqueo de ventana fija). Login: ráfaga 5 y 1/60 s por IP+usuario (solo fallos, se
  reinicia en login correcto); refresh/Google/registro: ráfaga 10 y 1/30 s por IP; subida
  de CV: ráfaga 10 y 1/360 s (6 min) por IP.
- **`password_hash` fuera de las respuestas**: `GET /api/admin/usuarios` selecciona
  columnas explícitas sin el hash; el hash permanece únicamente en el backend (RT-20).
- **Errores seguros**: toda excepción HTTP responde el sobre uniforme
  `{success, message, errors}`; los `500` usan un mensaje genérico y el detalle (SQL,
  rutas, stack traces) se registra solo en el log.
- **Conexiones MySQL**: se mantiene la gestión nativa de CI4 (una conexión compartida por
  request vía `db_connect()`); no se implementó un pool personalizado.
- **Metadescripciones por ruta** en el frontend (`SeoMeta`) con descripciones propias por
  página y `<meta name="description">` por defecto en `index.html`.

## 19. Anexo — saneamiento funcional y técnico (2026-09-15)

- **Protección del administrador (RN-21)**: un administrador no puede desactivar su propia
  cuenta. La regla vive en `UsuarioService::cambiarEstado` (responde `403`) y la UI de
  Usuarios no ofrece la acción sobre la cuenta propia. No se identifica al admin por email.
- **Filtro "Puesto o empresa" retirado**: la búsqueda de `/postulante/buscar` ya no filtra
  por texto libre. Se eliminó el parámetro `q` de `GET /api/ofertas` y
  `GET /api/postulante/ofertas`, la constante `OPCIONES_PUESTO`, el estado `sel.puesto` y
  el pill de la UI, además de su documentación OpenAPI. Los `q` administrativos (usuarios,
  empresas, solicitudes) se conservan.
- **Integridad**:
  - El historial inicial de postulación registra el `users.id` real (`usuario_id`), no el
    `postulantes.id`.
  - No se puede registrar una contratación sobre una postulación inactiva.
  - El `total` paginado de empresas respeta el filtro `q`.
  - Las actualizaciones que tocan dos tablas (perfil↔cuenta, usuario↔empresa,
    empresa↔usuario) se ejecutan en transacción.
  - Los listados admin acotan `limite` a 200 y `offset` a >= 0.
- **Dependencias**: se retiraron `fakerphp/faker` y `mikey179/vfsstream` (sin uso).
- **Pendiente decidido**: las tablas en desuso (`formacion_academica`, `experiencia_laboral`,
  `habilidades`, `cursos_certificaciones`, `atenciones`) **no** se eliminan en esta pasada;
  requieren confirmación de que ningún entorno tiene datos reales.
