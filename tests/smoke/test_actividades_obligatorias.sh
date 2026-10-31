#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Actividades: todos los campos de "Nueva actividad" son obligatorios en
# frontend (cubierto por pruebas estáticas) y backend. La imagen viaja en la
# misma creación y no quedan registros parciales.
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
LOG=/tmp/opencode/spark_actividades_obligatorias.log
fallos=0
pasos=0

env 'storage.driver=local' php spark serve --host 127.0.0.1 > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

paso() { printf '\n== %s ==\n' "$1"; }
tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    pasos=$((pasos + 1))
    if [ "$real" = "$esperado" ]; then printf 'OK   %-52s %s\n' "$nombre" "$real"; else printf 'FAIL %-52s %s (esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}

esperar_campo() {
    archivo="$1"; campo="$2"; mensaje="$3"
    pasos=$((pasos + 1))
    if python3 - "$archivo" "$campo" "$mensaje" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is False, d
campos = d.get('campos') or {}
assert campos.get(sys.argv[2]) == sys.argv[3], campos
PY
    then
        printf 'OK   %-52s %s\n' "error asociado a $campo" "$campo"
    else
        printf 'FAIL %-52s %s\n' "error asociado a $campo" "$campo"
        fallos=$((fallos + 1))
    fi
}

TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)

php -r '
$im = imagecreatetruecolor(640, 360);
imagefill($im, 0, 0, imagecolorallocate($im, 20, 100, 170));
imagejpeg($im, "/tmp/opencode/act-valida.jpg", 85);
imagedestroy($im);
$im = imagecreatetruecolor(800, 450);
imagefill($im, 0, 0, imagecolorallocate($im, 170, 80, 20));
imagejpeg($im, "/tmp/opencode/act-valida2.jpg", 85);
imagedestroy($im);
$im = imagecreatetruecolor(2000, 1000);
imagefill($im, 0, 0, imagecolorallocate($im, 20, 170, 80));
imagejpeg($im, "/tmp/opencode/act-grande.jpg", 85);
imagedestroy($im);
'
printf 'esto no es una imagen' > /tmp/opencode/act-invalida.jpg
dd if=/dev/zero of=/tmp/opencode/act-pesada.jpg bs=1M count=2 status=none
printf 'x' >> /tmp/opencode/act-pesada.jpg

BASE='{"tipo":"taller","nombre":"Taller de prueba","descripcion":"<p>Contenido real</p>","fecha_inicio":"2026-12-01 09:00:00","fecha_fin":"2026-12-01 11:00:00","lugar":"Plaza Central","modalidad":"presencial","organizador":"MDJLO"}'

mensaje_campo() {
    case "$1" in
        tipo) echo 'Selecciona el tipo de actividad.' ;;
        nombre) echo 'El nombre de la actividad es obligatorio.' ;;
        fecha_inicio) echo 'Indica la fecha y hora de inicio.' ;;
        fecha_fin) echo 'Indica la fecha y hora de finalización.' ;;
        modalidad) echo 'Selecciona una modalidad.' ;;
        lugar) echo 'El lugar de realización es obligatorio.' ;;
        organizador) echo 'Indica quién organiza la actividad.' ;;
        descripcion) echo 'La descripción de la actividad es obligatoria.' ;;
    esac
}

post_json() {
    curl -s -o "$2" -w '%{http_code}' -X POST "$B/api/admin/actividades" \
        -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "$1"
}

post_actividad() {
    curl -s -o "$1" -w '%{http_code}' -X POST "$B/api/admin/actividades" \
        -H "Authorization: Bearer $TA" \
    -H 'Expect:' \
        -F "tipo=${2}" -F "nombre=${3}" --form-string "descripcion=${4}" \
        -F "fecha_inicio=${5}" -F "fecha_fin=${6}" -F "lugar=${7}" \
        -F "modalidad=${8}" -F "organizador=${9}" \
        -F "imagen=@${10};type=image/jpeg;filename=actividad.jpg"
}

