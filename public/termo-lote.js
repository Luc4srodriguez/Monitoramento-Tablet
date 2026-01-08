class TermoLote extends DocBase {
    gerar(type, items, extraData) {
        if (!this.checkLib()) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // --- 1. LÓGICA DO MUNICÍPIO (RIGOROSA) ---
        // Filtra cidades válidas (remove vazios/nulos) e pega valores únicos
        const cidadesUnicas = [...new Set(items.map(t => t.professional_municipality).filter(c => c && c.trim().length > 0))];
        
        let municipioHeader = "___________________";

        // REGRA: Só preenche se tiver MAIS DE 1 item E todos forem da mesma cidade
        if (items.length > 1 && cidadesUnicas.length === 1) {
            municipioHeader = cidadesUnicas[0].toUpperCase();
        }

        // --- DADOS DO CABEÇALHO ---
        const nomeRecebedor = "________________________________________________________";
        const cpfRecebedor = "____________________________________";
        
        const cargo = (extraData.cargo && extraData.cargo.trim()) ? extraData.cargo.toUpperCase() : "___________________________";
        
        // --- MARCA D'ÁGUA ---
        this.addWatermark(doc, this.base64BgSecretario, true); 
        
        // --- TÍTULO ---
        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(14); 
        doc.setTextColor(0, 0, 0);
        
        doc.text("TERMO DE ENTREGA - SECRETARIA / ACS", 105, 70, { align: "center" });
        
        // --- TEXTO CORRIDO ---
        doc.setFont("helvetica", "normal"); 
        doc.setFontSize(12);

        const segmentos = [
            { text: `Eu, ${nomeRecebedor}, CPF nº ${cpfRecebedor}, cargo ${cargo}, lotado na Secretaria Municipal de Saúde de ${municipioHeader}, declaro que recebi da `, bold: false },
            { text: "NOVETECH SOLUÇÕES TECNOLÓGICAS LTDA, CNPJ 05.621.288/0001-35", bold: true },
            { text: ", os equipamentos relacionados abaixo, devidamente testados e em perfeito estado de funcionamento:", bold: false }
        ];

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

        let finalY = imprimirTextoMisto(doc, segmentos, 20, 95);

        // --- TABELA DE ITENS ---
        const tableBody = items.map((t, index) => {
            const hasProf = t.professional_name && t.professional_name.trim().length > 0;
            const profName = hasProf ? String(t.professional_name).toUpperCase() : "---";
            const profCpf = hasProf ? String(t.professional_cpf) : "---";
            
            return [
                String(index + 1), 
                String(t.model || ""), 
                String(t.tombamento || ""), 
                String(t.serial_number || ""), 
                profName, 
                profCpf
            ];
        });
        
        doc.autoTable({ 
            startY: finalY, 
            head: [['Item', 'Modelo', 'Tombamento', 'Serial / IMEI', 'Profissional', 'CPF']], 
            body: tableBody, 
            theme: 'grid', 
            styles: { 
                fontSize: 9, 
                font: "helvetica",
                cellPadding: 3, 
                textColor: 0, 
                lineColor: 0, 
                lineWidth: 0.1, 
                valign: 'middle', 
                halign: 'center' 
            }, 
            headStyles: { 
                fillColor: [230, 230, 230], 
                textColor: 0, 
                fontStyle: 'bold', 
                halign: 'center' 
            }, 
            columnStyles: { 
                0: { cellWidth: 10 }, 
                1: { cellWidth: 25 }, 
                2: { cellWidth: 25 }, 
                3: { cellWidth: 30 }, 
                4: { halign: 'left' }, 
                5: { cellWidth: 30 } 
            }, 
            margin: { left: 20, right: 20 } 
        });
        
        finalY = doc.lastAutoTable.finalY || 150;
        
        if (finalY > 220) { 
            doc.addPage(); 
            this.addWatermark(doc, this.base64BgSecretario, true); 
            finalY = 40; 
        } else { 
            finalY += 20; 
        }
        
        // --- DATA EM BRANCO (Direita) ---
        // Usa a variável municipioHeader (que pode ser o nome da cidade ou traços)
        const dataEmBranco = `${municipioHeader}, ____ de ____________________ de _______.`;

        doc.setFont("helvetica", "normal"); 
        doc.setFontSize(12);
        doc.text(dataEmBranco, 190, finalY, { align: "right" }); 
        
        finalY += 35; 
        
        // --- ASSINATURA ---
        doc.setLineWidth(0.5); 
        doc.line(55, finalY, 155, finalY); 
        finalY += 5; 
        
        doc.setFont("helvetica", "bold"); 
        doc.text("Assinatura do(a) Responsável", 105, finalY, { align: "center" });
        
        // --- PÁGINA EXTRA (ENVIO) ---
        doc.addPage(); 
        this.addWatermark(doc, this.base64BgSecretario, true); 
        
        const pageHeight = doc.internal.pageSize.getHeight(); 
        let yFooter = pageHeight / 2; 
        
        doc.setFont("helvetica", "normal"); 
        doc.setFontSize(12); 
        doc.setTextColor(0, 0, 0); 
        
        doc.text("Enviar toda documentação", 105, yFooter, { align: "center" }); 
        yFooter += 7; 
        doc.text("assinada para o nosso", 105, yFooter, { align: "center" }); 
        yFooter += 7; 
        doc.text("e-mail:", 105, yFooter, { align: "center" }); 
        yFooter += 15;
        
        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(14); 
        doc.text("suporte@novetech.com.br", 105, yFooter, { align: "center" });
        
        window.open(doc.output('bloburl'), '_blank'); 
        
        const modal = document.getElementById("modalBulkPrint"); 
        if(modal) modal.classList.add("hidden");
    }
}