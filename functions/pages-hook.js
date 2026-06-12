// EdgeOne Pages Edge Function
// Route: /pages-hook
// 该函数将请求转发到 https://pages-hook.qcloudteo.com，并把上游响应原样返回。
// 仅允许访问固定的外部目标域名，避免 SSRF。

const TARGET_ORIGIN = 'https://pages-hook.qcloudteo.com';

// 不应转发到下游的「逐跳」头部（Hop-by-hop headers）
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function filterRequestHeaders(headers) {
  const out = new Headers();
  for (const [key, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }
  return out;
}

function filterResponseHeaders(headers) {
  const out = new Headers();
  for (const [key, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }
  // 允许跨域调用
  out.set('Access-Control-Allow-Origin', '*');
  return out;
}

export async function onRequest({ request }) {
  try {
    const incomingUrl = new URL(request.url);

    // 拼接目标 URL：保留 path（去掉 /pages-hook 前缀）与 query string
    const targetUrl = new URL(TARGET_ORIGIN);
    const subPath = incomingUrl.pathname.replace(/^\/pages-hook/, '') || '/';
    targetUrl.pathname = subPath;
    targetUrl.search = incomingUrl.search;

    // 预检请求直接处理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
          'Access-Control-Allow-Headers':
            request.headers.get('Access-Control-Request-Headers') || '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const forwardInit = {
      method: request.method,
      headers: filterRequestHeaders(request.headers),
      redirect: 'manual',
    };

    // GET/HEAD 不能带 body
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      forwardInit.body = request.body;
    }

    const upstreamResp = await fetch(targetUrl.toString(), forwardInit);

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: filterResponseHeaders(upstreamResp.headers),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Upstream fetch failed',
        message: err && err.message ? err.message : String(err),
      }),
      {
        status: 502,
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