paso "1. cada campo obligatorio, con su mensaje y sin crear registros"
for campo in tipo nombre fecha_inicio fecha_fin modalidad lugar organizador descripcion; do
    python3 - "$campo" "$BASE" > /tmp/opencode/act-missing.json <<'PY'
import json, sys
d = json.loads(sys.argv[2])
d.pop(sys.argv[1], None)
print(json.dumps(d))
PY
    CODE=$(post_json @/tmp/opencode/act-missing.json /tmp/opencode/act-missing.out)
    check_code "crear sin $campo" 422 "$CODE"
    esperar_campo /tmp/opencode/act-missing.out "$campo" "$(mensaje_campo "$campo")"
done

CODE=$(post_json '{}' /tmp/opencode/act-vacia.out)
check_code 'crear completamente vacío' 422 "$CODE"
python3 - /tmp/opencode/act-vacia.out <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d.get('success') is False
esperados = {'tipo', 'nombre', 'fecha_inicio', 'fecha_fin', 'modalidad', 'lugar', 'organizador', 'descripcion'}
assert set((d.get('campos') or {}).keys()) == esperados, d.get('campos')
print('OK   8 campos vacíos reportados')
PY
[ $? -eq 0 ] || { echo 'FAIL conjunto de campos vacíos incorrecto'; fallos=$((fallos + 1)); }

