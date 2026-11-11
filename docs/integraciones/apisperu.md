# Integración de identidad: APIsPERU (DNI/RUC)

> Documento técnico de la integración vigente. La fuente de verdad de la
> configuración es el `.env` privado; aquí no se incluyen credenciales.

## A. Descripción

SOL consulta documentos de identidad peruanos a través de **APIsPERU**, proveedor
externo único para DNI y RUC:

- DNI: datos de RENIEC.
- RUC: datos de SUNAT.

El backend es la única capa que conoce al proveedor. React nunca llama a
APIsPERU, nunca recibe su token y nunca decide si un documento es auténtico.

`ApisperuClient` centraliza autenticación, transporte, timeouts y manejo de
errores. `DniService` y `RucService` conservan los contratos internos de SOL y
solo adaptan la respuesta.

## B. Configuración

Variables exclusivas del backend:

```dotenv
apisperu.baseURL=https://dniruc.apisperu.com/api/v1
apisperu.token=<token privado>
apisperu.timeout=10
```

- `apisperu.baseURL`: URL base; si queda vacía se usa la oficial.
- `apisperu.token`: token del panel de APIsPERU. Sin él, las consultas devuelven
  un error controlado; no se cae la aplicación.
- `apisperu.timeout`: segundos de espera total; por defecto 10.

`deploy/scripts/lib/common.sh` transfiere solo las variables `apisperu.*` al
contenedor backend. El contenedor frontend no las recibe y `validate.sh` rechaza
cualquier `VITE_APISPERU*`.

## C. Autenticación

APIsPERU admite dos mecanismos:

1. `Authorization: Bearer <token>` — **usado por SOL**.
2. `?token=<token>` — admitido por el proveedor, pero no usado.

SOL prefiere el encabezado porque evita exponer el token en URLs, logs de
servidores intermedios y trazas de monitoreo.

## D. Endpoints externos

Base: `https://dniruc.apisperu.com/api/v1`

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/v1/dni/{numero}` | DNI de 8 dígitos |
| GET | `/api/v1/ruc/{numero}` | RUC de 11 dígitos |

Los documentos se envían como cadena, nunca como entero.

## E. Ejemplos cURL

```bash
export APISPERU_TOKEN="<TU_TOKEN>"

curl -H "Authorization: Bearer ${APISPERU_TOKEN}" \
     -H "Accept: application/json" \
     "https://dniruc.apisperu.com/api/v1/dni/12345678"

curl -H "Authorization: Bearer ${APISPERU_TOKEN}" \
     -H "Accept: application/json" \
     "https://dniruc.apisperu.com/api/v1/ruc/20123456789"
```

Alternativa documentada por el proveedor (no usada por SOL):

```bash
curl --get \
     --data-urlencode "token=${APISPERU_TOKEN}" \
     "https://dniruc.apisperu.com/api/v1/ruc/20123456789"
```

El token en URL puede quedar registrado en logs y proxies.

## F. Normalización

DNI:

```json
{
  "dni": "12345678",
  "nombres": "JUAN CARLOS",
  "apellidos": "PEREZ GARCIA"
}
```

`apellidos` se compone con `apellidoPaterno` + `apellidoMaterno`, omitiendo
espacios sobrantes.

RUC:

```json
{
  "razon_social": "EMPRESA DEMOSTRACION S.A.C.",
  "nombre_comercial": "EMPRESA DEMO",
  "direccion": "AV. EJEMPLO 123, JOSE LEONARDO ORTIZ, CHICLAYO, LAMBAYEQUE"
}
```

- `razonSocial` → `razon_social`.
- `nombreComercial` → `nombre_comercial` (`null` si viene vacío).
- `direccion` se compone con dirección, distrito, provincia y departamento;
  se descartan vacíos y guiones aislados.

## G. Errores

| Escenario | Comportamiento |
|---|---|
| Token ausente | Error controlado; no se llama al proveedor |
| HTTP 401/403 | Credencial rechazada; detalle solo en log |
| HTTP 404 | Documento no encontrado en RENIEC/SUNAT |
| HTTP 429 | Demasiadas solicitudes (HTTP 429 interno) |
| HTTP 5xx / otro | Error genérico de verificación |
| Timeout, DNS, conexión | Error genérico de conexión |
| JSON inválido o vacío | Respuesta inválida |
| `success: false` | Documento no encontrado; mensaje del proveedor solo en log |

Los mensajes al usuario nunca incluyen tokens, encabezados, URLs internas ni
trazas de cURL. No existe fallback automático a otro proveedor.

## H. Seguridad

- El token existe solo en el backend y en el `.env` privado.
- No se registra en logs ni se incluye en respuestas.
- No se usa `VITE_APISPERU_TOKEN`.
- TLS se verifica (`CURLOPT_SSL_VERIFYPEER`/`VERIFYHOST`).
- Timeout de conexión y total acotados.
- No se siguen redirecciones.

## I. Arquitectura

```text
React (formularios)
   ↓ POST /api/verificar-dni | /api/verificar-ruc | /api/registro/postulante | /api/solicitudes-empresa
CodeIgniter (controladores delgados)
   ↓ DniService / RucService
ApisperuClient ── HTTPS + Bearer ──> APIsPERU
   ↓
MariaDB (datos verificados)
```

- **React**: validaciones preventivas, carga y presentación de errores.
- **CodeIgniter**: valida, consulta, normaliza y persiste.
- **MariaDB**: fuente de verdad; conserva las restricciones de unicidad.

### Integridad del registro

- El comprobante `dni_token` es un JWT firmado que contiene DNI, nombres y
  apellidos verificados. El registro exige ese comprobante, comprueba el DNI y
  persiste la identidad firmada; los nombres enviados por el navegador se
  ignoran.
- La solicitud de empresa vuelve a consultar el RUC en el backend y guarda
  razón social, nombre comercial y dirección obtenidos del proveedor.

## J. Migración

Se retiraron JSON.pe (DNI) y Decolecta/apis.net.pe (RUC). Ya no se leen
`jsonpe.token`, `dni.token` ni `sunat.token`, y no existen fallbacks.

Pasos para un entorno existente:

1. Obtener el token en <https://apisperu.com/admin/dniruc>.
2. Configurar `apisperu.baseURL`, `apisperu.token` y `apisperu.timeout` en el
   `.env` privado.
3. Regenerar el entorno filtrado con `./deploy/scripts/dev.sh up` (o el script
   de despliegue correspondiente).
4. Verificar que `deploy/runtime/backend.env` contiene `apisperu.*` y ningún
   token antiguo.
5. Ejecutar las pruebas y un smoke de `/api/verificar-dni` y
   `/api/verificar-ruc` con un documento de prueba autorizado.
