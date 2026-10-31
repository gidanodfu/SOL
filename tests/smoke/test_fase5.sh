#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -u
cd "$(dirname "$0")/../../backend" || exit 1
fallos=0
B=http://127.0.0.1:8080
env 'storage.driver=local' php spark serve --host 127.0.0.1 > /tmp/opencode/spark.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

tok() { python3 -c 'import sys,json;d=json.load(sys.stdin);assert d.get("success") is True and isinstance(d.get("data"),dict) and d["data"].get("access_token"), "FAIL login sin access_token";print(d["data"]["access_token"])'; }
check_code() {
    nombre="$1"; esperado="$2"; real="$3"
    if [ "$real" = "$esperado" ]; then printf 'OK   %s\n' "$nombre"; else printf 'FAIL %s (%s, esperado %s)\n' "$nombre" "$real" "$esperado"; fallos=$((fallos + 1)); fi
}
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

# Imagen mínima válida para crear actividades completas (obligatoria).
php -r '$im=imagecreatetruecolor(640,360); imagefill($im,0,0,imagecolorallocate($im,20,100,170)); imagejpeg($im,"/tmp/sol-fase5-actividad.jpg",85); imagedestroy($im);'

crear_actividad() {
    local tipo="$1" nombre="$2" inicio="$3" fin="$4" lugar="$5" modalidad="$6" organizador="$7" descripcion="$8"
    curl -s -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA" \
        -F "tipo=$tipo" -F "nombre=$nombre" -F "fecha_inicio=$inicio" -F "fecha_fin=$fin" \
        -F "lugar=$lugar" -F "modalidad=$modalidad" -F "organizador=$organizador" \
        --form-string "descripcion=$descripcion" \
        -F 'imagen=@/tmp/sol-fase5-actividad.jpg;type=image/jpeg;filename=actividad.jpg'
}

echo "== ACTIVIDADES =="
curl -s -o /dev/null -w "fin<inicio http:%{http_code} (422)\n" -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria X","descripcion":"<p>Feria</p>","fecha_inicio":"2026-12-10 09:00:00","fecha_fin":"2026-12-01 17:00:00","lugar":"Plaza","modalidad":"presencial","organizador":"MDJLO"}'
curl -s -o /dev/null -w "modalidad inválida http:%{http_code} (422)\n" -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria X","descripcion":"<p>Feria</p>","fecha_inicio":"2026-12-10 09:00:00","fecha_fin":"2026-12-10 17:00:00","lugar":"Plaza","modalidad":"hibrida","organizador":"MDJLO"}'
ACT=$(crear_actividad "feria_empleo" "Feria de Empleo JLO" "2026-10-15 09:00:00" "2026-10-15 17:00:00" "Plaza Central" "presencial" "MDJLO" "<p>Feria de empleo</p>" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "programado->en_curso http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"en_curso"}'
curl -s -o /dev/null -w "en_curso->cancelado http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"cancelado"}'
curl -s -o /dev/null -w "cancelado->en_curso http:%{http_code} (409)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"en_curso"}'
curl -s -o /dev/null -w "cancelado->programado http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"programado"}'
curl -s -o /dev/null -w "update actividad http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria de Empleo JLO 2026","descripcion":"<p>Feria de empleo actualizada</p>","fecha_inicio":"2026-10-15 09:00:00","fecha_fin":"2026-10-15 18:00:00","modalidad":"mixta","lugar":"Plaza Central","organizador":"MDJLO"}'

# WebP: subida, almacenamiento local y entrega con MIME correcto.
php -r '$im=imagecreatetruecolor(16,16); imagefill($im,0,0,imagecolorallocate($im,20,100,170)); imagewebp($im,"/tmp/sol-fase5.webp",85); imagejpeg($im,"/tmp/sol-fase5.jpg",85); imagedestroy($im);'
check_code 'subir imagen WebP de actividad' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/actividades/$ACT/imagen" -H "Authorization: Bearer $TA" -F 'imagen=@/tmp/sol-fase5.webp;type=image/webp;filename=actividad.webp')"
curl -s -D /tmp/sol-fase5-webp.headers -o /tmp/sol-fase5-webp.body "$B/api/actividades/$ACT/imagen"
grep -qi '^Content-Type: image/webp' /tmp/sol-fase5-webp.headers \
    && printf 'OK   entrega de imagen WebP con image/webp\n' \
    || { printf 'FAIL entrega de imagen WebP sin image/webp\n'; fallos=$((fallos + 1)); }
