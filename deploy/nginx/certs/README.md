# Certificados TLS

Coloque aquí los certificados reales antes de usar HTTPS:

- `fullchain.pem`: cadena completa del certificado.
- `privkey.pem`: clave privada correspondiente.

No versione estos archivos. El directorio se monta como solo lectura en Nginx
según `TLS_CERTS_DIR` (por defecto `./nginx/certs`) y las rutas internas
`TLS_CERT_PATH` / `TLS_KEY_PATH`.

Para renovar con Let's Encrypt, use el cliente Certbot en el host y copie o
sincronice los archivos renovados en este directorio; después recargue Nginx.
Verifique que el certificado y la clave correspondan y que los nombres de
dominio coincidan antes de reiniciar.
