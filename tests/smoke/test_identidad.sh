#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Identidad de acceso y unicidad global. Requiere MySQL migrado + seeds de prueba
# y Turnstile deshabilitado en el .env de la raíz (igual que el resto de smoke tests).
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8081
LOG=/tmp/opencode/spark_identidad.log

env 'storage.driver=local' php spark serve --host 127.0.0.1 --port 8081 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null "$B/health" && break; sleep 0.5; done

fallos=0
esperar() {
  local nombre="$1" esperado="$2" metodo="$3" url="$4" cuerpo="${5:-}" cabecera="${6:-}"
  local args=(-s -o /tmp/opencode/identidad_resp.json -w '%{http_code}' -X "$metodo" "$B$url")
  [ -n "$cabecera" ] && args+=(-H "$cabecera")
  [ -n "$cuerpo" ] && args+=(-H 'Content-Type: application/json' -d "$cuerpo")
  local codigo
  codigo=$(curl "${args[@]}")
  if [ "$codigo" = "$esperado" ]; then
    printf 'OK   %-46s %s\n' "$nombre" "$codigo"
  else
    printf 'FAIL %-46s %s (esperado %s)\n' "$nombre" "$codigo" "$esperado"
    fallos=$((fallos + 1))
  fi
}

token_dni() {
    php -r 'require "vendor/autoload.php"; echo Firebase\JWT\JWT::encode(["tipo"=>"verificacion_dni","dni"=>$argv[1],"iat"=>time(),"exp"=>time()+600], getenv("jwt.secret"), "HS256");' "$1"
}

esperar 'admin: usuario' 200 POST '/api/auth/login' '{"username":"admin","password":"Admin123!"}'
esperar 'admin: correo' 200 POST '/api/auth/login' '{"username":"admin@mdjlo.gob.pe","password":"Admin123!"}'
esperar 'empresa: RUC' 200 POST '/api/auth/login' '{"username":"20601234567","password":"Empresa123!"}'
esperar 'empresa: RUC con separadores' 200 POST '/api/auth/login' '{"username":"20-601234567","password":"Empresa123!"}'
esperar 'empresa: correo rechazado' 401 POST '/api/auth/login' '{"username":"contacto@losjardines.pe","password":"Empresa123!"}'
esperar 'postulante: DNI' 200 POST '/api/auth/login' '{"username":"12345678","password":"Postu123!"}'
esperar 'postulante: DNI con puntos' 200 POST '/api/auth/login' '{"username":"12.345.678","password":"Postu123!"}'
esperar 'postulante: correo rechazado' 401 POST '/api/auth/login' '{"username":"admin@mdjlo.gob.pe","password":"Postu123!"}'

