// GalaxyCut — busca de mídia online (fotos/vídeos/músicas/efeitos) DIRETO do navegador.
// Porta da antiga rota /api/stock: mesmas fontes (Openverse, Wikimedia Commons,
// Internet Archive, Pexels/Pixabay com chave), mesma relevância e o dicionário
// PT→EN embutido — agora sem precisar de servidor (funciona em qualquer host estático).

export interface StockItem {
  id: string;
  title: string;
  thumb: string;
  url: string; // arquivo original (ou link do Internet Archive p/ resolver depois)
  provider: string;
  license: string;
  width?: number;
  height?: number;
  duration?: number; // segundos
  audio?: boolean;
  creator?: string;
  score?: number;
}

export type DurPreset = "any" | "short" | "mid" | "long" | "custom";

/** fetch com tempo máximo — fonte lenta/caída não trava a busca */
async function fetchT(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 9000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- tradução PT→EN (dicionário embutido, instantâneo) ----------
const PT_EN: Record<string, string> = {
  // música & áudio
  "música": "music", "musica": "music", "musical": "music", "canção": "song", "cancao": "song",
  "trilha": "soundtrack", "som": "sound", "sons": "sounds", "áudio": "audio", "audio": "audio",
  "efeito": "effect", "efeitos": "effects", "efeito sonoro": "sound effect",
  "batida": "beat", "ritmo": "rhythm", "canto": "singing",
  "piano": "piano", "guitarra": "guitar", "violão": "acoustic guitar", "viola": "viola",
  "bateria": "drums", "percussão": "percussion", "orquestra": "orchestra", "coral": "choir",
  "violino": "violin", "flauta": "flute", "trompete": "trumpet", "saxofone": "saxophone",
  "sintetizador": "synthesizer", "acordeão": "accordion", "harpa": "harp",
  "trilha sonora": "soundtrack", "fundo": "background", "música de fundo": "background music",
  // estilos / clima
  "épico": "epic", "epico": "epic", "épica": "epic", "epica": "epic",
  "cinematográfico": "cinematic", "cinematografico": "cinematic", "cinematográfica": "cinematic",
  "calmo": "calm", "calma": "calm", "tranquilo": "relaxing", "tranquila": "relaxing", "relaxante": "relaxing",
  "animado": "upbeat", "alegre": "happy", "divertido": "fun", "triste": "sad", "melancólico": "melancholic",
  "emocional": "emotional", "dramático": "dramatic", "dramatica": "dramatic", "dramática": "dramatic",
  "tensão": "suspense", "tenso": "tense", "suspense": "suspense", "mistério": "mystery", "misterio": "mystery",
  "terror": "horror", "medo": "fear", "assustador": "scary", "susto": "jump scare",
  "herói": "hero", "heroi": "hero", "vilão": "villain", "vilao": "villain",
  "batalha": "battle", "guerra": "war", "vitória": "victory", "vitoria": "victory", "derrota": "defeat",
  "ação": "action", "aventura": "adventure", "fantasia": "fantasy", "mágico": "magic", "magico": "magic",
  "eletrônica": "electronic", "eletronica": "electronic", "rock": "rock", "jazz": "jazz",
  "samba": "samba", "funk": "funk", "hip": "hip", "trap": "trap", "lofi": "lofi", "lo-fi": "lo-fi",
  "dança": "dance", "festa": "party", "natal": "christmas", "romântico": "romantic", "romantico": "romantic",
  // ações / ruídos
  "explosão": "explosion", "explosao": "explosion", "estourar": "burst", "bomba": "bomb",
  "tiro": "gunshot", "tiros": "gunshots", "arma": "gun", "bala": "bullet", "canhão": "cannon",
  "espadada": "sword swing", "espada": "sword", "soco": "punch", "luta": "fight",
  "grito": "scream", "gritos": "screams", "gritar": "scream", "risada": "laugh", "risadas": "laughter",
  "aplauso": "applause", "aplausos": "applause", "palmas": "clapping", "assobio": "whistle",
  "passo": "footstep", "passos": "footsteps", "corrida": "running", "pulo": "jump", "queda": "fall",
  "correndo": "running", "pulando": "jumping", "caindo": "falling", "voando": "flying", "nadando": "swimming",
  "andando": "walking", "dormindo": "sleeping", "comendo": "eating", "rindo": "laughing", "chorando": "crying",
  "tocando": "playing", "dançando": "dancing", "girando": "spinning", "crescendo": "growing",
  "vento": "wind", "chuva": "rain", "tempestade": "storm", "trovão": "thunder", "raio": "lightning",
  "água": "water", "agua": "water", "gota": "drop", "onda": "wave", "mar": "sea", "oceano": "ocean", "praia": "beach",
  "fogo": "fire", "chama": "flame", "fumaça": "smoke", "gelo": "ice", "neve": "snow",
  "sino": "bell", "campainha": "doorbell", "buzina": "horn", "apito": "whistle", "alarme": "alarm", "sirene": "siren",
  "motor": "engine", "carro": "car", "avião": "airplane", "aviao": "airplane", "helicóptero": "helicopter",
  "trem": "train", "ônibus": "bus", "bike": "bike", "bicicleta": "bicycle", "navio": "ship", "barco": "boat",
  "porta": "door", "batida da porta": "door knock", "copo": "glass", "moeda": "coin", "papel": "paper",
  "digitação": "typing", "câmera": "camera", "camera": "camera", "clique": "click", "estática": "static",
  // visual / cenas
  "vídeo": "video", "video": "video", "vídeos": "videos", "imagem": "image", "imagens": "images",
  "foto": "photo", "fotos": "photos", "foto real": "photography", "desenho": "drawing", "pintura": "painting",
  "animado desenho": "cartoon", "arte": "art", "abstrato": "abstract", "fundo de tela": "wallpaper",
  "montanha": "mountain", "montanhas": "mountains", "floresta": "forest", "árvore": "tree", "arvore": "tree",
  "flor": "flower", "flores": "flowers", "folha": "leaf", "céu": "sky", "ceu": "sky", "nuvem": "cloud",
  "estrela": "star", "estrelas": "stars", "lua": "moon", "sol": "sun", "espaço": "space", "espaco": "space",
  "planeta": "planet", "galáxia": "galaxy", "galaxia": "galaxy", "universo": "universe", "terra": "earth",
  "amanhecer": "sunrise", "pôr": "sunset", "por": "sunset", "pôr do sol": "sunset", "noite": "night", "dia": "day",
  "cidade": "city", "rua": "street", "prédio": "building", "predio": "building", "ponte": "bridge",
  "cachorro": "dog", "gato": "cat", "cavalo": "horse", "pássaro": "bird", "passaro": "bird", "peixe": "fish",
  "leão": "lion", "leao": "lion", "tigre": "tiger", "urso": "bear", "lobo": "wolf", "vaca": "cow",
  "pessoa": "person", "pessoas": "people", "gente": "people", "criança": "child", "crianca": "child",
  "menino": "boy", "menina": "girl", "mulher": "woman", "homem": "man", "rosto": "face", "olhos": "eyes",
  "comida": "food", "fruta": "fruit", "bolo": "cake", "café": "coffee", "cafe": "coffee", "pizza": "pizza",
  "jogo": "game", "jogos": "games", "gameplay": "gameplay", "gameplay de": "gameplay",
  "computador": "computer", "celular": "phone", "teclado": "keyboard", "mouse": "mouse", "tela": "screen",
  "ciência": "science", "ciencia": "science", "escola": "school", "livro": "book", "caderno": "notebook",
  "escrever": "writing", "trabalho": "work", "escritório": "office", "dinheiro": "money", "negócio": "business",
  "luz": "light", "escuro": "dark", "brilho": "glow", "sombra": "shadow", "fumaça de": "smoke",
  "rápido": "fast", "rapido": "fast", "lento": "slow motion", "câmera lenta": "slow motion",
  "preto": "black", "branco": "white", "vermelho": "red", "azul": "blue", "verde": "green",
  "amarelo": "yellow", "roxo": "purple", "rosa": "pink", "laranja": "orange", "cinza": "gray", "dourado": "gold",
  "intro": "intro", "logo": "logo", "outro": "outro", "vlog": "vlog", "podcast": "podcast",
  "notícia": "news", "noticia": "news", "esporte": "sport", "futebol": "football soccer", "treino": "workout",
  "academia": "gym", "viagem": "travel", "natureza": "nature", "animal": "animal", "animais": "animals",
  "minecraft": "minecraft", "roblox": "roblox", "fortnite": "fortnite", "among": "among us",
};

const PT_STOP = new Set(["de", "da", "do", "das", "dos", "com", "para", "uma", "um", "em", "no", "na", "e", "o", "a", "ao", "à"]);

const transCache = new Map<string, string | null>();

/** Tradução local instantânea (token a token). Devolve null se não souber nada. */
function translateLocal(q: string): string | null {
  const phrase = q.toLowerCase().trim();
  if (PT_EN[phrase]) return PT_EN[phrase];
  const src = q.toLowerCase().split(/[^a-z0-9à-ú-]+/).filter(Boolean);
  if (!src.length) return null;
  const translatedTokens: string[] = [];
  let hits = 0;
  let i = 0;
  while (i < src.length) {
    const two = src[i + 1] ? `${src[i]} ${src[i + 1]}` : null;
    if (two && PT_EN[two]) {
      translatedTokens.push(PT_EN[two]);
      hits++;
      i += 2;
      continue;
    }
    const tok = src[i];
    const normTok = tok.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (PT_STOP.has(tok)) {
      i++;
      continue;
    }
    const tr = PT_EN[tok] ?? PT_EN[normTok];
    if (tr) {
      translatedTokens.push(tr);
      hits++;
    } else {
      translatedTokens.push(tok); // nome próprio (minecraft) ou já em inglês
    }
    i++;
  }
  if (!hits) return null;
  return translatedTokens.join(" ");
}

function translateQuery(q: string): string | null {
  const key = q.trim().toLowerCase();
  if (!key) return null;
  if (transCache.has(key)) return transCache.get(key) ?? null;
  const out = translateLocal(q);
  transCache.set(key, out);
  if (transCache.size > 400) transCache.delete(transCache.keys().next().value as string);
  return out;
}

// ---------- relevância (score por token no título) ----------
const STOPWORDS = new Set([
  "the", "and", "for", "with", "de", "da", "do", "das", "dos", "com", "para", "uma", "um", "por", "no", "na",
  "em", "ao", "à", "e", "o", "a", "seu", "sua", "meu", "minha", "video", "vídeo", "clipe",
]);

function normalizeText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^file:/, "");
}

