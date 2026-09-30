// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Bold, Eraser, Italic, Link2, List, ListOrdered, Underline } from 'lucide-react';
import { TEXTO_AVISO, TEXTO_MAX, esEnlaceSeguro } from '../utils';

const TIENE_HTML = /<(p|br|strong|b|em|i|u|ul|ol|li|a)(\s|>|\/)/i;

function escapar(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convierte texto plano heredado en párrafos HTML; si ya es HTML lo deja igual.
 * Así los registros antiguos pueden editarse sin perder sus saltos de línea.
 */
function normalizarEntrada(valor) {
  const v = String(valor ?? '');
  if (v === '' || TIENE_HTML.test(v)) return v;

  return v
    .split(/\n{2,}/)
    .map((bloque) => `<p>${escapar(bloque).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Editor de texto enriquecido (RTE) del sistema. Toolbar mínima acordada:
 * negrita, cursiva, subrayado, viñetas, numerada, enlace y limpiar formato.
 * El contador mide el TEXTO VISIBLE (misma definición que el backend), no el
 * HTML. Se carga de forma diferida desde los formularios que lo usan.
 */
export default function EditorTextoEnriquecido({
  etiqueta,
  valor,
  onChange,
  placeholder = 'Escribe aquí…',
  max = TEXTO_MAX,
  aviso = TEXTO_AVISO,
}) {
  // El contenido inicial se aplica al CREAR la instancia (ruta no rechazada por
  // CharacterCount). No se usa setContent posterior: el componente se re-monta
  // por registro (key) desde los formularios, así que el valor llega siempre al
  // momento de la creación. Esto evita que un registro largo/heredado se quede
  // sin cargar por el filtro de transacciones de CharacterCount.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https'],
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
      // `limit` bloquea el crecimiento por tecleo/pegado, pero `autoTrim: false`
      // impide el recorte silencioso del contenido existente. El texto cuenta en
      // code points (coincide con mb_strlen del backend en texto visible).
      CharacterCount.configure({
        limit: max,
        autoTrim: false,
        mode: 'textSize',
        textCounter: (texto) => [...texto].length,
      }),
    ],
    content: normalizarEntrada(valor),
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e || e.isDestroyed) return null;
      // Misma definición que el backend: texto visible sin etiquetas y sin
      // separadores artificiales entre bloques (doc.textContent).
      const texto = e.state.doc.textContent || '';
      const limpio = texto.trim();
      return {
        negrita: e.isActive('bold'),
        cursiva: e.isActive('italic'),
        subrayado: e.isActive('underline'),
        vinietas: e.isActive('bulletList'),
        numerada: e.isActive('orderedList'),
        enlace: e.isActive('link'),
        caracteres: [...texto].length,
        palabras: limpio ? limpio.split(/\s+/).length : 0,
      };
    },
  });

  // UI propia del editor para insertar/editar enlaces (sin prompt nativo).
  const [enlaceAbierto, setEnlaceAbierto] = useState(false);
  const [urlEnlace, setUrlEnlace] = useState('');

  if (!editor || editor.isDestroyed || !estado) return <p className="vacio">Cargando editor…</p>;

  const abrirEnlace = () => {
    if (!editor || editor.isDestroyed) return;
    setUrlEnlace(editor.getAttributes('link').href || '');
    setEnlaceAbierto(true);
  };

  const quitarEnlace = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setEnlaceAbierto(false);
  };

  const aplicarEnlace = () => {
    const escrita = urlEnlace.trim();
    if (escrita === '') {
      quitarEnlace();
      return;
    }
    const destino = esEnlaceSeguro(escrita) ? escrita : `https://${escrita}`;
    if (!esEnlaceSeguro(destino)) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: destino }).run();
    setEnlaceAbierto(false);
  };

  // Ningún comando debe ejecutarse si la instancia dejó de estar viva.
  const comando = (fn) => () => {
    if (!editor || editor.isDestroyed) return;
    fn(editor);
  };

  const acciones = [
    { id: 'negrita', icono: Bold, etiqueta: 'Negrita', activo: estado.negrita, ejecutar: comando((e) => e.chain().focus().toggleBold().run()) },
    { id: 'cursiva', icono: Italic, etiqueta: 'Cursiva', activo: estado.cursiva, ejecutar: comando((e) => e.chain().focus().toggleItalic().run()) },
    { id: 'subrayado', icono: Underline, etiqueta: 'Subrayado', activo: estado.subrayado, ejecutar: comando((e) => e.chain().focus().toggleUnderline().run()) },
    { id: 'vinietas', icono: List, etiqueta: 'Lista con viñetas', activo: estado.vinietas, ejecutar: comando((e) => e.chain().focus().toggleBulletList().run()) },
    { id: 'numerada', icono: ListOrdered, etiqueta: 'Lista numerada', activo: estado.numerada, ejecutar: comando((e) => e.chain().focus().toggleOrderedList().run()) },
    { id: 'enlace', icono: Link2, etiqueta: 'Insertar enlace', activo: estado.enlace, ejecutar: abrirEnlace },
    {
      id: 'limpiar',
      icono: Eraser,
      etiqueta: 'Limpiar formato',
      activo: false,
      ejecutar: comando((e) => e.chain().focus().unsetAllMarks().clearNodes().run()),
    },
  ];

  const superaLimite = estado.caracteres > max;
  const cercaDelLimite = !superaLimite && estado.caracteres >= aviso;

  return (
    <div className="rte">
      {etiqueta && <span className="rte-etiqueta">{etiqueta}</span>}

      <div className="rte-caja">
        <div className="rte-toolbar" role="toolbar" aria-label={`Formato de ${etiqueta || 'texto'}`}>
          {acciones.map(({ id, icono: Icono, etiqueta: titulo, activo, ejecutar }) => (
            <button
              key={id}
              type="button"
              className={`rte-boton${activo ? ' activo' : ''}`}
              onClick={ejecutar}
              title={titulo}
              aria-label={titulo}
              aria-pressed={activo}
            >
              <Icono size={15} aria-hidden="true" />
            </button>
          ))}
          <span className={`rte-contador${superaLimite ? ' excedido' : cercaDelLimite ? ' aviso' : ''}`}>
            {estado.palabras} palabra(s) · {estado.caracteres}/{max} caracteres
          </span>
        </div>

        {enlaceAbierto && (
          <div className="rte-enlace">
            <input
              className="rte-enlace-input"
              type="url"
              value={urlEnlace}
              onChange={(e) => setUrlEnlace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); aplicarEnlace(); }
                if (e.key === 'Escape') setEnlaceAbierto(false);
              }}
              placeholder="https://…"
              aria-label="URL del enlace"
              autoFocus
            />
            <button type="button" className="rte-boton-texto" onClick={aplicarEnlace}>Aplicar</button>
            {estado.enlace && <button type="button" className="rte-boton-texto" onClick={quitarEnlace}>Quitar</button>}
            <button type="button" className="rte-boton-texto" onClick={() => setEnlaceAbierto(false)}>Cancelar</button>
          </div>
        )}

        <EditorContent editor={editor} />
      </div>

      {cercaDelLimite && (
        <span className="rte-mensaje aviso">Te acercas al límite de {max} caracteres de texto.</span>
      )}
      {superaLimite && (
        <span className="rte-mensaje excedido">Superaste el límite de {max} caracteres de texto; reduce el contenido para guardar.</span>
      )}
    </div>
  );
}
