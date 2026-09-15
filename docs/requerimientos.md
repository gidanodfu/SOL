# Requerimientos del Sistema de Empleo — MDJLO

Documento de especificación que rige el desarrollo. Los códigos (RF-XX, RN-XX, RT-XX,
RNF-XX, RT-CV-XX) se referencian en código y migraciones para trazabilidad.

## 1. Propósito

Sistema de intermediación laboral de la Municipalidad Distrital de José Leonardo Ortiz
para la Unidad Funcional del Empleo: postulantes, empresas afiliadas, ofertas,
postulaciones, atención/orientación, capacitación, ferias, difusión y reportes.
Funciones según Resolución de Gerencia Municipal N.° 000197-2025-MDJLO-GM.

## 2. Objetivo

Gestionar y supervisar la intermediación laboral entre empresas y ciudadanos: publicación
de oportunidades, perfiles laborales, postulaciones y seguimiento de resultados; además de
actividades de orientación, capacitación, ferias de empleo, emprendimiento y autoempleo.

## 3. Procesos en alcance

1. Gestión de usuarios y roles.
2. Registro y administración municipal de empresas.
3. Gestión de postulantes.
4. Gestión de perfiles laborales y CV.
5. Gestión y validación de ofertas laborales.
6. Búsqueda de oportunidades laborales.
7. Gestión de postulaciones.
8. Seguimiento del proceso de selección.
9. Registro de atención y orientación laboral.
10. Gestión de ferias, talleres y capacitaciones.
11. Difusión de oportunidades laborales.
12. Gestión de información de empresas y MYPE locales.
13. Generación de estadísticas y reportes.
14. Control de estados y conservación del historial.

## 4. Actores

- **Administrador municipal** (personal municipal autorizado): administra usuarios y
  empresas, crea usuarios empresariales, activa/desactiva cuentas, revisa y valida ofertas,
  gestiona publicaciones, consulta postulaciones, registra atenciones, gestiona
  actividades/eventos, consulta indicadores y reportes.
- **Empresa** (registrada por la Municipalidad): gestiona su información, registra ofertas,
  consulta postulaciones, revisa perfiles/CV, actualiza estados de postulación y registra el
  resultado de selección.
- **Postulante** (ciudadano): crea su cuenta, gestiona perfil laboral (formación,
  experiencia, habilidades, cursos, certificaciones, CV), busca ofertas, postula y consulta
  el estado de sus postulaciones.

## 5. Requerimientos funcionales (RF)

### 5.1 Gestión de usuarios y autenticación
- **RF-01** Login con nombre de usuario y contraseña.
- **RF-02** Autenticación procesada por el backend CI4 contra MySQL.
- **RF-03** MySQL es la fuente de verdad de identidad, rol, estado y relaciones.
- **RF-04** El rol se identifica automáticamente desde la BD; el usuario no puede elegirlo.
- **RF-05** El backend verifica rol y permisos antes de cada operación.
- **RF-06** Estados de cuenta: Activo / Inactivo; inactivos no inician sesión.
- **RF-07** El admin crea, consulta, modifica, activa y desactiva usuarios.

### 5.2 Registro y administración de empresas
- **RF-08** Solo la Municipalidad registra empresas (nunca auto-registro).
- **RF-09** Evaluación presencial previa al registro.
- **RF-10** Perfil de empresa: RUC, razón social, nombre comercial, dirección, teléfono,
  correo, representante, información adicional.
- **RF-11** El admin crea el usuario empresarial.
- **RF-12** El RUC es el nombre de usuario por defecto.
- **RF-13** La contraseña inicial la crea el admin.
- **RF-14** Hash seguro; nunca texto plano.
- **RF-15** La Municipalidad entrega las credenciales a la empresa.
- **RF-16** Activar/desactivar empresas; inactiva no accede ni opera.
- **RF-17** La desactivación no elimina información ni historial.

