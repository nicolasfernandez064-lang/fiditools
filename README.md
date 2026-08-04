# FidiTools v1.0

Aplicación profesional en **Next.js 15 + TypeScript + Tailwind CSS + componentes shadcn/ui** para conectar una cuenta de Mercado Libre y calcular rentabilidad real.

## Incluye

- Dashboard con conexión OAuth oficial a Mercado Libre.
- Usuario conectado y últimas 20 órdenes pagadas.
- Comisión informada en `sale_fee`.
- Calculadora completa para **Monotributista** y **Responsable inscripto**.
- Costos en ARS o USD, dólar editable, comisión, cuotas, envío, IIBB y percepciones.
- IVA débito y créditos fiscales de mercadería, comisión, cuotas y envío.
- IVA no recuperable manual y fórmula Bruno exclusivamente en Monotributo.
- PWA instalable en teléfono.
- Tokens cifrados en cookie `HttpOnly`.

## Subir a GitHub desde la web

1. Descomprimí `fiditools_v1.zip`.
2. Entrá al repositorio `fiditools`.
3. Hacé clic en **uploading an existing file**.
4. Arrastrá **todo el contenido de esta carpeta**, no la carpeta cerrada ni el ZIP.
5. En la raíz del repositorio deben verse directamente `app`, `components`, `lib`, `public`, `package.json`, etc.
6. Commit sugerido: `FidiTools v1.0`.

> El repositorio conviene que sea **Private**.

## Deploy en Vercel

1. En Vercel: **Add New → Project**.
2. Importá el repositorio `fiditools`.
3. Vercel detectará Next.js automáticamente.
4. Antes de desplegar, cargá estas variables en **Settings → Environment Variables**:

```text
MELI_CLIENT_ID=8448527772198012
MELI_CLIENT_SECRET=TU_CLIENT_SECRET
MELI_REDIRECT_URI=https://TU-DOMINIO.vercel.app/api/auth/mercadolibre/callback
SESSION_SECRET=UNA_CLAVE_ALEATORIA_DE_64_CARACTERES
```

Generá `SESSION_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

5. Hacé el deploy.
6. Copiá el dominio real que te dio Vercel.
7. En Mercado Libre Developers, la Redirect URI debe coincidir **exactamente** con:

```text
https://TU-DOMINIO.vercel.app/api/auth/mercadolibre/callback
```

8. Si modificaste una variable, ejecutá un **Redeploy**.

## Prueba local opcional

```bash
cp .env.example .env.local
npm install
npm run dev
```

En Mercado Libre Developers agregá temporalmente:

```text
http://localhost:3000/api/auth/mercadolibre/callback
```

Abrí `http://localhost:3000`.

## Comandos

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Próximos módulos

1. Costos por SKU/publicación.
2. Rentabilidad real por orden.
3. Estado de resultados mensual.
4. Facturas de comisión y envíos, IVA crédito y percepciones.
5. Base de datos y múltiples usuarios.
Deployment inicial de FidiTools.