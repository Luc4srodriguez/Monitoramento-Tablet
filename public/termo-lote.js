class TermoLote extends DocBase {
    gerar(type, items, extraData) {
        if (!this.checkLib()) return;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // --- CORREÇÃO DA CIDADE ---
        // 1. Buscamos por 'municipality' (que foi tratado no app.js) em vez de 'professional_municipality'
        // 2. Removemos nomes vazios ou nulos
        const cidadesUnicas = [...new Set(items.map(t => t.municipality).filter(c => c && c.trim().length > 0 && c !== "NÃO INFORMADO"))];
        
        let municipioHeader = "___________________";
        
        // Se todos os itens selecionados pertencem à mesma cidade (ou se é apenas 1 item), preenchemos o cabeçalho.
        if (cidadesUnicas.length === 1) {
            municipioHeader = cidadesUnicas[0].toUpperCase();
            
            // Se a cidade não tiver a UF (ex: "JOÃO PESSOA"), adicionamos " - PB" por padrão (Opcional)
            if (!municipioHeader.includes("-")) {
                municipioHeader += " - PB";
            }
        }

        const nomeRecebedor = "________________________________________________________";
        const cpfRecebedor = "____________________________________";
        const cargo = (extraData.cargo && extraData.cargo.trim()) ? extraData.cargo.toUpperCase() : "___________________________";
        
        // ==========================================
        // PÁGINA 1
        // ==========================================
        
        // 1. Marca D'água da Frente
        this.addWatermark(doc, this.base64BgSecretario, true); 
        
        // 2. Título
        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(14); 
        doc.setTextColor(0, 0, 0);
        doc.text("TERMO DE ENTREGA - SECRETARIA", 105, 60, { align: "center" });
        
        // 3. Texto Corrido
        doc.setFont("helvetica", "normal"); 
        doc.setFontSize(11); 

        const segmentos = [
            { text: `Eu, ${nomeRecebedor}, CPF nº ${cpfRecebedor}, cargo ${cargo}, lotado na Secretaria Municipal de Saúde de ${municipioHeader}, declaro que recebi da `, bold: false },
            { text: "NOVETECH SOLUÇÕES TECNOLÓGICAS LTDA, CNPJ 05.621.288/0001-35", bold: true },
            { text: ", os equipamentos relacionados abaixo, devidamente testados e em perfeito estado de funcionamento:", bold: false }
        ];

        const imprimirTextoMisto = (doc, segs, startX, startY) => {
            const maxWidth = 170;
            const lineHeight = 5.5; 
            const spaceWidth = doc.getTextWidth(" ");
            let cursorX = startX;
            let cursorY = startY;

            doc.setFontSize(11);
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
            return cursorY + lineHeight + 5; 
        };

        let finalY = imprimirTextoMisto(doc, segmentos, 20, 80);

        // 4. Tabela de Itens (Compacta)
        const tableBody = items.map((t, index) => {
            // Usa os dados normalizados do app.js (name e cpf) ou tenta os originais
            const profName = t.name ? String(t.name).toUpperCase() : (t.professional_name ? String(t.professional_name).toUpperCase() : "---");
            const profCpf = t.cpf ? String(t.cpf) : (t.professional_cpf ? String(t.professional_cpf) : "---");
            
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
                fontSize: 8, 
                font: "helvetica",
                cellPadding: 2, 
                textColor: 0, 
                lineColor: 0, 
                lineWidth: 0.1, 
                valign: 'middle', 
                halign: 'center' 
            }, 
            headStyles: { 
                fillColor: [220, 220, 220], 
                textColor: 0, 
                fontStyle: 'bold', 
                halign: 'center' 
            }, 
            columnStyles: { 
                0: { cellWidth: 8 }, 
                1: { cellWidth: 25 }, 
                2: { cellWidth: 25 }, 
                3: { cellWidth: 30 }, 
                4: { halign: 'left' }, 
                5: { cellWidth: 30 } 
            }, 
            margin: { left: 20, right: 20 }
        });
        
        finalY = doc.lastAutoTable.finalY || 150;
        
        // 5. Verificação de Espaço para Assinatura
        const pageHeight = doc.internal.pageSize.getHeight();
        const espacoNecessario = 60; 
        
        // Se a tabela ocupou muito e não cabe a assinatura, joga para pág 2
        if (finalY + espacoNecessario > pageHeight - 20) {
            doc.addPage();
            // Pág 2 sempre usa o fundo de Instruções
            this.addWatermark(doc, this.base64BgSecretarioPage2, true);
            finalY = 60; 
        } else {
            finalY += 15;
        }

        // 6. Data e Assinatura
        const hoje = new Date();
        const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        
        // Usamos municipioHeader aqui também para preencher a linha da data
        const cidadeParaData = (municipioHeader !== "___________________") ? municipioHeader : "___________________";
        
        // Deixamos dia e ano em branco conforme padrão do documento
        const dataExtenso = `${cidadeParaData}, ____ de ____________________ de _______.`;

        doc.setFont("helvetica", "normal"); 
        doc.setFontSize(11);
        doc.text(dataExtenso, 190, finalY, { align: "right" }); 
        
        finalY += 30; 
        
        doc.setLineWidth(0.5); 
        doc.line(55, finalY, 155, finalY); 
        finalY += 5; 
        
        doc.setFont("helvetica", "bold"); 
        doc.text("Assinatura do(a) Responsável", 105, finalY, { align: "center" });
        
        // ==========================================
        // PÁGINA 2 - INSTRUÇÕES (Só Imagem)
        // ==========================================
        
        if (doc.getCurrentPageInfo().pageNumber === 1) {
            doc.addPage();
            this.addWatermark(doc, this.base64BgSecretarioPage2, true);
        }
        
        window.open(doc.output('bloburl'), '_blank'); 
        
        const modal = document.getElementById("modalBulkPrint"); 
        if(modal) modal.classList.add("hidden");
    }
}