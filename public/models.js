class Modelo {
    constructor() {
        // --- CONFIGURAÇÃO DE LOGOS (Base64) ---
        // Cole o código Base64 das logos aqui. 
        // Use nomes de cidades em MAIÚSCULO para as chaves.
        this.logosMunicipios = {
            "PADRAO": "",      // Logo padrão (ex: Novetech)
            "CONDE": "",       // Logo do Conde
            "JOÃO PESSOA": "", // Logo de JP
            "SANTA RITA": "",  // Logo de Santa Rita
            "CABEDELO": ""     // Logo de Cabedelo
        };

        this.base64Watermark = ""; 
        this.base64BgSecretario = ""; 
    }

    _checkLib() {
        if (!window.jspdf) { alert("Biblioteca jsPDF não carregada!"); return false; }
        if (!window.jspdf.jsPDF.API.autoTable) { alert("Plugin AutoTable não carregado!"); return false; }
        return true;
    }

    _getLogoForCity(city) {
        if (!city) return this.logosMunicipios["PADRAO"];
        const cityKey = city.toUpperCase().trim();
        return this.logosMunicipios[cityKey] || this.logosMunicipios["PADRAO"];
    }

    _addWatermark(doc, imageBase64, isFullPage = false) {
        if (!imageBase64) return;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        try {
            if (isFullPage) {
                doc.addImage(imageBase64, 'PNG', 0, 0, pageWidth, pageHeight);
            } else {
                const imgWidth = 120; const imgHeight = 120; 
                const x = (pageWidth - imgWidth) / 2; const y = (pageHeight - imgHeight) / 2;
                doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.15 }));
                doc.addImage(imageBase64, 'PNG', x, y, imgWidth, imgHeight);
                doc.restoreGraphicsState();
            }
        } catch (e) { doc.addImage(imageBase64, 'PNG', 0, 0, pageWidth, pageHeight); }
    }

    // --- NOVO: TERMO CONSERTO EM BRANCO (3 VIAS) ---
    gerarTermoConsertoEmBranco(municipio) {
        if (!this._checkLib()) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(); // A4 Vertical

        const logoCidade = this._getLogoForCity(municipio);

        // Função que desenha 1 via
        const desenharVia = (offsetY, rodapeTexto) => {
            const margemEsq = 15;
            let y = offsetY + 15;

            // 1. Logo (Esquerda)
            if (logoCidade) {
                doc.addImage(logoCidade, 'PNG', margemEsq, y - 5, 20, 20); 
            }

            // 2. Título (Ao lado da logo)
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("TERMO DE ENTREGA DE EQUIPAMENTO", 45, y + 5);
            doc.text("PARA CONSERTO", 45, y + 12);

            y += 25; // Espaço após cabeçalho

            // 3. Campos em Branco
            doc.setFontSize(10);
            
            // Linha Profissional
            doc.setFont("helvetica", "bold");
            doc.text("PROFISSIONAL:", margemEsq, y);
            doc.setFont("helvetica", "normal");
            doc.text("______________________________________________________________________", margemEsq + 30, y);
            
            y += 8;
            // Linha CPF e UBS
            doc.setFont("helvetica", "bold");
            doc.text("CPF:", margemEsq, y);
            doc.setFont("helvetica", "normal");
            doc.text("_______________________", margemEsq + 10, y);
            
            doc.setFont("helvetica", "bold");
            doc.text("UBS/PSF:", margemEsq + 80, y);
            doc.setFont("helvetica", "normal");
            doc.text("___________________________________", margemEsq + 100, y);

            y += 10;

            // 4. Checkbox e Itens
            // Função para desenhar quadrado vazio
            const square = (cx, cy) => doc.rect(cx, cy - 3, 4, 4);

            square(margemEsq, y);
            doc.text("Tablet  -  Tombamento __________________    N. Série __________________", margemEsq + 6, y);
            y += 7;
            
            square(margemEsq, y);
            doc.text("Carregador", margemEsq + 6, y);
            y += 7;
            
            square(margemEsq, y);
            doc.text("Cabo USB", margemEsq + 6, y);
            y += 10;

            // 5. Motivo (Linhas grandes)
            doc.text("Motivo: ______________________________________________________________________", margemEsq, y);
            y += 7;
            doc.text("_____________________________________________________________________________", margemEsq, y);
            y += 15;

            // 6. Data e Assinatura
            doc.text("Data: ______ / ______ / ________", margemEsq, y);
            
            // Linha de assinatura à direita
            doc.line(100, y, 190, y);
            doc.setFontSize(8);
            
            // Texto da assinatura varia conforme a via? 
            // O DOC original tem "Assinatura responsável da empresa" na 1ª, "Assinatura do receptor" na 2ª...
            // Vamos deixar genérico ou parametrizado se preferir.
            let labelAssinatura = "Assinatura";
            if (rodapeTexto.includes("1ª")) labelAssinatura = "Responsável da Empresa";
            if (rodapeTexto.includes("2ª")) labelAssinatura = "Receptor (SMS)";
            if (rodapeTexto.includes("3ª")) labelAssinatura = "Profissional / Responsável";

            doc.text(labelAssinatura, 145, y + 4, null, null, "center");

            // 7. Rodapé da Via
            y += 10;
            doc.setFont("helvetica", "italic");
            doc.setFontSize(9);
            doc.text(`(${rodapeTexto})`, margemEsq, y);
        };

        // --- GERA AS 3 VIAS ---
        // Altura de uma página A4 ~297mm. Cada via tem ~99mm.
        
        // Via 1
        desenharVia(0, "1ª via – Empresa Novetech");
        
        // Corte 1
        doc.setLineWidth(0.2); doc.setLineDash([3, 3], 0);
        doc.line(0, 99, 210, 99); doc.setLineDash([]);

        // Via 2
        desenharVia(99, "2ª via- Secretaria Municipal de Saúde");

        // Corte 2
        doc.setLineWidth(0.2); doc.setLineDash([3, 3], 0);
        doc.line(0, 198, 210, 198); doc.setLineDash([]);

        // Via 3
        desenharVia(198, "3ª via - Profissional");

        window.open(doc.output('bloburl'), '_blank');
    }

    // --- MÉTODOS ANTIGOS (MANTIDOS) ---
    gerarIndividual(type, t) { this.gerarTermoConsertoEmBranco("PADRAO"); /* Só pra não quebrar se chamar errado, mas o app.js vai chamar o certo */ }
    // (Copie os métodos gerarIndividual e gerarLote que fizemos nas respostas anteriores aqui para manter tudo funcionando)
    // Para economizar espaço aqui, estou focando no novo método, mas no seu arquivo final mantenha os outros.
    gerarIndividual(type, t) {
        if (!this._checkLib()) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const nome = (t.professional_name || "_______________________________________________").toUpperCase();
        const cpf = t.professional_cpf || "__________________";
        const modelo = t.model || "___________";
        const tombamento = t.tombamento || "_________________";
        const serial = t.serial_number || "_________________";
        const municipio = (t.professional_municipality || "___________________").toUpperCase();
        this._addWatermark(doc, this.base64Watermark, false);
        doc.setFont("helvetica");
        let titulo = "", corpo = "";
        if (type === 'recebimento') {
            titulo = "TERMO DE RECEBIMENTO";
            corpo = `Eu ${nome}, CPF de número ${cpf}, lotado na Secretaria Municipal de Saúde do Município de ${municipio}, declaro que recebi da NOVETECH SOLUÇÕES TECNOLÓGICAS LTDA, inscrita sob o CNPJ 05.621.288/0001-35, 01 (Um) tablet modelo ${modelo}, na cor (Preta) em perfeito estado de funcionamento.\n\nEstou ciente que, o equipamento deverá ser utilizado ÚNICA e EXCLUSIVAMENTE a serviço do trabalho, que sou responsável pelo uso e conservação do equipamento.\n\nEstou ciente que, tenho somente a DETENÇÃO, tendo em vista o uso exclusivo para prestação de serviços profissionais e NÃO a PROPRIEDADE do equipamento, sendo terminantemente proibidos o empréstimo, aluguel ou cessão deste a terceiros.\n\nAo término da prestação de serviço, do contrato individual de trabalho ou quando solicitado, compromete-se a devolver o equipamento em perfeito estado no mesmo dia em que for comunicado ou comunique seu desligamento, considerando o desgaste natural pelo uso normal do equipamento.`;
        } else if (type === 'reserva') {
            titulo = "TERMO DE DEVOLUÇÃO - EQUIPAMENTO RESERVA";
            corpo = `Eu ${nome}, CPF de número ${cpf}, declaro que estou DEVOLVENDO à Secretaria Municipal de Saúde de ${municipio}, o equipamento Tablet modelo ${modelo}, Tombamento ${tombamento}, Serial ${serial}, que estava sob minha posse provisória (Reserva).\n\nDeclaro que o equipamento está sendo devolvido nas mesmas condições em que foi recebido.`;
        }
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(titulo, 105, 30, null, null, "center");
        doc.setFont("helvetica", "normal"); doc.setFontSize(11);
        const linhas = doc.splitTextToSize(corpo, 170); doc.text(linhas, 20, 55);
        let y = 55 + (linhas.length * 5) + 20;
        const hoje = new Date(); const dataExtenso = `${hoje.getDate()} de ${hoje.toLocaleString('pt-BR', { month: 'long' })} de ${hoje.getFullYear()}`;
        doc.setFont("helvetica", "normal"); doc.text(`${municipio}, ${dataExtenso}.`, 20, y); y += 15;
        if (type === 'recebimento' || type === 'reserva') { doc.setFont("helvetica", "bold"); doc.text(`Tombamento: ${tombamento}`, 20, y); doc.text(`Nº de Série/IMEI: ${serial}`, 20, y + 8); y += 25; }
        doc.setLineWidth(0.5); doc.line(20, y, 120, y); y += 5; doc.setFont("helvetica", "normal"); doc.text("Assinatura", 20, y);
        if (t.professional_name) { y += 5; doc.setFontSize(10); doc.setTextColor(100); doc.text(nome, 20, y); }
        window.open(doc.output('bloburl'), '_blank');
    }

    gerarLote(type, items, extraData) {
        if (!this._checkLib()) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let representativeItem = items.find(t => t.professional_name) || items[0];
        const municipio = (representativeItem.professional_municipality || "___________________").toUpperCase();
        const nome = "________________________________________________________";
        const cpf = "____________________________________";
        const cargo = "___________________________";
        const dataEmBranco = "____ de ____________________ de 20____";
        this._addWatermark(doc, this.base64BgSecretario, true); 
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(0, 0, 0);
        doc.text("TERMO DE ENTREGA - SECRETARIA / ACS", 105, 40, null, null, "center");
        doc.setFont("helvetica", "normal"); doc.setFontSize(11);
        const corpo = `Eu, ${nome}, CPF nº ${cpf}, cargo ${cargo}, lotado na Secretaria Municipal de Saúde de ${municipio}, declaro que recebi da NOVETECH SOLUÇÕES TECNOLÓGICAS LTDA, inscrita sob o CNPJ 05.621.288/0001-35, os equipamentos relacionados abaixo, devidamente testados e em perfeito estado de funcionamento:`;
        const linhas = doc.splitTextToSize(corpo, 170); doc.text(linhas, 20, 55);
        const tableBody = items.map((t, index) => {
            const profName = t.professional_name ? String(t.professional_name).toUpperCase() : "---";
            const profCpf = t.professional_cpf ? String(t.professional_cpf) : "---";
            return [String(index + 1), String(t.model || ""), String(t.tombamento || ""), String(t.serial_number || ""), profName, profCpf];
        });
        doc.autoTable({ startY: 55 + (linhas.length * 5) + 5, head: [['Item', 'Modelo', 'Tombamento', 'Serial / IMEI', 'Profissional', 'CPF']], body: tableBody, theme: 'grid', styles: { fontSize: 8, cellPadding: 2, textColor: 0, lineColor: 0, lineWidth: 0.1, valign: 'middle', halign: 'center' }, headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold', halign: 'center' }, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 }, 3: { cellWidth: 25 }, 4: { halign: 'left' }, 5: { cellWidth: 25 } }, margin: { left: 20, right: 20 } });
        let finalY = doc.lastAutoTable.finalY || 150;
        if (finalY > 230) { doc.addPage(); this._addWatermark(doc, this.base64BgSecretario, true); finalY = 40; } else { finalY += 20; }
        doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text(`${municipio}, ${dataEmBranco}.`, 20, finalY); finalY += 30; 
        doc.setLineWidth(0.5); doc.line(20, finalY, 120, finalY); finalY += 5; doc.setFont("helvetica", "bold"); doc.text("Prefeitura Municipal de " + municipio, 20, finalY);
        doc.addPage(); this._addWatermark(doc, this.base64BgSecretario, true); 
        const pageHeight = doc.internal.pageSize.getHeight(); let yFooter = pageHeight / 2; 
        doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(0, 0, 0); 
        doc.text("Enviar toda documentação", 105, yFooter, null, null, "center"); yFooter += 7; doc.text("assinada para o nosso", 105, yFooter, null, null, "center"); yFooter += 7; doc.text("e-mail:", 105, yFooter, null, null, "center"); yFooter += 15;
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("suporte@novetech.com.br", 105, yFooter, null, null, "center");
        window.open(doc.output('bloburl'), '_blank'); const modal = document.getElementById("modalBulkPrint"); if(modal) modal.classList.add("hidden");
    }
}