esperar 'registro: sin aceptación de términos' 422 POST '/api/registro/postulante' '{"dni":"70000010","nombres":"Prueba","apellidos":"Sin terminos","email":"sin.terminos@example.pe","telefono":"999888771","password":"Clave123!","password2":"Clave123!"}'
esperar 'registro: aceptación false' 422 POST '/api/registro/postulante' '{"dni":"70000011","nombres":"Prueba","apellidos":"Terminos falsos","email":"terminos.falsos@example.pe","telefono":"999888772","password":"Clave123!","password2":"Clave123!","terms_accepted":false}'
esperar 'registro: nombres solo espacios' 422 POST '/api/registro/postulante' '{"dni":"70000021","nombres":"   ","apellidos":"Espacios","email":"nombresespacios@example.pe","telefono":"999888723","password":"Clave123!","password2":"Clave123!","terms_accepted":true}'
esperar 'registro: sin correo' 422 POST '/api/registro/postulante' '{"dni":"70000023","nombres":"Prueba","apellidos":"Sin correo","telefono":"999888725","password":"Clave123!","password2":"Clave123!","terms_accepted":true}'
esperar 'registro: sin teléfono' 422 POST '/api/registro/postulante' '{"dni":"70000025","nombres":"Prueba","apellidos":"Sin telefono","email":"sintelefono@example.pe","password":"Clave123!","password2":"Clave123!","terms_accepted":true}'
esperar 'registro: contraseñas distintas' 422 POST '/api/registro/postulante' '{"dni":"70000030","nombres":"Prueba","apellidos":"Distintas","email":"distintas@example.pe","telefono":"999888730","password":"Clave123!","password2":"Otra123!","terms_accepted":true}'
esperar 'registro: sin token de DNI' 422 POST '/api/registro/postulante' '{"dni":"70000040","nombres":"Prueba","apellidos":"Sin token","email":"sin.token.dni@example.pe","telefono":"999888740","password":"Clave123!","password2":"Clave123!","terms_accepted":true}'
TOKEN_DNI_SEED=$(token_dni 12345678)
esperar 'registro: DNI duplicado' 409 POST '/api/registro/postulante' "{\"dni\":\"12345678\",\"nombres\":\"Prueba\",\"apellidos\":\"Duplicado\",\"email\":\"nuevo.identidad@example.pe\",\"telefono\":\"999888777\",\"password\":\"Clave123!\",\"password2\":\"Clave123!\",\"terms_accepted\":true,\"dni_token\":\"$TOKEN_DNI_SEED\"}"
TOKEN_DNI_EMAIL=$(token_dni 70000002)
esperar 'registro: correo duplicado' 409 POST '/api/registro/postulante' "{\"dni\":\"70000002\",\"nombres\":\"Prueba\",\"apellidos\":\"Duplicado\",\"email\":\"admin@mdjlo.gob.pe\",\"telefono\":\"999888771\",\"password\":\"Clave123!\",\"password2\":\"Clave123!\",\"terms_accepted\":true,\"dni_token\":\"$TOKEN_DNI_EMAIL\"}"
TOKEN_DNI_PHONE=$(token_dni 70000003)
esperar 'registro: teléfono duplicado' 409 POST '/api/registro/postulante' "{\"dni\":\"70000003\",\"nombres\":\"Prueba\",\"apellidos\":\"Duplicado\",\"email\":\"nuevo.identidad2@example.pe\",\"telefono\":\"987654321\",\"password\":\"Clave123!\",\"password2\":\"Clave123!\",\"terms_accepted\":true,\"dni_token\":\"$TOKEN_DNI_PHONE\"}"

esperar 'solicitud: sin aceptación de términos' 422 POST '/api/solicitudes-empresa' '{"ruc":"20111111111","email":"empresa.sin.terminos@example.pe","telefono":"999888776","representante":"Prueba"}'
esperar 'solicitud: aceptación false' 422 POST '/api/solicitudes-empresa' '{"ruc":"20111111112","email":"empresa.terminos.falsos@example.pe","telefono":"999888777","representante":"Prueba","terms_accepted":false}'
esperar 'solicitud: representante solo espacios' 422 POST '/api/solicitudes-empresa' '{"ruc":"20111111118","email":"empresa.representante.espacios@example.pe","telefono":"999888745","representante":"   ","terms_accepted":true}'
esperar 'solicitud: RUC existente' 409 POST '/api/solicitudes-empresa' '{"ruc":"20601234567","email":"nuevo.empresa@example.pe","telefono":"999888775","representante":"Prueba","terms_accepted":true}'
esperar 'solicitud: correo existente' 409 POST '/api/solicitudes-empresa' '{"ruc":"20999999999","email":"admin@mdjlo.gob.pe","telefono":"999888774","representante":"Prueba","terms_accepted":true}'

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and d.get("data",{}).get("access_token"), "FAIL login admin";print(d["data"]["access_token"])')
esperar 'admin: alta usuario con correo existente' 409 POST '/api/admin/usuarios' '{"username":"prueba.identidad","nombres":"Prueba","apellidos":"Identidad","email":"admin@mdjlo.gob.pe","telefono":"988777111","password":"Clave123!","perfil_municipal":"admin"}' "Authorization: Bearer $TA"
esperar 'admin: alta empresa con RUC existente' 409 POST '/api/admin/empresas' '{"ruc":"20601234567","razon_social":"Duplicada SAC","password":"Clave123!","evaluacion_presencial":true}' "Authorization: Bearer $TA"

[ "$fallos" -eq 0 ] || exit 1
echo 'Identidad: todos los casos esperados pasaron.'
