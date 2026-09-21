#!/usr/bin/env python3
"""Validador offline de la especificación OpenAPI (sin dependencias externas).

Comprueba:
1. Sintaxis YAML y estructura OpenAPI 3.x.
2. Duplicados de operationId.
3. Que todos los $ref a componentes existan (schemas/responses/parameters/securitySchemes).
4. Que los métodos HTTP usados sean válidos.
5. Que los esquemas referenciados desde respuestas/parámetros/bodies existan.
6. Que cada operación tenga responses.
"""
import re
import sys

import yaml

HERE = "public/swagger/openapi.yaml"


def walk(obj, keys=()):
    """Itera recursivamente sobre el documento."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield (keys + (k,), v)
            yield from walk(v, keys + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield (keys + (str(i),), v)
            yield from walk(v, keys + (str(i),))


def main():
    with open(HERE, "r", encoding="utf-8") as f:
        spec = yaml.safe_load(f)

    errors, warnings = [], []

    # 1. Versión
    ver = str(spec.get("openapi", ""))
    if not ver.startswith("3."):
        errors.append(f"openapi.version = {ver!r}, se esperaba 3.x")
    if not spec.get("info"):
        errors.append("Falta bloque info")
    if not spec.get("paths"):
        errors.append("Falta bloque paths")

    comp = spec.get("components") or {}

    # 2 y 3. operationId duplicados + métodos válidos
    metodos_validos = {"get", "put", "post", "delete", "patch", "options", "head", "trace"}
    op_ids = {}
    for path, item in (spec.get("paths") or {}).items():
        for metodo, op in item.items():
            if metodo.startswith("x-") or metodo in ("parameters", "summary", "description"):
                continue
            if metodo not in metodos_validos:
                errors.append(f"path {path}: método HTTP no válido {metodo!r}")
                continue
            if not isinstance(op, dict):
                continue
            oid = op.get("operationId")
            if oid:
                if oid in op_ids:
                    errors.append(f"operationId duplicado {oid!r} ({path} y {op_ids[oid]})")
                else:
                    op_ids[oid] = path
            if "responses" not in op or not isinstance(op.get("responses"), dict) or not op["responses"]:
                errors.append(f"path {path} {metodo.upper()}: falta responses")

    # 4. Existencia de $ref
    ref_re = re.compile(r"^#/(components|tags)")
    refs_encontrados = []
    for keys, v in walk(spec):
        if isinstance(v, str) and v.startswith("#/components/"):
            refs_encontrados.append((keys, v))

    def componente_existe(apuntador):
        # '#/components/schemas/Name'
        partes = apuntador.lstrip("#/").split("/")
        node = spec
        for p in partes:
            if not isinstance(node, dict) or p not in node:
                return False
            node = node[p]
        return True

    for keys, ref in refs_encontrados:
        if not componente_existe(ref):
            errors.append(f"$ref roto en {'.'.join(keys)}: {ref}")

    # 5. Referencias internas de schemas dentro de properties/items/allOf/oneOf etc. ya
    #    cubiertas por el barrido anterior (todo $ref empieza por #/components/).
    # 6. Parámetros con referencia a components.parameters deben existir (barrido anterior).

    # Verificación de nombres de archivo/ejemplos: informe compacto
    if "tags" not in spec or not spec["tags"]:
        warnings.append("No hay tags definidos")
    if "securitySchemes" not in (comp or {}):
        warnings.append("No hay securitySchemes (las rutas usan bearerAuth)")

    if not errors and not warnings:
        print(f"OK: {HERE} válido (openapi {ver}), {len(op_ids)} operationId únicos.")
        return 0

    for e in errors:
        print(f"[ERROR] {e}")
    for w in warnings:
        print(f"[WARN ] {w}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