cmp -s /tmp/sol-fase5-webp.body /tmp/sol-fase5.webp \
    && printf 'OK   cuerpo WebP almacenado y recuperado íntegro\n' \
    || { printf 'FAIL cuerpo WebP alterado\n'; fallos=$((fallos + 1)); }
printf 'RIFF\020\000\000\000WEBPcontenido-invalido' > /tmp/sol-fase5-invalid.webp
check_code 'rechazar WebP inválido' 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/actividades/$ACT/imagen" -H "Authorization: Bearer $TA" -F 'imagen=@/tmp/sol-fase5-invalid.webp;type=image/webp;filename=invalida.webp')"
check_code 'subir JPEG de actividad' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/admin/actividades/$ACT/imagen" -H "Authorization: Bearer $TA" -F 'imagen=@/tmp/sol-fase5.jpg;type=image/jpeg;filename=actividad.jpg')"
curl -s -D /tmp/sol-fase5-jpg.headers -o /tmp/sol-fase5-jpg.body "$B/api/actividades/$ACT/imagen"
grep -qi '^Content-Type: image/jpeg' /tmp/sol-fase5-jpg.headers \
    && printf 'OK   entrega JPEG conservada\n' \
    || { printf 'FAIL entrega JPEG alterada\n'; fallos=$((fallos + 1)); }

# Actividad independiente con fecha de fin pasada para comprobar que una
# actividad vencida no se publica aunque su estado persistido sea programado.
ACT_VENCIDA=$(crear_actividad "feria_empleo" "Feria vencida" "2026-10-15 09:00:00" "2026-10-15 17:00:00" "Plaza Central" "presencial" "MDJLO" "<p>Feria vencida</p>" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')

echo "== OPORTUNIDADES =="
curl -s -o /dev/null -w "enlace inválido http:%{http_code} (422)\n" -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"empleos_peru","titulo":"Vacantes","enlace":"no-es-url"}'
OP=$(curl -s -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"empleos_peru","titulo":"Operarios para Lima","enlace":"https://empleosperu.gob.pe/oferta/1","descripcion":"Convocatoria externa"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "mype local http:%{http_code} (201)\n" -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"mype_local","titulo":"Se busca ayudante de cocina"}'
curl -s -o /dev/null -w "ocultar oportunidad http:%{http_code} (200)\n" -X PUT "$B/api/admin/oportunidades/$OP/activacion" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"activo":false}'

echo "== DIFUSIÓN (postulante) =="
curl -s "$B/api/oportunidades" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(len(d),"oportunidad(es) visibles (oculta no debe contar)")'
# La actividad ACT_VENCIDA tiene fecha de fin pasada y quedó programada: ya no
# debe publicarse aunque su estado persistido siga siendo programado.
curl -s "$B/api/actividades" -H "Authorization: Bearer $TP" | ACT="$ACT_VENCIDA" python3 -c 'import os,sys,json; d=json.load(sys.stdin)["data"]; assert all(a.get("id") != int(os.environ["ACT"]) for a in d)' >/dev/null \
    && printf 'OK   actividad vencida fuera del listado público\n' \
    || { printf 'FAIL actividad vencida sigue en el listado público\n'; fallos=$((fallos + 1)); }

# ACT_VENCIDA tiene fecha de fin pasada: no debe publicarse.
curl -s "$B/api/actividades" -H "Authorization: Bearer $TP" | ACT="$ACT_VENCIDA" python3 -c 'import os,sys,json; d=json.load(sys.stdin)["data"]; assert all(a.get("id") != int(os.environ["ACT"]) for a in d)' >/dev/null \
    && printf 'OK   actividad vencida fuera del listado público\n' \
    || { printf 'FAIL actividad vencida sigue en el listado público\n'; fallos=$((fallos + 1)); }

