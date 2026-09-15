#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/../../backend" || exit 1
B=http://127.0.0.1:8080
env 'storage.driver=local' php spark serve > /tmp/opencode/spark.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do curl -s -o /dev/null "$B/" && break; sleep 0.5; done

tok() { python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["access_token"])'; }
TA=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin123!"}' | tok)
TP=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"12345678","password":"Postu123!"}' | tok)

echo "== ACTIVIDADES =="
curl -s -o /dev/null -w "fin<inicio http:%{http_code} (422)\n" -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria X","fecha_inicio":"2026-12-10","fecha_fin":"2026-12-01"}'
curl -s -o /dev/null -w "modalidad inválida http:%{http_code} (422)\n" -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria X","fecha_inicio":"2026-12-10","modalidad":"hibrida"}'
ACT=$(curl -s -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria de Empleo JLO","fecha_inicio":"2026-10-15 09:00:00","fecha_fin":"2026-10-15 17:00:00","lugar":"Plaza Central","modalidad":"presencial"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "programado->en_curso http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"en_curso"}'
curl -s -o /dev/null -w "en_curso->cancelado http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"cancelado"}'
curl -s -o /dev/null -w "cancelado->en_curso http:%{http_code} (409)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"en_curso"}'
curl -s -o /dev/null -w "cancelado->programado http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT/estado" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"estado":"programado"}'
curl -s -o /dev/null -w "update actividad http:%{http_code} (200)\n" -X PUT "$B/api/admin/actividades/$ACT" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria de Empleo JLO 2026","fecha_inicio":"2026-10-15 09:00:00","modalidad":"mixta","lugar":"Plaza Central"}'

echo "== OPORTUNIDADES =="
curl -s -o /dev/null -w "enlace inválido http:%{http_code} (422)\n" -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"empleos_peru","titulo":"Vacantes","enlace":"no-es-url"}'
OP=$(curl -s -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"empleos_peru","titulo":"Operarios para Lima","enlace":"https://empleosperu.gob.pe/oferta/1","descripcion":"Convocatoria externa"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["id"])')
curl -s -o /dev/null -w "mype local http:%{http_code} (201)\n" -X POST "$B/api/admin/oportunidades" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"fuente":"mype_local","titulo":"Se busca ayudante de cocina"}'
curl -s -o /dev/null -w "ocultar oportunidad http:%{http_code} (200)\n" -X PUT "$B/api/admin/oportunidades/$OP/activacion" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"activo":false}'

echo "== DIFUSIÓN (postulante) =="
curl -s "$B/api/oportunidades" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(len(d),"oportunidad(es) visibles (oculta no debe contar)")'
curl -s "$B/api/actividades" -H "Authorization: Bearer $TP" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print(len(d),"actividad(es) programadas/en curso (solo programada esperada)")'

echo "== PERMISOS: postulante no administra =="
curl -s -o /dev/null -w "postulante POST actividades http:%{http_code} (403)\n" -X POST "$B/api/admin/actividades" -H "Authorization: Bearer $TP" -H 'Content-Type: application/json' -d '{"tipo":"feria_empleo","nombre":"Feria Y","fecha_inicio":"2026-12-10"}'

echo "== Dashboard municipal refleja el periodo =="
curl -s "$B/api/admin/dashboard" -H "Authorization: Bearer $TA" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("empresas:",d["empresas"]["total"],"| postulaciones:",sum(d["postulaciones"].values()),"| actividad_mensual:",len(d["actividad_mensual"]))'

echo
echo "FIN fase 5"
