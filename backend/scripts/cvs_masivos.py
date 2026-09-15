#!/usr/bin/env python3
"""Sube CV ficticios por el flujo real de la API (POST /api/postulante/cv).

Requisitos:
  - BD sembrada con DatosMasivosSeeder (genera writable/masivos_manifest.json).
  - API corriendo (php spark serve). Usar ./seed_cvs_masivos.sh para todo en uno.

Uso:  python3 cvs_masivos.py [http://127.0.0.1:8080]
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFIESTO = os.path.join(BACKEND, 'writable', 'masivos_manifest.json')

SECTORES = [
    'construcción y obras civiles', 'agroexportación', 'textil y confecciones',
    'alimentos y bebidas', 'logística y transporte', 'salud', 'tecnología',
    'producción industrial', 'servicios generales', 'comercio',
]
EMPRESAS_EXP = [
    'Constructora del Norte SAC', 'Agro Santa Rosa SA', 'Textiles Lambayeque SAC',
    'Corporación Alimentaria SA', 'Transportes Rápidos EIRL', 'Clínica San Martín SAC',
    'TecnoSoluciones Perú SAC', 'Industrias Chiclayo SAC', 'Servicios Generales JLO',
    'Comercializadora Valle Verde SA',
]


def limpiar(texto: str) -> str:
    texto = unicodedata.normalize('NFKD', texto)
    texto = ''.join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r'[^\x20-\x7E]', '?', texto)


def pdf_minimo(dni: str, contenido: list) -> bytes:
    """PDF 1.4 minimalista con Helvetica (sin dependencias)."""
    lineas = []
    for parrafo in contenido:
        for linea in parrafo.split('\n'):
            while len(linea) > 96:
                lineas.append(linea[:96])
                linea = linea[96:]
            lineas.append(linea)
        lineas.append('')
    stream = '\n'.join(f'BT /F1 10 Tf 50 {730 - i * 13} Td ({limpiar(l)}) Tj ET' if l else '' for i, l in enumerate(lineas[:52]))
    contenido_stream = f"0 0 595 842 re W n\n{stream}\n".encode('latin-1')

    objetos = []
    objetos.append(b'<< /Type /Catalog /Pages 2 0 R >>')
    objetos.append(b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    objetos.append(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>')
    objetos.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    objetos.append(b'<< /Length ' + str(len(contenido_stream)).encode() + b' >>\nstream\n' + contenido_stream + b'endstream')

    salida = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for i, obj in enumerate(objetos, start=1):
        offsets.append(len(salida))
        salida += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(salida)
    salida += f'xref\n0 {len(objetos) + 1}\n'.encode()
    salida += b'0000000000 65535 f \n'
    for off in offsets[1:]:
        salida += f'{off:010d} 00000 n \n'.encode()
    salida += (f'trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n').encode()
    return bytes(salida)


def contenido_cv(item: dict) -> list:
    exp_anios = 1 + (int(item['dni'][-2:]) % 12)
    empresa = EMPRESAS_EXP[int(item['dni'][-1]) % len(EMPRESAS_EXP)]
    sector = SECTORES[int(item['dni'][-1]) % len(SECTORES)]
    return [
        f'CURRICULUM VITAE - {item["nombre"]}',
        '',
        f'DNI: {item["dni"]}   (documento ficticio de prueba)',
        '',
        'PERFIL PROFESIONAL',
        f'{item["profesion"]} con {exp_anios} anos de experiencia en el rubro de {sector}.',
        'Persona responsable, proactiva y con vocacion de servicio; acostumbrada a',
        'trabajar en equipo y cumplir metas bajo presion.',
        '',
        'EXPERIENCIA LABORAL',
        f'{exp_anios} anos en {empresa}, desempenando labores propias del puesto',
        'con crecimiento progresivo de funciones y participacion en mejoras de proceso.',
        '',
        'EDUCACION',
        'Secundaria completa (Colegio ficticio). Formacion tecnica complementaria en',
        'cursos de especializacion del rubro (instituciones ficticias).',
        '',
        'HABILIDADES',
        'Trabajo en equipo, comunicacion efectiva, puntualidad, aprendizaje rapido,',
        'manejo de herramientas ofimaticas y disposicion para capacitacion continua.',
        '',
        'IDIOMAS',
        'Espanol (nativo). Ingles (nivel basico-intermedio segun convocatoria).',
        '',
        'DISPOSICION',
        'Disponibilidad inmediata para incorporacion. Referencias laborales y',
        'personales ficticias disponibles a solicitud del proceso de seleccion.',
        '',
        'Este CV es un documento 100% ficticio generado para pruebas del sistema.',
    ]


def llamar(args: list, **kw):
    return subprocess.run(args, capture_output=True, text=True, timeout=60, **kw)


def login(dni: str, password: str) -> str:
    r = llamar(['curl', '-s', '-X', 'POST', f'{BASE}/api/auth/login',
                '-H', 'Content-Type: application/json',
                '-d', json.dumps({'username': dni, 'password': password})])
    datos = json.loads(r.stdout or '{}')
    return (datos.get('data') or {}).get('access_token', '')


def subir_cv(token: str, ruta: str) -> int:
    r = llamar(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}',
                '-X', 'POST', f'{BASE}/api/postulante/cv',
                '-H', f'Authorization: Bearer {token}',
                '-F', f'cv=@{ruta};type=application/pdf'])
    return int(r.stdout or 0)


def main() -> int:
    if not os.path.exists(MANIFIESTO):
        print('No existe writable/masivos_manifest.json. Ejecute primero DatosMasivosSeeder.')
        return 2
    with open(MANIFIESTO, encoding='utf-8') as f:
        items = json.load(f)

    tmp = tempfile.mkdtemp(prefix='cvs_masivos_')
    ok = 0
    fallas = []
    try:
        for i, item in enumerate(items, start=1):
            dni = item['dni']
            ruta = os.path.join(tmp, f'cv-{dni}.pdf')
            with open(ruta, 'wb') as f:
                f.write(pdf_minimo(dni, contenido_cv(item)))
            token = login(dni, item['password'])
            if not token:
                fallas.append(f'{dni}: login fallo')
                continue
            codigo = subir_cv(token, ruta)
            if codigo != 201:
                fallas.append(f'{dni}: upload http {codigo}')
                continue
            ok += 1
            if item.get('segunda_version'):
                with open(ruta, 'wb') as f:
                    f.write(pdf_minimo(dni, contenido_cv(item) + ['', 'v2: actualizacion ficticia del CV.']))
                codigo = subir_cv(token, ruta)
                if codigo == '201':
                    ok += 1
                else:
                    fallas.append(f'{dni}: segunda version http {codigo}')
            if i % 10 == 0:
                print(f'  {i}/{len(items)} procesados ({ok} subidas ok)...', flush=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f'CV subidos correctamente: {ok}.')
    if fallas:
        print('Fallos:')
        for f in fallas[:15]:
            print('  -', f)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
