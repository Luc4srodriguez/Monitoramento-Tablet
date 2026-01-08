class Modelo {
    constructor() {
        // Instancia as classes
        this.termoConserto = new TermoConserto();
        this.termoReserva = new TermoReserva();
        this.termoIndividual = new TermoIndividual();
        this.termoLote = new TermoLote();
        // NOVO:
        this.passoPasso = new PassoPassoReserva();
    }

    // Métodos Fachada
    gerarTermoConsertoEmBranco(municipio) { this.termoConserto.gerar(municipio); }
    gerarTermoDevolucaoReservaEmBranco(municipio) { this.termoReserva.gerar(municipio); }
    gerarIndividual(type, t) { this.termoIndividual.gerar(type, t); }
    gerarLote(type, items, extraData) { this.termoLote.gerar(type, items, extraData); }
    
    // NOVO MÉTODO
    gerarPassoPasso() { this.passoPasso.gerar(); }
}