## Diagnóstico (deep dive)

Observaciones tras revisar `src/pages/Auth.tsx`, `src/integrations/lovable/index.ts`, `src/contexts/AuthContext.tsx` y los logs de auth/edge functions:

### 1. Causa más probable: `redirect_uri` apunta a `/auth`

En `src/pages/Auth.tsx` línea 188:

```ts
const result = await lovable.auth.signInWithOAuth('google', {
  redirect_uri: `${window.location.origin}/auth`,
});
```

El broker de OAuth de Lovable Cloud devuelve los tokens al `redirect_uri` **como hash fragment** (`#access_token=...&refresh_token=...`). El SDK `@lovable.dev/cloud-auth-js` espera que esa redirección caiga en una URL donde se vuelva a llamar `signInWithOAuth` (o donde el SDK pueda capturar los tokens). Cuando el usuario aterriza en `/auth`, el hash se descarta (React Router usa rutas, y nuestro `useEffect` de redirect-if-logged-in hace `navigate('/dashboard')` antes de que se procesen los tokens). Resultado: el usuario rebota sin sesión y aparenta que "no funciona".

La guía oficial recomienda `redirect_uri: window.location.origin` (raíz del dominio) — así el callback del proxy (`/~oauth/callback`) puede completar correctamente y `setSession` se ejecuta con los tokens devueltos en `result.tokens`.

### 2. Síntoma secundario en logs

Los `auth_logs` muestran `403: invalid claim: missing sub claim` en `GET /user`. Esto indica que la sesión almacenada en `localStorage` está corrupta (probablemente un JWT residual del backend Cloud anterior, antes del reset). Esto provoca también que `polymarket-data` falle con `Auth error: invalid claim: missing sub claim`.

### 3. No hay logs OAuth en consola del preview

No se registraron logs ni errores tras pulsar el botón → confirma que se inicia el redirect pero el callback no procesa la sesión.

---

## Plan de fix

### A. Corregir `redirect_uri` en `src/pages/Auth.tsx`

Cambiar:
```ts
redirect_uri: `${window.location.origin}/auth`
```
por:
```ts
redirect_uri: window.location.origin
```

(Conforme al knowledge `cloud-oauth-providers` / `cloud-google-auth`: el broker se encarga del callback en `/~oauth/callback` automáticamente; no hay que apuntar a una ruta de la app.)

### B. Limpiar JWTs huérfanos al cargar `/auth`

Añadir un pequeño guard en `AuthContext` (o `Auth.tsx`) que, si `getSession()` devuelve un error de tipo `bad_jwt` / `invalid claim`, ejecute `supabase.auth.signOut({ scope: 'local' })` para purgar el `localStorage`. Esto evita el bucle 403 que vemos en logs y deja el navegador limpio para el nuevo login.

### C. Evitar redirect prematuro durante el callback OAuth

En `Auth.tsx`, el `useEffect` que redirige a `/dashboard` cuando hay `user` se dispara también justo cuando llegan los tokens de OAuth. Añadir una condición: si `window.location.hash` contiene `access_token`, esperar a que `onAuthStateChange` aplique la sesión antes de navegar (el listener ya lo hace; basta con no hacer `navigate` si el hash aún no se ha procesado — un simple `if (window.location.hash.includes('access_token')) return;` durante un tick).

### D. Verificación post-fix

1. Probar Google sign-in en preview → debe redirigir a Google → volver a la raíz → entrar a `/dashboard` con sesión activa.
2. Probar también en la URL publicada (`https://bepolymaths.lovable.app`) — según el knowledge, los entornos Dev/Prod tienen credenciales OAuth distintas; si Prod funciona pero preview no, el problema está en config de Cloud Dev y no en código.
3. Confirmar que desaparece `403: invalid claim: missing sub claim` de los auth logs.

---

## Detalles técnicos

- Archivos a modificar:
  - `src/pages/Auth.tsx` (handler `handleGoogleSignIn` + guard del `useEffect` de redirect).
  - `src/contexts/AuthContext.tsx` (limpieza de JWT corrupto en el bootstrap de `getSession`).
- No tocar `src/integrations/lovable/index.ts` ni `src/integrations/supabase/client.ts` (auto-generados).
- No requiere cambios en el backend (Lovable Cloud gestiona las credenciales Google por defecto).
