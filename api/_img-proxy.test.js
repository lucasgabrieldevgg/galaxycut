// Proxy de imagem: URL inválida, bloqueio de rede interna (SSRF) e redirects
// seguros. O fetch é stubado — o teste não toca a rede.
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./img-proxy.js";

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.setHeader = (k, v) => {
    r.headers[k] = v;
  };
  r.status = (c) => {
    r.statusCode = c;
    return r;
  };
  r.json = (b) => {
    r.body = b;
    return r;
  };
  r.send = (b) => {
    r.body = b;
    return r;
  };
  r.end = () => r;
  return r;
}

function fakeUpstream({ status = 200, type = "image/png", location = null } = {}) {
  const headers = new Map();
  if (type) headers.set("content-type", type);
  if (location) headers.set("location", location);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers.get(k) ?? null },
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  };
}

async function call(query, method = "GET") {
  const res = fakeRes();
  await handler({ method, query }, res);
  return res;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("img-proxy — requisição", () => {
  it("recusa método diferente de GET", async () => {
    const res = await call({ u: "http://93.184.216.34/a.png" }, "POST");
    expect(res.statusCode).toBe(405);
  });

  it("recusa URL inválida", async () => {
    const res = await call({ u: "não é uma url" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("bad_url");
  });

  it("recusa protocolo que não seja http/https", async () => {
    const res = await call({ u: "file:///etc/passwd" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("bad_protocol");
  });
});

describe("img-proxy — proteção SSRF", () => {
  it("recusa loopback IPv4", async () => {
    const res = await call({ u: "http://127.0.0.1:8080/segredo.png" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("blocked_ip");
  });

  it("recusa metadata da nuvem (link-local)", async () => {
    const res = await call({ u: "http://169.254.169.254/latest/meta-data/" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("blocked_ip");
  });

  it("recusa rede privada (10/8, 172.16/12, 192.168/16)", async () => {
    for (const host of ["10.0.0.5", "172.20.1.1", "192.168.1.1"]) {
      const res = await call({ u: `http://${host}/a.png` });
      expect(res.statusCode, host).toBe(400);
      expect(res.body.error, host).toBe("blocked_ip");
    }
  });

  it("recusa IPv6 loopback e local", async () => {
    for (const host of ["[::1]", "[fe80::1]", "[fc00::1]"]) {
      const res = await call({ u: `http://${host}/a.png` });
      expect(res.statusCode, host).toBe(400);
      expect(res.body.error, host).toBe("blocked_ip");
    }
  });

  it("recusa hostname local sem chegar no DNS", async () => {
    for (const host of ["localhost", "algo.localhost", "servidor.internal"]) {
      const res = await call({ u: `http://${host}/a.png` });
      expect(res.statusCode, host).toBe(400);
      expect(res.body.error, host).toBe("blocked_host");
    }
  });

  it("valida CADA salto de redirect (redirect público → privado é barrado)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fakeUpstream({ status: 302, location: "http://169.254.169.254/latest/meta-data/" }))
    );
    const res = await call({ u: "http://93.184.216.34/a.png" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("blocked_ip");
  });
});

describe("img-proxy — resposta", () => {
  it("devolve a imagem de host público", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeUpstream()));
    const res = await call({ u: "http://93.184.216.34/foto.png" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/png");
    expect(Buffer.from(res.body).length).toBe(4);
  });

  it("recusa resposta que não é imagem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeUpstream({ type: "text/html" })));
    const res = await call({ u: "http://93.184.216.34/pagina.html" });
    expect(res.statusCode).toBe(415);
    expect(res.body.error).toBe("not_image");
  });

  it("não segue redirect infinito", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fakeUpstream({ status: 302, location: "http://93.184.216.34/a.png" })));
    const res = await call({ u: "http://93.184.216.34/a.png" });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe("too_many_redirects");
  });
});
