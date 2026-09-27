// GalaxyCut — idiomas do app (Português padrão, English, Español).
// O seletor fica em Configurações → Geral. Chaves sem tradução caem no
// português (fallback), então nada quebra quando um idioma tá incompleto.
"use client";

import { create } from "zustand";

export type LangId = "pt" | "en" | "es";

export const LANGUAGES: { id: LangId; label: string; flag: string }[] = [
  { id: "pt", label: "Português (BR)", flag: "🇧🇷" },
  { id: "en", label: "English", flag: "🇺🇸" },
  { id: "es", label: "Español", flag: "🇪🇸" },
];

type Dict = Record<string, string>;

// Português = texto padrão do app (todas as chaves SEMPRE preenchidas aqui;
// EN/ES podem cobrir parcialmente — o que falta cai no PT)
const PT: Dict = {
  // home
  "home.subtitle": "editor de vídeo livre, no navegador",
  "home.yourEdits": "Suas edições",
  "home.saveNote": "Tudo fica salvo no seu navegador — os arquivos e o projeto. Crie uma edição nova ou continue de onde parou.",
  "home.newEdit": "Nova edição",
  "home.noEdits": "Nenhuma edição ainda",
  "home.noEditsHint": "Clique em Nova edição, importe seus vídeos e corte estilo CapCut — sem marca d'água.",
  "home.clips": "clipes",
  "home.checkUpdates": "Verificar atualizações",
  "home.checking": "Procurando…",
  "home.footer": "GalaxyCut v{v} · grátis e sem marca d'água · feito pra quem cria vídeos de game",
  "home.rename": "Renomear",
  "home.duplicate": "Duplicar",
  "home.delete": "Excluir",
  "home.deleteTitle": "Excluir “{name}”?",
  "home.deleteHint": "Apaga a edição, os clipes e os arquivos dela que não são usados por outra edição. Essa não dá pra desfazer.",
  "home.downloadApp": "Baixe o app de desktop",
  "home.downloadAppHint": "Legendas automáticas com IA, projetos salvos em pasta no disco e exportação direto pra sua pasta de Vídeos.",
  "home.download": "Baixar",
  "home.starNudge": "Gostou do GalaxyCut? Deixe uma ⭐ no GitHub — ajuda demais!",
  "home.starCta": "Estrela no GitHub",
  // novo projeto
  "np.title": "Nova edição",
  "np.hint": "Escolha o formato do seu vídeo — dá pra mudar depois no menu Projeto.",
  "np.nameLabel": "Título (opcional)",
  "np.namePh": "Minha edição",
  "np.create": "Criar edição",
  "np.mainFormats": "Principais",
  "np.otherFormats": "Outros formatos",
  // editor topo
  "tb.home": "Início",
  "tb.export": "Exportar",
  "tb.feedback": "Feedback",
  "tb.undo": "Desfazer (Ctrl+Z)",
  "tb.redo": "Refazer (Ctrl+Shift+Z)",
  "tb.project": "Projeto",
  "tb.settings": "Configurações do aplicativo",
  // toolbar timeline
  "tl.cut": "Cortar",
  "tl.duplicate": "Duplicar",
  "tl.delete": "Apagar",
  "tl.silence": "Detector de silêncio",
  "tl.broom": "Vassoura",
  "tl.snap": "Encaixe",
  "tl.track": "Faixa",
  "tl.join": "Juntar",
  "tl.zoomOut": "Menos zoom",
  "tl.zoomIn": "Mais zoom",
  "tl.fit": "Ajustar timeline à tela",
  // export
  "ex.title": "Exportar vídeo",
  "ex.resolution": "Resolução",
  "ex.fps": "Taxa de quadros",
  "ex.quality": "Qualidade",
  "ex.format": "Formato",
  "ex.more": "Mais opções",
  "ex.less": "Menos opções",
  "ex.exportBtn": "Exportar vídeo",
  "ex.exporting": "Exportando…",
  "ex.recording": "Gravando em tempo real…",
  "ex.srt": "Legenda .srt",
  "ex.gifNote": "GIF animado — sem som, render fora do tempo real",
  "ex.wavNote": "Só o áudio do projeto — mixa tudo offline",
  "ex.pngNote": "Quadro atual como imagem PNG",
  "ex.default": "padrão",
  "ex.done": "Vídeo exportado!",
  "ex.starAsk": "Ficou bom? Uma ⭐ no GitHub faz o projeto crescer 💚",
  // diálogo juntar clipes
  "join.title": "Juntar clipes (fechar espaços)",
  "join.hint": "Encosta os clipes, tirando os espaços vazios entre eles.",
  "join.all": "Todas as faixas",
  "join.track": "Só a faixa: {name}",
  "join.apply": "Juntar",
  // modo seleção
  "sel.mode": "Modo seleção",
  "sel.count": "{n} marcado(s)",
  "sel.delete": "Apagar marcados",
  "sel.exit": "Sair do modo seleção",
  "sel.enter": "Duplo clique num clipe seleciona vários e apaga de uma vez",
  // feedback
  "fb.title": "Mandar feedback",
  "fb.hint": "Conta o que tá bom, o que quebrou ou o que tá faltando. Vira uma issue no GitHub — eu leio todas.",
  "fb.ph": "O que achou do GalaxyCut?",
  "fb.send": "Enviar no GitHub",
  "fb.copy": "Copiar texto",
  "fb.copied": "Feedback copiado — cola onde quiser",
  // settings
  "st.title": "Configurações do GalaxyCut",
  "st.general": "Geral",
  "st.shortcuts": "Atalhos",
  "st.api": "Buscas",
  "st.language": "Idioma",
  "st.languageHint": "O idioma da interface do app (partes profundas do editor ainda estão sendo traduzidas).",
  "st.autosave": "Autosave em disco (app de desktop)",
  "st.autosaveHint": "Grava o projeto inteiro numa pasta do app a cada N minutos — recupera tudo se algo travar ou fechar. O Ctrl+Z também é salvo.",
  // update dialog / misc
  "upd.available": "Saiu a versão {v}!",
  "upd.get": "Pegar a nova versão",
  "upd.later": "Depois",
  "misc.desktopOnly": "Só no app de desktop",
  "misc.downloadApp": "Baixar o app",
};

