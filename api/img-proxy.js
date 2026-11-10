// GalaxyCut — proxy de imagem (Vercel serverless): usado APENAS como fallback
// quando o navegador não consegue baixar uma imagem pública direto (CORS).
// Casos de uso: arrastar imagem de outra página (Google Imagens etc.) pra
// aba Mídia, e resultados de busca cujo host não manda cabeçalho CORS.
//
// Limites de segurança:
//  - só GET, só http/https;
//  - só content-type image/* (nada de proxy genérico);
//  - máximo 25 MB e 10 segundos;
//  - redirect MANUAL (até 5 saltos) validando CADA salto;
//  - PROTEÇÃO SSRF: o host tem que resolver para IP público — loopback, rede
//    privada, link-local (inclui o metadata 169.254.169.254) e IPv6 local/ULA
//    são recusados. Sem isso o proxy virava scanner da rede interna.
// Não é raspagem: baixa a URL que o PRÓPRIO usuário arrastou/escolheu.

const dns = require("node:dns").promises;
const net = require("node:net");

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const REDIRECT_CODES = [301, 302, 303, 307, 308];
const BLOCKED_HOSTS = new Set(["localhost", "instance-data", "metadata"]);
const BLOCKED_HOST_SUFFIX = [".localhost", ".local", ".internal", ".home.arpa"];

/** IPv4 em faixa reservada/privada — bloqueado (SSRF). */
function ipv4Blocked(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254/16 (link-local + metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 (CGNAT)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15
  if (a >= 224) return true; // multicast + reservado + broadcast
  return false;
}

/** Expande IPv6 (com "::" e IPv4 embutido) em 8 grupos hex. */
function expandIpv6(ip) {
  let s = ip.toLowerCase();
  const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = v4[1].split(".").map(Number);
    const hi = ((n[0] << 8) | n[1]).toString(16);
    const lo = ((n[2] << 8) | n[3]).toString(16);
    s = s.slice(0, v4.index) + hi + ":" + lo;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":").filter(Boolean) : [];
  const t = tail ? tail.split(":").filter(Boolean) : [];
  const fill = 8 - h.length - t.length;
  if (fill < 0) return null;
  const groups = s.includes("::") ? [...h, ...new Array(fill).fill("0"), ...t] : h;
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff) ? null : nums;
}

/** IPv6 local/privado — bloqueado (SSRF). */
function ipv6Blocked(ip) {
  const g = expandIpv6(ip);
  if (!g) return true;
  const [a, b] = g;
  if (g.every((x) => x === 0)) return true; // :: (não especificado)
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return ipv4Blocked(v4(g[6], g[7])); // ::ffff:a.b.c.d
  }
  if (a === 0x64 && b === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return ipv4Blocked(v4(g[6], g[7])); // 64:ff9b::/96 (NAT64)
  }
  return false;
}

/** O host resolve para IP público? */
async function hostIsPublic(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(h)) return { ok: false, error: "blocked_host" };
  if (BLOCKED_HOST_SUFFIX.some((s) => h.endsWith(s))) return { ok: false, error: "blocked_host" };
  if (net.isIP(h)) {
    const bad = net.isIPv4(h) ? ipv4Blocked(h) : ipv6Blocked(h);
    return bad ? { ok: false, error: "blocked_ip" } : { ok: true };
  }
  let addrs;
  try {
    addrs = await dns.lookup(h, { all: true });
  } catch {
    return { ok: false, error: "dns_failed" };
  }
  if (!addrs || !addrs.length) return { ok: false, error: "dns_failed" };
  for (const a of addrs) {
    const bad = net.isIPv4(a.address) ? ipv4Blocked(a.address) : ipv6Blocked(a.address);
    if (bad) return { ok: false, error: "blocked_ip" };
  }
  return { ok: true };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method" });
    return;
  }

  const raw = String((req.query && req.query.u) ?? "");
  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(400).json({ ok: false, error: "bad_url" });
    return;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    res.status(400).json({ ok: false, error: "bad_protocol" });
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // redirect MANUAL: cada salto é validado (host público + protocolo) antes
    // de ser seguido — senão um redirect público vira ponte pra rede interna.
    let current = target;
    let upstream = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = await hostIsPublic(current.hostname);
      if (!check.ok) {
        res.status(400).json({ ok: false, error: check.error });
        return;
      }
      if (ctrl.signal.aborted) {
        const err = new Error("abortado");
        err.name = "AbortError";
        throw err;
      }
      upstream = await fetch(current.toString(), {
        method: "GET",
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          // user-agent de browser comum: alguns CDNs recusam clientes genéricos
          "user-agent": BROWSER_UA,
          accept: "image/*,*/*;q=0.8",
        },
      });
      if (!REDIRECT_CODES.includes(upstream.status)) break;
      const loc = upstream.headers.get("location");
      if (!loc) {
        res.status(502).json({ ok: false, error: "bad_redirect" });
        return;
      }
      let next;
      try {
        next = new URL(loc, current);
      } catch {
        res.status(502).json({ ok: false, error: "bad_redirect" });
        return;
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        res.status(400).json({ ok: false, error: "bad_protocol" });
        return;
      }
      current = next;
      upstream = null;
    }
    if (!upstream) {
      res.status(502).json({ ok: false, error: "too_many_redirects" });
      return;
    }

    const type = String(upstream.headers.get("content-type") ?? "");
    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: "upstream_" + upstream.status });
      return;
    }
    if (!type.startsWith("image/")) {
      res.status(415).json({ ok: false, error: "not_image", contentType: type });
      return;
    }
    const len = Number(upstream.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) {
      res.status(413).json({ ok: false, error: "too_large" });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ ok: false, error: "too_large" });
      return;
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-GC-Origin", current.hostname);
    res.status(200).send(buf);
  } catch (err) {
    const name = String((err && err.name) ?? "");
    const code = name === "AbortError" ? "timeout" : "fetch_failed";
    res.status(502).json({ ok: false, error: code });
  } finally {
    clearTimeout(timer);
  }
};
