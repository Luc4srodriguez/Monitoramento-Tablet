class Modelo {
    constructor() {
        this.termoConserto = new TermoConserto();
        this.termoReserva = new TermoReserva();
        this.termoIndividual = new TermoIndividual();
        this.termoLote = new TermoLote();
        this.passoPasso = new PassoPassoReserva();
    }

    // --- AGORA ELES RECEBEM O customBg ---
    gerarTermoConsertoEmBranco(municipio, customBg) { this.termoConserto.gerar(municipio, customBg); }
    gerarTermoDevolucaoReservaEmBranco(municipio, customBg) { this.termoReserva.gerar(municipio, customBg); }
    
    gerarIndividual(type, t) { this.termoIndividual.gerar(type, t); }
    gerarLote(type, items, extraData) { this.termoLote.gerar(type, items, extraData); }
    gerarPassoPasso() { this.passoPasso.gerar(); }
}