### 5.3 Gestión de postulantes
- **RF-18** Registro de ciudadanos como postulantes.
- **RF-19** Perfil laboral: datos personales, formación, experiencia, habilidades, cursos,
  certificaciones, CV.
- **RF-20** Actualización del perfil.
- **RF-21** Carga y consulta del CV.

### 5.4 Gestión de ofertas laborales
- **RF-22** Registro de ofertas: puesto, descripción, funciones, requisitos, formación,
  experiencia, habilidades, tipo de empleo, lugar, remuneración, vacantes, fechas de
  publicación y cierre.
- **RF-23** Estados: Borrador, Pendiente de revisión, Publicada, Cerrada, Rechazada.
- **RF-24** Validación municipal antes de publicar.
- **RF-25** El admin supervisa las ofertas.
- **RF-26** El admin aprueba o rechaza.

### 5.5 Búsqueda de oportunidades
- **RF-27** Consulta de ofertas disponibles.
- **RF-28** Búsqueda por puesto, empresa, ubicación, categoría, formación, experiencia.
- **RF-29** Detalle de oferta antes de postular.

### 5.6 Gestión de postulaciones
- **RF-30** Registro individual de postulación: postulante, oferta, empresa, fecha, estado,
  estado de activación.
- **RF-31** Impedir más de una postulación activa del mismo postulante a la misma oferta.
- **RF-32** Registro automático en la bandeja de la empresa responsable.
- **RF-33** Bandeja "Postulaciones" de la empresa.
- **RF-34** Priorizar pendientes; dentro de cada estado, más recientes primero.
- **RF-35** Detalle: postulante, formación, experiencia, habilidades, cursos, CV, oferta,
  fecha y estado.
- **RF-36** Estados de postulación: Pendiente, En revisión, Preseleccionado, Contactado,
  Seleccionado, No seleccionado.
- **RF-37** Activar/desactivar postulación.
- **RF-38** Sin eliminación física; la desactivación solo cambia su activación.
- **RF-39** Conservar historial de estados.
- **RF-40** La empresa selecciona candidatos; la Municipalidad gestiona y supervisa.

### 5.7 Atención y orientación laboral
- **RF-41** Registro de atenciones a ciudadanos.
- **RF-42** Tipos: orientación laboral, asesoría CV, preparación de entrevistas, orientación
  vocacional, formación para el empleo, emprendimiento, autoempleo, derivación a trabajo social.
- **RF-43** Resultado y seguimiento.

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
- **RF-56** Personas atendidas.
- **RF-57** Candidatos seleccionados y empresas con procesos.
- **RF-58** Contrataciones registradas.
- **RF-59** Tiempo postulación → contacto/atención.
- **RF-60** Filtros por rango de fechas.

### 5.11 Auditoría y trazabilidad
- **RF-61** Registro de acciones relevantes.
- **RF-62** Historial de usuarios, empresas, ofertas, postulaciones, estados, atenciones,
  resultados.
- **RF-63** Usuario responsable y fecha en acciones administrativas.

## 6. Reglas de negocio (RN)

- **RN-01** Empresas solo registradas por la Municipalidad.
- **RN-02** Registro tras evaluación presencial.
- **RN-03** El admin crea perfil y usuario de la empresa.
- **RN-04** RUC = usuario por defecto.
- **RN-05** Contraseña inicial creada por el admin.
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
- **RN-19** Ofertas validadas por la Municipalidad antes de publicar.
- **RN-20** Conservación del historial.

## 7. Requerimientos no funcionales (RNF)

- **RNF-01** Arquitectura desacoplada React → API REST → CI4 → MySQL.
- **RNF-02/03/04** Backend PHP/CI4, frontend React, datos en MySQL.
- **RNF-05** Seguridad: hash, sesiones, permisos, rutas, validación, acceso no autorizado.
- **RNF-06** Integridad referencial.
- **RNF-07** Disponibilidad y recuperación de errores.
- **RNF-08** Usabilidad para ciudadanos, empresas y personal municipal.
- **RNF-09** Responsivo (desktop/tablet/móvil).
- **RNF-10** Código por módulos y responsabilidades (mantenible/extensible).
- **RNF-11** Operaciones administrativas rastreables.
- **RNF-12** Protección de información personal y empresarial.