CODE=$(post_json '{}' /tmp/opencode/act-count-antes.json)
ANTES=$(curl -s "$B/api/admin/actividades" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')

paso "2. valores inválidos y límites"
python3 - "$BASE" > /tmp/opencode/act-espacios.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['nombre'] = '   '
print(json.dumps(d))
PY
CODE=$(post_json @/tmp/opencode/act-espacios.json /tmp/opencode/act-espacios.out)
check_code 'nombre solo con espacios' 422 "$CODE"
esperar_campo /tmp/opencode/act-espacios.out nombre 'El nombre de la actividad es obligatorio.'

python3 - "$BASE" > /tmp/opencode/act-desc-vacia.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['descripcion'] = '<p><br></p>'
print(json.dumps(d))
PY
CODE=$(post_json @/tmp/opencode/act-desc-vacia.json /tmp/opencode/act-desc-vacia.out)
check_code 'descripción HTML vacía' 422 "$CODE"
esperar_campo /tmp/opencode/act-desc-vacia.out descripcion 'La descripción de la actividad es obligatoria.'

python3 - "$BASE" > /tmp/opencode/act-fin-antes.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['fecha_fin'] = '2026-11-01 09:00:00'
print(json.dumps(d))
PY
CODE=$(post_json @/tmp/opencode/act-fin-antes.json /tmp/opencode/act-fin-antes.out)
check_code 'fin anterior al inicio' 422 "$CODE"
esperar_campo /tmp/opencode/act-fin-antes.out fecha_fin 'La fecha de finalización no puede ser anterior a la fecha de inicio.'

python3 - "$BASE" > /tmp/opencode/act-tipo-malo.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['tipo'] = 'concierto'
print(json.dumps(d))
PY
CODE=$(post_json @/tmp/opencode/act-tipo-malo.json /tmp/opencode/act-tipo-malo.out)
check_code 'tipo inexistente' 422 "$CODE"
esperar_campo /tmp/opencode/act-tipo-malo.out tipo 'Selecciona un tipo de actividad válido.'

python3 - "$BASE" > /tmp/opencode/act-modalidad-mala.json <<'PY'
import json, sys
d = json.loads(sys.argv[1]); d['modalidad'] = 'hibrida'
print(json.dumps(d))
PY
CODE=$(post_json @/tmp/opencode/act-modalidad-mala.json /tmp/opencode/act-modalidad-mala.out)
check_code 'modalidad inválida' 422 "$CODE"
esperar_campo /tmp/opencode/act-modalidad-mala.out modalidad 'Selecciona una modalidad válida.'

paso "3. imagen obligatoria, tamaño, contenido y dimensiones"
CODE=$(post_json "$BASE" /tmp/opencode/act-sin-imagen.out)
check_code 'crear sin imagen' 422 "$CODE"
esperar_campo /tmp/opencode/act-sin-imagen.out imagen 'Debes subir una imagen para la actividad.'

CODE=$(curl -s -o /tmp/opencode/act-pesada.out -w '%{http_code}' -X POST "$B/api/admin/actividades" \
    -H "Authorization: Bearer $TA" \
    -H 'Expect:' \
    -F 'tipo=taller' -F 'nombre=Actividad pesada' --form-string 'descripcion=<p>Contenido</p>' \
    -F 'fecha_inicio=2026-12-01 09:00:00' -F 'fecha_fin=2026-12-01 11:00:00' \
    -F 'lugar=Plaza Central' -F 'modalidad=presencial' -F 'organizador=MDJLO' \
    -F 'imagen=@/tmp/opencode/act-pesada.jpg;type=image/jpeg;filename=pesada.jpg')
check_code 'imagen superior a 2 MB' 422 "$CODE"
esperar_campo /tmp/opencode/act-pesada.out imagen 'La imagen supera el tamaño máximo de 2 MB.'

CODE=$(curl -s -o /tmp/opencode/act-invalida.out -w '%{http_code}' -X POST "$B/api/admin/actividades" \
    -H "Authorization: Bearer $TA" \
    -H 'Expect:' \
    -F 'tipo=taller' -F 'nombre=Actividad inválida' --form-string 'descripcion=<p>Contenido</p>' \
    -F 'fecha_inicio=2026-12-01 09:00:00' -F 'fecha_fin=2026-12-01 11:00:00' \
    -F 'lugar=Plaza Central' -F 'modalidad=presencial' -F 'organizador=MDJLO' \
    -F 'imagen=@/tmp/opencode/act-invalida.jpg;type=image/jpeg;filename=invalida.jpg')
check_code 'imagen con contenido inválido' 422 "$CODE"
esperar_campo /tmp/opencode/act-invalida.out imagen 'El tipo de la imagen no es válido.'

CODE=$(curl -s -o /tmp/opencode/act-grande.out -w '%{http_code}' -X POST "$B/api/admin/actividades" \
    -H "Authorization: Bearer $TA" \
    -H 'Expect:' \
    -F 'tipo=taller' -F 'nombre=Actividad grande' --form-string 'descripcion=<p>Contenido</p>' \
    -F 'fecha_inicio=2026-12-01 09:00:00' -F 'fecha_fin=2026-12-01 11:00:00' \
    -F 'lugar=Plaza Central' -F 'modalidad=presencial' -F 'organizador=MDJLO' \
    -F 'imagen=@/tmp/opencode/act-grande.jpg;type=image/jpeg;filename=grande.jpg')
check_code 'imagen superior a 1920 × 1080' 422 "$CODE"
esperar_campo /tmp/opencode/act-grande.out imagen 'La imagen supera la resolución máxima de 1920 × 1080 px.'

DESPUES=$(curl -s "$B/api/admin/actividades" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))')
[ "$ANTES" = "$DESPUES" ] && echo 'OK   los rechazos no crearon actividades' || { echo 'FAIL los rechazos crearon registros parciales'; fallos=$((fallos + 1)); }

paso "4. creación válida con todos los campos"
CODE=$(post_actividad /tmp/opencode/act-creada.out taller 'Taller completo' '<p>Agenda <strong>real</strong></p>' '2026-12-01 09:00:00' '2026-12-01 11:00:00' 'Plaza Central' presencial MDJLO /tmp/opencode/act-valida.jpg)
check_code 'crear actividad completa' 201 "$CODE"
AID=$(python3 -c 'import json;print(json.load(open("/tmp/opencode/act-creada.out"))["data"]["id"])')
IMAGEN_ANTES=$(curl -s -o /tmp/opencode/act-imagen-antes.jpg -w '%{http_code}' "$B/api/actividades/$AID/imagen")
check_code 'imagen de la actividad creada' 200 "$IMAGEN_ANTES"
grep -qi '^Content-Type: image/jpeg' <(curl -s -D - -o /dev/null "$B/api/actividades/$AID/imagen") && echo 'OK   imagen servida como image/jpeg' || { echo 'FAIL imagen sin MIME correcto'; fallos=$((fallos + 1)); }
cmp -s /tmp/opencode/act-imagen-antes.jpg /tmp/opencode/act-valida.jpg && echo 'OK   imagen almacenada íntegra' || { echo 'FAIL imagen almacenada alterada'; fallos=$((fallos + 1)); }

