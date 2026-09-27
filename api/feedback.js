// GalaxyCut — função serverless de feedback (Vercel): recebe o texto e cria
// uma ISSUE automática no repositório do projeto. O token vive só no servidor
// (env GITHUB_FEEDBACK_TOKEN na Vercel), nunca no navegador. Se o token não
// estiver configurado, devolve ok:false e o app mostra os caminhos manuais.
//
// Funciona junto com o build estático (output: export) do Next — a pasta api/
// vira Serverless Function na Vercel sem participar do bundle do editor
// (o app Electron chama por URL absoluta).

const REPO = "lucasgabrieldevgg/galaxycut";

module.exports = async (req, res) => {
  // CORS: o app de desktop (http://127.0.0.1) e o site chamam direto
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method" });
    return;
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : typeof req.body === "object" && req.body
          ? req.body
          : {};
    const text = String(body.text ?? "").trim();

    // validações básicas (a rota é pública: nada de abuso)
    if (body.honeypot) {
      res.status(200).json({ ok: true }); // bot: fingimos sucesso
      return;
    }
    if (!text || text.length < 2) {
      res.status(400).json({ ok: false, error: "empty" });
      return;
    }
    if (text.length > 4000) {
      res.status(400).json({ ok: false, error: "too_long" });
      return;
    }

    const token = process.env.GITHUB_FEEDBACK_TOKEN;
    if (!token) {
      // sem token no servidor: o cliente cai pro fluxo manual (issue via link)
      res.status(503).json({ ok: false, error: "no_token" });
      return;
    }

    const meta = [
      `GalaxyCut v${String(body.version ?? "?").slice(0, 12)}`,
      String(body.platform ?? "?").slice(0, 24),
      `lang: ${String(body.lang ?? "?").slice(0, 4)}`,
      new Date().toISOString(),
    ].join(" · ");

    const title = `[Feedback] ${text.slice(0, 60).replace(/\s+/g, " ")}${text.length > 60 ? "…" : ""}`;
    const issueBody = `${text}\n\n---\n${meta}`;

    const r = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "GalaxyCut-Feedback",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body: issueBody, labels: ["feedback"] }),
    });

    if (!r.ok) {
      res.status(502).json({ ok: false, error: `github_${r.status}` });
      return;
    }
    const issue = await r.json();
    res.status(200).json({ ok: true, issue: issue.number ?? null, url: issue.html_url ?? null });
  } catch {
    res.status(400).json({ ok: false, error: "bad_request" });
  }
};