function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function scoreItem(item: StockItem, tokens: string[]): number {
  if (!tokens.length) return 1;
  const title = normalizeText(item.title);
  let s = 0;
  for (const tk of tokens) {
    if (title.includes(tk)) s += 3;
    else if (tk.length > 3 && title.includes(tk.slice(0, Math.max(4, tk.length - 2)))) s += 1;
  }
  if (item.creator && tokens.some((tk) => normalizeText(item.creator!).includes(tk))) s += 1;
  return s;
}

// ---------- filtros de duração ----------
const DUR_PRESETS: Record<Exclude<DurPreset, "any" | "custom">, [number, number]> = {
  short: [0, 15],
  mid: [15, 60],
  long: [60, Infinity],
};

function inDuration(item: StockItem, preset: DurPreset, dmin: number, dmax: number): boolean {
  if (preset === "any") return true;
  const [lo, hi] = preset === "custom" ? [Math.max(0, dmin), dmax > 0 ? dmax : Infinity] : DUR_PRESETS[preset];
  if (!item.duration || !isFinite(item.duration)) return false;
  return item.duration >= lo && item.duration <= hi;
}

// ---------- gêneros musicais (estilo CapCut) ----------
export const MUSIC_GENRES: Record<string, { label: string; terms: string }> = {
  all: { label: "Todos", terms: "" },
  epic: { label: "Épico", terms: "epic cinematic orchestral trailer" },
  calm: { label: "Calmo", terms: "calm chill relaxing peaceful" },
  electronic: { label: "Eletrônica", terms: "electronic synth dance edm" },
  gaming: { label: "Gaming", terms: "8-bit chiptune retro game arcade" },
  lofi: { label: "Lo-Fi", terms: "lofi chill hip hop beat study" },
  trap: { label: "Trap/Hip Hop", terms: "trap beat hip hop rap" },
  rock: { label: "Rock", terms: "rock guitar energetic" },
  classical: { label: "Clássico", terms: "classical piano orchestra symphony" },
  ambient: { label: "Ambiente", terms: "ambient soundscape atmospheric pad" },
  happy: { label: "Alegre", terms: "happy upbeat fun cheerful" },
  tense: { label: "Tensão", terms: "suspense tense dark dramatic" },
  sad: { label: "Triste", terms: "sad emotional melancholic piano" },
  funk: { label: "Funk/Soul", terms: "funk soul groove bass" },
};

