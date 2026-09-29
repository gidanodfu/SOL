// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';
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
  const origenInterno = useRef(false);
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
      CharacterCount.configure({ limit: max }),
    ],
    content: normalizarEntrada(valor),
    onUpdate: ({ editor: e }) => {
      origenInterno.current = true;
      onChange(e.getHTML());
    },
  });

  // Sincroniza cuando el valor cambia desde fuera (abrir otro registro).
  // TipTap puede destruir la instancia (schema = null) entre el commit y este
  // efecto; llamar a getHTML() sobre una instancia destruida lanza
  // "Cannot read properties of null (reading 'cached')" desde ProseMirror.
  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      origenInterno.current = false;
      return;
    }
    if (origenInterno.current) {
      origenInterno.current = false;
      return;
    }
    const siguiente = normalizarEntrada(valor);
    if (editor.getHTML() !== siguiente) {
      editor.commands.setContent(siguiente, false);
    }
  }, [editor, valor]);

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e || e.isDestroyed) return null;
      return {
        negrita: e.isActive('bold'),
        cursiva: e.isActive('italic'),
        subrayado: e.isActive('underline'),
        vinietas: e.isActive('bulletList'),
        numerada: e.isActive('orderedList'),
        enlace: e.isActive('link'),
        // API pública de CharacterCount: cuenta texto, nunca etiquetas HTML.
        caracteres: e.storage?.characterCount?.characters?.() ?? 0,
        palabras: e.storage?.characterCount?.words?.() ?? 0,
      };
    },
  });

  if (!editor || editor.isDestroyed || !estado) return <p className="vacio">Cargando editor…</p>;

  const enlace = () => {
    if (!editor || editor.isDestroyed) return;
    const anterior = editor.getAttributes('link').href || '';
    const url = window.prompt('URL del enlace (https://…)', anterior);
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const escrita = url.trim();
    const destino = esEnlaceSeguro(escrita) ? escrita : `https://${escrita}`;
    if (!esEnlaceSeguro(destino)) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: destino }).run();
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
    { id: 'enlace', icono: Link2, etiqueta: 'Insertar enlace', activo: estado.enlace, ejecutar: enlace },
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