paso "5. edición conservando o reemplazando la imagen"
CODE=$(curl -s -o /tmp/opencode/act-edit.out -w '%{http_code}' -X PUT "$B/api/admin/actividades/$AID" \
    -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d '{"tipo":"taller","nombre":"Taller completo editado","descripcion":"<p>Agenda editada</p>","fecha_inicio":"2026-12-01 09:00:00","fecha_fin":"2026-12-01 12:00:00","lugar":"Plaza Central","modalidad":"mixta","organizador":"MDJLO"}')
check_code 'editar sin reemplazar imagen' 200 "$CODE"
IMAGEN_SIN_CAMBIOS=$(curl -s -o /tmp/opencode/act-imagen-sin-cambios.jpg -w '%{http_code}' "$B/api/actividades/$AID/imagen")
check_code 'la imagen existente se conserva al editar' 200 "$IMAGEN_SIN_CAMBIOS"
cmp -s /tmp/opencode/act-imagen-sin-cambios.jpg /tmp/opencode/act-valida.jpg && echo 'OK   bytes de la imagen conservados' || { echo 'FAIL la edición alteró la imagen existente'; fallos=$((fallos + 1)); }

CODE=$(curl -s -o /tmp/opencode/act-edit-img.out -w '%{http_code}' -X POST "$B/api/admin/actividades/$AID/imagen" \
    -H "Authorization: Bearer $TA" \
    -H 'Expect:' \
    -F 'imagen=@/tmp/opencode/act-valida2.jpg;type=image/jpeg;filename=nueva.jpg')
check_code 'reemplazar imagen de la actividad' 200 "$CODE"
CODE=$(curl -s -o /tmp/opencode/act-edit-img.out -w '%{http_code}' -X PUT "$B/api/admin/actividades/$AID" \
    -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
    -d '{"tipo":"taller","nombre":"Taller completo editado","descripcion":"<p>Agenda editada</p>","fecha_inicio":"2026-12-01 09:00:00","fecha_fin":"2026-12-01 12:00:00","lugar":"Plaza Central","modalidad":"mixta","organizador":"MDJLO"}')
check_code 'editar tras reemplazar la imagen' 200 "$CODE"
IMAGEN_NUEVA=$(curl -s -o /tmp/opencode/act-imagen-nueva.jpg -w '%{http_code}' "$B/api/actividades/$AID/imagen")
check_code 'imagen reemplazada disponible' 200 "$IMAGEN_NUEVA"
cmp -s /tmp/opencode/act-imagen-nueva.jpg /tmp/opencode/act-valida2.jpg && echo 'OK   imagen nueva almacenada íntegra' || { echo 'FAIL la imagen nueva no sustituyó a la anterior'; fallos=$((fallos + 1)); }

CODE=$(curl -s -o /tmp/opencode/act-edit-vacia.out -w '%{http_code}' -X PUT "$B/api/admin/actividades/$AID" \
    -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{}')
check_code 'editar sin campos obligatorios' 422 "$CODE"
esperar_campo /tmp/opencode/act-edit-vacia.out nombre 'El nombre de la actividad es obligatorio.'

echo
if [ "$fallos" -ne 0 ] && [ -f "$LOG" ]; then
    echo '--- log del servidor de pruebas ---'
    tail -100 "$LOG"
    echo '--- log de la aplicación ---'
    find writable/logs -maxdepth 1 -type f -name 'log-*.log' -print -exec tail -120 {} \; 2>/dev/null
fi
echo 'FIN test_actividades_obligatorias'
[ "$fallos" -eq 0 ] || exit 1