## 8. Matriz Resolución → funcionalidad

| Función normativa | Implementación |
|---|---|
| Apoyo a población vulnerable | Registro de postulantes, atención y orientación |
| Asesoría laboral | Módulo de atención |
| Ferias de empleo | Módulo de ferias y eventos |
| Orientación vocacional | Registro de atenciones |
| Coordinación con empresas | Gestión municipal de empresas |
| CV y entrevistas | Perfil laboral, CV y asesoría |
| Monitoreo de vacantes | Gestión y supervisión de ofertas |
| Trabajo social | Derivaciones/atenciones |
| Emprendimiento | Talleres y actividades |
| Informes de efectividad | Dashboard y reportes |
| Empleos Perú | Sección de difusión |
| MYPE locales | Oportunidades MYPE |
| Oficinas descentralizadas | Registro/integración de información |

## 9. Resultado esperado (flujo)

Evaluación presencial → registro municipal de empresa → creación de usuario → RUC=usuario →
contraseña por admin → empresa habilitada → registro de oferta → validación municipal →
publicación → postulante consulta → postula → registro de postulación → empresa recibe →
pendientes primero → abrir postulación → revisar perfil/CV → cambiar estado →
seleccionar/no seleccionar → seguimiento → resultado/contratación → reporte municipal.

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
  `POST /api/postulaciones`; protegidos con validación de auth y permisos.
- **RT-08** Respuestas consistentes:
  - OK: `{ "success": true, "message": "...", "data": {} }`
  - Error: `{ "success": false, "message": "...", "errors": [] }`

## 13. SOLID y estilo (RT-09..RT-17)

- **RT-09** SOLID; capas Controller → Service → Repository → Model/Database; SRP (sin
  mega-controladores); DIP con abstracciones cuando aplique.
- **RT-10** Early returns en controllers, services, validaciones, autorización,
  procesamiento de postulaciones, ofertas y autenticación.
- **RT-11** Comentarios solo si aportan (reglas de negocio o decisiones no evidentes).
- **RT-12** Doc de métodos no evidentes: propósito, parámetros, resultado, errores.
- **RT-13** Comentar reglas de negocio con riesgo de modificación accidental (no eliminar
  postulaciones; empresa solo gestiona sus ofertas; RUC es usuario inicial; rol desde BD).
- **RT-14/15** Nombres uniformes y descriptivos en español (p. ej. `obtenerPostulacionesPendientes()`).
- **RT-16** Métodos pequeños. **RT-17** Evitar duplicación, centralizar lógica reutilizable.

## 14. Seguridad (RT-18..RT-22)

- **RT-18** Auth en CI4. **RT-19** Autorización en backend (independiente de lo visual).
- **RT-20** Contraseñas con hash seguro (incluidas las creadas por admin).
- **RT-21** Endpoints privados/administrativos protegidos (p. ej. `/api/admin/empresas`,
  `/api/admin/usuarios`, `/api/empresa/postulaciones`).
- **RT-22** Re-validar en CI4 todo lo recibido de React.

## 15. Regla arquitectónica principal

> Frontend y backend son proyectos completamente independientes. React es responsable
> exclusivamente de la presentación y consumo de la API. CodeIgniter es responsable de la
> lógica de negocio, autenticación, autorización y acceso a datos. MySQL es la fuente de
> verdad de la información persistente. Ninguna decisión crítica de seguridad o negocio
> dependerá exclusivamente del frontend.

## 16. Resultados de selección y tiempo de atención

Indicadores de efectividad (no solo usuarios/CV): empresas, ofertas, postulaciones,
selección, contratación (RF-58) y tiempos postulación→contacto/atención (RF-59), filtrables
por rango de fechas (RF-60).

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