const EN: Dict = {
  // home
  "home.subtitle": "free video editor, in your browser",
  "home.yourEdits": "Your edits",
  "home.saveNote": "Everything is saved on your device — the files and the project. Start a new edit or pick up where you left off.",
  "home.newEdit": "New edit",
  "home.noEdits": "No edits yet",
  "home.noEditsHint": "Click New edit, import your videos and cut CapCut-style — no watermark.",
  "home.clips": "clips",
  "home.checkUpdates": "Check for updates",
  "home.checking": "Looking…",
  "home.footer": "GalaxyCut v{v} · free, no watermark · made for gaming creators",
  "home.rename": "Rename",
  "home.duplicate": "Duplicate",
  "home.delete": "Delete",
  "home.deleteTitle": "Delete “{name}”?",
  "home.deleteHint": "Deletes the edit, its clips and files not used by other edits. This can't be undone.",
  "home.downloadApp": "Get the desktop app",
  "home.downloadAppHint": "Auto subtitles, projects saved on disk and exports straight to your Videos folder.",
  "home.download": "Download",
  "home.starNudge": "Enjoying GalaxyCut? Leave a ⭐ on GitHub — it helps a lot!",
  "home.starCta": "Star on GitHub",
  // novo projeto
  "np.title": "New edit",
  "np.hint": "Pick the format of your video. You can change it later in the Project menu.",
  "np.nameLabel": "Title (optional)",
  "np.namePh": "My edit",
  "np.create": "Create edit",
  "np.mainFormats": "Main formats",
  "np.otherFormats": "Other formats",
  // editor topo
  "tb.home": "Home",
  "tb.export": "Export",
  "tb.feedback": "Feedback",
  "tb.undo": "Undo (Ctrl+Z)",
  "tb.redo": "Redo (Ctrl+Shift+Z)",
  "tb.project": "Project",
  "tb.settings": "App settings",
  // toolbar timeline
  "tl.cut": "Cut",
  "tl.duplicate": "Duplicate",
  "tl.delete": "Delete",
  "tl.silence": "Silence detector",
  "tl.broom": "Broom",
  "tl.snap": "Snap",
  "tl.track": "Track",
  "tl.join": "Join clips",
  "tl.zoomOut": "Zoom out",
  "tl.zoomIn": "Zoom in",
  "tl.fit": "Fit timeline to screen",
  // export
  "ex.title": "Export video",
  "ex.resolution": "Resolution",
  "ex.fps": "Frame rate",
  "ex.quality": "Quality",
  "ex.format": "Format",
  "ex.more": "More options",
  "ex.less": "Fewer options",
  "ex.exportBtn": "Export video",
  "ex.exporting": "Exporting…",
  "ex.recording": "Recording in real time…",
  "ex.srt": "Subtitles .srt",
  "ex.gifNote": "Animated GIF — no sound, offline render",
  "ex.wavNote": "Project audio only — mixes everything offline",
  "ex.pngNote": "Current frame as PNG image",
  "ex.default": "default",
  "ex.done": "Video exported!",
  "ex.starAsk": "Glad it worked! A ⭐ on GitHub helps the project grow 💚",
  // diálogo juntar clipes
  "join.title": "Join clips (close gaps)",
  "join.hint": "Pulls all clips in a track together, removing the empty spaces between them.",
  "join.all": "All tracks",
  "join.track": "Only the track: {name}",
  "join.apply": "Join",
  // modo seleção
  "sel.mode": "Selection mode",
  "sel.count": "{n} selected",
  "sel.delete": "Delete selected",
  "sel.exit": "Exit selection mode",
  "sel.enter": "Double-click a clip to select several, then delete them at once",
  // feedback
  "fb.title": "Send feedback",
  "fb.hint": "Tell me what's good, what's broken or what's missing. It opens a GitHub issue — I read every one.",
  "fb.ph": "What did you think of GalaxyCut?",
  "fb.send": "Send on GitHub",
  "fb.copy": "Copy text",
  "fb.copied": "Feedback copied — paste it anywhere",
  // settings
  "st.title": "GalaxyCut settings",
  "st.general": "General",
  "st.shortcuts": "Shortcuts",
  "st.api": "Search",
  "st.language": "Language",
  "st.languageHint": "The app's interface language (deep editor labels are still being translated).",
  "st.autosave": "Autosave (desktop app)",
  "st.autosaveHint": "Writes the whole project to a file in the app folder every N minutes — recovers if anything crashes.",
  // update dialog / misc
  "upd.available": "Version {v} is out!",
  "upd.get": "Get the new version",
  "upd.later": "Later",
  "misc.desktopOnly": "Only in the desktop app",
  "misc.downloadApp": "Download the app",
};