// ---------- normalização de licença ----------
function normLicense(l?: string, url?: string): string {
  const s = `${l ?? ""} ${url ?? ""}`.toLowerCase();
  if (!s.trim()) return "unknown";
  if (s.includes("cc0") || s.includes("publicdomain") || s.includes("zero") || s.includes("pdm") || s.includes("pexels") || s.includes("pixabay")) return "cc0";
  if (s.includes("by-nc") || s.includes("noncommercial") || s.includes("non-commercial")) return "by-nc";
  if (s.includes("by")) return "by";
  if (s.includes("cc")) return "by";
  return "unknown";
}

/** "3:30" (mm:ss) ou "210.5" → segundos */
function parseIaLength(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && isFinite(v) && v > 0) return v;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 0 && isFinite(n) ? n : undefined;
  }
  const m = /^(\d+):(\d{1,2})(:\d{1,2})?$/.exec(s);
  if (m) {
    if (m[3]) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3].slice(1));
    return Number(m[1]) * 60 + Number(m[2]);
  }
  return undefined;
}

// ---------- Internet Archive: resolver o arquivo real ----------
export async function resolveIaFile(id: string): Promise<{ url: string; duration?: number }> {
  const r = await fetchT(`https://archive.org/metadata/${id}`, { timeoutMs: 8000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const files: { name: string; format?: string; length?: string; size?: string }[] = data?.files ?? [];
  const audios = files
    .filter((f) => /\.(mp3|ogg|flac|m4a|wav)$/i.test(f.name))
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
  const videos = files
    .filter((f) => /\.(mp4|m4v|webm|mkv)$/i.test(f.name) && !/sample/i.test(f.name))
    .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
  const pick = audios[0] ?? videos[0];
  if (!pick) throw new Error("Nenhum arquivo utilizável neste item");
  return { url: `https://archive.org/download/${id}/${encodeURIComponent(pick.name)}`, duration: parseIaLength(pick.length) };
}

/** Baixa o arquivo direto da fonte (CORS). Se o host bloquear, abre em outra aba. */
export async function downloadStockFile(url: string): Promise<Blob> {
  const r = await fetchT(url, { timeoutMs: 30000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.blob();
}

// ---------- fontes ----------

async function openverseImages(q: string, page: number): Promise<StockItem[]> {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&page=${page}&mature=false`;
  const r = await fetchT(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return (data.results ?? [])
    .map((x: Record<string, unknown>): StockItem => ({
      id: `ov-${x.id}`,
      title: String(x.title ?? "Imagem").slice(0, 80),
      thumb: (x.thumbnail as string) ?? "",
      url: (x.url as string) ?? "",
      provider: (x.provider as string) ?? "Openverse",
      license: normLicense(String(x.license ?? ""), String(x.license_url ?? "")),
      width: x.width as number | undefined,
      height: x.height as number | undefined,
      creator: (x.creator as string) ?? undefined,
    }))
    .filter((x: StockItem) => !!x.url && !!x.thumb);
}

async function openverseAudio(
  q: string,
  page: number,
  opts: { category?: string; source?: string; noFilter?: boolean }
): Promise<StockItem[]> {
  let data: { results?: unknown[] } | null = null;
  let status = 500;
  const tries: { category?: string; source?: string }[] = opts.noFilter ? [{}] : [{ category: opts.category, source: opts.source }, {}];
  for (const f of tries) {
    const params = new URLSearchParams({ q, page_size: "20", page: String(page), mature: "false" });
    if (f.category) params.set("category", f.category);
    if (f.source) params.set("source", f.source);
    const r = await fetchT(`https://api.openverse.org/v1/audio/?${params.toString()}`);
    status = r.status;
    if (!r.ok) continue;
    const d = await r.json();
    data = d;
    if (d?.results?.length) break;
  }
  if (!data) throw new Error(`HTTP ${status}`);
  return ((data.results ?? []) as Record<string, any>[])
    .map((x): StockItem => {
      let dur = typeof x.duration === "number" ? x.duration : undefined;
      if (dur && dur > 1000) dur = dur / 1000; // Openverse devolve ms
      return {
        id: `ova-${x.id}`,
        title: String(x.title ?? "Áudio").slice(0, 80),
        thumb: x.thumbnail ?? "",
        url: x.url ?? "",
        provider: x.provider ?? "Openverse",
        license: normLicense(String(x.license ?? ""), String(x.license_url ?? "")),
        duration: dur,
        audio: true,
        creator: x.creator ?? undefined,
      };
    })
    .filter((x: StockItem) => !!x.url);
}

async function commonsSearch(q: string, filetype: "bitmap" | "video", page: number): Promise<StockItem[]> {
  const offset = (page - 1) * 20;
  const gsr = filetype === "video" ? `filetype:video ${q}` : `filetype:bitmap ${q}`;
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(gsr)}&gsrnamespace=6&gsrlimit=24&gsroffset=${offset}` +
    `&prop=imageinfo&iiprop=url|size|mime|thumb|extmetadata|duration&iiurlwidth=320&iiextmetadatafilter=LicenseShortName|Artist`;
  const r = await fetchT(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const pages = Object.values(data?.query?.pages ?? {}) as Record<string, any>[];
  return pages
    .map((p): StockItem | null => {
      const info = p.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata ?? {};
      const licRaw = String(meta.LicenseShortName?.value ?? "");
      const artistRaw = String(meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
      return {
        id: `wc-${p.pageid}`,
        title: String(p.title ?? "").replace(/^File:/, "").slice(0, 80),
        thumb: info.thumburl ?? info.url ?? "",
        url: info.url ?? "",
        provider: "Wikimedia Commons",
        license: normLicense(licRaw),
        width: info.width,
        height: info.height,
        duration: typeof info.duration === "number" ? info.duration : undefined,
        creator: artistRaw.slice(0, 60) || undefined,
      };
    })
    .filter((x): x is StockItem => !!x && !!x.url);
}

async function iaSearch(q: string, page: number, filter: string, mediatype: "audio" | "movies"): Promise<any[]> {
  const query = `(${q}) AND mediatype:(${mediatype}) ${filter ? `AND (${filter})` : ""}`;
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}` +
    `&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=licenseurl&fl%5B%5D=downloads&fl%5B%5D=length` +
    `&sort%5B%5D=downloads+desc&rows=12&page=${page}&output=json`;
  const r = await fetchT(url, { timeoutMs: 8000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data?.response?.docs ?? [];
}

async function iaAudio(q: string, page: number, kind: "music" | "sfx"): Promise<StockItem[]> {
  const filter = kind === "music" ? `collection:(netlabels) OR subject:(music)` : `subject:("sound effects") OR title:("sound effect")`;
  let docs = await iaSearch(q, page, filter, "audio");
  if (!docs.length) docs = await iaSearch(q, page, "", "audio");
  return docs.map((d: Record<string, any>): StockItem => ({
    id: `ia-${d.identifier}`,
    title: String(Array.isArray(d.title) ? d.title[0] : (d.title ?? "Áudio")).slice(0, 80),
    thumb: `https://archive.org/services/img/${d.identifier}`,
    url: `https://archive.org/details/${d.identifier}`, // resolvido depois via resolveIaFile
    provider: "Internet Archive",
    license: normLicense("", String(d.licenseurl ?? "")) === "unknown" && d.licenseurl ? "by" : normLicense("", String(d.licenseurl ?? "")),
    duration: parseIaLength(d.length),
    audio: true,
    creator: Array.isArray(d.creator) ? d.creator[0] : d.creator,
  }));
}

async function iaVideos(q: string, page: number): Promise<StockItem[]> {
  const docs = await iaSearch(q, page, `format:(MPEG4) OR format:(h.264) OR format:(512Kb MPEG4)`, "movies");
  return docs.map((d: Record<string, any>): StockItem => ({
    id: `ia-${d.identifier}`,
    title: String(Array.isArray(d.title) ? d.title[0] : (d.title ?? "Vídeo")).slice(0, 80),
    thumb: `https://archive.org/services/img/${d.identifier}`,
    url: `https://archive.org/details/${d.identifier}`,
    provider: "Internet Archive",
    license: normLicense("", String(d.licenseurl ?? "")),
    duration: parseIaLength(d.length),
    creator: Array.isArray(d.creator) ? d.creator[0] : d.creator,
  }));
}

async function pexelsVideos(q: string, page: number, key: string): Promise<StockItem[]> {
  const r = await fetchT(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=24&page=${page}`, {
    headers: { Authorization: key },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return (data.videos ?? [])
    .map((v: Record<string, any>): StockItem => {
      const files = (v.video_files ?? []).filter((f: Record<string, any>) => (f.file_type ?? "").includes("mp4"));
      const sorted = files.sort((a: Record<string, any>, b: Record<string, any>) => (b.width ?? 0) - (a.width ?? 0));
      const best = sorted.find((f: Record<string, any>) => (f.width ?? 0) <= 1920) ?? sorted[0];
      return {
        id: `px-${v.id}`,
        title: `Vídeo Pexels #${v.id} (${v.duration}s)`,
        thumb: v.image ?? "",
        url: best?.link ?? "",
        provider: "Pexels",
        license: "pexels",
        width: best?.width,
        height: best?.height,
        duration: v.duration,
        creator: v.user?.name,
      };
    })
    .filter((x: StockItem) => !!x.url && !!x.thumb);
}

async function pixabayImages(q: string, page: number, key: string): Promise<StockItem[]> {
  const r = await fetchT(
    `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=all&per_page=20&page=${page}&safesearch=true`
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return (data.hits ?? []).map((h: Record<string, any>): StockItem => ({
    id: `pb-${h.id}`,
    title: String(h.tags ?? "Imagem").slice(0, 80),
    thumb: h.webformatURL ?? "",
    url: h.largeImageURL ?? h.webformatURL ?? "",
    provider: "Pixabay",
    license: "pixabay",
    width: h.imageWidth,
    height: h.imageHeight,
    creator: h.user,
  }));
}

async function pixabayVideos(q: string, page: number, key: string): Promise<StockItem[]> {
  const r = await fetchT(
    `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=20&page=${page}&safesearch=true`
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return (data.hits ?? []).map((h: Record<string, any>): StockItem => ({
    id: `pbv-${h.id}`,
    title: String(h.tags ?? "Vídeo").slice(0, 80),
    thumb: h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : "",
    url: h.videos?.large?.url ?? h.videos?.medium?.url ?? h.videos?.small?.url ?? "",
    provider: "Pixabay",
    license: "pixabay",
    width: h.videos?.large?.width,
    height: h.videos?.large?.height,
    duration: h.duration,
    creator: h.user,
  })).filter((x: StockItem) => !!x.url);
}

// ---------- busca principal ----------

export interface StockSearchParams {
  q: string;
  type: "image" | "video" | "music" | "sfx";
  page?: number;
  dur?: DurPreset;
  dmin?: number;
  dmax?: number;
  genre?: string;
  pexelsKey?: string;
  pixabayKey?: string;
}

export async function searchStock(params: StockSearchParams): Promise<{ results: StockItem[]; translated: string | null }> {
  const q = (params.q ?? "").trim();
  if (!q) return { results: [], translated: null };
  const type = params.type;
  const page = Math.max(1, Math.min(10, params.page ?? 1));
  const dur = params.dur ?? "any";
  const dmin = params.dmin ?? 0;
  const dmax = params.dmax ?? 0;
  const genreId = params.genre ?? "all";

  const translated = translateQuery(q);
  const en = translated && translated.toLowerCase() !== q.toLowerCase() ? translated : null;

  const results: StockItem[] = [];
  const seen = new Set<string>();
  const push = (items: StockItem[]) => {
    for (const it of items) {
      if (!it.url && !it.id) continue;
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      results.push(it);
    }
  };

  const jobs: Promise<void>[] = [];
  const run = async (fn: () => Promise<StockItem[]>) => {
    try {
      push(await fn());
    } catch {
      /* fonte caiu — as outras respondem */
    }
  };

  const genre = MUSIC_GENRES[genreId] ?? MUSIC_GENRES.all;
  const withGenre = (base: string) => (genre.terms ? `${base} ${genre.terms.split(" ").slice(0, 3).join(" ")}` : base);
  const qMusic = withGenre(en ?? q);
  const qMusicPt = withGenre(q);

  if (type === "image") {
    jobs.push(run(() => openverseImages(en ?? q, page)));
    jobs.push(run(() => commonsSearch(q, "bitmap", page)));
    if (en) jobs.push(run(() => commonsSearch(en, "bitmap", page)));
    if (params.pixabayKey) jobs.push(run(() => pixabayImages(en ?? q, page, params.pixabayKey!)));
  } else if (type === "video") {
    jobs.push(run(() => commonsSearch(en ?? q, "video", page)));
    if (en) jobs.push(run(() => commonsSearch(q, "video", page)));
    if (params.pexelsKey) jobs.push(run(() => pexelsVideos(en ?? q, page, params.pexelsKey!)));
    if (params.pixabayKey) jobs.push(run(() => pixabayVideos(en ?? q, page, params.pixabayKey!)));
    if (dur === "any") jobs.push(run(() => iaVideos(en ?? q, page))); // IA não tem duração na busca
  } else if (type === "music") {
    jobs.push(run(() => openverseAudio(qMusic, page, { category: "music" })));
    if (en && qMusic !== qMusicPt) jobs.push(run(() => openverseAudio(qMusicPt, page, { category: "music" })));
    jobs.push(run(() => iaAudio(qMusic, page, "music")));
  } else {
    // EFEITO: Freesound puro (não é música!) + fallback com "sound effect" no fim
    jobs.push(run(() => openverseAudio(en ?? q, page, { source: "freesound" })));
    jobs.push(run(() => openverseAudio(`${en ?? q} sound effect`, page, { noFilter: true })));
    if (en) jobs.push(run(() => openverseAudio(`${q} efeito sonoro`, page, { source: "freesound" })));
  }

  await Promise.all(jobs);

  // ---- pós-filtro: duração + separação música/efeito + relevância ----
  const tokens = [...new Set([...tokenize(q), ...(en ? tokenize(en) : [])])];
  let filtered = results.filter((r) => inDuration(r, dur, dmin, dmax));
  if (type === "sfx") {
    filtered = filtered.filter((r) => !/jamendo/i.test(r.provider) && (!r.duration || r.duration <= 180));
  }
  if (type === "music" && (dur !== "any" || genreId !== "all")) {
    filtered = filtered.filter((r) => !r.duration || r.duration >= 20);
  }
  const scored = filtered
    .map((r) => ({ ...r, score: scoreItem(r, tokens) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.duration ?? 0) - (a.duration ?? 0));
  const relevant = scored.filter((r) => (r.score ?? 0) > 0);
  const finalList = relevant.length >= 6 || tokens.length === 0 ? relevant : scored.slice(0, 12);

  return { results: finalList.slice(0, 40), translated: en };
}
