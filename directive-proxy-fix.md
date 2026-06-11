# Directive: Fix Proxy Bridge for Bright Data HTTP Proxy

## Problem
The current `proxy_bridge.mjs` attempts to create a SOCKS5-to-SOCKS5 bridge with authentication, but Bright Data's residential proxy (`brd.superproxy.io:33335`) is an HTTP proxy that requires HTTP CONNECT with Proxy-Authorization header, not SOCKS5 authentication.

## Solution
Replace `proxy_bridge.mjs` with a bridge that:
1. Accepts SOCKS5 client connections locally (on 127.0.0.1:10801)
2. For each connection, establishes a TCP connection to the HTTP proxy (`PROXY_HOST:PROXY_PORT`)
3. Sends an HTTP CONNECT request to the target host (e.g., `geo.brdtest.com:443`) with Proxy-Authorization header using `PROXY_USER` and `PROXY_PASS`
4. Upon successful tunnel establishment (HTTP 200), pipes data between the SOCKS5 client and the remote target
5. Handles authentication errors and connection failures appropriately

## Implementation Details
- Keep the same interface: listens on `127.0.0.1:${BRIDGE_LOCAL_PORT}`
- Uses `net` module only (no external dependencies)
- Properly parses SOCKS5 handshake (no authentication locally, as the bridge itself is not authenticated)
- Constructs HTTP CONNECT request with:
  ```
  CONNECT <target_host>:<target_port> HTTP/1.1\r\n
  Host: <target_host>:<target_port>\r\n
  Proxy-Authorization: Basic <base64(username:password)>\r\n
  \r\n
  ```
- Waits for HTTP response status line and headers; only proceed on 2xx response
- After successful tunnel, pipes data bidirectionally
- Includes error handling and cleanup

## Files to Modify
- `proxy_bridge.mjs` (replace entirely)

## Verification
After implementing, verify with:
```bash
curl -v --socks5 127.0.0.1:10801 https://geo.brdtest.com/welcome.txt
```
Should return the welcome text (e.g., "Welcome to Bright Data Proxy Zone").

## Notes
- Do not modify `bot.ts` or any other files unless necessary for this fix.
- Ensure the bridge logs the remote proxy and target host for debugging.
- Keep the `SKIP_BRIDGE_START` environment variable respected.

## Reference
- Bright Data documentation: https://brightdata.com/docs/integrations/proxies/residential-proxy
- HTTP CONNECT tunneling: https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/CONNECT
