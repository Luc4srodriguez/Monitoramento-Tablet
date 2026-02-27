class TermoIndividual extends DocBase {
    gerar(type, t) {
        if (!this.checkLib()) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // --- DADOS E VALIDAÇÕES ---
        // Verifica se realmente existe um nome de profissional válido
        const hasProf = t.professional_name && t.professional_name.trim().length > 0;

        // Se tiver profissional, usa os dados dele. Se não, usa linha em branco.
        const nome = hasProf ? t.professional_name.toUpperCase() : "_____________________________________________________________________";
        const cpf = hasProf ? (t.professional_cpf || "________________________") : "__________________";
        
        // --- A GRANDE CORREÇÃO AQUI ---
        // Busca a cidade usando qualquer uma das variáveis possíveis, INDEPENDENTE de ter profissional
        const cidadeValidada = t.professional_municipality || t.municipality || t.municipio || t.cidade;
        const municipio = cidadeValidada ? cidadeValidada.toUpperCase() : "___________________";

        const modelo = t.model || "___________";
        const tombamento = t.tombamento || "_________________";
        const serial = t.serial_number || "_________________";
        
        // --- MARCA D'ÁGUA (PÁGINA INTEIRA) ---
        this.addWatermark(doc, this.base64Watermark, true);
        
        // --- TÍTULO (Y=70) ---
        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(14);
        
        let titulo = "";
        if (type === 'recebimento') titulo = "TERMO DE RECEBIMENTO";
        else if (type === 'reserva') titulo = "TERMO DE DEVOLUÇÃO - RESERVA";
        
        doc.text(titulo, 105, 70, { align: "center" });

        // --- PREPARAÇÃO DO TEXTO (Y=95) ---
        let yInicial = 95; 
        let segmentos = [];

        if (type === 'recebimento') {
            segmentos = [
                { text: `Eu ${nome}, CPF nº ${cpf}, lotado na Secretaria Municipal de Saúde de ${municipio}, declaro que recebi da `, bold: false },
                { text: "NOVETECH SOLUÇÕES TECNOLÓGICAS LTDA, CNPJ 05.621.288/0001-35", bold: true },
                { text: `, 01 (Um) tablet modelo ${modelo}, na cor Preta, devidamente testado e em perfeito estado de funcionamento. Estou ciente que o equipamento deverá ser utilizado ÚNICA e EXCLUSIVAMENTE a serviço do trabalho e que sou responsável pelo seu uso e conservação. Declaro ter apenas a DETENÇÃO para uso profissional, sendo proibido o empréstimo, aluguel ou cessão a terceiros. Comprometo-me a devolver o equipamento em perfeito estado ao término do contrato ou quando solicitado.`, bold: false }
            ];
        } else {
            // Reserva
            segmentos = [
                { text: `Eu ${nome}, CPF nº ${cpf}, declaro que estou DEVOLVENDO à Secretaria Municipal de Saúde de ${municipio}, o equipamento abaixo relacionado, que estava sob minha posse provisória (Reserva): Tablet modelo ${modelo}, Tombamento ${tombamento}, Serial ${serial}. Declaro que o equipamento está sendo devolvido nas mesmas condições em que foi recebido.`, bold: false }
            ];
        }

        // --- FUNÇÃO PARA ESCREVER TEXTO MISTO ---
        const imprimirTextoMisto = (doc, segs, startX, startY) => {
            const maxWidth = 170;
            const lineHeight = 6;
            const spaceWidth = doc.getTextWidth(" ");
            
            let cursorX = startX;
            let cursorY = startY;

            doc.setFontSize(12);

            segs.forEach(seg => {
                doc.setFont("helvetica", seg.bold ? "bold" : "normal");
                
                const palavras = seg.text.split(" ");
                
                palavras.forEach(palavra => {
                    const larguraPalavra = doc.getTextWidth(palavra);
                    
                    if (cursorX + larguraPalavra > startX + maxWidth) {
                        cursorX = startX;
                        cursorY += lineHeight;
                    }
                    
                    doc.text(palavra, cursorX, cursorY);
                    cursorX += larguraPalavra + spaceWidth;
                });
            });
            
            return cursorY + lineHeight + 10; 
        };

        let y = imprimirTextoMisto(doc, segmentos, 20, yInicial);

        // --- DADOS DO EQUIPAMENTO (Esquerda) ---
        if (type === 'recebimento') { 
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text(`Tombamento: ${tombamento}`, 20, y);
            y += 7;
            doc.text(`Nº de Série/IMEI: ${serial}`, 20, y);
            y += 20; 
        } else {
             y += 10;
        }

        // --- DATA (EM BRANCO E DIREITA) ---
        // A data agora vai usar a variável 'municipio', que pode ser "SANTA RITA" ou "___________________"
        const dataEmBranco = `${municipio}, ____ de ____________________ de _______.`;
        
        doc.setFont("helvetica", "normal");
        doc.text(dataEmBranco, 190, y, { align: "right" });
        
        y += 35; 

        // --- ASSINATURA (CENTRALIZADA) ---
        doc.setLineWidth(0.5); 
        doc.line(55, y, 155, y); 
        
        y += 5; 
        doc.setFont("helvetica", "bold");
        doc.text("Assinatura", 105, y, { align: "center" });
        
        // Só coloca o nome embaixo da assinatura se realmente tiver profissional
        if (hasProf) { 
            y += 7; 
            doc.setFontSize(11); 
            doc.setTextColor(80); 
            doc.text(nome, 105, y, { align: "center" }); 
        }
        
        window.open(doc.output('bloburl'), '_blank');
    }
}