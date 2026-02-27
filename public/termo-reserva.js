class TermoReserva extends DocBase {
    constructor() {
        super();
        // --- BASE64 DO FUNDO ---
        // Lembre-se: Cole aqui o Base64 da sua folha de Word (sem a logo)
        this.fundoBase64 = {}}

    // Adicione a variável customBg aqui nos parâmetros
    gerar(municipio, customBg) {
        if (!this.checkLib()) return;
        const { jsPDF } = window.jspdf;
        
        // Decide se vai usar o fundo importado agora ou o Base64 padrão colado no código
        const fundoFinal = customBg || this.fundoBase64;

        if (!fundoFinal || (typeof fundoFinal === 'object' && Object.keys(fundoFinal).length === 0)) {
            alert("ATENÇÃO: Selecione uma imagem de fundo no formulário ou cole o código Base64 no arquivo!");
            return;
        }

        const doc = new jsPDF(); 
        const logoCidade = this.getLogoForCity(municipio);

        // Identifica automaticamente se é JPG ou PNG
        let formato = 'PNG';
        if (typeof fundoFinal === 'string' && fundoFinal.includes('image/jpeg')) formato = 'JPEG';

        // 1. DESENHA O FUNDO (A imagem que você fez upload)
        try {
            doc.addImage(fundoFinal, formato, 0, 0, 210, 297);
        } catch (e) {
            console.error(e);
            alert("Erro na imagem de fundo. Tente usar um arquivo mais leve.");
        }

        // ... O RESTANTE DO CÓDIGO (carimbo, linhas em branco, text, etc) CONTINUA IGUAL ABAIXO DISSO ...

        // 2. CARIMBA A LOGO DA CIDADE (SOMENTE NO TOPO)
        if (logoCidade) {
            const tamanho = 22;  // Tamanho da logo
            const xCentro = 105; // Centro da página
            const xPos = xCentro - (tamanho / 2); // Centraliza

            // --- Via 1 (Topo) ---
            // Ajuste o '10' se precisar subir ou descer a logo
            doc.addImage(logoCidade, 'PNG', xPos, 10, tamanho, tamanho);
            
            // --- As linhas abaixo foram removidas para não repetir a logo ---
            // doc.addImage(logoCidade, 'PNG', xPos, 115, tamanho, tamanho);
            // doc.addImage(logoCidade, 'PNG', xPos, 210, tamanho, tamanho);
        }

        window.open(doc.output('bloburl'), '_blank');
    }
}