HORAS_INICIO=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+10 days"));')
HORAS_FIN=$(php -r 'echo date("Y-m-d H:i:s", strtotime("+11 days"));')
ACT_FUT=$(crear_actividad "taller" "Taller futuro" "$HORAS_INICIO" "$HORAS_FIN" "Local municipal" "presencial" "MDJLO" "<p>Taller futuro</p>" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
ACT_CANCEL=$(crear_actividad "feria_empleo" "Feria cancelada" "$HORAS_INICIO" "$HORAS_FIN" "Local municipal" "presencial" "MDJLO" "<p>Feria cancelada</p>" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
ACT_FINAL=$(crear_actividad "capacitacion" "Capacitación finalizada" "$HORAS_INICIO" "$HORAS_FIN" "Local municipal" "presencial" "MDJLO" "<p>Capacitación finalizada</p>" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
check_code 'cancelar actividad futura' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/actividades/$ACT_CANCEL/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"cancelado"}')"
check_code 'finalizar actividad futura' 200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/admin/actividades/$ACT_FINAL/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"finalizado"}')"

curl -s "$B/api/actividades" -H "Authorization: Bearer $TP" | ACT_FUT="$ACT_FUT" ACT_CANCEL="$ACT_CANCEL" ACT_FINAL="$ACT_FINAL" python3 -c 'import os,sys,json; d=json.load(sys.stdin)["data"]; ids={int(a["id"]) for a in d}; assert int(os.environ["ACT_FUT"]) in ids and int(os.environ["ACT_CANCEL"]) not in ids and int(os.environ["ACT_FINAL"]) not in ids' >/dev/null \
    && printf 'OK   listado público: futura sí; cancelada/finalizada no\n' \
    || { printf 'FAIL reglas del listado público de actividades\n'; fallos=$((fallos + 1)); }

curl -s "$B/api/admin/actividades" -H "Authorization: Bearer $TA" | ACT="$ACT_VENCIDA" python3 -c 'import os,sys,json; d=json.load(sys.stdin)["data"]; a=next(x for x in d if int(x["id"])==int(os.environ["ACT"])); assert a["estado"]=="programado" and a["estado_efectivo"]=="finalizado"' >/dev/null \
    && printf 'OK   panel administrativo distingue estado persistido y efectivo\n' \
    || { printf 'FAIL panel administrativo no distingue estado efectivo\n'; fallos=$((fallos + 1)); }

curl -s "$B/api/admin/actividades?estado=finalizado" -H "Authorization: Bearer $TA" | ACT="$ACT_VENCIDA" python3 -c 'import os,sys,json; d=json.load(sys.stdin)["data"]; assert any(int(a["id"])==int(os.environ["ACT"]) for a in d)' >/dev/null \
    && printf 'OK   filtro Finalizadas incluye vencidas efectivas\n' \
    || { printf 'FAIL filtro Finalizadas no incluye vencidas efectivas\n'; fallos=$((fallos + 1)); }

curl -s "$B/api/admin/actividades?estado=programado" -H "Authorization: Bearer $TA" | ACT="$ACT_VENCIDA" python3 -c 'import os,sys,json; d=json.load(sys.stdin)["data"]; assert all(int(a["id"])!=int(os.environ["ACT"]) for a in d)' >/dev/null \
    && printf 'OK   filtro Programadas excluye vencidas efectivas\n' \
    || { printf 'FAIL filtro Programadas incluye vencidas efectivas\n'; fallos=$((fallos + 1)); }

echo "== PERMISOS: postulante no administra =="
curl -s -o /dev/null -w "postulante POST actividades http:%{http_code} (403)\n" -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria Y","fecha_inicio":"2026-12-10"}'

echo "== Dashboard municipal refleja el periodo =="
curl -s "$B/api/admin/dashboard" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("empresas:",d["empresas"]["total"],"| postulaciones:",sum(d["postulaciones"].values()),"| actividad_mensual:",len(d["actividad_mensual"]))'

echo
echo "FIN fase 5"
[ "$fallos" -eq 0 ] || exit 1
