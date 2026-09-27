// GalaxyCut — estado do item sendo arrastado do painel de mídia pra timeline.
// O dataTransfer não deixa ler dados durante o dragover (só os types), então
// o painel avisa aqui qual mídia saiu e a timeline resolve o encaixe antecipado.

export const gcDrag = {
  mediaId: null as string | null,
  /** o painel chama no dragStart */
  begin(mediaId: string) {
    this.mediaId = mediaId;
  },
  /** o painel chama no dragEnd */
  end() {
    this.mediaId = null;
  },
};