const ES: Dict = {
  "home.subtitle": "editor de vídeo libre, en tu navegador",
  "home.yourEdits": "Tus ediciones",
  "home.saveNote": "Todo queda guardado en tu dispositivo — los archivos y el proyecto. Crea una edición nueva o sigue donde lo dejaste.",
  "home.newEdit": "Nueva edición",
  "home.noEdits": "Aún no hay ediciones",
  "home.noEditsHint": "Haz clic en Nueva edición, importa tus vídeos y corta estilo CapCut — sin marca de agua.",
  "home.clips": "clips",
  "home.checkUpdates": "Buscar actualizaciones",
  "home.checking": "Buscando…",
  "home.footer": "GalaxyCut v{v} · gratis y sin marca de agua · hecho para creadores de gaming",
  "home.rename": "Renombrar",
  "home.duplicate": "Duplicar",
  "home.delete": "Eliminar",
  "home.deleteTitle": "¿Eliminar “{name}”?",
  "home.deleteHint": "Borra la edición, sus clips y los archivos que no usen otras ediciones. No se puede deshacer.",
  "home.downloadApp": "Consigue la app de escritorio",
  "home.downloadAppHint": "Subtítulos automáticos, proyectos guardados en disco y exportación directa a tu carpeta de Vídeos.",
  "home.download": "Descargar",
  "home.starNudge": "¿Te gusta GalaxyCut? Déjame una ⭐ en GitHub — ¡ayuda mucho!",
  "home.starCta": "Estrella en GitHub",
  "np.title": "Nueva edición",
  "np.hint": "Elige el formato de tu vídeo. Puedes cambiarlo después en el menú Proyecto.",
  "np.nameLabel": "Título (opcional)",
  "np.namePh": "Mi edición",
  "np.create": "Crear edición",
  "np.mainFormats": "Formatos principales",
  "np.otherFormats": "Otros formatos",
  "tb.home": "Inicio",
  "tb.export": "Exportar",
  "tb.feedback": "Comentarios",
  "tb.undo": "Deshacer (Ctrl+Z)",
  "tb.redo": "Rehacer (Ctrl+Shift+Z)",
  "tb.project": "Proyecto",
  "tb.settings": "Ajustes de la app",
  "tl.cut": "Cortar",
  "tl.duplicate": "Duplicar",
  "tl.delete": "Borrar",
  "tl.silence": "Detector de silencio",
  "tl.broom": "Escoba",
  "tl.snap": "Imán",
  "tl.track": "Pista",
  "tl.join": "Unir clips",
  "tl.zoomOut": "Alejar",
  "tl.zoomIn": "Acercar",
  "tl.fit": "Ajustar línea de tiempo",
  "ex.title": "Exportar vídeo",
  "ex.resolution": "Resolución",
  "ex.fps": "Fotogramas por segundo",
  "ex.quality": "Calidad",
  "ex.format": "Formato",
  "ex.more": "Más opciones",
  "ex.less": "Menos opciones",
  "ex.exportBtn": "Exportar vídeo",
  "ex.exporting": "Exportando…",
  "ex.recording": "Grabando en tiempo real…",
  "ex.srt": "Subtítulos .srt",
  "ex.gifNote": "GIF animado — sin sonido, render sin tiempo real",
  "ex.wavNote": "Solo el audio del proyecto — mezcla todo sin tiempo real",
  "ex.pngNote": "Fotograma actual como imagen PNG",
  "ex.default": "predeterminado",
  "ex.done": "¡Vídeo exportado!",
  "ex.starAsk": "¡Qué bien que salió! Una ⭐ en GitHub hace crecer el proyecto 💚",
  "join.title": "Unir clips (cerrar huecos)",
  "join.hint": "Junta todos los clips de una pista, quitando los espacios vacíos entre ellos.",
  "join.all": "Todas las pistas",
  "join.track": "Solo la pista: {name}",
  "join.apply": "Unir",
  "sel.mode": "Modo selección",
  "sel.count": "{n} seleccionados",
  "sel.delete": "Borrar seleccionados",
  "sel.exit": "Salir del modo selección",
  "sel.enter": "Doble clic en un clip para seleccionar varios y borrarlos de una vez",
  "fb.title": "Enviar comentarios",
  "fb.hint": "Cuéntame qué está bien, qué está roto o qué falta. Abre un issue en GitHub — los leo todos.",
  "fb.ph": "¿Qué te pareció GalaxyCut?",
  "fb.send": "Enviar en GitHub",
  "fb.copy": "Copiar texto",
  "fb.copied": "Comentarios copiados — pégalos donde quieras",
  "st.title": "Ajustes de GalaxyCut",
  "st.general": "General",
  "st.shortcuts": "Atajos",
  "st.api": "Búsqueda",
  "st.language": "Idioma",
  "st.languageHint": "El idioma de la interfaz (las etiquetas profundas del editor aún se están traduciendo).",
  "st.autosave": "Autoguardado (app de escritorio)",
  "st.autosaveHint": "Escribe todo el proyecto a un archivo cada N minutos — se recupera si algo se cierra.",
  "upd.available": "¡Salió la versión {v}!",
  "upd.get": "Obtener la nueva versión",
  "upd.later": "Después",
  "misc.desktopOnly": "Solo en la app de escritorio",
  "misc.downloadApp": "Descargar la app",
};

const DICTS: Record<LangId, Dict> = { pt: PT, en: EN, es: ES };

interface LangState {
  lang: LangId;
  setLang: (l: LangId) => void;
}

const LS_KEY = "galaxycut_lang_v1";

export const useLang = create<LangState>((set, get) => ({
  lang: "pt",
  setLang: (l) => {
    set({ lang: l });
    try {
      localStorage.setItem(LS_KEY, l);
    } catch {
      /* noop */
    }
    void get();
  },
}));

// carrega do storage no boot (client-side)
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem(LS_KEY) as LangId | null;
    if (saved && DICTS[saved]) useLang.setState({ lang: saved });
  } catch {
    /* noop */
  }
}

/** Traduz uma chave no idioma atual; {nome} é substituído por placeholders. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = useLang.getState().lang;
  let s = DICTS[lang][key] ?? PT[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}

/** Hook reativo: re-renderiza quando o idioma muda. */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = useLang((s) => s.lang);
  void lang;
  return t;
}
