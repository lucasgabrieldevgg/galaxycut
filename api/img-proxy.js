// GalaxyCut — proxy de imagem (Vercel serverless): usado APENAS como fallback
// quando o navegador não consegue baixar uma imagem pública direto (CORS).
// Casos de uso: arrastar imagem de outra página (Google Imagens etc.) pra
// aba Mídia, e resultados de busca cujo host não manda cabeçalho CORS.
//
// Limites de segurança:
//  - só GET, só http/https;
//  - só content-type image/* (nada de proxy genérico);
//  - máximo 25 MB e 10 segundos;
//  - sem redirecionamento infinito (redirect: "follow" com erro no fim);
// Não é raspagem: baixa a URL que o PRÓPRIO usuário arrastou/escolheu.

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

  const raw = String(req.query.u ?? "");
  let target: URL;
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
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // user-agent de browser comum: alguns CDNs recusam clientes genéricos
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        accept: "image/*,*/*;q=0.8",
      },
    });

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
    if (len > 25 * 1024 * 1024) {
      res.status(413).json({ ok: false, error: "too_large" });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) {
      res.status(413).json({ ok: false, error: "too_large" });
      return;
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-GC-Origin", target.hostname);
    res.status(200).send(buf);
  } catch (err) {
    const code = String((err as Error)?.name ?? "") === "AbortError" ? "timeout" : "fetch_failed";
    res.status(502).json({ ok: false, error: code });
  } finally {
    clearTimeout(timer);
  }
};
