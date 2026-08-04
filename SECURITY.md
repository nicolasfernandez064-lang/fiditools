# Seguridad de FidiTools

## Credenciales

- `MELI_CLIENT_SECRET` y `SESSION_SECRET` se cargan únicamente como variables de entorno.
- Nunca deben escribirse en el código, README, capturas ni commits de GitHub.
- `.env.local` está ignorado por Git.

## OAuth

- Flujo Authorization Code del lado del servidor.
- Validación del parámetro `state` antes de intercambiar el código.
- Redirect URI exacta y configurada tanto en Mercado Libre Developers como en Vercel.
- Tokens guardados cifrados con AES-256-GCM dentro de una cookie `HttpOnly`.
- La cookie usa `SameSite=Lax` y `Secure` en producción.
- Renovación automática cerca del vencimiento del access token.

## Alcance actual

Esta versión está pensada inicialmente para el uso privado de FidiTools. Antes de habilitar múltiples usuarios será necesario migrar tokens a una base de datos cifrada, agregar autenticación propia, auditoría y políticas de acceso por usuario.
